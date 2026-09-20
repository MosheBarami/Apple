// WHAT A FAILED RUN OWES BACK, and the sentence that says so.
//
// THE DEFECT THIS EXISTS FOR. Credits are settled from MEASURED compute after every model call —
// see the `owed` arithmetic in do/session.ts — which is the honest way to charge for work that was
// actually done. It was also the only arithmetic in the product: there was no path anywhere that
// gave a Credit back. So a run that reached the provider's output ceiling, or errored, or ran out
// of steps, charged for every neuron it burned and then told the user, in the product's own words,
// to "send another message and Apple will continue from here" — which starts a second run and
// charges again. The customer paid twice for one build, and both sentences were true individually.
//
// The rule this module encodes is deliberately narrow, and narrow in the user's favour rather than
// ours: a run that produced NOTHING THE USER CAN KEEP does not get to bill for the attempt. A run
// that changed the place, produced the artifact it was asked for, or (in a conversational mode)
// answered the question, is charged in full even if it later fell over — that work exists and the
// user has it.
//
// Nothing here reads a clock, a database or an environment. It is the decision and the wording,
// separated from the Durable Object that has to carry them out, so both can be tested by argument.
import type { BuildOutcome } from './analytics';

/** The `stopReason` vocabulary `finishRun` takes — the browser's union, from @golem/shared. */
export type RunStopReason = 'done' | 'stopped' | 'error' | 'quota' | 'incomplete';

export interface RefundInputs {
  /** What the run was reported as on the wire. */
  reason: RunStopReason;
  /** The finer analytics label, where the caller had one: 'timeout', 'step_limit'. */
  buildOutcome?: BuildOutcome;
  /** The run's mode. Conversational modes deliver prose; builder modes deliver changes. */
  mode: string;
  /** Tool calls that SUCCEEDED this run. */
  opsApplied: number;
  /** A mutating tool succeeded — the place is different because of this run. */
  mutated: boolean;
  /** The run was asked for an image or a model. */
  artifactRequested: boolean;
  /** …and did not produce it. */
  artifactMissing: boolean;
  /** The MODEL's own prose reached the user (not the product's failure note). */
  textDelivered: boolean;
  /** Credits charged to this run so far. */
  creditsSpent: number;
}

export interface RefundVerdict {
  /** Should the Credits this run took be given back? */
  refund: boolean;
  /** How many. Zero whenever `refund` is false. */
  credits: number;
  /**
   * WHY, as a short stable code for the ledger and the oplog. Never shown to a user — the sentence
   * is `refundSentence` below, and a code is not a sentence.
   */
  why: 'delivered' | 'not_a_failure' | 'nothing_charged' | 'no_usable_output';
}

/**
 * Modes whose OUTPUT IS PROSE.
 *
 * `clay` is the planning/conversation lane: an answer is the deliverable, so an answer is worth
 * paying for. Every other mode is a builder, and do/session.ts already states the rule this
 * mirrors — "a build request that ends with prose and no change has failed, whatever the prose
 * says". A builder run that only talked delivered nothing, so it refunds.
 */
const PROSE_MODES: ReadonlySet<string> = new Set(['clay']);

/**
 * Endings that CAN refund.
 *
 * `stopped` is absent on purpose and the comment at the stop check in do/session.ts is the reason:
 * the user pressed stop, the provider had already run, and "Stop is not a refund". `done` is absent
 * for the obvious reason — except that the step cap and the wall clock both report `done` on the
 * wire, which is why `buildOutcome` is consulted separately below.
 *
 * `quota` IS here. Running out mid-run is not the user's mistake to pay for twice, and a run that
 * ended with nothing to show for it should hand the Credits back so the next attempt has them.
 */
const REFUNDABLE_REASONS: ReadonlySet<RunStopReason> = new Set(['error', 'incomplete', 'quota']);

/** The two `done`-on-the-wire endings that are failures in the log. */
const REFUNDABLE_OUTCOMES: ReadonlySet<string> = new Set(['timeout', 'step_limit']);

/**
 * Did this run leave the user with anything?
 *
 * Exported because the sentence and the verdict are both written from it, and because a reader
 * asking "what counts as output?" deserves one answer rather than two that can drift.
 */
