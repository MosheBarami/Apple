// PRESERVED-FIX VERIFICATION
//
// Each block below corresponds to a production defect that was found, understood and fixed. The
// test is written so that DELETING THE FIX FAILS IT. That is the whole contract: these are not
// tests of features, they are tripwires on repairs, and several of the repairs are one line each —
// exactly the kind of line a refactor drops without noticing.
//
// The recent provider abstraction, the new /api/providers route, the tool_end `detail` field, the
// session DO's run_state/resume replay and the semantic.ts extension all moved code around these
// fixes. Nothing here trusts that they survived; everything is re-proven.
//
// WHERE A TEST IS BEHAVIOURAL it drives the real production code — the actual `runTool`, the actual
// `BudgetDO`, the actual Hono app with real ES256 JWTs. WHERE A TEST IS A STATIC ASSERTION it says
// so in its title, and that is only where the Cloudflare runtime is genuinely required (the session
// Durable Object's SQL-backed agent loop).
//
// NO NETWORK. NO SPEND. `globalThis.fetch` is stubbed and every model response is a fixture.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const WORKER = join(REPO, 'apps', 'worker');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');
const SRC = (...p) => join(WORKER, 'src', ...p);
const read = (...p) => readFileSync(SRC(...p), 'utf8');

const TMP = mkdtempSync(join(tmpdir(), 'golem-preserved-'));
const CF_SHIM = join(TMP, 'cf-workers-shim.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

let seq = 0;
function bundle(entry, label) {
  const dest = join(TMP, `${label}-${seq++}.mjs`);
  execFileSync(
    ESBUILD,
    [entry, '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${dest}`],
    { stdio: 'pipe', cwd: WORKER },
  );
  return dest;
}

const T = await import(`file://${bundle(SRC('tools.ts'), 'tools')}`);
const PT = await import(`file://${bundle(SRC('playtest.ts'), 'playtest')}`);
const C = await import(`file://${bundle(SRC('composition.ts'), 'composition')}`);
const S = await import(`file://${bundle(SRC('semantic.ts'), 'semantic')}`);
const B = await import(`file://${bundle(SRC('do', 'budget.ts'), 'budget')}`);
const APP = (await import(`file://${bundle(SRC('index.ts'), 'worker')}`)).default;

process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));

globalThis.fetch = async (input) => {
  const url = typeof input === 'string' ? input : input.url;
  const json = (o) => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (url.includes('/.well-known/jwks.json')) return json(JSON.parse(JWKS_BODY));
  if (url.includes('/rest/v1/projects')) return json(postgrestProject ? [postgrestProject] : []);
  return json([]);
};

// ---------------------------------------------------------------------------
// shared fixtures
// ---------------------------------------------------------------------------
const census = (o = {}) => ({
  instances: 120,
  parts: 60,
  scripts: 8,
  services: { Workspace: 90, ServerScriptService: 8, Lighting: 12, ReplicatedStorage: 10 },
  topLevel: ['Baseplate', 'Camera', 'Plaza', 'ReproModel', 'Terrain'],
  ...o,
});
/** How the plugin actually wraps a run_code return value: {result:{t,v}} with v a JSON string. */
const wireCensus = (c) => ({ result: { t: 'string', v: JSON.stringify(c) }, prints: [] });
const wireLayout = (parts) => ({ result: { t: 'string', v: JSON.stringify(parts) } });

/** Captured from live Studio: a room you stand inside. Six enclosing slabs plus furniture. */
const TAVERN_INTERIOR = [
  [0, 0.5, 0, 40, 1, 30, 0], [0, 12.5, 0, 40, 1, 30, 0],
  [-20, 6.5, 0, 1, 12, 30, 0], [20, 6.5, 0, 1, 12, 30, 0],
  [0, 6.5, -15, 40, 12, 1, 0], [0, 6.5, 15, 40, 12, 1, 0],
  [-8, 2, -6, 8, 3, 3, 0], [8, 2, -6, 8, 3, 3, 0], [0, 2, 6, 10, 3, 4, 0],
  [-14, 1.5, 10, 3, 2, 3, 0], [14, 1.5, 10, 3, 2, 3, 0], [0, 4, -13, 6, 5, 2, 0],
];
/** The same brief built as a cottage seen from OUTSIDE: no ceiling over your head. */
const COTTAGE_EXTERIOR = [
  [0, 0.5, 0, 120, 1, 120, 0],
  [0, 5, 0, 20, 10, 16, 0], [0, 11, 0, 22, 3, 18, 0],
  [-14, 2, 8, 3, 4, 3, 0], [16, 3, -10, 4, 6, 4, 0], [-20, 2.5, -14, 3, 5, 3, 0],
  [8, 1, 20, 6, 2, 6, 0], [-6, 1, 24, 5, 2, 5, 0],
];

function studioHarness(overrides = {}) {
  const ops = [];
  const state = { checkpoints: [], restores: [] };
  const ctx = {
    env: {
      AI: { run: async () => ({ choices: [{ message: { content: '{"score":7,"summary":"ok","defects":[]}' } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }) },
      KV: { get: async () => null, put: async () => {} },
      BUDGET_DO: { idFromName: () => ({}), get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true, reserved: 5 }), { headers: { 'content-type': 'application/json' } }) }) },
    },
    studioConnected: () => true,
    execStudioOp: async (op) => {
      ops.push(op);
      const r = overrides.op ? await overrides.op(op, ops) : undefined;
      if (r !== undefined) return r;
      return { id: 'op', ok: true, data: { ok: true } };
    },
    createCheckpoint: async (label, kind) => {
      state.checkpoints.push({ label, kind });
      if (overrides.checkpointFails) return { error: overrides.checkpointFails };
      return { id: 'cp-protective', label, kind, createdAt: 1, scriptCount: 8, instanceCount: 120, sizeBytes: 4096 };
    },
    restoreCheckpoint: async (id) => {
      state.restores.push(id);
      return overrides.restoreResult ?? { ok: true };
    },
    addMemoryFact: async () => {},
  };
  return { ctx, ops, state };
}

