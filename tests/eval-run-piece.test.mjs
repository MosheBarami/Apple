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
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initBaseline, runPiece, resolveOptions, ignoreBrokenTerminal, INTERNAL_PER_CREDIT, DEFAULT_PROJECT, DEFAULT_USER, Abort } from '../scripts/eval/run-piece.mjs';
import { StudioMcpClient } from '../scripts/eval/lib/studio-mcp.mjs';
import { getRequest } from '../scripts/eval/lib/dev-set.mjs';
import { aggregate } from '../scripts/eval/baseline.mjs';
import { prepare as prepareAny, RUBRIC_V1 } from '../scripts/eval/prepare-critics.mjs';
const prepare = (dirs, o = {}) => prepareAny(dirs, { rubricPath: RUBRIC_V1, ...o });
import { writeVerdicts } from '../scripts/eval/write-verdicts.mjs';

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
    state: s,
    health: async () => (rec('health'), { ok: true, buildSha: 'abc12345', time: '2026-10-05T12:00:00Z' }),
    spend: async () => (rec('spend'), { state: { killed: false, estimatedMonthUsd: o.monthUsd ?? 3.9, monthBillableNeurons: 1, ...(o.spendState ?? {}) } }),
    sessionInfo: async () => {
      // The status the worker reports is recorded with every read, so a test can say what the harness had last seen when it moved on.
      const read = () => {
        // `lateStart`: the unanswered start reaches the worker after the harness's stop: this many reads after the stop, it is running.
        if (s.lateIn > 0 && --s.lateIn === 0) { s.running = true; s.polls = -1_000_000; }
        if (s.stopping > 0) {
          s.stopping--;
          return { project: { name: 'Bench' }, agentStatus: 'stopping', messages: s.messages, pluginConnected: true };
        }
        if (s.running && o.failInfo) {
          s.infoCalls = (s.infoCalls ?? 0) + 1;
          const f = o.failInfo(s.infoCalls);
          if (f) throw Object.assign(new Error(f.message ?? `GET /api/admin/session-info/x: HTTP ${f.status}`), { status: f.status });
        }
        if (s.running) {
          s.polls++;
          if (o.neverEnds || s.polls <= s.runPolls) return { project: { name: 'Bench' }, agentStatus: 'running', messages: s.messages, pluginConnected: true };
          if (s.polls <= s.runPolls + (o.stoppingAfterRun ?? 0)) return { project: { name: 'Bench' }, agentStatus: 'stopping', messages: s.messages, pluginConnected: true };
          s.running = false;
          s.messages += 2;
        }
        return {
          project: { id: DEFAULT_PROJECT, name: 'Bench' }, agentStatus: o.agentStatus ?? 'idle', paused: null, messages: s.messages,
          pluginConnected: o.pluginConnected ?? true, queuedOps: 0, link: { paired: true, connected: true, pluginVersion: '1.5.0' },
          openPlace: { placeName: 'EvalBaseplate', placeId: 0, gameId: 0, isRunMode: false },
        };
      };
      try {
        const info = read();
        calls.push({ name: 'sessionInfo', args: [], status: info.agentStatus });
        o.onSessionInfo?.(info, s);
        return info;
      } catch (e) {
        calls.push({ name: 'sessionInfo', args: [], status: null });
        throw e;
      }
    },
    account: async () => (rec('account'), { quota: { plan: 'free', creditsRemaining: calls.some((c) => c.name === 'agentRun') ? 5000 : 6000, creditsUsedToday: 10, creditsUsedThisMonth: 100, allowanceRemaining: 700, credits: 5000 } }),
    setPlan: async (...a) => (rec('setPlan', ...a), { ok: true }),
    grantCredits: async (...a) => (rec('grantCredits', ...a), { status: o.grantStatus ?? 200, json: { ok: true, granted: a[1] } }),
    agentRun: async (...a) => {
      rec('agentRun', ...a);
      if (o.runStatus) return { status: o.runStatus, json: { ok: false, error: 'refused', code: 'account_not_approved' } };
      if (o.lateStart) throw new Error('POST /api/admin/agent-run/x: no answer in 30000 ms');
      s.running = true;
      s.polls = 0;
      o.onAgentRun?.(s);
      // The worker started the run and the answer did not arrive (a 5xx after the fact, or no answer in 30 s): the run is live all the same.
      if (o.startFails) throw Object.assign(new Error(o.startFails.message ?? `POST /api/admin/agent-run/x: HTTP ${o.startFails.status}`), { status: o.startFails.status });
      return { status: 200, json: { ok: true, started: true } };
    },
    agentStop: async (...a) => {
      rec('agentStop', ...a);
      if (o.stopFails) throw new Error('POST /api/admin/agent-stop/x: HTTP 500 boom');
      // `stoppingReads`: the worker answers 'stopping' (a tool is still finishing) for this many status reads after the stop, then idle.
      if (o.lateStart && !s.lateArmed) { s.lateArmed = true; s.lateIn = o.lateStart; }
      if (!o.stopIgnored) {
        s.running = false;
        s.stopping = o.stoppingReads ?? 0;
      }
      return { ok: true };
    },
    conversationReset: async (...a) => {
      rec('conversationReset', ...a);
      // `conversationAnswer`: the answer the route gives as it is (the chat is empty afterwards, as the route's own check would say).
      if (o.conversationAnswer) { s.messages = 0; return o.conversationAnswer; }
      if (o.conversationStatus) return { status: o.conversationStatus, json: { ok: false, error: o.conversationStatus === 403 ? 'owner mismatch: that user does not own this project' : 'a run is in progress' } };
      s.messages = o.conversationLeaves ?? 0;
      // The worker's own `ok` is `left === 0` and it answers 200 either way, so `ok: false` arrives with a 200.
      if (o.conversationOk === false) return { status: 200, json: { ok: false, removedMessages: 1, messagesAfter: 2, memoryCleared: true, planCleared: false, ledgerCleared: true } };
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
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'measure', 'kit-lint', 'captures', 'play-test', 'style-gates']);
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
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'conversation', 'credits', 'agent-run', 'messages', 'credits-after', 'measure', 'kit-lint', 'captures', 'play-test', 'style-gates']);
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
    const api = fakeApi({ runStatus: status });
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.ok, false);
    assert.equal(r.manifest.aborted.step, 'agent-run');
    assert.match(r.manifest.aborted.message, pattern);
    assert.equal(stepNames(r).includes('captures'), false);
    // the worker said no, so no run of ours exists: nothing is recorded as attempted and nothing is stopped (a 409 is somebody else's run)
    assert.equal(r.manifest.run, null, `${status}: a refused start is not an attempt`);
    assert.equal(calls(api, 'agentStop').length, 0, `${status}: there is no run of ours to stop`);
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
  assert.match(r.manifest.run.startError, /\[redacted\]/, 'the error of the failed start is recorded with the key taken out');
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
  const stopTimes = [];
  const agentStop = api.agentStop;
  api.agentStop = async (...a) => { stopTimes.push(d.now()); return agentStop(...a); };
  const r = await runPiece(opts, d);
  assert.doesNotMatch(d.logs.join('\n'), /trying again/, 'a 401 is not retried: another try cannot fix it');
  assert.equal(r.manifest.aborted.step, 'agent-run');
  assert.equal(calls(api, 'agentStop').length, 2, 'the stop was tried when the poll gave up, and once more at the end because the worker never ACCEPTED one');
  assert.equal(r.manifest.run.stop.requested, false);
  assert.match(r.manifest.run.stop.error, /HTTP 500 boom/);
  assert.equal(r.manifest.run.stop.idle, false);
  // one record for the two attempts: the second keeps the first one's reason and time, and counts itself
  assert.equal(r.manifest.run.stop.attempts, 2);
  assert.equal(r.manifest.run.stop.requestedAt, new Date(stopTimes[0]).toISOString(), 'the time recorded is the first attempt\'s');
  assert.ok(stopTimes[1] > stopTimes[0], 'CONTROL: the clock moved between the two attempts, so a time taken at the second would differ');
  assert.match(r.manifest.run.stop.reason, /status could not be read/);
  assert.doesNotMatch(r.manifest.run.stop.reason, /the harness stopped at/, 'the reason the run was given up on is not overwritten by the wind-up');
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

