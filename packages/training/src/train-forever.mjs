#!/usr/bin/env node
/**
 * Train Apple version after version, without stopping, and keep only what measurably wins.
 *
 * Each version vN is ONE lever applied to the current best config (forever-hypotheses.json, re-read
 * every version, then generated combos / lr perturbations / reseeds so the queue never runs dry). It
 * trains locally on MLX, keeps the best-val checkpoint, is scored with EXACTLY the commands that
 * scored v5 (generate_eval.py on runs/eval-set-v5.jsonl, greedy, --max-tokens 1200, then
 * score-eval.mjs), and is promoted only if its total beats the best's total, RESCORED with today's
 * scorer, by max(2, observed reseed spread). Reseeds never promote; rank > 8 never promotes.
 *
 * A run is judged by its LOG, never its exit code: the Metal watchdog
 * (kIOGPUCommandBufferCallbackErrorImpactingInteractivity) can kill the trainer while the shell
 * reports 0. A run that stops before half its iterations and before its val curve turned is
 * `truncated`: not evaluated, and the lever gets a second attempt in a later version.
 *
 * Every version first passes a pre-flight (>= 10 GB free, the pinned eval set unchanged, the best's
 * eval rescoring cleanly); a failing pre-flight waits instead of spending a version. Every child has
 * a timeout. Training and eval hold runs/forever/gpu.lock (shared by real and dry runs) and wait for
 * any other MLX job to finish first.
 *
 * Publishing (hf upload to moshebarami/apple-lora/vN, PEFT-converted by mlx_to_peft.py so the
 * pair stays servable on Workers AI) and Discord posts are best-effort and never fatal. Nothing
 * here calls Cloudflare.
 *
 * Stops only on .autonomy/STOP or runs/forever/STOP (checked between steps, before each training
 * start, and every 15 s while a child runs). Single instance: runs/forever/lock holds the pid.
 *
 *   node src/train-forever.mjs                 # forever
 *   node src/train-forever.mjs --once          # one version, then exit
 *   node src/train-forever.mjs --dry-run --once [--publish] [--post]   # 2 iters, 2 eval rows, runs/forever-dry/
 */
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFileSync, closeSync, copyFileSync, existsSync, linkSync, mkdirSync, openSync, readdirSync, readFileSync,
  renameSync, rmSync, statfsSync, writeFileSync, writeSync,
} from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const TRAINING = resolve(HERE, '..');
const ROOT = resolve(TRAINING, '../..');
const PY = join(TRAINING, '.venv/bin/python');
const HF_REPO = 'moshebarami/apple-lora';
const EVAL_SET = 'runs/eval-set-v5.jsonl';
const EVAL_MAX_TOKENS = 1200; // what v4/v5 on the v5 set were generated with (commit 9ba222f)
const MLX_LORA_DEFAULTS = { rank: 8, dropout: 0, scale: 20 };
const WATCHDOG = /kIOGPUCommandBufferCallbackErrorImpactingInteractivity|Impacting Interactivity/;
const PROMOTE_MARGIN = 2; // one point on 38 greedy rows is noise
const MAX_SERVABLE_RANK = 8; // Workers AI's documented limit; "up to 32" is ambiguous (docs/research/workers-ai-catalog.md)
const MAX_ATTEMPTS = 2;
const MIN_FREE_BYTES = 10e9;
const MIN = 60000;
const TRAIN_SEC_PER_ITER = 4; // measured on v6: 75 iters incl. load and 4 val passes in 4.7 min
const TIMEOUT = { template: 15 * MIN, eval: 240 * MIN, score: 30 * MIN, convert: 10 * MIN, hf: 30 * MIN };
const trainTimeout = (iters) => 10 * MIN + 3 * iters * TRAIN_SEC_PER_ITER * 1000;
const FOREVER_CMD = /train-forever\.mjs/;
const GPU_JOB = /^\S*[Pp]ython[\d.]*\s+(?:-m\s+mlx_lm\b|\S*(?:generate_eval|mlx_to_peft)\.py|\S*\/mlx_lm[.\w]*)/;

// ---------------------------------------------------------------- config (pure)

