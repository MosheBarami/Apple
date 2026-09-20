// The resource line: which of my things is this step about, while it is happening.
//
// The worker now reads a target out of the call's arguments and sends it with `tool_start`. This
// file is about what the browser does with it, and the claim that matters is a timing one: the
// target has to be visible WHILE the step is running. Its whole reason to exist is that the
// descriptive summary only arrives with `tool_end`, after the write — "Editing project" for eleven
// seconds, and then, too late, the name of the script it edited.
//
// Two ways to get this wrong, both covered:
//
//   1. Carrying the field and never rendering it. The reducer is where the step's `detail` line is
//      decided, so the assertion is on the reduced step, not on the event.
//   2. Letting it outlive its usefulness. Once the tool has ended, the worker's own summary is a
//      better sentence than a bare path, and a target that overrode it would make finished steps
//      LESS informative than they are today.
//
// WHAT CHANGED ON 2026-09-20, and why these assertions moved from `detail` to `target`. The two
// were one field: `detail = summary ?? target`. That made them compete, and the summary won —
// including when the summary was `<tick> get_genre_references`, which is what the worker sends for
// every tool whose argument is not one of the five keys `summarize()` knows. So the panel printed
// a tool name it had already printed as the row's label and dropped the genre. They are now two
// fields answering two questions — on what, and what came back — and `activity.tsx` prints the
// subject only when the worker's sentence does not already contain it. Every claim below is the
// same claim; it is read off the field that now holds the answer.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eventsFromTurn, reduceActivity } from '../src/components/ws/activity-model.ts';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const SOCKET = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');

const T0 = 1_700_000_000_000;
const run = (events, now) => reduceActivity({ events, now, streaming: true });
const stepFor = (activity, toolId) =>
  activity.phases.flatMap((p) => p.steps).find((s) => s.toolId === toolId);

test('A RUNNING STEP NAMES ITS RESOURCE — that is the whole point', () => {
  const a = run(
    [{ type: 'tool_start', at: T0, toolId: 't1', tool: 'edit_script', summary: 'edit_script', target: 'game.ServerScriptService.RoundManager' }],
    T0 + 4000,
  );
  const step = stepFor(a, 't1');
  assert.ok(step, 'no step for the running tool');
  assert.equal(step.state, 'active');
  assert.equal(step.target, 'game.ServerScriptService.RoundManager');
  // And the bare tool name did not take the result line hostage on the way past.
  assert.equal(step.detail, undefined);
});

test('and the bare tool name is still suppressed, as it always was', () => {
  // `summary` on tool_start is the tool's own name. Rendering it would read as "edit_script"
  // underneath a label that already says "Editing project".
  const a = run([{ type: 'tool_start', at: T0, toolId: 't1', tool: 'edit_script', summary: 'edit_script' }], T0 + 1000);
  assert.equal(stepFor(a, 't1').detail, undefined);
  assert.equal(stepFor(a, 't1').target, undefined);
});

test('once it ends, the worker’s sentence wins over the bare path', () => {
  const a = run(
    [
      { type: 'tool_start', at: T0, toolId: 't1', tool: 'edit_script', summary: 'edit_script', target: 'game.ServerScriptService.RoundManager' },
      { type: 'tool_end', at: T0 + 900, toolId: 't1', ok: true, summary: 'RoundManager · +14 / -3' },
    ],
    T0 + 2000,
  );
  assert.equal(stepFor(a, 't1').detail, 'RoundManager · +14 / -3');
  // It wins the RESULT line. It does not delete the subject, which is a different fact and is now
  // kept beside it rather than underneath it.
  assert.equal(stepFor(a, 't1').target, 'game.ServerScriptService.RoundManager');
});

test('a step that ends with nothing to say still names its resource', () => {
  // Better the resource than an empty line, and this is the shape an interrupted or refused tool
  // leaves behind. `summary: 'delete_instances'` says nothing the row's label does not, so there
  // is no result line — and the subject is untouched by that.
  const a = run(
    [
      { type: 'tool_start', at: T0, toolId: 't1', tool: 'delete_instances', summary: 'delete_instances', target: 'game.Workspace.Door' },
      { type: 'tool_end', at: T0 + 100, toolId: 't1', ok: false, summary: 'delete_instances' },
    ],
    T0 + 500,
  );
  assert.equal(stepFor(a, 't1').target, 'game.Workspace.Door');
  assert.equal(stepFor(a, 't1').detail, undefined);
});

test('no target is no line, not an empty one', () => {
  for (const target of [undefined, '', '   ']) {
    const a = run([{ type: 'tool_start', at: T0, toolId: 't1', tool: 'get_project_tree', summary: 'get_project_tree', target }], T0 + 10);
    assert.equal(stepFor(a, 't1').detail, undefined, JSON.stringify(target));
    assert.equal(stepFor(a, 't1').target, undefined, JSON.stringify(target));
  }
});

test('a reloaded turn carries it through the same reducer the socket feeds', () => {
  // One state machine, two adapters. A target that reached only the live path would vanish on the
  // reconnect that happens every time a laptop lid closes mid-build.
  const a = reduceActivity({
    events: eventsFromTurn({
      tools: [{ toolId: 't1', tool: 'edit_script', summary: 'edit_script', target: 'game.Workspace.Door', startedAt: T0, done: false }],
    }),
    now: T0 + 3000,
    streaming: true,
  });
  assert.equal(stepFor(a, 't1').target, 'game.Workspace.Door');
});

test('the socket keeps the field off the wire message', () => {
  // The field can be perfect in the reducer and still never arrive: the socket handler builds the
  // ToolEvent by hand, and a field it does not copy is a field the reducer never sees.
  const start = SOCKET.slice(SOCKET.indexOf("case 'tool_start':"), SOCKET.indexOf("case 'tool_end':"));
  assert.ok(start.length > 0, "no tool_start case in the socket handler");
  assert.match(start, /target: msg\.target/, 'the socket drops the target on the floor');
});
