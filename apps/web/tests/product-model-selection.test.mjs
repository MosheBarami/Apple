import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('model selection is independent of the Plan/Agent mode and Autonomous capability', () => {
  const workspace = read('routes/workspace.tsx');
  assert.match(workspace, /useState<ProductModel>\('apple'\)/);
  //[[ RESTATED 2026-09-23 (D-VISION-1). Bring-your-own-key is gone, so the sixth argument (the model
  //   on a key) went with it. The property is unchanged: the chosen model rides on both frames, next
  //   to — and independent of — the mode and the Autonomous grant. ]]
  assert.match(workspace, /sendChat\(text, mode, attachments, productModel, autonomous\)/);
  assert.match(workspace, /editAndResend\([^;]+mode, productModel, autonomous\)/);
  assert.match(workspace, /productModel=\{productModel\}/);
  assert.doesNotMatch(workspace, /customerModel|runModel/);
});

test('model picker uses model vocabulary and offers a real upgrade route', () => {
  //[[ RESTATED 2026-09-23. The picker is no longer a dropdown inside composer.tsx: it is AI Elements'
  //   ModelSelector in components/ws/model-picker.tsx, with its rows grouped in model-picker-model.ts.
  //   The claim is unchanged — the MODEL picker is not built out of the Plan/Agent vocabulary, Apple's
  //   rows come from PRODUCT_MODELS, the entitlement rule is the shared one, and a locked MAX row leads
  //   to the upgrade route. ]]
  const picker = read('components/ws/model-picker.tsx');
  const groups = read('components/ws/model-picker-model.ts');
  const composer = read('components/ws/composer.tsx');
  for (const src of [picker, groups]) assert.doesNotMatch(src, /PRODUCT_MODES?(_OFFERED)?\b/);
  assert.match(picker, /ModelSelectorItem/);
  //[[ RESTATED 2026-09-23 (D-VISION-1). The rows are the registry marked by `modelListing` (the
  //   shared rule, the same one GET /api/models runs), not Apple's two ids; the upgrade route is the
  //   picker's own link and the composer's answer to a locked row. tests/model-picker.test.mjs
  //   checks the rows by behaviour; this holds that the rule is the shared one and not a copy. ]]
  assert.match(groups, /modelListing\(/, 'the fallback marking is the shared rule');
  assert.match(composer, /canUseProductModel\(/);
  assert.match(composer, /onUpgrade\b/);
  assert.match(picker, /onUpgrade\(\)/);
});

test('chat and edit frames carry the selected model independently', () => {
  const socket = read('lib/use-project-socket.ts');
  const chat = socket.slice(socket.indexOf('const sendChat ='));
  const edit = socket.slice(socket.indexOf('const editAndResend ='), socket.indexOf('const sendChat ='));
  assert.match(chat, /type: 'chat'[^\n]+productModel/);
  assert.match(edit, /type: 'edit_resend'[^\n]+productModel/);
  //[[ RESTATED 2026-09-23 (D-VISION-1). The frames carried a second, separate `model` for a model on
  //   the customer's own key; that lane went with BYOK. The property now: the registry id in
  //   `productModel` is the ONLY model a frame can name — no second field the worker might honour. ]]
  assert.doesNotMatch(chat.slice(0, chat.indexOf('\n  );')), /[{,]\s*model\b|\bmodel \?/, 'the chat frame still carries a second model field');
  assert.doesNotMatch(edit, /[{,]\s*model\b|\bmodel \?/, 'the edit frame still carries a second model field');
});

test('a model row that cannot be chosen says so, in both channels', () => {
  //[[ RESTATED 2026-09-23 onto the ModelSelector rows. The property is the one this test has always
  //   held: a row that cannot be had carries aria-disabled (not `disabled`, which would take it out of
  //   the keyboard order and explain nothing), and a sighted reader sees it too. Now it covers rows
  //   locked for a missing key as well as MAX. tests/model-picker.test.mjs renders it. ]]
  const picker = read('components/ws/model-picker.tsx');
  const from = picker.indexOf('<ModelSelectorItem');
  const to = picker.indexOf('</ModelSelectorItem>', from);
  assert.ok(from !== -1 && to > from, 'the model row was not found');
  const row = picker.slice(from, to);
  assert.match(row, /aria-disabled=\{row\.available \? undefined : true\}/);
  assert.match(row, /is-unavailable/, 'and a sighted reader gets it too');
  assert.match(row, /\{row\.note\}/, 'the reason is the row\'s own second line');
  assert.doesNotMatch(row, /\sdisabled=/, 'a disabled row leaves the keyboard order and explains nothing');
  // The signal must be drawn, not just named: a class with no rule is a comment.
  const css = read('components/ws/model-picker.css');
  assert.match(css, /\.is-unavailable/);
});
