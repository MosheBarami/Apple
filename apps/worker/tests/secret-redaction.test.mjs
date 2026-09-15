/**
 * SECRET SCANNING, PII DETECTION, AND THE EGRESS GATE — apps/worker/src/redaction.ts, and the
 * three places it is wired in: every outbound request and every upstream error excerpt
 * (`guardedFetch`, net-policy.ts), and the error log (`redactMessage`, analytics.ts).
 *
 * EVERY GUARD HERE IS FED THE THING IT IS SUPPOSED TO CATCH. A redactor tested on a clean string
 * proves that one string survived; it says nothing about whether a JWT would. So each rule is
 * driven by a real credential of that shape, and each assertion states what it would take to turn
 * it red:
 *
 *   - `assert.equal(out.includes(secret), false)` goes red the moment a rule stops matching. A
 *     `findings.length > 0` assertion would NOT: it is satisfied by any other rule in the list
 *     firing on the same fixture (F-59 — a count over a shared channel is vacuous), so the value
 *     itself is asserted absent, and the KIND is asserted alongside it.
 *   - The false-positive direction is tested as hard as the true-positive one, because the egress
 *     gate's failure mode is not "a secret got out", it is "github_lookup stopped working and
 *     someone turned the gate off". A 40-character commit SHA and a 13-digit epoch are both fed in
 *     and both must pass.
 *   - The `no request was made` assertions count the calls to a stub fetch. A refusal that happens
 *     after the request has left is not a refusal, and nothing about the returned value would show
 *     the difference.
 *
 * Run with:  node --test tests/secret-redaction.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../src/redaction.ts';
import * as N from '../src/net-policy.ts';

/* ---------------------------------------------------------------- fixtures --- */

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');

const JWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const GOLEM_KEY = `gk_live_${'a'.repeat(24)}_${'b'.repeat(48)}`;
const PAIRING = `550e8400-e29b-41d4-a716-446655440000.${'f'.repeat(48)}`;
const AWS = 'AKIAIOSFODNN7EXAMPLE';
const GITHUB = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
const SLACK = 'xoxb-123456789012-1234567890123-AbCdEfGhIjKlMnOpQrStUvWx';
const GOOGLE = 'AIza' + 'SyD-1234567890abcdefghijklmnopqrstu';
const PEM = '-----BEGIN RSA PRIVATE KEY-----\nMIIEow==\n';
const CARD = '4111111111111111';
const GIT_SHA = 'e83c5163316f89bfbde7d9ab23ca2e25604af290';

/* -------------------------------------------------- the module actually loaded --- */

test('the module under test loaded, and a clean string comes back untouched', () => {
  for (const fn of ['scanText', 'scanSecrets', 'detectPii', 'redact', 'redactSecrets', 'redactPii', 'checkEgress']) {
    assert.equal(typeof R[fn], 'function', `${fn} is missing, so its assertions would be testing undefined`);
  }
  // The negative control for every redaction assertion below. Without it, a redactor that replaced
  // the entire input with "[redacted]" would satisfy all of them.
  const clean = 'Build a lobby with a spawn pad and four doors.';
  const out = R.redact(clean);
  assert.equal(out.text, clean, 'ordinary prose must survive byte for byte');
  assert.equal(out.changed, false);
  assert.deepEqual(out.findings, []);
});

/* ------------------------------------------------------------ secret scanning --- */

