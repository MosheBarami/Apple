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
 * The fourth, `set_mood`, is the caller `moodLuau` never had. worldbuilding.ts has carried
 * eight art-directed lighting moods since it was written and `worldBuildingBrief` describes
 * them to the model in the system prompt on every build request (prompts.ts:302) — while
 * `moodLuau`, the function that materialises one, had zero callers anywhere in the
 * repository. The moods were advertised to the model and withheld from it.
 *
 * These tests EXECUTE the tools against a stub Studio bridge rather than reading the source,
 * so they go red if the registration is removed, if the emitted Luau stops containing the
 * lighting writes, or if the panel payload stops being a valid generative-UI document.
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
      execStudioOp: async (op) => { ops.push(op); return answer; },
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

test('set_mood sends Luau that actually configures Lighting', async () => {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.set_mood.run(ctx, { mood: 'night' });
  assert.equal(ops.length, 1, 'exactly one op');
  assert.equal(ops[0].op, 'run_code');
  const code = ops[0].code;
  assert.match(code, /game:GetService\("Lighting"\)/, 'it must reach Lighting');
  assert.match(code, /Instance\.new\(class\)/, 'it must construct the post-effects');
  assert.match(code, /Atmosphere/, 'atmosphere is the core of a mood');
  assert.ok(code.length > 200, `emitted only ${code.length} chars of Luau`);
});

test('each mood emits DIFFERENT lighting, so the choice is not cosmetic', async () => {
  const seen = new Map();
  for (const mood of ['day', 'night', 'horror']) {
    const { ctx, ops } = stubCtx();
    await T.TOOLS.set_mood.run(ctx, { mood });
    seen.set(mood, ops[0].code);
  }
  assert.notEqual(seen.get('day'), seen.get('night'));
  assert.notEqual(seen.get('night'), seen.get('horror'));
});

test('an unknown mood is refused BY NAME and reaches Studio not at all', async () => {
  // The alternative — moodLuau's silent fallback to `day` — is the exact "nothing errors,
  // the scene is simply wrong" failure the moods exist to prevent.
  const { ctx, ops } = stubCtx();
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'cinematic-vibes' });
  assert.match(String(res.error), /unknown mood/);
  assert.match(String(res.error), /night/, 'the refusal must list what IS valid');
  assert.equal(ops.length, 0, 'nothing may be sent to the place');
});

test("set_mood's emitted Luau survives the plugin's non-yielding-loop refusal", async () => {
  // Ops.luau refuses `while true` / `while 1` / `repeat ... until false` with no yield.
  // moodLuau emits generic `for` loops, which terminate; if it ever emits an infinite one
  // the mood would be refused in the user's place and silently never apply.
  const { ctx, ops } = stubCtx();
  await T.TOOLS.set_mood.run(ctx, { mood: 'misty' });
  const code = ops[0].code;
  assert.doesNotMatch(code, /while\s*\(?\s*(true|1)\s*\)?\s*do/);
  assert.doesNotMatch(code, /repeat\b/);
});

test('set_mood hands back the palettes designed for that light', async () => {
  const { ctx } = stubCtx();
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'golden' });
  assert.ok(Array.isArray(res.palettes) && res.palettes.length > 0, 'golden has designed palettes');
  for (const p of res.palettes) {
    assert.ok(typeof p.name === 'string' && Array.isArray(p.materials) && p.materials.length > 0);
  }
});

// --- get_instance ---------------------------------------------------------------------

const INSTANCE = {
  ok: true,
  data: {
    path: 'game.Workspace.Lobby.Floor',
    class: 'Part',
    childCount: 2,
    props: { Position: '0, 0.5, 0', Size: '86, 1, 74', Anchored: 'true', Material: 'Concrete', Transparency: '0' },
    attributes: { Zone: 'lobby' },
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