/** Drive `run_and_check` through the REAL runTool, with a scripted census before/after/verify. */
async function playtest({ before, after, verify, ...rest } = {}) {
  let censusCall = 0;
  const seqCensus = [before, after, verify];
  const h = studioHarness({
    ...rest,
    op: async (op, ops) => {
      if (rest.op) {
        const r = await rest.op(op, ops);
        if (r !== undefined) return r;
      }
      if (op.op === 'run_code' && op.code === PT.CENSUS_LUAU) {
        const c = seqCensus[censusCall++];
        if (c === 'unreadable') return { id: 'x', ok: true, data: { junk: true } };
        if (c === 'failed') return { id: 'x', ok: false, error: 'Studio busy' };
        return { id: 'x', ok: true, data: wireCensus(c ?? census()) };
      }
      return undefined;
    },
  });
  const out = await T.runTool(h.ctx, 'run_and_check', JSON.stringify({ seconds: 2 }));
  // `resultForLlm` is capped at MAX_RESULT_CHARS, so it is not always valid JSON — that truncation
  // is itself the subject of B3. Callers that need the parsed object say so by using `result`.
  let result = null;
  try {
    result = JSON.parse(out.resultForLlm);
  } catch {
    /* truncated: the raw string is what matters to that test */
  }
  return { ...h, out, result };
}

// ===========================================================================
// B1 — THE PLAYTEST PROTECTION CHAIN
// ===========================================================================
// Reproduced in live Studio: RunService:Run() executes server scripts against the EDIT DataModel
// and Stop() does not revert them, so a startup script that destroys instances destroys committed
// work permanently. Five separate mechanisms make that survivable and all five are load-bearing.

test('B1 a project worth protecting gets a pre-run checkpoint before Run mode ever starts', async () => {
  const { ops, state, result } = await playtest({ before: census(), after: census() });
  assert.deepEqual(state.checkpoints, [{ label: 'before playtest', kind: 'auto' }], 'a protective checkpoint must be taken');
  assert.equal(result.protectedByCheckpoint, 'cp-protective', 'the tool must report which checkpoint is protecting the run');
  // ORDER IS THE POINT: the checkpoint must exist before the simulation can destroy anything.
  const kinds = ops.map((o) => (o.op === 'run_code' ? 'census' : o.op === 'run_mode' ? `run_mode:${o.action}` : o.op));
  assert.ok(kinds.indexOf('census') < kinds.indexOf('run_mode:start'), 'the pre-census must precede Run mode');
  assert.deepEqual(kinds, ['census', 'run_mode:start', 'get_logs', 'run_mode:stop', 'census'], 'the playtest sequence changed');
});

test('B1 an unprotectable playtest is REFUSED — Run mode is never started', async () => {
  const { ops, result } = await playtest({ before: census(), checkpointFails: 'the project is too large to checkpoint' });
  assert.match(result.error, /refused to playtest/i, 'the tool must refuse rather than proceed unprotected');
  assert.match(result.error, /too large to checkpoint/, 'the refusal must carry the underlying reason');
  assert.equal(ops.some((o) => o.op === 'run_mode'), false, 'REFUSED must mean Run mode was never entered');
});

test('B1 a project too small to be worth protecting is not charged for a checkpoint', async () => {
  const tiny = census({ instances: 5, parts: 2, scripts: 0, services: { Workspace: 5 }, topLevel: ['Baseplate'] });
  const { state, result } = await playtest({ before: tiny, after: tiny });
  assert.deepEqual(state.checkpoints, [], 'below the floor there is nothing worth protecting');
  assert.equal(result.protectedByCheckpoint, undefined);
  assert.equal(PT.CHECKPOINT_FLOOR_INSTANCES, 12, 'the protection floor moved — re-justify it');
  assert.equal(PT.needsProtection(tiny), false);
});

test('B1 an unreadable census counts as "protect" — a broken tripwire is when the net matters most', async () => {
  assert.equal(PT.needsProtection(null), true);
  const { state, result } = await playtest({ before: 'unreadable', after: 'unreadable' });
  assert.deepEqual(state.checkpoints, [{ label: 'before playtest', kind: 'auto' }]);
  assert.equal(result.censusUnavailable, true, 'the agent must be told the tripwire did not work');
});

test('B1 destruction triggers an automatic restore, and the restore is VERIFIED by re-counting', async () => {
  const before = census();
  const after = census({ instances: 40, parts: 20, scripts: 3, topLevel: ['Baseplate', 'Camera', 'Terrain'], services: { Workspace: 20, ServerScriptService: 3, Lighting: 12, ReplicatedStorage: 10 } });
  const { state, result } = await playtest({ before, after, verify: before });
  assert.ok(Array.isArray(result.destroyedByPlaytest) && result.destroyedByPlaytest.length, 'the losses must be reported');
  assert.deepEqual(state.restores, ['cp-protective'], 'the pre-playtest checkpoint must be restored automatically');
  assert.match(result.restored, /restored .* and the restore was verified by re-counting/, 'the restore must be verified, never assumed');
  assert.match(result.warning, /Run mode is not a sandbox/i, 'the agent must be told why this happened');
});

