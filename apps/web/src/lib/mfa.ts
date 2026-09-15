/**
 * TWO-STEP VERIFICATION, decided here rather than in a component.
 *
 * Supabase performs the cryptography — enrol, challenge, verify, unenrol — and this module owns the
 * four judgements around it that a page gets wrong quietly. Every one of them is a sentence about
 * somebody's account security, and each has a comfortable wrong answer:
 *
 *   "Two-step verification is off."   said because a request failed
 *   "You are signed in."              said because an assurance level could not be read
 *   "Scan this."                      said over an image whose source came from the network
 *   "That code is wrong."             said about a string that was never six digits
 *
 * The first two are the dangerous ones, and they are the same defect in two places: an absence of
 * an observation rendered as an observation. `factorsState` will not say `off` unless it read a
 * well-formed, empty list, and `secondStep` fails CLOSED — an unreadable level blocks the sign-in
 * and says which of the two happened, rather than letting a password-only session into an account
 * whose owner asked for a code every time.
 *
 * Kept free of React and of the Supabase client so tests/mfa.test.mjs can feed it the shapes a real
 * provider produces, including the broken ones.
 */

/** Digits in a TOTP code. Six is not ours to choose — it is what authenticator apps display. */
export const TOTP_CODE_LENGTH = 6;

/** A factor as this product is willing to show it. */
export interface MfaFactor {
  id: string;
  /** What the person called it, or null when they never named it. */
  friendlyName: string | null;
  /** Epoch ms, or null when the provider's timestamp could not be read. Never 0. */
  createdAt: number | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * The verified TOTP factors in a `listFactors()` payload.
 *
 * READS `all`, NOT `totp`. Both are returned and the typed `totp` array is already filtered to
 * verified ones — but it is a field name on a provider response, and a response that arrives with
 * the field renamed or missing would then produce an empty array, which this product would print
 * as "off". Reading `all` and filtering here means the filter is ours and is tested.
 *
 * An UNVERIFIED factor is not protection: `enroll()` creates the row before any code is checked, so
 * an abandoned enrolment leaves one behind. Counting it would tell someone they are defended by a
 * factor that no challenge can ever pass.
 */
export function verifiedTotpFactors(data: unknown): MfaFactor[] {
  const all = (data as { all?: unknown } | null)?.all;
  if (!Array.isArray(all)) return [];
  const out: MfaFactor[] = [];
  for (const row of all) {
    if (!row || typeof row !== 'object') continue;
    const f = row as Record<string, unknown>;
    const id = str(f.id);
    // An id is what the remove button names. A row without one is a control wired to nothing.
    if (!id || str(f.status) !== 'verified' || str(f.factor_type) !== 'totp') continue;
    const at = Date.parse(str(f.created_at));
    out.push({
      id,
      friendlyName: str(f.friendly_name).trim() || null,
      createdAt: Number.isNaN(at) ? null : at,
    });
  }
  return out;
}

export type FactorsState =
  | { state: 'loading' }
  | { state: 'unavailable'; message: string }
  | { state: 'on'; factors: MfaFactor[] }
  | { state: 'off' };

/**
 * What the settings panel is entitled to say.
 *
 * THE SHAPE CHECK IS THE POINT. `data?.totp?.length === 0` is true for a null body, for an HTML
 * error page a proxy substituted, and for a truncated JSON response — and every one of those would
 * render "Two-step verification is off" under a button offering to set it up, to a person who
 * already has it on. That is not a cosmetic error: it invites a second enrolment and it tells the
 * owner their defence is missing at the exact moment they cannot check.
 */
export function factorsState(input: { loading: boolean; error: unknown; data: unknown }): FactorsState {
  if (input.loading) return { state: 'loading' };
  if (input.error) {
    return {
      state: 'unavailable',
      message: 'We could not check whether two-step verification is on for this account.',
    };
  }
  const all = (input.data as { all?: unknown } | null)?.all;
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data) || !Array.isArray(all)) {
    return {
      state: 'unavailable',
      message: 'We could not check whether two-step verification is on for this account.',
    };
  }
  const factors = verifiedTotpFactors(input.data);
  return factors.length > 0 ? { state: 'on', factors } : { state: 'off' };
}

/* --------------------------------------------------------------- the sign-in step --- */

export type SignInStep =
  /** Nothing further to prove. */
  | { step: 'in' }
  /** A verified factor exists and this session has not passed it yet. */
  | { step: 'code' }
  /** We could not tell. Nobody goes in on a guess. */
  | { step: 'blocked'; message: string };

