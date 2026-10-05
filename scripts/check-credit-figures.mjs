/**
 * THE PRICE THE SITE PUBLISHES MUST BE THE PRICE THE WORKER CHARGES.
 *
 * Credits are charged by `creditsForNeurons(n) = max(1, ceil(n / NEURONS_PER_CREDIT))` in
 * apps/worker/src/pricing.ts, against neuron figures measured in docs/COST-MODEL.md.
 * The pricing page states a per-mode cost and a "requests per free day" derived from it.
 * Nothing connected the two, and they had drifted:
 *
 *   Plan is 37-43 neurons. ceil(43/30) = 2 credits. The page said 1, and 60 requests a
 *   free day when it is 30. Agent (111 -> 4) and Agent (297 -> 10) were both correct,
 *   which is what makes Plan an arithmetic slip rather than a different pricing model.
 *
 * The same number lived in three more places inside CreditMeter.astro — the visible
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
 * exercise, through the real product path — consumed 60 Credits and did not finish, against
 * a published "Agent · 4 credits" that this file happily reports as agreeing. The 4 is
 * `ceil(111 / 30)` from the "targeted edit" row, and COST-MODEL's largest Agent row is 511
 * neurons where that run was roughly 1,800. See BLOCKERS.md and
 * evidence/2026-09-02-second-creation-exercise.md.
 *
 * A guard that says "these agree" is not a guard that says "this is true".
 *
 * THE CREDIT UNIT CHANGED (M2, 2026-10-04), AND SO DID WHAT THIS CHECKS ABOUT THE PAGE. A credit is
 * now INTERNAL_PER_CREDIT ledger units (the unit `creditsForNeurons` counts in) and $0.05 of AI
 * compute, and every figure a person is quoted lives once in PLAN_TABLE and BUILD_COSTS in
 * packages/shared. The ledger-unit chain above (COST-MODEL -> MODE_INFO -> the worker) is still
 * checked exactly as before, because the engine still counts in ledger units. What is new is the
 * second half: the credit unit equals the neuron arithmetic, the site and the app quote credits from
 * the plan table and never a ledger-unit figure, and the pricing page reads the config instead of
 * restating it. The per-request table and its requests-a-free-day arithmetic are gone with the
 * figures they derived, so are the checks that pinned them.
 *
 * Usage: node scripts/check-credit-figures.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { unusedNames } from './lib/config-reads.mjs';
import {
  BUILD_COSTS,
  CREDIT_USD,
  CREDITS_PER_BUILD,
  INTERNAL_PER_CREDIT,
  NEURONS_PER_CREDIT,
  PLAN_LIMITS,
  PLAN_TABLE,
  PLAN_IDS,
  TYPICAL_BUILD_CREDITS,
} from '../packages/shared/src/index.ts';
import { USD_PER_NEURON } from '../apps/worker/src/pricing.ts';

const root = new URL('..', import.meta.url).pathname;
const read = (p) => readFileSync(root + p, 'utf8');
/** Read a file that may legitimately be absent. Absence is a state, not a crash. */
const readMaybe = (p) => (existsSync(root + p) ? readFileSync(root + p, 'utf8') : null);

const pricing = read('apps/worker/src/pricing.ts');
const costModel = read('docs/COST-MODEL.md');
const page = read('apps/site/src/pages/pricing.astro');
const METER_PATH = 'apps/site/src/components/CreditMeter.astro';
const meter = readMaybe(METER_PATH);

/**
 * WHETHER THE CALCULATOR IS ON A PAGE AT ALL — asked because the answer was no and this file said
 * otherwise. Its success line ended "the page and the calculator" unconditionally, and nothing has
 * imported CreditMeter.astro since the usage explorer was pulled off /pricing (eac3f01): a quarter
 * of what this guard claimed to have verified was a component no customer can reach. A guard that
 * names a surface is making a claim about the PRODUCT, not about the file system, and an
 * unrendered component is not a surface.
 *
 * The figures in it are still checked — an orphan that drifts is an orphan nobody can safely
 * re-import — but they are reported as what they are. Derived, never typed: re-import the component
 * and the line goes back to claiming it, with no edit here.
 *
 * check-deadends.mjs cannot catch this: its candidate set is *.ts/*.tsx/*.mjs/*.js and .astro files
 * are only ever importers there, so an orphaned .astro component is structurally invisible to it.
 */
