/**
 * A TOOL CALL WRITTEN AS TEXT MUST NOT BE PRINTED AT THE USER.
 *
 * THE RUN THIS COMES FROM, in the owner's own account on 2026-09-16. He asked for a clicker
 * simulator loop. What arrived in the chat window was eighty lines of `propose_plan` arguments —
 * `{"title":"Clicker Simulator Loop","steps":[{"title":"Create Click Pad geometry",…}]}` — and
 * then "That used the last of your Credits for today." The model had written the call instead of
 * making it. Nothing noticed, so the loop treated it as a reply: printed the JSON, built nothing,
 * and spent his whole daily allowance.
 *
 * THE SECURITY BOUNDARY IS THE ALLOWLIST, and the first test here is the one that guards it.
 * gateway.ts deliberately has no fence-parsing fallback, because tool RESULTS carry untrusted
 * content — a script someone else wrote, a fetched page, a Creator Store description — and a
 * parser that turns any JSON in the stream into a call turns that content into commands. That
 * refusal is right and stands. Recovery is therefore confined to tools that cannot change anything
 * and cannot spend, which today is `propose_plan` alone: its own definition reads "Costs nothing:
 * no model calls, no images, no change to the project."
 *
 * Adding a name to RECOVERABLE is adding a route from text to action. `every recoverable tool is
 * inert` reads the actual registry, so a mutating tool cannot be added to that set without this
 * file going red.
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

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'trec-')), 't.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tool-recovery.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' },
);
const { recoverToolCall, RECOVERABLE } = await import(`file://${out}`);

/** The run's real toolset, as a Studio-connected build would have. */
const OFFERED = new Set(['propose_plan', 'create_instances', 'run_luau', 'edit_script', 'search_docs']);

/** The exact payload that reached the owner's screen, trimmed to three steps. */
const REAL = JSON.stringify(
  {
    title: 'Clicker Simulator Loop',
    steps: [
      { title: 'Create Click Pad geometry', detail: 'Add a wooden pad part in Workspace for players to touch', tool: 'create_instances' },
      { title: 'Add leaderstats script', detail: 'ServerScriptService script to create Coins and ClickPower', tool: 'create_instances' },
      { title: 'Audit the build', detail: 'Run audit_build to verify geometry, materials, anchoring', tool: 'audit_build' },
    ],
  },
  null,
  1,
);

test('THE BOUNDARY — every recoverable tool is inert in the real registry', () => {
  const src = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  assert.ok(RECOVERABLE.size >= 1, 'an empty allowlist would make every other test here vacuous');
  for (const name of RECOVERABLE) {
    // The registry entry, from its key to the next top-level key.
    const at = src.indexOf(`\n  ${name}: {`);
    assert.notEqual(at, -1, `${name} is not a tool in the registry — it cannot be recovered into a call`);
    const body = src.slice(at, src.indexOf('\n  },\n', at));
    // An inert tool says so in its own description, which is what the model is told and what the
    // user is promised. A tool that mutates has no such sentence.
    assert.match(
      body,
      /Costs nothing: no model calls, no images, no change to the project/,
      `${name} is on the recovery allowlist but its own definition does not promise it changes nothing. `
        + 'Text may only become an action for tools that cannot act.',
    );
  }
});

test('the payload that reached the owner is recovered, and never shown', () => {
  const r = recoverToolCall(REAL, OFFERED);
  assert.equal(r.refused, null);
  assert.ok(r.call, 'the plan payload must become a call');
  assert.equal(r.call.name, 'propose_plan');
  assert.equal(r.text, '', 'the JSON must not survive as anything the user reads');
  const args = JSON.parse(r.call.arguments);
  assert.equal(args.title, 'Clicker Simulator Loop');
  assert.equal(args.steps.length, 3, 'every step must survive — a truncated plan is a wrong plan');
});