for (const [kind, secret] of [
  ['jwt', JWT],
  ['golem_api_key', GOLEM_KEY],
  ['pairing_token', PAIRING],
  ['openai_key', 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789'],
  ['anthropic_key', 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123'],
  ['github_token', GITHUB],
  ['aws_access_key_id', AWS],
  ['google_api_key', GOOGLE],
  ['slack_token', SLACK],
  ['private_key_block', PEM],
]) {
  test(`a ${kind} in a message is found by name and is gone from the redacted text`, () => {
    const message = `provider call failed while using ${secret} — retrying`;
    const findings = R.scanSecrets(message);
    // The KIND is asserted, not just a count: with sixteen rules in the list, `length > 0` is
    // satisfied by any of them and would stay green after this rule was deleted.
    assert.ok(
      findings.some((f) => f.kind === kind),
      `${kind} was not among ${JSON.stringify(findings.map((f) => f.kind))}`,
    );
    const { text } = R.redactSecrets(message);
    assert.equal(text.includes(secret), false, `the ${kind} survived redaction`);
    assert.match(text, /\[redacted:/, 'and the removal is visible rather than silent');
    assert.match(text, /provider call failed/, 'the rest of the message must survive');
  });
}

test('the finding carries a preview, and the preview is not the secret', () => {
  const [f] = R.scanSecrets(`token=${JWT}`);
  assert.ok(f, 'a JWT must be found at all');
  assert.equal(f.preview.includes(JWT), false, 'a preview that contains the value is a second copy of the leak');
  assert.ok(f.preview.length < 30, 'and it must be short enough to be safe in a log');
  assert.equal(f.length, JWT.length, 'the length of what was removed is reported');
});

test('an Authorization header is removed WITH its value, not just named', () => {
  const msg = `request failed: authorization: Bearer ${JWT}`;
  const { text, findings } = R.redactSecrets(msg);
  assert.ok(findings.some((f) => f.kind === 'bearer_credential' || f.kind === 'jwt'));
  assert.equal(text.includes(JWT), false);
});

test('overlapping rules do not split a token and leave half of it in the clear', () => {
  // The pairing token is a uuid, a dot and 48 hex characters; `long_hex` matches that tail on its
  // own. If both findings survived, the inner span would be replaced first, every later offset
  // would point into a string that no longer exists, and the uuid half would be left behind.
  const findings = R.scanSecrets(`pair ${PAIRING} ok`);
  assert.ok(findings.some((f) => f.kind === 'pairing_token'));
  const { text } = R.redactSecrets(`pair ${PAIRING} ok`);
  assert.equal(text.includes(PAIRING), false, 'the whole token must go');
  assert.equal(text.includes('550e8400-e29b-41d4-a716-446655440000'), false, 'including the uuid half');
  assert.match(text, /^pair \[redacted:pairing_token\] ok$/);
});

test('every occurrence is found, and a second scan of the same text agrees with the first', () => {
  // TWO PROPERTIES, AND WHAT TURNS EACH RED. `first.length === 3` goes red if the scanner stops at
  // the first match per rule — measured: adding `if (found.length) break;` after the validate call
  // turns this test and the PII one red.
  //
  // The equality between the two passes is the `lastIndex` property. `scanText` compiles a fresh
  // regex per scan; the exec-to-null loop ALSO resets `lastIndex`, so today the two defences
  // overlap and this half cannot be reddened by removing either one alone. It is kept because the
  // pair is what holds: the day someone replaces the loop with `.test()` or an early return — both
  // of which leave `lastIndex` dirty on a shared /g regex — this is the assertion that catches the
  // second request's secret going unseen.
  const text = `a ${JWT} b ${JWT} c ${JWT}`;
  const first = R.scanSecrets(text);
  const second = R.scanSecrets(text);
  assert.equal(first.length, 3, 'all three JWTs must be found on the first pass');
  assert.deepEqual(second, first, 'and the second pass must agree with the first');
});

test('a non-string payload is SCANNED, not skipped — an unscanned object is not a clean object', () => {
  // `typeof v === 'string' ? scan(v) : []` is the shape this refuses. It answers "nothing found"
  // for every object, and the objects are where the credentials are.
  const payload = { init: { headers: { authorization: `Bearer ${JWT}` } } };
  const findings = R.scanSecrets(payload);
  assert.ok(findings.length > 0, 'a credential inside an object must still be found');
  assert.equal(R.redactSecrets(payload).text.includes(JWT), false);
  const err = new Error(`upstream rejected ${AWS}`);
  assert.ok(R.scanSecrets(err).some((f) => f.kind === 'aws_access_key_id'), 'and inside an Error');
});

/* ------------------------------------------------------------ PII detection --- */

test('a payment card is detected only when it is one: Luhn AND an issuer prefix', () => {
  assert.ok(R.detectPii(`card ${CARD}`).some((f) => f.kind === 'credit_card'), 'a valid Visa number must be found');
  assert.ok(
    R.detectPii('card 4111 1111 1111 1111').some((f) => f.kind === 'credit_card'),
    'spaced groups are the way a human types one',
  );
  // The two false positives that would matter. A 16-digit number that fails Luhn is an order
  // number; a 13-digit epoch in milliseconds passes Luhn about one time in ten and appears in
  // query strings constantly — if either were flagged, the egress gate would start refusing
  // ordinary traffic and somebody would switch it off.
  assert.deepEqual(R.detectPii('order 1234567812345678').filter((f) => f.kind === 'credit_card'), []);
  assert.deepEqual(R.detectPii('t=1736899200000').filter((f) => f.kind === 'credit_card'), []);

  // BOTH OF THE FIXTURES ABOVE FAIL BOTH CONJUNCTS, so neither one proves that either half is
  // load-bearing. Measured: with only those two present, forcing luhnValid to return true was
  // GREEN, and relaxing the issuer-prefix regex to any four digits was ALSO green. The test named
  // "Luhn AND an issuer prefix" and demonstrated neither. A negative fixture that fails for two
  // reasons at once cannot show which reason did the work.
  //
  // These two isolate the conjuncts. Each violates exactly ONE.
  assert.deepEqual(
    R.detectPii('ref 9000000000000001').filter((f) => f.kind === 'credit_card'),
    [],
    'Luhn-VALID but 9000 is no issuer prefix — this is what the prefix regex is for',
  );
  assert.deepEqual(
    R.detectPii('card 4111111111111112').filter((f) => f.kind === 'credit_card'),
    [],
    'a Visa PREFIX that fails Luhn — this is what luhnValid is for',
  );
});

test('email, SSN and IPv4 are detected, and redaction removes the value', () => {
  const text = 'contact ada@example.com from 203.0.113.7, ssn 123-45-6789';
  const kinds = R.detectPii(text).map((f) => f.kind);
  for (const k of ['email', 'us_ssn', 'ipv4']) assert.ok(kinds.includes(k), `${k} missing from ${JSON.stringify(kinds)}`);
  const { text: out } = R.redactPii(text);
  for (const v of ['ada@example.com', '203.0.113.7', '123-45-6789']) {
    assert.equal(out.includes(v), false, `${v} survived PII redaction`);
  }
  assert.match(out, /^contact \[redacted:email\] from /, 'and the sentence around it survives');
});

test('an octet over 255 is not an address — the validator runs, not just the shape', () => {
  assert.deepEqual(R.detectPii('version 999.168.1.1').filter((f) => f.kind === 'ipv4'), []);
  assert.ok(R.detectPii('peer 10.0.0.255').some((f) => f.kind === 'ipv4'));
});

test('redacting secrets leaves PII alone, and redacting PII leaves secrets alone', () => {
  // The classes are separately requestable; a redactor that ignored `classes` would pass the
  // per-kind tests above and fail here.
  const text = `mail ada@example.com key ${AWS}`;
  assert.match(R.redactSecrets(text).text, /ada@example\.com/);
  assert.equal(R.redactSecrets(text).text.includes(AWS), false);
  assert.match(R.redactPii(text).text, new RegExp(AWS));
  assert.equal(R.redactPii(text).text.includes('ada@example.com'), false);
});

/* ------------------------------------------------------------- the egress gate --- */

test('confidence is load-bearing: a commit SHA is a heuristic finding and never blocks egress', () => {
  const sha = R.scanSecrets(`sha ${GIT_SHA}`);
  assert.ok(sha.some((f) => f.kind === 'long_hex'), 'the log-side rule must still catch it');
  assert.ok(sha.every((f) => f.confidence === 'heuristic'), 'but only as a heuristic');
  // `github_lookup` issues exactly this URL on an ordinary call.
  assert.equal(R.checkEgress({ url: `https://api.github.com/repos/Roblox/creator-docs/commits/${GIT_SHA}` }).ok, true);
  assert.equal(R.checkEgress({ url: 'https://create.roblox.com/docs/reference?t=1736899200000' }).ok, true);
});

test('a URL carrying a credential is refused, and the refusal names where it was', () => {
  const v = R.checkEgress({ url: `https://create.roblox.com/collect?d=${JWT}` });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'secret_in_url');
  assert.deepEqual(v.kinds, ['jwt']);
  assert.match(v.detail, /jwt×1/);
});

test('a body carrying a credential is refused too — the URL is not the only way out', () => {
  const v = R.checkEgress({ url: 'https://render.example.com/shot', body: JSON.stringify({ note: `key ${AWS}` }) });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'secret_in_body');
});

/* ------------------------------------- the gate is actually wired into the fetch --- */

const POLICY = { hosts: ['.roblox.com', 'api.github.com'] };

function countingFetch(responses) {
  const calls = [];
  const impl = async (url) => {
    calls.push(url);
    const r = responses.shift() ?? { status: 200, body: 'ok', headers: {} };
    return {
      status: r.status,
      headers: { get: (n) => r.headers[n.toLowerCase()] ?? null },
      text: async () => r.body ?? '',
      arrayBuffer: async () => new TextEncoder().encode(r.body ?? '').buffer,
    };
  };
  return { impl, calls };
}

test('guardedFetch refuses BEFORE the request leaves — the count of calls is the assertion', () => {
  return (async () => {
    const { impl, calls } = countingFetch([{ status: 200, body: 'never', headers: { 'content-type': 'text/plain' } }]);
    const outcome = await N.guardedFetch(`https://create.roblox.com/collect?d=${JWT}`, { policy: POLICY, fetchImpl: impl });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.failure.kind, 'blocked');
    assert.equal(outcome.failure.reason, 'carries_credential');
    // THE POINT. A gate that reads the URL after the fetch has been issued has already exfiltrated
    // the token; nothing in the returned value distinguishes the two.
    assert.deepEqual(calls, [], 'no request may be made at all');
    // And the failure cannot be mistaken for a thin success.
    assert.equal('body' in outcome, false);
    assert.match(N.describeFailure(outcome.failure), /refused before any request was made/);
  })();
});

