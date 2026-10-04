// Environment variables moved from the old product prefix to APPLE_. The secrets in the owner's
// .env and in CI still carry the old names until the runbook switches them
// (docs/operations/GOLEM-REMOVAL-RUNBOOK.md, step C9), so every script reads the NEW name first and
// falls back to the old one. This is the one place the old prefix is spelled for the Node scripts:
// callers write `envCompat('APPLE_ADMIN_KEY')` and never name the old variable themselves.
//
// REMOVAL: phase D deletes the fallback line, and the guard's allowlist entry for this file with it.

const LEGACY_PREFIX = 'GOLEM_';
const PREFIX = 'APPLE_';

/** The old spelling of an APPLE_ variable name, or null for a name that never had one. */
export function legacyEnvName(name) {
  return name.startsWith(PREFIX) ? LEGACY_PREFIX + name.slice(PREFIX.length) : null;
}

/**
 * `env[name]`, falling back to the old spelling when the new one is unset or empty. Returns what a
 * plain `process.env.X` read returns: a string, or undefined when neither is set.
 */
export function envCompat(name, env = process.env) {
  const value = env[name];
  if (value !== undefined && value !== '') return value;
  const old = legacyEnvName(name);
  if (old === null) return value;
  return env[old] !== undefined ? env[old] : value;
}
