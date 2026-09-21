#!/usr/bin/env node
/**
 * How many documented failures have an executable test that names them?
 *
 * The standing ask is that failure and success feedback becomes new evaluations. The question
 * underneath it is answerable and has not been answered: `docs/FAILURES.md` holds every confirmed
 * failure, and for each one either some test in this repository cites it or nothing does. A failure
 * with no test is a lesson that survives only as prose, and prose does not go red.
 *
 *   node packages/training/src/measure-failure-coverage.mjs
 *
 * THE INSTRUMENT ERROR THIS FILE WAS BORN FROM, recorded because it is the whole point.
 *
 * The first version of this measurement parsed `^### F-NN` and reported **57** documented
 * failures against a standing figure of 61, and I was about to write down that the standing figure
 * was four too high. It was not. `FAILURES.md` has TWO entry formats: 57 carry an `### F-NN ·`
 * heading, and four more — F-08 through F-11, under "Inherited (earlier passes, kept for the
 * record)" — are `- **F-NN** ·` bullets. The parser could not see the second format, so it
 * measured 93% of the document and reported the number as though it were all of it.
 *
 * That is this repository's defining defect in miniature: a failure to observe rendering as an
 * observation. It would have produced a confident correction to a figure that was right.
 *
 * So `parseFailureIds` reads both formats, and `failure-coverage.test.mjs` asserts it finds both —
 * not that the total is 61, which would be a tripwire on a document that grows every day, but that
 * NEITHER FORMAT CONTRIBUTES ZERO. A parser blind to one of them is exactly what happened, and it
 * would look like a clean 93% measurement forever.
 *
 * WHAT THIS DOES NOT DO. It does not add an F-id to any eval task. Which of the eval tasks were
 * BORN from which documented failure is an authoring judgement about intent, and inventing that
 * mapping from surface similarity would fabricate provenance — which is the same class of error as
 * everything in the file it reads. The rows that carry an F-id are the ones whose authors wrote
 * one.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');
const FAILURES = join(REPO, 'docs/FAILURES.md');

/**
 * Every documented failure id, and which format declared it.
 *
 * Both formats are returned separately on purpose, so a caller can assert that neither is empty.
 * A total alone cannot tell you that half the document went unread.
 */
export function parseFailureIds(markdown) {
  const heading = [...String(markdown).matchAll(/^###\s+(F-\d+)\b/gm)].map((m) => m[1]);
  const bullet = [...String(markdown).matchAll(/^-\s+\*\*(F-\d+)\*\*/gm)].map((m) => m[1]);
  const all = [...new Set([...heading, ...bullet])].sort((a, b) => Number(a.slice(2)) - Number(b.slice(2)));
  return { heading_format: heading, bullet_format: bullet, all };
}

/** Does this test source cite this failure id? Word-boundary, so F-6 never matches F-68. */
export function citesFailure(source, id) {
  return new RegExp(`\\b${id}\\b`).test(String(source));
}

/* c8 ignore start -- filesystem driver */
const isMain = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  if (!existsSync(FAILURES)) { console.error(`${FAILURES} does not exist.`); process.exit(2); }
  const parsed = parseFailureIds(readFileSync(FAILURES, 'utf8'));
  if (parsed.heading_format.length === 0 || parsed.bullet_format.length === 0) {
    console.error('one of the two entry formats contributed ZERO ids. That is how this measurement '
      + 'undercounted by four on its first run and reported it as a correction. Refusing.');
    process.exit(3);
  }

  const tracked = execFileSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter((f) => /\.test\.(mjs|ts|py)$/.test(f));
  if (tracked.length < 100) { console.error(`only ${tracked.length} test files found — the listing is wrong, not the repository. Refusing.`); process.exit(3); }

  const cited = new Map();
  for (const f of tracked) {
    let src;
    try { src = readFileSync(join(REPO, f), 'utf8'); } catch { continue; }
    for (const id of parsed.all) {
      if (!citesFailure(src, id)) continue;
      if (!cited.has(id)) cited.set(id, []);
      cited.get(id).push(f);
    }
  }

  const covered = parsed.all.filter((id) => cited.has(id));
  const report = {
    generated_at: new Date().toISOString(),
    generator: 'packages/training/src/measure-failure-coverage.mjs',
    // WHICH TREE THIS IS ABOUT. The file set comes from `git ls-files`, so this number moves every
    // time a peer commits a test — and a coverage figure with only a timestamp on it cannot be
    // re-derived later, because the tree it measured is gone. check-rebrand printed REBRAND
    // COMPLETE four times over an unstaged fix while CI failed on every run; the lesson is that a
    // measurement of a tree has to say which tree. `git rev-parse HEAD` is that.
    measured_at_commit: (() => {
      try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).trim(); }
      catch { return null; }
    })(),
    measured_at_commit_meaning: 'the file SET is this commit\'s `git ls-files`. File CONTENTS are read from the working tree, so a figure taken with uncommitted edits in a tracked test file describes bytes this commit does not hold.',
    documented_failures: parsed.all.length,
    documented_by_format: { heading: parsed.heading_format.length, bullet: parsed.bullet_format.length },
    test_files_searched: tracked.length,
    failures_cited_by_a_test: covered.length,
    failures_not_cited_by_any_test: parsed.all.length - covered.length,
    coverage_percent: Math.round((covered.length / parsed.all.length) * 1000) / 10,
    covered: Object.fromEntries(covered.map((id) => [id, cited.get(id)])),
    uncovered: parsed.all.filter((id) => !cited.has(id)),
    what_this_counts: 'a failure is counted as covered when at least one tracked test file NAMES its id. That is a citation, not a proof that the test would catch the failure again.',
    what_this_does_not_do: 'it does not add an F-id to any eval task. Which eval task was born from which failure is an authoring judgement, and deriving it from surface similarity would fabricate provenance.',
  };

  const out = join(REPO, 'packages/training/runs/failure-coverage.json');
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.error(`${report.documented_failures} documented failures `
    + `(${report.documented_by_format.heading} heading-format, ${report.documented_by_format.bullet} bullet-format)`);
  console.error(`${report.failures_cited_by_a_test} cited by at least one of ${tracked.length} tracked test files — ${report.coverage_percent}%`);
  console.error(`${report.failures_not_cited_by_any_test} carry no executable citation: ${report.uncovered.join(', ')}`);
  console.error(`wrote ${out}`);
}
/* c8 ignore stop */
