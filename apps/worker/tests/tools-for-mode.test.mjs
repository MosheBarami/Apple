/**
 * Plan mode's promise, which is enforced in one function and was tested by nothing.
 *
 * The user picks Plan or Agent. Plan's promise is that it looks and thinks and does NOT touch
 * their project: they can point it at work in progress, ask "what would you do here",
 * and get an answer without risking an instance. It is the only mode that offers that,
 * and it is the reason Plan is safe to run on something you care about.
 *
 * router.ts says it plainly: "the system prompt asks the model to behave like a
 * planner, but a prompt is a request; the toolset is what makes it true." So the
 * toolset IS the guarantee — and the guarantee had no test. A tool added to Plan's
 * list turns a mode that CANNOT damage a project into one that promises not to, and
 * nothing anywhere would go red.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(mkdtempSync(join(tmpdir(), 'router-')), 'router.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'router.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { stdio: 'pipe' });
const { toolsForMode } = await import(out);

/** The real tool names, read from tools.ts rather than retyped here — a hand-copied
 *  list would drift and this test would then be asserting about a fiction. */
const ALL = (() => {
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const start = src.indexOf('export const TOOLS');
  const names = [...src.slice(start).matchAll(/^ {2}([a-z_][a-z0-9_]*): \{$/gm)].map((m) => m[1]);
  assert.ok(names.length > 15, `expected the real tool table, found ${names.length}`);
  return names;
})();

/** Every tool in the WORKER's table that can change a user's project.
 *
 *  These are worker tool names, which are not the same as the plugin's StudioOp names.
 *  Listing a name that does not exist would make the assertions below pass by
 *  checking for nothing, which is why the first test asserts every one of these is
 *  really in the table. */
const MUTATING = [
  'edit_script', 'format_script', 'install_module', 'create_instances', 'set_properties',
  'edit_terrain', 'delete_instances', 'move_instances', 'transform_instances', 'clone_instances',
  'group_instances', 'ungroup_instances', 'rename_instance', 'set_locked', 'set_visible',
  'run_luau', 'insert_asset', 'generate_model', 'set_mood', 'add_effect', 'remove_effect',
  'design_sound', 'assign_sounds',
  // Phase A writers (D-VISION-1).
  'set_properties_bulk', 'scatter_instances', 'collision_groups', 'shape_terrain', 'create_rig',
  'build_ui',
];

test('every tool this file calls mutating is really in the table', () => {
  // Guards the guard. A rename would otherwise turn every assertion below into a check
  // that a nonexistent tool is absent — trivially true, and silent.
  const missing = MUTATING.filter((n) => !ALL.includes(n));
  assert.deepEqual(missing, [],
    `${missing.join(', ')} is not in TOOLS. If it was renamed, rename it here too — `
    + 'otherwise this file guards nothing.');
});

test('PLAN can reach nothing that changes a project', () => {
  const allowed = toolsForMode('plan', true, ALL);
  const leaked = [...allowed].filter((n) => MUTATING.includes(n));
  assert.deepEqual(leaked, [],
    `Plan mode can reach ${leaked.join(', ')}. Plan's promise to the user is that it `
    + 'cannot touch their project; this is the line that makes that true.');
});

test('PLAN can still do the thing it exists to do', () => {
  // A read-only mode that cannot read is not safe, it is useless — and a caller who
  // finds Plan unhelpful reaches for Agent on a project they were being careful with.
  const allowed = toolsForMode('plan', true, ALL);
  for (const needed of [
    'get_project_tree', 'list_scripts', 'read_script', 'search_scripts',
    'search_creation_skills', 'read_creation_skill',
  ]) {
    assert.ok(allowed.has(needed), `Plan cannot ${needed}, so it cannot inspect anything`);
  }
});

test('`remember` is the one write Plan is allowed, and it writes to Golem not the place', () => {
  const allowed = toolsForMode('plan', true, ALL);
  assert.ok(allowed.has('remember'),
    'Plan cannot record what it learned, so planning twice costs twice');
  assert.ok(!MUTATING.includes('remember'), 'remember must never become a project write');
});

test('Agent gets the full connected toolset', () => {
  const allowed = toolsForMode('agent', true, ALL);
  assert.equal(allowed.size, ALL.length, 'Agent is missing tools');
  for (const n of MUTATING) {
    assert.ok(allowed.has(n), `Agent cannot ${n}`);
  }
});

test('without Studio, builders retain image generation but Plan stays read-only', () => {
  // Image generation is worker-side and stores a project-scoped preview; it never edits the
  // Roblox place. It must remain discoverable for Agent while Studio is offline.
  // Explicit capability tripwire: get_genre_references was reviewed as static, bounded retrieval
  // with no project access, network request or mutation (genre-reference-tools.test.mjs).
  // `get_verified_module` and `get_ui_construction` are here for the reason `get_genre_references`
  // is: studio:false, answered from a table compiled into this bundle, no project access, no
  // network call, no inference. `find_ui_asset` likewise: a lookup in the compiled library index
  // that returns names and licences only (asset-library-tools.test.mjs).
  const KNOWLEDGE = ['get_verified_module', 'get_ui_construction', 'find_ui_asset'];
  const expected = {
    plan: ['get_genre_references', 'read_creation_skill', 'remember', 'search_creation_skills', 'search_docs', ...KNOWLEDGE],
    // generate_ui_image_hf: reviewed 2026-09-23 as generate_image's fallback — studio:false,
    // writes only to project-scoped image storage, refuses without HF_TOKEN or a project before
    // any call, and is capped per day in hf.ts (hf-tools-wiring.test.mjs).
    agent: ['generate_image', 'generate_ui_image_hf', 'get_genre_references', 'read_creation_skill', 'remember', 'search_creation_skills', 'search_docs', ...KNOWLEDGE],
  };
  for (const [mode, names] of Object.entries(expected)) {
    const allowed = toolsForMode(mode, false, ALL);
    assert.deepEqual([...allowed].sort(), [...names].sort(),
      `${mode} has the wrong offline toolset`);
  }
});

test('offline image generation is not a Studio mutation or a model-generation escape hatch', () => {
  assert.ok(ALL.includes('generate_image'), 'generate_image must remain registered');
  assert.ok(ALL.includes('generate_model'), 'generate_model must remain registered');
  for (const mode of ['agent']) {
    const allowed = toolsForMode(mode, false, ALL);
    assert.equal(allowed.has('generate_image'), true, `${mode} cannot generate an image offline`);
    assert.equal(allowed.has('generate_model'), false, `${mode} can invoke Studio model generation offline`);
    for (const m of MUTATING) assert.equal(allowed.has(m), false, `${mode} leaked ${m} while offline`);
  }
  for (const mode of ['plan', 'memory', undefined]) {
    assert.equal(toolsForMode(mode, false, ALL).has('generate_image'), false,
      `${String(mode)} must not gain image generation outside a real builder mode`);
  }
});

test('generate_image refuses a missing project before the paid model call', () => {
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const start = src.indexOf('  generate_image: {');
  const end = src.indexOf('  search_docs: {', start);
  assert.ok(start >= 0 && end > start, 'could not isolate generate_image in the tool table');
  const body = src.slice(start, end);
  const guard = body.indexOf('if (!ctx.projectId)');
  const inference = body.indexOf('const res = await generateImage(ctx.env, req)');
  assert.ok(guard >= 0, 'generate_image must refuse without a project');
  assert.ok(inference >= 0, 'generate_image must call the image service through generateImage');
  assert.ok(guard < inference, 'missing project must be rejected before paid image inference');
});

test('generate_model stays Studio-backed and reports an unavailable GenerationService honestly', () => {
  const toolSrc = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const pluginSrc = readFileSync(join(WORKER, '..', 'plugin', 'src', 'Generation.luau'), 'utf8');
  const opsSrc = readFileSync(join(WORKER, '..', 'plugin', 'src', 'Ops.luau'), 'utf8');
  const start = toolSrc.indexOf('  generate_model: {');
  const end = toolSrc.indexOf('  inspect_model: {', start);
  assert.ok(start >= 0 && end > start, 'could not isolate generate_model in the tool table');
  const tool = toolSrc.slice(start, end);
  assert.match(tool, /studio: true/, 'generate_model must not be offered as a worker-only tool');
  assert.match(opsSrc, /handlers\.generate_model\s*=\s*function\(op\)/);
  assert.match(opsSrc, /Generation\.generateAndInspect/);
  assert.match(pluginSrc, /GetService\("GenerationService"\)/);
  assert.match(pluginSrc, /GenerationService is unavailable in this Studio build/,
    'a missing beta service must be surfaced as an explicit refusal');
});

test('disconnected Agent cannot mutate Studio', () => {
  const allowed = toolsForMode('agent', false, ALL);
  const leaked = [...allowed].filter((n) => MUTATING.includes(n));
  assert.deepEqual(leaked, [], `Agent can reach ${leaked.join(', ')} with no Studio`);
});

test('the returned set never invents a tool that is not in the table', () => {
  // Every mode filters ALL rather than listing names, so a typo in a mode's list drops
  // a tool rather than conjuring one. This asserts that property directly.
  for (const mode of ['plan', 'agent']) {
    for (const connected of [true, false]) {
      for (const n of toolsForMode(mode, connected, ALL)) {
        assert.ok(ALL.includes(n), `${mode} offered ${n}, which is not a real tool`);
      }
    }
  }
});

test('an empty tool table yields empty sets rather than throwing', () => {
  for (const mode of ['plan', 'agent']) {
    assert.equal(toolsForMode(mode, true, []).size, 0);
    assert.equal(toolsForMode(mode, false, []).size, 0);
  }
});

/* --------------------------------------------- a mode nobody defined --------- */

/**
 * AN UNRECOGNISED MODE MUST NOT RECEIVE MORE THAN PLAN DOES.
 *
 * `toolsForMode` branched `if (mode === 'plan')` and fell through to `new Set(allNames)` for
 * everything else — so a mode nobody defined got the FULL write toolset, including edit_script,
 * delete_instances and run_luau. The same shape as the step-ceiling defect in session.ts: a
 * `Record<ProductMode, T>` world where the union is a compile-time promise and the runtime hands an
 * unknown key the most permissive answer it has.
 *
 * session.ts now validates `mode` at all three ingresses, so in the assembled product nothing
 * unrecognised should reach here. This is the second line, and a second line that fails open is
 * not one. The file's own comment is the standard being held to: "the toolset is the guarantee,
 * not a performance tweak."
 */
const UNDEFINED_MODES = ['memory', 'vision', 'nonsense', '__proto__', 'constructor', '', null, undefined, 7];

for (const mode of UNDEFINED_MODES) {
  test(`mode ${JSON.stringify(mode)} gets no tool that can change a project`, () => {
    const got = toolsForMode(mode, true, ALL);
    for (const m of MUTATING) {
      assert.equal(got.has(m), false,
        `an unrecognised mode was handed "${m}", which can change the user's project`);
    }
  });
}

test('an unrecognised mode gets no more than Plan does', () => {
  const plan = toolsForMode('plan', true, ALL);
  for (const mode of UNDEFINED_MODES) {
    const got = toolsForMode(mode, true, ALL);
    for (const name of got) {
      assert.equal(plan.has(name), true,
        `mode ${JSON.stringify(mode)} was handed "${name}", which Plan itself does not get`);
    }
  }
});

test('CONTROL: the real modes are unaffected by the unknown-mode rule', () => {
  // A function that returned the read-only set for EVERYTHING would pass every case above while
  // breaking the product. Agent must still get the full toolset, and Plan must still get
  // the inspection tools it needs to be useful.
  const agent = toolsForMode('agent', true, ALL);
  assert.equal(agent.size, ALL.length, 'Agent must still get every tool');
  for (const m of MUTATING) assert.equal(agent.has(m), true, `Agent must still get "${m}"`);
  const plan = toolsForMode('plan', true, ALL);
  assert.equal(plan.has('read_script'), true, 'Plan must still be able to read');
  assert.equal(plan.has('get_project_tree'), true, 'Plan must still be able to look');
});

/* ------------------------------------------- the knowledge libraries ---------- */

/**
 * THE LIBRARIES THE SPEC SAYS THE MODEL HOLDS IN ITS HEAD MUST BE REACHABLE FROM WHERE IT THINKS.
 *
 * docs/spec/DONE.md D1 and D2: Luau modules that were RUN against their own checks, and
 * construction files with measured stroke weights, radii and tiles per row. Both are served by
 * `studio: false` tools that read a table compiled into the worker — no project access, no
 * outbound request, no inference, no credit. They were nonetheless in neither PLAN_TOOLS nor
 * OFFLINE_TOOLS, so Plan mode was never offered them at all and NO mode was offered them while
 * Studio was disconnected. An audit of the deployed product could not watch the model call either
 * one for exactly that reason.
 *
 * This is the guard for the fix. It fails if either name leaves either list.
 */
const KNOWLEDGE_TOOLS = ['get_verified_module', 'get_ui_construction'];

test('the knowledge libraries are really registered tools', () => {
  // Guards the guard: a rename would otherwise turn every assertion below into a check that a
  // nonexistent name is absent from a set, which passes by doing nothing.
  const missing = KNOWLEDGE_TOOLS.filter((n) => !ALL.includes(n));
  assert.deepEqual(missing, [], `${missing.join(', ')} is not in TOOLS`);
});

test('PLAN can reach the proven modules and the construction library', () => {
  const allowed = toolsForMode('plan', true, ALL);
  for (const n of KNOWLEDGE_TOOLS) {
    assert.ok(allowed.has(n),
      `Plan cannot call ${n}, so "what would you do here" is answered from pretraining `
      + 'while the measured answer sits in this bundle unread.');
  }
});

test('EVERY mode keeps the knowledge libraries while Studio is disconnected', () => {
  for (const mode of ['plan', 'agent']) {
    const allowed = toolsForMode(mode, false, ALL);
    for (const n of KNOWLEDGE_TOOLS) {
      assert.ok(allowed.has(n),
        `${mode} loses ${n} when Studio drops, though the tool never needed Studio`);
    }
  }
});

test('and they are not a way to change a project', () => {
  // The reason they may be added to a read-only mode at all. If one of these ever gains a write,
  // this is the line that stops it riding into Plan mode on a list it was added to as a lookup.
  for (const n of KNOWLEDGE_TOOLS) {
    assert.equal(MUTATING.includes(n), false, `${n} became a mutating tool`);
  }
  const plan = toolsForMode('plan', true, ALL);
  assert.deepEqual([...plan].filter((n) => MUTATING.includes(n)), []);
});
