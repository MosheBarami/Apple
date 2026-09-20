// A parser blind to one of two entry formats measures 93% of a document and reports it as all.
//
// WHY THIS EXISTS, and it is not hypothetical — it happened while this measurement was being
// written. `docs/FAILURES.md` declares failures in TWO formats: 57 carry an `### F-NN ·` heading,
// and four more — F-08 through F-11, under "Inherited (earlier passes, kept for the record)" — are
// `- **F-NN** ·` bullets. The first version of the parser read only headings, returned 57, and the
// next step was going to be writing down that the standing figure of 61 was four too high.
//
// It was not too high. The parser was blind, and being blind looked exactly like being right: a
// clean run, a plausible number, a confident correction to a figure that was correct.
//
// So the assertion here is NOT that the total is 61. That would be a tripwire on a document which
// gains an entry most days, and bumping it would become routine. It is that NEITHER FORMAT
// CONTRIBUTES ZERO — the specific shape of the specific failure, which no total can detect.
//
// WHAT THIS PROVES, STATED NARROWLY: that both entry formats are parsed; that ids are matched on
// word boundaries so F-6 never counts as F-68; that covered and uncovered partition the documented
// set exactly; and that the report keeps saying a citation is not a proof.
//
// It proves nothing about whether a test that names a failure would actually catch it again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseFailureIds, citesFailure } from './measure-failure-coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');
const FAILURES = join(REPO, 'docs/FAILURES.md');
const REPORT = join(ROOT, 'runs/failure-coverage.json');

test('both entry formats are parsed, and neither contributes zero', () => {
  const md = [
    '### F-12 · a heading entry',
    'body',
    '### F-13 · another heading entry',
    '## Inherited (earlier passes, kept for the record)',
    '- **F-08** · a bullet entry',
    '- **F-09** · another bullet entry',
  ].join('\n');
  const p = parseFailureIds(md);
  assert.deepEqual(p.heading_format, ['F-12', 'F-13']);
  assert.deepEqual(p.bullet_format, ['F-08', 'F-09'], 'the bullet format was not parsed — this is the original defect');
  assert.deepEqual(p.all, ['F-08', 'F-09', 'F-12', 'F-13'], 'ids are not merged and sorted numerically');

  // A cross-reference inside prose is not an entry. Only a declaration is.
  const prose = '### F-12 · a heading\nThis one supersedes F-99 and relates to F-98.';
  assert.deepEqual(parseFailureIds(prose).all, ['F-12'],
    'a failure mentioned in prose was counted as a documented entry');
});

test('the real document still declares entries in both formats',
  { skip: !existsSync(FAILURES) && 'FAILURES.md is not in this checkout' }, () => {
    const p = parseFailureIds(readFileSync(FAILURES, 'utf8'));
    // Deliberately NOT `equal(p.all.length, 61)`. The document grows; the formats do not.
    assert.ok(p.heading_format.length > 0, 'no heading-format entries were parsed out of FAILURES.md');
    assert.ok(p.bullet_format.length > 0,
      'no bullet-format entries were parsed out of FAILURES.md — the measurement is reading part of the document and reporting it as all of it');
    assert.ok(p.all.length > 40, `only ${p.all.length} failures parsed — too few to be the real ledger`);
  });

test('failure ids match on word boundaries', () => {
  assert.equal(citesFailure('see F-68 for the worktree case', 'F-68'), true);
  assert.equal(citesFailure('see F-68 for the worktree case', 'F-6'), false,
    'F-6 matched inside F-68, which would credit a failure with somebody else’s test');
  assert.equal(citesFailure('F-6', 'F-6'), true);
  assert.equal(citesFailure('nothing here', 'F-12'), false);
});

test('covered and uncovered partition the documented set exactly',
  { skip: !existsSync(REPORT) && 'the measurement has not been run' }, () => {
    const r = JSON.parse(readFileSync(REPORT, 'utf8'));
    assert.equal(r.failures_cited_by_a_test + r.failures_not_cited_by_any_test, r.documented_failures,
      'covered plus uncovered does not equal the documented total');
    assert.equal(Object.keys(r.covered).length, r.failures_cited_by_a_test);
    assert.equal(r.uncovered.length, r.failures_not_cited_by_any_test);
    assert.equal(
      new Set([...Object.keys(r.covered), ...r.uncovered]).size, r.documented_failures,
      'a failure appears in both lists, or in neither',
    );

    assert.ok(r.documented_by_format.heading > 0 && r.documented_by_format.bullet > 0,
      'the report records a format that contributed nothing');
    assert.ok(r.test_files_searched > 100, `only ${r.test_files_searched} test files were searched — the listing is wrong`);
    for (const files of Object.values(r.covered)) {
      assert.ok(Array.isArray(files) && files.length > 0, 'a failure is recorded as covered with no file naming it');
    }
    // The distinction that keeps this number honest.
    assert.match(String(r.what_this_counts), /citation, not a proof/,
      'the report stopped saying that naming a failure is not catching it');
    assert.match(String(r.what_this_does_not_do), /fabricate provenance/,
      'the report stopped saying it declines to invent which eval task came from which failure');
  });
