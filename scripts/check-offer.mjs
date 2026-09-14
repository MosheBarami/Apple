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
//   2. A plan granting more Sparks per day than BudgetDO's own daily neuron ceiling can serve.
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

import { PLAN_COPY, PLAN_IDS, PLAN_LIMITS, SPARKS_PER_BUILD } from '../packages/shared/src/index.ts';
import {
  BILLABLE_NEURONS_PER_DAY,
  DAILY_NEURON_CEILING,
  FREE_NEURONS_PER_DAY,
  NEURONS_PER_SPARK,
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

const problems = [];
const note = [];

/* ------------------------------------------------- 1. margin on the priced plans --- */

const usdPerSpark = NEURONS_PER_SPARK * USD_PER_NEURON;

for (const id of PLAN_IDS) {
  const price = PLAN_COPY[id].priceUsdMonthly;
  if (price === null) { note.push(`${id}: no price — negotiated, so no margin rule applies`); continue; }
  if (price === 0) continue; // the free tier's rule is #3, not this one
  const serveCost = PLAN_LIMITS[id].sparksPerMonth * usdPerSpark;
  const floor = serveCost * MARGIN;
  if (price <= floor) {
    problems.push(
      `${id} charges $${price}/month for ${PLAN_LIMITS[id].sparksPerMonth.toLocaleString()} Sparks, ` +
      `which cost $${serveCost.toFixed(2)} to serve — below the $${floor.toFixed(2)} floor at ${MARGIN}x`,
    );
  } else {
    note.push(`${id}: $${price} vs $${floor.toFixed(2)} floor (serves for $${serveCost.toFixed(2)})`);
  }
}

/* -------------------------------- 2. a promise the service can deliver in one day --- */

const ceilingSparks = Math.floor(DAILY_NEURON_CEILING / NEURONS_PER_SPARK);

for (const id of PLAN_IDS) {
  const day = PLAN_LIMITS[id].sparksPerDay;
  if (day > ceilingSparks) {
    problems.push(
      `${id} grants ${day} Sparks/day but the WHOLE SERVICE can serve ${ceilingSparks} ` +
      `(${DAILY_NEURON_CEILING.toLocaleString()} neurons = ${FREE_NEURONS_PER_DAY.toLocaleString()} free + ` +
      `${BILLABLE_NEURONS_PER_DAY.toLocaleString()} billable). One user on this plan exhausts the day for everyone.`,
    );
  }
}

/* ------------------------------ 3. a free tier that can finish one complete job --- */

const freeDay = PLAN_LIMITS.free.sparksPerDay;
if (freeDay < SPARKS_PER_BUILD) {
  problems.push(
    `the free plan grants ${freeDay} Sparks/day and one quality-gated build costs ${SPARKS_PER_BUILD} — ` +
    `a free user cannot complete a single build in a day, so the trial demonstrates the product not working`,
  );
} else {
  note.push(`free: ${freeDay} Sparks/day affords ${Math.floor(freeDay / SPARKS_PER_BUILD)} build(s)`);
}

/* --------------------------- 4. every quota a user reads equals the enforced one --- */
//
// A page promising a number the ledger does not grant is a page that lies, and the user finds out
// at the moment they hit the wall. Numbers are matched only in a Sparks context, so an unrelated
// 400 in a CSS rule is not a false positive.

const enforced = new Set(PLAN_IDS.flatMap((id) => [PLAN_LIMITS[id].sparksPerDay, PLAN_LIMITS[id].sparksPerMonth]));
const SPARK_CLAIM = /(\d[\d,]{1,8})\s*(?:Sparks?|sparks?)\s*(?:a|per|\/)\s*(day|month)/g;

/**
 * COMMENTARY IS NOT COPY. A guard that reads source text must read the source, not the prose
 * explaining it.
 *
 * This reported `pricing.astro states 60 Sparks a day, which no plan grants` against a file whose
 * every rendered figure is interpolated from PLAN_LIMITS. The "claim" was a comment recording why
 * three literals had been replaced — *"against a free tier that granted 60 Sparks a day"* — which
 * is exactly the history worth writing down, and this refused to let it be written.
 *
 * It is the second guard in this repository caught doing it; check-spark-figures.mjs has the same
 * function and the same note, for the same reason. The failure is not symmetric and that is what
 * makes it worth fixing rather than rewording around: a comment can only ever produce a FALSE
 * ALARM here, and the cost of the false alarm is that nobody can explain a number they corrected.
 *
 * `//` is only treated as a comment when the character before it is not `:`, so `https://` in an
 * href survives. A `//` inside some other string literal would be over-stripped; that narrows what
 * this can see rather than widening it, and no file on the copy surface has one.
 */
const stripComments = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

for (const rel of copySurface) {
  let src;
  try { src = stripComments(readFileSync(join(ROOT, rel), 'utf8')); } catch { continue; }
  for (const m of src.matchAll(SPARK_CLAIM)) {
    const claimed = Number(m[1].replace(/,/g, ''));
    if (!enforced.has(claimed)) {
      problems.push(`${rel} states ${claimed} Sparks a ${m[2]}, which no plan grants`);
    }
  }
}

/* ---------------------- the promises a free tier must not make about money --- */
//
// §12.5 forbids publishing contractual terms without a dated owner statement. "$0 forever" and
// "no card required, ever" are terms, not descriptions, and they bind a business that now has
// subscriptions.

const FOREVER = [/\$0\s*forever/i, /no card required,?\s*ever/i, /never be charged/i, /free\s+forever/i];
for (const rel of copySurface) {
  let src;
  // Comments stripped here too — a note saying "we must never write $0 forever" is not a page
  // writing it, and the rule is worth being able to record next to the code it governs.
  try { src = stripComments(readFileSync(join(ROOT, rel), 'utf8')); } catch { continue; }
  for (const re of FOREVER) {
    const hit = re.exec(src);
    if (hit) problems.push(`${rel} promises "${hit[0]}" — a contractual term, and this product now has subscriptions`);
  }
}

/* ------------------------------------------------------------------ report --- */

for (const n of note) console.log(`  ok  ${n}`);

if (!problems.length) {
  console.log(`OFFER COHERENT — ${PLAN_IDS.length} plans, ${copySurface.length} copy files checked`);
  process.exit(0);
}

for (const p of problems) console.error(`  BROKEN: ${p}`);
console.log(`OFFER INCOHERENT — ${problems.length} problem(s) across ${PLAN_IDS.length} plans`);
process.exit(1);