function parseScalar(v) {
  if (v === '' || v === 'null' || v === '~') return null;
  if (/^["{[]/.test(v)) return JSON.parse(v);
  if (v.startsWith("'")) return v.slice(1, -1);
  if (v === 'true' || v === 'false') return v === 'true';
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(v)) return Number(v);
  return v;
}

/** The flat `key: value` subset the lora-apple-*.yaml files use; nested values are JSON flow maps. */
export function parseYamlConfig(text) {
  const cfg = {};
  for (const line of text.split('\n')) {
    const m = /^([A-Za-z_]\w*):\s*(.*?)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if (!/^["'{[]/.test(v)) v = v.replace(/\s+#.*$/, '');
    cfg[m[1]] = parseScalar(v);
  }
  return cfg;
}

/** PyYAML reads `1e-4` as a string, so a float always gets a dot in its mantissa. */
function yamlNumber(n) {
  if (Number.isInteger(n) || Math.abs(n) >= 1e-3) return String(n);
  const [mant, exp] = n.toExponential().split('e');
  return `${mant.includes('.') ? mant : `${mant}.0`}e${exp.replace('+', '')}`;
}

export function renderYamlConfig(cfg, header = []) {
  const value = (v) => (typeof v === 'number' ? yamlNumber(v) : typeof v === 'boolean' || v === null ? String(v) : JSON.stringify(v));
  return [...header.map((h) => `# ${h}`.trimEnd()), ...Object.entries(cfg).map(([k, v]) => `${k}: ${value(v)}`)].join('\n') + '\n';
}

/** Warmup, then cosine decay to lr/10 over the OPTIMIZER updates (iters / accumulation). */
function cosineSchedule(cfg) {
  const lr = cfg.learning_rate;
  const updates = Math.ceil(cfg.iters / (cfg.grad_accumulation_steps ?? 1));
  return { name: 'cosine_decay', warmup: 5, arguments: [lr, updates, Number((lr / 10).toPrecision(6))] };
}

/** best config + one lever -> the vN config. The base is not mutated. */
export function deriveConfig(base, lever, { adapterPath, dataPath } = {}) {
  const cfg = structuredClone(base);
  for (const [key, value] of Object.entries(lever.set ?? {})) {
    if (key === 'lr_schedule' && value === 'cosine') continue;
    const [head, sub] = key.split('.');
    if (sub) cfg[head] = { ...(head === 'lora_parameters' ? MLX_LORA_DEFAULTS : {}), ...(cfg[head] ?? {}), [sub]: value };
    else cfg[head] = value;
  }
  // A cosine schedule carries its own lr, so it is re-derived whenever lr or iters move under it.
  if (lever.set?.lr_schedule === 'cosine' || cfg.lr_schedule?.name === 'cosine_decay') cfg.lr_schedule = cosineSchedule(cfg);
  if (lever.data?.length) {
    if (!dataPath) throw new Error(`lever ${lever.id} rewrites data but no data dir was given`);
    cfg.data = dataPath;
  }
  if (adapterPath) cfg.adapter_path = adapterPath;
  cfg.save_every = cfg.steps_per_eval; // every eval has a checkpoint, so the best-val one exists
  return cfg;
}

export function applyDryOverrides(cfg) {
  return { ...cfg, iters: 2, steps_per_eval: 1, save_every: 1, val_batches: 2, steps_per_report: 1 };
}

const stable = (v) => (Array.isArray(v) ? `[${v.map(stable).join(',')}]`
  : v && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
  : JSON.stringify(v));

/** Identity of what a lever would train: the derived config minus names (adapter dir, data dir). */
export function configKey(base, lever) {
  const cfg = deriveConfig(base, lever, { dataPath: 'derived' });
  delete cfg.adapter_path;
  cfg.data = lever.data?.length ? { from: base.data, ops: lever.data } : base.data;
  return createHash('sha256').update(stable(cfg)).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- data mix (pure)

const SELECT = {
  'game-logic': (r) => r.meta?.kind === 'game-logic',
  finish: (r) => r.meta?.kind === 'apple-tool-trajectory' && !r.messages?.at(-1)?.tool_calls?.length,
  'trajectory-call': (r) => r.meta?.kind === 'apple-tool-trajectory' && !!r.messages?.at(-1)?.tool_calls?.length,
};

/** Rewrites TRAIN rows only; valid/test are copied untouched so val loss and the eval stay comparable. */
export function transformTrainRows(rows, ops, verifiedShards = {}) {
  let out = [...rows];
  for (const op of ops) {
    if (op.op === 'upweight') {
      const select = SELECT[op.select];
      if (!select || !Number.isInteger(op.factor) || op.factor < 1) throw new Error(`bad upweight op: ${JSON.stringify(op)}`);
      const picked = out.filter(select);
      for (let k = 1; k < op.factor; k++) out.push(...picked);
    } else if (op.op === 'dropFamilies') {
      const drop = new Set(op.families);
      out = out.filter((r) => !drop.has(r.meta?.family));
    } else if (op.op === 'appendVerified') {
      const addition = verifiedShards[op.source];
      if (!Array.isArray(addition) || addition.length === 0) throw new Error(`verified shard unavailable: ${op.source}`);
      const ids = new Set(out.map((r) => r.meta?.id).filter(Boolean));
      for (const r of addition) {
        if (r.meta?.kind !== 'game-logic' || !r.meta?.id || ids.has(r.meta.id)) {
          throw new Error(`duplicate or invalid verified game-logic id: ${r.meta?.id ?? '(missing)'}`);
        }
        ids.add(r.meta.id);
        out.push(r);
      }
    } else {
      throw new Error(`unknown data op: ${op.op}`);
    }
  }
  return out;
}

/** Re-execute every answer and verify provenance before a new shard enters the training split. */
export async function readVerifiedShard(source, expectedSha256) {
  const path = resolve(TRAINING, source);
  if (!path.startsWith(join(TRAINING, 'data') + '/') || !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new Error('verified shard path or digest is invalid');
  }
  if (sha256File(path) !== expectedSha256) throw new Error(`verified shard changed: ${source}`);
  const heldoutRows = readFileSync(join(TRAINING, EVAL_SET), 'utf8').split('\n')
    .filter(Boolean).map((line) => JSON.parse(line));
  const heldout = new Set(heldoutRows.map((r) => r.meta?.family).filter(Boolean));
  const shingles = (text) => {
    const words = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/);
    return words.length < 8 ? [] : words.slice(0, -7).map((_, i) => words.slice(i, i + 8).join(' '));
  };
  const heldoutPhrases = new Set(heldoutRows.flatMap((r) => r.messages ?? [])
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .flatMap((m) => shingles(m.content)));
  const { checkCandidate } = await import('./evaluate-game-logic.mjs');
  const rows = [];
  const ids = new Set();
  for (const line of readFileSync(path, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    const meta = r.meta ?? {};
    const answer = r.messages?.at(-1)?.content;
    const prompt = r.messages?.find((m) => m.role === 'user')?.content;
    const sourceCode = /^```luau\n([\s\S]*)\n```$/.exec(answer ?? '')?.[1];
    if (!sourceCode || !prompt || shingles(prompt).some((phrase) => heldoutPhrases.has(phrase))
      || !meta.id || ids.has(meta.id) || !meta.family || heldout.has(meta.family)
      || meta.origin !== 'first-party-authored-synthetic'
      || meta.rights !== 'private-project-source-not-publicly-licensed'
      || meta.evidence?.behaviorPassed !== true || meta.evidence?.mutationRejected !== true
      || meta.evidence?.studioVerified !== false || typeof meta.checks !== 'string'
      || createHash('sha256').update(sourceCode).digest('hex') !== meta.evidence?.sourceSha256
      || createHash('sha256').update(meta.checks).digest('hex') !== meta.evidence?.checksSha256) {
      throw new Error(`verified shard row invalid or overlaps holdout: ${meta.id ?? '(missing)'}`);
    }
    const checked = await checkCandidate({ checks: meta.checks }, answer);
    if (!checked.passed) throw new Error(`verified shard answer failed execution: ${meta.id}`);
    ids.add(meta.id);
    const { checks, ...safeMeta } = meta;
    rows.push({ messages: r.messages, meta: { ...safeMeta, kind: 'game-logic' } });
  }
  if (rows.length === 0) throw new Error('verified shard is empty');
  return rows;
}

// ---------------------------------------------------------------- log parsing (pure)

export function parseTrainLog(text) {
  const vals = [...text.matchAll(/Iter (\d+): Val loss ([\d.]+)/g)].map((m) => ({ iter: Number(m[1]), loss: Number(m[2]) }));
  const iters = [...text.matchAll(/Iter (\d+):/g)].map((m) => Number(m[1]));
  const watchdog = WATCHDOG.test(text);
  return {
    vals,
    lastIter: iters.length ? Math.max(...iters) : 0,
    completed: /Saved final weights/.test(text),
    watchdog,
    crashed: watchdog || /Traceback \(most recent call last\)/.test(text),
  };
}

/** The val curve has turned when `patience` evals after its minimum were all worse. */
export function hasTurned(vals, patience = 2) {
  if (!vals.length) return false;
  let at = 0;
  vals.forEach((v, i) => { if (v.loss < vals[at].loss) at = i; });
  return vals.length - 1 - at >= patience;
}

/**
 * Is an unfinished run worth evaluating? Yes if its val curve already turned (the minimum is behind
 * it) or it got through at least half its iterations (v5 itself died at 250/400 with its best at
 * 225). Otherwise it is truncated: not evaluated, and the lever stays available for another attempt.
 */
export function classifyTraining({ completed, lastIter, vals }, iters) {
  if (completed) return { usable: true, note: null };
  const at = `stopped at ${lastIter}/${iters}`;
  if (hasTurned(vals)) return { usable: true, note: `${at} after val turned` };
  return { usable: lastIter >= iters / 2, note: at };
}

/** Minimum val loss among evals whose numbered checkpoint exists on disk. */
export function pickBestCheckpoint(vals, availableIters) {
  const have = new Set(availableIters);
  let best = null;
  for (const v of vals) if (have.has(v.iter) && Number.isFinite(v.loss) && (!best || v.loss < best.loss)) best = v;
  return best && { iter: best.iter, loss: best.loss };
}

// ---------------------------------------------------------------- scoring and promotion (pure)

const TRACKS = [['trajectory', 'trajectory'], ['gameLogic', 'game-logic'], ['finish', 'finish']];

export function scoresFromScored(scored) {
  const a = scored.tally.adapter;
  const get = (k) => a[k] ?? { ok: 0, n: 0 };
  const s = { trajectory: get('trajectory').ok, gameLogic: get('game-logic').ok, finish: get('finish').ok };
  return { ...s, total: s.trajectory + s.gameLogic + s.finish, n: { trajectory: get('trajectory').n, gameLogic: get('game-logic').n, finish: get('finish').n } };
}

/**
 * Reasons a scored eval is not comparable: row counts off the pinned set, a base side that no longer
 * scores what the best's base scores (base decoding is greedy and deterministic: v4's and v5's runs
 * produced identical base answers on all 38 rows), or misses the scorer could not actually judge.
 */
export function evalProblems(scored, { n, base } = {}) {
  const out = [];
  const side = (s, track) => scored.tally[s]?.[track] ?? { ok: 0, n: 0 };
  for (const [k, track] of TRACKS) {
    if (n && side('adapter', track).n !== n[k]) out.push(`${track} n ${side('adapter', track).n} != ${n[k]}`);
    if (base && side('base', track).ok !== (base[track]?.ok ?? 0)) out.push(`base ${track} ${side('base', track).ok} != ${base[track]?.ok ?? 0}`);
  }
  for (const s of ['adapter', 'base']) {
    for (const [track, t] of Object.entries(scored.tally[s] ?? {})) {
      for (const [reason, count] of Object.entries(t.reasons ?? {})) {
        if (/^(harness_unavailable|example_not_in_curriculum)/.test(reason)) out.push(`${s} ${track}: ${count}x ${reason}`);
      }
    }
  }
  return out;
}

/** max(floor, the widest spread seen between a best and its own reseeds). */
export function promotionMargin(history, floor = PROMOTE_MARGIN) {
  const groups = new Map();
  for (const h of history) {
    if (h.status !== 'done' || !h.scores || !h.lever?.id?.startsWith('reseed@') || h.bestTotalAtRun == null) continue;
    const g = groups.get(h.bestVersionAtRun) ?? [h.bestTotalAtRun];
    g.push(h.scores.total);
    groups.set(h.bestVersionAtRun, g);
  }
  return Math.max(floor, ...[...groups.values()].map((g) => Math.max(...g) - Math.min(...g)));
}

/** A tie never promotes, so val loss (not comparable across mask_prompt / data / seq-length levers) never decides. */
export function shouldPromote(candidate, bestTotal, margin) {
  if (!candidate?.scores) return { promote: false, why: 'no scores' };
  if (candidate.lever?.id?.startsWith('reseed@')) return { promote: false, why: 'reseed: measures noise, never promoted' };
  const rank = candidate.cfg?.lora_parameters?.rank ?? MLX_LORA_DEFAULTS.rank;
  if (rank > MAX_SERVABLE_RANK) return { promote: false, why: `rank ${rank} > ${MAX_SERVABLE_RANK} is not verified servable on Workers AI` };
  const bar = bestTotal + margin;
  return candidate.scores.total >= bar ? { promote: true, why: `${candidate.scores.total} >= bar ${bar}` } : { promote: false, why: `${candidate.scores.total} < bar ${bar}` };
}

// ---------------------------------------------------------------- hypotheses (pure)

// Statuses that say nothing about the lever: the run was cut off from outside, or the measurement
// itself was broken (the eval set, the scorer's harness, or the base side moved).
const NO_ATTEMPT = new Set(['started', 'interrupted', 'stopped', 'eval_invalid']);

/** A lever is used up by one `done` run or by MAX_ATTEMPTS failed ones. */
export function triedIds(state) {
  const attempts = new Map();
  const tried = new Set();
  for (const h of state.history) {
    if (!h.lever || NO_ATTEMPT.has(h.status)) continue;
    const n = (attempts.get(h.lever.id) ?? 0) + 1;
    attempts.set(h.lever.id, n);
    if (h.status === 'done' || n >= MAX_ATTEMPTS) tried.add(h.lever.id);
  }
  return tried;
}

function combine(a, b) {
  const clash = Object.keys(a.set ?? {}).some((k) => k in (b.set ?? {}));
  if (clash) return null;
  const [x, y] = [a, b].sort((p, q) => p.id.localeCompare(q.id));
  return {
    id: `combo(${x.id}+${y.id})`,
    why: `Generated: the two levers with the largest gain over the best of their day, ${x.id} and ${y.id}, applied at once.`,
    parts: [...(x.parts ?? [x.id]), ...(y.parts ?? [y.id])],
    ...(Object.keys({ ...x.set, ...y.set }).length ? { set: { ...x.set, ...y.set } } : {}),
    ...([...(x.data ?? []), ...(y.data ?? [])].length ? { data: [...(x.data ?? []), ...(y.data ?? [])] } : {}),
  };
}

/** What to try once the queue is exhausted; the last item is always new, so this never runs dry. */
export function generateHypotheses(state, version) {
  const tried = triedIds(state);
  const lineage = new Set(state.best?.lineage ?? []);
  const gain = (h) => h.scores.total - (h.bestTotalAtRun ?? state.best?.scores?.total ?? 0);
  const seen = new Set();
  const ranked = state.history
    .filter((h) => h.lever && h.status === 'done' && h.scores && !h.lever.id.startsWith('reseed@'))
    .filter((h) => !(h.lever.parts ?? [h.lever.id]).some((p) => lineage.has(p)))
    .sort((a, b) => gain(b) - gain(a) || (a.valLoss ?? Infinity) - (b.valLoss ?? Infinity) || 0)
    .map((h) => h.lever)
    .filter((l) => !seen.has(l.id) && seen.add(l.id))
    .slice(0, 3);
  const out = [];
  pairs: for (let i = 0; i < ranked.length; i++) {
    for (let j = i + 1; j < ranked.length; j++) {
      const c = combine(ranked[i], ranked[j]);
      if (c && !tried.has(c.id)) { out.push(c); break pairs; }
    }
  }
  const lr = state.best.cfg.learning_rate;
  for (const f of [0.5, 2]) {
    out.push({
      id: `lr-x${f}@v${state.best?.version}`,
      why: `Generated: learning rate x${f} of the best (v${state.best?.version}).`,
      set: { learning_rate: Number((lr * f).toPrecision(6)) },
    });
  }
  out.push({ id: `reseed@v${version}`, why: 'Generated: the best config with a new seed, to measure run-to-run noise (never promoted).', set: { seed: version } });
  return out;
}

/** First untried lever whose derived config has not already been trained (seeds included). */
export function pickHypothesis(queue, state, version) {
  const tried = triedIds(state);
  const blocked = new Set(state.history
    .filter((h) => h.configKey && (h.status === 'seed' || (h.lever && tried.has(h.lever.id))))
    .map((h) => h.configKey));
  const fresh = (h) => !tried.has(h.id) && !blocked.has(configKey(state.best.cfg, h));
  return queue.find(fresh) ?? generateHypotheses(state, version).find(fresh);
}

// ---------------------------------------------------------------- reporting (pure)

const frac = (s, k) => (s ? `${s[k]}/${s.n?.[k] ?? '?'}` : '—');
const cell = (t) => String(t).replace(/[|\n]/g, ' ');

export function formatStatus(e) {
  const note = e.trainNote ?? e.problems?.[0] ?? e.error;
  return cell(`${e.status}${note ? ` (${note})` : ''}${e.retry ? `, retry: ${e.retry}` : ''}${e.scores && !e.promoted && e.promoteWhy ? `; ${e.promoteWhy}` : ''}`);
}

export function formatLogLine(e) {
  const val = e.valLoss != null ? `${e.valLoss.toFixed(3)} @${e.bestIter ?? '?'}` : '—';
  return `| v${e.version} | ${e.lever?.id ?? '(seed)'} | ${val} | ${frac(e.scores, 'trajectory')} | ${frac(e.scores, 'gameLogic')} | ${frac(e.scores, 'finish')} | ${e.scores?.total ?? '—'} | ${e.promoted ? 'yes' : 'no'} | ${formatStatus(e)} |`;
}

/** Highest vN any file name claims (configs, adapter dirs, evals, logs, derived data). */
export function versionsIn(names) {
  let max = 0;
  for (const n of names) {
    const m = /^(?:lora-apple-v(\d+)\.yaml|apple-v(\d+)(?:-.*)?|eval-v(\d+)-.*|v(\d+)-.*\.log|data-v(\d+))$/.exec(n);
    if (m) max = Math.max(max, Number(m.slice(1).find((x) => x !== undefined)));
  }
  return max;
}

const LOG_HEADER = `# Apple forever-training log

One line per version trained by \`packages/training/src/train-forever.mjs\`. Each version is one lever
applied to the best config at the time. Scores are the adapter side of the pinned v5 held-out set
(\`runs/eval-set-v5.jsonl\`: 23 trajectory / 8 game-logic / 7 finish), generated by
\`generate_eval.py --max-tokens ${EVAL_MAX_TOKENS}\` (greedy) and scored by \`score-eval.mjs\`, exactly as v5 was.
Seeds: v4 = 14/0/6 (20), v5 = 17/0/3 (20, best, val 0.838).

Promotion: total >= the best's total (rescored with the scorer of the day) + max(2, observed reseed
spread). Ties never promote; \`reseed@\` versions only measure noise; rank > 8 never promotes.
\`truncated\` = stopped before half its iterations with the val curve still falling: not evaluated, the
lever gets a second attempt. \`eval_invalid\` = the measurement broke (eval set, scorer harness or base
side moved), not the lever. Lines before this header's promotion rule (v6-v7 of the first start)
were written by the first version of the supervisor.

| version | lever | best val loss (iter) | trajectory | game-logic | finish | total | promoted | status |
|---|---|---|---|---|---|---|---|---|
`;

function renderModelCard(state, model) {
  const b = state.best;
  const rows = state.history.filter((h) => h.scores).map((h) => formatLogLine(h)).join('\n');
  return `---
base_model: ${model}
library_name: peft
tags: [lora, llama-3.2, roblox, luau, mlx]
---
# Apple LoRA

LoRA adapters for Apple, a Roblox engineering assistant, on \`${model}\`
(== Workers AI \`@cf/meta/llama-3.2-3b-instruct\`). Each \`vN/\` folder holds a PEFT
\`adapter_config.json\` (\`model_type: llama\`) + \`adapter_model.safetensors\` (converted from MLX by
\`mlx_to_peft.py\`, delta-W equivalence checked, < 300 MB; promoted versions are rank <= 8) and its
held-out eval.

**Current best: v${b.version}** — trajectory ${frac(b.scores, 'trajectory')}, game-logic ${frac(b.scores, 'gameLogic')},
finish ${frac(b.scores, 'finish')} (total ${b.scores.total}), val loss ${b.valLoss ?? '—'}.

Held-out set: 38 rows (families disjoint from training), greedy decoding, scored by execution
(Luau modules run against their own checks; tool calls validated against the product's registry).

| version | lever | best val loss (iter) | trajectory | game-logic | finish | total | promoted | status |
|---|---|---|---|---|---|---|---|---|
${rows}
`;
}

// ---------------------------------------------------------------- locks and processes

const stamp = () => new Date().toISOString();
const rel = (p) => relative(TRAINING, p);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

function commandOf(pid) {
  try {
    return execFileSync('ps', ['-o', 'command=', '-p', String(pid)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/**
 * Take `path` for this pid. Empty, dead-pid and reused-pid (not a train-forever) locks are stale.
 * The new lock appears atomically (link of a temp file), and a stale one is moved aside and put
 * back if what moved was not the lock that was judged stale.
 */
export function tryLock(path) {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, String(process.pid));
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        linkSync(tmp, path);
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
        let seen;
        try { seen = readFileSync(path, 'utf8').trim(); } catch { continue; }
        const pid = Number(seen);
        if (pid === process.pid) return true;
        if (pid > 0 && FOREVER_CMD.test(commandOf(pid))) return false;
        const aside = `${path}.stale.${process.pid}`;
        try { renameSync(path, aside); } catch { continue; }
        const moved = readFileSync(aside, 'utf8').trim();
        if (moved !== seen) {
          try { linkSync(aside, path); } catch { /* a third starter holds it now */ }
          rmSync(aside, { force: true });
          return false;
        }
        rmSync(aside, { force: true });
        continue;
      }
      return readFileSync(path, 'utf8').trim() === String(process.pid);
    }
    return false;
  } finally {
    rmSync(tmp, { force: true });
  }
}

function releaseLock(path) {
  try { if (readFileSync(path, 'utf8').trim() === String(process.pid)) rmSync(path); } catch { /* gone */ }
}

function gpuJobs() {
  let out = '';
  try { out = execFileSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8', maxBuffer: 64 << 20 }); } catch { return []; }
  return out.split('\n').map((l) => /^\s*(\d+)\s+(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: Number(m[1]), cmd: m[2] }))
    .filter((p) => p.pid !== process.pid && GPU_JOB.test(p.cmd));
}

// ---------------------------------------------------------------- runtime

function layout(dry) {
  const out = join(TRAINING, dry ? 'runs/forever-dry' : 'runs/forever');
  return {
    out,
    dry,
    state: join(out, 'state.json'),
    lock: join(out, 'lock'),
    childPid: join(out, 'child.pid'),
    gpuLock: join(TRAINING, 'runs/forever/gpu.lock'), // one GPU: real and dry runs share it
    rescore: join(out, 'rescore'),
    config: (v) => (dry ? join(out, `lora-apple-v${v}.yaml`) : join(TRAINING, `lora-apple-v${v}.yaml`)),
    adapter: (v) => (dry ? join(out, `adapters/apple-v${v}`) : join(TRAINING, `adapters/apple-v${v}`)),
    data: (v) => join(out, `data-v${v}`),
    evalOut: (v) => (dry ? join(out, `eval-v${v}-on-v5set.json`) : join(TRAINING, `runs/eval-v${v}-on-v5set.json`)),
    versionDirs: dry ? [out, join(out, 'adapters')] : [TRAINING, join(TRAINING, 'adapters'), join(TRAINING, 'runs'), out],
    foreverLog: dry ? join(out, 'FOREVER-LOG.md') : join(ROOT, 'docs/training/FOREVER-LOG.md'),
    hfPrefix: dry ? 'dry/' : '',
  };
}

let L;
let current = null; // the running child, killed on SIGINT/SIGTERM
const say = (msg) => {
  const line = `[forever ${stamp()}] ${msg}`;
  console.log(line);
  try { if (L) appendFileSync(join(L.out, 'supervisor.log'), line + '\n'); } catch { /* disk full: stdout still has it */ }
};

function stopRequested() {
  return [join(ROOT, '.autonomy/STOP'), join(TRAINING, 'runs/forever/STOP'), L && join(L.out, 'STOP')].some((p) => p && existsSync(p));
}

const highestOnDisk = () => versionsIn(L.versionDirs.flatMap((d) => (existsSync(d) ? readdirSync(d) : [])));

function saveState(state) {
  const tmp = `${L.state}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1) + '\n');
  renameSync(tmp, L.state);
}

function seedState() {
  const scored = (v) => scoresFromScored(readJson(join(TRAINING, `runs/eval-${v}-on-v5set-scored.json`)));
  let v5Val = null;
  try {
    const vals = parseTrainLog(readFileSync(join(TRAINING, 'runs/apple-v5.log'), 'utf8')).vals;
    v5Val = Math.min(...vals.map((v) => v.loss));
  } catch { /* no log: recorded as unknown */ }
  const v5 = { version: 5, scores: scored('v5'), valLoss: v5Val, adapterPath: 'adapters/apple-v5-best', config: 'lora-apple-v5.yaml', lineage: [] };
  return {
    next: 6,
    best: v5,
    history: [
      // v4's val loss (0.982) was on the v4 valid split, so it is not comparable and not recorded.
      { version: 4, lever: null, status: 'seed', scores: scored('v4'), valLoss: null, adapterPath: 'adapters/apple-v4-best', config: 'lora-apple-v4.yaml', promoted: false },
      { ...v5, lever: null, status: 'seed', bestIter: 225, promoted: true },
    ],
  };
}

/** Fills what older state files lack. The best's config is parsed ONCE and kept in the state, so a
 *  later edit of a tracked yaml cannot silently change what every new version derives from. */
function migrateState(state) {
  if (!state.best.cfg) state.best.cfg = parseYamlConfig(readFileSync(resolve(TRAINING, state.best.config), 'utf8'));
  state.best.evalRaw ??= state.best.version === 5 ? 'runs/eval-v5-on-v5set.json' : rel(L.evalOut(state.best.version));
  if (!state.evalSet) {
    const n = state.history.find((h) => h.version === 5 && h.status === 'seed')?.scores?.n ?? state.best.scores.n;
    state.evalSet = { path: EVAL_SET, sha256: sha256File(join(TRAINING, EVAL_SET)), n };
    say(`pinned ${EVAL_SET}: sha256 ${state.evalSet.sha256.slice(0, 12)}, n ${JSON.stringify(n)}`);
  }
  for (const h of state.history) {
    if (h.configKey) continue;
    try {
      if (h.status === 'seed' && h.config) h.configKey = configKey(parseYamlConfig(readFileSync(resolve(TRAINING, h.config), 'utf8')), { id: 'seed' });
      else if (h.lever && state.best.version === 5) h.configKey = configKey(state.best.cfg, h.lever); // nothing was promoted yet, so v5 was their base
    } catch { /* unreadable old config: no key, so no dedupe against it */ }
  }
}

/** Spawn with stdout+stderr to a log file. Polls STOP; kills on timeout. Resolves {code, stopped, timedOut}. */
export function run(cmd, args, { log, append = false, env, timeoutMs } = {}) {
  return new Promise((resolveRun) => {
    const fd = openSync(log, append ? 'a' : 'w');
    const shown = args[0] === '-c' ? ['-c', '<inline script>', ...args.slice(2)] : args;
    writeSync(fd, `\n$ ${cmd === PY ? '.venv/bin/python' : cmd} ${shown.join(' ')}   (${stamp()})\n`);
    let stopped = false;
    let timedOut = false;
    let killer;
    let limit;
    const child = spawn(cmd, args, { cwd: TRAINING, stdio: ['ignore', fd, fd], env: { ...process.env, PYTHONUNBUFFERED: '1', ...env } });
    current = child;
    // A SIGKILLed supervisor leaves its child running; the next start finds it through this file.
    if (L && child.pid) try { writeFileSync(L.childPid, JSON.stringify({ pid: child.pid, tag: (args[0] === '-c' ? args.slice(2) : args).join(' ') })); } catch { /* best effort */ }
    const end = () => { child.kill('SIGTERM'); killer = setTimeout(() => child.kill('SIGKILL'), 30000); };
    const poll = setInterval(() => { if (!stopped && !timedOut && stopRequested()) { stopped = true; end(); } }, 15000);
    if (timeoutMs) {
      limit = setTimeout(() => {
        if (stopped) return;
        timedOut = true;
        try { writeSync(fd, `\n[forever] timeout after ${Math.round(timeoutMs / 1000)} s: SIGTERM, then SIGKILL after 30 s\n`); } catch { /* closed */ }
        end();
      }, timeoutMs);
    }
    const done = (code) => {
      clearInterval(poll);
      clearTimeout(limit);
      clearTimeout(killer);
      try { closeSync(fd); } catch { /* already closed */ }
      current = null;
      if (L) rmSync(L.childPid, { force: true });
      resolveRun({ code, stopped, timedOut });
    };
    child.on('error', (e) => { try { writeSync(fd, `spawn failed: ${e.message}\n`); } catch { /* closed */ } done(-1); });
    child.on('exit', (code, signal) => done(code ?? (signal ? 128 : -1)));
  });
}

async function killOrphan() {
  let rec;
  try { rec = readJson(L.childPid); } catch { return; }
  const cmd = rec.pid > 0 ? commandOf(rec.pid) : '';
  if (cmd && rec.tag && cmd.includes(rec.tag)) {
    say(`killing orphaned child ${rec.pid} of a previous supervisor (${rec.tag.slice(0, 80)})`);
    try { process.kill(rec.pid, 'SIGTERM'); } catch { /* gone */ }
    for (let t = 0; t < 30 && commandOf(rec.pid); t++) await sleep(1000);
    if (commandOf(rec.pid)) try { process.kill(rec.pid, 'SIGKILL'); } catch { /* gone */ }
  }
  rmSync(L.childPid, { force: true });
}

/** Holds the shared GPU lock, then waits until no other MLX job (a peer's, an orphan) is running. */
async function acquireGpu() {
  let said = '';
  while (!stopRequested()) {
    let msg;
    if (tryLock(L.gpuLock)) {
      const others = gpuJobs();
      if (!others.length) return true;
      msg = `waiting for the GPU: ${others.map((p) => `pid ${p.pid} ${p.cmd.slice(0, 90)}`).join('; ')}`;
    } else {
      msg = `waiting for ${rel(L.gpuLock)} (another train-forever is on the GPU)`;
    }
    if (msg !== said) { say(msg); said = msg; }
    await sleep(30000);
  }
  return false;
}

// Every train row, rendered with the base's own template: the full conversation must begin with
// the exact prefix generate_eval.py continues from, and no <think> may sit in the answer span.
const TEMPLATE_CHECK = `
import json, sys
from transformers import AutoTokenizer
tok = AutoTokenizer.from_pretrained(sys.argv[1])
bad, n = [], 0
for line in open(sys.argv[2]):
    if not line.strip():
        continue
    r = json.loads(line); m = r["messages"]; t = r.get("tools")
    full = tok.apply_chat_template(m, tools=t, tokenize=False)
    pre = tok.apply_chat_template(m[:-1], tools=t, tokenize=False, add_generation_prompt=True)
    n += 1
    if not full.startswith(pre) or "<think>" in full[len(pre):]:
        bad.append((r.get("meta") or {}).get("id") or n)
print(json.dumps({"rows": n, "bad": len(bad), "examples": bad[:5]}))
sys.exit(3 if bad else 0)
`;

async function writeDerivedData(srcDir, dstDir, ops) {
  const rows = readFileSync(join(srcDir, 'train.jsonl'), 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  const shards = {};
  for (const op of ops) if (op.op === 'appendVerified') shards[op.source] = await readVerifiedShard(op.source, op.sha256);
  const out = transformTrainRows(rows, ops, shards);
  mkdirSync(dstDir, { recursive: true });
  writeFileSync(join(dstDir, 'train.jsonl'), out.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (const f of ['valid.jsonl', 'test.jsonl']) if (existsSync(join(srcDir, f))) copyFileSync(join(srcDir, f), join(dstDir, f));
  writeFileSync(join(dstDir, 'derivation.json'), JSON.stringify({ from: rel(srcDir), ops, trainRows: { before: rows.length, after: out.length } }, null, 2) + '\n');
  return { before: rows.length, after: out.length };
}

function wrap(text, width = 98) {
  const lines = [];
  let cur = '';
  for (const w of String(text).split(/\s+/)) {
    if (cur && cur.length + w.length + 1 > width) { lines.push(cur); cur = w; } else cur = cur ? `${cur} ${w}` : w;
  }
  return cur ? [...lines, cur] : lines;
}

const checkpoints = (dir) => (existsSync(dir) ? readdirSync(dir) : [])
  .map((f) => /^(\d{7})_adapters\.safetensors$/.exec(f)).filter(Boolean).map((m) => Number(m[1]));

/** Copies the best's raw eval aside and scores it with TODAY's scorer: the number a candidate must beat. */
async function rescoreBest(ctx) {
  const src = resolve(TRAINING, ctx.state.best.evalRaw);
  mkdirSync(L.rescore, { recursive: true });
  const copy = join(L.rescore, basename(src));
  const out = copy.replace(/\.json$/, '-scored.json');
  copyFileSync(src, copy);
  rmSync(out, { force: true });
  const r = await run(process.execPath, ['src/score-eval.mjs', rel(copy)], { log: join(L.out, 'rescore.log'), timeoutMs: TIMEOUT.score });
  if (r.code !== 0 || !existsSync(out)) return { problems: [`score-eval on v${ctx.state.best.version}'s eval exit ${r.code}${r.timedOut ? ' (timeout)' : ''}`] };
  const scored = readJson(out);
  return { scores: scoresFromScored(scored), base: scored.tally.base, problems: evalProblems(scored, { n: ctx.state.evalSet.n }) };
}

/** Why a version must not start now (it would waste the GPU or produce an incomparable score), or null. */
async function preflight(ctx) {
  const fs = statfsSync(TRAINING);
  const free = fs.bavail * fs.bsize;
  if (free < MIN_FREE_BYTES) return `only ${(free / 1e9).toFixed(1)} GB free on disk (need ${MIN_FREE_BYTES / 1e9})`;
  const sha = sha256File(join(TRAINING, EVAL_SET));
  if (sha !== ctx.state.evalSet.sha256) return `${EVAL_SET} changed (sha256 ${sha.slice(0, 12)}, pinned ${ctx.state.evalSet.sha256.slice(0, 12)}): scores would not be comparable`;
  const ref = await rescoreBest(ctx);
  if (ref.problems.length) return `rescoring the best's eval: ${ref.problems.join('; ')}`;
  return null;
}

async function runVersion(ctx, entry) {
  const { state, dry } = ctx;
  const v = entry.version;
  const lever = entry.lever;
  const cfgPath = L.config(v);
  const adapterDir = L.adapter(v);
  const bestDir = `${adapterDir}-best`;
  const evalOut = L.evalOut(v);
  const taken = [cfgPath, adapterDir, bestDir, evalOut, L.data(v)].filter((p) => existsSync(p));
  if (taken.length) throw new Error(`refusing to overwrite ${taken.map(rel).join(', ')}`);
  const base = state.best.cfg;

  // 1. config (+ derived data)
  let dataPath;
  if (lever.data?.length) {
    const counts = await writeDerivedData(resolve(TRAINING, base.data), L.data(v), lever.data);
    dataPath = rel(L.data(v));
    say(`v${v}: derived ${dataPath} from ${base.data} (train rows ${counts.before} -> ${counts.after})`);
  }
  const fullCfg = deriveConfig(base, lever, { adapterPath: rel(adapterDir), dataPath });
  const cfg = dry ? applyDryOverrides(fullCfg) : fullCfg;
  const changes = [
    ...Object.entries(lever.set ?? {}).map(([k, val]) => `${k}=${JSON.stringify(val)}`),
    ...(lever.data ?? []).map((op) => `data:${JSON.stringify(op)}`),
  ];
  const header = [
    `Apple v${v} — written by src/train-forever.mjs; do not hand-edit (the next version derives from the best).`,
    '',
    `Lever: ${lever.id} — one change relative to the best at the time, v${state.best.version} (${state.best.config}).`,
    ...wrap(`Why: ${lever.why}`),
    ...wrap(`Change: ${changes.join('; ')}`),
    ...(dry ? ['DRY RUN: iters 2, steps_per_eval 1, save_every 1, val_batches 2.'] : []),
  ];
  writeFileSync(cfgPath, renderYamlConfig(cfg, header), { flag: 'wx' });
  entry.config = rel(cfgPath);
  say(`v${v}: lever ${lever.id} -> ${entry.config}`);

  // 2. chat-template pre-flight on the exact train file
  const trainFile = join(resolve(TRAINING, cfg.data), 'train.jsonl');
  const tplLog = join(L.out, `v${v}-template-check.log`);
  const tpl = await run(PY, ['-c', TEMPLATE_CHECK, cfg.model, rel(trainFile)], { log: tplLog, timeoutMs: TIMEOUT.template });
  if (tpl.stopped) { entry.status = 'stopped'; return; }
  if (tpl.code === 3) { entry.status = 'template_mismatch'; say(`v${v}: chat-template prefix mismatch, see ${rel(tplLog)}`); return; }
  if (tpl.code !== 0) say(`v${v}: template pre-flight could not run (exit ${tpl.code}${tpl.timedOut ? ', timeout' : ''}, ${rel(tplLog)}); continuing`);

  // 3. train, alone on the GPU
  if (!(await acquireGpu())) { entry.status = 'stopped'; return; }
  const logPath = join(L.out, `v${v}-train.log`);
  entry.trainLog = rel(logPath);
  say(`v${v}: training (${cfg.iters} iters) -> ${entry.trainLog}`);
  mkdirSync(adapterDir, { recursive: true });
  const tr = await run(PY, ['-m', 'mlx_lm', 'lora', '--config', rel(cfgPath)], { log: logPath, timeoutMs: trainTimeout(cfg.iters) });
  if (tr.stopped) { entry.status = 'stopped'; return; }
  const result = parseTrainLog(readFileSync(logPath, 'utf8'));
  entry.train = { completed: result.completed, watchdog: result.watchdog, crashed: result.crashed, timedOut: tr.timedOut, lastIter: result.lastIter, exitCode: tr.code, vals: result.vals };
  const verdict = classifyTraining(result, cfg.iters);
  const cause = result.watchdog ? 'Metal watchdog' : tr.timedOut ? 'timeout' : result.crashed ? 'crashed' : null;
  entry.trainNote = verdict.note && [verdict.note, cause].filter(Boolean).join(', ');
  if (!verdict.usable) {
    entry.status = tr.timedOut ? 'timeout' : 'truncated';
    say(`v${v}: ${entry.status} (${entry.trainNote}); not evaluated, ${lever.id} stays available for another attempt; see ${entry.trainLog}`);
    return;
  }
  const best = pickBestCheckpoint(result.vals, checkpoints(adapterDir));
  if (!best) { entry.status = 'failed_training'; say(`v${v}: no checkpoint with a val loss (last iter ${result.lastIter}); see ${entry.trainLog}`); return; }
  mkdirSync(bestDir, { recursive: true });
  copyFileSync(join(adapterDir, `${String(best.iter).padStart(7, '0')}_adapters.safetensors`), join(bestDir, 'adapters.safetensors'));
  copyFileSync(join(adapterDir, 'adapter_config.json'), join(bestDir, 'adapter_config.json'));
  entry.valLoss = best.loss;
  entry.bestIter = best.iter;
  entry.adapterPath = rel(bestDir);
  say(`v${v}: ${entry.trainNote ?? `completed ${result.lastIter} iters`}; best val ${best.loss} @${best.iter} -> ${entry.adapterPath}`);
  saveState(state);

  // 4. evaluate with the v5 commands
  if (stopRequested()) { entry.status = 'stopped'; return; }
  let evalSet = EVAL_SET;
  if (dry) {
    evalSet = rel(join(L.out, 'eval-set-2rows.jsonl'));
    // one game-logic row and one tool-call row, so both scoring paths run
    const lines = readFileSync(join(TRAINING, EVAL_SET), 'utf8').split('\n').filter((l) => l.trim());
    const pick = (test) => lines.find((l) => test(JSON.parse(l)));
    const two = [pick((r) => r.meta?.kind === 'game-logic'), pick((r) => r.meta?.kind === 'apple-tool-trajectory' && r.messages.at(-1).tool_calls?.length)];
    writeFileSync(resolve(TRAINING, evalSet), two.filter(Boolean).join('\n') + '\n');
  }
  const evalLog = join(L.out, `v${v}-eval.log`);
  say(`v${v}: evaluating on ${evalSet} -> ${rel(evalOut)}`);
  const gen = await run(PY, ['src/generate_eval.py', '--adapter', entry.adapterPath, '--data', evalSet, '--out', rel(evalOut), '--max-tokens', String(dry ? 128 : EVAL_MAX_TOKENS)], { log: evalLog, timeoutMs: TIMEOUT.eval });
  if (gen.stopped) { entry.status = 'stopped'; return; }
  if (gen.code !== 0 || !existsSync(evalOut)) { entry.status = gen.timedOut ? 'timeout' : 'eval_failed'; say(`v${v}: generate_eval ${entry.status} (exit ${gen.code}), see ${rel(evalLog)}`); return; }
  const sc = await run(process.execPath, ['src/score-eval.mjs', rel(evalOut)], { log: evalLog, append: true, timeoutMs: TIMEOUT.score });
  const scoredPath = evalOut.replace(/\.json$/, '-scored.json');
  if (sc.code !== 0 || !existsSync(scoredPath)) { entry.status = sc.timedOut ? 'timeout' : 'eval_failed'; say(`v${v}: score-eval ${entry.status} (exit ${sc.code}), see ${rel(evalLog)}`); return; }
  entry.eval = rel(scoredPath);
  const scored = readJson(scoredPath);
  entry.scores = scoresFromScored(scored);

  // 5. check the measurement, then compare against the best rescored by the same scorer code
  const ref = await rescoreBest(ctx);
  const problems = [...ref.problems.map((p) => `best rescore: ${p}`), ...evalProblems(scored, dry ? {} : { n: state.evalSet.n, base: ref.base })];
  if (problems.length) {
    entry.status = 'eval_invalid';
    entry.problems = problems;
    say(`v${v}: eval not comparable, not promoted: ${problems.join('; ')}`);
    return;
  }
  const prev = state.best;
  entry.bestTotalAtRun = ref.scores.total;
  const decision = shouldPromote({ lever, scores: entry.scores, cfg: fullCfg }, ref.scores.total, promotionMargin(state.history));
  entry.promoted = decision.promote;
  entry.promoteWhy = decision.why;
  entry.status = 'done';
  if (entry.promoted) {
    state.best = {
      version: v, scores: entry.scores, valLoss: entry.valLoss, adapterPath: entry.adapterPath, config: entry.config,
      cfg: fullCfg, evalRaw: rel(evalOut), lineage: [...(prev.lineage ?? []), ...(lever.parts ?? [lever.id])],
    };
  }
  const s = entry.scores;
  say(`v${v}: trajectory ${frac(s, 'trajectory')}, game-logic ${frac(s, 'gameLogic')}, finish ${frac(s, 'finish')} = ${s.total} vs best v${prev.version} rescored ${ref.scores.total}; promoted ${entry.promoted ? 'YES' : 'no'} (${decision.why})`);
  saveState(state);

  // 6. publish (never fatal)
  await publish(ctx, entry, cfg);
  // 7. discord (never fatal)
  const b = ref.scores;
  await notify(ctx, [
    `**Apple v${entry.version}${ctx.dry ? ' (dry run)' : ''}** — lever \`${lever.id}\``,
    `trajectory ${frac(s, 'trajectory')} · game-logic ${frac(s, 'gameLogic')} · finish ${frac(s, 'finish')} = **${s.total}**  vs best v${prev.version}: ${b.trajectory}/${b.gameLogic}/${b.finish} = ${b.total}`,
    `val loss ${entry.valLoss} @${entry.bestIter}${entry.trainNote ? ` (${entry.trainNote})` : ''} · promoted: **${entry.promoted ? 'YES' : 'no'}** (${decision.why})`,
    entry.publish?.startsWith('https://') ? entry.publish : `HF: ${entry.publish ?? 'not published'}`,
  ].join('\n'), entry);
}

async function publish(ctx, entry, cfg) {
  const v = entry.version;
  const pubRoot = join(L.out, 'publish');
  const pubDir = join(pubRoot, `v${v}`);
  const log = join(L.out, `v${v}-publish.log`);
  try {
    mkdirSync(pubRoot, { recursive: true });
    writeFileSync(join(pubRoot, '.gitignore'), '*\n'); // staged safetensors never belong in git
    rmSync(pubDir, { recursive: true, force: true });
    // PEFT layout is what Workers AI serves; the converter also refuses rank > 32 or >= 300 MB.
    const conv = await run(PY, ['src/mlx_to_peft.py', entry.adapterPath, rel(pubDir), '--base', cfg.model], { log, timeoutMs: TIMEOUT.convert });
    if (conv.code !== 0) { entry.publish = `convert_failed (exit ${conv.code}${conv.timedOut ? ', timeout' : ''}) — NOT servable, see ${rel(log)}`; say(`v${v}: ${entry.publish}`); return; }
    copyFileSync(resolve(TRAINING, entry.eval), join(pubDir, `eval-v${v}-on-v5set-scored.json`));
    if (ctx.dry && !ctx.publish) { entry.publish = `converted to ${rel(pubDir)}; upload skipped (dry run)`; say(`v${v}: ${entry.publish}`); return; }
    const dest = `${L.hfPrefix}v${v}`;
    const up = await run('hf', ['upload', HF_REPO, pubDir, dest, '--repo-type', 'model', '--commit-message', `apple v${v}: ${entry.lever.id} (${entry.scores.total}${entry.promoted ? ', promoted' : ''})`], { log, append: true, timeoutMs: TIMEOUT.hf });
    entry.publish = up.code === 0 ? `https://huggingface.co/${HF_REPO}/tree/main/${dest}` : `upload_failed (exit ${up.code}${up.timedOut ? ', timeout' : ''}), see ${rel(log)}`;
    if (up.code === 0) rmSync(pubDir, { recursive: true, force: true }); // 27 MB a version; HF has it now
    if (up.code === 0 && entry.promoted) {
      const card = join(pubRoot, 'README.md');
      writeFileSync(card, renderModelCard(ctx.state, cfg.model));
      const rc = await run('hf', ['upload', HF_REPO, card, `${L.hfPrefix}README.md`, '--repo-type', 'model', '--commit-message', `model card: v${v} is the best`], { log, append: true, timeoutMs: TIMEOUT.hf });
      if (rc.code !== 0) entry.publish += `; README upload failed (exit ${rc.code})`;
    }
    say(`v${v}: publish ${entry.publish}`);
  } catch (e) {
    entry.publish = `error: ${e.message}`;
    say(`v${v}: publish error ${e.message}`);
  }
}

/** Best-effort Discord post; the webhook URL is never logged. */
async function notify(ctx, content, entry) {
  const url = process.env.DISCORD_WEBHOOK_MODEL_UPDATES;
  if (!url || (ctx.dry && !ctx.post)) return;
  let res;
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }), signal: AbortSignal.timeout(15000) });
    res = r.ok ? 'posted' : `http ${r.status}`;
  } catch (e) {
    res = `error: ${e.name}`;
  }
  if (entry) entry.discord = res;
  say(`discord ${res}`);
}

