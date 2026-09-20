// End-to-end test against PRODUCTION: auth -> project -> pairing -> claim ->
// WS chat (clay, no studio) -> WS chat (stone, with a simulated Studio plugin).
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

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const fail = (msg) => { console.error('E2E FAIL:', msg); process.exit(1); };

// 1. sign in
const authRes = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: ANON, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!authRes.ok) fail('auth: ' + (await authRes.text()));
const { access_token: jwt, user } = await authRes.json();
log('1. signed in as', user.email);

// 2. create project (PostgREST with RLS)
const projRes = await fetch(`${SUPA}/rest/v1/projects`, {
  method: 'POST',
  headers: { apikey: ANON, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ owner_id: user.id, name: 'E2E Obby', description: 'end-to-end test project' }),
});
if (!projRes.ok) fail('project create: ' + (await projRes.text()));
const [project] = await projRes.json();
log('2. project created', project.id);

// 3. quota + me
const me = await (await fetch(`${BASE}/api/me`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
log('3. /api/me → quota', me.quota?.creditsRemaining + '/' + me.quota?.creditsDaily, 'plan', me.quota?.plan);
if (typeof me.quota?.creditsRemaining !== 'number') fail('quota shape wrong');

// 4. pairing + claim
const pairRes = await (await fetch(`${BASE}/api/projects/${project.id}/pairing`, { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } })).json();
if (!pairRes.code) fail('pairing: ' + JSON.stringify(pairRes));
log('4. pairing code', pairRes.code);
const claim = await (await fetch(`${BASE}/api/studio/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairRes.code }) })).json();
if (!claim.token) fail('claim: ' + JSON.stringify(claim));
log('   claimed → project', claim.projectName);
// reclaim must fail (single use)
const reclaim = await fetch(`${BASE}/api/studio/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code: pairRes.code }) });
if (reclaim.ok) fail('pairing code was reusable!');
log('   code single-use ✓');

// ---- simulated Studio plugin ------------------------------------------------
const FAKE_TREE = { services: [{ name: 'Workspace', class: 'Workspace', children: [{ name: 'Baseplate', class: 'Part', pos: [0, -8, 0], size: [2048, 16, 2048] }] }], nodeCount: 3 };

