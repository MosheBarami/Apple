// The critic, reachable from a product path.
//
// THE DEFECT. `critic.ts` was 900 lines of measured rules with an evidence gate — a criticism that
// cannot cite a number is DISCARDED rather than down-weighted — and NONE of it shipped. Its only
// importer anywhere was a test; the deployed worker bundle contained zero occurrences of
// `runCriticPanel` against a control of six for `inspect_visually`. The repository's own audit had
// said so twice. Under §2.3 that is a dead end, not a feature: a capability exists only if a
// reachable product path executes it.
//
// So these tests are about REACHABILITY as much as behaviour. The bundle assertion is the one that
// would have caught the original state, and no amount of unit testing would have.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ESBUILD = join(WORKER, 'node_modules', '.bin', 'esbuild');

const out = join(tmpdir(), `apple-critic-input-${process.pid}.mjs`);
execFileSync(ESBUILD, [
  join(WORKER, 'src', 'critic-input.ts'), '--bundle', '--format=esm', '--target=es2022',
  '--main-fields=main,module', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const { criticInputFromRender, metricsFromRender, lightingIsDefault } = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

const view = (name, over = {}) => ({
  name,
  rgbBase64: '',
  meta: {
    width: 288, height: 180, partsConsidered: 40, partsVisible: 36, partsOffCamera: 4,
    subjectCoverage: 0.42, distinctColours: 6,
    materials: [{ material: 'Plastic', parts: 20 }, { material: 'Wood', parts: 16 }],
    ...over,
  },
});

const RENDER = {
  subject: 'Workspace/Trophy',
  boundsSize: [8, 12, 8],
  views: [view('hero'), view('front')],
  lighting: { brightness: 2.4, clockTime: 16.2, ambient: [42, 44, 52], lightInstances: 2, effects: ['Atmosphere'] },
};

// -------------------------------------------------------------- REACHABILITY ---

test('the critic SHIPS — the deployed entry point bundles it', () => {
  // This is the assertion that would have caught the dead end. Every unit test in
  // packages/evals/src/critic.test.mjs passed while zero bytes of critic.ts reached production.
  const bundle = join(tmpdir(), `apple-worker-bundle-${process.pid}.mjs`);
  execFileSync(ESBUILD, [
    join(WORKER, 'src', 'index.ts'), '--bundle', '--format=esm', '--target=es2022',
    '--external:cloudflare:workers', `--outfile=${bundle}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  const text = readFileSync(bundle, 'utf8');
  rmSync(bundle, { force: true });

  for (const symbol of ['runCriticPanel', 'applyMetricRules', 'criticInputFromRender', 'lightingConfigCriticisms']) {
    assert.ok(text.includes(symbol), `${symbol} is absent from the deployed bundle — the critic does not ship`);
  }
  // Controls: if these were also absent the bundle itself would be wrong and the test above would
  // be passing for the wrong reason.
  for (const control of ['inspect_visually', 'lastRender']) {
    assert.ok(text.includes(control), `control ${control} missing — the bundle is not what it should be`);
  }
});

test('inspect_visually is what reaches it, and the panel costs no model call', () => {
  const tools = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const block = tools.slice(tools.indexOf('inspect_visually: {'), tools.indexOf('search_docs: {'));
  assert.match(block, /runCriticPanel\(criticInputFromRender\(res, intent\)\)/);
  // No judge argument: the deterministic lenses run and no model is called, so the panel is free.
  assert.doesNotMatch(block, /runCriticPanel\([^)]*judge/);
});

// ------------------------------------------------------ what the render knows ---

test('every metric supplied is one the render actually measured', () => {
  const m = metricsFromRender(RENDER);
  assert.equal(m.partCount, 36);
  assert.equal(m.distinctColours, 6);
  assert.equal(m.distinctMaterials, 2);
  assert.equal(m.heightStuds, 12);
  // F-059: Plastic in six chosen colours is a style, so no factory-default share is reported.
  assert.equal('factoryDefaultShare' in m, false);
  // In three colours or fewer it is reported: 40 Plastic of 72 parts across two views.
  const grey = metricsFromRender({ ...RENDER, views: [view('hero', { distinctColours: 2 }), view('front', { distinctColours: 2 })] });
  assert.ok(Math.abs(grey.factoryDefaultShare - 40 / 72) < 1e-9, `got ${grey.factoryDefaultShare}`);
});

test('parts are taken as the MAXIMUM across views, not one camera\'s count', () => {
  // A part hidden behind another in one view is still a part. Taking the hero's count alone
  // under-reports the scene, and every rule keyed to partCount then judges the wrong number.
  const m = metricsFromRender({ ...RENDER, views: [view('hero', { partsVisible: 12 }), view('front', { partsVisible: 31 })] });
  assert.equal(m.partCount, 31);
});

test('the plugin already sends Ambient as 0-255, so nothing scales it twice', () => {
  // apps/plugin/src/Render.luau does `math.round(L.Ambient.R * 255)` before sending. The web
  // adapter multiplied by 255 again, so rgb(42, 44, 52) rendered as "10710, 11220, 13260" — in the
  // very panel that exists to show the user what the critic looked at.
  const adapters = readFileSync(join(WORKER, '..', 'web', 'src', 'lib', 'generative-ui', 'adapters.ts'), 'utf8');
  const block = adapters.slice(adapters.indexOf("key: 'Ambient'"), adapters.indexOf("key: 'Ambient'") + 400);
  assert.doesNotMatch(block, /n \* 255/, 'the plugin has already scaled it');
});

test('the five pixel-derived metrics are ABSENT, not guessed', () => {
  // Their semantics are defined by the eval harness — faceValueSpread is implemented there, and
  // distantContrast comes from a downsample whose resolution and masking would have to be inferred.
  // A guessed metric feeds the critic a confident wrong number, which is worse than a lens that
  // honestly did not run. The panel reports them as unchecked; that is the correct outcome.
  const m = metricsFromRender(RENDER);
  for (const k of ['faceValueSpread', 'distantContrast', 'distantCoverage', 'distantInteriorEdgeDensity', 'figureGroundContrast']) {
    assert.equal(k in m, false, `${k} must not be invented`);
  }
});

test('a render with no lighting report supplies no lighting metric', () => {
  const { lighting, ...bare } = RENDER;
  const m = metricsFromRender(bare);
  assert.equal('lightingTouchedProperties' in m, false);
});

// ------------------------------------------------------------- default lighting ---

test('untouched Roblox lighting is recognised as untouched', () => {
  // 3 and 14.5, from apps/worker/src/roblox-defaults.ts. An earlier version of this file asserted
  // 2 and 14 — values invented alongside the code, with this test pinning the invention while a
  // SECOND table in vision.ts said something else. The numbers are still not independently
  // verified; what is fixed is that there is now one place to correct them.
  assert.equal(
    lightingIsDefault({ brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [] }),
    true,
  );
});

test('there is exactly ONE default-lighting table in the worker', () => {
  // The defect this replaced: vision.ts and critic-input.ts each carried their own, disagreeing,
  // and both decided the same question — has anyone lit this scene? Two answers for one scene.
  const files = execFileSync('git', ['grep', '-l', 'clockTime: 14', '--', 'apps/worker/src'], {
    cwd: join(WORKER, '..', '..'), encoding: 'utf8',
  }).split('\n').filter(Boolean);
  assert.deepEqual(files, ['apps/worker/src/roblox-defaults.ts'], `defaults are defined in ${files.length} places`);
});

test('Ambient rgb(0,0,0) alone does not mean somebody chose it', () => {
  // (0,0,0) IS the default, so a scene that set it deliberately is indistinguishable from one
  // nobody touched. The light instances and effects are the tiebreak: adding either is a decision.
  assert.equal(
    lightingIsDefault({ brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 1, effects: [] }),
    false,
  );
  assert.equal(
    lightingIsDefault({ brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: ['Atmosphere'] }),
    false,
  );
});

test('any touched property means lighting was decided', () => {
  for (const over of [{ brightness: 1 }, { clockTime: 6 }, { ambient: [10, 10, 10] }]) {
    assert.equal(
      lightingIsDefault({ brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [], ...over }),
      false,
      JSON.stringify(over),
    );
  }
});

test('the touched-property COUNT is what the lighting lens cites', () => {
  const m = metricsFromRender(RENDER);
  // brightness, clockTime, ambient, lightInstances, effects — all five differ from the default.
  assert.equal(m.lightingTouchedProperties, 5);
  const untouched = metricsFromRender({
    ...RENDER,
    lighting: { brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [] },
  });
  assert.equal(untouched.lightingTouchedProperties, 0);
});

// ------------------------------------------------------------------ the input ---

test('a workspace render is a SCENE and a targeted render is a PROP', () => {
  // The panel's rules differ between the two, so guessing wrong changes the verdict.
  assert.equal(criticInputFromRender({ ...RENDER, subject: 'Workspace' }, 'x').subject, 'scene');
  assert.equal(criticInputFromRender(RENDER, 'x').subject, 'prop');
});

test('the intent reaches the input verbatim — it is what the critique is judged against', () => {
  assert.equal(criticInputFromRender(RENDER, 'a brass trophy on a plinth').intent, 'a brass trophy on a plinth');
});

test('the views carry their real pixel dimensions', () => {
  const input = criticInputFromRender(RENDER, 'x');
  assert.deepEqual(input.views, [
    { name: 'hero', width: 288, height: 180 },
    { name: 'front', width: 288, height: 180 },
  ]);
});

test('a defect the panel CONFIRMS reaches the agent, not only the screen', () => {
  // THE DEFECT THIS CLOSES. `panel` went into ctx.uiDetail and nowhere else. uiDetail is the
  // browser. The retry loop reads ctx.lastCritique, and session.ts decides visualDefectsFound
  // from it — so the panel could confirm a measured defect, print it in the workspace, and the
  // run would still report a clean build and move on.
  //
  // This repository recorded "the panel is display-only" as an outstanding item in two
  // consecutive pass records without closing it, which is its own finding: a defect written down
  // often enough starts reading as a feature of the landscape.
  const TOOLS = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  // COMMENTS STRIPPED FIRST. The block below is heavily commented — deliberately, since it
  // explains why the panel's verdict may override the model's — and every assertion here is a
  // match on source text. Without this, commenting OUT `critique.passed = false;` leaves the
  // string `critique.passed = false` in the file and the assertion still passes. Verified: the
  // first version of this test survived exactly that break.
  const live = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const wire = live(TOOLS.slice(TOOLS.indexOf('const panel = await runCriticPanel('), TOOLS.indexOf('SHOW THE USER WHAT THE CRITIC LOOKED AT')));

  assert.match(wire, /panel\.adjudication\.confirmed\.length/, 'the confirmed list must be consulted');
  assert.match(wire, /critique\.hardFails = \[/, 'confirmations must join hardFails, which already reaches the model, the UI and the retry loop');
  assert.match(wire, /critique\.passed = false/, 'a measured, evidence-backed defect is not a clean build');

  // ORDER. ctx.lastCritique must be assigned AFTER the merge, or the retry loop reads the
  // pre-panel verdict and the wiring above changes nothing that matters.
  assert.ok(
    live(TOOLS).indexOf('critique.passed = false') < live(TOOLS).indexOf('ctx.lastCritique = critique'),
    'the panel must be merged BEFORE the critique is published to the run',
  );

  // UNCHECKED MUST NOT FAIL A BUILD. An absence of evidence is not evidence of a defect, and
  // inverting that would make a partial run indistinguishable from a bad one.
  assert.equal(/panel\.unchecked\.length\s*\)?\s*\{?[^}]*passed = false/.test(wire), false,
    'an unchecked rule must never fail the build');
});
