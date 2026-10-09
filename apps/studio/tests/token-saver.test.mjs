import test from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../src/token-saver.ts';
import { clampToolOutput, compactHistory, TtlCache, TurnReadCache } from '../src/token-saver.ts';

test('a long tool result keeps its head and tail and says how to ask for less', () => {
  const out = clampToolOutput('a'.repeat(50_000), 12_000);
  assert.ok(out.length < 12_500);
  assert.match(out, /characters left out to save tokens/);
  assert.equal(clampToolOutput('short'), 'short');
});

test('a repeated read with nothing written since is one line; a write clears it', () => {
  const c = new TurnReadCache();
  assert.equal(c.repeat('read_script', { path: 'A' }), null);
  c.remember('read_script', { path: 'A' });
  assert.match(c.repeat('read_script', { path: 'A' }), /nothing has been changed since/);
  assert.equal(c.repeat('read_script', { path: 'B' }), null);
  c.invalidate();
  assert.equal(c.repeat('read_script', { path: 'A' }), null);
});

test('knowledge lookups are served from the cache within the TTL', async () => {
  const cache = new TtlCache(60_000);
  let loads = 0;
  const load = async () => (loads += 1);
  await cache.get('k', load);
  await cache.get('k', load);
  assert.equal(loads, 1);
});

test('old history is shortened; the recent window is sent whole', () => {
  const long = 'x'.repeat(5_000);
  const msgs = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: [{ type: 'text', text: long }] }));
  const out = compactHistory(msgs);
  assert.ok(out[0].content[0].text.length < 1_600);
  assert.equal(out[19].content[0].text.length, 5_000);
});

test('a tool call quoted as a JSON string is unwrapped; anything else is left to fail normally', async () => {
  const fixed = await S.repairToolInput({ toolCall: { toolName: 'build_ui', input: JSON.stringify(JSON.stringify({ name: 'A' })) } });
  assert.deepEqual(JSON.parse(fixed.input), { name: 'A' });
  assert.equal(fixed.toolName, 'build_ui');
  assert.equal(await S.repairToolInput({ toolCall: { input: '{"name":1}' } }), null);
  assert.equal(await S.repairToolInput({ toolCall: { input: 'not json' } }), null);
  // The measured failure: one closing pair too many in a deep tree, then more keys of the root.
  const deep = '{"name":"Hud","children":[{"type":"stack","children":[{"type":"text","text":"a]}"}]}]}]},"viewports":["desktop"]}';
  const repaired = JSON.parse((await S.repairToolInput({ toolCall: { input: deep } })).input);
  assert.equal(repaired.name, 'Hud');
  assert.deepEqual(repaired.viewports, ['desktop']);
  assert.equal(repaired.children[0].children[0].text, 'a]}');
  // Missing closers at the end are added.
  assert.deepEqual(JSON.parse((await S.repairToolInput({ toolCall: { input: '{"a":[1,2,{"b":3' } })).input), { a: [1, 2, { b: 3 }] });
});

test('earlier turns keep their tool calls and results, shortened; the current turn is whole', () => {
  const big = { name: 'Shop', children: Array.from({ length: 20 }, (_, i) => ({ type: 'text', name: `T${i}`, text: 'y'.repeat(500) })) };
  const msgs = [
    { role: 'user', content: 'make a shop' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'a', toolName: 'build_ui', input: big }] },
    { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'a', toolName: 'build_ui', output: { type: 'json', value: { built: 'game.StarterGui.Shop', pad: 'z'.repeat(5000) } } }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Built the shop.' }] },
    { role: 'user', content: 'continue' },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'b', toolName: 'build_ui', input: big }] },
  ];
  const out = compactHistory(msgs);
  const call = out[1].content[0];
  assert.equal(call.toolName, 'build_ui');
  assert.equal(call.input.name, 'Shop');
  assert.equal(call.input.children[0].name, 'T0');
  assert.ok(JSON.stringify(call.input).length < 3_000);
  const result = out[2].content[0].output;
  assert.match(result.value, /game\.StarterGui\.Shop/);
  assert.ok(result.value.length < 900);
  assert.deepEqual(out[5].content[0].input, big);
});