/**
 * Does this sign-in still owe a code?
 *
 * Reads `getAuthenticatorAssuranceLevel()`, whose contract is: `currentLevel` is what this session
 * has proved, `nextLevel` is what it could prove — 'aal2' exactly when the account has a verified
 * factor. So `nextLevel === 'aal2' && currentLevel !== 'aal2'` is the whole question.
 *
 * FAILS CLOSED, AND OUT LOUD. The natural implementation is `if (data?.nextLevel === 'aal2')`, and
 * the reason that is wrong is worth stating: every failure mode of the read — a thrown request, a
 * null body, a renamed field, no session at all — evaluates to "no code needed" and signs the
 * person straight in. An account that asked for a code every time then does not ask, precisely
 * when something is interfering with the network. Blocking on a blip costs a retry; the other
 * direction costs the account.
 *
 * `currentLevel: null` means the client found no session, which after a successful password
 * sign-in is a contradiction rather than a green light.
 */
export function secondStep(data: unknown, error: unknown): SignInStep {
  const unreadable = (why: string): SignInStep => ({ step: 'blocked', message: why });
  if (error) {
    return unreadable('We could not check whether this account needs a verification code. Try signing in again.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return unreadable('We could not check whether this account needs a verification code. Try signing in again.');
  }
  const { currentLevel, nextLevel } = data as { currentLevel?: unknown; nextLevel?: unknown };
  if (typeof currentLevel !== 'string' || typeof nextLevel !== 'string') {
    return unreadable('We could not check whether this account needs a verification code. Try signing in again.');
  }
  if (nextLevel === 'aal2' && currentLevel !== 'aal2') return { step: 'code' };
  return { step: 'in' };
}

/* ---------------------------------------------------------------------- the code --- */

/** What the user typed, with the grouping their app displays taken back out. */
export function normaliseCode(value: unknown): string {
  return typeof value === 'string' ? value.replace(/[\s-]/g, '') : '';
}

/**
 * Why this code cannot be submitted, or null when it can.
 *
 * ONE SENTENCE FOR EVERY WAY OF BEING WRONG, deliberately. "Too short", "contains a letter" and
 * "that is seven digits" are three ways of saying the same correction, and a field that criticises
 * each keystroke differently reads as an argument.
 */
export function codeProblem(value: unknown): string | null {
  const code = normaliseCode(value);
  if (!code) return `Enter the ${TOTP_CODE_LENGTH}-digit code from your authenticator app.`;
  if (!new RegExp(`^\\d{${TOTP_CODE_LENGTH}}$`).test(code)) {
    return `That code should be ${TOTP_CODE_LENGTH} digits.`;
  }
  return null;
}

/* ----------------------------------------------------------------- the enrolment --- */

export interface Enrollment {
  factorId: string;
  /** An inline image, or null when the provider sent something an `<img>` must not be given. */
  qrCode: string | null;
  /** The same secret in type-it-yourself form. Null when the provider sent none. */
  secret: string | null;
}

/** Only an inline image. See `enrollment`. */
const INLINE_IMAGE = /^data:image\/(svg\+xml|png|jpeg|gif|webp)[;,]/i;

/**
 * The usable part of an `mfa.enroll()` response.
 *
 * THE QR SOURCE IS CHECKED BECAUSE IT IS PUT IN AN `<img src>`. Supabase sends an inline SVG data
 * URI; anything else — a remote URL, a `data:text/html`, an empty string — is dropped and the panel
 * falls back to the typeable secret. A remote source there is a beacon that fires on every
 * enrolment, on the one screen a person is being asked to trust while they hold their phone to it,
 * and no legitimate response has a reason to carry one.
 *
 * The enrolment SURVIVES a dropped QR, because the secret alone is enough to finish. What it does
 * not survive is a missing factor id: without one there is nothing to challenge and nothing to
 * verify against, so that is null rather than an object with an empty id that the page would
 * happily render a "Verify" button over.
 */
export function enrollment(data: unknown): Enrollment | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const factorId = str((data as Record<string, unknown>).id);
  if (!factorId) return null;
  const totp = (data as { totp?: unknown }).totp;
  const block = totp && typeof totp === 'object' ? (totp as Record<string, unknown>) : {};
  const qr = str(block.qr_code);
  return {
    factorId,
    qrCode: INLINE_IMAGE.test(qr) ? qr : null,
    secret: str(block.secret).trim() || null,
  };
}
