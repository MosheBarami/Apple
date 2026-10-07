// The GLB facts and the pack ingester (master plan §4.4 steps 2, 3 and 6): real numbers from the file, the licence
// file must agree with the ledger, and nothing is invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { glbJson, glbStats } from '../src/glb.mjs';
import { packItems, releaseDate } from '../src/ingest-pack.mjs';

function glb(json) {
  let j = Buffer.from(JSON.stringify(json));
  if (j.length % 4) j = Buffer.concat([j, Buffer.alloc(4 - (j.length % 4), 0x20)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(20 + j.length, 8);
  head.writeUInt32LE(j.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, j]);
}
const cube = { meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }], materials: [{}], accessors: [{ count: 24, min: [-1, 0, -0.5], max: [1, 2, 0.5] }, { count: 36 }] };

test('glbStats counts triangles from the indices and sizes the box from POSITION min and max', () => {
  const s = glbStats(glbJson(glb(cube)));
  assert.equal(s.triangles, 12);
  assert.deepEqual(s.size, [2, 2, 1]);
  assert.equal(s.meshes, 1);
  assert.throws(() => glbJson(Buffer.from('not a glb at all, really')), /not a GLB/);
});

test('releaseDate reads the first dd/mm/yyyy of the evidence', () => {
  assert.equal(releaseDate('1.0 Released in 2015 (25/09/2015); 2.0 01/02/2024'), '2015-09-25');
  assert.equal(releaseDate('no date here'), undefined);
});

const row = { pack: 'Test Kit', url: 'https://kenney.nl/assets/test-kit', categories: [1], licence_words: 'Creative Commons CC0', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/', human_made_evidence: 'Released 25/09/2015' };
function pack(licence, files) {
  const dir = join(mkdtempSync(join(tmpdir(), 'ingest-')), 'test-kit');
  mkdirSync(join(dir, 'Models', 'GLB format'), { recursive: true });
  if (licence !== null) writeFileSync(join(dir, 'License.txt'), licence);
  for (const f of files) writeFileSync(join(dir, 'Models', 'GLB format', f), glb(cube));
  return dir;
}

test('a CC0 pack becomes one valid item per GLB, with provenance, the file hash and the ai_check', () => {
  const r = packItems(row, pack('License: (Creative Commons Zero, CC0)', ['crate-large.glb', 'barrel.glb']), { author: 'Kenney', fetchedAt: '2026-10-07T00:00:00.000Z' });
  assert.equal(r.items.length, 2);
  const crate = r.items.find((i) => i.id === 'kenney:test-kit:crate-large');
  assert.ok(crate, r.items.map((i) => i.id).join());
  assert.equal(crate.licence_class, 'cc0');
  assert.match(crate.file_sha256, /^[0-9a-f]{64}$/);
  assert.equal(crate.ai_check.pass, true);
  assert.equal(crate.checks.triangles, 12);
  assert.deepEqual(crate.tags.sort(), ['crate', 'large', 'test']);
});

test('a pack whose licence file disagrees with the ledger, or has none, is skipped whole', () => {
  assert.match(packItems(row, pack('All rights reserved. Personal use only.', ['a.glb']), { author: 'Kenney', fetchedAt: '2026-10-07T00:00:00.000Z' }).skipped, /licence file/);
  assert.match(packItems(row, pack(null, ['a.glb']), { author: 'Kenney', fetchedAt: '2026-10-07T00:00:00.000Z' }).skipped, /licence file/);
  assert.match(packItems(row, pack('CC0', []), { author: 'Kenney', fetchedAt: '2026-10-07T00:00:00.000Z' }).skipped, /no GLB/);
});

test('itemSql upserts an item, escapes quotes, and never overwrites a grade on re-ingest', async () => {
  const { itemSql } = await import('../src/to-sql.mjs');
  const sql = itemSql({ id: 'kenney:k:a', title: "Bob's crate", kind: 'prop', family: 'kenney:k', tags: ['crate'], source_url: 'https://x', author: 'Kenney', licence_words: 'CC0', licence_class: 'cc0', licence_url: 'https://y', fetched_at: '2026-10-07', uploader: 'none', ai_check: { pass: true }, checks: { triangles: 12 } }, '2026-10-07T00:00:00Z');
  assert.match(sql, /'Bob''s crate'/);
  assert.match(sql, /ON CONFLICT\(id\) DO UPDATE SET/);
  assert.doesNotMatch(sql.split('DO UPDATE SET')[1], /grade = excluded\.grade/);
  assert.match(sql, /, 12, NULL, '2026-10-07T00:00:00Z'\) ON CONFLICT/, 'triangles, an empty grade, then the update time');
});

test('gradeSql writes only the grade, its notes and the time, for one id', async () => {
  const { gradeSql } = await import('../src/to-sql.mjs');
  const sql = gradeSql({ id: 'kenney:k:a', grade: 'B', grade_notes: [{ critic: '1', grade: 'B', why: "plain" }] }, 'T');
  assert.match(sql, /^UPDATE library_items SET grade = 'B', grade_notes = '\[.*\]', updated_at = 'T' WHERE id = 'kenney:k:a';$/);
});

test('a vector id fits Vectorize (40 hex chars) and the embedded text is the card line with the tags', async () => {
  const { vectorId, embedText } = await import('../src/embed.mjs');
  const id = 'kenney:modular-dungeon-kit:' + 'x'.repeat(80);
  assert.match(vectorId(id), /^[0-9a-f]{40}$/);
  const t = embedText({ id: 'kenney:k:stall-red', title: 'stall red (Fantasy Town Kit)', kind: 'prop', family: 'kenney:k', grade: 'A', tags: ['stall', 'red'], checks: { triangles: 300 } });
  assert.match(t, /stall red \(Fantasy Town Kit\) \| prop \| family kenney:k \| grade A/);
  assert.match(t, /stall, red/);
});
