// The generated results table (docs/evals/RESULTS.md).
//
// The table publishes one number per (run, model, category) and it used to read those numbers
// straight out of the stored run file -- including the run where every job died and the runner
// wrote `score: 0` for each of them. Three models were published as failing every task in eight
// categories, in a doc whose header says "measure, don't vibe".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderReport, loadAll } from './report.mjs';

const OUTAGE_FILE = 'baseline-20260830-200846.json';

test('the run where all 168 jobs died renders as dashes, not as 0.0', () => {
  const runs = loadAll();
  const outage = runs.find((r) => r.file === OUTAGE_FILE);
  assert.ok(outage, `${OUTAGE_FILE} is missing from results/`);
  // The claim being corrected is in the FILE: the stored cells really do say 0.
  assert.ok(outage.overall.every((o) => o.score === 0), 'fixture drift: the stored scores are no longer 0');
  assert.equal(outage.perTask.filter((t) => t.ok).length, 0);

  const lines = renderReport(runs);
  const rows = lines.filter((l) => l.startsWith('| baseline |'));
  assert.ok(rows.length >= 3, 'the baseline rows are missing from the table');
  // The three rows belonging to the outage run: every cell a dash.
  const outageRows = rows.filter((l) => !/\d/.test(l.split('|').slice(3).join('|')));
  assert.equal(outageRows.length, 3, `expected 3 all-dash rows for the outage run, got ${outageRows.length}`);
  for (const row of outageRows) {
    assert.doesNotMatch(row, /\|\s*0\.0\s*\|/, `a job that never ran was published as 0.0: ${row}`);
    assert.match(row, /\|\s*—\s*\|/);
  }
});

test('a run that WAS measured still publishes its real numbers', () => {
  // The dash must not have eaten the working case. A row of dashes everywhere would satisfy the
  // test above and destroy the report.
  const lines = renderReport(loadAll());
  const measured = lines.filter((l) => l.startsWith('| ') && /\d+\.\d/.test(l));
  assert.ok(measured.length >= 5, `expected real numbers in the table, found ${measured.length} rows`);
  assert.ok(lines.some((l) => /\| glm-final \| stone \|.*\d+\.\d/.test(l)), 'the glm-final row lost its numbers');
});

test('the run list says how many jobs produced no gradable answer', () => {
  const lines = renderReport(loadAll());
  const entry = lines.find((l) => l.includes(OUTAGE_FILE));
  assert.ok(entry, 'the outage run vanished from the run list');
  assert.match(entry, /168\/168 jobs produced no gradable answer/);
  assert.match(entry, /a dash above means nothing was measured, not a zero/);
});

test('the doc on disk matches what the renderer produces right now', () => {
  // Cheap staleness guard: the committed doc is generated, and a reader takes it at face value.
  const onDisk = readFileSync(new URL('../../../docs/evals/RESULTS.md', import.meta.url), 'utf8');
  const fresh = renderReport(loadAll()).join('\n');
  const strip = (s) => s.replace(/^Regenerated: .*$/m, '');
  assert.equal(strip(onDisk), strip(fresh), 'docs/evals/RESULTS.md is stale — run `node src/report.mjs`');
});
