import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// The E2E account's credentials come from the environment, never from source.
// They used to be inline literals in four scripts, which put a real Supabase
// password in git history. Set GOLEM_E2E_EMAIL and GOLEM_E2E_PASSWORD in .env
// (gitignored) — see docs/DECISIONS.md.
const E2E_EMAIL = process.env.GOLEM_E2E_EMAIL;
const E2E_PASSWORD = process.env.GOLEM_E2E_PASSWORD;
if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('GOLEM_E2E_EMAIL / GOLEM_E2E_PASSWORD missing from .env — this script needs the E2E account');
}
const BASE = process.env.API_BASE;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const { access_token: jwt } = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
})).json();
const pid = 'b0766f21-7028-47cc-b9ab-e19198b144d2';
const H = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
// 1. manual checkpoint via REST
const cp = await (await fetch(`${BASE}/api/projects/${pid}/checkpoints`, { method: 'POST', headers: H, body: JSON.stringify({ label: 'plaza-restore-test' }) })).json();
console.log('checkpoint:', cp.id ? `${cp.id.slice(0,8)} scripts=${cp.scriptCount} instances=${cp.instanceCount} ${(cp.sizeBytes/1024).toFixed(1)}KB` : JSON.stringify(cp));
if (!cp.id) process.exit(1);
console.log('CP_ID=' + cp.id);
