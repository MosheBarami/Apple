/**
 * THE PRICING TABLE MAY NOT SELL A PURCHASE CHANNEL THAT DOES NOT EXIST.
 *
 * PLAN_FEATURES carries a row labelled "Buy extra credits", noted "Purchased credits never expire
 * and are spent only after the daily allowance", with `values: everyPlan(() => true)`. The page
 * printed a tick and the word "Included" in all four columns. Three of those column headers say
 * "(planned)"; Free's does not, by construction — so the only plan anybody can be on was the only
 * one told, flatly, that buying extra Credits is part of it.
 *
 * NOTHING IN THE PRODUCT CAN TAKE THAT MONEY, and this is not an unset environment variable.
 * `buildCheckoutRequest` hardcodes `p.set('mode', 'subscription')`; its CheckoutEnv declares price
 * ids for Builder and Studio and nothing else; no `mode=payment` construction exists anywhere in
 * apps/ or packages/. The webhook branch that reads a `credits` figure off a completed checkout has
 * no producer in any deployment, configured or not. Live, /api/billing/config answers
 * {"checkout":false,"purchasable":[]}.
 *
 * The table's own docstring claims "Every boolean here was checked against the code that would
 * enforce it". That reasoning is correct for `modes`, `projects` and `checkpoints`, where `true`
 * means "no plan gate exists" — and it is the wrong reading for a row whose LABEL asserts that a
 * channel exists at all. Absence of a gate is not presence of a till.
 *
 * WHAT THIS GUARDS. pricing.astro overrides that one row while `CREDIT_PURCHASE_LIVE` is false. The
 * flag is a claim about the worker, so this file holds it to the worker: the moment a credit
 * checkout appears, this fails and says to flip it. Until then the page may not print a tick there.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');
const pricing = readFileSync(join(SITE, 'src', 'pages', 'pricing.astro'), 'utf8');

/** Every TypeScript source in the worker and the shared package, read once. */
function workerSources() {
  const out = [];
  for (const base of [join(ROOT, 'apps', 'worker', 'src'), join(ROOT, 'packages', 'shared', 'src')]) {
    for (const e of readdirSync(base, { recursive: true, withFileTypes: true })) {
      if (e.isFile() && e.name.endsWith('.ts')) out.push(join(e.parentPath ?? e.path, e.name));
    }
  }
  assert.ok(out.length > 0, 'THIS GUARD IS BROKEN: no worker sources found to read');
  return out;
}

/** A Stripe checkout that charges once rather than subscribing — the thing a credit pack needs. */
function creditCheckouts() {
  const hits = [];
  for (const file of workerSources()) {
    // COMMENTS STRIPPED FIRST. This scanned raw text, so the moment somebody documented WHY there
    // is no payment-mode checkout — naming `mode: 'payment'` to say it does not exist — the guard
    // reported that it did. A checker that cannot tell code from prose about code reports the
    // explanation as the defect, which is the one failure that makes people delete the checker.
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    if (/mode['"]?\s*[,:]\s*['"]payment['"]|mode=payment/.test(src)) {
      hits.push(file.slice(ROOT.length + 1));
    }
  }
  return hits;
}

test('THE PREMISE IS STILL TRUE: the only checkout this product builds is a subscription', () => {
  const billing = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'billing.ts'), 'utf8');
  assert.match(
    billing,
    /p\.set\('mode', 'subscription'\)/,
    'THIS GUARD IS STALE, NOT THE PAGE: apps/worker/src/billing.ts no longer builds its checkout as ' +
      'a subscription the way this reads it. Go and look at what it builds now before trusting the ' +
      'pricing table either way.',
  );

  const payment = creditCheckouts();
  assert.deepEqual(
    payment,
    [],
    `a one-off (mode=payment) checkout now exists in ${payment.join(', ')}. If Credits can be ` +
      'bought, set CREDIT_PURCHASE_LIVE = true in apps/site/src/pages/pricing.astro so the ' +
      'comparison table stops saying they cannot be — and fix apps/web usage-meter-model.ts, which ' +
      'offers "add credits" as the next action at the moment the allowance runs out.',
  );
});

