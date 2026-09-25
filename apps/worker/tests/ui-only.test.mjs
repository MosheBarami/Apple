/**
 * D-UIONLY-1: Apple never makes UI by hand. Every piece of game UI is a library component inserted
 * with insert_ui_component, drawn from stored library files.
 *
 * What this file holds the worker to:
 *   - the generic writers refuse to create UI classes (create_instances, run_luau, edit_script), and
 *     each refusal names the insert_ui_component call to use instead; comments are not code;
 *   - set_properties may still move and retext inserted UI, but not restyle it;
 *   - build_ui and install_module("ui_kit"), the two old hand-made paths, are refused;
 *   - every component, in every skin and colour, compiles to classes, properties, value types and
 *     enums the plugin accepts, and shows ONLY library files named by its catalogue entry, with
 *     every colour a pixel measured from a library file;
 *   - the insert checks the name first, builds nothing when an image has no id, and resolves ids
 *     from the shared table before uploading.
 *
 * Run with:  node --test tests/ui-only.test.mjs      (from apps/worker)
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
const LIB = JSON.parse(readFileSync(join(WORKER, '..', '..', 'packages', 'asset-library', 'ui-components.json'), 'utf8'));
const temp = mkdtempSync(join(tmpdir(), 'ui-only-'));
const bundle = (entry) => {
  const outfile = join(temp, `${entry}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', `${entry}.ts`), '--bundle', '--format=esm', '--target=es2022', `--outfile=${outfile}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  return outfile;
};
const T = await import(pathToFileURL(bundle('tools')).href);
const U = await import(pathToFileURL(bundle('ui-components')).href);
rmSync(temp, { recursive: true, force: true });

function studio(reply) {
  const calls = [];
  return {
    calls,
    ctx: {
      env: {},
      execStudioOp: async (op) => {
        calls.push(op);
        const data = typeof reply === 'function' ? reply(op) : reply;
        return data && data.__fail ? { id: 'x', ok: false, error: data.__fail } : { id: 'x', ok: true, data: data ?? { ok: true } };
      },
    },
  };
}
const refused = (r) => r && typeof r === 'object' && typeof r.error === 'string' && /D-UIONLY-1/.test(r.error);
const namesTool = (r) => /insert_ui_component/.test(r.error);

/* ------------------------------------------------------------ the generic writers --- */

test('create_instances refuses a Frame, a nested TextButton and a BillboardGui, sends nothing, and names the tool to use', async () => {
  for (const items of [
    [{ className: 'Frame', name: 'Shop', parent: 'game.StarterGui.Main' }],
    [{ className: 'ScreenGui', name: 'Hud', parent: 'game.StarterGui', children: [{ className: 'TextButton', name: 'Buy' }] }],
    [{ className: 'Model', name: 'Stall', children: [{ className: 'Part', name: 'Sign', children: [{ className: 'BillboardGui', name: 'Tag' }] }] }],
    [{ className: 'Folder', name: 'F', children: [{ className: 'UIStroke', name: 'S' }] }],
  ]) {
    const s = studio();
    const r = await T.TOOLS.create_instances.run(s.ctx, { items });
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesTool(r), r.error);
    assert.equal(s.calls.length, 0, 'nothing may reach Studio');
  }
});

// D-MODELLIB-2 closed hand-assembled Models (model-only.test.mjs); plain structure in a Folder still passes the UI rule.
test('create_instances still builds the world: plain Parts, Folders, lights and layout-only UI objects are not refused', async () => {
  const s = studio({ created: ['game.Workspace.Arena'] });
  const r = await T.TOOLS.create_instances.run(s.ctx, { items: [{ className: 'Folder', name: 'Arena', children: [{ className: 'Part', name: 'Floor', children: [{ className: 'PointLight', name: 'L' }] }] }] });
  assert.ok(!refused(r), JSON.stringify(r));
  assert.equal(s.calls.length, 1);
  const layout = studio({ created: ['x'] });
  assert.ok(!refused(await T.TOOLS.create_instances.run(layout.ctx, { items: [{ className: 'UIListLayout', name: 'L', parent: 'game.StarterGui.Shop.Shop.Content' }] })));
});

