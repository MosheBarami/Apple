/**
 * "ADDRESS CONFIRMED" WAS PRINTED FOR A TOKEN NOBODY CHECKED.
 *
 * From the deployed review, 2026-09-20: a reviewer opened /app/confirm with a token they invented
 * and the product answered "Address confirmed — your address is verified." Nothing had been
 * verified. The page had two states — the link declared a failure, or it did not — and "did not"
 * rendered success.
 *
 * A confirmation is established by a SESSION. Supabase parses the link, exchanges it, and a session
 * is what that produces. No failure and no session does not mean success; it means this page cannot
 * tell, which is exactly what somebody whose mail client cut the link in half has hit.
 *
 * Source assertions, because the alternative needs a browser and a live identity service — and the
 * property is a BRANCH, which is visible.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'routes', 'auth-pages.tsx'), 'utf8');

/**
 * The component WITHOUT its comments, and that is not tidiness.
 *
 * The first version of this file asserted on positions in the raw source, and three tests failed
 * for a reason worth keeping: the comment explaining the defect quotes the sentence the defect
 * printed — "Address confirmed" — so `indexOf('Address confirmed')` found the explanation, 492
 * characters in, rather than the card 5,000 characters later. Every ordering assertion then
 * compared against the wrong offset.
 *
 * It is the same mistake the credit-purchase scanner made on the same day: a checker that cannot
 * tell code from prose about code reports the explanation as the thing it was looking for. The
 * general fix is not a cleverer string; it is to stop reading the comments.
 */
const page = (() => {
  const start = SRC.indexOf('export function ConfirmEmailPage');
  assert.ok(start > 0, 'ConfirmEmailPage is gone — re-aim this file before trusting it');
  const next = SRC.indexOf('\nexport function ', start + 10);
  const raw = SRC.slice(start, next === -1 ? SRC.length : next);
  const stripped = raw
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  assert.ok(stripped.length > 1500, 'the comment strip ate the component — re-aim it');
  assert.ok(!stripped.includes('the original defect'), 'comments survived the strip');
  return stripped;
})();

test('THERE ARE THREE STATES, and the third is the honest one', () => {
  assert.match(page, /'checking'\s*\|\s*'yes'\s*\|\s*'unknown'/,
    'the page is back to two states, and the second one is the success card');
});

test('IT STARTS AT "checking", so nothing is claimed before the session is known', () => {
  assert.match(page, /useState<'checking' \| 'yes' \| 'unknown'>\('checking'\)/,
    'starting anywhere else renders a verdict for at least one frame — the same lie told faster');
});

test('a session is what establishes the confirmation, and nothing else does', () => {
  assert.match(page, /supabase\.auth\.getSession\(\)/);
  assert.match(page, /if \(data\.session\)/, 'the success path no longer depends on a session');
  assert.match(page, /setConfirmed\('yes'\)/);
});

test('NO SESSION IS "unknown", NOT SUCCESS — this is the defect itself', () => {
  // AIMED AT THE FALL-THROUGH, not at two indexes. The obvious version asserted that some
  // `setConfirmed('unknown')` appears after some `setConfirmed('yes')` — and when I mutated the
  // fall-through back to 'yes' it stayed GREEN, because the rejection handler further down still
  // contained an 'unknown' at a higher index. A test that passes under the exact regression it
  // names is worse than no test, so this reads the statement that actually runs when there is no
  // session: the one between the end of the `if (data.session)` block and the end of the callback.
  const check = page.indexOf('if (data.session)');
  assert.ok(check > 0, 'the session check is gone — re-aim this before trusting it');
  const afterBlock = page.indexOf('return;', check);
  const endOfCallback = page.indexOf('}, ()', check);
  assert.ok(afterBlock > 0 && endOfCallback > afterBlock, 'the callback shape changed — re-aim this');
  const fallThrough = page.slice(afterBlock, endOfCallback);
  assert.match(fallThrough, /setConfirmed\('unknown'\)/,
    'the no-session path does not set unknown — this is exactly the defect: no session being treated as success');
  assert.doesNotMatch(fallThrough, /setConfirmed\('yes'\)/,
    'the no-session path claims a confirmation it has no evidence for');
});

test('a THROWN session lookup is also unknown, or the defect returns wearing a different shape', () => {
  // getSession rejecting is not a confirmation. The original bug was a fall-through to success;
  // an unhandled rejection is the same fall-through.
  const rejectionHandler = /\},\s*\(\)\s*=>\s*\{[\s\S]{0,120}setConfirmed\('unknown'\)/;
  assert.match(page, rejectionHandler, 'the promise has no rejection path, so an error renders the success card');
});

test('the success card is unreachable unless confirmed === "yes"', () => {
  const unknownGuard = page.indexOf("if (confirmed === 'unknown')");
  const successCard = page.indexOf('Address confirmed');
  assert.ok(unknownGuard > 0, 'there is no unknown branch to return early from');
  assert.ok(unknownGuard < successCard,
    'the success card renders before the unknown state is handled, so it is reachable without a session');
});

test('the unknown card does not call the link broken, because nothing said it was', () => {
  const start = page.indexOf("if (confirmed === 'unknown')");
  const card = page.slice(start, page.indexOf('Address confirmed'));
  assert.match(card, /could not tell/i, 'the card claims more than it knows in one direction or the other');
  assert.doesNotMatch(card, /did not work|has expired/,
    'this is not a failure card: no failure was reported, and saying one was is the opposite error');
  assert.match(card, /just sign in/i, 'it does not offer the path for somebody who HAS already confirmed');
});
