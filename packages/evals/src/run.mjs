#!/usr/bin/env node
// Golem eval runner. Single-turn: send each task's system+prompt to each model
// through the worker admin gateway, grade the response, aggregate, save JSON,
// print a category table.
//
// Usage:
//   API_BASE=https://<worker-host> ADMIN_KEY=... node src/run.mjs \
//     --models clay,stone --categories api-knowledge,debugging --limit 3 --tag baseline
//
// Flags: --models a,b   model keys (default clay,stone)
//        --categories   comma list (default: all task files)
//        --limit N      max tasks per category
//        --tag NAME     run tag used in the results filename (default "run")
//        --max-tokens N explicit output ceiling sent to the admin route
//        --one-attempt  suppress the runner's compatibility retry
//        --base-gate    enforce the frozen Apple MAX base-only preregistration
//        --api-base URL / --admin-key KEY  override env vars
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callModel, TransportError } from './transport.mjs';
import { gradeTask } from './grade.mjs';
import { gradeToolCalls } from './tool-grader.mjs';
import { classifyRecord, scoreRun, formatScorecard } from './metrics.mjs';
import { loadTasks, TASKS_DIR } from './tasks.mjs';
import { resolveLuauChecker } from './luau.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = join(HERE, '..', 'results');

const CONCURRENCY = 2;
const RETRY_DELAY_MS = 1500;
const DEFAULT_ATTEMPTS = 2;

/**
 * Frozen tripwire for the single Qwen2.5 Coder foundation run approved on 2026-09-18.
 * The bundle digest uses the explicit algorithm emitted by sourceHashes(), so a byte change in any
 * task file refuses before a provider request rather than silently changing the registered test.
 */
export const APPLE_MAX_BASE_GATE = Object.freeze({
  modelKey: 'appleMaxBase',
  modelId: '@cf/qwen/qwen2.5-coder-32b-instruct',
  maxTokens: 2400,
  attempts: 1,
  taskCount: 88,
  totalWeight: 165,
  scriptingWeight: 89,
  reservedNeurons: 20_258,
  taskBundleSha256: 'a1d0b5d260cc466ea4c57d6eff04b438531a9aa0793e6c2523373dd1ed758835',
  overallMin: 0.9,
  scriptingCombinedMin: 0.85,
  scriptingCategoryMin: 0.75,
});

export function parseArgs(argv) {
  const args = {
    models: ['clay', 'stone'], categories: null, limit: null, tag: 'run', rag: false,
    apiBase: process.env.API_BASE, adminKey: process.env.ADMIN_KEY,
    maxTokens: null, attempts: DEFAULT_ATTEMPTS, baseGate: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`missing value for ${a}`);
      return argv[i];
    };
    if (a === '--models') args.models = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--categories') args.categories = next().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--limit') args.limit = Number(next());
    else if (a === '--tag') args.tag = next().replace(/[^\w.-]+/g, '-');
    else if (a === '--rag') args.rag = true;
    else if (a === '--max-tokens') args.maxTokens = Number(next());
    else if (a === '--one-attempt') args.attempts = 1;
    else if (a === '--base-gate') args.baseGate = true;
    else if (a === '--api-base') args.apiBase = next();
    else if (a === '--admin-key') args.adminKey = next();
    else if (a === '--help' || a === '-h') {
      console.log('usage: run.mjs --models clay,stone --categories a,b --limit N --tag NAME [--max-tokens N] [--one-attempt] [--base-gate] (env: API_BASE, ADMIN_KEY)');
      process.exit(0);
    } else throw new Error(`unknown flag: ${a}`);
  }
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer');
  if (args.maxTokens != null && (!Number.isInteger(args.maxTokens) || args.maxTokens < 1)) throw new Error('--max-tokens must be a positive integer');
  return args;
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/** Exact source inputs written into every result so a score cannot outlive what produced it. */
export function sourceHashes() {
  const taskFiles = Object.fromEntries(
    readdirSync(TASKS_DIR)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => [name, sha256File(join(TASKS_DIR, name))]),
  );
  const taskBundleSha256 = createHash('sha256').update(JSON.stringify(taskFiles)).digest('hex');
  return {
    taskBundleSha256,
    taskBundleAlgorithm: 'sha256(JSON.stringify(sorted {filename: sha256(file bytes)}))',
    taskFiles,
    runnerSha256: sha256File(fileURLToPath(import.meta.url)),
    transportSha256: sha256File(join(HERE, 'transport.mjs')),
    graderSha256: sha256File(join(HERE, 'grade.mjs')),
    metricsSha256: sha256File(join(HERE, 'metrics.mjs')),
  };
}

