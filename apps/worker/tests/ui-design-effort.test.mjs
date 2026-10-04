/**
 * INTERFACE WORK IS HALF THE PRODUCT AND THE THINKING POLICY COULD NOT SEE IT.
 *
 * Defect D1bfeeb. `uiDesignTask` is classified on every request, stored on `agent.traits`, spread
 * into `chooseEffort`'s signals on every step — and `chooseEffort` never branched on it. So on the
 * free StudPilot tier in Plan mode, "make the lobby lamp warmer" got careful thinking (it matches
 * `visualDesignTask`, which IS read) and "fix the tooltip on the settings icon" got cheap thinking.
 * Same policy, same product, same person.
 *
 * The type contract carried the same hole from the other end: `AgentState.traits` was a `Pick` that
 * omitted `uiDesignTask` while the assignment wrote the whole classification, so the value existed
 * in storage and did not exist in the type — which is why no reader was ever written against it.
 *
 * WHERE THIS WAS OBSERVABLE: Plan mode on non-MAX StudPilot, the one lane whose baseline was `low`.
 * V3 G01 removed Plan mode, so every request now runs the builder baseline, which is already
 * `high`; the escalation the signal buys is not observable through `chooseEffort` any more. What is
 * still asserted: the classification, the resulting effort, that talk stays cheap, and the type
 * contract. If a lower baseline ever returns, re-isolate the signal against it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'ui-effort-'));
const OUT = join(TMP, 'reasoning.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'reasoning.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);
const R = await import(pathToFileURL(OUT).href);

/** One step of a real run. */
const planStep = (text, over = {}) =>
  R.chooseEffort({
    mode: 'agent',
    productModel: 'apple',
    step: 1,
    highEffortUsed: 0,
    ...R.classifyRequest(text),
    ...over,
  });

test('the one baseline is already high, so the escalation below is not isolated (see header)', () => {
  const plain = planStep('what is the id of this place');
  assert.equal(plain.effort, 'high', `the baseline is ${plain.effort}; if it is lower again, re-isolate the signal`);
});

test('a UI request is classified as UI and thought about accordingly', () => {
  for (const text of [
    'fix the tooltip on the settings icon',
    'the shop modal buttons are misaligned',
    'redesign the inventory panel',
    'the leaderboard HUD font is too small',
  ]) {
    const traits = R.classifyRequest(text);
    assert.equal(traits.uiDesignTask, true, `"${text}" was not classified as interface work`);
    const choice = planStep(text);
    assert.equal(choice.effort, 'high', `"${text}" was thought about at ${choice.effort}`);
  }
});

test('a UI-only request now gets what a spatial request already got', () => {
  const spatial = planStep('make the lamp in the lobby warmer');
  const ui = planStep('add a tooltip to the settings icon');
  assert.equal(spatial.effort, 'high', 'the fixture is wrong: spatial work was always escalated');
  assert.equal(ui.effort, spatial.effort, 'interface work is still the half the policy cannot see');
});

test('the escalation is not indiscriminate — talk and plain questions stay cheap', () => {
  assert.equal(planStep('hi').effort, 'low');
  // Was a Hebrew greeting, replaced when the language was removed on 2026-09-20. The property is
  // unchanged: a greeting is talk and must stay cheap.
  assert.equal(planStep('hey').effort, 'low');
  // "settings" is a UI word; a bare greeting containing none of them must not be dragged up.
  assert.equal(planStep('thanks').effort, 'low');
  assert.equal(R.classifyRequest('raise the terrain near the river').uiDesignTask, false);
});

test('the signal survives the type contract as well as the storage round trip', () => {
  const session = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  const pick = /traits\?: Pick<ReasoningSignals, ([^>]*)>/.exec(session);
  assert.ok(pick, 'AgentState.traits moved; this guard no longer reads it');
  assert.ok(
    pick[1].includes("'uiDesignTask'"),
    'AgentState.traits omits uiDesignTask again — the value is stored and the type denies it',
  );
  // And the round trip itself: a persisted traits object spread back into the signals still raises.
  const restored = JSON.parse(JSON.stringify(R.classifyRequest('restyle the shop panel')));
  assert.equal(
    R.chooseEffort({ mode: 'agent', productModel: 'apple', step: 1, highEffortUsed: 0, ...restored }).effort,
    'high',
  );
});
