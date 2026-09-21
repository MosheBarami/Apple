/**
 * THE SYSTEM PROMPT MAY NOT NAME A TOOL THE MODEL CANNOT CALL.
 *
 * This guard exists because the defect was real and had been shipped for a long time. prompts.ts
 * instructed the model to "verify with a read-back (get_instance, or run_luau returning the value)"
 * while `get_instance` was not a registered tool at all — it was a Studio op reachable only behind
 * an admin key. A model obeying its own system prompt asked for something that did not exist, got
 * an error, and fell back to spending a whole run_luau on a property read. Nothing failed loudly;
 * it just cost a turn, every time, invisibly.
 *
 * The prompt and the registry are two files with no import between them, and the prompt is prose,
 * so nothing was holding them together.
 *
 * THE DENOMINATOR IS THE BUILT PROMPT, NOT THE SOURCE FILE. That distinction is the whole design:
 * prompts.ts contains a CODE COMMENT mentioning `get_logs`, which is a plugin op and correctly not
 * a tool. Scanning the file would flag it; scanning what `systemPrompt()` actually returns does
 * not, because comments are not shipped. A guard whose denominator is wrong produces false alarms,
 * and a false alarm is how a guard gets deleted.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { STUDIO_PLUGIN_STORE_LIVE } from '@golem/shared';
import { systemPrompt } from '../src/prompts.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'ptn-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const BASE = {
  // An id is REQUIRED now: systemPrompt refuses a falsy one, because an empty fence id is not a
  // weaker secret but a SHARED one, and the untrusted-content rule rests entirely on the marker
  // being unguessable. rbxai-1d hardened that after I reported the assert.ok(X || true) beside it;
  // supplying an id here is the right response to the guard, not relaxing it.
  fenceId: 'f3c0d91a',
  mode: 'stone',
  studioConnected: true,
  placeName: 'Test Place',
  projectName: 'Test',
  memorySummary: null,
  memoryFacts: [],
};

/** Every shipped variant, so a tool named in a branch nobody exercises is still covered. */
function everyPrompt() {
  return [
    systemPrompt(BASE),
    systemPrompt({ ...BASE, studioConnected: false }),
    systemPrompt({ ...BASE, mode: 'clay' }),
    systemPrompt({ ...BASE, mode: 'rune' }),
    systemPrompt({ ...BASE, sceneKind: 'plaza' }),
    systemPrompt({ ...BASE, uiBrief: 'RULE ONE' }),
    systemPrompt({ ...BASE, memorySummary: 'a summary', memoryFacts: ['a fact'] }),
  ];
}

/** snake_case tokens in the built prompt — the shape a tool name takes. */
const toolishTokens = (text) =>
  [...new Set([...text.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)].map((m) => m[0]))];

test('the prompt was actually built, so nothing below passes vacuously', () => {
  const prompts = everyPrompt();
  assert.equal(prompts.length, 7);
  for (const p of prompts) assert.ok(p.length > 500, `a variant came back ${p.length} chars long`);
  assert.ok(toolishTokens(prompts[0]).length >= 5, 'and it names some tools');
});

test('EVERY TOOL THE PROMPT NAMES IS A REGISTERED TOOL', () => {
  const registered = new Set(T.toolNames());
  // Snake_case words that are not tools and legitimately appear as prose or as engine vocabulary.
  // Each is listed individually rather than pattern-matched, so adding one is a decision.
  const NOT_TOOLS = new Set([
    'run_code', // a Studio op the prompt may describe, never a tool the model calls
  ]);

  for (const prompt of everyPrompt()) {
    for (const token of toolishTokens(prompt)) {
      if (NOT_TOOLS.has(token)) continue;
      assert.ok(
        registered.has(token),
        `the system prompt names "${token}", which is not a registered tool. ` +
          `The model will be told to call it, and cannot. Registered: ${[...registered].sort().join(', ')}`,
      );
    }
  }
});

