/**
 * THE METER MAY NOT RESTATE THE ALLOWANCE, MAY NOT MERGE THE TWO BALANCES, AND MAY NOT
 * DRAW AN UNREADABLE QUOTA AS A HEALTHY ONE.
 *
 * The quota reached the browser long before this component existed: `fetchMe` has always
 * returned a full QuotaState and layout.tsx has always fetched it, then read exactly one
 * field — `profile.is_admin`. Every number describing what the user had left was fetched
 * on every page load and discarded, so the only way to learn you were nearly out was to
 * run out. That is what w13 means by "visible before the run, not after".
 *
 * Three properties are load-bearing and each is pinned below:
 *
 *   1. `allowanceTotal` is read from PLAN_LIMITS in @golem/shared — the same table QuotaDO
 *      enforces. The test imports that table rather than repeating its numbers, so a meter
 *      that hard-codes 60 fails here even though 60 is today's correct answer.
 *   2. allowanceRemaining and credits are reported separately. QuotaState's own comment is
 *      the reason: "you have 0 left today" and "you have 0 left at all" are different
 *      sentences with different next actions, and creditsRemaining — their sum — cannot
 *      distinguish them.
 *   3. A quota that could not be read is `unknown`, never good and never bad.
 *
 * KNOWN LIMIT, stated rather than papered over: this exercises the MODEL, which is where
 * every decision lives, and not the rendered component — apps/web has no DOM renderer, so
 * no test in this package mounts anything. That the two bands reach the DOM is not proven
 * here; that the model reports two separate numbers for them is.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'usage-')), 'usage.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'components', 'usage-meter-model.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { meterView, resetsIn, nextMonthResetIso, spendByKind, usageKindLabel, periodComparisonLine } = await import(out);

const sharedOut = join(mkdtempSync(join(tmpdir(), 'shared-')), 'shared.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + sharedOut], { stdio: 'pipe' });
const { PLAN_LIMITS, PLAN_COPY, CREDITS_PER_BUILD } = await import(sharedOut);

const NOW = Date.UTC(2026, 8, 14, 12, 0, 0);
const quota = (over = {}) => ({
  creditsRemaining: 40, creditsDaily: 60, creditsMonthly: 900,
  creditsUsedToday: 20, creditsUsedThisMonth: 100,
  resetsAtIso: new Date(NOW + 3 * 3600_000).toISOString(),
  plan: 'free', allowanceRemaining: 40, credits: 0, ...over,
});

// --- 0. not asked yet is not the same as asked and failed -------------------------------

/**
 * Both states have no number to show, and for a while they shared one fallback — so every ordinary
 * page load flashed "The usage service did not answer" while the request was still in flight. That
 * sentence is a claim about a service that was working, made before it had been asked.
 *
 * The distinction is not cosmetic. A user who sees the failure state on every load stops reading
 * it, and the one time it means something it has already been trained away.
 */
test('A REQUEST IN FLIGHT IS NOT A FAILED ONE', () => {
  const v = meterView(undefined, NOW, { pending: true });
  assert.equal(v.tone, 'pending');
  assert.doesNotMatch(v.detail, /did not answer/, 'a pending request must not blame the service');
  assert.doesNotMatch(v.headline, /unavailable/i);
  assert.equal(v.resetsIn, null, 'and must not offer a figure it does not have');
  assert.equal(v.allowanceTotal, 0);
});

test('pending wins even when a stale quota is still in hand, and absence alone is still unknown', () => {
  // A refetch over an existing payload: the honest reading is "checking", not last minute's number
  // presented as current.
  const v = meterView(quota(), NOW, { pending: true });
  assert.equal(v.tone, 'pending');

  // and with no flag at all, an absent quota is still the failure state — this is the case the
  // pending flag was added to stop swallowing, not to replace.
  assert.equal(meterView(undefined, NOW).tone, 'unknown');
  assert.match(meterView(undefined, NOW).detail, /did not answer/);
  assert.equal(meterView(undefined, NOW, { pending: false }).tone, 'unknown');
});

