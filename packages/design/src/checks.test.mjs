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

import {
  ENFORCED_RULE_IDS,
  checkCounterMotionAgreement,
  checkClusterOverlap,
  checkWaitContracts,
  checkPriceAgreement,
  checkMotionGate,
  checkSafeArea,
  checkGamepadReachability,
  checkPaletteCollisions,
  checkInertSurfaceFlags,
  checkFocusFeedback,
  checkTextScaleOrder,
  audit,
} from './checks.mjs';
import { RULES } from './rules.mjs';

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

// ---------------------------------------------------------------- safe area
//
// The fixture is DERIVED from the real client rather than transcribed, so it
// cannot quietly stop describing the code it claims to describe.
function screenGuisIn(file) {
  const src = readFileSync(join(CLIENT, file), 'utf8');
  const out = [];
  const RE = /Instance\.new\("ScreenGui"\)([\s\S]{0,400}?)(?=\n\n|\nlocal |\nfunction )/g;
  for (const m of src.matchAll(RE)) {
    const name = m[1].match(/\.Name\s*=\s*"([^"]+)"/);
    const inset = m[1].match(/\.IgnoreGuiInset\s*=\s*(true|false)/);
    if (name) out.push({ name: name[1], ignoreGuiInset: inset ? inset[1] === 'true' : false, declaredIn: file });
  }
  return out;
}

test('the two ScreenGuis in the shipping client disagree about the safe area', () => {
  const screens = [...screenGuisIn('init.client.luau'), ...screenGuisIn('Hud.luau')];
  const ui = screens.find((s) => s.name === 'CrystalCanyonUI');
  const hud = screens.find((s) => s.name === 'CrystalCanyonHud');
  assert.ok(ui && hud, `expected both ScreenGuis, saw ${screens.map((s) => s.name).join(', ')}`);
  // Hud.luau opts IN, with a comment saying why: "keep the top row clear of the
  // Roblox topbar". init.client.luau opts OUT — and it is the one Panels parents
  // its modal layer to (`ctx.gui = screen`).
  assert.equal(hud.ignoreGuiInset, false, 'the HUD deliberately keeps the inset');
  assert.equal(ui.ignoreGuiInset, true, 'the main UI opts out of it');
});

test('the opted-out ScreenGui carrying every close button IS a finding', () => {
  // `interactive` is counted from the real source too: Panels builds its controls
  // through Theme, and its modal layer is parented to CrystalCanyonUI.
  const panels = readFileSync(join(CLIENT, 'Panels.luau'), 'utf8');
  const controls = (panels.match(/Theme\.button|Theme\.close/g) ?? []).length;
  assert.ok(controls >= 10, `expected Panels to build controls, counted ${controls}`);

  const findings = checkSafeArea([
    { name: 'CrystalCanyonUI', ignoreGuiInset: true, interactive: controls },
    { name: 'CrystalCanyonHud', ignoreGuiInset: false, interactive: 2 },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].screen, 'CrystalCanyonUI');
  assert.deepEqual(findings[0].keptInsetIn, ['CrystalCanyonHud']);
  assert.match(findings[0].detail, /camera cutout/);
  // The disagreement is the evidence, exactly as in the wait-contract check.
  assert.match(findings[0].detail, /demonstrably matters here/);
});

test('a decorative full-bleed surface is NOT a finding — that is what opting out is for', () => {
  assert.deepEqual(
    checkSafeArea([{ name: 'Vignette', ignoreGuiInset: true, interactive: 0 }]),
    [],
  );
});

// ---------------------------------------------------------------- gamepad
test('a link into a non-Selectable element is caught', () => {
  // The engine accepts this and the player gets a direction that does nothing.
  const findings = checkGamepadReachability([
    { name: 'Shop', next: { down: 'Divider' } },
    { name: 'Divider', selectable: false, next: {} },
  ]);
  const link = findings.find((f) => f.reason === 'not-selectable');
  assert.ok(link, 'a link into a non-selectable element must be reported');
  assert.match(link.detail, /NextSelectionDown/);
});

test('a rail with an entry point but no links strands every other destination', () => {
  // SelectionOrder chooses where selection STARTS and is documented not to affect
  // directional navigation, so ordering alone is not navigation.
  const findings = checkGamepadReachability([
    { name: 'Shop', selectionOrder: 0, next: {} },
    { name: 'Upgrades', selectionOrder: 1, next: {} },
    { name: 'Codes', selectionOrder: 2, next: {} },
  ]);
  const stranded = findings.find((f) => f.reason === 'unreachable');
  assert.ok(stranded);
  assert.equal(stranded.entry, 'Shop');
  assert.deepEqual(stranded.unreachable, ['Upgrades', 'Codes']);
});

test('a fully wired rail passes', () => {
  assert.deepEqual(
    checkGamepadReachability([
      { name: 'Shop', selectionOrder: 0, next: { down: 'Upgrades' } },
      { name: 'Upgrades', next: { up: 'Shop', down: 'Codes' } },
      { name: 'Codes', next: { up: 'Upgrades' } },
    ]),
    [],
  );
});