function weightedScore(records) {
  let weight = 0;
  let weighted = 0;
  for (const record of records) {
    if (!Number.isFinite(record?.score) || record.score < 0 || record.score > 1) continue;
    const taskWeight = Number.isFinite(record.taskWeight) && record.taskWeight > 0 ? record.taskWeight : 1;
    weight += taskWeight;
    weighted += taskWeight * record.score;
  }
  return weight > 0 ? weighted / weight : null;
}

/** Refuse a paid base-gate run before its first request when its frozen controls drift. */
export function validateBaseGateConfig(cfg, tasks, hashes = sourceHashes()) {
  const gate = APPLE_MAX_BASE_GATE;
  const errors = [];
  if (cfg.models.length !== 1 || cfg.models[0] !== gate.modelKey) errors.push(`--models must be exactly ${gate.modelKey}`);
  if (cfg.categories != null) errors.push('--categories is forbidden for the complete base gate');
  if (cfg.limit != null) errors.push('--limit is forbidden for the complete base gate');
  if (cfg.rag) errors.push('--rag is forbidden for the base-only gate');
  if (cfg.maxTokens !== gate.maxTokens) errors.push(`--max-tokens must be exactly ${gate.maxTokens}`);
  if (cfg.attempts !== gate.attempts) errors.push('--one-attempt is required');
  if (tasks.length !== gate.taskCount) errors.push(`task count changed: ${tasks.length} != ${gate.taskCount}`);
  const totalWeight = tasks.reduce((n, task) => n + (task.weight ?? 1), 0);
  if (totalWeight !== gate.totalWeight) errors.push(`task weight changed: ${totalWeight} != ${gate.totalWeight}`);
  const scriptingWeight = tasks
    .filter((task) => ['scripting-security', 'scripting-persistence', 'scripting-systems', 'scripting-gameplay'].includes(task.category))
    .reduce((n, task) => n + (task.weight ?? 1), 0);
  if (scriptingWeight !== gate.scriptingWeight) errors.push(`scripting weight changed: ${scriptingWeight} != ${gate.scriptingWeight}`);
  if (hashes.taskBundleSha256 !== gate.taskBundleSha256) errors.push(`task bundle changed: ${hashes.taskBundleSha256} != ${gate.taskBundleSha256}`);
  return errors;
}

