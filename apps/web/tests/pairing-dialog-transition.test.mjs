import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pairingAttemptConnected } from '../src/lib/pairing-confirmation.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIALOG = readFileSync(join(WEB, 'src', 'components', 'pairing-dialog.tsx'), 'utf8');

const first = {
  studioConnected: false,
  diagnosticsKnown: true,
  pairedAt: null,
  lastSeenAt: null,
};

test('a first Studio connection completes a code that is already in the ready state', () => {
  assert.equal(pairingAttemptConnected(first, false, null), false);
  assert.equal(pairingAttemptConnected(first, true, null), true);
});

test('an already-connected Studio cannot satisfy a replacement code by staying true', () => {
  const baseline = {
    studioConnected: true,
    diagnosticsKnown: true,
    pairedAt: 1_000,
    lastSeenAt: 1_100,
  };

  assert.equal(pairingAttemptConnected(baseline, true, {
    pairedAt: 1_000,
    connected: true,
    lastSeenAt: 1_200,
  }), false, 'the old token may keep polling while the replacement code is waiting');

  assert.equal(pairingAttemptConnected(baseline, true, {
    pairedAt: 2_000,
    connected: true,
    lastSeenAt: 1_200,
  }), false, 'a changed token time without a heartbeat after it is only a claim, not a live Studio');

  assert.equal(pairingAttemptConnected(baseline, true, {
    pairedAt: 2_000,
    connected: true,
    lastSeenAt: 2_050,
  }), true);
});

test('replacement stays waiting when the pre-mint diagnostics baseline was unknown', () => {
  const unknown = {
    studioConnected: true,
    diagnosticsKnown: false,
    pairedAt: null,
    lastSeenAt: null,
  };
  assert.equal(pairingAttemptConnected(unknown, true, {
    pairedAt: 2_000,
    connected: true,
    lastSeenAt: 2_050,
  }), false);
});

test('a dropped live signal never renders a successful pairing', () => {
  const baseline = {
    studioConnected: true,
    diagnosticsKnown: true,
    pairedAt: 1_000,
    lastSeenAt: 1_100,
  };
  assert.equal(pairingAttemptConnected(baseline, false, {
    pairedAt: 2_000,
    connected: true,
    lastSeenAt: 2_050,
  }), false);
});

test('an offline old Studio reconnecting is not a newly claimed replacement code', () => {
  const baseline = { studioConnected: false, diagnosticsKnown: true, pairedAt: 1_000, lastSeenAt: 1_100 };
  assert.equal(pairingAttemptConnected(baseline, true, { pairedAt: 1_000, connected: true, lastSeenAt: 1_900 }), false);
  assert.equal(pairingAttemptConnected(baseline, true, { pairedAt: 500, connected: true, lastSeenAt: 1_900 }), false);
  assert.equal(pairingAttemptConnected(baseline, true, { pairedAt: 2_000, connected: true, lastSeenAt: 2_010 }), true);
});

test('unknown and malformed pairing identities do not earn a first-connection shortcut', () => {
  const unknown = { studioConnected: false, diagnosticsKnown: false, pairedAt: null, lastSeenAt: null };
  assert.equal(pairingAttemptConnected(unknown, true, null), false);
  const previous = { studioConnected: false, diagnosticsKnown: true, pairedAt: 1_000, lastSeenAt: 1_100 };
  for (const pairedAt of [NaN, Infinity, -1]) {
    assert.equal(pairingAttemptConnected(previous, true, { pairedAt, connected: true, lastSeenAt: 2_500 }), false);
  }
});

test('the dialog wires confirmation into minted-code states and cleans its bounded refresh', () => {
  assert.match(DIALOG, /pairingAttemptConnected\(/, 'the behavioural predicate is not used by the dialog');
  assert.match(DIALOG, /state === 'ready'[\s\S]{0,240}?pairing/, 'a minted ready code is not eligible to complete');
  assert.match(DIALOG, /window\.setInterval\([\s\S]{0,500}?record\.refetch/, 'diagnostics are not refreshed while a code is claimable');
  assert.match(DIALOG, /window\.clearInterval\(/, 'the pairing diagnostics refresh has no cleanup');
  assert.match(DIALOG, /expiresAtIso/, 'the refresh is not bounded by the code lifetime');
  assert.match(DIALOG, /mintGenerationRef\.current !== generation/, 'a settled mint is not fenced from a later project or attempt');
});

test('error and expired code states do not keep telling Studio to enter a dead code', () => {
  // The PROPERTY, not a distance: the guard nearest above the waiting copy is the claimable-code
  // guard. This was `[\s\S]{0,500}?` and went red when a restart note (F-026) was added inside the
  // very block it protects.
  const at = DIALOG.indexOf('Waiting for Studio');
  assert.ok(at > 0, 'the waiting copy was not found');
  const guards = [...DIALOG.slice(0, at).matchAll(/\{(state === [^\n]*?) && \(/g)];
  assert.equal(
    guards.at(-1)?.[1],
    "state === 'ready' && pairing && !expired",
    'waiting copy must exist only while the shown code is still claimable',
  );
});
