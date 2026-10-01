/**
 * STREAMING REASONING, THE STEPS IN ORDER, AND SOURCES — owner order 2026-10-01.
 *
 * The worker sends `reasoning_delta { msgId, step, text }`, the tool frames, and
 * `sources { msgId, sources }` (packages/shared ServerMsg). lib/run-trace.ts turns them into what the
 * turn draws; this suite drives it frame by frame, then renders a whole Turn with the real AI
 * Elements and reads the markup a browser would receive:
 *
 *   * reasoning accumulates per message and per step; a block is open while its step streams and
 *     closes when the step ends, a tool starts, the reply's text starts, or the run ends;
 *   * several steps are several Reasoning blocks, in order, with each step's tools between them as
 *     one Task;
 *   * sources replace per frame, keep their order (the `[n]` index), and never carry a non-http link;
 *   * `[n]` in the answer becomes an InlineCitation to source n; code and unmatched markers stay text.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import {
  citationMarkdown, citedIndexes, safeSourceUrl, splitCitations, traceSegments,
  withReasoning, withReasoningClosed, withSources, withToolStart,
} from '../src/lib/run-trace.ts';

const T = 1_000_000;
const SOURCES = [
  { title: 'TweenService', url: 'https://create.roblox.com/docs/reference/engine/classes/TweenService', kind: 'docs' },
  { title: 'Easing styles', url: 'https://create.roblox.com/docs/reference/engine/enums/EasingStyle', kind: 'docs', note: 'Quad is the default' },
  { title: 'Door kit', url: 'https://create.roblox.com/store/asset/123', kind: 'creator_store' },
];

// ----------------------------------------------------------------- the model ---

test('reasoning accumulates per step, and each new step opens a new block', () => {
  let item = {};
  item = withReasoning(item, 1, 'Look at ', T);
  item = withReasoning(item, 1, 'the shop.', T + 400);
  assert.equal(item.reasoning.length, 1);
  assert.equal(item.reasoning[0].text, 'Look at the shop.');
  assert.equal(item.reasoning[0].endedAt, undefined, 'still streaming');
  item = withReasoning(item, 2, 'Now the door.', T + 2000);
  assert.deepEqual(item.reasoning.map((b) => [b.step, b.text]), [[1, 'Look at the shop.'], [2, 'Now the door.']]);
  assert.equal(item.reasoning[0].endedAt, T + 2000, 'a new step ends the previous block');
  assert.deepEqual(item.trace, [{ kind: 'reasoning', id: 'r0' }, { kind: 'reasoning', id: 'r1' }]);
  assert.equal(withReasoning(item, 2, '', T + 3000), item, 'an empty frame changes nothing');
});

test('a tool starting closes the open thought and takes its place in the order', () => {
  let item = withReasoning({}, 1, 'Need the tree.', T);
  item = withToolStart(item, 'tool-1', T + 1500);
  assert.equal(item.reasoning[0].endedAt, T + 1500);
  // The same step thinking again after its tool is a new block, after the tool.
  item = withReasoning(item, 1, 'Found it.', T + 3000);
  assert.deepEqual(item.trace, [{ kind: 'reasoning', id: 'r0' }, { kind: 'tool', toolId: 'tool-1' }, { kind: 'reasoning', id: 'r1' }]);
  assert.equal(withToolStart(item, 'tool-1', T + 4000).trace.length, 3, 'a repeated tool_start is not a second step');
});

test('the reply starting, or the run ending, closes whatever was still thinking', () => {
  const open = withReasoning({}, 3, 'Almost.', T);
  const closed = withReasoningClosed(open, T + 2500);
  assert.equal(closed.reasoning[0].endedAt, T + 2500);
  assert.equal(withReasoningClosed(closed, T + 9000), closed, 'closing twice moves nothing');
  const empty = {};
  assert.equal(withReasoningClosed(empty, T), empty, 'a run that never thought has nothing to close');
});

test('the turn draws reasoning blocks with each step\'s tools between them, and keeps tools the trace never saw', () => {
  let item = withReasoning({}, 1, 'a', T);
  item = withToolStart(item, 't1', T + 1);
  item = withToolStart(item, 't2', T + 2);
  item = withReasoning(item, 2, 'b', T + 3);
  item = withToolStart(item, 't3', T + 4);
  const segments = traceSegments(item, ['t0-history', 't1', 't2', 't3']);
  assert.deepEqual(segments.map((s) => (s.kind === 'reasoning' ? `R${s.block.step}` : s.toolIds.join('+'))), ['R1', 't1+t2', 'R2', 't3+t0-history']);
  assert.deepEqual(traceSegments({}, ['x', 'y']).map((s) => s.toolIds), [['x', 'y']], 'a reloaded turn still lists its tools');
});

test('sources replace per frame, keep their order, and never carry a link that is not http(s)', () => {
  const first = withSources({}, SOURCES);
  assert.deepEqual(first.sources.map((s) => s.title), ['TweenService', 'Easing styles', 'Door kit']);
  const next = withSources(first, [{ title: 'Evil', url: 'javascript:alert(1)', kind: 'web' }, { title: 'Data', url: 'data:text/html,x', kind: 'web' }, SOURCES[0]]);
  assert.deepEqual(next.sources.map((s) => s.title), ['TweenService']);
  assert.equal(safeSourceUrl('not a url'), null);
  assert.equal(safeSourceUrl('http://example.com/a'), 'http://example.com/a');
});

test('[n] becomes a citation of source n; code, unmatched numbers and plain brackets stay text', () => {
  const parts = splitCitations('Tween it [1][2]. Use `parts[1]` and see [9].\n```lua\nlocal x = t[1]\n```', SOURCES);
  assert.deepEqual(parts.filter((p) => p.kind === 'cite').map((p) => p.index), [1, 2]);
  const md = citationMarkdown('Tween it [1][2]. Use `parts[1]` and see [9].', SOURCES);
  assert.equal(md, 'Tween it [1, 2](#cite-1-2). Use `parts[1]` and see [9].');
  assert.deepEqual(citedIndexes('#cite-1-2'), [1, 2]);
  assert.equal(citedIndexes('#cite-0'), null);
  assert.equal(citedIndexes('https://example.com'), null);
  assert.equal(citationMarkdown('No sources [1]', []), 'No sources [1]', 'with no sources nothing is a citation');
});

test('the socket wires every frame through the model, and history keeps the live-only fields', () => {
  const socket = readFileSync(join(WEB, 'src', 'lib', 'use-project-socket.ts'), 'utf8');
  const caseOf = (name) => socket.slice(socket.indexOf(`case '${name}':`), socket.indexOf('break;', socket.indexOf(`case '${name}':`)));
  assert.match(caseOf('reasoning_delta'), /withReasoning\(/);
  assert.match(caseOf('sources'), /withSources\(/);
  assert.match(caseOf('tool_start'), /withToolStart\(/);
  assert.match(caseOf('delta'), /withReasoningClosed\(/);
  assert.match(caseOf('msg_end'), /withReasoningClosed\(/);
  const state = readFileSync(join(WEB, 'src', 'lib', 'project-socket-state.ts'), 'utf8');
  for (const field of ['reasoning', 'trace', 'sources']) {
    assert.match(state, new RegExp(`observed\\.${field} !== undefined \\? \\{ ${field}: observed\\.${field} \\}`), `history drops the live ${field}`);
  }
});

// ------------------------------------------------------- the turn, rendered ---

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { Turn } from './src/components/ws/turn';
`, { name: 'run-trace', resolveDir: WEB });

function turn(item, extra = {}) {
  return renderWith(ui.renderToStaticMarkup, ui.h(ui.Turn, { status: null, isLast: true, ...extra, item: {
    id: 'm1', role: 'assistant', content: '', tools: [], streaming: false, createdAt: T, ...item,
  } }));
}

const tool = (toolId, name, extra = {}) => ({ toolId, tool: name, summary: name, startedAt: T, done: true, ok: true, ...extra });

test('a live run: the open step shimmers "Thinking...", the closed one says how long, the tools sit between', () => {
  let trace = withReasoning({}, 1, 'Reading the **shop** first.', T);
  trace = withToolStart(trace, 't1', T + 3200);
  trace = withReasoning(trace, 2, 'Now the door.', T + 4000);
  const html = turn({ ...trace, streaming: true, tools: [tool('t1', 'get_project_tree')] }, { status: { phase: 'building' } });
  const triggers = [...html.matchAll(/<button[^>]*data-slot="collapsible-trigger"[^>]*>[\s\S]*?<\/button>/g)].map((m) => text(m[0]));
  assert.equal(triggers.length, 3, 'reasoning, task, reasoning');
  assert.match(triggers[0], /Thought for 4 seconds/);
  assert.match(triggers[1], /Inspecting project/, 'the Task is titled by the kind of work, in words');
  assert.match(triggers[2], /Thinking\.\.\./);
  assert.match(text(html), /Looking around your game/, 'its row says the step, open while the run is live');
  assert.ok(html.indexOf('Thought for 4 seconds') < html.indexOf('Looking around your game'), 'the step\'s thought comes before its tools');
  assert.ok(html.indexOf('Looking around your game') < html.indexOf('Thinking...'), 'and the next step\'s thought after them');
  assert.match(text(html), /Now the door\./, 'the streaming block is open and its text is on the page');
  assert.doesNotMatch(text(html), /Reading the shop first\./, 'the finished block has collapsed');
  // Owner, 2026-10-01: "replace the vercel ones with these, not both" — the app's own status pill is gone.
  assert.doesNotMatch(html, /apple-status/, 'a status line of our own next to the AI Elements');
});

/** The text of every AI Elements Shimmer on the page (its gradient clips to the letters). */
const shimmering = (html) => [...html.matchAll(/<(p|span)[^>]*class="[^"]*bg-clip-text text-transparent[^"]*"[^>]*>([^<]*)<\/\1>/g)].map((m) => m[2]);