test('a link to an element that does not exist is caught', () => {
  const findings = checkGamepadReachability([{ name: 'Shop', next: { right: 'Inventory' } }]);
  assert.ok(findings.some((f) => f.reason === 'unknown-target'));
});

// ---------------------------------------------------------------- palette
test('a ramp that collapses onto one named colour is caught, by the documented metric', () => {
  // Converting a colour to a named brick colour returns the closest entry by the
  // smallest total absolute per-channel distance. Three steps designed as distinct
  // land on one entry, so the ramp renders with two fewer steps than it has.
  const palette = [
    { name: 'Dark stone grey', color: [99, 95, 98] },
    { name: 'Medium stone grey', color: [163, 162, 165] },
    { name: 'Institutional white', color: [248, 248, 248] },
  ];
  const findings = checkPaletteCollisions(
    [
      { name: 'ramp1', color: [150, 150, 150] },
      { name: 'ramp2', color: [163, 162, 165] },
      { name: 'ramp3', color: [176, 175, 178] },
    ],
    palette,
  );
  assert.equal(findings.length, 1);
  assert.equal(findings[0].entry, 'Medium stone grey');
  assert.deepEqual(findings[0].collapsed, ['ramp1', 'ramp2', 'ramp3']);
  assert.match(findings[0].detail, /2 fewer step/);
});

test('a palette chosen from the named set passes', () => {
  const palette = [
    { name: 'Dark stone grey', color: [99, 95, 98] },
    { name: 'Medium stone grey', color: [163, 162, 165] },
    { name: 'Institutional white', color: [248, 248, 248] },
  ];
  assert.deepEqual(
    checkPaletteCollisions(
      [
        { name: 'shadow', color: [99, 95, 98] },
        { name: 'body', color: [163, 162, 165] },
        { name: 'light', color: [248, 248, 248] },
      ],
      palette,
    ),
    [],
  );
});

test('the same colour used twice is a duplicate, not a collapsed ramp', () => {
  const palette = [{ name: 'Bright red', color: [196, 40, 28] }];
  assert.deepEqual(
    checkPaletteCollisions(
      [
        { name: 'danger', color: [196, 40, 28] },
        { name: 'alert', color: [196, 40, 28] },
      ],
      palette,
    ),
    [],
    'two names for one colour is a naming choice, not a lost step',
  );
});

// ---------------------------------------------------------------- inert flags
test('SmoothNoOutlines is caught as the no-op it is documented to be', () => {
  const findings = checkInertSurfaceFlags([
    { path: 'Retro.luau', source: 'p.TopSurface = Enum.SurfaceType.SmoothNoOutlines' },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].sites, 1);
  assert.match(findings[0].detail, /changes nothing/);
});

