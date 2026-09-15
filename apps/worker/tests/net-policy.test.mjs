/**
 * THE ALLOWLIST AND THE FAILURE SHAPE — the two halves of net-policy.ts.
 *
 * Every assertion below FEEDS THE VIOLATING INPUT. That is the whole method: a guard whose test
 * only walks the healthy path exercises nothing, and `checkUrl` returning `{ok:true}` for
 * `https://create.roblox.com/` proves precisely that one URL was not refused. So each refusal is
 * driven by the actual thing it refuses — a decimal-encoded loopback address, a redirect that
 * turns off the allowlist mid-flight, a 200 with no bytes in it.
 *
 * And the second half, which is this repository's central rule applied to I/O: a failure to
 * observe must not render as an observation. The `no failure wears a success's clothes` block
 * enumerates every failure kind and asserts the result cannot be read as content — because the
 * defect is not that the fetch failed, it is that `{ text: '' }` reads to a model exactly like a
 * page that said nothing.
 *
 * Run with:  node --test tests/net-policy.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'netpolicy-')), 'n.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'net-policy.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const N = await import(`file://${out}`);

const POLICY = { hosts: ['.roblox.com', 'api.github.com'] };

/* ------------------------------------------------------- compiling a policy --- */

test('the module under test actually loaded — nothing below is vacuous', () => {
  for (const fn of ['checkUrl', 'compileHostPolicy', 'guardedFetch', 'fetchBinary', 'failureToToolError']) {
    assert.equal(typeof N[fn], 'function', `${fn} is missing, so its assertions would be testing undefined`);
  }
  assert.equal(N.checkUrl('https://create.roblox.com/docs', POLICY).ok, true, 'and a legitimate URL is allowed');
});

test('a wildcard entry is refused rather than normalised', () => {
  // The failure this prevents: `*` silently becoming an entry that matches one literal host named
  // "*", so whoever wrote it believes they opened everything and in fact opened nothing.
  for (const bad of ['*', '*.roblox.com', 'evil*']) {
    const r = N.compileHostPolicy([bad]);
    assert.equal(r.ok, false, `"${bad}" compiled into an allowlist`);
    assert.match(r.errors.join(' '), /wildcard/);
  }
});

test('a one-label suffix is refused: ".com" is not an allowlist', () => {
  const r = N.compileHostPolicy(['.com']);
  assert.equal(r.ok, false);
  assert.match(r.errors.join(' '), /two labels/);
});

test('a URL, an empty string and an IP literal are all refused as entries', () => {
  for (const bad of ['https://docs.example.com/x', '', '   ', '203.0.113.7', 'user@example.com']) {
    assert.equal(N.compileHostPolicy([bad]).ok, false, `"${bad}" was accepted as a host entry`);
  }
});

test('ONE bad entry refuses the WHOLE list — a partial allowlist is the dangerous outcome', () => {
  const r = N.compileHostPolicy(['*', 'docs.example.com']);
  assert.equal(r.ok, false, 'the good entry must not carry the list past the wildcard');
  // CONTROL: the same good entry on its own compiles, so the refusal above is about the wildcard
  // and not about this test being unable to write a valid entry at all.
  const good = N.compileHostPolicy(['docs.example.com']);
  assert.equal(good.ok, true);
  assert.deepEqual(good.hosts, ['docs.example.com']);
});

/* ------------------------------------------------------------------- checkUrl --- */

test('only https — http is refused, never quietly upgraded', () => {
  const r = N.checkUrl('http://create.roblox.com/docs', POLICY);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'scheme');
  // The upgrade is the tempting fix and the wrong one; assert the URL did not come back https.
  assert.equal('url' in r, false, 'a refusal must not hand back a rewritten URL to use anyway');
});

test('every other scheme a model might produce is refused', () => {
  for (const url of ['file:///etc/passwd', 'data:text/html,<b>x', 'javascript:alert(1)', 'ftp://create.roblox.com/x']) {
    const r = N.checkUrl(url, POLICY);
    assert.equal(r.ok, false, `${url} was allowed`);
  }
});

test('credentials in the URL are refused — the host before the @ is not the host reached', () => {
  const r = N.checkUrl('https://api.github.com@evil.example/x', POLICY);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'credentials');
});

