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
 * Usage: node scripts/check-credit-figures.mjs
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';

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
/** Modes whose requests-per-free-day is computed by the page rather than typed into it. */
let derived = 0;
/** Modes whose stated figure was actually parsed and compared. Not "not derived". */
let stated = 0;

// NEURONS_PER_CREDIT HAS NOW DONE EXACTLY WHAT PLAN_LIMITS DID BELOW: it moved to the shared
// package, leaving `export { NEURONS_PER_CREDIT } from '@golem/shared'` in pricing.ts, and the
// regex that read `NEURONS_PER_CREDIT = 30` there stopped matching. The guard said so and exited 1,
// which is the whole reason it is written to fail loudly on a missing declaration rather than
// treating an unparsed number as zero — the second time this move has happened and the second time
// nothing was silently mis-verified. Read it where it is DECLARED, which is the shared package, and
// the `= (\d+)` shape still refuses a re-export.
const perCredit = Number(/NEURONS_PER_CREDIT = (\d+)/.exec(read('packages/shared/src/index.ts'))?.[1]);

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
const freeDay = Number(/free: \{ creditsPerDay: ([\d_]+)/.exec(shared_)?.[1].replace(/_/g, ''));
if (!perCredit || !freeDay) {
  console.error(
    'check-credit-figures: could not read NEURONS_PER_CREDIT or PLAN_LIMITS.free.creditsPerDay ' +
    '(both packages/shared/src/index.ts). One of them moved; follow it.',
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

// ProductMode is the only run-mode contract. Read the two keys and their published values directly
// from MODE_INFO; there is no specialist translation layer and Autonomous is not a third mode.
const productModes = /export const PRODUCT_MODES: readonly ProductMode\[\] = \[([^\]]*)\]/.exec(shared_)?.[1];
const modeInfoAt = shared_.indexOf('export const MODE_INFO');
const modeInfoEnd = modeInfoAt >= 0 ? shared_.indexOf('\n};', modeInfoAt) : -1;
const modeInfo = modeInfoAt >= 0 && modeInfoEnd > modeInfoAt ? shared_.slice(modeInfoAt, modeInfoEnd + 3) : '';
if (!productModes || !modeInfo) {
  console.error('check-credit-figures: could not read PRODUCT_MODES or MODE_INFO from packages/shared/src/index.ts. One of them moved; follow it.');
  process.exit(1);
}
const modeField = (key, field) =>
  new RegExp(`\\n  ${key}: \\{[\\s\\S]*?\\b${field}: '([^']+)'`).exec(modeInfo)?.[1] ?? null;
const ROW_FOR = {
  plan: 'Plan question (Studio attached)',
  agent: 'Agent, targeted edit + read-back verify in Studio',
};
const MODES = [...productModes.matchAll(/'(plan|agent)'/g)].map((m) => ({
  key: m[1],
  mode: modeField(m[1], 'name'),
  row: ROW_FOR[m[1]],
}));
if (MODES.length !== 2 || MODES.some((m) => !m.mode || !m.row)) {
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
  if (!/PRODUCT_MODES\.map/.test(page) || !/const info = MODE_INFO\[mode\]/.test(page)) {
    problems.push('pricing.astro no longer derives its ProductMode rows from PRODUCT_MODES + MODE_INFO');
  }
  if (!/perDay: perFreeDay\(r\.cost\)/.test(page)) {
    problems.push('pricing.astro no longer derives requests-per-free-day from the same mode cost');
  } else {
    derived += 1;
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

const expectedFor = {};
for (const { mode, row } of MODES) {
  const n = neuronsFor(row);
  if (n !== null) expectedFor[mode] = creditsFor(n);
}

for (const file of PROSE) {
  let text;
  try {
    text = stripMarkupComments(read(file));
  } catch {
    problems.push(`${file} is listed here but does not exist — update this list`);
    continue;
  }
  for (const [mode, expected] of Object.entries(expectedFor)) {
    // "Plan — 3 credits", "Plan: 3 credits", "Plan</strong> (3 credits", "Plan ... for 3 credits".
    //
    const guard = '';
    // `gi`, not `g`. The unit is a proper noun in product copy — "2 Credits" — and a
    // case-sensitive `credit` would walk straight past every capitalised claim.
    // `[^.]`, NOT `[^.\n]`. The class excluded newlines, so it could only ever see a cost
    // written on the same line as its mode name — which is how prose puts it and is NOT
    // how structured copy does. The landing lists `name: 'Agent',` and `tag: '4 credits',`
    // on consecutive lines, and adding that file to this list caught nothing at all until
    // this changed; a deliberate '3 Credits' drift passed. The sentence-ending period is
    // still the boundary, so a claim cannot run into the next one, and the window is 60
    // rather than 40 to cover the intervening key.
    const re = new RegExp(`${guard}\\b${mode}[^.]{0,60}?\\b(\\d+) credit`, 'gi');
    for (const m of text.matchAll(re)) {
      if (Number(m[1]) !== expected) {
        problems.push(`${file}: "${m[0].trim()}" — ${mode} costs ${expected} credit(s)`);
      }
    }
  }
}

// THE APP'S OWN FIGURE. MODE_INFO is the only ProductMode price table, and its published ranges
// must agree with the measured Plan/Agent rows.
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const shared = stripComments(read('packages/shared/src/index.ts'));
const RANGE = {
  plan: ['Plan question (Studio attached)'],
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
  for (const mode of ['plan', 'agent', 'agent']) {
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

//[[ A REQUEST IS NOT A BUILD, AND THE PAGE PUBLISHED BOTH AS IF THEY WERE.
//
//   /pricing carried `Apple Max · 4 credits · "Builds features across your project" ·
//   ~57 requests a free day` about a hundred lines under `One build costs about 77 Credits`, which
//   the plan cards turn into three builds a free day and thirty a month. Both figures are measured
//   and neither is wrong: the 4 is ceil(111/30) from COST-MODEL's *Agent, targeted edit +
//   read-back verify in Studio*, and the 77 is ceil(2300/30) from BUILD_NEURONS.qualityGated. What
//   was wrong was publishing them in the same unit-less breath, so a buyer dividing the free
//   allowance got 57 builds a day where the product delivers 3 — 19x, on the one question the
//   owner actually asked ("the exact expected monthly bill at low, medium and heavy usage").
//
//   THE PROPERTY, not the wording: the per-request table and the one-build figure must not imply
//   two different daily counts for the same work. A mode may price a request at anything it likes
//   as long as it SAYS what that request was; the moment its declared unit is a build, its price
//   has to be the build price, or the page is publishing 231/cost builds a day and 231/77 builds a
//   day at once.
//
//   ONLY OFFERED MODES. `agent` declares a build at 10 Credits and is deliberately not checked
//   here, because it is withdrawn from PRODUCT_MODES. COST-MODEL measures its build at 297
//   neurons and BUILD_NEURONS measures the quality-gated one at 2,300; whoever re-offers that mode
//   has to reconcile those before publishing either, and this guard going red on that day is the
//   reason it is written against the offered list rather than against all three.
//
//   READ OFF THE STRIPPED SOURCE. The comment that explains this defect in packages/shared names
//   every string below — "claims a build", "CREDITS_PER_BUILD" — and a prose-reading scanner would
//   report the explanation of the fix as the defect. That has happened four times in this
//   repository already. ]]
const creditsPerBuild = Number(/CREDITS_PER_BUILD = (\d+)/.exec(shared)?.[1]);
if (!creditsPerBuild) {
  console.error(
    'check-credit-figures: could not read CREDITS_PER_BUILD from packages/shared/src/index.ts. '
    + 'It moved; follow it rather than letting the request-vs-build check pass vacuously.',
  );
  process.exit(1);
}
const buildsFreeDay = Math.floor(freeDay / creditsPerBuild);
/** Modes whose declared entry unit was actually parsed. Not "not missing". */
let unitsChecked = 0;
for (const { key, mode } of MODES) {
  const unit = modeField(key, 'entryUnit');
  if (unit === undefined) {
    problems.push(
      `MODE_INFO.${key} has no entryUnit — the ${mode} row publishes a Credit cost and a `
      + 'requests-per-day count with no statement of what one request is, which is the shape that '
      + `let "${mode} builds features" sit beside a per-request price`,
    );
    continue;
  }
  unitsChecked += 1;
  const neurons = neuronsFor(ROW_FOR[key]);
  if (neurons === null) continue;
  const cost = creditsFor(neurons);
  // `\bbuild` catches build, builds, building. A mode that says it builds at its entry price is
  // making the same daily-count claim CREDITS_PER_BUILD makes, and the two must agree.
  if (/\bbuild/i.test(unit) && cost !== creditsPerBuild) {
    problems.push(
      `MODE_INFO.${specialist}.entryUnit says "${unit}" at ${cost} Credits, so the per-request `
      + `table implies ${Math.floor(freeDay / cost)} builds a free day while CREDITS_PER_BUILD `
      + `(${creditsPerBuild}) implies ${buildsFreeDay}. Price the build at ${creditsPerBuild}, or `
      + 'name the smaller piece of work the entry price was measured on.',
    );
  }
}
if (unitsChecked === 0) {
  problems.push('no entryUnit was parsed for any offered mode, so the request-vs-build check is vacuous');
}

// AND THE PAGE HAS TO CARRY BOTH. A unit that exists in packages/shared and is not rendered is a
// field, not a disclosure; a build figure the reader has to scroll a hundred lines to find is the
// defect above with an extra step. Both are DERIVED — a typed "3 builds a day" is the literal that
// gets left behind by the next repricing, which is how "30 / 15 / up to 6" survived a fourfold
// change to the free tier.
const pageSrc = stripComments(page);
if (!/const info = MODE_INFO\[mode\]/.test(pageSrc) || !/unit: info\.entryUnit/.test(pageSrc)) {
  problems.push('pricing.astro does not read MODE_INFO.entryUnit — the per-request table states a price and a per-day count with no unit between them');
}
if (!/\{r\.unit\}/.test(pageSrc)) {
  problems.push('pricing.astro reads entryUnit and never renders it — the disclosure ships to nobody');
}
if (!/buildsPerDay\('free'\)/.test(pageSrc) || !/CREDITS_PER_BUILD/.test(pageSrc)) {
  problems.push(
    'pricing.astro does not derive builds-per-free-day from CREDITS_PER_BUILD beside the '
    + 'per-request table — the reader is left to reconcile requests and builds themselves, which '
    + 'is the arithmetic that came out 19x wrong',
  );
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
  `  requests/free day: ${derived} of ${MODES.length} derived from PLAN_LIMITS at build time, ` +
  `${stated} stated and checked against ${freeDay} Credits/day`,
);
// Printed rather than assumed: a request-vs-build check that parsed no unit has checked nothing,
// and the count is the only thing that tells the two apart from the outside.
console.log(
  `  request vs build: ${unitsChecked} of ${MODES.length} offered modes declare what their entry ` +
  `price bought; a whole build is ${creditsPerBuild} Credits, ${buildsFreeDay} a free day`,
);
