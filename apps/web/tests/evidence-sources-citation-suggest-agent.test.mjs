import test from 'node:test';
import assert from 'node:assert/strict';
import { bundle, renderWith, text, count, WEB } from './ui-bundle.mjs';

const entry = `
  import { createElement as h } from 'react';
  import { renderToStaticMarkup } from 'react-dom/server';
  import { TurnSources, TurnCitations, TurnSuggestions, AgentIdentityCard } from './src/components/ws/evidence/sources-citation-suggest-agent';
  export { h, renderToStaticMarkup, TurnSources, TurnCitations, TurnSuggestions, AgentIdentityCard };
`;
const tools = [
  { toolId: 't1', tool: 'search_docs', summary: 'TweenService', ok: true, done: true },
  { toolId: 't2', tool: 'find_sound', summary: 'door creak', ok: true, done: true },
  { toolId: 't3', tool: 'search_docs', summary: 'failed lookup', ok: false, done: true },
  { toolId: 't4', tool: 'search_docs', summary: 'still running', done: false },
  { toolId: 't5', tool: 'create_instances', summary: 'a part', ok: true, done: true },
];
const place = { placeId: 1, gameId: 2, placeName: 'Obby Place', boundAt: 0 };

test('evidence sources / citation / suggestion / agent', async () => {
  const m = await bundle(entry, { name: 'evidence-sca', resolveDir: WEB });
  const r = (el) => renderWith(m.renderToStaticMarkup, el);

  const src = r(m.h(m.TurnSources, { tools, defaultOpen: true }));
  assert.match(text(src), /Used 2 sources/);
  assert.match(text(src), /Searched the Roblox docs/);
  assert.match(text(src), /door creak/);
  assert.doesNotMatch(text(src), /failed lookup|still running|a part/);

  const cite = r(m.h(m.TurnCitations, { tools }));
  assert.equal(count(cite, 'ev-cite__chip'), 2);
  assert.match(cite, /title="Searched the Roblox docs: TweenService"/);

  const sug = r(m.h(m.TurnSuggestions, { turn: { stopReason: 'incomplete' }, onPick() {} }));
  assert.match(text(sug), /Continue where you stopped/);
  assert.equal(r(m.h(m.TurnSuggestions, { turn: { stopReason: 'done' }, onPick() {} })), '');
  assert.equal(r(m.h(m.TurnSuggestions, { turn: { stopReason: 'incomplete', streaming: true }, onPick() {} })), '');

  const agent = r(m.h(m.AgentIdentityCard, { productModel: 'apple', studioConnected: true, place, deniedTools: ['run_script'] }));
  assert.match(text(agent), /Apple/);
  assert.match(text(agent), /Studio: connected to Obby Place/);
  assert.match(text(agent), /Withheld this run:/);
  assert.match(text(r(m.h(m.AgentIdentityCard, { productModel: 'apple' }))), /Studio: unavailable[\s\S]*none reported/);

  for (const el of [
    m.h(m.TurnSources, { tools: undefined }), m.h(m.TurnSources, { tools: [] }),
    m.h(m.TurnCitations, { tools: undefined }), m.h(m.TurnSuggestions, { turn: undefined, onPick() {} }),
    m.h(m.AgentIdentityCard, {}),
  ]) assert.equal(r(el), '');
});
