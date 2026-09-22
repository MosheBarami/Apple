// Built and checked, then only reading.
//
// Measured 2026-09-22 on every customer-mission run (76b59615, fad0ab1b, a95f86fa): the model changed
// the place, ran a check, and then spent 20–40 paid steps on search_scripts / get_project_tree with
// DIFFERENT arguments each time — invisible to the duplicate guard, which only sees identical calls —
// until something else ended the run. This counts those steps and says when to intervene.
//
// A new change clears the check, so a run that is still fixing things is never counted: only a run
// whose latest change has passed a verifier, and which has since only read, is idle.

export const IDLE_AFTER_VERIFY_NUDGE = 4;
export const IDLE_AFTER_VERIFY_LIMIT = 8;
/**
 * A run that was told not to change anything has no change for a check to follow, so the bound above
 * never starts. Measured 2026-09-22 (run 5034f8f2): "What parts make up the StreetLamp model? Just tell
 * me, don't change anything." — it read the model and the tree, then kept reading until the duplicate
 * guard ended it without an answer. Such a run is told to answer after this many read-only steps.
 */
export const ANSWER_ONLY_NUDGE = 5;

export interface IdleState {
  /** A verifier passed after the latest change to the place. */
  verifiedAfterMutation?: boolean;
  /** Consecutive read-only steps since then. */
  idleAfterVerify?: number;
}

export interface StepFacts {
  /** A tool in this step changed the place. */
  mutated: boolean;
  /** A verifier in this step succeeded, with the place already changed by this run. */
  verified: boolean;
  /** Tool calls the step made, executed or refused as duplicates. Zero is a prose step. */
  calls: number;
  /** The run owes no change (the person forbade one), so reading is idle from the first step. */
  answerOnly?: boolean;
}

export type IdleAction = 'none' | 'nudge' | 'finish' | 'answer';

export function afterStep(state: IdleState, step: StepFacts): IdleState & { action: IdleAction } {
  let verifiedAfterMutation = state.verifiedAfterMutation === true;
  if (step.mutated) verifiedAfterMutation = false;
  if (step.verified && !step.mutated) verifiedAfterMutation = true;
  const onlyRead = !step.mutated && !step.verified && step.calls > 0;
  const counting = step.answerOnly ? onlyRead : verifiedAfterMutation && onlyRead;
  const idleAfterVerify = counting ? (state.idleAfterVerify ?? 0) + 1 : 0;
  const action: IdleAction = step.answerOnly
    ? idleAfterVerify === ANSWER_ONLY_NUDGE ? 'answer' : 'none'
    : idleAfterVerify >= IDLE_AFTER_VERIFY_LIMIT ? 'finish' : idleAfterVerify === IDLE_AFTER_VERIFY_NUDGE ? 'nudge' : 'none';
  return { verifiedAfterMutation, idleAfterVerify, action };
}
