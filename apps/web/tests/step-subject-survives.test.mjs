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
import { informativeSummary, reduceActivity } from '../src/components/ws/activity-model.ts';
import { livePhrase } from '../src/lib/live-status.ts';
import { TOOL } from '../src/components/ws/tool-vocabulary.ts';

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

test('the subject reaches the one live line as plain words, never as the raw argument', () => {
  //[[ RESTATED 2026-09-24 (owner decision D-THINK-1). This held execution-model.ts's tool rows
  //   (their `target` and `result` facts) and the trace that drew them. The trace is gone: the owner
  //   asked for no technical detail. A field the reducer fills and nobody renders is still no field,
  //   so the property now is that the subject the step reported names the thing in the live line —
  //   "Editing the stall" — as words, and the path it arrived as is not what is said. ]]
  const run = (tool, target) => reduceActivity({ events: [{ type: 'tool_start', at: T0, toolId: 't1', tool, summary: tool, target }], now: T0 + 500, streaming: true });
  assert.equal(livePhrase(run('set_properties', 'game.Workspace.Market.Stall1')), 'Editing the stall');
  assert.equal(livePhrase(run('read_script', 'ServerScriptService.CoinScript')), 'Reading the coin script');
  assert.equal(livePhrase(run('set_properties', 'game.Workspace')), TOOL.set_properties.live, 'a container is not a name');
});
