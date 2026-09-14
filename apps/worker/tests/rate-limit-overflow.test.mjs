/**
 * The IP limiter's OVERFLOW POLICY, executed — because a memory bound was also a security reset.
 *
 * WHAT WAS WRONG. `ipHits` is one Map holding every counter the worker keeps: `admin-fail:<ip>` for
 * wrong admin keys, and `claim:<ip>` / `poll:<ip>` for the studio plugin routes, which are
 * UNAUTHENTICATED. It bounded its memory with `if (ipHits.size > 5000) ipHits.clear()`. That clear
 * does not distinguish between the two, so anyone able to create 5,000 entries could wipe a counter
 * belonging to a different security domain — and creating them needs no credentials at all.
 *
 * Measured end to end before the fix, and these are the numbers this file now holds in place:
 *   121 wrong admin keys from one address  -> 429, the limiter holding
 *   flood 5,200 distinct addresses at /api/studio/claim
 *   same address, same wrong key           -> 403, the counter gone
 *   fresh guesses available                -> 120, and the flood is repeatable
 *
 * The admin gate's own comment states the property this broke: "what matters is that unbounded
 * guessing becomes bounded." It was not bounded. Against a high-entropy key the time-to-break stays
 * effectively infinite either way, which is why this is a defect and not an incident — but a
 * defence that does not hold should not read like one.
 *
 * WHY THE FLOOD IS REAL. `CF-Connecting-IP` is set by Cloudflare and cannot be spoofed, so this
 * needs 5,000 genuine source addresses. That is a botnet — which is precisely the "distributed
 * flood" the cleared line was written to survive.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as esbuild from 'esbuild';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const OUT = join(tmpdir(), `apple-ratelimit-${process.pid}.mjs`);

await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'index.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: OUT,
  plugins: [{
    name: 'stub-boundaries',
    setup(b) {
      // EXTERNAL, not bundled — a bundled stub is copied into the output and the app gets its own
      // private copy, so anything this file sets is invisible to the code under test.
      b.onResolve({ filter: /^\.\/auth$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'auth.mjs')).href, external: true }));
      b.onResolve({ filter: /^\.\/supa$/ }, () => ({ path: pathToFileURL(join(HERE, 'stubs', 'supa.mjs')).href, external: true }));
      // Bundled deliberately: left external, Node's loader refuses the `cloudflare:` scheme.
      b.onResolve({ filter: /^cloudflare:workers$/ }, () => ({ path: join(HERE, 'stubs', 'cloudflare-workers.mjs') }));
    },
  }],
});
const app = (await import(`file://${OUT}`)).default;
process.on('exit', () => rmSync(OUT, { force: true }));

// EVERY Durable Object the flooded route touches is stubbed, and that is not tidiness.
//
// My first version stubbed only PAIRING_DO. The claim route then threw on SESSION_DO, and those
// throws are ASYNCHRONOUS: all four tests still passed, but the process exited non-zero. A
// falsification harness reading the exit code then reported "0 red" for a deliberately reintroduced
// bug — a harness error rendering as an observation about the product, which is the pattern this
// repository is named for. The stub is complete so that a non-zero exit means a real failure.
const doStub = () => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json({ ok: false }) }) });
const ENV = {
  ADMIN_KEY: 'a-high-entropy-admin-key',
  PAIRING_DO: doStub(), SESSION_DO: doStub(), ADMIN_DO: doStub(),
  BUDGET_DO: doStub(), QUOTA_DO: doStub(),
};
const CTX = { waitUntil() {}, passThroughOnException() {} };

const hit = (path, ip, opts = {}) =>
  app.fetch(new Request('https://w' + path, {
    method: opts.method ?? 'GET',
    headers: { 'CF-Connecting-IP': ip, ...(opts.headers ?? {}) },
    ...(opts.body ? { body: opts.body } : {}),
  }), ENV, CTX);

const guessAdminKey = (ip, tag) => hit('/api/admin/stats', ip, { headers: { 'X-Admin-Key': 'wrong-' + tag } });

/** Wrong keys from one address until the limiter refuses; returns how many it took. */
async function guessesUntilBlocked(ip, tag, cap = 400) {
  for (let i = 1; i <= cap; i++) {
    if ((await guessAdminKey(ip, `${tag}-${i}`)).status === 429) return i;
  }
  return null; // never blocked
}

/** Create `n` distinct limiter entries through an endpoint that needs no credentials. */
async function floodFromDistinctAddresses(n) {
  for (let i = 0; i < n; i++) {
    await hit('/api/studio/claim', `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`,
      { method: 'POST', body: JSON.stringify({ code: 'x' }) });
  }
}

test('the admin-key limiter blocks a guessing run from one address', async () => {
  // The control. If this ever stops blocking, every assertion below passes for the wrong reason.
  const n = await guessesUntilBlocked('203.0.113.10', 'control');
  assert.notEqual(n, null, 'wrong admin keys must eventually be refused');
  assert.equal(n, 121, 'the allowance is 120, so the 121st guess is the first refusal');
});

test('the limiter counts per address, not globally', async () => {
  await guessesUntilBlocked('203.0.113.11', 'a');
  const other = await guessAdminKey('203.0.113.12', 'b');
  assert.notEqual(other.status, 429, "one address being blocked must not block a different one");
});

test('AN UNAUTHENTICATED FLOOD CANNOT RESET ANOTHER ADDRESS\'S ADMIN COUNTER', async () => {
  // The finding. Before the fix this returned 403 with a fresh 120 guesses behind it.
  const attacker = '203.0.113.13';
  assert.equal(await guessesUntilBlocked(attacker, 'pre'), 121, 'the attacker must be blocked first');
  assert.equal((await guessAdminKey(attacker, 'confirm')).status, 429, 'and stay blocked');

  await floodFromDistinctAddresses(5_200); // no credentials used, and repeatable

  const after = await guessAdminKey(attacker, 'post');
  assert.equal(after.status, 429,
    'the flood wiped the admin counter: a memory bound must not double as a security reset');
});

test('CONTROL: the overflow sweep does not block an address that never offended', async () => {
  // A policy that kept everything — or refused everyone — would also pass the test above while
  // making the limiter useless or the service unusable. A fresh address must still get its
  // full allowance after a flood has forced the sweep to run.
  const fresh = '198.51.100.7';
  const r = await guessAdminKey(fresh, 'fresh');
  assert.notEqual(r.status, 429, 'an address with no history must not be refused');
  assert.equal(await guessesUntilBlocked(fresh, 'fresh2'), 120,
    'and must have the rest of its allowance, the first guess above having used one');
});
