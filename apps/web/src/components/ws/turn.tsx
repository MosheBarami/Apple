// One turn in the conversation.
//
// The user's turn sits right-aligned on a restrained surface so it is findable
// when scrolling back, with its timestamp beneath. The assistant's turn does
// not get a card: a 22px hexagon mark in a rounded square on the left, prose
// flowing on the canvas beside it, timestamp beneath. Wrapping every reply in a
// bordered box turns a conversation into a wall of boxes. Cards are reserved
// for content whose structure genuinely benefits — a render, a diff, a critique
// — and those come from the typed component registry, never from free-form
// model output.
import { useMemo } from 'react';
import { Markdown } from '../../lib/markdown';
import { extractUIFence, parseDocument } from '../../lib/generative-ui';
import { GenerativeUI } from '../../lib/generative-ui/render';
import { panelFromTool } from '../../lib/panels';
import { gatesFromDocs, plannedStepsFromDocs, type ValidatedDoc } from '../../lib/gates';
import { clockTime, isoStamp } from '../../lib/format';
import { AppleGlyph } from '../glyphs';
import type { AgentStatus, ChatItem } from '../../lib/use-project-socket';
import { useNow } from './activity';
import { eventsFromTurn, reduceActivity, type PhaseMark } from './activity-model';
import { buildEvidence } from './evidence-model';
import { outcomeLine } from './outcome-model';
import { Thinking } from './thinking';

function Stamp({ at, align }: { at: number; align: 'start' | 'end' }) {
  const label = clockTime(at);
  if (!label) return null;
  return (
    <time className={`gx-stamp gx-stamp--${align}`} dateTime={isoStamp(at)} title={new Date(at).toLocaleString()}>
      {label}
    </time>
  );
}

