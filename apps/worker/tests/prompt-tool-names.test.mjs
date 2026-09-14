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
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { systemPrompt } from '../src/prompts.ts';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'ptn-')), 't.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const T = await import(`file://${out}`);

const BASE = {
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
