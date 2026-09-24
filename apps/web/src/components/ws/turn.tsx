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
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import type { PlaytestRun, StudioFrame } from '@golem/shared';
import type { UIDocument } from '../../lib/generative-ui/schema';
import { splitSpilledPayload } from '../../lib/spilled-payload';
import { extractUIFence, parseDocument } from '../../lib/generative-ui';
import { panelFromTool } from '../../lib/panels';
import { splitReplyDocs } from '../../lib/reply-docs';
import { plannedStepsFromDocs, type ValidatedDoc } from '../../lib/gates';
import { clockTime, isoStamp } from '../../lib/format';
import { AppleGlyph } from '../glyphs';
import type { AgentStatus, ChatItem } from '../../lib/use-project-socket';
import { eventsFromTurn, reduceActivity, type PhaseMark } from './activity-model';
import { outcomeLine } from './outcome-model';
import { Thinking } from './thinking';
import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '../ai-elements/message';
import { MessageToolbar } from '../ai-elements/message';
import { CopyButton } from '../picks/chat/copy-button';
import { ShareButton } from '../picks/chat/share-button';
import { ContextMenu, useContextMenu, type MenuItem } from '../picks/chat/context-menu';
import { RollingNumber } from '../picks/chat/rolling-number';
import { useWordReveal } from '../picks/chat/word-reveal';
import { PlanCard } from '../picks/chat/plan-card';
import { ExpandableImages } from '../picks/chat/expandable-images';
import './turn.css';

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

// The component registry's renderer arrives when a reply first has something to draw with it. It is
// not in the page everybody loads first: most replies are only words (D-UX-2).
const GenerativeUI = lazy(() => import('../../lib/generative-ui/render').then((m) => ({ default: m.GenerativeUI })));

/**
 * WHAT THE PERSON ASKED TO SEE, AND NOTHING ELSE (owner decision D-UX-2). An image or a sound Apple
 * made stays in the reply; every other validated document — plans, property cards, tables, diffs —
 * goes to Details inside the Thinking disclosure. lib/reply-docs.ts draws the line.
 */
