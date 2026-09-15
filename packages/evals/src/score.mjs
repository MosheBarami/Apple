#!/usr/bin/env node
// The scoring CLI: scorecard, leaderboard, history, diff, and the two gates.
//
// Everything here is offline and costs nothing -- it reads the recorded runs in results/ and
// prints what they support. Its exit code is the point of the gate subcommands: 0 means the gate
// said yes, 1 means it said no, and 2 means the gate could not decide. Three codes, because a
// CI step that collapses "could not measure" into either of the other two is exactly the failure
// this package exists to prevent.
//
//   node src/score.mjs scorecard [<run>]                 one run, every metric
//   node src/score.mjs leaderboard [--metric passRate] [<run>]
//   node src/score.mjs elo [<run>]                       pairwise + Elo across the run's models
//   node src/score.mjs history [--metric passRate] [--model M]
//   node src/score.mjs diff <runA> <runB>
//   node src/score.mjs gate promote <runA> <runB> [--policy <file.json>]
//   node src/score.mjs gate rollback <runA> <runB> [--policy <file.json>]
//
// <run> is a tag, a results filename, or "latest" (the default).
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

import { scoreRun, formatScorecard, formatValue, METRIC_IDS } from './metrics.mjs';
import { loadRunHistory, metricSeries, findRun } from './history.mjs';
import { leaderboard, pairwiseModels, matchesFromPairwise, eloRatings } from './leaderboard.mjs';
import { diffRuns, detectRegressions, promotionGate, rollbackGate, formatDiff } from './regression.mjs';

/** Default gate policy. Deliberately conservative and deliberately explicit. */
export const DEFAULT_PROMOTION_POLICY = {
  require: {
    passRate: { min: 0.8, maxDrop: 0.05 },
    completionRate: { min: 0.95 },
  },
};
export const DEFAULT_ROLLBACK_POLICY = {
  triggers: {
    passRate: { maxDrop: 0.1 },
    errorRate: { max: 0.1 },
  },
};

export const EXIT = Object.freeze({ yes: 0, no: 1, undecided: 2, usage: 64 });

function parseFlags(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? true;
    else positional.push(a);
  }
  return { flags, positional };
}

function loadPolicy(path, fallback) {
  if (!path || path === true) return fallback;
  return JSON.parse(readFileSync(resolve(String(path)), 'utf8'));
}

/** A usage error that `main` turns into an exit code. NOT `process.exit` -- see below. */
class UsageError extends Error {}

/*
 * This used to call `process.exit(EXIT.usage)` directly, which made the whole CLI untestable:
 * the first test that passed an unknown run reference killed the test runner mid-file, and the
 * node:test output for it was a bare "test failed" with every other test in the file unreported.
 * A harness that dies is not a harness that measured something.
 */
function requireRun(runs, ref, label) {
  const hit = findRun(runs, ref ?? 'latest');
  if (!hit) throw new UsageError(`no run matching ${label}="${ref ?? 'latest'}" (tags: ${runs.map((r) => r.tag).join(', ') || 'none'})`);
  return hit;
}

function reportLoadErrors(errors) {
  // Loud, not swallowed: a results file that will not parse is a run whose record is missing,
  // and every number printed below is computed without it.
  for (const e of errors) console.error(`WARNING  ${e.file}: ${e.why}`);
}

export function main(argv) {
  try {
    return dispatch(argv);
  } catch (e) {
    if (e instanceof UsageError) {
      console.error(e.message);
      return EXIT.usage;
    }
    throw e;
  }
}