test('B1 a restore that did not actually put the work back says so, loudly', async () => {
  const before = census();
  const gutted = census({ instances: 40, parts: 20, scripts: 3, topLevel: ['Baseplate', 'Camera', 'Terrain'], services: { Workspace: 20, ServerScriptService: 3, Lighting: 12, ReplicatedStorage: 10 } });
  // The restore claims success but the re-census still shows the losses. That must NOT read as ok.
  const { result } = await playtest({ before, after: gutted, verify: gutted });
  assert.match(result.restored, /THE RESTORE DID NOT FULLY SUCCEED/, 'an unverified restore must not be reported as a restore');
  assert.match(result.restored, /cp-protective still holds the pre-playtest state/, 'the user must be told where their work still is');

  // …and a restore that fails outright is equally loud.
  const failed = await playtest({ before, after: gutted, verify: gutted, restoreResult: { ok: false, error: 'Studio disconnected' } });
  assert.match(failed.result.restored, /THE RESTORE DID NOT FULLY SUCCEED/);
  assert.match(failed.result.restored, /Studio disconnected/);
});

test('B1 growth is not destruction — a game that spawns parts is never rolled back', () => {
  const before = census();
  const grew = census({ instances: 400, parts: 260, services: { Workspace: 380, ServerScriptService: 8, Lighting: 12, ReplicatedStorage: 10 }, topLevel: [...census().topLevel, 'Projectiles'] });
  assert.deepEqual(PT.destructiveDelta(before, grew), [], 'a growing scene has lost nothing');
});

test('B1 the destructive-delta detector catches each loss shape independently', () => {
  const b = census();
  assert.match(PT.destructiveDelta(b, census({ topLevel: ['Baseplate', 'Camera', 'Terrain'] }))[0], /top-level object.*destroyed/);
  assert.match(PT.destructiveDelta(b, census({ parts: 20 })).join(' '), /40 parts destroyed \(60 -> 20\)/);
  assert.match(PT.destructiveDelta(b, census({ scripts: 1 })).join(' '), /7 scripts destroyed/);
  assert.match(PT.destructiveDelta(b, census({ services: { ...b.services, Workspace: 10 } })).join(' '), /Workspace lost 80 of 90/);
  // A service shedding a couple of descendants is normal for a running game and must not fire.
  assert.deepEqual(PT.destructiveDelta(b, census({ services: { ...b.services, Workspace: 88 } })), []);
});

// ===========================================================================
// B2 — THE WIRE-SHAPE PARSER FIX
// ===========================================================================
// The plugin returns {result:{t,v}} with `v` a JSON STRING — not {result}. Unwrapping in a fixed
// order got this wrong twice against real Studio while every unit test passed, which is why the
// parsers peel any recognised wrapper until nothing changes.

test('B2 parseCensus reads the real {result:{t,v}} wire shape the plugin sends', () => {
  const c = census();
  assert.deepEqual(PT.parseCensus(wireCensus(c)), c, 'the live wire shape must parse');
  // …and every other nesting the plugin has been observed to produce.
  assert.deepEqual(PT.parseCensus({ result: JSON.stringify(c) }), c);
  assert.deepEqual(PT.parseCensus({ t: 'string', v: JSON.stringify(c) }), c);
  assert.deepEqual(PT.parseCensus({ data: { result: { t: 'string', v: JSON.stringify(c) } } }), c);
  assert.deepEqual(PT.parseCensus(JSON.stringify(c)), c);
  assert.deepEqual(PT.parseCensus(c), c);
});

test('B2 a census that cannot be read returns null, never a hollow "nothing was lost"', () => {
  for (const bad of [null, undefined, 42, 'not json', {}, { result: {} }, { result: { t: 'string', v: 'nope' } }, { instances: 'many', parts: 1 }, { parts: 3 }]) {
    assert.equal(PT.parseCensus(bad), null, `parseCensus(${JSON.stringify(bad)}) must refuse rather than invent a census`);
  }
});

test('B2 parseLayout reads the same wrapper family, so the composition gate is not inert either', () => {
  assert.deepEqual(C.parseLayout(wireLayout(TAVERN_INTERIOR)), TAVERN_INTERIOR);
  assert.deepEqual(C.parseLayout({ result: JSON.stringify(TAVERN_INTERIOR) }), TAVERN_INTERIOR);
  assert.deepEqual(C.parseLayout({ t: 'string', v: JSON.stringify(TAVERN_INTERIOR) }), TAVERN_INTERIOR);
  assert.equal(C.parseLayout({ result: { t: 'string', v: 'garbage' } }), null);
});

// ===========================================================================
// B3 — SAFETY-FIELD ORDERING
// ===========================================================================
// Tool results are truncated at MAX_RESULT_CHARS and a console log is easily thousands of
// characters. If the destruction warning came after the logs, the agent would never see the one
// thing it must not miss.

test('B3 the destruction warning precedes the log blob in key order', async () => {
  const before = census();
  const after = census({ parts: 10, topLevel: ['Baseplate', 'Terrain'] });
  const { result } = await playtest({ before, after, verify: before });
  const keys = Object.keys(result);
  for (const safety of ['destroyedByPlaytest', 'restored', 'warning', 'protectedByCheckpoint']) {
    assert.ok(keys.includes(safety), `${safety} must be present when work was destroyed`);
    assert.ok(keys.indexOf(safety) < keys.indexOf('logs'), `${safety} must be serialised BEFORE logs`);
  }
});