test('an IP literal is refused in every spelling, including the ones that do not look like one', () => {
  // `https://2130706433/` is 127.0.0.1 written as an integer. WHATWG URL normalises it, which is
  // exactly why the check is on the PARSED hostname rather than on the string the caller typed.
  const cases = ['https://127.0.0.1/', 'https://2130706433/', 'https://0x7f000001/', 'https://[::1]/', 'https://169.254.169.254/latest/meta-data'];
  for (const url of cases) {
    const r = N.checkUrl(url, { hosts: ['.roblox.com'] });
    assert.equal(r.ok, false, `${url} was allowed`);
    assert.ok(r.reason === 'ip_literal' || r.reason === 'local_host', `${url} was refused for the wrong reason: ${r.reason}`);
  }
});

test('intranet names are refused even if someone allowlists them', () => {
  // The allowlist itself names them, so this asserts the local-name rule runs FIRST. A policy
  // written by a confused operator must not be able to open a path to the metadata service.
  const permissive = { hosts: ['.localhost', 'metadata.google.internal', '.internal'] };
  for (const url of ['https://localhost/x', 'https://build.localhost/x', 'https://metadata.google.internal/x', 'https://svc.internal/x']) {
    const r = N.checkUrl(url, permissive);
    assert.equal(r.ok, false, `${url} was allowed`);
    assert.equal(r.reason, 'local_host');
  }
});

test('a non-standard port is refused unless the policy names it', () => {
  assert.equal(N.checkUrl('https://create.roblox.com:8443/x', POLICY).reason, 'port');
  const withPort = N.checkUrl('https://create.roblox.com:8443/x', { hosts: ['.roblox.com'], ports: [443, 8443] });
  assert.equal(withPort.ok, true, 'and it IS allowed once the policy says so');
});

test('suffix matching cannot be tricked by a lookalike host', () => {
  const allowed = ['https://create.roblox.com/docs', 'https://roblox.com/', 'https://CREATE.ROBLOX.COM/docs', 'https://create.roblox.com./docs'];
  for (const url of allowed) assert.equal(N.checkUrl(url, POLICY).ok, true, `${url} should be allowed`);

  const refused = ['https://notroblox.com/', 'https://roblox.com.evil.net/', 'https://evilroblox.com/', 'https://api.github.com.evil.net/'];
  for (const url of refused) {
    const r = N.checkUrl(url, POLICY);
    assert.equal(r.ok, false, `${url} matched the allowlist and must not have`);
    assert.equal(r.reason, 'not_allowlisted');
  }
});

test('a non-string, an empty string and an absurd URL are refused without throwing', () => {
  for (const input of [undefined, null, 42, {}, '', '   ', 'not a url', 'https://' + 'a'.repeat(4000) + '.roblox.com/']) {
    const r = N.checkUrl(input, POLICY);
    assert.equal(r.ok, false, `${JSON.stringify(input)?.slice(0, 40)} was allowed`);
    assert.equal(typeof r.detail, 'string');
  }
});

/* ------------------------------------------------------------- guardedFetch --- */

/** A fetch stub that records what it was asked for and answers from a script. */
function stubFetch(script) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const step = typeof script === 'function' ? script(url, calls.length) : script;
    if (step instanceof Error) throw step;
    return {
      status: step.status ?? 200,
      headers: { get: (h) => (step.headers ?? {})[h.toLowerCase()] ?? null },
      text: async () => step.body ?? '',
      arrayBuffer: async () => step.buffer ?? new TextEncoder().encode(step.body ?? '').buffer,
    };
  };
  return { impl, calls };
}

const html = (body) => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body });

test('a successful fetch reports what it read', async () => {
  const { impl, calls } = stubFetch(html('<p>hello</p>'));
  const r = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, true);
  assert.equal(r.body, '<p>hello</p>');
  assert.equal(r.status, 200);
  assert.equal(r.truncated, false);
  assert.deepEqual(r.hops, ['https://create.roblox.com/docs']);
  assert.equal(calls.length, 1);
});

test('A BLOCKED URL IS NEVER FETCHED — the policy runs before the socket', async () => {
  const { impl, calls } = stubFetch(html('secret'));
  const r = await N.guardedFetch('https://evil.example/x', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'blocked');
  assert.deepEqual(calls, [], 'the request was made anyway; the check is decorative');
});

test('a network error is a failure, not an empty page', async () => {
  const { impl } = stubFetch(new Error('connection reset'));
  const r = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'network');
  assert.match(r.failure.detail, /connection reset/);
  assert.equal('body' in r, false);
});

