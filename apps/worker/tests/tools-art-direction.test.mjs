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
import { rmSync, writeFileSync, mkdtempSync } from 'node:fs';
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

/**
 * moodLuau's sweep, EXECUTED rather than grepped.
 *
 * The chunk used to open by destroying every PostEffect and Atmosphere in Lighting, unconditionally
 * — so a user who had hand-tuned a ColorCorrectionEffect and a SunRaysEffect and then asked to
 * "warm the scene up a bit" had both deleted, and was told only that a mood had been applied.
 * Replacing somebody's lighting rig is a reasonable thing to ask for and an unreasonable thing to
 * do unasked, and worse to do silently.
 *
 * A regex over the emitted source would only prove the marker appears somewhere. This runs the
 * chunk against a Lighting stub and asserts which instances are still parented afterwards, which
 * is the thing that actually matters to the user.
 */
const LUAU_TMP = mkdtempSync(join(tmpdir(), 'mood-'));
function haveLuau() {
  try { execFileSync('luau', ['--help'], { stdio: 'pipe' }); return true; } catch { return false; }
}
if (!haveLuau()) throw new Error('luau is not on PATH — these tests must run, not skip');

/**
 * The emitted chunk, taken from what the TOOL actually sends rather than from a test-only export.
 * A helper exported just for tests can drift from the thing that ships; the op cannot.
 */
async function moodCode(mood) {
  const { ctx, ops } = stubCtx();
  await T.TOOLS.set_mood.run(ctx, { mood });
  const sent = ops.find((o) => o.op === 'run_code');
  assert.ok(sent?.code, `set_mood sent no run_code for ${mood}`);
  return sent.code;
}

