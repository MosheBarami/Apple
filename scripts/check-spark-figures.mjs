/**
 * THE PRICE THE SITE PUBLISHES MUST BE THE PRICE THE WORKER CHARGES.
 *
 * Sparks are charged by `sparksForNeurons(n) = max(1, ceil(n / NEURONS_PER_SPARK))` in
 * apps/worker/src/pricing.ts, against neuron figures measured in docs/COST-MODEL.md.
 * The pricing page states a per-mode cost and a "requests per free day" derived from it.
 * Nothing connected the two, and they had drifted:
 *
 *   Clay is 37-43 neurons. ceil(43/30) = 2 sparks. The page said 1, and 60 requests a
 *   free day when it is 30. Stone (111 -> 4) and Rune (297 -> 10) were both correct,
 *   which is what makes Clay an arithmetic slip rather than a different pricing model.
 *
 * The same number lived in three more places inside SparkMeter.astro — the visible
 * label, the `data-cost` attribute, and a literal `c * 1` in the script that ignored the
 * attribute. Correcting the first two left the calculator computing the old figure.
 *
 * This checks the chain end to end: COST-MODEL neurons -> the worker's own constants ->
 * the page's stated cost -> the slider attribute -> requests per day.
 *
 * It also checks WHEN the quota resets, because that had drifted too: the site said
 * "a rolling 24-hour clock per account" while QuotaDO does `setUTCHours(24, 0, 0, 0)`,
 * one fixed instant shared by every account. The difference matters to anyone building
 * late in the UTC day.
 *
 * WHAT THIS CHECK DOES NOT DO, stated because it was over-read once already. It proves
 * the site, the app and the worker AGREE with docs/COST-MODEL.md. It cannot prove
 * COST-MODEL is representative. On 2026-09-02 a measured Agent run — the §9.1 tycoon
 * exercise, through the real product path — consumed 60 Sparks and did not finish, against
 * a published "Agent · 4 sparks" that this file happily reports as agreeing. The 4 is
 * `ceil(111 / 30)` from the "targeted edit" row, and COST-MODEL's largest Stone row is 511
 * neurons where that run was roughly 1,800. See BLOCKERS.md and
 * evidence/2026-09-02-second-creation-exercise.md.
 *
 * A guard that says "these agree" is not a guard that says "this is true".
 *
 * Usage: node scripts/check-spark-figures.mjs
 */
import { readFileSync } from 'node:fs';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');

const pricing = read('apps/worker/src/pricing.ts');
const costModel = read('docs/COST-MODEL.md');
const page = read('apps/site/src/pages/pricing.astro');
const meter = read('apps/site/src/components/SparkMeter.astro');

const problems = [];
/** Modes whose requests-per-free-day is computed by the page rather than typed into it. */
let derived = 0;
/** Modes whose stated figure was actually parsed and compared. Not "not derived". */
let stated = 0;

const perSpark = Number(/NEURONS_PER_SPARK = (\d+)/.exec(pricing)?.[1]);

