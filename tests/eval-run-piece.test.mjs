/**
 * scripts/eval/run-piece.mjs, RUN END TO END against a stand-in Studio MCP server (tests/fixtures/eval/fake-studio-mcp.mjs)
 * and a scripted admin API, with a fake clock so the waits cost nothing.
 *
 * What this proves: the ORCHESTRATION. The steps run in order and are timed; a dry run starts no run and grants no
 * credit; a real run sends the request text exactly as written and polls to the end; the hard timeout stops the run;
 * every refusal (no place, no plugin, spend ceiling, a place that will not reset clean) stops BEFORE anything is spent;
 * the folder holds the files the handoff names with their sha256; the admin key never reaches a file.
 * What it cannot prove: how real Studio answers (picture format and size, play-mode capture, the real Luau). The first
 * live dry run is that check, and the Luau logic has its own test (eval-world-state.test.mjs).
 *
 * Run with:  node --test tests/eval-run-piece.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initBaseline, runPiece, resolveOptions, INTERNAL_PER_CREDIT, DEFAULT_PROJECT, DEFAULT_USER, Abort } from '../scripts/eval/run-piece.mjs';
import { StudioMcpClient } from '../scripts/eval/lib/studio-mcp.mjs';
import { getRequest } from '../scripts/eval/lib/dev-set.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FAKE = join(HERE, 'fixtures', 'eval', 'fake-studio-mcp.mjs');
const ADMIN_KEY = 'test-admin-key-do-not-leak-0123456789';

function clock() {
  let t = Date.parse('2026-10-05T12:00:00.000Z');
  return { now: () => t, sleep: async (ms) => { t += ms; } };
}

/** A scripted admin API. `runPolls` is how many session-info polls say "running" after the run starts. */
function fakeApi(o = {}) {
  const calls = [];
  const s = { running: false, polls: 0, runPolls: o.runPolls ?? 2, messages: o.messages ?? 4, ...o };
  const rec = (name, ...args) => calls.push({ name, args });
  return {
    base: 'https://fake.test',
    calls,
    health: async () => (rec('health'), { ok: true, buildSha: 'abc12345', time: '2026-10-05T12:00:00Z' }),
    spend: async () => (rec('spend'), { state: { killed: false, estimatedMonthUsd: o.monthUsd ?? 3.9, monthBillableNeurons: 1, ...(o.spendState ?? {}) } }),
    sessionInfo: async () => {
      rec('sessionInfo');
      if (s.running && o.failInfo) {
        s.infoCalls = (s.infoCalls ?? 0) + 1;
        const f = o.failInfo(s.infoCalls);
        if (f) throw Object.assign(new Error(f.message ?? `GET /api/admin/session-info/x: HTTP ${f.status}`), { status: f.status });
      }
      if (s.running) {
        s.polls++;
        if (o.neverEnds || s.polls <= s.runPolls) return { project: { name: 'Bench' }, agentStatus: 'running', messages: s.messages, pluginConnected: true };
        s.running = false;
        s.messages += 2;
      }
      return {
        project: { id: DEFAULT_PROJECT, name: 'Bench' }, agentStatus: o.agentStatus ?? 'idle', paused: null, messages: s.messages,
        pluginConnected: o.pluginConnected ?? true, queuedOps: 0, link: { paired: true, connected: true, pluginVersion: '1.5.0' },
        openPlace: { placeName: 'EvalBaseplate', placeId: 0, gameId: 0, isRunMode: false },
      };
    },
    account: async () => (rec('account'), { quota: { plan: 'free', creditsRemaining: calls.some((c) => c.name === 'agentRun') ? 5000 : 6000, creditsUsedToday: 10, creditsUsedThisMonth: 100, allowanceRemaining: 700, credits: 5000 } }),
    setPlan: async (...a) => (rec('setPlan', ...a), { ok: true }),
    grantCredits: async (...a) => (rec('grantCredits', ...a), { status: o.grantStatus ?? 200, json: { ok: true, granted: a[1] } }),
    agentRun: async (...a) => {
      rec('agentRun', ...a);
      if (o.runStatus) return { status: o.runStatus, json: { ok: false, error: 'refused', code: 'account_not_approved' } };
      s.running = true;
      s.polls = 0;
      return { status: 200, json: { ok: true, started: true } };
    },
    agentStop: async (...a) => {
      rec('agentStop', ...a);
      if (o.stopFails) throw new Error('POST /api/admin/agent-stop/x: HTTP 500 boom');
      if (!o.stopIgnored) s.running = false;
      return { ok: true };
    },
    conversationReset: async (...a) => {
      rec('conversationReset', ...a);
      if (o.conversationStatus) return { status: o.conversationStatus, json: { ok: false, error: o.conversationStatus === 403 ? 'owner mismatch: that user does not own this project' : 'a run is in progress' } };
      s.messages = o.conversationLeaves ?? 0;
      return { status: 200, json: { ok: true, removedMessages: 4, messagesAfter: s.messages, memoryCleared: true, planCleared: false, ledgerCleared: true } };
    },
    messages: async () => (rec('messages'), { messages: o.transcript ?? [
      { id: 'u1', role: 'user', content: o.userEcho ?? getRequest('U01').text, createdAt: 'x' },
      { id: 'a1', role: 'assistant', content: 'I built the shop.\n\nIt has 6 eggs.', stopReason: o.stopReason ?? 'done', creditsSpent: 270, createdAt: 'y',
        toolTrace: [{ tool: 'build_ui', summary: 'made ShopGui', ok: true, durationMs: 1200 }, { tool: 'edit_script', summary: 'x', ok: false, durationMs: 5, error: 'refused' }] },
    ] }),
  };
}

