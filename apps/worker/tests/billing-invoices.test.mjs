/**
 * THE INVOICES A CUSTOMER IS ALLOWED TO SEE, AND THE SHAPE THEY LEAVE IN.
 *
 * Until now the only way to reach an invoice was Stripe's hosted portal. That is a defensible place
 * for it to live, but it means the product cannot answer "what was I charged, and did it go
 * through" on its own page, and it means a failed payment is visible in our inbox while the invoice
 * it is about is not visible anywhere.
 *
 * TWO PROPERTIES THIS FILE EXISTS FOR, both of which fail silently and expensively:
 *
 *   1. THE ID IN THE PATH IS NOT THE AUTHORISATION. `/api/billing/invoices/:id` interpolates a
 *      caller-supplied string into a Stripe URL. Without a shape check that is a way to address
 *      OTHER Stripe endpoints (`../charges/ch_x`), and without an ownership check against the
 *      caller's own customer id it is a way to read any invoice in the account. Both are enforced
 *      here as pure functions so they can be asserted without a network.
 *   2. THE RAW STRIPE OBJECT NEVER LEAVES. An invoice carries the customer's address, their tax
 *      ids, our internal metadata and payment-intent ids. The mapper is an ALLOWLIST: a field that
 *      is not named here cannot reach a browser, and a new field appearing upstream cannot leak by
 *      default.
 *
 * Run with:  node --test tests/billing-invoices.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-invoices-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

/** A Stripe invoice, with the fields Stripe really sends — including the ones that must not leave. */
const RAW = {
  id: 'in_1ABC',
  object: 'invoice',
  number: 'C0FFEE-0001',
  created: 1_760_000_000,
  status: 'paid',
  amount_paid: 2900,
  amount_due: 2900,
  currency: 'usd',
  hosted_invoice_url: 'https://invoice.stripe.com/i/acct_1/live_abc',
  invoice_pdf: 'https://pay.stripe.com/invoice/acct_1/live_abc/pdf',
  customer: 'cus_mine',
  customer_email: 'buyer@example.com',
  customer_address: { line1: '1 Somewhere St', city: 'Auckland', postal_code: '1010', country: 'NZ' },
  customer_tax_ids: [{ type: 'eu_vat', value: 'DE123456789' }],
  payment_intent: 'pi_secret_looking_thing',
  subscription: 'sub_1',
  metadata: { userId: 'u_1' },
  subtotal: 2900,
  tax: 435,
  total: 3335,
  lines: {
    object: 'list',
    data: [{
      id: 'il_1',
      description: 'Builder — 1 month',
      quantity: 1,
      amount: 2900,
      currency: 'usd',
      period: { start: 1_760_000_000, end: 1_762_592_000 },
      price: { id: 'price_builder_1', unit_amount: 2900, object: 'price' },
      metadata: { internal: 'do not ship' },
    }],
  },
};

// ------------------------------------------------------------------------- the list mapper

test('AN INVOICE IS REDUCED TO WHAT A PERSON NEEDS, and nothing else travels', () => {
  const v = B.mapInvoice(RAW);
  assert.deepEqual(Object.keys(v).sort(), [
    'amountDue', 'amountPaid', 'created', 'currency', 'hostedUrl', 'id', 'number', 'pdfUrl', 'status',
  ], 'the key set IS the allowlist — adding one is a deliberate act');

  assert.equal(v.id, 'in_1ABC');
  assert.equal(v.number, 'C0FFEE-0001');
  assert.equal(v.created, 1_760_000_000);
  assert.equal(v.status, 'paid');
  assert.equal(v.amountPaid, 2900);
  assert.equal(v.currency, 'usd');
});

test('THE CUSTOMER RECORD DOES NOT RIDE ALONG — address, tax id, payment intent, metadata', () => {
  // Everything below is on a real Stripe invoice and none of it is the page's business. A
  // serialised mapper output is checked rather than a key list, so a nested leak is caught too.
  const body = JSON.stringify(B.mapInvoice(RAW));
  for (const secret of ['customer_address', 'Somewhere St', 'DE123456789', 'pi_secret_looking_thing',
    'cus_mine', 'buyer@example.com', 'sub_1', 'u_1']) {
    assert.doesNotMatch(body, new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
      `${secret} must not reach the browser`);
  }
});

test('THE PDF LINK IS CARRIED THROUGH, because that is the whole point of a receipt', () => {
  const v = B.mapInvoice(RAW);
  assert.equal(v.pdfUrl, RAW.invoice_pdf);
  assert.equal(v.hostedUrl, RAW.hosted_invoice_url);
});

test('A LINK THAT IS NOT A STRIPE HTTPS URL IS DROPPED, not rendered', () => {
  // These two fields are put straight into an <a href> on a page the customer is signed in to. They
  // come from Stripe over TLS today, and a guard that costs one comparison is cheaper than ever
  // having to reason about whether that is still true.
  const bad = B.mapInvoice({ ...RAW, invoice_pdf: 'javascript:alert(1)', hosted_invoice_url: 'http://evil.test/x' });
  assert.equal(bad.pdfUrl, null, 'a javascript: url is not a document');
  assert.equal(bad.hostedUrl, null, 'and neither is somebody else’s host over plain http');
});

