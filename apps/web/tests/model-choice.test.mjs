/**
 * THE REMEMBERED MODEL AND THE DOWNGRADE FALLBACK (D-VISION-1).
 *
 *   * lib/model-choice.ts remembers the last choice per account on this device, reads back only a
 *     registry id, and never throws — `localStorage` throws in a private window;
 *   * the workspace restores that choice once the account is read, and only ever through
 *     `bestEntitledModel`, so a choice made on a plan that has since lapsed falls back to the best
 *     model the account may still use — and a paying person is not moved off their model while the
 *     plan is still unknown.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, decomment } from './ui-bundle.mjs';

const ui = await bundle(`
  export { readModelChoice, saveModelChoice } from './src/lib/model-choice';
  export { MODEL_REGISTRY, bestEntitledModel, canUseModel } from '@golem/shared';
`, { name: 'model-choice', resolveDir: WEB });

function storage({ throws = false } = {}) {
  const m = new Map();
  const fail = () => { if (throws) throw new Error('SecurityError'); };
  return {
    getItem: (k) => (fail(), m.has(k) ? m.get(k) : null),
    setItem: (k, v) => (fail(), m.set(k, String(v))),
    removeItem: (k) => (fail(), m.delete(k)),
    raw: m,
  };
}

test('a choice is remembered per account, and only a registry id is ever read back', () => {
  const s = storage();
  globalThis.window = { localStorage: s };
  ui.saveModelChoice('user-a', 'gpt-5.6');
  ui.saveModelChoice('user-b', 'apple-max');
  assert.equal(ui.readModelChoice('user-a'), 'gpt-5.6');
  assert.equal(ui.readModelChoice('user-b'), 'apple-max', 'one account\'s choice is not another\'s');
  assert.equal(ui.readModelChoice('user-c'), null);
  for (const [k] of s.raw) s.raw.set(k, 'openai/gpt-6-sol');
  assert.equal(ui.readModelChoice('user-a'), null, 'a stored value that is not a registry id is not a model');
  assert.equal(ui.readModelChoice(''), null, 'no account, nothing remembered');
});

test('storage that throws never stops the page', () => {
  globalThis.window = { localStorage: storage({ throws: true }) };
  assert.doesNotThrow(() => ui.saveModelChoice('user-a', 'apple'));
  assert.equal(ui.readModelChoice('user-a'), null);
});

test('bestEntitledModel keeps an entitled choice and otherwise falls back to an Apple lane the plan includes', () => {
  const plans = ['free', 'builder', 'studio', 'enterprise', undefined];
  for (const plan of plans) {
    for (const m of ui.MODEL_REGISTRY) {
      const got = ui.bestEntitledModel(plan, m.id);
      assert.ok(ui.canUseModel(got, plan), `${m.id} on ${plan} fell back to ${got}, which the plan does not include`);
      if (ui.canUseModel(m.id, plan)) assert.equal(got, m.id, `${m.id} is included with ${plan} and was replaced`);
      else assert.ok(got === 'apple' || got === 'apple-max', 'the fallback never picks a dearer outside model for the person');
    }
  }
});

test('the workspace restores through bestEntitledModel, after the account is read, and does not save the fallback', () => {
  const ws = decomment(readFileSync(join(WEB, 'src', 'routes', 'workspace.tsx'), 'utf8'));
  const from = ws.indexOf('const restoredFor');
  const to = ws.indexOf('const chooseProductModel');
  assert.ok(from > 0 && to > from, 'the restore effect was not found');
  const effect = ws.slice(from, to);
  assert.match(effect, /if \(!userId \|\| !account\.data\) return;/, 'falls back only once the plan is known');
  assert.match(effect, /bestEntitledModel\(modelPlan, /);
  assert.match(effect, /readModelChoice\(userId\)/);
  assert.doesNotMatch(effect, /saveModelChoice/, 'a fallback must not overwrite the remembered choice');
  const choose = ws.slice(to, ws.indexOf('}, [userId]);', to));
  assert.match(choose, /saveModelChoice\(userId, model\)/, 'a person\'s own choice is remembered');
  assert.match(ws, /onModelChange=\{chooseProductModel\}/, 'the picker goes through the remembering setter');
});
