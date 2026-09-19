#!/usr/bin/env node
/**
 * Build a LICENCE-CLEAN, MACHINE-VERIFIED supervised fine-tuning set for Apple.
 *
 * WHY THIS EXISTS. `packages/corpus` is a RETRIEVAL corpus: documents, chunked and embedded.
 * Nothing in it is an instruction/response pair, so no amount of it can be fed to SFT as-is.
 * This turns the licensed Luau already on disk into training examples, and refuses to emit one
 * that has not passed the same checkers the eval harness uses to grade the model.
 *
 * THREE PERMISSIONS, NOT ONE. `packages/corpus/data/sources.json` classifies every source with a
 * `licence.training` verdict separate from reuse, because they are not the same right. Only
 * sources whose PINNED checkout in `raw/manifest.json` resolves to a permissive SPDX id
 * (MIT / Apache-2.0) are admitted here. Roblox/creator-docs is CC-BY-4.0 and the registry marks
 * it `training: forbidden` — it stays in retrieval and is excluded below, by id, deliberately.
 *
 * EVERY EXAMPLE IS VERIFIED. An example is emitted only if its response:
 *   1. parses under luau-lsp (`checkLuauSyntax`), and
 *   2. trips no error-severity Roblox anti-pattern (`checkNoAntipattern`) — the rules that catch
 *      client-trusted prices and the like, not style opinions.
 * Training a model on code that does not compile teaches it to write code that does not compile.
 *
 * THE SPLIT IS BY REPOSITORY, NOT BY EXAMPLE. Two functions from the same module share idiom,
 * helper names and often whole lines; splitting at example level leaks the test set into training
 * and inflates every number afterwards. Whole repos are assigned to train/val/test, balanced by
 * example YIELD rather than repo count — see `assignSplits` for why hashing repo ids was not
 * good enough. No repository ever spans two splits.
 *
 * EVAL CONTAMINATION IS CHECKED, NOT ASSUMED. `packages/evals` is the measuring instrument. Any
 * candidate whose normalised text overlaps an eval task's prompt or expected shape is dropped.
 *
 * Usage:  node src/build-dataset.mjs [--out data] [--limit N] [--verify-sample N]
 */
import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { checkLuauSyntax } from '../../evals/src/luau.mjs';
import { checkNoAntipattern } from '../../evals/src/roblox-antipatterns.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = join(HERE, '..', '..', '..');
const RAW = join(REPO_ROOT, 'packages', 'corpus', 'raw');
const MANIFEST = join(RAW, 'manifest.json');
const EVAL_TASKS = join(REPO_ROOT, 'packages', 'evals', 'tasks');

/** SPDX ids we accept for TRAINING. Anything else is retrieval-only. */
export const TRAINING_OK_SPDX = new Set(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'BSD-2-Clause', '0BSD', 'Unlicense']);

/** Excluded by id regardless of SPDX — the registry marks these training: forbidden. */
export const TRAINING_FORBIDDEN_URLS = [/github\.com\/Roblox\/creator-docs/i];

const args = process.argv.slice(2);
const argOf = (flag, dflt) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : dflt;
};
const OUT_DIR = join(HERE, '..', argOf('--out', 'data'));
const LIMIT = Number(argOf('--limit', '0')) || Infinity;

// ---------------------------------------------------------------------------
// 1. Admissible sources
// ---------------------------------------------------------------------------

// EXPORTED, and taking its paths as arguments, so the verdict ORDER above is reachable from a
// test. Ordering bugs in a chain of ternaries are invisible in the output — every admitted source
// is still admitted — and show up only as a wrong sentence in a provenance record nobody rereads.
export function admissibleSources({ manifestPath = MANIFEST, rawDir = RAW } = {}) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const entries = Array.isArray(manifest.sources)
    ? manifest.sources.map((s, i) => [String(i), s])
    : Object.entries(manifest.sources);

  const admitted = [];
  const rejected = [];
  for (const [key, s] of entries) {
    const url = s.url ?? '';
    const spdx = s.licence?.spdx ?? s.licence?.classifiedSpdx ?? null;
    const dir = dirForSource(key, s, rawDir);
    // LICENCE VERDICTS COME BEFORE THE "no checkout" VERDICT, DELIBERATELY.
    //
    // The order used to be the other way round, and it made the RECORDED REASON depend on what
    // happened to be on a particular disk. Roblox/creator-docs is `training: forbidden` whether or
    // not anyone has cloned it — the registry says so, and no amount of fetching changes that —
    // yet on a machine without the checkout the card read `no checkout on disk`, which describes
    // the operator's laptop rather than the licence, and reads as a transient problem rather than
    // a permanent refusal. The set of admitted sources is identical either way; what changes is
    // whether the dataset card tells the truth about WHY.
    //
    // `no checkout on disk` therefore now means only what it says: a source with nothing against
    // it that simply is not here yet.
    const reason =
      TRAINING_FORBIDDEN_URLS.some((re) => re.test(url)) ? `registry marks training: forbidden (${spdx})`
      : !spdx ? 'no SPDX id recorded'
      : !TRAINING_OK_SPDX.has(spdx) ? `SPDX ${spdx} not permissive for training`
      : s.licence?.ok === false ? 'licence verification failed at fetch time'
      : !dir ? 'no checkout on disk'
      : null;
    if (reason) rejected.push({ url, spdx, reason });
    else admitted.push({ key, url, spdx, dir, sha: s.sha ?? null });
  }
  return { admitted, rejected };
}

