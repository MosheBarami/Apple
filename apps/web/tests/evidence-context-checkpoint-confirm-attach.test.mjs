/** UI12/13/14/16 renderers from realistic fixtures, plus fixture renders of UI07 Prompt Input, UI09 Message, UI11 Conversation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, renderWith, text, count } from './ui-bundle.mjs';
import { WEB } from './ui-bundle.mjs';

const ui = await bundle(`
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { RunContext, RunCheckpoint, RestoreConfirmation, TurnAttachments } from './src/components/ws/evidence/context-checkpoint';
  import { checkpointForRun } from './src/components/ws/evidence/context-checkpoint-model';
  import { Message, MessageContent, MessageResponse } from './src/components/ai-elements/message';
  import { Conversation, ConversationContent } from './src/components/ai-elements/conversation';
  import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from './src/components/ai-elements/prompt-input';
  export { h, renderToStaticMarkup, RunContext, RunCheckpoint, RestoreConfirmation, TurnAttachments, checkpointForRun, Message, MessageContent, MessageResponse, Conversation, ConversationContent, PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit };
`, { name: 'evidence-cca', resolveDir: WEB });
const { h } = ui;
const render = (el) => renderWith(ui.renderToStaticMarkup, el);

const CP = { id: 'cp1', label: 'Before door build', createdAt: 1000, kind: 'pre_agent', scriptCount: 12, instanceCount: 340, sizeBytes: 5000 };

test('Context shows the sent budget and credits, and says unavailable for the unknown half', () => {
  const html = render(h(ui.RunContext, { context: { usedChars: 12000, maxChars: 24000, dropped: { groups: 2, chars: 900 } }, creditsSpent: 6 }));
  assert.match(text(html), /Context 12,000 of 24,000 characters/);
  assert.match(text(html), /2 earlier turns were left out/);
  assert.match(text(html), /6 Credits spent/);
  assert.match(html, /aria-valuenow="50"/);
  const partial = text(render(h(ui.RunContext, { creditsSpent: 1 })));
  assert.match(partial, /Context unavailable/);
  assert.match(partial, /1 Credit spent/);
  assert.match(text(render(h(ui.RunContext, { context: { usedChars: 1, maxChars: 10 } }))), /Credits unavailable/);
  assert.equal(render(h(ui.RunContext, {})), '');
  assert.equal(render(h(ui.RunContext, { context: { usedChars: 1, maxChars: 0 } })), '', 'an incoherent budget is not a measurement');
});

test('Checkpoint marker names the snapshot; Restore only with a handler; matches by run window', () => {
  const html = render(h(ui.RunCheckpoint, { checkpoint: CP }));
  assert.match(text(html), /Before door build/);
  assert.match(text(html), /Before this run · 12 scripts · 340 objects/);
  assert.equal(count(html, '<button'), 0);
  assert.equal(count(render(h(ui.RunCheckpoint, { checkpoint: CP, onRestore() {} })), '<button'), 1);
  assert.equal(render(h(ui.RunCheckpoint, {})), '');
  const auto = { ...CP, id: 'cp0', kind: 'auto', createdAt: 900 };
  assert.equal(ui.checkpointForRun([auto, CP], { createdAt: 950, endedAt: 2000 }).id, 'cp1');
  assert.equal(ui.checkpointForRun([auto], { createdAt: 950, endedAt: 2000 }), null);
  assert.equal(ui.checkpointForRun([], { createdAt: 0 }), null);
});

test('Confirmation asks before restoring over later edits, and respects denial', () => {
  const ask = render(h(ui.RestoreConfirmation, { checkpoint: CP, onApprove() {}, onDeny() {} }));
  assert.match(text(ask), /Restore “Before door build”\?/);
  assert.match(text(ask), /Edits made after it was taken will be lost/);
  assert.equal(count(ask, '<button'), 2);
  const denied = render(h(ui.RestoreConfirmation, { checkpoint: CP, decision: 'denied' }));
  assert.match(text(denied), /Restore declined\. Nothing was changed\./);
  assert.equal(count(denied, '<button'), 0);
  assert.match(text(render(h(ui.RestoreConfirmation, { checkpoint: CP, decision: 'approved' }))), /Restore authorized/);
  assert.equal(render(h(ui.RestoreConfirmation, {})), '');
});

test('Attachments list what was sent and what was produced; nothing when empty', () => {
  const html = render(h(ui.TurnAttachments, {
    sent: [{ kind: 'image', name: 'ref.png', attachmentId: 'a1', mime: 'image/png', size: 2048 }],
    produced: [{ name: 'notes/plan.md', mime: 'text/markdown', size: 100 }],
  }));
  assert.match(text(html), /Sentref\.pngimage\/png2 KB/);
  assert.match(text(html), /Producednotes\/plan\.md/);
  assert.match(text(html), /100 bytes/);
  assert.equal(render(h(ui.TurnAttachments, { sent: [], produced: null })), '');
  assert.equal(render(h(ui.TurnAttachments, {})), '');
});

test('UI09 Message and UI11 Conversation render a persisted exchange once', () => {
  const html = render(h(ui.Conversation, null, h(ui.ConversationContent, { role: 'log' },
    h(ui.Message, { from: 'user' }, h(ui.MessageContent, null, 'Build a door')),
    h(ui.Message, { from: 'assistant' }, h(ui.MessageContent, null, h(ui.MessageResponse, null, 'Added **Door** to Workspace.'))))));
  assert.equal(count(text(html), 'Build a door'), 1);
  assert.match(html, /is-user/);
  assert.match(html, /is-assistant/);
  // RESTATED 2026-10-01: upstream MessageResponse is Streamdown, which draws bold as its own strong span.
  assert.match(html, /data-streamdown="strong"[^>]*>Door</);
  assert.match(html, /role="log"/);
});

test('UI07 Prompt Input renders a disabled composer with its submit control', () => {
  const html = render(h(ui.PromptInput, { onSubmit() {} },
    h(ui.PromptInputBody, null, h(ui.PromptInputTextarea, { disabled: true, placeholder: 'Connect Studio to start' })),
    h(ui.PromptInputFooter, null, h(ui.PromptInputSubmit, { disabled: true, status: 'ready' }))));
  assert.match(html, /<textarea[^>]*disabled/);
  assert.match(html, /placeholder="Connect Studio to start"/);
  assert.match(html, /<button[^>]*aria-label="Submit"[^>]*disabled|<button[^>]*disabled[^>]*aria-label="Submit"/);
});