test('the guard reads the BUILT prompt, not the source — comments are not instructions', () => {
  // prompts.ts has a code comment mentioning `get_logs`, a plugin op that is correctly not a tool.
  // Scanning the file would flag it and the guard would be deleted for crying wolf.
  const source = execFileSync('cat', [join(WORKER, 'src', 'prompts.ts')], { encoding: 'utf8' });
  assert.match(source, /get_logs/, 'the source does mention it');
  for (const prompt of everyPrompt()) {
    assert.doesNotMatch(prompt, /get_logs/, 'and the shipped prompt does not');
  }
});

test('the tools the prompt leans on hardest are all present', () => {
  // A spot check with real names, so a regex that silently matched nothing could not pass this.
  const prompt = systemPrompt(BASE);
  for (const tool of ['get_instance', 'run_luau', 'check_composition', 'set_mood', 'audit_build']) {
    assert.match(prompt, new RegExp(`\\b${tool}\\b`), `the prompt should still name ${tool}`);
    assert.ok(T.toolNames().includes(tool), `${tool} must be registered`);
  }
});

test('an unpaired prompt SAYS the building tools are unavailable', () => {
  // I first wrote this as "an unpaired prompt must not name Studio-only tools", reasoning that
  // naming one is an instruction the model cannot follow. It fails — the unpaired prompt names
  // nine of them — and the premise was wrong, not the prompt.
  //
  // The build guidance is retained deliberately and the prompt is LONGER when unpaired, because it
  // adds an explicit notice that those tools are gone. Naming a tool while stating it is
  // unavailable is context; naming one while implying it is callable is the defect. The real
  // invariant is the notice, so that is what this asserts.
  const unpaired = systemPrompt({ ...BASE, studioConnected: false });
  const paired = systemPrompt({ ...BASE, studioConnected: true });

  assert.match(unpaired, /NOT connected/, 'it must say Studio is absent');
  assert.match(unpaired, /unavailable/i, 'and that the building tools are gone');
  assert.match(unpaired, /plan|discuss|search docs/i, 'and what the model can still do instead');
  assert.doesNotMatch(paired, /Studio is NOT connected/, 'and a paired session must not be told otherwise');
  assert.ok(unpaired.length > paired.length, 'the unpaired prompt ADDS the notice rather than trimming guidance');
});

test('AN UNPAIRED PROMPT DOES NOT SEND THE USER AFTER A PLUGIN THEY CANNOT GET', () => {
  // The prompt tells a disconnected user to open the Apple plugin in Studio. That instruction is
  // fine for someone who has it and dead for everyone else: public installation is closed
  // (STUDIO_PLUGIN_STORE_LIVE === false, a moderation removal, not a queue). Every human-written
  // surface says so — /docs/plugin, /status, the dashboard, the pairing dialog — and the prompt was
  // the one place it never reached, so the model had no first-party fact to answer "where do I get
  // it?" with and would answer from pretraining: Creator Store, Toolbox, Get Plugin. What the model
  // is told becomes what the customer is told, which is why this is a guard and not a comment.
  //
  // THE CONDITION IS THE CONSTANT, NOT TODAY'S VALUE. When the appeal succeeds and the flag flips,
  // the caveat must vanish with it rather than becoming the new stale sentence — so the branch is
  // asserted both ways round and the source is checked for the import that makes that possible.
  const unpaired = systemPrompt({ ...BASE, studioConnected: false });
  const source = readFileSync(join(WORKER, 'src', 'prompts.ts'), 'utf8');

  assert.match(source, /import \{ STUDIO_PLUGIN_STORE_LIVE \} from '@golem\/shared'/,
    'the availability fact must be imported, so it cannot drift from the UI that shows it');

  if (STUDIO_PLUGIN_STORE_LIVE) {
    assert.doesNotMatch(unpaired, /installation of the plugin is closed/i,
      'the store is live again and the prompt still says it is closed');
    return;
  }
  assert.match(unpaired, /installation of the plugin is closed/i,
    'the model is told to send users after a plugin, and never told they cannot obtain one');
  assert.match(unpaired, /Creator Store, Toolbox or "Get Plugin"/,
    'and the install paths it would otherwise invent from pretraining must be named and refused');
  assert.match(unpaired, /\/docs\/plugin/, 'and it must have somewhere honest to send them instead');
});

