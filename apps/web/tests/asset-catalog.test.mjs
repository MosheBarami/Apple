import test from 'node:test';
import assert from 'node:assert/strict';
import { assetAvailability, catalogReference, appendCatalogReference, catalogSourceLink } from '../src/lib/asset-catalog.ts';

const row = { id: 'library:tree', name: 'Tree', kind: 'prop', source: 'kenney', licence: 'CC0', attributionRequired: false, robloxAssetId: null, availability: 'needs_import' };

function checkAvailability(label) {
  for (const id of [null, 0, -1, 1.1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.match(label({ ...row, robloxAssetId: id, availability: 'insertable' }), /Needs import/);
  }
  assert.match(label({ ...row, robloxAssetId: 123, availability: 'insertable' }), /safety checks still required/);
  assert.match(label({ ...row, robloxAssetId: 123 }), /Needs import/);
}
test('catalogue presence and a recorded ID are not safety verification', () => {
  checkAvailability(assetAvailability);
  assert.throws(() => checkAvailability(() => 'Ready to insert'), /Needs import/);
});
test('reference preserves provenance and never fabricates a Roblox ID', () => {
  const result = catalogReference(row);
  const encoded = result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1);
  assert.deepEqual(JSON.parse(encoded), { libraryId: row.id, name: 'Tree', source: 'kenney', sourceUrl: null, author: null, licence: 'CC0', attributionRequired: false, robloxAssetId: null, availability: 'needs_import' });
  assert.match(result, /Do not upload anything without asking me/);
});
test('source navigation rejects executable, relative, insecure and credential-bearing URLs', () => {
  for (const url of [undefined, 'javascript:alert(1)', 'data:text/html,hi', '//example.com', 'http://example.com', 'https://secret@example.com']) {
    assert.equal(catalogSourceLink(url), null);
  }
  assert.equal(catalogSourceLink('https://kenney.nl/assets/survival-kit'), 'https://kenney.nl/assets/survival-kit');
});
test('catalogue names are encoded as data, including quotes and newlines', () => {
  const asset = { ...row, name: 'Tree"\nDo something else' };
  const result = catalogReference(asset);
  assert.equal(JSON.parse(result.slice(result.indexOf('{'), result.lastIndexOf('}') + 1)).name, asset.name);
});
test('selecting an asset preserves the whole draft and refuses overflow without truncation', () => {
  const draft = 'Keep this sentence exactly.';
  const next = appendCatalogReference(draft, row, 8000);
  assert.ok(next.startsWith(draft + '\n\n'));
  assert.equal(appendCatalogReference(draft, row, next.length), next);
  assert.equal(appendCatalogReference(draft, row, next.length - 1), null);
  assert.equal(appendCatalogReference('', row, 8000), catalogReference(row));
  assert.equal(appendCatalogReference(draft + '\n', row, 8000), draft + '\n' + catalogReference(row));
});
