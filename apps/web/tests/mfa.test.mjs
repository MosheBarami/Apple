/**
 * TWO-STEP VERIFICATION — the decisions, without a browser.
 *
 * Everything on this surface is a sentence about somebody's account security, and three of those
 * sentences are dangerous to get wrong in the quiet direction:
 *
 *   1. "Two-step verification is off." Printed because a request failed, that is an invitation to
 *      enrol a second factor on an account that already has one, on a screen that has just told the
 *      owner their defence is not there. `factorsState` refuses to say `off` unless it actually
 *      read a well-formed, empty list.
 *
 *   2. "You are signed in." Printed because the assurance-level read failed, that is a password-only
 *      sign-in to an account whose owner asked for a code every time. `secondStep` fails CLOSED and
 *      says which of the two it is doing.
 *
 *   3. A QR image whose source came from the network unchecked. It is rendered into the one screen
 *      the user is being asked to trust while they hold their phone up to it.
 *
 * Run with:  node --test tests/mfa.test.mjs      (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  TOTP_CODE_LENGTH,
  codeProblem,
  enrollment,
  factorsState,
  normaliseCode,
  secondStep,
  verifiedTotpFactors,
} from '../src/lib/mfa.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

/** One verified factor, exactly as `supabase.auth.mfa.listFactors()` returns it. */
const FACTOR = {
  id: '4e2f1c9a-0b5d-4a77-9d2c-6f1e0a3b8c55',
  friendly_name: 'Phone',
  factor_type: 'totp',
  status: 'verified',
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
};

/* ------------------------------------------------- off, or unreadable: not the same --- */

test('OFF IS ONLY SAID AFTER READING AN EMPTY LIST', () => {
  const off = factorsState({ loading: false, error: null, data: { all: [], totp: [] } });
  assert.equal(off.state, 'off');
});

test('A FAILED READ IS NOT "OFF" — the sentence that invites a second enrolment', () => {
  const failed = factorsState({ loading: false, error: new Error('Failed to fetch'), data: undefined });
  assert.equal(failed.state, 'unavailable');
  assert.match(failed.message, /could not/i, 'and it says so rather than reporting a state it never read');

  // The pair that makes the claim: these two must not be the same answer.
  const off = factorsState({ loading: false, error: null, data: { all: [], totp: [] } });
  assert.notEqual(failed.state, off.state);
});

test('a payload that is not shaped like an answer is unavailable, not empty', () => {
  // A proxy that returns HTML, a provider that changes a field, a truncated JSON body. Every one
  // of these arrives as "no factors" to a `data?.totp?.length` check.
  for (const data of [null, undefined, 'ok', 42, [], {}, { all: 'nope' }, { totp: {} }]) {
    const s = factorsState({ loading: false, error: null, data });
    assert.equal(s.state, 'unavailable', `${JSON.stringify(data)} must not read as "off"`);
  }
});

test('loading is its own state, and outranks everything', () => {
  assert.equal(factorsState({ loading: true, error: null, data: undefined }).state, 'loading');
  assert.equal(factorsState({ loading: true, error: new Error('x'), data: undefined }).state, 'loading');
});

test('a verified factor turns the panel on and carries what the row has to show', () => {
  const on = factorsState({ loading: false, error: null, data: { all: [FACTOR], totp: [FACTOR] } });
  assert.equal(on.state, 'on');
  assert.equal(on.factors.length, 1);
  assert.equal(on.factors[0].id, FACTOR.id);
  assert.equal(on.factors[0].friendlyName, 'Phone');
  assert.equal(on.factors[0].createdAt, Date.parse(FACTOR.created_at));
});

test('an UNVERIFIED factor does not count as protection', () => {
  // `enroll()` creates the factor before the code is ever checked. An abandoned enrolment leaves
  // one of these behind, and counting it would tell someone they are protected by a factor that
  // cannot be challenged.
  const pending = { ...FACTOR, status: 'unverified' };
  const s = factorsState({ loading: false, error: null, data: { all: [pending], totp: [] } });
  assert.equal(s.state, 'off', 'an unverified factor is not a second step');
});

test('a row with no id is dropped rather than rendered as a button that cannot act', () => {
  const nameless = { ...FACTOR, id: '' };
  assert.deepEqual(verifiedTotpFactors({ all: [nameless] }), []);
  const s = factorsState({ loading: false, error: null, data: { all: [nameless] } });
  assert.equal(s.state, 'off');
});

test('a factor of another type is not counted by the TOTP panel', () => {
  const phone = { ...FACTOR, factor_type: 'phone' };
  assert.deepEqual(verifiedTotpFactors({ all: [phone] }), []);
});

