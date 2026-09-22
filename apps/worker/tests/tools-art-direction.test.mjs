/**
 * THE FOUR TOOLS THAT WERE BUILT AND NEVER REGISTERED.
 *
 * Three of these are Studio ops the installed plugin has always implemented
 * (`handlers.get_instance`, `handlers.get_selection`, `handlers.camera_focus` in
 * apps/plugin/src/Ops.luau) and that `StudioOp` in packages/shared has always typed —
 * reachable only behind ADMIN_STUDIO_OPS, never as agent tools. The system prompt
 * (apps/worker/src/prompts.ts:73) has meanwhile been telling the model to "verify with a
 * read-back (get_instance, ...)", naming a tool that did not exist.
 *
 * The fourth, `set_mood`, materialises the eight art-directed lighting moods through bounded typed
 * Lighting writes. worldbuilding.ts still carries its older Luau generator as compatibility data,
 * but the shipping tool does not execute it.
 *
 * These tests EXECUTE the tools against a stub Studio bridge rather than reading the source,
 * so they go red if registration is removed, if the typed Lighting writes drift, or if the panel
 * payload stops being a valid generative-UI document.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-artdir-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);
rmSync(out, { force: true });

/** A Studio bridge that records what was asked of it and answers with a fixture. */
function stubCtx(answer = { ok: true, data: { ok: true } }) {
  const ops = [];
  return {
    ops,
    ctx: {
      env: {},
      studioConnected: () => true,
      execStudioOp: async (op) => { ops.push(op); return typeof answer === 'function' ? answer(op) : answer; },
      addMemoryFact: async () => {},
      createCheckpoint: async () => ({ id: 'c1' }),
    },
  };
}

test('the registry parse is not vacuous, and all four tools are registered', () => {
  const names = T.toolNames();
  assert.ok(names.length >= 24, `parsed ${names.length} tools`);
  for (const t of ['get_instance', 'get_selection', 'focus_camera', 'set_mood']) {
    assert.ok(names.includes(t), `${t} must be registered`);
  }
});

test('they are offered to a Studio-connected agent', () => {
  const offered = T.toolDefs(true, undefined).map((d) => d.name);
  for (const t of ['get_instance', 'get_selection', 'focus_camera', 'set_mood']) {
    assert.ok(offered.includes(t), `${t} must be offered`);
  }
});

test('all four are withheld when Studio is not connected', () => {
  // Each one drives the place through the plugin; offering them unpaired would be a tool
  // the model is invited to call and cannot possibly execute.
  const offered = T.toolDefs(false, undefined).map((d) => d.name);
  for (const t of ['get_instance', 'get_selection', 'focus_camera', 'set_mood']) {
    assert.equal(offered.includes(t), false, `${t} must not be offered without Studio`);
  }
});

// --- set_mood -------------------------------------------------------------------------

function moodBridge(children = []) {
  return stubCtx((op) => {
    if (op.op === 'get_tree') return { ok: true, data: { root: { path: 'game.Lighting', children } } };
    return { ok: true, data: { ok: true } };
  });
}

test("set_mood replaces only Apple-owned effects and preserves the user's Lighting", async () => {
  const { ctx, ops } = moodBridge([
    { path: 'game.Lighting.UserCC', class: 'ColorCorrectionEffect', attributes: {} },
    { path: 'game.Lighting.UserSun', class: 'SunRaysEffect', attributes: {} },
    { path: 'game.Lighting.OldBloom', class: 'BloomEffect', attributes: { AppleMood: { t: 'string', v: 'night' } } },
    { path: 'game.Lighting.OldAtmosphere', class: 'Atmosphere', attributes: { AppleMood: { t: 'string', v: 'night' } } },
  ]);
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'golden' });
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'delete_instances', 'set_props', 'create_instances']);
  assert.deepEqual(ops[1].paths.sort(), ['game.Lighting.OldAtmosphere', 'game.Lighting.OldBloom']);
  assert.deepEqual(res.keptUserEffects.sort(), ['ColorCorrectionEffect', 'SunRaysEffect']);
  assert.equal(res.replacedOwn, 2);
  assert.match(res.note, /still active/i);
  assert.match(res.note, /ask before deleting/i);
});

