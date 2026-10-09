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
  const fixed = await S.unwrapQuotedToolInput({ toolCall: { toolName: 'build_ui', input: JSON.stringify(JSON.stringify({ name: 'A' })) } });
  assert.deepEqual(JSON.parse(fixed.input), { name: 'A' });
  assert.equal(fixed.toolName, 'build_ui');
  assert.equal(await S.unwrapQuotedToolInput({ toolCall: { input: '{"name":1}' } }), null);
  assert.equal(await S.unwrapQuotedToolInput({ toolCall: { input: 'not json' } }), null);
});
