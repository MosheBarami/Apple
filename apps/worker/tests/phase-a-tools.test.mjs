/**
 * PHASE A TOOLS, WORKER HALF (D-VISION-1).
 *
 * What this file holds the worker to:
 *   - a malformed call is refused HERE and sends nothing to Studio;
 *   - a good call sends exactly the op the plugin's family handler reads;
 *   - build_ui's output, for every theme, uses only classes, properties, value types and enum
 *     types the plugin will actually accept (Commands.luau allowlists plus every op family's
 *     additions, the same merge ops/init.luau performs at load) — a screen the plugin refuses
 *     half-way is worse than no screen;
 *   - build_ui never builds over an existing ScreenGui of the same name;
 *   - play_check_ui presses only StarterGui buttons, and its summary never calls a button that
 *     did not activate tested.
 *
 * Run with:  node --test tests/phase-a-tools.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const PLUGIN_SRC = join(WORKER, '..', 'apple-plugin', 'src');
const temp = mkdtempSync(join(tmpdir(), 'phase-a-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
// PHASE_A_TOOLS_BUNDLE lets a sabotaged bundle stand in for tools.ts, to prove a guard goes red.
const T = await import(pathToFileURL(process.env.PHASE_A_TOOLS_BUNDLE || bundle('tools')).href);
const P = await import(pathToFileURL(bundle('playtest')).href);
const TH = await import(pathToFileURL(bundle('ui-kit-themes')).href);
rmSync(temp, { recursive: true, force: true });

function studio(reply) {
  const calls = [];
  return {
    calls,
    ctx: {
      execStudioOp: async (op, timeoutMs) => {
        calls.push({ op, timeoutMs });
        const data = typeof reply === 'function' ? reply(op) : reply;
        return data && data.__fail ? { id: 'x', ok: false, error: data.__fail } : { id: 'x', ok: true, data: data ?? { ok: true } };
      },
    },
  };
}

/* ---------------------------------------------------------------- plugin allowlists --- */

/** `Name = true` keys inside the `{ ... }` that follows `head` (balanced braces). */
function tableKeys(source, head) {
  const at = source.indexOf(head);
  if (at < 0) return null;
  let i = source.indexOf('{', at);
  let depth = 0;
  const start = i;
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) break;
  }
  const body = source.slice(start + 1, i).replace(/--[^\n]*/g, '');
  return new Set([...body.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*true\b/g)].map((m) => m[1]));
}

const COMMANDS = readFileSync(join(PLUGIN_SRC, 'Commands.luau'), 'utf8');
const ALLOW = {
  classes: tableKeys(COMMANDS, 'local CREATE_CLASSES = {'),
  props: tableKeys(COMMANDS, 'local PROPERTY_ALLOW = {'),
  enums: tableKeys(COMMANDS, 'local ENUM_ALLOW = {'),
};
for (const file of readdirSync(join(PLUGIN_SRC, 'ops')).filter((f) => f.endsWith('.luau') && f !== 'init.luau')) {
  const src = readFileSync(join(PLUGIN_SRC, 'ops', file), 'utf8');
  for (const [key, head] of [['classes', 'createClasses = {'], ['props', 'propertyAllow = {'], ['enums', 'enumAllow = {']]) {
    for (const name of tableKeys(src, head) ?? []) ALLOW[key].add(name);
  }
}
const VALUE_TYPES = new Set([...COMMANDS.matchAll(/\bt == "([A-Za-z0-9]+)"/g)].map((m) => m[1]));

test('the allowlist parse found the plugin tables (so the build_ui check below checks something)', () => {
  for (const [key, set] of Object.entries(ALLOW)) assert.ok(set && set.size > 10, `${key} allowlist parsed empty`);
  assert.ok(ALLOW.classes.has('ScreenGui') && ALLOW.props.has('BackgroundColor3') && ALLOW.enums.has('Font'));
  assert.ok(VALUE_TYPES.has('UDim2') && VALUE_TYPES.has('EnumItem'));
});