function appendForeverLog(entry) {
  if (!existsSync(L.foreverLog)) {
    mkdirSync(dirname(L.foreverLog), { recursive: true });
    writeFileSync(L.foreverLog, LOG_HEADER);
  }
  appendFileSync(L.foreverLog, formatLogLine(entry) + '\n');
}

async function backoff(ctx, failures, why) {
  const min = Math.min(60, 5 * 2 ** Math.max(0, failures - 2));
  say(`${why}; waiting ${min} min`);
  await notify(ctx, `train-forever${ctx.dry ? ' (dry run)' : ''}: ${why}; waiting ${min} min`);
  for (let t = 0; t < min * MIN && !stopRequested(); t += 15000) await sleep(15000);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const ctx = { dry: args.has('--dry-run'), once: args.has('--once'), publish: args.has('--publish'), post: args.has('--post') };
  L = layout(ctx.dry);
  for (const d of new Set([L.out, dirname(L.gpuLock)])) {
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, '.gitignore'), '*\n'); // state, locks, derived data, logs: none of it belongs in git
  }
  if (!tryLock(L.lock)) throw new Error(`another train-forever holds ${rel(L.lock)} (pid ${readFileSync(L.lock, 'utf8').trim()})`);
  process.on('exit', () => { releaseLock(L.gpuLock); releaseLock(L.lock); });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { current?.kill('SIGTERM'); process.exit(130); });
  await killOrphan();

  // HF_TOKEN / DISCORD_* for the children; values are never logged.
  const envFile = join(ROOT, '.env');
  if (existsSync(envFile)) { try { process.loadEnvFile(envFile); } catch (e) { say(`.env not loaded: ${e.message}`); } }

  const state = existsSync(L.state) ? readJson(L.state) : seedState();
  ctx.state = state;
  migrateState(state);
  for (const h of state.history) {
    if (h.status === 'started') h.status = 'interrupted';
    // A version's working dir (numbered checkpoints, ~27 MB each) is dead once its -best copy exists or it failed.
    if (h.lever && h.version) rmSync(L.adapter(h.version), { recursive: true, force: true });
  }
  state.next = Math.max(state.next, highestOnDisk() + 1);
  saveState(state);
  say(`start${ctx.dry ? ' (DRY RUN)' : ''}; best v${state.best.version} (${state.best.scores.total}), next v${state.next}`);

  let failures = 0;
  while (!stopRequested()) {
    let entry = null;
    try {
      const problem = await preflight(ctx);
      if (problem) {
        failures += 1;
        if (ctx.once) { say(`not starting a version: ${problem}`); break; }
        await backoff(ctx, failures, `not starting a version: ${problem}`);
        continue;
      }
      const queue = readJson(join(TRAINING, 'forever-hypotheses.json')).hypotheses; // edits apply without a restart
      const version = Math.max(state.next, highestOnDisk() + 1);
      const lever = pickHypothesis(queue, state, version);
      entry = { version, lever, configKey: configKey(state.best.cfg, lever), status: 'started', startedAt: stamp(), bestVersionAtRun: state.best.version };
      state.next = version + 1;
      state.history.push(entry);
      saveState(state);
      try {
        await runVersion(ctx, entry);
      } catch (e) {
        entry.status = 'error';
        entry.error = e.message;
        say(`v${version}: error ${e.stack ?? e.message}`);
      } finally {
        releaseLock(L.gpuLock);
        rmSync(L.adapter(version), { recursive: true, force: true }); // on every path; the -best copy is separate
      }
      entry.finishedAt = stamp();
      saveState(state);
      if (entry.status !== 'stopped') appendForeverLog(entry);
      if (entry.status !== 'done' && entry.status !== 'stopped') await notify(ctx, `Apple v${version}${ctx.dry ? ' (dry run)' : ''} \`${lever.id}\`: ${formatStatus(entry)}`, entry);
    } catch (e) {
      // e.g. ENOSPC on a state or log write: never fatal, the backoff below gives the disk time
      say(`loop error: ${e.stack ?? e.message}`);
      if (entry?.status === 'started') entry.status = 'error';
    }
    if (ctx.once) break;
    failures = entry?.status === 'done' ? 0 : failures + 1;
    if (failures >= 2) await backoff(ctx, failures, `${failures} failed versions in a row`);
  }
  say(stopRequested() ? 'STOP file present; exiting' : 'done (--once)');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    say(`fatal: ${e.message}`);
    process.exit(1);
  });
}
