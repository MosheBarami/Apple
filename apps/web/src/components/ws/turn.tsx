// One turn in the conversation, built from Vercel AI Elements (owner, 2026-10-01).
//
// The user's turn is AI Elements' Message from "user": right-aligned on the secondary surface, with
// its actions and time beneath. The assistant's turn is Message from "assistant", no card, in this
// order: the one live status line while StudPilot works (thinking.tsx); what the run thought and did —
// Reasoning blocks and Task rows, step by step (run-steps.tsx); the reply (MessageResponse, with
// InlineCitation for `[n]`); the sources it used ("Used N sources"); media; the outcome; and the
// reply's actions (MessageToolbar + MessageActions). Cards are reserved for content whose structure
// genuinely benefits — a render, a sound — and those come from the typed component registry, never
// from free-form model output.
import { Suspense, lazy, useEffect, useMemo, useState, type ComponentProps } from 'react';
import type { PlaytestRun, StudioFrame } from '@studpilot/shared';
import type { UIDocument } from '../../lib/generative-ui/schema';
import { splitSpilledPayload } from '../../lib/spilled-payload';
import { extractUIFence, parseDocument } from '../../lib/generative-ui';
import { panelFromTool } from '../../lib/panels';
import { splitReplyDocs } from '../../lib/reply-docs';
import { clockTime, formatSettings, isoStamp } from '../../lib/format';
import type { AgentStatus, ChatItem } from '../../lib/use-project-socket';
import type { PhaseMark } from './activity-model';
import { outcomeLine } from './outcome-model';
import { CheckIcon, CopyIcon, MoreHorizontalIcon, Share2Icon, XIcon } from 'lucide-react';
import { Message, MessageAction, MessageActions, MessageContent, MessageToolbar } from '../ai-elements/message';
import { Button } from '../ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';
import { writeClipboard } from '../picks/chat/copy-button';
import { ContextMenu, useContextMenu, type MenuItem } from '../picks/chat/context-menu';
import { RollingNumber } from '../picks/chat/rolling-number';
import { ExpandableImages } from '../picks/chat/expandable-images';
import { AssetChoice } from './asset-choice';
import { visualOptions, visualSnapshot } from './asset-choice-model';
import { Answer, RunSources } from './answer';
import { RunSteps } from './run-steps';
import { cn } from '../../lib/utils';

// The component registry's renderer arrives when a reply first has something to draw with it. It is
// not in the page everybody loads first: most replies are only words (D-UX-2).
const GenerativeUI = lazy(() => import('../../lib/generative-ui/render').then((m) => ({ default: m.GenerativeUI })));

/**
 * WHAT THE PERSON ASKED TO SEE, AND NOTHING ELSE (owner decision D-UX-2). An image or a sound StudPilot
 * made stays in the reply; every other validated document — plans, property cards, tables, diffs —
 * goes to Details inside the Thinking disclosure. lib/reply-docs.ts draws the line.
 */
function ReplyMedia({ docs }: { docs: UIDocument[] }) {
  if (docs.length === 0) return null;
  // An image StudPilot made opens larger, growing out of where it sits (picks/chat/expandable-images).
  return <ExpandableImages className="gx-reply-media">
    <Suspense fallback={<p className="gx-reply-media__wait">Loading…</p>}>
      {docs.map((doc, index) => <GenerativeUI key={index} doc={doc} />)}
    </Suspense>
  </ExpandableImages>;
}

function Stamp({ at }: { at: number }) {
  const label = clockTime(at);
  if (!label) return null;
  return (
    <time className="tabular-nums" dateTime={isoStamp(at)} title={new Date(at).toLocaleString(formatSettings().locale)}>
      {label}
    </time>
  );
}

/**
 * Whether a reply that just appeared should land word by word: true for a few seconds after a reply
 * this client watched arrive first renders, then false. Streamdown animates the words while it is
 * true (its own `animated` cascade) and enables the code blocks' controls once it is false; a reply
 * that mounted settled — history — never animates.
 */
function useLanding(arrivedLive: boolean, shown: boolean): boolean {
  const [landing, setLanding] = useState(false);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!arrivedLive || !shown || started) return;
    setStarted(true);
    setLanding(true);
    const id = window.setTimeout(() => setLanding(false), 2400);
    return () => window.clearTimeout(id);
  }, [arrivedLive, shown, started]);
  return landing;
}

/**
 * An action whose WORD is its name (Edit, Edited, Try again). Upstream's MessageAction adds its
 * tooltip or label as hidden text, which beside a visible word makes the button's name say it twice;
 * this is the same shadcn Button and Tooltip MessageAction is built from, named by its word alone.
 */
