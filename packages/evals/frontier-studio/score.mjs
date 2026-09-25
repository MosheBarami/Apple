#!/usr/bin/env node
// Scores *measured* Studio missions. It does not run a model, infer gameplay from
// screenshots, or turn missing evidence into a failure or a success.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS } from './missions.mjs';

const TASK_BY_ID = new Map(TASKS.map((t) => [t.id, t]));
const ONE = new Set(['run', 'studio', 'playtest', 'security', 'persistence', 'mobile', 'visual-world', 'visual-ui', 'no-errors', 'asset-policy', 'ui-source']);
const KIND = {
  run: 'run-trace', studio: 'studio-readback', playtest: 'playtest',
  security: 'security-probe', persistence: 'playtest', mobile: 'mobile-capture',
  'visual-world': 'blind-review', 'visual-ui': 'blind-review', 'no-errors': 'studio-readback',
  'asset-policy': 'studio-readback', 'ui-source': 'studio-readback',
};
export function criteriaFor(task) {
  return [...ONE, ...task.features.map((f) => `feature:${f}`), ...task.assets.map((a) => `asset:${a}`)];
}

function inside(root, p) {
  if (!p || typeof p !== 'string' || isAbsolute(p)) return null;
  const full = resolve(root, p);
  const rel = relative(root, full);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null;
  try {
    const actual = realpathSync(full);
    const actualRel = relative(realpathSync(root), actual);
    return actualRel && !actualRel.startsWith('..') && !isAbsolute(actualRel) ? actual : null;
  } catch { return null; }
}

function artifactValid(root, proof) {
  const path = inside(root, proof?.artifact);
  if (!path || !/^[a-f0-9]{64}$/.test(proof?.sha256 ?? '')) return false;
  try {
    const stat = statSync(path);
    if (!stat.isFile() || stat.size === 0) return false;
    return createHash('sha256').update(readFileSync(path)).digest('hex') === proof.sha256;
  } catch { return false; }
}

function expectedKind(key) {
  if (key.startsWith('feature:')) return 'playtest';
  if (key.startsWith('asset:')) return 'studio-readback';
  return KIND[key];
}

function traceValid(root, proof, runId) {
  const path = inside(root, proof?.artifact);
  if (!path) return false;
  try {
    const trace = JSON.parse(readFileSync(path, 'utf8'));
    if (trace.runId !== runId || !Array.isArray(trace.tools)) return false;
    const did = (name) => trace.tools.some((x) => x.tool === name && x.ok === true);
    return (did('insert_library_model') || did('insert_asset'))
      && did('play_check') && did('inspect_visually');
  } catch { return false; }
}

function assetValid(proof) {
  const asset = proof?.asset;
  return (asset?.source === 'library' || asset?.source === 'creator-store')
    && asset.robloxSpecific === true && asset.rightsVerified === true
    && asset.placed === true && typeof asset.selectionReason === 'string'
    && asset.selectionReason.trim().length >= 12;
}

/** A proof is an observation by an independent examiner, with its bytes bound by SHA-256. */
export function gradeMission(task, bundle, root) {
  const invalid = [];
  if (!task || bundle?.taskId !== task.id) invalid.push('task-id');
  const run = bundle?.run;
  if (!run?.id || !run?.buildSha || !run?.projectId || !run?.startedAt || !run?.endedAt) invalid.push('run-identity');
  if (run?.mode !== 'agent' || run?.autonomous !== true || run?.start !== task?.start) invalid.push('run-settings');
  if (run?.stopReason !== 'done') invalid.push('stop-reason');
  if (!Array.isArray(run?.interventions) || run.interventions.some((x) => x !== 'preview-approval') || run.interventions.length > 3) invalid.push('interventions');

  const missing = [];
  const failed = [];
  const criteria = task ? criteriaFor(task) : [];
  for (const key of criteria) {
    const p = bundle?.proofs?.[key];
    // A model's own claim is not a measurement. A reviewer name alone is also not proof.
    const observed = p?.kind === expectedKind(key)
      && typeof p.observer === 'string'
      && p.observer.trim().length >= 3
      && !/^(apple|model|agent|self)$/i.test(p.observer.trim())
      && p.runId === run?.id
      && artifactValid(root, p)
      && (key !== 'run' || traceValid(root, p, run?.id))
      && (!key.startsWith('asset:') || assetValid(p))
      && (!key.startsWith('visual-') || (typeof p.verdict?.fitForRoblox === 'boolean' && typeof p.verdict?.amazing === 'boolean'));
    if (!observed) { missing.push(key); continue; }
    if (p.passed !== true || (key.startsWith('visual-') && (!p.verdict.fitForRoblox || !p.verdict.amazing))) failed.push(key);
  }
  const status = invalid.length || missing.length ? 'unmeasured' : failed.length ? 'failed' : 'passed';
  return { taskId: task?.id ?? bundle?.taskId ?? null, status, criteria: criteria.length, passed: criteria.length - missing.length - failed.length, missing, failed, invalid };
}

/** A headline rate is withheld until every fixed task has an independently observed result. */
export function gradeSuite(bundles, root) {
  const byTask = new Map(bundles.map((b) => [b.taskId, b]));
  const results = TASKS.map((t) => gradeMission(t, byTask.get(t.id), root));
  const measured = results.filter((r) => r.status !== 'unmeasured');
  const passed = results.filter((r) => r.status === 'passed');
  const allMeasured = measured.length === TASKS.length;
  return {
    total: TASKS.length, measured: measured.length, passed: passed.length,
    // Never divide by only the easy measured subset and call it frontier.
    passRate: allMeasured ? passed.length / TASKS.length : null,
    benchmarkPass: allMeasured && passed.length === TASKS.length,
    results,
  };
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  const path = process.argv[2];
  if (!path) { console.error('Usage: node score.mjs <evidence-bundles.json>'); process.exitCode = 2; }
  else {
    try {
      const bundles = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(bundles)) throw new Error('expected an array of evidence bundles');
      const result = gradeSuite(bundles, dirname(resolve(path)));
      console.log(JSON.stringify(result, null, 2));
      if (!result.benchmarkPass) process.exitCode = 1;
    } catch (e) { console.error(e.message); process.exitCode = 2; }
  }
}
