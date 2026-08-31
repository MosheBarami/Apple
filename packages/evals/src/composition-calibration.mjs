// Rank every candidate composition metric against the labelled ladder, and say plainly which ones
// do not work.
//
// This file is the evidence behind docs/COMPOSITION.md. It reports, per metric:
//   auc  probability that a randomly chosen good fixture (label >= 5) outranks a randomly chosen
//        bad one (label <= 3). 0.5 is a coin flip, 1.0 is perfect separation. This decides whether
//        a metric is kept, because a correlation can be carried by the middle of the ladder while
//        the metric still cannot tell good from bad.
//   rho  Spearman rank correlation against the label. Sign matters and is reported: several honest
//        metrics are legitimately negative (energyEntropy should FALL as composition improves).
//   fp   adversarial fixtures the metric ranks in its own top third — its false positives.
//
// Three metric families are ranked side by side, deliberately:
//   * composition.ts   the new masked-pixel, spatial-dispersion and silhouette statistics
//   * layout-metrics   the geometry statistics that already existed, whose bands their own source
//                      marks [PROV] — provisional, reasoned rather than calibrated. They are put
//                      through the same test rather than grandfathered.
//   * controls         part count, material count, colour count. If a new metric cannot beat raw
//                      part count it has bought nothing, and the whole premise of this work is that
//                      part count is not composition.
//
// There is ONE implementation of the new metrics: apps/worker/src/composition.ts, the file
// production runs. It is transpiled here with the esbuild already vendored for the worker build, so
// this harness cannot drift from production the way a hand-copied mirror would.

import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { deflateSync } from 'node:zlib';
import { tmpdir } from 'node:os';
import { renderScene } from './render-scene.mjs';
import { buildLadder } from './composition-ladder.mjs';
import { layoutMetrics } from './layout-metrics.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const OUT = join(HERE, '..', 'tasks-visual', 'composition');

/**
 * Bundle the production TypeScript metrics module and import it. One implementation, no mirror.
 * Bundled rather than merely transpiled because composition.ts imports verticalElementHeights from
 * @golem/shared, and a bare transpile would emit an import a temp file cannot resolve.
 */
export async function loadCompositionModule() {
  const src = join(REPO, 'apps', 'worker', 'src', 'composition.ts');
  const bin = join(REPO, 'apps', 'worker', 'node_modules', '.bin', 'esbuild');
  const dest = join(tmpdir(), `golem-composition-${process.pid}-${process.hrtime.bigint()}.mjs`);
  execFileSync(bin, [src, '--bundle', '--format=esm', '--target=es2022', `--outfile=${dest}`], {
    stdio: 'pipe',
    cwd: join(REPO, 'apps', 'worker'),
  });
  const mod = await import(`file://${dest}`);
  try { rmSync(dest, { force: true }); } catch { /* best effort */ }
  return mod;
}

// ---- statistics ------------------------------------------------------------------------------

/** Ranks with ties averaged — several fixtures share a label, so ties are the normal case. */
function ranks(xs) {
  const idx = xs.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(xs.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
    i = j + 1;
  }
  return r;
}

export function spearman(a, b) {
  const ra = ranks(a);
  const rb = ranks(b);
  const n = a.length;
  const ma = ra.reduce((x, y) => x + y, 0) / n;
  const mb = rb.reduce((x, y) => x + y, 0) / n;
  let num = 0; let da = 0; let db = 0;
  for (let i = 0; i < n; i++) {
    num += (ra[i] - ma) * (rb[i] - mb);
    da += (ra[i] - ma) ** 2;
    db += (rb[i] - mb) ** 2;
  }
  return da && db ? num / Math.sqrt(da * db) : 0;
}

/** AUC over the good/bad split, ties counted as half. `sign` orients the metric. */
export function auc(values, labels, sign, badMax = 3, goodMin = 5) {
  const bad = values.filter((_, i) => labels[i] <= badMax);
  const good = values.filter((_, i) => labels[i] >= goodMin);
  if (!bad.length || !good.length) return 0.5;
  let wins = 0;
  for (const g of good) {
    for (const b of bad) {
      const d = (g - b) * sign;
      wins += d > 0 ? 1 : d === 0 ? 0.5 : 0;
    }
  }
  return wins / (good.length * bad.length);
}

