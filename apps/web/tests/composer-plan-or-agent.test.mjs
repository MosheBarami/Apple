//[[ WHO CHOOSES BETWEEN LOOKING AND BUILDING.
//
// B2 of docs/spec/DONE.md: "Plan (looks and proposes) or Agent (builds) is chosen by the person."
//
// An audit of the deployed product swept every button, link, label, option, menuitem,
// menuitemradio and tab in the workspace for /plan|agent/ and found NONE. The modes were not
// missing — `PRODUCT_MODE_INFO` names both, `workspace.tsx` held the state and sent it with every
// message, and the worker routes Plan to the read-only PLAN_TOOLS set: no edit_script, no
// create_instances, no run_luau. The only surfaces that could set it were the Automations form
// and a Roadmap handoff. A person sending a chat message could not choose.
//
// The chain this file pins is the whole of that path: a control in the composer -> the workspace
// state -> the ProductMode on the wire. Break any link and the choice stops reaching the worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PRODUCT_MODES, PRODUCT_MODE_INFO } from '@golem/shared';

/** Comments stripped: a comment explaining a removed control must not read as the control. */
const read = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const COMPOSER = read('components/ws/composer.tsx');
const WORKSPACE = read('routes/workspace.tsx');

// The local stand-in for Radix's DropdownMenu, which the shadcn wrappers in ui/dropdown-menu.tsx use.
const MENU = read('components/ai-elements/ui/dropdown-menu-primitive.tsx');

/**
 * The mode menu only — the composer has three menus and they must not be read as one. Since
 * 2026-09-22 each is an AI Elements PromptInputActionMenu; the slice ends at its own content's close.
 */
function modeMenu() {
  const from = COMPOSER.indexOf('aria-label="Mode"');
  assert.notEqual(from, -1, 'the composer has no menu labelled "Mode"');
  const to = COMPOSER.indexOf('</PromptInputActionMenuContent>', from);
  assert.ok(to > from, 'the Mode menu has no end — the slice would read the rest of the file');
  return COMPOSER.slice(from, to);
}

test('the composer offers the choice, by name', () => {
  assert.match(COMPOSER, /aria-label=\{`Mode: \$\{PRODUCT_MODE_INFO\[mode\]\.name\}`\}/);
  const menu = modeMenu();
  assert.match(menu, /PRODUCT_MODES\.map/, 'the menu must be built from the ProductMode contract');
  // A radio group whose value is the current mode, one radio item per mode, choosing calls back.
  // The roles are the vendored primitive's: a RadioItem IS a menuitemradio whose aria-checked is
  // "its value is the group's value" — asserted there, not re-spelled here.
  assert.match(menu, /<DropdownMenuRadioGroup value=\{mode\} onValueChange=\{\(id\) => onModeChange\(id as ProductMode\)\}>/);
  assert.match(menu, /<DropdownMenuRadioItem key=\{id\} value=\{id\}/);
  assert.match(MENU, /role: 'menuitemradio',\s*checked: group\?\.value === value,/);
  assert.match(MENU, /'aria-checked': internals\.checked === undefined \? undefined/);
});

test('it offers exactly what the product offers — no more, no fewer', () => {
  // Not restated here: the offered list is the contract.
  assert.deepEqual([...PRODUCT_MODES], ['plan', 'agent']);
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
  assert.match(WORKSPACE, /onModeChange=\{\(next\) => \{/);
  // RESTATED 2026-09-23: the call gained a sixth argument, the model on the customer's own key
  // (D-BYOK-1). The property is that the attachments, mode, model and autonomy all still ride on it,
  // not that it ends after `autonomous`.
  assert.match(WORKSPACE, /sendChat\(text, mode, attachments, productModel, autonomous\b/);
  assert.match(WORKSPACE, /autonomous=\{autonomous\}/);
});

test('Autonomous is a separate Agent capability, never a third mode', () => {
  assert.match(COMPOSER, /role="switch"/);
  assert.match(COMPOSER, /aria-checked=\{autonomous && mode === 'agent'\}/);
  assert.match(COMPOSER, /disabled=\{running \|\| mode === 'plan'\}/);
  assert.match(WORKSPACE, /if \(next === 'plan'\) setAutonomous\(false\)/);
});

test('and nothing quietly overrules it', () => {
  //[[ `onModelChange` used to be `(next) => { setProductModel(next); setMode('agent'); }`. With no
  //   mode control on screen that reset was invisible; with one it would move a chip the person
  //   just set, from a control about a different question. ]]
  assert.doesNotMatch(WORKSPACE, /setMode\('agent'\)/);
  assert.doesNotMatch(WORKSPACE, /setMode\('plan'\)/);
});
