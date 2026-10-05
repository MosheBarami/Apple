// Which "continue with" providers the Supabase project has switched on, so a button is drawn only for one that works.
//
// WHY THIS EXISTS. A Google or Discord button for a provider that is off at the project leads to an error page, which is
// a fake control. Both are off today (owner item N2), so today neither may render. Nothing here assumes they are off: the
// project says what is on, in `GET <SUPABASE_URL>/auth/v1/settings`, and the day the owner turns one on its button
// appears with no change to the app.
//
// THE RULES, each one a test in tests/auth-providers.test.mjs:
//   - only `external.<provider> === true` is a yes. A string, a 1, a missing key and an object are not;
//   - any failure (a network error, a non-200, a body that is not JSON, a body of the wrong shape) is "none": it fails closed;
//   - the answer is fetched once per page and shared by every screen that asks (the sign-in page, the sign-up page,
//     Settings > Connections), so three screens are one request, and a failure is not retried until the page reloads;
//   - nothing is drawn before the answer, so a button never appears and is taken away.
//
// The two hooks use only useState and useEffect, so tests/hook-harness.mjs runs them for real.
import { useEffect, useState } from 'react';
import { MOCK_MODE, mockEnabledProviders } from './mock';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config';

export const OAUTH_PROVIDERS = ['google', 'discord'] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

/** The name a person reads, on the button and on the Connections card. */
export const PROVIDER_NAME: Record<OAuthProvider, string> = { google: 'Google', discord: 'Discord' };

/** The path the project answers on. Public: the apikey header is the publishable key every page already carries. */
export const SETTINGS_PATH = '/auth/v1/settings';

/**
 * The decision: which providers does this settings document say are on? Pure, so it is tested as a function.
 * `settings` is whatever came off the wire; anything that is not an object with an `external` object says none.
 */
export function enabledProviders(settings: unknown): OAuthProvider[] {
  const external = (settings as { external?: unknown } | null | undefined)?.external;
  if (!external || typeof external !== 'object') return [];
  return OAUTH_PROVIDERS.filter((provider) => (external as Record<string, unknown>)[provider] === true);
}

/** Ask the project. Never throws; every failure is "none". */
export async function fetchEnabledProviders(fetchImpl: typeof fetch = fetch): Promise<OAuthProvider[]> {
  try {
    const res = await fetchImpl(`${SUPABASE_URL}${SETTINGS_PATH}`, {
      headers: { apikey: SUPABASE_ANON_KEY, Accept: 'application/json' },
    });
    if (!res.ok) return [];
    return enabledProviders(await res.json());
  } catch {
    return [];
  }
}

let asked: Promise<OAuthProvider[]> | null = null;

/** The page's one answer. The mock app answers without a request: no providers, unless the address asks for some. */
export function loadEnabledProviders(): Promise<OAuthProvider[]> {
  asked ??= MOCK_MODE
    ? Promise.resolve(enabledProviders({ external: Object.fromEntries(mockEnabledProviders().map((name) => [name, true])) }))
    : fetchEnabledProviders();
  return asked;
}

const NONE: readonly OAuthProvider[] = [];

/** The providers to draw. Empty until the project has answered, and for ever on any failure. */
export function useEnabledProviders(): readonly OAuthProvider[] {
  const [providers, setProviders] = useState<readonly OAuthProvider[]>(NONE);
  useEffect(() => {
    let current = true;
    void loadEnabledProviders().then((answer) => {
      if (current) setProviders(answer);
    });
    return () => {
      current = false;
    };
  }, []);
  return providers;
}