const astroFiles = (dir) =>
  readdirSync(root + dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => `${e.parentPath}/${e.name}`.slice(root.length));
const renderers = [...astroFiles('apps/site/src/pages'), ...astroFiles('apps/site/src/layouts')];
const meterIsRendered = meter !== null && renderers.some((f) => read(f).includes('components/CreditMeter.astro'));

const problems = [];
/** Config reads the pricing page was actually seen to make. Not "no typed figure found". */
let derived = 0;

// BOTH FIGURES ARE IMPORTED, NOT PARSED OUT OF SOURCE TEXT. This used to read `NEURONS_PER_CREDIT = 30`
// and `free: { creditsPerDay: N` with regexes, and each time the declaration moved (to the shared
// package, then into the plan table) the regex stopped matching and the guard exited 1 with "could not
// read". It failing loudly was the only reason that was cheap to find; importing the values makes the
// move invisible instead, and the guard below still refuses to run on a number that is not a number.
// `freeDay` is in LEDGER units, the same unit `perCredit` neurons make up.
const perCredit = NEURONS_PER_CREDIT;
const freeDay = PLAN_LIMITS.free.creditsPerDay;
const shared_ = read('packages/shared/src/index.ts');
if (!Number.isFinite(perCredit) || !Number.isFinite(freeDay) || !perCredit || !freeDay) {
  console.error(
    'check-credit-figures: NEURONS_PER_CREDIT or PLAN_LIMITS.free.creditsPerDay (packages/shared) is not a ' +
    'usable number. One of them moved; follow it.',
  );
  process.exit(1);
}
const creditsFor = (n) => Math.max(1, Math.ceil(n / perCredit));

/** The highest neuron figure on a COST-MODEL row whose label starts with `label`. */
function neuronsFor(label) {
  const row = costModel.split('\n').find((l) => l.startsWith(`| ${label}`) || l.startsWith(`| **${label}`));
  if (!row) return null;
  // "37–43" or "111" or "**511**"
  const cell = row.split('|')[2].replace(/\*/g, '').trim();
  const numbers = cell.split(/[–-]/).map((x) => Number(x.trim())).filter((n) => Number.isFinite(n));
  return numbers.length ? Math.max(...numbers) : null;
}

// There is one kind of request (V3 G01): MODE_INFO has a single `agent` entry, read directly.
const modeInfoAt = shared_.indexOf('export const MODE_INFO');
const modeInfoEnd = modeInfoAt >= 0 ? shared_.indexOf('\n};', modeInfoAt) : -1;
const modeInfo = modeInfoAt >= 0 && modeInfoEnd > modeInfoAt ? shared_.slice(modeInfoAt, modeInfoEnd + 3) : '';
if (!modeInfo) {
  console.error('check-credit-figures: could not read MODE_INFO from packages/shared/src/index.ts. One of them moved; follow it.');
  process.exit(1);
}
const modeField = (key, field) =>
  new RegExp(`\\n  ${key}: \\{[\\s\\S]*?\\b${field}: '([^']+)'`).exec(modeInfo)?.[1] ?? null;
const ROW_FOR = {
  agent: 'Agent, targeted edit + read-back verify in Studio',
};
const MODES = [{ key: 'agent', mode: modeField('agent', 'name'), row: ROW_FOR.agent }];
if ( MODES.some((m) => !m.mode || !m.row)) {
  console.error(`check-credit-figures: could not resolve every ProductMode to a COST-MODEL row: ${JSON.stringify(MODES)}`);
  process.exit(1);
}

