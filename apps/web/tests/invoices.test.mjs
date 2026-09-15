/**
 * WHAT /usage IS ALLOWED TO SAY ABOUT AN INVOICE.
 *
 * Until now the answer was "nothing": the only route to an invoice was a button that left the
 * product for Stripe's hosted portal. So a customer could be told in our own inbox that a payment
 * failed, and could not see the invoice it was about anywhere in the thing they were paying for.
 *
 * Two halves are tested here, because the failure modes are different in kind:
 *
 *   1. THE COPY, as pure functions. A money amount that renders as "0.00" when the field was
 *      actually absent is a real-looking sentence about a charge nobody made, and a status this
 *      product does not recognise must read as unrecognised rather than being guessed into "Paid".
 *   2. THE WIRING, read off the route source. apps/web has no DOM renderer, so nothing here mounts
 *      the page; these pin that the list is fetched, that each row links the PDF Stripe gave us,
 *      and that the detail is fetched per invoice rather than being invented client-side.
 *
 * Run with:  node --test tests/invoices.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'invoice-copy-')), 'copy.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'billing-copy.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { invoiceStatusPill, formatMoney, invoiceAmountMinor } = await import(`file://${out}`);

const usage = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8');
const api = readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8');
const css = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');
/** Source with comments stripped, so a class named in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const usageCode = code(usage);

// ------------------------------------------------------------------------- the payment status

test('EVERY STRIPE INVOICE STATUS HAS A WORD A PERSON USES', () => {
  // Stripe's five, which are the only five it sends.
  assert.deepEqual(invoiceStatusPill('paid'), { label: 'Paid', tone: 'paid' });
  assert.deepEqual(invoiceStatusPill('open'), { label: 'Due', tone: 'due' });
  assert.deepEqual(invoiceStatusPill('draft'), { label: 'Draft', tone: 'neutral' });
  assert.deepEqual(invoiceStatusPill('uncollectible'), { label: 'Unpaid', tone: 'failed' });
  assert.deepEqual(invoiceStatusPill('void'), { label: 'Voided', tone: 'neutral' });
});

test('A STATUS WE DO NOT RECOGNISE READS AS UNRECOGNISED, never as Paid', () => {
  // The failure that matters: a status this product has not seen before must not be collapsed into
  // the reassuring end of the range. "Paid" printed over an unpaid invoice is the single most
  // expensive sentence on this page.
  for (const unknown of [null, undefined, '', 'PAID', 'settled', 'partially_refunded', 42, {}]) {
    const pill = invoiceStatusPill(unknown);
    assert.equal(pill.tone, 'neutral', `${String(unknown)} must not claim a state`);
    assert.doesNotMatch(pill.label, /paid$/i, `${String(unknown)} must not read as Paid`);
    assert.ok(pill.label.length > 0, 'and it must still render something');
  }
});

// ---------------------------------------------------------------------------------- the money

test('AN ABSENT AMOUNT IS NOTHING, not 0.00', () => {
  // `Number(null)` is 0. A zero here prints as a real charge of nothing, on a page whose whole
  // purpose is letting somebody check a number against their bank statement.
  assert.equal(formatMoney(null, 'usd'), null);
  assert.equal(formatMoney(undefined, 'usd'), null);
  assert.equal(formatMoney(NaN, 'usd'), null);
  assert.equal(formatMoney(2900, null), null, 'an amount with no currency is not an amount');
  assert.equal(formatMoney(2900, 'dollars'), null, 'and neither is one with a currency that is not a code');
});

test('a real amount is rendered in its own currency, minor units and all', () => {
  const usd = formatMoney(2900, 'usd', 'en-US');
  assert.ok(usd.includes('29.00'), usd);
  assert.match(usd, /\$|USD/, `the currency has to be visible: ${usd}`);
  assert.equal(formatMoney(0, 'usd', 'en-US').includes('0.00'), true, 'a genuine zero still renders');
  const eur = formatMoney(1250, 'eur', 'en-US');
  assert.ok(eur.includes('12.50'), eur);
  assert.doesNotMatch(eur, /\$\d/, 'and a euro invoice must not print a dollar sign');
});

test('THE AMOUNT SHOWN IS THE ONE THE STATUS IS ABOUT', () => {
  // A paid invoice shows what was taken; an open one shows what is owed. Showing amount_paid on an
  // open invoice would print "0.00" beside "Due", which reads as a bill for nothing.
  assert.equal(invoiceAmountMinor({ status: 'paid', amountPaid: 2900, amountDue: 2900 }), 2900);
  assert.equal(invoiceAmountMinor({ status: 'open', amountPaid: 0, amountDue: 2900 }), 2900);
  assert.equal(invoiceAmountMinor({ status: 'uncollectible', amountPaid: 0, amountDue: 2900 }), 2900);
  assert.equal(invoiceAmountMinor({ status: 'paid', amountPaid: null, amountDue: 2900 }), 2900,
    'and it falls back rather than printing nothing when one half is unreadable');
  assert.equal(invoiceAmountMinor({ status: 'paid', amountPaid: null, amountDue: null }), null);
  assert.equal(invoiceAmountMinor(null), null);
});

// ------------------------------------------------------------------------------- the wiring

test('THE INVOICE LIST IS ACTUALLY FETCHED AND RENDERED on /usage', () => {
  assert.match(api, /fetchInvoices/, 'the client needs a reader');
  assert.match(api, /'\/api\/billing\/invoices'/, 'pointed at the route the worker serves');
  assert.match(usageCode, /fetchInvoices/, 'and the page must call it');
  assert.match(usageCode, /<InvoiceList\b|function InvoiceList/, 'and render the rows');
});

test('EVERY ROW OFFERS THE PDF STRIPE ALREADY SCOPED FOR IT', () => {
  // Not proxied through the worker: Stripe's URL is already scoped and expiring, and proxying the
  // bytes would make the worker a general-purpose document fetcher wearing our authentication.
  assert.match(usageCode, /pdfUrl/, 'the row must read the pdf link');
  assert.match(usageCode, /href=\{[^}]*pdfUrl/, 'and put it in an anchor, not a fetch');
  assert.doesNotMatch(usageCode, /api\/billing\/invoices\/[^']*\/pdf/, 'there is no proxy route to call');
});

test('THE DETAIL IS ASKED OF THE SERVER, never assembled from the row', () => {
  // Line items, subtotal and tax are not on the list response. A page that "expanded" a row by
  // showing the summary again would look like a detail view and contain no detail.
  assert.match(api, /fetchInvoice\b/, 'a per-invoice reader');
  assert.match(api, /api\/billing\/invoices\/\$\{/, 'addressing one invoice by id');
  assert.match(usageCode, /fetchInvoice\(/, 'and the expanded row must call it');
  assert.match(usageCode, /lines/, 'and render the line items it returns');
});

test('the status pill and the money formatter come from billing-copy, not from the component', () => {
  // Two independent readings of one payload is how a page comes to print two different answers
  // about the same charge. These are tested above as pure functions; the page must use them.
  assert.match(usageCode, /invoiceStatusPill/);
  assert.match(usageCode, /formatMoney/);
});

test('THE ROWS HAVE STYLES, so this does not ship as unstyled text', () => {
  // A list of raw <li>s under a heading is how a billing surface reads as broken. Each class the
  // component names has to exist in the stylesheet.
  for (const cls of ['invoice-list', 'invoice-row', 'invoice-pill', 'invoice-detail']) {
    assert.ok(usageCode.includes(cls), `the component must use .${cls}`);
    assert.match(css, new RegExp(`\\.${cls}\\b`), `.${cls} must be styled`);
  }
  for (const tone of ['paid', 'due', 'failed', 'neutral']) {
    assert.match(css, new RegExp(`\\.invoice-pill--${tone}\\b`), `the ${tone} pill needs a colour`);
  }
});
