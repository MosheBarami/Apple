#!/usr/bin/env node
// Visual-quality grader for Golem built scenes.
//
// The coding eval suite (packages/evals) measures whether the model writes correct
// Luau. It scores 98.9% and is completely blind to the fact that the scenes it
// builds look like block-outs. This grader looks at PIXELS.
//
// Evidence in (per task run):
//   - rendered screenshots from several viewpoints (hero/front/side/top/eye),
//     produced by the Studio plugin's software renderer (apps/plugin/src/Render.luau)
//   - a structural metrics JSON derived from the same capture
//       {boundsSize, views[{partsVisible, subjectCoverage, distinctColours, materials}],
//        ground, lighting, parts}
// Evidence out:
//   - per-dimension 0-4 scores WITH an observed justification for each
//   - a list of named defects from the rubric's defect vocabulary
//   - a weighted total, hard-fail list, and PASS/FAIL against the quality gate
//
// The central rule this file enforces: A SCENE CANNOT PASS ON OBJECT EXISTENCE.
// prompt_fidelity is 6 of 100 weight points and is clamped so no per-task emphasis
// can raise it. Hard-fail conditions (bare baseplate, one material, default lighting,
// no small props, absent landmark, nothing rendered, flat slab) cap the total at
// 1.4/4 — comfortably below the 2.6/4 pass threshold — regardless of every other score.
//
// Usage:
//   # grade from a canned critique, no model call (offline, deterministic)
//   node grade-visual.mjs --dry-run --task vis-03-plaza \
//     --metrics fixtures/metrics-good.json --critique fixtures/critique-good.json
//
//   # grade a whole regression run directory (metrics.json + critique.json per task)
//   node grade-visual.mjs --dry-run --run regression/2026-08-30-baseline
//
//   # live: send screenshots to the vision model, then grade the critique it returns
//   API_BASE=https://<worker-host> ADMIN_KEY=... \
//     node grade-visual.mjs --task vis-03-plaza --metrics run/metrics.json --model iris
//
// Every scoring function below is pure and exported so it can be unit-tested with no
// model, no network and no images (see grade-visual.test.mjs).
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname, isAbsolute } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RUBRIC_PATH = join(HERE, 'rubric.json');
export const TASKS_PATH = join(HERE, 'tasks.json');
export const REGRESSION_DIR = join(HERE, 'regression');

/** Per-task emphasis multipliers are clamped to this range so no task can rewrite the rubric. */
export const EMPHASIS_MIN = 0.5;
export const EMPHASIS_MAX = 2.0;
/** prompt_fidelity may be de-emphasised but never emphasised. See clampPromptFidelity(). */
export const FIDELITY_DIMENSION = 'prompt_fidelity';

const IMAGE_MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