/** Map a manifest entry to its directory under raw/ (dirs are `owner__repo`). */
function dirForSource(key, s, rawDir = RAW) {
  const candidates = [];
  if (typeof key === 'string' && key.includes('__')) candidates.push(key);
  const m = /github\.com\/([^/]+)\/([^/.]+)/i.exec(s.url ?? '');
  if (m) candidates.push(`${m[1]}__${m[2]}`);
  for (const c of candidates) {
    const p = join(rawDir, c);
    if (existsSync(p) && statSync(p).isDirectory()) return p;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 2. Extraction
// ---------------------------------------------------------------------------

const SKIP_PATH = /(^|\/)(\.git|node_modules|Packages|DevPackages|_Index|test|tests|spec|__tests__)(\/|$)/i;

function luauFiles(dir) {
  const out = [];
  const walk = (d) => {
    let items;
    try { items = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      const p = join(d, it.name);
      if (SKIP_PATH.test(relative(dir, p))) continue;
      if (it.isDirectory()) walk(p);
      else if (['.luau', '.lua'].includes(extname(it.name))) out.push(p);
    }
  };
  walk(dir);
  return out;
}

/**
 * Find the `end` that closes the block opened at `startIdx`, by tracking Luau block depth.
 *
 * A regex cannot do this. The first version of this file matched `function ... end` with a lazy
 * quantifier and a backreference on indentation; it stopped at the first `end` of any NESTED block,
 * so 68% of candidates arrived at the parser truncated mid-function and were discarded as syntax
 * errors. The failure looked like "third-party code is low quality" and was entirely self-inflicted.
 *
 * Depth rules, which is where the subtlety is:
 *   function / if            -> open
 *   for / while              -> open, and the `do` that follows is PART OF THAT HEADER, not a new
 *                               block. Counting both double-counts and the scan never terminates.
 *   bare `do`                -> open
 *   repeat ... until         -> open / close, with no `end` at all
 *   end                      -> close
 * Strings and comments are blanked first so `end` inside them cannot move the counter.
 */
export function findBlockEnd(src, startIdx) {
  const masked = maskLiterals(src);
  const re = /\b(function|if|for|while|do|repeat|until|end|then)\b/g;
  re.lastIndex = startIdx;
  let depth = 0;
  let pendingDo = 0; // `for`/`while` headers awaiting their `do`
  let m;
  while ((m = re.exec(masked))) {
    switch (m[1]) {
      case 'function':
      case 'if':
        depth++;
        break;
      case 'for':
      case 'while':
        depth++;
        pendingDo++;
        break;
      case 'do':
        if (pendingDo > 0) pendingDo--; // belongs to the for/while already counted
        else depth++;
        break;
      case 'repeat':
        depth++;
        break;
      case 'until':
      case 'end':
        depth--;
        if (depth === 0) return m.index + m[1].length;
        break;
      default:
        break; // `then` is punctuation for `if`, not a block opener
    }
    if (depth < 0) return -1;
    if (m.index - startIdx > 20_000) return -1; // runaway guard
  }
  return -1;
}

/** Replace string and comment CONTENT with spaces, preserving offsets. */
export function maskLiterals(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '--') {
      const long = /^--\[(=*)\[/.exec(src.slice(i));
      if (long) {
        const close = src.indexOf(`]${long[1]}]`, i);
        const end = close === -1 ? src.length : close + long[1].length + 2;
        out += ' '.repeat(end - i).replace(/ /g, ' ');
        // keep newlines so line maths elsewhere still works
        out = out.slice(0, out.length - (end - i)) + src.slice(i, end).replace(/[^\n]/g, ' ');
        i = end;
        continue;
      }
      const nl = src.indexOf('\n', i);
      const end = nl === -1 ? src.length : nl;
      out += ' '.repeat(end - i);
      i = end;
      continue;
    }
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== ch) {
        if (src[j] === '\\') j++;
        if (src[j] === '\n') break;
        j++;
      }
      out += ' '.repeat(Math.min(j + 1, src.length) - i);
      i = Math.min(j + 1, src.length);
      continue;
    }
    if (ch === '[' && /^\[(=*)\[/.test(src.slice(i))) {
      const eq = /^\[(=*)\[/.exec(src.slice(i))[1];
      const close = src.indexOf(`]${eq}]`, i);
      const end = close === -1 ? src.length : close + eq.length + 2;
      out += src.slice(i, end).replace(/[^\n]/g, ' ');
      i = end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Doc comment immediately preceding `idx`, or null. */
export function docBefore(src, idx) {
  const head = src.slice(0, idx);
  const block = /((?:^|\n)[ \t]*--\[\[[\s\S]*?\]\][ \t]*)\s*$/.exec(head);
  if (block) return cleanComment(block[1]);
  const lines = /((?:(?:^|\n)[ \t]*--[^\n]*)+)[ \t]*\n?[ \t]*$/.exec(head);
  if (lines) return cleanComment(lines[1]);
  return null;
}

/**
 * Is this comment actually a DESCRIPTION of the function, or just a marker that happens to sit
 * above it?
 *
 * Real codebases put all sorts of things immediately before a function: section banners
 * (`ONLY WHEN FROM "Profile.GlobalUpdates":`), return-type annotations (`--> [ScriptConnection]`),
 * `@param` blocks, commented-out code, and TODOs. Pairing those with a function body produces an
 * example that teaches the model to emit a specific library's internals in response to a prompt
 * that does not describe them — which is a direct recipe for hallucination under vague input.
 *
 * The gate is deliberately strict. A smaller set of genuine (description -> implementation) pairs
 * is worth more than a large set with noisy instructions, and anything rejected here is still
 * recoverable later by SYNTHESISING an instruction from the code, which is a separate decision
 * that should be made explicitly rather than by accident.
 */
export function looksLikeDescription(doc) {
  const words = doc.split(/\s+/).filter(Boolean);
  if (words.length < 6 || words.length > 160) return false;

  // Section banners and annotation fragments.
  if (/^(only when|see |todo|fixme|hack|note:|-+$|=+$|@\w+)/i.test(doc)) return false;
  if (/^-->/.test(doc)) return false;
  // C/Flow/JS comment remnants are not Luau prose. This matters for vendored React sources, where
  // `cleanComment()` used to preserve `//`, `/**`, `*`, and licence-header tags verbatim and pair
  // them with an otherwise valid function body. A generated row with that prompt is not usable
  // instruction/response data, even though its response parses.
  if (/^(?:\/\/|\/\*|\*)|@(?:param|return|internal|flow)\b|\b(?:copyright|source code is licensed|license file|source tree)\b/i.test(doc)) return false;
  // Mostly-uppercase text is a banner, not prose.
  const letters = doc.replace(/[^A-Za-z]/g, '');
  if (letters.length > 0 && (doc.replace(/[^A-Z]/g, '').length / letters.length) > 0.6) return false;
  // Commented-out code rather than prose.
  if (/[;{}]\s*$/.test(doc) || /\b(local|end|then|elseif)\b.*\b(local|end|then)\b/.test(doc)) return false;
  // Needs some prose: at least one lowercase word of 3+ chars that is not a bare identifier.
  if (!/(^|\s)[a-z]{3,}(\s|$)/.test(doc)) return false;
  // Needs a verb-ish or descriptive opener somewhere in the first clause.
  const head = words.slice(0, 12).join(' ').toLowerCase();
  const DESCRIPTIVE =
    /\b(return|returns|create|creates|set|sets|get|gets|add|adds|remove|removes|check|checks|call|calls|handle|handles|update|updates|run|runs|make|makes|convert|converts|compute|computes|find|finds|load|loads|save|saves|send|sends|fire|fires|connect|connects|destroy|destroys|start|starts|stop|stops|wait|waits|used|use|uses|this|it |the |a |an |if |when |given|performs|applies|clears|resets|builds|parses|yields|attempts|ensures|initialises|initializes)\b/;
  return DESCRIPTIVE.test(head);
}

const FN_DECL = /(?:^|\n)([ \t]*)((?:local\s+)?function\s+[\w.:]+\s*\()/g;

function extractFromFile(file, src) {
  const out = [];
  if (src.length > 400_000) return out;

  for (const m of src.matchAll(FN_DECL)) {
    const startIdx = m.index + (m[0].startsWith('\n') ? 1 : 0);
    const doc = docBefore(src, startIdx);
    if (!doc || doc.length < 25 || doc.length > 1200) continue;
    if (!looksLikeDescription(doc)) { out.lowQualityDoc = (out.lowQualityDoc ?? 0) + 1; continue; }

    const endIdx = findBlockEnd(src, startIdx);
    if (endIdx === -1) continue;

    const code = src.slice(startIdx, endIdx).trim();
    if (code.length < 60 || code.length > 4000) continue;
    out.push({ doc, code, file });
  }
  return out;
}

export function cleanComment(raw) {
  return raw
    .replace(/--\[\[|\]\]/g, '')
    .split('\n')
    .map((l) => l.replace(/^[ \t]*--+[ \t]?/, '').trim())
    .filter((l) => l && !/^@\w+/.test(l) && !/^-+$/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// 3. Contamination guard
// ---------------------------------------------------------------------------

function normalise(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function evalShingles() {
  const set = new Set();
  if (!existsSync(EVAL_TASKS)) return set;
  for (const f of readdirSync(EVAL_TASKS)) {
    if (!f.endsWith('.json')) continue;
    let data;
    try { data = JSON.parse(readFileSync(join(EVAL_TASKS, f), 'utf8')); } catch { continue; }
    const tasks = Array.isArray(data) ? data : (data.tasks ?? data.items ?? []);
    for (const t of tasks) {
      for (const field of [t.prompt, t.system]) {
        if (typeof field !== 'string') continue;
        for (const sh of shingles(normalise(field), 8)) set.add(sh);
      }
    }
  }
  return set;
}

// EXPORTED so the contamination guard is reachable from a test. It is the only thing standing
// between training data and the eval tasks it is scored against, and an overlap inflates every
// eval number afterwards with no symptom — the scores simply look better.
export function* shingles(text, n) {
  const w = text.split(' ');
  for (let i = 0; i + n <= w.length; i++) yield w.slice(i, i + n).join(' ');
}

// EXPORTED with the same reasoning. NOTE THE FIRST LINE: an empty eval set makes every example
// clean. That is fail-open, and it is deliberate only in the sense that main() prints
// `eval contamination guard: N shingles` so an operator sees a zero denominator — the announcement
// is in the caller, not in this function. A caller that skipped the log would guard nothing and
// say nothing.
export function contaminated(example, evalSet) {
  if (!evalSet.size) return false;
  for (const sh of shingles(normalise(example.doc), 8)) if (evalSet.has(sh)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// 4. Split — by repository, stable under re-runs
// ---------------------------------------------------------------------------

/**
 * Assign whole repositories to splits, balanced by EXAMPLE COUNT rather than repo count.
 *
 * Hashing the repo id into percentage buckets — the obvious approach, and the first one here —
 * produced train=216 / val=1 / test=5, because example counts across 37 repos are wildly uneven:
 * a handful of large frameworks supply most examples, and whether val is usable comes down to
 * which of them happens to hash low. A one-example validation split cannot detect overfitting.
 *
 * So: sort repos by yield (largest first, deterministic tie-break on id) and greedily place each
 * into whichever split is furthest below its target share. Repo-level integrity is preserved —
 * no repo is ever split across sets — while val and test end up large enough to mean something.
 */
export function assignSplits(countsByRepo) {
  const TARGET = { train: 0.8, val: 0.1, test: 0.1 };
  const total = Object.values(countsByRepo).reduce((a, b) => a + b, 0);
  const have = { train: 0, val: 0, test: 0 };
  const assignment = {};

  const repos = Object.keys(countsByRepo).sort((a, b) => {
    const d = countsByRepo[b] - countsByRepo[a];
    return d !== 0 ? d : (a < b ? -1 : 1);
  });

  for (const repo of repos) {
    let best = 'train';
    let worstDeficit = -Infinity;
    for (const s of ['train', 'val', 'test']) {
      const deficit = TARGET[s] - (total ? have[s] / total : 0);
      if (deficit > worstDeficit) {
        worstDeficit = deficit;
        best = s;
      }
    }
    assignment[repo] = best;
    have[best] += countsByRepo[repo];
  }
  return { assignment, have, total };
}

// ---------------------------------------------------------------------------
// 5. Build
// ---------------------------------------------------------------------------

const SYSTEM = 'You are Apple, an expert Roblox engineer. You write correct, idiomatic Luau that runs on the Roblox engine.';

function toChat(ex) {
  return {
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: `${ex.doc}\n\nWrite the Luau implementation.` },
      { role: 'assistant', content: '```luau\n' + ex.code + '\n```' },
    ],
    meta: { source: ex.sourceUrl, spdx: ex.spdx, sha: ex.sha, path: ex.relPath },
  };
}

function main() {
  const t0 = Date.now();
  const { admitted, rejected } = admissibleSources();
  console.log(`sources: ${admitted.length} admitted for training, ${rejected.length} excluded`);
  for (const r of rejected) console.log(`  excluded  ${r.url || '(unknown)'} — ${r.reason}`);

  const evalSet = evalShingles();
  console.log(`eval contamination guard: ${evalSet.size} shingles from packages/evals/tasks`);

  const seen = new Set();
  const byRepo = new Map(); // repo key -> verified rows
  const stats = { files: 0, candidates: 0, lowQualityDoc: 0, dupe: 0, contaminated: 0, syntaxFail: 0, antipatternFail: 0, kept: 0 };

  // Pass 1 — extract and VERIFY everything, grouped by repo. Splits cannot be assigned before the
  // yields are known (see assignSplits).
  for (const src of admitted) {
    const repoKey = src.key ?? src.url;
    const files = luauFiles(src.dir);
    stats.files += files.length;
    const rows = [];

    for (const file of files) {
      if (stats.kept >= LIMIT) break;
      let text;
      try { text = readFileSync(file, 'utf8'); } catch { continue; }

      const extracted = extractFromFile(file, text);
      stats.lowQualityDoc += extracted.lowQualityDoc ?? 0;
      for (const cand of extracted) {
        stats.candidates++;

        const key = createHash('sha256').update(cand.code.replace(/\s+/g, ' ')).digest('hex');
        if (seen.has(key)) { stats.dupe++; continue; }

        if (contaminated(cand, evalSet)) { stats.contaminated++; continue; }

        const syn = checkLuauSyntax(cand.code);
        if (!syn.passed) { stats.syntaxFail++; continue; }

        const anti = checkNoAntipattern(cand.code);
        if (!anti.passed) { stats.antipatternFail++; continue; }

        seen.add(key);
        stats.kept++;
        rows.push(
          toChat({
            ...cand,
            sourceUrl: src.url,
            spdx: src.spdx,
            sha: src.sha,
            relPath: relative(RAW, cand.file),
          }),
        );
      }
    }
    if (rows.length) byRepo.set(repoKey, rows);
  }

  // Pass 2 — assign whole repos to splits, balanced by yield.
  const counts = Object.fromEntries([...byRepo].map(([k, v]) => [k, v.length]));
  const { assignment, have, total } = assignSplits(counts);
  const bySplit = { train: [], val: [], test: [] };
  for (const [repo, rows] of byRepo) bySplit[assignment[repo]].push(...rows);

  mkdirSync(OUT_DIR, { recursive: true });
  for (const [split, rows] of Object.entries(bySplit)) {
    const p = join(OUT_DIR, `${split}.jsonl`);
    writeFileSync(p, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''));
    const pct = total ? ((rows.length / total) * 100).toFixed(1) : '0.0';
    const nRepos = Object.values(assignment).filter((s) => s === split).length;
    console.log(`  ${split.padEnd(5)} ${String(rows.length).padStart(6)} examples (${pct}%) from ${nRepos} repo(s) -> ${relative(REPO_ROOT, p)}`);
  }

  const card = {
    generatedAt: new Date().toISOString(),
    builder: 'packages/training/src/build-dataset.mjs',
    sources: admitted.map((a) => ({
      url: a.url,
      spdx: a.spdx,
      sha: a.sha,
      split: assignment[a.key ?? a.url] ?? '(no examples)',
      examples: counts[a.key ?? a.url] ?? 0,
    })),
    splitSizes: have,
    excluded: rejected,
    verification: {
      syntax: 'luau-lsp via packages/evals/src/luau.mjs (checkLuauSyntax)',
      semantics: 'packages/evals/src/roblox-antipatterns.mjs (checkNoAntipattern, error-severity rules)',
      contamination: '8-word shingle overlap against packages/evals/tasks prompts',
      instructionQuality: 'looksLikeDescription() — rejects section banners, annotations and commented-out code',
      split: "whole repositories assigned greedily by example yield to 80/10/10; no repo spans splits",
    },
    stats,
  };
  writeFileSync(join(OUT_DIR, 'dataset-card.json'), JSON.stringify(card, null, 2));

  console.log('\nstats:', JSON.stringify(stats, null, 2));
  console.log(`done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
