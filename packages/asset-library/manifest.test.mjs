// The committed manifest describes the packs that are actually on disk, under a licence the pack
// itself states, and nothing else sits in a pack folder.
//   node --test packages/asset-library
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from './build-manifest.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const manifest = JSON.parse(readFileSync(join(HERE, 'manifest.json'), 'utf8'));
const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8'));

test('the manifest lists packs, so nothing below passes over an empty list', () => {
  assert.ok(Array.isArray(manifest.packs) && manifest.packs.length >= 5, `only ${manifest.packs?.length} packs`);
});

test('every pack carries its own licence file, and that file states CC0 or CC BY', () => {
  for (const p of manifest.packs) {
    const file = join(HERE, p.licenseFile);
    assert.ok(existsSync(file), `${p.id}: ${p.licenseFile} is missing`);
    const text = readFileSync(file, 'utf8');
    assert.match(text, /CC0|Creative Commons Zero|creativecommons\.org\/licenses\/by\//i, `${p.id}: the licence file names no open licence`);
    assert.match(p.license, /^(CC0-1\.0|CC-BY-\d\.\d)$/, `${p.id}: licence "${p.license}"`);
    if (p.license.startsWith('CC-BY')) assert.ok(p.attribution, `${p.id}: CC BY needs an attribution line`);
  }
});

test('every pack has files and its previews exist', () => {
  for (const p of manifest.packs) {
    assert.ok(p.files > 0, `${p.id} has no files`);
    assert.equal(p.previews.length, 3, `${p.id} previews`);
    for (const rel of p.previews) {
      assert.ok(rel.startsWith(p.dir + '/'), `${p.id}: preview ${rel} is outside the pack`);
      assert.ok(statSync(join(HERE, rel)).size > 0, `${p.id}: preview ${rel} is empty`);
    }
  }
});

test('the library holds more than a thousand files', () => {
  const total = manifest.packs.reduce((n, p) => n + p.files, 0);
  assert.ok(total > 1000, `${total} files`);
  assert.equal(manifest.totalFiles, total);
});

test('the committed manifest and index are what the directories say today', () => {
  // Counts are derived, never typed: a pack edited without re-running the builder fails here.
  const fresh = build();
  assert.deepEqual(manifest, fresh.manifest, 'manifest.json is stale: run node packages/asset-library/build-manifest.mjs');
  assert.deepEqual(index, fresh.index, 'index.json is stale: run node packages/asset-library/build-manifest.mjs');
});

test('a pack folder holds images and the licence only (no fonts, sources, archives or pages)', () => {
  const stray = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else if (!/\.(png|svg)$/i.test(name) && !/^licen[cs]e(\.txt|\.md)?$/i.test(name)) stray.push(abs);
    }
  };
  walk(join(HERE, 'packs'));
  assert.deepEqual(stray, []);
});

test('the bundled index names exactly the PNG files of each pack', () => {
  for (const p of manifest.packs) {
    const entry = index.packs.find((x) => x.id === p.id);
    assert.ok(entry, `${p.id} missing from index.json`);
    const n = entry.folders.reduce((k, [, names]) => k + names.length, 0);
    let pngs = 0;
    const walk = (dir) => { for (const name of readdirSync(dir)) { const abs = join(dir, name); if (statSync(abs).isDirectory()) walk(abs); else if (/\.png$/i.test(name)) pngs++; } };
    walk(join(HERE, p.dir));
    assert.equal(n, pngs, `${p.id}: index has ${n} files, manifest ${pngs}`);
    assert.equal(entry.license, p.license);
  }
});