// THE FAKE PLUGIN USED TO ANSWER `snapshot` WITH A STUDIO THAT NO LONGER EXISTS.
//
// It returned `{ v: 1, containers: [], scripts: [], scriptCount: 0, instanceCount: 3 }` — a payload
// with no `format` field at all. `checkpointEvidence` (apps/worker/src/checkpoint-evidence.ts) keeps
// a legacy branch for snapshots that predate `apple-studio-snapshot-v1`, and that branch returns
// `{ ok: true }` without reading ONE of the flags a current plugin sends. So every green E2E run
// since the v1 format landed has said nothing whatsoever about checkpointing: the admission was
// reached, took the compatibility path, and agreed. A mock that models a client nobody ships is the
// exact failure `apps/apple-plugin/tests/studio-mock.mjs` warns about in its own header.
//
// These two payloads are the shapes the REAL plugin emits — verified field by field, from the real
// Commands.luau through the real admission, in apps/worker/tests/checkpoint-evidence-live-plugin.test.mjs.
// That test is what keeps these honest; this one is what proves the same bytes survive the network,
// the Durable Object and the HTTP boundary between them.
let snapshotMode = 'healthy';
function fakeSnapshot(op) {
  const node = { className: 'DataModel', name: 'game', protectedIdentity: true, props: {}, attributes: {}, children: [{ className: 'Workspace', name: 'Workspace', props: {}, attributes: {}, children: [] }] };
  const protectedObjects = ['Camera', 'Terrain', 'ChatWindowConfiguration', 'ChatInputBarConfiguration', 'ChannelTabsConfiguration', 'BubbleChatConfiguration']
    .map((className) => ({ path: `game.Workspace.${className}`, className, name: className, childCount: 0, descendantCount: 0, structureHash: '00000000' }));
  const base = {
    format: 'apple-studio-snapshot-v1', checkpointId: op.checkpointId, scope: 'place', root: 'game',
    node, instanceCount: 2, scriptCount: 0, sourceChars: 0,
    sourceHashAlgorithm: 'fnv1a32', includeScripts: op.includeScripts !== false,
    skipped: {}, protected: protectedObjects,
  };
  if (snapshotMode === 'depth') {
    // A place of THIRTEEN objects whose walk stopped on nesting depth, not on size. Until
    // 2026-09-21 the worker answered this with "this project is too large for one checkpoint".
    return { ...base, nodeCount: 13, complete: false, wholePlaceComplete: false, restorable: false,
      checkpointEligible: false, coverage: 'incomplete', truncated: true, truncatedBy: 'depth' };
  }
  return { ...base, nodeCount: 15, complete: false, wholePlaceComplete: false, restorable: true,
    checkpointEligible: true, coverage: 'supported-subset', truncated: false };
}
let pluginRunning = false;
let opsHandled = [];
async function pluginLoop() {
  pluginRunning = true;
  let results = [];
  let polls = 0;
  while (pluginRunning && polls < 400) {
    polls++;
    const body = { results, events: [] };
    if (polls % 10 === 1) body.state = { kind: 'state', placeName: 'E2E Place', placeId: 1, gameId: 1, isRunMode: false, selectionCount: 0, pluginVersion: '0.1.0' };
    results = [];
    const res = await fetch(`${BASE}/api/studio/poll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Golem-Token': claim.token },
      body: JSON.stringify(body),
    });
    if (!res.ok) { log('   plugin poll error', res.status); break; }
    const data = await res.json();
    for (const pending of data.ops ?? []) {
      const op = pending.studioOp;
      opsHandled.push(op.op);
      let result = { id: pending.id, ok: true, data: { ok: true } };
      if (op.op === 'get_tree') result.data = FAKE_TREE;
      else if (op.op === 'list_scripts') result.data = { scripts: [] };
      else if (op.op === 'create_instances') result.data = { created: (op.items ?? []).map((i) => `game.Workspace.${i.name}`) };
      else if (op.op === 'edit_script') result.data = { path: op.path, mode: 'replace', lines: 10 };
      else if (op.op === 'snapshot') result.data = fakeSnapshot(op);
      else if (op.op === 'get_logs') result.data = { entries: [], total: 0 };
      else if (op.op === 'run_mode') result.data = { started: op.action === 'start', stopped: op.action === 'stop' };
      else if (op.op === 'read_script') result.data = { path: op.path, source: '-- empty' };
      results.push(result);
    }
    await new Promise((r) => setTimeout(r, results.length ? 60 : Math.min(data.waitMs ?? 1000, 1200)));
  }
}

// ---- websocket chat ---------------------------------------------------------
function wsChat(text, mode, { expectTools, productModel } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE.replace('https', 'wss')}/api/projects/${project.id}/ws`, ['golem.v1', 'golem.jwt.' + jwt]);
    const events = [];
    let finalText = '';
    const timer = setTimeout(() => { ws.close(); reject(new Error('chat timeout after 150s; events: ' + events.map((e) => e.type).join(','))); }, 150_000);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      events.push(msg);
      if (msg.type === 'hello') {
        log(`   ws hello (studio=${msg.studioConnected}) → sending "${text.slice(0, 40)}…" [${mode}${productModel ? '/' + productModel : ''}]`);
        ws.send(JSON.stringify({ type: 'chat', text, mode, ...(productModel ? { productModel } : {}) }));
      }
      if (msg.type === 'delta') finalText += msg.text;
      if (msg.type === 'tool_end') log(`   tool: ${msg.summary}`);
      if (msg.type === 'error') {
        log('   ws error msg:', msg.code, msg.message);
        // A REFUSAL IS AN ANSWER. REPORTING IT AS A TIMEOUT IS A FAILURE TO OBSERVE DRESSED AS AN
        // OBSERVATION, WHICH IS THE ONE THING THIS HARNESS MUST NOT DO.
        //
        // `refuseOne` in apps/worker/src/do/session.ts sends one `error` frame and returns: no
        // `msg_end`, no `run_state`, no terminal event of any kind. Every refusal on the start path
        // does this (busy at ~2987 and ~3004, forbidden at ~3009, product_model_unavailable at
        // ~3014). So the server HAD answered, promptly and clearly, and this harness sat for the
        // full 150 seconds and then blamed a timeout — naming the wrong defect, and charging 150
        // seconds for the privilege. Measured 2026-09-20: a free account asking for Apple MAX gets
        // `product_model_unavailable` and the run never terminates on the wire.
        //
        // THIS DOES NOT WEAKEN THE ASSERTION, and must not be relaxed into one that does. A chat
        // that ends without a terminal event is still a FAILURE and still rejects here; the only
        // thing that changed is that the rejection now says what actually happened and says it at
        // once. When the worker starts emitting a terminal event after a refusal, this rejection
        // stops firing on its own, because `msg_end` will arrive first.
        //
        // `role_changed` is excluded because it is the one INFORMATIONAL use of the error channel
        // (apps/worker/src/do/session.ts, broadcastRoleChange): it tells a viewer their permissions
        // moved and refuses nothing. Treating it as fatal would invent a failure. Every other code
        // the worker can send here — busy, forbidden, quota, capacity, edit, restore, checkpoint,
        // bad_mode, bad_product_model, product_model_unavailable — is a refusal of this request.
        if (msg.code !== 'role_changed') {
          clearTimeout(timer);
          ws.close();
          reject(new Error(
            `refused with no terminal event: ${msg.code} — ${msg.message}` +
            ` (events: ${events.map((e) => e.type).join(',')})`,
          ));
          return;
        }
      }
      if (msg.type === 'msg_end') {
        clearTimeout(timer);
        ws.close();
        resolve({ finalText, events, stopReason: msg.stopReason });
      }
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(new Error('ws error: ' + (e.message ?? 'unknown'))); };
  });
}