/* ----------------------------------------------------------------------- registry --- */

const WRITERS = ['set_properties_bulk', 'scatter_instances', 'collision_groups', 'shape_terrain', 'create_rig', 'build_ui'];
const READERS = ['search_instances', 'spatial_query', 'read_terrain', 'check_ui_layout', 'play_check_ui'];

test('every Phase A tool is a Studio tool that names its ops, and only the writers can mutate', () => {
  for (const name of [...WRITERS, ...READERS]) {
    const tool = T.TOOLS[name];
    assert.ok(tool, `${name} is not in the registry`);
    assert.equal(tool.studio, true, name);
    assert.ok(Array.isArray(tool.studioOps) && tool.studioOps.length > 0, `${name} names no studio ops`);
    assert.equal(tool.def.name, name);
  }
  for (const name of READERS) assert.ok(!T.TOOLS[name].mutatesProject, `${name} reads; it must not claim a mutation`);
  for (const name of WRITERS) assert.ok(T.TOOLS[name].mutatesProject, `${name} writes; the run loop must see it`);
});

test('a collision-group list or an already-registered group is not a change; an assignment is', () => {
  const m = T.TOOLS.collision_groups.mutatesProject;
  assert.equal(typeof m, 'function');
  assert.equal(m({ groups: [] }), false);
  assert.equal(m({ action: 'register', group: 'Ghosts', alreadyRegistered: true }), false);
  assert.equal(m({ action: 'assign', group: 'Ghosts', count: 3 }), true);
});

/* ---------------------------------------------------------------------- refusals --- */

const REFUSED = {
  search_instances: [{}, { limit: 5 }, { name: 'Coin', limit: 0 }, { property: { name: 'Transparency', op: 'gt', value: 'high' } }],
  set_properties_bulk: [
    { props: { Anchored: true } }, // neither targets nor query
    { targets: ['game.Workspace.A'], query: { name: 'A' }, props: { Anchored: true } },
    { targets: ['game.Workspace.A'] }, // nothing to change
    { targets: ['game.Workspace.A', 'game.Workspace.A'], props: { Anchored: true } },
    { targets: ['game.Workspace.A'], adjust: [{ property: 'Size', op: 'mul', value: 5000 }] },
  ],
  spatial_query: [{}, { action: 'teleport' }, { action: 'raycast', origin: [0, 10, 0], direction: [0, 0, 0] }],
  scatter_instances: [
    { template: 'game.ServerStorage.Tree', region: { min: [0, 0, 0], max: [10, 10, 10] }, count: 500 },
    { template: 'game.ServerStorage.Tree', region: { min: [10, 0, 0], max: [0, 10, 10] } },
    { template: 'game.ServerStorage.Tree', region: { min: [0, 0, 0], max: [10, 10, 10] }, onMaterial: ['Grass'] },
  ],
  collision_groups: [{}, { action: 'register' }, { action: 'set_collidable', group: 'A', other: 'B' }, { action: 'assign', group: 'A', paths: [] }],
  shape_terrain: [{}, { action: 'fill_cylinder', material: 'Grass' }],
  read_terrain: [{}, { min: [0, 0, 0], max: [0, 0, 0] }],
  create_rig: [{ rigType: 'R99' }],
  check_ui_layout: [{}, { screen: 'game.StarterGui.Shop', devices: ['smartwatch'] }],
  build_ui: [
    { screen: 'ShopGui', theme: 'no_such_theme', tree: { kind: 'panel' } },
    { screen: 'ShopGui', theme: 'tycoon', tree: { kind: 'hologram' } },
    { screen: 'ShopGui', theme: 'tycoon', tree: { kind: 'panel', size: [300, 200] } }, // pixels, not fractions
    { screen: 'ShopGui', theme: 'tycoon', tree: [{ kind: 'button', id: 'Buy' }, { kind: 'button', id: 'Buy' }] },
  ],
  play_check_ui: [{}, { press: [] }, { press: ['game.Workspace.Button'] }, { press: ['game.StarterGui.A.B'], touch: 'game.Workspace.Coin' }],
};

