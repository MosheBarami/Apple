// Your own API keys, and the sentences that make a credential legible.
//
// The worker has had the entire lifecycle since the public API shipped — mint, list, rotate,
// revoke, with expiry and last-used on every row and ten tests on the rotation rules alone — and
// `grep '/api/keys' apps/web/src` returned nothing. A customer whose key leaked could only revoke
// it with curl, and the expiry the server has been serving all along reached no person.
//
// THE DECISIONS LIVE HERE, in a file with no JSX, because all of them are about what a person is
// told rather than about markup:
//
//   * A KEY THAT CANNOT DO ANYTHING MUST SAY SO. `projects: []` is not small print — the
//     authorizer refuses every project-scoped call from such a key with `project_not_granted`.
//     Rendering it as "Active" would be a working-looking credential that cannot work.
//   * EXPIRY IS SAID BEFORE IT HAPPENS. "Expires in 4 days" is the only version of that sentence
//     anybody can act on; "expired 3 days ago" is an incident report.
//   * NO DATE IS EVER PRINTED FROM A VALUE THAT IS NOT ONE. These fields arrive as JSON from a
//     route that has been running for months, and `new Date(undefined)` renders "Invalid Date" —
//     a sentence nobody can act on, produced by a formatter that looked fine.
//   * THE FORM REFUSES WHAT THE SERVER REFUSES, in the words of the field, before the round trip.
import { API_SCOPES, type ApiKeyMode, type ApiScope } from '@golem/shared';

/** Exactly `publicKeyShape` from apps/worker/src/api-keys.ts. Never carries the secret. */
export interface ApiKeyView {
  id: string;
  name: string;
  mode: ApiKeyMode;
  prefix: string;
  scopes: ApiScope[];
  projects: { id: string; name: string }[];
  created_at: string;
  expires_at: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
}

/** Below this, an expiry stops being a fact and becomes something to do this week. */
export const EXPIRING_SOON_MS = 7 * 86_400_000;

export type KeyStatus = 'active' | 'expiring' | 'expired' | 'revoked';

/** Epoch ms, or null for anything that is not a real timestamp. The only parser in this file. */
function at(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * REVOKED OUTRANKS EXPIRED, and the order is the point: both keys are equally dead, and only one
 * of them tells its owner that somebody turned it off. A key revoked last week that would also
 * have expired yesterday is a revocation.
 */
export function statusOf(key: ApiKeyView, now: number): KeyStatus {
  if (at(key.revoked_at) !== null) return 'revoked';
  const expiry = at(key.expires_at);
  if (expiry === null) return 'active';
  if (expiry <= now) return 'expired';
  return expiry - now <= EXPIRING_SOON_MS ? 'expiring' : 'active';
}

/** "in 3 days", "in 1 day", "today" — never "in 0 days" and never a negative. */
function inDays(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return 'today';
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function expiryLabel(key: ApiKeyView, now: number): string {
  if (at(key.revoked_at) !== null) return 'Revoked — it stopped working immediately.';
  const expiry = at(key.expires_at);
  // A key minted with no expiry is the common case and is not a fault. Saying nothing at all would
  // leave a reader wondering whether the field failed to load.
  if (expiry === null) return key.expires_at ? 'The expiry on this key could not be read.' : 'Never expires.';
  if (expiry <= now) return `Expired ${inDays(now - expiry) === 'today' ? 'today' : `${inDays(now - expiry)} ago`}.`;
  return `Expires in ${inDays(expiry - now)}.`;
}

/**
 * What this key may touch, said as a consequence.
 *
 * The empty case is the one that matters. A key with no project granted is minted happily and is
 * legitimate for the routes that take no project — and it is also exactly what somebody produces
 * when they forget to tick anything, at which point every call they make for their CI job is
 * refused with `project_not_granted` and the key looks fine in every list.
 */
export function grantLabel(key: ApiKeyView): string {
  const names = (key.projects ?? []).map((p) => p?.name).filter((n): n is string => typeof n === 'string' && n !== '');
  if (names.length === 0) {
    return 'No project granted: this key cannot reach any project, and every project request made '
      + 'with it is refused.';
  }
  return `${names.length === 1 ? 'Project' : 'Projects'}: ${names.join(', ')}.`;
}

/** "used 2 days ago", or the truth about a key nothing has ever presented. */
export function lastUsedLabel(key: ApiKeyView, now: number): string {
  const used = at(key.last_used_at);
  if (used === null) return 'Never been used.';
  const ago = now - used;
  if (ago < 0 || ago < 60_000) return 'Used just now.';
  if (ago < 86_400_000) return `Used ${Math.floor(ago / 3_600_000) || 1} hour${Math.floor(ago / 3_600_000) === 1 ? '' : 's'} ago.`;
  return `Used ${inDays(ago)} ago.`;
}

/** One line under the name: what it reaches, when it dies, whether anything has used it. */
export function describeKey(key: ApiKeyView, now: number): string {
  return `${grantLabel(key)} ${expiryLabel(key, now)} ${lastUsedLabel(key, now)}`;
}

export interface KeyFormProblem {
  field: 'name' | 'scopes' | 'expiresInDays' | 'projectIds';
  message: string;
  /** `warning` does not block the mint. The server would accept it; the person may not want it. */
  severity: 'error' | 'warning';
}

/**
 * The same refusals the mint route makes, made here first and named on the field.
 *
 * A 400 from `/api/keys` carries a sentence and no field, so the form cannot point at anything —
 * and `expiresInDays: "30"` is refused by the server for a reason ("now + NaN" is a key that never
 * works) that reads as pedantry unless it is said next to the box.
 */
export function newKeyProblems(input: {
  name: string;
  mode: ApiKeyMode;
  scopes: readonly string[];
  projectIds: readonly string[];
  expiresInDays?: number | string | null;
}): KeyFormProblem[] {
  const out: KeyFormProblem[] = [];
  if (!String(input.name ?? '').trim()) {
    out.push({ field: 'name', message: 'Give the key a name — it is how you will recognise it when you come to revoke it.', severity: 'error' });
  }
  const scopes = Array.isArray(input.scopes) ? input.scopes : [];
  if (scopes.length === 0) {
    out.push({ field: 'scopes', message: 'Choose at least one thing this key may do.', severity: 'error' });
  }
  for (const s of scopes) {
    if (!(API_SCOPES as readonly string[]).includes(s)) {
      out.push({ field: 'scopes', message: `"${s}" is not an API scope.`, severity: 'error' });
    }
  }
  const days = input.expiresInDays;
  if (days !== undefined && days !== null && days !== '') {
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 1 || days > 365) {
      out.push({
        field: 'expiresInDays',
        message: 'Expiry is a whole number of days between 1 and 365, or leave it blank for a key that does not expire.',
        severity: 'error',
      });
    }
  }
  if ((input.projectIds ?? []).length === 0) {
    out.push({
      field: 'projectIds',
      // Not an error: the server mints it, and it is the right key for the routes that take no
      // project. It is a warning because it is also what an unticked form produces.
      message: 'This key will not reach any project. That is fine for account-level calls, and every project request will be refused.',
      severity: 'warning',
    });
  }
  return out;
}
