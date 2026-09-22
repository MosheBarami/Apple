import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('model selection is independent of the Plan/Agent mode and Autonomous capability', () => {
  const workspace = read('routes/workspace.tsx');
  assert.match(workspace, /useState<ProductModel>\('apple'\)/);
  //[[ RESTATED 2026-09-23 (D-BYOK-1). Both calls gained a sixth argument — the model on the
  //   customer's own key — so the pins now say the Apple fields still ride on them, and separately
  //   that the key model does too. ]]
  assert.match(workspace, /sendChat\(text, mode, attachments, productModel, autonomous, runModel\)/);
  assert.match(workspace, /editAndResend\([^;]+mode, productModel, autonomous, runModel\)/);
  assert.match(workspace, /const runModel = customerModel \?\? undefined;/);
  assert.match(workspace, /productModel=\{productModel\}/);
  assert.match(workspace, /customerModel=\{customerModel\}/);
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
  assert.match(groups, /\[\.\.\.PRODUCT_MODELS\]/, 'Apple\'s rows are the shared list when the catalogue is absent');
  assert.match(groups, /canUseProductModel\(/);
  assert.match(composer, /canUseProductModel\(/);
  assert.match(composer, /onUpgrade\??\./);
  assert.match(groups, /Subscribers/);
});

test('chat and edit frames carry the selected model independently', () => {
  const socket = read('lib/use-project-socket.ts');
  const chat = socket.slice(socket.indexOf('const sendChat ='));
  const edit = socket.slice(socket.indexOf('const editAndResend ='), socket.indexOf('const sendChat ='));
  assert.match(chat, /type: 'chat'[^\n]+productModel/);
  assert.match(edit, /type: 'edit_resend'[^\n]+productModel/);
  // `model` only when a model on a key was chosen: an Apple run's frame is the one it always was.
  assert.match(chat, /type: 'chat'[^\n]+\.\.\.\(model \? \{ model \} : \{\}\)/);
  assert.match(edit, /type: 'edit_resend'[^\n]+\.\.\.\(model \? \{ model \} : \{\}\)/);
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
