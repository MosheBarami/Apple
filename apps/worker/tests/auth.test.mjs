// The JWT verifier, which had no test at all.
//
// WHY THIS EXISTS. `apps/worker/src/auth.ts` is what stands between an anonymous request and every
// authenticated route in this product, and until now nothing in this repository imported it. The
// backlog row "Authentication" was marked done citing the sentence "Supabase ES256 JWKS verify,
// auth.ts" — which names the file and proves nothing about it.
//
// A broken JWT verifier is the worst shape of bug this codebase keeps naming: a verifier that
// accepts a forged token returns a perfectly well-formed AuthedUser, every downstream route works,
// every other test stays green, and the only symptom is that anyone can be anyone. There is no
// crash to notice. That is the same class as an empty ledger drawn as a clearance, moved to the
// front door.
//
// Real keys, real signatures. Every token below is signed with Web Crypto against a real P-256
// keypair, and the JWKS endpoint is served from a stubbed fetch, so the code under test runs its
// actual jose verification path rather than a mock of it. The forgery cases are signed by a SECOND,
// genuinely different keypair — not merely corrupted — because a corrupted signature can fail for
// reasons that have nothing to do with key checking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-auth-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'auth.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const A = await import(`file://${out}`);
process.on('exit', () => rmSync(out, { force: true }));

/* ------------------------------------------------------------------ signing --- */

const b64url = (buf) =>
  Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function makeKeypair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  // The JWKS advertises what the key may be used for. `alg` and `use` are what jose matches on
  // alongside kid, so a JWKS that omits them is not a realistic fixture.
  return { pair, jwk: { ...jwk, kid, alg: 'ES256', use: 'sig', key_ops: undefined, ext: undefined } };
}

async function sign(privateKey, kid, claims) {
  const header = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }));
  const payload = b64url(JSON.stringify(claims));
  const data = new TextEncoder().encode(`${header}.${payload}`);
  // ECDSA over SHA-256 produces the raw r||s form ES256 requires — the same bytes jose expects.
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, privateKey, data);
  return `${header}.${payload}.${b64url(sig)}`;
}

const SUPABASE_URL = 'https://proj.supabase.co';
const ENV = { SUPABASE_URL };
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

const now = () => Math.floor(Date.now() / 1000);

/** The claim set a real Supabase access token carries, before any case bends one field. */
const goodClaims = (over = {}) => ({
  sub: 'user-abc',
  email: 'someone@example.com',
  role: 'authenticated',
  iss: `${SUPABASE_URL}/auth/v1`,
  aud: 'authenticated',
  iat: now() - 10,
  exp: now() + 3600,
  ...over,
});

/* ------------------------------------------------------------------- fixtures --- */

const real = await makeKeypair('key-1');
const attacker = await makeKeypair('key-1'); // SAME kid, different key: the interesting forgery

/** Serve the JWKS, and count fetches so the caching assertions are measured, not assumed. */
let fetches = [];
const install = (keys) => {
  fetches = [];
  globalThis.fetch = async (input) => {
    const url = typeof input === 'string' ? input : input.url;
    fetches.push(url);
    if (url === JWKS_URL) {
      return new Response(JSON.stringify({ keys }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('not found', { status: 404 });
  };
};
install([real.jwk]);

/* ----------------------------------------------------------------- the cases --- */

test('a genuine token verifies and maps to the user it names', async () => {
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims());
  const user = await A.verifyJwt(ENV, token);
  assert.ok(user, 'a correctly signed, in-date token must verify');
  assert.equal(user.userId, 'user-abc');
  assert.equal(user.email, 'someone@example.com');
  assert.equal(user.role, 'authenticated');
  assert.equal(user.jwt, token, 'the caller gets the token back, for onward calls');
});

test('A TOKEN SIGNED BY ANOTHER KEY IS REFUSED — the one that matters', async () => {
  // Identical claims, identical kid, valid structure, correct issuer and audience. The ONLY
  // difference is who signed it. If this passes, the verifier is decoding rather than verifying,
  // and anyone who can write JSON is any user they choose.
  const forged = await sign(attacker.pair.privateKey, 'key-1', goodClaims());
  assert.equal(await A.verifyJwt(ENV, forged), null);
});

test('an expired token is refused', async () => {
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims({ exp: now() - 1, iat: now() - 3600 }));
  assert.equal(await A.verifyJwt(ENV, token), null);
});

test('a token from another issuer is refused, even correctly signed by our key', async () => {
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims({ iss: 'https://evil.example/auth/v1' }));
  assert.equal(await A.verifyJwt(ENV, token), null);
});

test('a token for another audience is refused', async () => {
  // Supabase issues tokens for several audiences. One minted for a different one is a real token
  // that must not open this door.
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims({ aud: 'anon' }));
  assert.equal(await A.verifyJwt(ENV, token), null);
});

