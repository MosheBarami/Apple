/** UI05 Task, UI08 Plan, UI15 Chain of Thought: fixture renders from real run shapes. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, renderWith, text, count, WEB } from './ui-bundle.mjs';

const ui = await bundle(
  `
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { TaskEvidence, PlanEvidence, ActivityChain } from './src/components/ws/evidence/plan-task-cot';
  import { cotSteps } from './src/components/ws/evidence/plan-task-cot-model';
  import { reduceActivity, eventsFromTurn } from './src/components/ws/activity-model';
  export { h, renderToStaticMarkup, TaskEvidence, PlanEvidence, ActivityChain, cotSteps, reduceActivity, eventsFromTurn };
`,
  { name: 'evidence-plan-task-cot', resolveDir: WEB },
);
const { h, renderToStaticMarkup, TaskEvidence, PlanEvidence, ActivityChain, cotSteps, reduceActivity, eventsFromTurn } = ui;
const render = (el) => renderWith(renderToStaticMarkup, el);

const tool = (o) => ({ startedAt: 1000, done: true, ok: true, startObserved: true, durationMs: 400, summary: '', ...o });
const run = (tools) =>
  reduceActivity({ events: eventsFromTurn({ tools, stopReason: 'done', endedAt: 9000 }), now: 9000, streaming: false });

const activity = run([
  tool({ toolId: 'a', tool: 'get_project_tree', summary: 'Read 386 instances' }),
  tool({ toolId: 'b', tool: 'edit_script', target: 'ServerScriptService.Obby', summary: 'Edited Obby' }),
  tool({ toolId: 'c', tool: 'edit_script', target: 'StarterGui.Timer', ok: false, summary: 'failed' }),
]);

test('Task groups work phases with their affected scripts, not read-only steps', () => {
  const html = render(h(TaskEvidence, { activity }));
  const t = text(html);
  assert.match(t, /Writing Luau/);
  assert.match(t, /Edited a script/);
  assert.equal(count(html, 'ai-task__file'), 2);
  assert.match(t, /ServerScriptService\.Obby/);
  assert.match(t, /StarterGui\.Timer/);
  assert.doesNotMatch(t, /Inspecting project/);
});

test('Plan shows the worker intent and announced steps, with no approval control', () => {
  const intent = {
    summary: 'Build a lava obby',
    checklist: ['checkpoints', 'kill bricks'],
    questions: ['How many stages?'],
    assumptions: ['Bright colours'],
  };
  const html = render(h(PlanEvidence, { intent, upcoming: [{ title: 'Add leaderboard' }] }));
  const t = text(html);
  for (const s of ['Build a lava obby', 'checkpoints', 'kill bricks', 'Add leaderboard', 'Bright colours', 'How many stages?'])
    assert.ok(t.includes(s), s);
  assert.doesNotMatch(html, /Approve|Reject/i);
});

test('Chain of Thought is the activity timeline, failures and unfinished steps stated', () => {
  assert.match(text(render(h(ActivityChain, { activity }))), /Activity/);
  const steps = cotSteps(activity);
  assert.equal(steps.length, 3);
  assert.equal(steps[1].description, 'ServerScriptService.Obby');
  assert.match(steps[2].description, /StarterGui\.Timer · This step reported a failure\./);
  const live = cotSteps(run([tool({ toolId: 'x', tool: 'edit_script', done: false, ok: undefined })]));
  assert.equal(live.length, 1);
  assert.equal(live[0].status, 'pending');
});

test('nothing renders for absent or empty input', () => {
  const empty = run([]);
  assert.equal(render(h(TaskEvidence, { activity: null })), '');
  assert.equal(render(h(TaskEvidence, { activity: empty })), '');
  assert.equal(render(h(PlanEvidence, { intent: null })), '');
  assert.equal(render(h(PlanEvidence, { intent: { summary: '', checklist: [], questions: [] } })), '');
  assert.equal(render(h(ActivityChain, { activity: undefined })), '');
  assert.equal(render(h(ActivityChain, { activity: empty })), '');
});