test('A START THAT REACHES THE WORKER AFTER THE STOP (S07, 2026-10-06) IS CAUGHT AND STOPPED before the next piece can start', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const api = fakeApi({ lateStart: 3 });
  const r = await runPiece(opts, deps(api, {}));
  assert.equal(r.ok, false);
  assert.equal(r.manifest.run.lateStart, true);
  assert.equal(calls(api, 'agentStop').length, 2, 'the late run is stopped as well');
  assert.match(r.manifest.aborted.message, /started after the first stop and was stopped again/);
  assert.match(r.manifest.aborted.message, /stopped and is idle/);
  assert.equal((await api.sessionInfo()).agentStatus, 'idle', 'nothing is left running for the next piece');
});

// ---------------------------------------------------------------------------------------------- the run lifecycle, second review
// From the moment the start request is sent the worker may have a run going, and a run nobody watches goes on spending the credits.
// Every way out of the runner after that point (a failed start request, a status that stays 'stopping', Ctrl-C) stops the run, waits for the
// worker to say 'idle', and writes the manifest with what is known.

test('A START REQUEST THAT FAILS AFTER THE WORKER STARTED THE RUN (a 5xx, or no answer in 30 s) STOPS THE RUN, and the manifest says the start was not confirmed', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  for (const [label, startFails, pattern] of [
    ['a 502', { status: 502 }, /HTTP 502/],
    ['no answer', { message: 'POST /api/admin/agent-run/x: no answer in 30000 ms' }, /no answer in 30000 ms/],
  ]) {
    const api = fakeApi({ startFails });
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.ok, false, label);
    assert.equal(r.manifest.aborted.step, 'agent-run', label);
    assert.match(r.manifest.aborted.message, /request to start the run failed/, label);
    assert.match(r.manifest.aborted.message, pattern, label);
    assert.match(r.manifest.aborted.message, /stopped and is idle/, label);
    assert.equal(calls(api, 'agentStop').length, 1, `${label}: the run the worker may have started is stopped`);
    assert.equal((await api.sessionInfo()).agentStatus, 'idle', `${label}: the worker's run is not live any more`);
    // the record says what is known: a run may have been made, the start was not confirmed, the stop was asked for and it is idle
    const run = r.manifest.run;
    assert.ok(run?.startedAt, `${label}: the piece is recorded as attempted (a run may have been made)`);
    assert.equal(run.startConfirmed, false, label);
    assert.match(run.startError, pattern, label);
    assert.equal(run.endedBy, 'start-failed', label);
    assert.equal(run.stop.requested, true, label);
    assert.equal(run.stop.idle, true, label);
    assert.match(run.stop.reason, /start request failed/, label);
    assert.equal(JSON.parse(read(r.pieceDir, 'manifest.json')).run.endedBy, 'start-failed', `${label}: and it is on disk`);
    assert.deepEqual(stepNames(r), ['preflight', 'reset', 'conversation', 'credits', 'agent-run'], `${label}: nothing is measured after a run that could not be confirmed`);
    // the rest of the pipeline sees an attempt: the critics are not run on it, but the verdict is written and it fails (the run did not end
    // normally), and the baseline counts it as attempted, never as "not run (harness stopped first)"
    const prepared = prepare([r.pieceDir]);
    assert.equal(prepared.pieces.length, 0, label);
    assert.match(prepared.skipped[0].reason, /aborted at agent-run/, label);
    assert.equal(writeVerdicts({ results: [] }, { prepared }).skippedWithRun.length, 1, `${label}: a verdict is written for the attempt`);
    const verdict = JSON.parse(read(r.pieceDir, 'verdict.json'));
    assert.equal(verdict.status, 'fail', label);
    assert.equal(verdict.pass, false, label);
    assert.match(verdict.reasons.join('\n'), /the run did not end normally \(aborted\)/, label);
    const counts = aggregate([{ id: 'U01', category: 'ui', manifest: r.manifest, verdict, credits: null, timing: null }]).counts;
    assert.equal(counts.attempted, 1, label);
    assert.equal(counts.notRun, 0, label);
    assert.equal(counts.passing, 0, label);
  }
  // CONTROL: a start that is answered (200) is recorded as confirmed
  const ok = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({}), { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(ok.manifest.run.startConfirmed, true);
  assert.equal(ok.manifest.run.startError, null);
});

