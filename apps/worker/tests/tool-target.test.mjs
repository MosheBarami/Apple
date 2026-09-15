/**
 * WHICH THING IS IT DOING THAT TO?
 *
 * `tool_start` carried `summary: call.name` — the bare word "edit_script", never the script's path;
 * "delete_instances", never what is about to be deleted. The descriptive sentence only arrived at
 * `tool_end`, AFTER the write had happened. So for the whole time a step was running, the one
 * question a person actually has about it — which of my things — had no answer anywhere on screen,
 * and by the time it did the thing was already changed.
 *
 * What is asserted here:
 *
 *   1. The target is read from the ARGUMENTS of the call about to run, so it is available before
 *      the tool executes rather than after.
 *   2. Arguments are model-authored JSON. A malformed body, a missing field, a wrong type and a
 *      hostile 40KB string all have to produce "no target" or a short one — never a throw, because
 *      this runs inside the step loop and a throw there kills a paid run.
 *   3. A tool with nothing to name gets nothing, rather than a plausible-looking guess. An
 *      approval prompt that says the wrong resource is worse than one that says none.
 *
 * Run with:  node --test tests/tool-target.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(WORKER, '../..');
const DIR = mkdtempSync(join(tmpdir(), 'tooltarget-'));
const out = join(DIR, 'tools.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const T = await import(`file://${out}`);
const { targetOf } = T;

const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
const SHARED = readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8');

/* -------------------------------------------------------- 1. it names the thing --- */

test('a script tool names the script', () => {
  const path = 'game.ServerScriptService.RoundManager';
  for (const tool of ['edit_script', 'read_script', 'format_script']) {
    assert.equal(targetOf(tool, JSON.stringify({ path })), path, tool);
  }
});

test('an instance tool names the instances, joined and capped', () => {
  assert.equal(targetOf('set_properties', JSON.stringify({ path: 'game.Workspace.Door' })), 'game.Workspace.Door');
  assert.equal(
    targetOf('delete_instances', JSON.stringify({ paths: ['game.Workspace.A', 'game.Workspace.B'] })),
    'game.Workspace.A, game.Workspace.B',
  );
  // Sixty paths is one line of noise. The count is the honest summary of the rest.
  const many = Array.from({ length: 12 }, (_, i) => `game.Workspace.Part${i}`);
  const t = targetOf('delete_instances', JSON.stringify({ paths: many }));
  assert.match(t, /game\.Workspace\.Part0/);
  assert.match(t, /\+\d+ more$/, `did not say how many were left out: ${t}`);
});

test('create_instances names what it is about to create', () => {
  const t = targetOf('create_instances', JSON.stringify({ items: [{ className: 'Part', name: 'Door', parent: 'game.Workspace' }] }));
  assert.match(t, /Door/);
});

test('the web tools name the URL and the asset tools the asset', () => {
  assert.equal(targetOf('web_fetch', JSON.stringify({ url: 'https://create.roblox.com/docs' })), 'https://create.roblox.com/docs');
  assert.equal(targetOf('browse_page', JSON.stringify({ url: 'https://example.com/a' })), 'https://example.com/a');
  assert.equal(targetOf('insert_asset', JSON.stringify({ assetId: 12345 })), '12345');
});

/* ------------------------------------------------- 2. the arguments are untrusted --- */

test('MALFORMED ARGUMENTS PRODUCE NO TARGET, NEVER A THROW', () => {
  // This runs inside the step loop, before the tool. A throw here ends a paid run at the point it
  // was about to do the work.
  for (const junk of ['', 'null', '{', '[]', '"a string"', '42', undefined, null, '{"path":42}', '{"paths":"not a list"}', '{"paths":[1,2]}']) {
    assert.doesNotThrow(() => targetOf('edit_script', junk), `edit_script ${String(junk)}`);
    assert.doesNotThrow(() => targetOf('delete_instances', junk), `delete_instances ${String(junk)}`);
    const t = targetOf('edit_script', junk);
    assert.ok(t === undefined || typeof t === 'string', String(junk));
  }
  assert.equal(targetOf('edit_script', '{"path":42}'), undefined, 'a number is not a path');
});

test('a hostile argument cannot take over the line', () => {
  // The target is rendered beside the activity label. A 40KB path, or one carrying newlines,
  // would push the interface around; a model can be talked into producing either.
  const long = 'game.Workspace.' + 'A'.repeat(40_000);
  const t = targetOf('edit_script', JSON.stringify({ path: long }));
  assert.ok(t.length <= 120, `target is ${t.length} characters`);
  const multi = targetOf('edit_script', JSON.stringify({ path: 'game.Workspace\n\nEvil' }));
  assert.doesNotMatch(multi, /\n/, 'a newline survived into the one-line target');
});

/* ------------------------------------------- 3. silence rather than a wrong answer --- */

test('a tool with no resource gets NO target rather than a guess', () => {
  for (const tool of ['get_project_tree', 'get_output_logs', 'propose_plan', 'viewport_info']) {
    assert.equal(targetOf(tool, '{}'), undefined, tool);
  }
  assert.equal(targetOf('not_a_tool_at_all', JSON.stringify({ path: 'x' })), undefined);
});

test('an empty string is not a target', () => {
  assert.equal(targetOf('edit_script', JSON.stringify({ path: '   ' })), undefined);
  assert.equal(targetOf('delete_instances', JSON.stringify({ paths: [] })), undefined);
});

/* ---------------------------------------------------------------- it is wired in --- */

test('the wire carries it and the run loop sends it', () => {
  assert.match(SHARED, /type: 'tool_start';[^}]*target\?: string/, "tool_start on the wire has no target field");
  assert.match(SESSION, /targetOf\(call\.name, call\.arguments\)/, 'the run loop never computes a target');
});
