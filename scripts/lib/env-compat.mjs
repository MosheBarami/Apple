// Environment variables moved from the product's former prefixes to STUDPILOT_. The secrets in the
// owner's .env and in CI still carry an old name (on 2026-10-04 the owner's .env had only GOLEM_
// keys), so every script reads the NEW name first and falls back to the older ones, newest first.
// This is the one place the old prefixes are spelled for the Node scripts: callers write
// `envCompat('STUDPILOT_ADMIN_KEY')` and never name an old variable themselves.
//
// REMOVAL: when .env and CI carry only STUDPILOT_ names, delete the fallback and the allowlist line
// for this file (planning/rename-allowlist.txt).

const PREFIX = 'STUDPILOT_';
const LEGACY_PREFIXES = ['APPLE_', 'GOLEM_'];

/** The old spellings of a STUDPILOT_ variable name, newest first; empty for a name that never had one. */
export function legacyEnvNames(name) {
  return name.startsWith(PREFIX) ? LEGACY_PREFIXES.map((p) => p + name.slice(PREFIX.length)) : [];
}

/** The newest old spelling, or null (kept for callers written for the one-step fallback). */
export function legacyEnvName(name) {
  return legacyEnvNames(name)[0] ?? null;
}

/**
 * `env[name]`, falling back to the old spellings when the new one is unset or empty. Returns what a
 * plain `process.env.X` read returns: a string, or undefined when none is set.
 */
export function envCompat(name, env = process.env) {
  const value = env[name];
  if (value !== undefined && value !== '') return value;
  for (const old of legacyEnvNames(name)) {
    if (env[old] !== undefined && env[old] !== '') return env[old];
  }
  return value;
}
