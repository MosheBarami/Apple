/**
 * Rotating an API key, which is three security properties wearing a convenience feature.
 *
 * f-5afe35cb. A long-lived credential that cannot be replaced without downtime does not get
 * replaced, so rotation is what makes a leak recoverable. But every rotation is a moment where a
 * grant is copied, and a copy is where a grant silently grows.
 *
 * THE THREE PROPERTIES, each of which is a way rotation goes wrong:
 *
 *   INHERIT EXACTLY — the replacement carries the old key's scopes, projects and mode and nothing
 *     else. Rotation is not a mint: a caller who could rotate into a wider grant would never need
 *     to ask for one.
 *   NEVER RESURRECT — a revoked key cannot be rotated. Rotating one would hand back the access
 *     revocation took away, through a route whose name sounds harmless.
 *   NEVER EXTEND — the old key's retirement is `min(now + grace, its own expiry)`. A key that
 *     already expires in an hour must not gain a day because somebody rotated it.
 *
 * The plan is a pure function so all three are decided in one place and can be read.
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
const out = join(mkdtempSync(join(tmpdir(), 'keyrot-')), 'keys.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'api-keys.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const K = await import(`file://${out}`);

const NOW = Date.parse('2026-09-15T12:00:00Z');
const DAY = 864e5;
const key = (over = {}) => ({
  id: 'k1', userId: 'u1', mode: 'live', name: 'ci',
  scopes: ['read', 'write'],
  projects: [{ id: 'p1', name: 'One' }],
  createdAt: NOW - 30 * DAY,
  expiresAt: null, lastUsedAt: null, revokedAt: null,
  ...over,
});

test('CONTROL: a healthy key rotates, and the plan says when the old one dies', () => {
  const plan = K.planRotation(key(), { now: NOW, graceMs: DAY });
  assert.equal(plan.ok, true, `expected a plan, got ${JSON.stringify(plan)}`);
  assert.equal(plan.retireAt, NOW + DAY, 'the old key retires after the grace period');
});

test('INHERIT EXACTLY: the replacement carries the old grant and nothing more', () => {
  const old = key({ scopes: ['read'], projects: [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }], mode: 'test' });
  const plan = K.planRotation(old, { now: NOW, graceMs: DAY });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.replacement.scopes, ['read'], 'scopes are inherited, not widened');
  assert.deepEqual(plan.replacement.projects.map((p) => p.id), ['p1', 'p2'], 'projects are inherited');
  assert.equal(plan.replacement.mode, 'test', 'mode is inherited — a test key does not rotate into a live one');
  assert.equal(plan.replacement.userId, old.userId, 'and it stays the same owner');
});

test('INHERIT EXACTLY: mutating the plan cannot reach back into the old record', () => {
  // A shallow copy would let a caller push a scope onto the array the old key still holds.
  const old = key();
  const plan = K.planRotation(old, { now: NOW, graceMs: DAY });
  plan.replacement.scopes.push('admin');
  plan.replacement.projects.push({ id: 'p9', name: 'Nine' });
  assert.deepEqual(old.scopes, ['read', 'write'], 'the original scopes are untouched');
  assert.deepEqual(old.projects.map((p) => p.id), ['p1'], 'the original projects are untouched');
});

test('NEVER RESURRECT: a revoked key cannot be rotated', () => {
  const plan = K.planRotation(key({ revokedAt: NOW - DAY }), { now: NOW, graceMs: DAY });
  assert.equal(plan.ok, false, 'rotating a revoked key would hand back what revocation took away');
  assert.equal(plan.code, 'revoked_api_key');
});

test('NEVER RESURRECT: an already-expired key cannot be rotated', () => {
  const plan = K.planRotation(key({ expiresAt: NOW - 1 }), { now: NOW, graceMs: DAY });
  assert.equal(plan.ok, false);
  assert.equal(plan.code, 'expired_api_key');
});

test('NEVER EXTEND: retirement is capped by the key\'s own expiry', () => {
  // Expires in an hour, grace is a day. The old key must still die in an hour.
  const hour = 36e5;
  const plan = K.planRotation(key({ expiresAt: NOW + hour }), { now: NOW, graceMs: DAY });
  assert.equal(plan.ok, true);
  assert.equal(plan.retireAt, NOW + hour, `rotation extended the key's life to ${plan.retireAt - NOW}ms`);
});

test('NEVER EXTEND: the replacement does not outlive the key it replaces', () => {
  const week = 7 * DAY;
  const plan = K.planRotation(key({ expiresAt: NOW + week }), { now: NOW, graceMs: DAY });
  assert.equal(plan.replacement.expiresAt, NOW + week, 'the replacement inherits the same deadline');
});

test('a corrupt clock or grace refuses rather than computing a deadline', () => {
  // `now + grace` with either non-finite is NaN, and authorizeKey reads a NaN expiry as corrupt.
  // Deciding that here means the refusal names the cause instead of minting a key that never works.
  for (const [label, opts] of [
    ['now NaN', { now: NaN, graceMs: DAY }],
    ['now a string', { now: '123', graceMs: DAY }],
    ['grace NaN', { now: NOW, graceMs: NaN }],
    ['grace Infinity', { now: NOW, graceMs: Infinity }],
    ['grace negative', { now: NOW, graceMs: -1 }],
  ]) {
    const plan = K.planRotation(key(), opts);
    assert.equal(plan.ok, false, `${label} should refuse`);
    assert.equal(plan.code, 'bad_rotation_window', `${label} should name the cause`);
  }
});

test('a malformed record refuses rather than rotating something it cannot read', () => {
  for (const bad of [null, undefined, 'k1', 42, {}, { id: 'k1' }]) {
    const plan = K.planRotation(bad, { now: NOW, graceMs: DAY });
    assert.equal(plan.ok, false, `${JSON.stringify(bad)} should refuse`);
  }
});

test('CONTROL: a grace of zero retires the old key immediately, and is allowed', () => {
  // Zero is a legitimate choice — "cut it off now" — and must not be confused with a missing value.
  const plan = K.planRotation(key(), { now: NOW, graceMs: 0 });
  assert.equal(plan.ok, true);
  assert.equal(plan.retireAt, NOW, 'zero grace means the old key stops at once');
});