const UI_LUAU = [
  'local b = Instance.new("TextButton")\nb.Parent = script.Parent',
  "local g = Instance.new('ScreenGui', player.PlayerGui)",
  'local f = Instance.new "Frame"',
  'local f = Instance.new[[ImageLabel]]',
  'local f = Instance["new"]("TextLabel")',
  'local f = Instance.new("Text" .. "Box")',
  'local k = "ScrollingFrame"\nlocal f = Instance.new(k)',
  'local make = Instance.new\nlocal s = make("BillboardGui")',
];

test('run_luau refuses Luau that Instance.news a UI class, in every spelling, and sends nothing', async () => {
  for (const code of UI_LUAU) {
    const s = studio();
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(refused(r), `${code}\n${JSON.stringify(r)}`);
    assert.ok(namesTool(r), r.error);
    assert.equal(s.calls.length, 0);
  }
});

test('comments and class checks are not creation: they pass the UI rule', async () => {
  for (const code of [
    '-- never do Instance.new("TextButton") here\nprint(1)',
    '--[[ Instance.new("Frame") ]] local p = Instance.new("Part")',
    'for _, d in game.StarterGui:GetDescendants() do if d:IsA("TextButton") then print(d.Name) end end\nlocal m = Instance.new(className)',
    'local t = game.StarterGui.ShopGui:Clone()\nt.Parent = workspace',
  ]) {
    const s = studio({ ok: true });
    const r = await T.TOOLS.run_luau.run(s.ctx, { code });
    assert.ok(!refused(r), `${code}\n${JSON.stringify(r)}`);
  }
});

test('edit_script refuses a new script, a rewrite and a find/replace that add UI Instance.new, and allows edits that add none', async () => {
  const withRead = (source) => studio((op) => (op.op === 'read_script' ? (source === null ? { __fail: 'not found: x' } : { source, hash: 'h' }) : { ok: true }));
  const cases = [
    { before: null, args: { path: 'game.StarterPlayer.StarterPlayerScripts.Hud', create_class: 'LocalScript', create_parent: 'game.StarterPlayer.StarterPlayerScripts', source: 'local b = Instance.new("TextButton")\nb.Parent = game.Players.LocalPlayer.PlayerGui' } },
    { before: 'print("hi")', args: { path: 'game.StarterPlayer.StarterPlayerScripts.Hud', source: 'local g = Instance.new("ScreenGui")' } },
    { before: 'local x = 1', args: { path: 'game.StarterPlayer.StarterPlayerScripts.Hud', edits: [{ find: 'local x = 1', replace: 'local x = Instance.new("ImageButton")' }] } },
  ];
  for (const { before, args } of cases) {
    const s = withRead(before);
    const r = await T.TOOLS.edit_script.run(s.ctx, args);
    assert.ok(refused(r), JSON.stringify(r));
    assert.ok(namesTool(r), r.error);
    assert.ok(!s.calls.some((c) => c.op === 'edit_script'), 'the script must not be written');
  }
  // A legacy script that already makes UI can still be edited as long as it makes no MORE.
  const legacy = 'local f = Instance.new("Frame")\nf.Name = "Old"';
  const s = withRead(legacy);
  const r = await T.TOOLS.edit_script.run(s.ctx, { path: 'game.StarterGui.Legacy', edits: [{ find: '"Old"', replace: '"New"' }] });
  assert.ok(!refused(r), JSON.stringify(r));
  assert.ok(s.calls.some((c) => c.op === 'edit_script'));
  // A comment that mentions the constructor is not code.
  const c = withRead('print(1)');
  assert.ok(!refused(await T.TOOLS.edit_script.run(c.ctx, { path: 'game.StarterGui.X', source: '-- UI comes from insert_ui_component, never Instance.new("Frame")\nprint(2)' })));
});