/**
 * THE LIBRARIES THE SPEC SAYS THE MODEL HOLDS IN ITS HEAD MUST BE NAMED WHERE IT ALWAYS LOOKS.
 *
 * docs/spec/DONE.md D1/D2/D3. The three libraries were reachable only through their own tool
 * definitions, and a tool definition is handed over only when the mode and the Studio state allow
 * it — so `install_module`'s catalogue, which lives entirely inside its description, reached the
 * model in one mode out of three and never with Studio disconnected. The base prompt is the one
 * surface that is identical in every mode and in both connection states, which is why the three
 * names belong here as well as in the toolset.
 *
 * `install_module` is named while it is Studio-gated ON PURPOSE, and the prompt says so in the same
 * breath. That is the rule the unpaired-prompt test above already settled: naming a tool while
 * stating when it is available is context; naming one while implying it is callable is the defect.
 */
test('the base prompt names all three knowledge libraries, in every mode and both Studio states', () => {
  const variants = [
    ['stone, paired', systemPrompt(BASE)],
    ['stone, unpaired', systemPrompt({ ...BASE, studioConnected: false })],
    ['clay, paired', systemPrompt({ ...BASE, mode: 'clay' })],
    ['clay, unpaired', systemPrompt({ ...BASE, mode: 'clay', studioConnected: false })],
    ['rune, unpaired', systemPrompt({ ...BASE, mode: 'rune', studioConnected: false })],
  ];
  const registered = new Set(T.toolNames());
  for (const tool of ['get_verified_module', 'get_ui_construction', 'install_module']) {
    assert.ok(registered.has(tool), `${tool} must be a registered tool before the prompt names it`);
    for (const [label, prompt] of variants) {
      assert.match(prompt, new RegExp(`\\b${tool}\\b`),
        `${label}: the prompt never names ${tool}, so the model meets that library only if the `
        + 'toolset happens to carry it this run.');
    }
  }
  // And the instruction that makes the naming worth its tokens — D1 is "installs what was proven
  // INSTEAD OF REWRITING IT", which is a behaviour, not a lookup.
  assert.match(systemPrompt(BASE), /install what they return rather than retyping it/,
    'naming the library without telling the model to use what it returns is half the clause');
  assert.match(systemPrompt({ ...BASE, studioConnected: false }), /Needs Studio/,
    'install_module is Studio-gated and an unpaired prompt must say so where it names it');
});

//[[ A RULE IN A CONSTANT THAT NO COMPOSED PROMPT CARRIES IS PRESENT AND NEVER REACHED.
//
//   2026-09-21: four rules were added to IDENTITY because the Roblox frontier benchmark measured
//   them moving two items from failing in five straight samples to passing in three
//   (docs/frontier-for-roblox.md §8). A measured gain that lands in a string the composer drops on
//   some branch is worth nothing on that branch, and nothing here would have said so: the file's
//   existing guard asserts only that each variant is over 500 characters.
//
//   This lives in this file rather than its own because `everyPrompt()` is here, and a second copy
//   of that list is a second thing to keep in step with the composer.
test('EVERY COMPOSED VARIANT CARRIES THE FOUR MEASURED ROBLOX RULES', () => {
  const prompts = everyPrompt();
  assert.ok(prompts.length >= 7, 'the variant list shrank; a branch may now be untested');
  const rules = [
    ['text filtering', 'TextService:FilterStringAsync'],
    ['bounded DataStore retry', 'pcall is the floor, not the plan'],
    ['UpdateAsync for contended values', 'reads the CURRENT value'],
    ['a failed load is not an empty account', 'A failed load is not an empty account'],
  ];
  for (const [what, needle] of rules) {
    for (const [i, p] of prompts.entries()) {
      assert.ok(
        p.includes(needle),
        `variant ${i} does not carry the ${what} rule. It was measured into IDENTITY and this `
        + 'branch drops it, so on this branch the gain does not exist.',
      );
    }
  }
  // The control that keeps the four assertions above from passing vacuously on a needle that is
  // simply everywhere: a string of the same shape that was never shipped must be in NO variant.
  for (const p of prompts) {
    assert.ok(!p.includes('A failed load is not an empty profile'), 'the control string leaked into a prompt');
  }
});