test('B3 truncation eats the logs and leaves the safety fields intact', async () => {
  const before = census();
  const after = census({ parts: 10, topLevel: ['Baseplate', 'Terrain'] });
  // A console log far larger than the 3,000-char result cap.
  const huge = Array.from({ length: 400 }, (_, i) => ({ kind: 'log', message: `line ${i} ${'x'.repeat(60)}` }));
  const { out } = await playtest({
    before, after, verify: before,
    op: async (op) => (op.op === 'get_logs' ? { id: 'x', ok: true, data: { entries: huge } } : undefined),
  });
  assert.ok(out.resultForLlm.includes('[truncated'), 'this test is only meaningful if truncation actually happened');
  assert.ok(out.resultForLlm.includes('destroyedByPlaytest'), 'the destruction report must survive truncation');
  assert.ok(out.resultForLlm.includes('Run mode is not a sandbox'), 'the warning must survive truncation');
  assert.ok(out.resultForLlm.includes('cp-protective'), 'the protecting checkpoint id must survive truncation');
});

// ===========================================================================
// B4 — GEOMETRY VIA run_code, NOT VIA render
// ===========================================================================
// MEASURED: the plugin installed in the owner's Studio returns render_view WITHOUT a `layout`
// field, so reading geometry from the render made this whole gate inert in production — it
// answered "no geometry to judge" against a place full of geometry.

test('B4 check_composition reads geometry with run_code and never rasterises a frame', async () => {
  const h = studioHarness({
    op: async (op) => (op.op === 'run_code' ? { id: 'x', ok: true, data: wireLayout(TAVERN_INTERIOR) } : undefined),
  });
  const out = await T.runTool(h.ctx, 'check_composition', JSON.stringify({ intent: 'a cosy tavern interior' }));
  assert.equal(out.ok, true, `check_composition failed: ${out.resultForLlm}`);
  assert.deepEqual(h.ops.map((o) => o.op), ['run_code'], 'the composition gate must cost exactly one run_code round-trip');
  assert.equal(h.ops[0].code, C.LAYOUT_LUAU, 'the gate must send the LAYOUT_LUAU snippet');
  assert.equal(h.ops.some((o) => o.op === 'render_view'), false, 'the gate must never pay for a render');
  // It really judged the geometry — the inert version answered "no geometry to judge".
  const res = JSON.parse(out.resultForLlm);
  assert.match(res.structure, /\d+ parts in \d+ vertical elements/, 'the gate must report measured structure');
  assert.equal(res.structure.includes('0 parts'), false, 'the gate must not be reading an empty scene');
});

test('B4 the gate says so plainly when there really is no geometry', async () => {
  const h = studioHarness({ op: async (op) => (op.op === 'run_code' ? { id: 'x', ok: true, data: wireLayout([]) } : undefined) });
  const out = await T.runTool(h.ctx, 'check_composition', JSON.stringify({ intent: 'a plaza' }));
  assert.match(out.resultForLlm, /no geometry to judge/);
});

// ===========================================================================
// B5 — THE SEMANTIC INTENT GATE AND THE REBUILD TRIGGER
// ===========================================================================

test('B5 the named regression: a tavern INTERIOR brief built as a cottage EXTERIOR fails the gate', () => {
  const interior = S.semanticCheck('build me a cosy tavern interior', TAVERN_INTERIOR);
  assert.equal(interior.requested, 'interior');
  assert.deepEqual(interior.failures, [], 'the correct reading of the brief must pass cleanly');
  assert.ok(interior.enclosure.coveredFloorRatio >= S.ENCLOSURE_GATES.interiorMin, 'a room you stand inside must read as covered');

  const wrong = S.semanticCheck('build me a cosy tavern interior', COTTAGE_EXTERIOR);
  assert.equal(wrong.requested, 'interior');
  assert.ok(wrong.failures.length >= 1, 'the tavern-interior-as-cottage-exterior regression must fail');
  assert.match(wrong.failures[0], /asked for an INTERIOR but this is built as an exterior/, 'the failure must say what is wrong, not just that something is');
  assert.ok(wrong.enclosure.coveredFloorRatio < S.ENCLOSURE_GATES.interiorMin);

  // …and the mirror case: an exterior brief built as a sealed room.
  const sealed = S.semanticCheck('a village plaza seen from the street', TAVERN_INTERIOR);
  assert.equal(sealed.requested, 'exterior');
  assert.ok(sealed.failures.length >= 1, 'an exterior brief built as an enclosed room must also fail');
  assert.match(sealed.failures[0], /asked for an EXTERIOR but this is built as an enclosed room/);
});

test('B5 the gate fires at the BLOCKOUT, through check_composition, before any detail is paid for', async () => {
  const h = studioHarness({
    op: async (op) => (op.op === 'run_code' ? { id: 'x', ok: true, data: wireLayout(COTTAGE_EXTERIOR) } : undefined),
  });
  const out = await T.runTool(h.ctx, 'check_composition', JSON.stringify({ intent: 'build me a cosy tavern interior' }));
  const res = JSON.parse(out.resultForLlm);
  assert.equal(res.passed, false, 'the wrong KIND of thing must not pass the blockout gate');
  assert.ok(res.intentMatch, 'the intent verdict must be reported to the agent');
  assert.match(res.guidance, /STOP\. You are not building the thing that was requested/, 'the guidance must order a re-layout, not a patch');
  assert.match(res.guidance, /do not correct this in place/i);
  // No render, no critique, no image tokens: rejecting the blockout has to stay cheap or it will
  // not be done early, and early is the only point at which it is cheap.
  assert.deepEqual(h.ops.map((o) => o.op), ['run_code']);
});

