/**
 * PairingDO — the short-lived codes that bind a Studio plugin to a project.
 *
 * WHY IT MATTERS. `/api/studio/claim` is UNAUTHENTICATED: a correct code is the whole credential,
 * and what it returns is a projectId, a userId and a project name. Nothing targeted this file.
 *
 * THE KEYSPACE, stated so a future reader can judge it rather than assume it. 6 characters from a
 * 31-character alphabet is 31^6 = 8.875e8, or 29.7 bits. Codes live 10 minutes and a user may hold
 * at most 5 at once. The only brute-force brake is index.ts's per-IP limiter at 10 claims/minute,
 * which is per-isolate and therefore best-effort. One address gets ~100 guesses per code lifetime
 * against 8.9e8, which is nothing; a large botnet changes that arithmetic and the number to watch
 * is how many codes are live at once, not the keyspace.
 *
 * THE DEFECT. `ALPHABET[b % 31]` over a random BYTE is modulo bias: 256 = 8*31 + 8, so the first
 * EIGHT letters get one extra chance in 256. Measured over 2,000,000 bytes:
 *
 *   over-represented : A +9.3%  F +9.3%  H +9.2%  G +9.2%
 *   under-represented: S -3.9%  T -3.7%  Q -3.7%  Z -3.6%
 *
 * A 13.5% spread, costing ~0.75 bits of the 29.7 — an attacker guessing most-likely-first is about
 * 1.7x better off. That is a small effect and I am not going to inflate it: the reason to fix it is
 * that it is free, and that a biased code generator is the kind of thing nobody re-examines once it
 * ships. Rejection sampling costs one loop.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'pairing-')), 'pairing.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'pairing.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const P = await import(`file://${out}`);

function pairing(now = () => Date.now()) {
  const m = new Map();
  let alarm = null;
  const storage = {
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(k, v) { m.set(k, structuredClone(v)); },
    async delete(k) { return m.delete(k); },
    async list({ prefix } = {}) {
      const e = [...m.entries()].filter(([k]) => !prefix || k.startsWith(prefix));
      return new Map(e.map(([k, v]) => [k, structuredClone(v)]));
    },
    setAlarm(t) { alarm = t; }, getAlarm() { return alarm; },
  };
  const o = new P.PairingDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (p, body) =>
    (await o.fetch(new Request('https://do' + p, { method: 'POST', body: JSON.stringify(body ?? {}) }))).json();
  return {
    o, map: m, call, alarmAt: () => alarm,
    create: (userId = 'u1', projectId = 'p1') => call('/create', { userId, projectId, projectName: 'Proj' }),
    claim: (code) => call('/claim', { code }),
    status: async (p, body) => (await o.fetch(new Request('https://do' + p, { method: 'POST', body: JSON.stringify(body ?? {}) }))).status,
  };
}

test('CONTROL: a created code claims once and returns the binding', async () => {
  const q = pairing();
  const made = await q.create('user-a', 'project-a');
  assert.match(made.code, /^[A-Z0-9]{6}$/, `code looks wrong: ${made.code}`);
  const got = await q.claim(made.code);
  assert.equal(got.projectId, 'project-a');
  assert.equal(got.userId, 'user-a');
});

test('a code is SINGLE USE', async () => {
  const q = pairing();
  const { code } = await q.create();
  await q.claim(code);
  const second = await q.claim(code);
  assert.equal(second.error, 'invalid or expired code', 'a claimed code must not work twice');
});

test('a code older than its TTL is refused, and a wrong code is refused', async () => {
  const q = pairing();
  const { code } = await q.create();
  // age it past the 10-minute TTL in storage rather than waiting
  const rec = q.map.get(`code:${code}`);
  q.map.set(`code:${code}`, { ...rec, createdAt: Date.now() - 11 * 60 * 1000 });
  assert.equal((await q.claim(code)).error, 'invalid or expired code', 'an expired code must be refused');
  assert.equal((await q.claim('ZZZZZZ')).error, 'invalid or expired code', 'an unissued code must be refused');
});

test('one user may not hold more than five live codes', async () => {
  const q = pairing();
  for (let i = 0; i < 5; i++) assert.ok((await q.create('same-user')).code, `code ${i + 1} should be issued`);
  const sixth = await q.create('same-user');
  assert.equal(sixth.error, 'too many active codes');
  assert.equal(await q.status('/create', { userId: 'same-user', projectId: 'p', projectName: 'P' }), 429);
  // and the cap is PER USER, not global
  assert.ok((await q.create('other-user')).code, 'a different user must still be able to pair');
});

test('claiming normalises case and separators', async () => {
  const q = pairing();
  const { code } = await q.create();
  const messy = code.toLowerCase().split('').join('-');
  assert.equal((await q.claim(messy)).projectId, 'p1', `"${messy}" should resolve to ${code}`);
});

test('a code that is not a string is refused rather than crashing the object', async () => {
  const q = pairing();
  for (const bad of [null, 42, {}, []]) {
    const r = await q.claim(bad);
    assert.equal(r.error, 'invalid or expired code', `${JSON.stringify(bad)} must be refused cleanly`);
  }
});

test('CODES ARE DRAWN UNIFORMLY — no modulo bias', async () => {
  // `ALPHABET[b % 31]` over a random byte gives the first 8 letters an extra chance in 256,
  // measured at +9.3% before the fix.
  //
  // THE THRESHOLD IS COMPUTED, NOT GUESSED, because my first attempt was FLAKY and a falsification
  // caught it: breaking single-use turned this test red, which it cannot cause. At 20,000 codes
  // (120k draws) expected is 3,871 per character with sigma 61, so a 4% band sits 2.5 sigma out —
  // about a 30% chance that ONE of 31 characters strays past it by luck alone. A test that fails a
  // third of the time teaches people to re-run it.
  //
  // At 60,000 codes: 360k draws, expected 11,613, sigma 106. The 6% band is 6.6 sigma (false
  // failure ~1e-10 across all 31), and the real defect is 9.3% = 10 sigma. Wide margin both ways.
  const N = 60000;
  const counts = new Map();
  for (let i = 0; i < N; i++) for (const ch of P.newPairingCode()) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  const alphabet = [...counts.keys()];
  assert.equal(alphabet.length, 31, `expected 31 distinct characters, saw ${alphabet.length}`);
  const expected = (N * 6) / 31;
  for (const [ch, n] of counts) {
    const dev = Math.abs(n / expected - 1);
    assert.ok(dev < 0.06, `"${ch}" appeared ${n} times against ${Math.round(expected)} expected (${(dev * 100).toFixed(1)}% off)`);
  }
});

test('CONTROL: the generator still produces the intended shape and no confusables', async () => {
  // A "fix" that returned a constant, or widened the alphabet to dodge the bias check, would pass
  // the uniformity test above.
  const seen = new Set();
  for (let i = 0; i < 5000; i++) {
    const c = P.newPairingCode();
    assert.match(c, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{6}$/, `bad code ${c}`);
    seen.add(c);
  }
  assert.ok(seen.size > 4990, `only ${seen.size} distinct codes in 5000 — the generator is not random`);
  for (const confusable of ['I', 'L', 'O', '0', '1']) {
    assert.equal([...seen].some((c) => c.includes(confusable)), false, `"${confusable}" is confusable and must not appear`);
  }
});