/**
 * The expected direction of every candidate, declared BEFORE the numbers are looked at: +1 means a
 * higher value should mean a better composition, -1 means lower is better. This exists because the
 * first run of this harness fitted each sign to the data, which is circular — with 11 fixtures,
 * taking whichever of +/- scores higher guarantees an AUC at or above 0.5 for pure noise, and
 * "centroidOffset, AUC 1.000" came out of exactly that mistake.
 *
 * Each entry is a falsifiable claim about what the statistic detects:
 *   maskedColorfulness  +  a build using one grey tone is worse than one using a palette
 *   interiorEdgeDensity +  bare untextured surfaces are worse than modelled ones
 *   figureGroundContrast+  a build that matches its ground in value does not read
 *   energyGini          +  visual energy concentrated into a focal region beats energy spread flat
 *   occupancyGini       +  so does mass concentrated into structures rather than smeared
 *   energyEntropy       -  perfectly even energy is the mush signature
 *   occupiedCellShare   +  a scene should occupy its frame, not hide in one corner
 *   centroidOffset      +  ONLY as declared by the first run's accidental result; see COMPOSITION.md
 *   silhouette*         +  a varied, peaked skyline beats a flat one
 *   verticalDominance   +  one element should dominate the verticals
 *   heightHierarchy     +  the tallest thing should stand above the typical thing
 *   volumeGini          +  large/medium/small beats every mass identical
 *   footprintOccupancy  -  wall-to-wall fill leaves no negative space
 *   heightBandEntropy   +  volume spread over height beats everything in one band
 *   landmarkShare       -  one mass owning all the volume means there is no scene around it
 *   massCount/massHier  +  declared for completeness; both are rejected on other grounds
 *   layout.latticeScore -  snapping to one grid pitch is the stamped-out signature
 *   layout.rotationEntropy + varied facing beats every prop pointing the same way
 *   layout.neighbourSpacingCV + fence-post regularity is mechanical
 *   layout.symmetryX    -  perfect mirror symmetry reads as machine-placed
 *   layout.propDensity  +  an under-dressed space is the more common failure here
 *   control.*           +  the project's own null hypothesis: more parts/materials/colours is better
 */
export const DIRECTION = {
  coverage: 1, maskedColorfulness: 1, interiorEdgeDensity: 1, figureGroundContrast: 1,
  energyGini: 1, occupancyGini: 1, energyEntropy: -1, occupiedCellShare: 1, centroidOffset: 1,
  silhouetteRange: 1, silhouettePeakProminence: 1, silhouetteRoughness: 1,
  'structure.parts': 1, 'structure.volumeGini': 1, 'structure.massHierarchy': 1,
  'structure.massCount': 1, 'structure.verticalDominance': 1, 'structure.verticalElements': 1,
  'structure.heightHierarchy': 1, 'structure.footprintOccupancy': -1,
  'structure.heightBandEntropy': 1, 'structure.landmarkShare': -1,
  'layout.neighbourSpacingCV': 1, 'layout.latticeScore': -1, 'layout.rotationEntropy': 1,
  'layout.symmetryX': -1, 'layout.propDensity': 1,
  'control.partCount': 1, 'control.materialCount': 1, 'control.colourCount': 1,
};

// ---- per-scene aggregation -------------------------------------------------------------------

// Different cameras answer different questions, so the scene number is not a blind average.
// A silhouette only exists from a ground-level or three-quarter camera; a top-down view has none.
const TOP_VIEW = 'top';
const SILHOUETTE_KEYS = new Set(['silhouetteRange', 'silhouettePeakProminence', 'silhouetteRoughness']);

function aggregate(views, keys) {
  const out = {};
  const usable = views.filter((v) => v.metrics.coverage >= 0.05);
  const nonTop = usable.filter((v) => v.name !== TOP_VIEW);
  for (const k of keys) {
    const pool = SILHOUETTE_KEYS.has(k) ? (nonTop.length ? nonTop : usable) : usable;
    const vals = pool.map((v) => v.metrics[k]).filter((v) => typeof v === 'number');
    if (!vals.length) { out[k] = 0; continue; }
    const s = [...vals].sort((a, b) => a - b);
    out[k] = s[Math.floor(s.length / 2)]; // median: one odd camera must not decide a scene
  }
  return out;
}

