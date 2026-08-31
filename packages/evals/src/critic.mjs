#!/usr/bin/env node
// Harness for the adversarial visual critic (apps/worker/src/critic.ts).
//
// Three jobs:
//   1. Load the critic out of the worker's TypeScript so the eval suite tests the SHIPPING code,
//      not a second copy of it that can drift. Same esbuild trick as composition-calibration.mjs.
//   2. Turn a stored scene into a CriticInput — render it, measure it, and hand the panel the
//      metric table that its evidence rules are checked against. Every metric name the critic's
//      rules reference is produced here; a rule naming a metric this file does not compute can
//      never fire, and there is a test that asserts the two sets match.
//   3. Run the panel over fixtures and write every CONFIRMED defect to the regression file,
//      automatically. Confirmed defects are the only thing that gets written: an unevidenced
//      criticism cannot enter the regression corpus, which is the whole point of the gate.
//
// The panel runs with NO model by default, so this costs nothing and is reproducible.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { renderScene } from './render-scene.mjs';
import {
  livePartsOf,
  boundsOf,
  detailScale,
  surfaceMeasures,
  silhouetteMetrics,
  interiorEdgeDensity,
  figureGroundContrast,
  geometryMask,
  luminance,
  measureProp,
  PROFILE_VIEWS,
  FULL_RES,
  DISTANT_RES,
} from './props.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
export const REGRESSION_PATH = join(HERE, '..', 'tasks-visual', 'props', 'regression', 'confirmed.jsonl');

/** Roblox Lighting defaults. Anything different is a decision someone made. */
export const DEFAULT_LIGHTING = { brightness: 3, clockTime: 14.5, ambient: [0, 0, 0], lightInstances: 0, effects: [] };

/** Bundle apps/worker/src/critic.ts and import it, so the tests exercise the shipping module. */
export async function loadCriticModule() {
  const src = join(REPO, 'apps', 'worker', 'src', 'critic.ts');
  const bin = join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild');
  const dest = join(tmpdir(), `golem-critic-${process.pid}-${process.hrtime.bigint()}.mjs`);
  execFileSync(bin, [src, '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`], {
    stdio: 'pipe',
    cwd: join(REPO, 'apps', 'worker'),
  });
  const mod = await import(`file://${dest}`);
  try {
    rmSync(dest, { force: true });
  } catch {
    /* best effort */
  }
  return mod;
}

// ---------------------------------------------------------------------------------------------
// Measurements the critic's evidence rules are checked against
// ---------------------------------------------------------------------------------------------

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const round = (v, n = 4) => Math.round(v * 10 ** n) / 10 ** n;

/**
 * Spread of luminance across geometry pixels, as p90 − p10.
 *
 * This is the one thing about lighting the rasteriser can honestly evidence. With one fixed sun
 * and flat Lambert shading, faces at different angles get different constant values; a form whose
 * faces all land on the same value has no volume in the image, however it was built. Percentiles
 * rather than min/max so a single stray pixel cannot carry it.
 */
export function faceValueSpread(rgb, width, height) {
  const mask = geometryMask(rgb, width, height);
  const vals = [];
  for (let i = 0; i < width * height; i++) if (mask[i]) vals.push(luminance([rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]]));
  if (vals.length < 20) return 0;
  vals.sort((a, b) => a - b);
  const at = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))];
  return at(0.9) - at(0.1);
}

/**
 * Pairs of parts that will z-fight: exactly coplanar faces AND interpenetrating volumes.
 *
 * BOTH clauses are needed, and getting this wrong the first time is instructive. Requiring only
 * coplanarity flags every stacked part in the suite — a plinth tier resting on the tier below
 * shares a face plane by construction — and the good trophy came back with 18 "defects" that are
 * just how you stack boxes. Two parts that merely TOUCH present one face each, pointing in
 * opposite directions, and the depth buffer has no ambiguity to resolve. The fight only happens
 * when the volumes actually overlap and two co-oriented faces land on the same plane, which is
 * what a decal slab pushed flush into a wall does.
 *
 * Axis-aligned parts only: a rotated part's faces are not on the axis planes, and a confident
 * wrong answer would be worse than no answer.
 */