// 5. chat without studio (clay) — should answer using knowledge/docs, no studio tools
log('5. clay chat (no studio)…');
const clay = await wsChat('In one short sentence, what does task.wait() do in Roblox Luau?', 'clay');
log('   → stopReason', clay.stopReason, '| text:', clay.finalText.slice(0, 120).replace(/\n/g, ' '));
if (clay.stopReason !== 'done' || clay.finalText.length < 10) fail('clay chat failed');

// 6. chat WITH simulated studio (stone) — agent should call studio tools
//
// `productModel: 'apple'` IS LOAD-BEARING, AND ITS ABSENCE MADE THIS STEP UNREACHABLE.
//
// `effectiveProductModel` (apps/worker/src/do/session.ts:460) reads
// `requested ?? (mode === 'clay' ? 'apple' : 'apple-max')`, so a `stone` chat that names no product
// model is a request for **Apple MAX**, which `productModelVerdict` refuses on any free plan. The
// E2E account is free — step 3 above prints `plan free` on every run — so since product-model
// entitlement landed this step asked for something this account can never have, and the run died
// here before reaching the assertion below. Measured against the live worker 2026-09-20T23:19Z:
// `product_model_unavailable — Apple MAX requires a paid subscription.`
//
// THIS DOES NOT WEAKEN THE STEP, and it is worth being exact about why. What is being tested here
// is named on the line above: *the agent calls Studio tools*, asserted at the bottom of this block
// against `opsHandled`. That assertion is untouched. The mode stays `stone`, so the toolset is the
// build toolset; only the FOUNDATION changes, and on the free lane `gatewayModelFor('stone','apple')`
// is still `stone` — the same model, by the measurement in session.ts:464. What the free lane
// actually gives up is steps (`maxStepsFor` caps it at Plan's limit), which is a smaller budget for
// the same work, not a different test. A step that cannot run asserts nothing at all; this one can.
//
// If MAX entitlement itself needs covering, that is a separate step with a paid fixture account —
// do not get it by removing this one's product model again.
log('6. starting fake plugin loop + stone chat…');
pluginLoop();
await new Promise((r) => setTimeout(r, 2500)); // let first poll register
const stone = await wsChat('Create a glowing neon blue anchored part named BeaconTower, 4x30x4 studs, at position (10, 15, 10) in the workspace. Then confirm what you created.', 'stone', { expectTools: true, productModel: 'apple' });