test('B5 the gate is not a blanket "fail" — an unstated brief is measured but never gated', () => {
  // "tavern" alone is genuinely ambiguous; guessing would reject correct work. Unstated is the
  // common case and means "measure but do not gate".
  for (const parts of [COTTAGE_EXTERIOR, TAVERN_INTERIOR]) {
    const c = S.semanticCheck('make something nice', parts);
    assert.equal(c.requested, 'unstated');
    assert.deepEqual(c.failures, [], 'an unstated enclosure must never produce a failure');
    assert.ok(typeof c.enclosure.coveredFloorRatio === 'number', 'it is still measured, so the number is available');
  }
  assert.equal(S.requestedEnclosure('make something nice'), 'unstated');
  assert.equal(S.requestedEnclosure('build a tavern'), 'unstated', '"tavern" alone must not be adjudicated');
  assert.equal(S.requestedEnclosure('a tavern interior'), 'interior');
  assert.equal(S.requestedEnclosure('a cottage exterior'), 'exterior');
  // Both named at once is not a mismatch anyone can adjudicate.
  assert.equal(S.requestedEnclosure('a shop interior opening onto a garden'), 'unstated');
  // Nothing to judge at all is null, not a pass.
  assert.equal(S.semanticCheck('a tavern interior', []), null);
  assert.equal(S.semanticCheck('a tavern interior', undefined), null);
});

test('B5 the rebuild trigger fires when patching has demonstrably stopped working', () => {
  const stuck = [
    { signature: 'sig-a', score: 4, parts: 120 },
    { signature: 'sig-a', score: 4, parts: 120 },
  ];
  const verdict = S.shouldRebuild(stuck, 0);
  assert.equal(verdict.rebuild, true, 'two passes that changed nothing must order a rebuild');
  assert.ok(verdict.reason && verdict.reason.length > 10, 'the rebuild order must carry a reason the model can act on');

  // One pass is not evidence yet: ordering a rebuild after a single correction would be worse.
  assert.equal(S.shouldRebuild([{ signature: 'sig-a', score: 4, parts: 120 }], 0).rebuild, false);
  // A semantic failure is enough on its own — the layout is the wrong shape, patching cannot help.
  assert.equal(S.shouldRebuild([{ signature: 'sig-a', score: 4, parts: 120 }], 2).rebuild, true);
});

test('B5 sceneSignature distinguishes a real re-layout from a cosmetic edit', () => {
  const a = S.sceneSignature(TAVERN_INTERIOR);
  assert.equal(a, S.sceneSignature(TAVERN_INTERIOR), 'the signature must be stable');
  assert.notEqual(a, S.sceneSignature(COTTAGE_EXTERIOR), 'a different macro composition must produce a different signature');
  assert.equal(typeof S.sceneSignature(undefined), 'string', 'a missing layout must still produce a usable signature');
});

