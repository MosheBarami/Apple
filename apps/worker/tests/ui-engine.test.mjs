/**
 * The UI engine (src/ui-engine.ts, rebuild 2026-10-08): build_ui compiles the model's own design to Roblox
 * layout objects and measures the result; check_ui measures only.
 *
 *   - the compiled tree uses correct layout semantics (LayoutOrder in tree order, flex fill, AutomaticSize,
 *     wrapping/truncation, scaled text bounded, scroll canvas, ScreenGui defaults);
 *   - EVERY class, property, value type and enum the compiler can emit is on the plugin's allowlists
 *     (parsed from Commands.luau and ops/*.luau), for a tree that exercises every option;
 *   - bad input is refused with a reason before anything reaches Studio;
 *   - rebuilding by name replaces the old screen (and will not silently delete scripts inside it);
 *   - the measurement runs after every build and its failure is never reported as a clean layout.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { pluginPermissions } from '../../studpilot-plugin/scripts/api-dump.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const PLUGIN_SRC = join(WORKER, '..', 'studpilot-plugin', 'src');
const temp = mkdtempSync(join(tmpdir(), 'ui-engine-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
const E = await import(pathToFileURL(bundle('ui-engine')).href);
const T = await import(pathToFileURL(bundle('tools')).href);
rmSync(temp, { recursive: true, force: true });

/* ------------------------------------------------------------------ plugin allowlists --- */

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
// Plugin 2.0 (owner, 2026-10-08): no allowlists. The plugin creates what Roblox's API dump calls creatable and
// writes what it calls plugin-writable, minus a short deny list; read the same way here (scripts/api-dump.mjs).
const PERMS = pluginPermissions();
const ALLOW = { classes: new Set(PERMS.creatableNames), props: new Set(PERMS.writableNames), enums: new Set(PERMS.enums) };
const VALUE_TYPES = new Set([...COMMANDS.matchAll(/\bt == "([A-Za-z0-9]+)"/g)].map((m) => m[1]));

/* --------------------------------------------------------------------------- trees --- */

const ADMIN = {
  name: 'AdminPanel',
  children: [
    {
      type: 'stack', name: 'Panel', at: 'center', w: '92%', maxW: 720, h: '80%', maxH: 560, bg: '#151922', radius: 10,
      stroke: { color: '#2a3140', width: 1 }, pad: 16, gap: 12,
      children: [
        { type: 'frame', name: 'Header', dir: 'h', h: 36, align: 'center', gap: 8, children: [
          { type: 'text', name: 'Title', text: 'Moderation', font: 'Montserrat:SemiBold', fontSize: 20, w: 'fill', truncate: true },
          { type: 'button', name: 'Close', text: 'Close', w: 'auto', h: 32, bg: '#262d3a', radius: 6 },
        ] },
        { type: 'divider' },
        { type: 'stack', name: 'Search', dir: 'h', h: 40, gap: 8, children: [
          { type: 'input', name: 'Query', placeholder: 'Find a player', bg: '#0f131a', radius: 6 },
          { type: 'button', name: 'Go', text: 'Search', bg: '#3b82f6', radius: 6, w: 96 },
        ] },
        { type: 'scroll', name: 'Players', gap: 6, children: [
          { type: 'frame', name: 'Row1', dir: 'h', h: 44, bg: '#1b2130', radius: 6, pad: [0, 10], align: 'center', gap: 8, children: [
            { type: 'icon', image: 'rbxassetid://123', w: 28, h: 28 },
            { type: 'text', text: 'builderman', w: 'fill', truncate: true },
            { type: 'button', name: 'Kick', text: 'Kick', bg: '#ef4444', radius: 'pill', w: 72, h: 32 },
          ] },
        ] },
      ],
    },
  ],
};

