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
    agentStop: async (...a) => (rec('agentStop', ...a), (s.running = false), { ok: true }),
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
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'credits', 'agent-run', 'messages', 'credits-after', 'measure', 'captures', 'play-test']);
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
