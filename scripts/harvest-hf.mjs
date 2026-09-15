#!/usr/bin/env node
/**
 * Harvest the surveyed Hugging Face repositories, gate them, and write down what happened.
 *
 * WHY THIS FILE EXISTS, AND WHY IT ADMITS ALMOST NOTHING. A survey handed us eight Roblox/Luau
 * datasets and six Roblox models with download counts attached. Download counts are not a licence,
 * not a schema and not a quality signal. This harvester re-derives each verdict from the live Hub
 * API and, where the verdict survives that, from the ROWS THEMSELVES — and then records every
 * rejection with the number that produced it, so a refusal can be argued with rather than believed.
 *
 * THE THREE GATES, IN ORDER. A source must clear all three; the first failure stops it and is
 * recorded with its evidence.
 *
 *   1. LICENCE. `cardData.license` read live, normalised to SPDX. Permissive ids only. A licence
 *      an uploader ASSERTS over code they did not write is not a licence — see `provenanceDoubt`
 *      below, which is the field that kills a 1.9 GB MIT-stamped scrape of other people's games.
 *   2. CURRENCY. Roblox ships engine changes continuously; a corpus that has not moved in a year
 *      is teaching last year's API. `MAX_AGE_DAYS = 365`, measured against `lastModified`.
 *   3. CONTENT. Only reached by sources that passed 1 and 2, and only for TRAINING role. Sample
 *      rows and run the repository's OWN admission checks — `checkLuauSyntax` and
 *      `checkNoAntipattern`, the same two `build-dataset.mjs` uses — plus the structural signals
 *      that separate a corpus from a template expansion. A dataset that cannot clear the bar our
 *      own licensed code clears has no business being mixed into the same file.
 *
 * WHAT COMES OUT. Admitted TRAINING rows land in `packages/training/data/hf/<slug>.jsonl` in
 * exactly the shape `build-dataset.mjs` emits — `{messages:[system,user,assistant], meta:{...}}` —
 * so the existing `render_chat.py` -> `mlx_lm.lora` path reads them with no change. EVERY ROW
 * CARRIES ITS OWN PROVENANCE: `meta.dataset`, `meta.revision`, `meta.spdx`, `meta.split`,
 * `meta.rowIdx`. A training set that cannot say, row by row, where a row came from and under which
 * licence cannot answer a customer who asks, and "it was in the mix somewhere" is not an answer.
 *
 * Admitted EVAL-GATE rows land in `packages/evals/data/robloxqa/` — a different destination on
 * purpose. RobloxQA-v2.0 is multiple-choice prose with no Luau in it at all (measured below, not
 * assumed); it can measure whether a model still knows the engine, and it cannot teach one to
 * write code. Putting it in the training directory would be the mistake its own card invites.
 *
 * THE FAILURE FILE IS NOT OPTIONAL. `REJECTED.json` is written on every run, printed on every run,
 * and lists every source that did not survive with the field that killed it. A harvester that
 * silently yields fewer rows looks identical to a harvester that had less to find.
 *
 * NO PAID PROVIDER IS CONTACTED. This talks to huggingface.co and datasets-server.huggingface.co
 * and nothing else. It is a manual harvest, not a CI step.
 *
 * Usage:
 *   node scripts/harvest-hf.mjs [--limit N] [--only <id>] [--out-training DIR] [--out-eval DIR]
 *   --limit N     cap rows read per split (a real small run for review; omit for the full harvest).
 *                 A capped run MUST also pass --out-eval: see CANONICAL_EVAL_OUT below.
 *   --out-eval D  where the eval-gate splits go. Defaults to packages/evals/data/robloxqa.
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { checkLuauSyntax } from '../packages/evals/src/luau.mjs';
import { checkNoAntipattern } from '../packages/evals/src/roblox-antipatterns.mjs';
import { questionKey, findOverlap, findShingleOverlap, findNearDuplicates } from '../packages/evals/src/qa-overlap.mjs';
import { bucketOfGroundingDoc, BUCKETS } from '../packages/evals/src/qa-buckets.mjs';
import { loadTrainingInstructions, measureGateVsTraining } from '../packages/evals/src/train-gate-overlap.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..');

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const LIMIT = Number(argOf('--limit', '0')) || Infinity;
const ONLY = argOf('--only', null);
// `resolve`, not `join`: an ABSOLUTE --out-eval/--out-training must land where the caller said.
// `join(REPO_ROOT, '/tmp/x')` silently yields `<repo>/tmp/x`, so a run aimed at a scratch
// directory outside the tree wrote inside it instead — found by doing exactly that.
const TRAIN_OUT = resolve(REPO_ROOT, argOf('--out-training', 'packages/training/data/hf'));

/**
 * THE CANONICAL GATE DIRECTORY, AND WHY `--limit` MAY NOT WRITE TO IT.
 *
 * `--limit` exists so a reviewer can run this harvester cheaply. Before this guard, a cheap run
 * also REPLACED `gate.jsonl` with its first N rows, at the canonical path, keeping the same name.
 * Nothing announced it. The scorer would then have scored 200 questions and called the number the
 * gate; `question-keys.json` and `excluded-gate-rows.json` would have been rewritten to agree with
 * it, so the tests that recompute from the rows would have stayed green over a truncated
 * instrument. A demonstration run that silently becomes the measurement is the same
 * failure-to-observe shape as a guard that reports clean when it cannot see.
 *
 * So a capped run must name its own destination with `--out-eval`. The full run needs no flag.
 */