/** Every option the schema has, at least once. */
const EVERYTHING = {
  name: 'Everything', insets: 'device', enabled: false, displayOrder: 5,
  children: [
    { type: 'frame', name: 'Free', at: 'bottom-right', offset: [16, 16], w: 200, h: 120, z: 3, visible: true, clip: true, aspect: 1.5, minW: 100, minH: 60,
      bg: '#ffffff', bgT: 0.1, radius: 'pill', gradient: { colors: ['#ff0000', '#00ff00', '#0000ff'], rotation: 45, t: [0, 0.5] }, children: [
        { type: 'text', text: 'Scaled', w: 100, h: 30, scale: [12, 28], color: '#000000', textT: 0.1, alignX: 'right', alignY: 'bottom', rich: true, lineHeight: 1.2, stroke: { color: '#ffffff', width: 2, t: 0.2 } },
      ] },
    { type: 'grid', name: 'Cards', at: 'top', w: '50%', h: 'auto', cols: 3, cell: [0, 120], gap: 8, align: 'center', children: [
      { type: 'button', name: 'Img', image: 'rbxassetid://1', fit: 'crop', tint: '#ffeedd', imageT: 0.1 },
      { type: 'button', name: 'Composite', dir: 'h', gap: 4, children: [{ type: 'icon', image: 'rbxassetid://2' }, { type: 'text', text: 'Buy' }] },
      { type: 'image', image: 'rbxassetid://3', fit: 'stretch' },
    ] },
    { type: 'grid', name: 'Fixed', at: 'left', w: 300, h: 300, cell: [64, 64] },
    { type: 'scroll', name: 'Side', at: 'right', dir: 'h', w: 300, h: 80, bar: 4, barColor: '#888888', gap: 4, children: [
      { type: 'spacer', w: 10 }, { type: 'divider', thickness: 2, color: '#999999' },
    ] },
    { type: 'scroll', name: 'Gallery', at: 'center', w: 300, h: 300, cols: 2, cell: [0, 80] },
    { type: 'stack', name: 'Chips', at: 'top-left', w: 300, dir: 'h', wrap: true, justify: 'between', children: [
      { type: 'text', text: 'a', bg: '#333333' }, { type: 'spacer' }, { type: 'text', text: 'b', grow: 2, w: 'fill' },
    ] },
    { type: 'stack', name: 'Chunky', at: 'top-right', w: 240, h: 120, gap: 6, depth: { color: '#3a0000', px: 6 }, pattern: { image: 'rbxassetid://9', tile: 24, t: 0.6, tint: '#ffffff' }, bg: '#ff3030', children: [
      { type: 'button', name: 'Go', text: 'GO', w: 'fill', h: 48, bg: '#30ff30', stroke: { color: '#000000', width: 3 }, textStroke: { color: '#000000', width: 2 }, depth: { color: '#106010' }, pattern: { image: 'rbxassetid://9' } },
      { type: 'text', text: 'Outlined', textStroke: { color: '#000000', width: 3, t: 0.1 } },
      { type: 'button', name: 'Skinned', text: 'Buy', h: 60, skin: { image: 'rbxassetid://7', size: [512, 200], slice: [40, 30, 40, 30], t: 0.1, tint: '#ffeeee' }, textStroke: { color: '#000000' } },
    ] },
    { type: 'stack', name: 'Column', at: 'bottom', w: 300, h: 300, justify: 'end', align: 'end', children: [
      { type: 'input', placeholder: 'Message', placeholderColor: '#777777', multiline: true, maxW: 400, maxH: 200 },
      { type: 'button', text: 'Send', font: 'BuilderSans:Bold:Italic' },
    ] },
  ],
};

function* walk(spec) {
  yield spec;
  for (const child of spec.children ?? []) yield* walk(child);
}
const find = (spec, name) => [...walk(spec)].find((s) => s.name === name);
const kids = (spec, cls) => (spec.children ?? []).filter((c) => c.className === cls);

/* ----------------------------------------------------------------------- compiler --- */

test('the allowlist parse found the plugin tables', () => {
  for (const [key, set] of Object.entries(ALLOW)) assert.ok(set && set.size > 10, `${key} allowlist parsed empty`);
  assert.ok(VALUE_TYPES.has('UDim2') && VALUE_TYPES.has('EnumItem') && VALUE_TYPES.has('Font'));
});

test('every class, property, value type and enum the compiler emits is on the plugin allowlists', () => {
  const seen = { classes: new Set(), props: new Set(), types: new Set(), enums: new Set() };
  for (const tree of [ADMIN, EVERYTHING]) {
    const out = E.compileScreen(tree);
    assert.ok(!out.error, out.error);
    for (const spec of walk(out.item)) {
      seen.classes.add(spec.className);
      for (const [prop, value] of Object.entries(spec.props ?? {})) {
        seen.props.add(prop);
        seen.types.add(value.t);
        if (value.t === 'EnumItem') seen.enums.add(value.v.split('.')[1]);
      }
    }
  }
  for (const c of seen.classes) assert.ok(ALLOW.classes.has(c), `class ${c} is not on the plugin create allowlist`);
  for (const p of seen.props) assert.ok(ALLOW.props.has(p), `property ${p} is not on the plugin property allowlist`);
  for (const t of seen.types) assert.ok(VALUE_TYPES.has(t), `value type ${t} is not decoded by the plugin`);
  for (const e of seen.enums) assert.ok(ALLOW.enums.has(e), `Enum.${e} is not on the plugin enum allowlist`);
  // The exercise reached the parts that matter.
  for (const c of ['UIFlexItem', 'UITextSizeConstraint', 'UISizeConstraint', 'UIAspectRatioConstraint', 'UIGradient', 'UIStroke', 'UIGridLayout', 'ScrollingFrame', 'TextBox', 'ImageButton', 'ImageLabel']) {
    assert.ok(seen.classes.has(c), `the exercise never emitted ${c}`);
  }
});