test('A TOKEN WITH NO SUBJECT IS NULL, NOT A USER WITH AN UNDEFINED ID', async () => {
  // The failure this guards is the one that does not look like a failure: `{ userId: undefined }`
  // is an object, it is truthy, and every `if (user)` downstream treats it as signed in.
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims({ sub: undefined }));
  assert.equal(await A.verifyJwt(ENV, token), null);
});

test('a non-string email or role does not become one', async () => {
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims({ email: { x: 1 }, role: 42 }));
  const user = await A.verifyJwt(ENV, token);
  assert.ok(user);
  assert.equal(user.email, null, 'a structured email is dropped, not stringified');
  assert.equal(user.role, 'authenticated', 'a non-string role falls back rather than carrying a number');
});

test('garbage is refused rather than thrown', async () => {
  // Every one of these reaches the verifier from a real request at some point. A throw here is a
  // 500 on a malformed header, which is a denial-of-service shaped like a bug.
  for (const bad of ['', 'not-a-jwt', 'a.b.c', 'a.b', '...', 'Bearer x.y.z']) {
    assert.equal(await A.verifyJwt(ENV, bad), null, `"${bad}" must be refused quietly`);
  }
});

test('the JWKS is cached across calls, and re-fetched when the project URL changes', async () => {
  // The cache is module-level state keyed on the URL. Caching is the point — a network round trip
  // per request would be untenable — but a cache that ignored the key would serve one project's
  // keys for another project's tokens, which is a cross-tenant hole with no symptom.
  // Deliberately NOT asserting a cold-start fetch. The cache is module-level and the cases above
  // have already warmed it, so "the first call fetches" is true only of whichever test runs first —
  // an assertion about test order dressed as an assertion about caching. What IS order-independent
  // is that a warm cache still verifies without going to the network, and that a new URL goes.
  install([real.jwk]);
  const token = await sign(real.pair.privateKey, 'key-1', goodClaims());
  assert.ok(await A.verifyJwt(ENV, token), 'a warm cache must still verify');
  assert.ok(await A.verifyJwt(ENV, token), 'and again');
  assert.equal(fetches.length, 0, 'neither call re-fetched: the key set is genuinely cached');

  // A different project: its tokens must not be verifiable against the cached keys.
  const OTHER = { SUPABASE_URL: 'https://other.supabase.co' };
  const otherToken = await sign(real.pair.privateKey, 'key-1', {
    ...goodClaims(),
    iss: 'https://other.supabase.co/auth/v1',
  });
  const before = fetches.length;
  await A.verifyJwt(OTHER, otherToken);
  assert.ok(
    fetches.length > before,
    'changing SUPABASE_URL must re-fetch rather than reuse the previous project keys',
  );
  assert.ok(
    fetches.some((u) => u.startsWith('https://other.supabase.co')),
    'the re-fetch must go to the NEW project',
  );
});

/* -------------------------------------------------------------- bearerToken --- */

test('bearerToken reads an Authorization header', () => {
  const req = new Request('https://x/', { headers: { Authorization: 'Bearer abc.def.ghi' } });
  assert.equal(A.bearerToken(req), 'abc.def.ghi');
});

test('bearerToken ignores a non-Bearer scheme rather than returning the wrong half', () => {
  for (const h of ['Basic abc', 'bearer abc', 'Bearer', 'abc.def.ghi']) {
    const req = new Request('https://x/', { headers: { Authorization: h } });
    assert.equal(A.bearerToken(req), null, `"${h}" is not a bearer token`);
  }
});

test('bearerToken reads the golem.jwt. WebSocket subprotocol', () => {
  // A browser cannot set headers on a WebSocket, so the token rides the subprotocol list. The
  // `golem.jwt.` prefix is a load-bearing wire literal and must not be renamed.
  const req = new Request('https://x/', {
    headers: { 'Sec-WebSocket-Protocol': 'golem.v1, golem.jwt.abc.def.ghi' },
  });
  assert.equal(A.bearerToken(req), 'abc.def.ghi');
});

test('the subprotocol token is found wherever it sits in the list, and absent when it is not there', () => {
  const first = new Request('https://x/', {
    headers: { 'Sec-WebSocket-Protocol': 'golem.jwt.tok, golem.v1' },
  });
  assert.equal(A.bearerToken(first), 'tok');

  const none = new Request('https://x/', { headers: { 'Sec-WebSocket-Protocol': 'golem.v1, chat' } });
  assert.equal(A.bearerToken(none), null);
});

test('a header beats a subprotocol, and neither yields null', () => {
  const both = new Request('https://x/', {
    headers: { Authorization: 'Bearer from-header', 'Sec-WebSocket-Protocol': 'golem.jwt.from-proto' },
  });
  assert.equal(A.bearerToken(both), 'from-header', 'one precedence, stated');
  assert.equal(A.bearerToken(new Request('https://x/')), null);
});
