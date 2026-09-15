/**
 * A PRICE IS A CURRENCY AND AN AMOUNT, NOT A DOLLAR SIGN AND A NUMBER.
 *
 * Every price in the product was rendered as a literal '$' glued to a raw number — in the plan
 * ladder, on the pricing page and on the landing page. Three things are wrong with that, and only
 * the first is cosmetic:
 *
 *   1. The symbol's POSITION is a property of the locale, not of the code. Written as `${'$'}{n}`
 *      it is before the number in every language, including the ones that put it after.
 *   2. '$' does not name a currency. In en-CA and en-AU it reads as the local dollar, and the
 *      amount the customer is actually charged is decided by Stripe's price object, which this tree
 *      never stated anywhere.
 *   3. This app renders RIGHT-TO-LEFT. A bare '$' beside a number is a direction-neutral run next
 *      to a weak-direction run, and the bidi algorithm is free to reorder it; Intl emits the
 *      formatting the locale actually specifies.
 *
 * The assertions below are about BEHAVIOUR under different locales and currencies, which is the
 * only thing that distinguishes a real formatter from a template with a symbol in it.
 *
 * Run with:  node --test tests/money-format.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'money-')), 'shared.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { formatMoney, PRICE_CURRENCY, PLAN_COPY, PLAN_IDS } = await import(`file://${out}`);

// Node is built with full ICU by default; if it were not, every locale below would silently fall
// back to en-US and these tests would pass while proving nothing.
test('CONTROL: this runtime actually has more than one locale', () => {
  assert.notEqual(
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'USD' }).format(12),
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(12),
    'no ICU data: every assertion below would be vacuous',
  );
});

test('a whole-dollar price is written without empty minor units', () => {
  // '$12.00/month' on a pricing page reads as precision that means nothing.
  assert.equal(formatMoney(12, { locale: 'en-US' }), '$12');
  assert.equal(formatMoney(0, { locale: 'en-US' }), '$0');
});

test('and a fractional one keeps them, because $12.5 is not a price', () => {
  assert.equal(formatMoney(12.5, { locale: 'en-US' }), '$12.50');
});

test('THE SYMBOL GOES WHERE THE LOCALE PUTS IT', () => {
  // The property a hardcoded '$' cannot have. German puts the currency after the amount.
  const de = formatMoney(12, { locale: 'de-DE' });
  assert.ok(de.includes('12'), `the amount must survive: ${de}`);
  assert.ok(!de.trimStart().startsWith('$'), `de-DE must not lead with the symbol: ${de}`);
  assert.ok(formatMoney(12, { locale: 'en-US' }).startsWith('$'), 'and en-US must');
});

test('THE CURRENCY IS DATA, NOT A CHARACTER IN A TEMPLATE', () => {
  // The day a second currency exists, this is the line that already works.
  assert.match(formatMoney(12, { locale: 'en-US', currency: 'EUR' }), /€/);
  assert.match(formatMoney(12, { locale: 'en-US', currency: 'JPY' }), /¥/);
  assert.equal(formatMoney(12, { locale: 'en-US', currency: 'JPY' }), '¥12', 'and a zero-decimal currency takes no decimals');
});

test('an unreadable amount renders as nothing rather than as "$NaN"', () => {
  // A price is the one number on the page a user acts on. Printing NaN beside a buy button is
  // worse than printing nothing, and Intl throws rather than returning a string.
  for (const bad of [NaN, Infinity, undefined, null, 'twelve']) {
    assert.equal(formatMoney(bad, { locale: 'en-US' }), '', `formatMoney(${String(bad)})`);
  }
});

test('an unknown currency code falls back rather than throwing', () => {
  // Intl.NumberFormat throws RangeError on a malformed code. A price cell must not be able to take
  // the page down because a server sent something unexpected.
  const r = formatMoney(12, { locale: 'en-US', currency: 'not-a-currency' });
  assert.ok(r.includes('12'), `the amount must still reach the page: ${r}`);
});

test('the declared currency is the one every plan price is quoted in', () => {
  assert.equal(typeof PRICE_CURRENCY, 'string');
  assert.match(PRICE_CURRENCY, /^[A-Z]{3}$/, 'an ISO 4217 code, so Intl and Stripe agree');
});

// ------------------------------------------------------------- and the surfaces actually use it

const sources = {
  'the plan ladder': readFileSync(join(WEB, 'src', 'components', 'plans.tsx'), 'utf8'),
  'the pricing page': readFileSync(join(WEB, '..', 'site', 'src', 'pages', 'pricing.astro'), 'utf8'),
  'the landing page': readFileSync(join(WEB, '..', 'site', 'src', 'pages', 'index.astro'), 'utf8'),
};

test('NO SURFACE GLUES A CURRENCY SYMBOL TO A PRICE ANY MORE', () => {
  // The exact shape that was there: a literal $ immediately before an interpolated amount. It is
  // matched as a shape rather than by a variable name, so renaming the field does not hide it.
  const glued = /\$\s*\{[^}]*(?:price|Price|amount|Amount)[^}]*\}/;
  for (const [what, src] of Object.entries(sources)) {
    const hit = glued.exec(src);
    assert.equal(hit, null, `${what} still hardcodes a currency symbol beside a price: ${hit?.[0]}`);
  }
});

test('every surface that prints a price formats it', () => {
  for (const [what, src] of Object.entries(sources)) {
    assert.match(src, /formatMoney\(/, `${what} must render prices through the shared formatter`);
    assert.match(src, /from '@golem\/shared'/, `${what} must take it from shared, not a local copy`);
  }
});

test('the prices being formatted are the ones the product actually charges', () => {
  // Not a literal in this file: the table the ladder and the pricing page both read.
  for (const id of PLAN_IDS) {
    const price = PLAN_COPY[id].priceUsdMonthly;
    if (price === null) continue;
    const rendered = formatMoney(price, { locale: 'en-US', currency: PRICE_CURRENCY });
    assert.ok(rendered.includes(String(price)), `${id}: ${price} did not survive formatting as ${rendered}`);
  }
});