test('a screen gets the defaults that keep it correct: no reset, sibling z-order, safe insets', () => {
  const out = E.compileScreen(ADMIN);
  const p = out.item.props;
  assert.equal(out.item.className, 'ScreenGui');
  assert.equal(out.item.parent, 'game.StarterGui');
  assert.deepEqual(p.ResetOnSpawn, { t: 'bool', v: false });
  assert.equal(p.ZIndexBehavior.v, 'Enum.ZIndexBehavior.Sibling');
  assert.equal(p.ScreenInsets.v, 'Enum.ScreenInsets.CoreUISafeInsets');
});

test('children of a layout carry LayoutOrder in tree order, and the layout sorts by it', () => {
  const panel = find(E.compileScreen(ADMIN).item, 'Panel');
  const layout = kids(panel, 'UIListLayout')[0];
  assert.equal(layout.props.SortOrder.v, 'Enum.SortOrder.LayoutOrder');
  assert.equal(layout.props.Padding.v[1], 12);
  const ordered = panel.children.filter((c) => c.props?.LayoutOrder);
  assert.deepEqual(ordered.map((c) => c.props.LayoutOrder.v), [1, 2, 3, 4]);
  assert.deepEqual(ordered.map((c) => c.name), ['Header', 'Divider1', 'Search', 'Players']);
  // Decoration objects come first and carry no LayoutOrder.
  assert.ok(panel.children.slice(0, 4).every((c) => c.className.startsWith('UI')));
});

test('fill on a stack\'s main axis is a flex item; on the cross axis it is the full width', () => {
  const out = E.compileScreen(ADMIN).item;
  const query = find(out, 'Query');
  assert.equal(kids(query, 'UIFlexItem')[0].props.FlexMode.v, 'Enum.UIFlexMode.Fill');
  assert.deepEqual(query.props.Size.v, [0, 0, 0, 40 + 4]); // horizontal stack: w fill -> flex, h default 44
  const header = find(out, 'Header');
  assert.deepEqual(header.props.Size.v, [1, 0, 0, 36]);
  const chips = find(E.compileScreen(EVERYTHING).item, 'Chips');
  const weighted = chips.children.find((c) => c.props?.Text?.v === 'b');
  assert.deepEqual(kids(weighted, 'UIFlexItem')[0].props, { FlexMode: { t: 'EnumItem', v: 'Enum.UIFlexMode.Custom' }, GrowRatio: { t: 'number', v: 2 }, ShrinkRatio: { t: 'number', v: 1 } });
});

test('text wraps in a set width, stays one line with an ellipsis when truncated, and auto sizes use AutomaticSize', () => {
  const out = E.compileScreen(ADMIN).item;
  const title = find(out, 'Title');
  assert.equal(title.props.TextWrapped.v, false);
  assert.equal(title.props.TextTruncate.v, 'Enum.TextTruncate.AtEnd');
  assert.deepEqual(title.props.FontFace, { t: 'Font', v: ['Montserrat', 'SemiBold', 'Normal'] });
  const close = find(out, 'Close');
  assert.equal(close.props.AutomaticSize.v, 'Enum.AutomaticSize.X');
  assert.equal(close.props.TextWrapped.v, false, 'an auto-width label grows instead of wrapping');
  assert.ok(kids(close, 'UIPadding').length === 1, 'a filled button always gets padding so its text breathes');
  const query = find(out, 'Query');
  assert.equal(query.props.ClearTextOnFocus.v, false);
  assert.equal(query.props.PlaceholderText.v, 'Find a player');
});

