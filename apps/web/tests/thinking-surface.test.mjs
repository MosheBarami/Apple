/**
 * THE THINKING CARD'S EXECUTION SURFACE — what it shows, rendered, and what it must never show.
 *
 * The card is built from Vercel AI Elements (Reasoning, ChainOfThought, Tool, Task) over the
 * activity reducer. These tests hold the product's honesty rules at the two places they can fail:
 *
 *   * the model (components/ws/execution-model.ts), run under node on real reducer output — which
 *     steps become rows, which never do;
 *   * the rendered markup (bundled with esbuild, rendered with react-dom/server) — what a browser
 *     would receive, including what it must NOT receive: a tool's untrusted `detail` payload, a
 *     JSON dump, a failed attempt the run recovered from, model text inside the disclosure.
 *
 * NOT CHECKABLE HERE, and checked in a browser instead: the Reasoning trigger's aria-controls. The
 * trigger names its content only once the content has mounted (a layout effect), and server
 * rendering runs no effects. The mechanism is asserted in tests/ai-elements-reasoning.test.mjs.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { WEB, bundle, count, decomment, element, renderWith, text } from './ui-bundle.mjs';

const SRC = join(WEB, 'src');
const activity = await import(pathToFileURL(join(SRC, 'components/ws/activity-model.ts')).href);
const model = await import(pathToFileURL(join(SRC, 'components/ws/execution-model.ts')).href);

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Thinking, ExecutionSurface } from './src/components/ws/thinking';
  export { PLAYTEST_STALE_MS } from '@golem/shared';
`, { name: 'thinking-surface', resolveDir: WEB });
const render = (props) => renderWith(ui.renderToStaticMarkup, ui.h(ui.Thinking, {
  status: null, streaming: false, gates: [], plannedSteps: [], ...props,
}));
/**
 * A SETTLED run's body. The card starts closed once a run has ended, and server rendering cannot
 * open it, so the body component itself is rendered — with the view Thinking would hand it.
 */
const renderBody = (r, { plannedSteps = [], gates = [] } = {}) => renderWith(ui.renderToStaticMarkup, ui.h(ui.ExecutionSurface, {
  view: model.executionView(r), plannedSteps, passedGates: gates.filter((g) => g.passed), denied: null, studioConnected: false,
}));

const T0 = 1_700_000_000_000;
let clock = T0;
/** A tool event as ChatItem carries it, laid end to end on an observed clock. */
function tool(name, over = {}, duration = 800) {
  const startedAt = clock;
  clock += duration + 500;
  return { toolId: `${name}-${startedAt}`, tool: name, summary: name, ok: true, startedAt, durationMs: duration, done: true, startObserved: true, ...over };
}
function run(tools, { streaming = false, stopReason, error, now = clock + 1000 } = {}) {
  return activity.reduceActivity({
    events: activity.eventsFromTurn({ tools, stopReason, error, endedAt: stopReason ? clock : undefined }),
    now,
    streaming,
  });
}

// The canary a tool's untrusted structured payload carries. It must never reach the markup.
const DETAIL = { canary: 'DETAIL_CANARY_7f3a', nested: { json: 'DETAIL_JSON_9c1e' } };

// ------------------------------------------------------------------ the model ---

test('a failed attempt the run recovered from is not a row, and the retry that worked is', () => {
  clock = T0;
  const r = run([
    tool('get_project_tree'),
    tool('create_instances', { ok: false, summary: '✗ create_instances' }),
    tool('create_instances', { summary: 'Created 3 parts under Workspace.Course' }),
  ], { stopReason: 'done' });
  assert.equal(r.terminal.kind, 'recovered', 'the fixture is not the recovered case it claims to be');
  const all = r.phases.flatMap((p) => p.steps);
  assert.equal(all.filter((s) => s.state === 'failed').length, 1, 'the reducer must still keep the failed attempt, for audit');
  const view = model.executionView(r);
  assert.equal(view.rows.length, 2);
  assert.ok(view.rows.every((row) => row.kind !== 'tool' || row.state !== 'failed'), 'a recovered attempt became a failure row');
});

