import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { ToolInvocation, ReasoningSummary, RunShimmer, StreamingText } from './src/components/ws/evidence/tool-reasoning-stream';
  import { redactString, toolView } from './src/components/ws/evidence/tool-reasoning-stream-model';
  export { h, renderToStaticMarkup, ToolInvocation, ReasoningSummary, RunShimmer, StreamingText, redactString, toolView };
`, { name: 'evidence-tool-reasoning-stream', resolveDir: new URL('..', import.meta.url).pathname });
const { h, renderToStaticMarkup, ToolInvocation, ReasoningSummary, RunShimmer, StreamingText, redactString, toolView } = ui;
const render = (el) => renderWith(renderToStaticMarkup, el);

const done = {
  toolId: 't1', tool: 'write_script', summary: 'Wrote ServerScriptService/Main', target: 'ServerScriptService/Main?token=abc123secret',
  ok: true, startedAt: 1, durationMs: 1500, done: true,
  detail: { path: 'ServerScriptService/Main', apiKey: 'plain', note: 'Authorization: Bearer abcdefghijklmnop', key: 'sk-abcdefghijklmnopqrstuv', lines: Array.from({ length: 30 }, (_, i) => i) },
};

test('ToolInvocation shows a finished tool, redacted', () => {
  const html = render(h(ToolInvocation, { defaultOpen: true, tool: done }));
  const t = text(html);
  assert.match(t, /write_script/);
  assert.match(t, /Completed/);
  assert.match(t, /Wrote ServerScriptService\/Main/);
  assert.match(t, /Took 1\.5s/);
  assert.doesNotMatch(t, /abc123secret|abcdefghijklmnop|sk-abcdef|"plain"/);
  assert.match(t, /\[redacted\]/);
  assert.match(t, /\.\.\. 10 more/);
});

test('ToolInvocation states: running, failed, unreported', () => {
  assert.match(text(render(h(ToolInvocation, { defaultOpen: true, tool: { ...done, done: false, ok: undefined, detail: undefined } }))), /Running/);
  const failed = text(render(h(ToolInvocation, { defaultOpen: true, tool: { ...done, ok: false, summary: 'Script failed', detail: undefined } })));
  assert.match(failed, /Error/);
  assert.match(failed, /Script failed/);
  assert.match(text(render(h(ToolInvocation, { defaultOpen: true, tool: { ...done, ok: undefined } }))), /Outcome not reported/);
});

test('large detail is truncated', () => {
  const v = toolView({ ...done, detail: { blob: 'x '.repeat(5000) } });
  assert.equal(v.truncated, true);
  assert.ok(v.detail.length <= 2000);
  assert.equal(redactString('plain words'), 'plain words');
});

test('ReasoningSummary shows only public effort reason', () => {
  const html = render(h(ReasoningSummary, { defaultOpen: true, running: false, status: { phase: 'planning', effort: 'high', effortReason: 'stone baseline; visual design task' } }));
  const t = text(html);
  assert.match(t, /stone baseline; visual design task/);
  assert.match(t, /Effort: high/);
});

test('RunShimmer and StreamingText follow real state', () => {
  assert.match(render(h(RunShimmer, { active: true, children: 'Building' })), /ai-elements-shimmer/);
  assert.doesNotMatch(render(h(RunShimmer, { active: false, children: 'Building' })), /ai-elements-shimmer/);
  assert.match(render(h(StreamingText, { text: 'Hello', streaming: true })), /caret/);
  const closed = render(h(StreamingText, { text: 'Hello', streaming: false }));
  assert.doesNotMatch(closed, /caret/);
  assert.equal(text(closed), 'Hello');
});

test('absent input renders nothing', () => {
  assert.equal(render(h(ToolInvocation, { defaultOpen: true, tool: undefined })), '');
  assert.equal(render(h(ReasoningSummary, { status: undefined, running: true })), '');
  assert.equal(render(h(RunShimmer, { active: true, children: '' })), '');
  assert.equal(render(h(StreamingText, { text: '', streaming: true })), '');
});