function TextAction({ tip, className, ...props }: ComponentProps<typeof Button> & { tip: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className={cn('h-7 px-2 text-xs', className)} {...props} />
      </TooltipTrigger>
      <TooltipContent>{tip}</TooltipContent>
    </Tooltip>
  );
}

/** The reply's Copy action: the icon turns into a tick (or a cross when the clipboard refused). */
function CopyAction({ getText }: { getText: () => string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');
  useEffect(() => {
    if (state === 'idle') return;
    const id = window.setTimeout(() => setState('idle'), 2000);
    return () => window.clearTimeout(id);
  }, [state]);
  const Icon = state === 'copied' ? CheckIcon : state === 'failed' ? XIcon : CopyIcon;
  return (
    <MessageAction
      tooltip={state === 'copied' ? 'Copied' : state === 'failed' ? "Couldn't copy" : 'Copy this reply'}
      label="Copy this reply"
      data-state={state}
      onClick={() => void writeClipboard(getText()).then((ok) => setState(ok ? 'copied' : 'failed'))}
    >
      <Icon className="size-4" />
    </MessageAction>
  );
}

/** Share: the system share sheet where the browser has one, else a link to this chat on the clipboard. */
function ShareAction({ getText }: { getText: () => string }) {
  const [said, setSaid] = useState('');
  const canSheet = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return (
    <MessageAction
      tooltip={said || (canSheet ? 'Share this reply' : 'Copy a link to this chat. It opens for people who can already see this project.')}
      label={canSheet ? 'Share this reply' : 'Copy a link to this chat'}
      onClick={() => {
        if (canSheet) {
          void navigator.share({ title: 'StudPilot', text: getText() }).catch(() => undefined);
          return;
        }
        void writeClipboard(`${window.location.origin}${window.location.pathname}`).then((ok) => {
          setSaid(ok ? 'Link copied' : 'Could not copy');
          window.setTimeout(() => setSaid(''), 2000);
        });
      }}
    >
      <Share2Icon className="size-4" />
      <span className="sr-only" role="status">{said}</span>
    </MessageAction>
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
  onChooseAsset,
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
  /** Offered only on the latest settled turn with owner edit access. */
  onChooseAsset?: (index: number | null) => void;
}) {
  // Right-click (or the reply's More button) opens this turn's menu — picks/chat/context-menu.
  const menu = useContextMenu();
  // Whether this turn was still arriving when it mounted, so a figure it settles at can roll in and
  // its reply can land word by word, while a reloaded conversation simply sits there.
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
  const assetOptions = useMemo(() => visualOptions(item.tools), [item.tools]);
  const assetSnapshot = useMemo(() => visualSnapshot(item.tools), [item.tools]);

  // The one split (lib/reply-docs.ts): an image or a sound StudPilot made stays in the reply; every other
  // document is technical detail and is not drawn at all (owner decision D-THINK-1).
  const replyDocs = useMemo(
    () => splitReplyDocs([...(fenceDoc ? [fenceDoc] : []), ...panels.map((panel) => panel.doc)]),
    [fenceDoc, panels],
  );

  // The reply's text lands word by word when this client watched it arrive (Streamdown's cascade).
  const landing = useLanding(arrivedLive, item.role === 'assistant' && !item.streaming && Boolean(spilled.prose));

  if (item.role === 'user') {
    return (
      // role="article": each turn is one entry in the conversation log, which is how a screen
      // reader steps through it. AI Elements' Message is a div, so the role is said explicitly.
      // `data-turn` is the hook the workspace and its tests key on; the look is upstream's classes.
      <Message from="user" role="article" data-turn="user" className="animate-in fade-in-0 slide-in-from-bottom-2 duration-300" onContextMenu={menu.onContextMenu}>
        {/* dir="auto" — the direction of a message belongs to the message. A Hebrew sentence
            typed in an English session (or the reverse) otherwise inherits the page and puts its
            own trailing punctuation at the wrong end. */}
        <MessageContent data-turn-text="user" className="whitespace-pre-wrap text-[15px] leading-relaxed" dir="auto">{item.content}</MessageContent>
        <MessageActions className="justify-end text-muted-foreground text-xs">
          {/* Revealed on hover or focus rather than always drawn: a control on every one of your
              own messages competes with the messages themselves, and this is a repair tool, not
              something anyone reaches for on a normal turn. It stays keyboard-reachable because
              focus reveals it too. */}
          {editable && onEdit && (
            <TextAction
              className="text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
              data-action="edit"
              onClick={() => onEdit(item.id, item.content)}
              tip="Edit this message and run again from here"
            >
              Edit
            </TextAction>
          )}
          {/* WHAT YOU WROTE BEFORE. Beside Edit because Edit is what made it, and always visible
              rather than revealed on hover: it is a fact about this message, not a tool.

              `(item.revisions ?? 0) > 0` and not a falsy check, because undefined and 0 are
              different facts here — a worker that predates message_revisions sends no field at
              all, and drawing "no earlier versions" from that would be an answer nobody checked. */}
          {onShowRevisions && (item.revisions ?? 0) > 0 && (
            <TextAction
              className="text-muted-foreground"
              data-action="revisions"
              onClick={() => onShowRevisions(item.id)}
              tip={`You edited this message. See ${item.revisions === 1 ? 'the earlier version' : `all ${item.revisions} earlier versions`}.`}
            >
              Edited
            </TextAction>
          )}
          <Stamp at={item.createdAt} />
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

     A filtered wire-only message has no customer-facing reply either. Streaming, tools, generated
     media, visible prose, and an outcome sentence each keep a turn from being labelled empty. */
  const silent = !spilled.prose && replyDocs.media.length === 0 && !item.streaming && item.tools.length === 0 && !outcome;
  const hadDeniedTools = !item.streaming && (item.deniedTools ?? []).some((tool) => typeof tool === 'string' && tool.trim());

  /* RUNNING IT AGAIN, AND WHY THIS IS NOT INSIDE THE OUTCOME BLOCK ANY MORE.
     "That reply is fine and still not what I meant" is the ordinary case, and the only other re-run
     path — the edit dialog — hard-refuses an unchanged message. So the control is built once here
     and rendered by every branch below, so the failed case and the clean case cannot drift into two
     behaviours. The quota suppression is unchanged: that run did not fail, the account ran out, and
     a button that walks back into the same wall reads as a broken product rather than an empty
     balance. */
  const retryControl =
    onRetry && item.stopReason !== 'quota' && assetOptions.length === 0 ? (
      <TextAction
        variant="outline"
        className="px-2.5"
        data-action="retry"
        onClick={onRetry}
        // Stated rather than confirmed. A dialog here would guard a loss it cannot undo — there
        // is no message-revision store to restore the old reply from — so it would collect a
        // click and change nothing. When revisions exist, this becomes a real confirmation.
        tip={
          outcome
            ? 'Run that prompt again'
            : 'Run that prompt again. The new reply replaces this reply, which cannot be brought back.'
        }
      >
        {outcome ? 'Try again' : 'Regenerate'}
      </TextAction>
    ) : null;

  return (
    <Message
      from="assistant"
      role="article"
      data-turn="assistant"
      className="max-w-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300"
      data-run-state={item.streaming ? 'live' : outcome ? 'ended' : 'settled'}
      // Still being written: assistive technology waits for the settled reply, which the workspace
      // announces once, instead of reading each half-sentence as it lands.
      aria-busy={item.streaming || undefined}
      onContextMenu={menu.onContextMenu}
    >
      <MessageContent className="w-full gap-3">
        {/* WHAT IT THOUGHT AND DID (owner, 2026-10-01): each step's reasoning as an AI Elements
            Reasoning — open and shimmering while it streams, "Thought for N seconds" once the step
            ends or a tool starts — with that step's tools after it as one Task. */}
        <RunSteps item={item} tools={item.tools} streaming={item.streaming} />

        {/* THE REPLY APPEARS ONCE, when the run ends and msg_end settles it to the stored answer
            (owner, 2026-09-30): the steps' in-between narration is not the reply. It answers in the
            user's language, so it takes its direction from itself. THE WIRE FORMAT IS NOT PROSE: a
            build payload the model wrote out as text is split off first and never drawn (D-THINK-1). */}
        {item.content && !item.streaming && spilled.prose && (
          <Answer
            className="text-[15px] leading-relaxed"
            text={spilled.prose}
            sources={item.sources}
            dir="auto"
            animated={{ animation: 'blurIn', sep: 'word', stagger: 18 }}
            isAnimating={landing}
          />
        )}

        {/* "Used N sources" — only what the worker sent for this message. */}
        {!item.streaming && <RunSources sources={item.sources} />}

        <ReplyMedia docs={replyDocs.media} />
        {item.mode === 'agent' && assetOptions.length > 0 && <AssetChoice
          options={assetOptions}
          snapshot={assetSnapshot}
          disabled={!onChooseAsset || item.streaming}
          onChoose={(index) => onChooseAsset?.(index)}
        />}

        {outcome ? (
          <div className="flex flex-wrap items-baseline gap-3" data-outcome={outcome.tone}>
            {/* The sentence comes from outcome-model.ts, NOT from `item.error`. That field is a
                code the worker sends ('rate_limited', 'interrupted', and on two paths the raw
                provider message); the model turns a known code into a sentence and drops anything
                it does not recognise. */}
            {outcome.text && <p className={cn('basis-full text-sm leading-relaxed', outcome.tone === 'bad' ? 'text-destructive' : 'text-muted-foreground')}>{outcome.text}</p>}
            {/* `retryControl` is null on a quota stop, so a run that did not fail but ran out of
                Credits still offers nothing to press. */}
            {retryControl}
            {/* A failed run's second affordance: /docs/troubleshooting has a section per cause.
                New tab: reading it must not discard the conversation it happened in. */}
            {item.stopReason === 'error' && (
              <a
                className="text-muted-foreground text-xs underline underline-offset-4 hover:text-foreground"
                href="/docs/troubleshooting#messages"
                target="_blank"
                rel="noopener noreferrer"
              >
                Why runs stop
              </a>
            )}
          </div>
        ) : silent ? (
          // The same row the outcome uses, so an empty turn and a stopped one are one shape. The
          // sentence says what happened and what to do next.
          <div className="flex flex-wrap items-baseline gap-3" data-outcome="empty">
            <p className="basis-full text-muted-foreground text-sm leading-relaxed">StudPilot ended this turn without a reply. Run that prompt again, or rephrase it and send.</p>
            {retryControl}
          </div>
        ) : null}

        {hadDeniedTools && (
          <p className="text-muted-foreground text-sm">Some of StudPilot’s abilities are turned off in your settings, so it worked without them.</p>
        )}

        {/* THE REPLY'S TOOLBAR — AI Elements MessageToolbar and MessageActions: Copy, Share, Regenerate
            and the same menu a right-click opens. On a pointer device it shows under the pointer or
            on focus; on the newest reply it is simply there. */}
        {(spilled.prose || (retryControl && !outcome && !silent)) && !item.streaming && (
          <MessageToolbar
            className={cn('mt-0 justify-start transition-opacity', !isLast && 'opacity-0 focus-within:opacity-100 group-hover:opacity-100')}
            data-last={isLast || undefined}
          >
            <MessageActions>
              {spilled.prose && <CopyAction getText={() => spilled.prose} />}
              {spilled.prose && <ShareAction getText={() => spilled.prose} />}
              {!outcome && !silent && retryControl}
              <MessageAction
                tooltip="More options for this reply"
                label="More options for this reply"
                aria-haspopup="menu"
                onClick={(e) => menu.openFrom(e.currentTarget)}
              >
                <MoreHorizontalIcon className="size-4" />
              </MessageAction>
            </MessageActions>
          </MessageToolbar>
        )}
        <ContextMenu
          at={menu.at}
          label="Reply options"
          onClose={menu.close}
          items={[
            ...(spilled.prose
              ? [{ id: 'copy', label: 'Copy text', onSelect: () => void navigator.clipboard?.writeText(spilled.prose).catch(() => undefined) }]
              : []),
            ...(onRetry && item.stopReason !== 'quota'
              ? [{ id: 'retry', label: outcome ? 'Try again' : 'Regenerate', onSelect: onRetry }]
              : []),
          ] satisfies MenuItem[]}
        />

        {/* THE FOOTER ROW, AND WHY THE COST IS HERE. `msg_end` clears the status that feeds the live
            figure, so the settled total lives on the message, next to the time the turn happened.
            Rendered only when the worker sent one and something was actually spent: an absent field
            means history or an older worker, and neither should be drawn as a confident zero. */}
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-muted-foreground text-xs" data-turn-foot="">
          <Stamp at={item.createdAt} />
          {item.creditsSpent != null && item.creditsSpent > 0 && (
            <span className="border-border border-s ps-3 tabular-nums">
              {/* The settled figure rolls in on a turn that was watched arriving (picks/chat/rolling-number). */}
              <strong className="font-normal text-foreground/80"><RollingNumber value={item.creditsSpent} rollIn={arrivedLive} /></strong> {item.creditsSpent === 1 ? 'Credit' : 'Credits'}
            </span>
          )}
        </p>
      </MessageContent>
    </Message>
  );
}
