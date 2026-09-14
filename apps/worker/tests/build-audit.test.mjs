/**
 * THE AUDIT MUST NOT BE ABLE TO SAY "CLEAN" ABOUT A CHECK IT DID NOT RUN.
 *
 * critic.ts's `applyMetricRules` skips any rule whose metric is undefined:
 *     const v = input.metrics[r.metric]; if (v === undefined || !Number.isFinite(v)) continue;
 * That is correct for the critic and lethal for a caller. Hand the panel a partial metric set and
 * it returns a SHORT defect list, not an error — and a short defect list is indistinguishable from
 * a clean build. Two of the six lenses are measured from pixels this pass does not have.
 *
 * So the load-bearing test here is not "does it find defects". It is: does it refuse to run a lens
 * it cannot feed, and does it SAY so. Everything else is arithmetic.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const bundle = (src, tag) => {
  const out = join(mkdtempSync(join(tmpdir(), `ba-${tag}-`)), `${tag}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', src), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const BA = await import(`file://${bundle('build-audit.ts', 'ba')}`);
const C = await import(`file://${bundle('critic.ts', 'critic')}`);
const T = await import(`file://${bundle('tools.ts', 'tools')}`);

const TMP = mkdtempSync(join(tmpdir(), 'ba-luau-'));
const haveLuau = () => { try { execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; } };
function syntaxErrors(source, tag) {
  const file = join(TMP, `${tag}.luau`);
  writeFileSync(file, source);
  let output = '';
  try { output = execFileSync('luau-analyze', [file], { encoding: 'utf8', stdio: 'pipe' }); }
  catch (err) { output = `${err.stdout ?? ''}${err.stderr ?? ''}`; }
  return output.split('\n').filter((l) => l.includes('SyntaxError'));
}

/** A place: 10 parts, 4 of them default-grey Plastic, 2 unanchored, one material. */
function fixtureRows() {
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const grey = i < 4;
    rows.push([
      i * 4, 2, 0,              // pos
      2, 4, 2,                  // size
      1,                        // material index -> "Plastic"
      grey ? 163 : 40, grey ? 162 : 90, grey ? 165 : 140,
      i < 8 ? 1 : 0,            // last two unanchored
      0,
    ]);
  }
  return { mats: ['Plastic'], n: 10, parts: rows,
    lighting: { brightness: 2, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 1, effects: [], touched: 0 } };
}
const FIXTURE = fixtureRows();

function stubCtx(payload) {
  const ops = [];
  return { ops, ctx: { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data: { result: JSON.stringify(payload) } }; },
    addMemoryFact: async () => {} } };
}

test('the measurement pass is valid Luau', { skip: haveLuau() ? false : 'luau-analyze not on PATH' }, () => {
  assert.deepEqual(syntaxErrors(BA.AUDIT_LUAU, 'audit'), [], 'AUDIT_LUAU does not parse');
});

test('the measurement pass has no uninterruptible loop', () => {
  assert.doesNotMatch(BA.AUDIT_LUAU, /while\s*\(?\s*(true|1)\s*\)?\s*do/);
  assert.doesNotMatch(BA.AUDIT_LUAU, /\brepeat\b/);
});

test('parseAudit reads the pass output back', () => {
  const cap = BA.parseAudit({ result: JSON.stringify(FIXTURE) });
  assert.equal(cap.parts.length, 10);
  assert.equal(cap.parts[0].material, 'Plastic');
  assert.deepEqual(cap.parts[0].color, [163, 162, 165]);
  assert.equal(cap.parts[9].anchored, false);
  assert.equal(cap.lighting.isDefault, true, 'no effects and touched=0 means untouched');
});

test('metrics are computed, and a metric that cannot be measured is OMITTED not zeroed', () => {
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  assert.equal(m.partCount, 10);
  assert.equal(m.unanchoredParts, 2);
  assert.equal(m.distinctMaterials, 1);
  assert.equal(Math.round(m.factoryDefaultShare * 100), 40, '4 of 10 are factory grey');
  // A zero would be a value the rules ACT on. Absent must stay absent.
  for (const k of ['figureGroundContrast', 'distantContrast', 'faceValueSpread']) {
    assert.equal(k in m, false, `${k} is image-derived and must not appear`);
  }
});

test('an empty place yields no metrics at all rather than a page of zeroes', () => {
  const m = BA.auditMetrics({ parts: [], truncated: false });
  assert.deepEqual(m, {});
});

// --- the load-bearing property ---------------------------------------------------------------

test('exactly the three geometry lenses are runnable, and the image lenses are not', () => {
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  assert.deepEqual(BA.runnableLenses(m).sort(), ['composition', 'roblox_level_design', 'technical_art']);
  const skipped = BA.lensCoverage(m).filter((c) => !c.complete);
  assert.deepEqual(skipped.map((c) => c.lens).sort(), ['gameplay_readability', 'lighting']);
  for (const s of skipped) assert.ok(s.missing.length > 0, `${s.lens} must name what it is missing`);
});