test('set_properties moves and retexts inserted UI but refuses restyling it', async () => {
  const frame = () => studio((op) => (op.op === 'get_instance' ? { class: 'ImageLabel', props: {} } : { ok: true }));
  const ok = frame();
  const r = await T.TOOLS.set_properties.run(ok.ctx, { path: 'game.StarterGui.Shop.Shop.Header.Title', props: { Text: { t: 'string', v: 'Pets' }, Position: { t: 'UDim2', v: [0.5, 0, 0.1, 0] }, Visible: { t: 'bool', v: false } } });
  assert.ok(!refused(r), JSON.stringify(r));
  assert.ok(ok.calls.some((c) => c.op === 'set_props'));
  for (const props of [{ BackgroundColor3: { t: 'Color3', v: [1, 0, 0] } }, { Image: { t: 'string', v: 'rbxassetid://1' } }, { Font: { t: 'EnumItem', v: 'Enum.Font.Arial' } }]) {
    const s = frame();
    const out = await T.TOOLS.set_properties.run(s.ctx, { path: 'game.StarterGui.Shop.Shop', props });
    assert.ok(refused(out), JSON.stringify(out));
    assert.ok(!s.calls.some((c) => c.op === 'set_props'));
  }
  // A Part's Color is not UI.
  const part = studio((op) => (op.op === 'get_instance' ? { class: 'Part', props: {} } : { ok: true }));
  assert.ok(!refused(await T.TOOLS.set_properties.run(part.ctx, { path: 'game.Workspace.P', props: { Color: { t: 'Color3', v: [1, 0, 0] } } })));
  const bulk = studio();
  assert.ok(refused(await T.TOOLS.set_properties_bulk.run(bulk.ctx, { targets: ['game.StarterGui.A.B'], props: { TextColor3: { t: 'Color3', v: [1, 1, 1] } } })));
  assert.equal(bulk.calls.length, 0);
});

test('the two old hand-made paths are refused with a pointer to insert_ui_component', async () => {
  const s = studio();
  const b = await T.TOOLS.build_ui.run(s.ctx, { screen: 'ShopGui', theme: 'simulator', tree: { kind: 'panel', children: [] } });
  assert.ok(refused(b) && namesTool(b), JSON.stringify(b));
  const k = await T.TOOLS.install_module.run(s.ctx, { module: 'ui_kit' });
  assert.ok(refused(k) && namesTool(k), JSON.stringify(k));
  assert.equal(s.calls.length, 0);
  // Other vetted modules install as before.
  const m = studio((op) => (op.op === 'read_script' ? { __fail: 'not found: x' } : { ok: true }));
  assert.ok(!refused(await T.TOOLS.install_module.run(m.ctx, { module: 'currency' })));
});

test('insert_ui_component is registered as a Studio writer with the ops it sends', () => {
  const tool = T.TOOLS.insert_ui_component;
  assert.ok(tool && tool.studio === true);
  assert.equal(tool.def.name, 'insert_ui_component');
  assert.deepEqual([...tool.studioOps].sort(), ['create_instances', 'get_instance', 'query_instances', 'ui_layout_check']);
  assert.deepEqual(tool.def.parameters.properties.component.enum, LIB.components.map((c) => c.id));
});

/* ------------------------------------------------------------------- the builder --- */

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
const ALLOW = { classes: tableKeys(COMMANDS, 'local CREATE_CLASSES = {'), props: tableKeys(COMMANDS, 'local PROPERTY_ALLOW = {'), enums: tableKeys(COMMANDS, 'local ENUM_ALLOW = {') };
for (const file of readdirSync(join(PLUGIN_SRC, 'ops')).filter((f) => f.endsWith('.luau') && f !== 'init.luau')) {
  const src = readFileSync(join(PLUGIN_SRC, 'ops', file), 'utf8');
  for (const [key, head] of [['classes', 'createClasses = {'], ['props', 'propertyAllow = {'], ['enums', 'enumAllow = {']]) {
    for (const name of tableKeys(src, head) ?? []) ALLOW[key].add(name);
  }
}
const VALUE_TYPES = new Set([...COMMANDS.matchAll(/\bt == "([A-Za-z0-9]+)"/g)].map((m) => m[1]));

