// The sign-up form as an oracle, and the three other ways an auth screen lies.
//
// This file is mostly about ONE property, stated as an equality rather than as a message check:
//
//     nothing observable about a sign-up, a reset request or an address change may differ
//     according to whether that address already has an account.
//
// An assertion of the form "the error says something vague" is weaker than the property — the
// property is that the two cases are INDISTINGUISHABLE, and only an equality between the
// registered and unregistered outcomes says that. So each fixture below differs from its partner
// in exactly one respect (the error string, or the `identities` array, or the obfuscated user
// object), because a fixture that changes two things at once proves nothing about either.
//
// The equality on its own would be satisfied by a function that returns `check-email` for
// everything, which would swallow rate limits and dead networks. That is what the second group
// covers: a failure that is genuinely about the REQUEST still has to reach the user.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHECK_EMAIL_LINE,
  PASSWORD_MIN,
  REAUTH_WINDOW_MS,
  SENSITIVE_ACTIONS,
  authErrorMessage,
  cameFromLink,
  emailChangeOutcome,
  emailRedirectTo,
  emailVerification,
  freshestAuth,
  isSensitiveAction,
  lastAuthMs,
  needsReauth,
  parseAuthLink,
  passwordProblem,
  resetRequestOutcome,
  revealsAccountExistence,
  signInOutcome,
  signupOutcome,
} from '../src/lib/auth-flows.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');

/* ------------------------------------------------------- 1. the enumeration oracle --- */

// What Supabase actually returns for a NEW address when confirmations are on.
const NEW_ADDRESS = {
  session: null,
  user: { id: '11111111-1111-1111-1111-111111111111', email: 'a@b.com', identities: [{ id: 'x', provider: 'email' }] },
};

test('a sign-up for a registered address is indistinguishable from one for a new address', () => {
  const baseline = signupOutcome(NEW_ADDRESS, null, 'a@b.com');

  // Fixture 1 — only the ERROR differs. This is the leak that shipped: friendlyAuthError turned
  // this exact string into "That email already has an account. Sign in instead."
  const byError = signupOutcome(NEW_ADDRESS, new Error('User already registered'), 'a@b.com');
  assert.deepEqual(byError, baseline);

  // Fixture 2 — only `identities` differs. No error at all: HTTP 200, an obfuscated user, and an
  // empty identities array is how the provider says "this one already exists" without saying it.
  const byIdentities = signupOutcome(
    { session: null, user: { ...NEW_ADDRESS.user, identities: [] } },
    null,
    'a@b.com',
  );
  assert.deepEqual(byIdentities, baseline);

  // Fixture 3 — only the USER OBJECT differs: obfuscated, with no id and no created_at.
  const byUser = signupOutcome({ session: null, user: { email: 'a@b.com' } }, null, 'a@b.com');
  assert.deepEqual(byUser, baseline);

  // Fixture 4 — no user object at all.
  assert.deepEqual(signupOutcome({ session: null }, null, 'a@b.com'), baseline);
});

test('the uniform answer is the check-email screen, carrying only what the user typed', () => {
  const out = signupOutcome(NEW_ADDRESS, new Error('User already registered'), 'a@b.com');
  assert.equal(out.kind, 'check-email');
  assert.equal(out.address, 'a@b.com');
  assert.match(CHECK_EMAIL_LINE, /if that address has an account/i);
});

test('a reset request and an address change answer uniformly too', () => {
  for (const fn of [resetRequestOutcome, emailChangeOutcome]) {
    const clean = fn(null, 'a@b.com');
    assert.deepEqual(fn(new Error('User not found'), 'a@b.com'), clean, fn.name);
    assert.deepEqual(fn({ message: 'Email address is already registered' }, 'a@b.com'), clean, fn.name);
  }
});

test('no phrasing that names the state of an address survives into a message', () => {
  const leaks = [
    'User already registered',
    'A user with this email address has already been registered',
    'Email address is already taken',
    'User not found',
  ];
  for (const raw of leaks) {
    assert.equal(revealsAccountExistence(new Error(raw)), true, raw);
    const shown = authErrorMessage(new Error(raw));
    assert.equal(shown, 'Wrong email or password. Try again.', raw);
    assert.doesNotMatch(shown, /already|exists|registered|not found/i, raw);
  }
});

// The equality above is satisfiable by a function that answers `check-email` unconditionally.
// This is what stops that: a failure about the REQUEST is not a failure about the address, and
// swallowing it tells someone to check an inbox nothing was ever sent to.
test('a failure that is not about the address still reaches the user', () => {
  const rateLimited = signupOutcome(null, new Error('For security purposes, you can only request this after 47 seconds'), 'a@b.com');
  assert.equal(rateLimited.kind, 'retry');
  assert.match(rateLimited.message, /wait a minute/i);

  const offline = signupOutcome(null, new TypeError('Failed to fetch'), 'a@b.com');
  assert.equal(offline.kind, 'retry');
  assert.match(offline.message, /connection/i);

  const weak = resetRequestOutcome(new Error('Password should be at least 8 characters'), 'a@b.com');
  assert.equal(weak.kind, 'retry');
});