test('a failed step the run moved past is not a row, even when the run later failed for another reason', () => {
  clock = T0;
  const r = run([
    tool('insert_asset', { ok: false }),
    tool('edit_script', { summary: 'Wrote ServerScriptService.Main' }),
  ], { stopReason: 'error', error: 'model_failed' });
  assert.equal(r.terminal.kind, 'failed');
  const view = model.executionView(r);
  assert.deepEqual(view.rows.map((row) => row.kind === 'tool' && row.state), ['done'],
    'the run did something after that failure, so it was not the final one');
});

test('a real final failure is one row — the last thing the run did — in the attempt tense', () => {
  clock = T0;
  const r = run([
    tool('get_project_tree'),
    tool('insert_asset', { ok: false, summary: '✗ insert_asset', target: '7042118891' }),
    tool('insert_asset', { ok: false, summary: '✗ insert_asset', target: '7042118891' }),
  ], { stopReason: 'error', error: 'model_failed' });
  const view = model.executionView(r);
  const failed = view.rows.filter((row) => row.kind === 'tool' && row.state === 'failed');
  assert.equal(failed.length, 1, 'the final failure must appear exactly once, not once per attempt');
  assert.equal(view.rows[view.rows.length - 1], failed[0], 'and it must be the last row');
  assert.equal(failed[0].title, 'Inserting an asset', 'a past-tense label on a failed step would say it happened');
});

test('a step the run never heard back from is not drawn as anything', () => {
  clock = T0;
  const r = run([tool('get_project_tree'), tool('render_view', { done: true, ok: undefined })], { stopReason: 'stopped' });
  assert.ok(r.phases.flatMap((p) => p.steps).some((s) => s.state === 'unknown'), 'the fixture has no unknown step');
  assert.equal(model.executionView(r).rows.length, 1);
});

test('the compact view is the current step and the two before it; nothing observed is lost', () => {
  clock = T0;
  const tools = ['a', 'b', 'c', 'd', 'e'].map((n) => tool(`read_script`, { toolId: n }));
  tools.push({ toolId: 'live', tool: 'render_view', summary: 'render_view', startedAt: clock, done: false, startObserved: true });
  const view = model.executionView(run(tools, { streaming: true }));
  assert.equal(view.rows.length, 6);
  assert.equal(view.current?.key, 'tool:live', 'the current row must be the step that is actually running');
  assert.equal(view.visible.length, model.RECENT_ROWS + 1);
  assert.equal(view.visible[view.visible.length - 1], view.current);
  assert.deepEqual([...view.earlier, ...view.visible].map((r) => r.key), view.rows.map((r) => r.key),
    'earlier + visible must be every observed row, in order');
});

test('a tool row carries only the four safe facts, and never the payload', () => {
  clock = T0;
  const view = model.executionView(run([
    tool('get_genre_references', { target: 'obby', summary: '✓ get_genre_references', detail: DETAIL }),
    tool('create_instances', { target: 'Stage1', summary: 'Created Stage1 under Workspace' }),
  ], { stopReason: 'done' }));
  const [first, second] = view.rows;
  assert.deepEqual(Object.keys(first).sort(), ['duration', 'key', 'kind', 'result', 'state', 'target', 'title', 'tool'].sort());
  assert.equal(first.target, 'obby');
  assert.equal(first.result, undefined, 'a summary that is only the tool name is not a result');
  assert.equal(second.target, undefined, 'the subject is already in the result sentence; printing it twice reads as two facts');
  assert.equal(JSON.stringify(view).includes('DETAIL_CANARY_7f3a'), false, 'the untrusted payload reached the view model');
});

// ------------------------------------------------------------ the rendering ---

test('the header is AI Elements\' own: Brain, the live action under Shimmer, the time, the chevron', () => {
  clock = T0;
  const tools = [tool('read_script'), { toolId: 'live', tool: 'edit_script', summary: 'edit_script', startedAt: clock, done: false, startObserved: true }];
  const html = render({ activity: run(tools, { streaming: true, now: clock + 4000 }), streaming: true, status: { phase: 'building', step: 2, creditsSpent: 3 } });
  const trigger = element(html, /<button[^>]*class="[^"]*\bapple-reasoning__trigger\b/);
  assert.ok(trigger, 'the Reasoning trigger is missing');
  assert.match(trigger, /lucide-brain/, 'the Brain icon is upstream ReasoningTrigger\'s own');
  assert.match(trigger, /class="ai-elements-shimmer[^"]*"[^>]*>Editing a script</, 'the live line is the observed current action, under Shimmer');
  assert.match(trigger, /class="apple-reasoning__time">\d+s</, 'the measured duration is on the line');
  assert.match(trigger, /lucide-chevron-down/);
  assert.doesNotMatch(html, /orb|thinking-state|streaming-text|aicss/i, 'a retired AICSS piece is back');
  const cost = element(html, /<span class="apple-reasoning__cost"/);
  assert.equal(text(cost), '3 Credits');
  assert.equal(trigger.includes('apple-reasoning__cost'), false, 'the cost belongs beside the trigger, not inside its name');
  const content = element(html, /<div[^>]*data-slot="collapsible-content"[^>]*ai-reasoning__content/);
  assert.equal(content.includes('apple-reasoning__cost'), false, 'the cost must stay out of the disclosure');
});

