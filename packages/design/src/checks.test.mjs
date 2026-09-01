// Tests for the executable design checks.
//
// Every fixture below is REAL. The overlap rectangle is the one measured in a live
// play session before the fix; the unbounded wait is the line that made every panel
// in the game unreachable; the price disagreement is the one users were actually
// shown. A check validated only against invented input proves the check runs, not
// that it catches anything.
//
// The suite also audits the SHIPPING source, so a regression fails here rather than
// in a screenshot three passes later.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkClusterOverlap, checkWaitContracts, checkPriceAgreement, checkMotionGate, audit } from './checks.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..');
const CLIENT = join(REPO, 'apps', 'benchmark', 'crystal-canyon', 'src', 'client');
const read = (f) => ({ path: f, source: readFileSync(join(CLIENT, f), 'utf8') });

// ---------------------------------------------------------------- overlap
// Measured live at viewport height 698 before the fix.
const WALLET = { name: 'Wallet', x1: 16, y1: 16, x2: 259, y2: 205 };
const NAV_BEFORE = { name: 'Nav', x1: 16, y1: 132, x2: 113, y2: 508 };
const NAV_AFTER = { name: 'Nav', x1: 16, y1: 216, x2: 113, y2: 593 };

test('the HUD overlap that shipped is caught, with its real area', () => {
  const findings = checkClusterOverlap([WALLET, NAV_BEFORE], { viewportHeight: 698 });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'layout.cluster-origin-agreement');
  assert.equal(findings[0].area, 97 * 73);
  assert.match(findings[0].detail, /97x73/);
  // The finding must carry the failure it prevents, or a reviewer has to go and look it up.
  assert.match(findings[0].prevents, /overlap/i);
});

test('the fixed geometry passes', () => {
  assert.deepEqual(checkClusterOverlap([WALLET, NAV_AFTER], { viewportHeight: 698 }), []);
});

test('touching edges are not an overlap', () => {
  // Nav starting exactly at the wallet's bottom edge is legal; only positive area counts.
  const flush = { name: 'Nav', x1: 16, y1: 205, x2: 113, y2: 500 };
  assert.deepEqual(checkClusterOverlap([WALLET, flush]), []);
});

// ---------------------------------------------------------------- waits
test('the INCONSISTENT contract that killed every panel is caught', () => {
  // The exact disagreement that shipped: Hud treats Icons as optional and keeps
  // drawing; Panels blocks on it forever. A missing Icons is then invisible.
  const before = [
    { path: 'Hud.luau', source: 'local module = script.Parent:WaitForChild("Icons", 5)' },
    { path: 'Panels.luau', source: 'local Icons = require(script.Parent:WaitForChild("Icons"))' },
  ];
  const findings = checkWaitContracts(before);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].dependency, 'Icons');
  assert.deepEqual(findings[0].optionalIn, ['Hud.luau']);
  assert.deepEqual(findings[0].blockedIn, ['Panels.luau']);
  assert.match(findings[0].detail, /disagree/);
});

test('agreeing consumers pass, whichever way they agree', () => {
  const bothBounded = [
    { path: 'Hud.luau', source: 'script.Parent:WaitForChild("Icons", 5)' },
    { path: 'Panels.luau', source: 'script.Parent:WaitForChild("Icons", 5)' },
  ];
  assert.deepEqual(checkWaitContracts(bothBounded), []);
});

test('a STRUCTURAL unbounded wait is not a finding — this check used to be too broad', () => {
  // The first version flagged every unbounded WaitForChild and returned 26
  // findings against a healthy client. A client genuinely cannot run without
  // Config or Palette; a timeout there converts a guaranteed wait into a crash.
  // A check that fires on everything gets muted, and then it catches nothing.
  const structural = [
    { path: 'Hud.luau', source: 'ReplicatedStorage:WaitForChild("CrystalCanyon"):WaitForChild("Config")' },
    { path: 'Panels.luau', source: 'ReplicatedStorage:WaitForChild("CrystalCanyon"):WaitForChild("Palette")' },
  ];
  assert.deepEqual(checkWaitContracts(structural), []);
});

// ---------------------------------------------------------------- prices
test('the price disagreement users were actually shown is caught', () => {
  // The UI advertised 1 / 4 / 10 sparks; the balance gate charged 1 / 2 / 3.
  const findings = checkPriceAgreement([
    { layer: 'PRODUCT_MODE_INFO', values: { plan: 1, agent: 4, superAgent: 10 } },
    { layer: 'MODE_INFO', values: { plan: 1, agent: 2, superAgent: 3 } },
  ]);
  assert.equal(findings.length, 2, 'agent and superAgent disagree; plan agrees');
  const keys = findings.map((f) => f.key).sort();
  assert.deepEqual(keys, ['agent', 'superAgent']);
});

test('one source of truth passes', () => {
  assert.deepEqual(
    checkPriceAgreement([{ layer: 'MODE_INFO', values: { plan: 1, agent: 2, superAgent: 3 } }]),
    [],
  );
});

// ---------------------------------------------------------------- motion gate
test('a module creating tweens outside the gate is caught', () => {
  const before = [{ path: 'Effects.luau', source: 'local TweenService = game:GetService("TweenService")\nTweenService:Create(x, i, g):Play()' }];
  const findings = checkMotionGate(before);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].sites, 1);
  assert.match(findings[0].detail, /reduced motion is ignored/);
});

// ---------------------------------------------------------------- the real tree
test('the SHIPPING client passes every mechanised rule', () => {
  const files = ['Theme.luau', 'Hud.luau', 'Panels.luau', 'Effects.luau', 'Objective.luau'].map(read);
  const result = audit({ files, clusters: [WALLET, NAV_AFTER], viewportHeight: 698 });
  assert.deepEqual(
    result.findings.map((f) => `${f.ruleId}: ${f.detail}`),
    [],
    'the live client must satisfy the rules extracted from it',
  );
  assert.equal(result.ok, true);
});

test('every client module that tweens is routed through the gate', () => {
  const files = ['Theme.luau', 'Hud.luau', 'Panels.luau', 'Effects.luau', 'Objective.luau'].map(read);
  const tweening = files.filter((f) => /TweenService:Create/.test(f.source));
  assert.ok(tweening.length >= 5, `expected all five modules to tween, saw ${tweening.length}`);
  assert.deepEqual(checkMotionGate(files), []);
});
