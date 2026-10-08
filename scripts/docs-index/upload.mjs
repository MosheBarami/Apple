#!/usr/bin/env node
// Creates the D1 database `studpilot-docs` if missing and loads scripts/docs-index/out/*.sql into it.
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/docs-index/upload.mjs
// Locally CLOUDFLARE_API_TOKEN_MASTER is used when CLOUDFLARE_API_TOKEN is not set. Secrets are never printed.
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
const DB = 'studpilot-docs';
const env = { ...process.env };
if (!env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_API_TOKEN_MASTER) env.CLOUDFLARE_API_TOKEN = env.CLOUDFLARE_API_TOKEN_MASTER;
if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
  console.error('Set CLOUDFLARE_API_TOKEN (or CLOUDFLARE_API_TOKEN_MASTER) and CLOUDFLARE_ACCOUNT_ID.');
  process.exit(1);
}
env.CI = '1';
env.WRANGLER_SEND_METRICS = 'false';

const local = join(here, 'node_modules/.bin/wrangler');
const bin = existsSync(local) ? local : 'npx';
const base = existsSync(local) ? [] : ['--yes', 'wrangler@4.147.0'];
const wr = (...args) => execFileSync(bin, [...base, ...args], { env, encoding: 'utf8', cwd: here, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });

let list = [];
try {
  list = JSON.parse(wr('d1', 'list', '--json'));
} catch (e) {
  console.error('d1 list failed:', String(e.stderr || e.message).slice(0, 500));
  process.exit(1);
}
let db = list.find((d) => d.name === DB);
if (!db) {
  wr('d1', 'create', DB);
  db = JSON.parse(wr('d1', 'list', '--json')).find((d) => d.name === DB);
  console.log('created database');
}
console.log(`database ${DB} id=${db.uuid}`);

const files = readdirSync(out).filter((f) => /^batch-\d+\.sql$/.test(f)).sort();
if (!files.length) {
  console.error('No batches in out/. Run build.mjs first.');
  process.exit(1);
}
for (const [i, f] of files.entries()) {
  let tries = 0;
  for (;;) {
    try {
      wr('d1', 'execute', DB, '--remote', '--yes', `--file=${join(out, f)}`);
      break;
    } catch (e) {
      if (++tries >= 3) {
        console.error(`batch ${f} failed:`, String(e.stderr || e.message).slice(0, 800));
        process.exit(1);
      }
    }
  }
  console.log(`loaded ${f} (${i + 1}/${files.length})`);
}
const count = JSON.parse(wr('d1', 'execute', DB, '--remote', '--json', '--command=SELECT (SELECT count(*) FROM chunks) AS chunks, (SELECT count(*) FROM docs_fts) AS fts, (SELECT value FROM meta WHERE key=\'built_at\') AS built_at'));
console.log(JSON.stringify(count[0]?.results?.[0] ?? count));