test('the disclosure body is a ReasoningContent that renders components, never model text', () => {
  clock = T0;
  const html = render({ activity: run([tool('read_script')], { streaming: true }), streaming: true });
  const content = element(html, /<div[^>]*data-slot="collapsible-content"[^>]*ai-reasoning__content/);
  assert.ok(content, 'the body is not a ReasoningContent / CollapsibleContent');
  assert.match(content, /^<div[^>]*\bid="[^"]+"/, 'the body must carry the id the trigger names while it is open');
  assert.doesNotMatch(content, /class="markdown/, 'something rendered model text through the markdown path inside the disclosure');
  const src = decomment(readFileSync(join(SRC, 'components/ws/thinking.tsx'), 'utf8'));
  const body = /<ReasoningContent\b[^>]*>([\s\S]*?)<\/ReasoningContent>/.exec(src)?.[1] ?? '';
  assert.match(body.trim(), /^<ExecutionSurface\b/, 'ReasoningContent must be handed the component, not a string');
});

test('ToolContent shows only On / Result / Time — never ToolEvent.detail, never JSON', () => {
  clock = T0;
  const tools = [
    tool('read_script', { target: 'ServerScriptService.Main', summary: 'Read 68 lines', detail: DETAIL }),
    tool('edit_script', { summary: 'Rewrote the lighting setup', detail: { v: 1, blocks: [{ type: 'text', text: 'DETAIL_BLOCK_4b2d' }] } }),
  ];
  const html = renderBody(run(tools, { stopReason: 'done' }));
  assert.equal(html.includes('DETAIL_CANARY_7f3a') || html.includes('DETAIL_JSON_9c1e') || html.includes('DETAIL_BLOCK_4b2d'), false,
    'a tool payload reached the page');
  const contents = [...html.matchAll(/<div[^>]*class="[^"]*\bai-tool__content\b[^"]*"[^>]*>/g)].map((m) => element(html.slice(m.index), /<div/));
  assert.equal(contents.length, 2, 'every tool row should have its ToolContent in the DOM (force-mounted, hidden when closed)');
  for (const c of contents) {
    const terms = [...c.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);
    assert.ok(terms.length > 0 && terms.every((t) => ['On', 'Result', 'Time'].includes(t)), `unexpected fact: ${terms}`);
    assert.doesNotMatch(text(c), /[{}[\]]/, 'a ToolContent printed something shaped like JSON');
  }
  assert.match(html, /<dt>On<\/dt><dd class="apple-reasoning__target">ServerScriptService\.Main<\/dd>/);
  assert.match(html, /<dt>Result<\/dt><dd class="apple-reasoning__detail">Rewrote the lighting setup<\/dd>/);
});

test('nothing outside ai-elements renders ToolInput or ToolOutput, which print JSON payloads', () => {
  const offenders = [];
  let read = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== 'ai-elements') walk(path);
      } else if (/\.(?:ts|tsx)$/.test(entry)) {
        read++;
        if (/\bTool(?:Input|Output)\b/.test(decomment(readFileSync(path, 'utf8')))) offenders.push(relative(SRC, path));
      }
    }
  };
  walk(SRC);
  assert.ok(read > 100, `only ${read} source files read`);
  assert.deepEqual(offenders, []);
  assert.match(readFileSync(join(SRC, 'components/ai-elements/tool.tsx'), 'utf8'), /export const ToolInput\b/, 'the scan would be vacuous without the export it looks for');
});

