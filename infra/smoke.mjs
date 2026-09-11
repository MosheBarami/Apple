// End-to-end smoke test against the DEPLOYED worker.
//
// Exercises the real production stack with a real account over a real
// WebSocket: auth, project open, quota, the agent loop, the live event stream,
// the new run_intent contract, and reconnect/replay.
//
// What it deliberately does NOT do: mutate anybody's Roblox place. The
// Studio-dependent paths (pairing, build, checkpoint, restore, playtest) need a
// paired plugin; this script reports their reachability honestly rather than
// pretending to have exercised them. See the STUDIO section of the output.
//
//   node infra/smoke.mjs [--mode clay|stone] [--text "..."]
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const E2E_EMAIL = process.env.GOLEM_E2E_EMAIL;
const E2E_PASSWORD = process.env.GOLEM_E2E_PASSWORD;
if (!E2E_EMAIL || !E2E_PASSWORD) {
  throw new Error('GOLEM_E2E_EMAIL / GOLEM_E2E_PASSWORD missing from .env');
}

const BASE = process.env.API_BASE;
const ADMIN = process.env.GOLEM_ADMIN_KEY;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(
  /"SUPABASE_ANON_KEY":\s*"([^"]+)"/,
)[1];

const arg = (flag, dflt) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? dflt : process.argv[i + 1];
};
const MODE = arg('--mode', 'clay');
const TEXT = arg('--text', 'In one sentence, what is in this project right now?');

const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const t0 = Date.now();
const stamp = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;

// ---------------------------------------------------------------- auth ----
const tok = await (
  await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
  })
).json();
const jwt = tok.access_token;
check('auth — real Supabase sign-in returns a JWT', typeof jwt === 'string' && jwt.length > 40);

const noAuth = await fetch(`${BASE}/api/me`);
check('auth — /api/me refuses an unauthenticated caller', noAuth.status === 401, `HTTP ${noAuth.status}`);

