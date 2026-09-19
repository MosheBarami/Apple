import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('model selection is independent of the build specialist', () => {
  const workspace = read('routes/workspace.tsx');
  assert.match(workspace, /useState<ProductModel>\('apple'\)/);
  assert.match(workspace, /sendChat\(text, PRODUCT_MODE_TO_SPECIALIST\[mode\], attachments, productModel\)/);
  assert.match(workspace, /editAndResend\([^;]+productModel\)/);
  assert.match(workspace, /productModel=\{productModel\}/);
});

test('model picker uses model vocabulary and offers a real upgrade route', () => {
  const composer = read('components/ws/composer.tsx');
  assert.match(composer, /PRODUCT_MODELS\.map/);
  assert.doesNotMatch(composer, /PRODUCT_MODES_OFFERED\.map/);
  assert.match(composer, /canUseProductModel\(/);
  assert.match(composer, /onUpgrade\??\./);
  assert.match(composer, /Subscribers/);
});

test('chat and edit frames carry the selected model independently', () => {
  const socket = read('lib/use-project-socket.ts');
  const chat = socket.slice(socket.indexOf('const sendChat ='));
  const edit = socket.slice(socket.indexOf('const editAndResend ='), socket.indexOf('const sendChat ='));
  assert.match(chat, /type: 'chat'[^\n]+productModel/);
  assert.match(edit, /type: 'edit_resend'[^\n]+productModel/);
});