// ---- minimal PNG writer (contact sheets only) --------------------------------------------------

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(rgb, width, height) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * width * 3, width * 3).copy(raw, y * (width * 3 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0; // 8-bit truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Lay every view of one scene side by side so a human can check the metric against the picture. */
export function contactSheet(views, w, h) {
  const W = w * views.length;
  const rgb = new Uint8Array(W * h * 3);
  views.forEach((v, k) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const src = (y * w + x) * 3;
        const dst = (y * W + k * w + x) * 3;
        rgb[dst] = v.rgb[src];
        rgb[dst + 1] = v.rgb[src + 1];
        rgb[dst + 2] = v.rgb[src + 2];
      }
    }
  });
  return { rgb, width: W, height: h };
}

// ---- main ------------------------------------------------------------------------------------

/**
 * Blind-jury consensus, when it exists: four independent critics scored the anonymised contact
 * sheets 1-10 with no access to the labels, the metrics or how the scenes were made, each under a
 * different critical lens (environment artist, level designer, hostile art director, photographer).
 * Their mean is a better ground truth than the author's prior and is used whenever available; the
 * two agree at Spearman 0.942, and where they differ the jury wins.
 */
function juryLabels() {
  try {
    const j = JSON.parse(readFileSync(join(OUT, 'blind', 'jury.json'), 'utf8'));
    const byId = {};
    for (const c of j.consensus) byId[c.id] = c.mean;
    return byId;
  } catch {
    return null;
  }
}

