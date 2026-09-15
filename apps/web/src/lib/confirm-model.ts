/**
 * How much ceremony an action has earned.
 *
 * Two habits in this codebase look like opposites and are the same mistake — deciding the friction
 * from how the code felt to write rather than from what the action costs the person:
 *
 *   * A dialog in front of a REVERSIBLE action. It teaches people to dismiss dialogs, which is
 *     precisely the training you do not want them to arrive with when the permanent one appears.
 *     Archiving is one UPDATE away from being undone; the honest design lets them do it and offers
 *     the way back.
 *   * A typed confirmation that lived inside one component. Deleting a project takes the chat
 *     history, the checkpoints and the Studio pairing with it, and the rule saying so was a local
 *     `typed === project.name` that nothing else could see, reuse, or check.
 *
 * The unknown-fact case is the one worth stating: a consequence we cannot READ lands on MORE
 * friction, never less. `reversible: 'yes'` is truthy, and a truthy read would quietly downgrade a
 * permanent delete to an undo toast.
 */

export type Confirmation =
  /** Just do it. Nothing is destroyed, nothing is spent, and it can be put back. */
  | 'none'
  /** Do it, and offer the way back — see lib/undo.ts. */
  | 'undo'
  /** Stop and say what will happen. */
  | 'dialog'
  /** Stop, and make them type the name of the thing. */
  | 'typed';

export interface Consequence {
  /** Can the product put it back exactly as it was, without the user redoing work? */
  reversible: unknown;
  /** Does it remove something the user made? */
  destroysUserContent: unknown;
  /** Does it spend money or Credits? */
  costsMoney?: unknown;
}

/** Only a literal `true` is a yes. Everything else — including the string "false" — is a no. */
const yes = (v: unknown): boolean => v === true;

export function confirmationFor(c: Consequence): Confirmation {
  const reversible = yes(c.reversible);
  const destroys = yes(c.destroysUserContent);
  const costs = yes(c.costsMoney);

  if (!reversible) {
    // Permanent AND it takes their work with it: the one case worth making them type.
    return destroys ? 'typed' : 'dialog';
  }
  // Reversible, but it spends. Money is worth a beat even when it can be refunded.
  if (costs) return 'dialog';
  return destroys ? 'undo' : 'none';
}

/**
 * Does what they typed name the thing they are deleting?
 *
 * Two rules that are not obvious:
 *
 *   * AN EMPTY EXPECTED NAME CONFIRMS NOTHING. Several projects in this product have blank or
 *     whitespace names, and `'' === ''` made the Delete button live before the dialog had finished
 *     rendering. A subject that cannot be named cannot be confirmed by typing its name.
 *   * NORMALISED, NOT LOOSENED. "Café" composed and decomposed are identical on screen and
 *     different in bytes; refusing that asks the user to fix their keyboard before they may delete
 *     their own project. Case still matters — it is the part they are being asked to read.
 */
export function confirmMatches(typed: unknown, expected: unknown): boolean {
  if (typeof typed !== 'string' || typeof expected !== 'string') return false;
  const want = expected.normalize('NFC').trim();
  if (!want) return false;
  return typed.normalize('NFC').trim() === want;
}

/**
 * May the confirm button act yet?
 *
 * Split out of the dialog for the usual reason — it is the decision, and a component that imports
 * React cannot be loaded by `node --test` — but also because both of its edges fail open in the
 * obvious implementation:
 *
 *   * A 'typed' dialog whose subject has no name cannot be satisfied by typing that name, and the
 *     tempting fallback ("well, they pressed the button") makes the whole ceremony decorative.
 *   * A dialog rendered for a verdict that does not call for one — 'none', 'undo', or a string
 *     that is neither — is a bug at the call site. A confirm button that works anyway is how that
 *     bug reaches a user; refusing surfaces it while it is still someone's afternoon.
 */
export function canConfirm(spec: { ceremony: unknown; typed?: unknown; subject?: unknown }): boolean {
  if (spec.ceremony === 'dialog') return true;
  if (spec.ceremony === 'typed') return confirmMatches(spec.typed, spec.subject);
  return false;
}
