// End-to-end validation against the CREATOR STORE-INSTALLED Golem plugin.
//
// This is not a unit test and not a mock. It drives the real deployed worker,
// which dispatches real ops to the real plugin running in the operator's open
// Studio, and asserts on what actually comes back.
//
// SAFETY. Everything this script builds goes inside one clearly-named folder,
// Workspace/GolemStoreValidation, and is deleted at the end whether the run
// passes or fails. The playtest step goes through `run_and_check`, which is the
// protected path: it censuses the place, takes a checkpoint, runs, censuses
// again, and auto-restores if the run destroyed anything. That protection is
// part of what is being validated, so it is exercised rather than bypassed.
//
//   node infra/store-validation.mjs
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
for (const line of readFileSync(root + '/.env', 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const BASE = process.env.API_BASE;
const ADMIN = process.env.GOLEM_ADMIN_KEY;
const E2E_EMAIL = process.env.GOLEM_E2E_EMAIL;
const E2E_PASSWORD = process.env.GOLEM_E2E_PASSWORD;
const SUPA = 'https://npqvyijsvzkuwddyhtpm.supabase.co';
const ANON = readFileSync(root + '/apps/worker/wrangler.jsonc', 'utf8').match(
  /"SUPABASE_ANON_KEY":\s*"([^"]+)"/,
)[1];
const PID = 'b0766f21-7028-47cc-b9ab-e19198b144d2';
const FOLDER = 'GolemStoreValidation';

const H = { 'X-Admin-Key': ADMIN, 'Content-Type': 'application/json' };
const checks = [];
const check = (name, pass, detail = '') => {
  checks.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

const op = async (studioOp, timeoutMs = 30000) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/admin/studio-op/${PID}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ op: studioOp, timeoutMs }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, ms: Date.now() - t0, ...body };
};

