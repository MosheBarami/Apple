import { test } from 'node:test';
import assert from 'node:assert/strict';
import { audit, CATEGORY_OF_KIND, TARGETS } from '../tools/acceptance.mjs';
import { KINDS } from '../src/item.mjs';

const good = { id: 'kenney:k:a', title: 'Crate', kind: 'prop', source_url: 'https://kenney.nl/assets/k', author: 'Kenney', licence_words: 'CC0', licence_class: 'cc0', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/', fetched_at: '2026-10-07', uploader: 'none', file_sha256: 'x', ai_check: { pass: true, reasons: [] }, grade: 'A' };

test('every item kind maps to a §4.3 category that has a target row', () => {
  for (const k of KINDS) assert.ok(TARGETS[CATEGORY_OF_KIND[k]], `kind ${k} has no category`);
});

test('L-A1 counts by category and grade; L-A2 lists any item that fails validation', () => {
  const r = audit([
    { item: good, file: 'a.jsonl' },
    { item: { ...good, id: 'kenney:k:b', grade: 'C' }, file: 'a.jsonl' },
    { item: { ...good, id: 'x:y:nc', licence_words: 'CC BY-NC 4.0' }, file: 'b.jsonl' },
    { item: { ...good, id: 'x:y:by', licence_words: 'CC-BY-4.0', licence_class: 'cc-by-4.0' }, file: 'b.jsonl' },
  ]);
  assert.deepEqual(r.counts[1], { A: 3, B: 0, C: 1, ungraded: 0 });
  assert.deepEqual(r.failures.map((f) => f.id), ['x:y:nc', 'x:y:by'], 'a banned term, and CC BY without attribution');
});

test('L-A6 finds each visual item\'s preview where its pipeline left it', async () => {
  const { thumbOf } = await import('../tools/retrieval-test.mjs');
  assert.equal(thumbOf({ id: 'kenney:nature-kit:tree' }, '/p'), '/p/library-thumbs/kenney__nature-kit__tree.png');
  assert.equal(thumbOf({ id: 'oga:pack:rock' }, '/p'), '/p/library-thumbs/oga/oga__pack__rock.png');
  assert.equal(thumbOf({ id: 'kaykit:kaykit-dungeon:chest' }, '/p'), '/p/library-thumbs/kaykit/kaykit__kaykit-dungeon__chest.png');
  assert.equal(thumbOf({ id: 'gi:lorc:sword', file: 'lorc/sword.svg' }, '/p'), '/p/library-src/game-icons/lorc/sword.svg');
  assert.equal(thumbOf({ id: 'kenney2d:ui-pack:x', file: 'ui-pack/PNG/x.png' }, '/p'), '/p/library-src/kenney-2d/ui-pack/PNG/x.png');
  assert.equal(thumbOf({ id: 'skill:docs:a:b' }, '/p'), undefined);
});