function dispatch(argv) {
  const [command, ...rest] = argv;
  const { flags, positional } = parseFlags(rest);
  const { runs, errors } = loadRunHistory();
  reportLoadErrors(errors);
  if (runs.length === 0) {
    console.error('no eval runs recorded in results/ yet.');
    return EXIT.usage;
  }
  const metric = typeof flags.metric === 'string' ? flags.metric : 'passRate';
  if (!METRIC_IDS.includes(metric)) {
    console.error(`unknown metric "${metric}" (known: ${METRIC_IDS.join(', ')})`);
    return EXIT.usage;
  }

  switch (command) {
    case 'scorecard': {
      const entry = requireRun(runs, positional[0], 'run');
      const s = scoreRun(entry.run);
      console.log(`${entry.tag}  ${entry.startedAt ?? '(undated)'}  ${entry.file}\n`);
      console.log(formatScorecard(s.overall, { title: 'overall' }));
      for (const model of s.models) console.log('\n' + formatScorecard(s.byModel[model], { title: model }));
      return EXIT.yes;
    }

    case 'leaderboard': {
      const entry = requireRun(runs, positional[0], 'run');
      const board = leaderboard(scoreRun(entry.run).byModel, { metric });
      console.log(`${board.metric} (${board.direction} is better) — ${entry.tag}\n`);
      for (const row of board.rows) {
        const rank = row.rank == null ? '  -' : String(row.rank).padStart(3);
        const value = row.available ? formatValue({ available: true, value: row.value, unit: board.unit }) : `— (${row.reason})`;
        console.log(`${rank}  ${row.model.padEnd(10)}${value}${row.available ? `   n=${row.n}` : ''}`);
      }
      return EXIT.yes;
    }

    case 'elo': {
      const entry = requireRun(runs, positional[0], 'run');
      const pairs = pairwiseModels(entry.run);
      if (pairs.length === 0) {
        console.error(`${entry.tag} has fewer than two models; there is nothing to compare.`);
        return EXIT.undecided;
      }
      for (const p of pairs) {
        console.log(`${p.a} vs ${p.b}: ${p.wins}W ${p.losses}L ${p.ties}T of ${p.comparable} comparable` + (p.indeterminate ? `, ${p.indeterminate} indeterminate` : '') + `  -> ${p.verdict}`);
      }
      console.log('');
      const { rows } = eloRatings(matchesFromPairwise(pairs), { models: entry.models });
      for (const r of rows) {
        console.log(r.rated ? `${String(r.rank).padStart(3)}  ${r.model.padEnd(10)}${r.rating.toFixed(1)}   (${r.games} games)` : `  -  ${r.model.padEnd(10)}unrated (${r.reason})`);
      }
      return EXIT.yes;
    }

    case 'history': {
      const model = typeof flags.model === 'string' ? flags.model : null;
      const s = metricSeries(runs, { metric, model });
      console.log(`${s.metric}${model ? ` [${model}]` : ''} — ${s.measured} measured, ${s.gaps} gap(s)\n`);
      for (const p of s.points) {
        const value = p.available ? formatValue({ available: true, value: p.value, unit: s.unit }) : `— (${p.reason})`;
        console.log(`${(p.at ?? '(undated)').padEnd(26)}${p.tag.padEnd(20)}${value}`);
      }
      return EXIT.yes;
    }

    case 'diff': {
      const a = requireRun(runs, positional[0], 'runA');
      const b = requireRun(runs, positional[1], 'runB');
      const d = diffRuns(a.run, b.run);
      console.log(formatDiff(d));
      for (const model of d.sharedModels) console.log('\n' + formatDiff(d, { model }));
      const det = detectRegressions(d);
      console.log('');
      if (det.regressions.length) for (const r of det.regressions) console.log(`REGRESSED  ${r.label}${r.model ? ` [${r.model}]` : ''}: dropped ${formatValue({ available: true, value: r.drop, unit: r.unit })}`);
      if (det.taskRegressions.length) console.log(`REGRESSED  ${det.taskRegressions.length} task(s): ${det.taskRegressions.slice(0, 8).map((t) => t.taskId).join(', ')}`);
      if (det.indeterminate.length) console.log(`UNMEASURED ${det.indeterminate.length} metric row(s) — no verdict is available for them`);
      if (det.clean) console.log('no regressions, and nothing went unmeasured');
      return det.regressions.length || det.taskRegressions.length ? EXIT.no : det.clean ? EXIT.yes : EXIT.undecided;
    }

    case 'gate': {
      const which = positional[0];
      const a = requireRun(runs, positional[1], 'runA');
      const b = requireRun(runs, positional[2], 'runB');
      const d = diffRuns(a.run, b.run);
      const model = typeof flags.model === 'string' ? flags.model : null;
      if (which === 'promote') {
        const policy = { model, ...loadPolicy(flags.policy, DEFAULT_PROMOTION_POLICY) };
        const g = promotionGate(d, policy);
        console.log(`promotion gate: ${g.verdict.toUpperCase()}  (${a.tag} -> ${b.tag})`);
        for (const c of g.checked) console.log(`  ${c.ok ? 'ok   ' : 'FAIL '} ${c.id}${c.failures.length ? `: ${c.failures.join('; ')}` : ''}`);
        for (const blk of g.blocked) console.log(`  BLOCK ${blk.id ?? '(policy)'}: ${blk.why} — ${blk.detail}`);
        return g.promote ? EXIT.yes : EXIT.no;
      }
      if (which === 'rollback') {
        const policy = { model, ...loadPolicy(flags.policy, DEFAULT_ROLLBACK_POLICY) };
        const g = rollbackGate(d, policy);
        console.log(`rollback gate: ${g.verdict.toUpperCase()}  (${a.tag} -> ${b.tag})`);
        for (const t of g.triggered) console.log(`  FIRED ${t.id}: ${t.detail}`);
        for (const i of g.indeterminate) console.log(`  UNMEASURED ${i.id ?? '(policy)'}: ${i.detail}`);
        // rollback -> 1, healthy -> 0, and "could not tell" gets its own code rather than
        // being rounded to either of them.
        return g.rollback ? EXIT.no : g.healthy ? EXIT.yes : EXIT.undecided;
      }
      console.error('usage: score.mjs gate promote|rollback <runA> <runB> [--policy file.json] [--model M]');
      return EXIT.usage;
    }

    default:
      console.error(readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1, 19).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      return EXIT.usage;
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) process.exit(main(process.argv.slice(2)));