/** Evaluate every preregistered rejection criterion against the stored per-task records. */
export function evaluateBaseGate(perTask, expectedModelId = APPLE_MAX_BASE_GATE.modelId) {
  const gate = APPLE_MAX_BASE_GATE;
  const records = Array.isArray(perTask) ? perTask : [];
  const uniqueTaskIds = new Set(records.map((record) => record?.taskId).filter((id) => typeof id === 'string'));
  const gradableFirstAttempts = records.filter(
    (record) =>
      record?.ok === true &&
      record.complete === true &&
      record.scored === true &&
      Number.isFinite(record.score) &&
      record.attempts === 1 &&
      record.model === gate.modelKey &&
      record.modelId === expectedModelId,
  ).length;

  const overall = weightedScore(records);
  const scriptingCategories = ['scripting-security', 'scripting-persistence', 'scripting-systems', 'scripting-gameplay'];
  const scripting = records.filter((record) => scriptingCategories.includes(record?.category));
  const scriptingCombined = weightedScore(scripting);
  const scriptingByCategory = Object.fromEntries(
    scriptingCategories.map((category) => [category, weightedScore(records.filter((record) => record?.category === category))]),
  );

  const luauChecks = records.flatMap((record) => (record?.checks ?? []).filter((check) => check.type === 'luau_syntax' && !check.unavailable));
  const securityChecks = records.flatMap((record) => (record?.checks ?? []).filter((check) => check.type === 'no_antipattern' && !check.unavailable));
  const finishReasonsObserved = records.every((record) => typeof record?.finishReason === 'string' && record.finishReason.length > 0);
  const noLengthFinish = finishReasonsObserved && records.every((record) => record.finishReason !== 'length');
  const usageObserved = records.every(
    (record) =>
      Number.isSafeInteger(record?.usage?.inputTokens) && record.usage.inputTokens >= 0 &&
      Number.isSafeInteger(record?.usage?.outputTokens) && record.usage.outputTokens >= 0 &&
      Number.isSafeInteger(record?.neurons) && record.neurons >= 0,
  );
  const noTaskExcluded = records.length === gate.taskCount && records.every((record) => record?.scored === true && Number.isFinite(record.score));

  const criteria = [
    {
      id: 'complete_first_attempt_expected_model',
      passed: records.length === gate.taskCount && uniqueTaskIds.size === gate.taskCount && gradableFirstAttempts === gate.taskCount,
      observed: { records: records.length, uniqueTaskIds: uniqueTaskIds.size, gradableFirstAttempts, expected: gate.taskCount, expectedModelId },
    },
    { id: 'overall_weighted_score', passed: overall != null && overall >= gate.overallMin, observed: overall, threshold: gate.overallMin },
    {
      id: 'scripting_weighted_score',
      passed:
        scriptingCombined != null &&
        scriptingCombined >= gate.scriptingCombinedMin &&
        Object.values(scriptingByCategory).every((score) => score != null && score >= gate.scriptingCategoryMin),
      observed: { combined: scriptingCombined, byCategory: scriptingByCategory },
      threshold: { combined: gate.scriptingCombinedMin, eachCategory: gate.scriptingCategoryMin },
    },
    {
      id: 'luau_build_validity',
      passed: luauChecks.length > 0 && luauChecks.every((check) => check.passed === true),
      observed: { executed: luauChecks.length, passed: luauChecks.filter((check) => check.passed === true).length },
      threshold: 1,
    },
    {
      id: 'security_antipattern_checks',
      passed: securityChecks.length > 0 && securityChecks.every((check) => check.passed === true),
      observed: { executed: securityChecks.length, passed: securityChecks.filter((check) => check.passed === true).length },
      threshold: 1,
    },
    {
      id: 'no_truncation',
      passed: noLengthFinish,
      observed: { finishReasonsObserved, lengthFinishes: records.filter((record) => record?.finishReason === 'length').length },
      threshold: 0,
    },
    {
      id: 'usage_and_complete_denominator',
      passed: usageObserved && noTaskExcluded,
      observed: { usageObserved, noTaskExcluded, records: records.length },
    },
  ];
  return { passed: criteria.every((criterion) => criterion.passed), foundationEligibilityOnly: true, criteria };
}

export function formatBaseGate(result) {
  const lines = [`Apple MAX base gate: ${result.passed ? 'PASS — foundation eligible only' : 'REJECT'}`];
  for (const criterion of result.criteria) lines.push(`  ${criterion.passed ? 'PASS' : 'FAIL'} ${criterion.id}`);
  return lines.join('\n');
}