test('a sign-up that comes back with a session signs the person in', () => {
  const out = signupOutcome({ session: { access_token: 't' }, user: NEW_ADDRESS.user }, null, 'a@b.com');
  assert.deepEqual(out, { kind: 'signed-in' });
});

test('sign-in does not distinguish a wrong password from an address with no account', () => {
  // Supabase collapses these server-side; the client must not un-collapse them.
  const wrongPassword = signInOutcome(new Error('Invalid login credentials'));
  const noSuchUser = signInOutcome(new Error('User not found'));
  assert.deepEqual(noSuchUser, wrongPassword);
  assert.deepEqual(signInOutcome(null), { kind: 'signed-in' });
});

test('an unconfirmed address is still told so — it costs a password to reach', () => {
  const out = signInOutcome(new Error('Email not confirmed'));
  assert.equal(out.kind, 'retry');
  assert.match(out.message, /confirm your email/i);
});

/* ------------------------------------------------- 2. no leak in the rendered pages --- */

function tsFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

/** Comments describe the leak; only code can commit it. Same stripper the tour test uses. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/**
 * A claim about ONE SUPPLIED ADDRESS, which is the thing that leaks.
 *
 * Deliberately not a ban on the word "account". "Already have an account? Sign in" is the ordinary
 * link at the foot of a sign-up form: it is addressed to the reader, names no address, and answers
 * nothing — banning it would be the guard measuring a spelling instead of the property, and the
 * first person to hit it would delete the wrong thing to get green. What must never appear is a
 * sentence that tells the visitor the state of the address they just typed.
 */
