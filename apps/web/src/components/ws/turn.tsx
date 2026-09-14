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
import { Thinking } from './thinking';

/** Copy for a run that ended without doing the work, or failed. */
const OUTCOME: Record<string, { tone: 'note' | 'bad'; text: string }> = {
  incomplete: {
    tone: 'note',
    text: 'That run finished without changing anything. Try telling me more specifically what to build.',
  },
  stopped: { tone: 'note', text: 'Stopped.' },
  quota: {
    tone: 'note',
    text: 'That used the last of today’s Sparks. They reset tomorrow.',
  },
  error: { tone: 'bad', text: 'Something went wrong partway through.' },
};

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
}: {
  item: ChatItem;
  status: AgentStatus | null;
  /** Offered only on user turns, and only when nothing is running. */
  onEdit?: (messageId: string, current: string) => void;
  editable?: boolean;
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
        <div className="gx-user">{item.content}</div>
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

  const outcome = item.stopReason && item.stopReason !== 'done' ? OUTCOME[item.stopReason] : undefined;

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
          <div className="gx-prose">
            <Markdown source={parsed.rest} />
          </div>
        )}

        {fenceDoc && <GenerativeUI doc={fenceDoc} />}

        {panels.map((panel) => (
          <GenerativeUI key={panel.id} doc={panel.doc} />
        ))}

        {outcome && (
          <p className={`gx-outcome${outcome.tone === 'bad' ? ' is-bad' : ''}`}>
            {item.error ? item.error : outcome.text}
          </p>
        )}

        <Stamp at={item.createdAt} align="start" />
      </div>
    </div>
  );
}
