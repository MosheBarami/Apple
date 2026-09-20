//[[ WHO CHOOSES BETWEEN LOOKING AND BUILDING.
//
// B2 of docs/spec/DONE.md: "Plan (looks and proposes) or Agent (builds) is chosen by the person."
//
// An audit of the deployed product swept every button, link, label, option, menuitem,
// menuitemradio and tab in the workspace for /plan|agent/ and found NONE. The modes were not
// missing — `PRODUCT_MODE_INFO` names both, `workspace.tsx` held the state and sent it with every
// message, and the worker routes Plan to `clay`, whose toolset is PLAN_TOOLS: no edit_script, no
// create_instances, no run_luau. The only surfaces that could set it were the Automations form
// and a Roadmap handoff. A person sending a chat message could not choose.
//
// The chain this file pins is the whole of that path: a control in the composer -> the workspace
// state -> the specialist on the wire. Break any link and the choice stops reaching the worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_MODES_OFFERED, PRODUCT_MODE_INFO, PRODUCT_MODE_TO_SPECIALIST } from '@golem/shared';

/** Comments stripped: a comment explaining a removed control must not read as the control. */
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const COMPOSER = read('components/ws/composer.tsx');
const WORKSPACE = read('routes/workspace.tsx');

/** The mode menu only — the composer has two popovers and they must not be read as one. */
function modeMenu() {
  const from = COMPOSER.indexOf('label="Mode"');
  assert.notEqual(from, -1, 'the composer has no menu labelled "Mode"');
  return COMPOSER.slice(from, COMPOSER.indexOf('</Popover>', from));
}

test('the composer offers the choice, by name', () => {
  assert.match(COMPOSER, /aria-label=\{`Mode: \$\{PRODUCT_MODE_INFO\[mode\]\.name\}`\}/);
  const menu = modeMenu();
  assert.match(menu, /PRODUCT_MODES_OFFERED\.map/, 'the menu must be built from the offered list');
  assert.match(menu, /role="menuitemradio"/);
  assert.match(menu, /aria-checked=\{id === mode\}/);
  assert.match(menu, /onModeChange\(id\)/);
});

test('it offers exactly what the product offers — no more, no fewer', () => {
  // Not restated here. `Super Agent` survived being removed once by being written down twice.
  assert.deepEqual([...PRODUCT_MODES_OFFERED], ['plan', 'agent']);
  assert.equal(PRODUCT_MODE_INFO.plan.name, 'Plan');
  assert.equal(PRODUCT_MODE_INFO.agent.name, 'Agent');
  assert.match(modeMenu(), /PRODUCT_MODE_INFO\[id\]\.name/);
  assert.match(modeMenu(), /PRODUCT_MODE_INFO\[id\]\.blurb/, 'the blurb must come from the shared vocabulary');
});

test('NEITHER ENTRY IS GATED — the defect the MAX row still has, not repeated', () => {
  //[[ The model menu shows an "Apple MAX" entry that carries no disabled attribute, looks
  //   selectable, and silently refuses. Plan maps to the same free specialist a free account
  //   already runs, so there is nothing here to gate and nothing to pretend about. ]]
  const menu = modeMenu();
  assert.doesNotMatch(menu, /canUseProductModel|disabled|aria-disabled|maxUpgradeAvailable/);
});

test('the choice reaches the workspace state that is already on the wire', () => {
  assert.match(WORKSPACE, /mode=\{mode\}/);
  assert.match(WORKSPACE, /onModeChange=\{setMode\}/);
  assert.match(WORKSPACE, /sendChat\(text, PRODUCT_MODE_TO_SPECIALIST\[mode\], attachments, productModel\)/);
  assert.equal(PRODUCT_MODE_TO_SPECIALIST.plan, 'clay');
  assert.equal(PRODUCT_MODE_TO_SPECIALIST.agent, 'stone');
});

test('and nothing quietly overrules it', () => {
  //[[ `onModelChange` used to be `(next) => { setProductModel(next); setMode('agent'); }`. With no
  //   mode control on screen that reset was invisible; with one it would move a chip the person
  //   just set, from a control about a different question. ]]
  assert.doesNotMatch(WORKSPACE, /setMode\('agent'\)/);
  assert.doesNotMatch(WORKSPACE, /setMode\('plan'\)/);
});