export async function runJob(job, cfg, deps = {}) {
  const callModelImpl = deps.callModelImpl ?? callModel;
  const sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const { model, task } = job;
  let lastErr;
  let attempts = 0;
  const maxAttempts = cfg.attempts ?? DEFAULT_ATTEMPTS;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    attempts += 1;
    try {
      const res = await callModelImpl({
        rag: cfg.rag,
        apiBase: cfg.apiBase,
        adminKey: cfg.adminKey,
        model,
        prompt: task.prompt,
        system: task.system,
        tools: Array.isArray(task.expectTools) && task.expectTools.length > 0,
        maxTokens: cfg.maxTokens ?? undefined,
      });
      if (res.finishReason === 'length') {
        return {
          taskId: task.id,
          category: task.category,
          model,
          modelId: res.modelId,
          ok: true,
          complete: false,
          truncated: true,
          attempts,
          ms: res.ms,
          usage: res.usage ?? null,
          neurons: res.neurons,
          finishReason: res.finishReason,
          score: null,
          scored: false,
          ungradedReason: 'truncated',
          ungradedChecks: [],
          toolGrade: null,
          checks: [],
          responsePreview: res.text.slice(0, 600),
          error: 'provider stopped at the output-token limit; partial response was not graded',
        };
      }
      if (cfg.expectedModelId && res.modelId !== cfg.expectedModelId) {
        return {
          taskId: task.id,
          category: task.category,
          model,
          modelId: res.modelId,
          ok: true,
          complete: false,
          truncated: false,
          attempts,
          ms: res.ms,
          usage: res.usage ?? null,
          neurons: res.neurons,
          finishReason: res.finishReason ?? null,
          score: null,
          scored: false,
          ungradedReason: 'unexpected_model',
          ungradedChecks: [],
          toolGrade: null,
          checks: [],
          responsePreview: res.text.slice(0, 600),
          error: `resolved model ${String(res.modelId)} did not match ${cfg.expectedModelId}`,
        };
      }
      if (cfg.requireFinishReason && (typeof res.finishReason !== 'string' || res.finishReason.length === 0)) {
        return {
          taskId: task.id,
          category: task.category,
          model,
          modelId: res.modelId,
          ok: true,
          complete: false,
          truncated: false,
          attempts,
          ms: res.ms,
          usage: res.usage ?? null,
          neurons: res.neurons,
          finishReason: null,
          score: null,
          scored: false,
          ungradedReason: 'missing_finish_reason',
          ungradedChecks: [],
          toolGrade: null,
          checks: [],
          responsePreview: res.text.slice(0, 600),
          error: 'provider finish reason was not retained; response was not graded',
        };
      }
      const graded = gradeTask(task, res.text);
      // `null` means the harness never looked at tool calls for this task; `[]` means it looked
      // and the model made none. gradeToolCalls treats those as opposite facts.
      const toolGrade = Array.isArray(task.expectTools) ? gradeToolCalls(task.expectTools, res.toolCalls) : null;
      return {
        taskId: task.id,
        category: task.category,
        model,
        modelId: res.modelId,
        ok: true,
        attempts,
        ms: res.ms,
        usage: res.usage ?? null,
        neurons: res.neurons,
        finishReason: res.finishReason ?? null,
        complete: true,
        truncated: false,
        score: graded.score,
        scored: graded.scored,
        ungradedReason: graded.scored ? null : 'grader_unavailable',
        ungradedChecks: graded.ungraded,
        toolGrade,
        checks: graded.checks,
        responsePreview: res.text.slice(0, 600),
      };
    } catch (e) {
      lastErr = e;
      const retryable = !(e instanceof TransportError) || e.retryable;
      if (attempt + 1 < maxAttempts && retryable) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }
      break;
    }
  }
  const message = lastErr instanceof Error ? lastErr.message : String(lastErr);
  return {
    taskId: task.id,
    category: task.category,
    model,
    modelId: null,
    ok: false,
    attempts,
    ms: 0,
    usage: null,
    neurons: null,
    finishReason: null,
    complete: false,
    truncated: false,
    // NOT 0. A job that never got a response made no observation about this model's answer, and
    // `aggregate` below now excludes it from the mean instead of averaging in a fabricated zero.
    score: null,
    scored: false,
    ungradedReason: /timeout|timed out|abort/i.test(message) ? 'timeout' : 'transport_error',
    toolGrade: null,
    checks: [],
    error: message,
  };
}

async function pool(jobs, worker, size) {
  const out = new Array(jobs.length);
  let next = 0;
  async function lane() {
    while (next < jobs.length) {
      const i = next++;
      out[i] = await worker(jobs[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, jobs.length) }, lane));
  return out;
}

