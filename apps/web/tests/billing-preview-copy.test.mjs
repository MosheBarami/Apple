/**
 * WHAT THE PAGE MAY SAY A TIER CHANGE WILL COST.
 *
 * The ladder prints each tier's monthly price, and for a customer already paying that is not the
 * number they are about to be charged: a mid-period change is prorated, net of a credit for the
 * time already bought on the old tier. `/api/billing/preview` now asks Stripe. This is the half
 * that turns the answer into a sentence, and it exists for the same reason billing-copy's notice
 * does: a component that formats money inline makes the same judgement again in every place it
 * prints one.
 *
 * THE SENTENCE THIS FILE EXISTS TO PREVENT is a number where there is no number. The preview can
 * fail — an unreachable Stripe, a subscription stored before the item id was kept — and the honest
 * answer is "we could not get the amount". Printing "charges $0.00 today" instead would be a claim
 * about money made out of a failure to observe, and it is the shape of defect this codebase keeps
 * finding. Every assertion below reads the WHOLE sentence back rather than checking a formatter ran.
 *
 * Run with:  node --test tests/billing-preview-copy.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'billing-preview-copy-')), 'copy.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'billing-copy.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { planChangePreviewLine } = await import(`file://${out}`);

const DATE = '3 October 2026';
const opts = {
  planName: 'Studio',
  // Real money formatting is tested in @golem/shared. Here it is a stand-in whose output is
  // recognisable in the sentence, so the sentence is what gets asserted.
  formatMoney: (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  formatDate: () => DATE,
};
const preview = (over) => ({ amountDue: 12.34, currency: 'USD', prorationDate: null, lines: [], ...over });

// -------------------------------------------------------------------- the charge, named in full

test('AN UPGRADE NAMES THE AMOUNT AND THE TIER, NOT A MONTHLY PRICE', () => {
  const s = planChangePreviewLine(preview({ amountDue: 12.34 }), opts);
  assert.match(s, /USD 12\.34/, 'the prorated charge, which is not any tier’s monthly price');
  assert.match(s, /Studio/, 'and the tier being moved to');
  assert.match(s, /today/i, 'and that it is charged now rather than at the next renewal');
});

test('the date the change applies from is named when Stripe sent one', () => {
  const s = planChangePreviewLine(preview({ amountDue: 12.34, prorationDate: 1_800_000_000 }), opts);
  assert.match(s, new RegExp(DATE));
});

test('A MISSING DATE IS ABSENT, NEVER THE WORD "undefined"', () => {
  const s = planChangePreviewLine(preview({ amountDue: 12.34, prorationDate: null }), opts);
  assert.doesNotMatch(s, /undefined|NaN|null/, s);
  assert.match(s, /USD 12\.34/, 'and the amount still reaches the reader');
});

test('nothing to pay today says exactly that, and quotes no figure', () => {
  const s = planChangePreviewLine(preview({ amountDue: 0 }), opts);
  assert.match(s, /nothing/i);
  assert.doesNotMatch(s, /0\.00/, 'a zero printed as money reads as a price, not as "no charge"');
});

test('A DOWNGRADE THAT LEAVES A CREDIT READS AS A CREDIT, NOT AS A CHARGE', () => {
  // amount_due comes back negative when the unused time on the old tier is worth more than the new
  // one costs. Calling that "charges -$7.66 today" would be the opposite of what happens.
  const s = planChangePreviewLine(preview({ amountDue: -7.66 }), opts);
  assert.match(s, /credit/i);
  assert.doesNotMatch(s, /charge[sd]? /i, s);
  assert.doesNotMatch(s, /-/, 'the minus sign is carried by the word "credit", not printed twice');
});

// ------------------------------------------------------------- the failure that must stay honest

test('NO PREVIEW MEANS NO NUMBER — the page says it could not get one', () => {
  const s = planChangePreviewLine(null, opts);
  assert.ok(s.length > 0, 'silence is not an option either: the user clicked a thing');
  assert.doesNotMatch(s, /\d/, 'not one digit may appear in a sentence about an amount nobody read');
  assert.match(s, /could not|couldn’t|couldn't/i);
  assert.match(s, /Stripe/, 'and it says where the real figure will be shown');
});

test('a preview whose amount is not a number is treated as no preview at all', () => {
  for (const bad of [{ amountDue: NaN }, { amountDue: undefined }, { amountDue: 'lots' }]) {
    const s = planChangePreviewLine(preview(bad), opts);
    assert.doesNotMatch(s, /\d/, `an amount of ${String(bad.amountDue)} must not reach the reader`);
  }
});

test('a currency the server did not send never renders as "undefined 12.34"', () => {
  const s = planChangePreviewLine(preview({ amountDue: 12.34, currency: undefined }), opts);
  assert.doesNotMatch(s, /undefined/, s);
});
