import test from 'node:test';
import assert from 'node:assert/strict';
import { noteChunks, researchChunks, sourcesOf } from './research-chunks.mjs';

const NOTE = `# Lighting
_Researched 2026-10-04._

## Key facts
- Future lighting casts shadows from local lights [S2]. ${'More words here. '.repeat(10)}

## Recipes
### Night mood
When to use: a horror map. Steps: 1. set ClockTime to 0 [S1]. ${'Detail. '.repeat(20)}

## Sources
[S1] Lighting, Roblox, 2026, https://create.roblox.com/docs/reference/engine/classes/Lighting
[S2] Future lighting, Roblox, 2025, https://devforum.roblox.com/t/future-is-bright/1
`;

test('a research note becomes chunks that keep their citations and point at the source they cite', () => {
  assert.equal(sourcesOf(NOTE).get(2), 'https://devforum.roblox.com/t/future-is-bright/1');
  const chunks = noteChunks('05-world.md', NOTE);
  assert.deepEqual(chunks.map((c) => c.title), ['Lighting — Key facts', 'Lighting — Recipes — Night mood']);
  assert.equal(chunks[0].url, 'https://devforum.roblox.com/t/future-is-bright/1');
  assert.equal(chunks[1].url, 'https://create.roblox.com/docs/reference/engine/classes/Lighting');
  assert.ok(chunks.every((c) => c.kind === 'research' && c.docSlug === 'research-05-world' && c.embed));
  assert.ok(!chunks.some((c) => c.text.includes('## Sources')), 'the source list is not a chunk');
});

test('every committed research note yields bounded chunks with unique ids and a https url', () => {
  const chunks = researchChunks();
  const ids = new Set(chunks.map((c) => c.vecId));
  assert.equal(ids.size, chunks.length);
  for (const c of chunks) {
    assert.ok(c.text.length <= 2400, c.vecId);
    assert.match(c.url, /^https:\/\//, c.vecId);
  }
});