// --- 1. the allowance is never restated -------------------------------------------------

test('allowanceTotal comes from PLAN_LIMITS, for every plan', () => {
  for (const plan of Object.keys(PLAN_LIMITS)) {
    const v = meterView(quota({ plan, allowanceRemaining: 5 }), NOW);
    assert.equal(v.allowanceTotal, PLAN_LIMITS[plan].creditsPerDay,
      `${plan} must track the enforced table`);
    assert.equal(v.planName, PLAN_COPY[plan].name);
  }
});

test('a plan the client does not know falls back to the wire figure, not to a guess', () => {
  const v = meterView(quota({ plan: 'platinum', creditsDaily: 123, allowanceRemaining: 10 }), NOW);
  assert.equal(v.allowanceTotal, 123);
  assert.equal(v.planName, null, 'it must not invent a name for an unknown plan');
});

// --- 2. two balances, never one ---------------------------------------------------------

test('allowance and credits are reported as separate numbers', () => {
  const v = meterView(quota({ allowanceRemaining: 12, credits: 500 }), NOW);
  assert.equal(v.allowanceRemaining, 12);
  assert.equal(v.credits, 500);
  assert.equal(v.allowanceRemaining + v.credits, 512);
  // the headline is the ALLOWANCE, never the sum — 512 would imply today's budget is 512
  assert.match(v.headline, /\b12\b/);
  assert.doesNotMatch(v.headline, /512/);
});

test('the two kinds of zero are different sentences with different next actions', () => {
  const spentButFunded = meterView(quota({ allowanceRemaining: 0, credits: 300 }), NOW);
  const trulyEmpty = meterView(quota({ allowanceRemaining: 0, credits: 0 }), NOW);

  assert.notEqual(spentButFunded.headline, trulyEmpty.headline);
  assert.equal(spentButFunded.tone, 'warn', 'funded by credits is not a dead stop');
  assert.equal(trulyEmpty.tone, 'bad');
  assert.equal(spentButFunded.nextAction, null, 'nothing is blocked, so nothing is demanded');
  assert.ok(trulyEmpty.nextAction, 'a dead stop must name the next action');
  assert.match(spentButFunded.detail, /300/, 'the purchased balance must still be visible');
});

// --- 3. an unreadable quota is not a healthy one ----------------------------------------

test('a missing or malformed quota is unknown, never good and never bad', () => {
  for (const bad of [undefined, null, {}, 'nope', 42, { allowanceRemaining: 5 }, { credits: 5 }]) {
    const v = meterView(bad, NOW);
    assert.equal(v.tone, 'unknown', `${JSON.stringify(bad)} must be unknown`);
    assert.equal(v.allowanceFraction, 0);
    assert.equal(v.nextAction, null, 'it must not demand an action on a number it cannot read');
    assert.match(v.detail, /display problem|not a charge/i,
      'it must say the balance is unchanged, not imply a spend');
  }
});

// --- the rest ---------------------------------------------------------------------------

test('the bar fills against the plan total and is clamped', () => {
  // The RELATIONSHIP is asserted, not a round number. This said 0.5 against a fixture of 30-of-60,
  // so the literal was a second copy of an allowance — the one thing rule 1 of this component
  // forbids, in the test written to enforce it. And free is 231 a day, which is three whole builds
  // and therefore odd, so "half" does not land on a tidy fraction anyway.
  const total = PLAN_LIMITS.free.creditsPerDay;
  const some = Math.floor(total / 2);
  assert.equal(meterView(quota({ allowanceRemaining: some, plan: 'free' }), NOW).allowanceFraction, some / total);
  assert.equal(meterView(quota({ allowanceRemaining: 999, plan: 'free' }), NOW).allowanceFraction, 1,
    'more than the allowance must not overflow the bar');
  assert.equal(meterView(quota({ allowanceRemaining: 0, credits: 0 }), NOW).allowanceFraction, 0);
});

