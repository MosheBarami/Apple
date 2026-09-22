/**
 * SETTINGS › MODELS & KEYS — the sentences, the routes, and what a browser receives.
 *
 * Owner decisions D-BYOK-1 (a customer's own key; runs on it spend no Apple Credits), D-BYOK-2 (the
 * key is sealed server-side and only its last four characters ever come back) and D-FREE-1 (the free
 * list is read live and says when). The worker's contract is GET/PUT/DELETE
 * /api/me/model-keys[/:provider] and GET /api/models — not /api/keys, which are Apple's own API keys.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { WEB, bundle, decomment, element, renderWith, text } from './ui-bundle.mjs';

const ui = await bundle(`
  export { createElement as h } from 'react';
  export { renderToStaticMarkup } from 'react-dom/server';
  export { QueryClient, QueryClientProvider } from '@tanstack/react-query';
  export { ModelKeysPanel, FreeModelsList } from './src/components/model-keys-panel';
  export * as copy from './src/lib/model-keys';
`, { name: 'model-keys', resolveDir: WEB });
const { copy } = ui;

const API = decomment(readFileSync(join(WEB, 'src', 'lib', 'api.ts'), 'utf8'));

test('the routes are the worker\'s model-key routes, never Apple\'s own API-key routes', () => {
  const block = API.slice(API.indexOf('export const fetchModelCatalogue'), API.indexOf('export interface RobloxWrite'));
  assert.ok(block.length > 100, 'the model-key client was not found');
  assert.match(block, /request\('\/api\/models'\)/);
  assert.match(block, /request\('\/api\/me\/model-keys'\)/);
  assert.match(block, /`\/api\/me\/model-keys\/\$\{encodeURIComponent\(provider\)\}`, \{ method: 'PUT', body: JSON\.stringify\(\{ apiKey \}\) \}/);
  assert.match(block, /`\/api\/me\/model-keys\/\$\{encodeURIComponent\(provider\)\}`, \{ method: 'DELETE' \}/);
  assert.doesNotMatch(block, /'\/api\/keys/, 'a model key must never go to the Apple API-key routes');
});

test('the promise, and the three answers a save can get', () => {
  assert.equal(copy.KEY_PROMISE.join(' '), "Your key is stored encrypted. Runs on your key don't use Apple Credits.");
  assert.match(copy.describeCheck('valid'), /accepted/);
  assert.match(copy.describeCheck('unchecked'), /could not be reached/);
  assert.doesNotMatch(copy.describeCheck('unchecked'), /accepted|works|valid/i, 'an unchecked key is not called good');
  assert.equal(copy.describeSaveFailure(400, { error: 'x', check: 'invalid' }, 'x'), copy.describeCheck('invalid'));
  assert.match(copy.describeSaveFailure(503, { error: 'x' }, 'x'), /Nothing was stored/);
  assert.equal(copy.describeSaveFailure(400, { error: 'too short' }, 'too short'), 'too short');
});

test('a key is only ever its last four characters', () => {
  assert.equal(copy.keyEnding('abcd'), 'ending abcd');
  assert.equal(copy.keyEnding('sk-or-v1-0123456789abcdef'), 'ending cdef', 'even handed more, it shows four');
  assert.equal(copy.keyEnding('<b>xy</b>'), 'ending bxyb', 'markup is not passed through');
});

test('the free list says when it was read, and says so plainly when it is the fallback', () => {
  const when = () => 'at noon';
  const live = { models: [], free: { readAt: 'x', source: 'live', keyless: false } };
  const snap = { models: [], free: { readAt: 'x', source: 'snapshot', keyless: false } };
  assert.match(copy.freeListNote(live, when), /^Read from OpenRouter at noon\./);
  assert.match(copy.freeListNote(snap, when), /could not be reached/);
  assert.match(copy.freeKeyNote(live, false), /Add your OpenRouter key/);
  assert.match(copy.freeKeyNote({ ...live, free: { ...live.free, keyless: true } }, false), /without a key/);
  const models = [
    { id: 'apple', builtIn: true, free: false, supportsTools: true },
    { id: 'a:free', builtIn: false, free: true, supportsTools: true },
    { id: 'b:free', builtIn: false, free: true, supportsTools: false },
    { id: 'c', builtIn: false, free: false, supportsTools: true },
  ];
  assert.deepEqual(copy.freeModels({ ...live, models }).map((m) => m.id), ['a:free'], 'only free models that can build');
});

test('every provider a key can be saved for has a name and a page, read from the shared list', () => {
  assert.ok(copy.PROVIDERS.length >= 1);
  for (const p of copy.PROVIDERS) {
    assert.ok(copy.PROVIDER_LABEL[p], `${p} has no name`);
    assert.match(copy.PROVIDER_KEYS_URL[p], /^https:\/\//);
  }
});

// --------------------------------------------------------------- rendering ---

function renderWithData(Component, data) {
  const client = new ui.QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  for (const [key, value] of Object.entries(data)) client.setQueryData([key], value);
  return renderWith(ui.renderToStaticMarkup, ui.h(ui.QueryClientProvider, { client }, ui.h(Component)));
}

test('a saved key: its last four, when it was added, Remove — and the field is empty and a password', () => {
  const html = renderWithData(ui.ModelKeysPanel, { 'model-keys': { keys: [{ provider: 'openrouter', last4: 'wxyz', addedAt: '2026-09-23T00:00:00.000Z' }] } });
  assert.match(text(html), /Your key is stored encrypted\. Runs on your key don't use Apple Credits\./);
  assert.match(text(html), /Key ending wxyz · added/);
  assert.match(html, />Remove</);
  const input = element(html, /<input\b/);
  assert.match(input, /type="password"/);
  assert.match(input, /value=""/, 'the key field never holds anything but what is being typed');
  assert.match(input, /autoComplete="new-password"|autocomplete="new-password"/i);
});

test('no key saved says so, and a list that could not be read never says "no key"', () => {
  const none = renderWithData(ui.ModelKeysPanel, { 'model-keys': { keys: [] } });
  assert.match(text(none), /No OpenRouter key saved\./);
  assert.doesNotMatch(none, />Remove</);
  const loading = renderWith(ui.renderToStaticMarkup, ui.h(ui.QueryClientProvider, { client: new ui.QueryClient() }, ui.h(ui.ModelKeysPanel)));
  assert.doesNotMatch(text(loading), /No OpenRouter key saved/, 'a list still loading is not an empty list');
});

test('the free models are listed with when they were read', () => {
  const html = renderWithData(ui.FreeModelsList, {
    'model-catalogue': {
      models: [
        { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super (free)', vendor: 'NVIDIA', requiresKey: true, free: true, supportsTools: true, builtIn: false },
        { id: 'openai/gpt-6-sol', label: 'GPT-6 Sol', vendor: 'OpenAI', requiresKey: true, free: false, supportsTools: true, builtIn: false },
      ],
      free: { readAt: new Date().toISOString(), source: 'live', keyless: false },
    },
    'model-keys': { keys: [] },
  });
  assert.match(text(html), /Nemotron 3 Super/);
  assert.doesNotMatch(text(html), /GPT-6 Sol/, 'a paid model is not in the free list');
  assert.match(text(html), /Read from OpenRouter /);
});