test('A START REQUEST THE WORKER ANSWERED WITH A 4xx IS A REFUSAL: no run of ours exists, nothing is stopped, and the piece is not counted as attempted', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  for (const status of [400, 401, 404]) {
    const api = fakeApi({ startFails: { status, message: `POST /api/admin/agent-run/x: HTTP ${status} no` } });
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.ok, false, String(status));
    assert.equal(r.manifest.aborted.step, 'agent-run', String(status));
    assert.match(r.manifest.aborted.message, new RegExp(`worker refused the request to start the run: .*HTTP ${status}`), String(status));
    assert.doesNotMatch(r.manifest.aborted.message, /not known whether/, `${status}: the worker did not act on it, so there is no doubt to record`);
    assert.equal(r.manifest.run, null, `${status}: a refusal is not an attempt`);
    assert.equal(calls(api, 'agentStop').length, 0, `${status}: there is no run of ours to stop`);
    assert.equal(stepNames(r).includes('messages'), false, String(status));
    const verdictless = aggregate([{ id: 'U01', category: 'ui', manifest: r.manifest, verdict: null, credits: null, timing: null }]).counts;
    assert.equal(verdictless.attempted, 0, `${status}: not in the pass-rate denominator`);
    assert.equal(verdictless.notRun, 1, String(status));
  }
  // a 408 and a 429 can come from a proxy in front of a request that did go through, and a 5xx or no answer say nothing either: those stay
  // recorded as a start that may have happened, and the run is stopped
  for (const status of [408, 429, 503]) {
    const api = fakeApi({ startFails: { status } });
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.manifest.run?.endedBy, 'start-failed', String(status));
    assert.equal(r.manifest.run.startConfirmed, false, String(status));
    assert.equal(calls(api, 'agentStop').length, 1, `${status}: the run the worker may have started is stopped`);
    assert.equal(aggregate([{ id: 'U01', category: 'ui', manifest: r.manifest, verdict: null, credits: null, timing: null }]).counts.attempted, 1, String(status));
  }
  // startConfirmed means the worker answered 200: any other answer that is not a refusal goes on to the poll but is not "confirmed"
  const accepted = fakeApi({ runPolls: 1 });
  const realRun = accepted.agentRun;
  accepted.agentRun = async (...a) => ({ ...(await realRun(...a)), status: 202 });
  const r = await runPiece({ ...opts, overwrite: true }, deps(accepted, { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(r.manifest.run.startConfirmed, false, 'a 202 is not the 200 the worker sends for a started run');
  assert.equal(r.manifest.run.endedBy, 'done', 'but the run it started is polled to its end all the same');
});

test('A RUN THE WORKER STILL SAYS IS "stopping" IS NOT IDLE: the stop waits for "idle", and a stop that never gets there ends the piece unmeasured', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // CONTROL: three "stopping" answers after the stop, then idle: the stop waits them out and the piece goes on
  const slow = fakeApi({ neverEnds: true, stoppingReads: 3 });
  const waited = await runPiece(opts, deps(slow, {}));
  assert.equal(waited.manifest.run.stop.idle, true);
  const statuses = slow.calls.slice(slow.calls.findIndex((c) => c.name === 'agentStop')).filter((c) => c.name === 'sessionInfo').map((c) => c.status);
  assert.deepEqual(statuses.slice(0, 4), ['stopping', 'stopping', 'stopping', 'idle'], 'the stop kept reading until the worker said idle');
  assert.ok(stepNames(waited).includes('measure'), 'a stop that is confirmed lets the piece be measured');
  // the worker never leaves "stopping": the run is NOT confirmed idle, so the place may still be changing and is not measured
  const stuck = fakeApi({ neverEnds: true, stoppingReads: Infinity });
  const stuckDeps = deps(stuck, {});
  const t0 = stuckDeps.now();
  const r = await runPiece({ ...opts, overwrite: true }, stuckDeps);
  assert.equal(r.manifest.run.stop.requested, true);
  assert.equal(r.manifest.run.stop.idle, false, '"stopping" is not "idle"');
  assert.equal(r.manifest.run.endedBy, 'timeout');
  // a stop the worker accepted is not asked for again at the wind-up: one request, one 90 s wait, and the first record is the only one
  assert.equal(calls(stuck, 'agentStop').length, 1, 'the stop was asked for once');
  assert.equal(r.manifest.run.stop.attempts, 1);
  assert.match(r.manifest.run.stop.reason, /the run passed 15 minutes/, 'the reason is the timeout, not the wind-up');
  assert.ok(stuckDeps.now() - t0 < (15 * 60 + 150) * 1000, `one stop wait, not two: the piece took ${Math.round((stuckDeps.now() - t0) / 1000)} s on the fake clock`);
  assert.match(stuckDeps.logs.join('\n'), /accepted a stop and the run is still not idle; not asking again/);
  assert.equal(r.manifest.aborted.step, 'agent-run');
  assert.match(r.manifest.aborted.message, /NOT confirmed idle: stop it by hand/);
  assert.deepEqual(stepNames(r), ['preflight', 'reset', 'conversation', 'credits', 'agent-run'], 'no measuring, no pictures and no play test while a tool may still be changing the place');
  // a run that never showed itself and whose stop is not confirmed is not measured either
  const late = fakeApi({ messages: 0, stoppingReads: Infinity });
  late.agentRun = async (...a) => { late.calls.push({ name: 'agentRun', args: a }); late.state.running = false; return { status: 200, json: { ok: true, started: true } }; };
  const never = await runPiece({ ...opts, overwrite: true }, deps(late, {}));
  assert.equal(never.manifest.run.endedBy, 'never-started');
  assert.equal(never.manifest.run.stop.idle, false);
  assert.equal(calls(late, 'agentStop').length, 1, 'asked once here too');
  assert.match(never.manifest.run.stop.reason, /never showed as running/);
  assert.equal(never.manifest.aborted.step, 'agent-run');
  assert.equal(stepNames(never).includes('measure'), false);
});