test('running low is warned before it is spent', () => {
  assert.equal(meterView(quota({ allowanceRemaining: Math.floor(PLAN_LIMITS.free.creditsPerDay * 0.7) }), NOW).tone, 'good');
  assert.equal(meterView(quota({ allowanceRemaining: Math.floor(PLAN_LIMITS.free.creditsPerDay * 0.08) }), NOW).tone,
    'warn', 'under a tenth of the allowance is low');
  assert.equal(meterView(quota({ allowanceRemaining: 1 }), NOW).tone, 'warn');
});

test('the builds hint is withheld below one whole build rather than shown as zero', () => {
  const under = meterView(quota({ allowanceRemaining: CREDITS_PER_BUILD - 1, credits: 0 }), NOW);
  assert.equal(under.buildsHint, null, '"0 builds" reads as a fault in the account');
  const over = meterView(quota({ allowanceRemaining: CREDITS_PER_BUILD * 3, credits: 0 }), NOW);
  assert.match(over.buildsHint, /3 more builds/);
  const one = meterView(quota({ allowanceRemaining: CREDITS_PER_BUILD, credits: 0 }), NOW);
  assert.match(one.buildsHint, /1 more build\b/, 'singular, not "1 more builds"');
});

test('the builds hint counts purchased credits, because they are spendable too', () => {
  const v = meterView(quota({ allowanceRemaining: 0, credits: CREDITS_PER_BUILD * 2 }), NOW);
  assert.match(v.buildsHint, /2 more builds/);
});

test('the reset is relative, and a past reset is not announced', () => {
  assert.equal(resetsIn(new Date(NOW + 30 * 60_000).toISOString(), NOW), 'resets in 30 min');
  assert.equal(resetsIn(new Date(NOW + 3 * 3600_000).toISOString(), NOW), 'resets in 3h');
  assert.equal(resetsIn(new Date(NOW - 60_000).toISOString(), NOW), null, 'a past reset says nothing');
  assert.equal(resetsIn('not a date', NOW), null);
  assert.equal(resetsIn(undefined, NOW), null);
});

test('negative or fractional balances from the wire are not rendered raw', () => {
  const v = meterView(quota({ allowanceRemaining: -5, credits: 2.7 }), NOW);
  assert.equal(v.allowanceRemaining, 0, 'a negative balance is zero, not "-5 left"');
  assert.equal(v.credits, 2, 'credits floor — never round a balance up');
});

// --- 4. the meter names the limit that is actually biting --------------------------------

/**
 * `allowanceRemaining` is the SMALLER of what is left today and what is left this month, so a spent
 * month reads as zero on a completely fresh day. The meter used to call that "the daily allowance
 * is spent" and offer a reset a few hours away. Both halves are wrong: wrong about which limit
 * stopped them, and wrong about when it lifts. A user reads "resets in 7h", waits, and is still
 * blocked — with no way to find out why from anything on the screen.
 *
 * Free is 60/day and 900/month, so fifteen heavy days exhaust the month while any given day is new.
 */
test('A SPENT MONTH IS NOT REPORTED AS A SPENT DAY', () => {
  const v = meterView(quota({
    creditsUsedToday: 0, creditsUsedThisMonth: PLAN_LIMITS.free.creditsPerMonth,
    allowanceRemaining: 0, credits: 0,
  }), NOW);

  assert.equal(v.period, 'month', 'the month is what ran out');
  assert.match(v.detail, /month/i, 'and the detail must say so');
  assert.doesNotMatch(v.detail, /^The daily allowance is spent/, 'the day is not what stopped them');
  assert.match(v.nextAction ?? '', /month/i, 'the next action must not be "wait for the reset"');
});

