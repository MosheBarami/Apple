/**
 * THE AGE SCREEN ON EMAIL SIGN-UP (M2 step 2.3, item C2; plan section 7: StudPilot is for people aged 13 and over).
 *
 * WHAT IS HELD, each by running the shipped code and none by reading its spelling:
 *
 *   1. A NEUTRAL SCREEN. The markup a visitor receives asks for a day, a month and a year and shows no threshold: no number, no
 *      "years old", no limit attribute, no sample date.
 *   2. UNDER THE LINE IS REFUSED KINDLY AND NOTHING LEAVES THE BROWSER. No sign-up request, and not even the captcha script
 *      (a request to Cloudflare). The page shows the kind message instead of the form.
 *   3. THE BROWSER REMEMBERS THE REFUSAL, so changing the date and trying again at once does not work, and it still does where
 *      storage is blocked. It is a SOFT block and DECISIONS.md section 12 says so.
 *   4. A PASS SENDS ONE FACT. The sign-up's user metadata is `{ age_gate: 'passed' }` and the birth date is in no argument of any
 *      call. Roblox, Google and Discord sign-ups have no form here (their own rules already require 13 and over; DECISIONS.md).
 *   5. THE BOUNDARY: a person is old enough on the day of their birthday, a date that does not exist is not a date of birth, and
 *      an unreadable date is asked for again in one sentence that says nothing about why.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { findAll, findElement, loadPage, textOf } from './page-harness.mjs';

// A fresh copy of the module per scenario: it keeps a refusal made in this page load in memory (so it holds where storage is
// blocked), and a test must start from a page that has refused nobody.
let copies = 0;
const fresh = () => import(`../src/lib/age-gate.ts?copy=${(copies += 1)}`);
const memory = (initial = {}) => {
  const data = new Map(Object.entries(initial));
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, String(v)), data };
};
const blocked = { getItem() { throw new Error('storage blocked'); }, setItem() { throw new Error('storage blocked'); } };

const NOW = new Date(2026, 9, 5, 12, 0, 0); // 5 October 2026, the device's local calendar
const born = (day, month, year) => ({ day: String(day), month: String(month), year: String(year) });

/* ------------------------------------------------------------------ the boundary --- */

test('a person is old enough ON their birthday, not the day after, and not the day before', async () => {
  const { judgeBirthDate } = await fresh();
  assert.equal(judgeBirthDate(born(5, 10, 2013), NOW).kind, 'pass', 'the day they turn the age');
  assert.equal(judgeBirthDate(born(4, 10, 2013), NOW).kind, 'pass', 'the day after it');
  assert.equal(judgeBirthDate(born(6, 10, 2013), NOW).kind, 'under', 'the day before it');
  assert.equal(judgeBirthDate(born(5, 11, 2013), NOW).kind, 'under', 'a month before');
  assert.equal(judgeBirthDate(born(5, 9, 2013), NOW).kind, 'pass', 'a month after');
  assert.equal(judgeBirthDate(born(1, 1, 2013), NOW).kind, 'pass');
  assert.equal(judgeBirthDate(born(31, 12, 2013), NOW).kind, 'under');
  assert.equal(judgeBirthDate(born(5, 10, 2020), NOW).kind, 'under');
  assert.equal(judgeBirthDate(born(5, 10, 1980), NOW).kind, 'pass');
  assert.equal(judgeBirthDate(born(1, 1, 1900), NOW).kind, 'pass', 'the first year the field takes');
});

test('a leap-day birthday is judged on the calendar, in a year with no 29 February too', async () => {
  const { judgeBirthDate } = await fresh();
  assert.equal(judgeBirthDate(born(29, 2, 2012), new Date(2025, 1, 28)).kind, 'under', '28 February 2025: the 13th birthday has not come');
  assert.equal(judgeBirthDate(born(29, 2, 2012), new Date(2025, 2, 1)).kind, 'pass', '1 March 2025: it has');
  assert.equal(judgeBirthDate(born(29, 2, 2012), new Date(2024, 1, 29)).kind, 'under', 'a year earlier, on a real 29 February, it had not');
  assert.equal(judgeBirthDate(born(29, 2, 2012), new Date(2028, 1, 29)).kind, 'pass', 'and in a later leap year it has');
});

