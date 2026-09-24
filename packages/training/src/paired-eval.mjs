#!/usr/bin/env node
/**
 * Measure a candidate and the current best on one pinned holdout, with one base generation.
 * This is a diagnostic companion to train-forever: it never promotes or uploads an adapter.
 *
 * node src/paired-eval.mjs --candidate adapters/apple-v20-best --best adapters/apple-v5-best \
 *   --out runs/eval-v20-paired.json
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { evalProblems, scoresFromScored } from './train-forever.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PINNED_DATA = 'runs/eval-set-v5.jsonl';
const PY = join(ROOT, '.venv/bin/python');
const scoredPath = (rawPath) => rawPath.replace(/\.json$/, '-scored.json');
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

export function splitPairedRaw(raw) {
  if (!raw?.best_adapter || !raw?.rows || !Object.keys(raw.rows).length) {
    throw new Error('paired raw answers need a best adapter and rows');
  }
  const rows = {};
  for (const [id, row] of Object.entries(raw.rows)) {
    if (typeof row?.base !== 'string' || typeof row?.adapter !== 'string' || typeof row?.best !== 'string') {
      throw new Error(`paired row ${id} lacks a base, candidate or best answer`);
    }
    rows[id] = { ...row, adapter: row.best };
  }
  return { ...raw, adapter: raw.best_adapter, rows };
}

export function pairedEvalReport(candidateScored, bestScored, n) {
  const problems = [
    ...evalProblems(candidateScored, { n }).map((p) => `candidate: ${p}`),
    ...evalProblems(bestScored, { n }).map((p) => `best: ${p}`),
  ];
  if (!isDeepStrictEqual(candidateScored?.tally?.base, bestScored?.tally?.base)) {
    problems.push('base scores differ inside the paired run');
  }
  const onlyScores = (s) => {
    const { trajectory, gameLogic, finish, total } = scoresFromScored(s);
    return { trajectory, gameLogic, finish, total };
  };
  const candidate = onlyScores(candidateScored);
  const best = onlyScores(bestScored);
  return { valid: problems.length === 0, problems, candidate, best,
    delta: problems.length === 0 ? candidate.total - best.total : null };
}

function options(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!argv[i]?.startsWith('--') || !argv[i + 1]) throw new Error('options need values');
    out[argv[i].slice(2)] = argv[i + 1];
  }
  if (!out.candidate || !out.best || !out.out) throw new Error('use --candidate PATH --best PATH --out JSON');
  if (out.out === out['data'] || !out.out.endsWith('.json')) throw new Error('--out must name a new JSON file');
  return out;
}

function runScore(rawPath) {
  execFileSync(process.execPath, ['src/score-eval.mjs', rawPath], { cwd: ROOT, stdio: 'inherit' });
  return JSON.parse(readFileSync(scoredPath(rawPath), 'utf8'));
}

async function main() {
  const o = options(process.argv.slice(2));
  const data = resolve(ROOT, o.data ?? PINNED_DATA);
  const state = JSON.parse(readFileSync(join(ROOT, 'runs/forever/state.json'), 'utf8'));
  if (digest(data) !== state.evalSet.sha256) throw new Error('the pinned held-out set changed');
  const rawPath = resolve(ROOT, o.out);
  if (rawPath === data) throw new Error('refusing to overwrite the held-out set');
  const bestRawPath = rawPath.replace(/\.json$/, '-best.json');
  const reportPath = rawPath.replace(/\.json$/, '-report.json');
  for (const path of [rawPath, bestRawPath, scoredPath(rawPath), scoredPath(bestRawPath), reportPath]) {
    if (existsSync(path)) throw new Error(`refusing to overwrite an existing evaluation file: ${path}`);
  }
  execFileSync(PY, ['src/generate_eval.py', '--adapter', o.candidate,
    '--best-adapter', o.best, '--data', data, '--out', rawPath,
    '--max-tokens', String(o['max-tokens'] ?? 1200)], { cwd: ROOT, stdio: 'inherit' });
  const raw = JSON.parse(readFileSync(rawPath, 'utf8'));
  const expectedRows = Object.values(state.evalSet.n).reduce((sum, count) => sum + count, 0);
  if (Object.keys(raw.rows ?? {}).length !== expectedRows) throw new Error(`paired generation did not return all ${expectedRows} rows`);
  writeFileSync(bestRawPath, JSON.stringify(splitPairedRaw(raw), null, 1));
  const candidateScored = runScore(rawPath);
  const bestScored = runScore(bestRawPath);
  const report = { ...pairedEvalReport(candidateScored, bestScored, state.evalSet.n),
    candidateAdapter: o.candidate, bestAdapter: o.best, dataSha256: digest(data),
    raw: rawPath, bestRaw: bestRawPath };
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`${report.valid ? 'VALID' : 'INVALID'} paired score: candidate ${report.candidate.total}/38, best ${report.best.total}/38; ${reportPath}`);
  if (!report.valid) process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error(e.message); process.exitCode = 1; });
}
