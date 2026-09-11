#!/usr/bin/env node
/**
 * A budget for what the web app makes every user download before it can render.
 *
 * The landing has `check-landing-budget.mjs`. The app had nothing, and it had drifted in
 * the way bundles always do — by accumulating pages nobody visits. `/ui-lab` is a
 * specimen book for reviewing components and `/admin` renders only for `is_admin`
 * profiles; both were statically imported, so both were downloaded by everyone, on every
 * first load, to reach pages almost none of them will open. Splitting the two took the
 * entry bundle from 61.36 kB gzipped to 55.48.
 *
 * What is budgeted is the ENTRY graph — the chunks a browser must have before the first
 * paint — and not the total build. A route that is correctly split can be as large as it
 * likes; that is the point of splitting it. So this measures the entry chunk plus what
 * `index.html` preloads, and separately asserts that the two rare routes are still in
 * chunks of their own.
 *
 * Figures are gzipped from `dist`, not taken from bundler output, and the budgets carry
 * real headroom so this fails on a regression rather than on a rounding change.
 *
 * Usage: node scripts/check-app-bundle.mjs      (after building the web app)
 */
import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'apps/web/dist';
// Measured from dist at the time of writing: entry 54.2 kB gzipped, eager graph
// 195.8 kB across four files — entry, react, supabase and markdown. The first version of
// this file guessed 145 kB for the graph and the check failed on a correct build, which
// is a good argument for measuring the number you are about to enforce.
//
// MARKDOWN (21.7 kB gzipped) is in the eager graph because `ws/turn.tsx` imports it and
// the workspace route is statically imported. It is not needed to paint the dashboard,
// which is where a user actually lands. Getting it out means lazy-loading the workspace
// route, which trades bundle size for a round trip on the busiest path in the product —
// a real tradeoff, not an oversight, and not one to make silently. It is recorded here
// so the next person weighing it starts from the measurement.
const ENTRY_BUDGET_GZIP = 70_000;
const EAGER_BUDGET_GZIP = 230_000;
/** Routes that must stay in a chunk of their own. */
const MUST_BE_SPLIT = ['ui-lab', 'admin'];

if (!existsSync(DIST)) {
  console.error(`no build found at ${DIST} — run \`pnpm --filter @golem/web build\` first`);
  process.exit(1);
}

const html = readFileSync(join(DIST, 'index.html'), 'utf8');
const assets = readdirSync(join(DIST, 'assets'));
const gz = (name) => gzipSync(readFileSync(join(DIST, 'assets', name))).length;

// Everything index.html pulls in up front: the entry script plus every modulepreload.
const referenced = new Set(
  [...html.matchAll(/\/app\/assets\/([A-Za-z0-9._-]+\.js)/g)].map((m) => m[1]),
);
const entry = [...referenced].find((f) => f.startsWith('index-'));

const problems = [];
if (!entry) problems.push('no index-*.js is referenced from index.html — the parse is wrong, not the bundle');
if (referenced.size === 0) problems.push('index.html references no JavaScript at all; this check would be vacuous');

const entryGzip = entry ? gz(entry) : 0;
const eagerGzip = [...referenced].reduce((n, f) => n + gz(f), 0);

if (entryGzip > ENTRY_BUDGET_GZIP) {
  problems.push(`entry chunk ${entry} is ${entryGzip} B gzipped, over the ${ENTRY_BUDGET_GZIP} B budget`);
}
if (eagerGzip > EAGER_BUDGET_GZIP) {
  problems.push(`the eager graph is ${eagerGzip} B gzipped across ${referenced.size} files, over ${EAGER_BUDGET_GZIP} B`);
}

for (const route of MUST_BE_SPLIT) {
  const chunk = assets.find((f) => f.startsWith(`${route}-`) && f.endsWith('.js'));
  if (!chunk) {
    problems.push(`/${route} has no chunk of its own — it has been folded back into the bundle everyone downloads`);
    continue;
  }
  if (referenced.has(chunk)) {
    problems.push(`/${route} is split but index.html preloads it, so every user still fetches it`);
  }
}

if (problems.length > 0) {
  console.error(`check-app-bundle: ${problems.length} problem(s)\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
console.log(
  `check-app-bundle: entry ${kb(entryGzip)} gzipped, eager graph ${kb(eagerGzip)} across ${referenced.size} files; ` +
    `${MUST_BE_SPLIT.join(' and ')} are split out`,
);