export class VisualGradeError extends Error {
  constructor(message) {
    super(message);
    this.name = 'VisualGradeError';
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

export function loadJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new VisualGradeError(`cannot read JSON at ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function loadRubric(path = RUBRIC_PATH) {
  const r = loadJson(path);
  const errs = validateRubric(r);
  if (errs.length) throw new VisualGradeError(`invalid rubric:\n  ${errs.join('\n  ')}`);
  return r;
}

export function validateRubric(rubric) {
  const errs = [];
  if (!rubric || typeof rubric !== 'object') return ['rubric is not an object'];
  if (!Array.isArray(rubric.dimensions) || rubric.dimensions.length === 0) errs.push('rubric.dimensions must be a non-empty array');
  if (!rubric.gate || typeof rubric.gate !== 'object') errs.push('rubric.gate is required');
  const seen = new Set();
  for (const d of rubric.dimensions ?? []) {
    if (!d?.id) errs.push('a dimension is missing id');
    else if (seen.has(d.id)) errs.push(`duplicate dimension id ${d.id}`);
    else seen.add(d.id);
    if (!(typeof d?.weight === 'number' && d.weight > 0)) errs.push(`dimension ${d?.id}: weight must be a positive number`);
    for (const level of ['0', '1', '2', '3', '4']) {
      if (typeof d?.anchors?.[level] !== 'string' || !d.anchors[level].trim())
        errs.push(`dimension ${d?.id}: missing anchor "${level}"`);
    }
  }
  if (!seen.has(FIDELITY_DIMENSION)) errs.push(`rubric must contain a ${FIDELITY_DIMENSION} dimension`);
  const gate = rubric.gate ?? {};
  if (!(typeof gate.passThreshold === 'number')) errs.push('gate.passThreshold must be a number');
  if (!(typeof gate.hardFailCap === 'number')) errs.push('gate.hardFailCap must be a number');
  if (typeof gate.hardFailCap === 'number' && typeof gate.passThreshold === 'number' && gate.hardFailCap >= gate.passThreshold)
    errs.push('gate.hardFailCap must be strictly below gate.passThreshold, otherwise a hard fail could still pass');
  return errs;
}

/**
 * Load the visual task set. Tolerant of two on-disk shapes so a schema change
 * upstream does not break grading:
 *   - {id, title, category, difficulty, timeBudgetSeconds, prompt, dimensionEmphasis, expectations}
 *   - {id, taskType, weight, prompt, dimensionWeights, requestedObjects, notes}
 */
export function loadVisualTasks(path = TASKS_PATH) {
  const arr = loadJson(path);
  if (!Array.isArray(arr)) throw new VisualGradeError(`${path}: expected a JSON array of tasks`);
  return arr.map(normalizeTask);
}

export function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) throw new VisualGradeError('task is missing an id');
  const emphasis = raw.dimensionEmphasis ?? raw.dimensionWeights ?? {};
  return {
    id: raw.id,
    title: raw.title ?? raw.taskType ?? raw.id,
    category: raw.category ?? raw.taskType ?? 'uncategorised',
    difficulty: raw.difficulty ?? (typeof raw.weight === 'number' ? ['', 'small', 'medium', 'large', 'large'][Math.min(raw.weight, 4)] : 'medium'),
    timeBudgetSeconds: raw.timeBudgetSeconds ?? null,
    prompt: raw.prompt ?? '',
    subjectPath: raw.subjectPath ?? 'game.Workspace',
    views: raw.views ?? raw.capture?.shots ?? ['hero', 'front', 'side', 'top', 'eye'],
    heroObject: raw.heroObject ?? null,
    landmarkExpected: raw.landmarkExpected ?? Boolean(raw.heroObject),
    dimensionEmphasis: emphasis,
    expectations: raw.expectations ?? { good: [], bad: [] },
    notes: raw.notes ?? '',
    raw,
  };
}

export function getTask(tasks, id) {
  const t = tasks.find((x) => x.id === id);
  if (!t) throw new VisualGradeError(`unknown task id "${id}" (have: ${tasks.map((x) => x.id).join(', ')})`);
  return t;
}

// ---------------------------------------------------------------------------
// Metrics normalisation + validation
// ---------------------------------------------------------------------------

function mergeMaterialHistograms(lists) {
  const acc = new Map();
  for (const list of lists) {
    for (const entry of list ?? []) {
      const name = entry?.material ?? entry?.name;
      const parts = Number(entry?.parts ?? entry?.count ?? 0);
      if (!name) continue;
      acc.set(name, Math.max(acc.get(name) ?? 0, parts));
    }
  }
  return [...acc.entries()].map(([material, parts]) => ({ material, parts })).sort((a, b) => b.parts - a.parts);
}

/**
 * Canonicalise a capture payload into the shape the hard-fail checks read.
 * Accepts the plugin's Render.capture() output directly (views[].meta) as well as
 * an already-flattened metrics file.
 */
export function normalizeMetrics(raw) {
  const m = raw && typeof raw === 'object' ? raw : {};
  const views = (Array.isArray(m.views) ? m.views : []).map((v) => {
    const meta = v?.meta ?? v ?? {};
    return {
      name: v?.name ?? 'unnamed',
      image: v?.image ?? v?.path ?? null,
      partsVisible: numOrNull(meta.partsVisible),
      partsConsidered: numOrNull(meta.partsConsidered),
      subjectCoverage: numOrNull(meta.subjectCoverage),
      distinctColours: numOrNull(meta.distinctColours ?? meta.distinctColors),
      materials: Array.isArray(meta.materials) ? meta.materials : [],
    };
  });
  const materials = (Array.isArray(m.materials) && m.materials.length)
    ? mergeMaterialHistograms([m.materials])
    : mergeMaterialHistograms(views.map((v) => v.materials));
  const colourCounts = views.map((v) => v.distinctColours).filter((n) => n != null);
  return {
    taskId: m.taskId ?? null,
    subject: m.subject ?? null,
    boundsSize: Array.isArray(m.boundsSize) && m.boundsSize.length === 3 ? m.boundsSize.map(Number) : null,
    views,
    materials,
    distinctColours: numOrNull(m.distinctColours) ?? (colourCounts.length ? Math.max(...colourCounts) : null),
    ground: m.ground ?? null,
    lighting: m.lighting ?? null,
    parts: m.parts ?? null,
  };
}

function numOrNull(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Required-evidence check. A visual grade is only meaningful if the capture
 * actually reported the telemetry the hard-fail rules read; otherwise a broken
 * capture would silently launder a bad scene into a PASS.
 */
export function validateMetrics(metrics) {
  const errs = [];
  const m = metrics ?? {};
  if (!Array.isArray(m.views) || m.views.length === 0) errs.push('metrics.views must be a non-empty array (need at least one rendered viewpoint)');
  if (!m.boundsSize) errs.push('metrics.boundsSize [x,y,z] is required');
  if (!m.materials || m.materials.length === 0) errs.push('metrics.materials histogram is required (or derivable from views[].meta.materials)');
  if (!m.ground || typeof m.ground !== 'object') errs.push('metrics.ground is required (needed for the bare-baseplate hard fail)');
  if (!m.lighting || typeof m.lighting !== 'object') errs.push('metrics.lighting is required (needed for the default-lighting hard fail)');
  if (!m.parts || typeof m.parts !== 'object') errs.push('metrics.parts is required (needed for the no-detail-props hard fail)');
  else if (numOrNull(m.parts.smallPropCount) == null) errs.push('metrics.parts.smallPropCount is required (parts whose largest dimension is < 2 studs)');
  return errs;
}

// ---------------------------------------------------------------------------
// Critique validation
// ---------------------------------------------------------------------------

/**
 * A critique is only usable if EVERY rubric dimension has an integer 0-4 score and a
 * non-trivial observed justification. "Looks fine" is not a justification; the model
 * must say what it saw. This is what stops a vision model from hand-waving a pass.
 */
export function validateCritique(critique, rubric, { minJustificationChars = 25 } = {}) {
  const errs = [];
  if (!critique || typeof critique !== 'object') return ['critique is not an object'];
  const dims = critique.dimensions;
  if (!dims || typeof dims !== 'object') return ['critique.dimensions must be an object keyed by dimension id'];
  const known = new Set(rubric.dimensions.map((d) => d.id));
  for (const d of rubric.dimensions) {
    const entry = dims[d.id];
    if (entry == null) {
      errs.push(`critique is missing dimension "${d.id}"`);
      continue;
    }
    const score = typeof entry === 'number' ? entry : entry.score;
    if (!Number.isInteger(score) || score < rubric.scale.min || score > rubric.scale.max)
      errs.push(`dimension "${d.id}": score must be an integer ${rubric.scale.min}-${rubric.scale.max}, got ${JSON.stringify(score)}`);
    const justification = typeof entry === 'object' ? String(entry.justification ?? '') : '';
    if (justification.trim().length < minJustificationChars)
      errs.push(`dimension "${d.id}": justification must be at least ${minJustificationChars} characters of what was actually observed`);
  }
  for (const key of Object.keys(dims)) if (!known.has(key)) errs.push(`critique has unknown dimension "${key}"`);
  if (critique.defects != null && !Array.isArray(critique.defects)) errs.push('critique.defects must be an array when present');
  return errs;
}

export function critiqueScore(critique, dimensionId) {
  const entry = critique?.dimensions?.[dimensionId];
  if (entry == null) return null;
  return typeof entry === 'number' ? entry : numOrNull(entry.score);
}

export function critiqueDefectIds(critique) {
  return (critique?.defects ?? []).map((d) => (typeof d === 'string' ? d : d?.id)).filter(Boolean);
}

// ---------------------------------------------------------------------------
// Weighting
// ---------------------------------------------------------------------------

/**
 * Effective per-dimension weights for a task: base rubric weights times the task's
 * clamped emphasis multipliers, renormalised so the set still sums to the rubric total.
 *
 * prompt_fidelity is then clamped so its effective weight can never exceed its base
 * weight, with any surplus redistributed across the other dimensions. Without this,
 * a task that de-emphasises several dimensions would raise prompt_fidelity's share via
 * renormalisation — reintroducing exactly the "everything exists so it passes" failure
 * this suite was built to stop.
 *
 * @returns {{weights: Map<string, number>, total: number, warnings: string[]}}
 */
export function effectiveWeights(rubric, task = {}) {
  const warnings = [];
  const base = new Map(rubric.dimensions.map((d) => [d.id, d.weight]));
  const baseTotal = [...base.values()].reduce((a, b) => a + b, 0);
  const emphasis = task.dimensionEmphasis ?? {};

  for (const key of Object.keys(emphasis)) {
    if (!base.has(key)) warnings.push(`task ${task.id ?? '?'}: emphasis for unknown dimension "${key}" ignored`);
  }

  const scaled = new Map();
  for (const [id, w] of base) {
    let mult = Number(emphasis[id] ?? 1);
    if (!Number.isFinite(mult) || mult <= 0) mult = 1;
    if (id === FIDELITY_DIMENSION && mult > 1) {
      warnings.push(`task ${task.id ?? '?'}: ${FIDELITY_DIMENSION} emphasis ${mult} clamped to 1 — prompt fidelity may be de-emphasised, never emphasised`);
      mult = 1;
    }
    const clamped = Math.min(EMPHASIS_MAX, Math.max(EMPHASIS_MIN, mult));
    if (clamped !== mult) warnings.push(`task ${task.id ?? '?'}: emphasis ${mult} for "${id}" clamped to ${clamped}`);
    scaled.set(id, w * clamped);
  }

  let sum = [...scaled.values()].reduce((a, b) => a + b, 0);
  const weights = new Map([...scaled].map(([id, w]) => [id, (w / sum) * baseTotal]));
  clampPromptFidelity(weights, base.get(FIDELITY_DIMENSION), baseTotal);
  return { weights, total: baseTotal, warnings };
}

/** Cap prompt_fidelity at its base weight and spread the surplus proportionally. Mutates `weights`. */
export function clampPromptFidelity(weights, baseFidelityWeight, total) {
  const current = weights.get(FIDELITY_DIMENSION);
  if (current == null || baseFidelityWeight == null || current <= baseFidelityWeight + 1e-9) return weights;
  const surplus = current - baseFidelityWeight;
  weights.set(FIDELITY_DIMENSION, baseFidelityWeight);
  const others = [...weights.keys()].filter((id) => id !== FIDELITY_DIMENSION);
  const othersSum = others.reduce((a, id) => a + weights.get(id), 0);
  if (othersSum <= 0) return weights;
  for (const id of others) weights.set(id, weights.get(id) + surplus * (weights.get(id) / othersSum));
  void total;
  return weights;
}

/**
 * Weighted mean of the per-dimension 0-4 scores.
 * @returns {{total: number, pct: number, contributions: Array<{id,name,score,weight,contribution,justification}>}}
 */
export function weightedTotal(critique, rubric, task = {}) {
  const { weights, total: weightTotal, warnings } = effectiveWeights(rubric, task);
  const contributions = [];
  let weighted = 0;
  let used = 0;
  for (const d of rubric.dimensions) {
    const w = weights.get(d.id) ?? 0;
    const score = critiqueScore(critique, d.id);
    if (score == null) continue;
    weighted += w * score;
    used += w;
    const entry = critique.dimensions[d.id];
    contributions.push({
      id: d.id,
      name: d.name,
      score,
      weight: round(w, 3),
      contribution: round((w * score) / weightTotal, 4),
      justification: typeof entry === 'object' ? String(entry.justification ?? '') : '',
    });
  }
  const total = used > 0 ? weighted / used : 0;
  return {
    total: round(total, 4),
    pct: round((total / rubric.scale.max) * 100, 2),
    contributions,
    weightTotal,
    warnings,
  };
}

function round(n, dp) {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

// ---------------------------------------------------------------------------
// Hard fails
// ---------------------------------------------------------------------------

/**
 * Structural + critique conditions that cap the score no matter how the dimensions
 * were scored. These encode the failure modes Golem currently exhibits; each one is
 * evidence-backed so the report can say WHY, not just that it fired.
 *
 * @returns {Array<{id, name, evidence}>}
 */
export function detectHardFails(metrics, critique, rubric, task = {}) {
  const fired = [];
  const spec = new Map((rubric.hardFails ?? []).map((h) => [h.id, h]));
  const add = (id, evidence) => fired.push({ id, name: spec.get(id)?.name ?? id, why: spec.get(id)?.why ?? '', evidence });
  const m = metrics ?? {};
  const defects = new Set(critiqueDefectIds(critique));

  // nothing-rendered ---------------------------------------------------------
  const views = m.views ?? [];
  if (views.length) {
    const anyGeometry = views.some((v) => (v.partsVisible ?? 0) > 0 && (v.subjectCoverage ?? 0) >= 0.02);
    if (!anyGeometry)
      add('nothing-rendered', `no view reported partsVisible>0 with subjectCoverage>=0.02 (views: ${views.map((v) => `${v.name}=${v.partsVisible ?? '?'}/${v.subjectCoverage ?? '?'}`).join(', ')})`);
  }

  // bare-baseplate -----------------------------------------------------------
  const ground = m.ground ?? {};
  const groundParts = numOrNull(ground.parts);
  const groundUntouched =
    ground.isDefaultBaseplate === true ||
    (groundParts != null && groundParts <= 1 && ground.recoloured !== true && (ground.materials ?? []).every((x) => x === 'Plastic' || x === 'SmoothPlastic'));
  if (groundUntouched)
    add('bare-baseplate', `ground telemetry says isDefaultBaseplate=${ground.isDefaultBaseplate ?? 'n/a'}, parts=${groundParts ?? 'n/a'}, materials=[${(ground.materials ?? []).join(', ')}]`);
  else if (defects.has('bare-baseplate'))
    add('bare-baseplate', 'vision critique reported defect "bare-baseplate" in the rendered views');

  // single-material ----------------------------------------------------------
  const minParts = spec.get('single-material')?.minPartsPerMaterial ?? 2;
  const meaningful = (m.materials ?? []).filter((x) => (x.parts ?? 0) >= minParts);
  if (meaningful.length < 2)
    add('single-material', `${meaningful.length} material(s) with >=${minParts} parts: [${meaningful.map((x) => `${x.material}x${x.parts}`).join(', ') || 'none'}]`);

  // default-lighting ---------------------------------------------------------
  const lighting = m.lighting ?? {};
  const changed = Array.isArray(lighting.changedProperties) ? lighting.changedProperties.length : 0;
  const lights = numOrNull(lighting.lightInstances) ?? 0;
  const effects = Array.isArray(lighting.effects) ? lighting.effects.length : 0;
  if (changed === 0 && lights === 0 && effects === 0)
    add('default-lighting', 'Lighting service untouched: 0 changed properties, 0 light instances, 0 lighting effects');

  // no-detail-props ----------------------------------------------------------
  const parts = m.parts ?? {};
  const small = numOrNull(parts.smallPropCount);
  if (small === 0) add('no-detail-props', 'metrics.parts.smallPropCount is 0 — nothing in the scene is smaller than 2 studs');

  // no-landmark --------------------------------------------------------------
  if (task.landmarkExpected === true) {
    const focal = critiqueScore(critique, 'focal_point');
    const tallest = numOrNull(parts.tallestStuds);
    const median = numOrNull(parts.medianHeightStuds);
    const noHierarchy = tallest != null && median != null && median > 0 && tallest < 1.5 * median;
    if (focal != null && focal <= 1)
      add('no-landmark', `focal_point scored ${focal}/4 and the task expects a landmark (${task.heroObject ?? 'unnamed'})`);
    else if (noHierarchy)
      add('no-landmark', `tallest part ${tallest} studs vs median height ${median} studs — no element rises above the crowd`);
    else if (defects.has('no-landmark'))
      add('no-landmark', 'vision critique reported defect "no-landmark"');
  }

  // flat-slab ----------------------------------------------------------------
  const flatSpec = spec.get('flat-slab') ?? {};
  const minH = flatSpec.minHeightStuds ?? 3;
  const footprintTrigger = flatSpec.footprintTriggerStuds ?? 40;
  const b = m.boundsSize;
  if (Array.isArray(b) && b.length === 3) {
    const footprint = Math.max(b[0], b[2]);
    if (b[1] < minH && footprint > footprintTrigger)
      add('flat-slab', `bounds ${b[0]}x${b[1]}x${b[2]} — ${b[1]} studs of height across a ${footprint}-stud footprint`);
  }

  // de-duplicate (a condition can be reachable by two routes)
  const seen = new Set();
  return fired.filter((f) => (seen.has(f.id) ? false : (seen.add(f.id), true)));
}

/**
 * A hard fail caps the total. One fail caps at gate.hardFailCap; each additional fail
 * lowers the cap by gate.hardFailCapStep, never below gate.hardFailCapFloor.
 * Because hardFailCap < passThreshold (enforced by validateRubric), any hard fail
 * makes a PASS arithmetically impossible.
 */
export function applyHardFailCap(rawTotal, hardFailCount, gate) {
  if (hardFailCount <= 0) return { capped: rawTotal, cap: null };
  const cap = Math.max(
    gate.hardFailCapFloor ?? 0,
    (gate.hardFailCap ?? 1.4) - (hardFailCount - 1) * (gate.hardFailCapStep ?? 0.25),
  );
  return { capped: Math.min(rawTotal, cap), cap: round(cap, 4) };
}

/** Any heavily weighted dimension scoring 0 is a structural defect and fails the run outright. */
export function checkCriticalFloor(contributions, rubric) {
  const floor = rubric.gate?.criticalDimensionFloor;
  if (!floor) return [];
  const byId = new Map(rubric.dimensions.map((d) => [d.id, d]));
  return contributions
    .filter((c) => (byId.get(c.id)?.weight ?? 0) >= (floor.minWeight ?? 6) && c.score < (floor.minScore ?? 1))
    .map((c) => ({ id: c.id, name: c.name, score: c.score, baseWeight: byId.get(c.id)?.weight ?? 0 }));
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

/**
 * Grade one built scene.
 * Pure: no I/O, no network. Everything it needs is passed in.
 *
 * @returns {{taskId, status, pass, rawTotal, total, pct, cap, hardFails, criticalFloorViolations,
 *            dimensions, defects, errors, warnings}}
 */
export function gradeVisual({ task, rubric, metrics, critique }) {
  const errors = [];
  const normMetrics = normalizeMetrics(metrics);
  errors.push(...validateMetrics(normMetrics).map((e) => `metrics: ${e}`));
  errors.push(...validateCritique(critique, rubric).map((e) => `critique: ${e}`));

  const { total: rawTotal, pct: rawPct, contributions, warnings } = weightedTotal(critique ?? { dimensions: {} }, rubric, task);
  const hardFails = detectHardFails(normMetrics, critique, rubric, task);
  const { capped, cap } = applyHardFailCap(rawTotal, hardFails.length, rubric.gate);
  const criticalFloorViolations = checkCriticalFloor(contributions, rubric);

  const threshold = rubric.gate.passThreshold;
  const invalid = errors.length > 0;
  const pass = !invalid && hardFails.length === 0 && criticalFloorViolations.length === 0 && capped >= threshold;

  return {
    taskId: task?.id ?? null,
    taskTitle: task?.title ?? null,
    status: invalid ? 'invalid' : pass ? 'pass' : 'fail',
    pass,
    threshold,
    rawTotal,
    rawPct,
    total: round(capped, 4),
    pct: round((capped / rubric.scale.max) * 100, 2),
    cap,
    hardFails,
    criticalFloorViolations,
    dimensions: contributions,
    defects: critique?.defects ?? [],
    observedLandmark: critique?.observedLandmark ?? null,
    summary: critique?.summary ?? '',
    errors,
    warnings,
    rubricVersion: rubric.version ?? null,
  };
}

export function formatReport(result) {
  const lines = [];
  const pct = (n) => `${n.toFixed(1)}%`;
  lines.push(`${result.taskId ?? '(no task)'} — ${result.taskTitle ?? ''}`);
  lines.push('-'.repeat(72));
  if (result.errors.length) {
    lines.push('INVALID — cannot grade on this evidence:');
    for (const e of result.errors) lines.push(`  ! ${e}`);
    lines.push('');
  }
  const w = Math.max(...result.dimensions.map((d) => d.id.length), 12) + 2;
  for (const d of result.dimensions) {
    lines.push(`  ${d.id.padEnd(w)} ${d.score}/4  w=${String(d.weight.toFixed(1)).padStart(5)}   ${d.justification.slice(0, 90)}`);
  }
  lines.push('-'.repeat(72));
  lines.push(`  raw weighted total     ${result.rawTotal.toFixed(2)}/4  (${pct(result.rawPct)})`);
  if (result.hardFails.length) {
    lines.push(`  HARD FAILS (${result.hardFails.length}) — score capped at ${result.cap}/4:`);
    for (const h of result.hardFails) lines.push(`    x ${h.id}: ${h.evidence}`);
  }
  for (const v of result.criticalFloorViolations) {
    lines.push(`    x critical dimension "${v.id}" scored ${v.score} (base weight ${v.baseWeight})`);
  }
  if (result.defects.length) {
    lines.push(`  defects: ${result.defects.map((d) => (typeof d === 'string' ? d : d.id)).join(', ')}`);
  }
  lines.push(`  FINAL                  ${result.total.toFixed(2)}/4  (${pct(result.pct)})   threshold ${result.threshold}/4`);
  lines.push(`  ${result.status.toUpperCase()}`);
  for (const wn of result.warnings) lines.push(`  warn: ${wn}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Vision transport — the one place that knows how to reach the judge model
// ---------------------------------------------------------------------------

export function imageToPart(path) {
  const ext = extname(path).toLowerCase();
  const mediaType = IMAGE_MEDIA_TYPES[ext];
  if (!mediaType)
    throw new VisualGradeError(`unsupported image type "${ext}" for ${path} (expected one of ${Object.keys(IMAGE_MEDIA_TYPES).join(', ')})`);
  return { mediaType, base64: readFileSync(path).toString('base64') };
}

/**
 * The critique prompt. It hands the judge the rubric anchors verbatim and the
 * structural metrics, and demands a justification per dimension so a lazy pass is
 * not expressible in the output format.
 */
export function buildCritiquePrompt({ task, rubric, metrics }) {
  const m = normalizeMetrics(metrics);
  const dimBlock = rubric.dimensions
    .map((d) => {
      const anchors = ['0', '1', '2', '3', '4'].map((k) => `      ${k} = ${d.anchors[k]}`).join('\n');
      return `  ${d.id} (${d.name}, weight ${d.weight})\n    measures: ${d.measures}\n${anchors}`;
    })
    .join('\n\n');
  const expectations = [
    ...(task.expectations?.good ?? []).map((s) => `  GOOD: ${s}`),
    ...(task.expectations?.bad ?? []).map((s) => `  BAD:  ${s}`),
  ].join('\n');

  return [
    'You are grading the VISUAL QUALITY of a Roblox scene that an AI built. You are looking at real',
    'rendered screenshots from several viewpoints. Judge what you can SEE.',
    '',
    'The single most important instruction: DO NOT give a high score simply because every requested',
    'object exists. Object existence is one dimension (prompt_fidelity) worth 6 of 100 points. A scene',
    'that contains everything asked for but looks like an untextured block-out must score badly.',
    '',
    `TASK: ${task.title} (${task.category}, ${task.difficulty})`,
    `USER PROMPT VERBATIM: "${task.prompt}"`,
    task.heroObject ? `EXPECTED FOCAL ELEMENT: ${task.heroObject}` : '',
    '',
    'WHAT GOOD AND BAD LOOK LIKE FOR THIS SPECIFIC TASK:',
    expectations,
    '',
    'STRUCTURAL METRICS FROM THE CAPTURE (corroborating evidence, not a substitute for looking):',
    `  boundsSize: ${JSON.stringify(m.boundsSize)}`,
    `  materials:  ${JSON.stringify(m.materials)}`,
    `  distinctColours: ${m.distinctColours}`,
    `  ground:   ${JSON.stringify(m.ground)}`,
    `  lighting: ${JSON.stringify(m.lighting)}`,
    `  parts:    ${JSON.stringify(m.parts)}`,
    `  views:    ${JSON.stringify(m.views.map((v) => ({ name: v.name, partsVisible: v.partsVisible, subjectCoverage: v.subjectCoverage })))}`,
    '',
    'RUBRIC — score each dimension 0-4 against these anchors. Anchor 0 describes the failure mode we',
    'are actively hunting for; do not soften it.',
    '',
    dimBlock,
    '',
    `NAMED DEFECTS — report every one you can see, using only these ids: ${(rubric.defectVocabulary ?? []).join(', ')}`,
    '',
    'Reply with JSON only, no prose outside it, in exactly this shape:',
    '{',
    '  "dimensions": { "<dimension_id>": { "score": <0-4 integer>, "justification": "<what you actually',
    '                   observed in which view, at least 25 characters; cite the view name>" }, ... },',
    '  "defects": [ { "id": "<defect id from the vocabulary>", "where": "<view name>", "detail": "<specific>" } ],',
    '  "observedLandmark": "<the element your eye lands on first, or null if there is none>",',
    '  "summary": "<two sentences: what this scene looks like, and the single biggest thing wrong with it>"',
    '}',
    'Every dimension id in the rubric must be present. A missing justification invalidates the grade.',
  ]
    .filter((l) => l !== '')
    .join('\n');
}

/** Pull a JSON object out of a model response that may be fenced or prefixed with prose. */
export function parseCritiqueResponse(text) {
  const raw = String(text ?? '');
  const fenced = raw.match(/```(?:json)?\s*\r?\n([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    return JSON.parse(candidate);
  } catch (e) {
    throw new VisualGradeError(`vision model did not return parseable JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/**
 * Send the screenshots + rubric to the vision judge. Mirrors src/transport.mjs: this is
 * the ONLY function that knows the endpoint, so a gateway change touches one place.
 * `fetchImpl` is injectable so tests never hit the network.
 */
export async function requestCritique({
  task,
  rubric,
  metrics,
  imagePaths,
  apiBase,
  adminKey,
  model = 'iris',
  timeoutMs = 180_000,
  fetchImpl = fetch,
}) {
  if (!apiBase || !adminKey) throw new VisualGradeError('API_BASE and ADMIN_KEY are required for a live critique (use --dry-run to grade a canned critique)');
  if (!imagePaths?.length) throw new VisualGradeError('at least one screenshot path is required');
  const images = imagePaths.map(imageToPart);
  const prompt = buildCritiquePrompt({ task, rubric, metrics });
  const url = `${apiBase.replace(/\/+$/, '')}/api/admin/vision-critique`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey },
      body: JSON.stringify({ model, prompt, images, responseFormat: 'json' }),
      signal: ctrl.signal,
    });
  } catch (e) {
    throw new VisualGradeError(`vision gateway network error: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    clearTimeout(timer);
  }
  let body;
  try {
    body = await res.json();
  } catch {
    throw new VisualGradeError(`vision gateway returned non-JSON (HTTP ${res.status})`);
  }
  if (!res.ok || body.ok === false) throw new VisualGradeError(`vision gateway error (HTTP ${res.status}): ${body?.error ?? 'unknown'}`);
  return parseCritiqueResponse(body.text ?? JSON.stringify(body.critique ?? body));
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = {
    dryRun: false, task: null, metrics: null, critique: null, run: null,
    model: 'iris', apiBase: process.env.API_BASE, adminKey: process.env.ADMIN_KEY, json: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new VisualGradeError(`missing value for ${a}`);
      return argv[i];
    };
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--task') args.task = next();
    else if (a === '--metrics') args.metrics = next();
    else if (a === '--critique') args.critique = next();
    else if (a === '--run') args.run = next();
    else if (a === '--model') args.model = next();
    else if (a === '--api-base') args.apiBase = next();
    else if (a === '--admin-key') args.adminKey = next();
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') {
      console.log([
        'usage:',
        '  grade-visual.mjs --dry-run --task <id> --metrics <file> --critique <file>',
        '  grade-visual.mjs --dry-run --run <regression/run-dir>',
        '  grade-visual.mjs --task <id> --metrics <file> [--model iris]   (live; needs API_BASE + ADMIN_KEY)',
        'flags: --json  emit the result object instead of the text report',
      ].join('\n'));
      process.exit(0);
    } else throw new VisualGradeError(`unknown flag: ${a}`);
  }
  return args;
}

function abs(p, base) {
  return isAbsolute(p) ? p : resolve(base, p);
}

/** A run directory holds one sub-directory per task: metrics.json, critique.json, screenshots/. */
export function discoverRunTasks(runDir) {
  if (!existsSync(runDir)) throw new VisualGradeError(`run directory not found: ${runDir}`);
  return readdirSync(runDir)
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .filter((name) => statSync(join(runDir, name)).isDirectory())
    .filter((name) => existsSync(join(runDir, name, 'metrics.json')))
    .sort()
    .map((name) => ({
      taskId: name,
      dir: join(runDir, name),
      metrics: join(runDir, name, 'metrics.json'),
      critique: join(runDir, name, 'critique.json'),
    }));
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const rubric = loadRubric();
  const tasks = loadVisualTasks();
  const cwd = process.cwd();

  const units = [];
  if (cfg.run) {
    const runDir = abs(cfg.run, cwd);
    for (const u of discoverRunTasks(runDir)) {
      if (!existsSync(u.critique)) {
        console.error(`skip ${u.taskId}: no critique.json (run without --dry-run to generate one)`);
        continue;
      }
      units.push({ task: getTask(tasks, u.taskId), metrics: loadJson(u.metrics), critique: loadJson(u.critique) });
    }
  } else {
    if (!cfg.task) throw new VisualGradeError('--task is required (or use --run <dir>)');
    if (!cfg.metrics) throw new VisualGradeError('--metrics <file> is required');
    const task = getTask(tasks, cfg.task);
    const metrics = loadJson(abs(cfg.metrics, cwd));
    let critique;
    if (cfg.dryRun) {
      if (!cfg.critique) throw new VisualGradeError('--dry-run needs --critique <file> (a canned critique JSON)');
      critique = loadJson(abs(cfg.critique, cwd));
    } else {
      const imagePaths = normalizeMetrics(metrics).views.map((v) => v.image).filter(Boolean).map((p) => abs(p, dirname(abs(cfg.metrics, cwd))));
      critique = await requestCritique({ task, rubric, metrics, imagePaths, apiBase: cfg.apiBase, adminKey: cfg.adminKey, model: cfg.model });
    }
    units.push({ task, metrics, critique });
  }

  if (units.length === 0) throw new VisualGradeError('nothing to grade');

  const results = units.map((u) => gradeVisual({ ...u, rubric }));
  if (cfg.json) {
    console.log(JSON.stringify(results.length === 1 ? results[0] : results, null, 2));
  } else {
    for (const r of results) {
      console.log(formatReport(r));
      console.log('');
    }
    if (results.length > 1) {
      const passed = results.filter((r) => r.pass).length;
      const mean = results.reduce((a, r) => a + r.total, 0) / results.length;
      console.log(`SUITE: ${passed}/${results.length} passed · mean ${mean.toFixed(2)}/4 (${((mean / rubric.scale.max) * 100).toFixed(1)}%)`);
    }
  }
  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
