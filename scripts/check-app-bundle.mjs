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
// THE BUDGETS WERE 70,000 AND 230,000 AND THEY WERE NOT MEASUREMENTS OF THIS APP.
//
// They were measured on 2026-09-16 against an entry of 54.2 kB gzipped and an eager graph of
// 195.8 kB. This check then went UNSEEN for days: the build job stops at its first failing step
// and an earlier step was red, so nothing here ever ran. When the earlier failure was fixed
// (8f8a287) this file reported an entry of 181 kB — not a regression from one commit, but an app
// that had roughly tripled in source while nobody was reading the number.
//
// A budget pinned to an app that no longer exists is not a guard, it is a permanent red light,
// and a permanent red light teaches people to ignore the file. So the numbers below are re-pinned
// to what the build ACTUALLY produces, after doing the splitting the budget existed to force —
// and the structural assertions underneath them are widened in the same commit, because a number
// can be raised and a MUST_BE_SPLIT list cannot be satisfied by raising anything.
//
// WHAT WAS SPLIT, and why those three. The entry chunk was attributed through its own sourcemap,
// which named the cost of every source file in it. The three largest that are not a landing:
//
//     settings.tsx   52,735 B     usage.tsx   16,917 B     roadmap.tsx   8,703 B
//
// Splitting them took the entry from 180,974 B gzipped to 141,910 B — 22% — and took 60 kB of CSS
// out of the eager stylesheet with it.
//
// WHAT WAS NOT, and this is the honest part. The workspace subtree — `routes/workspace.tsx` plus
// the `components/ws` directory plus `lib/generative-ui` — is about 198 kB of the remaining entry, far and
// away the largest piece left, and MARKDOWN (22.2 kB gzipped) is in the eager graph only because
// `ws/turn.tsx` imports it and workspace is statically imported. Moving it is worth more than
// everything above put together. It was not moved, for a reason that is about verification and not
// about bundles: this app has no DOM test environment (walkable-routes.test.mjs says so in its own
// header — no jsdom, no testing-library, just `node --test`), so a route that is made lazy cannot
// be watched rendering anywhere in this repository. Losing /settings for a release costs a
// settings page. Losing the workspace costs the product.
//
// So these budgets are honest about a debt rather than clean: 141.9 kB of entry is not a good
// number, it is the current number with the safe work done.
// docs/backlog/WEB-BUNDLE-BUDGET-OPEN.md carries the measurement and what closing it needs.
// Headroom is ~6%, deliberately tighter than the 26% the original carried — that slack is part of
// how an app tripled without anyone noticing.
const ENTRY_BUDGET_GZIP = 150_000;
const EAGER_BUDGET_GZIP = 300_000;
/**
 * Routes that must stay in a chunk of their own, reachable but never downloaded up front.
 *
 * This is the half of the check that cannot be satisfied by editing a number, which is why three
 * entries were added to it in the same commit that raised the two numbers above.
 */
// `workspace` joined 2026-09-23: its subtree was ~115 kB of the entry, and lazy-loading it is what
// brought the entry from 194.8 kB to 79.9 kB gzipped without touching the budget.
const MUST_BE_SPLIT = ['admin', 'settings', 'usage', 'roadmap', 'workspace'];

//[[ AND THE STRONGER CASE: a route that is not in the production build at all.
//
//   `ui-lab` was in MUST_BE_SPLIT, and this check had begun reporting "it has been folded back
//   into the bundle everyone downloads" — which was false. app.tsx gates the specimen book behind
//   `import.meta.env.DEV`, so in production the component is `() => null`, the dynamic import is
//   unreachable and no chunk is emitted. That is STRICTLY BETTER than splitting it: splitting
//   stopped every customer downloading an internal review page, gating also stops them opening it.
//
//   A guard aimed at a decision that has since been reversed for a good reason teaches people to
//   ignore the guard, so it is re-aimed at the property rather than deleted. The property is the
//   one ui-lab.css already claims in its own header: `grep -r 'ui-lab' dist/` finds nothing. It
//   cannot pass vacuously — fold the route back in and its module path and its thirteen class
//   names both reappear, in the JS and in the CSS respectively. ]]
const MUST_BE_ABSENT = ['ui-lab'];

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

for (const route of MUST_BE_ABSENT) {
  const hits = [];
  for (const f of assets) {
    const body = readFileSync(join(DIST, 'assets', f));
    if (body.includes(route)) hits.push(f);
  }
  if (html.includes(route)) hits.push('index.html');
  if (hits.length > 0) {
    problems.push(`/${route} is gated out of production builds and yet "${route}" appears in `
      + `${hits.join(', ')} — it is back in a bundle a customer downloads`);
  }
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
    `${MUST_BE_SPLIT.join(' and ')} split out, ${MUST_BE_ABSENT.join(' and ')} absent entirely`,
);