const CANONICAL_EVAL_OUT = join(REPO_ROOT, 'packages/evals/data/robloxqa');
const EVAL_OUT = resolve(REPO_ROOT, argOf('--out-eval', 'packages/evals/data/robloxqa'));
if (LIMIT !== Infinity && EVAL_OUT === CANONICAL_EVAL_OUT) {
  console.error(
    `REFUSING TO RUN.\n\n--limit ${LIMIT} would write a ${LIMIT}-row gate.jsonl over the full harvest at\n` +
    `  ${relative(REPO_ROOT, CANONICAL_EVAL_OUT)}\n` +
    'under the same filenames, and rewrite question-keys.json and excluded-gate-rows.json to agree\n' +
    'with it. The truncated gate would then look exactly like the real one to every test that reads\n' +
    'it. Pass --out-eval <dir> to send a capped run somewhere else, or drop --limit for a full run.\n',
  );
  process.exit(2);
}

/** SPDX ids permissive enough to TRAIN on. Same set `build-dataset.mjs` admits, deliberately. */
const TRAINING_OK_SPDX = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', '0BSD', 'Unlicense']);
/** Evaluation is a narrower use than training, but we hold it to the same bar rather than argue. */
const EVAL_OK_SPDX = TRAINING_OK_SPDX;

/** A corpus that has not moved in this long is describing an engine that has. */
const MAX_AGE_DAYS = 365;

/** Rows put through luau-lsp per source. Each one is a process spawn; the cheap signals see all rows. */
const MAX_VERIFY = Number(argOf('--verify-sample', '300'));

/** Pause between dataset-viewer pages. 7,614 rows is 77 pages, and 77 unpaced pages earns a 429. */
const PAGE_PAUSE_MS = Number(argOf('--page-pause-ms', '350'));

const SYSTEM = 'You are Apple, an expert Roblox engineer. You write correct, idiomatic Luau that runs on the Roblox engine.';

// ===========================================================================================
// THE REGISTRY — every repository the survey named, with the claim we are checking.
//
// `provenanceDoubt` is the only human judgement in this file and it is stated, not hidden: it
// marks a source whose licence tag covers content the uploader did not author. It is applied only
// where the repository itself supplies the evidence (an empty card over scraped third-party code,
// or content this repo's own source registry already classifies as training-forbidden).
// ===========================================================================================

const SOURCES = [
  {
    id: 'TorpedoSoftware/RobloxQA-v2.0',
    kind: 'dataset',
    role: 'eval-gate',
    reader: 'viewer',
    splits: { gate: 'test', headroom: 'train' },
    note: 'multiple-choice prose over the engine + Luau; a knowledge regression instrument, not a code corpus',
  },
  {
    id: '8BitStudio/Roblox-luau-coding_L1',
    kind: 'dataset',
    role: 'training',
    reader: 'jsonl',
    files: ['data/roblox_luau_dataset.jsonl', 'data/roblox_luau_advanced.jsonl'],
    fields: { instruction: 'instruction', output: 'output' },
    note: 'the one training candidate that clears licence AND currency; judged on its rows below',
  },
  {
    id: 'Roblox/luau_corpus',
    kind: 'dataset',
    role: 'training',
    reader: 'jsonl',
    files: ['train.jsonl'],
    fields: { instruction: 'prompt', output: 'completion' },
    note: "Roblox's own opt-in Data Sharing corpus — the licence is real and the clock is not",
  },
  {
    id: 'TorpedoSoftware/Roblox-Luau-Reasoning-v1.0',
    kind: 'dataset',
    role: 'training',
    reader: 'viewer',
    splits: { train: 'train' },
    note: 'reasoning traces over Luau',
  },
  {
    id: 'TorpedoSoftware/roblox-info-dump',
    kind: 'dataset',
    role: 'training',
    reader: 'viewer',
    splits: { train: 'train' },
    note: 'API dump scraped from the documentation',
  },
  {
    id: 'khtsly/roblox_docs_corpus_text',
    kind: 'dataset',
    role: 'training',
    reader: 'viewer',
    splits: { train: 'train' },
    provenanceDoubt:
      'the text is Roblox/creator-docs, which packages/corpus/data/sources.json already classifies ' +
      'training: forbidden (CC-BY-4.0). Re-uploading it under a third-party account does not relicense it.',
  },
  {
    id: 'khtsly/devforum-roblox-text',
    kind: 'dataset',
    role: 'training',
    reader: 'viewer',
    splits: { train: 'train' },
    provenanceDoubt: 'DevForum posts are written by forum members under the Roblox ToS, not by the uploader.',
  },
  {
    id: 'PatoFlamejanteTV/RobloxCodeLarge2UNFILTRED-Lua-Luau',
    kind: 'dataset',
    role: 'training',
    reader: 'jsonl',
    files: ['luau_files.jsonl'],
    fields: { instruction: null, output: 'content' },
    provenanceDoubt:
      'a 1.9 GB scrape of other people\'s Roblox game scripts, stamped MIT by a card whose ENTIRE ' +
      'body is the three lines "---/license: mit/---". The uploader cannot grant rights to code ' +
      'they did not write, and "UNFILTRED" in the repository name is the author telling us nothing ' +
      'was checked.',
  },
];

/**
 * The safety and 3-D models, carried through the same gate so the verdict is recorded rather than
 * remembered. Nothing here is downloaded: the question is whether it CAN be served on the owner's
 * hardware or through Workers AI, and that is answered by metadata plus this repo's own
 * docs/audit/INFERENCE-PROVIDERS.md, not by pulling 16 GB of weights onto a laptop.
 */