test('plain Smooth is not flagged — the check fires on exactly one token', () => {
  // The world builder uses Enum.SurfaceType.Smooth throughout. A check that could
  // not tell those apart would fire on the whole shipping build.
  const world = {
    path: 'world/Build.luau',
    source: readFileSync(join(REPO, 'apps', 'benchmark', 'crystal-canyon', 'world', 'Build.luau'), 'utf8'),
  };
  assert.match(world.source, /Enum\.SurfaceType\.Smooth\b/, 'the real build does set Smooth');
  assert.deepEqual(checkInertSurfaceFlags([world]), []);
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

// ---------------------------------------------------------------------------
// currency.one-value-one-motion-policy
//
// Built from a case that shipped: Panels.luau routed the shop footer pill through
// Effects.countTo while Hud.luau assigned the wallet text directly, so the same coin total
// rolled in one place and jumped in another, side by side in the same frame.
// ---------------------------------------------------------------------------

test('the shipped disagreement is caught', () => {
  const findings = checkCounterMotionAgreement([
    { surface: 'HUD wallet', value: 'coins', animated: false },
    { surface: 'shop footer pill', value: 'coins', animated: true },
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleId, 'currency.one-value-one-motion-policy');
  assert.deepEqual(findings[0].animated, ['shop footer pill']);
  assert.deepEqual(findings[0].snapped, ['HUD wallet']);
});

test('agreeing surfaces are silent, whichever way they agree', () => {
  assert.deepEqual(
    checkCounterMotionAgreement([
      { surface: 'HUD wallet', value: 'coins', animated: true },
      { surface: 'shop footer pill', value: 'coins', animated: true },
    ]),
    [],
    'both counting is agreement',
  );
  assert.deepEqual(
    checkCounterMotionAgreement([
      { surface: 'HUD shards', value: 'shards', animated: false },
      { surface: 'pack gauge label', value: 'shards', animated: false },
    ]),
    [],
    'both snapping is also agreement — the rule is about consistency, not about counting',
  );
});

test('different values are judged independently', () => {
  // Crystal Canyon's actual policy: coins count, shards snap. That is two values with two
  // policies and no disagreement, and the check must not conflate them into one.
  const findings = checkCounterMotionAgreement([
    { surface: 'HUD wallet', value: 'coins', animated: true },
    { surface: 'shop footer pill', value: 'coins', animated: true },
    { surface: 'HUD shards', value: 'shards', animated: false },
    { surface: 'pack gauge label', value: 'shards', animated: false },
  ]);
  assert.deepEqual(findings, []);
});

test('a value shown once cannot disagree with itself', () => {
  assert.deepEqual(
    checkCounterMotionAgreement([{ surface: 'HUD wallet', value: 'coins', animated: false }]),
    [],
  );
});

test('malformed entries are skipped rather than crashing the audit', () => {
  const findings = checkCounterMotionAgreement([
    null,
    { surface: 'x' },
    { surface: 'HUD wallet', value: 'coins', animated: false },
    { surface: 'shop footer pill', value: 'coins', animated: true },
  ]);
  assert.equal(findings.length, 1, 'the real disagreement still reports');
});

test('a hover response with no gamepad response is reported', () => {
  // The real shape of the defect: one `hovering` boolean, fed only by the pointer.
  const findings = checkFocusFeedback([
    {
      path: 'Theme.luau',
      source: 'btn.MouseEnter:Connect(function() hovering = true refresh() end)',
    },
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /invisible to a controller/);
  assert.equal(findings[0].ruleId, 'state.selection-gained-is-the-gamepad-s-hover');
});

test('a file that answers both signals is silent', () => {
  assert.deepEqual(
    checkFocusFeedback([
      {
        path: 'Theme.luau',
        source: 'btn.MouseEnter:Connect(f)\nbtn.SelectionGained:Connect(f)',
      },
    ]),
    [],
  );
});

test('the harness that FIRES MouseEnter is not a missing gamepad response', () => {
  // This case is why the check matches `:Connect` and not the bare name. Stories.luau drives
  // its state grid by firing the connections it finds, so it mentions MouseEnter twice and
  // subscribes to it never — and the first version of this check called that a defect. A
  // check that reports the harness gets turned off, and then it is not checking anything.
  assert.deepEqual(
    checkFocusFeedback([
      {
        path: 'Stories.luau',
        source: 'for _, conn in ipairs(getconnections(btn.MouseEnter)) do conn:Fire() end',
      },
    ]),
    [],
  );
});

test('a file with no hover at all is not asked for a focus response', () => {
  assert.deepEqual(checkFocusFeedback([{ path: 'Config.luau', source: 'return {}' }]), []);
});

test('scale-then-unwrap is reported, because the second write undoes the first', () => {
  const findings = checkTextScaleOrder([
    {
      path: 'Theme.luau',
      source: 'label.TextScaled = true\nlabel.TextWrapped = false\nc.Parent = label',
    },
  ]);
  assert.equal(findings.length, 1);
  assert.match(findings[0].detail, /turns scaling back off/);
});

test('the fixed order — constraint first, scale last — is silent', () => {
  assert.deepEqual(
    checkTextScaleOrder([
      {
        path: 'Theme.luau',
        source: 'c.Parent = label\nlabel.TextScaled = true',
      },
    ]),
    [],
  );
});

test('unwrap BEFORE scale is not reported, because the engine re-enables wrapping', () => {
  // The check is order-sensitive rather than presence-sensitive. Reporting the harmless
  // sequence too would make it a style rule wearing a correctness rule's error message.
  assert.deepEqual(
    checkTextScaleOrder([
      { path: 'Theme.luau', source: 'label.TextWrapped = false\nlabel.TextScaled = true' },
    ]),
    [],
  );
});

test('two different labels are not mistaken for one', () => {
  // The backreference is what makes this true: `a.TextScaled` followed by `b.TextWrapped` is
  // two labels being configured, not one label being undone.
  assert.deepEqual(
    checkTextScaleOrder([
      { path: 'Theme.luau', source: 'shade.TextScaled = true\nface.TextWrapped = false' },
    ]),
    [],
  );
});

test('the enforced list matches the rules the checks actually reference', () => {
  // Guards the number in the ledger. A check deleted or a rule id renamed would otherwise
  // leave `ENFORCED_RULE_IDS` claiming coverage the module no longer has.
  const src = readFileSync(new URL('./checks.mjs', import.meta.url), 'utf8');
  const referenced = new Set([...src.matchAll(/finding\(\s*'([^']+)'/g)].map((m) => m[1]));
  assert.deepEqual(
    [...ENFORCED_RULE_IDS].sort(),
    [...referenced].sort(),
    'ENFORCED_RULE_IDS must be exactly the rules the checks report against',
  );
});

test('every enforced id is a real rule', () => {
  const ids = new Set(RULES.map((r) => r.id));
  for (const id of ENFORCED_RULE_IDS) {
    assert.ok(ids.has(id), `${id} is enforced but is not in the library`);
  }
});

test('audit reports what it enforced, not the size of the library', () => {
  const result = audit({});
  assert.equal(result.enforced, ENFORCED_RULE_IDS.length);
  assert.equal(result.library, RULES.length);
  assert.ok(result.library > result.enforced, 'most rules still need a human; saying otherwise flatters');
});
