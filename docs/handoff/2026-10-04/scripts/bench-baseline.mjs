import { readFileSync } from 'node:fs';
const root = '/Users/moshe/Developer/RbxAI/';
for (const line of readFileSync(root + '.env', 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + 'apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const BASE = 'https://apple.moshe-barami111.workers.dev';
const id = readFileSync('/Users/moshe/Developer/RbxAI/docs/handoff/2026-10-04/bench-project.txt', 'utf8').trim();
const { access_token: jwt } = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, { method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ email: process.env.GOLEM_E2E_EMAIL, password: process.env.GOLEM_E2E_PASSWORD }) })).json();
const A = { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' };
const made = await fetch(`${BASE}/api/projects/${id}/checkpoints`, { method: 'POST', headers: A, body: JSON.stringify({ label: 'bench-baseline', description: 'Clean Baseplate for the owner benchmark (2026-10-04)' }) });
console.log('checkpoint', made.status, (await made.text()).slice(0, 300));
const list = await (await fetch(`${BASE}/api/projects/${id}/checkpoints`, { headers: A })).json();
console.log((list.checkpoints || []).map((c) => `${c.label} ${c.id?.slice(0, 8)} instances=${c.instanceCount ?? c.instance_count}`).join('\n'));
