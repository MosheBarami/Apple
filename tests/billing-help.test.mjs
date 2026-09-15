/**
 * The page that answers a billing question, and the guard that stops it lying.
 *
 * The product can take money — checkout, a Stripe portal, a signature-verified webhook, purchased
 * credits — and had no written word about any of it. The docs nav had five sections and no billing
 * entry; /docs/sparks-and-limits covers the quota and its only money words are "no card"; the FAQ
 * has ten questions and not one about a failed payment, an invoice, or cancelling. The pricing
 * page's FAQ answers "why is there a limit at all". So the first time a card is declined, the
 * product's entire published position is an email address.
 *
 * THE INTERESTING ASSERTION IS THE LAST ONE. A billing page is the easiest kind of documentation to
 * leave behind: the copy says "your access continues while the card is retried" and stays saying it
 * long after someone tightens the entitlement rule. So the claims this page makes are checked
 * against apps/worker/src/billing.ts, which is what actually decides. If the code changes, this
 * goes red naming the sentence that became false.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');

const PAGE_PATH = join(ROOT, 'apps', 'site', 'src', 'pages', 'docs', 'billing.astro');
const LAYOUT = read('apps', 'site', 'src', 'layouts', 'DocsLayout.astro');
const USAGE = read('apps', 'web', 'src', 'routes', 'usage.tsx');
const BILLING_SRC = read('apps', 'worker', 'src', 'billing.ts');

test('the page exists and is built from the docs layout', () => {
  assert.ok(existsSync(PAGE_PATH), 'there is no /docs/billing page');
  assert.match(readFileSync(PAGE_PATH, 'utf8'), /DocsLayout/, 'the page does not use the docs layout');
});

test('it is in the navigation, so it is not an orphan', () => {
  // The layout's own header records why this rule exists: four pages had already shipped reachable
  // only by typing their URL.
  assert.match(LAYOUT, /href: '\/docs\/billing'/, '/docs/billing is absent from the docs nav');
});

test('it answers the four questions a billing problem actually produces', () => {
  const page = readFileSync(PAGE_PATH, 'utf8').toLowerCase();
  const required = [
    ['a declined or failed payment', /declin|payment fail|did not go through/],
    ['where invoices are', /invoice/],
    ['how to cancel and what happens then', /cancel/],
    ['a payment that went through but has not applied', /webhook|has not applied|still shows/],
  ];
  for (const [what, pattern] of required) {
    assert.match(page, pattern, `the page does not cover ${what}`);
  }
  // And it must route people to the place the product actually keeps these things.
  assert.match(page, /\/app\/usage/, 'the page never says where the billing portal is reached from');
});

test('the claim that access continues through a retry is still true of the code', () => {
  // The page tells a customer their plan keeps working while Stripe retries a card. That is only
  // true while 'past_due' entitles. If someone tightens this, the sentence becomes a lie that
  // nothing else would catch.
  const set = /const ENTITLING_STATUSES = new Set\(\[([^\]]*)\]\)/.exec(BILLING_SRC);
  assert.ok(set, 'ENTITLING_STATUSES is gone — the page’s claim about retries cannot be checked');
  assert.match(set[1], /'past_due'/, 'past_due no longer entitles: /docs/billing now promises access it does not grant');
});

test('the claim that a lapsed period drops you to free is still true of the code', () => {
  assert.match(BILLING_SRC, /now > sub\.currentPeriodEnd\) return 'free'/, 'the lapse rule the page describes is gone');
});

test('the app links to it from the one screen where money is handled', () => {
  assert.match(USAGE, /\/docs\/billing/, '/usage offers no route to the billing documentation');
});
