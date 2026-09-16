#!/usr/bin/env node
// SUCCESS METRICS — a report, not a gate.
//
// The owner's checklist names its measures in two places and neither of them has ever been
// computed: section "60. END-TO-END RELEASE ACCEPTANCE" (twenty user-visible outcomes, run here by
// acceptance.mjs) and section "53. PRODUCT ANALYTICS" (twenty named measures). This prints what
// each one actually is, today, against the commit it measured.
//
// THE ONE RULE. A measure this repository cannot compute prints
//
//     not measured, because <reason>
//
// and never a number. Most of section 53 lands there, and that is the finding: the event catalog
// in apps/worker/src/analytics.ts holds request / model_call / error / build / audit and NOT ONE
// product event — no signup, no activation, no pairing, no conversion, no retention — so there is
// nothing behind a funnel figure to compute it from. A funnel number printed anyway would be the
// failure this repository keeps finding: a failure to observe, rendered as an observation.
//
// Where a modelled figure exists and the observed one does not, the reason comes FIRST and the
// model is a clearly-labelled note under it. The two are never swapped.
//
// Exit code is 0 unless the report itself could not be produced. A report that fails the build
// because a number is low is a gate wearing a report's clothes, and the acceptance scenarios in
// `acceptance.test.mjs` are already the gate.
//
// Offline. No model call, no network, no spend.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { APP_FIXTURES, BRIEF, REPO, W, runScenarios } from './acceptance.mjs';

const args = process.argv.slice(2);
const asJson = args.includes('--json');