// PLAN_LIMITS LIVES IN packages/shared AND THE WORKER RE-EXPORTS IT. It used to be
// declared in pricing.ts, and this line used to read it there. When the repricing moved
// the table to the shared package — leaving `export { PLAN_LIMITS } from '@golem/shared'`
// behind so every importer kept working — the regex stopped matching, `freeDay` became
// NaN, and this guard exited 1 with "could not read". It had been red in CI since.
//
// It failing loudly is the only reason this was cheap to find: the same move against a
// check that treated a miss as a pass would have left the whole chain unverified while
// still printing "3 modes agree". Read the declaration where it is declared, and make a
// missing one an error rather than a zero.
const shared_ = read('packages/shared/src/index.ts');
const freeDay = Number(/free: \{ sparksPerDay: ([\d_]+)/.exec(shared_)?.[1].replace(/_/g, ''));
if (!perSpark || !freeDay) {
  console.error(
    'check-spark-figures: could not read NEURONS_PER_SPARK (apps/worker/src/pricing.ts) ' +
    'or PLAN_LIMITS.free.sparksPerDay (packages/shared/src/index.ts). One of them moved; follow it.',
  );
  process.exit(1);
}
const sparksFor = (n) => Math.max(1, Math.ceil(n / perSpark));

/** The highest neuron figure on a COST-MODEL row whose label starts with `label`. */
function neuronsFor(label) {
  const row = costModel.split('\n').find((l) => l.startsWith(`| ${label}`) || l.startsWith(`| **${label}`));
  if (!row) return null;
  // "37–43" or "111" or "**511**"
  const cell = row.split('|')[2].replace(/\*/g, '').trim();
  const numbers = cell.split(/[–-]/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
  return numbers.length ? Math.max(...numbers) : null;
}

// The row each published figure is derived from. Named here rather than guessed, because
// "Stone" has four rows in COST-MODEL and only one of them is the advertised case.
//
// TWO NAMES PER MODE, on purpose. COST-MODEL.md is internal and names the specialists —
// Clay, Stone, Rune. The public site must not: packages/shared states that those "are
// internal specialist identities, not user-facing brands: nothing in normal product UI
// should name them", and §15.3 gives the public modes as Plan / Agent / Super Agent.
// This guard therefore reads the neuron figure by the internal name and checks the
// published figure by the public one.
const MODES = [
  { mode: 'Plan', row: 'Clay question (Studio attached)' },
  { mode: 'Agent', row: 'Stone, targeted edit + read-back verify in Studio' },
  { mode: 'Super Agent', row: 'Rune, build + read-back verify + playtest in Studio' },
];

for (const { mode, row } of MODES) {
  const neurons = neuronsFor(row);
  if (neurons === null) {
    problems.push(`COST-MODEL.md has no row "${row}" — the ${mode} figure cannot be derived`);
    continue;
  }
  const expected = sparksFor(neurons);

  // The pricing page's own table.
  const block = page.slice(page.indexOf(`mode: '${mode}'`));
  const stated = Number(/cost: '(\d+) spark/.exec(block)?.[1]);
  if (stated !== expected) {
    problems.push(`pricing.astro says ${mode} costs ${stated} spark(s); ${neurons} neurons / ${perSpark} = ${expected}`);
  }

  // Requests per free day. The page may STATE it or DERIVE it, and this has to tell the
  // two apart from "neither", because that third case is the one that looks like success.
  //
  // It was stated, as a literal, and was wrong: 30 / 15 / up to 6 against a free tier the
  // repricing had taken from 60 Sparks a day to 231. It is derived now — computed from
  // PLAN_LIMITS.free at build time — so there is no literal left for the regex below to
  // read. A guard that simply found nothing and moved on would print "3 modes agree"
  // having checked nothing at all, which is precisely the defect this file was written
  // about in the first place. So: a literal is checked, a derivation is confirmed to be
  // present, and the absence of both is a failure.
  const perDay = /perDay: '([^']+)'/.exec(block)?.[1];
  if (perDay === undefined) {
    if (!/const perFreeDay\b/.test(page) || !/perDay: perFreeDay\(/.test(page)) {
      problems.push(
        `pricing.astro states no requests-per-free-day for ${mode} and does not derive one ` +
        `via perFreeDay() — the figure a reader plans around is now unchecked`,
      );
    } else {
      derived += 1;
    }
  } else {
    // A STATED FIGURE HAS TO BE READABLE AS A NUMBER. The original rule was
    // `if (/^\d+$/.test(perDay) && ...)` — a guard whose first condition was the
    // opportunity to skip itself. "up to 6" fell through it for as long as it was on the
    // page, and so did a literal `'?'` when this was falsified. Anything this cannot
    // parse is unchecked, and unchecked is reported, not passed.
    const m = /^(?:up to )?(\d+)$/.exec(perDay.trim());
    if (!m) {
      problems.push(
        `pricing.astro states "${perDay}" ${mode} requests a free day — not a number this ` +
        `can check against ${freeDay} Sparks/day. Write a count, or derive it with perFreeDay().`,
      );
    } else if (Number(m[1]) !== Math.floor(freeDay / expected)) {
      problems.push(`pricing.astro says ${perDay} ${mode} requests a free day; ${freeDay} / ${expected} = ${Math.floor(freeDay / expected)}`);
    } else {
      stated += 1;
    }
  }

  // The slider's label and its data-cost, which the calculator now reads.
  const ctl = meter.slice(meter.indexOf(`ctl__mode mono">${mode} ·`));
  const label = Number(new RegExp(`${mode} · (\\d+) spark`).exec(ctl)?.[1]);
  const attr = Number(/data-cost="(\d+)"/.exec(ctl)?.[1]);
  if (label !== expected) problems.push(`SparkMeter label says ${mode} · ${label}; expected ${expected}`);
  if (attr !== expected) problems.push(`SparkMeter data-cost for ${mode} is ${attr}; expected ${expected}`);
}

// The calculator must not reintroduce a literal cost.
if (/perDay = c \* \d/.test(meter)) {
  problems.push('SparkMeter computes a mode cost from a literal again instead of reading data-cost');
}

// EVERY page that states a per-mode cost, not just the pricing table. The wrong Clay
// figure turned out to be repeated in six places across the docs, the changelog and the
// docs layout's own footer — each of them a sentence a reader would plan around.
const PROSE = [
  'apps/site/layouts/DocsLayout.astro',
  'apps/site/pages/changelog.astro',
  'apps/site/pages/docs/sparks-and-limits.astro',
  'apps/site/pages/docs/modes.astro',
  'apps/site/pages/docs/faq.astro',
  // The landing states a Spark cost per mode in its `modes` table. It did not before —
  // the one-viewport version carried no figures at all — so the moment it started
  // carrying them it had to join this list or it would have been the one page free to
  // drift.
  'apps/site/pages/index.astro',
].map((p) => `apps/site/src/${p.slice('apps/site/'.length)}`);

const expectedFor = {};
for (const { mode, row } of MODES) {
  const n = neuronsFor(row);
  if (n !== null) expectedFor[mode] = sparksFor(n);
}

for (const file of PROSE) {
  let text;
  try {
    text = read(file);
  } catch {
    problems.push(`${file} is listed here but does not exist — update this list`);
    continue;
  }
  for (const [mode, expected] of Object.entries(expectedFor)) {
    // "Plan — 3 sparks", "Plan: 3 sparks", "Plan</strong> (3 sparks", "Plan ... for 3 sparks".
    //
    // The lookbehind is load-bearing: "Agent" is a substring of "Super Agent", so
    // without it every "Super Agent — 10 sparks" is reported as Agent costing 10.
    // It produced five false positives against a correct file.
    const guard = mode === 'Agent' ? '(?<!Super )' : '';
    // `gi`, not `g`. The unit is a proper noun in product copy — "2 Sparks" — and a
    // case-sensitive `spark` walked straight past every capitalised claim while
    // reporting the file checked. Lowering the mode name too is safe: each of Plan,
    // Agent and Super Agent is a distinct word, and the (?<!Super ) guard below is
    // applied to the same lowered text.
    // `[^.]`, NOT `[^.\n]`. The class excluded newlines, so it could only ever see a cost
    // written on the same line as its mode name — which is how prose puts it and is NOT
    // how structured copy does. The landing lists `name: 'Agent',` and `tag: '4 sparks',`
    // on consecutive lines, and adding that file to this list caught nothing at all until
    // this changed; a deliberate '3 Sparks' drift passed. The sentence-ending period is
    // still the boundary, so a claim cannot run into the next one, and the window is 60
    // rather than 40 to cover the intervening key.
    const re = new RegExp(`${guard}\\b${mode}[^.]{0,60}?\\b(\\d+) spark`, 'gi');
    for (const m of text.matchAll(re)) {
      if (Number(m[1]) !== expected) {
        problems.push(`${file}: "${m[0].trim()}" — ${mode} costs ${expected} spark(s)`);
      }
    }
  }
}

// THE APP'S OWN FIGURE. The composer renders `MODE_INFO[...].typicalSparks` as
// "Typically N Sparks", so the app makes the same claim the site does and had drifted
// from it in the same direction: Plan read "~1" where every measured Plan question is
// 2 sparks, and Agent read "2-15" against a measured 4-18. The site and the app must
// agree with COST-MODEL, not merely with each other.
/**
 * Comments stripped. This is the fourth guard in one session to be fooled by prose
 * describing the very thing it forbids — the sparksPerRequest check below matched the
 * comment that explains why sparksPerRequest was removed. A guard that reads source text
 * must read the source, not the commentary on it.
 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const shared = stripComments(read('packages/shared/src/index.ts'));
const SPECIALIST = { Plan: 'clay', Agent: 'stone', 'Super Agent': 'rune' };
const RANGE = {
  Plan: ['Clay question (Studio attached)'],
  Agent: [
    'Stone, targeted edit + read-back verify in Studio',
    'Stone, full build + edit + verify in Studio',
  ],
};
for (const [mode, rows] of Object.entries(RANGE)) {
  const sparks = rows.map((r) => neuronsFor(r)).filter((n) => n !== null).map(sparksFor);
  if (sparks.length === 0) continue;
  const lo = Math.min(...sparks);
  const hi = Math.max(...sparks);
  const want = lo === hi ? String(lo) : `${lo}-${hi}`;
  const line = new RegExp(`${SPECIALIST[mode]}: \\{[^}]*typicalSparks: '([^']+)'`).exec(shared);
  if (!line) {
    problems.push(`packages/shared has no typicalSparks for ${SPECIALIST[mode]}`);
  } else if (line[1] !== want) {
    problems.push(`MODE_INFO.${SPECIALIST[mode]}.typicalSparks is '${line[1]}'; COST-MODEL gives '${want}' for ${mode}`);
  }
}

// The dead constant must not come back: nothing charges from it, and its comment used
// to say otherwise.
if (/sparksPerRequest/.test(shared)) {
  problems.push('packages/shared names sparksPerRequest again — the worker charges 1 upfront and settles from neurons');
}

// WHEN the quota resets. A rolling per-account window and a fixed midnight are
// different promises, and the site made the wrong one.
const quota = read('apps/worker/src/do/quota.ts');
const fixedMidnight = /setUTCHours\(24, ?0, ?0, ?0\)/.test(quota);
for (const file of ['apps/site/src/pages/pricing.astro', 'apps/site/src/pages/docs/sparks-and-limits.astro']) {
  const text = read(file);
  if (fixedMidnight && /rolling[^.]{0,30}(24|clock)/i.test(text)) {
    problems.push(`${file} describes a rolling reset window; QuotaDO resets at a fixed midnight UTC`);
  }
  if (fixedMidnight && !/midnight UTC/.test(text)) {
    problems.push(`${file} does not say when the quota resets; QuotaDO resets at midnight UTC`);
  }
}

if (problems.length) {
  console.error(`check-spark-figures: ${problems.length} disagreement(s) between the site and the worker\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`check-spark-figures: ${MODES.length} modes agree — COST-MODEL neurons, the worker's arithmetic, the page and the calculator`);
console.log(
  `  requests/free day: ${derived} of ${MODES.length} derived from PLAN_LIMITS at build time, ` +
  `${stated} stated and checked against ${freeDay} Sparks/day`,
);