test('a fenced payload is recovered too — the fence is how most models emit it', () => {
  for (const fence of ['```json\n', '```\n', '```tool_call\n']) {
    const r = recoverToolCall(`${fence}${REAL}\n\`\`\``, OFFERED);
    assert.ok(r.call, `a ${fence.trim() || 'bare'} fence must not defeat recovery`);
    assert.equal(r.call.name, 'propose_plan');
  }
});

test('the three wrapper spellings models produce are read', () => {
  const inner = JSON.parse(REAL);
  for (const [nameKey, argsKey] of [['name', 'arguments'], ['tool', 'parameters'], ['tool_name', 'args']]) {
    const r = recoverToolCall(JSON.stringify({ [nameKey]: 'propose_plan', [argsKey]: inner }), OFFERED);
    assert.ok(r.call, `${nameKey}/${argsKey} must be recognised`);
    assert.equal(JSON.parse(r.call.arguments).steps.length, 3);
  }
  // Double-encoded arguments, which several providers produce.
  const r = recoverToolCall(JSON.stringify({ name: 'propose_plan', arguments: REAL }), OFFERED);
  assert.ok(r.call, 'arguments as a JSON string must be read');
});

test('A MUTATING TOOL IS NEVER RECOVERED — it is suppressed and named', () => {
  for (const name of ['create_instances', 'run_luau', 'edit_script']) {
    const r = recoverToolCall(JSON.stringify({ name, arguments: { path: 'game.Workspace', source: 'print(1)' } }), OFFERED);
    assert.equal(r.call, null, `${name} must never become a call from text`);
    assert.equal(r.refused, name, 'the caller has to be able to tell this from the model saying nothing');
    assert.equal(r.text, '', 'and the payload is still not printed at the user');
  }
});

test('a tool outside the run own toolset is refused even if it is inert', () => {
  // Plan mode does not offer propose_plan's siblings; text may not widen what router.ts decided.
  const r = recoverToolCall(REAL, new Set(['search_docs']));
  assert.equal(r.call, null, 'the run toolset is a permission decision and text may not widen it');
  assert.equal(r.refused, 'propose_plan');
});

// THE BOUNDARY IS THE WHOLE-BODY PARSE, and this is the case that proves it. The third reply below
// quotes a tool RESULT back — content this product did not write. Under a first-object extraction
// instead of a whole-body parse, that line becomes an executed call, which is the injection hole
// gateway.ts refuses to open. Falsified exactly that way: replacing `JSON.parse(body)` with a
// `/\{[\s\S]*\}/` extraction turns this test red and nothing else.
test('ORDINARY REPLIES ARE LEFT ALONE — including ones that contain JSON', () => {
  const replies = [
    'Done — the portal is in Lobby/Portal and moves players to Arena/Spawn.',
    'Here is the config you asked about:\n\n```json\n{"steps":[{"title":"a","tool":"b"}]}\n```\n\nThat is what the file holds.',
    'The tool returned {"steps": [{"title": "x", "tool": "y"}]} which means it found one step.',
    '',
    '   ',
    '{ not json at all',
    '[{"title":"a","tool":"b"}]',
  ];
  for (const text of replies) {
    const r = recoverToolCall(text, OFFERED);
    assert.equal(r.call, null, `must not lift a call out of: ${text.slice(0, 40)}`);
    assert.equal(r.refused, null);
    assert.equal(r.text, text, 'an ordinary reply must survive byte for byte');
  }
});

test('a plan-shaped object with a malformed step is not a plan', () => {
  const bad = [
    { title: 'x', steps: [] },
    { title: 'x', steps: [{ title: 'a' }] },
    { title: 'x', steps: [{ tool: 'a' }] },
    { title: 'x', steps: ['a'] },
    { title: 'x', steps: 'a' },
  ];
  for (const o of bad) {
    const r = recoverToolCall(JSON.stringify(o), OFFERED);
    assert.equal(r.call, null, `must not recover from ${JSON.stringify(o).slice(0, 50)}`);
  }
});