export function runDeliveredSomething(i: RefundInputs): boolean {
  //[[ `opsApplied` COUNTS READS, AND IT WAS THE REASON A FAILED RUN WAS NEVER REFUNDED.
  //
  //   session.ts computes it as `agent.trace.filter((t) => t.ok).length` — every tool call that
  //   SUCCEEDED, whatever it did. `get_project_tree` is one. `propose_plan` is one. Both are reads
  //   that change nothing, and every Agent run opens with them.
  //
  //   So the first clause here was true for essentially every run that got as far as planning, and
  //   the refund never fired. Owner's screenshot, 2026-09-20: a tower-defence build stopped at step
  //   1 of 16 on "the model reached its output limit", nothing created, nothing changed in the
  //   place — 30 Credits charged and no refund sentence. On a 231-Credit day that is seven failures
  //   to an exhausted account, which is exactly the "annoying credits block" that was reported.
  //
  //   `mutated` below is the signal that was always meant to carry this: session.ts sets it only
  //   when `out.ok && MUTATING_TOOLS.has(call.name)`. Dropping the read count leaves delivery
  //   defined as it reads in English — the place changed, an artifact was produced, or prose was
  //   delivered in a prose mode.
  //
  //   THE RESIDUE, STATED RATHER THAN HIDDEN. MUTATING_TOOLS lists six tools and does not include
  //   `format_script`, which rewrites a script's source. A run that only reformatted a script and
  //   then failed will now refund, where before the read count happened to catch it. That is a
  //   narrow over-refund against charging for every failed run, and it is the better error of the
  //   two. Closing it properly means widening MUTATING_TOOLS in session.ts, which another lane has
  //   uncommitted work in tonight; it is not fixed here and is not claimed to be. ]]
  if (i.mutated) return true;
  // An artifact that was asked for AND produced is output whatever else went wrong.
  if (i.artifactRequested && !i.artifactMissing) return true;
  if (PROSE_MODES.has(i.mode) && i.textDelivered) return true;
  return false;
}

/**
 * What this run owes back.
 *
 * FAILS CLOSED TOWARDS CHARGING NOTHING EXTRA, not towards refunding: an unreadable
 * `creditsSpent` yields `nothing_charged` rather than a refund of NaN Credits, because a refund
 * nobody can compute must not be rendered as a refund that happened. QuotaDO would clamp it, and a
 * clamped NaN is a silent zero with a sentence on top of it.
 */
export function refundVerdict(i: RefundInputs): RefundVerdict {
  const refundable = REFUNDABLE_REASONS.has(i.reason) || REFUNDABLE_OUTCOMES.has(i.buildOutcome ?? '');
  if (!refundable) return { refund: false, credits: 0, why: 'not_a_failure' };
  if (runDeliveredSomething(i)) return { refund: false, credits: 0, why: 'delivered' };
  if (!Number.isSafeInteger(i.creditsSpent) || i.creditsSpent <= 0) {
    return { refund: false, credits: 0, why: 'nothing_charged' };
  }
  return { refund: true, credits: i.creditsSpent, why: 'no_usable_output' };
}

const plural = (n: number): string => (n === 1 ? 'Credit' : 'Credits');

/**
 * THE USER-VISIBLE SENTENCE, written from what the ledger ACTUALLY returned.
 *
 * `asked` is what the verdict wanted back; `returned` is what QuotaDO managed to put back. They
 * differ in exactly one situation and it is worth stating rather than papering over: the allowance
 * is keyed by UTC day, so a run that began before midnight and ended after it is asking today's
 * ledger to reverse a charge that belongs to yesterday's. The ledger refuses to push a day's spend
 * below zero — doing so would hand out an allowance the user never had — and the sentence then says
 * what happened instead of claiming a refund that is not in the balance.
 *
 * Returns null when there is nothing to say, so the caller appends nothing rather than a blank
 * paragraph.
 */
export function refundSentence(asked: number, returned: number): string | null {
  if (asked <= 0) return null;
  if (returned >= asked) {
    return `You have not been charged for this run: the ${asked} ${plural(asked)} it used ${asked === 1 ? 'has' : 'have'} been put back.`;
  }
  if (returned > 0) {
    return (
      `${returned} of the ${asked} ${plural(asked)} this run used ${returned === 1 ? 'has' : 'have'} been put back. ` +
      `The rest was charged against yesterday's allowance, which has already reset, so it could not be returned.`
    );
  }
  return (
    `This run produced nothing, so its ${asked} ${plural(asked)} should not stand — but ${asked === 1 ? 'it was' : 'they were'} ` +
    `charged against yesterday's allowance, which has already reset, so ${asked === 1 ? 'it' : 'they'} could not be returned automatically.`
  );
}