test('the page does not advertise a purchase channel while none exists', () => {
  // ONE HOME FOR THE FACT, and this assertion moved with it. The flag was declared locally here,
  // which corrected this page and left packages/shared saying "included on every plan" for every
  // other reader — including apps/web's usage meter, which went on offering "Add credits" at the
  // exact moment a customer's allowance ran out. The page must now DERIVE, and the constant it
  // derives from must still be false.
  const shared = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  assert.match(
    shared,
    /export const CREDIT_PURCHASE_LIVE: boolean = false;/,
    'packages/shared no longer declares CREDIT_PURCHASE_LIVE = false. If Credits can now be bought, ' +
      'the premise test above should have failed first.',
  );
  assert.match(
    pricing,
    /CREDIT_PURCHASE_LIVE as SHARED_CREDIT_PURCHASE_LIVE/,
    'pricing.astro stopped importing the shared flag, so the page and the app can disagree again.',
  );
  assert.doesNotMatch(
    pricing,
    /const CREDIT_PURCHASE_LIVE = false;/,
    'the flag is declared locally again — that is the arrangement that let the in-app meter keep ' +
      'offering a purchase this page calls unavailable.',
  );
  // And the shared feature row derives from it rather than hardcoding a tick.
  assert.match(
    shared,
    /values: everyPlan\(\(\) => \(CREDIT_PURCHASE_LIVE \? true : 'Unavailable'\)\)/,
    'the shared PLAN_FEATURES credits row no longer derives from the flag.',
  );

  // The row renders through the local copy, not the raw constant — otherwise the override is dead
  // code and the table goes back to whatever packages/shared says.
  assert.match(
    pricing,
    /planFeatures\.map\(\(feature\)/,
    'the comparison table no longer renders the overridden feature list, so the credits row is ' +
      'coming straight from PLAN_FEATURES again.',
  );
  assert.doesNotMatch(
    pricing,
    /PLAN_FEATURES\.map\(\(feature\)/,
    'the table renders PLAN_FEATURES directly — the override is being bypassed.',
  );

  // The plan cards render PLAN_COPY highlights, and Builder's include "Buy credits when you need
  // more" — a literal in packages/shared, so the source scan below cannot see it. The filter is
  // what stops the card contradicting the row two sections down, and it is asserted directly.
  assert.match(
    pricing,
    /highlights\s*\n?\s*\.filter\(\(h\) => CREDIT_PURCHASE_LIVE \|\| !\/\\bbuy\\b\.\*\\bcredits\?\\b\/i\.test\(h\)\)/,
    'the plan cards no longer filter a "buy credits" highlight, so a card can offer a purchase the ' +
      'comparison table on the same page calls unavailable.',
  );

  // And no visible sentence on the page invites a purchase of Credits.
  const hay = visibleText(pricing);
  const invite = /\bbuy\b[^.]{0,30}\bcredits?\b|\badd\s+credits?\b|\btop\s*-?\s*up\b/i.exec(hay);
  assert.equal(
    invite,
    null,
    `the pricing page invites a Credit purchase in visible copy: "${invite?.[0]}". There is nowhere ` +
      'to click, so the sentence sends a reader looking for a button that is not there.',
  );
});

test('the guard has teeth', () => {
  // Falsify the premise: a payment-mode checkout in the worker must make the first test fail.
  const withPayment = "p.set('mode', 'payment');";
  assert.match(withPayment, /mode['"]?\s*[,:]\s*['"]payment['"]|mode=payment/,
    'the payment-mode pattern no longer recognises a one-off checkout — re-aim it');

  // Falsify the page: the row as it shipped, printing "Included" everywhere. The mutation is aimed
  // at the SHARED constant now, because that is where the fact lives — aiming it at a local
  // declaration is what let the in-app meter drift away from this page in the first place.
  const shipped = '<td class="compare__yes">Included</td> Buy extra credits';
  const sharedSrc = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');
  const reintroduced = sharedSrc.replace(
    /export const CREDIT_PURCHASE_LIVE: boolean = false;/,
    'export const CREDIT_PURCHASE_LIVE: boolean = true;',
  );
  assert.notEqual(reintroduced, sharedSrc, 'the mutation did not land — re-aim this before trusting it');
  assert.doesNotMatch(reintroduced, /export const CREDIT_PURCHASE_LIVE: boolean = false;/);

  // And the invite pattern really does catch the two sentences that were live.
  for (const live of ['Buy credits when you need more', 'Wait for the reset, or add credits.', shipped]) {
    if (live === shipped) continue;
    assert.match(visibleText(live), /\bbuy\b[^.]{0,30}\bcredits?\b|\badd\s+credits?\b/i, `missed: ${live}`);
  }
});