const ADDRESS_CLAIMS = [
  /(that|this)\s+(e-?mail|address|account)[^.!?]{0,80}(already|taken|registered|exists)/i,
  /(e-?mail|address)\s+(is\s+)?already\s+(registered|taken|in use)/i,
  /no\s+account\s+(with|for)\s+(that|this)\s+(e-?mail|address)/i,
  /(that|this)\s+(e-?mail|address)[^.!?]{0,80}(isn't|is not|not)\s+(registered|found|known)/i,
];

/**
 * The one file that is allowed to contain these sentences, because its job is to RECOGNISE them.
 *
 * `ENUMERATING` is a list of provider phrasings matched on the way in so they can be discarded, and
 * a scanner cannot tell a pattern from a message by looking at the characters. What covers this
 * module instead is the test above — every one of those phrasings is fed through
 * `authErrorMessage` and the output asserted to be the uniform sentence — which is a stronger check
 * than the scan, not a weaker one: it reads the actual output rather than the source.
 *
 * Asserted to EXIST below, so that renaming the module turns this exclusion into a failing test
 * rather than into a scanner that quietly covers nothing.
 */
const DETECTOR = join(SRC, 'lib', 'auth-flows.ts');

test('no surface in the app tells a visitor whether an address is registered', () => {
  // The property, not the spelling of any one variable: whatever the implementation, the words a
  // user can read must never answer "does this address have an account?". Scanned across every
  // source file because the leak moved once already — it was a helper in one route, and the next
  // copy of it will be somewhere else.
  assert.ok(statSync(DETECTOR).isFile(), `${DETECTOR} is excluded from this scan but does not exist`);
  const scanned = [];
  const offenders = [];
  for (const file of tsFiles(SRC)) {
    if (file === DETECTOR) continue;
    scanned.push(file);
    const body = code(readFileSync(file, 'utf8'));
    for (const claim of ADDRESS_CLAIMS) {
      const hit = body.match(claim);
      if (hit) offenders.push(`${file}: ${JSON.stringify(hit[0].slice(0, 70))}`);
    }
    // The silent oracle. Nothing in this product has a legitimate reason to read the identities
    // array of a sign-up response; the only thing it tells a client is whether the address was
    // already taken.
    if (/\bidentities\b/.test(body) && /signUp/.test(body)) offenders.push(`${file}: branches on identities`);
  }
  // F-64: a scanner that matched nothing reports zero offenders, which is indistinguishable from
  // success. The auth pages are the files this exists for; if they are not in the scanned set, the
  // walk is broken and the empty result means nothing.
  assert.ok(
    scanned.some((f) => f.endsWith(join('routes', 'auth-pages.tsx'))),
    `the scan did not reach the auth pages; it walked ${scanned.length} files`,
  );
  assert.deepEqual(offenders, []);
});

/* ---------------------------------------------------------------- 3. mail links --- */

test('an expired link is expired, not invalid — even though the provider says both words', () => {
  const link = parseAuthLink({
    hash: '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
    search: '',
  });
  assert.equal(link.ok, false);
  assert.equal(link.failure, 'expired');
  assert.equal(link.detail, 'Email link is invalid or has expired');
});

test('a link that was never valid is not reported as expired', () => {
  const link = parseAuthLink({ hash: '#error=invalid_request&error_description=Invalid+token', search: '' });
  assert.equal(link.failure, 'invalid');
  assert.notEqual(link.failure, 'expired');
});

test('a denied link and a provider fault are their own failures', () => {
  assert.equal(parseAuthLink({ hash: '#error=access_denied&error_description=User+declined' }).failure, 'denied');
  assert.equal(parseAuthLink({ hash: '#error=server_error&error_description=Unexpected+failure' }).failure, 'server');
});

test('the PKCE flow puts its error in the query, and it is read there too', () => {
  const link = parseAuthLink({ hash: '', search: '?error=access_denied&error_code=otp_expired' });
  assert.equal(link.ok, false);
  assert.equal(link.failure, 'expired');
});

test('a good recovery link carries its kind', () => {
  const link = parseAuthLink({ hash: '#access_token=abc&refresh_token=def&type=recovery', search: '' });
  assert.deepEqual(link, { ok: true, kind: 'recovery' });
  assert.equal(cameFromLink(link), true);
});

test('email_change arrives under three names and is one kind', () => {
  for (const type of ['email_change', 'email_change_current', 'email_change_new']) {
    assert.equal(parseAuthLink({ hash: `#access_token=a&type=${type}` }).kind, 'email_change');
  }
});

test('an error beats a token — a URL carrying both is not one this product made', () => {
  const link = parseAuthLink({ hash: '#access_token=abc&type=recovery&error=access_denied&error_code=otp_expired' });
  assert.equal(link.ok, false);
  assert.equal(link.failure, 'expired');
});

test('arriving with no link at all is not a failure', () => {
  const bare = parseAuthLink({ hash: '', search: '' });
  assert.equal(bare.ok, false);
  assert.equal(bare.failure, undefined);
  assert.equal(cameFromLink(bare), false);
  // Nor does a missing URL object throw: this runs during render.
  assert.equal(cameFromLink(parseAuthLink({})), false);
  assert.equal(cameFromLink(parseAuthLink({ hash: null, search: 42 })), false);
});

test('provider text is flattened and capped before it is put on the page', () => {
  const raw = 'Line one\nLine two\u0000and a DEL\u007f' + 'x'.repeat(400);
  const nasty = `#error=invalid_request&error_description=${encodeURIComponent(raw)}`;
  const link = parseAuthLink({ hash: nasty });
  assert.ok(link.detail.length <= 200, `detail was ${link.detail.length} chars`);
  const control = [...link.detail].filter((ch) => {
      const c = ch.codePointAt(0);
      return c < 0x20 || c === 0x7f;
    });
    assert.deepEqual(control, [], 'control characters survived into the page');
});

/* ------------------------------------------------- 3b. where a mail link comes back --- */

test('a mail link comes back to this app, under the router basename', () => {
  assert.equal(emailRedirectTo('/reset', 'https://apple.dev'), 'https://apple.dev/app/reset');
  assert.equal(emailRedirectTo('/confirm', 'https://apple.dev'), 'https://apple.dev/app/confirm');
  assert.equal(emailRedirectTo('/', 'https://apple.dev'), 'https://apple.dev/app');
});

test('a mail link can never be aimed off-origin', () => {
  // The consequence is worse here than for an in-page redirect: this value is baked into an email
  // that outlives the session that produced it.
  for (const evil of ['//evil.example', String.raw`/\evil.example`, 'https://evil.example/x', 'javascript:alert(1)', '']) {
    const url = emailRedirectTo(evil, 'https://apple.dev');
    assert.equal(url, 'https://apple.dev/app', JSON.stringify(evil));
  }
});

test('every route a mail link is sent to is a route the app actually has', () => {
  // The link outlives the deploy that made it. A redirect to a path no route matches is a user
  // clicking a confirmation link and landing on the not-found page, with no way to tell whether
  // their address was confirmed.
  const app = readFileSync(join(SRC, 'app.tsx'), 'utf8');
  const pages = readFileSync(join(SRC, 'routes', 'auth-pages.tsx'), 'utf8');
  const routes = new Set([...app.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
  const targets = [...pages.matchAll(/emailRedirectTo\('([^']+)'\)/g)].map((m) => m[1]);
  assert.ok(targets.length >= 2, `expected mail redirects to exist, found ${targets.length}`);
  for (const t of targets) assert.ok(routes.has(t), `${t} is sent in mail but is not a route`);
});

/* ----------------------------------------------------------------- 4. passwords --- */

test('a password shorter than the minimum is refused, and the minimum is stated once', () => {
  assert.equal(passwordProblem('x'.repeat(PASSWORD_MIN)), null);
  assert.match(passwordProblem('x'.repeat(PASSWORD_MIN - 1)), new RegExp(String(PASSWORD_MIN)));
});

test('a password that is not a string is refused rather than measured', () => {
  for (const v of [undefined, null, 12345678, {}, []]) {
    assert.equal(typeof passwordProblem(v), 'string', String(v));
  }
});

test('the most common passwords in the world are refused, case-insensitively', () => {
  for (const p of ['password', 'PASSWORD', 'Password123', '12345678', 'iloveyou']) {
    assert.match(passwordProblem(p) ?? '', /common|at least/i, p);
  }
});

test('a password that is the email address is refused', () => {
  assert.match(passwordProblem('builder@example.com', { email: 'builder@example.com' }), /email address/i);
  // Case-folded, and long enough that the length rule is not what refuses it — otherwise this
  // assertion passes for a reason that has nothing to do with the rule it names.
  assert.match(passwordProblem('BUILDERPERSON', { email: 'builderperson@example.com' }), /email address/i);
  assert.equal(passwordProblem('builderperson', { email: 'someone@example.com' }), null);
  // The local-part rule needs a local part worth protecting; a two-letter one would refuse half
  // the dictionary.
  assert.equal(passwordProblem('abcdefgh', { email: 'ab@example.com' }), null);
});

/* ---------------------------------------------------------- 5. re-authentication --- */

const NOW = Date.UTC(2026, 8, 15, 12, 0, 0);
const iso = (ms) => new Date(ms).toISOString();

test('a sensitive action just after signing in does not ask again', () => {
  assert.equal(needsReauth('change-password', iso(NOW - 60_000), NOW), false);
});

test('a sensitive action on a stale session asks', () => {
  assert.equal(needsReauth('change-password', iso(NOW - REAUTH_WINDOW_MS - 1000), NOW), true);
});

test('an unreadable last-sign-in time asks — it is not evidence of anything', () => {
  // Every one of these has been a real value in a real session object.
  for (const bad of [undefined, null, '', '   ', 'never', 'not a date', {}, [], NaN, '1750000000000']) {
    assert.equal(needsReauth('change-email', bad, NOW), true, JSON.stringify(bad));
  }
});

test('a timestamp in the future asks — a disagreeing clock is not a recent sign-in', () => {
  assert.equal(needsReauth('sign-out-everywhere', iso(NOW + 60 * 60_000), NOW), true);
});

test('every action this product gates is in the vocabulary, and nothing else is', () => {
  for (const a of SENSITIVE_ACTIONS) assert.equal(isSensitiveAction(a), true, a);
  for (const a of ['open-project', 'toggle-theme', '', null, 'CHANGE-PASSWORD']) {
    assert.equal(isSensitiveAction(a), false, String(a));
    assert.equal(needsReauth(a, iso(NOW - 10 * 60 * 60_000), NOW), false, String(a));
  }
});

test('a re-authentication we watched happen counts, even when the token still says otherwise', () => {
  // A refreshed token carries the ORIGINAL sign-in time. Without this, someone who has just typed
  // their password into the re-auth dialog is asked for it again on the very next action.
  const stale = iso(NOW - 60 * 60_000);
  assert.equal(needsReauth('change-password', freshestAuth(stale, NOW - 1000), NOW), false);
  assert.equal(needsReauth('change-password', freshestAuth(stale, null), NOW), true);
  assert.equal(freshestAuth(null, null), null);
  assert.equal(freshestAuth(stale, 'rubbish'), lastAuthMs(stale));
});

/* ------------------------------------------------------- 6. verification state --- */

test('verified, unverified and unknown are three different answers', () => {
  assert.equal(emailVerification({ email: 'a@b.com', email_confirmed_at: iso(NOW) }), 'verified');
  assert.equal(emailVerification({ email: 'a@b.com', confirmed_at: iso(NOW) }), 'verified');
  assert.equal(emailVerification({ email: 'a@b.com', email_confirmed_at: null }), 'unverified');
  // The one that matters: a missing user is NOT an unverified user. Accusing someone of not
  // confirming their address because their profile has not loaded is the product being wrong out
  // loud.
  assert.equal(emailVerification(undefined), 'unknown');
  assert.equal(emailVerification({}), 'unknown');
  assert.equal(emailVerification({ email: '' }), 'unknown');
});

test('a confirmation timestamp that does not parse is not a confirmation', () => {
  assert.equal(emailVerification({ email: 'a@b.com', email_confirmed_at: 'soon' }), 'unverified');
});