test('an allowlisted host is still allowed to be fetched — the gate did not just break web_fetch', () => {
  return (async () => {
    const { impl, calls } = countingFetch([{ status: 200, body: 'hello', headers: { 'content-type': 'text/plain' } }]);
    const outcome = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl });
    assert.equal(outcome.ok, true, 'the positive control: an ordinary fetch must still work');
    assert.equal(outcome.body, 'hello');
    assert.equal(calls.length, 1);
  })();
});

test('a redirect that appends a credential is caught on the hop it appears, not the first', () => {
  return (async () => {
    const { impl, calls } = countingFetch([
      { status: 302, body: '', headers: { location: `https://create.roblox.com/log?t=${JWT}` } },
      { status: 200, body: 'leaked', headers: { 'content-type': 'text/plain' } },
    ]);
    const outcome = await N.guardedFetch('https://create.roblox.com/start', { policy: POLICY, fetchImpl: impl });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.failure.reason, 'carries_credential');
    assert.match(outcome.failure.detail, /redirect 1/, 'the hop must be named — hop 0 was clean');
    assert.equal(calls.length, 1, 'the second request must never be made');
  })();
});

test('a POST body is checked on the hop that carries it', () => {
  return (async () => {
    const { impl, calls } = countingFetch([{ status: 200, body: 'ok', headers: { 'content-type': 'text/plain' } }]);
    const outcome = await N.guardedFetch('https://create.roblox.com/ingest', {
      policy: POLICY,
      fetchImpl: impl,
      method: 'POST',
      body: JSON.stringify({ report: `session ${GOLEM_KEY}` }),
    });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.failure.reason, 'carries_credential');
    assert.deepEqual(calls, []);
  })();
});

