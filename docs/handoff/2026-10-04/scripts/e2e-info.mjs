import { readFileSync } from 'node:fs';
const root = '/Users/moshe/Developer/RbxAI/';
for (const line of readFileSync(root + '.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + 'apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const r = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.GOLEM_E2E_EMAIL, password: process.env.GOLEM_E2E_PASSWORD }) })).json();
if (!r.access_token) { console.log('sign-in failed', r.error ?? r.msg ?? ''); process.exit(1); }
const userId = r.user?.id;
const projects = await (await fetch(`${SUPA}/rest/v1/projects?select=id,name,created_at&order=created_at.desc&limit=10`, { headers: { apikey: ANON, Authorization: `Bearer ${r.access_token}` } })).json();
console.log('e2e user', userId?.slice(0, 8), 'projects:'); for (const p of projects) console.log(' ', p.id, p.name, p.created_at.slice(0, 10));
const base = process.env.API_BASE || 'https://apple.moshe-barami111.workers.dev';
const me = await fetch(`${base}/api/me`, { headers: { Authorization: `Bearer ${r.access_token}` } });
console.log('api/me', me.status, (await me.text()).slice(0, 300).replace(/"email":"[^"]*"/, '"email":"…"'));
