// Prints a fresh pairing code for the E2E project (for the real-plugin test)
import { readFileSync } from 'node:fs';
const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const BASE = process.env.API_BASE;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const { access_token: jwt } = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'e2e-test@golem.internal', password: 'golem-e2e-Passw0rd!' }),
})).json();
const projects = await (await fetch(`${SUPA}/rest/v1/projects?select=id,name&order=created_at.desc&limit=1`, {
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
})).json();
const project = projects[0];
const pair = await (await fetch(`${BASE}/api/projects/${project.id}/pairing`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } })).json();
console.log(JSON.stringify({ projectId: project.id, name: project.name, code: pair.code, jwt: jwt.slice(0, 20) + '...' }));