/** Every (component, skin, colour) the catalogue offers. */
const CASES = [];
for (const c of LIB.components) for (const [skin, s] of Object.entries(LIB.skins)) if (c.genres.includes(skin)) for (const colour of s.colours) CASES.push({ c, skin, colour });

function walk(spec, visit) {
  visit(spec);
  for (const k of spec.children ?? []) walk(k, visit);
}
const idOf = (asset) => String(1000 + Object.keys(LIB.images).concat(Object.values(LIB.icons)).indexOf(asset));
const assetOfId = new Map(Object.keys(LIB.images).concat(Object.values(LIB.icons)).map((a) => [idOf(a), a]));

test('the catalogue is not empty, so the checks below check something', () => {
  assert.ok(ALLOW.classes.size > 10 && ALLOW.props.size > 10 && ALLOW.enums.size > 10);
  assert.ok(CASES.length >= 300, `${CASES.length} cases`);
  assert.ok(LIB.components.length >= 30);
});

test('every component in every skin and colour uses only what the plugin accepts', () => {
  for (const { c, skin, colour } of CASES) {
    const out = U.compileComponent({ component: c.id, genre: skin, colour, parent: c.id === 'billboard_tag' || c.id === 'surface_sign' ? 'game.Workspace.P' : undefined }, idOf);
    assert.ok(!('error' in out), `${c.id}/${skin}/${colour}: ${out.error}`);
    walk(out.item, (sp) => {
      const where = `${c.id}/${skin}/${colour} ${sp.className} ${sp.name}`;
      assert.ok(ALLOW.classes.has(sp.className), `${where}: class not creatable`);
      for (const [k, v] of Object.entries(sp.props ?? {})) {
        assert.ok(ALLOW.props.has(k), `${where}: property ${k} not allowed`);
        assert.ok(VALUE_TYPES.has(v.t), `${where}: value type ${v.t}`);
        if (v.t === 'EnumItem') assert.ok(ALLOW.enums.has(v.v.split('.')[1]), `${where}: enum ${v.v} not allowed`);
      }
    });
  }
});

test('a component shows only library files its catalogue entry names, uses every role it declares, and names no colour of its own', () => {
  const pixels = new Set([LIB.ink.ink_light, LIB.ink.ink_dark, ...Object.values(LIB.images).map((m) => m.edge)].map((c) => c.map((x) => Math.round((x / 255) * 1000) / 1000).join(',')));
  for (const { c, skin, colour } of CASES) {
    const roles = LIB.skins[skin].roles[colour];
    const declared = new Set([...c.roles.map((r) => roles[r]), ...c.icons.map((k) => LIB.icons[k])]);
    const out = U.compileComponent({ component: c.id, genre: skin, colour, parent: 'game.Workspace.P' }, idOf);
    const shown = new Set();
    walk(out.item, (sp) => {
      // A toggle or tab keeps its other state's image in an attribute, for a script to swap in.
      for (const v of Object.values(sp.attributes ?? {})) {
        const id = /^rbxassetid:\/\/(\d+)$/.exec(String(v.v))?.[1];
        if (id) { assert.ok(assetOfId.has(id), `${c.id}: attribute ${v.v} is not a library file`); shown.add(assetOfId.get(id)); }
      }
      for (const [k, v] of Object.entries(sp.props ?? {})) {
        if (k === 'Image') {
          const id = /^rbxassetid:\/\/(\d+)$/.exec(v.v)?.[1];
          assert.ok(id && assetOfId.has(id), `${c.id}: Image ${v.v} is not a library file`);
          shown.add(assetOfId.get(id));
        }
        if (v.t === 'Color3') assert.ok(pixels.has(v.v.join(',')), `${c.id}: ${k} ${v.v} is not a measured library pixel`);
        if (k === 'Font') assert.equal(v.v, LIB.skins[skin].font);
        if (k === 'BackgroundTransparency') assert.equal(v.v, 1, `${c.id}: ${sp.className} ${sp.name} paints a background of its own`);
        if (k === 'SliceCenter') assert.ok(sp.props.Image, 'a slice needs its image');
      }
      assert.ok(!('BackgroundColor3' in (sp.props ?? {})), `${c.id}: BackgroundColor3`);
    });
    for (const f of shown) assert.ok(declared.has(f), `${c.id}/${skin}/${colour}: shows ${f}, which the catalogue does not name`);
    for (const r of c.roles) assert.ok(shown.has(roles[r]), `${c.id}/${skin}/${colour}: declares role ${r} but never shows it`);
    assert.deepEqual(out.assets, [...shown].sort());
  }
});

