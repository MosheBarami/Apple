/**
 * What a run that did not simply succeed says to the person who asked for it — the DATA half.
 *
 * Split from `turn.tsx` for the reason every other model beside it is (`activity-model`,
 * `thinking-model`, `evidence-model`): the decision is the part worth testing, and a module that
 * imports React cannot be loaded by `node --test`.
 *
 * WHAT WAS WRONG. The turn rendered `{item.error ? item.error : outcome.text}` — the worker's own
 * `error` field, verbatim, as the outcome sentence. That field held 'run interrupted',
 * 'rate_limited', and on two paths the inference provider's raw message. So the product's whole
 * failure vocabulary was in place everywhere except the surface where failures are actually met.
 * It also read differently after a reload, because `error` arrives on the `msg_end` frame and is
 * never persisted — the same failed turn, two different sentences, and no way for anyone to
 * report that as a bug.
 *
 * THE RULE: the worker sends a CODE from `RUN_FAILURES`, and the sentence is written here. A code
 * this build does not recognise falls through to the generic sentence. It is never rendered — a
 * worker deployed ahead of the app must degrade, not leak.
 */
import { isRunFailure, type RunFailure } from '@golem/shared';

export type OutcomeTone = 'note' | 'bad';

export interface OutcomeLine {
  tone: OutcomeTone;
  /**
   * Null when the reply above already says it (F-045, 2026-09-23). The run still ENDED this way —
   * the row, its tone and "Try again" stay — but a second sentence restating the reply's own
   * closing is the stacking a young reader cannot untangle (D-UX-2).
   */
  text: string | null;
}

/** A stop that is not a failure still deserves a sentence. */
const BY_STOP: Record<string, OutcomeLine> = {
  incomplete: {
    tone: 'note',
    text: 'That run stopped before it finished. Try telling me more specifically what to build.',
  },
  stopped: { tone: 'note', text: 'Stopped.' },
  //[[ 'quota' IS FOUR ENDINGS AND ONLY TWO OF THEM ARE THE READER'S CREDITS.
  //
  //   This read "That used the last of today’s Credits. They reset tomorrow." The worker sends
  //   `quota` from four places in do/session.ts: the user's own allowance running out at a step
  //   boundary and again mid-settlement — where that sentence was true — and ALSO from a BudgetError
  //   and from CAPACITY_EXHAUSTED, which are the SERVICE's shared building budget and, on one of
  //   BudgetError's own branches, an administrator pausing generation. Nothing of the reader's ran
  //   out on either, and the reply this line sits under says so in the worker's own words.
  //
  //   AND IT WAS WRONG ABOUT THE MONEY ON ALL FOUR. 'quota' is in REFUNDABLE_REASONS
  //   (apps/worker/src/run-refund.ts), so a run that ended here having left nothing to keep has
  //   every Credit put back — and `finishRun` appends `refundSentence` to the reply directly above
  //   this line, stating the number. "That used the last of today’s Credits" then contradicted the
  //   product's own signed sentence about the reader's money, one line apart, which is the exact
  //   thing the header of this file forbids.
  //
  //   So it says the one thing true of all four and claims nothing about Credits. The reply owns
  //   the money because it is the only side that knows what the ledger actually returned.
  quota: {
    tone: 'note',
    text: 'That run stopped before it finished. Everything up to there is saved.',
  },
  error: { tone: 'bad', text: 'Something went wrong partway through.' },
};

/**
 * One sentence per failure the worker can name.
 *
 * Each answers the same two questions the failure taxonomy answers, in the same order: whether
 * anything was lost, then what to do. They are deliberately close to the reply text the worker
 * already writes into the conversation — this line sits directly beneath it, and two different
 * accounts of one event is worse than one repeated.
 */
const BY_FAILURE: Record<RunFailure, string> = {
  busy: 'The model was too busy to finish that step. Everything up to there is saved, and nothing further was charged.',
  interrupted: 'That run was interrupted between steps. Everything up to there is saved — send another message to continue.',
  dropped_step: 'The model dropped a step part-way through. Everything up to there is saved, and the dropped step was not charged.',
  model_failed: 'That step failed on our side. Everything up to there is saved — send another message and Apple picks up where it left off.',
};

/**
 * The line to show for a finished turn, or null when the run simply succeeded.
 *
 * `code` is whatever arrived on the wire, of any shape: an unknown string, an old worker's prose,
 * undefined. Nothing that is not a declared failure reaches the returned text.
 */
export function outcomeLine(
  stopReason: string | undefined,
  code: string | undefined,
  /** The reply this line would sit under, when there is one. */
  reply?: string,
): OutcomeLine | null {
  if (!stopReason || stopReason === 'done') return null;
  const base = BY_STOP[stopReason];
  if (!base) return null;
  // A code only ever refines a FAILURE. Running out of Credits is not a failure, and a stray code
  // on that stop must not turn it into one.
  const line = stopReason === 'error' && isRunFailure(code) ? { tone: 'bad' as const, text: BY_FAILURE[code] } : base;
  return restates(stopReason, line.text, reply) ? { ...line, text: null } : line;
}

/**
 * Does the reply already say what this line would? Two cases, neither a guess from wording:
 *
 *   - `incomplete`: the worker never stores an incomplete reply without its own closing sentence
 *     (finishRun; the contract is written on msg_end.content in @golem/shared). That sentence names
 *     the real reason — the read-stall bound, a refusal and its remedy — so "That run finished
 *     without changing anything" under it is a second, vaguer account of the same ending.
 *   - any stop whose sentence IS the reply's last paragraph: "Stopped." under "Stopped.".
 *   - any line whose OPENING sentence the reply already contains (F-013): the worker's failure
 *     reply "That step failed on our side. …" is followed by its refund paragraph, so it is not the
 *     last paragraph, and the row under it said "That step failed on our side." a second time.
 */
function restates(stopReason: string, text: string | null, reply: string | undefined): boolean {
  const body = (reply ?? '').trim();
  if (!body || !text) return false;
  if (stopReason === 'incomplete') return true;
  const last = body.slice(body.lastIndexOf('\n\n') + 1).trim();
  if (last === text.trim()) return true;
  const lead = text.trim().split(/(?<=\.)\s/)[0];
  return body.includes(lead);
}