test("an upstream error body is redacted before it becomes the model's excerpt", () => {
  return (async () => {
    // A 401 from a provider very often quotes the credential it just rejected, and this excerpt is
    // not a log line — it reaches the model's context and the tool row the user reads. The whole
    // body is the violating input; what is asserted is that the token is absent from the excerpt
    // and that the useful half of the message survived.
    const body = JSON.stringify({ error: 'invalid token', token: JWT, hint: 'refresh and retry' });
    const { impl } = countingFetch([{ status: 401, body, headers: { 'content-type': 'application/json' } }]);
    const outcome = await N.guardedFetch('https://create.roblox.com/api/thing', { policy: POLICY, fetchImpl: impl });
    assert.equal(outcome.ok, false);
    assert.equal(outcome.failure.kind, 'http_status');
    assert.equal(outcome.failure.status, 401);
    assert.equal(outcome.failure.detail.includes(JWT), false, 'the rejected credential reached the model');
    assert.match(outcome.failure.detail, /invalid token/, 'and the part worth reading survived');
    assert.match(outcome.failure.detail, /\[redacted:jwt\]/, 'with the removal visible');
  })();
});

/* --------------------------------------------- the deployment's own literal secrets --- */

test('a secret with no shape is caught by value, and a short one is not matched at all', () => {
  const env = { ADMIN_KEY: 'correct-horse-battery-staple', SEARCH_API_KEY: 'short' };
  const secrets = R.deploymentSecrets(env);
  assert.deepEqual(secrets, ['correct-horse-battery-staple'], 'a 5-character value would match everywhere');
  assert.equal(R.containsDeploymentSecret('sending correct-horse-battery-staple onwards', secrets), true);
  assert.equal(R.containsDeploymentSecret('nothing of the sort', secrets), false);
  assert.equal(R.containsDeploymentSecret('anything', []), false, 'no configured secrets means no false positive');
});

/* ------------------------------------------------- the shape the error log stores --- */

