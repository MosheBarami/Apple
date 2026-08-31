/**
 * The Thinking card's honesty guarantee, pinned.
 *
 * The card is the one place in the product where the UI narrates what the agent
 * is doing, so it is the one place where fabrication would be most convincing
 * and most damaging. These tests assert the property the design brief calls
 * non-negotiable: **a row exists only when the worker actually supplied its
 * data.** No default stages, no placeholder copy, no invented roadmap, no
 * percentage, and a pending bullet only for a step the backend itself announced
 * as upcoming.
 *
 * Run with:  node --test           (from apps/web)
 * No test framework: the model is plain TypeScript with type-only imports, so
 * Node loads it directly via native type stripping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildActions, buildTimeline, headerHint } from '../src/components/ws/thinking-model.ts';

const EMPTY = {
  intent: null,
  tools: [],
  plannedSteps: [],
  gates: [],
  status: null,
  streaming: false,
};

const tool = (over = {}) => ({
  toolId: over.toolId ?? 't1',
  tool: over.tool ?? 'get_project_tree',
  summary: over.summary ?? 'Read 386 instances',
  ok: over.ok,
  startedAt: 0,
  done: over.done ?? true,
});

const kinds = (stages) => stages.map((s) => s.kind);

// ---------------------------------------------------------------------------
// 1. Nothing in means nothing out
// ---------------------------------------------------------------------------

test('with no data at all the timeline is empty — the card renders nothing', () => {
  assert.deepEqual(buildTimeline(EMPTY), []);
});

test('a live run with no reported tool and no phase still produces no Actions stage', () => {
  assert.deepEqual(buildTimeline({ ...EMPTY, streaming: true }), []);
});

// ---------------------------------------------------------------------------
// 2. Intent and Plan exist only when the backend sent an intent
// ---------------------------------------------------------------------------

test('no run_intent means no Intent row and no Plan row, even mid-run', () => {
  const stages = buildTimeline({
    ...EMPTY,
    streaming: true,
    tools: [tool({ done: false })],
    status: { phase: 'building' },
  });
  assert.deepEqual(kinds(stages), ['actions']);
});

test('an intent with an empty summary does not conjure an Intent row', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: '   ', checklist: [], questions: [] },
  });
  assert.deepEqual(kinds(stages), []);
});

test('an intent with a summary but no checklist yields Intent and NOT Plan', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 'Fix the lobby floor', checklist: [], questions: [] },
  });
  assert.deepEqual(kinds(stages), ['intent']);
  assert.equal(stages[0].summary, 'Fix the lobby floor');
});

test('a checklist of blank strings is not a plan', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 'Fix the lobby floor', checklist: ['', '  '], questions: [] },
  });
  assert.deepEqual(kinds(stages), ['intent']);
});

test('Plan renders exactly the checklist the worker sent, in order, nothing added', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 'Fix the floor', checklist: ['lobby floor', 'material variation'], questions: [] },
  });
  const plan = stages.find((s) => s.kind === 'plan');
  assert.deepEqual(plan.items, ['lobby floor', 'material variation']);
  assert.equal(plan.questions, undefined);
});

test('open questions are surfaced only when the worker actually asked them', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a'], questions: ['Which tile size?'] },
  });
  assert.deepEqual(stages.find((s) => s.kind === 'plan').questions, ['Which tile size?']);
});

// ---------------------------------------------------------------------------
// 3. Actions come from real tool events and the announced phase
// ---------------------------------------------------------------------------

test('a finished tool is done; a failed tool is failed; an unfinished tool is active', () => {
  const rows = buildActions({
    ...EMPTY,
    tools: [
      tool({ toolId: 'a', done: true, ok: true }),
      tool({ toolId: 'b', done: true, ok: false }),
      tool({ toolId: 'c', done: false }),
    ],
  });
  assert.deepEqual(
    rows.map((r) => r.state),
    ['done', 'failed', 'active'],
  );
});

test('the announced phase becomes a row only while streaming and only between tools', () => {
  const withRunningTool = buildActions({
    ...EMPTY,
    streaming: true,
    tools: [tool({ done: false })],
    status: { phase: 'building' },
  });
  assert.equal(withRunningTool.length, 1);

  const betweenTools = buildActions({
    ...EMPTY,
    streaming: true,
    tools: [tool({ done: true, ok: true })],
    status: { phase: 'building' },
  });
  assert.deepEqual(
    betweenTools.map((r) => r.label),
    ['Read the project tree', 'Building'],
  );

  const notStreaming = buildActions({
    ...EMPTY,
    tools: [tool({ done: true, ok: true })],
    status: { phase: 'building' },
  });
  assert.equal(notStreaming.length, 1);
});

test('a tool summary equal to the tool name is not repeated as a detail line', () => {
  const [row] = buildActions({ ...EMPTY, tools: [tool({ tool: 'run_luau', summary: 'run_luau' })] });
  assert.equal(row.detail, undefined);
});

// ---------------------------------------------------------------------------
// 4. Pending bullets come only from steps the backend announced
// ---------------------------------------------------------------------------

test('with no announced upcoming steps there is never a pending row', () => {
  const rows = buildActions({
    ...EMPTY,
    streaming: true,
    tools: [tool({ done: false })],
    status: { phase: 'building', step: 2, totalSteps: 9 },
  });
  assert.equal(
    rows.some((r) => r.state === 'pending'),
    false,
    'a step counter is not a licence to invent named future steps',
  );
});

test('an announced upcoming step renders as pending, after the real events', () => {
  const rows = buildActions({
    ...EMPTY,
    tools: [tool({ toolId: 'a', done: true, ok: true })],
    plannedSteps: [{ key: 'p1', title: 'Lay out a seating cluster' }],
  });
  assert.deepEqual(
    rows.map((r) => [r.label, r.state]),
    [
      ['Read the project tree', 'done'],
      ['Lay out a seating cluster', 'pending'],
    ],
  );
});

test('an announced step that duplicates a completed one is dropped, not shown twice', () => {
  const rows = buildActions({
    ...EMPTY,
    tools: [tool({ toolId: 'a', tool: 'render_view', done: true, ok: true })],
    plannedSteps: [{ key: 'p1', title: 'rendered the scene' }],
  });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].state, 'done');
});

// ---------------------------------------------------------------------------
// 5. Validation comes only from a gate that actually ran
// ---------------------------------------------------------------------------

test('no gate result means no Validation row', () => {
  const stages = buildTimeline({ ...EMPTY, tools: [tool()] });
  assert.deepEqual(kinds(stages), ['actions']);
});

test('a real gate result produces the Validation row and reports its own verdict', () => {
  const stages = buildTimeline({
    ...EMPTY,
    tools: [tool()],
    gates: [{ key: 'g1', label: 'Visual quality gate', passed: false, score: 6.5, detail: 'The floor is flat.' }],
  });
  assert.deepEqual(kinds(stages), ['actions', 'validation']);
  const gate = stages[1].gates[0];
  assert.equal(gate.passed, false);
  assert.equal(gate.score, 6.5);
});

// ---------------------------------------------------------------------------
// 6. Order, liveness and the header line
// ---------------------------------------------------------------------------

test('stages are always Intent → Plan → Actions → Validation', () => {
  const stages = buildTimeline({
    intent: { summary: 's', checklist: ['a'], questions: [] },
    tools: [tool({ done: false })],
    plannedSteps: [],
    gates: [{ key: 'g', label: 'Playtest', passed: true }],
    status: { phase: 'building' },
    streaming: true,
  });
  assert.deepEqual(kinds(stages), ['intent', 'plan', 'actions', 'validation']);
});

test('only Actions can be live, and only while something is actually in flight', () => {
  const live = buildTimeline({ ...EMPTY, streaming: true, tools: [tool({ done: false })] });
  assert.equal(live[0].live, true);

  const settled = buildTimeline({ ...EMPTY, tools: [tool({ done: true, ok: true })] });
  assert.equal(settled[0].live, false);
});

test('the header hint is the affordance when idle and a real phase when live', () => {
  assert.equal(headerHint(EMPTY, false), 'Click to expand');
  assert.equal(headerHint(EMPTY, true), 'Click to collapse');
  assert.equal(
    headerHint({ ...EMPTY, streaming: true, tools: [tool({ done: false, tool: 'render_view' })] }, false),
    'Rendered the scene',
  );
});

test('nothing the model produces ever contains a percentage', () => {
  const stages = buildTimeline({
    intent: { summary: 'Fix the floor', checklist: ['floor'], questions: ['tile size?'] },
    tools: [tool({ done: false })],
    plannedSteps: [{ key: 'p', title: 'Re-render' }],
    gates: [{ key: 'g', label: 'Visual quality gate', passed: false, score: 6.5, detail: 'flat' }],
    status: { phase: 'building', step: 3, totalSteps: 9, effort: 'high' },
    streaming: true,
  });
  assert.equal(JSON.stringify(stages).includes('%'), false);
});
