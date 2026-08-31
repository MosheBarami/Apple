// Concurrency test against PRODUCTION with 30 real users.
// Phases: auth -> project create -> WS connect -> concurrent inference -> isolation probes.
// Usage: node infra/loadtest.mjs [userCount] [inferenceCount]
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

// The E2E account's credentials come from the environment, never from source.
// See the note in infra/real-chat.mjs and docs/DECISIONS.md.
const E2E_EMAIL = process.env.GOLEM_E2E_EMAIL;
const E2E_PASSWORD = process.env.GOLEM_E2E_PASSWORD;
// The synthetic load accounts share one password. Same rule as the E2E account:
// it lives in .env, never in the tree.
const LOAD_PASSWORD = process.env.GOLEM_LOAD_PASSWORD;
if (!LOAD_PASSWORD) {
  throw new Error('GOLEM_LOAD_PASSWORD missing from .env — the load test needs the synthetic accounts');
}
if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('GOLEM_E2E_EMAIL / GOLEM_E2E_PASSWORD missing from .env — this script needs the E2E account');
}
const BASE = process.env.API_BASE;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(/"SUPABASE_ANON_KEY":\s*"([^"]+)"/)[1];
const N = Number(process.argv[2] ?? 30);
const INFER = Number(process.argv[3] ?? 12);

const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((a, b) => a - b); return Math.round(s[Math.min(s.length - 1, Math.floor(s.length * p))]); };
const stats = (name, arr, extra = '') => console.log(`  ${name.padEnd(22)} n=${String(arr.length).padStart(3)}  p50=${pct(arr,0.5)}ms  p95=${pct(arr,0.95)}ms  max=${pct(arr,1)}ms ${extra}`);
const t = () => Date.now();

console.log(`\n=== Golem load test: ${N} concurrent users, ${INFER} concurrent inferences ===\n`);

// ---- phase 1: concurrent sign-in --------------------------------------------
console.log('[1] concurrent sign-in');
const authTimes = [], authFails = [];
const users = (await Promise.all(
  Array.from({ length: N }, (_, i) => i + 1).map(async (i) => {
    const t0 = t();
    try {
      const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
        method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: `load${i}@golem.internal`, password: LOAD_PASSWORD }),
      });
      const d = await r.json();
      if (!d.access_token) { authFails.push(`user${i}: ${d.error_description ?? d.msg ?? r.status}`); return null; }
      authTimes.push(t() - t0);
      return { i, jwt: d.access_token, id: d.user.id };
    } catch (e) { authFails.push(`user${i}: ${String(e).slice(0, 60)}`); return null; }
  })
)).filter(Boolean);
stats('auth', authTimes, `ok=${users.length}/${N}`);
if (authFails.length) console.log('   auth failures:', authFails.slice(0, 3));

// ---- phase 2: concurrent project create + /api/me ----------------------------
console.log('[2] concurrent project create + /api/me');
const projTimes = [], meTimes = [];
const projects = (await Promise.all(users.map(async (u) => {
  const t0 = t();
  const r = await fetch(`${SUPA}/rest/v1/projects`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${u.jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({ owner_id: u.id, name: `Load ${u.i}`, description: 'load test' }),
  });
  if (!r.ok) return null;
  const [p] = await r.json();
  projTimes.push(t() - t0);
  const t1 = t();
  const me = await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${u.jwt}` } });
  if (me.ok) meTimes.push(t() - t1);
  return { ...u, projectId: p.id };
}))).filter(Boolean);
stats('project create', projTimes);
stats('/api/me (worker)', meTimes);

// ---- phase 3: concurrent WebSocket connections -------------------------------
console.log('[3] concurrent WebSocket connections (all users at once)');
const wsTimes = [], wsFails = [];
const sockets = await Promise.all(projects.map((u) => new Promise((resolve) => {
  const t0 = t();
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${u.projectId}/ws`, ['golem.v1', 'golem.jwt.' + u.jwt]);
  const timer = setTimeout(() => { wsFails.push(`user${u.i}: hello timeout`); try { ws.close(); } catch {} resolve(null); }, 25000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') { clearTimeout(timer); wsTimes.push(t() - t0); resolve({ ...u, ws, quota: m.quota }); }
  };
  ws.onerror = () => { clearTimeout(timer); wsFails.push(`user${u.i}: ws error`); resolve(null); };
})));
const live = sockets.filter(Boolean);
stats('ws connect->hello', wsTimes, `ok=${live.length}/${projects.length}`);
if (wsFails.length) console.log('   ws failures:', wsFails.slice(0, 3));

