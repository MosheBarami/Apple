/**
 * WHAT THE STUDIO CONNECTION PANEL IS ENTITLED TO SAY.
 *
 * The data half, so every judgement is testable under `node --test` without a DOM — the same
 * arrangement as credits-model.ts, and for the same reason: the sentences on this panel are the
 * product's answer to "why is nothing happening", and a sentence that is confidently wrong there is
 * worse than a blank row.
 *
 * THE RULE, throughout: a thing that was never reported produces a sentence SAYING it was never
 * reported, never a blank, never a zero, and never the reassuring reading. Studio reports its open
 * place on roughly one poll in twelve, so "we have not been told which place is open" is a state
 * this panel is in for most of a healthy link's life — and drawing that as a mismatch would put a
 * warning on a connection that is working perfectly.
 *
 * Nothing here computes anything the worker already decided. The mismatch VERDICT is the worker's
 * (apps/worker/src/studio-place.ts) and travels with the payload; this file only chooses words.
 */
import type { StudioPlace } from '@golem/shared';

const DAY = 24 * 3600 * 1000;

/** How a place is named when it has no name. An unsaved place genuinely has none. */
const named = (n: string | null | undefined): string => (typeof n === 'string' && n.trim() !== '' ? `"${n}"` : 'an unnamed place');

export interface PairingNote {
  text: string;
  /** True inside the last three days, and once it has lapsed. Drives the tone, nothing else. */
  urgent: boolean;
}

/**
 * The 30-day pairing clock, in words — or null when there is no clock to report.
 *
 * NULL IS THE ANSWER FOR AN UNKNOWN EXPIRY, and that matters more than the rest of this function.
 * `pairingExpiresAt` is null for a project that has never paired and absent from a worker build too
 * old to send it; turning either into a date invents the one number this panel exists to state
 * honestly. The user's first notice of the cutoff used to be Studio going dead mid-build.
 */
export function pairingNote(expiresAt: number | null | undefined, now: number): PairingNote | null {
  if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt) || expiresAt <= 0) return null;
  const left = expiresAt - now;
  if (left <= 0) {
    // Past tense. "expires in -4 days" is arithmetic wearing the costume of a sentence.
    return { text: 'This pairing has expired. Pair again to reconnect Studio.', urgent: true };
  }
  if (left < DAY) {
    // Not "0 days", which reads as a bug rather than as urgency.
    return { text: 'This pairing expires within a day — pair again to keep Studio connected.', urgent: true };
  }
  const days = Math.floor(left / DAY);
  const plural = `${days} day${days === 1 ? '' : 's'}`;
  return days <= 3
    ? { text: `This pairing expires in ${plural} — pair again to keep Studio connected.`, urgent: true }
    : { text: `This pairing expires in ${plural}.`, urgent: false };
}

/**
 * The bound place against the place Studio actually has open.
 *
 * Four states and they are four different sentences. The one worth care is `open === null`: Studio
 * sends its state on about one poll in twelve, so most of the time the panel simply has not been
 * told — and saying "but Studio has something else open" there would be a failure to observe
 * rendered as an observation, on the row where it would scare people most.
 */
export function placeLine(
  bound: StudioPlace | null,
  open: { placeName: string; placeId: number } | null,
): string {
  if (!bound && !open) return 'No place identified yet. Apple binds this project the first time Studio reports a saved place.';
  if (!bound) return `Studio has ${named(open?.placeName)} open. This project is not bound to a place yet.`;
  if (!open) return `Bound to ${named(bound.placeName)}. Studio has not reported which place it has open.`;
  return open.placeId === bound.placeId
    ? `Bound to ${named(bound.placeName)}, which is what Studio has open.`
    : `Bound to ${named(bound.placeName)}, but Studio has ${named(open.placeName)} open.`;
}

/** What is attached, as the plugin itself reported it at pairing. */
export function pluginLine(version: string | null, protocol: number | null): string {
  if (!version && protocol === null) return 'The plugin did not report its version.';
  const v = version ? `Plugin ${version}` : 'Plugin version not reported';
  return protocol === null ? `${v}, protocol not reported.` : `${v}, protocol ${protocol}.`;
}

/**
 * One op's outcome, in words.
 *
 * The kinds are the worker's (apps/worker/src/op-failure.ts) and collapsing them to "failed" would
 * discard the only thing this log is for: whether a change might have landed anyway. A timeout and
 * a transport failure look identical to a user and are opposites — one may have applied, the other
 * provably did not.
 */
const OUTCOMES: Record<string, string> = {
  timeout: 'no answer from Studio — this may have applied anyway',
  transport: 'never reached Studio',
  not_found: 'the target was not there',
  conflict: 'the place had already changed',
  refused: 'Studio refused it',
  invalid: 'the arguments were not accepted',
  internal: 'it broke inside Studio',
};

export function opOutcome(row: { ok: number; failure: string | null | undefined }): string {
  if (row.ok) return 'applied';
  const kind = typeof row.failure === 'string' ? OUTCOMES[row.failure] : undefined;
  // An unrecognised or missing kind is SAID to be unclassified. Guessing one would put a claim
  // about whether a mutation landed in front of a user on the strength of nothing.
  return kind ?? 'failed, and the reason was not classified';
}