test('a recovered run renders no failure mark; a failed run renders exactly one, last', () => {
  clock = T0;
  const recovered = renderBody(run([tool('create_instances', { ok: false }), tool('create_instances', { summary: 'Created 3 parts' })], { stopReason: 'done' }));
  assert.equal(count(recovered, 'ai-tool__badge--output-error'), 0, 'a recovered attempt is painted as a failure');
  assert.equal(count(recovered, 'ai-tool__badge--output-available'), 1);

  clock = T0;
  const failed = renderBody(run([tool('get_project_tree'), tool('insert_asset', { ok: false }), tool('insert_asset', { ok: false })], { stopReason: 'error', error: 'model_failed' }));
  assert.equal(count(failed, 'ai-tool__badge--output-error'), 1, 'the final failure must appear once');
  const badges = [...failed.matchAll(/ai-tool__badge--([a-z-]+)/g)].map((m) => m[1]);
  assert.equal(badges[badges.length - 1], 'output-error', 'the failure is the last row');
  assert.doesNotMatch(failed, /gx-outcome|is-bad/, 'the run-level failure sentence belongs to the turn\'s outcome row, not the card');
});

test('earlier steps sit behind a ChainOfThought disclosure whose header names content that exists', () => {
  clock = T0;
  const tools = Array.from({ length: 6 }, (_, i) => tool('read_script', { toolId: `t${i}` }));
  const html = renderBody(run(tools, { stopReason: 'done' }));
  const header = element(html, /<button[^>]*class="[^"]*\bai-chain-of-thought__header\b/);
  assert.ok(header, 'no earlier-steps disclosure');
  assert.match(text(header), /^4 earlier steps$/);
  const controls = /aria-controls="([^"]+)"/.exec(header)?.[1];
  assert.ok(controls, 'the header names no content');
  const content = element(html, new RegExp(`<div[^>]*\\bid="${controls.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.ok(content, `aria-controls="${controls}" points at nothing`);
  assert.match(content, /data-slot="collapsible-content"/);
  assert.match(content, /\bhidden=""/, 'closed, it is in the DOM and hidden');
  assert.equal(count(content, 'ai-tool__header'), 4);
  assert.equal(count(html, 'ai-tool__header'), 6, 'every observed step is reachable');
});

test('a plan is never a checklist in the conversation: one next step, in its own words', () => {
  //[[ RESTATED 2026-09-23 for the owner's D-UX-2: plan checklists are not shown in the conversation.
  //   This used to hold a Task listing every planned step behind a real button. The honesty half is
  //   unchanged — only validated plan steps, never inferred ones, and nothing at all without a plan —
  //   and the checklist is now ONE pending row: the next step. The whole plan is under Details. ]]
  clock = T0;
  const html = renderBody(run([tool('read_script')], { stopReason: 'done' }), {
    plannedSteps: [{ key: 'p1', title: 'Lay out a seating cluster' }, { key: 'p2', title: 'Re-run the visual gate' }],
  });
  assert.equal(count(html, 'ai-task__item'), 0, 'the planned-steps checklist is back');
  assert.doesNotMatch(html, /Planned next actions|planned steps?/i);
  assert.equal(count(html, 'Next: '), 1, 'exactly one next step');
  assert.match(html, /Next: Lay out a seating cluster/);
  assert.doesNotMatch(html, /Re-run the visual gate/, 'only the next step, not the rest of the plan');
  const next = element(html, /<div[^>]*class="[^"]*\bapple-step--next\b/);
  assert.ok(next, 'the next step is a step of the chain');

  const none = renderBody(run([tool('read_script')], { stopReason: 'done' }));
  assert.doesNotMatch(none, /Next: /, 'no validated plan means no next step, not an empty one');
});

test('a passed check is one plain step; a failed check is never painted as one', () => {
  //[[ RESTATED 2026-09-23 (D-UX-2). The step used to list each passed gate by name ("Visual quality
  //   gate", "Playtest"), which is detail. It is one step now, "Checked it works". What it has always
  //   guarded is kept: it is drawn from PASSED gates only. ]]
  clock = T0;
  // Through Thinking, on a live run (open), so it is Thinking's own filter being tested — the body
  // helper filters for the caller, and a test through it would pass whatever Thinking did.
  const mixed = render({
    activity: run([tool('run_and_check')], { streaming: true }),
    streaming: true,
    gates: [{ key: 'a', label: 'Playtest', passed: true }, { key: 'b', label: 'Visual quality gate', passed: false }],
  });
  assert.equal(count(mixed, 'Checked it works'), 1);
  assert.doesNotMatch(text(mixed), /Visual quality gate|Verified/, 'a gate name is detail, and a failed one is not a success');

  clock = T0;
  const failedOnly = render({
    activity: run([tool('run_and_check')], { streaming: true }),
    streaming: true,
    gates: [{ key: 'b', label: 'Visual quality gate', passed: false }],
  });
  assert.doesNotMatch(failedOnly, /Checked it works/, 'a failed gate was painted as a verified milestone');
});

test('tool facts stay closed, even on the step that is running (D-UX-2)', () => {
  clock = T0;
  const tools = [tool('read_script'), { toolId: 'live', tool: 'edit_script', summary: 'edit_script', target: 'ServerScriptService.Main', startedAt: clock, done: false, startObserved: true }];
  const html = render({ activity: run(tools, { streaming: true, now: clock + 4000 }), streaming: true });
  const contents = [...html.matchAll(/<div[^>]*class="[^"]*\bai-tool__content\b[^"]*"[^>]*>/g)].map((m) => m[0]);
  assert.ok(contents.length >= 1, 'no ToolContent rendered — this would check nothing');
  for (const c of contents) assert.match(c, /\bhidden=""/, 'a step opened itself; its facts are one click away, not in the way');
});

test('documents the reply no longer draws sit under a closed Details, rendered only when opened', () => {
  clock = T0;
  const doc = { v: 1, blocks: [{ type: 'property_inspector', path: 'game.Lighting', className: 'Lighting', groups: [] }] };
  const html = renderWith(ui.renderToStaticMarkup, ui.h(ui.ExecutionSurface, {
    view: model.executionView(run([tool('read_script')], { stopReason: 'done' })), plannedSteps: [], passedGates: [], denied: null, studioConnected: false,
    details: [doc],
  }));
  const trigger = element(html, /<button[^>]*class="[^"]*\bapple-reasoning__more-trigger\b/);
  assert.ok(trigger, 'no Details disclosure');
  assert.equal(text(trigger), 'Details');
  assert.match(trigger, /aria-expanded="false"/, 'Details starts closed');
  assert.doesNotMatch(html, /game\.Lighting|gu-panel/, 'a closed Details rendered its contents');
  const none = renderBody(run([tool('read_script')], { stopReason: 'done' }));
  assert.doesNotMatch(none, /apple-reasoning__more/, 'nothing to hold, no Details');
});

test('the one PlaytestCard renders inside the surface; a stale frame is dimmed with its real age; never "video"', () => {
  const staleMs = ui.PLAYTEST_STALE_MS;
  assert.ok(Number.isFinite(staleMs) && staleMs > 0, 'the stale threshold was not read from @golem/shared');
  const now = Date.now();
  const playtest = { id: 'pt', phase: 'running', startedAt: now - 20_000, requestedSeconds: 30, framesDelivered: 3, framesDropped: 0, consoleErrors: 0, consoleWarnings: 0 };
  const frame = { playtestRunId: 'pt', seq: 3, capturedAt: now - staleMs - 2000, source: 'studio_viewport', encoding: 'png', width: 2, height: 2, data: 'iVBORw0KGgo=' };
  clock = T0;
  const html = render({ activity: run([tool('run_and_check')], { streaming: true }), streaming: true, playtest, frames: [frame], studioConnected: true });
  assert.equal(count(html, 'aria-label="Playtest"'), 1, 'exactly one playtest card');
  const content = element(html, /<div[^>]*data-slot="collapsible-content"[^>]*ai-reasoning__content/);
  assert.ok(content.includes('aria-label="Playtest"'), 'the card lives in the execution surface');
  assert.match(html, /gx-playtest[^"]*\bis-dimmed\b/, 'a stale frame must be dimmed, not shown as current');
  assert.match(text(html), /\d+s old/, 'and it must say how old it is');
  assert.doesNotMatch(text(html), /\bvideo\b/i);
});

test('an unobserved run draws nothing at all', () => {
  const html = render({ activity: activity.reduceActivity({ events: [], now: T0, streaming: false }) });
  assert.equal(html, '');
});