test('A RUN THAT IS "stopping" IS NOT OVER: the poll waits for idle before the harness measures and photographs the place', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // somebody pressed Stop in the app: the worker says running, then stopping while a tool finishes, then idle
  const api = fakeApi({ runPolls: 2, stoppingAfterRun: 3 });
  const r = await runPiece(opts, deps(api, { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  const beforeMessages = api.calls.slice(0, api.calls.findIndex((c) => c.name === 'messages')).filter((c) => c.name === 'sessionInfo').map((c) => c.status);
  assert.deepEqual(beforeMessages.slice(-6), ['running', 'running', 'stopping', 'stopping', 'stopping', 'idle'], 'the last status read before the harness moved on is idle');
  assert.equal(calls(api, 'agentStop').length, 0, 'the harness did not stop a run that ended by itself');
});

test('A RUN THAT WAS SEEN RUNNING AND IS "stopping" AFTER 60 s IS STILL NOT OVER: it is not a run that never started', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // the owner presses Stop 100 s into the run (20 polls of 5 s on the fake clock): running, then stopping while a tool finishes, then idle.
  // The 60 s window is for a run that was never seen at all; this one was, so it waits for idle however long that takes
  const api = fakeApi({ runPolls: 20, stoppingAfterRun: 3 });
  const r = await runPiece(opts, deps(api, { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(r.ok, true, JSON.stringify(r.manifest.aborted));
  assert.ok(r.manifest.run.minutes > 1.5, `the run lasted ${r.manifest.run.minutes} minutes on the fake clock, past the 60 s window`);
  assert.equal(r.manifest.run.endedBy, 'done', 'a run that was seen running is never filed as never-started');
  assert.equal(calls(api, 'agentStop').length, 0, 'the poll did not stop a run that was ending by itself');
  assert.equal(r.manifest.run.stop, undefined);
  const beforeMessages = api.calls.slice(0, api.calls.findIndex((c) => c.name === 'messages')).filter((c) => c.name === 'sessionInfo').map((c) => c.status);
  assert.deepEqual(beforeMessages.slice(-5), ['running', 'stopping', 'stopping', 'stopping', 'idle'], 'the harness moved on only at idle');
  assert.ok(stepNames(r).includes('measure'), 'and then measured the place');
  // CONTROL: a run that never showed itself is still given up on after 60 s (that is what the window is for)
  const unseen = fakeApi({ messages: 0 });
  unseen.agentRun = async (...a) => { unseen.calls.push({ name: 'agentRun', args: a }); return { status: 200, json: { ok: true, started: true } }; };
  const never = await runPiece({ ...opts, overwrite: true }, deps(unseen, {}));
  assert.equal(never.manifest.run.endedBy, 'never-started');
});

const SIGNAL_NAMES = ['SIGINT', 'SIGTERM', 'SIGHUP']; // SIGHUP is what closing the terminal window sends
const listening = (emitter) => SIGNAL_NAMES.map((n) => emitter.listenerCount(n));

/** A run in flight, and a way to send it a signal from inside the fake worker, as a person at the terminal would. */
function withSignal(signal, { atPoll = 2, ...o } = {}) {
  const signals = new EventEmitter();
  const seen = { liveListeners: null, afterFirstSignal: null };
  const api = fakeApi({
    neverEnds: true,
    ...o,
    onSessionInfo: (info, s) => {
      if (!(s.running && info.agentStatus === 'running')) return;
      if (s.polls === 1) seen.liveListeners = listening(signals);
      if (s.polls === atPoll) {
        signals.emit(signal);
        seen.afterFirstSignal = listening(signals);
      }
    },
  });
  return { signals, api, seen };
}

test('SIGINT, SIGTERM OR SIGHUP WITH THE RUN LIVE STOPS THE RUN, waits for idle and writes the manifest: Node\'s default would end the process with the run still going', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  for (const signal of SIGNAL_NAMES) {
    const { signals, api, seen } = withSignal(signal);
    const d = deps(api, {});
    d.signals = signals;
    const r = await runPiece({ ...opts, overwrite: true }, d);
    assert.equal(r.ok, false, signal);
    assert.equal(r.manifest.aborted.step, 'agent-run', signal);
    assert.match(r.manifest.aborted.message, new RegExp(`interrupted by ${signal}`), signal);
    assert.match(r.manifest.aborted.message, /stopped and is idle/, signal);
    assert.equal(calls(api, 'agentStop').length, 1, `${signal}: the run was stopped`);
    assert.equal((await api.sessionInfo()).agentStatus, 'idle', `${signal}: and the worker's run is not live`);
    assert.equal(r.manifest.run.endedBy, 'interrupted', signal);
    assert.equal(r.manifest.run.startConfirmed, true, signal);
    assert.equal(r.manifest.run.stop.requested, true, signal);
    assert.equal(r.manifest.run.stop.idle, true, signal);
    assert.match(r.manifest.run.stop.reason, new RegExp(signal), signal);
    assert.equal(JSON.parse(read(r.pieceDir, 'manifest.json')).run.endedBy, 'interrupted', `${signal}: the manifest was written`);
    for (const f of ['credits.json', 'timing.json', 'steps.json', 'reply.md', 'console.txt', 'request.txt']) assert.ok(existsSync(join(r.pieceDir, f)), `${signal}: ${f}`);
    assert.deepEqual(stepNames(r), ['preflight', 'reset', 'conversation', 'credits', 'agent-run'], `${signal}: no further step starts`);
    assert.deepEqual(seen.liveListeners, [1, 1, 1], `${signal}: all three signals were being listened for while the run was live`);
    assert.deepEqual(seen.afterFirstSignal, [0, 0, 1], `${signal}: the first signal gives Ctrl-C and SIGTERM back to Node, so a second one kills at once; SIGHUP stays held, because a closed terminal can send it twice`);
  }
});

test('SIGHUP TWICE IN A ROW (zsh forwards the closed terminal\'s SIGHUP to its jobs) still stops the run and writes the manifest: the second one never meets Node\'s default', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const signals = new EventEmitter();
  let heldBetween = null;
  const api = fakeApi({
    neverEnds: true,
    onSessionInfo: (info, s) => {
      if (!(s.running && info.agentStatus === 'running') || s.polls !== 2) return;
      signals.emit('SIGHUP');
      heldBetween = signals.listenerCount('SIGHUP');
      signals.emit('SIGHUP');
    },
  });
  const d = deps(api, {});
  d.signals = signals;
  const r = await runPiece({ ...opts, overwrite: true }, d);
  assert.equal(heldBetween, 1, 'after the first SIGHUP a listener still holds SIGHUP, so the real process ignores the second');
  assert.equal(calls(api, 'agentStop').length, 1, 'the run was stopped once');
  assert.equal(r.manifest.run.endedBy, 'interrupted');
  assert.match(r.manifest.aborted.message, /interrupted by SIGHUP/);
  assert.equal(JSON.parse(read(r.pieceDir, 'manifest.json')).run.endedBy, 'interrupted', 'the manifest was written');
  assert.equal(signals.listenerCount('SIGHUP'), 0, 'and SIGHUP is let go when the piece is over');
});

test('WITH THE TERMINAL GONE, a log line that throws does not end the piece: the run is still stopped and the manifest written', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const signals = new EventEmitter();
  let gone = false;
  const api = fakeApi({
    neverEnds: true,
    onSessionInfo: (info, s) => {
      if (s.running && info.agentStatus === 'running' && s.polls === 2) { gone = true; signals.emit('SIGHUP'); }
    },
  });
  const d = deps(api, {});
  d.signals = signals;
  d.log = () => { if (gone) throw Object.assign(new Error('write EIO'), { code: 'EIO' }); };
  const r = await runPiece({ ...opts, overwrite: true }, d);
  assert.equal(calls(api, 'agentStop').length, 1, 'the run was stopped');
  assert.equal(r.manifest.run.endedBy, 'interrupted');
  assert.equal(JSON.parse(read(r.pieceDir, 'manifest.json')).run.endedBy, 'interrupted', 'the manifest was written');
});

test('ignoreBrokenTerminal: a write error on a closed terminal (an \'error\' event on stdout or stderr) does not crash the runner', () => {
  const out = new EventEmitter();
  const err = new EventEmitter();
  assert.throws(() => err.emit('error', new Error('write EIO')), /EIO/, 'CONTROL: an error event nobody listens for throws, which in the real process is a crash');
  ignoreBrokenTerminal([out, err]);
  assert.doesNotThrow(() => out.emit('error', Object.assign(new Error('write ENXIO'), { code: 'ENXIO' })));
  assert.doesNotThrow(() => err.emit('error', Object.assign(new Error('write EIO'), { code: 'EIO' })));
});

test('the signals are listened for on the real process by default, and not for a moment longer than the piece runs', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const before = listening(process);
  let during = null;
  const api = fakeApi({ neverEnds: true, onSessionInfo: (info, s) => {
    if (!(s.running && info.agentStatus === 'running')) return;
    if (s.polls === 1) during = listening(process);
    if (s.polls === 2) process.emit('SIGINT'); // what Node does for a Ctrl-C, without sending one: it reaches only the handlers that were registered
  } });
  const r = await runPiece(opts, deps(api, {}));
  assert.deepEqual(during, before.map((n) => n + 1), 'one listener for each of the three signals while the run is live');
  assert.match(r.manifest.aborted.message, /interrupted by SIGINT/);
  assert.equal(calls(api, 'agentStop').length, 1);
  assert.deepEqual(listening(process), before, 'nothing is left registered');
  // a piece that ends by itself leaves nothing registered either
  const quiet = await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ runPolls: 1 }), { world: { min: [0, 0, 0], max: [4, 4, 4] } }));
  assert.equal(quiet.ok, true);
  assert.deepEqual(listening(process), before);
  // and one that is refused before it starts
  await runPiece({ ...opts, overwrite: true }, deps(fakeApi({ agentStatus: 'running' }), {}));
  assert.deepEqual(listening(process), before);
});

