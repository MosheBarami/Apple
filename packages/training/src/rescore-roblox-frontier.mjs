#!/usr/bin/env node
/**
 * RE-SCORE A RECORDED FRONTIER RUN FROM THE ANSWERS IT SAVED. NO MODEL CALL, NO NEURON.
 *
 * WHY THIS EXISTS, DATED. On 2026-09-21 `tally` was corrected: an answer the Luau compiler rejects
 * is the model's verdict and belongs in the denominator, and until that day it did not. Two runs
 * had already been recorded under the old arithmetic. Re-running them against the model would not
 * have fixed them — it would have produced DIFFERENT ANSWERS, because §4.4 of
 * docs/frontier-for-roblox.md establishes that this gateway resamples across an hour. A number
 * corrected by resampling is a new measurement wearing the old one's name.
 *
 * So the answers are re-judged instead. Every row of a frontier run carries `answer` verbatim,
 * which is the whole point of saving it: the model's bytes are fixed, the scorer is not, and a
 * recorded run must be re-readable by a later scorer or its provenance hashes mean nothing.
 *
 * This re-runs the harness over the saved text — it does not merely re-add the stored verdicts —
 * so a change anywhere in the scoring path is reflected, not just a change in `tally`.
 *
 * Usage:
 *   node packages/training/src/rescore-roblox-frontier.mjs packages/training/runs/roblox-frontier-apple-agent-neutral-r2.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FRONTIER_ITEMS } from './roblox-frontier-tasks.mjs';
import { scoreFrontierItem, tally, HARNESS_PATH } from './score-roblox-frontier.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const path = process.argv[2];
if (!path) { console.error('usage: rescore-roblox-frontier.mjs <run.json>'); process.exit(2); }

const run = JSON.parse(readFileSync(path, 'utf8'));
if (!Array.isArray(run.rows) || !run.rows.length) {
  console.error(`${path} has no rows to re-score — it never measured anything`);
  process.exit(2);
}

// Only the items this run actually answered, in this run's own order, so the tally's denominator
// is this run's and not the full suite's.
const items = run.rows.map((r) => {
  const item = FRONTIER_ITEMS.find((i) => i.id === r.id);
  if (!item) throw new Error(`row "${r.id}" is not an item in roblox-frontier-tasks.mjs any more`);
  return item;
});
const before = { measured: run.measured, passed: run.passed, pct: run.pct };
const results = run.rows.map((r, i) => scoreFrontierItem(items[i], r.answer));

const board = tally(items, results);
for (const [i, r] of run.rows.entries()) {
  const s = results[i];
  r.outcome = s.outcome;
  r.ok = s.ok;
  r.checks = (s.checks ?? []).map((c) => ({ id: c.id, pass: c.pass }));
  r.failed = s.failedIds ?? [];
  r.unresolved = s.unresolvedCount ?? 0;
  r.detail = s.detail ?? null;
}
run.rescoredAt = new Date().toISOString();
run.rescoredFrom = before;
//[[ EVERY HASH THE BENCH WROTE IS RE-TAKEN, NOT JUST THE TWO THIS FILE USED TO KNOW ABOUT.
//   2026-09-21: shop-debit's probe was corrected -- it fired one spelling of an item name the
//   prompt never fixes -- and the probe lives in roblox-frontier-tasks.mjs. Re-scoring with the old
//   two-hash block would have left `provenance.tasks` naming the file that judged the run BEFORE
//   the correction, on a run judged AFTER it. A provenance field that survives the thing it
//   describes is worse than an absent one: it is a wrong answer with a certificate.
//   roblox-frontier.test.mjs now fails if the bench grows a hash this list does not re-take.
const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
run.provenance = {
  ...run.provenance,
  harness: sha(HARNESS_PATH),
  scorer: sha(resolve(HERE, 'score-roblox-frontier.mjs')),
  tasks: sha(resolve(HERE, 'roblox-frontier-tasks.mjs')),
  controls: sha(resolve(HERE, 'roblox-frontier-controls.mjs')),
  settingsMirror: sha(resolve(HERE, 'production-settings.mjs')),
};
run.measured = board.measured;
run.passed = board.passed;
run.pct = board.pct;
run.excludedFromDenominator = board.excluded;
run.outcomes = board.outcomes;
run.byAxis = board.byAxis;
run.failedChecks = run.rows.flatMap((r, i) => (results[i].outcome === 'checked'
  ? results[i].checks.filter((c) => c.pass === false).map((c) => ({ item: r.id, axis: r.axis, check: c.id, why: c.why }))
  : []));

writeFileSync(path, JSON.stringify(run, null, 1) + '\n');
console.log(`${path}\n  was ${before.passed}/${before.measured} (${before.pct}%)`
  + `  ->  now ${board.passed}/${board.measured} (${board.pct}%), ${board.excluded} excluded`);
console.log('  outcomes:', JSON.stringify(board.outcomes));