test('scaled text is always bounded; scroll areas clip, size their canvas and keep the bar off the content', () => {
  const out = E.compileScreen(EVERYTHING).item;
  const scaled = [...walk(out)].find((s) => s.props?.TextScaled);
  assert.deepEqual(kids(scaled, 'UITextSizeConstraint')[0].props, { MinTextSize: { t: 'number', v: 12 }, MaxTextSize: { t: 'number', v: 28 } });
  assert.equal(kids(scaled, 'UIStroke')[0].props.ApplyStrokeMode.v, 'Enum.ApplyStrokeMode.Contextual');
  const players = find(E.compileScreen(ADMIN).item, 'Players');
  assert.equal(players.className, 'ScrollingFrame');
  assert.equal(players.props.AutomaticCanvasSize.v, 'Enum.AutomaticSize.Y');
  assert.equal(players.props.ClipsDescendants.v, true);
  assert.deepEqual(players.props.CanvasSize.v, [0, 0, 0, 0]);
  assert.equal(players.props.VerticalScrollBarInset.v, 'Enum.ScrollBarInset.ScrollBar');
  const gallery = find(out, 'Gallery');
  const grid = kids(gallery, 'UIGridLayout')[0];
  assert.ok(grid, 'a scroll with cols lays out a grid');
  assert.equal(grid.props.CellSize.v[0], 0.5);
});

test('placement anchors at the named edge and the offset moves inward', () => {
  const free = find(E.compileScreen(EVERYTHING).item, 'Free');
  assert.deepEqual(free.props.AnchorPoint.v, [1, 1]);
  assert.deepEqual(free.props.Position.v, [1, -16, 1, -16]);
  assert.equal(kids(free, 'UICorner')[0].props.CornerRadius.v[0], 1);
});

test('text colour, when not given, is the readable one over the nearest filled background', () => {
  const out = E.compileScreen({ name: 'Ink', children: [
    { type: 'stack', bg: '#f5f5f5', children: [{ type: 'text', name: 'OnLight', text: 'x' }] },
    { type: 'stack', bg: '#101010', children: [{ type: 'text', name: 'OnDark', text: 'x' }] },
  ] }).item;
  assert.ok(find(out, 'OnLight').props.TextColor3.v[0] < 0.2);
  assert.equal(find(out, 'OnDark').props.TextColor3.v[0], 1);
});

test('names are unique per parent; unnamed nodes get kind-numbered names', () => {
  const out = E.compileScreen(ADMIN);
  const row = find(out.item, 'Row1');
  assert.deepEqual(row.children.filter((c) => !c.className.startsWith('UI')).map((c) => c.name), ['Icon1', 'Text1', 'Kick']);
  assert.ok(out.interactive.includes('Panel.Players.Row1.Kick'));
  const dup = E.compileScreen({ name: 'Dup', children: [{ type: 'stack', children: [{ type: 'text', name: 'A', text: '1' }, { type: 'text', name: 'A', text: '2' }] }] });
  assert.match(dup.error, /two children named A/);
});

