/**
 * THE MODEL PICKER — what it offers, what it refuses, and what a browser receives.
 *
 * Owner decision D-VISION-1: one list, the registry (packages/shared/src/models.ts), each row marked
 * for the account's plan by the shared rule, with its vendor's own mark and a "×N credits" badge
 * where it costs more than Apple MAX. The worker is the authority (GET /api/models, and the re-check
 * at every step); these tests hold the browser's half:
 *
 *   * the rows (components/ws/model-picker-model.ts), run under node: every registry model is a row,
 *     in registry order, under one heading; which can be chosen is `canUseModel` for the plan; a
 *     locked row says which plan includes it;
 *   * the rendered list (components/ws/model-picker.tsx on AI Elements' ModelSelector): a locked row
 *     is aria-disabled yet reachable and says why, the credits badge is an outline badge, every
 *     logo is a vendored mark drawn as an <svg> — no <img> — and the upgrade link is there only
 *     when a row is locked and there is somewhere to buy;
 *   * the composer's send: a model the plan does not include is refused before it leaves, with the
 *     shared refusal, and the draft stays.
 *
 * Every list is derived from the registry, and each derivation asserts it found something.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, count, decomment, element, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { default as ModelPicker, ModelPickerRows } from './src/components/ws/model-picker';
  export { ModelSelector } from './src/components/ai-elements/model-selector';
  export { pickerGroups, logoFor, findRow, creditBadge, GROUP_HEADING } from './src/components/ws/model-picker-model';
  export { LOGO_MARKS } from './src/components/ai-elements/logos/marks';
  export { MODEL_REGISTRY, TIER_PLAN_NAME, canUseModel, modelListing, modelRefusal } from '@golem/shared';
`, { name: 'model-picker', resolveDir: WEB });

const REGISTRY = ui.MODEL_REGISTRY;
const PLANS = ['free', 'builder', 'studio', 'enterprise', undefined];
const OUTSIDE = REGISTRY.filter((m) => m.vendor !== 'Apple');

test('the derived lists found something', () => {
  assert.ok(REGISTRY.length >= 5, `only ${REGISTRY.length} registry models`);
  assert.ok(OUTSIDE.length >= 3, 'the registry has no outside models; the picker would test only Apple');
  assert.ok(Object.keys(ui.LOGO_MARKS).length >= 10, 'no vendored marks');
});

// ------------------------------------------------------------------- rows ---

test('every registry model is a row, in registry order, under one Models heading — for every plan', () => {
  for (const plan of PLANS) {
    const groups = ui.pickerGroups({ modelPlan: plan });
    assert.equal(groups.length, 1, 'one group, not Apple / keys / free');
    assert.equal(groups[0].heading, 'Models');
    assert.deepEqual(groups[0].rows.map((r) => r.id), REGISTRY.map((m) => m.id));
    assert.deepEqual(groups[0].rows.map((r) => r.label), REGISTRY.map((m) => m.displayName), 'the label is the registry display name');
  }
});

test('a row can be chosen exactly when the shared rule says so, and a locked row names the plan that includes it', () => {
  let locked = 0;
  for (const plan of PLANS) {
    for (const row of ui.pickerGroups({ modelPlan: plan })[0].rows) {
      const model = REGISTRY.find((m) => m.id === row.id);
      assert.equal(row.available, ui.canUseModel(row.id, plan), `${row.id} on ${plan}`);
      if (row.available) {
        assert.equal(row.note, model.blurb);
      } else {
        locked++;
        assert.equal(row.note, `Included with ${ui.TIER_PLAN_NAME[model.tier]}`);
        assert.doesNotMatch(row.note, /OpenRouter|key|BYOK|API|401|token/i, 'the reason is a plan, in plain words');
      }
    }
  }
  assert.ok(locked > 0, 'no plan locked anything; the locked branch was never checked');
});

test('the Max plan can pick every outside model (they were not pickable before D-VISION-1)', () => {
  for (const plan of ['studio', 'enterprise']) {
    const rows = ui.pickerGroups({ modelPlan: plan })[0].rows;
    for (const m of OUTSIDE) assert.equal(ui.findRow([{ rows }], m.id)?.available, true, `${m.id} is not pickable on ${plan}`);
  }
});

test('the worker\'s listing wins when it was read; the local marking is only the fallback', () => {
  const allLocked = ui.modelListing('free').map((m) => ({ ...m, available: false, lockedReason: 'Included with the Max plan' }));
  const rows = ui.pickerGroups({ listing: allLocked, modelPlan: 'studio' })[0].rows;
  assert.ok(rows.every((r) => !r.available), 'the plan in the browser overrode what the worker said');
  assert.deepEqual(ui.pickerGroups({ listing: null, modelPlan: 'studio' }), ui.pickerGroups({ listing: ui.modelListing('studio') }));
  // A row this build's registry does not know cannot be named or sent, so it is left out.
  const extra = [...ui.modelListing('studio'), { id: 'someone/new-model', displayName: 'New', vendor: 'X', tier: 'free', creditMultiplier: 1, available: true, lockedReason: '' }];
  assert.equal(ui.pickerGroups({ listing: extra })[0].rows.length, REGISTRY.length);
});

test('the credits badge reads ×N above 1 and is absent at 1', () => {
  for (const m of REGISTRY) {
    const badge = ui.creditBadge(m.creditMultiplier);
    if (m.creditMultiplier > 1) assert.equal(badge, `×${m.creditMultiplier} credits`);
    else assert.equal(badge, null, `${m.id} costs what Apple MAX costs and carries no badge`);
  }
  assert.ok(REGISTRY.some((m) => m.creditMultiplier > 1), 'no model has a multiplier; the badge was never checked');
});

test('every outside vendor has a vendored mark; Apple\'s rows are drawn with Apple\'s own', () => {
  const marks = new Set(Object.keys(ui.LOGO_MARKS));
  for (const m of OUTSIDE) {
    const logo = ui.logoFor(m.vendor);
    assert.ok(logo && marks.has(logo), `${m.vendor} has no vendored mark (got ${logo})`);
  }
  assert.equal(ui.logoFor('Apple'), null);
});

// --------------------------------------------------------------- rendering ---

const render = (el) => renderWith(ui.renderToStaticMarkup, el);
function openList(props) {
  return render(ui.h(ui.ModelSelector, { open: true }, ui.h(ui.ModelPickerRows, { selected: 'apple', onChoose: () => true, close() {}, ...props })));
}
const rowsOf = (html) => [...html.matchAll(/<div[^>]*role="option"[^>]*>/g)].map((m) => element(html.slice(m.index), /<div/));
const isLocked = (row) => /aria-disabled="true"/.test(row.slice(0, row.indexOf('>')));

test('the chip is the ModelSelector trigger: a dialog, named by the model it holds, with its vendor\'s mark', () => {
  const sol = OUTSIDE.find((m) => m.vendor === 'OpenAI');
  const groups = ui.pickerGroups({ modelPlan: 'studio' });
  const html = render(ui.h(ui.ModelPicker, { groups, selected: sol.id, fallbackLabel: 'x', onChoose: () => true }));
  const trigger = element(html, /<button\b/);
  assert.match(trigger, /aria-haspopup="dialog"/);
  assert.match(trigger, new RegExp(`aria-label="Model: ${sol.displayName}"`));
  assert.match(trigger, /aria-label="OpenAI logo"/);
  assert.doesNotMatch(html, /role="dialog"/, 'closed, the list is not rendered');
});

test('the open list: one heading, every registry row, locked rows that say why and stay reachable, and outline credit badges', () => {
  const groups = ui.pickerGroups({ modelPlan: 'free' });
  const html = openList({ groups, onUpgrade() {} });
  assert.match(html, /role="dialog"/);
  const headings = [...html.matchAll(/cmdk-group-heading=""[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(headings, ['Models']);

  const rows = rowsOf(html);
  assert.equal(rows.length, REGISTRY.length);
  const locked = rows.filter(isLocked);
  assert.equal(locked.length, REGISTRY.filter((m) => !ui.canUseModel(m.id, 'free')).length);
  assert.ok(locked.length > 0);
  for (const row of locked) {
    const open = row.slice(0, row.indexOf('>'));
    assert.match(open, /\bis-unavailable\b/);
    assert.match(open, /data-disabled="false"/, 'aria-disabled, not cmdk-disabled: the row must stay reachable to say why');
    assert.match(text(row), /Included with (Pro|the Max plan)/);
  }

  const badges = [...html.matchAll(/<[a-z]+[^>]*class="[^"]*\bgx-model-row__credits\b[^"]*"[^>]*>/g)].map((m) => element(html.slice(m.index), /<[a-z]+/));
  assert.equal(badges.length, REGISTRY.filter((m) => m.creditMultiplier > 1).length);
  for (const badge of badges) {
    assert.match(text(badge), /^×\d+ credits$/);
    assert.match(badge, /ai-badge--outline/);
  }
  assert.doesNotMatch(html, /--good|is-good|green/i);
  assert.doesNotMatch(text(html), /OpenRouter|your key|Settings/i, 'no trace of bring-your-own-key');
  assert.match(html, />See plans<\/button>/, 'a locked row offers the way to unlock it');
});

test('the upgrade link is drawn only when a row is locked and there is somewhere to buy', () => {
  assert.doesNotMatch(openList({ groups: ui.pickerGroups({ modelPlan: 'free' }) }), /See plans/, 'no onUpgrade, no link');
  assert.doesNotMatch(openList({ groups: ui.pickerGroups({ modelPlan: 'studio' }), onUpgrade() {} }), /See plans/, 'nothing locked, no link');
});

test('every logo is a vendored mark drawn as <svg> — no <img>, nothing fetched from anyone', () => {
  const html = openList({ groups: ui.pickerGroups({ modelPlan: 'studio' }) });
  assert.equal(count(html, '<img'), 0);
  // The SVG namespace the icon set declares is a name, not a request; any other URL would be one.
  assert.doesNotMatch(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', ''), /models\.dev|https?:\/\//);
  for (const vendor of new Set(OUTSIDE.map((m) => m.vendor))) {
    const mark = element(html, new RegExp(`<span[^>]*aria-label="${vendor} logo"`));
    assert.ok(mark, `no ${vendor} mark`);
    assert.ok(mark.includes(`d="${ui.LOGO_MARKS[ui.logoFor(vendor)].d}"`), `${vendor}'s mark is not the vendored path`);
  }
  const src = decomment(readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'model-selector.tsx'), 'utf8'));
  assert.doesNotMatch(src, /models\.dev|<img\b|dangerouslySetInnerHTML/);
});

// ------------------------------------------------------------------ sending ---

test('a model the plan does not include is refused before it leaves, in the shared words, and the draft stays', () => {
  const composer = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8'));
  const submit = composer.slice(composer.indexOf('const submit'), composer.indexOf('const onKeyDown'));
  const refusal = submit.indexOf('if (modelUnavailable)');
  const send = submit.indexOf('if (!onSend(');
  assert.ok(refusal > 0 && send > refusal, 'the entitlement check must come before the send');
  assert.match(submit.slice(refusal, send), /modelRefusal\(productModel\)/);
  assert.match(submit.slice(refusal, send), /Your draft is kept\./);
  assert.match(submit.slice(refusal, send), /return false;/);
  assert.match(composer, /const modelUnavailable = !canUseProductModel\(productModel, modelPlan\)/);
  // The words are the shared refusal the worker also sends, not a sentence about one model.
  assert.doesNotMatch(composer, /Apple MAX requires a (paid )?subscription/);
  for (const m of REGISTRY.filter((r) => r.tier !== 'free')) assert.match(ui.modelRefusal(m.id), new RegExp(`^${m.displayName} is included with `));
});