export function Turn({
  item,
  status,
  phaseMarks,
  isLast,
  onEdit,
  editable,
  onRetry,
}: {
  item: ChatItem;
  status: AgentStatus | null;
  /** Offered only on user turns, and only when nothing is running. */
  onEdit?: (messageId: string, current: string) => void;
  editable?: boolean;
  /**
   * Run the prompt that produced this turn again.
   *
   * Offered only on the LAST turn, and only when the run did not succeed. Retrying an older
   * failure would discard everything after it — that is the edit path, and it has a dialog for
   * exactly that reason.
   */
  onRetry?: () => void;
  /**
   * The phase transitions observed on THIS run, when this turn is the run in
   * flight. Undefined for every other turn, because `agent_status` carries no
   * msgId and guessing which turn a mark belongs to would invent its timing.
   */
  phaseMarks?: PhaseMark[];
  isLast: boolean;
}) {
  const parsed = useMemo(() => {
    if (item.role !== 'assistant' || !item.content) return { json: null as string | null, rest: item.content };
    return extractUIFence(item.content);
  }, [item.role, item.content]);

  const fenceDoc = useMemo(() => {
    if (!parsed.json) return null;
    const result = parseDocument(parsed.json);
    return result.ok ? result.doc : null;
  }, [parsed.json]);

  // Structured tool results that the validator accepts become real components,
  // inline, in the order they happened. Anything that does not validate is
  // simply not rendered — nothing is drawn from an unvalidated shape.
  const panels = useMemo(
    () =>
      item.tools
        .map((tool) => panelFromTool(item.id, tool, item.createdAt))
        .filter((p): p is NonNullable<typeof p> => p !== null),
    [item.tools, item.id, item.createdAt],
  );

  // The Thinking card's Validation stage and its pending bullets both read from
  // the same validated documents — never from the raw tool payload.
  const validated = useMemo<ValidatedDoc[]>(() => panels.map((p) => ({ id: p.id, doc: p.doc })), [panels]);
  const gates = useMemo(() => gatesFromDocs(validated), [validated]);
  const plannedSteps = useMemo(() => plannedStepsFromDocs(validated), [validated]);

  // Evidence is keyed by toolId so the activity timeline can hang each card on
  // the step that produced it. `panelFromTool` already built and validated the
  // document; this only re-keys it — no second parse, and no second source of
  // truth that could disagree with the panel below the prose.
  const evidence = useMemo(() => {
    const docs = new Map(panels.map((p) => [p.toolId, p.doc]));
    return buildEvidence(
      item.tools.map((t) => ({
        toolId: t.toolId,
        tool: t.tool,
        summary: t.summary,
        ok: t.ok,
        done: t.done,
        hasDetail: t.detail !== undefined && t.detail !== null,
      })),
      docs,
    );
  }, [item.tools, panels]);

  // The ordered, timed activity. Rebuilt from the merged turn through the same
  // reducer the live socket log feeds, so a reloaded turn and a live one cannot
  // report different things about the same run.
  // One clock for the turn. It ticks only while this turn is streaming, so a
  // settled conversation does not repaint itself once a second forever.
  const now = useNow(item.streaming);
  const activity = useMemo(
    () =>
      reduceActivity({
        events: eventsFromTurn({
          tools: item.tools,
          phaseMarks,
          stopReason: item.stopReason,
          error: item.error,
        }),
        upcoming: plannedSteps,
        now,
        streaming: item.streaming,
      }),
    [item.tools, item.stopReason, item.error, item.streaming, phaseMarks, plannedSteps, now],
  );

  if (item.role === 'user') {
    return (
      <div className="gx-turn gx-turn--user gx-msg-in">
        {/* dir="auto" — the direction of a message belongs to the message. A Hebrew sentence
            typed in an English session (or the reverse) otherwise inherits the page and puts its
            own trailing punctuation at the wrong end. */}
        <div className="gx-user" dir="auto">{item.content}</div>
        <div className="gx-user__foot">
          {/* Revealed on hover or focus rather than always drawn: a control on every one of your
              own messages competes with the messages themselves, and this is a repair tool, not
              something anyone reaches for on a normal turn. It stays keyboard-reachable because
              `:focus-within` shows it too. */}
          {editable && onEdit && (
            <button
              type="button"
              className="gx-user__edit"
              onClick={() => onEdit(item.id, item.content)}
              title="Edit this message and run again from here"
            >
              Edit
            </button>
          )}
          <Stamp at={item.createdAt} align="end" />
        </div>
      </div>
    );
  }

  // The worker's `error` field is a CODE, not a sentence — outcome-model.ts turns it into one and
  // drops anything it does not recognise. It used to be rendered verbatim, which put
  // 'rate_limited' and raw provider messages in front of users.
  const outcome = outcomeLine(item.stopReason, item.error);

  return (
    <div className="gx-turn gx-turn--agent gx-msg-in">
      <span className="gx-mark" aria-hidden="true">
        <AppleGlyph size={22} />
      </span>

      <div className="gx-turn__body">
        <Thinking
          tools={item.tools}
          status={isLast ? status : null}
          streaming={item.streaming}
          intent={item.intent}
          gates={gates}
          plannedSteps={plannedSteps}
          activity={activity}
          evidence={evidence}
        />

        {item.content && (
          // The reply answers in the user's language, so it takes its direction from itself too.
          <div className="gx-prose" dir="auto">
            <Markdown source={parsed.rest} />
          </div>
        )}

        {fenceDoc && <GenerativeUI doc={fenceDoc} />}

        {panels.map((panel) => (
          <GenerativeUI key={panel.id} doc={panel.doc} />
        ))}

        {outcome && (
          <div className={`gx-outcome${outcome.tone === 'bad' ? ' is-bad' : ''}`}>
            <p className="gx-outcome__text">{outcome.text}</p>
            {/* No retry on a quota stop: the run did not fail, the account ran out, and a button
                that re-runs into the same wall teaches the user the product is broken rather than
                that they are out of Credits. The outcome text already says when they come back. */}
            {onRetry && item.stopReason !== 'quota' && (
              <button type="button" className="gx-outcome__retry" onClick={onRetry}>
                Try again
              </button>
            )}
            {/* A failed run had exactly one affordance — Try again — and pressing it is the right
                first move only when the cause was transient. /docs/troubleshooting has a section
                per cause (Studio closed, a place too large to read, Credits gone) and nothing in
                the product pointed at it, so the second attempt was the user's only diagnostic.
                New tab: reading it must not discard the conversation it happened in. */}
            {item.stopReason === 'error' && (
              <a
                className="gx-outcome__help"
                href="/docs/troubleshooting#messages"
                target="_blank"
                rel="noopener noreferrer"
              >
                Why runs stop
              </a>
            )}
          </div>
        )}

        {/* THE FOOTER ROW, AND WHY THE COST IS HERE RATHER THAN IN THE THINKING CARD.
            The Thinking card shows a running cost WHILE a run is in flight, and `msg_end` clears
            the status that feeds it — so the figure disappeared at the moment it finally became
            correct, and the settled total was never shown at all. This is the one the user was
            charged, sitting next to the time the turn happened. Rendered only when the worker
            sent one and something was actually spent: an absent field means a conversation from
            history or an older worker, and neither should be drawn as a confident zero. */}
        <p className="gx-turn__foot">
          <Stamp at={item.createdAt} align="start" />
          {item.creditsSpent != null && item.creditsSpent > 0 && (
            <span className="gx-turn__cost">
              <strong>{item.creditsSpent}</strong> {item.creditsSpent === 1 ? 'Credit' : 'Credits'}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}
