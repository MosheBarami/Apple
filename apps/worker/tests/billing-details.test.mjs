/**
 * THE BILLING DETAILS A BUSINESS NEEDS PRINTED ON ITS INVOICES.
 *
 * Three fields decide whether an invoice this product issues is a document a finance department can
 * accept: WHO it is addressed to, WHAT the buying entity is called, and WHICH purchase order it is
 * to be matched against. Before this, all three were whatever Stripe's Checkout page happened to
 * collect once, at the first purchase, and none of them could be corrected afterwards without
 * leaving the product — so a company that reorganised, changed its finance contact, or issued a new
 * PO had invoices that no longer matched its own records and no way to say so here.
 *
 * THE PROPERTY THESE TESTS EXIST FOR is the one that is easy to get wrong and expensive when it is:
 * a blank field in this product's form must never overwrite a value Stripe already holds. Checkout
 * collects a billing name; this form starts empty; the naive update sends `name=` on every save and
 * silently erases the name off every future invoice. So the request builder is given BOTH the new
 * record and the one it replaces, and a key is emitted only when the user actually said something
 * about it — a value to set, or a value of OURS being cleared.
 *
 * Everything here is pure. The route that talks to Stripe cannot be tested without a network; which
 * fields leave, which are refused, and which are left alone can be, and are.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(tmpdir(), `apple-billing-details-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'billing.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const B = await import(`file://${out}`);
rmSync(out, { force: true });

const NONE = { email: null, name: null, poNumber: null };
const read = (raw) => B.readBillingDetails(raw);
const ok = (raw) => {
  const v = read(raw);
  assert.equal(v.ok, true, `expected accepted, got ${v.ok === false ? v.error : 'unknown'}`);
  return v.details;
};
const refused = (raw) => {
  const v = read(raw);
  assert.equal(v.ok, false, 'expected a refusal');
  return v;
};
const body = (next, previous = NONE) => new URLSearchParams(B.buildCustomerDetailsRequest(next, previous));

// --- what the record is allowed to contain -------------------------------------------------

test('the empty record is three nulls, and null is not the empty string', () => {
  // A stored '' would render as an address, a name and a PO of zero length on a document. The
  // absence of a value has to be representable as absence.
  assert.deepEqual(B.NO_BILLING_DETAILS, NONE);
  assert.deepEqual(ok({}), NONE);
});

test('an object is required, because a string body is a caller that did not send a record', () => {
  for (const junk of [null, undefined, 'email@x.com', 42, [], true]) {
    assert.equal(read(junk).ok, false, `${JSON.stringify(junk) ?? 'undefined'} must be refused`);
  }
});

test('surrounding whitespace is removed rather than stored, and stored blanks read as absent', () => {
  assert.deepEqual(ok({ email: '  finance@acme.test  ', name: '  Acme Ltd  ', poNumber: ' PO-4417 ' }), {
    email: 'finance@acme.test',
    name: 'Acme Ltd',
    poNumber: 'PO-4417',
  });
  // Clearing a field is a thing a person does, and it must be expressible.
  assert.deepEqual(ok({ email: '   ', name: '', poNumber: null }), NONE);
});

test('a billing address that is not an address is refused, naming the field', () => {
  for (const bad of ['acme.test', 'a@', '@acme.test', 'a b@acme.test', 'a@acme', 'a@@acme.test']) {
    const v = refused({ email: bad });
    assert.equal(v.status, 400);
    assert.match(v.error, /email/i, `the refusal must name the field the person has to fix (${bad})`);
  }
  assert.equal(ok({ email: 'finance+ap@acme.co.uk' }).email, 'finance+ap@acme.co.uk', 'a real address with a plus survives');
});

test('a non-string where a string belongs is refused, not coerced into the word "undefined"', () => {
  for (const field of ['email', 'name', 'poNumber']) {
    assert.equal(read({ [field]: 7 }).ok, false, `${field} must refuse a number`);
    assert.equal(read({ [field]: { a: 1 } }).ok, false, `${field} must refuse an object`);
  }
});

test('control characters are refused, because these land on a printed document and in a form body', () => {
  // A newline in a name is a second line on an invoice nobody authored; in a urlencoded body it is
  // a value that no longer means what the person typed.
  // The NUL is BUILT rather than written as an escape. A \u0000 in this source is one careless
  // editor away from becoming that byte literally — which turns the file binary and makes grep
  // stop finding anything in it. It happened to billing.ts while this test was being written.
  for (const bad of ['Acme\nLtd', 'Acme\r\nLtd', `Acme${String.fromCharCode(0)}Ltd`, 'PO\t4417']) {
    assert.equal(read({ name: bad }).ok, false, `name ${JSON.stringify(bad)} must be refused`);
    assert.equal(read({ poNumber: bad }).ok, false, `poNumber ${JSON.stringify(bad)} must be refused`);
  }
});

test('each field has a length it cannot exceed, and the refusal says which field', () => {
  const overEmail = `${'a'.repeat(250)}@acme.test`;
  assert.match(refused({ email: overEmail }).error, /email/i);
  assert.match(refused({ name: 'A'.repeat(200) }).error, /name/i);
  assert.match(refused({ poNumber: 'P'.repeat(200) }).error, /purchase order|po/i);
  // And the boundary itself is accepted, so the cap is a cap rather than an off-by-one.
  assert.equal(ok({ name: 'A'.repeat(B.BILLING_NAME_MAX) }).name?.length, B.BILLING_NAME_MAX);
  assert.equal(ok({ poNumber: 'P'.repeat(B.BILLING_PO_MAX) }).poNumber?.length, B.BILLING_PO_MAX);
});

// --- what is sent to Stripe, and what is deliberately not ----------------------------------

test('a value the person set is sent under the field Stripe prints it from', () => {
  const p = body({ email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' });
  assert.equal(p.get('email'), 'finance@acme.test');
  assert.equal(p.get('name'), 'Acme Ltd');
  // The PO is a CUSTOM FIELD on the customer's invoice settings, not metadata: metadata is invisible
  // on the document, and the whole point of a PO reference is that it is printed on it.
  assert.equal(p.get('invoice_settings[custom_fields][0][name]'), B.PO_FIELD_LABEL);
  assert.equal(p.get('invoice_settings[custom_fields][0][value]'), 'PO-4417');
});

test('A BLANK IN OUR FORM DOES NOT ERASE WHAT STRIPE ALREADY HAS', () => {
  // The defect this closes: Checkout collects a billing name at the first purchase, this form opens
  // empty, and an update that sends every key on every save wipes the name off every future
  // invoice. Nothing about that failure is visible from here — it shows up on a document, later.
  const p = body({ email: 'finance@acme.test', name: null, poNumber: null }, NONE);
  assert.equal(p.get('email'), 'finance@acme.test');
  assert.equal(p.has('name'), false, 'a field the person said nothing about must not be in the request at all');
  assert.equal(p.has('invoice_settings[custom_fields]'), false);
  assert.doesNotMatch(B.buildCustomerDetailsRequest({ email: 'a@b.test', name: null, poNumber: null }, NONE), /name/);
});

test('but a value THIS PRODUCT set and the person removed is genuinely cleared', () => {
  // The mirror of the test above, and the reason it cannot simply be "omit every null": a PO that
  // stays printed after the buyer deleted it is a false statement on an invoice, issued monthly.
  const previous = { email: 'old@acme.test', name: 'Old Name Ltd', poNumber: 'PO-1' };
  const p = body(NONE, previous);
  assert.equal(p.get('email'), '', 'an empty value is how Stripe is told to unset a field');
  assert.equal(p.get('name'), '');
  assert.equal(p.get('invoice_settings[custom_fields]'), '', 'the list is cleared as a list, not as an empty row');
  assert.equal(p.has('invoice_settings[custom_fields][0][value]'), false, 'an empty custom field is not a removed one');
});

test('nothing said about anything is an empty request rather than a request that says nothing', () => {
  assert.equal(B.buildCustomerDetailsRequest(NONE, NONE), '');
});

test('a field that did not move is still sent, so a failed earlier save is repaired by the next one', () => {
  // Stripe is not a database we own: a previous update may have failed after we stored ours. Re-
  // sending the values we hold makes every save converge, and costs one field in a form body.
  const same = { email: 'finance@acme.test', name: 'Acme Ltd', poNumber: 'PO-4417' };
  const p = body(same, same);
  assert.equal(p.get('email'), 'finance@acme.test');
  assert.equal(p.get('name'), 'Acme Ltd');
  assert.equal(p.get('invoice_settings[custom_fields][0][value]'), 'PO-4417');
});

// --- and the join with the checkout ---------------------------------------------------------

const LIVE = {
  STRIPE_WEBHOOK_SECRET: 'whsec_x',
  STRIPE_SECRET_KEY: 'sk_test_x',
  STRIPE_PRICE_BUILDER: 'price_builder_1',
  STRIPE_PRICE_STUDIO: 'price_studio_1',
};
const checkout = (over = {}) =>
  new URLSearchParams(
    B.buildCheckoutRequest(LIVE, {
      userId: 'u_1',
      email: 'personal@acme.test',
      plan: 'builder',
      returnTo: 'https://golem.example/app/usage',
      ...over,
    }).body,
  );

test('THE FIRST INVOICE GOES WHERE THE LATER ONES WILL', () => {
  // A billing contact that only takes effect from the second invoice is a setting that does not
  // work on the one occasion it is first needed — the purchase itself.
  assert.equal(checkout({ billingEmail: 'finance@acme.test' }).get('customer_email'), 'finance@acme.test');
});

test('and with no billing contact set it is still the account address, not nothing', () => {
  assert.equal(checkout().get('customer_email'), 'personal@acme.test');
  assert.equal(checkout({ billingEmail: null }).get('customer_email'), 'personal@acme.test');
  assert.equal(checkout({ billingEmail: '   ' }).get('customer_email'), 'personal@acme.test',
    'a blank preference is not a billing address');
});