test('a malformed call is refused in the worker and sends NOTHING to Studio', async () => {
  for (const [name, cases] of Object.entries(REFUSED)) {
    for (const args of cases) {
      const { ctx, calls } = studio({ ok: true });
      const out = await T.TOOLS[name].run(ctx, args);
      assert.ok(out && typeof out.error === 'string', `${name} ${JSON.stringify(args)} was not refused: ${JSON.stringify(out)}`);
      assert.equal(calls.length, 0, `${name} ${JSON.stringify(args)} sent ${JSON.stringify(calls.map((c) => c.op))}`);
    }
  }
});

/* ---------------------------------------------------------------------- op shapes --- */

test('search_instances sends one query_instances with the default limit', async () => {
  const { ctx, calls } = studio({ matches: [], truncated: false });
  await T.TOOLS.search_instances.run(ctx, { isA: 'BasePart', tag: 'Coin' });
  assert.deepEqual(calls.map((c) => c.op), [{ op: 'query_instances', isA: 'BasePart', tag: 'Coin', limit: 50 }]);
});

test('set_properties_bulk sends one set_props_bulk with typed props and the long timeout', async () => {
  const { ctx, calls } = studio({ count: 2 });
  await T.TOOLS.set_properties_bulk.run(ctx, { query: { tag: 'Lava' }, props: { Anchored: true }, adjust: [{ property: 'Size', op: 'mul', value: 2 }] });
  assert.equal(calls.length, 1);
  const { op } = calls[0];
  assert.equal(op.op, 'set_props_bulk');
  assert.deepEqual(op.query, { tag: 'Lava' });
  assert.ok(op.props && 'Anchored' in op.props, 'the prop reached the op');
  assert.deepEqual(op.adjust, [{ property: 'Size', op: 'mul', value: 2 }]);
  assert.equal(calls[0].timeoutMs, 60_000);
});

test('collision_groups: list reads with its own op; assign carries the paths', async () => {
  let s = studio({ groups: [] });
  await T.TOOLS.collision_groups.run(s.ctx, { action: 'list' });
  assert.deepEqual(s.calls.map((c) => c.op), [{ op: 'collision_groups_list' }]);
  s = studio({ action: 'assign', count: 1 });
  await T.TOOLS.collision_groups.run(s.ctx, { action: 'assign', group: 'Ghosts', paths: ['game.Workspace.Ghost'] });
  assert.deepEqual(s.calls.map((c) => c.op), [{ op: 'collision_groups', action: 'assign', group: 'Ghosts', paths: ['game.Workspace.Ghost'] }]);
});

test('play_check_ui sends one play_check_ui op, outwaits the plugin, and states the press results', async () => {
  const report = {
    completed: true, stage: 'done', playerJoined: true, characterSpawned: true, clientReported: true, playerGuiFound: true,
    screenGuis: [{ name: 'ShopGui', enabled: true, labels: [{ name: 'Coins', text: 'Coins: 90', visible: true }] }],
    clientErrors: [], clientWarnings: [], serverErrors: [], serverWarnings: [],
    leaderstatsBefore: [{ name: 'Coins', value: 100 }], leaderstatsAfter: [{ name: 'Coins', value: 90 }],
    leaderstatsAfterPresses: [{ name: 'Coins', value: 90 }],
    presses: [
      { path: 'game.StarterGui.ShopGui.Panel.Open', found: true, visible: true, pressed: true, activated: true, activations: 1 },
      { path: 'game.StarterGui.ShopGui.Panel.Buy', found: true, visible: true, pressed: true, activated: false },
    ],
    touches: [], harnessRemoved: true,
  };
  const { ctx, calls } = studio(report);
  const out = await T.TOOLS.play_check_ui.run(ctx, { press: ['game.StarterGui.ShopGui.Panel.Open', 'StarterGui.ShopGui.Panel.Buy'], seconds: 99 });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].op, { op: 'play_check_ui', seconds: 15, press: ['game.StarterGui.ShopGui.Panel.Open', 'StarterGui.ShopGui.Panel.Buy'] });
  assert.ok(calls[0].timeoutMs >= 90_000, 'the worker must outwait the longer session with presses');
  assert.match(out.presses[0], /Open: pressed, and the button activated/);
  assert.match(out.presses[1], /Buy: pressed, but the button did NOT activate/);
  assert.match(out.note, /1 of 2 button press\(es\) did NOT activate/);
  assert.match(out.note, /NOT verified/);
  assert.equal(out.leaderstatsAfterPresses, 'Coins 90');
});