test('bad input is refused with a reason and nothing is sent', () => {
  const cases = [
    [{ name: '1bad', children: [{ type: 'text', text: 'x' }] }, /name/],
    [{ name: 'S', children: [] }, /children/],
    [{ name: 'S', children: [{ type: 'blob' }] }, /type must be one of/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', colour: '#fff' }] }, /unknown field/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', color: 'red' }] }, /hex colour/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', children: [{ type: 'text' }] }] }, /cannot have children/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', font: 'ComicSans' }] }, /family must be one of/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', w: 'auto', scale: [10, 20] }] }, /scaled text needs a box/],
    [{ name: 'S', children: [{ type: 'image' }] }, /needs image/],
    [{ name: 'S', children: [{ type: 'image', image: 'http://x' }] }, /rbxassetid/],
    [{ name: 'S', children: [{ type: 'grid' }] }, /cell/],
    [{ name: 'S', children: [{ type: 'frame', gap: 4 }] }, /need a layout/],
    [{ name: 'S', children: [{ type: 'stack', wrap: true }] }, /only a horizontal stack wraps/],
    [{ name: 'S', children: [{ type: 'scroll', h: 'auto' }] }, /scroll area must not size/],
    [{ name: 'S', children: [{ type: 'text', text: 'x', name: 'UIListLayout' }] }, /name/],
    [{ name: 'S', children: [{ type: 'frame', w: 'half' }] }, /pixels/],
    [{ name: 'S', children: [{ type: 'frame', image: 'rbxassetid://1' }] }, /./],
  ];
  for (const [args, why] of cases) {
    const out = E.compileScreen(args);
    assert.ok(out.error, `accepted ${JSON.stringify(args)}`);
    assert.match(out.error, why);
    assert.match(out.error, /Nothing was sent/);
  }
});

test('the compiler warns about what only a different design can fix', () => {
  const out = E.compileScreen({ name: 'W', children: [
    { type: 'stack', name: 'Auto', children: [{ type: 'text', text: 'a' }, { type: 'spacer' }] },
    { type: 'stack', name: 'Pct', h: 200, gap: 8, children: [{ type: 'frame', h: '50%' }, { type: 'frame', h: '50%' }] },
    { type: 'stack', name: 'Placed', children: [{ type: 'text', text: 'a', at: 'center' }] },
  ] });
  assert.ok(!out.error, out.error);
  assert.ok(out.warnings.some((w) => /Auto.*0 px/.test(w)));
  assert.ok(out.warnings.some((w) => /Pct.*100%/.test(w)));
  assert.ok(out.warnings.some((w) => /at\/offset do nothing/.test(w)));
});

/* -------------------------------------------------------------------------- tools --- */

function studio(reply) {
  const calls = [];
  return {
    calls,
    ctx: {
      execStudioOp: async (op, timeoutMs) => {
        calls.push(op);
        const data = reply(op);
        return data && data.__fail ? { id: 'x', ok: false, error: data.__fail } : { id: 'x', ok: true, data: data ?? { ok: true } };
      },
    },
  };
}
const clean = { verdict: 'pass', defects: [], viewports: [{ name: 'desktop', size: [1920, 1080], elements: 12 }] };
const replies = ({ existing = [], scripts = [], measure = clean } = {}) => (op) => {
  if (op.op === 'query_instances' && op.isA) return { matches: scripts.map((path) => ({ path })) };
  if (op.op === 'query_instances') return { matches: existing.map((path) => ({ path })) };
  if (op.op === 'create_instances') return { created: [`game.StarterGui.${op.items[0].name}`] };
  if (op.op === 'measure_ui') return measure;
  return { ok: true };
};

test('build_ui and check_ui are registered Studio tools with the ops they use', () => {
  assert.deepEqual(T.TOOLS.build_ui.studioOps, ['query_instances', 'delete_instances', 'create_instances', 'measure_ui']);
  assert.deepEqual(T.TOOLS.check_ui.studioOps, ['measure_ui']);
  assert.equal(T.TOOLS.build_ui.def.name, 'build_ui');
  assert.equal(T.TOOLS.check_ui.def.name, 'check_ui');
  assert.equal(T.TOOLS.build_ui.mutatesProject({ built: 'game.StarterGui.X' }), true);
  assert.equal(T.TOOLS.build_ui.mutatesProject({ error: 'no' }), false);
  assert.ok(!T.TOOLS.check_ui.mutatesProject);
});

test('build_ui creates the screen once, then measures it at every viewport', async () => {
  const { ctx, calls } = studio(replies());
  const out = await T.TOOLS.build_ui.run(ctx, ADMIN);
  assert.deepEqual(calls.map((c) => c.op), ['query_instances', 'create_instances', 'measure_ui']);
  assert.equal(calls[1].items.length, 1);
  assert.deepEqual(calls[2], { op: 'measure_ui', screen: 'game.StarterGui.AdminPanel' });
  assert.equal(out.built, 'game.StarterGui.AdminPanel');
  assert.equal(out.replaced, false);
  assert.equal(out.layout.verdict, 'pass');
  assert.ok(out.interactive.includes('game.StarterGui.AdminPanel.Panel.Players.Row1.Kick'));
});

test('build_ui with an existing name replaces that screen (idempotent by name)', async () => {
  const { ctx, calls } = studio(replies({ existing: ['game.StarterGui.AdminPanel', 'game.StarterGui.Other.AdminPanelX'] }));
  const out = await T.TOOLS.build_ui.run(ctx, ADMIN);
  assert.deepEqual(calls.map((c) => c.op), ['query_instances', 'query_instances', 'delete_instances', 'create_instances', 'measure_ui']);
  assert.deepEqual(calls[2].paths, ['game.StarterGui.AdminPanel']);
  assert.equal(out.replaced, true);
});

test('build_ui will not silently delete scripts inside the screen it replaces', async () => {
  const { ctx, calls } = studio(replies({ existing: ['game.StarterGui.AdminPanel'], scripts: ['game.StarterGui.AdminPanel.Client'] }));
  const out = await T.TOOLS.build_ui.run(ctx, ADMIN);
  assert.match(out.error, /AdminPanel\.Client/);
  assert.ok(!calls.some((c) => c.op === 'delete_instances' || c.op === 'create_instances'), 'nothing was changed');
  const again = studio(replies({ existing: ['game.StarterGui.AdminPanel'], scripts: ['game.StarterGui.AdminPanel.Client'] }));
  const forced = await T.TOOLS.build_ui.run(again.ctx, { ...ADMIN, replaceScripts: true });
  assert.equal(forced.replaced, true);
});

test('build_ui returns the measured defects and says to fix them; a failed measurement is never a pass', async () => {
  const measure = { verdict: 'defects', defects: [{ kind: 'text_overflow', path: 'game.StarterGui.AdminPanel.Panel.Header.Title', detail: 'x', at: ['phone_portrait'] }], viewports: [] };
  const { ctx } = studio(replies({ measure }));
  const out = await T.TOOLS.build_ui.run(ctx, ADMIN);
  assert.equal(out.layout.verdict, 'defects');
  assert.equal(out.layout.defects[0].kind, 'text_overflow');
  assert.match(out.next, /same name/);
  const failing = studio(replies({ measure: { __fail: 'timed out' } }));
  const unchecked = await T.TOOLS.build_ui.run(failing.ctx, ADMIN);
  assert.ok(unchecked.layout.notChecked);
  assert.match(unchecked.next, /NOT measured/);
});

test('build_ui sends nothing for a refused tree; check_ui measures only', async () => {
  const { ctx, calls } = studio(replies());
  const out = await T.TOOLS.build_ui.run(ctx, { name: 'X', children: [{ type: 'nope' }] });
  assert.ok(out.error);
  assert.equal(calls.length, 0);
  const s = studio(replies());
  const checked = await T.TOOLS.check_ui.run(s.ctx, { screen: 'game.StarterGui.X', viewports: ['phone_portrait', 'desktop'] });
  assert.deepEqual(s.calls, [{ op: 'measure_ui', screen: 'game.StarterGui.X', viewports: ['phone_portrait', 'desktop'] }]);
  assert.equal(checked.verdict, 'pass');
  const bad = await T.TOOLS.check_ui.run(s.ctx, { screen: 'game.StarterGui.X', viewports: ['watch'] });
  assert.ok(bad.error);
});

/* ------------------------------------------------------------------------ the skill --- */

const SKILL = readFileSync(join(WORKER, '..', '..', 'packages', 'skills', 'ui-design', 'SKILL.md'), 'utf8');

test('the ui-design skill has valid frontmatter and stays short', () => {
  const front = /^---\nname: ui-design\ndescription: (.+)\n---\n/.exec(SKILL);
  assert.ok(front, 'frontmatter must open the file with name and description');
  assert.ok(front[1].length <= 1024, `description is ${front[1].length} chars`);
  assert.ok(SKILL.split('\n').length <= 400, 'SKILL.md must stay under 400 lines');
});

test('every example in the ui-design skill compiles cleanly with build_ui', () => {
  const blocks = [...SKILL.matchAll(/```json\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));
  assert.ok(blocks.length >= 3, 'the skill shows at least three examples');
  for (const example of blocks) {
    const out = E.compileScreen(example);
    assert.ok(!out.error, `${example.name}: ${out.error}`);
    assert.deepEqual(out.warnings, [], `${example.name} warns: ${out.warnings.join(' | ')}`);
  }
});

/* --------------------------------------------------------- styles and repeats (token saver) --- */

test('styles: a node takes its named looks, later styles over earlier, its own fields over both', () => {
  const out = E.compileScreen({
    name: 'Styled',
    styles: { card: { bg: '#1e2430', radius: 12, pad: 16 }, warm: { bg: '#402020' }, label: { type: 'text', font: 'Montserrat:Bold', color: '#c9d1e0' } },
    children: [{ type: 'stack', name: 'A', style: ['card', 'warm'], children: [{ style: 'label', name: 'T', text: 'Hi', color: '#ffffff' }] }],
  });
  assert.ok(!out.error, out.error);
  const a = find(out.item, 'A');
  assert.deepEqual(a.props.BackgroundColor3.v, [0.251, 0.1255, 0.1255]);
  assert.ok(a.children.some((c) => c.className === 'UICorner'));
  const t = find(out.item, 'T');
  assert.equal(t.className, 'TextLabel');
  assert.deepEqual(t.props.FontFace.v, ['Montserrat', 'Bold', 'Normal']);
  assert.deepEqual(t.props.TextColor3.v, [1, 1, 1]);
});

test('styles: an unknown style name or a style with children is refused before anything is sent', () => {
  const missing = E.compileScreen({ name: 'S', children: [{ type: 'frame', style: 'nope' }] });
  assert.match(missing.error, /not one of the screen's styles/);
  const kids = E.compileScreen({ name: 'S', styles: { x: { children: [] } }, children: [{ type: 'frame', style: 'x' }] });
  assert.match(kids.error, /cannot set/);
});

test('each: string items set text, object items set fields, and fixed names stay unique', () => {
  const out = E.compileScreen({
    name: 'Tabs',
    styles: { tab: { type: 'button', w: 120, bg: '#222831', radius: 8 } },
    children: [{ type: 'stack', name: 'Bar', dir: 'h', w: 400, h: 44, children: [
      { style: 'tab', name: 'Tab', each: ['Kick', 'Ban', { text: 'Mute', bg: '#552222' }] },
    ] }],
  });
  assert.ok(!out.error, out.error);
  const bar = find(out.item, 'Bar');
  const tabs = bar.children.filter((c) => c.className === 'TextButton');
  assert.deepEqual(tabs.map((t) => t.name), ['Tab1', 'Tab2', 'Tab3']);
  assert.deepEqual(tabs.map((t) => t.props.Text.v), ['Kick', 'Ban', 'Mute']);
  assert.deepEqual(tabs[2].props.BackgroundColor3.v, [0.3333, 0.1333, 0.1333]);
  assert.deepEqual(tabs.map((t) => t.props.LayoutOrder.v), [1, 2, 3]);
});

test('each with {key} placeholders fills nested children and names', () => {
  const out = E.compileScreen({
    name: 'Shop',
    children: [{ type: 'scroll', name: 'List', w: 300, h: 300, children: [
      { type: 'stack', name: 'Row_{id}', dir: 'h', children: [{ type: 'text', name: 'N', text: '{n}' }, { type: 'text', name: 'P', text: '{p} coins', w: 80 }],
        each: [{ id: 'sword', n: 'Sword', p: 100 }, { id: 'bow', n: 'Bow', p: 250 }] },
    ] }],
  });
  assert.ok(!out.error, out.error);
  assert.equal(find(out.item, 'Row_sword').children.find((c) => c.name === 'N').props.Text.v, 'Sword');
  assert.equal(find(out.item, 'Row_bow').children.find((c) => c.name === 'P').props.Text.v, '250 coins');
});

test('each is bounded', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'stack', children: [{ type: 'text', each: [] }] }] });
  assert.match(out.error, /each must list/);
});

test('a free frame whose children have no placement warns that they overlap, and points at stack', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'frame', name: 'P', w: 300, h: 300, children: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }] });
  assert.ok(out.warnings.some((w) => /on top of each other/.test(w) && /stack/.test(w)), out.warnings.join(' | '));
  const placed = E.compileScreen({ name: 'S', children: [{ type: 'frame', name: 'P', w: 300, h: 300, children: [{ type: 'text', text: 'a', at: 'top' }, { type: 'text', text: 'b', at: 'bottom' }] }] });
  assert.deepEqual(placed.warnings, []);
  assert.match(E.compileScreen({ name: 'S', children: [{ type: 'frame', gap: 4, children: [] }] }).error, /use type "stack"/);
});

/* --------------------------------------------------------------- game-UI dressing --- */

test('a bordered button with textStroke outlines its text in a label of its own; the button keeps the border', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'stack', w: 300, h: 100, children: [
    { type: 'button', name: 'Kill', text: 'Kill', h: 48, bg: '#ff3300', stroke: { color: '#111111', width: 3 }, textStroke: { color: '#000000', width: 2 }, font: 'FredokaOne', fontSize: 24 },
  ] }] });
  assert.ok(!out.error, out.error);
  const kill = find(out.item, 'Kill');
  assert.equal(kill.className, 'TextButton');
  assert.equal(kill.props.Text.v, '');
  assert.equal(kids(kill, 'UIStroke')[0].props.ApplyStrokeMode.v, 'Enum.ApplyStrokeMode.Border');
  const label = kids(kill, 'TextLabel')[0];
  assert.equal(label.props.Text.v, 'Kill');
  assert.equal(label.props.TextSize.v, 24);
  assert.equal(kids(label, 'UIStroke')[0].props.ApplyStrokeMode.v, 'Enum.ApplyStrokeMode.Contextual');
  assert.deepEqual(out.interactive, ['Stack1.Kill']);
});

test('depth puts a darker base under a face that carries the look, the layout and the children', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'stack', name: 'Panel', w: 300, h: 200, bg: '#222222', radius: 8, pad: 10, gap: 6,
    stroke: { color: '#000000', width: 3 }, depth: { color: '#000000', px: 6 }, gradient: { colors: ['#333333', '#222222'], rotation: 90 },
    children: [{ type: 'text', name: 'T', text: 'Hi' }] }] });
  assert.ok(!out.error, out.error);
  const panel = find(out.item, 'Panel');
  assert.equal(panel.className, 'Frame');
  assert.deepEqual(panel.props.BackgroundColor3.v, [0, 0, 0]);
  assert.deepEqual(panel.props.Size.v, [0, 300, 0, 200]);
  assert.ok(kids(panel, 'UIStroke').length === 1 && kids(panel, 'UICorner').length === 1);
  const face = kids(panel, 'Frame')[0];
  assert.equal(face.name, 'Face');
  assert.deepEqual(face.props.Size.v, [1, 0, 1, -6]);
  assert.deepEqual(face.props.BackgroundColor3.v, [0.1333, 0.1333, 0.1333]);
  for (const c of ['UIListLayout', 'UIPadding', 'UIGradient', 'UICorner']) assert.equal(kids(face, c).length, 1, c);
  assert.ok(find(face, 'T'));
  assert.match(E.compileScreen({ name: 'S', children: [{ type: 'stack', depth: { color: '#000000' } }] }).error, /depth needs a fixed/);
});

test('pattern tiles an image across the object (studs, stripes) under its children', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'stack', name: 'Bar', w: 300, h: 40, bg: '#00ff66', pattern: { image: 'rbxassetid://123', tile: 20, t: 0.5 },
    children: [{ type: 'button', name: 'B', text: 'Go', w: 80, pattern: { image: 'rbxassetid://123' } }] }] });
  assert.ok(!out.error, out.error);
  const bar = find(out.item, 'Bar');
  assert.equal(bar.className, 'ImageLabel');
  assert.equal(bar.props.ScaleType.v, 'Enum.ScaleType.Tile');
  assert.deepEqual(bar.props.TileSize.v, [0, 20, 0, 20]);
  const b = find(out.item, 'B');
  assert.equal(b.className, 'ImageButton');
  assert.equal(b.props.Text, undefined);
  assert.equal(kids(b, 'TextLabel')[0].props.Text.v, 'Go');
  assert.match(E.compileScreen({ name: 'S', children: [{ type: 'text', text: 'x', pattern: { image: 'rbxassetid://1' } }] }).error, /pattern, skin and depth go on/);
});

test('skin draws generated art as the object, 9-sliced from its size so it stretches cleanly', () => {
  const out = E.compileScreen({ name: 'S', children: [{ type: 'stack', w: 300, h: 200, children: [
    { type: 'button', name: 'Buy', text: 'BUY', h: 64, skin: { image: 'rbxassetid://55', size: [512, 214], slice: 48 }, font: 'FredokaOne', textStroke: { color: '#000000', width: 3 } },
    { type: 'frame', name: 'Card', h: 100, skin: { image: 'rbxassetid://56' } },
  ] }] });
  assert.ok(!out.error, out.error);
  const buy = find(out.item, 'Buy');
  assert.equal(buy.className, 'ImageButton');
  assert.equal(buy.props.ScaleType.v, 'Enum.ScaleType.Slice');
  assert.deepEqual(buy.props.SliceCenter, { t: 'Rect', v: [48, 48, 464, 166] });
  assert.equal(buy.props.BackgroundTransparency.v, 1);
  assert.equal(kids(buy, 'TextLabel')[0].props.Text.v, 'BUY');
  assert.equal(find(out.item, 'Card').props.ScaleType.v, 'Enum.ScaleType.Stretch');
  assert.match(E.compileScreen({ name: 'S', children: [{ type: 'frame', skin: { image: 'rbxassetid://1', slice: 10 } }] }).error, /slice needs size/);
  assert.match(E.compileScreen({ name: 'S', children: [{ type: 'frame', skin: { image: 'rbxassetid://1' }, pattern: { image: 'rbxassetid://2' } }] }).error, /one image per object/);
});
