#!/usr/bin/env node
// Scores *measured* Studio missions. It does not run a model, infer gameplay from
// screenshots, or turn missing evidence into a failure or a success.
import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TASKS } from './missions.mjs';
import { TASKS as CARTOON_TASKS } from './missions-cartoon-v2.mjs';

const ONE = new Set(['run', 'studio', 'playtest', 'security', 'persistence', 'mobile', 'visual-world', 'visual-ui', 'no-errors', 'asset-policy', 'ui-source']);
const KIND = {
  run: 'run-trace', studio: 'studio-readback', playtest: 'playtest',
  security: 'security-probe', persistence: 'playtest', mobile: 'mobile-capture',
  'visual-world': 'blind-review', 'visual-ui': 'blind-review', 'no-errors': 'studio-readback',
  'asset-policy': 'studio-readback', 'ui-source': 'studio-readback',
  'visual-style': 'blind-review',
};
export function criteriaFor(task) {
  return [...ONE, ...(task.visualScope === 'colorful-cartoon' ? ['visual-style'] : []), ...task.features.map((f) => `feature:${f}`), ...task.assets.map((a) => `asset:${a}`)];
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

function traceValid(root, proof, runId, requireCompleteRoute = true) {
  const path = inside(root, proof?.artifact);
  if (!path) return false;
  try {
    const trace = JSON.parse(readFileSync(path, 'utf8'));
    if (trace.runId !== runId || !Array.isArray(trace.tools) || !trace.tools.length) return false;
    if (!requireCompleteRoute) return true;
    const after = (position, ...names) => trace.tools.findIndex((x, i) => i > position && x.ok === true && names.includes(x.tool));
    const plan = after(-1, 'propose_plan');
    const find = after(plan, 'find_library_model', 'find_verified_asset');
    const insert = after(find, 'insert_library_model', 'insert_asset');
    const play = after(insert, 'play_check', 'play_check_ui');
    const visual = after(insert, 'inspect_visually');
    return plan >= 0 && find > plan && insert > find && play > insert && visual > insert;
  } catch { return false; }
}

function assetValid(proof) {
  const asset = proof?.asset;
  return (asset?.source === 'library' || asset?.source === 'creator-store')
    && asset.robloxSpecific === true && asset.rightsVerified === true
    && asset.placed === true
    && (asset.source === 'creator-store' ? /^\d{5,20}$/.test(String(asset.sourceRef ?? ''))
      : typeof asset.sourceRef === 'string' && asset.sourceRef.trim().length >= 5)
    && typeof asset.rightsUrl === 'string' && /^https:\/\//.test(asset.rightsUrl)
    && typeof asset.instancePath === 'string' && /^(Workspace|ReplicatedStorage|StarterGui|ServerStorage|SoundService)\.[^\s]/.test(asset.instancePath)
    && typeof asset.selectionReason === 'string' && asset.selectionReason.trim().length >= 12
    && typeof asset.placementReason === 'string' && asset.placementReason.trim().length >= 12
    && ['no-scripts', 'audited-and-tested', 'stripped'].includes(asset.scriptDisposition);
}

/** A proof is an observation by an independent examiner, with its bytes bound by SHA-256. */
export function gradeMission(task, bundle, root) {
  const invalid = [];
  if (!task || bundle?.taskId !== task.id) invalid.push('task-id');
  const run = bundle?.run;
  if (!run?.id || !run?.buildSha || !run?.projectId || !run?.startedAt || !run?.endedAt) invalid.push('run-identity');
  const expectedPromptHash = task && createHash('sha256').update(task.prompt).digest('hex');
  if (run?.promptSha256 !== expectedPromptHash) invalid.push('prompt-hash');
  if (!/^[a-f0-9]{64}$/.test(run?.baselineSha256 ?? '')) invalid.push('baseline-hash');
  const started = Date.parse(run?.startedAt ?? '');
  const ended = Date.parse(run?.endedAt ?? '');
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended <= started) invalid.push('run-interval');
  if (run?.finalized !== true) invalid.push('finalization');
  if (run?.mode !== 'agent' || run?.autonomous !== true || run?.start !== task?.start) invalid.push('run-settings');
  if (typeof run?.stopReason !== 'string' || !run.stopReason) invalid.push('stop-reason');
  if (!Array.isArray(run?.interventions) || run.interventions.some((x) => !['preview-approval', 'preview-rejection'].includes(x)) || run.interventions.length > 3) invalid.push('interventions');

  const missing = [];
  const failed = [];
  const criteria = task ? criteriaFor(task) : [];
  // A terminal failure is already conclusive: demand a real run-bound trace, but do not
  // require Play, UI and asset proofs for a game the agent never finished building.
  if (run?.stopReason && run.stopReason !== 'done') {
    const p = bundle?.proofs?.run;
    const observed = p?.kind === 'run-trace' && p.passed === false
      && typeof p.observer === 'string' && p.observer.trim().length >= 3
      && !/^(apple|model|agent|self)$/i.test(p.observer.trim())
      && p.runId === run.id && artifactValid(root, p)
      && traceValid(root, p, run.id, false);
    return {
      taskId: task?.id ?? bundle?.taskId ?? null,
      status: invalid.length || !observed ? 'unmeasured' : 'failed',
      criteria: criteria.length, passed: 0,
      missing: observed ? criteria.filter((key) => key !== 'run') : criteria,
      failed: observed ? ['run'] : [], invalid,
      failureReason: `stop-reason:${run.stopReason}`,
    };
  }
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
      && (key === 'visual-style'
        ? (typeof p.verdict?.colorfulCartoon === 'boolean' && typeof p.verdict?.coherentArtDirection === 'boolean' && typeof p.verdict?.commerciallyPolished === 'boolean')
        : !key.startsWith('visual-') || (typeof p.verdict?.fitForRoblox === 'boolean' && typeof p.verdict?.amazing === 'boolean'));
    if (!observed) { missing.push(key); continue; }
    if (p.passed !== true || (key === 'visual-style'
      ? (!p.verdict.colorfulCartoon || !p.verdict.coherentArtDirection || !p.verdict.commerciallyPolished)
      : key.startsWith('visual-') && (!p.verdict.fitForRoblox || !p.verdict.amazing))) failed.push(key);
  }
  const status = invalid.length || missing.length ? 'unmeasured' : failed.length ? 'failed' : 'passed';
  return { taskId: task?.id ?? bundle?.taskId ?? null, status, criteria: criteria.length, passed: criteria.length - missing.length - failed.length, missing, failed, invalid };
}

