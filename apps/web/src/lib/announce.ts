// What a screen reader is told about a reply, and — more of the work — what it is NOT told.
//
// WHAT EXISTED. `thinking.tsx` has an sr-only `aria-live="polite"` region carrying the phase hint
// while a run is in flight, so a blind user knew Apple was working. Nothing announced the ANSWER.
// The reply arrived as text mutated into an existing node, which no live region reports and no
// screen reader reads, so the run simply went quiet and stayed quiet.
//
// THE OBVIOUS FIX IS WORSE THAN THE BUG. Wrapping the transcript in `aria-live="polite"` with the
// default `aria-relevant="additions text"` puts every streaming delta into the announcement queue.
// A polite queue does not coalesce the way people assume: the reader works through it, so a
// 900-character reply arriving in fragments is read as a stutter of fragments, out of date by the
// time it finishes, and nothing else can be announced until it drains. That is not access; it is a
// denial of service with good intentions.
//
// So the rule here is: ANNOUNCE THE SETTLED OUTCOME, ONCE. The live edge of the transcript is for
// navigating to; the announcement is for knowing that there is something to navigate to, and what
// it says. Three consequences follow, and each is a test below.
//
//   * Nothing is announced while a turn is streaming.
//   * Code is NOT read out. A screen reader reciting 200 lines of Luau is hostile, and the code is
//     right there in the transcript, in a block the reader can reach and copy. The announcement
//     says a code block is present and how many lines it has, which is the fact worth having.
//   * A run that FAILED announces the failure. Silence after a failure is indistinguishable from
//     silence after success, and that distinction is the whole reason anyone is listening.
import { splitFences } from './code-fences.ts';

/**
 * How much of a reply is spoken before it is cut.
 *
 * Long enough for a real answer, short enough that a listener can interrupt and go read the rest.
 * The cut is at a word boundary and is announced as a cut — a sentence that simply stops sounds
 * like the product broke.
 */
export const ANNOUNCE_MAX = 600;

export interface AnnouncableTurn {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming: boolean;
  stopReason?: 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';
  error?: string;
}

/**
 * How a run that did not simply succeed is described. Mirrors the copy on the turn itself.
 *
 * "MIRRORS" IS A PROMISE THIS TABLE ONCE BROKE. `quota` read "That used the last of today’s
 * Credits." here and on the turn, and both were fixed to say so — except this one, which was a
 * second literal nobody grepped for. It was found in the BUILT BUNDLE, not in the source: the
 * source change looked complete because the sentence had been deleted from the file that owns it.
 *
 * The sentence is false for the same reason it was false there. do/session.ts sends `quota` from
 * four endings, two of them the SERVICE's shared budget — one being an administrator pausing
 * generation — where nothing of the listener's ran out; and `quota` is in REFUNDABLE_REASONS, so a
 * run that ended there having kept nothing has every Credit put back. A listener has less chance
 * than a reader of catching the contradiction, because the reply that states the refund has already
 * been spoken and gone.
 *
 * apps/web/tests/failed-run-money-claims.test.mjs holds BOTH tables to the same rule.
 */
const OUTCOME_SPEECH: Record<string, string> = {
  stopped: 'Apple stopped.',
  incomplete: 'That run finished without changing anything.',
  quota: 'That run stopped before it finished. Everything up to there is saved.',
  error: 'Something went wrong partway through.',
};

/** Cut at the last word boundary at or before `max`, so a reading never ends mid-word. */
function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const slice = text.slice(0, max);
  const space = slice.lastIndexOf(' ');
  return { text: (space > max * 0.6 ? slice.slice(0, space) : slice).trimEnd(), clipped: true };
}

/**
 * The prose of a reply with its fenced code replaced by a count of what was there.
 *
 * Exported because it is the part worth testing on its own: the guarantee is that no line of code
 * survives into the announcement, and that the code's PRESENCE does.
 */
export function speakableBody(content: string): string {
  const parts: string[] = [];
  for (const seg of splitFences(content)) {
    if (seg.kind === 'text') {
      parts.push(seg.value.trim());
      continue;
    }
    const lines = seg.value === '' ? 0 : seg.value.split('\n').length;
    parts.push(lines === 1 ? 'A code block of 1 line.' : `A code block of ${lines} lines.`);
  }
  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * What to put in the polite live region for this turn, or '' for "say nothing".
 *
 * '' rather than a placeholder: an empty live region is silent, and a region that announces "no
 * reply yet" on every render is a reader talking over itself.
 */
export function replyAnnouncement(turn: AnnouncableTurn | null | undefined): string {
  if (!turn || turn.role !== 'assistant') return '';
  // A turn still being written has not said anything yet. The Thinking card's own live region is
  // what covers this window, and two regions describing the same run is one too many.
  if (turn.streaming) return '';

  const body = speakableBody(turn.content);
  const failed = turn.stopReason && turn.stopReason !== 'done';

  if (failed) {
    // The worker's own message when it sent one — it is more specific than anything written here —
    // and the generic line for the stop reason otherwise.
    const why = turn.error?.trim() || OUTCOME_SPEECH[turn.stopReason!] || 'That run did not finish.';
    return body ? `${clip(body, ANNOUNCE_MAX).text} ${why}` : why;
  }

  if (!body) return '';
  const { text, clipped } = clip(body, ANNOUNCE_MAX);
  return clipped ? `Apple replied. ${text}… The rest of the reply is in the conversation.` : `Apple replied. ${text}`;
}
