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
  //[[ SCOPED TO THE MODEL MENU, because the composer now has two menus and the ban was written
  //   when it had one. The claim was never "this file may not mention modes" — it is that the
  //   MODEL picker must not be built out of the mode vocabulary, which is how "Super Agent"
  //   survived being removed from the product. Read as a whole-file ban it also forbids the
  //   Plan/Agent picker that B2 of the owner's definition of done requires, so the ban would have
  //   made the product wrong in order to keep the test green. ]]
  const from = composer.indexOf('label="Model"');
  assert.notEqual(from, -1, 'the model menu has lost its label');
  const modelMenu = composer.slice(from, composer.indexOf('</Popover>', from));
  assert.match(modelMenu, /PRODUCT_MODELS\.map/);
  assert.doesNotMatch(modelMenu, /PRODUCT_MODES?(_OFFERED)?\b/);
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

test('a model row that cannot be chosen says so, in both channels', () => {
  //[[ NOT A FIX FOR B3 — Apple MAX still cannot be selected by anybody on this deployment, and
  //   this file cannot change that: it needs paid subscriptions. What it fixes is the row's
  //   claim about itself. An audit found the MAX entry carrying no `disabled` and no
  //   `aria-disabled`, so it read as selectable to a sighted person and to a screen reader, and a
  //   click left the chip unchanged with the explanation raised somewhere else on the screen.
  //   `aria-disabled` and not `disabled`, deliberately: the click must survive, because it is the
  //   only place the product says what MAX is and that it is not purchasable yet. ]]
  const composer = read('components/ws/composer.tsx');
  const from = composer.indexOf('label="Model"');
  const menu = composer.slice(from, composer.indexOf('</Popover>', from));
  assert.match(menu, /aria-disabled=\{available \? undefined : true\}/);
  assert.match(menu, /is-unavailable/, 'and a sighted reader gets it too');
  assert.doesNotMatch(menu, /\sdisabled=/, 'a disabled button leaves the tab order and explains nothing');
  // The signal must be drawn, not just named: a class with no rule is a comment.
  const css = read('components/ws/composer.css');
  assert.match(css, /\.is-unavailable/);
});
