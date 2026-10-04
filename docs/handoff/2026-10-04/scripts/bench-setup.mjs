import { readFileSync, writeFileSync } from 'node:fs';
const root = '/Users/moshe/Developer/RbxAI/';
for (const line of readFileSync(root + '.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + 'apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const BASE = 'https://apple.moshe-barami111.workers.dev';
const r = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.GOLEM_E2E_EMAIL, password: process.env.GOLEM_E2E_PASSWORD }) })).json();
const jwt = r.access_token, uid = r.user.id;
const H = { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
let [p] = await (await fetch(`${SUPA}/rest/v1/projects?select=id,name&name=eq.${encodeURIComponent('Owner benchmark (E2E)')}`, { headers: H })).json();
if (!p) [p] = await (await fetch(`${SUPA}/rest/v1/projects?select=id,name`, { method: 'POST', headers: { ...H, Prefer: 'return=representation' }, body: JSON.stringify({ owner_id: uid, name: 'Owner benchmark (E2E)', description: 'Headless owner benchmark project (run.mjs). Created 2026-10-04.' }) })).json();
console.log('project', p.id, p.name);
if (process.argv.includes('--grant')) {
  const g = await fetch(`${BASE}/api/admin/grant-credits`, { method: 'POST', headers: { 'X-Admin-Key': process.env.GOLEM_ADMIN_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: uid, credits: 10000, eventId: 'owner-bench-2026-10-04' }) });
  console.log('grant', g.status, (await g.text()).slice(0, 200));
}
const pair = await (await fetch(`${BASE}/api/projects/${p.id}/pairing`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } })).json();
console.log('pairing code', pair.code, pair.expiresAt ?? '');
writeFileSync('/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/bench-project.txt', p.id);