function deps(api, scenario = {}, extra = {}) {
  const c = clock();
  const logFile = join(mkdtempSync(join(tmpdir(), 'eval-fake-log-')), 'calls.jsonl');
  const logs = [];
  return {
    ...c,
    log: (m) => logs.push(m),
    logs,
    adminKey: ADMIN_KEY,
    api,
    studioCalls: () => (existsSync(logFile) ? readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
    openStudio: () => new StudioMcpClient({
      command: process.execPath,
      args: [FAKE],
      callTimeoutMs: extra.callTimeoutMs ?? 20_000,
      spawnImpl: (cmd, args, o) => spawn(cmd, args, { ...o, env: { ...process.env, FAKE_STUDIO: JSON.stringify(scenario), FAKE_STUDIO_LOG: logFile } }),
    }).start(),
    devSetPath: undefined,
  };
}

function setup(extraOpts = {}) {
  const proofRoot = mkdtempSync(join(tmpdir(), 'eval-proof-'));
  const opts = { ...resolveOptions(['U01', '--milestone', 'MT', '--proof-root', proofRoot]), env: {}, ...extraOpts };
  return { proofRoot, opts };
}

async function withBaseline(opts, scenario = {}) {
  const d = deps(fakeApi(), scenario);
  const r = await initBaseline(opts, d);
  return r;
}

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const read = (dir, name) => readFileSync(join(dir, name), 'utf8');
const stepNames = (r) => r.timing.steps.map((s) => s.name);

test('--init-baseline records the pristine place and refuses a place that is not a Baseplate', async () => {
  const { opts } = setup();
  const r = await withBaseline(opts);
  assert.ok(existsSync(opts.baselineFile));
  assert.equal(r.instances, 2);
  assert.equal(JSON.parse(read(dirname(opts.baselineFile), 'place-baseline.json')).inventory.Workspace.length, 2);
  // a place with no Studio open at all
  await assert.rejects(withBaseline({ ...opts, baselineFile: join(tmpdir(), 'never-written.json') }, { noPlace: true }), /no Studio has a place open/);
});

test('A DRY RUN resets, captures the empty Baseplate and play-tests it; it starts no run and grants no credit', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const api = fakeApi({ pluginConnected: false });
  const d = deps(api, { removed: 0 });
  const r = await runPiece(opts, d);
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'measure', 'captures', 'play-test']);
  assert.deepEqual(api.calls.map((c) => c.name).filter((n) => ['agentRun', 'grantCredits', 'setPlan', 'agentStop'].includes(n)), [], 'a dry run spends nothing');
  assert.equal(r.manifest.plugin.connected, false);
  assert.match(d.logs.join('\n'), /plugin is not connected.*Continuing/s, 'the missing plugin is reported plainly');
  assert.equal(r.manifest.build.kind, 'none');
  // the empty Baseplate is photographed with the four world cameras, and a three-frame play strip
  assert.deepEqual(r.manifest.captures.map((c) => c.name), ['overview', 'three-quarter', 'close-up', 'spawn-eye']);
  assert.equal(r.manifest.playTest.frames.length, 3);
  assert.equal(r.manifest.playTest.errors, 0);
  assert.equal(r.manifest.playTest.backInEdit, true);
  // the files
  for (const f of ['request.txt', 'reply.md', 'steps.json', 'credits.json', 'timing.json', 'console.txt', 'manifest.json']) assert.ok(existsSync(join(r.pieceDir, f)), f);
  assert.equal(read(r.pieceDir, 'request.txt'), `${getRequest('U01').text}\n`);
  assert.match(read(r.pieceDir, 'reply.md'), /dry run/);
  assert.deepEqual(readdirSync(join(r.pieceDir, 'shots')).sort(), ['close-up.png', 'overview.png', 'play-1.png', 'play-2.png', 'play-3.png', 'spawn-eye.png', 'three-quarter.png']);
  // the manifest's sha256 are the files'
  for (const [name, meta] of Object.entries(r.manifest.files)) assert.equal(meta.sha256, sha(join(r.pieceDir, name)), name);
  assert.equal(r.manifest.deploy.buildSha, 'abc12345');
  assert.deepEqual(r.manifest.functionalChecks, { defined: false });
  assert.equal(r.manifest.request.devSetSha256.length, 64);
  assert.ok(r.timing.steps.every((s) => typeof s.ms === 'number' && s.startedAt));
});