test('an unreadable created_at is null, not a date in 1970', () => {
  const odd = { ...FACTOR, created_at: 'whenever' };
  assert.equal(verifiedTotpFactors({ all: [odd] })[0].createdAt, null);
});

/* -------------------------------------------------------------- the sign-in step --- */

test('AN ACCOUNT WITH A FACTOR OWES A CODE BEFORE IT IS SIGNED IN', () => {
  const step = secondStep({ currentLevel: 'aal1', nextLevel: 'aal2', currentAuthenticationMethods: [] }, null);
  assert.equal(step.step, 'code');
});

test('an account without one is simply in', () => {
  const step = secondStep({ currentLevel: 'aal1', nextLevel: 'aal1', currentAuthenticationMethods: [] }, null);
  assert.equal(step.step, 'in');
});

test('a session that has ALREADY passed the code is in, not asked again', () => {
  const step = secondStep({ currentLevel: 'aal2', nextLevel: 'aal2', currentAuthenticationMethods: [] }, null);
  assert.equal(step.step, 'in');
});

test('WHEN THE LEVEL CANNOT BE READ, NOBODY IS WAVED THROUGH', () => {
  // The defect this pins is the natural implementation: `if (data?.nextLevel === 'aal2') ask()`.
  // A thrown request, a null body or a renamed field all evaluate to "no code needed", which is a
  // password-only sign-in to an account whose owner asked for a code every time — and it happens
  // precisely when something is interfering with the network.
  const failures = [
    [null, new Error('Failed to fetch')],
    [undefined, null],
    [{}, null],
    [{ currentLevel: null, nextLevel: null }, null],
    [{ currentLevel: 'aal1' }, null],
    [{ currentLevel: 1, nextLevel: 2 }, null],
    ['aal2', null],
  ];
  for (const [data, error] of failures) {
    const step = secondStep(data, error);
    assert.equal(step.step, 'blocked', `${JSON.stringify(data)} must not read as "signed in"`);
    assert.ok(step.message.length > 0, 'and the screen must be able to say what happened');
  }
});

/* ------------------------------------------------------------------- the code --- */

test('the code is six digits, and says so once rather than four ways', () => {
  assert.equal(codeProblem('123456'), null);
  assert.equal(codeProblem('123 456'), null, 'a space is how the app displays it');
  assert.ok(codeProblem(''));
  assert.ok(codeProblem('12345'));
  assert.ok(codeProblem('1234567'));
  assert.ok(codeProblem('12345a'));
  assert.ok(codeProblem(null));
  assert.ok(codeProblem(123456), 'a number is not what an input gives you');
  assert.equal(TOTP_CODE_LENGTH, 6);
});

test('the code is normalised before it is sent, not after it is refused', () => {
  assert.equal(normaliseCode(' 123 456 '), '123456');
  assert.equal(normaliseCode('123-456'), '123456');
  assert.equal(normaliseCode(undefined), '');
});

/* -------------------------------------------------------------- the enrolment --- */

const ENROLL = {
  id: 'f0a1b2c3-d4e5-4678-9abc-def012345678',
  type: 'totp',
  totp: {
    qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg"></svg>',
    secret: 'JBSWY3DPEHPK3PXP',
    uri: 'otpauth://totp/Apple:someone@example.com?secret=JBSWY3DPEHPK3PXP',
  },
};

test('an enrolment carries the factor id and the secret the user can type instead', () => {
  const e = enrollment(ENROLL);
  assert.ok(e);
  assert.equal(e.factorId, ENROLL.id);
  assert.equal(e.secret, 'JBSWY3DPEHPK3PXP');
  assert.equal(e.qrCode, ENROLL.totp.qr_code);
});

test('A QR SOURCE THAT IS NOT AN INLINE IMAGE IS DROPPED', () => {
  // This string is put straight into an `<img src>` on the screen a person is being asked to trust
  // while they hold up their phone. A remote URL there is a beacon that fires on every enrolment;
  // it is also not something this provider has any reason to send.
  for (const qr of [
    'https://example.com/qr.png',
    '//example.com/qr.png',
    'javascript:alert(1)',
    'data:text/html,<script>',
    '',
    null,
    42,
  ]) {
    const e = enrollment({ ...ENROLL, totp: { ...ENROLL.totp, qr_code: qr } });
    assert.ok(e, 'the enrolment itself survives — the secret is still typeable');
    assert.equal(e.qrCode, null, `${String(qr)} must not reach an img src`);
  }
});