test('every rule of every runnable lens has its metric present — no silent skips', () => {
  // This is the whole design. If it ever fails, the audit is reporting "no defect" for checks that
  // did not execute.
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  const RULES = { composition: C.COMPOSITION_RULES, roblox_level_design: C.ROBLOX_RULES, technical_art: C.TECHNICAL_ART_RULES };
  for (const lens of BA.runnableLenses(m)) {
    for (const rule of RULES[lens]) {
      assert.ok(Number.isFinite(m[rule.metric]), `${lens} would silently skip its ${rule.metric} rule`);
    }
  }
});

// --- the panel --------------------------------------------------------------------------------

test('the audit finds the planted defects and costs ZERO model calls', async () => {
  const { ctx, ops } = stubCtx(FIXTURE);
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.equal(ops.length, 1);
  assert.equal(ops[0].op, 'run_code');

  const subjects = (ctx.uiDetail.blocks.find((b) => b.type === 'table')?.rows ?? []).map((r) => r[1]);
  assert.ok(subjects.includes('unanchored-geometry'), `expected unanchored, got ${JSON.stringify(subjects)}`);
  assert.ok(subjects.includes('material-variety'), 'one material must be raised');
  assert.equal(res.blocking >= 1, true, 'unanchored geometry is blocking');
  assert.match(res.text, /0 model call/, 'the audit must call no model');
});

test('the result NAMES the lenses it did not run, in both payloads', async () => {
  const { ctx } = stubCtx(FIXTURE);
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.deepEqual(res.lensesSkipped.sort(), ['gameplay_readability', 'lighting']);
  assert.match(res.text, /NOT CHECKED/);
  assert.match(res.text, /gameplay_readability/);
  const callout = ctx.uiDetail.blocks.find((b) => b.type === 'callout');
  assert.match(callout.text, /Not checked/);
});

test('the panel payload is a valid v1 document the renderer accepts', async () => {
  const { ctx } = stubCtx(FIXTURE);
  await T.TOOLS.audit_build.run(ctx, {});
  const d = ctx.uiDetail;
  assert.equal(d.v, 1);
  assert.ok(Array.isArray(d.blocks) && d.blocks.length >= 2);
  const TONES = ['neutral', 'accent', 'info', 'good', 'warn', 'bad'];
  for (const b of d.blocks) {
    assert.ok(typeof b.type === 'string');
    if (b.type === 'callout') assert.ok(TONES.includes(b.tone), `bad tone ${b.tone}`);
    if (b.type === 'table') {
      assert.ok(Array.isArray(b.columns) && b.columns.length > 0);
      for (const r of b.rows) assert.equal(r.length, b.columns.length, 'ragged table row');
    }
    if (b.type === 'key_values') for (const kv of b.items) {
      assert.equal(typeof kv.key, 'string'); assert.equal(typeof kv.value, 'string');
    }
  }
});

test('an empty Workspace is refused rather than audited as perfect', async () => {
  const { ctx } = stubCtx({ mats: [], n: 0, parts: [] });
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.match(String(res.error), /no geometry/);
});

test('unreadable pass output is an error, not an empty clean verdict', async () => {
  const ops = [];
  const ctx = { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data: { result: 'not json at all' } }; },
    addMemoryFact: async () => {} };
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.match(String(res.error), /could not read/);
});

test('coincident faces are counted exactly, and a deliberate offset is not a defect', () => {
  const at = (x, sx) => ({ pos: [x, 0, 0], size: [sx, 2, 2], material: 'Plastic', color: [1, 1, 1], anchored: true, transparency: 0 });
  // two cubes sharing a face exactly
  assert.equal(BA.coincidentFacePairs([at(0, 2), at(2, 2)]), 1);
  // the same two with the 0.01-stud offset the rule recommends as the FIX
  assert.equal(BA.coincidentFacePairs([at(0, 2), at(2.02, 2)]), 0, 'the recommended fix must clear the defect');
});

test('distinct colours cluster perceptibly-equal colours into one decision', () => {
  assert.equal(BA.distinctColourCount([[163, 162, 165], [164, 163, 166]]), 1, 'near-identical is one choice');
  assert.equal(BA.distinctColourCount([[0, 0, 0], [255, 255, 255], [255, 0, 0]]), 3);
});

test('audit_build is offered with Studio and withheld without it', () => {
  assert.ok(T.toolDefs(true, undefined).map((d) => d.name).includes('audit_build'));
  assert.equal(T.toolDefs(false, undefined).map((d) => d.name).includes('audit_build'), false);
});