// ---------------------------------------------------------------------------------------------
// WHAT WAS MEASURED, AND WHEN. A number with no commit under it is a number nobody can re-derive.
// ---------------------------------------------------------------------------------------------
function git(...a) {
  try {
    return execFileSync('git', a, { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}
const commit = git('rev-parse', 'HEAD');
const porcelain = git('status', '--porcelain');
const provenance = {
  measuredAt: new Date().toISOString(),
  commit,
  commitSubject: git('log', '-1', '--format=%s'),
  treeDirty: porcelain === null ? null : porcelain.length > 0,
};

// ---------------------------------------------------------------------------------------------
// THE CHECKLIST, PARSED FROM ITS MARKS.
//
// Not from the header it carries: a total typed at the top of a 3,400-line file disagrees with the
// lines below it the moment one line changes, and this report exists to say which is right.
// ---------------------------------------------------------------------------------------------
const CHECKLIST = readFileSync(join(REPO, BRIEF.file), 'utf8');

function parseChecklist(text) {
  const sections = [];
  let current = null;
  for (const line of text.split('\n')) {
    const head = /^##\s+(\d+)\.\s+(.+?)\s+—/.exec(line);
    if (head) {
      current = { number: Number(head[1]), title: head[2].trim(), items: [] };
      sections.push(current);
      continue;
    }
    const item = /^-\s+\[(.)\]\s+(.+)$/.exec(line);
    if (item && current) current.items.push({ mark: item[1], name: item[2].trim() });
  }
  return sections;
}

const SECTIONS = parseChecklist(CHECKLIST);
const MARK_WEIGHT = { '✓': 1, '~': 0.5, '☐': 0 };

function tally(items) {
  const t = { done: 0, partial: 0, notFound: 0, other: 0 };
  let weight = 0;
  for (const it of items) {
    if (it.mark === '✓') t.done += 1;
    else if (it.mark === '~') t.partial += 1;
    else if (it.mark === '☐') t.notFound += 1;
    else t.other += 1;
    weight += MARK_WEIGHT[it.mark] ?? 0;
  }
  return { ...t, total: items.length, weightedPct: items.length ? (weight / items.length) * 100 : null };
}

const allItems = SECTIONS.flatMap((s) => s.items);
const overall = tally(allItems);
const headerClaim = /\*\*✓\s*(\d+)\s+done\s+·\s+~\s*(\d+)\s+partly built\s+·\s+☐\s*(\d+)\s+not found\s+—\s+weighted\s+([\d.]+)%/.exec(CHECKLIST);

const sectionOf = (n) => SECTIONS.find((s) => s.number === n) ?? null;
const acceptanceSection = sectionOf(60);
const analyticsSection = sectionOf(53);

// ---------------------------------------------------------------------------------------------
// SECTION 53's TWENTY MEASURES.
//
// Keyed by the brief's own item index. The names are read back out of the checklist and compared,
// so renaming an item in the brief shows up here as a mismatch line rather than as a measurement
// quietly attached to the wrong measure.
// ---------------------------------------------------------------------------------------------

/** The events this deployment can actually emit. Everything below is measured against this list. */
const EVENT_KINDS = [...(W.analytics.EVENT_KINDS ?? [])];
const NO_PRODUCT_EVENTS =
  `the event catalog holds only ${EVENT_KINDS.join(', ')} (apps/worker/src/analytics.ts) — ` +
  'no signup, onboarding, pairing, conversion or retention event is emitted anywhere in the tree, ' +
  'so there is nothing to count';
const NO_PRODUCTION_DB =
  'and no production datastore is reachable from this repository: Supabase, D1 and the Durable Object ' +
  'SQL all live behind credentials this report does not have and must not use';

/**
 * A measured figure. `counted` is the things the value counts, supplied wherever they can be
 * enumerated, so `success-metrics.test.mjs` can check the number against the list rather than
 * taking the number's word for it.
 */
const measured = (value, unit, how, counted = null) => ({ state: 'measured', value, unit, how, counted });
const notMeasured = (because, note) => ({ state: 'not-measured', because, note: note ?? null });

const MEASURES = [
  {
    item: 1,
    name: 'Defined analytics event catalog',
    async measure() {
      return measured(
        EVENT_KINDS.length,
        `event kinds (${EVENT_KINDS.join(', ')})`,
        'counted from EVENT_KINDS in apps/worker/src/analytics.ts. Every one is an infrastructure event; none is a product event.',
        EVENT_KINDS,
      );
    },
  },
  {
    item: 2,
    name: 'Event schema validation',
    async measure() {
      return notMeasured(
        'there is no event schema to validate against. apps/worker/src/analytics.ts reads each field defensively ' +
          '(readNumber, readCount, readTimestamp, readText, readEnum) and refuses an unreadable one, which is ' +
          'field-level defence, not an event checked against a declared shape — and a count of defended fields is not ' +
          'a measure of schema conformance',
      );
    },
  },
  { item: 3, name: 'Registration funnel', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Registration happens in Supabase Auth, which the worker never sees, ${NO_PRODUCTION_DB}`); } },
  { item: 4, name: 'Email verification funnel', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Confirmation is a Supabase redirect to /confirm; nothing records the click, ${NO_PRODUCTION_DB}`); } },
  { item: 5, name: 'Onboarding completion funnel', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Onboarding state lives in the browser (apps/web/src/lib/onboarding.ts) and is never sent anywhere`); } },
  { item: 6, name: 'Studio pairing conversion', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Pairing is a Durable Object handshake that emits no analytics event, ${NO_PRODUCTION_DB}`); } },
  { item: 7, name: 'First successful run activation', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. A run writes a model_call event with no per-user first-run marker, ${NO_PRODUCTION_DB}`); } },
  { item: 8, name: 'First verified change activation', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Verification runs only with a Studio connection and records no event at all`); } },
  {
    item: 9,
    name: 'Trial conversion',
    async measure() {
      return notMeasured(
        `there is no trial to convert from: PLAN_LIMITS declares ${W.shared.PLAN_IDS.join(', ')} and none of them is time-limited ` +
          '(packages/shared/src/index.ts) — the free plan is permanent, so a trial-conversion rate is a measure of something this product does not have',
      );
    },
  },
  {
    item: 10,
    name: 'Paid conversion',
    async measure() {
      // Deliberately says nothing about what the DEPLOYED origin answers. This report has not
      // probed it, and a repeated claim about a live endpoint is exactly the kind of inherited
      // number the brief forbids.
      const configured = W.billing.billingConfigured({});
      return notMeasured(
        `${NO_PRODUCT_EVENTS}. Checkout and the Stripe webhook exist in the tree and are gated on billingConfigured() ` +
          `(apps/worker/src/billing.ts), which with no Stripe credential present answers ${configured}; whether the ` +
          `deployed origin has one is not something this report probed, ${NO_PRODUCTION_DB}`,
      );
    },
  },
  { item: 11, name: 'Subscription retention', async measure() { return notMeasured(`retention needs a subscription table read over time, ${NO_PRODUCTION_DB}. Whether any subscription exists is not something this report can see`); } },
  {
    item: 12,
    name: 'Subscription cancellation reasons',
    async measure() {
      return notMeasured(
        'no cancellation reason is ever collected: the product has no cancellation survey, and the Stripe events the worker ' +
          `interprets (${[...(W.dunning.DUNNING_KINDS ?? [])].join(', ')}) carry a status, not a reason`,
      );
    },
  },
  { item: 13, name: 'Cohort retention analysis', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}, and a cohort needs a signup date the worker never sees, ${NO_PRODUCTION_DB}`); } },
  { item: 14, name: 'Feature adoption', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Tool calls are recorded per run, not per feature per user, ${NO_PRODUCTION_DB}`); } },
  { item: 15, name: 'Collaboration adoption', async measure() { return notMeasured(`${NO_PRODUCT_EVENTS}. Membership rows exist in Postgres and are readable only with a credential this report does not have`); } },
  {
    item: 16,
    name: 'Run success trends',
    async measure() {
      return notMeasured(
        `${NO_PRODUCT_EVENTS}. A production run emits a model_call event with cost and latency and no success verdict, ` +
          `${NO_PRODUCTION_DB}`,
        'the nearest thing this repository can compute is the eval harness’s own success rate over ' +
          'packages/evals/results (`node src/score.mjs scorecard latest`). That is models against fixed tasks, not users ' +
          'against the product, and the two must not be quoted as each other.',
      );
    },
  },
  {
    item: 17,
    name: 'Verification success trends',
    async measure() {
      const total = W.tools.toolNames().length;
      const withheld = Object.values(W.tools.TOOLS).filter((t) => t.studio).length;
      return notMeasured(
        `no verification outcome is recorded anywhere: no event kind names a verification (${EVENT_KINDS.join(', ')}), and ` +
          `every tool that could produce one needs a Studio connection — ${withheld} of ${total} tools are marked studio:true ` +
          `and are withheld without one, ${NO_PRODUCTION_DB}`,
      );
    },
  },
  {
    item: 18,
    name: 'Cost per successful run',
    async measure() {
      const credits = W.pricing.CREDITS_PER_BUILD;
      const usd = W.pricing.usdFor(credits * W.pricing.NEURONS_PER_CREDIT);
      return notMeasured(
        `the observed cost needs per-run spend rows joined to a success verdict, and neither exists: ${NO_PRODUCT_EVENTS}, ` +
          `${NO_PRODUCTION_DB}`,
        `from the model, not from users: a quality-gated build is priced at ${credits} Credits ` +
          `(${credits * W.pricing.NEURONS_PER_CREDIT} neurons, about $${usd.toFixed(4)}) by apps/worker/src/pricing.ts. ` +
          'That is what the arithmetic charges, not what a run has cost.',
      );
    },
  },
  {
    item: 19,
    name: 'Permission-aware internal analytics access',
    async measure() {
      const { hitApp, ADMIN_KEY } = APP_FIXTURES;
      const withKey = await hitApp('/api/admin/analytics', { adminKey: ADMIN_KEY });
      const wrongKey = await hitApp('/api/admin/analytics', { adminKey: 'not-the-key' });
      const noKey = await hitApp('/api/admin/analytics');
      const guarded = wrongKey.status === 403 && noKey.status === 403;
      return measured(
        guarded ? 1 : 0,
        `of 1 analytics read routes closed to callers without the admin key (with key ${withKey.status}, wrong key ${wrongKey.status}, no key ${noKey.status})`,
        'measured by driving the real Hono app from apps/worker/src/index.ts. It is a guard on a shared key, not per-person permission: there is one level of internal access, not a matrix.',
      );
    },
  },
  {
    item: 20,
    name: 'Analytics data quality monitoring',
    async measure() {
      // The honesty shape is the only data-quality instrument this deployment has, and it is a
      // real one: every metric carries how many samples it saw and how many it could not read.
      const probe = W.analytics.metric(null, 10, 3, 'unreadable');
      const carries = probe && typeof probe === 'object' && 'samples' in probe && 'unreadable' in probe && 'why' in probe;
      return measured(
        carries ? 1 : 0,
        'of 1 — every analytics metric reports {value, samples, unreadable, why}, so an unreadable batch is visible as a count rather than folded into an average',
        'read from apps/worker/src/analytics.ts by constructing a metric with unreadable samples. There is no alerting on it: nothing watches the unreadable count and nothing pages anybody.',
      );
    },
  },
];