const tool = async (name, args, timeoutMs = 180000) => {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/api/admin/run-tool/${PID}`, {
    method: 'POST',
    headers: H,
    body: JSON.stringify({ tool: name, args, timeoutMs }),
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 300) }; }
  return { status: r.status, ms: Date.now() - t0, ...body };
};

console.log('=== Creator Store plugin validation ===\n');

// -------------------------------------------------------- 1. detection ----
const info = await (await fetch(`${BASE}/api/admin/session-info/${PID}`, { headers: H })).json();
check('website detects Studio (pluginConnected)', info.pluginConnected === true,
  `project="${info.project?.name}" agent=${info.agentStatus}`);

const pong = await op({ op: 'ping' }, 15000);
check('plugin answers a real op round-trip', pong.ok === true && pong.data?.pong === true, `${pong.ms}ms`);

// ------------------------------------------------------ 2. inspection -----
const tree = await op({ op: 'get_tree', maxDepth: 3, maxNodes: 400 }, 40000);
const nodeCount = tree.data?.nodes?.length ?? tree.data?.count ?? null;
check('inspect: reads the project tree', tree.ok === true, `${tree.ms}ms, nodes=${nodeCount}`);

const scripts = await op({ op: 'list_scripts' }, 40000);
const scriptCount = Array.isArray(scripts.data?.scripts) ? scripts.data.scripts.length : null;
check('inspect: lists scripts', scripts.ok === true, `${scripts.ms}ms, scripts=${scriptCount}`);

const viewport = await op({ op: 'viewport_info' }, 20000);
check('inspect: viewport info', viewport.ok === true, `${viewport.ms}ms`);

// ------------------------------------------------- 3. checkpoint BEFORE ---
// Taken before anything is created, so the place can be put back exactly.
const cpBefore = await tool('create_checkpoint', { label: 'store-validation baseline' }, 180000);
check('checkpoint: a protective snapshot can be taken', cpBefore.status === 200,
  `${cpBefore.ms}ms ${JSON.stringify(cpBefore.result ?? cpBefore.summary ?? '').slice(0, 90)}`);

// ------------------------------------------------------ 4. safe build -----
const created = await op({
  op: 'create_instances',
  // The op field is `items`, and Paths.luau requires fully-qualified paths
  // beginning with "game." — the plugin rejects anything else, correctly.
  items: [
    { className: 'Folder', name: FOLDER, parent: 'game.Workspace' },
    {
      className: 'Part', name: 'ValidationBlock', parent: `game.Workspace.${FOLDER}`,
      properties: { Size: [4, 4, 4], Position: [0, 64, 0], Anchored: true, BrickColor: 'Bright orange' },
    },
  ],
}, 40000);
check('build: creates instances in the place', created.ok === true,
  `${created.ms}ms ${created.error ?? ''}`);

const verify = await op({
  op: 'run_code',
  code: `local f = workspace:FindFirstChild("${FOLDER}")
if not f then return "MISSING" end
local p = f:FindFirstChild("ValidationBlock")
if not p then return "NO_PART" end
return "OK size=" .. tostring(p.Size) .. " anchored=" .. tostring(p.Anchored)`,
}, 30000);
const verdict = verify.data?.result?.v;
check('build: the change is really in the DataModel',
  typeof verdict === 'string' && verdict.startsWith('OK'), String(verdict).slice(0, 80));

// --------------------------------------------- 5. protected playtest ------
// run_and_check is the safety-critical path: census -> checkpoint -> run ->
// census -> auto-restore on destructive delta. Exercising it IS the test.
const play = await tool('run_and_check', { seconds: 4 }, 240000);
const playText = JSON.stringify(play.result ?? play.summary ?? play).slice(0, 240);
check('playtest: the protected run path completes', play.status === 200, `${play.ms}ms`);
check('playtest: result returns to the website', playText.length > 2, playText);

// ------------------------------------------------------- 6. render --------
const render = await tool('render_view', { view: 'hero' }, 120000);
const rendered = JSON.stringify(render.result ?? '').slice(0, 200);
check('render: the plugin rasterises a view', render.status === 200, `${render.ms}ms ${rendered.slice(0, 120)}`);

// ------------------------------------------------- 7. survives the run ----
const after = await op({
  op: 'run_code',
  code: `return workspace:FindFirstChild("${FOLDER}") and "STILL_THERE" or "GONE"`,
}, 30000);
const afterV = after.data?.result?.v;
check('protection: the playtest did not destroy the edit DataModel', afterV === 'STILL_THERE', String(afterV));

// ----------------------------------------------------------- 8. cleanup ---
const cleanup = await op({
  op: 'run_code',
  code: `local f = workspace:FindFirstChild("${FOLDER}")
if f then f:Destroy() end
return workspace:FindFirstChild("${FOLDER}") == nil and "CLEANED" or "STILL_PRESENT"`,
}, 30000);
const cleanV = cleanup.data?.result?.v;
check('cleanup: validation artefacts removed from the place', cleanV === 'CLEANED', String(cleanV));

// -------------------------------------------- 9. user-path over the WS ----
// Everything above went through admin routes. This is the path a real user
// takes: sign in, open a WebSocket, send a message, watch the events.
const tok = await (await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
})).json();
const jwt = tok.access_token;

const seen = { phases: [], tools: [], intent: null, studioConnected: null, frames: 0 };
let text = '';
const stop = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${PID}/ws`, [
    'golem.v1', 'golem.jwt.' + jwt,
  ]);
  const timer = setTimeout(() => { try { ws.close(); } catch {} resolve('timeout'); }, 240000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') {
      seen.studioConnected = m.studioConnected;
      ws.send(JSON.stringify({
        type: 'chat', mode: 'clay',
        text: 'How many children does Workspace have right now? Use the project tree, answer in one sentence.',
      }));
    } else if (m.type === 'run_intent') seen.intent = m.intent;
    else if (m.type === 'agent_status') seen.phases.push(m.phase);
    else if (m.type === 'tool_end') seen.tools.push({ tool: m.tool, ok: m.ok, detail: m.detail !== undefined });
    else if (m.type === 'studio_frame') seen.frames += 1;
    else if (m.type === 'delta') text += m.text;
    else if (m.type === 'msg_end') { clearTimeout(timer); try { ws.close(); } catch {} resolve(m.stopReason); }
  };
  ws.onerror = () => { clearTimeout(timer); resolve('ws-error'); };
});

check('user path: the website sees Studio as connected over the WS', seen.studioConnected === true,
  `studioConnected=${seen.studioConnected}`);
check('user path: a real agent turn completes with Studio attached', stop === 'done', `stopReason=${stop}`);
check('user path: the agent used Studio tools', seen.tools.length > 0,
  seen.tools.map((t) => `${t.ok ? '✓' : '✗'}${t.tool}`).join(' '));
check('user path: the assistant answered', text.trim().length > 0, text.trim().slice(0, 100));

// ------------------------------------------------------- 10. reconnect ----
const replay = await new Promise((resolve) => {
  const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${PID}/ws`, [
    'golem.v1', 'golem.jwt.' + jwt,
  ]);
  const timer = setTimeout(() => { try { ws.close(); } catch {} resolve(undefined); }, 20000);
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.type === 'hello') ws.send(JSON.stringify({ type: 'resume' }));
    if (m.type === 'studio_status') seen.reconnectStudio = m.connected;
    if (m.type === 'run_state') { clearTimeout(timer); try { ws.close(); } catch {} resolve(m); }
  };
  ws.onerror = () => { clearTimeout(timer); resolve(undefined); };
});
check('reconnect: a fresh socket resumes and reports run state', replay !== undefined,
  replay ? `run=${replay.run === null ? 'null (idle)' : 'live'}` : 'no reply');

// ------------------------------------------------------------ summary -----
const failed = checks.filter((c) => !c.pass);
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) {
  console.log('\nFAILED:');
  for (const f of failed) console.log(`  - ${f.name}${f.detail ? ` (${f.detail})` : ''}`);
  process.exit(1);
}
