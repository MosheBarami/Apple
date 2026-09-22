/**
 * THE MODEL PICKER — what it offers, what it refuses, and what a browser receives.
 *
 * Owner decisions D-BYOK-1 and D-FREE-1: Apple's own models, the models a customer's own OpenRouter
 * key unlocks, and the ones OpenRouter prices at zero today, each with its vendor's own mark. The
 * worker is the authority for the catalogue (GET /api/models); these tests hold the browser's half:
 *
 *   * the grouping (components/ws/model-picker-model.ts), run under node: which rows exist, which
 *     can be chosen, and the plain reason for every one that cannot;
 *   * the rendered list (components/ws/model-picker.tsx on AI Elements' ModelSelector): a locked row
 *     is aria-disabled yet reachable and says why, "Free" is an outline badge, every logo is a
 *     vendored mark drawn as an <svg> — no <img>, and nothing from models.dev;
 *   * the composer's send: a model on a key whose key is missing is refused before it leaves, and
 *     the draft stays.
 *
 * Every list is derived — the curated ids from the worker's own source, the marks from the vendored
 * files — and each derivation asserts it found something.
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
  export { pickerGroups, logoFor, findRow, KEY_MISSING_NOTE, FREE_KEY_MISSING_NOTE } from './src/components/ws/model-picker-model';
  export { LOGO_MARKS } from './src/components/ai-elements/logos/marks';
`, { name: 'model-picker', resolveDir: WEB });

const WORKER = join(WEB, '..', 'worker', 'src');
const CATALOGUE_SRC = decomment(readFileSync(join(WORKER, 'model-catalogue.ts'), 'utf8'));
const CURATED_BLOCK = CATALOGUE_SRC.slice(CATALOGUE_SRC.indexOf('CURATED_PAID_IDS'), CATALOGUE_SRC.indexOf('];', CATALOGUE_SRC.indexOf('CURATED_PAID_IDS')));
const CURATED = [...CURATED_BLOCK.matchAll(/'([a-z0-9-]+\/[a-z0-9.:-]+)'/g)].map((m) => m[1]);
const SNAPSHOT = [...readFileSync(join(WORKER, 'openrouter-snapshot.ts'), 'utf8').matchAll(/\{ id: "([^"]+)", name: "([^"]+)", free: (true|false), tools: (true|false) \}/g)]
  .map((m) => ({ id: m[1], name: m[2], free: m[3] === 'true', tools: m[4] === 'true' }));

const KEY = { provider: 'openrouter', last4: 'abcd', addedAt: '2026-09-23T00:00:00.000Z' };
const model = (id, over = {}) => ({ id, label: id.split('/')[1], vendor: id.split('/')[0], requiresKey: true, free: false, supportsTools: true, builtIn: false, ...over });
const catalogue = (models, free = {}) => ({ models, free: { readAt: '2026-09-23T01:20:00.000Z', source: 'live', keyless: false, ...free } });
const APPLE = [
  { id: 'apple', label: 'Apple', vendor: 'Apple', requiresKey: false, free: false, supportsTools: true, builtIn: true },
  { id: 'apple-max', label: 'Apple MAX', vendor: 'Apple', requiresKey: false, free: false, supportsTools: true, builtIn: true },
];

test('the derived lists found something', () => {
  assert.ok(CURATED.length >= 10, `only ${CURATED.length} curated ids read from the worker`);
  assert.ok(SNAPSHOT.length >= 20, `only ${SNAPSHOT.length} snapshot rows read from the worker`);
  assert.ok(Object.keys(ui.LOGO_MARKS).length >= 10, 'no vendored marks');
});

// ---------------------------------------------------------------- grouping ---

test('with no catalogue the picker offers Apple and nothing it could not confirm', () => {
  const groups = ui.pickerGroups({ catalogue: null, keys: null, modelPlan: 'free', maxUpgradeAvailable: false });
  assert.deepEqual(groups.map((g) => g.id), ['apple']);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['apple', 'apple-max']);
  const max = groups[0].rows[1];
  assert.equal(max.available, false);
  assert.equal(max.note, 'Subscribers · not available yet');
});

test('Apple, Your keys, Free — in that order, and every locked row says why in plain words', () => {
  const cat = catalogue([...APPLE, model('openai/gpt-6-sol'), model('nvidia/nemotron-3-super-120b-a12b:free', { free: true })]);
  const none = ui.pickerGroups({ catalogue: cat, keys: [], modelPlan: 'free' });
  assert.deepEqual(none.map((g) => g.heading), ['Apple', 'Your keys', 'Free']);
  const [, keys, free] = none;
  assert.equal(keys.rows[0].available, false);
  assert.equal(keys.rows[0].note, ui.KEY_MISSING_NOTE);
  assert.equal(free.rows[0].available, false);
  assert.equal(free.rows[0].note, ui.FREE_KEY_MISSING_NOTE);
  for (const note of [ui.KEY_MISSING_NOTE, ui.FREE_KEY_MISSING_NOTE]) {
    assert.doesNotMatch(note, /BYOK|API|401|token|endpoint/i, 'the reason is for a child, not a developer');
  }

  const keyed = ui.pickerGroups({ catalogue: cat, keys: [KEY], modelPlan: 'free' });
  assert.equal(keyed[1].rows[0].available, true, 'a saved key unlocks the paid models');
  assert.equal(keyed[2].rows[0].available, true, 'and the free ones');
  assert.equal(keyed[0].rows[1].available, false, 'a key is not an Apple MAX subscription');

  const keyless = ui.pickerGroups({ catalogue: catalogue(cat.models, { keyless: true }), keys: [], modelPlan: 'free' });
  assert.equal(keyless[2].rows[0].available, true, 'a platform key makes the free models keyless (D-FREE-1)');
  assert.equal(keyless[1].rows[0].available, false, 'but never the paid ones');
});

test('a model that cannot call tools, or is Apple\'s own, is never offered as a key model', () => {
  const cat = catalogue([...APPLE, model('x/no-tools', { supportsTools: false }), model('openai/gpt-6-luna')]);
  const ids = ui.pickerGroups({ catalogue: cat, keys: [KEY] }).flatMap((g) => g.rows.map((r) => `${g.id}:${r.id}`));
  assert.deepEqual(ids, ['apple:apple', 'apple:apple-max', 'keys:openai/gpt-6-luna']);
});

test('every curated model and every free model in the worker\'s snapshot gets a vendored mark or an initial — never a borrowed logo', () => {
  const marks = new Set(Object.keys(ui.LOGO_MARKS));
  for (const id of CURATED) {
    const logo = ui.logoFor(id);
    assert.ok(logo && marks.has(logo), `${id} has no vendored mark (got ${logo})`);
  }
  let initials = 0;
  for (const row of SNAPSHOT) {
    const logo = ui.logoFor(row.id);
    if (logo === null) { initials++; continue; }
    assert.ok(marks.has(logo), `${row.id} points at a mark that is not vendored: ${logo}`);
  }
  assert.ok(initials >= 1, 'the snapshot has vendors with no mark; they must fall back to an initial');
  assert.equal(ui.logoFor('someone/new-model'), null, 'an unknown vendor is an initial, not a guess');
});

// --------------------------------------------------------------- rendering ---

const render = (element) => renderWith(ui.renderToStaticMarkup, element);
function openList(props) {
  return render(ui.h(ui.ModelSelector, { open: true }, ui.h(ui.ModelPickerRows, { selected: 'apple', onChoose: () => true, close() {}, ...props })));
}
const fullCatalogue = catalogue([...APPLE, model('openai/gpt-6-sol', { label: 'GPT-6 Sol', vendor: 'OpenAI' }), model('poolside/laguna-s-2.1:free', { label: 'Laguna S 2.1 (free)', vendor: 'Poolside', free: true })]);

test('the chip is the ModelSelector trigger: a dialog, named by the model it holds', () => {
  const groups = ui.pickerGroups({ catalogue: fullCatalogue, keys: [KEY] });
  const html = render(ui.h(ui.ModelPicker, { groups, selected: 'openai/gpt-6-sol', fallbackLabel: 'x', onChoose: () => true }));
  const trigger = element(html, /<button\b/);
  assert.match(trigger, /aria-haspopup="dialog"/);
  assert.match(trigger, /aria-label="Model: GPT-6 Sol"/);
  assert.match(trigger, /aria-label="OpenAI logo"/, 'the chip carries the vendor\'s mark');
  assert.doesNotMatch(html, /role="dialog"/, 'closed, the list is not rendered');
});

test('the open list: groups, locked rows that say why and stay reachable, and a Free badge that is not green', () => {
  const groups = ui.pickerGroups({ catalogue: fullCatalogue, keys: [], modelPlan: 'free', maxUpgradeAvailable: false });
  const html = openList({ groups, onOpenSettings() {} });
  assert.match(html, /role="dialog"/);
  const headings = [...html.matchAll(/cmdk-group-heading=""[^>]*>([^<]*)</g)].map((m) => m[1]);
  assert.deepEqual(headings, ['Apple', 'Your keys', 'Free']);

  const rows = [...html.matchAll(/<div[^>]*role="option"[^>]*>/g)].map((m) => element(html.slice(m.index), /<div/));
  assert.equal(rows.length, 4);
  const locked = rows.filter((r) => /aria-disabled="true"/.test(r.slice(0, r.indexOf('>'))));
  assert.equal(locked.length, 3, 'MAX, the key model and the free model are all locked for a free account with no key');
  for (const row of locked) {
    const open = row.slice(0, row.indexOf('>'));
    assert.match(open, /\bis-unavailable\b/);
    assert.match(open, /data-disabled="false"/, 'aria-disabled, not cmdk-disabled: the row must stay reachable to say why');
    assert.ok(text(row).length > 10);
  }
  assert.match(text(html), /Add your OpenRouter key in Settings to use this\./);

  const badge = element(html, /<[a-z]+[^>]*class="[^"]*\bgx-model-row__free\b/);
  assert.ok(badge, 'no Free badge');
  assert.equal(text(badge), 'Free');
  assert.match(badge, /ai-badge--outline/);
  assert.doesNotMatch(html, /--good|is-good|green/i);

  assert.match(html, /Add your OpenRouter key in Settings<\/button>/, 'a locked key row offers the way to unlock it');
});

test('every logo is a vendored mark drawn as <svg>, or an initial — no <img>, nothing fetched from anyone', () => {
  const groups = ui.pickerGroups({ catalogue: fullCatalogue, keys: [KEY] });
  const html = openList({ groups });
  assert.equal(count(html, '<img'), 0);
  // The SVG namespace the icon set declares is a name, not a request; any other URL would be one.
  assert.doesNotMatch(html.replaceAll('xmlns="http://www.w3.org/2000/svg"', ''), /models\.dev|https?:\/\//);
  const openai = element(html, /<span[^>]*aria-label="OpenAI logo"/);
  assert.ok(openai, 'no OpenAI mark');
  assert.ok(openai.includes(`d="${ui.LOGO_MARKS.openai.d}"`), 'the mark is the vendored path');
  const poolside = element(html, /<span[^>]*aria-label="Poolside logo"/);
  assert.ok(poolside, 'no Poolside logo slot');
  assert.equal(count(poolside, '<svg'), 0, 'Poolside has no vendored mark; it gets an initial');
  assert.equal(text(poolside), 'P');
  const src = decomment(readFileSync(join(WEB, 'src', 'components', 'ai-elements', 'model-selector.tsx'), 'utf8'));
  assert.doesNotMatch(src, /models\.dev|<img\b|dangerouslySetInnerHTML/);
});

// ------------------------------------------------------------------ sending ---

test('a model on a key is refused before it leaves when its key is missing, and the draft stays', () => {
  const composer = decomment(readFileSync(join(WEB, 'src', 'components', 'ws', 'composer.tsx'), 'utf8'));
  const submit = composer.slice(composer.indexOf('const submit'), composer.indexOf('const onKeyDown'));
  const refusal = submit.indexOf('if (customerLocked)');
  const send = submit.indexOf('if (!onSend(');
  assert.ok(refusal > 0 && send > refusal, 'the key check must come before the send');
  assert.match(submit.slice(refusal, send), /Your draft is kept\./);
  assert.match(submit.slice(refusal, send), /return false;/);
  assert.match(composer, /const customerLocked = customerRow !== null && !customerRow\.available;/);
  // And a key model is not judged by the Apple MAX subscription rule.
  assert.match(composer, /const modelUnavailable = !customerModel && !canUseProductModel\(productModel, modelPlan\);/);
});