test('the Studio calls come in the order the handoff names: reset, then captures, then the play test, stopping play at the end', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const d = deps(fakeApi({ pluginConnected: false }));
  await runPiece(opts, d);
  const tools = d.studioCalls().map((c) => c.tool);
  const first = (t) => tools.indexOf(t);
  assert.ok(first('execute_luau') < first('screen_capture'), 'the place is reset before anything is photographed');
  assert.ok(first('screen_capture') < first('start_stop_play'), 'the world is photographed before the play test');
  const plays = d.studioCalls().filter((c) => c.tool === 'start_stop_play').map((c) => c.args.is_start);
  assert.deepEqual(plays, [true, false], 'play is started once and stopped once');
});

test('A REAL RUN: credits are set, the request goes in exactly as written, the run is polled to its end, the reply and steps are saved', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ runPolls: 3 });
  const d = deps(api, { world: { min: [0, 0, 0], max: [20, 8, 12] }, removed: 7 });
  const r = await runPiece(opts, d);
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'conversation', 'credits', 'agent-run', 'messages', 'credits-after', 'measure', 'captures', 'play-test']);
  const run = api.calls.find((c) => c.name === 'agentRun');
  assert.deepEqual(run.args, [DEFAULT_PROJECT, { text: getRequest('U01').text }], 'the text is sent exactly as written and nothing else');
  const grant = api.calls.find((c) => c.name === 'grantCredits');
  assert.equal(grant.args[0], DEFAULT_USER);
  assert.match(grant.args[2], /^eval-MT-U01-\d{14}$/, 'one grant per run, keyed by milestone, request and time');
  assert.equal(api.calls.filter((c) => c.name === 'grantCredits').length, 1);
  assert.equal(api.calls.find((c) => c.name === 'setPlan').args[1], 'free');
  assert.ok(api.calls.findIndex((c) => c.name === 'grantCredits') < api.calls.findIndex((c) => c.name === 'agentRun'), 'credits before the run');
  assert.equal(r.manifest.run.endedBy, 'done');
  assert.equal(r.manifest.run.stopReason, 'done');
  assert.equal(r.manifest.run.requestEchoed, true);
  assert.equal(r.manifest.reset.removedInstances, 7);
  assert.equal(r.manifest.reset.clean, true);
  assert.match(read(r.pieceDir, 'reply.md'), /I built the shop\./);
  const steps = JSON.parse(read(r.pieceDir, 'steps.json'));
  assert.equal(steps.count, 2);
  assert.equal(steps.failed, 1);
  assert.deepEqual(steps.byTool, { build_ui: 1, edit_script: 1 });
  const credits = JSON.parse(read(r.pieceDir, 'credits.json'));
  assert.equal(credits.spentLedger, 270);
  assert.equal(credits.spentCredits, Math.round((270 / INTERNAL_PER_CREDIT) * 100) / 100, 'a displayed credit is 150 ledger units');
  assert.equal(credits.balanceDeltaLedger, 1000, 'the balance moved by what the fake account says');
  assert.equal(credits.grant.amountLedger, 3000);
  assert.ok(r.manifest.spend.before && r.manifest.spend.after, 'spend is read before and after');
  // a world piece is photographed with cameras computed from its bounds
  assert.equal(r.manifest.build.kind, 'world');
  assert.deepEqual(r.manifest.build.cameraPlan.bounds, { min: [0, 0, 0], max: [20, 8, 12] });
  assert.ok(r.manifest.run.minutes > 0);
});

test('a UI piece is captured at the size Studio really has, named by those pixels, never claiming a target it did not get', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  for (const [size, target, file] of [[[1920, 1080], '1920x1080', 'ui-1920x1080.png'], [[1000, 600], null, 'ui-1000x600.png']]) {
    const d = deps(fakeApi({ pluginConnected: false }), { ui: true, size });
    const r = await runPiece({ ...opts, overwrite: true }, d);
    assert.equal(r.manifest.build.kind, 'ui');
    assert.deepEqual(r.manifest.captures.map((c) => c.name), ['ui'], 'a UI-only piece gets the UI picture and no world cameras');
    assert.ok(existsSync(join(r.pieceDir, 'shots', file)), `${file} was not written`);
    assert.equal(r.manifest.ui.met, target);
    assert.equal(r.manifest.ui.captured, `${size[0]}x${size[1]}`);
    if (!target) assert.match(r.manifest.ui.note, /not a target size/);
    else assert.match(r.manifest.ui.note, /other was not captured/);
  }
});