function ReplyMedia({ docs }: { docs: UIDocument[] }) {
  if (docs.length === 0) return null;
  // An image Apple made opens larger, growing out of where it sits (picks/chat/expandable-images).
  return <ExpandableImages className="gx-reply-media">
    <Suspense fallback={<p className="gx-reply-media__wait">Loading…</p>}>
      {docs.map((doc, index) => <GenerativeUI key={index} doc={doc} />)}
    </Suspense>
  </ExpandableImages>;
}

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
  onShowRevisions,
  onBuildPlan,
}: {
  item: ChatItem;
  status: AgentStatus | null;
  /** Offered only on user turns, and only when nothing is running. */
  onEdit?: (messageId: string, current: string) => void;
  editable?: boolean;
  /**
   * Run the prompt that produced this turn again.
   *
   * Offered only on the LAST turn, whether that turn failed ("Try again") or succeeded
   * ("Regenerate"). Re-running an OLDER turn would discard everything after it — that is the edit
   * path, and it has a dialog for exactly that reason.
   */
  onRetry?: () => void;
  /**
   * Open the earlier versions of this user message.
   *
   * Offered only when the transcript says there ARE earlier versions — the count rides on the
   * message so the conversation does not need a request per turn to find out whether to draw the
   * mark.
   */
  onShowRevisions?: (messageId: string) => void;
  /**
   * Accepted and not drawn (owner decision D-THINK-1): the turn shows one friendly status line and
   * no playtest panel, frame strip or connection detail. Kept so callers need not change.
   */
  frames?: StudioFrame[];
  playtest?: PlaytestRun | null;
  studioConnected?: boolean;
  /**
   * The phase transitions observed on THIS run, when this turn is the run in
   * flight. Undefined for every other turn, because `agent_status` carries no
   * msgId and guessing which turn a mark belongs to would invent its timing.
   */
  phaseMarks?: PhaseMark[];
  isLast: boolean;
  /**
   * Send a Plan-mode reply's plan to be built. The Plan card draws its "Build it" button only when
   * this is given — a button that is present and does nothing is worse than no button.
   */
  onBuildPlan?: () => void;
}) {
  // Right-click (or the reply's More button) opens this turn's menu — picks/chat/context-menu.
  const menu = useContextMenu();
  // The streamed reply lands word by word (picks/chat/word-reveal). A turn that mounted settled —
  // history — is never touched.
  const replyRef = useRef<HTMLDivElement>(null);
  useWordReveal(replyRef, item.content, item.streaming);
  // Whether this turn was still arriving when it mounted, so a figure it settles at can roll in
  // while a reloaded conversation's figures simply sit there.
  const [arrivedLive] = useState(item.streaming);

  const parsed = useMemo(() => {
    if (item.role !== 'assistant' || !item.content) return { json: null as string | null, rest: item.content };
    return extractUIFence(item.content);
  }, [item.role, item.content]);

  // Split before anything is rendered, so the payload never reaches the markdown renderer at all.
  const spilled = useMemo(() => splitSpilledPayload(parsed.rest ?? ''), [parsed.rest]);

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

  // The steps a validated build_plan announced feed the activity reducer — never the raw tool payload.
  const validated = useMemo<ValidatedDoc[]>(() => panels.map((p) => ({ id: p.id, doc: p.doc })), [panels]);
  const plannedSteps = useMemo(() => plannedStepsFromDocs(validated), [validated]);

  // The one split (lib/reply-docs.ts): an image or a sound Apple made stays in the reply; every other
  // document is technical detail and is not drawn at all (owner decision D-THINK-1).
  const replyDocs = useMemo(
    () => splitReplyDocs([...(fenceDoc ? [fenceDoc] : []), ...panels.map((panel) => panel.doc)]),
    [fenceDoc, panels],
  );

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
          // The instant this client saw `msg_end`. Undefined for a reloaded turn, which watched
          // nothing — those fall back to the last observed tool end, which they always have.
          // A run interrupted mid-tool no longer does, because that tool now carries no invented
          // end, and without this the terminal row would vanish for exactly those runs.
          endedAt: item.endedAt,
        }),
        upcoming: plannedSteps,
        now,
        streaming: item.streaming,
      }),
    [item.tools, item.stopReason, item.error, item.endedAt, item.streaming, phaseMarks, plannedSteps, now],
  );

  if (item.role === 'user') {
    return (
      // role="article": each turn is one entry in the conversation log, which is how a screen
      // reader steps through it. AI Elements' Message is a div, so the role is said explicitly.
      <Message from="user" role="article" className="gx-turn gx-turn--user gx-msg-in" onContextMenu={menu.onContextMenu}>
        {/* dir="auto" — the direction of a message belongs to the message. A Hebrew sentence
            typed in an English session (or the reverse) otherwise inherits the page and puts its
            own trailing punctuation at the wrong end. */}
        <MessageContent className="gx-user" dir="auto">{item.content}</MessageContent>
        <MessageActions className="gx-user__foot">
          {/* Revealed on hover or focus rather than always drawn: a control on every one of your
              own messages competes with the messages themselves, and this is a repair tool, not
              something anyone reaches for on a normal turn. It stays keyboard-reachable because
              `:focus-within` shows it too. */}
          {editable && onEdit && (
            <MessageAction
              size="sm"
              className="gx-user__edit"
              onClick={() => onEdit(item.id, item.content)}
              tooltip="Edit this message and run again from here"
            >
              Edit
            </MessageAction>
          )}
          {/* WHAT YOU WROTE BEFORE. Beside Edit because Edit is what made it, and always visible
              rather than revealed on hover: it is a fact about this message, not a tool.

              `(item.revisions ?? 0) > 0` and not a falsy check, because undefined and 0 are
              different facts here — a worker that predates message_revisions sends no field at
              all, and drawing "no earlier versions" from that would be an answer nobody checked. */}
          {onShowRevisions && (item.revisions ?? 0) > 0 && (
            <MessageAction
              size="sm"
              className="gx-user__edited"
              onClick={() => onShowRevisions(item.id)}
              tooltip={`You edited this message. See ${item.revisions === 1 ? 'the earlier version' : `all ${item.revisions} earlier versions`}.`}
            >
              Edited
            </MessageAction>
          )}
          <Stamp at={item.createdAt} align="end" />
        </MessageActions>
        <ContextMenu
          at={menu.at}
          label="Message options"
          onClose={menu.close}
          items={[
            { id: 'copy', label: 'Copy text', onSelect: () => void navigator.clipboard?.writeText(item.content).catch(() => undefined) },
            ...(editable && onEdit ? [{ id: 'edit', label: 'Edit and run again', onSelect: () => onEdit(item.id, item.content) }] : []),
            ...(onShowRevisions && (item.revisions ?? 0) > 0
              ? [{ id: 'versions', label: 'Earlier versions', onSelect: () => onShowRevisions(item.id) }]
              : []),
          ] satisfies MenuItem[]}
        />
      </Message>
    );
  }

  // The worker's `error` field is a CODE, not a sentence — outcome-model.ts turns it into one and
  // drops anything it does not recognise. It used to be rendered verbatim, which put
  // 'rate_limited' and raw provider messages in front of users.
  // The reply is passed so a line that would only restate the reply's own closing is not drawn
  // (F-045): one closing line per turn.
  const outcome = outcomeLine(item.stopReason, item.error, item.content);

  /* RUNNING IT AGAIN, AND WHY THIS IS NOT INSIDE THE OUTCOME BLOCK ANY MORE.
     It used to be: the control lived inside `{outcome && (...)}`, so it existed only after a run
     had failed or stopped. But "that reply is fine and still not what I meant" is the ordinary
     case, and the only other re-run path — the edit dialog — hard-refuses an unchanged message.
     So a user who wanted a second take had to invent a change to their own prompt to get one.

     Built once here and rendered by both branches below, so the failed case and the clean case
     cannot drift into two different behaviours. The quota suppression is unchanged: that run did
     not fail, the account ran out, and a button that walks back into the same wall reads as a
     broken product rather than an empty balance. */
  /* A TURN THAT PRODUCED NOTHING, AND WHY IT NEEDS A SENTENCE RATHER THAN A BLANK.
     An assistant turn with no text, no tools and no outcome code renders a Thinking card with
     nothing in it and then a timestamp — which reads as a reply that failed to paint, so the
     first thing a person does is reload the page and lose their place. outcome-model.ts cannot
     speak for this case: it is driven by `stopReason`, and a run that simply came back empty
     carries an ordinary one.

     ALL FOUR CONDITIONS, because each one is a turn that is NOT empty and must not be labelled
     as one: `streaming` is a reply still arriving, `tools` is work whose results are in View
     results, `content` is the reply itself, and `outcome` already has its own sentence below. */
  const silent = !item.content && !item.streaming && item.tools.length === 0 && !outcome;

  const retryControl =
    onRetry && item.stopReason !== 'quota' ? (
      <MessageActions className="gx-outcome__actions">
        <MessageAction
          size="sm"
          className="gx-outcome__retry"
          onClick={onRetry}
          // Stated rather than confirmed. A dialog here would guard a loss it cannot undo — there
          // is no message-revision store to restore the old reply from — so it would collect a
          // click and change nothing. When revisions exist, this becomes a real confirmation.
          tooltip={
            outcome
              ? 'Run that prompt again'
              : 'Run that prompt again. The new reply replaces this reply, which cannot be brought back.'
          }
        >
          {outcome ? 'Try again' : 'Regenerate'}
        </MessageAction>
      </MessageActions>
    ) : null;

  return (
    <Message
      from="assistant"
      role="article"
      className="gx-turn gx-turn--agent gx-msg-in"
      data-run-state={item.streaming ? 'live' : outcome ? 'ended' : 'settled'}
      // Still being written: assistive technology waits for the settled reply, which the workspace
      // announces once, instead of reading each half-sentence as it lands.
      aria-busy={item.streaming || undefined}
      onContextMenu={menu.onContextMenu}
    >
      <span className="gx-mark" aria-hidden="true"><AppleGlyph size={20} /></span>
      <MessageContent className="gx-turn__body">
        {/* ONE FRIENDLY LINE while Apple works, and at most one once it is done (D-THINK-1). */}
        <Thinking
          status={isLast ? status : null}
          streaming={item.streaming}
          deniedTools={item.deniedTools}
          activity={activity}
        />

        {item.content && (
          // The reply answers in the user's language, so it takes its direction from itself too.
          // MessageResponse renders through lib/markdown.tsx (marked + DOMPurify, fences to the code
          // block) — the one renderer allowed to put model output on screen.
          <>
            {/* THE WIRE FORMAT IS NOT PROSE. When the model writes a build payload out as text (it does
                when it runs out of output tokens mid-structure), only the prose around it is drawn.
                The payload itself is technical detail and is not shown or openable (D-THINK-1). */}
            {spilled.prose && (
              // The wrapper is what the word reveal reads; it draws nothing (display:contents).
              <div ref={replyRef} className="gx-turn__reply">
                {item.mode === 'plan' ? (
                  // A Plan-mode reply is a plan: a card with its first line showing and the steps
                  // folded inside (picks/chat/plan-card).
                  <PlanCard content={spilled.prose} streaming={item.streaming} onBuild={onBuildPlan}>
                    <MessageResponse className="gx-prose" dir="auto">{spilled.prose}</MessageResponse>
                  </PlanCard>
                ) : (
                  <MessageResponse className="gx-prose" dir="auto">{spilled.prose}</MessageResponse>
                )}
              </div>
            )}
          </>
        )}

        <ReplyMedia docs={replyDocs.media} />

        {outcome ? (
          <div className={`gx-outcome${outcome.tone === 'bad' ? ' is-bad' : ''}`}>
            {/* The sentence comes from outcome-model.ts, NOT from `item.error`. That field is a
                code the worker sends ('rate_limited', 'interrupted', and on two paths the raw
                provider message); rendering it verbatim — which is what stood here — put one
                server's note to another in front of the person whose build died. The model turns
                a known code into a sentence and drops anything it does not recognise. */}
            {outcome.text && <p className="gx-outcome__text">{outcome.text}</p>}
            {/* `retryControl` is built above and is null on a quota stop, so a run that did not
                fail but ran out of Credits still offers nothing to press. */}
            {retryControl}
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
        ) : silent ? (
          // The same row the outcome uses, so an empty turn and a stopped one are one shape rather
          // than two. The sentence says what happened and what to do next, and it names neither a
          // cause nor a button label — the control beside it already carries its own word.
          <div className="gx-outcome">
            <p className="gx-outcome__text">Apple ended this turn without a reply. Run that prompt again, or rephrase it and send.</p>
            {retryControl}
          </div>
        ) : (
          // Same row, no sentence: there is nothing to explain about a run that worked. It is the
          // last thing under the reply and above the timestamp, where the eye already is.
          retryControl && <div className="gx-outcome gx-outcome--bare">{retryControl}</div>
        )}

        {/* THE REPLY'S TOOLBAR — Copy, Share, and the same menu a right-click opens. It is AI
            Elements' MessageToolbar; on a pointer device it rises into view under the pointer or on
            focus, like a node toolbar, and on the newest reply it is simply there. */}
        {item.content && !item.streaming && (
          <MessageToolbar className={`gx-turn__tools${isLast ? ' is-last' : ''}`}>
            <div className="gx-turn__tools-main">
              <CopyButton getText={() => spilled.prose || item.content} title="Copy this reply" />
              <ShareButton getText={() => spilled.prose || item.content} />
            </div>
            <button
              type="button"
              className="gx-turn__more"
              aria-label="More options for this reply"
              aria-haspopup="menu"
              onClick={(e) => menu.openFrom(e.currentTarget)}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="5" cy="12" r="1.6" />
                <circle cx="12" cy="12" r="1.6" />
                <circle cx="19" cy="12" r="1.6" />
              </svg>
            </button>
          </MessageToolbar>
        )}
        <ContextMenu
          at={menu.at}
          label="Reply options"
          onClose={menu.close}
          items={[
            ...(item.content
              ? [{ id: 'copy', label: 'Copy text', onSelect: () => void navigator.clipboard?.writeText(spilled.prose || item.content).catch(() => undefined) }]
              : []),
            ...(onRetry && item.stopReason !== 'quota'
              ? [{ id: 'retry', label: outcome ? 'Try again' : 'Regenerate', onSelect: onRetry }]
              : []),
          ] satisfies MenuItem[]}
        />

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
              {/* The settled figure rolls in on a turn that was watched arriving (picks/chat/rolling-number). */}
              <strong><RollingNumber value={item.creditsSpent} rollIn={arrivedLive} /></strong> {item.creditsSpent === 1 ? 'Credit' : 'Credits'}
            </span>
          )}
        </p>
      </MessageContent>
    </Message>
  );
}