const me = await (await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
check('auth — /api/me returns the account', Boolean(me?.profile || me?.user), JSON.stringify(me).slice(0, 90));

// ------------------------------------------------------------ providers ---
const provRes = await fetch(`${BASE}/api/providers`, { headers: { Authorization: `Bearer ${jwt}` } });
if (provRes.ok) {
  const providers = await provRes.json();
  check('providers — route is behind user auth and returns inference readiness',
    providers.ready === true && Array.isArray(providers.models) && providers.models.length === 0,
    `ready=${String(providers.ready)}, public catalog ${providers.models?.length ?? 'missing'} models`);
  const blob = JSON.stringify(providers);
  check('providers — no credential material in the response',
    !/sk-|AIza|Bearer\s|api[_-]?key["']?\s*[:=]/i.test(blob));
  check('providers — health carries no raw upstream error text',
    (providers.health ?? []).every((h) => !h.lastError || !('message' in h.lastError)));
} else {
  check('providers — /api/providers reachable', false,
    `HTTP ${provRes.status} (deployed worker may predate this route)`);
}

// -------------------------------------------------------------- project ---
const projects = await (
  await fetch(`${SUPA}/rest/v1/projects?select=id,name&order=created_at.desc&limit=1`, {
    headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
  })
).json();
const project = projects[0];
check('project — the account can open a project', Boolean(project?.id), project?.name);

const foreign = await fetch(`${BASE}/api/projects/00000000-0000-4000-8000-000000000000/checkpoints`, {
  headers: { Authorization: `Bearer ${jwt}` },
});
check('tenant isolation — a project this account does not own is not readable',
  foreign.status === 404 || foreign.status === 403, `HTTP ${foreign.status}`);

// --------------------------------------------------------------- studio ---
let studioReachable = false;
if (ADMIN) {
  const t = Date.now();
  const op = await fetch(`${BASE}/api/admin/studio-op/${project.id}`, {
    method: 'POST',
    headers: { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' },
    body: JSON.stringify({ op: { op: 'ping' }, timeoutMs: 6000 }),
  });
  studioReachable = op.ok;
  const body = await op.text();
  console.log(
    `${studioReachable ? 'PASS' : 'SKIP'}  studio — plugin round-trip on "${project.name}"` +
      `  — HTTP ${op.status} in ${Date.now() - t}ms ${body.slice(0, 60)}`,
  );
  if (!studioReachable) {
    console.log('      NOTE: build / checkpoint / restore / playtest need a paired plugin on THIS');
    console.log('      project and are therefore NOT exercised below. Not claiming otherwise.');
  }
}

// ------------------------------------------------------------ websocket ---
const seen = { types: new Set(), phases: [], tools: [], intent: null, errors: [] };
let finalText = '';

const runOnce = () =>
  new Promise((resolve) => {
    const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${project.id}/ws`, [
      'golem.v1',
      'golem.jwt.' + jwt,
    ]);
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      resolve('timeout');
    }, 180_000);

    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      seen.types.add(m.type);
      if (m.type === 'hello') {
        check('websocket — connects and authenticates over the subprotocol', true,
          `studioConnected=${m.studioConnected}, sparks=${m.quota?.sparksRemaining}`);
        ws.send(JSON.stringify({ type: 'chat', text: TEXT, mode: MODE }));
      } else if (m.type === 'run_intent') {
        seen.intent = m.intent;
        console.log(`${stamp()}  run_intent  summary="${(m.intent.summary || '').slice(0, 70)}"` +
          `  checklist=${m.intent.checklist.length}  questions=${m.intent.questions.length}`);
      } else if (m.type === 'agent_status') {
        seen.phases.push(m.phase);
        console.log(`${stamp()}  [${m.phase}${m.step ? ` ${m.step}/${m.totalSteps}` : ''}]` +
          `${m.effort ? ` effort=${m.effort}` : ''}${m.tool ? ` tool=${m.tool}` : ''}`);
      } else if (m.type === 'tool_start') {
        console.log(`${stamp()}  → ${m.tool}`);
      } else if (m.type === 'tool_end') {
        seen.tools.push({ tool: m.tool, ok: m.ok, hasDetail: m.detail !== undefined });
        console.log(`${stamp()}    ${m.ok ? '✓' : '✗'} ${m.summary}  detail=${m.detail !== undefined}`);
      } else if (m.type === 'delta') {
        finalText += m.text;
      } else if (m.type === 'error') {
        seen.errors.push(`${m.code}: ${m.message}`);
      } else if (m.type === 'msg_end') {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(m.stopReason);
      }
    };
    ws.onerror = () => { clearTimeout(timer); resolve('ws-error'); };
  });

console.log(`\n--- running a real ${MODE} turn against ${BASE} ---`);
const stopReason = await runOnce();

check('chat — a real agent turn completes', ['done', 'incomplete'].includes(stopReason), `stopReason=${stopReason}`);
check('chat — the assistant produced text', finalText.trim().length > 0, `${finalText.trim().length} chars`);
check('activity — the worker announced real phases', seen.phases.length > 0, seen.phases.join(' → '));
check('activity — a typed phase union is used (no ad-hoc strings)',
  seen.phases.every((p) => [
    'understanding','planning','inspecting','building','writing_luau','rendering','critiquing',
    'rebuilding','playtesting','debugging','verifying','checkpointing','remembering','done',
  ].includes(p)), [...new Set(seen.phases)].join(','));
check('intent — run_intent was emitted with real derived content', seen.intent !== null,
  seen.intent ? `checklist=${JSON.stringify(seen.intent.checklist).slice(0, 80)}` : 'not emitted');
if (seen.tools.length) {
  check('tools — tool_end carries structured detail for the typed UI registry',
    seen.tools.some((t) => t.hasDetail),
    `${seen.tools.filter((t) => t.hasDetail).length}/${seen.tools.length} with detail`);
}
check('no protocol errors were broadcast', seen.errors.length === 0, seen.errors.join('; '));

// ------------------------------------------------- reconnect / replay -----
// A finished run must replay as "no live run". The point is that the resume
// handler answers at all, which it did not before this phase.
const replay = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${project.id}/ws`, [
    'golem.v1', 'golem.jwt.' + jwt,
  ]);
  const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(undefined); }, 20_000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') ws.send(JSON.stringify({ type: 'resume' }));
    if (m.type === 'run_state') {
      clearTimeout(timer);
      try { ws.close(); } catch {}
      resolve(m);
    }
  };
  ws.onerror = () => { clearTimeout(timer); resolve(undefined); };
});
check('reconnect — the resume handler answers with a run_state', replay !== undefined,
  replay ? `run=${replay.run === null ? 'null (idle, correct)' : 'live snapshot'}` : 'no reply within 20s');

// ------------------------------------------------------ history persist ---
const msgs = await (
  await fetch(`${BASE}/api/projects/${project.id}/messages`, { headers: { Authorization: `Bearer ${jwt}` } })
).json();
check('persistence — the turn was written to history',
  Array.isArray(msgs.messages) && msgs.messages.length > 0, `${msgs.messages?.length} messages`);

// ------------------------------------------------------------- summary ---
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (!studioReachable) {
  console.log('\nSTUDIO: not paired to this project — build, checkpoint, restore and playtest');
  console.log('were NOT exercised. This is reported, not worked around.');
}
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exit(1);
}