test('a piece with both a world and a UI gets the four world cameras and the UI picture; an empty ScreenGui is not a UI', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const both = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { ui: true, world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(both.manifest.build.kind, 'both');
  assert.deepEqual(both.manifest.captures.map((c) => c.name), ['overview', 'three-quarter', 'close-up', 'spawn-eye', 'ui']);
  const emptyOnly = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { emptyGui: true }));
  assert.equal(emptyOnly.manifest.build.kind, 'none');
  assert.deepEqual(emptyOnly.manifest.build.emptyScreenGuis, ['EmptyGui']);
});

test('PLAY TEST: errors from the console and from the typed log are both counted, and the larger one is used', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const clean = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), {}));
  assert.equal(clean.manifest.playTest.errors, 0);
  const consoleOnly = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { playConsole: ['Workspace.Script:3: attempt to index nil with "Name"', 'Stack Begin', 'Script x, Line 3', 'Stack End'] }));
  assert.equal(consoleOnly.manifest.playTest.errors, 1, 'a stack block belongs to the error above it');
  assert.match(read(consoleOnly.pieceDir, 'console.txt'), /attempt to index nil/);
  const typed = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { serverErrors: 2, clientErrors: 1 }));
  assert.equal(typed.manifest.playTest.errors, 3);
});

test('play frames that cannot be captured are recorded as such; the run does not fail on them', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const r = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { captureFailsInPlay: true }));
  assert.equal(r.ok, true);
  assert.equal(r.manifest.playTest.frames.every((f) => f.file === null && /edit time/.test(f.error)), true);
  assert.equal(r.manifest.playTest.backInEdit, true);
});

test('THE HARD TIMEOUT: a run still going after the limit is stopped, and the piece says it timed out', async () => {
  const { opts } = setup({ timeoutMinutes: 15 });
  await withBaseline(opts);
  const api = fakeApi({ neverEnds: true });
  const d = deps(api, {});
  const r = await runPiece(opts, d);
  assert.ok(api.calls.some((c) => c.name === 'agentStop'), 'agent-stop was sent');
  assert.equal(r.manifest.run.endedBy, 'timeout');
  // by the timeout itself, not by the fallback that stops any run still live at the end: the reason says which
  assert.match(r.manifest.run.stop.reason, /the run passed 15 minutes/);
  assert.equal(r.manifest.run.stop.requested, true);
  assert.equal(r.manifest.run.stop.idle, true);
  assert.ok(r.manifest.run.minutes >= 15, `waited ${r.manifest.run.minutes} minutes`);
});

test('a run that the worker refuses (409 busy, 403 not approved) stops the piece before anything else is measured', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  for (const [status, pattern] of [[409, /already has a run/], [403, /account_not_approved/]]) {
    const r = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ runStatus: status }), {}));
    assert.equal(r.ok, false);
    assert.equal(r.manifest.aborted.step, 'agent-run');
    assert.match(r.manifest.aborted.message, pattern);
    assert.equal(stepNames(r).includes('captures'), false);
  }
});

test('REFUSALS BEFORE ANYTHING IS SPENT: no place, plugin not paired, spend at the ceiling, a run in progress, no baseline file', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const cases = [
    ['no place open', fakeApi(), { noPlace: true }, /no Studio has a place open/],
    ['plugin not connected', fakeApi({ pluginConnected: false }), {}, /plugin is not connected/],
    ['spend at the ceiling', fakeApi({ monthUsd: 20.5 }), {}, /test ceiling/],
    ['kill switch', fakeApi({ spendState: { killed: true, killedReason: 'cap' } }), {}, /kill switch/],
    ['run in progress', fakeApi({ agentStatus: 'running' }), {}, /already in progress/],
  ];
  for (const [label, api, scenario, pattern] of cases) {
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, scenario));
    assert.equal(r.ok, false, label);
    assert.equal(r.manifest.aborted.step, 'preflight', label);
    assert.match(r.manifest.aborted.message, pattern, label);
    assert.equal(api.calls.some((c) => ['grantCredits', 'agentRun', 'setPlan'].includes(c.name)), false, `${label}: nothing may be spent`);
  }
  const noBaseline = await runPiece({ ...opts, overwrite: true, baselineFile: join(tmpdir(), 'no-such-baseline.json') }, deps(fakeApi(), {}));
  assert.match(noBaseline.manifest.aborted.message, /--init-baseline/);
});