const MODELS = [
  { id: 'Roblox/Llama-3.1-8B-Instruct-RobloxGuard-1.0', purpose: 'prompt/response safety classification' },
  { id: 'Roblox/roblox-pii-classifier-v2', purpose: 'PII detection' },
  { id: 'Roblox/voice-safety-classifier-v3', purpose: 'voice moderation' },
  { id: 'Roblox/cubepart', purpose: 'text-to-3d part generation' },
  { id: 'Roblox/cube3d-v0.5', purpose: 'text-to-3d shape generation' },
];

// ===========================================================================================
// Hub access
// ===========================================================================================

const UA = { 'User-Agent': 'golem-harvest-hf/1.0 (+packages/training)' };

/**
 * Fetch with backoff on the transient statuses, and a THROW on everything else.
 *
 * The first real run of this harvester died on a single HTTP 502 from the dataset viewer at row
 * 300 of 7,614. That is the right outcome for an unretried transport error — the source went into
 * `notJudged`, admitted fell to zero and the process exited 1 rather than writing a short file and
 * calling it a harvest. But a transient 502 is not a verdict either, so it is retried here. What
 * is NOT retried is a 404 or a 403: those are answers, and burying them under five attempts would
 * turn a real refusal into a timeout.
 */
const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

async function fetchWithRetry(url, { attempts = 6 } = {}) {
  let last;
  for (let i = 0; i < attempts; i++) {
    let r;
    try {
      r = await fetch(url, { headers: UA });
    } catch (e) {
      last = `network error: ${e.message ?? e}`;
      await sleep(1000 * 3 ** i);
      continue;
    }
    if (r.ok) return r;
    if (r.status !== 429 && r.status < 500) throw new Error(`${url} -> HTTP ${r.status}`);
    // The viewer answers a burst of page requests with 429 and a Retry-After. Honour it rather
    // than guessing: a guessed backoff that is too short turns a rate limit into a fake outage.
    const ra = Number(r.headers.get('retry-after'));
    last = `HTTP ${r.status}`;
    await sleep(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 1000 * 3 ** i);
  }
  throw new Error(`${url} -> ${last} after ${attempts} attempts`);
}

async function hubMeta(kind, id) {
  const url = `https://huggingface.co/api/${kind === 'dataset' ? 'datasets' : 'models'}/${id}`;
  return (await fetchWithRetry(url)).json();
}

/** HF returns `license` as a string or a one-element array; normalise to an SPDX-ish id. */
function spdxOf(meta) {
  const raw = meta?.cardData?.license;
  const one = Array.isArray(raw) ? raw[0] : raw;
  if (!one) return null;
  const map = { mit: 'MIT', 'apache-2.0': 'Apache-2.0', 'bsd-3-clause': 'BSD-3-Clause', 'bsd-2-clause': 'BSD-2-Clause', '0bsd': '0BSD', unlicense: 'Unlicense' };
  return map[String(one).toLowerCase()] ?? String(one);
}

const ageDays = (iso) => Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);

/** Read rows through the public dataset-viewer API, 100 at a time. */
async function* viewerRows(id, split, limit) {
  const page = 100;
  for (let offset = 0; offset < limit; offset += page) {
    const length = Math.min(page, limit - offset);
    const url =
      `https://datasets-server.huggingface.co/rows?dataset=${encodeURIComponent(id)}` +
      `&config=default&split=${encodeURIComponent(split)}&offset=${offset}&length=${length}`;
    const body = await (await fetchWithRetry(url)).json();
    const rows = body.rows ?? [];
    if (!rows.length) return;
    for (const row of rows) yield { idx: row.row_idx, ...row.row };
    if (offset + rows.length >= (body.num_rows_total ?? Infinity)) return;
    await sleep(PAGE_PAUSE_MS); // pace the anonymous viewer API rather than provoke its rate limit
  }
}

/**
 * Stream a JSONL file from the Hub and stop at `limit` rows.
 *
 * The stop matters: `PatoFlamejanteTV/...` is 1.9 GB and `Roblox/luau_corpus` 130 MB. Reading a
 * whole file to decide it is inadmissible would make the gate more expensive than the thing it
 * guards, and would tempt the next person to skip the gate.
 */
async function* jsonlRows(id, file, limit) {
  const url = `https://huggingface.co/datasets/${id}/resolve/main/${file}`;
  const r = await fetchWithRetry(url);
  const decoder = new TextDecoder();
  let buf = '';
  let n = 0;
  for await (const chunk of r.body) {
    buf += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      try { yield { idx: n, ...JSON.parse(line) }; } catch { /* a malformed line is a skipped row */ }
      if (++n >= limit) { await r.body.cancel?.().catch(() => {}); return; }
    }
  }
  if (buf.trim()) { try { yield { idx: n, ...JSON.parse(buf) }; } catch { /* trailing junk */ } }
}

// ===========================================================================================
// The gates
// ===========================================================================================

function licenceGate(src, meta) {
  const spdx = spdxOf(meta);
  const ok = src.role === 'training' ? TRAINING_OK_SPDX : EVAL_OK_SPDX;
  if (!spdx) return { spdx, reason: 'no licence declared on the card' };
  if (!ok.has(spdx)) return { spdx, reason: `licence "${spdx}" is not permissive for ${src.role}` };
  if (src.provenanceDoubt) return { spdx, reason: `licence "${spdx}" is asserted over content the uploader did not author — ${src.provenanceDoubt}` };
  return { spdx, reason: null };
}