/** Run a mood chunk against a fake Lighting holding the given children. */
function runMood(code, children, tag) {
  const src = [
    'local made = {}',
    'local function inst(class, attrs)',
    '\tlocal a = attrs or {}',
    '\tlocal i',
    '\ti = {',
    '\t\tClassName = class, Parent = "Lighting",',
    '\t\tGetAttribute = function(_, k) return a[k] end,',
    '\t\tSetAttribute = function(_, k, v) a[k] = v end,',
    '\t\tDestroy = function(self) self.Parent = nil end,',
    '\t\tIsA = function(_, want)',
    '\t\t\tif want == "Atmosphere" then return class == "Atmosphere" end',
    '\t\t\tif want == "PostEffect" then return class ~= "Atmosphere" end',
    '\t\t\treturn false',
    '\t\tend,',
    '\t}',
    '\treturn i',
    'end',
    '',
    `local existing = { ${children.map((c) => `inst(${JSON.stringify(c.class)}, ${c.mood ? `{ AppleMood = ${JSON.stringify(c.mood)} }` : 'nil'})`).join(', ')} }`,
    'local lighting = { children = existing }',
    'function lighting:GetChildren()',
    '\tlocal out = {}',
    '\tfor _, c in ipairs(self.children) do if c.Parent ~= nil then table.insert(out, c) end end',
    '\treturn out',
    'end',
    'Instance = { new = function(class)',
    '\tlocal i = inst(class, {})',
    '\ti.Parent = nil',
    '\ttable.insert(made, i)',
    '\ttable.insert(lighting.children, i)',
    '\treturn i',
    'end }',
    'Color3 = { fromRGB = function(r, g, b) return { r, g, b } end }',
    'game = { GetService = function() return lighting end }',
    '',
    `local chunk = function()
${code}
end`,
    'local report = chunk()',
    '',
    '-- what is still parented to Lighting, by class, plus whether it is ours',
    'local survivors = {}',
    'for _, c in ipairs(lighting.children) do',
    '\tif c.Parent ~= nil then',
    '\t\ttable.insert(survivors, c.ClassName .. (c:GetAttribute("AppleMood") ~= nil and ":ours" or ":theirs"))',
    '\tend',
    'end',
    'table.sort(survivors)',
    'print("SURVIVORS " .. table.concat(survivors, " "))',
    'print("REPLACED " .. tostring(report.replaced))',
    'print("KEPT " .. table.concat(report.kept, ","))',
  ].join('\n');
  const file = join(LUAU_TMP, `${tag}.luau`);
  writeFileSync(file, src);
  try {
    return { ok: true, out: execFileSync('luau', [file], { encoding: 'utf8', stdio: 'pipe' }) };
  } catch (e) {
    return { ok: false, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

test('the mood harness runs and reports survivors', async () => {
  const r = runMood(await moodCode('night'), [], 'mood-sanity');
  assert.ok(r.ok, r.out);
  assert.match(r.out, /SURVIVORS /);
  assert.match(r.out, /:ours/, 'the mood must have parented its own effects');
  assert.doesNotMatch(r.out, /:theirs/, 'and there were none of the user\'s to keep');
});

test("A MOOD MUST NOT DELETE THE USER'S OWN LIGHTING EFFECTS", async () => {
  const r = runMood(await moodCode('golden'), [
    { class: 'ColorCorrectionEffect' },          // hand-tuned by the user
    { class: 'SunRaysEffect' },                  // likewise
    { class: 'BloomEffect', mood: 'night' },     // ours, from a previous set_mood
    { class: 'Atmosphere', mood: 'night' },      // ours
  ], 'mood-keeps-user');
  assert.ok(r.ok, r.out);

  const survivors = /SURVIVORS (.*)/.exec(r.out)[1].split(' ').filter(Boolean);
  assert.ok(survivors.includes('ColorCorrectionEffect:theirs'),
    `the user's ColorCorrectionEffect was destroyed — survivors: ${survivors.join(' ')}`);
  assert.ok(survivors.includes('SunRaysEffect:theirs'), "the user's SunRaysEffect was destroyed");

  // and ours from the previous mood ARE replaced, or moods would stack on themselves
  assert.match(r.out, /REPLACED 2/, 'both of the previous mood\'s instances should be replaced');
  const kept = /KEPT (.*)/.exec(r.out)[1];
  assert.match(kept, /ColorCorrectionEffect/);
  assert.match(kept, /SunRaysEffect/);
});

test('applying two moods in a row leaves one set of ours, not two', async () => {
  const r = runMood(await moodCode('night'), [
    { class: 'BloomEffect', mood: 'day' },
    { class: 'ColorCorrectionEffect', mood: 'day' },
    { class: 'Atmosphere', mood: 'day' },
  ], 'mood-replaces-own');
  assert.ok(r.ok, r.out);
  const survivors = /SURVIVORS (.*)/.exec(r.out)[1].split(' ').filter(Boolean);
  assert.equal(survivors.filter((x) => x.endsWith(':theirs')).length, 0, 'nothing of the user\'s here');
  assert.equal(survivors.filter((x) => x === 'Atmosphere:ours').length, 1,
    `exactly one Atmosphere should remain, got: ${survivors.join(' ')}`);
});

test('set_mood TELLS the model what it left in place', async () => {
  const { ctx } = stubCtx({ ok: true, data: { result: {
    mood: { t: 'string', v: 'golden' },
    replaced: { t: 'number', v: 2 },
    kept: { t: 'table', v: undefined } && [{ t: 'string', v: 'ColorCorrectionEffect' }, { t: 'string', v: 'SunRaysEffect' }],
  } } });
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'golden' });
  assert.equal(res.applied, 'golden');
  assert.deepEqual(res.keptUserEffects, ['ColorCorrectionEffect', 'SunRaysEffect']);
  assert.match(res.note, /still active/i, 'the model must be told they are still there');
  assert.match(res.note, /ask before deleting/i, 'and that removing them is the user\'s call');
});

test('a scene with nothing of the user\'s says nothing about it', async () => {
  // A note on every call is a note nobody reads.
  const { ctx } = stubCtx({ ok: true, data: { result: {
    mood: { t: 'string', v: 'night' }, replaced: { t: 'number', v: 0 }, kept: [],
  } } });
  const res = await T.TOOLS.set_mood.run(ctx, { mood: 'night' });
  assert.equal(res.note, undefined);
  assert.equal(res.keptUserEffects, undefined);
});

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
