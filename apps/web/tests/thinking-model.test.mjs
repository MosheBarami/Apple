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

test('open questions remain internal metadata and do not become customer-facing plan chrome', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a'], questions: ['Which tile size?'] },
  });
  const plan = stages.find((s) => s.kind === 'plan');
  assert.deepEqual(plan.items, ['a']);
  assert.equal(plan.questions, undefined);
});

// --- what Apple decided for itself -----------------------------------------
//
// `questions` and `assumptions` are opposites and the card labels them as such: a question is
// still open, an assumption has already been acted on. Showing only the first tells the user
// about the choices Apple declined to make and hides the ones it made.

test('Apple assumptions stay out of the visible plan', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a bar'], questions: [], assumptions: ['mood: warm (from "cozy")'] },
  });
  assert.equal(stages.find((s) => s.kind === 'plan').assumptions, undefined);
});

test('assumptions and questions do not leak into the visible checklist', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a'], questions: ['Which tile size?'], assumptions: ['mood: warm'] },
  });
  const plan = stages.find((s) => s.kind === 'plan');
  assert.deepEqual(plan.items, ['a']);
  assert.equal(plan.questions, undefined);
  assert.equal(plan.assumptions, undefined);
});

test('a worker that assumed nothing renders no assumption block at all', () => {
  // Never padded. `undefined` is what stops the label appearing over an empty list.
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a'], questions: [], assumptions: [] },
  });
  assert.equal(stages.find((s) => s.kind === 'plan').assumptions, undefined);
});

test('blank assumption strings are not assumptions', () => {
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 's', checklist: ['a'], questions: [], assumptions: ['', '   '] },
  });
  assert.equal(stages.find((s) => s.kind === 'plan').assumptions, undefined);
});

test('an older worker that sends no assumptions field breaks nothing', () => {
  // `assumptions` is optional on the wire: a reconnect can replay a run_intent recorded before
  // the field existed, and an absent list must read as "said nothing", not as a crash.
  const stages = buildTimeline({ ...EMPTY, intent: { summary: 's', checklist: ['a'], questions: [] } });
  assert.equal(stages.find((s) => s.kind === 'plan').assumptions, undefined);
});

test('the customer-facing Activity renderer contains no Apple-assumed/open-question blocks', async () => {
  // A field on a model that no component reads is the dead branch this whole section of the audit
  // is about — `PlanStep.tool` sat rendered-but-never-produced for months. Both halves are checked:
  // the JSX reads the field, and the class it renders under is defined rather than unstyled.
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const web = join(dirname(fileURLToPath(import.meta.url)), '..');
  const tsx = readFileSync(join(web, 'src/components/ws/thinking.tsx'), 'utf8');
  assert.doesNotMatch(tsx, /stage\.assumptions/);
  assert.doesNotMatch(tsx, /Apple assumed/);
  assert.doesNotMatch(tsx, /gx-open-qs/);
});

test('assumptions alone do not draw a customer-facing Plan row', () => {
  // The checklist used to be the only thing that could open this stage. A request made entirely
  // of adjectives ("make it cozier") names no object, so it has no checklist — and that is
  // exactly the request where what Apple assumed is the only thing worth reading. Gating the row
  // on the checklist would hide the assumption in the one case it matters most.
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 'make it cozier', checklist: [], questions: [], assumptions: ['mood: warm (from "cozier")'] },
  });
  assert.equal(stages.find((s) => s.kind === 'plan'), undefined);
});

test('an open question alone does not draw internal planning scaffolding in the conversation', () => {
  // D79ab5 — the same gate, one turn further along, and the one the worker actually produces.
  // run-intent.ts returns `{summary, checklist, questions, assumptions}` and only returns null
  // when ALL FOUR are empty, so a hedged request that settled nothing yields questions and
  // nothing else. That question was computed on the server, sent over the socket and parsed
  // here — and then the Plan gate, which read only `checklist` and `assumptions`, threw it away.
  // The user was never told Apple did not know what they meant. They found out from the build.
  //
  // The summary is deliberately blank here: an intent whose ONLY content is a question is exactly
  // the payload that reached the client with nothing to render it. With a summary present the
  // Intent row would draw and the loss would be less visible, which is how this survived.
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: '', checklist: [], questions: ['Which part of the map do you mean?'], assumptions: [] },
  });
  assert.equal(stages.find((s) => s.kind === 'plan'), undefined);
});

test('but a blank question is still not a question', () => {
  // The gate is `questions.length > 0` AFTER cleaning, not before: an intent carrying two empty
  // strings must not open a Plan row with nothing in it.
  const stages = buildTimeline({
    ...EMPTY,
    intent: { summary: 'Fix the lobby floor', checklist: [], questions: ['', '   '], assumptions: [] },
  });
  assert.deepEqual(kinds(stages), ['intent'], 'blank strings opened an empty Plan row');
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