function currencyGate(meta) {
  const age = ageDays(meta.lastModified);
  return {
    lastModified: meta.lastModified,
    ageDays: age,
    reason: age > MAX_AGE_DAYS ? `last updated ${age} days ago; the currency bar is ${MAX_AGE_DAYS} days` : null,
  };
}

/**
 * Judge sampled TRAINING rows by the repository's own admission checks, plus the structural
 * signals that tell a corpus apart from a template expansion.
 *
 * `templateShare` and `inertShare` are the two that matter and neither is a style opinion:
 *   - templateShare: rows whose entire body is `Instance.new` plus property assignment. Apple does
 *     not write those — `create_instances` and `set_properties` are structured tool calls, so a
 *     model trained on thousands of them is being taught to hand-roll the one thing the product
 *     already does correctly without it.
 *   - inertShare: rows containing no function, no event connection and no `GetService`. There is
 *     no behaviour in such a row to learn.
 */
function contentGate(rows) {
  const stats = { read: rows.length, verifySampled: 0, syntaxFail: 0, antipatternFail: 0, dupeOutput: 0, template: 0, inert: 0, noInstruction: 0 };
  const seen = new Set();

  // Cheap structural signals over EVERY row read. These are regexes; there is no reason to sample.
  for (const { instruction, output } of rows) {
    if (!instruction || instruction.length < 12) stats.noInstruction++;
    const key = createHash('sha256').update(String(output).replace(/\s+/g, ' ')).digest('hex');
    if (seen.has(key)) stats.dupeOutput++;
    seen.add(key);
    const body = String(output).split('\n').map((l) => l.trim()).filter(Boolean);
    if (body.length && body.every((l) => /^(local \w+ = Instance\.new|\w+\.\w+ = |\w+\.Parent)/.test(l))) stats.template++;
    if (!/\b(function|Connect|GetService)\b/.test(String(output))) stats.inert++;
  }

  // The expensive signals — each one spawns luau-lsp — over an EVENLY SPACED sample, never the
  // head. A dataset built by a generator emits its easiest rows first; judging the first 300 rows
  // of 12,000 measures the generator's warm-up, not the corpus.
  const stride = Math.max(1, Math.ceil(rows.length / MAX_VERIFY));
  for (let i = 0; i < rows.length; i += stride) {
    const output = String(rows[i].output);
    stats.verifySampled++;
    if (!checkLuauSyntax(output).passed) stats.syntaxFail++;
    else if (!checkNoAntipattern(output).passed) stats.antipatternFail++;
  }

  const share = (n, d) => (d ? n / d : 0);
  stats.templateShare = Number(share(stats.template, stats.read).toFixed(4));
  stats.inertShare = Number(share(stats.inert, stats.read).toFixed(4));
  stats.verifiedShare = Number(share(stats.verifySampled - stats.syntaxFail - stats.antipatternFail, stats.verifySampled).toFixed(4));

  // The bars. Stated as numbers so a future dataset is judged by the same ruler.
  if (!stats.read) return { stats, reason: 'no rows could be read' };
  if (stats.templateShare > 0.25) return { stats, reason: `${(stats.templateShare * 100).toFixed(1)}% of sampled rows are pure Instance.new property-setting templates (bar: 25%)` };
  if (stats.inertShare > 0.35) return { stats, reason: `${(stats.inertShare * 100).toFixed(1)}% of sampled rows contain no function, no event connection and no GetService (bar: 35%)` };
  if (stats.verifiedShare < 0.9) return { stats, reason: `only ${(stats.verifiedShare * 100).toFixed(1)}% of sampled rows pass checkLuauSyntax + checkNoAntipattern (bar: 90%)` };
  return { stats, reason: null };
}

// ===========================================================================================
// Row shaping
// ===========================================================================================