for (const { key, mode, row } of MODES) {
  const neurons = neuronsFor(row);
  if (neurons === null) {
    problems.push(`COST-MODEL.md has no row \"${row}\" — the ${mode} figure cannot be derived`);
    continue;
  }
  const expected = creditsFor(neurons);
  const published = modeField(key, 'typicalCredits');
  if (published === null) {
    problems.push(`packages/shared MODE_INFO has no typicalCredits for ${key} — the ${mode} figure has no source`);
  } else {
    const low = Number(published.split('-')[0]);
    if (low !== expected) {
      problems.push(`MODE_INFO.${key}.typicalCredits starts at ${low} for ${mode}; ${neurons} neurons / ${perCredit} = ${expected}`);
    }
  }
  // The calculator's own figures are checked only while the calculator exists. When it does not,
  // there is nothing to bind to MODE_INFO and no literal to re-introduce — and a check that read a
  // missing file would be the crash this guard used to end on, which reported nothing at all.
  if (meter !== null) {
    const creditVar = `${key.toUpperCase()}_CREDITS`;
    if (!new RegExp(`const ${creditVar} = entryCredits\\('${key}'\\)`).test(meter)) {
      problems.push(`CreditMeter does not derive ${mode} from MODE_INFO`);
    }
    const ctlAt = meter.indexOf(`data-mode=\"${key}\"`);
    const ctl = ctlAt >= 0 ? meter.slice(ctlAt, ctlAt + 1400) : '';
    if (!ctl.includes(`${mode} · {${creditVar}} credits`)) problems.push(`CreditMeter label for ${mode} is not bound to ${creditVar}`);
    if (!ctl.includes(`data-cost={${creditVar}}`)) problems.push(`CreditMeter data-cost for ${mode} is not bound to ${creditVar}`);
  }
}

// The calculator must not reintroduce a literal cost.
if (meter !== null && /perDay = c \* \d/.test(meter)) {
  problems.push('CreditMeter computes a mode cost from a literal again instead of reading data-cost');
}

// EVERY page that states a per-mode cost, not just the pricing table. The wrong Plan
// figure turned out to be repeated in six places across the docs, the changelog and the
// docs layout's own footer — each of them a sentence a reader would plan around.
//[[ THE LIST IS THE SITE'S OWN SOURCE TREE, walked, not typed (2026-09-23).
//
//   It was six hand-written paths. A page that begins stating a per-mode cost had to be added here
//   by hand or it was the one page free to drift, and the landing was that page once already. Every
//   .astro file under apps/site/src is read now — pages, layouts and components — so a new page or
//   component is checked the day it exists. Comments are stripped first: a scanner that reads prose
//   will otherwise find its own explanation of a fix and report it as a figure. ]]
const siteSources = astroFiles('apps/site/src');
if (siteSources.length < 20) {
  console.error(`check-credit-figures: only ${siteSources.length} .astro files under apps/site/src — the walk is wrong, and the prose check would check nothing`);
  process.exit(1);
}
const PROSE = siteSources;
const stripMarkupComments = (src) =>
  src.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

//[[ THE SITE NO LONGER STATES A PER-REQUEST COST AT ALL (M2).
//
//   "Agent costs 4 credits" was a ledger-unit figure printed as a credit, and a credit is now 150
//   ledger units, so the sentence would be wrong by a factor of 150 in the unit people read. The
//   pricing page quotes what a BUILD costs, in credits, from BUILD_COSTS. Any "<mode> ... N credits"
//   claim left in a site source is therefore stale by construction, whatever N is, and is reported.
//   Comments are stripped first, for the reason written above. ]]
for (const file of PROSE) {
  let text;
  try {
    text = stripMarkupComments(read(file));
  } catch {
    problems.push(`${file} is listed here but does not exist — update this list`);
    continue;
  }
  for (const { mode } of MODES) {
    // `gi`: the unit is a proper noun in product copy — "2 Credits" — and a case-sensitive `credit`
    // would walk straight past every capitalised claim. `[^.]`, NOT `[^.\n]`: structured copy puts
    // the cost on the line after the name (`name: 'Agent',` then `tag: '4 credits',`).
    const re = new RegExp(`\\b${mode}[^.]{0,60}?\\b(\\d+) credit`, 'gi');
    for (const m of text.matchAll(re)) {
      problems.push(`${file}: "${m[0].trim()}" — a per-request cost in ledger units; the site quotes builds, in credits (BUILD_COSTS)`);
    }
  }

  // THE SITE QUOTES CREDITS, NEVER LEDGER UNITS. These four are ledger-unit figures (PLAN_LIMITS is
  // the table QuotaDO enforces, CREDITS_PER_BUILD and BUILD_NEURONS are the engine's own accounting,
  // MODE_INFO.typicalCredits is a per-run range in the same unit). Printed on a page they read as
  // credits and are INTERNAL_PER_CREDIT times too large.
  for (const [name, re] of [
    ['PLAN_LIMITS', /\bPLAN_LIMITS\b/],
    ['CREDITS_PER_BUILD', /\bCREDITS_PER_BUILD\b/],
    ['BUILD_NEURONS', /\bBUILD_NEURONS\b/],
    ['MODE_INFO', /\bMODE_INFO\b/],
  ]) {
    if (re.test(text)) problems.push(`${file} reads ${name}, a ledger-unit figure; the site quotes credits from PLAN_TABLE and BUILD_COSTS`);
  }
}