test('every live state shimmers (AI Elements Shimmer), and nothing does once the run settles', () => {
  const before = turn({ streaming: true }, { status: { phase: 'planning', creditsSpent: 1 } });
  assert.deepEqual(shimmering(before), ['Thinking...'], 'before the first thought arrives, the run says it is thinking');
  assert.doesNotMatch(text(before), /Planning it out|Credit/, 'not the old pill');

  const running = turn({ streaming: true, tools: [tool('t1', 'get_project_tree', { done: false, ok: undefined })] });
  const live = shimmering(running);
  assert.ok(live.includes('Looking around your game'), `the running step shimmers: ${JSON.stringify(live)}`);
  assert.ok(!live.includes('Thinking...'), 'no extra line while a step is visibly moving');

  const between = turn({ streaming: true, tools: [tool('t1', 'get_project_tree')] });
  assert.deepEqual(shimmering(between), ['Thinking...'], 'between a finished step and the next thought');

  const settled = turn({ content: 'Done.', stopReason: 'done', endedAt: T + 9000, tools: [tool('t1', 'get_project_tree')] });
  assert.deepEqual(shimmering(settled), [], 'a settled turn is still');
  assert.doesNotMatch(settled, /apple-status/);
});

test('a settled reply: its sources under it, and its [n] as inline citations to them', () => {
  const html = turn({ content: 'Use TweenService [1] with Quad easing [2].', stopReason: 'done', endedAt: T + 9000, sources: SOURCES.slice(0, 2) });
  const sources = element(html, /<div[^>]*data-slot="collapsible"[^>]*class="[^"]*not-prose[^"]*text-primary/);
  assert.ok(sources, 'no AI Elements Sources under the reply');
  assert.match(text(sources), /^Used 2 sources/);
  assert.match(html, /tabindex="0" aria-label="Source: TweenService"[^>]*>create\.roblox\.com/);
  assert.match(html, /aria-label="Source: Easing styles"/);
  assert.doesNotMatch(text(html), /\[1\]|\[2\]/, 'the markers became citations');
  const one = turn({ content: 'Only one [1].', stopReason: 'done', endedAt: T, sources: SOURCES.slice(0, 1) });
  assert.match(text(one), /Used 1 source(?!s)/, 'the plural is right for one');
  const none = turn({ content: 'No sources here.', stopReason: 'done', endedAt: T });
  assert.doesNotMatch(none, /Used \d+ source/, 'no Sources block without a sources frame');
});