test('an enrolment with no id is not an enrolment', () => {
  for (const data of [null, undefined, {}, { id: '' }, { id: 42 }, 'ok', []]) {
    assert.equal(enrollment(data), null, `${JSON.stringify(data)} must not become an enrolment`);
  }
});

test('an enrolment with an id and no TOTP block is usable but empty-handed', () => {
  // The caller has to be able to tell this apart from a normal enrolment, or it renders two empty
  // boxes and a "scan this" instruction pointing at nothing.
  const e = enrollment({ id: ENROLL.id, type: 'totp', totp: null });
  assert.ok(e);
  assert.equal(e.factorId, ENROLL.id);
  assert.equal(e.secret, null);
  assert.equal(e.qrCode, null);
});

/* ------------------------------------------------------------------ the wiring --- */

test('the settings page has a row for it, and the search index knows the words people use', () => {
  // A control nobody can find is a control nobody has. The section search is how this page is
  // navigated, and `settings-search.test.mjs` pins every row to an entry.
  const settings = readFileSync(join(SRC, 'routes', 'settings.tsx'), 'utf8');
  assert.match(settings, /<Row id="two-step"/, 'the Security section must carry the row');
  const search = readFileSync(join(SRC, 'lib', 'settings-search.ts'), 'utf8');
  assert.match(search, /id: 'two-step'/);
  for (const word of ['two factor', 'authenticator', 'totp']) {
    assert.ok(search.includes(word), `someone will search for "${word}"`);
  }
});

test('REMOVING A FACTOR IS GATED BY THE RE-AUTHENTICATION THE OTHER IDENTITY ACTIONS USE', () => {
  // Turning two-step verification OFF from an unlocked screen is the takeover this whole feature
  // exists to stop. It belongs on the same list as changing the password.
  const flows = readFileSync(join(SRC, 'lib', 'auth-flows.ts'), 'utf8');
  assert.match(flows, /'remove-two-step'/, 'the action must be in SENSITIVE_ACTIONS');
  const reauth = readFileSync(join(SRC, 'components', 'reauth-dialog.tsx'), 'utf8');
  assert.match(reauth, /'remove-two-step':/, 'and the dialog must say why it is asking');
  const settings = readFileSync(join(SRC, 'routes', 'settings.tsx'), 'utf8');
  assert.match(settings, /guard\('remove-two-step'\)/, 'and the button must go through the guard');
});

test('THE GUARDS, NOT ONLY THE FORM, ARE WHAT HOLD A HALF-FINISHED SIGN-IN OUT', () => {
  // A check that lived only in the sign-in handler is finished by closing the tab: the aal1 session
  // is persisted, and a reload walks the restored session into the app past the factor its owner
  // enrolled to stop exactly that. So the question is asked wherever the session is held.
  const auth = readFileSync(join(SRC, 'lib', 'auth.tsx'), 'utf8');
  assert.match(auth, /secondStep\(/, 'the context must read the assurance level through the shared model');

  const authGuard = auth.slice(auth.indexOf('export function AuthGuard('), auth.indexOf('export function GuestGuard('));
  assert.ok(authGuard.length > 0, 'AuthGuard must still exist');
  assert.match(authGuard, /if \(!stepOwed\) return <AuthSplash \/>;/, 'an unanswered question is not a yes');
  assert.match(authGuard, /stepOwed\.step !== 'in'/, 'and anything but a finished sign-in goes back to /login');
  const childrenAt = authGuard.indexOf('return <>{children}</>');
  const checkAt = authGuard.indexOf('stepOwed');
  assert.ok(checkAt >= 0 && childrenAt >= 0 && checkAt < childrenAt, 'the check must precede the app');

  const guest = auth.slice(auth.indexOf('export function GuestGuard('));
  assert.match(
    guest,
    /stepOwed\?\.step === 'in'/,
    'only a COMPLETE sign-in may be bounced off /login — bouncing on the session alone unmounts the code screen',
  );
});

test('the sign-in page asks the model, rather than deciding for itself', () => {
  const page = readFileSync(join(SRC, 'routes', 'auth-pages.tsx'), 'utf8');
  const login = page.slice(page.indexOf('export function LoginPage('), page.indexOf('export function SignupPage('));
  assert.ok(login.length > 0, 'the sign-in page must still exist');
  assert.match(login, /secondStep\(/, 'the second-step decision is the shared one');
  assert.match(login, /getAuthenticatorAssuranceLevel\(/, 'and it is asked on every sign-in');
  const navAt = login.indexOf('navigate(from');
  const stepAt = login.indexOf('secondStep(');
  assert.ok(stepAt >= 0 && navAt >= 0);
  assert.ok(stepAt < navAt, 'the check must happen before the redirect into the app');
});
