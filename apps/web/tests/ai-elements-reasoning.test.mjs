/**
 * THE TURN'S REASONING IS AI ELEMENTS' REASONING, AND IT BEHAVES AS THE OWNER ASKED (2026-10-01).
 *
 * Restated 2026-10-01 when the home-made Reasoning (reasoning-compat.tsx, a local Collapsible, a
 * reasoning.css) was replaced by the genuine upstream component. What this suite protected then
 * still holds, now proved against the real component's markup and the turn's own guard:
 *
 *   * it is upstream's Reasoning, from the one revision the NOTICE names, under its licence;
 *   * while a step streams it is OPEN and says "Thinking…"; when the step has ended it is CLOSED and
 *     says "Thought for N seconds" (whole seconds, at least one);
 *   * its trigger is a real button that reports whether it is expanded;
 *   * the reader's own toggle wins over the automatic open and close (measured 2026-09-23 on the
 *     owner's build: a card closed mid-stream reopened itself 261 ms later). Upstream does not
 *     guarantee this, so the turn holds `open` and lib/run-trace.ts decides each change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, element, renderWith, text } from './ui-bundle.mjs';
import { disclosureChange, reasoningSeconds } from '../src/lib/run-trace.ts';

const ROOT = join(WEB, 'src', 'components', 'ai-elements');
const NOTICE = readFileSync(join(ROOT, 'NOTICE'), 'utf8');
const LICENSE = readFileSync(join(ROOT, 'LICENSE'), 'utf8');

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { StepReasoning } from './src/components/ws/run-steps';
`, { name: 'ai-elements-reasoning', resolveDir: WEB });
const render = (el) => renderWith(ui.renderToStaticMarkup, el);

test('the Reasoning is the genuine upstream file, from the revision the NOTICE names', () => {
  assert.match(NOTICE, /FILE components\/ai-elements\/reasoning\.tsx\n\s+upstream: packages\/elements\/src\/reasoning\.tsx\n\s+sha256: [0-9a-f]{64}(?:\n\s+patch: .*\n\s+-> .*)*\nEND/);
  // The only patch it may carry is the lazy mermaid import (apps/web/scripts/vendor-ai-elements.mjs): the
  // package's own plugin pulled the 2.4 MB library into every workspace download.
  assert.match(NOTICE, /6a9d5b1822ffb10bba4bd97175f01edd7d8651cd/);
  assert.match(LICENSE, /Copyright 2023 Vercel, Inc\./);
  assert.match(LICENSE, /Apache License, Version 2\.0/);
});

test('while its step streams, the block is open and says it is thinking, with the streamed text', () => {
  const html = render(ui.h(ui.StepReasoning, { live: true, block: { id: 'r0', step: 1, text: 'Looking at the **shop** first.', startedAt: 0 } }));
  const trigger = element(html, /<button\b/);
  assert.ok(trigger, 'no trigger button');
  assert.match(trigger, /aria-expanded="true"/);
  assert.match(text(trigger), /Thinking\.\.\./);
  assert.match(html, /data-state="open"/);
  assert.match(text(html), /Looking at the shop first\./, 'the streamed reasoning is on the page, as markdown');
  assert.match(html, /data-streamdown="strong"[^>]*>shop</, 'rendered through Streamdown, not as raw asterisks');
});

test('once its step ended, the block is closed and says how long it thought', () => {
  const block = { id: 'r1', step: 2, text: 'Done thinking.', startedAt: 1_000, endedAt: 4_200 };
  assert.equal(reasoningSeconds(block), 4, 'whole seconds, rounded up');
  assert.equal(reasoningSeconds({ ...block, endedAt: 1_010 }), 1, 'never "0 seconds" for a thought that happened');
  assert.equal(reasoningSeconds({ ...block, endedAt: undefined }), undefined);
  const html = render(ui.h(ui.StepReasoning, { live: false, block }));
  const trigger = element(html, /<button\b/);
  assert.match(trigger, /aria-expanded="false"/);
  assert.match(text(trigger), /Thought for 4 seconds/);
  assert.doesNotMatch(text(html), /Done thinking\./, 'a closed block does not put its text on the page');
});

test("the reader's own toggle wins over the automatic open and close", () => {
  let s = { open: true, readerTouched: false };
  // The component's own moves stand until the reader acts: auto-close after the step.
  s = disclosureChange(s, false, false);
  assert.deepEqual(s, { open: false, readerTouched: false });
  // The reader opens it again…
  s = disclosureChange(s, true, true);
  assert.deepEqual(s, { open: true, readerTouched: true });
  // …and neither an automatic close nor an automatic open can move it after that.
  assert.equal(disclosureChange(s, false, false), s);
  const closedByReader = disclosureChange(s, false, true);
  assert.equal(closedByReader.open, false);
  assert.equal(disclosureChange(closedByReader, true, false), closedByReader, 'the 261 ms reopen');
});

test('the turn wires the guard: the trigger marks a click as the reader\'s before Radix toggles', () => {
  const src = readFileSync(join(WEB, 'src', 'components', 'ws', 'run-steps.tsx'), 'utf8');
  assert.match(src, /<Reasoning\b[^>]*\bopen=\{state\.open\}[^>]*\bonOpenChange=\{onOpenChange\}/, 'open is controlled by the turn');
  assert.match(src, /<ReasoningTrigger onClick=\{\(\) => \{ byReader\.current = true; \}\} \/>/);
  assert.match(src, /setState\(\(s\) => disclosureChange\(s, next, reader\)\)/);
});
