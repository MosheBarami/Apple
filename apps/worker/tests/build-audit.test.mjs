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
  const workspace = {
    root: {
      path: 'game.Workspace', class: 'Workspace', children: (payload.parts ?? []).map((row, index) => ({
        path: `game.Workspace.Part${index}`, class: 'Part', children: [], attributes: {}, props: {
          Position: { t: 'Vector3', v: row.slice(0, 3) },
          Size: { t: 'Vector3', v: row.slice(3, 6) },
          Material: { t: 'EnumItem', v: `Enum.Material.${payload.mats?.[row[6] - 1] ?? 'Plastic'}` },
          Color: { t: 'Color3', v: [row[7] / 255, row[8] / 255, row[9] / 255] },
          Anchored: { t: 'bool', v: row[10] === 1 },
          Transparency: { t: 'number', v: row[11] ?? 0 },
        },
      })),
    },
  };
  const lighting = {
    root: {
      path: 'game.Lighting', class: 'Lighting', attributes: {},
      props: {
        Brightness: { t: 'number', v: payload.lighting?.brightness ?? 2 },
        ClockTime: { t: 'number', v: payload.lighting?.clockTime ?? 14.5 },
        Ambient: { t: 'Color3', v: (payload.lighting?.ambient ?? [0, 0, 0]).map((v) => v / 255) },
      },
      children: (payload.lighting?.effects ?? []).map((className, index) => ({ path: `game.Lighting.Fx${index}`, class: className, props: {}, attributes: {}, children: [] })),
    },
  };
  return { ops, ctx: { env: {}, studioConnected: () => true,
    execStudioOp: async (o) => { ops.push(o); return { ok: true, data: o.root === 'game.Lighting' ? lighting : workspace }; },
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

/**
 * A COUNT OVER A SAMPLE CANNOT PROVE AN ABSENCE.
 *
 * The pass walks every part to count them and emits only the first 1500. Those metrics then went to
 * threshold rules as if they described the whole place — so a 4,000-part build whose first 1,500
 * descendants are anchored terrain and shells reported unanchoredParts = 0, the blocking rule
 * `unanchoredParts > 0` did not fire, and audit_build returned "No confirmed defects" over a green
 * callout reading "5 of 5 lenses run over 1500 part(s)". On server start 900 props fall.
 *
 * The parts past the cap are the ones added most recently, which is exactly where a new defect
 * lives. This module already withholds coincidentFacePairs above its own cap, with the reasoning
 * written down — "a rule that fires on a guess is exactly what critic.ts refuses to contain". The
 * same withholding was missing here.
 */
test('A TRUNCATED CAPTURE DOES NOT REPORT ZERO UNANCHORED PARTS', () => {
  const rows = fixtureRows();
  // 1500 sampled and all anchored; the place actually holds 4000
  const sampled = rows.parts.slice(0, 1).map((r) => r);
  const cap = { parts: BA.parseAudit({ result: JSON.stringify({ ...rows, n: 4000 }) }).parts.map((p) => ({ ...p, anchored: true })), truncated: true, total: 4000 };
  const m = BA.auditMetrics(cap);
  assert.equal('unanchoredParts' in m, false,
    'a zero drawn from a sample must be omitted, not handed to a rule that acts on it');
  assert.equal(m.partCount, 4000, 'and the part count must be the TRUE total, not the sample size');
  assert.ok(sampled.length > 0);
});

test('a truncated capture that DID find unanchored parts still reports them', () => {
  // A positive from a sample is conclusive: those parts really are unanchored. Withholding it would
  // trade a false clean bill for a missed defect, which is the wrong direction.
  const parts = BA.parseAudit({ result: JSON.stringify({ ...fixtureRows(), n: 4000 }) }).parts;
  const m = BA.auditMetrics({ parts, truncated: true, total: 4000 });
  assert.equal(m.unanchoredParts, 2, 'what it did find must still be cited');
  assert.equal(m.partCount, 4000);
});

test('an untruncated capture reports zero unanchored parts as the fact it is', () => {
  const parts = BA.parseAudit({ result: JSON.stringify(fixtureRows()) }).parts.map((p) => ({ ...p, anchored: true }));
  const m = BA.auditMetrics({ parts, truncated: false, total: parts.length });
  assert.equal(m.unanchoredParts, 0, 'here a zero IS evidence, and the rule should see it');
});

test('parseAudit carries the true total through, not just the truncated flag', () => {
  const cap = BA.parseAudit({ result: JSON.stringify({ ...fixtureRows(), n: 4000 }) });
  assert.equal(cap.truncated, true);
  assert.equal(cap.total, 4000, 'the count of what is really there');
  assert.equal(cap.parts.length, 10, 'and the sample that was actually emitted');
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

test('coverage is three states, not two, and each lens lands in the right one', () => {
  // The original rule here was "run a lens only if EVERY rule can be evaluated", which was right
  // about the danger — a lens with rules silently skipped returns a short list that reads like a
  // clean result — and wrong about the remedy. applyMetricRules now REPORTS what it skipped, so
  // partial is a state that can be reported rather than one that has to be avoided.
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  const by = Object.fromEntries(BA.lensCoverage(m).map((c) => [c.lens, c]));

  for (const lens of ['composition', 'roblox_level_design', 'technical_art']) {
    assert.equal(by[lens].status, 'complete', `${lens} is fully geometry-derived`);
    assert.deepEqual(by[lens].missing, []);
  }
  // lighting has two pixel rules AND one check that is pure configuration data
  assert.equal(by.lighting.status, 'partial');
  assert.ok(by.lighting.missing.length > 0, 'it must still name what it could not measure');
  assert.match(by.lighting.partialBecause, /configuration|pixels/i, 'and say why it is worth running');
  // every readability rule is a pixel metric, so running it would examine nothing
  assert.equal(by.gameplay_readability.status, 'none');
});

test('a lens that could examine NOTHING is excluded, so "lenses run" never overstates', () => {
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  const run = BA.runnableLenses(m);
  assert.ok(run.includes('lighting'), 'lighting checks configuration and must run');
  assert.equal(run.includes('gameplay_readability'), false, 'readability can check nothing and must not');
  assert.deepEqual(run.sort(), ['composition', 'lighting', 'roblox_level_design', 'technical_art']);
});

test('every rule of a COMPLETE lens has its metric — those may not be silently skipped', () => {
  const m = BA.auditMetrics(BA.parseAudit({ result: JSON.stringify(FIXTURE) }));
  const RULES = { composition: C.COMPOSITION_RULES, roblox_level_design: C.ROBLOX_RULES, technical_art: C.TECHNICAL_ART_RULES };
  for (const c of BA.lensCoverage(m).filter((x) => x.status === 'complete')) {
    for (const rule of RULES[c.lens] ?? []) {
      assert.ok(Number.isFinite(m[rule.metric]), `${c.lens} would silently skip its ${rule.metric} rule`);
    }
  }
});

test('THE PAYOFF — an untouched Lighting rig is now reported, and could not be before', async () => {
  // The single most actionable art-direction defect, and it needs no pixels at all: it reads the
  // plugin's Lighting report. Gating the lens out because two sibling rules need a render
  // suppressed the one check in it that was always available.
  const { ctx } = stubCtx(FIXTURE); // fixture lighting has touched=0, so isDefault is true
  await T.TOOLS.audit_build.run(ctx, {});
  const rows = ctx.uiDetail.blocks.find((b) => b.type === 'table')?.rows ?? [];
  const subjects = rows.map((r) => r[1]);
  assert.ok(subjects.includes('lighting-pass'), `expected the untouched-Lighting defect, got ${JSON.stringify(subjects)}`);
});

test('a place WITH a lighting pass does not get the untouched-Lighting defect', async () => {
  // The other direction, so the check above is not passing for a reason unrelated to lighting.
  const lit = { ...FIXTURE, lighting: { ...FIXTURE.lighting, effects: ['Atmosphere', 'BloomEffect'], touched: 2 } };
  const { ctx } = stubCtx(lit);
  await T.TOOLS.audit_build.run(ctx, {});
  const subjects = (ctx.uiDetail.blocks.find((b) => b.type === 'table')?.rows ?? []).map((r) => r[1]);
  assert.equal(subjects.includes('lighting-pass'), false, 'a lit place must not be told its Lighting is default');
});

// --- the panel --------------------------------------------------------------------------------

test('the audit finds the planted defects and costs ZERO model calls', async () => {
  const { ctx, ops } = stubCtx(FIXTURE);
  const res = await T.TOOLS.audit_build.run(ctx, {});
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'get_tree']);
  assert.equal(ops.some((op) => op.op === 'run_code'), false);

  const subjects = (ctx.uiDetail.blocks.find((b) => b.type === 'table')?.rows ?? []).map((r) => r[1]);
  assert.ok(subjects.includes('unanchored-geometry'), `expected unanchored, got ${JSON.stringify(subjects)}`);
  assert.ok(subjects.includes('material-variety'), 'one material must be raised');
  assert.equal(res.blocking >= 1, true, 'unanchored geometry is blocking');
  assert.match(res.text, /0 model call/, 'the audit must call no model');
});

test('the result names BOTH silences, and does not collapse them into one', async () => {
  // A lens that examined nothing and a rule skipped inside a lens that did run are different
  // facts. Collapsing them would let "4 lenses run" stand for a lens that checked nothing.
  const { ctx } = stubCtx(FIXTURE);
  const res = await T.TOOLS.audit_build.run(ctx, {});

  assert.deepEqual(res.lensesNotRun, ['gameplay_readability'], 'the lens that could check nothing');
  assert.ok(res.rulesUnchecked > 0, 'and the rules skipped inside lighting');
  assert.deepEqual(res.lensesPartial.map((p) => p.lens), ['lighting']);
  assert.ok(res.lensesPartial[0].missing.length > 0, 'naming the metrics it lacked');

  assert.match(res.text, /NOT RUN/);
  assert.match(res.text, /gameplay_readability/);
  assert.match(res.text, /RULES SKIPPED/);
  assert.match(res.text, /faceValueSpread|figureGroundContrast/, 'by metric name, not vaguely');

  const callout = ctx.uiDetail.blocks.find((b) => b.type === 'callout');
  assert.match(callout.text, /Not run/);
  assert.match(callout.text, /skipped for want of a measurement/);
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