// 6b. CHECKPOINTING, OVER THE WIRE, WITH THE ADMISSION LIVE.
//
// The fake plugin is still polling here on purpose — `pluginRunning = false` is deliberately below
// this block, because `createCheckpoint` refuses outright when no plugin is connected and a refusal
// for the wrong reason would look exactly like a pass.
const checkpointPost = (label) => fetch(`${BASE}/api/projects/${project.id}/checkpoints`, {
  method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ label, description: 'e2e' }),
}).then((r) => r.json());

const saved = await checkpointPost('e2e healthy');
if (saved.error) fail('a healthy current-format snapshot was refused: ' + saved.error);
if (saved.coverage !== 'supported-subset') fail('checkpoint lost the coverage Studio reported: ' + JSON.stringify(saved));
if (saved.preservedObjects !== 6) fail('checkpoint lost the protected-object count: ' + JSON.stringify(saved));
log('6b. checkpoint saved', saved.id, '| coverage', saved.coverage, '| preserved', saved.preservedObjects);

// The refusal half. This is the assertion the whole cause-naming exists for, and it is made against
// the deployed worker rather than against the function in this repository. If this worker predates
// 2026-09-21 it will say "too large" about a thirteen-object place and this step will say so.
snapshotMode = 'depth';
const refused = await checkpointPost('e2e nested');
snapshotMode = 'healthy';
if (!refused.error) fail('a truncated snapshot was saved as a checkpoint: ' + JSON.stringify(refused));
if (!/nests objects deeper/.test(refused.error)) fail('a depth-bounded walk was not named as one: ' + refused.error);
if (/too large|more objects than/.test(refused.error)) fail('a thirteen-object place was called too large: ' + refused.error);
log('6c. nested place refused by its own cause ✓');

const listed = await (await fetch(`${BASE}/api/projects/${project.id}/checkpoints`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
const rows = listed.checkpoints ?? listed;
if (!Array.isArray(rows) || !rows.some((row) => row.id === saved.id)) fail('saved checkpoint is not in the listing: ' + JSON.stringify(listed).slice(0, 300));
if (rows.some((row) => row.label === 'e2e nested')) fail('a refused checkpoint was listed anyway');
log('6d. listing holds the saved checkpoint and not the refused one ✓');

pluginRunning = false;
log('   → stopReason', stone.stopReason, '| studio ops handled by fake plugin:', JSON.stringify(opsHandled));
log('   → reply:', stone.finalText.slice(0, 200).replace(/\n/g, ' '));
if (!opsHandled.includes('create_instances') && !opsHandled.includes('run_code')) fail('agent never tried to build anything in studio');

// 7. history + checkpoints listing
const msgs = await (await fetch(`${BASE}/api/projects/${project.id}/messages`, { headers: { Authorization: `Bearer ${jwt}` } })).json();
log('7. message history:', msgs.messages?.length, 'messages persisted');
if (!msgs.messages || msgs.messages.length < 4) fail('history not persisted');

// 8. tenant isolation probe: second user cannot access this project
const probe = await fetch(`${BASE}/api/projects/${project.id}/messages`);
if (probe.status !== 401) fail('unauthenticated access not rejected');
log('8. unauthenticated access → 401 ✓');

log('E2E PASS');
process.exit(0);