export function coincidentFacePairs(parts) {
  const aligned = parts.filter((p) => !p.rot || isIdentity(p.rot));
  const span = (p, a) => [p.pos[a] - p.size[a] / 2, p.pos[a] + p.size[a] / 2];
  let pairs = 0;
  for (let i = 0; i < aligned.length; i++) {
    for (let j = i + 1; j < aligned.length; j++) {
      const a = aligned[i];
      const b = aligned[j];
      // interpenetration: strictly positive overlap on all three axes
      const interpenetrates = [0, 1, 2].every((ax) => {
        const [al, ah] = span(a, ax);
        const [bl, bh] = span(b, ax);
        return Math.min(ah, bh) - Math.max(al, bl) > 1e-6;
      });
      if (!interpenetrates) continue;
      const coplanar = [0, 1, 2].some((ax) => {
        const fa = span(a, ax);
        const fb = span(b, ax);
        return fa.some((x) => fb.some((y) => Math.abs(x - y) < 1e-6));
      });
      if (coplanar) pairs++;
    }
  }
  return pairs;
}

const isIdentity = (r) => [1, 0, 0, 0, 1, 0, 0, 0, 1].every((v, i) => Math.abs(r[i] - v) < 1e-9);

export function lightingTouchedProperties(l) {
  if (!l) return 0;
  let n = 0;
  if (Math.abs((l.brightness ?? DEFAULT_LIGHTING.brightness) - DEFAULT_LIGHTING.brightness) > 0.01) n++;
  if (Math.abs((l.clockTime ?? DEFAULT_LIGHTING.clockTime) - DEFAULT_LIGHTING.clockTime) > 0.01) n++;
  if ((l.ambient ?? DEFAULT_LIGHTING.ambient).some((v, i) => v !== DEFAULT_LIGHTING.ambient[i])) n++;
  if ((l.lightInstances ?? 0) > 0) n++;
  if ((l.effects ?? (l.hasAtmosphere ? ['Atmosphere'] : [])).length > 0) n++;
  return n;
}

/**
 * Build the full metric table. EVERY name a critic rule can cite must appear here — a rule naming
 * a metric this function does not produce is silently dead, and critic.test.mjs asserts the two
 * sets agree so that can never happen unnoticed.
 */