/** A headline rate is withheld until every fixed task has an independently observed result. */
export function gradeSuite(bundles, root, tasks = TASKS) {
  const taskCounts = new Map();
  const projectTasks = new Map();
  const runTasks = new Map();
  for (const bundle of bundles) {
    taskCounts.set(bundle?.taskId, (taskCounts.get(bundle?.taskId) ?? 0) + 1);
    if (bundle?.run?.id) {
      const tasks = runTasks.get(bundle.run.id) ?? new Set();
      tasks.add(bundle.taskId);
      runTasks.set(bundle.run.id, tasks);
    }
    if (bundle?.run?.projectId) {
      const tasks = projectTasks.get(bundle.run.projectId) ?? new Set();
      tasks.add(bundle.taskId);
      projectTasks.set(bundle.run.projectId, tasks);
    }
  }
  const byTask = new Map(bundles.map((b) => [b.taskId, b]));
  const results = tasks.map((t) => {
    const bundle = byTask.get(t.id);
    const result = gradeMission(t, bundle, root);
    if ((taskCounts.get(t.id) ?? 0) > 1) result.invalid.push('duplicate-task');
    if (bundle?.run?.projectId && (projectTasks.get(bundle.run.projectId)?.size ?? 0) > 1) result.invalid.push('reused-project');
    if (bundle?.run?.id && (runTasks.get(bundle.run.id)?.size ?? 0) > 1) result.invalid.push('reused-run');
    if (result.invalid.length) result.status = 'unmeasured';
    return result;
  });
  const measured = results.filter((r) => r.status !== 'unmeasured');
  const passed = results.filter((r) => r.status === 'passed');
  const allMeasured = measured.length === tasks.length;
  return {
    bank: tasks === CARTOON_TASKS ? 'cartoon-v2' : 'original-v1',
    total: tasks.length, measured: measured.length, passed: passed.length,
    // Never divide by only the easy measured subset and call it frontier.
    passRate: allMeasured ? passed.length / tasks.length : null,
    benchmarkPass: allMeasured && passed.length === tasks.length,
    results,
  };
}

const here = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === here) {
  const path = process.argv[2];
  const bank = process.argv[3] ?? 'original-v1';
  if (!path || !['original-v1', 'cartoon-v2'].includes(bank)) { console.error('Usage: node score.mjs <evidence-bundles.json> [original-v1|cartoon-v2]'); process.exitCode = 2; }
  else {
    try {
      const bundles = JSON.parse(readFileSync(path, 'utf8'));
      if (!Array.isArray(bundles)) throw new Error('expected an array of evidence bundles');
      const result = gradeSuite(bundles, dirname(resolve(path)), bank === 'cartoon-v2' ? CARTOON_TASKS : TASKS);
      console.log(JSON.stringify(result, null, 2));
      if (!result.benchmarkPass) process.exitCode = 1;
    } catch (e) { console.error(e.message); process.exitCode = 2; }
  }
}