test('a timeout is reported as a timeout, and the caller is not left hanging', async () => {
  const impl = (url, init) =>
    new Promise((resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const e = new Error('aborted');
        e.name = 'AbortError';
        reject(e);
      });
    });
  const started = Date.now();
  const r = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl, timeoutMs: 40 });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'timeout');
  assert.ok(Date.now() - started < 3000, 'the timeout did not fire');
});

test('a 500 is a failure even though the server answered', async () => {
  const { impl } = stubFetch({ status: 500, headers: { 'content-type': 'text/html' }, body: 'upstream exploded' });
  const r = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'http_status');
  assert.equal(r.failure.status, 500);
  assert.match(r.failure.detail, /upstream exploded/);
});

test('a 404 with an empty body is a failure and not an empty document', async () => {
  // The exact confusion the rule exists for: status says "there is nothing here", the body says
  // "". Reading the body alone would produce a result indistinguishable from a blank page.
  const { impl } = stubFetch({ status: 404, headers: { 'content-type': 'text/html' }, body: '' });
  const r = await N.guardedFetch('https://create.roblox.com/nope', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.status, 404);
});

test('a body of the wrong type is refused rather than parsed hopefully', async () => {
  const { impl } = stubFetch({ status: 200, headers: { 'content-type': 'application/zip' }, body: 'PK' });
  const r = await N.guardedFetch('https://create.roblox.com/x.zip', { policy: POLICY, fetchImpl: impl, accept: ['text/html'] });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'unsupported_type');
  assert.equal(r.failure.contentType, 'application/zip');
});

test('an oversized body is truncated AND SAYS SO', async () => {
  const { impl } = stubFetch(html('x'.repeat(5000)));
  const r = await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl, maxBytes: 100 });
  assert.equal(r.ok, true);
  assert.equal(r.truncated, true, 'a silent truncation is a page the model thinks it read in full');
  assert.equal(r.body.length, 100);
  assert.equal(r.bytes, 5000, 'and the real size is reported, not the truncated one');
});

/* ------------------------------------------------------------------ redirects --- */

test('A REDIRECT OFF THE ALLOWLIST IS REFUSED, and the second host is never contacted', async () => {
  // The defect this is the whole reason for: one check on the URL the model supplied, then
  // `redirect: 'follow'` hands the request to anyone the allowlisted host names.
  const { impl, calls } = stubFetch((url) =>
    url.includes('create.roblox.com')
      ? { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } }
      : html('CLOUD CREDENTIALS'),
  );
  const r = await N.guardedFetch('https://create.roblox.com/go', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'blocked');
  assert.match(r.failure.detail, /redirect/);
  assert.deepEqual(calls.map((c) => c.url), ['https://create.roblox.com/go'], 'the redirect target was fetched');
});

test('the request is made with redirect:manual, or the policy above cannot run at all', async () => {
  const { impl, calls } = stubFetch(html('ok'));
  await N.guardedFetch('https://create.roblox.com/docs', { policy: POLICY, fetchImpl: impl });
  assert.equal(calls[0].init.redirect, 'manual');
});

test('a redirect that stays on the allowlist is followed, and every hop is recorded', async () => {
  const { impl, calls } = stubFetch((url) =>
    url.endsWith('/go') ? { status: 301, headers: { location: '/docs/final' } } : html('arrived'),
  );
  const r = await N.guardedFetch('https://create.roblox.com/go', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, true);
  assert.equal(r.body, 'arrived');
  assert.deepEqual(r.hops, ['https://create.roblox.com/go', 'https://create.roblox.com/docs/final']);
  assert.equal(calls.length, 2, 'a relative Location must resolve against the hop it came from');
});

test('a redirect loop ends in a failure rather than a hang', async () => {
  const { impl, calls } = stubFetch({ status: 302, headers: { location: 'https://create.roblox.com/loop' } });
  const r = await N.guardedFetch('https://create.roblox.com/loop', { policy: POLICY, fetchImpl: impl, maxRedirects: 2 });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'too_many_redirects');
  assert.equal(calls.length, 3, 'one initial request plus maxRedirects hops');
});

test('a 3xx with no Location is a failure, not a body', async () => {
  const { impl } = stubFetch({ status: 302, headers: {} });
  const r = await N.guardedFetch('https://create.roblox.com/go', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'http_status');
});