test('AN UNREADABLE FIELD IS NULL, never a plausible-looking zero', () => {
  // `Number(undefined)` is NaN and `Number(null)` is 0. A 0 here prints as "0.00 USD paid", which
  // is a real-looking sentence about a charge nobody made.
  const v = B.mapInvoice({ id: 'in_2' });
  assert.equal(v.amountPaid, null);
  assert.equal(v.amountDue, null);
  assert.equal(v.created, null);
  assert.equal(v.status, null);
  assert.equal(v.currency, null);
  assert.equal(v.number, null, 'a draft invoice genuinely has no number yet');
});

test('rubbish maps to null rather than to an invoice with no id', () => {
  for (const junk of [null, undefined, 0, '', 'in_1', [], {}, { id: 42 }, { id: '' }]) {
    assert.equal(B.mapInvoice(junk), null, JSON.stringify(junk));
  }
});

test('the LIST mapper drops what it cannot read and keeps Stripe’s order', () => {
  const list = B.mapInvoiceList({ object: 'list', data: [RAW, { nonsense: true }, { ...RAW, id: 'in_2' }] });
  assert.equal(list.length, 2, 'an unreadable row is skipped, not rendered as a blank invoice');
  assert.deepEqual(list.map((i) => i.id), ['in_1ABC', 'in_2']);
  assert.deepEqual(B.mapInvoiceList(null), [], 'and a body that is not a list is an empty list');
  assert.deepEqual(B.mapInvoiceList({ data: 'nope' }), []);
});

// ---------------------------------------------------------------- the id is not the authorisation

test('THE ID IN THE PATH IS SHAPE-CHECKED BEFORE IT REACHES A STRIPE URL', () => {
  assert.equal(B.isInvoiceId('in_1ABCdef123'), true);
  for (const bad of ['../charges/ch_1', 'in_1/../../balance_transactions', 'ch_1', 'in_1?expand[]=customer',
    '', 'in_', 'in_1 2', 'IN_1', 'in_1#x', 'in_1%2F..']) {
    assert.equal(B.isInvoiceId(bad), false, `"${bad}" must never be interpolated into api.stripe.com`);
  }
});

test('AN INVOICE BELONGING TO SOMEBODY ELSE IS REFUSED, whatever the path said', () => {
  // The path id names an invoice; it does not prove the caller may read it. Without this, any
  // signed-in user could page through every invoice this Stripe account has ever issued.
  assert.equal(B.invoiceBelongsTo(RAW, 'cus_mine'), true);
  assert.equal(B.invoiceBelongsTo(RAW, 'cus_someone_else'), false);
  assert.equal(B.invoiceBelongsTo(RAW, null), false, 'no customer of our own is not a match');
  assert.equal(B.invoiceBelongsTo(RAW, ''), false);
  assert.equal(B.invoiceBelongsTo({ id: 'in_x' }, 'cus_mine'), false, 'an invoice with no customer matches nobody');
  // Stripe returns `customer` expanded when asked to. An object is not a string and must not be
  // compared as one — a `[object Object]` on both sides would be a match.
  assert.equal(B.invoiceBelongsTo({ ...RAW, customer: { id: 'cus_mine' } }, 'cus_mine'), false);
});

// -------------------------------------------------------------------------- the detail mapper

test('THE DETAIL ADDS LINE ITEMS AND TOTALS, and still ships no customer record', () => {
  const d = B.mapInvoiceDetail(RAW);
  assert.equal(d.id, 'in_1ABC', 'a detail is a summary plus more, not a different object');
  assert.equal(d.pdfUrl, RAW.invoice_pdf);
  assert.equal(d.subtotal, 2900);
  assert.equal(d.tax, 435);
  assert.equal(d.total, 3335);

  assert.equal(d.lines.length, 1);
  const [line] = d.lines;
  assert.deepEqual(Object.keys(line).sort(), ['amount', 'description', 'period', 'quantity', 'unitAmount']);
  assert.equal(line.description, 'Builder — 1 month');
  assert.equal(line.quantity, 1);
  assert.equal(line.unitAmount, 2900);
  assert.equal(line.amount, 2900);
  assert.deepEqual(line.period, { start: 1_760_000_000, end: 1_762_592_000 });

  const body = JSON.stringify(d);
  assert.doesNotMatch(body, /do not ship|price_builder_1|cus_mine|DE123456789/,
    'line metadata, the price id and the customer are all internal');
});

test('an invoice with no lines is an empty list, and a broken line is dropped', () => {
  assert.deepEqual(B.mapInvoiceDetail({ id: 'in_3' }).lines, []);
  const d = B.mapInvoiceDetail({ id: 'in_4', lines: { data: [null, 'x', { description: 'ok' }] } });
  assert.equal(d.lines.length, 1);
  assert.equal(d.lines[0].description, 'ok');
  assert.equal(d.lines[0].unitAmount, null, 'a line with no price states no unit price');
});

test('mapInvoiceDetail refuses the same rubbish the summary refuses', () => {
  for (const junk of [null, undefined, 'in_1', [], { id: 42 }]) {
    assert.equal(B.mapInvoiceDetail(junk), null);
  }
});