test('a place that will not reset clean stops the piece, with a sample of what is left, before credits are granted', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi();
  const r = await runPiece(opts, deps(api, { stuckDirty: true }));
  assert.equal(r.manifest.aborted.step, 'reset');
  assert.match(r.manifest.aborted.message, /not clean after the reset \(1 extra, 0 missing, 0 changed\): extra Workspace\/Junk#Part/);
  assert.equal(r.manifest.reset.clean, false);
  assert.equal(api.calls.some((c) => c.name === 'grantCredits'), false);
});

test('a folder that already holds a run is not overwritten unless asked; then the old one is moved aside, not deleted', async () => {
  const { opts, proofRoot } = setup({ dryRun: true });
  await withBaseline(opts);
  const first = await runPiece(opts, deps(fakeApi({ pluginConnected: false }), {}));
  await assert.rejects(runPiece(opts, deps(fakeApi({ pluginConnected: false }), {})), (e) => e instanceof Abort && /already holds a run/.test(e.message));
  const again = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), {}));
  const kids = readdirSync(join(proofRoot, 'MT'));
  assert.ok(kids.some((k) => k.startsWith('U01.prev-')), `the old run was kept: ${kids}`);
  assert.equal(again.pieceDir, first.pieceDir);
});

test('THE ADMIN KEY NEVER REACHES A FILE OR A LOG LINE', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi();
  api.agentRun = async () => { throw new Error(`POST failed with header X-Admin-Key: ${ADMIN_KEY}`); };
  const d = deps(api, {});
  const r = await runPiece(opts, d);
  assert.equal(r.manifest.aborted.step, 'agent-run');
  for (const entry of readdirSync(r.pieceDir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const p = join(entry.parentPath ?? entry.path, entry.name);
    if (/\.(png|jpg)$/.test(p)) continue;
    assert.equal(readFileSync(p, 'utf8').includes(ADMIN_KEY), false, `${p} holds the admin key`);
  }
  assert.equal(d.logs.join('\n').includes(ADMIN_KEY), false, 'the log holds the admin key');
  assert.equal(JSON.stringify(r.manifest).includes(ADMIN_KEY), false);
});

test('the defaults are the test account and project, and the ledger unit matches packages/shared', () => {
  assert.equal(DEFAULT_USER, '8722e4df-ab9c-47f6-8a57-02f5a5dd1d44');
  assert.equal(DEFAULT_PROJECT, '1ea443f2-6232-43c1-a8bd-f425e2df4f4d');
  const shared = readFileSync(join(HERE, '..', 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.equal(Number(/export const INTERNAL_PER_CREDIT = (\d+);/.exec(shared)[1]), INTERNAL_PER_CREDIT, 'credits are displayed at 1 per this many ledger units');
});

test('option parsing: one request id, known flags only, sane numbers', () => {
  assert.throws(() => resolveOptions([]), /usage/);
  assert.throws(() => resolveOptions(['U01', '--bogus']), /unknown flag/);
  assert.throws(() => resolveOptions(['U01', '--timeout-minutes', '0']), /positive/);
  assert.throws(() => resolveOptions(['U01', '--milestone', '../x']), /not a folder name/);
  const o = resolveOptions(['u01', '--dry-run', '--milestone', 'M3-dry']);
  assert.equal(o.requestId, 'u01');
  assert.equal(o.dryRun, true);
  assert.equal(o.timeoutMinutes, 15);
  assert.equal(o.maxMonthUsd, 20);
});

// =====================================================================================================================
// What a failing poll does to the agent, and the other things the first review found.

const calls = (api, ...names) => api.calls.filter((c) => names.includes(c.name));
const unavailable = (n) => ({ status: 503, message: `GET /api/admin/session-info/x: HTTP 503 try ${n}` });

test('A STATUS POLL THAT FAILS ONCE IS RETRIED: the run is not abandoned for a transient 503 or a timeout', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // the second and third status reads of the run fail (a 503, then no answer at all), and the run still finishes
  const api = fakeApi({ runPolls: 4, failInfo: (n) => (n === 2 ? { status: 503 } : n === 3 ? { status: undefined, message: 'GET /api/admin/session-info/x: no answer in 30000 ms' } : null) });
  const d = deps(api, { world: { min: [0, 0, 0], max: [4, 4, 4] } });
  const r = await runPiece(opts, d);
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  assert.equal(r.manifest.run.endedBy, 'done');
  assert.equal(calls(api, 'agentStop').length, 0, 'a run that finished is not stopped');
  assert.equal(r.manifest.run.stop, undefined);
  assert.match(d.logs.join('\n'), /session-info failed \(try 1 of 4\).*HTTP 503.*trying again/s);
});

test('A STATUS POLL THAT KEEPS FAILING STOPS THE RUN, and the manifest says it was stopped, why, and whether it went idle', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // every status read after the run started fails with a 503: the harness cannot see the run, so it stops it
  const api = fakeApi({ neverEnds: true, failInfo: () => null });
  let failing = false;
  let failed = 0;
  const realInfo = api.sessionInfo;
  api.sessionInfo = async (...a) => {
    if (failing) { failed++; throw Object.assign(new Error('GET /api/admin/session-info/x: HTTP 503 down'), { status: 503 }); }
    return realInfo(...a);
  };
  const realRun = api.agentRun;
  api.agentRun = async (...a) => { const res = await realRun(...a); failing = true; return res; };
  const realStop = api.agentStop;
  api.agentStop = async (...a) => { const res = await realStop(...a); failing = false; return res; }; // the API is back once the stop lands
  const r = await runPiece(opts, deps(api, {}));
  assert.equal(r.ok, false);
  assert.equal(r.manifest.aborted.step, 'agent-run');
  assert.match(r.manifest.aborted.message, /status could not be read.*HTTP 503.*stopped and is idle/s);
  assert.equal(calls(api, 'agentStop').length, 1, 'agent-stop was sent');
  assert.equal(r.manifest.run.endedBy, 'poll-failed');
  assert.equal(r.manifest.run.stop.requested, true);
  assert.equal(r.manifest.run.stop.idle, true);
  assert.match(r.manifest.run.stop.reason, /status could not be read/);
  assert.equal(failed, 4, 'the poll was tried four times before the run was given up on');
});