// ---------------------------------------------------------------------------------------------
// RUN IT
//
// Collected as data first and printed second, so `success-metrics.test.mjs` can hold the honesty
// rule against the same objects the text comes from rather than against the text.
// ---------------------------------------------------------------------------------------------
const scenarioResults = await runScenarios();
const scenarioTally = {
  total: scenarioResults.length,
  pass: scenarioResults.filter((r) => r.verdict === 'pass').length,
  fail: scenarioResults.filter((r) => r.verdict === 'fail').length,
  skip: scenarioResults.filter((r) => r.verdict === 'skip').length,
};

const measureResults = [];
for (const m of MEASURES) {
  const briefName = analyticsSection?.items[m.item - 1]?.name ?? null;
  let outcome;
  try {
    outcome = await m.measure();
  } catch (err) {
    outcome = notMeasured(`the measurement itself failed: ${err.message}`);
  }
  measureResults.push({ ...m, briefName, nameMatchesBrief: briefName === m.name, outcome });
}

const measureTally = {
  total: measureResults.length,
  measured: measureResults.filter((r) => r.outcome.state === 'measured').length,
  notMeasured: measureResults.filter((r) => r.outcome.state === 'not-measured').length,
  nameDrift: measureResults.filter((r) => !r.nameMatchesBrief).length,
};

