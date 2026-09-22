//[[ ON WHAT, AND WHAT CAME BACK — two questions, and one of them was being deleted by the other.
//
// B5 of docs/spec/DONE.md: "The thinking panel says which tool ran, on what, how long, what came
// back." An audit of the deployed product found "on what" answered for 2 of 5 steps in a real run.
//
// THE CAUSE WAS HERE, NOT IN THE WORKER. `tool_start` carries a `target` read out of the call's
// arguments — the genre, the instance names, the path — and the reducer collapsed it with the
// `tool_end` summary into one field: `summary ?? target`. The worker formats every summary as a
// verdict mark plus the tool's name, and appends an argument only when the call used one of five
// keys `summarize()` knows (path, query, root, label, fact). So for every other tool the "result"
// was the tool's own name, which the row's label already says — and it outranked the subject.
//
// Measured against the deployed worker at 946cf5f: get_genre_references takes `genre`,
// create_instances takes `items`, and both are in the worker's TARGET_ARG table. Both arrived.
// Neither was drawn.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { informativeSummary, reduceActivity } from '../src/components/ws/activity-model.ts';
import { executionView } from '../src/components/ws/execution-model.ts';

const THINKING = readFileSync(new URL('../src/components/ws/thinking.tsx', import.meta.url), 'utf8');
const T0 = 1_700_000_000_000;
const step = (events) => reduceActivity({ events, now: T0 + 5000, streaming: true })
  .phases.flatMap((p) => p.steps).find((s) => s.toolId === 't1');

test('a summary that is only the tool name is not a result', () => {
  for (const s of ['✓ get_genre_references', '✗ create_instances', 'create_instances', '  ✓   remember  ']) {
    const tool = s.replace(/[^a-z_]/g, '');
    assert.equal(informativeSummary(s, tool), undefined, JSON.stringify(s));
  }
});

test('a summary that says anything more is kept verbatim', () => {
  assert.equal(
    informativeSummary('✓ search_creation_skills · lava stages', 'search_creation_skills'),
    '✓ search_creation_skills · lava stages',
  );
  // Never paraphrased, never trimmed of its mark: the mark is the worker's verdict.
  assert.equal(informativeSummary('✗ create_instances (already done)', 'create_instances'),
    '✗ create_instances (already done)');
  assert.equal(informativeSummary('Rewrote the lighting setup', 'edit_script'), 'Rewrote the lighting setup');
  assert.equal(informativeSummary(undefined, 'edit_script'), undefined);
});

test('THE DEFECT: a bare summary no longer deletes the subject the same step reported', () => {
  const s = step([
    { type: 'tool_start', at: T0, toolId: 't1', tool: 'get_genre_references', summary: 'get_genre_references', target: 'obby' },
    { type: 'tool_end', at: T0 + 400, toolId: 't1', ok: true, summary: '✓ get_genre_references' },
  ]);
  assert.equal(s.target, 'obby', 'the genre the tool was asked about is gone again');
  assert.equal(s.detail, undefined, 'the tool name is being drawn as though it were a result');
});

test('and a real result still lands on the result line', () => {
  const s = step([
    { type: 'tool_start', at: T0, toolId: 't1', tool: 'create_instances', summary: 'create_instances', target: 'Stage1, Stage2, Stage3' },
    { type: 'tool_end', at: T0 + 900, toolId: 't1', ok: true, summary: 'Created 3 parts under Workspace.Course' },
  ]);
  assert.equal(s.target, 'Stage1, Stage2, Stage3');
  assert.equal(s.detail, 'Created 3 parts under Workspace.Course');
});

test('the renderer draws it, and does not draw it twice', () => {
  //[[ A field the reducer fills and nobody renders is the same as no field — the shape of the bug
  //   this file exists for. The second assertion is the other half: when the worker's sentence
  //   already contains the subject (every tool whose argument `summarize()` recognises), printing
  //   the subject again underneath would read as two facts where there is one.
  //   RESTATED 2026-09-22 (A2): the decision moved into execution-model.ts (a tool row's `target`
  //   and `result`), and the Tool row's content draws both. Asserted on behaviour now, not on the
  //   expression that used to make the decision inline. The rendered ToolContent is checked in
  //   tests/thinking-surface.test.mjs. ]]
  const rows = (events) => executionView(reduceActivity({ events, now: T0 + 5000, streaming: false })).rows;
  const [kept] = rows([
    { type: 'tool_start', at: T0, toolId: 't1', tool: 'get_genre_references', summary: 'get_genre_references', target: 'obby' },
    { type: 'tool_end', at: T0 + 400, toolId: 't1', ok: true, summary: '✓ get_genre_references' },
  ]);
  assert.equal(kept.target, 'obby', 'the subject the step reported is not on its row');
  const [once] = rows([
    { type: 'tool_start', at: T0, toolId: 't1', tool: 'read_script', summary: 'read_script', target: 'ServerScriptService.Main' },
    { type: 'tool_end', at: T0 + 400, toolId: 't1', ok: true, summary: '✓ read_script · ServerScriptService.Main' },
  ]);
  assert.equal(once.result, '✓ read_script · ServerScriptService.Main');
  assert.equal(once.target, undefined, 'the subject is drawn twice');
  assert.match(THINKING, /row\.target\) facts\.push\(\{[^}]*className: 'apple-reasoning__target'/, 'the row\'s target is not rendered');
  assert.match(THINKING, /row\.result\) facts\.push\(\{[^}]*className: 'apple-reasoning__detail'/, 'the row\'s result is not rendered');
});