export function criticInputFromScene(scene, { intent, subject = 'prop', requestedElements = [], measured = null } = {}) {
  const parts = livePartsOf(scene);
  const b = boundsOf(parts);
  const m = measured ?? measureProp(scene);

  const full = renderScene(scene, { ...FULL_RES, view: 'all' });
  const profileViews = full.views.filter((v) => PROFILE_VIEWS.includes(v.name));
  const contrast = mean(profileViews.map((v) => figureGroundContrast(v.rgb, v.meta.width, v.meta.height)));
  const spread = mean(profileViews.map((v) => faceValueSpread(v.rgb, v.meta.width, v.meta.height)));

  const tiny = parts.filter((p) => Math.max(...p.size) < 0.2).length;
  const unanchored = parts.filter((p) => p.anchored === false).length;

  return {
    intent,
    subject,
    views: full.views.map((v) => ({ name: v.name, width: v.meta.width, height: v.meta.height })),
    requestedElements,
    lighting: scene.lighting
      ? {
          brightness: scene.lighting.brightness ?? DEFAULT_LIGHTING.brightness,
          clockTime: scene.lighting.clockTime ?? DEFAULT_LIGHTING.clockTime,
          ambient: scene.lighting.ambient ?? DEFAULT_LIGHTING.ambient,
          lightInstances: scene.lighting.lightInstances ?? 0,
          effects: scene.lighting.effects ?? (scene.lighting.hasAtmosphere ? ['Atmosphere'] : []),
          isDefault: lightingTouchedProperties(scene.lighting) === 0,
        }
      : { ...DEFAULT_LIGHTING, isDefault: true },
    metrics: {
      // composition
      scaleEntropy: round(m.scale.entropy),
      profileCV: round(m.silhouette.profileCV),
      boxFill: round(m.silhouette.boxFill),
      // roblox level design
      heightStuds: round(b.size[1], 2),
      partCount: parts.length,
      tinyPartShare: round(parts.length ? tiny / parts.length : 0),
      unanchoredParts: unanchored,
      // technical art
      factoryDefaultShare: round(m.surface.factoryShare),
      distinctMaterials: m.surface.distinctMaterials,
      distinctColours: m.surface.distinctColours,
      coincidentFacePairs: coincidentFacePairs(parts),
      smallPartShare: round(m.scale.shares.small),
      // lighting — only what the flat-Lambert single-sun rasteriser can evidence
      figureGroundContrast: round(contrast, 2),
      faceValueSpread: round(spread, 2),
      lightingTouchedProperties: lightingTouchedProperties(scene.lighting),
      // gameplay readability, from the deliberate 96x60 downsample
      distantInteriorEdgeDensity: round(m.distant.interiorEdgeDensity),
      distantContrast: round(m.distant.contrast, 2),
      distantCoverage: round(m.distant.coverage),
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Running the panel over fixtures, and writing the regression corpus
// ---------------------------------------------------------------------------------------------

/**
 * Run the panel over a set of {id, scene, intent} entries and APPEND every confirmed defect to
 * the regression file. Nothing else is written: a criticism that failed the evidence gate or the
 * adjudication rule leaves no trace in the corpus, by design.
 *
 * `now` is injectable so a test run produces a byte-stable file.
 */
export async function runCriticSuite(entries, { critic, path = REGRESSION_PATH, write = true, now = new Date(), panelOptions = {} } = {}) {
  const C = critic ?? (await loadCriticModule());
  const results = [];
  const records = [];
  for (const e of entries) {
    const input = e.input ?? criticInputFromScene(e.scene, { intent: e.intent, subject: e.subject, requestedElements: e.requestedElements });
    const r = await C.runCriticPanel(input, { now, ...panelOptions });
    results.push({ id: e.id, input, ...r });
    for (const rec of r.regression) records.push({ ...rec, fixture: e.id });
  }
  if (write) {
    mkdirSync(dirname(path), { recursive: true });
    const header = `# Confirmed visual defects. Written automatically by packages/evals/src/critic.mjs.\n# Every line survived the evidence gate AND adjudication in apps/worker/src/critic.ts.\n# "fixedWhen" is the assertion a later run must satisfy for the defect to count as fixed.\n`;
    writeFileSync(path, header + records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : ''));
  }
  return { results, records, path };
}

/** Read the corpus back. Comment lines are skipped, so the file stays self-describing. */
export function loadRegression(path = REGRESSION_PATH) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'))
    .map((l) => JSON.parse(l));
}

// ---------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const C = await loadCriticModule();
  const { buildSuiteFixtures } = await import(join(HERE, '..', 'tasks-visual', 'props', 'build-fixtures.mjs'));
  const { loadSuite, getPropSpec } = await import('./props.mjs');
  const suite = loadSuite();
  const entries = buildSuiteFixtures().map((f) => ({
    id: f.id,
    scene: f.scene,
    intent: getPropSpec(suite, f.prop).prompt,
    subject: 'prop',
  }));
  const { results, records, path } = await runCriticSuite(entries, { critic: C });
  for (const r of results) {
    console.log(`\n=== ${r.id} ===`);
    console.log(C.formatPanelReport(r));
  }
  console.log(`\n${records.length} confirmed defect(s) written to ${path}`);
}
