/**
 * WHAT THE BUYER IS SHOWN BEFORE THEY ARE SENT TO A PAYMENT PAGE.
 *
 * There was no step at all. The first click on 'Upgrade to Studio' called the checkout mutation, and
 * the next thing the person saw was Stripe's card form — the plan card behind them described a TIER
 * (price, allowance, highlights), which is not an order: it never said what they were moving from,
 * what the charge would be, how often it would repeat, or that tax was added on top.
 *
 * This is the model behind that step. Pure, and the formatters are passed in, so the whole sentence
 * can be read back rather than asserting that a formatter was called — the same shape as
 * billing-copy.ts, and for the same reason: `${undefined}` renders as the literal "undefined".
 *
 * THE NUMBERS ARE NOT LITERALS HERE. They are read out of the enforced plan table, so a repricing
 * that moves the figure the customer is charged moves this test with it.
 *
 * Run with:  node --test tests/order-summary.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const dir = mkdtempSync(join(tmpdir(), 'order-summary-'));

const bundle = (src, name) => {
  const out = join(dir, name);
  execFileSync(ESBUILD, [src, '--bundle', '--format=esm', '--platform=neutral',
    '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
  return out;
};

const { orderSummary } = await import(`file://${bundle(join(WEB, 'src', 'lib', 'order-summary.ts'), 'model.mjs')}`);
const { PLAN_COPY, PLAN_LIMITS, PRICE_CURRENCY, formatMoney } =
  await import(`file://${bundle(join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), 'shared.mjs')}`);

/** The real figures for a real move, so nothing below is checked against a number invented here. */
const order = (to = 'studio', from = 'free') =>
  orderSummary({
    planName: PLAN_COPY[to].name,
    priceMonthly: PLAN_COPY[to].priceUsdMonthly,
    creditsPerMonth: PLAN_LIMITS[to].creditsPerMonth,
    currentPlanName: PLAN_COPY[from].name,
    currentCreditsPerMonth: PLAN_LIMITS[from].creditsPerMonth,
    currency: PRICE_CURRENCY,
    formatMoney: (amount, currency) => formatMoney(amount, { locale: 'en-US', currency }),
    formatNumber: (n) => n.toLocaleString('en-US'),
  });

const whole = (s) => [s.title, ...s.lines.map((l) => `${l.label} ${l.value}`), s.terms, s.tax, s.confirmLabel].join(' | ');

test('THE CHARGE IS STATED AS AN AMOUNT AND A CURRENCY, not a bare number', () => {
  const s = order('studio');
  assert.ok(s, 'a purchasable plan has an order to summarise');
  const price = s.lines.find((l) => /price|per month|charge/i.test(l.label));
  assert.ok(price, `no line names the charge: ${whole(s)}`);
  assert.ok(
    price.value.includes(formatMoney(PLAN_COPY.studio.priceUsdMonthly, { locale: 'en-US', currency: PRICE_CURRENCY })),
    `the charge must be the formatted figure from the plan table: ${price.value}`,
  );
});

test('IT SAYS HOW OFTEN THE CHARGE REPEATS, because a subscription is not a purchase', () => {
  const s = order('studio');
  assert.match(whole(s), /month/i, 'the billing term must appear');
  assert.match(`${s.terms}`, /until you cancel|recurring|each month|every month/i,
    `a repeating charge must say it repeats: ${s.terms}`);
});

test('IT NAMES WHAT THE ACCOUNT MOVES FROM AND TO, not just where it lands', () => {
  const s = order('studio', 'builder');
  assert.match(whole(s), /Studio/);
  assert.match(whole(s), /Builder/, 'the plan being left is half of what changed');
});

test('and it never calls a smaller allowance an upgrade', () => {
  // Only a free account can reach this dialog today — every other move goes to the portal — but a
  // hard-coded "up from" would describe a downgrade as an upgrade the first time that changes, on
  // the one screen where somebody is deciding to spend money.
  const down = order('builder', 'studio');
  assert.doesNotMatch(whole(down), /\bup from\b/, `a move to a smaller allowance is not "up": ${whole(down)}`);
  assert.match(whole(order('studio', 'free')), /\bup from\b/, 'and a real upgrade still says so');
});

test('THE ALLOWANCE IN THE SUMMARY IS THE ENFORCED ONE', () => {
  // A summary that quotes a different allowance from the one QuotaDO applies is a page that lies at
  // the exact moment the user is deciding to pay.
  const s = order('studio');
  const expected = PLAN_LIMITS.studio.creditsPerMonth.toLocaleString('en-US');
  assert.ok(whole(s).includes(expected), `the new monthly allowance (${expected}) must be stated: ${whole(s)}`);
});

test('TAX IS STATED HERE TOO, because this is the last screen we control', () => {
  const s = order('studio');
  assert.match(s.tax, /tax/i);
  assert.match(s.tax, /checkout|added|calculated/i, 'and where the number is worked out');
});

test('THE CONFIRM LABEL PROMISES A PAYMENT PAGE, NOT A CHARGE', () => {
  // Nothing is charged by pressing it: it opens Stripe. A label reading "Pay now" would make the
  // button a claim about money moving, which is the sentence this product keeps having to unmake.
  const s = order('studio');
  assert.match(s.confirmLabel, /continue|payment/i);
  assert.doesNotMatch(s.confirmLabel, /^pay\b|pay now|charge me/i, `a false promise of a charge: ${s.confirmLabel}`);
});

test('NOTHING IN IT CLAIMS THE PLAN HAS CHANGED', () => {
  // Entitlement moves when the webhook lands. Every other surface in this product is careful about
  // that, and a summary that says "you are now on Studio" would undo all of it.
  const s = order('studio');
  assert.doesNotMatch(whole(s), /you are now on|upgrade complete|plan updated|activated/i);
});

test('AN UNPRICEABLE PLAN HAS NO ORDER, rather than an order with a blank total', () => {
  // free is a downgrade and enterprise is a conversation; both have a null price, and a summary that
  // renders one as an empty amount is a checkout nobody can reason about.
  for (const id of ['free', 'enterprise']) {
    assert.equal(order(id), null, `${id} must not produce an order summary`);
  }
});

test('NO MISSING FIELD IS EVER RENDERED AS "undefined"', () => {
  const s = orderSummary({
    planName: 'Studio',
    priceMonthly: 49,
    creditsPerMonth: 1000,
    currentPlanName: 'Free',
    currentCreditsPerMonth: 100,
    currency: 'USD',
    formatMoney: (amount, currency) => `${amount} ${currency}`,
    formatNumber: (n) => String(n),
  });
  assert.doesNotMatch(whole(s), /undefined|null|NaN|Invalid/, whole(s));
  for (const line of s.lines) {
    assert.ok(line.label.length > 0 && line.value.length > 0, 'a blank row in an order summary is worse than no row');
  }
});

test('the currency is the one the server reported, not the one the table is written in', () => {
  const s = orderSummary({
    planName: 'Studio', priceMonthly: 49, creditsPerMonth: 1000,
    currentPlanName: 'Free', currentCreditsPerMonth: 100,
    currency: 'EUR',
    formatMoney: (amount, currency) => `${amount} ${currency}`,
    formatNumber: (n) => String(n),
  });
  assert.match(whole(s), /EUR/, 'the charge currency comes from /api/billing/config, not from a constant here');
  assert.doesNotMatch(whole(s), /USD/);
});