export async function calibrate({ write = false, width = 288, height = 180, useJury = true } = {}) {
  const { compositionMetrics, structureMetrics } = await loadCompositionModule();
  const ladder = buildLadder();
  const rows = [];

  for (const entry of ladder) {
    const r = renderScene(entry.scene, { width, height, view: 'all' });
    if (r.error) throw new Error(`${entry.id}: ${r.error}`);
    const views = r.views.map((v) => ({
      name: v.name,
      metrics: compositionMetrics(v.rgb, v.meta.width, v.meta.height),
    }));
    const live = entry.scene.parts.filter((p) => p.size[0] <= 600 && p.size[2] <= 600);
    rows.push({
      id: entry.id,
      label: entry.label,
      source: entry.source,
      failure: entry.failure,
      parts: live.length,
      materials: new Set(live.map((p) => p.material)).size,
      colours: new Set(live.map((p) => (p.color ?? []).join(','))).size,
      views,
      structure: structureMetrics(live),
      layout: layoutMetrics(entry.scene, { kind: 'plaza' }),
      rgbViews: r.views,
    });
  }

  const imageKeys = Object.keys(rows[0].views[0].metrics);
  const structKeys = Object.keys(rows[0].structure);
  const layoutKeys = ['neighbourSpacingCV', 'latticeScore', 'rotationEntropy', 'symmetryX', 'propDensity'];
  for (const row of rows) row.agg = aggregate(row.views, imageKeys);

  // Ground truth: jury consensus if we have it, the author's prior otherwise. The split thresholds
  // move with the scale — the jury scores 1-10, the prior 1-9 — and a gap is left in the middle so
  // "good vs bad" means something rather than splitting a continuum at an arbitrary point.
  const jury = useJury ? juryLabels() : null;
  const labels = rows.map((r) => (jury && jury[r.id] != null ? jury[r.id] : r.label));
  const badMax = jury ? 3 : 3;
  const goodMin = jury ? 5.5 : 5;
  const truth = jury ? 'blind jury consensus (4 independent critics)' : "author's prior labels";
  const report = [];

  const consider = (metric, family, values) => {
    // a metric that is constant across the ladder measures nothing here, whatever it measures
    const finite = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
    const expected = DIRECTION[metric];
    if (expected === undefined) throw new Error(`no a-priori direction declared for ${metric}`);
    if (new Set(finite).size === 1) {
      report.push({ metric, family, rho: 0, auc: 0.5, sign: expected, constant: true, signAgrees: true, falsePositives: [], values: finite });
      return;
    }
    const rho = spearman(finite, labels);
    // AUC is measured with the DECLARED direction, never with the direction that flatters the
    // metric. Fitting the sign to the data is how a coin-flip metric is made to look decisive:
    // with 11 fixtures, taking whichever of +/- scores higher guarantees auc >= 0.5 for noise.
    const a = auc(finite, labels, expected, badMax, goodMin);
    const order = finite.map((v, i) => [v * expected, rows[i]]).sort((x, y) => y[0] - x[0]);
    const topThird = order.slice(0, Math.max(1, Math.ceil(order.length / 3))).map(([, r]) => r);
    const falsePositives = topThird.filter((r) => r.source.includes('adversarial')).map((r) => r.id);
    report.push({
      metric, family, rho: +rho.toFixed(3), auc: +a.toFixed(3), sign: expected,
      // a metric whose measured correlation runs against its own theory is refuted, not discovered
      signAgrees: rho === 0 || Math.sign(rho) === expected,
      constant: false, falsePositives, values: finite,
    });
  };

  for (const k of imageKeys) consider(k, 'composition.image', rows.map((r) => r.agg[k]));
  for (const k of structKeys) consider(`structure.${k}`, 'composition.geometry', rows.map((r) => r.structure[k]));
  for (const k of layoutKeys) consider(`layout.${k}`, 'layout-metrics [PROV]', rows.map((r) => r.layout?.[k] ?? 0));
  consider('control.partCount', 'control', rows.map((r) => r.parts));
  consider('control.materialCount', 'control', rows.map((r) => r.materials));
  consider('control.colourCount', 'control', rows.map((r) => r.colours));

  report.sort((a, b) => b.auc - a.auc || Math.abs(b.rho) - Math.abs(a.rho));

  if (write) {
    mkdirSync(join(OUT, 'ladder'), { recursive: true });
    for (const row of rows) {
      const sheet = contactSheet(row.rgbViews, width, height);
      writeFileSync(join(OUT, 'ladder', `${row.id}.png`), encodePng(sheet.rgb, sheet.width, sheet.height));
    }
    writeFileSync(
      join(OUT, 'metrics.json'),
      JSON.stringify(
        {
          generatedBy: 'packages/evals/src/composition-calibration.mjs',
          render: { width, height },
          groundTruth: truth,
          split: { badMax, goodMin },
          labelsUsed: rows.map((r, i) => ({ id: r.id, priorLabel: r.label, truth: labels[i] })),
          rows: rows.map(({ rgbViews, agg, ...keep }) => keep),
          report: report.map(({ values, ...keep }) => keep),
        },
        null,
        2,
      ) + '\n',
    );
  }

  return { rows, report, groundTruth: truth };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const write = process.argv.includes('--write');
  const { rows, report, groundTruth } = await calibrate({ write });

  console.log('\n=== LADDER (part/material/colour counts are held near-constant on purpose) ===');
  console.log('id'.padEnd(15), 'lbl', 'parts', 'mat', 'col', ' source');
  for (const r of rows) {
    console.log(
      r.id.padEnd(15),
      String(r.label).padStart(3),
      String(r.parts).padStart(5),
      String(r.materials).padStart(3),
      String(r.colours).padStart(3),
      ' ' + r.source.slice(0, 44),
    );
  }

  console.log(`\nground truth: ${groundTruth}`);
  console.log('\n=== METRIC RANKING — auc separates good from bad; 0.5 is a coin flip ===');
  console.log('  (dir is DECLARED a priori; REFUTED = the data contradicts the declared direction)');
  console.log('metric'.padEnd(32), 'auc'.padStart(6), 'rho'.padStart(7), 'dir', 'verdict', ' family / false positives');
  for (const m of report) {
    const verdict = m.constant
      ? 'CONST '
      : !m.signAgrees
        ? 'REFUTED'
        : m.auc >= 0.9
          ? 'KEEP  '
          : m.auc >= 0.75
            ? 'weak  '
            : 'REJECT';
    console.log(
      m.metric.padEnd(32),
      m.auc.toFixed(3).padStart(6),
      m.rho.toFixed(3).padStart(7),
      m.sign > 0 ? ' up ' : ' dn ',
      verdict.padEnd(7),
      ` ${m.family}`,
      m.falsePositives.length ? `FP:${m.falsePositives.join(',')}` : '',
    );
  }
  if (write) console.log(`\nwrote ${join(OUT, 'metrics.json')} and ladder/*.png`);
}