test('play_check_ui: a missing button is NOT FOUND, never an activation', () => {
  const out = P.summarisePlayCheck({
    completed: true, playerJoined: true, characterSpawned: true, clientReported: true, playerGuiFound: true, screenGuis: [], harnessRemoved: true,
    presses: [{ path: 'game.StarterGui.Hud.Play', found: false, error: 'no such GuiButton' }],
  });
  assert.match(out.presses[0], /NOT FOUND on the player's screen/);
  assert.doesNotMatch(out.presses[0], /activated/);
  assert.match(out.note, /NOT verified/);
});

test('play_check_ui: every button activating is said, and the screen is marked as read after the presses', () => {
  const out = P.summarisePlayCheck({
    completed: true, playerJoined: true, characterSpawned: true, clientReported: true, playerGuiFound: true, harnessRemoved: true,
    screenGuis: [{ name: 'Hud', enabled: true, labels: [{ name: 'Level', text: 'Level 2', visible: true }] }],
    presses: [{ path: 'game.StarterGui.Hud.Play', found: true, pressed: true, activated: true, activations: 1 }],
  });
  assert.match(out.note, /Every listed button activated; the screen below was read AFTER the presses/);
  assert.doesNotMatch(out.note, /NOT verified/);
});

/* ---------------------------------------------------------------------- build_ui --- */

const SHOP = [
  { kind: 'text', id: 'Title', text: 'Shop', anchor: 'top', size: [0.4, 0.1], style: 'title' },
  {
    kind: 'panel', id: 'Panel', anchor: 'center', size: [0.6, 0.7], children: [
      { kind: 'row', id: 'Tabs', size: [1, 0.12], children: [{ kind: 'button', id: 'Weapons', text: 'Weapons' }, { kind: 'button', id: 'Pets', text: 'Pets', style: 'secondary' }] },
      { kind: 'grid', id: 'Items', cell: [0.3, 0.4], children: [
        { kind: 'card', id: 'Sword', children: [{ kind: 'text', text: 'Sword' }, { kind: 'button', id: 'SwordBuy', text: '50' }] },
        { kind: 'card', id: 'Bow', children: [{ kind: 'text', text: 'Bow', style: 'muted' }, { kind: 'button', id: 'BowBuy', text: '80', style: 'danger' }] },
      ] },
      { kind: 'scroll', id: 'Log', size: [1, 0.2], children: [{ kind: 'text', text: 'Bought nothing yet' }, { kind: 'spacer' }] },
      { kind: 'bar', id: 'Xp', value: 0.4, size: [1, 0.05] },
      { kind: 'column', children: [{ kind: 'button', id: 'Close', text: 'Close', style: 'secondary' }] },
    ],
  },
];

function* walk(spec) {
  yield spec;
  for (const child of spec.children ?? []) yield* walk(child);
}

function builtItem(calls) {
  const create = calls.find((c) => c.op.op === 'create_instances');
  assert.ok(create, 'build_ui sent no create_instances');
  assert.equal(create.op.items.length, 1, 'one ScreenGui per call');
  return create.op.items[0];
}

const freshScreen = (op) => {
  if (op.op === 'query_instances') return { matches: [], truncated: false };
  if (op.op === 'create_instances') return { created: [`game.StarterGui.${op.items[0].name}`], count: 1 };
  if (op.op === 'ui_layout_check') return { screen: op.screen, verdict: 'pass', issues: [], devices: [] };
  return { ok: true };
};

test('build_ui, for EVERY theme, emits only classes, properties, value types and enums the plugin accepts', async () => {
  assert.ok(TH.APPLE_UI_THEME_IDS.length >= 5, 'the theme list parsed short');
  for (const theme of TH.APPLE_UI_THEME_IDS) {
    const { ctx, calls } = studio(freshScreen);
    const out = await T.TOOLS.build_ui.run(ctx, { screen: 'ShopGui', theme, tree: SHOP });
    assert.equal(typeof out.built, 'string', `${theme}: ${JSON.stringify(out)}`);
    const item = builtItem(calls);
    assert.equal(item.parent, 'game.StarterGui');
    let n = 0;
    for (const spec of walk(item)) {
      n++;
      assert.ok(ALLOW.classes.has(spec.className), `${theme}: the plugin does not create ${spec.className}`);
      for (const [prop, value] of Object.entries(spec.props ?? {})) {
        assert.ok(ALLOW.props.has(prop), `${theme}: the plugin does not set ${spec.className}.${prop}`);
        assert.ok(VALUE_TYPES.has(value.t), `${theme}: the plugin cannot decode a ${value.t} (${spec.className}.${prop})`);
        if (value.t === 'EnumItem') {
          const m = /^Enum\.([A-Za-z]+)\.[A-Za-z0-9]+$/.exec(value.v);
          assert.ok(m, `${theme}: ${spec.className}.${prop} = ${value.v} is not an Enum path`);
          assert.ok(ALLOW.enums.has(m[1]), `${theme}: the plugin does not accept Enum.${m[1]}`);
        }
      }
    }
    assert.equal(out.instances, n, `${theme}: the reported instance count is not the built count`);
    assert.ok(n <= 400, `${theme}: ${n} instances exceeds the plugin's create cap`);
  }
});

test('build_ui checks the name is free, creates once, lays out, and returns pressable button paths', async () => {
  const { ctx, calls } = studio(freshScreen);
  const out = await T.TOOLS.build_ui.run(ctx, { screen: 'ShopGui', theme: 'tycoon', tree: SHOP, devices: ['phone_portrait'] });
  assert.deepEqual(calls.map((c) => c.op.op), ['query_instances', 'create_instances', 'ui_layout_check']);
  assert.deepEqual(calls[0].op, { op: 'query_instances', root: 'game.StarterGui', className: 'ScreenGui', name: 'ShopGui', limit: 50 });
  assert.deepEqual(calls[2].op, { op: 'ui_layout_check', screen: 'game.StarterGui.ShopGui', devices: ['phone_portrait'] });
  assert.equal(out.built, 'game.StarterGui.ShopGui');
  assert.equal(out.projectMutated, true);
  // Every returned button path must name a TextButton that was actually built at that path.
  const item = builtItem(calls);
  const byPath = new Map();
  (function index(spec, path) {
    byPath.set(path, spec);
    for (const c of spec.children ?? []) index(c, `${path}.${c.name}`);
  })(item, 'game.StarterGui.ShopGui');
  assert.equal(out.buttons.length, 5, `expected the five buttons in SHOP, got ${out.buttons}`);
  for (const path of out.buttons) {
    assert.equal(byPath.get(path)?.className, 'TextButton', `${path} is not a built TextButton`);
  }
  assert.ok(out.buttons.includes('game.StarterGui.ShopGui.Panel.Items.Sword.SwordBuy'));
  assert.ok(out.buttons.includes('game.StarterGui.ShopGui.Panel.Items.Bow.BowBuy'));
  // and play_check_ui accepts every one of them
  for (const path of out.buttons) {
    const s = studio({ completed: true, presses: [] });
    const r = await T.TOOLS.play_check_ui.run(s.ctx, { press: [path] });
    assert.equal(s.calls.length, 1, `play_check_ui refused a build_ui button path: ${JSON.stringify(r)}`);
  }
});

test('build_ui refuses a screen name that already exists and builds nothing', async () => {
  const { ctx, calls } = studio((op) => (op.op === 'query_instances'
    ? { matches: [{ path: 'game.StarterGui.ShopGui', className: 'ScreenGui' }], truncated: false }
    : freshScreen(op)));
  const out = await T.TOOLS.build_ui.run(ctx, { screen: 'ShopGui', theme: 'tycoon', tree: SHOP });
  assert.match(out.error, /already exists/);
  assert.deepEqual(calls.map((c) => c.op.op), ['query_instances'], 'nothing may be created over an existing screen');
});

test('build_ui builds nothing when it cannot check the name', async () => {
  const { ctx, calls } = studio((op) => (op.op === 'query_instances' ? { __fail: 'unknown op query_instances' } : freshScreen(op)));
  const out = await T.TOOLS.build_ui.run(ctx, { screen: 'ShopGui', theme: 'tycoon', tree: SHOP });
  assert.ok(out.error);
  assert.deepEqual(calls.map((c) => c.op.op), ['query_instances']);
});

test('build_ui says the layout was not checked when the check fails, and never claims a clean layout', async () => {
  const { ctx } = studio((op) => (op.op === 'ui_layout_check' ? { __fail: 'layout check timed out' } : freshScreen(op)));
  const out = await T.TOOLS.build_ui.run(ctx, { screen: 'HudGui', theme: 'obby', tree: SHOP });
  assert.equal(out.built, 'game.StarterGui.HudGui');
  assert.match(out.layout.notChecked, /timed out/);
  assert.doesNotMatch(out.next, /lays out cleanly/);
});

/* ------------------------------------------------- scatter: a flat region, and the valid form --- */

// Gauntlet round 4 (2026-09-23): the model gave scatter_instances a region at ground height, min.y ==
// max.y, and was refused "must be greater … on every axis" step after step. For a scatter the Y span is
// only how far the drop ray reaches, so a flat span is widened around that height and the call runs.
test('scatter: a flat or inverted Y span is widened around the height given, and the result says so', async () => {
  const s = studio({ placed: 3 });
  const out = await T.TOOLS.scatter_instances.run(s.ctx, { template: 'game.ServerStorage.Tree', count: 3, region: { min: [-40, 2, -40], max: [40, 2, 40] } });
  assert.equal(s.calls.length, 1, `a flat region was refused: ${JSON.stringify(out)}`);
  const { min, max } = s.calls[0].op.region;
  assert.ok(max[1] > 2 && min[1] < 2, `the ray span does not contain the height given: ${min[1]}..${max[1]}`);
  assert.deepEqual([min[0], min[2], max[0], max[2]], [-40, -40, 40, 40], 'the horizontal area must not change');
  assert.match(JSON.stringify(out), /widen|Y span/i, 'the result does not say the span was changed');
});

test('scatter: an inverted horizontal region is still refused, and the refusal states the valid form', async () => {
  const s = studio({});
  const out = await T.TOOLS.scatter_instances.run(s.ctx, { template: 'game.ServerStorage.Tree', region: { min: [10, 0, 0], max: [0, 10, 10] } });
  assert.equal(s.calls.length, 0);
  assert.match(out.error, /\bx\b/i, 'the refusal does not name the axis');
  assert.match(out.error, /min: \[-?\d+, -?\d+, -?\d+\], max: \[-?\d+, -?\d+, -?\d+\]/, `the refusal gives no valid example: ${out.error}`);
});
