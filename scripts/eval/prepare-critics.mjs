#!/usr/bin/env node
// Build the `args` for scripts/eval/critics.workflow.js from piece folders.
//
//   node scripts/eval/prepare-critics.mjs <piece folder>... [--rubric planning/critic-rubric.md] [--out args.json] [--include-dry-run]
//
// Prints (or writes) one JSON object: the full rubric text with its version and sha256, and per piece the request, the
// absolute screenshot paths, the reply, the play-test console, the step list and what the harness measured (what the run
// added, what the play test read: for the claim auditor only; a critic never sees any of it). A piece whose run aborted, or that is
// a dry run, or that has no screenshots, is left out and listed under `skipped` with the reason: it is never scored on
// pictures that do not exist. A dry run is included only with --include-dry-run (to prove the plumbing).
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './lib/dev-set.mjs';
import { measuredSummary, readPiece, stepsText } from './lib/piece-files.mjs';

export const DEFAULT_RUBRIC = join(REPO_ROOT, 'planning', 'critic-rubric-v2.md');
/** Rubric v1: the M3 baseline was scored with it, and stays comparable only with it. */
export const RUBRIC_V1 = join(REPO_ROOT, 'planning', 'critic-rubric.md');
/**
 * Rubric v2's fixed reference board (planning/STYLE-BIBLE.md §2). The images are the owner's references: they live only in
 * the git-ignored private/style-refs/ (and the private R2 copy), never in the repo (decision S-2).
 */
export const REFERENCE_BOARD = {
  ui: [['R01', 'maxresdefault.jpg'], ['R02', 'images-16.jpg'], ['R04', 'images-13.jpg'], ['R07', 'images-34.jpg']],
  world: [['R10', 'images-11.jpg'], ['R11', 'images-30.jpg'], ['R12', 'images-33.jpg'], ['R13', 'images-26.jpg']],
};
export const STYLE_REFS = join(REPO_ROOT, 'private', 'style-refs');
export function referenceBoard(kind, dir = STYLE_REFS) {
  return REFERENCE_BOARD[kind === 'ui' ? 'ui' : 'world'].map(([id, file]) => ({ id, path: join(dir, file), present: existsSync(join(dir, file)) }));
}
const CONSOLE_LIMIT = 20_000;

export function loadRubric(path = DEFAULT_RUBRIC) {
  const text = readFileSync(path, 'utf8');
  return {
    rubric: text,
    rubricSha256: createHash('sha256').update(text).digest('hex'),
    rubricVersion: /\(version (v[\w.]+)/.exec(text.split('\n')[0])?.[1] ?? null,
    rubricPath: path,
  };
}

/** Rubric v2: a piece whose automatic checks failed (or never ran) is not sent to the critics. Pure. */
export function gateFailure(manifest) {
  const g = manifest?.gates;
  if (!g) return 'the automatic style checks did not run';
  // The layout gate is newer than the first M5a runs: a manifest without it is judged on the other three.
  const failed = ['kitLint', 'colour', 'reply', 'layout'].filter((k) => (k === 'layout' && !g.layout ? false : g[k]?.pass !== true));
  return failed.length ? `failed the automatic style checks (${failed.join(', ')}) before any critic` : null;
}

export function prepare(dirs, { rubricPath = DEFAULT_RUBRIC, includeDryRun = false } = {}) {
  const rubric = loadRubric(rubricPath);
  const pieces = [];
  const skipped = [];
  for (const d of dirs) {
    const p = readPiece(d);
    const why = !p.manifest
      ? 'no manifest.json'
      : p.manifest.aborted
        ? `the run aborted at ${p.manifest.aborted.step}`
        : p.manifest.harness?.dryRun && !includeDryRun
          ? 'a dry run (no agent run was made)'
          : p.shots.length === 0
            ? 'no screenshots were captured'
            : rubric.rubricVersion === 'v2'
              ? gateFailure(p.manifest)
              : null;
    if (why) {
      skipped.push({ dir: p.dir, requestId: p.id, reason: why });
      continue;
    }
    pieces.push({
      dir: p.dir,
      requestId: p.id,
      category: p.category,
      request: p.request,
      shots: p.shots,
      reply: p.reply,
      consoleText: p.consoleText.length > CONSOLE_LIMIT ? `${p.consoleText.slice(0, CONSOLE_LIMIT)}\n[console cut at ${CONSOLE_LIMIT} characters]` : p.consoleText,
      steps: stepsText(p.steps),
      measured: measuredSummary(p.manifest),
      ...(rubric.rubricVersion === 'v2' ? { board: referenceBoard(p.manifest.build?.kind === 'ui' ? 'ui' : 'world') } : {}),
    });
  }
  return { rubric: rubric.rubric, rubricSha256: rubric.rubricSha256, rubricVersion: rubric.rubricVersion, pieces, skipped };
}

function main() {
  const argv = process.argv.slice(2);
  const dirs = [];
  let rubricPath = DEFAULT_RUBRIC;
  let out = null;
  let includeDryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--rubric') rubricPath = argv[++i];
    else if (a === '--out') out = argv[++i];
    else if (a === '--include-dry-run') includeDryRun = true;
    else if (a.startsWith('--')) {
      console.error(`unknown flag ${a}`);
      process.exit(1);
    } else dirs.push(a);
  }
  if (!dirs.length) {
    console.error('usage: prepare-critics.mjs <piece folder>... [--rubric file] [--out file] [--include-dry-run]');
    process.exit(1);
  }
  const result = prepare(dirs, { rubricPath, includeDryRun });
  const body = JSON.stringify(result);
  if (out) writeFileSync(out, body + '\n');
  else process.stdout.write(body + '\n');
  console.error(`[prepare-critics] ${result.pieces.length} piece(s) ready, ${result.skipped.length} skipped${result.skipped.map((s) => `\n  skipped ${s.requestId}: ${s.reason}`).join('')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
