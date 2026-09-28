/**
 * ONE ENGINE IN THE BROWSER (V3 gate G01).
 *
 * Apple is the only engine, on every plan. It replaced the model picker, the remembered model
 * choice and the MAX wordmark (tests/model-picker, model-choice, model-name and
 * product-model-selection, removed with them). These tests hold the browser's half:
 *
 *   * there is no picker, no model chip and no remembered choice to come back;
 *   * the composer takes no model and gates nothing on one: no tier lock, no ×N credits badge, no
 *     "upgrade for this model" copy;
 *   * the workspace sends `productModel: 'apple'` on both frames, still independent of the mode and
 *     the Autonomous grant, and never asks the account which models it may use.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, decomment } from './ui-bundle.mjs';

const read = (file) => decomment(readFileSync(join(WEB, 'src', file), 'utf8'));

test('the picker, the model chip and the remembered choice are gone', () => {
  for (const file of [
    'components/ws/model-picker.tsx',
    'components/ws/model-picker-model.ts',
    'components/ws/model-picker.css',
    'components/ws/model-chip.tsx',
    'components/picks/composer/model-list-fx.tsx',
    'lib/model-choice.ts',
  ]) assert.equal(existsSync(join(WEB, 'src', file)), false, `${file} is back`);
  assert.doesNotMatch(read('lib/api.ts'), /fetchModels|\/api\/models/);
});

test('the composer takes no model and gates nothing on one', () => {
  const composer = read('components/ws/composer.tsx');
  for (const gone of [/productModel/, /onModelChange/, /modelPlan/, /onUpgrade/, /ModelPicker/, /canUseProductModel/, /modelRefusal/, /modelUnavailable/]) {
    assert.doesNotMatch(composer, gone);
  }
  assert.doesNotMatch(composer, /Requires Apple MAX|Apple MAX|×\s*\d|credits badge/i);
  assert.doesNotMatch(read('design/system.css'), /apple-max-name|max-ink/);
  // Stop is another stage's control and stays.
  assert.match(composer, /Stop/);
});

test('the workspace sends Apple on every plan, beside the mode and the Autonomous grant', () => {
  const workspace = read('routes/workspace.tsx');
  assert.match(workspace, /const productModel: ProductModel = 'apple';/);
  assert.match(workspace, /sendChat\(text, mode, attachments, productModel, autonomous\)/);
  assert.match(workspace, /editAndResend\([^;]+mode, productModel, autonomous\)/);
  assert.doesNotMatch(workspace, /modelAllowed|chooseProductModel|fetchModels|productModel=\{/);
});

test('chat and edit frames carry the one model field, and no second one', () => {
  const socket = read('lib/use-project-socket.ts');
  const chat = socket.slice(socket.indexOf('const sendChat ='));
  const edit = socket.slice(socket.indexOf('const editAndResend ='), socket.indexOf('const sendChat ='));
  assert.match(chat, /type: 'chat'[^\n]+productModel/);
  assert.match(edit, /type: 'edit_resend'[^\n]+productModel/);
  assert.doesNotMatch(chat.slice(0, chat.indexOf('\n  );')), /[{,]\s*model\b|\bmodel \?/, 'the chat frame carries a second model field');
  assert.doesNotMatch(edit, /[{,]\s*model\b|\bmodel \?/, 'the edit frame carries a second model field');
});