// THE APP'S OWN FIGURE. MODE_INFO is the only ProductMode price table, and its published ranges
// must agree with the measured Plan/Agent rows.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const shared = stripComments(read('packages/shared/src/index.ts'));
const RANGE = {
  agent: [
    'Agent, targeted edit + read-back verify in Studio',
    'Agent, full build + edit + verify in Studio',
  ],
};
for (const { key, mode } of MODES) {
  const rows = RANGE[key] ?? [];
  const credits = rows.map((r) => neuronsFor(r)).filter((n) => n !== null).map(creditsFor);
  if (credits.length === 0) continue;
  const lo = Math.min(...credits);
  const hi = Math.max(...credits);
  const want = lo === hi ? String(lo) : `${lo}-${hi}`;
  const actual = modeField(key, 'typicalCredits');
  if (actual === null) problems.push(`packages/shared has no typicalCredits for ${key}`);
  else if (actual !== want) problems.push(`MODE_INFO.${key}.typicalCredits is '${actual}'; COST-MODEL gives '${want}' for ${mode}`);
}

// THE MILESTONE PRICE MUST BE DERIVED, NOT TYPED.
//
// The roadmap card shows a mileagent's cost as a Credit range: `runs × the mode's typical
// Credits`. That is a fourth surface for a number this file already tracks through three, and
// the whole reason this guard exists is that the same figure, typed into more than one place,
// drifted in three of them inside a single component.
//
// So what is checked is not the arithmetic — mileagent-credits.test.mjs does that — but that
// there is still only ONE place a price is written down. `creditRangeForRuns` must read
// MODE_INFO, and must not contain a published figure of its own; roadmap.ts must call it rather
// than multiply by hand.
const rangeFn = shared.slice(shared.indexOf('export function creditRangeForRuns'));
if (!rangeFn || rangeFn === shared) {
  problems.push('packages/shared no longer exports creditRangeForRuns — the roadmap card has no derivation to use');
} else {
  const body = rangeFn.slice(0, rangeFn.indexOf('\n}\n'));
  if (!/MODE_INFO\[/.test(body)) {
    problems.push('creditRangeForRuns does not read MODE_INFO — the mileagent price is a second copy free to drift');
  }
  // Only the MULTI-DIGIT published figures are searched for, and the single-digit ones are
  // deliberately not. `2` and `4` are indistinguishable from the arity literals a parser
  // legitimately contains (`parts.length > 2`), so looking for them finds the parser and reports
  // it as a hard-coded price — which is how this check first went red against correct code. The
  // limitation is stated rather than papered over: a hard-coded '2' here would not be caught by
  // this line, and mileagent-credits.test.mjs is what would catch the wrong answer it produced.
  const published = new Set();
  for (const mode of ['agent']) {
    const line = new RegExp(`${mode}: \\{[^}]*typicalCredits: '([^']+)'`).exec(shared);
    for (const n of (line?.[1] ?? '').split('-')) if (n.trim().length >= 2) published.add(n.trim());
  }
  if (published.size === 0) {
    problems.push('no multi-digit typicalCredits figure was parsed, so the hard-coding check below is vacuous');
  }
  for (const n of published) {
    if (new RegExp(`\\b${n}\\b`).test(body)) {
      problems.push(`creditRangeForRuns hard-codes the published figure ${n}; it must read it from MODE_INFO`);
    }
  }
}

//[[ THE CREDIT UNIT, AND THE PAGE THAT QUOTES IT (M2, 2026-10-04).
//
//   The previous block here existed because /pricing published a REQUEST price ("4 credits", "~57 a
//   free day") a hundred lines above a BUILD price ("77 credits", "3 a free day"): both measured, both
//   true, 19x apart on the one question the owner asked. The cure was to make the page say which unit
//   each was in. The cure now is that there is one: the page quotes what a build costs in credits and
//   one credit is a fixed amount of compute, so what is checked is that chain.
//
//   1. THE UNIT. A credit is INTERNAL_PER_CREDIT ledger units of NEURONS_PER_CREDIT neurons, priced at
//      the neuron rate in apps/worker/src/pricing.ts. That must come to CREDIT_USD less at most the
//      1% the round figure gives away, or the page's "about $0.05 of AI compute" is a claim the
//      arithmetic does not make.
//   2. THE SMALLEST BUILD. CREDITS_PER_BUILD ledger units is the quality-gated build the engine
//      measures, and BUILD_COSTS.small is what the page calls a small build. They are the same
//      build in two units and must agree to a hundredth of a credit.
//   3. THE BUILD COUNTS. "About N builds" is typed from the pricing doc, so it may only understate
//      what the typical build's cost allows: N <= floor(credits / TYPICAL_BUILD_CREDITS).
//   4. THE PAGE READS THE CONFIG. pricing.astro must import PLAN_TABLE, BUILD_COSTS, CREDIT_USD and
//      TYPICAL_BUILD_CREDITS and render them; a page that stops reading them has typed a number. The
//      ledger-unit names it must not read are refused for every site source above.
const small = BUILD_COSTS.find((b) => b.id === 'small');
const dollarsPerCredit = INTERNAL_PER_CREDIT * NEURONS_PER_CREDIT * USD_PER_NEURON;
if (!(dollarsPerCredit <= CREDIT_USD) || CREDIT_USD - dollarsPerCredit > CREDIT_USD * 0.011) {
  problems.push(
    `${INTERNAL_PER_CREDIT} ledger units x ${NEURONS_PER_CREDIT} neurons x $${USD_PER_NEURON} is $${dollarsPerCredit.toFixed(5)}, ` +
    `not within 1.1% below the decided $${CREDIT_USD} a credit`,
  );
}
if (!small || Math.abs(CREDITS_PER_BUILD / INTERNAL_PER_CREDIT - small.creditsLow) > 0.01) {
  problems.push(
    `a quality-gated build is ${CREDITS_PER_BUILD} ledger units = ${(CREDITS_PER_BUILD / INTERNAL_PER_CREDIT).toFixed(3)} credits, ` +
    `but BUILD_COSTS.small starts at ${small?.creditsLow}`,
  );
}
for (const id of PLAN_IDS) {
  const most = Math.floor(PLAN_TABLE[id].creditsPerMonth / TYPICAL_BUILD_CREDITS);
  if (PLAN_TABLE[id].approxBuilds > most) {
    problems.push(`${id} promises ${PLAN_TABLE[id].approxBuilds} builds a month; ${PLAN_TABLE[id].creditsPerMonth} credits at ${TYPICAL_BUILD_CREDITS} a build buy at most ${most}`);
  }
}
const pageSrc = stripComments(page);
// A USE, not the import line: `unusedNames` takes comments and import statements out first.
const CONFIG_NAMES = ['PLAN_TABLE', 'BUILD_COSTS', 'CREDIT_USD', 'TYPICAL_BUILD_CREDITS'];
const notUsed = unusedNames(page, CONFIG_NAMES);
derived += CONFIG_NAMES.length - notUsed.length;
for (const name of notUsed) problems.push(`pricing.astro no longer reads ${name} from packages/shared (only imports it, if that), so a figure on it is typed`);
if (/\b\d[\d,.]*\s+Credits?\b/.test(pageSrc.replace(/\{[^}]*\}/g, ''))) {
  problems.push('pricing.astro types a Credit figure into its copy instead of reading the plan table');
}