/** The exact shape `build-dataset.mjs` writes, so the existing MLX pipeline reads it unchanged. */
function toChat(instruction, code, meta) {
  return {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${instruction}\n\nWrite the Luau implementation.` },
      { role: 'assistant', content: '```luau\n' + code + '\n```' },
    ],
    meta,
  };
}

/** RobloxQA rows keep their four options UNSHUFFLED here; the scorer shuffles. See robloxqa-gate.mjs. */
function toQa(row, meta) {
  return {
    grounding_doc_id: row.grounding_doc_id,
    question: row.question,
    answer: row.answer,
    distractors: [row.incorrect_0, row.incorrect_1, row.incorrect_2],
    meta,
  };
}

// ===========================================================================================
// Main
// ===========================================================================================

async function harvestDataset(src) {
  const record = { id: src.id, role: src.role, note: src.note ?? null };
  const meta = await hubMeta('dataset', src.id);
  record.revision = meta.sha;
  record.downloads = meta.downloads;

  const lic = licenceGate(src, meta);
  record.spdx = lic.spdx;
  if (lic.reason) return { record, rejected: { ...record, gate: 'licence', reason: lic.reason } };

  const cur = currencyGate(meta);
  record.lastModified = cur.lastModified;
  record.ageDays = cur.ageDays;
  if (cur.reason) return { record, rejected: { ...record, gate: 'currency', reason: cur.reason } };

  // -- read rows -----------------------------------------------------------------------------
  const read = async (split) => {
    const out = [];
    const cap = Math.min(LIMIT, 100_000);
    if (src.reader === 'viewer') {
      for await (const r of viewerRows(src.id, split, cap)) out.push(r);
    } else {
      for (const f of src.files) {
        const remaining = cap - out.length;
        if (remaining <= 0) break;
        for await (const r of jsonlRows(src.id, f, remaining)) out.push({ ...r, file: f });
      }
    }
    return out;
  };

  if (src.role === 'training') {
    const raw = await read('train');
    const rows = raw.map((r) => ({
      instruction: src.fields?.instruction ? r[src.fields.instruction] : null,
      output: r[src.fields.output],
      idx: r.idx,
      file: r.file ?? null,
    })).filter((r) => typeof r.output === 'string' && r.output.trim());
    const gate = contentGate(rows);
    record.content = gate.stats;
    if (gate.reason) return { record, rejected: { ...record, gate: 'content', reason: gate.reason } };

    // Admitted: emit in build-dataset.mjs's chat shape, one provenance stamp per example.
    const lines = rows.map((r) =>
      JSON.stringify(toChat(r.instruction, r.output, {
        dataset: src.id, revision: meta.sha, spdx: lic.spdx, split: 'train', rowIdx: r.idx, path: r.file,
      })),
    );
    mkdirSync(TRAIN_OUT, { recursive: true });
    const p = join(TRAIN_OUT, `${src.id.replace(/\//g, '__')}.jsonl`);
    writeFileSync(p, lines.join('\n') + (lines.length ? '\n' : ''));
    record.written = { path: relative(REPO_ROOT, p), rows: lines.length };
    return { record, rejected: null };
  }

  // -- eval-gate role ------------------------------------------------------------------------
  mkdirSync(EVAL_OUT, { recursive: true });
  const written = {};
  const keys = {};
  const texts = {};
  for (const [local, remote] of Object.entries(src.splits)) {
    const raw = await read(remote);
    const rows = raw.map((r) => toQa(r, { dataset: src.id, revision: meta.sha, spdx: lic.spdx, split: remote, rowIdx: r.idx }));
    const p = join(EVAL_OUT, `${local}.jsonl`);
    const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    writeFileSync(p, body);
    written[local] = {
      path: relative(REPO_ROOT, p),
      rows: rows.length,
      remoteSplit: remote,
      sha256: createHash('sha256').update(body).digest('hex'),
    };
    keys[local] = rows.map((r) => questionKey(r.question));
    texts[local] = rows.map((r) => r.question);
    record.buckets = { ...(record.buckets ?? {}), [local]: bucketise(rows) };
    record.codeContent = mergeCodeStats(record.codeContent, codeStats(rows));
  }
  record.written = written;

  // ---- the measurements that decide whether this is an instrument at all --------------------
  //
  // Not "the card says so". Each of these is computed here, over the rows just written, and lands
  // in the card this harvester writes so a reviewer can argue with the number.
  record.overlap = {};
  const gateKeys = keys.gate ?? [];
  const headKeys = keys.headroom ?? [];
  if (gateKeys.length && headKeys.length) {
    const exact = findOverlap(gateKeys, headKeys);
    const shingle = findShingleOverlap(texts.gate, texts.headroom);
    const near = findNearDuplicates(texts.gate, texts.headroom);

    record.overlap.gateVsHeadroom = {
      exactShared: exact.shared.length,
      gateRows: exact.aCount, gateUniqueQuestions: exact.aUnique,
      headroomRows: exact.bCount, headroomUniqueQuestions: exact.bUnique,

      // Kept and reported, NOT used to exclude. See the block comment in qa-overlap.mjs: an 8-word
      // window over templated question prose measures the template. It is here so the finding that
      // retired it stays visible instead of turning into folklore.
      shingle: {
        n: shingle.n,
        flaggedRows: shingle.total,
        flaggedBeforeStemFilter: shingle.rawTotal,
        stockStemsIgnored: shingle.stemsIgnored,
        verdict: 'NOT USED for exclusion — these are question stems, not duplicate questions',
        examples: shingle.hits.slice(0, 3).map((h) => ({ shingle: h.shingle, gateQuestion: texts.gate[h.aIndex] })),
      },

      // The detector that decides what the scorer drops.
      nearDuplicate: {
        method: 'idf-weighted Jaccard over the whole question, both splits supplying the weights',
        threshold: near.threshold,
        flaggedRows: near.flagged.length,
        countsByThreshold: near.counts,
        examples: near.flagged.slice(0, 3).map((h) => ({
          score: h.score, gateQuestion: texts.gate[h.aIndex], headroomQuestion: texts.headroom[h.bIndex],
        })),
      },
    };

    // The exclusion list the scorer reads. This is what makes the gate held out BY CONSTRUCTION
    // rather than by the dataset card's assurance: whatever the upstream dedup did or did not do,
    // these rows do not contribute to the headline number.
    writeFileSync(
      join(EVAL_OUT, 'excluded-gate-rows.json'),
      JSON.stringify({
        builtBy: 'scripts/harvest-hf.mjs',
        dataset: src.id,
        revision: meta.sha,
        why:
          'each of these gate rows restates a headroom question at or above the idf-weighted ' +
          'Jaccard threshold. Headroom is offered as tuning material; a gate row that is also a ' +
          'headroom row would be scoring memorisation the day anyone uses it.',
        threshold: near.threshold,
        rows: near.flagged.map((h) => ({
          gateRowIdx: h.aIndex, headroomRowIdx: h.bIndex, score: h.score,
          gateQuestion: texts.gate[h.aIndex], headroomQuestion: texts.headroom[h.bIndex],
        })),
      }, null, 2) + '\n',
    );
    record.excludedGateRows = near.flagged.length;
  }

  // The overlap that matters for THIS product: the gate versus the Luau SFT rows the local LoRA is
  // actually trained on. Near-zero risk — one is prose MCQ, the other is code — but "near-zero
  // risk" is a prediction and this is a measurement. When the derived splits are absent the field
  // says ABSENT, never "clean".
  //
  // DELEGATED to packages/evals/src/train-gate-overlap.mjs rather than reimplemented here. The
  // first version of this block ran `findShingleOverlap` inline over `train.jsonl` alone, with the
  // `\n\nWrite the Luau implementation.` tail still attached to every instruction and no check that
  // the field it read was the instruction at all. Now the same function the test recomputes is the
  // one that writes this number, so the card and the test cannot report different things.
  if (gateKeys.length) {
    try {
      const { instructions, bySplit } = loadTrainingInstructions();
      record.overlap.gateVsRepoTrainingRows = { splits: bySplit, ...measureGateVsTraining(texts.gate, instructions) };
    } catch (e) {
      record.overlap.gateVsRepoTrainingRows = {
        status: `NOT MEASURED — ${e.message} This is not a clean result.`,
      };
    }
  }

  // The committed index the non-overlap test reads. The rows themselves are derived and ignored;
  // these keys are the evidence, and `qa-overlap.test.mjs` recomputes them from the rows whenever
  // the rows are present, so a hand-edited index is caught rather than trusted.
  writeFileSync(
    join(EVAL_OUT, 'question-keys.json'),
    JSON.stringify({
      builtBy: 'scripts/harvest-hf.mjs',
      dataset: src.id,
      revision: meta.sha,
      algorithm: 'sha256(lowercase, non-alphanumerics collapsed to single spaces, trimmed).slice(0,16)',
      splits: Object.fromEntries(Object.entries(keys).map(([k, v]) => [k, { rows: v.length, keys: v }])),
    }, null, 2) + '\n',
  );

  writeFileSync(
    join(EVAL_OUT, 'dataset-card.json'),
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      harvester: 'scripts/harvest-hf.mjs',
      dataset: src.id,
      revision: meta.sha,
      licence: lic.spdx,
      lastModified: cur.lastModified,
      role: 'held-out knowledge regression gate for the model behind the generator',
      notTrainingData:
        "the card offers this as training data too. It is not: see `codeContent` — the questions and " +
        'answers contain no fenced code and no newlines, so there is no Luau in here to learn. It ' +
        'measures whether a model still KNOWS the engine; it cannot teach one to write for it.',
      splits: written,
      excludedGateRows: {
        count: record.excludedGateRows ?? null,
        path: 'packages/evals/data/robloxqa/excluded-gate-rows.json',
        why: 'gate rows that restate a headroom question; the scorer drops them from the headline number',
      },
      groundingBuckets: record.buckets,
      codeContent: record.codeContent,
      overlap: record.overlap,
      scoring: 'packages/evals/src/robloxqa-gate.mjs — release-gated, never run in CI',
    }, null, 2) + '\n',
  );
  return { record, rejected: null };
}