test('set_mood sends typed Lighting properties and typed effect instances, never executable code', async () => {
  const { ctx, ops } = moodBridge();
  await T.TOOLS.set_mood.run(ctx, { mood: 'night' });
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'set_props', 'create_instances']);
  const props = ops[1].props;
  assert.equal(props.ClockTime.t, 'number');
  assert.equal(props.Ambient.t, 'Color3');
  const items = ops[2].items;
  assert.ok(items.some((item) => item.className === 'Atmosphere'));
  assert.ok(items.some((item) => item.className === 'BloomEffect'));
  assert.ok(items.every((item) => item.attributes.AppleMood.v === 'night'));
  assert.equal(ops.some((op) => op.op === 'run_code'), false);
});

test('each mood sends different typed Lighting values, so the choice is not cosmetic', async () => {
  const seen = new Map();
  for (const mood of ['day', 'night', 'horror']) {
    const { ctx, ops } = moodBridge();
    await T.TOOLS.set_mood.run(ctx, { mood });
    seen.set(mood, JSON.stringify(ops.find((op) => op.op === 'set_props').props));
  }
  assert.notEqual(seen.get('day'), seen.get('night'));
  assert.notEqual(seen.get('night'), seen.get('horror'));
});

test('an unknown mood is refused BY NAME and reaches Studio not at all', async () => {
  const { ctx, ops } = moodBridge();
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'cinematic-vibes' });
  assert.match(String(res.error), /unknown mood/);
  assert.match(String(res.error), /night/, 'the refusal must list what IS valid');
  assert.equal(ops.length, 0, 'nothing may be sent to the place');
});

test('set_mood hands back the palettes designed for that light', async () => {
  const { ctx } = moodBridge();
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'golden' });
  assert.ok(Array.isArray(res.palettes) && res.palettes.length > 0, 'golden has designed palettes');
  for (const p of res.palettes) {
    assert.ok(typeof p.name === 'string' && Array.isArray(p.materials) && p.materials.length > 0);
  }
});

// --- get_instance ---------------------------------------------------------------------

/**
 * THE SHAPE THE PLUGIN ACTUALLY RETURNS.
 *
 * `Paths.encode` wraps every scalar as `{ t, v }` and recurses into tables, encoding each FIELD —
 * so `get_instance`'s props and attributes arrive wrapped, not bare. This fixture was originally
 * written with plain strings, which is the shape I assumed rather than the shape the plugin sends.
 * The tool read it the same wrong way, so code and test agreed with each other and disagreed with
 * production: every property would have rendered as "[object Object]" in the panel.
 *
 * A stub that encodes the author's misunderstanding is worse than no stub, because it converts an
 * untested assumption into a verified one. This fixture is now copied from what Paths.encode
 * produces — see apps/plugin/src/Paths.luau.
 */
const INSTANCE = {
  ok: true,
  data: {
    path: 'game.Workspace.Lobby.Floor',
    class: 'Part',
    childCount: 2,
    props: {
      Position: { t: 'Vector3', v: [0, 0.5, 0] },
      Size: { t: 'Vector3', v: [86, 1, 74] },
      Anchored: { t: 'bool', v: true },
      Material: { t: 'EnumItem', v: 'Enum.Material.Concrete' },
      Transparency: { t: 'number', v: 0 },
    },
    attributes: { Zone: { t: 'string', v: 'lobby' } },
  },
};