test('and the reset it offers is the MONTH boundary, not a few hours away', () => {
  const v = meterView(quota({
    creditsUsedToday: 0, creditsUsedThisMonth: PLAN_LIMITS.free.creditsPerMonth,
    allowanceRemaining: 0,
    // the wire's own figure is the DAILY reset, three hours out — the number that used to be shown
    resetsAtIso: new Date(NOW + 3 * 3600_000).toISOString(),
  }), NOW);
  assert.notEqual(v.resetsIn, 'resets in 3h', 'the daily reset does not lift a monthly cap');
  assert.match(v.resetsIn ?? '', /^resets in \d+d$/, 'it is days away, got ' + v.resetsIn);
});

test('the month total is read from PLAN_LIMITS too, for every plan', () => {
  for (const plan of Object.keys(PLAN_LIMITS)) {
    const v = meterView(quota({
      plan, creditsUsedToday: 0,
      creditsDaily: PLAN_LIMITS[plan].creditsPerDay,
      creditsMonthly: PLAN_LIMITS[plan].creditsPerMonth,
      creditsUsedThisMonth: PLAN_LIMITS[plan].creditsPerMonth - 1,
      allowanceRemaining: 1,
    }), NOW);
    assert.equal(v.period, 'month', `${plan}: one left this month, a whole day left today`);
    assert.equal(v.allowanceTotal, PLAN_LIMITS[plan].creditsPerMonth, `${plan} monthly total`);
    assert.match(v.detail, /a month/, `${plan} must say which period`);
    assert.match(v.headline, /this month/, `${plan} headline`);
  }
});

test('an ordinary day is still reported as a day', () => {
  // The common case must not have been collateral damage: plenty of month left, some day spent.
  const v = meterView(quota({ creditsUsedToday: 20, creditsUsedThisMonth: 100, allowanceRemaining: 40 }), NOW);
  assert.equal(v.period, 'day');
  assert.match(v.headline, /left today/);
  assert.match(v.detail, /a day/);
  assert.equal(v.allowanceTotal, PLAN_LIMITS.free.creditsPerDay);
  assert.equal(v.resetsIn, 'resets in 3h', 'and it is the wire figure that is used');
});

test('the month boundary is the first instant of the next UTC month', () => {
  assert.equal(nextMonthResetIso(Date.UTC(2026, 8, 14, 12)), '2026-10-01T00:00:00.000Z');
  assert.equal(nextMonthResetIso(Date.UTC(2026, 11, 31, 23, 59)), '2027-01-01T00:00:00.000Z');
  assert.equal(nextMonthResetIso(Date.UTC(2024, 0, 31, 6)), '2024-02-01T00:00:00.000Z');
});

test('A CALLER THAT KNOWS THE FETCH FAILED SAYS SO, rather than leaving it to be inferred', () => {
  // The rail used to hand the meter `me.data?.quota`, which is undefined on failure, and the
  // meter reached UNKNOWN by not recognising the payload. Right answer, accidental route: a
  // refactor that gave the meter a default object would have turned a failed fetch into a
  // confident zero, and nothing would have failed.
  const v = meterView(undefined, NOW, { failed: true });
  assert.equal(v.tone, 'unknown');
  assert.match(v.detail, /did not answer/);

  // Stated failure beats a payload that happens to be present: a stale quota alongside a failed
  // refetch is not current, and presenting it as current is the lie.
  assert.equal(meterView(quota(), NOW, { failed: true }).tone, 'unknown');

  // And pending still wins over failed — a request in flight has not failed yet.
  assert.equal(meterView(undefined, NOW, { pending: true, failed: true }).tone, 'pending');
});

// ------------------------------------------------------- WHAT THE CREDITS WENT ON (the breakdown)
//
// The ledger has carried a `kind` on every spend since it existed, and the history query threw it
// away, so the page could say WHEN Credits went and never WHAT they went on. The server now sends
// it per day; this is the half that turns raw ledger kinds into a list a person reads.

