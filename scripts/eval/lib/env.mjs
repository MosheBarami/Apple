// Where the harness gets the admin key and the API base. The key is read, never printed: every error
// message the harness builds goes through `redact`, and the manifest records only whether a key was present.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { envCompat } from '../../lib/env-compat.mjs';
import { REPO_ROOT } from './dev-set.mjs';

export const DEFAULT_API_BASE = 'https://studpilot.app';

/** Parse KEY=VALUE lines (a leading `export`, quotes and `#` comments tolerated). Returns a plain object. */
export function parseEnvFile(text) {
  const out = {};
  for (const raw of String(text).split('\n')) {
    const line = raw.trim().replace(/^export\s+/, '');
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  }
  return out;
}

/**
 * The harness environment: process.env first, then the env file (`--env-file`, $STUDPILOT_ENV_FILE, or the repo's
 * own .env). API base: `--api-base`, $STUDPILOT_API_BASE, then studpilot.app. (The generic API_BASE of the owner's
 * .env is deliberately not read: it still names a former host, and a harness that silently followed it would
 * measure a different front door than the product's.)
 */
export function loadHarnessEnv({ envFile, apiBase, env = process.env, readFile = readFileSync, exists = existsSync } = {}) {
  const file = envFile ?? env.STUDPILOT_ENV_FILE ?? join(REPO_ROOT, '.env');
  const fileEnv = exists(file) ? parseEnvFile(readFile(file, 'utf8')) : {};
  const merged = { ...fileEnv, ...Object.fromEntries(Object.entries(env).filter(([, v]) => v !== undefined && v !== '')) };
  const adminKey = envCompat('STUDPILOT_ADMIN_KEY', merged) ?? '';
  return {
    adminKey,
    /** The Supabase Management API token: only `--agent studio` runs use it, to make the test user's session. */
    supabaseManagementToken: merged.SUPABASE_ACCESS_TOKEN ?? '',
    apiBase: String(apiBase ?? merged.STUDPILOT_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, ''),
    envFile: exists(file) ? file : null,
  };
}

/** Remove the key (and anything that looks like it) from text bound for a log, an error or a file. */
export function redact(text, secrets = []) {
  let out = String(text);
  for (const s of secrets) if (s && s.length >= 8) out = out.split(s).join('[redacted]');
  return out;
}