// ---- phase 4: concurrent real inference --------------------------------------
console.log(`[4] ${INFER} concurrent Clay inferences (real Workers AI)`);
const inferTimes = [], firstTokenTimes = [], inferErrors = [];
await Promise.all(live.slice(0, INFER).map((u) => new Promise((resolve) => {
  const t0 = t();
  let firstDelta = null;
  const timer = setTimeout(() => { inferErrors.push(`user${u.i}: timeout`); resolve(); }, 120000);
  u.ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'delta' && firstDelta === null) { firstDelta = t() - t0; firstTokenTimes.push(firstDelta); }
    if (m.type === 'error') inferErrors.push(`user${u.i}: ${m.code}`);
    if (m.type === 'msg_end') { clearTimeout(timer); inferTimes.push(t() - t0); resolve(); }
  };
  u.ws.send(JSON.stringify({ type: 'chat', text: 'In one short sentence: what is a RemoteEvent used for in Roblox?', mode: 'clay' }));
})));
stats('inference total', inferTimes, `errors=${inferErrors.length}`);
stats('time to first text', firstTokenTimes);
if (inferErrors.length) console.log('   inference errors:', inferErrors.slice(0, 3));

// ---- phase 5: tenant isolation under load ------------------------------------
console.log('[5] tenant isolation probes (under concurrency)');
const isolation = { crossProjectRest: 0, crossProjectWs: 0, noAuth: 0, adminNoKey: 0, badPairing: 0 };
const a = live[0], b = live[1];
if (a && b) {
  // A tries B's project via REST
  const r1 = await fetch(`${BASE}/api/projects/${b.projectId}/messages`, { headers: { Authorization: `Bearer ${a.jwt}` } });
  isolation.crossProjectRest = r1.status;
  // A tries B's project via WS
  isolation.crossProjectWs = await new Promise((res) => {
    const ws = new WebSocket(`${BASE.replace('https','wss')}/api/projects/${b.projectId}/ws`, ['golem.v1', 'golem.jwt.' + a.jwt]);
    const to = setTimeout(() => res('no-response(good)'), 8000);
    ws.onmessage = (ev) => { clearTimeout(to); res('LEAK: ' + JSON.parse(ev.data).type); try { ws.close(); } catch {} };
    ws.onerror = () => { clearTimeout(to); res('rejected(good)'); };
  });
  // A tries B's checkpoints
  const r2 = await fetch(`${BASE}/api/projects/${b.projectId}/checkpoints`, { headers: { Authorization: `Bearer ${a.jwt}` } });
  isolation.crossCheckpoints = r2.status;
  // unauthenticated
  isolation.noAuth = (await fetch(`${BASE}/api/projects/${a.projectId}/messages`)).status;
  // admin without key
  isolation.adminNoKey = (await fetch(`${BASE}/api/admin/stats`)).status;
  // pairing claim with garbage code
  isolation.badPairing = (await fetch(`${BASE}/api/studio/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: 'ZZZZZZ' }) })).status;
  // A tries to read B's project row through PostgREST (RLS)
  const r3 = await fetch(`${SUPA}/rest/v1/projects?id=eq.${b.projectId}&select=id,name`, { headers: { apikey: ANON, Authorization: `Bearer ${a.jwt}` } });
  isolation.rlsRowsVisible = (await r3.json()).length;
}
for (const [k, v] of Object.entries(isolation)) console.log(`  ${k.padEnd(22)} ${v}`);

// ---- phase 6: quota enforcement ----------------------------------------------
console.log('[6] quota state after load');
if (live[0]) {
  const me = await (await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${live[0].jwt}` } })).json();
  console.log(`  user1 sparks: ${me.quota.sparksRemaining}/${me.quota.sparksDaily} (spent ${me.quota.sparksDaily - me.quota.sparksRemaining})`);
}

for (const u of live) { try { u.ws.close(); } catch {} }

const verdict = {
  users: users.length, projects: projects.length, wsOk: live.length,
  inferenceOk: inferTimes.length, inferenceErrors: inferErrors.length,
  isolationClean: isolation.crossProjectRest === 404 && isolation.noAuth === 401 && isolation.adminNoKey === 403 && isolation.rlsRowsVisible === 0 && String(isolation.crossProjectWs).includes('good'),
};
console.log('\nVERDICT:', JSON.stringify(verdict));
process.exit(verdict.isolationClean && verdict.inferenceErrors === 0 ? 0 : 1);
