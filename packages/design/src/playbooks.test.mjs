// Tests for L3.
//
// The load-bearing test in this file is `an omission is invisible to the check
// layer and visible to the playbook`. Everything else guards the machinery; that
// one is the measurement that makes L3 a rung rather than a second opinion, and
// docs/SOURCE-INTELLIGENCE.md §7 is explicit that "an unmeasured technique is not
// a rung."
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { RULES } from './rules.mjs';
import { audit } from './checks.mjs';
import {
  PLAYBOOKS,
  PLAYBOOK_IDS,
  STEP_STATUS,
  getPlaybook,
  composePlaybook,
  gradePlaybook,
  assertPlaybookIntegrity,
} from './playbooks.mjs';

const BENCH = '../../../apps/benchmark/crystal-canyon/src/client';
const readBench = (f) => readFileSync(new URL(`${BENCH}/${f}`, import.meta.url), 'utf8');

// ------------------------------------------------------------------ integrity
test('every playbook step cites rules that exist', () => {
  const { playbooks, steps } = assertPlaybookIntegrity();
  assert.ok(playbooks >= 3, `expected a substantive set, got ${playbooks}`);
  assert.ok(steps >= 10, `expected steps with substance, got ${steps}`);
});

test('integrity fails on a step citing a rule that was renamed away', () => {
  // The silent failure this guards: rename a rule in rules.mjs and a playbook step
  // goes on rendering with one fewer constraint than it claims to carry.
  const broken = [{
    id: 'x', taskClass: 'x', steps: [
      { id: 's', do: 'd', rules: ['panel.this-rule-was-renamed'], primitive: /a/, manual: /b/ },
    ],
  }];
  assert.throws(
    () => assertPlaybookIntegrity({ playbooks: broken }),
    /cites unknown rule "panel\.this-rule-was-renamed"/,
  );
});

test('integrity rejects a step with no rule behind it', () => {
  const broken = [{ id: 'x', taskClass: 'x', steps: [{ id: 's', do: 'd', rules: [], primitive: /a/, manual: /b/ }] }];
  assert.throws(() => assertPlaybookIntegrity({ playbooks: broken }), /cites no rules/);
});

test('a playbook never restates rule prose, so the rule stays the single source', () => {
  // Every word of constraint text must arrive from RULES at render time. If a step
  // duplicated a rule's sentence into its own `do`, the two would drift apart on
  // the first edit and only one of them would be the one under test.
  const ruleText = RULES.map((r) => r.rule);
  for (const pb of PLAYBOOKS) {
    for (const step of pb.steps) {
      for (const text of ruleText) {
        assert.ok(
          !step.do.includes(text),
          `${pb.id}.${step.id} restates rule prose verbatim; cite the id instead`,
        );
      }
    }
  }
});

// ------------------------------------------------------------------ the measurement
test('an omission is invisible to the check layer and visible to the playbook', () => {
  // A shop panel that does nothing at all. It has no footer reserve, no rows, no
  // price, no transition — and it violates nothing, because it does nothing.
  const omits = [
    'local gui = Instance.new("ScreenGui")',
    'local frame = Instance.new("Frame")',
    'frame.Size = UDim2.fromOffset(400, 300)',
    'frame.Parent = gui',
  ].join('\n');

  // L2, run properly — a real zero, not the empty-spec `ok: true` that
  // `audit(source, {})` returns by examining nothing.
  const checked = audit({ files: [{ path: 'omits.luau', source: omits }] });
  assert.equal(checked.ok, true, 'precondition: the check layer must find this clean');
  assert.deepEqual(checked.findings, [], 'precondition: no violations to detect');
  assert.equal(checked.enforced, 11, 'precondition: the checks were actually loaded');

  // L3 over the same source.
  const graded = gradePlaybook(omits, 'panel.shop');
  assert.equal(graded.ok, false);
  assert.deepEqual(graded.missing, ['footer', 'rows', 'price', 'transition']);
  assert.equal(graded.completeness.done, 1);

  // The rung, stated as an assertion: four defects, none of which L2 can express.
  assert.ok(graded.missing.length > checked.findings.length);
});