test('a date that does not exist, or is in the future, or is not a date, is INVALID and is never counted as under or over', async () => {
  const { judgeBirthDate } = await fresh();
  for (const [what, date] of [
    ['31 February', born(31, 2, 1990)],
    ['29 February in a common year', born(29, 2, 2011)],
    ['31 April', born(31, 4, 1990)],
    ['month 13', born(1, 13, 1990)],
    ['month 0', born(1, 0, 1990)],
    ['day 0', born(0, 1, 1990)],
    ['day 32', born(32, 1, 1990)],
    ['a 3-digit year', born(1, 1, 199)],
    ['a 2-digit year', born(1, 1, 90)],
    ['a year before 1900', born(1, 1, 1899)],
    ['tomorrow', born(6, 10, 2026)],
    ['next year', born(1, 1, 2027)],
    ['an empty day', { day: '', month: '1', year: '1990' }],
    ['an empty month', { day: '1', month: '', year: '1990' }],
    ['an empty year', { day: '1', month: '1', year: '' }],
    ['letters', { day: 'ab', month: '1', year: '1990' }],
    ['a sign', { day: '-1', month: '1', year: '1990' }],
    ['a decimal', { day: '1.5', month: '1', year: '1990' }],
    ['whitespace', { day: ' ', month: ' ', year: '    ' }],
  ]) {
    assert.equal(judgeBirthDate(date, NOW).kind, 'invalid', what);
  }
  assert.equal(judgeBirthDate(born(29, 2, 2012), NOW).kind, 'pass', 'the positive control: a real leap day is a date');
});

/* ------------------------------------------------------------------ the soft block --- */

test('a refusal is remembered: the same browser is refused again whatever date is typed next', async () => {
  const { signupGate, refusalRemembered, AGE_GATE_KEY } = await fresh();
  const storage = memory();
  assert.equal(refusalRemembered(storage), false, 'nobody has been refused yet');
  assert.deepEqual(signupGate(born(5, 10, 2020), NOW, storage), { kind: 'refused' });
  assert.equal(storage.data.get(AGE_GATE_KEY), '1', 'written to storage');
  assert.deepEqual([...storage.data.keys()], [AGE_GATE_KEY], 'and nothing else is stored');
  assert.equal(storage.data.get(AGE_GATE_KEY).length, 1, 'a flag: not a date, not an age');
  // Changing the date and trying at once does not work.
  assert.deepEqual(signupGate(born(1, 1, 1980), NOW, storage), { kind: 'refused' });
  // And a new page load in the same browser (a fresh module, the same storage) is refused before any date is read.
  const reloaded = await fresh();
  assert.equal(reloaded.refusalRemembered(storage), true, 'it survives a reload');
  assert.deepEqual(reloaded.signupGate(born(1, 1, 1980), NOW, storage), { kind: 'refused' });
});

test('where storage is blocked the refusal still holds for the rest of the page, and a person who was not refused is never blocked by it', async () => {
  const { signupGate, refusalRemembered } = await fresh();
  assert.equal(refusalRemembered(blocked), false, 'storage that cannot be read does not refuse anybody');
  assert.deepEqual(signupGate(born(1, 1, 1980), NOW, blocked).kind, 'go');
  assert.deepEqual(signupGate(born(5, 10, 2020), NOW, blocked), { kind: 'refused' }, 'a write that throws does not throw out of the form');
  assert.deepEqual(signupGate(born(1, 1, 1980), NOW, blocked), { kind: 'refused' }, 'the page remembers it itself');
  assert.deepEqual(signupGate(born(1, 1, 1980), NOW, null), { kind: 'refused' }, 'and with no storage object at all');
});

test('an unreadable date is asked for again in one sentence, and does not set the refusal', async () => {
  const { signupGate, ENTER_A_REAL_DATE, refusalRemembered } = await fresh();
  const storage = memory();
  const answer = signupGate(born(31, 2, 1990), NOW, storage);
  assert.deepEqual(answer, { kind: 'ask', message: ENTER_A_REAL_DATE });
  assert.equal(refusalRemembered(storage), false, 'a typo is not a refusal');
  assert.deepEqual(signupGate({ day: '', month: '', year: '' }, NOW, storage), { kind: 'ask', message: ENTER_A_REAL_DATE }, 'empty and impossible read the same');
  assert.doesNotMatch(ENTER_A_REAL_DATE, /\d/, 'no number in it, so nothing hints at a line');
  assert.doesNotMatch(ENTER_A_REAL_DATE, /old|young|age|must|least|minimum|eligible/i);
});

