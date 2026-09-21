// The other half of the `failure` field. tasks.mjs checks the SHAPE of "F-71"; only a
// reader of docs/FAILURES.md can check that F-71 is a heading that exists. Without this
// half, "failures become evals" is a string comparison against nothing: a task could cite
// F-999 forever and every checker in the repo would stay green.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadTasks } from './tasks.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const FAILURES = join(ROOT, 'docs', 'FAILURES.md');

function documentedIds(md = readFileSync(FAILURES, 'utf8')) {
  return new Set([...md.matchAll(/^#+\s*(F-\d+)\b/gm)].map((m) => m[1]));
}

test('docs/FAILURES.md is readable and carries numbered entries', () => {
  const ids = documentedIds();
  assert.ok(ids.size > 20, `expected many F-<n> headings, found ${ids.size}`);
});

test('every task that cites a failure cites one that is written down', () => {
  const ids = documentedIds();
  const { tasks, errors } = loadTasks();
  assert.deepEqual(errors, []);
  const cited = tasks.filter((t) => t.failure != null);
  for (const t of cited) {
    assert.ok(
      ids.has(t.failure),
      `${t.category}/${t.id} cites ${t.failure}, which is not a heading in docs/FAILURES.md`,
    );
  }
});

test('the linkage is not empty — at least three failures have an eval', () => {
  const { tasks } = loadTasks();
  const cited = new Set(tasks.filter((t) => t.failure != null).map((t) => t.failure));
  assert.ok(
    cited.size >= 3,
    `only ${cited.size} documented failure(s) are exercised by an eval task; ` +
      'docs/FINISH-REPORT-100.md §3.7 asks for at least three',
  );
});