/**
 * Task-weighted mean score per (model, category) and per model.
 *
 * UNGRADED RECORDS ARE NOT AVERAGED IN AS ZEROS. This used to read
 * `cur.weighted += w * r.score` over every record, with `score: 0` written for any job whose
 * transport failed -- so a gateway outage on a quarter of the suite printed as that model
 * scoring 25% worse, indistinguishable from it having answered badly. The two are different
 * facts and only one of them is about the model.
 *
 * The ungraded now leave the mean and appear as counts beside it: `ungraded`, `transportErrors`
 * (kept under its old name for compare.mjs and report.mjs), and `gradedTasks`. A cell where
 * NOTHING could be graded reports `score: null` rather than 0 -- the table prints a dash for it.
 */
export function aggregate(perTask) {
  const byKey = new Map();
  const overallByModel = new Map();
  const blank = (extra) => ({ weight: 0, weighted: 0, tasks: 0, gradedTasks: 0, transportErrors: 0, ungraded: 0, ...extra });
  for (const r of perTask) {
    const wRaw = r.taskWeight ?? 1;
    const w = Number.isFinite(wRaw) && wRaw > 0 ? wRaw : 1;
    const { graded } = classifyRecord(r);
    const key = `${r.model}\0${r.category}`;
    const cur = byKey.get(key) ?? blank({ model: r.model, category: r.category });
    const o = overallByModel.get(r.model) ?? blank({ model: r.model });
    for (const acc of [cur, o]) {
      acc.tasks += 1;
      if (graded) {
        acc.gradedTasks += 1;
        acc.weight += w;
        acc.weighted += w * r.score;
      } else {
        acc.ungraded += 1;
        if (r.ok === false) acc.transportErrors += 1;
      }
    }
    byKey.set(key, cur);
    overallByModel.set(r.model, o);
  }
  const shape = (c) => ({
    ...c,
    score: c.weight > 0 ? c.weighted / c.weight : null,
  });
  const perCategory = [...byKey.values()].map((c) => {
    const { weight, weighted, ...rest } = shape(c);
    return { model: rest.model, category: rest.category, score: rest.score, tasks: rest.tasks, gradedTasks: rest.gradedTasks, ungraded: rest.ungraded, transportErrors: rest.transportErrors };
  });
  const overall = [...overallByModel.values()].map((o) => {
    const { weight, weighted, ...rest } = shape(o);
    return { model: rest.model, score: rest.score, tasks: rest.tasks, gradedTasks: rest.gradedTasks, ungraded: rest.ungraded, transportErrors: rest.transportErrors };
  });
  return { perCategory, overall };
}

export function formatTable(models, perCategory, overall) {
  const categories = [...new Set(perCategory.map((c) => c.category))].sort();
  const cell = (model, category) => {
    const hit = perCategory.find((c) => c.model === model && c.category === category);
    // A dash means "nothing here was graded", and it has to stay distinguishable from "0.0".
    if (!hit || hit.score == null) return '—';
    return (hit.score * 100).toFixed(1);
  };
  const w0 = Math.max(12, ...categories.map((c) => c.length)) + 2;
  const wc = Math.max(8, ...models.map((m) => m.length)) + 2;
  const pad = (s, w) => String(s).padEnd(w);
  const lines = [];
  lines.push(pad('category', w0) + models.map((m) => pad(m, wc)).join(''));
  lines.push('-'.repeat(w0 + wc * models.length));
  for (const cat of categories) lines.push(pad(cat, w0) + models.map((m) => pad(cell(m, cat), wc)).join(''));
  lines.push('-'.repeat(w0 + wc * models.length));
  lines.push(
    pad('OVERALL', w0) +
      models
        .map((m) => {
          const s = overall.find((o) => o.model === m)?.score;
          // `?? 0` here would print 0.0 for a model whose every job failed, which is the same
          // lie one layer up from the mean.
          return pad(s == null ? '—' : (s * 100).toFixed(1), wc);
        })
        .join(''),
  );
  return lines.join('\n');
}