/** The whole report, as data. Exported so it can be asserted about rather than scraped. */
export const REPORT = {
  provenance,
  brief: BRIEF,
  acceptance: { tally: scenarioTally, scenarios: scenarioResults },
  completion: {
    overall,
    headerClaim: headerClaim
      ? { done: +headerClaim[1], partial: +headerClaim[2], notFound: +headerClaim[3], weightedPct: +headerClaim[4] }
      : null,
  },
  analytics: {
    tally: measureTally,
    measures: measureResults.map((r) => ({
      item: r.item,
      name: r.name,
      briefName: r.briefName,
      nameMatchesBrief: r.nameMatchesBrief,
      ...r.outcome,
    })),
  },
};

// Imported rather than run: hand `REPORT` back and print nothing. `success-metrics.test.mjs`
// depends on this — a test file that had to scrape stdout would be asserting about the formatter.
const RUN_DIRECTLY = typeof process.argv[1] === 'string' && process.argv[1].endsWith('success-metrics.mjs');
if (RUN_DIRECTLY && asJson) console.log(JSON.stringify(REPORT, null, 2));
else if (RUN_DIRECTLY) printReport();

function printReport() {

// ---------------------------------------------------------------------------------------------
// PRINT
// ---------------------------------------------------------------------------------------------
const wrap = (text, indent) => {
  const width = 100 - indent;
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
    if (line.length + word.length + 1 > width) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out.map((l) => `${' '.repeat(indent)}${l}`).join('\n');
};

const rule = (t) => `\n${'─'.repeat(100)}\n${t}\n${'─'.repeat(100)}`;

console.log('APPLE — SUCCESS METRICS');
console.log(`measured  ${provenance.measuredAt}`);
console.log(`commit    ${provenance.commit ?? 'unknown'}${provenance.treeDirty ? '  (WORKING TREE DIRTY — these numbers are not the commit’s)' : ''}`);
if (provenance.commitSubject) console.log(`           ${provenance.commitSubject}`);
console.log(`source    ${BRIEF.file}`);
console.log('scope     this report reads THIS REPOSITORY. It has no production database, no deployed');
console.log('          origin, no Stripe account and no user. Every measure that needs one says so.');

console.log(rule(`1 · RELEASE ACCEPTANCE — ${BRIEF.section}`));
console.log(
  `   ${scenarioTally.pass} passed · ${scenarioTally.fail} failed · ${scenarioTally.skip} skipped   (of ${scenarioTally.total} scenarios the brief names)\n`,
);
for (const r of scenarioResults) {
  const badge = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }[r.verdict];
  console.log(`   ${badge}  ${String(r.n).padStart(2)}. ${r.name}`);
  if (r.checks) console.log(wrap(`checked: ${r.checks}`, 12));
  if (r.notChecked) console.log(wrap(`NOT checked: ${r.notChecked}`, 12));
  if (r.reason) console.log(wrap(r.verdict === 'skip' ? `skipped because ${r.reason}` : `failed: ${r.reason}`, 12));
  console.log('');
}
console.log(
  wrap(
    'A PASS here is the named mechanism holding, measured offline against the committed source. It is ' +
      'not a stranger completing the journey on the deployed product — the "NOT checked" line under each ' +
      'scenario is the part no offline check can see.',
    3,
  ),
);