/* ---------------------------------------------------------------- fetchBinary --- */

test('a 200 carrying zero bytes is a failure — an empty image is a picture of a lie', async () => {
  const { impl } = stubFetch({ status: 200, headers: { 'content-type': 'image/png' }, buffer: new ArrayBuffer(0) });
  const r = await N.fetchBinary('https://create.roblox.com/shot.png', { policy: POLICY, fetchImpl: impl, accept: ['image/png'] });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'empty_body');
  assert.equal('base64' in r, false, 'a zero-byte result must not come back as an encodable image');
});

test('binary bytes survive the trip, and are reported honestly', async () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const { impl } = stubFetch({ status: 200, headers: { 'content-type': 'image/png' }, buffer: bytes.buffer });
  const r = await N.fetchBinary('https://create.roblox.com/shot.png', { policy: POLICY, fetchImpl: impl, accept: ['image/png'] });
  assert.equal(r.ok, true);
  assert.equal(r.bytes, 8);
  assert.equal(r.contentType, 'image/png');
  assert.equal(Buffer.from(r.base64, 'base64').equals(Buffer.from(bytes)), true, 'the bytes changed on the way through');
});

test('a body past the limit is refused rather than half-delivered', async () => {
  const { impl } = stubFetch({ status: 200, headers: { 'content-type': 'image/png' }, buffer: new ArrayBuffer(4096) });
  const r = await N.fetchBinary('https://create.roblox.com/shot.png', { policy: POLICY, fetchImpl: impl, accept: ['image/png'], maxBytes: 1024 });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'too_large');
  assert.equal(r.failure.bytes, 4096);
});

test('fetchBinary applies the SAME policy — it is not a second way out', async () => {
  const { impl, calls } = stubFetch({ status: 200, headers: { 'content-type': 'image/png' }, buffer: new ArrayBuffer(8) });
  const r = await N.fetchBinary('https://evil.example/shot.png', { policy: POLICY, fetchImpl: impl });
  assert.equal(r.ok, false);
  assert.equal(r.failure.kind, 'blocked');
  assert.deepEqual(calls, []);
});

/* ------------------------------------- no failure wears a success's clothes --- */

const EVERY_FAILURE = [
  { kind: 'blocked', reason: 'not_allowlisted', detail: 'x' },
  { kind: 'network', detail: 'x' },
  { kind: 'timeout', detail: 'x' },
  { kind: 'http_status', status: 503, detail: 'x' },
  { kind: 'too_many_redirects', detail: 'x' },
  { kind: 'too_large', bytes: 9, detail: 'x' },
  { kind: 'empty_body', detail: 'x' },
  { kind: 'unsupported_type', contentType: 'application/zip', detail: 'x' },
  { kind: 'not_configured', detail: 'x' },
];

test('every failure kind produces a result that cannot be read as content', () => {
  for (const failure of EVERY_FAILURE) {
    const result = N.failureToToolError(failure);
    assert.equal(typeof result.error, 'string');
    assert.ok(result.error.length > 10, `${failure.kind} produced a useless message: ${result.error}`);
    for (const contentish of ['body', 'content', 'text', 'results', 'base64', 'links']) {
      assert.equal(contentish in result, false, `${failure.kind} carries a "${contentish}" field a reader would treat as an answer`);
    }
    assert.equal(result.failure.kind, failure.kind, 'the machine-readable kind must survive for a caller that wants to branch');
  }
});

test('the enumeration above is the real one — a new failure kind cannot slip past it', async () => {
  // Reads the union out of the source. Without this, adding a tenth kind would leave it untested
  // while the loop above kept passing over the nine it knows.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(WORKER, 'src', 'net-policy.ts'), 'utf8');
  const decl = src.slice(src.indexOf('export type FetchFailure'), src.indexOf('export interface FetchSuccess'));
  const kinds = [...decl.matchAll(/kind: '([a-z_]+)'/g)].map((m) => m[1]).sort();
  assert.deepEqual(kinds, EVERY_FAILURE.map((f) => f.kind).sort(), 'FetchFailure gained or lost a kind; update this file');
});

test('an unknown failure kind still describes itself rather than reading as success', () => {
  const described = N.describeFailure({ kind: 'from_the_future', detail: 'something new' });
  assert.match(described, /from_the_future/);
  assert.match(described, /something new/);
});