const DAYS = [
  { day: '2026-09-10', credits: 10, events: 3, kinds: [
    { kind: 'usage_agent', credits: 8 }, { kind: 'chat_agent', credits: 1 }, { kind: 'docs_search', credits: 1 }] },
  { day: '2026-09-09', credits: 20, events: 1, kinds: [{ kind: 'usage_super', credits: 20 }] },
];

test('THE BREAKDOWN SUMS TO THE TOTAL THE CHART ALREADY SHOWS', () => {
  // A breakdown that does not add up to the figure printed beside it is worse than no breakdown:
  // it makes the person distrust both numbers, and they have no way to tell which one is wrong.
  const rows = spendByKind(DAYS);
  const total = DAYS.reduce((n, d) => n + d.credits, 0);
  assert.equal(rows.reduce((n, r) => n + r.credits, 0), total, JSON.stringify(rows));
});

test('THE TWO LEDGER ROWS FOR ONE ACTIVITY ARE ONE LINE', () => {
  // A run writes `chat_<mode>` when it is admitted and `usage_<mode>` when it settles. They are one
  // activity charged in two instalments, and printing them as two categories would invite the
  // reader to conclude they were charged twice.
  const rows = spendByKind(DAYS);
  // Filtered by the bucket key rather than by the label: 'super' renders as "Super Agent", so a
  // label match on /agent/ would call this green while the two instalments were still apart.
  const agent = rows.filter((r) => r.key === 'mode:agent');
  assert.equal(agent.length, 1, `Agent must be one row, got ${JSON.stringify(rows)}`);
  assert.equal(agent[0].credits, 9, '8 settled plus the 1 charged on admission');
  assert.equal(rows.length, 3, 'Agent, Super Agent and Search — three buckets, not four rows');
});

test('legacy specialist ledger names use the public activity and preserve the whole charge', () => {
  for (const [internal, publicMode] of [['clay', 'plan'], ['stone', 'agent'], ['rune', 'super']]) {
    const rows = spendByKind([{ kinds: [{ kind: `chat_${publicMode}`, credits: 1 }, { kind: `usage_${internal}`, credits: 8 }] }]);
    assert.equal(rows.length, 1, `${internal} admission and settlement must share one activity`);
    assert.equal(rows[0].credits, 9);
    assert.equal(rows[0].label, usageKindLabel(`usage_${publicMode}`));
    assert.doesNotMatch(rows[0].label, /clay|stone|rune/i);
  }
  assert.equal(usageKindLabel('usage_constructor'), 'Usage constructor');
});

test('an aggregate extra balance does not claim it was purchased rather than granted', () => {
  const view = meterView(quota({ allowanceRemaining: 0, credits: 300, creditsRemaining: 300 }), NOW);
  assert.match(view.detail, /300 extra credits/);
  assert.doesNotMatch(view.detail, /purchased/);
});

test('THE BIGGEST SPEND IS FIRST, because that is the one worth knowing about', () => {
  const rows = spendByKind(DAYS);
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i - 1].credits >= rows[i].credits, JSON.stringify(rows));
  assert.equal(rows[0].key, 'mode:super', 'the 20-Credit day leads');
});

test('A KIND THIS PAGE HAS NEVER SEEN IS SHOWN, not dropped and not guessed at', () => {
  // A new spend kind ships on the server before it is named here. Dropping it would make the parts
  // stop summing to the whole — silently, and in the direction that flatters us.
  const rows = spendByKind([{ day: '2026-09-11', credits: 5, events: 1, kinds: [{ kind: 'weird_new_thing', credits: 5 }] }]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].credits, 5);
  assert.ok(rows[0].label.length > 0);
  assert.doesNotMatch(rows[0].label, /undefined|_/, `an unknown kind is tidied, not printed raw: ${rows[0].label}`);
});

