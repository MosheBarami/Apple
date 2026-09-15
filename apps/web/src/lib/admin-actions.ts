/**
 * What the admin console's spend controls actually cost, and therefore how much ceremony each has
 * earned.
 *
 * `lib/confirm-model.ts` has graded ceremony from consequence since it landed, and until now NO
 * administrative action used it. The three buttons on the spend panel were bare: one click halts
 * every build in flight for every customer, one click doubles the ceiling on the monthly bill.
 *
 * The consequences live here rather than inline in the JSX for the same reason the model itself was
 * extracted: a rule written into a component is a rule nothing else can see, reuse or check. This
 * module imports React nothing, so `node --test` can execute the decisions instead of grepping the
 * page for them.
 *
 * WHY THE TWO REVERSIBLE CONTROLS GET NOTHING. Putting a dialog in front of "Resume" or "Halve the
 * caps" is not extra safety, it is the other half of the same mistake — it teaches the operator
 * that dialogs are noise to be clicked through, which is exactly the habit you do not want him to
 * arrive with when the expensive one appears.
 */
import { confirmationFor, type Confirmation, type Consequence } from './confirm-model';

export type AdminSpendAction =
  /** Stop all AI generation. */
  | 'kill'
  /** Let it run again. */
  | 'resume'
  /** Halve the neuron caps. */
  | 'tighten'
  /** Double them. */
  | 'raise';

export const ADMIN_SPEND_ACTIONS: Record<AdminSpendAction, Consequence> = {
  /*
   * IRREVERSIBLE IN EFFECT, even though the switch itself flips back. Resuming does not resume the
   * runs it killed: a customer who was four steps into a build loses those steps and the credits
   * they cost. It spends nothing, so it is a dialog rather than a typed confirmation.
   */
  kill: { reversible: false, destroysUserContent: false, costsMoney: false },
  /** Reversible, destroys nothing, spends nothing — and the way out of a pause must not be gated. */
  resume: { reversible: true, destroysUserContent: false, costsMoney: false },
  /** Reversible and it only ever costs less. */
  tighten: { reversible: true, destroysUserContent: false, costsMoney: false },
  /*
   * REVERSIBLE AND IT SPENDS. Doubling `billableNeuronsPerMonth` raises the worst case this
   * business can run up before the budget guard refuses — the one control on the page whose
   * consequence arrives as an invoice rather than as a screen. Money is worth a beat.
   */
  raise: { reversible: true, destroysUserContent: false, costsMoney: true },
};

/**
 * How much ceremony one spend control has earned.
 *
 * An action nobody declared comes back 'dialog', not 'none'. A typo in a call site must land on
 * MORE friction, never less — the same rule `confirmationFor` keeps for a consequence it cannot
 * read, applied one level up to a consequence that is not there at all.
 */
export function adminSpendCeremony(action: unknown): Confirmation {
  const consequence = typeof action === 'string' ? ADMIN_SPEND_ACTIONS[action as AdminSpendAction] : undefined;
  if (!consequence) return 'dialog';
  return confirmationFor(consequence);
}
