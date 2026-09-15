// EVERY SOURCE IN THE LIBRARY HAS A STATED ANSWER, and none of them is silence.
//
// A library of 447,301 rows is only worth having if a caller can tell, for any row, whether it can
// be used — and the failure mode that matters is not "this one cannot be imported". It is a row
// that LOOKS importable, is tried, and comes back with a message nobody can act on, over and over,
// because a source was added to the harvest and never classified in the resolver.
//
// So this walks ASSET_SOURCE_SITES — the real vocabulary, not a list retyped here — and requires
// each one to produce either a download or a refusal that says which of the four specific reasons
// applies. A new source fails this until somebody has decided what it is.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(join(tmpdir(), 'coverage-'));
const bundle = (name) => {
  const out = join(dir, `${name}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', `${name}.ts`), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
    { cwd: WORKER, stdio: 'pipe' });
  return out;
};
const L = await import(`file://${bundle('asset-library')}`);
const I = await import(`file://${bundle('asset-import')}`);

/** A row shaped like the harvest writes them, for one source. */
const rowFor = (source) => ({
  id: `${source}/kind/example-asset`,
  name: 'Example Asset',
  kind: 'texture',
  source,
  sourceUrl: `https://example.invalid/${source}`,
});

/**
 * The four answers a source may give, and the words that identify each.
 *
 * Deliberately matched on the REASON rather than on a source name: a message that merely mentions
 * the source tells a caller nothing, and "unsupported" is the non-answer this test exists to catch.
 */
const STATED_REASONS = [
  /already a Roblox asset/i,           // needs no import at all
  /does not rasterise|SVG/i,           // vector, reference only
  /PACK of many files/i,               // a pointer to an archive of many assets
  /no Open Use path|Studio importer/i, // geometry or a lighting probe
  /has no name|malformed/i,            // a row too incomplete to address, which this fixture is
  /has not been harvested yet/i,       // a real source with no rows, distinct from an oversight
  /built in the place from parts/i,    // procedural: there is no file anywhere
  /answered 404/i,                     // the source itself says this asset does not exist
];

test('EVERY SOURCE RESOLVES TO A DOWNLOAD OR TO A STATED REASON — never to silence', async () => {
  const unclassified = [];
  for (const source of L.ASSET_SOURCE_SITES) {
    const r = await I.resolveDownload(rowFor(source));
    if ('url' in r) {
      assert.match(r.url, /^https:\/\//, `${source}: a download must be an https URL`);
      assert.ok(r.contentType && r.contentType.includes('/'), `${source}: a download must state its content type`);
      continue;
    }
    assert.ok(r.error && r.error.length > 20, `${source}: a refusal must be a sentence, not a word`);
    if (!STATED_REASONS.some((re) => re.test(r.error))) unclassified.push(`${source}: ${r.error}`);
  }
  assert.deepEqual(
    unclassified,
    [],
    `these sources refuse for a reason nobody classified — decide what they are:\n  ${unclassified.join('\n  ')}`,
  );
});

test('a source nobody has thought about is caught by name, not waved through', async () => {
  // The control. If the loop above passed because the refusal branch accepts anything, an
  // unknown source would pass too — and the guard would be measuring nothing.
  const r = await I.resolveDownload(rowFor('some_site_nobody_added'));
  assert.ok(!('url' in r), 'an unknown source must not produce a download');
  assert.match(r.error, /no download resolver/);
  assert.equal(
    STATED_REASONS.some((re) => re.test(r.error)),
    false,
    'and it must NOT match any stated reason — otherwise the test above proves nothing',
  );
});

test('the sources that CAN be imported each name a real fetchable address', async () => {
  // Not a network call: the shape. A resolver that returned a relative path or a page URL instead
  // of a file would fail at download time with an error about the SOURCE rather than about us.
  for (const [source, mustMatch] of [
    ['game_icons', /game-icons\.net\/icons\/.+\.png$/],
    ['cgbookcase', /cgbookcase\.b-cdn\.net\/.+\.png$/],
    ['ambientcg', /ambientcg\.com\/get\?file=.+\.zip$/],
  ]) {
    const r = await I.resolveDownload({ ...rowFor(source), name: 'Example Asset' });
    assert.ok('url' in r, `${source} must resolve to a download: ${r.error}`);
    assert.match(r.url, mustMatch, source);
  }
});

test('poly haven answers differently for a texture and for geometry, from the id alone', async () => {
  // One source, three id namespaces, three different answers — which is why the classification
  // cannot be per-source in every case and why this test reads ids rather than source names.
  // A REAL Poly Haven id, because the answer comes from their files API: the models namespace
  // publishes gltf and no 1k diffuse map, so the refusal is theirs to produce and ours to read.
  const model = await I.resolveDownload({ ...rowFor('poly_haven'), id: 'poly_haven/models/adjustable-wrench', name: 'Adjustable Wrench' });
  assert.ok(!('url' in model), 'geometry must not resolve to a download');
  assert.match(model.error, /no Open Use path/);

  const texture = await I.resolveDownload({ ...rowFor('poly_haven'), id: 'poly_haven/textures/brick-wall-001', name: 'Brick Wall 001' });
  assert.ok('url' in texture, `a texture must resolve: ${texture.error}`);
  assert.match(texture.url, /\.(jpg|png)$/, 'and to an actual image file');
});