test('an older worker that sends no breakdown produces no breakdown, not a wrong one', () => {
  // `kinds` is absent on a deployment that has not shipped the new query. An empty list means the
  // page renders nothing, which is right; inventing an "Other" bucket for the day's whole total
  // would be a category nobody spent anything on.
  assert.deepEqual(spendByKind([{ day: '2026-09-10', credits: 10, events: 3 }]), []);
  assert.deepEqual(spendByKind([]), []);
  assert.deepEqual(spendByKind(undefined), []);
});

// -------------------------------------------------------------- against last month

test('THE COMPARISON IS OMITTED ENTIRELY WHEN THERE IS NOTHING TO COMPARE', () => {
  // The page showed one period at a time and nothing anywhere held a previous figure. The trap in
  // adding one is the FIRST month: a comparison against a month that was never counted would read
  // as "1,200 this month, against 0 last month" — a story about explosive growth, told to somebody
  // who simply had not signed up yet.
  assert.equal(periodComparisonLine(1200, null), null);
  assert.equal(periodComparisonLine(1200, undefined), null);
  assert.equal(periodComparisonLine(1200, { month: '2026-08' }), null, 'a month with no figure is no figure');
  assert.equal(periodComparisonLine(1200, { month: '2026-08', credits: 'lots' }), null);
  assert.equal(periodComparisonLine(null, { month: '2026-08', credits: 900 }), null,
    'and an unreadable current figure cannot be half of a comparison either');
});

test('a real comparison names both figures and which way it went', () => {
  const up = periodComparisonLine(1200, { month: '2026-08', credits: 900 });
  assert.ok(up.includes('1,200') || up.includes('1200'), up);
  assert.ok(up.includes('900'), up);
  assert.match(up, /last month/i);
  assert.doesNotMatch(up, /undefined|NaN|null/, up);

  const down = periodComparisonLine(300, { month: '2026-08', credits: 900 });
  assert.ok(down.includes('300') && down.includes('900'), down);
  assert.notEqual(up, down, 'the two directions must not read identically');
});

test('A GENUINE ZERO LAST MONTH IS A COMPARISON; an unknown one is not', () => {
  // These two look the same in a payload that uses 0 for "no data", which is exactly why the server
  // sends null instead. Both branches are asserted so that distinction cannot be flattened later.
  assert.ok(periodComparisonLine(50, { month: '2026-08', credits: 0 }), 'a month someone really spent nothing in');
  assert.equal(periodComparisonLine(50, null), null);
});

test('the labels are the product’s own words for the modes', () => {
  // A historical autonomy label must not pretend it identifies product-model weights.
  assert.equal(usageKindLabel('chat_plan'), 'Plan');
  assert.match(usageKindLabel('usage_super'), /super/i);
  assert.match(usageKindLabel('api_chat'), /api/i);
  assert.match(usageKindLabel('docs_search'), /search/i);
  assert.ok(usageKindLabel('').length > 0, 'even an empty kind gets a word rather than a blank row');
});

// --- 5. the rail may not sell what this deployment cannot sell -------------------------

/**
 * D92d349 — THE RAIL NAMED UPGRADING AS "THE ONLY WAY", HAVING ASKED NOBODY.
 *
 * With the month spent and no credits, `nextAction` read: "The monthly limit does not lift until
 * next month. Credits cannot be bought yet, so upgrading is the only way to raise it." Nothing in
 * this file had ever looked at /api/billing/config, which is what /app/usage asks before it labels
 * every paid tier "Not available yet" and draws no button at all. `CREDIT_PURCHASE_LIVE` is false
 * and `checkout` is false on the live deployment, so a customer who ran out was sent, in the one
 * sentence they would act on, to a page with nothing on it to buy.
 *
 * composer.tsx in the same bundle already had the shape: `maxUpgradeAvailable` is THREE-valued,
 * and the third value is not "no". The model takes the same three.
 */
