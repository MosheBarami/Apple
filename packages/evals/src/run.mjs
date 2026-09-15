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
//        --api-base URL / --admin-key KEY  override env vars
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { callModel, TransportError } from './transport.mjs';
import { gradeTask } from './grade.mjs';
import { gradeToolCalls } from './tool-grader.mjs';
import { classifyRecord, scoreRun, formatScorecard } from './metrics.mjs';
import { loadTasks } from './tasks.mjs';
import { resolveLuauChecker } from './luau.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const RESULTS_DIR = join(HERE, '..', 'results');

const CONCURRENCY = 2;
const RETRY_DELAY_MS = 1500;

function parseArgs(argv) {
  const args = { models: ['clay', 'stone'], categories: null, limit: null, tag: 'run', rag: false, apiBase: process.env.API_BASE, adminKey: process.env.ADMIN_KEY };
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
    else if (a === '--api-base') args.apiBase = next();
    else if (a === '--admin-key') args.adminKey = next();
    else if (a === '--help' || a === '-h') {
      console.log('usage: run.mjs --models clay,stone --categories a,b --limit N --tag NAME (env: API_BASE, ADMIN_KEY)');
      process.exit(0);
    } else throw new Error(`unknown flag: ${a}`);
  }
  if (args.limit != null && (!Number.isInteger(args.limit) || args.limit < 1)) throw new Error('--limit must be a positive integer');
  return args;
}

async function runJob(job, cfg) {
  const { model, task } = job;
  let lastErr;
  let attempts = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    attempts += 1;
    try {
      const res = await callModel({
        rag: cfg.rag,
        apiBase: cfg.apiBase,
        adminKey: cfg.adminKey,
        model,
        prompt: task.prompt,
        system: task.system,
        tools: Array.isArray(task.expectTools) && task.expectTools.length > 0,
      });
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
      if (attempt === 0 && retryable) {
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
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
  const checker = resolveLuauChecker();
  console.log(`luau checker: ${checker ? checker.name : 'NONE (luau_syntax checks will fail)'}`);
  console.log(`models: ${cfg.models.join(', ')} · tasks: ${tasks.length} · concurrency: ${CONCURRENCY}`);

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
    luauChecker: checker?.name ?? null,
    transport: 'POST /api/admin/model-test',
  };
  mkdirSync(RESULTS_DIR, { recursive: true });
  const outFile = join(RESULTS_DIR, `${cfg.tag}-${timestamp()}.json`);
  writeFileSync(outFile, JSON.stringify({ runMeta, perTask, perCategory, overall }, null, 2));

  console.log('\n' + formatTable(cfg.models, perCategory, overall));
  const scored = scoreRun({ runMeta, perTask });
  console.log('\n' + formatScorecard(scored.overall, { title: `run scorecard [${cfg.tag}]` }));
  for (const model of scored.models) console.log('\n' + formatScorecard(scored.byModel[model], { title: `scorecard [${model}]` }));
  const errCount = perTask.filter((r) => !r.ok).length;
  if (errCount) console.log(`\n${errCount} job(s) had transport errors (EXCLUDED from the mean, not scored 0).`);
  console.log(`\nresults written to ${outFile}`);
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}