console.log(rule('2 · THE BRIEF’S OWN COMPLETION FIGURE — recomputed from its marks'));
console.log(
  `   ✓ ${overall.done} done · ~ ${overall.partial} partly built · ☐ ${overall.notFound} not found` +
    `${overall.other ? ` · ${overall.other} unrecognised mark` : ''}   over ${overall.total} items in ${SECTIONS.length} sections`,
);
console.log(`   weighted ${overall.weightedPct.toFixed(1)}%   (✓ = 1, ~ = 0.5, ☐ = 0)`);
if (headerClaim) {
  const agrees =
    +headerClaim[1] === overall.done && +headerClaim[2] === overall.partial && +headerClaim[3] === overall.notFound;
  console.log(
    `   the file’s own header says ✓ ${headerClaim[1]} · ~ ${headerClaim[2]} · ☐ ${headerClaim[3]} · ${headerClaim[4]}%  — ${agrees ? 'agrees with the marks below it' : 'DISAGREES with the marks below it; the marks are what this report counted'}`,
  );
} else {
  console.log('   the file carries no header total to compare against');
}
if (acceptanceSection) {
  const t = tally(acceptanceSection.items);
  console.log(
    `\n   section 60 alone: ✓ ${t.done} · ~ ${t.partial} · ☐ ${t.notFound} of ${t.total} — weighted ${t.weightedPct.toFixed(1)}%`,
  );
  console.log(wrap(`The brief scores that section ${t.weightedPct.toFixed(1)}% built; the harness above reports ${scenarioTally.pass}/${scenarioTally.total} mechanisms holding. The two measure different things and are printed side by side rather than reconciled: one is an assessment of the code, the other is an execution of it.`, 3));
}

console.log(rule(`3 · PRODUCT ANALYTICS — section ${analyticsSection?.number ?? 53}. ${analyticsSection?.title ?? 'PRODUCT ANALYTICS'}`));
console.log(`   ${measureTally.measured} measured · ${measureTally.notMeasured} not measured   (of ${measureTally.total} measures the brief names)`);
if (measureTally.nameDrift) {
  console.log(`   ⚠ ${measureTally.nameDrift} measure name(s) no longer match the brief — the mapping below may be attached to the wrong item`);
}
console.log('');
for (const r of measureResults) {
  console.log(`   ${String(r.item).padStart(2)}. ${r.name}${r.nameMatchesBrief ? '' : `   ⚠ brief now says: ${r.briefName ?? '(absent)'}`}`);
  if (r.outcome.state === 'measured') {
    console.log(wrap(`${r.outcome.value} ${r.outcome.unit}`, 8));
    console.log(wrap(`how: ${r.outcome.how}`, 8));
  } else {
    console.log(wrap(`not measured, because ${r.outcome.because}`, 8));
    if (r.outcome.note) console.log(wrap(`note: ${r.outcome.note}`, 8));
  }
  console.log('');
}

console.log(rule('WHAT THIS REPORT CANNOT SEE'));
console.log(
  wrap(
    'The production Supabase database, the deployed worker, Cloudflare D1 and KV, the Durable Object ' +
      'SQL, the Stripe account, and any human being. Every funnel, conversion and retention figure in ' +
      'section 53 needs at least one of those and is therefore reported unmeasured rather than modelled. ' +
      'The two structural reasons are that the analytics event catalog contains no product event, and ' +
      'that no credential for a production datastore belongs in an offline report.',
    3,
  ),
);
console.log('');
}