const spentMonth = (over = {}) => quota({
  creditsUsedToday: 0, creditsUsedThisMonth: PLAN_LIMITS.free.creditsPerMonth,
  allowanceRemaining: 0, credits: 0, ...over,
});

test('THE DEAD STOP DOES NOT OFFER AN UPGRADE THIS DEPLOYMENT CANNOT SELL', () => {
  const v = meterView(spentMonth(), NOW, { upgradeAvailable: false });
  assert.equal(v.tone, 'bad');
  assert.equal(v.period, 'month');
  const next = v.nextAction ?? '';
  assert.match(next, /not available yet/i,
    'the rail must say what the plans page says, got: ' + next);
  assert.doesNotMatch(next, /upgrad\w* (is|as) the only way|only way to raise/i,
    'naming upgrading as the only way while nothing is for sale is the defect, got: ' + next);
});

test('and it DOES offer one where the deployment can', () => {
  const next = meterView(spentMonth(), NOW, { upgradeAvailable: true }).nextAction ?? '';
  assert.match(next, /upgrad/i, 'where checkout is live, upgrading is the real way through');
  assert.doesNotMatch(next, /not available yet/i);
});

/**
 * NULL IS BOTH "STILL ASKING" AND "ASKED AND COULD NOT FIND OUT", and the rail renders
 * continuously through the first of those — so the hedged sentence may not report a failed
 * observation either. It names the page that knows, which is true in both cases. Same rule as
 * `pending` vs `unknown` at the top of this file, one subsystem further out.
 */
test('and where it does not know, it claims neither', () => {
  for (const opts of [{}, { upgradeAvailable: null }, { upgradeAvailable: undefined }]) {
    const next = meterView(spentMonth(), NOW, opts).nextAction ?? '';
    assert.ok(next.length > 0, 'a dead stop still has to say something');
    assert.doesNotMatch(next, /only way to raise|not available yet/i,
      'an unanswered question is not an answer in either direction, got: ' + next);
    assert.doesNotMatch(next, /could not be confirmed|did not answer/i,
      'and it is not a failed observation either while the request may still be in flight, got: ' + next);
    assert.match(next, /Usage and Credits/i, 'it must name the page that does know, got: ' + next);
  }
});

/**
 * THE WIRING, which is the half a model test cannot reach. Three call sites have to carry the
 * answer or the model's new branch is dead code: the rail's meter, the meter component, and the
 * usage page's own copy of the same view.
 */
test('the three surfaces that render this model all pass the billing answer through', () => {
  const src = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');

  const meter = src('components', 'usage-meter.tsx');
  assert.match(meter, /upgradeAvailable\?:\s*boolean\s*\|\s*null/, 'UsageMeter must accept it');
  assert.match(meter, /meterView\([^)]*upgradeAvailable/, 'and hand it to the model');
  assert.match(meter, /upgradeAvailable\s*=\s*null/,
    'the default must be "unknown", not false — a caller that never asked knows nothing, and false is a claim');

  const layout = src('components', 'layout.tsx');
  assert.match(layout, /fetchBillingConfig/, 'the shell must actually ask /api/billing/config');
  assert.match(layout, /queryKey:\s*\['billing-config'\]/,
    'by the same key usage.tsx and workspace.tsx use, or the three surfaces can disagree');
  assert.match(layout, /upgradeAvailable=\{maxUpgradeAvailable\(billing\.data\)\}/,
    'and pass the answer to the rail');
  assert.match(layout, /<UsageMeter[^>]*upgradeAvailable=\{upgradeAvailable\}/,
    'which the rail has to forward to the meter');

  const usage = src('routes', 'usage.tsx');
  assert.match(usage, /meterView\([^;]{0,240}?upgradeAvailable:\s*maxUpgradeAvailable\(billing\.data\)/,
    'the usage page renders the same model a few hundred pixels above "Not available yet"');
});