test('get_instance reads back, and renders a property panel the UI already supports', async () => {
  const { ctx, ops } = stubCtx(INSTANCE);
  const res = await T.TOOLS.get_instance.run(ctx, { path: 'game.Workspace.Lobby.Floor' });
  assert.deepEqual(ops[0], { op: 'get_instance', path: 'game.Workspace.Lobby.Floor' });
  assert.equal(res.class, 'Part');

  const d = ctx.uiDetail;
  assert.equal(d.v, 1, 'a v1 document is what adapters.ts passes straight through');
  assert.equal(d.blocks[0].type, 'property_inspector');
  assert.equal(d.blocks[0].className, 'Part');
  const groups = Object.fromEntries(d.blocks[0].groups.map((g) => [g.name, g.rows.map((r) => r.name)]));
  assert.deepEqual(groups.Transform, ['Position', 'Size', 'Anchored']);
  assert.deepEqual(groups.Appearance, ['Material', 'Transparency']);
  assert.deepEqual(groups.Attributes, ['Zone']);
  assert.equal('Content' in groups, false, 'an empty group must be dropped, not rendered blank');

  // AND THE VALUES ARE UNWRAPPED. This is the assertion whose absence let the bug ship: the rows
  // rendered before, they just rendered "[object Object]".
  const value = (group, name) =>
    d.blocks[0].groups.find((g) => g.name === group).rows.find((r) => r.name === name).value;
  assert.equal(value('Transform', 'Position'), '0, 0.5, 0', 'a Vector3 must read as its components');
  assert.equal(value('Transform', 'Size'), '86, 1, 74');
  assert.equal(value('Transform', 'Anchored'), 'true', 'a bool must read as true/false');
  assert.equal(value('Appearance', 'Material'), 'Enum.Material.Concrete');
  assert.equal(value('Appearance', 'Transparency'), '0');
  assert.equal(value('Attributes', 'Zone'), 'lobby');
  for (const g of d.blocks[0].groups) {
    for (const r of g.rows) {
      assert.doesNotMatch(r.value, /\[object Object\]/, `${g.name}.${r.name} rendered as an object`);
    }
  }
});

test('a failed read-back sets no panel, so the UI cannot show a stale instance', async () => {
  const { ctx } = stubCtx({ ok: false, error: 'no such instance' });
  const res = await T.TOOLS.get_instance.run(ctx, { path: 'game.Workspace.Nope' });
  assert.match(String(res.error), /no such instance/);
  assert.equal(ctx.uiDetail, undefined);
});

test('get_instance refuses an empty path instead of asking Studio for nothing', async () => {
  const { ctx, ops } = stubCtx(INSTANCE);
  const res = await T.TOOLS.get_instance.run(ctx, {});
  assert.match(String(res.error), /path is required/);
  assert.equal(ops.length, 0);
});

// --- get_selection / focus_camera ------------------------------------------------------

test('get_selection asks Studio what the user is pointing at', async () => {
  const { ctx, ops } = stubCtx({ ok: true, data: { paths: ['game.Workspace.Crate'] } });
  const res = await T.TOOLS.get_selection.run(ctx, {});
  assert.deepEqual(ops[0], { op: 'get_selection' });
  assert.deepEqual(res.paths, ['game.Workspace.Crate']);
});

test('focus_camera frames a path, and refuses an empty one', async () => {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.focus_camera.run(ctx, { path: 'game.Workspace.Fountain' });
  assert.deepEqual(ops[0], { op: 'camera_focus', path: 'game.Workspace.Fountain' });

  const empty = stubCtx();
  const res = await T.TOOLS.focus_camera.run(empty.ctx, {});
  assert.match(String(res.error), /path is required/);
  assert.equal(empty.ops.length, 0);
});

// 2026-09-22, run 1fe40a80: the Baseplate template ships an Atmosphere, set_mood created a second one,
// failed on the name ("game.Lighting already contains a child named Atmosphere") after Lighting had
// already changed, and left the mood half applied. A place renders one Atmosphere, so theirs is retuned.
test("set_mood retunes the place's own Atmosphere instead of colliding with it", async () => {
  const { ctx, ops } = moodBridge([
    { path: 'game.Lighting.Atmosphere', class: 'Atmosphere', attributes: {} },
    { path: 'game.Lighting.Bloom', class: 'BloomEffect', attributes: {} },
  ]);
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'golden' });
  assert.equal(res.error, undefined, JSON.stringify(res));
  assert.deepEqual(ops.map((op) => op.op), ['get_tree', 'set_props', 'set_props', 'create_instances']);
  assert.equal(ops[2].path, 'game.Lighting.Atmosphere');
  assert.equal(ops[2].props.Density.t, 'number', 'the mood\'s atmosphere values, typed');
  assert.equal(ops[3].items.some((item) => item.className === 'Atmosphere'), false, 'no second Atmosphere');
  assert.ok(ops[3].items.some((item) => item.className === 'BloomEffect'), 'the other effects are still created');
  assert.equal(res.updatedAtmosphere, 'game.Lighting.Atmosphere');
  assert.deepEqual(res.keptUserEffects, ['BloomEffect'], 'their Atmosphere is retuned, not listed as left alone');
});