test('A SIGNAL WHILE THE START REQUEST IS IN FLIGHT: the run it started is stopped, and the start is recorded as confirmed', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const signals = new EventEmitter();
  const api = fakeApi({ neverEnds: true, onAgentRun: () => signals.emit('SIGTERM') });
  const d = deps(api, {});
  d.signals = signals;
  const r = await runPiece(opts, d);
  assert.equal(r.manifest.run.startConfirmed, true);
  assert.equal(r.manifest.run.endedBy, 'interrupted');
  assert.equal(calls(api, 'agentStop').length, 1);
  assert.equal(r.manifest.run.stop.idle, true);
  assert.match(r.manifest.aborted.message, /interrupted by SIGTERM/);
});

test('A SIGNAL WAKES THE SLEEPING POLL AT ONCE: the run is stopped without waiting out the 5 s between polls', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // The fake clock's sleep returns at once, so it cannot tell a wake from a sleep. This sleep is a real 1.5 s for the poll's own interval
  // (and only until the signal), and the stop request records whether that sleep had ended by then: only a wake gets there first.
  const signals = new EventEmitter();
  let slow = true;
  let pollSleepEnded = false;
  let endedBeforeStop = null;
  const api = fakeApi({ neverEnds: true, onAgentRun: () => setTimeout(() => { slow = false; signals.emit('SIGHUP'); }, 30) });
  const realStop = api.agentStop;
  api.agentStop = async (...a) => { endedBeforeStop = pollSleepEnded; return realStop(...a); };
  const d = deps(api, {});
  d.signals = signals;
  const fakeSleep = d.sleep;
  d.sleep = (ms) => (slow && ms === opts.pollMs ? new Promise((resolve) => setTimeout(() => { pollSleepEnded = true; resolve(); }, 1500)) : fakeSleep(ms));
  const r = await runPiece(opts, d);
  assert.equal(endedBeforeStop, false, 'the stop was asked for while the poll was still sleeping: the signal woke it');
  assert.equal(r.manifest.run.endedBy, 'interrupted');
  assert.match(r.manifest.aborted.message, /interrupted by SIGHUP/);
  assert.equal(r.manifest.run.stop.idle, true);
  assert.equal(calls(api, 'sessionInfo').filter((c) => c.status === 'running').length, 0, 'no status poll was made after the wake: the run was stopped, not polled again');
});

