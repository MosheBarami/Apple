/**
 * A DOC COMMENT IS A CLAIM, AND THIS ONE WAS FALSE.
 *
 * `RunIntent.checklist` in packages/shared said, of the list the Thinking card draws as "Plan":
 *
 *     "The build is checked against this list"
 *
 * It is not. `grep -rn checklist apps/worker/src` finds the list being BUILT (semantic.ts), being
 * TRIMMED (run-intent.ts) and being BROADCAST (do/session.ts) — and nothing at all that reads it
 * back after the run. The only post-build check in the loop is `semanticCheck`, which measures
 * geometry and never looks at the checklist. The list is not even handed to the model.
 *
 * This is the house defect in its quietest form: a failure to observe rendered as an observation,
 * written in a comment rather than in a UI string, where it misleads the next engineer instead of
 * the user. Someone reading that line would reasonably decide the verification was handled.
 *
 * So the comment was corrected to say what is true. This file is what stops it drifting back:
 *
 *   - if the comment claims a check again, this test fails, UNLESS
 *   - the worker has actually grown a consumer that reads the checklist after the run.
 *
 * The escape clause is the point. The guard is not a ban on ever making the claim — it is a
 * requirement that the claim and the code appear together. Implement the check and the guard
 * lets the sentence back in.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');

/** The doc comment attached to `checklist` inside the RunIntent declaration. */
function checklistDoc() {
  const src = readFileSync(join(ROOT, 'packages/shared/src/index.ts'), 'utf8');
  const start = src.indexOf('export interface RunIntent {');
  assert.ok(start > 0, 'RunIntent is no longer declared in packages/shared');
  const body = src.slice(start, src.indexOf('\n}', start));
  const field = body.indexOf('\n  checklist:');
  assert.ok(field > 0, 'RunIntent no longer has a checklist field');
  const doc = body.lastIndexOf('/**', field);
  return body.slice(doc, field);
}

/** Every worker source file, so "does anything read it" is answered over the real tree. */
function workerSources(dir = join(ROOT, 'apps/worker/src')) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...workerSources(p));
    else if (e.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

/**
 * Does any worker file read the checklist back after the run?
 *
 * Building, trimming and broadcasting it are not reading it back, so the three files that do
 * those things are excluded by name. A new consumer anywhere else counts.
 */
function hasChecklistConsumer() {
  const producers = new Set(['semantic.ts', 'run-intent.ts']);
  for (const file of workerSources()) {
    const name = file.split('/').pop();
    if (producers.has(name)) continue;
    const src = readFileSync(file, 'utf8');
    // Comments stripped: prose ABOUT the checklist is not a consumer of it. This repository has
    // been bitten four times by a guard that matched the commentary instead of the code.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    if (/\bintent\??\.checklist\b|\bagent\.intent\b[^\n]*checklist/.test(code)) return file;
  }
  return null;
}

test('CONTROL: the doc comment and the source tree are both really being read', () => {
  const doc = checklistDoc();
  assert.ok(doc.length > 40, 'the checklist doc comment was not found, so the guard below is vacuous');
  assert.match(doc, /Plan/, 'the comment no longer describes the Plan row at all');
  assert.ok(workerSources().length > 20, 'the worker source scan found almost nothing');
});

test('THE TYPE DOES NOT CLAIM A VERIFICATION THE WORKER DOES NOT PERFORM', () => {
  const doc = checklistDoc();
  const claims = /\b(?:is|are|gets?|will be)\s+(?:checked|verified|validated)\s+against\b/i.test(doc);
  if (!claims) return;
  const consumer = hasChecklistConsumer();
  assert.ok(
    consumer,
    'RunIntent.checklist claims the build is checked against the list, and no worker file reads '
      + 'the checklist back after the run. Either implement the check or correct the comment — a '
      + 'doc comment describing a verification that does not happen is the same failure as a UI '
      + 'string describing one.',
  );
});

test('the comment still says what the list IS, so correcting it did not gut it', () => {
  // The fix must not be "delete the sentence and leave a field nobody understands".
  const doc = checklistDoc();
  assert.match(doc, /named by hand|asked for by name/i, 'the comment stopped saying where the list comes from');
});
