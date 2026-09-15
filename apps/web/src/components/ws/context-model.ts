// What to say about a run's context budget, and about what the trim took.
//
// Both figures existed on the server and neither left it. `MAX_PROMPT_CHARS = 24_000` was a private
// constant in do/session.ts; `transcriptChars` was never on the wire; and `trimTranscript` dropped
// whole turn groups from the oldest end without telling anyone. The symptom a user gets from that
// last one is the worst kind: they ask a follow-up about something still visible on their screen,
// the agent has no record of it, and the answer reads as forgetfulness. Nothing on screen
// distinguishes that from a model that is simply bad at its job.
//
// The rules here are all refusals — what these strings may NOT say:
//
//   * Never a figure the worker did not send. An absent `context` renders nothing, which is what a
//     conversation loaded from history and an older worker both correctly produce.
//   * Never "0 turns dropped". `dropped` absent means nothing was dropped; a zero rendered as a
//     note would announce a loss that did not happen.
//   * Never a percentage alone. "76% of context used" is a number without a unit anyone can act
//     on; the characters are what the trim actually measures, so the characters are what is shown.
//   * Never "the conversation was truncated" for a run that merely got close to the ceiling.
//     Being near the limit and losing turns are different facts and the user can act on them
//     differently — one is "wrap this up", the other is "say that again".

export interface ContextBudget {
  usedChars: number;
  maxChars: number;
  dropped?: { groups: number; chars: number };
}

/** 24000 → "24,000". Grouping is the difference between a number and a wall of digits. */
const group = (n: number) => Math.max(0, Math.round(n)).toLocaleString();

/**
 * How full this run's context is, as a sentence — or null when there is nothing honest to say.
 *
 * Null for a missing or incoherent budget rather than a "0 of 0": a ceiling of zero is not a
 * measurement, it is a message we failed to understand, and rendering it as a full meter would
 * report a state the run was never in.
 */
export function contextBudgetLabel(c: ContextBudget | undefined | null): string | null {
  if (!c) return null;
  if (!Number.isFinite(c.usedChars) || !Number.isFinite(c.maxChars) || c.maxChars <= 0) return null;
  return `Context ${group(c.usedChars)} of ${group(c.maxChars)} characters`;
}

/**
 * The fraction of the budget in use, clamped to 0..1, or null when there is no budget to divide by.
 *
 * Clamped at 1 because the transcript CAN exceed the ceiling: `trimTranscript` returns it over
 * budget rather than stripping past the recent turns, which is deliberate and documented there. A
 * meter drawn past its own end reads as a rendering bug rather than as the honest "this is as
 * small as it can be made" that it is — `contextOverBudget` is how that state is said in words.
 */
export function contextFill(c: ContextBudget | undefined | null): number | null {
  if (!c || !Number.isFinite(c.usedChars) || !Number.isFinite(c.maxChars) || c.maxChars <= 0) return null;
  return Math.max(0, Math.min(1, c.usedChars / c.maxChars));
}

/** Is the prompt over its ceiling — the state the trim reaches when it cannot cut any further? */
export function contextOverBudget(c: ContextBudget | undefined | null): boolean {
  if (!c || !Number.isFinite(c.usedChars) || !Number.isFinite(c.maxChars) || c.maxChars <= 0) return false;
  return c.usedChars > c.maxChars;
}

/**
 * What was dropped, in the user's terms — or null when nothing was.
 *
 * It says TURNS rather than messages: an assistant turn plus its tool results is one exchange to
 * the person reading, and "9 messages dropped" for three exchanges reads as a catastrophe. It also
 * says what to do about it, because "earlier turns were dropped" with no remedy is an apology
 * rather than information.
 */
export function truncationNote(c: ContextBudget | undefined | null): string | null {
  const d = c?.dropped;
  if (!d || !Number.isFinite(d.groups) || d.groups <= 0) return null;
  const turns = d.groups === 1 ? '1 earlier turn' : `${group(d.groups)} earlier turns`;
  return `${turns} dropped from this run's context to stay within the limit. If something from earlier matters, say it again.`;
}
