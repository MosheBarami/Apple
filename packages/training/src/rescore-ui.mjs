#!/usr/bin/env node
/**
 * RE-SCORE A SAVED UI RUN WITH TODAY'S SCORER, AND SAY WHAT MOVED.
 *
 * WHY THIS EXISTS. Changing a scorer after a measurement is how an A/B quietly stops being one:
 * the baseline was graded by one set of rules and the intervention by another, and nothing in
 * either file says so. Every row in `runs/eval-ui-*.json` carries the model's full `answer`, so
 * the whole run can be graded again for free — no neurons, no provider, no waiting.
 *
 * It earned its place immediately. Switching `centered` from the node's own rect to the rendered
 * extent looked like tidying and flipped a passing shop-grid build to failing, because a
 * ScrollingFrame's content legitimately overflows its panel. Without this the change would have
 * shipped and the next run's number would have moved for a reason nobody could name.
 *
 * Usage:
 *   node packages/training/src/rescore-ui.mjs packages/training/runs/eval-ui-apple-max-agent-baseline.json
 *   node packages/training/src/rescore-ui.mjs runs/*.json --write     (updates the files in place)
 *
 * Exit status is 1 when any verdict moved, so a scorer change that alters history is visible in a
 * shell pipeline rather than only in the output.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { buildTasks } from './ui-tasks.mjs';
import { check, select, scoreUiTask } from './score-ui.mjs';

const files = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const write = process.argv.includes('--write');
if (!files.length) {
  console.error('usage: rescore-ui.mjs <run.json...> [--write]');
  process.exit(2);
}

const tasks = Object.fromEntries(buildTasks(check, select).map((t) => [t.id, t]));
let movedTotal = 0;

for (const file of files) {
  const data = JSON.parse(readFileSync(file, 'utf8'));
  let scored = 0;
  let moved = 0;
  let checksMoved = 0;

  for (const row of data.rows ?? []) {
    // A row the provider never answered has no answer to re-score, and inventing a verdict for it
    // is the thing this whole package refuses to do.
    if (row.stage !== 'checks' || typeof row.answer !== 'string') continue;
    const task = tasks[row.id];
    if (!task) { console.log(`  ${file}: row "${row.id}" is not a task any more — skipped`); continue; }
    scored += 1;
    const verdict = scoreUiTask(task, row.answer);

    const before = new Map((row.checks ?? []).map((c) => [c.id, c.ok]));
    for (const c of verdict.checks) {
      if (before.has(c.id) && before.get(c.id) !== c.ok) {
        checksMoved += 1;
        console.log(`  ${row.id} #${row.attempt}: check ${c.id} ${before.get(c.id) ? 'PASS' : 'fail'} -> ${c.ok ? 'PASS' : 'fail'}  ${c.detail}`);
      }
    }
    if (verdict.ok !== row.ok) {
      moved += 1;
      console.log(`  ${row.id} #${row.attempt}: VERDICT ${row.ok ? 'PASS' : 'fail'} -> ${verdict.ok ? 'PASS' : 'fail'} (${verdict.reason ?? 'ok'})`);
    }
    if (write) {
      row.ok = verdict.ok;
      row.checks = verdict.checks;
      row.reason = verdict.reason;
      row.unmeasurable = verdict.unmeasurable === true;
      row.runtimeMeasuredLayout = verdict.runtimeMeasuredLayout === true;
    }
  }

  if (write) {
    // The headline has to be recomputed too, or the file's summary describes the old scorer while
    // its rows describe the new one — a disagreement inside one document nobody would spot.
    const rows = data.rows ?? [];
    const measurable = rows.filter((r) => r.stage === 'checks' && !r.unmeasurable);
    data.measurable = measurable.length;
    data.measuredOk = measurable.filter((r) => r.ok).length;
    data.measuredPct = measurable.length ? Math.round((data.measuredOk / measurable.length) * 100) : null;
    data.unmeasurable = rows.filter((r) => r.unmeasurable).length;
    data.ok = rows.filter((r) => r.ok).length;
    data.rescoredAt = new Date().toISOString();
    writeFileSync(file, JSON.stringify(data, null, 1) + '\n');
  }

  movedTotal += moved;
  console.log(`${file}: rescored ${scored} rows — ${moved} verdicts and ${checksMoved} checks moved${write ? ' (written)' : ''}`);
}

process.exit(movedTotal ? 1 : 0);