test('bad arguments are refused before anything is sent', () => {
  for (const a of [
    { component: 'fancy_box', genre: 'simulator' },
    { component: 'shop_window', genre: 'cooking' },
    { component: 'crosshair', genre: 'obby' },
    { component: 'shop_window', genre: 'simulator', colour: 'purple' },
    { component: 'shop_window', genre: 'simulator', name: 'bad name' },
    { component: 'shop_window', genre: 'simulator', icon: 'kenney-ui-pack/made-up.png' },
    { component: 'shop_window', genre: 'simulator', size: [2, 1] },
  ]) assert.ok('error' in U.compileComponent(a), JSON.stringify(a));
  assert.ok(!('error' in U.compileComponent({ component: 'shop_window', genre: 'Tycoon' })), 'genre aliases map to a skin');
});

test('insert: checks the name, renders an unavailable library image from its stored palette, then lays out', async () => {
  const resolverWith = (missing) => async (assets) => ({ ids: Object.fromEntries(assets.filter((a) => !missing.includes(a)).map((a) => [a, idOf(a)])), missing: missing.map((asset) => ({ asset, why: 'no key' })) });
  const reply = (op) => op.op === 'query_instances' ? { matches: [] } : op.op === 'create_instances' ? { created: ['game.StarterGui.ShopGui'] } : { verdict: 'pass', issues: [] };

  const s = studio(reply);
  const r = await U.insertUiComponent.run((op) => s.ctx.execStudioOp(op).then((x) => (x.ok ? x.data : { error: x.error })), { component: 'shop_window', genre: 'simulator', name: 'ShopGui' }, resolverWith([]));
  assert.equal(r.inserted, 'game.StarterGui.ShopGui.ShopGui', JSON.stringify(r));
  assert.deepEqual(s.calls.map((c) => c.op), ['query_instances', 'create_instances', 'ui_layout_check']);
  const screen = s.calls[1].items[0];
  assert.equal(screen.className, 'ScreenGui');
  assert.equal(screen.parent, 'game.StarterGui');
  assert.ok(r.parts.some((p) => p.endsWith('Close')) && r.parts.some((p) => p.endsWith('Item1.Buy')));

  const taken = studio((op) => (op.op === 'query_instances' ? { matches: [{ path: 'game.StarterGui.ShopGui' }] } : {}));
  const t = await U.insertUiComponent.run((op) => taken.ctx.execStudioOp(op).then((x) => x.data), { component: 'shop_window', genre: 'simulator', name: 'ShopGui' }, resolverWith([]));
  assert.ok(t.error && !taken.calls.some((c) => c.op === 'create_instances'));

  const plan = U.compileComponent({ component: 'shop_window', genre: 'simulator' });
  const m = studio(reply);
  const x = await U.insertUiComponent.run((op) => m.ctx.execStudioOp(op).then((y) => y.data), { component: 'shop_window', genre: 'simulator' }, resolverWith([plan.assets[0]]));
  assert.equal(x.inserted, 'game.StarterGui.ShopGui.ShopWindow', JSON.stringify(x));
  assert.ok(x.nativeImages.includes(plan.assets[0]));
  const native = m.calls.find((c) => c.op === 'create_instances');
  assert.ok(native, 'the catalogue recipe is built without an upload');
  const all = [];
  walk(native.items[0], (sp) => all.push(sp));
  assert.ok(all.some((sp) => sp.props?.Image?.v === '' && sp.props?.BackgroundColor3), 'a missing library image is rendered using its measured colour');
  assert.ok(all.some((sp) => sp.className === 'UICorner'), 'a missing rounded library image keeps its shape');

  const w = await U.insertUiComponent.run(async () => ({}), { component: 'billboard_tag', genre: 'obby' }, resolverWith([]));
  assert.ok(w.error && /parent/.test(w.error), 'a world component needs its part');
});

