import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { skillCardChunks } from './skill-card-chunks.mjs';

const cards = JSON.parse(readFileSync(new URL('../data/skill-cards.json', import.meta.url), 'utf8')).cards;

test('every skill card becomes one embedded chunk in the shape embed-batch accepts', () => {
  const chunks = skillCardChunks(cards);
  assert.equal(chunks.length, cards.length);
  for (const [i, ch] of chunks.entries()) {
    assert.equal(ch.vecId, `skill-${cards[i].id}`);
    assert.equal(ch.docSlug, `skill-${cards[i].id}`);
    assert.equal(ch.kind, 'skill');
    assert.equal(ch.embed, true);
    assert.equal(ch.title, cards[i].title);
    assert.ok(ch.url.startsWith('https://create.roblox.com/docs/'));
    assert.ok(ch.text.includes(cards[i].recipe[0]) && ch.text.includes('Check:'));
  }
  assert.equal(new Set(chunks.map((c) => c.vecId)).size, chunks.length);
});
