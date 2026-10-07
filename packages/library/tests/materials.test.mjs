import { test } from 'node:test';
import assert from 'node:assert/strict';
import { familyOf } from '../src/ingest-ambientcg.mjs';
import { oneK } from '../tools/fetch-ambientcg.mjs';

test('an ambientCG id names its material type', () => {
  assert.equal(familyOf('PavingStones142'), 'paving-stones');
  assert.equal(familyOf('Wood096'), 'wood');
  assert.equal(familyOf('Bricks101A'), 'bricks');
});

test('the 1K-JPG download is the one fetched', () => {
  const a = { downloads: [{ attributes: '2K-JPG', url: 'x2' }, { attributes: '1K-JPG', url: 'x1' }, { attributes: '1K-PNG', url: 'p1' }] };
  assert.equal(oneK(a).url, 'x1');
  assert.equal(oneK({ downloads: [] }), undefined);
});