test('the playbook does not simply fail everything: real code passes it', () => {
  // A completeness check that fires on working code is a check that gets switched
  // off. Panels.luau is the shop panel this playbook was derived from.
  const graded = gradePlaybook(readBench('Panels.luau'), 'panel.shop', { path: 'Panels.luau' });
  assert.equal(graded.completeness.missing, 0, `missing: ${graded.missing.join(', ')}`);
  assert.deepEqual(graded.violations, []);
  assert.equal(graded.ok, true);
});

test('a step done without the owned primitive reads as re-invention, not as absence', () => {
  // §G's complaint is that Golem "defaults to inventing every Roblox GUI from a
  // blank canvas". `manual` is that defaulting, detected — and it must stay
  // distinct from `missing`, because the two call for different responses.
  const handRolled = [
    'local frame = Instance.new("Frame")',
    'local footer = 40',
    'local layout = Instance.new("UIListLayout")',
    'local price = 250',
    'TweenService:Create(frame, info, { Position = target }):Play()',
  ].join('\n');
  const graded = gradePlaybook(handRolled, 'panel.shop');
  assert.deepEqual(graded.missing, [], 'every step was attempted');
  assert.deepEqual(
    graded.reinvented,
    ['plate', 'footer', 'rows', 'price', 'transition'],
    'and every one of them bypassed the library',
  );
  for (const s of graded.steps) assert.equal(s.status, STEP_STATUS.MANUAL);
});

test('Hud.luau assigns z-order off one number line, and the playbook says so', () => {
  // Not a synthetic fixture: `zAbove()` exists in Theme.luau and Hud.luau does not
  // reach for it, writing `parent.ZIndex + 3`, `+ 4`, `+ 2` at each call site
  // instead — which is exactly what layout.z-order-is-bands-with-headroom warns
  // about. If this test ever fails because Hud.luau was fixed, delete it.
  const graded = gradePlaybook(readBench('Hud.luau'), 'hud.cluster', { path: 'Hud.luau' });
  assert.deepEqual(graded.reinvented, ['z-band']);
  assert.deepEqual(graded.missing, []);
});

test('the press step names the path all three devices arrive on', () => {
  // Regression for a defect in this file's own first draft: the step named
  // `MouseButton1Down` as the primitive, which covers the mouse and neither touch
  // nor the gamepad's ButtonA. Theme.luau:1088 documents why that is wrong.
  const step = getPlaybook('button.interactive').steps.find((s) => s.id === 'press');
  assert.ok(step.primitive.test('btn.InputBegan:Connect(function(input)'));
  assert.ok(step.manual.test('btn.MouseButton1Down:Connect(function()'));
  const graded = gradePlaybook(readBench('Theme.luau'), 'button.interactive', { path: 'Theme.luau' });
  assert.deepEqual(graded.missing, []);
  assert.deepEqual(graded.reinvented, [], 'Theme.luau wires every state the intended way');
});

// ------------------------------------------------------------------ rendering
test('a composed playbook is ordered and carries live rule text', () => {
  const { text, used, steps } = composePlaybook('panel.shop');
  assert.equal(steps, 5);
  assert.match(text, /^PLAYBOOK: a shop or upgrades panel/);
  // Ordered — this is the difference from composeBrief, which ranks by relevance
  // and says nothing about what to do first.
  assert.ok(text.indexOf('\n1. ') < text.indexOf('\n2. '));
  assert.ok(text.indexOf('\n4. ') < text.indexOf('\n5. '));
  // Live text, not a copy.
  const cited = RULES.find((r) => r.id === used[0]);
  assert.ok(text.includes(cited.rule), 'rule text must be pulled from the library');
  assert.ok(text.includes(cited.because));
});

test('a reference-only rule never contributes tokens to a rendered playbook', () => {
  // The same licence boundary rules.mjs enforces. A playbook is another render
  // path, and a render path that leaked tokens would be a licence breach in a
  // second place.
  for (const id of PLAYBOOK_IDS) {
    const { text, used } = composePlaybook(id);
    for (const ruleId of used) {
      const rule = RULES.find((r) => r.id === ruleId);
      if (rule.provenance.kind !== 'reference-only' || !rule.tokens) continue;
      for (const value of Object.values(rule.tokens)) {
        assert.ok(!text.includes(String(value)), `${id} leaked a reference-only token from ${ruleId}`);
      }
    }
  }
});

test('an unknown playbook id names the ones that exist', () => {
  assert.throws(() => getPlaybook('panel.nope'), /unknown id "panel\.nope".*panel\.shop/s);
});