test('A POLL ERROR THAT NO RETRY CAN FIX (a 401) still stops the run; a stop that fails or is not confirmed is recorded, not hidden', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ neverEnds: true, failInfo: () => ({ status: 401, message: 'GET /api/admin/session-info/x: HTTP 401 admin key refused' }), stopFails: true });
  const d = deps(api, {});
  const r = await runPiece(opts, d);
  assert.doesNotMatch(d.logs.join('\n'), /trying again/, 'a 401 is not retried: another try cannot fix it');
  assert.equal(r.manifest.aborted.step, 'agent-run');
  assert.equal(calls(api, 'agentStop').length, 2, 'the stop was tried when the poll gave up, and once more at the end because the run was never confirmed idle');
  assert.equal(r.manifest.run.stop.requested, false);
  assert.match(r.manifest.run.stop.error, /HTTP 500 boom/);
  assert.equal(r.manifest.run.stop.idle, false);
  assert.match(r.manifest.aborted.message, /NOT confirmed idle: stop it by hand/);
  assert.equal(calls(api, 'sessionInfo').filter((c) => true).length < 400, true, 'a 401 is not retried four times per poll forever');
});

test('ANY OTHER WAY OUT with the run live stops it too: an exception in the harness leaves no agent running', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ neverEnds: true });
  const d = deps(api, {});
  let slept = 0;
  const realSleep = d.sleep;
  d.sleep = async (ms) => { if (++slept === 1) throw new Error('the harness broke while waiting'); return realSleep(ms); };
  const r = await runPiece(opts, d);
  assert.match(r.manifest.aborted.message, /broke while waiting/);
  assert.equal(calls(api, 'agentStop').length, 1, 'the run was stopped by the finally');
  assert.equal(r.manifest.run.endedBy, 'harness-stopped');
  assert.match(r.manifest.run.stop.reason, /harness stopped at agent-run/);
  assert.equal(r.manifest.run.stop.idle, true);
});

test('a run that never showed itself is stopped too: a late start must not run on unseen', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ messages: 0 });
  api.agentRun = async (...a) => { api.calls.push({ name: 'agentRun', args: a }); return { status: 200, json: { ok: true, started: true } }; }; // accepted, never running
  const r = await runPiece(opts, deps(api, {}));
  assert.equal(r.manifest.run.endedBy, 'never-started');
  assert.equal(calls(api, 'agentStop').length, 1);
  assert.match(r.manifest.run.stop.reason, /never showed as running/);
});

