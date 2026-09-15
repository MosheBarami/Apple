/**
 * WHAT THE PAGE IS ALLOWED TO SAY AFTER SAVING THE INVOICE FIELDS.
 *
 * The save has three outcomes and they are genuinely different facts:
 *   - written here AND on the Stripe customer, so the next invoice carries them;
 *   - written here and REFUSED by Stripe, so the document does not have them yet;
 *   - written here with no Stripe customer to write to at all, because nothing has been bought.
 *
 * Collapsing the middle one into the first is this codebase's own recurring defect — a failure to
 * observe rendered as an observation — landing this time on a document about money. So the sentence
 * is a function with a test rather than a ternary in a form, and the assertions read the whole
 * sentence back: a view can legitimately carry no value, and template interpolation renders that as
 * the literal text "undefined".
 *
 * Run with:  node --test tests/billing-details-copy.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'billing-details-copy-')), 'copy.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src', 'lib', 'billing-copy.ts'), '--bundle', '--format=esm', '--platform=neutral',
   '--main-fields=main,module', '--outfile=' + out], { stdio: 'pipe' });
const { billingDetailsSaveLine } = await import(`file://${out}`);

const line = (v) => billingDetailsSaveLine(v);

test('a save that reached Stripe says the invoices will carry it', async () => {
  const r = line(true);
  assert.equal(r.tone, 'ok');
  assert.match(r.text, /invoice/i);
  assert.doesNotMatch(r.text, /undefined|null|\[object/i);
});

test('A SAVE STRIPE REFUSED IS NOT REPORTED AS A SAVE THAT WORKED', async () => {
  // The whole reason this function exists. The values are kept and the next save re-sends them, so
  // this is recoverable — but until it is, the document does not carry them, and saying otherwise
  // is a sentence about a printed invoice assembled out of a failed request.
  const r = line(false);
  assert.notEqual(r.tone, 'ok', 'a failed sync must not read as a success in any styling');
  assert.match(r.text, /not|could ?n.?t|yet/i, 'it has to say the invoice does not have them yet');
  assert.doesNotMatch(r.text, /undefined|null|\[object/i);
  assert.notEqual(r.text, line(true).text, 'and it must not be the same sentence as a success');
});

test('no Stripe customer yet is its own answer, not a failure', async () => {
  // Nothing has been bought, so there is nothing to write to. Reporting that as an error sends
  // somebody hunting a fault that is not there; reporting it as a success claims an invoice that
  // does not exist carries the fields.
  const r = line(null);
  assert.notEqual(r.tone, 'warn');
  assert.match(r.text, /saved|kept|stored/i);
  assert.doesNotMatch(r.text, /undefined|null|\[object/i);
  assert.notEqual(r.text, line(true).text);
});

test('a worker that does not send the field produces NO sentence, rather than a guessed one', async () => {
  // An older worker answers without `synced`. "We saved it everywhere" inferred from a missing
  // field is exactly the claim this file exists to prevent.
  assert.equal(line(undefined), null);
  assert.equal(line('true'), null, 'and a string is not a boolean');
  assert.equal(line(1), null);
});

// --- and the page actually uses it ----------------------------------------------------------

const usageCode = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8');

test('the billing page renders the three fields and saves them through the client', async () => {
  // A tested pure function nothing calls is the most expensive kind of dead code: it reads like
  // protection in every review it survives.
  assert.match(usageCode, /saveBillingDetails/, 'the page must call the save');
  assert.match(usageCode, /fetchBillingDetails/, 'and read what is already there');
  assert.match(usageCode, /billingDetailsSaveLine/, 'and say what happened using the tested sentence');
  for (const field of ['poNumber', 'name', 'email']) {
    assert.match(usageCode, new RegExp(field), `the ${field} field must be on the page`);
  }
});

test('the form is pre-filled from the record, so saving it back cannot blank a field', async () => {
  // A form that opened empty over a stored value would send three nulls the moment somebody edited
  // one of them — and the worker would then clear two fields nobody touched.
  assert.match(usageCode, /value=\{form[[.]/, 'the input value must be read out of the loaded record');
  assert.match(usageCode, /setForm\(stored\.data\.details\)/, 'and the record must be what seeds it');
});