test('every catalogue recipe has a keyless rendering accepted by the current Studio plugin', () => {
  const measured = new Set(Object.values(LIB.images).map((m) => m.centre.map((x) => Math.round((x / 255) * 1000) / 1000).join(',')));
  for (const { c, skin, colour } of CASES) {
    const out = U.compileComponent({ component: c.id, genre: skin, colour, parent: 'game.Workspace.P' }, () => '');
    assert.ok(!('error' in out), `${c.id}/${skin}/${colour}: ${out.error}`);
    walk(out.item, (sp) => {
      const where = `${c.id}/${skin}/${colour} ${sp.className}.${sp.name}`;
      assert.ok(ALLOW.classes.has(sp.className), `${where}: class`);
      for (const [key, val] of Object.entries(sp.props ?? {})) {
        assert.ok(ALLOW.props.has(key), `${where}: property ${key}`);
        if (key === 'Image') assert.equal(val.v, '', `${where}: no guessed asset id`);
        if (key === 'BackgroundColor3') assert.ok(measured.has(val.v.join(',')), `${where}: colour comes from the catalogue`);
      }
      for (const [key, val] of Object.entries(sp.attributes ?? {})) {
        if (key === 'OnImage' || key === 'OffImage') assert.equal(val.v, '', `${where}: no guessed state image`);
      }
    });
  }
});

test('ids: shared and cached images work, while insert never starts a permanent upload', async () => {
  const kv = new Map([['ui-image:u1:kenney-ui-pack/red/button_round_depth_gloss.png', '222']]);
  const env = { KV: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } } };
  const uploads = [];
  const deps = {
    describeCredential: async () => ({ scopes: ['asset:write'] }),
    read: async () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]),
    upload: async (_e, _u, input) => { uploads.push(input.displayName); return { ok: true, data: { done: true, assetId: '333', operationId: 'op' } }; },
  };
  const resolve = U.uiImageResolver(env, 'u1', deps);
  const out = await resolve(['kenney-ui-pack/red/button_round_depth_gloss.png', 'kenney-ui-pack/blue/button_rectangle_depth_gloss.png']);
  assert.equal(out.ids['kenney-ui-pack/red/button_round_depth_gloss.png'], '222');
  assert.ok(out.missing.some((m) => m.asset === 'kenney-ui-pack/blue/button_rectangle_depth_gloss.png'));
  assert.equal(uploads.length, 0);
  assert.equal(kv.has('ui-image:u1:kenney-ui-pack/blue/button_rectangle_depth_gloss.png'), false);
  const none = await U.uiImageResolver({}, undefined, {})(['kenney-ui-pack/blue/button_rectangle_depth_gloss.png']);
  assert.equal(none.missing.length, 1);
});

test('a Creator Store image is a library icon: accepted by the component and set as it is, never uploaded (D-UISTORE-1)', async () => {
  const T2 = await import(pathToFileURL(bundle('ui-store-search')).href);
  const [hit] = T2.findUiStoreImages({ query: 'coin', limit: 1 });
  assert.ok(hit, 'the store search found something to test with');
  const plan = U.compileComponent({ component: 'currency_counter', genre: 'simulator', icon: hit.image });
  assert.ok(!('error' in plan), JSON.stringify(plan));
  assert.ok(plan.assets.includes(hit.image), 'the store image is one of the component\'s images');
  assert.ok('error' in U.compileComponent({ component: 'currency_counter', genre: 'simulator', icon: 'rbxassetid://1' }), 'an id the library does not hold is refused');
  const uploads = [];
  const out = await U.uiImageResolver({}, 'u1', { upload: async () => { uploads.push(1); return { ok: false, error: 'no' }; } })([hit.image]);
  assert.equal(out.ids[hit.image], String(hit.imageId));
  assert.equal(uploads.length, 0);
});
