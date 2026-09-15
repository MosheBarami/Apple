// "Does the key I connected still work?" — asked on purpose, instead of discovered by a build.
//
// A stored Open Cloud key dies silently. Roblox expires keys, and a person can revoke one from
// create.roblox.com without Apple being told; the row here stays exactly as it was, the settings
// page keeps saying "Connected to Roblox account 11279664020, key ending a9f3", and the first
// symptom is a build failing halfway with an upstream 401 quoted at somebody who did not ask for
// it. This route is the way to find out BEFORE that.
//
// THREE ANSWERS, AND THE THIRD IS THE ONE THAT MATTERS.
//
//   ok        Roblox accepted the key just now.
//   rejected  Roblox refused the key itself — revoked or expired. The panel opens the form and
//             says how to make a new one; nothing already built is affected.
//   unknown   THE CHECK COULD NOT BE MADE. Not "fine": unknown. Roblox being unreachable, a 403
//             from an IP allowlist, or a key whose declared scopes do not include the one this
//             probe needs all land here, each with its own sentence. A health check that answers
//             "ok" when it could not observe anything is the exact failure this repository keeps
//             naming, and it is worse than having no health check at all — it converts a dead
//             credential into a reassurance.
//
// WHY THE PROBE NEEDS `user.social:read` AND WILL NOT BORROW ANOTHER SCOPE. The narrowest live
// call Open Cloud offers is reading a public profile, and that is what `user.social:read` is for.
// A key connected only for `asset:write` could be probed with an upload — which is absurd — or by
// making a profile read it was never declared for, which would mean the product used somebody's
// credential for something they did not tick in order to reassure them about it. So a key without
// that scope returns `unknown` with the reason, and the panel offers to re-connect with it.
//
// WHAT THIS DOES NOT PROVE, said here because the sentence it would be tempting to write is
// wrong: it does not prove the key belongs to the account it is recorded against. An Open Cloud
// API key has no whoami — the profile read above answers about the id in the URL, which is the id
// the user typed, so it would answer identically for a key belonging to somebody else. OAuth has
// a userinfo endpoint and API keys do not, so verifying ownership is an OAuth item, not this one.
import type { RobloxScope } from '@golem/shared';
import { useRobloxCredential, describeRobloxCredential, type CredentialEnv } from './user-credentials';

/** The scope whose whole purpose is the read this probe makes. Nothing else is borrowed. */
export const CHECK_SCOPE: RobloxScope = 'user.social:read';

export type RobloxKeyHealth =
  | { status: 'none' }
  | { status: 'ok'; accountName: string | null; checkedAt: string }
  | { status: 'rejected'; reason: string; checkedAt: string }
  | { status: 'unknown'; reason: string; checkedAt: string };

const USERS_ENDPOINT = 'https://apis.roblox.com/cloud/v2/users';

/** Roblox returns `displayName` and `name`; either is a person, and the id is not. */
function nameFrom(text: string): string | null {
  try {
    const body = JSON.parse(text) as Record<string, unknown>;
    const display = typeof body.displayName === 'string' ? body.displayName.trim() : '';
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    // `name` on cloud/v2 is the resource path ("users/123") for some shapes, so it is only used
    // when it does not look like one — a resource path rendered as somebody's name is worse than
    // no name, because it reads like an answer.
    if (display) return display.slice(0, 60);
    if (name && !name.startsWith('users/')) return name.slice(0, 60);
    return null;
  } catch {
    return null;
  }
}

/**
 * Ask Roblox whether this user's stored key still works.
 *
 * `fetchImpl` is injectable so the tests drive the real request construction against a recorded
 * server. A test that mocked this function instead would pass whether the header was `x-api-key`
 * or nothing at all.
 */
export async function checkRobloxCredential(
  env: CredentialEnv,
  userId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RobloxKeyHealth> {
  const checkedAt = new Date().toISOString();
  const stored = await describeRobloxCredential(env, userId);
  if (!stored) return { status: 'none' };

  //[[ THIS CHECK IS FOR THE SENTENCE, NOT FOR THE SAFETY. Falsified by deleting it: nothing was
  //   sent to Roblox anyway, because `useRobloxCredential` refuses to hand out a key for a scope
  //   the customer did not declare and that is where the real guard lives. What changed was the
  //   answer the person reads — "the connected Roblox key was not declared with the
  //   user.social:read scope", which is a sentence about our vocabulary, instead of the words that
  //   appear beside the tickbox they would have to tick. So it stays, and it stays here rather
  //   than being pushed down into the store, which has no business knowing what a panel calls
  //   things. ]]
  if (!stored.scopes.includes(CHECK_SCOPE)) {
    return {
      status: 'unknown',
      reason:
        'This key was not connected with "Read your public profile", which is the one permission '
        + 'Apple can check it with. Re-connect the key with that ticked and this will say whether '
        + 'Roblox still accepts it.',
      checkedAt,
    };
  }

  const use = await useRobloxCredential(env, userId, CHECK_SCOPE);
  if (!use.ok) return { status: 'unknown', reason: use.error ?? 'the stored key could not be read', checkedAt };

  let res: Response;
  try {
    res = await fetchImpl(`${USERS_ENDPOINT}/${encodeURIComponent(String(use.creatorId))}`, {
      headers: { 'x-api-key': use.apiKey! },
    });
  } catch (e) {
    // Apple could not reach Roblox. That is a fact about this minute, not about the key, and
    // saying "expired" here would send somebody to make a new key for no reason.
    return {
      status: 'unknown',
      reason: `Apple could not reach Roblox to check (${String((e as Error)?.message ?? e).slice(0, 80)}). The key was not changed.`,
      checkedAt,
    };
  }

  if (res.status === 401) {
    return {
      status: 'rejected',
      reason: 'Roblox refused this key. It was revoked or it expired.',
      checkedAt,
    };
  }
  if (res.ok) {
    const text = await res.text().catch(() => '');
    return { status: 'ok', accountName: nameFrom(text), checkedAt };
  }
  if (res.status === 403) {
    // Alive enough to be recognised and refused for a reason other than being dead — an IP
    // allowlist on the key, or a scope Roblox records differently from what the user declared.
    return {
      status: 'unknown',
      reason: 'Roblox recognised the key but would not allow this check (403). The key itself may still work for builds.',
      checkedAt,
    };
  }
  return {
    status: 'unknown',
    reason: `Roblox answered ${res.status} to the check, which says nothing certain about the key.`,
    checkedAt,
  };
}