function timestamp() {
  const d = new Date();
  const p = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  if (!cfg.apiBase || !cfg.adminKey) {
    console.error('error: API_BASE and ADMIN_KEY are required (env vars or --api-base/--admin-key).');
    process.exit(2);
  }
  const { tasks, errors } = loadTasks({ categories: cfg.categories, limit: cfg.limit });
  if (errors.length) {
    console.error('task validation errors:\n  ' + errors.join('\n  '));
    process.exit(2);
  }
  if (tasks.length === 0) {
    console.error('no tasks matched the given categories');
    process.exit(2);
  }
  const hashes = sourceHashes();
  if (cfg.baseGate) {
    const errors = validateBaseGateConfig(cfg, tasks, hashes);
    if (errors.length) {
      console.error('base-gate preflight refused before inference:\n  ' + errors.join('\n  '));
      process.exit(2);
    }
    cfg.expectedModelId = APPLE_MAX_BASE_GATE.modelId;
    cfg.requireFinishReason = true;
  }
  const checker = resolveLuauChecker();
  console.log(`luau checker: ${checker ? checker.name : 'NONE (luau_syntax checks will fail)'}`);
  console.log(`models: ${cfg.models.join(', ')} · tasks: ${tasks.length} · concurrency: ${CONCURRENCY} · attempts: ${cfg.attempts} · maxTokens: ${cfg.maxTokens ?? 'endpoint default'}`);

  const jobs = [];
  for (const model of cfg.models) for (const task of tasks) jobs.push({ model, task });

  let done = 0;
  const perTask = await pool(
    jobs,
    async (job) => {
      const r = await runJob(job, cfg);
      r.taskWeight = job.task.weight ?? 1;
      done += 1;
      // `r.score` is null when every check for this task was unavailable (no Luau checker, a
      // rule set that did not apply). "0%" would be a verdict on the answer; "----" is not.
      const status = !r.ok ? 'ERR ' : r.score == null ? '----' : `${(r.score * 100).toFixed(0).padStart(3)}%`;
      console.log(`[${String(done).padStart(3)}/${jobs.length}] ${status} ${job.model.padEnd(6)} ${job.task.id}${r.ok ? '' : `  (${r.error})`}`);
      return r;
    },
    CONCURRENCY,
  );

  const { perCategory, overall } = aggregate(perTask);
  const runMeta = {
    tag: cfg.tag,
    startedAt: new Date().toISOString(),
    apiBase: cfg.apiBase,
    models: cfg.models,
    categories: cfg.categories ?? 'all',
    limit: cfg.limit,
    taskCount: tasks.length,
    jobCount: jobs.length,
    concurrency: CONCURRENCY,
    attempts: cfg.attempts,
    maxTokens: cfg.maxTokens,
    rag: cfg.rag,
    baseGate: cfg.baseGate,
    expectedModelId: cfg.expectedModelId ?? null,
    luauChecker: checker?.name ?? null,
    transport: 'POST /api/admin/model-test',
    sourceHashes: hashes,
  };
  const baseGate = cfg.baseGate ? evaluateBaseGate(perTask, cfg.expectedModelId) : null;
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = join(RESULTS_DIR, `${cfg.tag}-${timestamp()}.json`);
  writeFileSync(outFile, JSON.stringify({ runMeta, perTask, perCategory, overall, baseGate }, null, 2));

  console.log('\n' + formatTable(cfg.models, perCategory, overall));
  const scored = scoreRun({ runMeta, perTask });
  console.log('\n' + formatScorecard(scored.overall, { title: `run scorecard [${cfg.tag}]` }));
  for (const model of scored.models) console.log('\n' + formatScorecard(scored.byModel[model], { title: `scorecard [${model}]` }));
  const errCount = perTask.filter((r) => !r.ok).length;
  if (errCount) console.log(`\n${errCount} job(s) had transport errors (EXCLUDED from the mean, not scored 0).`);
  if (baseGate) console.log('\n' + formatBaseGate(baseGate));
  console.log(`\nresults written to ${outFile}`);
  if (baseGate && !baseGate.passed) process.exitCode = 3;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
