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

// RESTATED 2026-09-23: the Mode dropdown became a two-way radio switch (picks/composer/mode-switch.tsx),
// so both words are on screen at once instead of one behind a menu. The property is unchanged: the
// composer mounts a control labelled Mode, built from the ProductMode contract, whose checked radio is
// the current mode, whose choice calls back, and which gates neither side.
const SWITCH = read('components/picks/composer/mode-switch.tsx');

/** The mode control only: the radiogroup's own markup, from its label to its end. */
function modeMenu() {
  const from = SWITCH.indexOf('role="radiogroup"');
  assert.notEqual(from, -1, 'the mode control is not a radio group');
  const to = SWITCH.indexOf('</div>', from);
  assert.ok(to > from, 'the Mode control has no end — the slice would read the rest of the file');
  return SWITCH.slice(from, to);
}

test('the composer offers the choice, by name', () => {
  assert.match(COMPOSER, /import \{ ModeSwitch \} from '\.\.\/picks\/composer\/mode-switch'/);
  assert.match(COMPOSER, /<ModeSwitch mode=\{mode\} onModeChange=\{onModeChange\} \/>/);
  const menu = modeMenu();
  assert.match(menu, /aria-label="Mode"/);
  assert.match(menu, /PRODUCT_MODES\.map/, 'the control must be built from the ProductMode contract');
  // One radio per mode; the checked one is the current mode; choosing calls back.
  assert.match(menu, /role="radio"/);
  assert.match(menu, /aria-checked=\{mode === id\}/);
  assert.match(menu, /onClick=\{\(\) => onModeChange\(id\)\}/);
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
  assert.doesNotMatch(SWITCH, /canUseProductModel|disabled|aria-disabled|maxUpgradeAvailable/);
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
  // The one exception is the plan card's own "Build it" — the person's click, and the chip visibly
  // moves to Agent with it (2026-09-23). Anywhere else a mode change would be a quiet overrule.
  const withoutBuild = WORKSPACE.replace(/\? \(\) => \{ setMode\('agent'\); setBuildQueued\(true\); \}/, '');
  assert.doesNotMatch(withoutBuild, /setMode\('agent'\)/);
  assert.doesNotMatch(WORKSPACE, /setMode\('plan'\)/);
});