test('B5 STATIC CHECK — the run loop wires the gate and the rebuild order into the visual pass', () => {
  const session = read('do/session.ts');
  const block = session.slice(session.indexOf('agent.autoCritiqued = true'), session.indexOf('const owesWork'));
  assert.match(block, /agent\.passes = \[\s*\n\s*\.\.\.\(agent\.passes \?\? \[\]\),\s*\n\s*\{ signature: sceneSignature\(layout\)/, 'each correction pass must be recorded so "patched forever" can be detected');
  assert.match(block, /semanticCheck\(agent\.request, layout\)/, 'the visual pass must re-ask whether it is the right KIND of thing');
  assert.match(block, /shouldRebuild\(agent\.passes, semantic\?\.failures\.length \?\? 0\)/, 'the rebuild verdict must consider both signals');
  assert.match(block, /const rebuild = verdict\.rebuild && !agent\.rebuildOrdered/, 'a rebuild must be ordered at most once per run, or it loops');
  assert.match(block, /STOP PATCHING/, 'the rebuild branch must actually tell the model to stop patching');
  assert.match(block, /Do not start over/, 'the patch branch must remain the non-rebuild path');
  // The gate is charged once per run and only with steps left, so it can neither loop nor surprise
  // the budget.
  const guard = session.slice(session.indexOf('if (\n        agent.mode !== \'clay\''), session.indexOf('agent.autoCritiqued = true'));
  assert.match(guard, /!agent\.autoCritiqued/);
  assert.match(guard, /agent\.step < agent\.maxSteps - 1/);
});

// ===========================================================================
// B6 — finishRun REPORTS 'incomplete' WHEN A RUN CHANGED NOTHING
// ===========================================================================
// MEASURED: asked to build a town plaza, the agent made ten tool calls, not one of them mutating,
// and the user was told "Done." A reply that reports work which did not happen is worse than an
// error, because the user has no reason to check.

test("B6 STATIC CHECK — a run that owes work finishes as 'incomplete', and the text is overridden", () => {
  const session = read('do/session.ts');
  assert.match(session, /const owesWork = agent\.mode !== 'clay' && !agent\.mutated && studioConnected;/, 'the "owes work" condition must remain mode + mutation + Studio');
  assert.match(session, /await this\.finishRun\(agent, owesWork \? 'incomplete' : 'done'\);/, 'falling through the nudges must NOT report success');
  // 'incomplete' OVERRIDES the model's own prose rather than appending to it — on the run this was
  // written for, that prose was the single word "Done."
  const content = session.slice(session.indexOf('const content ='), session.indexOf('if (content !== agent.streamedText)'));
  assert.match(content, /reason === 'incomplete'\s*\n\s*\?/, "the 'incomplete' branch must come first so it replaces finalText");
  assert.match(content, /I did not change anything in your project/);
  assert.match(content, /a fault on my side rather than a result/);
  assert.equal(/agent\.finalText \+ .*incomplete/.test(content), false, 'the incomplete text must not be appended to the optimistic prose');
  // The tool trace is still written, so the timeline shows what was attempted.
  assert.match(session, /JSON\.stringify\(agent\.trace\)/);
  // The stop reason reaches the client.
  assert.match(session, /this\.broadcast\(\{ type: 'msg_end', msgId: agent\.msgId, stopReason: reason, error \}\)/);

  const shared = readFileSync(join(REPO, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.match(shared, /stopReason: 'done' \| 'stopped' \| 'error' \| 'quota' \| 'incomplete'/, "'incomplete' must remain a first-class stop reason on the wire");
});

test('B6 STATIC CHECK — the nudge that precedes it is bounded and cannot loop', () => {
  const session = read('do/session.ts');
  assert.match(session, /const MAX_NUDGES = 2;/);
  assert.match(session, /if \(owesWork && \(agent\.nudges \?\? 0\) < MAX_NUDGES && agent\.step < agent\.maxSteps\)/, 'the nudge must be bounded by both a counter and the step limit');
  assert.match(session, /agent\.nudges = \(agent\.nudges \?\? 0\) \+ 1;/);
  // A mutating tool is what clears the debt, and the list of them is explicit.
  assert.match(session, /const MUTATING_TOOLS = new Set\(\[\s*\n\s*'edit_script', 'create_instances', 'set_properties', 'delete_instances', 'run_luau', 'insert_asset',\s*\n\]\);/);
  assert.match(session, /if \(out\.ok && MUTATING_TOOLS\.has\(call\.name\)\) agent\.mutated = true;/);
});

// ===========================================================================
// B7 — THE IDLE LONG-POLL
// ===========================================================================
// A 20,000 ms idle backoff was justified by an ESTIMATE of Durable Object residency cost and
// refuted by MEASUREMENT: with no browser attached, ops took 6.5-10.4 s to be picked up where they
// had taken under 2.5 s. Holding the request open instead gives near-zero latency AND fewer
// requests — but the hold must stay inside the 8 s liveness window or every op fails with
// "Studio is not connected" between polls.

test('B7 STATIC CHECK — the poll is held open whenever there is nothing to hand over', () => {
  const session = read('do/session.ts');
  assert.match(session, /const holdMs = agent\?\.status === 'running' \? 4000 : 6000;/, 'the hold durations moved — re-check them against the liveness window');
  assert.match(session, /if \(!this\.opQueue\.length\) \{\s*\n\s*await new Promise<void>\(\(resolve\) => \{/, 'the long poll must apply whenever the queue is empty, not only mid-run');
  // The waiter fires the moment an op is queued, which is what makes latency near zero.
  assert.match(session, /this\.pollWaiter = \(\) => \{\s*\n\s*clearTimeout\(t\);/);
  assert.match(session, /await this\.ctx\.storage\.put\(\{ opQueue: this\.opQueue, seq: this\.seq \}\);\s*\n\s*this\.pollWaiter\?\.\(\);/, 'enqueueing an op must wake the held poll');
  assert.match(session, /waitMs: running \? 400 : 1000/, 'the client-side re-poll delay moved');
});

test('B7 both hold durations stay inside the liveness window that declares the plugin gone', () => {
  const session = read('do/session.ts');
  const holds = /const holdMs = agent\?\.status === 'running' \? (\d+) : (\d+);/.exec(session);
  assert.ok(holds, 'the hold expression was not found');
  const [running, idle] = [Number(holds[1]), Number(holds[2])];
  // `pluginConnected()` treats the plugin as gone after this long without a poll.
  const windows = [...session.matchAll(/Date\.now\(\) - (?:lastSeen|last) < (\d+)/g)].map((m) => Number(m[1]));
  assert.ok(windows.length >= 1, 'the liveness window was not found');
  const liveness = Math.min(...windows);
  assert.equal(liveness, 8000, 'the liveness window moved — re-derive the hold durations from it');
  for (const [name, hold] of [['running', running], ['idle', idle]]) {
    assert.ok(hold < liveness, `the ${name} hold (${hold}ms) must stay comfortably inside the ${liveness}ms liveness window`);
    assert.ok(liveness - hold >= 2000, `the ${name} hold leaves only ${liveness - hold}ms of margin — an op would fail between polls`);
  }
  // …and it is a hold, not the 20,000 ms backoff that measurement refuted.
  assert.ok(idle <= 6000, 'the idle hold must not creep back toward the refuted 20s backoff');
});

// ===========================================================================
// B8 — SPEND LIMITS AND THE BudgetDO
// ===========================================================================
// Driven against the REAL BudgetDO class, with an in-memory storage and SQL fake. Every decision
// below is the object's own arithmetic.

function newBudget() {
  const store = new Map();
  const spendRows = [];
  const ctx = {
    blockConcurrencyWhile: (fn) => fn(),
    storage: {
      sql: {
        exec(q, ...p) {
          if (/^\s*insert into spend/i.test(q)) spendRows.push({ day: p[0], model: p[1], kind: p[2], neurons: p[3], calls: 1 });
          if (/^\s*delete from spend where day = \?/i.test(q)) spendRows.length = 0;
          return { toArray: () => spendRows.slice(), one: () => spendRows[0] ?? {} };
        },
      },
      get: async (k) => store.get(k),
      put: async (a, b) => {
        if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v);
        else store.set(a, b);
      },
    },
  };
  const obj = new B.BudgetDO(ctx, {});
  const hit = async (path, body) =>
    (await obj.fetch(new Request(`https://do${path}`, body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }))).json();
  return { hit, spendRows };
}

test('B8 a reservation is held, then settled on actual usage', async () => {
  const { hit, spendRows } = newBudget();
  const r = await hit('/reserve', { neurons: 200, model: '@cf/test' });
  assert.equal(r.ok, true);
  assert.equal(r.reserved, 200);
  assert.equal(r.state.dayPending, 200, 'the reservation must be visible to a concurrent caller');
  assert.equal(r.state.dayNeurons, 0, 'a reservation is not yet spend');

  const s = await hit('/settle', { reserved: 200, actual: 130, model: '@cf/test', kind: 'stone:step' });
  assert.equal(s.state.dayPending, 0, 'settling must clear the reservation');
  assert.equal(s.state.dayNeurons, 130, 'the ledger must record ACTUAL usage, not the estimate');
  assert.deepEqual(spendRows.map((x) => [x.model, x.kind, x.neurons]), [['@cf/test', 'stone:step', 130]], 'spend must be attributed per model and per purpose');
});

test('B8 a released reservation costs nothing', async () => {
  const { hit } = newBudget();
  await hit('/reserve', { neurons: 500, model: 'm' });
  const rel = await hit('/release', { reserved: 500 });
  assert.equal(rel.ok, true);
  assert.equal((await hit('/state')).dayPending, 0);
  assert.equal((await hit('/state')).dayNeurons, 0, 'a released reservation must never become spend');
});

test('B8 the daily ceiling refuses, and reservations count toward it before they settle', async () => {
  const { hit } = newBudget();
  // Squeeze the day down so the cap is reachable without a huge loop.
  await hit('/limits', { billableNeuronsPerDay: 0 });
  await hit('/simulate-usage', { neurons: 9_000 }); // free allocation is 10,000/day
  const ok = await hit('/reserve', { neurons: 900, model: 'm' });
  assert.equal(ok.ok, true, 'inside the ceiling a reservation must still succeed');
  const over = await hit('/reserve', { neurons: 900, model: 'm' });
  assert.equal(over.ok, false, 'a pending reservation must count toward the ceiling');
  assert.equal(over.reason, 'daily_cap');
});

test('B8 the monthly billable cap refuses independently of the day', async () => {
  const { hit } = newBudget();
  await hit('/limits', { billableNeuronsPerDay: 1_000_000, billableNeuronsPerMonth: 100 });
  await hit('/simulate-usage', { neurons: 10_000 }); // exactly the free allocation
  const over = await hit('/reserve', { neurons: 1_000, model: 'm' });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'monthly_cap');
});

test('B8 the per-request ceiling refuses a single oversized call', async () => {
  const { hit } = newBudget();
  const over = await hit('/reserve', { neurons: 5_000, model: 'm' });
  assert.equal(over.ok, false);
  assert.equal(over.reason, 'request_too_large');
  assert.equal((await hit('/state')).dayPending, 0, 'a refused reservation must not be held');
});

test('B8 the kill switch stops every reservation and is reversible', async () => {
  const { hit } = newBudget();
  await hit('/kill', { killed: true, reason: 'maintenance' });
  const killed = await hit('/reserve', { neurons: 10, model: 'm' });
  assert.equal(killed.ok, false);
  assert.equal(killed.reason, 'killed');
  assert.equal(killed.message, 'maintenance', 'the operator reason must reach the caller');
  assert.equal((await hit('/state')).killed, true);
  await hit('/kill', { killed: false });
  assert.equal((await hit('/reserve', { neurons: 10, model: 'm' })).ok, true, 'lifting the kill switch must restore service');
});

test('B8 lowering a cap takes effect on the very next reservation, with no redeploy', async () => {
  const { hit } = newBudget();
  assert.equal((await hit('/reserve', { neurons: 1_100, model: 'm' })).ok, true);
  await hit('/limits', { maxNeuronsPerRequest: 1_000 });
  const next = await hit('/reserve', { neurons: 1_100, model: 'm' });
  assert.equal(next.ok, false);
  assert.equal(next.reason, 'request_too_large');
});

test('B8 caps are clamped, so "tunable without a redeploy" cannot mean "unbounded"', async () => {
  const { hit } = newBudget();
  const wild = await hit('/limits', { billableNeuronsPerDay: 9e12, billableNeuronsPerMonth: 9e12, maxNeuronsPerRequest: 9e12 });
  assert.equal(wild.limits.billableNeuronsPerDay, 2_000_000);
  assert.equal(wild.limits.billableNeuronsPerMonth, 20_000_000);
  assert.equal(wild.limits.maxNeuronsPerRequest, 50_000);
  const negative = await hit('/limits', { billableNeuronsPerDay: -5, maxNeuronsPerRequest: -5 });
  assert.equal(negative.limits.billableNeuronsPerDay, 0);
  assert.equal(negative.limits.maxNeuronsPerRequest, 100, 'the per-request floor keeps the product usable');
});

test('B8 an admin key cannot erase spend to slip under a cap — simulate-usage is additive only', async () => {
  const { hit } = newBudget();
  await hit('/simulate-usage', { neurons: 5_000 });
  const after = await hit('/simulate-usage', { neurons: -4_000 });
  assert.equal(after.state.dayNeurons, 5_000, 'a negative simulation must not reduce the ledger');
  const probe = await hit('/probe', { neurons: 100 });
  assert.equal(probe.verdict, 'allowed');
  assert.equal((await hit('/state')).dayPending, 0, 'a probe must be a dry run and touch nothing');
});

// ===========================================================================
// B9 — ADMIN ROUTE AUTHORIZATION AND TENANT ISOLATION, RE-PROVEN END TO END
// ===========================================================================
// These are exercised in depth in security.test.mjs. They are re-proven here from the OTHER
// direction — a successful owner request and a successful admin request — so that a change which
// breaks the product while satisfying the refusal tests still fails something.

const require_ = createRequire(join(WORKER, 'package.json'));
const jose = require_('jose');
const SUPABASE_URL = 'https://supa.golem.test';
const OWNER_ID = '33333333-3333-4333-8333-333333333333';
const PROJECT_ID = 'cccccccc-dddd-4eee-8fff-aaaaaaaaaaaa';
const ADMIN_KEY = 'PRESERVED-admin-key-b91e7f';

const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true });
const JWKS_BODY = JSON.stringify({ keys: [{ ...(await jose.exportJWK(publicKey)), kid: 'k', alg: 'ES256', use: 'sig' }] });
const OWNER_JWT = await new jose.SignJWT({ email: 'o@golem.test', role: 'authenticated' })
  .setProtectedHeader({ alg: 'ES256', kid: 'k' })
  .setIssuer(`${SUPABASE_URL}/auth/v1`)
  .setAudience('authenticated')
  .setSubject(OWNER_ID)
  .setIssuedAt()
  .setExpirationTime('1h')
  .sign(privateKey);

let postgrestProject = null;
let addressed = [];
function appEnv() {
  const ns = (name) => ({
    idFromName: (n) => {
      addressed.push({ ns: name, name: n });
      return { toString: () => `${name}:${n}` };
    },
    get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } }) }),
  });
  return {
    SUPABASE_URL,
    SUPABASE_ANON_KEY: 'anon',
    ADMIN_KEY,
    ENVIRONMENT: 'test',
    AI: { run: async () => ({}) },
    KV: { get: async () => null, put: async () => {} },
    SESSION_DO: ns('SESSION_DO'),
    QUOTA_DO: ns('QUOTA_DO'),
    PAIRING_DO: ns('PAIRING_DO'),
    ADMIN_DO: ns('ADMIN_DO'),
    BUDGET_DO: ns('BUDGET_DO'),
  };
}
async function hitApp(path, { method = 'GET', jwt, adminKey, body } = {}) {
  const headers = {};
  if (jwt) headers.Authorization = `Bearer ${jwt}`;
  if (adminKey) headers['X-Admin-Key'] = adminKey;
  const res = await APP.fetch(
    new Request(`https://golem.test${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) }),
    appEnv(),
  );
  return { status: res.status, text: await res.text() };
}

test('B9 an owner reaching their own project still works — the isolation is a gate, not a wall', async () => {
  postgrestProject = { id: PROJECT_ID, owner_id: OWNER_ID, name: 'Preserved Place', place_name: null, memory_summary: null, memory_facts: [] };
  addressed = [];
  const res = await hitApp(`/api/projects/${PROJECT_ID}/checkpoints`, { jwt: OWNER_JWT });
  assert.equal(res.status, 200, 'the owner must still be able to read their own project');
  // Exactly one DO address is taken, from the canonical row id, and the same stub serves /init and
  // the request itself.
  assert.deepEqual(addressed.filter((a) => a.ns === 'SESSION_DO').map((a) => a.name), [PROJECT_ID]);
});

test('B9 a stranger is refused on the same URL, and no Durable Object is created for them', async () => {
  postgrestProject = null; // RLS returns nothing for this caller
  addressed = [];
  const res = await hitApp(`/api/projects/${PROJECT_ID}/checkpoints`, { jwt: OWNER_JWT });
  assert.equal(res.status, 404);
  assert.deepEqual(addressed.filter((a) => a.ns === 'SESSION_DO'), []);
});

test('B9 the admin key still opens admin routes and still opens nothing else', async () => {
  postgrestProject = null;
  assert.equal((await hitApp('/api/admin/stats', { adminKey: ADMIN_KEY })).status, 200);
  assert.equal((await hitApp('/api/admin/stats', { adminKey: 'wrong' })).status, 403);
  assert.equal((await hitApp('/api/admin/stats')).status, 403);
  // The admin key is not a user token.
  assert.equal((await hitApp('/api/me', { adminKey: ADMIN_KEY })).status, 401);
  assert.equal((await hitApp(`/api/projects/${PROJECT_ID}/checkpoints`, { adminKey: ADMIN_KEY })).status, 401);
});

test('B9 the provider abstraction did not change which model actually serves a request', () => {
  // The whole product still resolves every model key to the one Workers AI model. If a refactor
  // ever repoints a key at a credential-less provider, production breaks silently — this catches it.
  const gw = read('gateway.ts');
  const keys = ['clay', 'stone', 'rune', 'memory', 'vision'];
  for (const k of keys) {
    const line = new RegExp(`^\\s*${k}: \\{ id: '(@cf/[^']+)'`, 'm').exec(gw);
    assert.ok(line, `model key ${k} is missing from DEFAULT_MODELS`);
    assert.match(line[1], /^@cf\//, `${k} must still resolve to a Workers AI model id`);
  }
  assert.match(gw, /const adapter = adapterForModelId\(cfg\.id\);/, 'the adapter must be chosen from the resolved model id');
  // …and an unknown id still falls back to the only transport this worker has.
  assert.match(read('providers/registry.ts'), /return workersAiAdapter;/, 'an unrecognised model id must fall back to the AI binding');
});