// ---------------------------------------------------------------------------------------------- a fresh conversation
test('EVERY REAL PIECE GETS A FRESH CONVERSATION: after the reset, before any credit, and the run is measured against the empty chat', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ messages: 12 });
  const r = await runPiece(opts, deps(api, { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  const names = api.calls.map((c) => c.name);
  assert.deepEqual(api.calls.find((c) => c.name === 'conversationReset').args, [DEFAULT_PROJECT, DEFAULT_USER], 'the project and its named owner');
  assert.ok(names.indexOf('conversationReset') < names.indexOf('grantCredits'), 'before any credit is granted');
  assert.ok(names.indexOf('conversationReset') < names.indexOf('agentRun'), 'before the run');
  const c = r.manifest.conversation;
  assert.equal(c.cleared, true);
  assert.equal(c.route, 'POST /api/admin/conversation-reset/:id');
  assert.equal(c.removedMessages, 4);
  assert.equal(c.memoryCleared, true);
  assert.equal(c.ledgerCleared, true);
  assert.equal(c.messagesAfter, 0);
  assert.equal(r.manifest.plugin.messagesBefore, 0, 'the count the run is measured against is the one read AFTER the reset');
  assert.equal(r.manifest.run.endedBy, 'done');
});

test('A DRY RUN LEAVES THE CHAT ALONE, and says so in the manifest', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const api = fakeApi({ pluginConnected: false });
  const r = await runPiece(opts, deps(api, {}));
  assert.equal(calls(api, 'conversationReset').length, 0);
  assert.equal(r.manifest.conversation.cleared, false);
  assert.match(r.manifest.conversation.skipped, /dry run/);
});

test('A PIECE THAT CANNOT GET A FRESH CONVERSATION DOES NOT RUN: refused by the worker, or not actually empty afterwards', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  for (const [o, pattern] of [[{ conversationStatus: 403 }, /could not be cleared \(HTTP 403: owner mismatch/], [{ conversationStatus: 404 }, /HTTP 404: the deployed worker has no conversation-reset route yet/], [{ conversationStatus: 409 }, /could not be cleared \(HTTP 409: a run is in progress/], [{ conversationLeaves: 3 }, /still holds 3 messages/]]) {
    const api = fakeApi(o);
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.ok, false);
    assert.equal(r.manifest.aborted.step, 'conversation');
    assert.match(r.manifest.aborted.message, pattern);
    assert.match(r.manifest.aborted.message, /nothing was spent/);
    assert.equal(calls(api, 'grantCredits', 'setPlan', 'agentRun').length, 0, 'no credit, no plan change, no run');
  }
});

// ---------------------------------------------------------------------------------------------- terrain, the UI and the pictures
test('A PIECE BUILT FROM TERRAIN ALONE IS A WORLD PIECE, framed on the terrain, not photographed as the empty square at the spawn', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const terrain = { cells: 9000, extents: { min: [-200, 0, -200], max: [200, 60, 200] } };
  const r = await runPiece(opts, deps(fakeApi({ pluginConnected: false }), { terrain }));
  assert.equal(r.manifest.build.kind, 'world');
  assert.deepEqual(r.manifest.captures.map((c) => c.name), ['overview', 'three-quarter', 'close-up', 'spawn-eye']);
  const plan = r.manifest.build.cameraPlan;
  assert.equal(plan.basis, 'terrain');
  assert.equal(plan.built, true);
  assert.deepEqual(plan.bounds, { min: [-200, 0, -200], max: [200, 60, 200] });
  assert.ok(plan.radius > 200, `framed on a ${plan.radius}-stud radius, not the 4-stud empty square`);
  assert.equal(r.manifest.build.terrain.edited, true);
});

test('terrain the engine cannot place is framed on a window around the spawn, and the manifest says it is a guess', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const r = await runPiece(opts, deps(fakeApi({ pluginConnected: false }), { terrain: { cells: 9000, extents: null }, spawnSource: 'added' }));
  assert.equal(r.manifest.build.kind, 'world');
  const plan = r.manifest.build.cameraPlan;
  assert.equal(plan.basis, 'terrain-fallback');
  assert.equal(plan.built, true);
  assert.equal(plan.spawnSource, 'added');
  assert.ok(plan.radius > 100);
});

test('a UI piece\'s picture keeps the name its bytes call for: a JPEG is .jpg, and bytes that are not a picture are a recorded failure', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const jpg = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { ui: true, size: [1920, 1080], jpeg: true }));
  assert.ok(existsSync(join(jpg.pieceDir, 'shots', 'ui-1920x1080.jpg')), 'the JPEG is saved as .jpg');
  assert.equal(existsSync(join(jpg.pieceDir, 'shots', 'ui-1920x1080.png')), false);
  assert.equal(jpg.manifest.captures[0].file, 'shots/ui-1920x1080.jpg');
  assert.equal(jpg.manifest.captures[0].format, 'jpeg');
  assert.equal(jpg.manifest.ui.met, '1920x1080');
  const bad = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { ui: true, badBytes: true }));
  assert.equal(bad.manifest.captures[0].file, null);
  assert.match(bad.manifest.captures[0].error, /neither a PNG nor a JPEG/);
  assert.equal(bad.manifest.ui.captured, null);
  assert.match(bad.manifest.ui.note, /no UI picture was captured/);
  assert.equal(readdirSync(join(bad.pieceDir, 'shots')).some((f) => /^ui-/.test(f)), false, 'nothing is saved under a picture\'s name');
});