/** Counts per documentation family; the partition itself lives in qa-buckets.mjs, shared with the scorer. */
function bucketise(rows) {
  const out = Object.fromEntries(BUCKETS.map((b) => [b, 0]));
  for (const r of rows) out[bucketOfGroundingDoc(r.grounding_doc_id)]++;
  out.uniqueGroundingDocs = new Set(rows.map((r) => r.grounding_doc_id)).size;
  return out;
}

/** Is there any code in here at all? The answer decides what this dataset may be used for. */
function codeStats(rows) {
  const all = rows.map((r) => `${r.question}\n\u0000\n${r.answer}`);
  return {
    rows: rows.length,
    withFencedCode: all.filter((t) => /```/.test(t)).length,
    withNewlineInsideAField: rows.filter((r) => /\n/.test(r.question) || /\n/.test(r.answer)).length,
    withInlineBacktick: rows.filter((r) => /`/.test(r.question) || /`/.test(r.answer)).length,
  };
}

function mergeCodeStats(a, b) {
  if (!a) return b;
  return Object.fromEntries(Object.keys(b).map((k) => [k, a[k] + b[k]]));
}

/**
 * The safety/3-D models: a served-or-not verdict, derived from the card and from this repository's
 * already-verified provider audit. Nothing is downloaded and nothing is guessed.
 */
async function judgeModel(m) {
  const meta = await hubMeta('model', m.id);
  const spdx = spdxOf(meta);
  const files = (meta.siblings ?? []).map((s) => s.rfilename);
  const isAdapter = files.includes('adapter_config.json');
  const out = {
    id: m.id, purpose: m.purpose, licence: spdx, gated: meta.gated ?? false,
    lastModified: meta.lastModified, artefact: isAdapter ? 'PEFT LoRA adapter' : 'full weights',
    pipeline: meta.pipeline_tag ?? null,
    parameters: meta.safetensors?.total ?? null,
    precision: meta.safetensors?.parameters ? Object.keys(meta.safetensors.parameters)[0] : null,
  };
  if (isAdapter) {
    const cfg = await (await fetchWithRetry(`https://huggingface.co/${m.id}/resolve/main/adapter_config.json`)).json();
    out.baseModel = cfg.base_model_name_or_path;
    out.loraRank = cfg.r;
    const baseId = String(cfg.base_model_name_or_path).replace(/^meta-llama\/Meta-/, 'meta-llama/');
    try {
      const base = await hubMeta('model', baseId);
      out.baseGated = base.gated ?? false;
      out.baseLicence = spdxOf(base);
      out.baseResolvedAs = baseId;
      out.baseParameters = base.safetensors?.total ?? null;
      out.basePrecision = base.safetensors?.parameters ? Object.keys(base.safetensors.parameters)[0] : null;
    } catch (e) {
      out.baseGated = `could not resolve ${baseId}: ${e.message}`;
    }
  }
  out.serving = servingVerdict(out);
  return out;
}

/** Bytes per weight, by the precision the Hub reports. */
const BYTES_PER_PARAM = { F32: 4, BF16: 2, F16: 2, I8: 1, U8: 1 };
/** The owner's only hardware. See packages/training and docs/audit/INFERENCE-PROVIDERS.md §3.3. */
const M2_PRO_RAM_GB = 32;
/** What a 32 GB laptop can give an inference process while Studio, the worker and a browser run. */
const USABLE_GB = 20;

/**
 * CAN THIS MODEL ACTUALLY BE SERVED, AND SHOULD IT BE WIRED AS A CHECK? Derived, not remembered.
 *
 * The question the brief asks is specifically about Roblox's own guard model, and the answer has
 * four independent parts. Each is computed from a field above or cited to a file in this repo, so a
 * reviewer can attack any one of them separately:
 *
 *   WEIGHTS. `parameters` x bytes-per-weight from the Hub's own safetensors index. An adapter has
 *   no weights of its own; what has to fit is its BASE, which is why `baseParameters` is fetched.
 *
 *   THE BASE'S GATE. RobloxGuard is a rank-16 PEFT adapter over `meta-llama/Llama-3.1-8B-Instruct`,
 *   which the Hub reports as `gated: "manual"` under the `llama3.1` licence. An adapter cannot be
 *   run without its base, and this base cannot be downloaded by anyone who has not personally
 *   accepted Meta's terms and been approved. That is a decision only the owner can take; no
 *   automation should take it for him, and no harvester should pretend it has been taken.
 *
 *   WORKERS AI. Cloudflare serves an uploaded adapter on ITS hosted base, never on one you supply.
 *   `docs/audit/INFERENCE-PROVIDERS.md` (this repo's own verified provider audit, §2) records that
 *   the upload accepts only `model_type` mistral | gemma | llama with r <= 8 and <= 300 MB, and
 *   that the LoRA-capable bases are Mistral-7B-v0.2, Gemma-2B/7B and Llama-2-7B. Llama-3.1-8B is
 *   not among them, and independently of that, `apps/worker/src/providers/workers-ai.ts` — the
 *   catalogue the product actually runs — lists no Llama-3.1 base at all. And r=16 exceeds r<=8.
 *   Three separate refusals; any one of them is sufficient.
 *
 *   LICENCE. `openrail` is a use-restricted licence, not a permissive one. The restrictions have to
 *   be passed down to everyone who uses the product, and this repository's source registry has no
 *   way to express that — which is exactly why its gate admits permissive SPDX ids only. Admitting
 *   a use-restricted model through the same door that rejected six datasets would make the gate
 *   decorative.
 */
function servingVerdict(out) {
  const params = out.artefact === 'PEFT LoRA adapter' ? out.baseParameters : out.parameters;
  const precision = out.artefact === 'PEFT LoRA adapter' ? out.basePrecision : out.precision;
  const bytes = params && precision ? params * (BYTES_PER_PARAM[precision] ?? 4) : null;
  const gb = bytes ? Number((bytes / 1e9).toFixed(2)) : null;
  const q4gb = params ? Number((params * 0.55 / 1e9).toFixed(2)) : null; // ~4.4 bits/weight incl. overhead

  const blockers = { workersAi: [], local: [] };

  // --- Workers AI -----------------------------------------------------------------------------
  if (out.artefact === 'PEFT LoRA adapter') {
    if ((out.loraRank ?? 0) > 8) blockers.workersAi.push(`adapter rank ${out.loraRank} exceeds Cloudflare's r<=8 upload cap`);
    if (!/^(mistralai|google|meta-llama)\//i.test(String(out.baseModel ?? '')) || /llama-3/i.test(String(out.baseModel ?? ''))) {
      blockers.workersAi.push(
        `base ${out.baseResolvedAs ?? out.baseModel} is not a Cloudflare LoRA-capable base ` +
        '(mistral-7b-v0.2 | gemma-2b/7b | llama-2-7b per docs/audit/INFERENCE-PROVIDERS.md §2), ' +
        'and Cloudflare will not host a base you supply',
      );
    }
  } else {
    blockers.workersAi.push(
      `${out.pipeline ?? 'these'} weights cannot be uploaded to Workers AI at all — it serves its own ` +
      'catalogue plus LoRA adapters onto that catalogue, and nothing in apps/worker/src/providers/' +
      'workers-ai.ts is this architecture',
    );
  }

  // --- The M2 Pro -----------------------------------------------------------------------------
  if (gb === null) blockers.local.push('the Hub reports no safetensors index, so the footprint cannot be derived — NOT MEASURED, which is not the same as "it fits"');
  else if (q4gb > USABLE_GB) blockers.local.push(`${q4gb} GB at 4-bit exceeds the ~${USABLE_GB} GB an inference process can have on a ${M2_PRO_RAM_GB} GB machine that is also running Studio`);
  if (out.baseGated && out.baseGated !== false) {
    blockers.local.push(`its base ${out.baseResolvedAs ?? out.baseModel} is gated "${out.baseGated}" under ${out.baseLicence} — only the owner can accept those terms, and this harvester must not pretend he has`);
  }
  if (out.gated && out.gated !== false) blockers.local.push(`the repository itself is gated "${out.gated}"`);

  // --- Licence, which applies wherever it runs -------------------------------------------------
  const licenceOk = EVAL_OK_SPDX.has(out.licence);
  const licenceNote = licenceOk
    ? null
    : `licence "${out.licence}" is not on this repository's permissive list. ` +
      (String(out.licence).toLowerCase().startsWith('openrail')
        ? 'OpenRAIL permits commercial use but attaches use-based restrictions that must flow down to every end user; nothing in packages/corpus/data/sources.json can express a flow-down obligation, which is why the gate admits permissive ids only.'
        : 'It must be read before this model is relied on.');

  return {
    footprintGB: gb,
    footprintGB4bit: q4gb,
    workersAi: { servable: blockers.workersAi.length === 0, blockers: blockers.workersAi },
    localM2Pro: { servable: blockers.local.length === 0, blockers: blockers.local },
    licenceOk,
    licenceNote,
    // A model that COULD run is still not a check until someone wires it to a real surface. The
    // product's safety-critical surface is third-party Luau arriving from the Roblox catalogue,
    // scanned statically by scanScriptSource()/brokerAsset() in apps/worker/src/assets.ts and
    // pinned end-to-end by packages/evals/src/asset-safety.test.mjs §6-§10. A text-classification
    // model over chat turns does not answer that question.
    wiredAsACheck: false,
    productUsesInstead:
      'apps/worker/src/assets.ts — scanScriptSource() + brokerAsset() static Luau scanning on every ' +
      'inserted third-party asset, plus the metadata/provenance gate in verifyCreatorStoreAsset(); ' +
      'proven to RUN, not merely to exist, by packages/evals/src/asset-safety.test.mjs §6-§10.',
  };
}

async function main() {
  const t0 = Date.now();
  console.log(`harvest-hf: ${SOURCES.length} datasets, ${MODELS.length} models; row cap ${LIMIT === Infinity ? '(none)' : LIMIT}/split\n`);

  const admitted = [];
  const rejected = [];
  const failures = [];

  for (const src of SOURCES) {
    if (ONLY && !src.id.toLowerCase().includes(ONLY.toLowerCase())) continue;
    process.stdout.write(`  ${src.id.padEnd(52)} `);
    try {
      const { record, rejected: rej } = await harvestDataset(src);
      if (rej) {
        rejected.push(rej);
        console.log(`REJECTED at ${rej.gate}: ${rej.reason}`);
      } else {
        admitted.push(record);
        const w = record.written;
        const desc = w.rows !== undefined ? `${w.rows} rows -> ${w.path}` : Object.entries(w).map(([k, v]) => `${k}=${v.rows}`).join(' ');
        console.log(`ADMITTED (${record.spdx}, ${record.ageDays}d old) ${desc}`);
      }
    } catch (e) {
      // A source that FAILED to be judged is not a source that was judged clean. It is recorded
      // separately from `rejected`, printed loudly, and makes the process exit non-zero.
      failures.push({ id: src.id, error: String(e.message ?? e) });
      console.log(`!! FETCH FAILED — NOT JUDGED: ${e.message ?? e}`);
    }
  }

  console.log('\nmodels:');
  const models = [];
  for (const m of MODELS) {
    try {
      const j = await judgeModel(m);
      models.push(j);
      console.log(`  ${j.id.padEnd(52)} ${j.licence} · ${j.artefact}${j.baseModel ? ` on ${j.baseResolvedAs ?? j.baseModel} (r=${j.loraRank}, base gated: ${j.baseGated})` : ''}`);
      const s = j.serving;
      console.log(`      Workers AI: ${s.workersAi.servable ? 'SERVABLE' : 'NO'}${s.workersAi.blockers.map((b) => `\n        - ${b}`).join('')}`);
      console.log(`      M2 Pro 32GB: ${s.localM2Pro.servable ? 'SERVABLE' : 'NO'} (${s.footprintGB ?? '?'} GB native, ${s.footprintGB4bit ?? '?'} GB at 4-bit)${s.localM2Pro.blockers.map((b) => `\n        - ${b}`).join('')}`);
      if (!s.licenceOk) console.log(`      licence: ${s.licenceNote}`);
    } catch (e) {
      failures.push({ id: m.id, error: String(e.message ?? e) });
      console.log(`  ${m.id.padEnd(52)} !! NOT JUDGED: ${e.message ?? e}`);
    }
  }

  mkdirSync(TRAIN_OUT, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    harvester: 'scripts/harvest-hf.mjs',
    rowCapPerSplit: LIMIT === Infinity ? null : LIMIT,
    gates: {
      licence: `SPDX in {${[...TRAINING_OK_SPDX].join(', ')}}, and not asserted over third-party content`,
      currency: `lastModified within ${MAX_AGE_DAYS} days`,
      content:
        'over every row read: template share <= 25%, inert share <= 35%. Over an evenly spaced ' +
        `sample of at most ${MAX_VERIFY}: checkLuauSyntax + checkNoAntipattern >= 90%`,
    },
    admitted,
    rejected,
    notJudged: failures,
    models,
  };
  writeFileSync(join(TRAIN_OUT, 'REJECTED.json'), JSON.stringify(report, null, 2) + '\n');

  console.log(`\n${admitted.length} admitted, ${rejected.length} rejected, ${failures.length} NOT JUDGED`);
  console.log(`report -> ${relative(REPO_ROOT, join(TRAIN_OUT, 'REJECTED.json'))}`);
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (failures.length) {
    console.error('\nEXIT 1: a source could not be judged. That is not the same as a source being rejected.');
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