test('A SIGNAL BEFORE THE RUN: the next step does not start, nothing is spent, and there is no run to stop', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  const signals = new EventEmitter();
  const api = fakeApi({});
  const health = api.health;
  api.health = async () => { signals.emit('SIGINT'); return health(); }; // arrives during preflight
  const d = deps(api, {});
  d.signals = signals;
  const r = await runPiece(opts, d);
  assert.equal(r.ok, false);
  assert.match(r.manifest.aborted.message, /interrupted by SIGINT/);
  assert.equal(r.manifest.aborted.step, 'reset', 'preflight was in flight and finished; the step after it did not start');
  assert.equal(calls(api, 'grantCredits', 'setPlan', 'agentRun', 'conversationReset', 'agentStop').length, 0, 'no credit, no plan change, no run, no stop');
  assert.equal(r.manifest.run, null);
  assert.equal(signals.listenerCount('SIGINT'), 0);
  assert.ok(existsSync(join(r.pieceDir, 'manifest.json')));
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

test('AN EMPTY CHAT IS ONE THE PROJECT SAYS HAS ZERO MESSAGES: no count, a null count and a 200 with ok false are each refused before anything is spent', async () => {
  const { opts } = setup();
  await withBaseline(opts);
  // the session-info answer after the reset has no count, or a null one: that is not "0", and the run would be measured against a guess
  const withCount = (change) => {
    const api = fakeApi();
    const real = api.sessionInfo;
    api.sessionInfo = async (...a) => {
      const info = await real(...a);
      return calls(api, 'conversationReset').length ? change(info) : info;
    };
    return api;
  };
  for (const [label, api] of [
    ['no message count at all', withCount(({ messages, ...rest }) => rest)],
    ['a null message count', withCount((info) => ({ ...info, messages: null }))],
  ]) {
    const r = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(r.ok, false, label);
    assert.equal(r.manifest.aborted.step, 'conversation', label);
    assert.match(r.manifest.aborted.message, /still holds an unknown number of messages after it was cleared; nothing was spent/, label);
    assert.equal(calls(api, 'grantCredits', 'setPlan', 'agentRun').length, 0, `${label}: no credit, no plan change, no run`);
  }
  // the worker's own `ok` is `left === 0` and it answers 200 either way: a 200 with ok false is a conversation that was NOT cleared, even
  // when the count that is read afterwards happens to say 0
  const notOk = fakeApi({ conversationOk: false });
  const r = await runPiece({ ...opts, overwrite: true }, deps(notOk, {}));
  assert.equal(r.manifest.aborted.step, 'conversation');
  assert.match(r.manifest.aborted.message, /could not be cleared \(HTTP 200/);
  assert.equal(r.manifest.conversation.cleared, false);
  assert.equal(calls(notOk, 'grantCredits', 'setPlan', 'agentRun').length, 0);
  // and `ok: true` is not enough on its own: the answer must be a 200. A 403, 404 or 409 that carries ok true (or a 200 with no body) is a
  // conversation that was not cleared, even when the count read afterwards says 0
  for (const [label, conversationAnswer, pattern] of [
    ['a 409 that says ok', { status: 409, json: { ok: true, removedMessages: 4, messagesAfter: 0 } }, /could not be cleared \(HTTP 409/],
    ['a 403 that says ok', { status: 403, json: { ok: true, messagesAfter: 0 } }, /could not be cleared \(HTTP 403/],
    ['a 404 that says ok', { status: 404, json: { ok: true, messagesAfter: 0 } }, /could not be cleared \(HTTP 404/],
    ['a 200 with no body', { status: 200, json: null }, /could not be cleared \(HTTP 200/],
  ]) {
    const api = fakeApi({ conversationAnswer });
    const refused = await runPiece({ ...opts, overwrite: true }, deps(api, {}));
    assert.equal(refused.manifest.aborted.step, 'conversation', label);
    assert.match(refused.manifest.aborted.message, pattern, label);
    assert.equal(refused.manifest.conversation.cleared, false, label);
    assert.equal(calls(api, 'grantCredits', 'setPlan', 'agentRun').length, 0, `${label}: nothing was spent`);
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