test('A SCREEN UI THE RUN LEFT SWITCHED OFF is switched on for its picture and put back, in that order, and the manifest says so', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const d = deps(fakeApi({ pluginConnected: false }), { ui: true, uiDisabled: true, size: [1280, 720] });
  const r = await runPiece({ ...opts, overwrite: true }, d);
  const tools = d.studioCalls().map((c) => (c.tool === 'execute_luau' ? `luau:${/MODE = "([\w-]+)"/.exec(c.args.code ?? '')?.[1] ?? 'other'}` : c.tool));
  const enable = tools.indexOf('luau:ui-enable');
  const capture = tools.indexOf('screen_capture', enable);
  const restore = tools.indexOf('luau:ui-restore');
  assert.ok(enable > 0 && enable < capture && capture < restore, `ui-enable, then the capture, then ui-restore: ${tools.join(' ')}`);
  assert.deepEqual(r.manifest.ui.switchedOff, ['ModalGui']);
  assert.deepEqual(r.manifest.ui.enabledForCapture, ['ModalGui']);
  assert.equal(r.manifest.ui.restoreError, null);
  assert.match(r.manifest.ui.note, /ModalGui was switched off by the run, switched on for the picture and put back/);
  // a UI that is already on is left alone: no ui-enable at all
  const on = deps(fakeApi({ pluginConnected: false }), { ui: true });
  await runPiece({ ...opts, overwrite: true }, on);
  assert.equal(on.studioCalls().some((c) => /MODE = "ui-enable"/.test(c.args.code ?? '')), false);
  // and a restore that fails is recorded, not hidden
  const failing = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { ui: true, uiDisabled: true, restoreFails: true }));
  assert.match(failing.manifest.ui.restoreError, /could not restore|execute_luau/);
  assert.match(failing.manifest.ui.note, /NOT put back/);
});

// ---------------------------------------------------------------------------------------------- the play test is evidence or it is nothing
test('THE PLAY TEST COUNTS ZERO ONLY WITH EVIDENCE THE PLACE RAN: each missing source leaves the errors unestablished, never 0', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const clean = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), {}));
  assert.equal(clean.manifest.playTest.errors, 0, 'CONTROL: with every source read, a clean place counts 0');
  assert.equal(clean.manifest.playTest.unestablished, null);
  for (const [label, scenario, pattern] of [
    ['play would not start', { startPlayFails: true }, /play did not start/],
    ['the server never answered', { serverSilent: true }, /the server did not answer while the place was playing/],
    ['the typed server log could not be read', { logServerFails: true }, /the server log could not be read/],
    ['the console could not be read after play', { consoleFailsAfter: true }, /the console could not be read/],
    ['the console could never be read', { consoleFails: true }, /the console could not be read/],
  ]) {
    const r = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), scenario));
    assert.equal(r.manifest.playTest.errors, null, `${label}: errors must not be 0`);
    assert.match(r.manifest.playTest.unestablished.join('; '), pattern, label);
  }
  // an error that WAS seen stands even when another source is missing
  const seen = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { consoleFailsAfter: true, serverErrors: 2 }));
  assert.equal(seen.manifest.playTest.errors, 2);
  assert.ok(seen.manifest.playTest.unestablished.length > 0);
});

test('A CONSOLE THAT WAS NOT READ IS NEVER SAVED AS AN EMPTY FILE: console.txt says it was not read, and why', async () => {
  const { opts } = setup({ dryRun: true });
  await withBaseline(opts);
  const empty = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), { playConsole: [] }));
  assert.equal(read(empty.pieceDir, 'console.txt').trim(), '', 'CONTROL: a console that was read and printed nothing holds nothing');
  assert.doesNotMatch(read(empty.pieceDir, 'console.txt'), /not read/);
  for (const [scenario, pattern] of [[{ consoleFailsAfter: true }, /^\(the console was not read: get_console_output failed after the play test: console unavailable\)/], [{ startPlayFails: true }, /^\(the console was not read: play did not start/]]) {
    const r = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ pluginConnected: false }), scenario));
    assert.match(read(r.pieceDir, 'console.txt'), pattern);
    assert.notEqual(read(r.pieceDir, 'console.txt').trim(), '');
  }
});

test('a baseline file in the old format is refused at preflight, with the way to record a new one', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const file = JSON.parse(read(dirname(opts.baselineFile), 'place-baseline.json'));
  delete file.format;
  writeFileSync(opts.baselineFile, JSON.stringify(file));
  const r = await runPiece({ ...opts, overwrite: true }, deps(fakeApi(), {}));
  assert.equal(r.manifest.aborted.step, 'preflight');
  assert.match(r.manifest.aborted.message, /format 1, not 2.*--init-baseline/s);
});