const roadmapSrc = stripComments(read('apps/worker/src/roadmap.ts'));
if (/creditsLow:/.test(roadmapSrc) && !/creditRangeForRuns\(/.test(roadmapSrc)) {
  problems.push('apps/worker/src/roadmap.ts sets a mileagent credit figure without going through creditRangeForRuns');
}

// The dead constant must not come back: nothing charges from it, and its comment used
// to say otherwise.
if (/creditsPerRequest/.test(shared)) {
  problems.push('packages/shared names creditsPerRequest again — the worker charges 1 upfront and settles from neurons');
}

// WHEN the quota resets. A rolling per-account window and a fixed midnight are
// different promises, and the site made the wrong one.
const quota = read('apps/worker/src/do/quota.ts');
const fixedMidnight = /setUTCHours\(24, ?0, ?0, ?0\)/.test(quota);
for (const file of ['apps/site/src/pages/pricing.astro', 'apps/site/src/pages/docs/credits-and-limits.astro']) {
  const text = read(file);
  if (fixedMidnight && /rolling[^.]{0,30}(24|clock)/i.test(text)) {
    problems.push(`${file} describes a rolling reset window; QuotaDO resets at a fixed midnight UTC`);
  }
  if (fixedMidnight && !/midnight UTC/.test(text)) {
    problems.push(`${file} does not say when the quota resets; QuotaDO resets at midnight UTC`);
  }
}

if (problems.length) {
  console.error(`check-credit-figures: ${problems.length} disagreement(s) between the site and the worker\n`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(
  `check-credit-figures: ${MODES.length} modes agree — COST-MODEL neurons, the worker's arithmetic, ` +
  `the page${meterIsRendered ? ' and the calculator' : ''}`,
);
if (!meterIsRendered) {
  // Not a failure: every SHIPPED surface in that list is still verified, and no figure a customer
  // plans around is unchecked. It is printed because the alternative — checking the component
  // silently and counting it in the sentence — is the over-claim this guard exists to prevent
  // elsewhere.
  //
  // TWO REASONS IT CAN BE FALSE, and they are different things. The component can exist and be
  // imported by nothing — the orphan this notice was written for, whose file carried retired plan
  // vocabulary and had to be wired back or deleted. Or it can be GONE, which is what happened:
  // the minimal site rebuild deleted it, and the previous wording told the reader to "wire it back
  // or delete it" without noticing the second had already been done. A file that does not exist
  // has no figures to check and no drift to report, so the run says which of the two it found.
  console.log(
    meter === null
      ? `  ${METER_PATH} no longer exists — the calculator was deleted, so this run verified no ` +
        `calculator. Nothing is unchecked: every figure it carried is either gone with it or is ` +
        `stated on /pricing, which IS checked above.`
      : `  ${METER_PATH} was checked too, and NOTHING RENDERS IT — ` +
        `no page or layout under apps/site/src imports it, so its figures ship to nobody. ` +
        `Wire it back or delete it; until then this run verified no calculator.`,
  );
}
console.log(
  `  plan figures: ${derived} config reads on /pricing; a free day is ${PLAN_TABLE.free.creditsPerDay} credits ` +
  `(${freeDay} ledger units), a month ${PLAN_TABLE.free.creditsPerMonth}`,
);
// Printed rather than assumed: a unit check that compared nothing has checked nothing, and the figures
// are the only thing that tells the two apart from the outside.
console.log(
  `  credit unit: 1 credit = ${INTERNAL_PER_CREDIT} ledger units = $${dollarsPerCredit.toFixed(4)} of compute ` +
  `(decided $${CREDIT_USD}); a typical build is ${TYPICAL_BUILD_CREDITS} credits`,
);
