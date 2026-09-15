#!/usr/bin/env node
// Does the offer hold together?
//
// A plan is four numbers that have to agree with each other and with the machine underneath: what
// it costs, what it grants, what that grant costs us to serve, and what the service can actually
// deliver in a day. Nothing in this repository checked any of those relationships, so all four
// could drift independently — and three of them had.
//
// What this refuses to let pass:
//
//   1. A PRICED plan whose monthly allowance costs more to serve than it charges, at the measured
//      neuron rate with a 1.4× margin. The free plan is exempt from THIS rule and only this one:
//      a free tier is customer acquisition, and a margin rule that included it would make any free
//      tier arithmetically impossible, which is a rule about nothing.
//   2. A plan granting more Credits per day than BudgetDO's own daily neuron ceiling can serve.
//      This is the one that matters most: it is not a pricing mistake, it is a promise the service
//      cannot keep for even one user, and it fails at the moment someone tries to use what they
//      bought.
//   3. A free plan whose daily allowance does not afford one complete quality-gated build. A free
//      tier that cannot finish a single job is not a trial; it is a demonstration that the product
//      does not work.
//   4. A quota stated in the marketing site or the app that differs from the enforced constant.
//
// §12.5 puts price points, entitlements and free-allowance size in the OWNER's hands. So this
// checker never edits a number — it measures the relationships and names which one is broken, and
// the repair is a row in docs/backlog/OWNER-HANDOFF.md.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { copyProblems, planProblems, termProblems } from './lib/offer-rules.mjs';

import { createHash } from 'node:crypto';
import { PLAN_COPY, PLAN_IDS, PLAN_LIMITS, CREDITS_PER_BUILD } from '../packages/shared/src/index.ts';
import {
  BILLABLE_NEURONS_PER_DAY,
  DAILY_NEURON_CEILING,
  FREE_NEURONS_PER_DAY,
  NEURONS_PER_CREDIT,
  USD_PER_NEURON,
} from '../apps/worker/src/pricing.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARGIN = 1.4;

const git = (args) => {
  try { return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim(); }
  catch { return ''; }
};

// The surfaces that can state a quota to a user. §6.3: the denominator is printed, and its
// exceptions carry their reasons.
const EXCEPTIONS = [
  { glob: 'apps/worker/src/pricing.ts', why: 'it DEFINES the constants; comparing it to itself proves nothing' },
  { glob: 'packages/shared/src/index.ts', why: 'same — this is where PLAN_LIMITS lives' },
  { glob: '**/*.test.*', why: 'a test asserting a wrong number is a failing test, which is a different signal' },
  {
    glob: 'apps/site/src/pages/changelog.astro',
    why: 'a changelog records what WAS true on a date; comparing it to what is true now is a category error, and "correcting" it would be rewriting history to match the present',
  },
];

/** Does one EXCEPTIONS glob cover this path? Supports the two shapes the list actually uses. */
function excepted(file) {
  return EXCEPTIONS.some(({ glob }) =>
    glob.startsWith('**/')
      ? new RegExp(glob.slice(3).replace(/\./g, '\\.').replace(/\*/g, '.*')).test(file)
      : file === glob);
}

// THE EXCEPTIONS LIST IS NOW APPLIED, not just printed. It announced four exceptions and honoured
// one: the two source-of-truth files are outside these globs anyway, so they were excluded by
// accident rather than by the rule, and anything added to the list that DID fall inside would have
// been silently ignored. A denominator that states its exceptions and then does not take them is
// a denominator that is wrong in the direction nobody checks.
const copySurface = git(['ls-files', 'apps/site/**', 'apps/web/src/**'])
  .split('\n')
  .filter(Boolean)
  .filter((f) => /\.(astro|tsx?|md|html)$/.test(f))
  .filter((f) => !excepted(f));

console.log(`DENOMINATOR ${copySurface.length} files; EXCEPTIONS ${EXCEPTIONS.length}: ${EXCEPTIONS.map((e) => e.glob).join(', ')}`);

// THE RULES ARE IN scripts/lib/offer-rules.mjs, as pure functions of their inputs, and this file
// is the wiring that hands them the real ones. That split is not tidiness: with the rules inline,
// the only data they could ever be run against was the real repository — which is supposed to
// satisfy them — so tests/check-offer.test.mjs could only assert that a healthy repo stays silent.
// Measured: the daily-ceiling rule replaced by `if (false)` and the contractual-terms list emptied
// to `[]` both left that suite at 12/12 green, and G-ORACLE-3 could not be falsified. Violating
// inputs have to come from somewhere other than the tree being checked.
const enforced = new Set(PLAN_IDS.flatMap((id) => [PLAN_LIMITS[id].creditsPerDay, PLAN_LIMITS[id].creditsPerMonth]));
const ceilingCredits = Math.floor(DAILY_NEURON_CEILING / NEURONS_PER_CREDIT);

const sources = copySurface.flatMap((rel) => {
  try { return [{ rel, src: readFileSync(join(ROOT, rel), 'utf8') }]; } catch { return []; }
});

const { problems: planIssues, notes: note } = planProblems({
  planIds: PLAN_IDS,
  limits: PLAN_LIMITS,
  copy: PLAN_COPY,
  ceilingCredits,
  creditsPerBuild: CREDITS_PER_BUILD,
  usdPerCredit: NEURONS_PER_CREDIT * USD_PER_NEURON,
  margin: MARGIN,
  ceilingDetail:
    ` (${DAILY_NEURON_CEILING.toLocaleString()} neurons = ${FREE_NEURONS_PER_DAY.toLocaleString()} free + ` +
    `${BILLABLE_NEURONS_PER_DAY.toLocaleString()} billable).`,
});

const problems = [
  ...planIssues,
  ...copyProblems(sources, enforced),
  ...termProblems(sources),
];

/* ------------------------------------------------------------------ report --- */

for (const n of note) console.log(`  ok  ${n}`);

if (!problems.length) {
  // DECLARE THE DATA INPUTS, so gate-check can tell an explained output change from an
  // unexplained one. This checker reads copy files that V8 coverage cannot see — they are data,
  // not executed JavaScript — so adding one page changed the printed count while the dependency
  // fingerprint said nothing had changed, and the gate was quarantined for a change that was
  // entirely explained. Left alone, that trains whoever meets it to re-baseline reflexively,
  // which is the habit the quarantine exists to prevent.
  const inputs = createHash('sha256');
  for (const f of [...copySurface].sort()) {
    inputs.update(f);
    inputs.update('\0');
    try { inputs.update(readFileSync(f)); } catch { inputs.update('MISSING'); }
    inputs.update('\0');
  }
  console.log(`INPUTS-SHA ${inputs.digest('hex').slice(0, 24)}`);
  console.log(`OFFER COHERENT — ${PLAN_IDS.length} plans, ${copySurface.length} copy files checked`);
  process.exit(0);
}

for (const p of problems) console.error(`  BROKEN: ${p}`);
console.log(`OFFER INCOHERENT — ${problems.length} problem(s) across ${PLAN_IDS.length} plans`);
process.exit(1);
