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
  text: string;
}

/** A stop that is not a failure still deserves a sentence. */
const BY_STOP: Record<string, OutcomeLine> = {
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
export function outcomeLine(stopReason: string | undefined, code: string | undefined): OutcomeLine | null {
  if (!stopReason || stopReason === 'done') return null;
  const base = BY_STOP[stopReason];
  if (!base) return null;
  // A code only ever refines a FAILURE. Running out of Sparks is not a failure, and a stray code
  // on that stop must not turn it into one.
  if (stopReason === 'error' && isRunFailure(code)) return { tone: 'bad', text: BY_FAILURE[code] };
  return base;
}