test("the log's placeholder is the stored one, and it never names which credential it was", () => {
  // `analytics.redactMessage` stores `[redacted]`, not `[redacted:jwt]`, and the difference is not
  // cosmetic: the log already holds rows in the old shape, and a label would tell whoever ends up
  // holding a leaked log WHICH credential was in the message they are holding. The option exists
  // for that caller, so it is tested here against the same fixtures the log sees.
  const stored = R.redactSecrets(`auth failed for ${JWT}`, { placeholder: 'plain' }).text;
  assert.equal(stored.includes(JWT), false);
  assert.match(stored, /auth failed for \[redacted\]$/);
  assert.doesNotMatch(stored, /redacted:/, 'the plain placeholder must not leak the kind');

  // Truncation after redaction, which is the order that matters: cutting first leaves the head of
  // the key in the stored row and a placeholder nowhere.
  // TWO SEPARATE CLAIMS, and the previous single assertion proved neither.
  //
  // It built `'x'.repeat(200) + ' ' + JWT` with max 240. After redaction that text is ~211
  // characters, so THE TRUNCATION LIMIT NEVER ENGAGED — deleting the truncation clause outright
  // was green. And the probe asked for `JWT.slice(0, 40)` while a truncate-first implementation
  // would have left exactly 39 characters of the key (240 - 200 - 1), so the off-by-one meant the
  // probe could not have seen the bug it was aimed at either. Two independent reasons to pass.
  //
  // (a) ORDER: redaction must happen BEFORE the cut. Here the key starts inside the first 240
  //     characters, so a truncate-first implementation leaves its head in the output and a
  //     redact-first one replaces it entirely.
  const head = `${'x'.repeat(200)} ${JWT}`;
  const ordered = R.redactSecrets(head, { placeholder: 'plain', max: 240 }).text;
  assert.ok(head.length > 240, 'the fixture must be longer than max, or nothing is being ordered');
  assert.equal(
    ordered.includes(JWT.slice(0, 20)),
    false,
    'truncating first would leave the head of the key — 240-200-1 = 39 characters of it',
  );
  // `placeholder: 'plain'` selects the marker `[redacted]` — it is a MODE, not the literal text.
  assert.ok(ordered.includes('[redacted]'), 'and the plain placeholder must be what replaced it');
  assert.ok(
    R.redactSecrets(head, { placeholder: 'plain', max: 240 }).findings.some((f) => f.kind === 'jwt'),
    'the JWT must actually have been FOUND — otherwise the absence above proves only that it was cut',
  );

  // (b) THE CUT ACTUALLY HAPPENS. Separate fixture, because (a) is short enough after redaction
  //     that it never reaches the limit — which is exactly why the old combined assertion could
  //     not see a deleted truncation clause.
  const overlong = R.redactSecrets('y'.repeat(600), { placeholder: 'plain', max: 240 }).text;
  assert.equal(overlong.length, 240, 'a redacted result longer than max must be cut to max');

  // And the kinds the log's own four-pattern list never had. Each of these would be stored
  // verbatim by a redactor that only knew about JWTs, `sk-` keys and long hex.
  for (const [what, secret] of [['an AWS key id', AWS], ['a GitHub token', GITHUB], ["this product's own API key", GOLEM_KEY]]) {
    assert.equal(
      R.redactSecrets(`upstream rejected ${secret}`, { placeholder: 'plain' }).text.includes(secret),
      false,
      `${what} would reach the error log`,
    );
  }
});

test('the error log redacts through this scanner, including kinds its own list never had', async () => {
  // Bundled and executed rather than read, because the claim is about BEHAVIOUR at the wiring
  // point. A source assertion would stay green if the import were left in place and the call
  // removed — which is exactly the state this file was found in mid-session.
  const out = join(mkdtempSync(join(tmpdir(), 'redaction-analytics-')), 'a.mjs');
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', 'analytics.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' },
  );
  const A = await import(`file://${out}`);

  const jwtMsg = A.redactMessage(`auth failed for ${JWT}`);
  assert.equal(jwtMsg.includes(JWT), false);
  assert.match(jwtMsg, /auth failed for \[redacted\]/, 'the stored format must not change under the log');

  for (const [what, secret] of [['an AWS key id', AWS], ['a GitHub token', GITHUB], ["this product's own API key", GOLEM_KEY]]) {
    assert.equal(A.redactMessage(`upstream rejected ${secret}`).includes(secret), false, `${what} reached the error log`);
  }

  const long = A.redactMessage(`${'x'.repeat(200)} ${JWT}`, 240);
  assert.equal(long.includes(JWT.slice(0, 40)), false, 'truncating before redacting would leave the head of the key');
});