test('a pass carries the flag and nothing else, and does not touch storage', async () => {
  const { signupGate, AGE_GATE_PASSED } = await fresh();
  const storage = memory();
  const out = signupGate(born(17, 4, 1987), NOW, storage);
  assert.equal(out.kind, 'go');
  assert.deepEqual(out.data, { age_gate: 'passed' });
  assert.deepEqual(AGE_GATE_PASSED, { age_gate: 'passed' });
  assert.deepEqual(Object.keys(out.data), ['age_gate'], 'one key');
  assert.equal(JSON.stringify(out).includes('1987'), false);
  assert.equal(storage.data.size, 0, 'a pass stores nothing in the browser either');
});

test('the refusal message is kind, names no age and no rule, and offers no second try', async () => {
  const { REFUSAL_TITLE, REFUSAL_BODY } = await fresh();
  for (const sentence of [REFUSAL_TITLE, REFUSAL_BODY]) {
    assert.doesNotMatch(sentence, /\d/, 'no number');
    assert.doesNotMatch(sentence, /thirteen|years|must|require|illegal|violat|not allowed|forbidden|denied|invalid|error/i, 'no rule and no scolding');
  }
  assert.match(REFUSAL_BODY, /sorry/i, 'it says sorry');
  assert.doesNotMatch(REFUSAL_BODY, /try again|re-?enter|correct/i, 'it does not invite a retry');
});

/* ------------------------------------------------------------------ the screen --- */

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { MemoryRouter } from 'react-router-dom';
  import { BirthDateField, SignupPage } from './src/routes/auth-pages';
  export { h, renderToStaticMarkup, MemoryRouter, BirthDateField, SignupPage };
`, { name: 'age-gate', resolveDir: WEB });
const render = (element) => renderWith(ui.renderToStaticMarkup, ui.h(ui.MemoryRouter, null, element));

test('THE SCREEN IS NEUTRAL: a day, a month and a year, and no hint of a threshold anywhere on the page', () => {
  const html = render(ui.h(ui.SignupPage));
  const field = element(html, /<div class="field field-date"/);
  assert.ok(field, 'the sign-up form has no date-of-birth group');
  assert.match(text(field), /Date of birth/);
  // Three named controls: a day, a month and a year.
  assert.match(field, /name="birthDay"/);
  assert.match(field, /name="birthMonth"/);
  assert.match(field, /name="birthYear"/);
  assert.equal((field.match(/<option /g) ?? []).length, 13, 'twelve named months and a blank');
  assert.deepEqual([...field.matchAll(/<option value="(\d+)">([A-Za-z]+)<\/option>/g)].map((m) => `${m[1]} ${m[2]}`).slice(0, 3), ['1 January', '2 February', '3 March']);
  // No limit that names a line, no sample date, no hint.
  for (const attribute of ['min=', 'max=', 'minLength=', 'minlength=', 'placeholder=', 'pattern=']) assert.equal(field.includes(attribute), false, `the date controls carry ${attribute}`);
  assert.ok(/maxLength="4"|maxlength="4"/.test(field), 'the year takes four digits (a length, not a limit on the year)');
  // The whole page: no age, no rule.
  const words = text(html);
  assert.doesNotMatch(words, /\b13\b|thirteen|years old|aged|must be|old enough|too young|age limit|age requirement|minimum age/i, 'the sign-up page names the threshold');
  // The labels are real: each control has its own, and the group is named for a screen reader.
  assert.match(field, /role="group"[^>]*aria-labelledby=/);
  assert.equal((field.match(/<label /g) ?? []).length, 3);
});

test('the date controls take their autofill hints, and the digits fields accept only digits on a phone keypad', () => {
  const field = element(render(ui.h(ui.SignupPage)), /<div class="field field-date"/);
  for (const token of ['bday-day', 'bday-month', 'bday-year']) assert.match(field, new RegExp(`autoComplete="${token}"|autocomplete="${token}"`));
  assert.equal((field.match(/inputMode="numeric"|inputmode="numeric"/g) ?? []).length, 2);
});

/* ------------------------------------------------------------------ the form, run --- */

globalThis.__turnstile = 0;
// ONE PAGE PER SCENARIO. The age module keeps a refusal made in this page load in memory (so it holds where storage is blocked), and
// a bundle is one page load: a scenario that refused somebody must not refuse the next one.
const loadSignup = () => loadPage({
  entry: 'src/routes/auth-pages.tsx',
  name: 'age-gate-page',
  real: ['lib/auth-flows.ts', 'lib/age-gate.ts'],
  fakes: { 'lib/turnstile.ts': { turnstileToken: 'async () => { globalThis.__turnstile += 1; return null; }', captchaOptions: '() => ({})' } },
});
const useStorage = (storage) => Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });

/** The sign-up page, mounted, with its three fields filled in the way the form's own handlers receive them. */
async function filled({ date, email = 'a@example.com', password = 'a long enough passphrase 42', storage = memory() } = {}) {
  useStorage(storage);
  const Page = await loadSignup();
  Page.supabaseControls.signUpResult = { data: { session: null, user: { id: 'u' } }, error: null };
  globalThis.__turnstile = 0;
  const page = Page.mountStub(() => Page.SignupPage());
  await page.settle();
  const form = () => findAll(page.result, (n) => n.type === 'form')[0];
  const fields = () => ({
    email: findAll(page.result, (n) => n.type === 'input' && n.props.name === 'email')[0],
    password: findAll(page.result, (n) => n.props?.name === 'password')[0],
    birth: findElement(page.result, Page.BirthDateField),
  });
  if (date) {
    fields().email.props.onChange({ target: { value: email } });
    fields().password.props.onChange(password);
    fields().birth.props.onChange(date);
    await page.settle();
  }
  const submit = async () => { await form().props.onSubmit({ preventDefault() {} }); await page.settle(); };
  const calls = (method) => Page.supabaseControls.calls.filter((c) => (method ? c.method === method : c.method !== 'getSession'));
  return { Page, page, form, fields, submit, storage, calls };
}

const yearsAgo = (years) => { const d = new Date(); return born(d.getDate() > 28 ? 28 : d.getDate(), d.getMonth() + 1, d.getFullYear() - years); };

test('UNDER THE LINE: no sign-up request, no captcha request, the kind message instead of the form, and the refusal is remembered', async () => {
  const { page, submit, storage, calls } = await filled({ date: yearsAgo(10) });
  await submit();
  assert.deepEqual(calls(), [], 'a call was made on the Supabase client');
  assert.equal(globalThis.__turnstile, 0, 'the captcha was asked for: that is a request to Cloudflare');
  const words = textOf(page.result);
  assert.match(words, /We cannot make an account for you right now/);
  assert.match(words, /sorry/i);
  assert.equal(findAll(page.result, (n) => n.type === 'form').length, 0, 'the form is gone, so there is nothing to change and resend');
  assert.equal(findAll(page.result, (n) => n.type === 'input').length, 0);
  assert.equal(storage.getItem('studpilot.age-gate.v1'), '1', 'remembered in this browser');
});

test('AFTER A REFUSAL, a fresh visit to the sign-up page in the same browser shows the refusal and no form: changing the date does not work', async () => {
  const storage = memory({ 'studpilot.age-gate.v1': '1' });
  const { page, calls } = await filled({ storage });
  assert.match(textOf(page.result), /We cannot make an account for you right now/);
  assert.equal(findAll(page.result, (n) => n.type === 'form').length, 0);
  assert.deepEqual(calls(), []);
  // The way back for somebody who has an account is still there.
  assert.ok(findAll(page.result, (n) => n.type === 'Link' && n.props.to === '/login').length > 0, 'a person with an account can still sign in');
});

test('OVER THE LINE: the sign-up is made with { age_gate: "passed" } in the user metadata, and the birth date is in NO argument', async () => {
  const date = born(17, 4, 1987);
  const { submit, calls } = await filled({ date });
  await submit();
  const signUps = calls('signUp');
  assert.equal(signUps.length, 1, 'the sign-up was made once');
  const [args] = signUps[0].args;
  assert.deepEqual(args.options.data, { age_gate: 'passed' });
  assert.equal(args.email, 'a@example.com');
  const wire = JSON.stringify(signUps[0].args);
  for (const secret of ['1987', 'birth', '"17"', '"4"']) assert.equal(wire.includes(secret), false, `the sign-up call carries ${secret}`);
  assert.equal(globalThis.__turnstile, 1, 'the captcha is asked for only after the age screen is passed');
});

test('an impossible date shows one sentence on the field, makes no request and refuses nobody', async () => {
  const { Page, page, submit, storage, calls } = await filled({ date: born(31, 2, 1990) });
  await submit();
  assert.deepEqual(calls(), []);
  assert.equal(globalThis.__turnstile, 0);
  // The sentence is the message the form's error panel is handed (a child, so it is read off its props).
  assert.deepEqual(findAll(page.result, (n) => typeof n.props?.message === 'string').map((n) => n.props.message), ['Enter your date of birth, as a day, a month and a year.']);
  assert.equal(storage.getItem('studpilot.age-gate.v1'), null, 'a typo is not remembered as a refusal');
  assert.equal(findElement(page.result, Page.BirthDateField).props.invalid, true, 'the three controls are marked');
  assert.equal(findAll(page.result, (n) => n.type === 'form').length, 1, 'the form stays, so it can be corrected');
});

test('the date is held in the form’s own state only: a later submit after a pass still sends only the flag', async () => {
  const { submit, fields, page, calls } = await filled({ date: born(17, 4, 1987) });
  fields().birth.props.onChange(born(2, 3, 1975));
  await page.settle();
  await submit();
  const [signUp] = calls('signUp');
  assert.deepEqual(signUp.args[0].options.data, { age_gate: 'passed' });
  assert.equal(JSON.stringify(signUp.args).includes('1975'), false);
});

/* ------------------------------------------------------------------ the other ways in (syntax tree) --- */

const parse = (...p) => ts.createSourceFile(p.at(-1), readFileSync(join(WEB, 'src', ...p), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = (root) => { const all = []; const visit = (n) => { all.push(n); ts.forEachChild(n, visit); }; visit(root); return all; };

test('the age screen is on the EMAIL form only: the other ways in (Roblox, Google, Discord) have no form and are not asked', () => {
  const source = parse('routes', 'auth-pages.tsx');
  const fn = (name) => nodes(source).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === name);
  const signup = fn('SignupPage');
  assert.ok(signup && /signupGate\(/.test(signup.getText()), 'the sign-up page does not run the gate');
  const login = fn('LoginPage');
  assert.equal(/signupGate|BirthDateField/.test(login.getText()), false, 'the sign-in page asks existing accounts for a date of birth');
  const alt = fn('AlternativeSignIn');
  assert.equal(/signupGate|BirthDateField|birth/i.test(alt.getText()), false, 'a provider sign-in is asked for a date of birth');
});

test('the gate runs BEFORE the captcha and the sign-up call in the submit handler', () => {
  const signup = nodes(parse('routes', 'auth-pages.tsx')).find((n) => ts.isFunctionDeclaration(n) && n.name?.text === 'SignupPage').getText();
  const gate = signup.indexOf('signupGate(');
  const captcha = signup.indexOf("turnstileToken('signup')");
  const call = signup.indexOf('supabase.auth.signUp(');
  assert.ok(gate > 0 && captcha > gate && call > gate, 'the age screen is not the first thing the submit does');
});

test('the date is not stored: nothing in the app writes a birth date anywhere', () => {
  const lib = readFileSync(join(WEB, 'src', 'lib', 'age-gate.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const writes = [...lib.matchAll(/\.setItem\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(writes, ["AGE_GATE_KEY, '1'"], 'the only thing written to the browser is the refusal flag');
  assert.equal(/sessionStorage|document\.cookie|fetch\(|sendBeacon|XMLHttpRequest/.test(lib), false, 'the age module stores or sends nothing but that flag');
});
