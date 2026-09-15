// Reading one file out of a ZIP, with only what the runtime already has.
//
// Three sources publish archives and nothing else — ambientCG is zip-only by its own API — so
// without this, 10,515 library rows are catalogue entries that can never become anything. The
// alternative was measured and rejected: resvg's WASM added 2.4 MB to every cold start and broke
// 33 test files. This costs nothing, because DecompressionStream is built in.
//
// THE CASES ARE ABOUT WRONG ANSWERS THAT LOOK RIGHT. A zip reader fails loudly when it fails at
// all; what it does quietly is hand back the wrong entry, or a short one, and both of those become
// an upload that succeeds and an asset that is wrong.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { deflateRawSync } from 'node:zlib';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'unzip-')), 'z.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'unzip.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + out],
  { cwd: WORKER, stdio: 'pipe' });
const Z = await import(`file://${out}`);

/* ------------------------------------------------------------------ a real archive --- */

/**
 * Build a genuine ZIP, byte for byte, rather than checking the reader against a fixture it was
 * written from. `deflateRawSync` produces the same bare deflate stream a real writer does, so the
 * DecompressionStream path below is the real one.
 */
function makeZip(files) {
  const enc = new TextEncoder();
  const locals = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const raw = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
    const stored = f.stored === true;
    const body = stored ? raw : deflateRawSync(Buffer.from(raw));
    // A REAL EXTRA FIELD. Every archive a real writer produces has one — an extended timestamp,
    // a Unix uid/gid block — and the data does not start until after it. Writing zero here made
    // the reader's `+ extraLen` term untestable: deleting it left all ten cases green, because the
    // fixture was the only archive in the world without extra fields.
    const extra = new Uint8Array([0x55, 0x54, 0x05, 0x00, 0x03, 0xd2, 0x04, 0x00, 0x00]);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, f.encrypted ? 1 : 0, true);
    lh.setUint16(8, stored ? 0 : (f.method ?? 8), true);
    lh.setUint32(14, 0, true);
    lh.setUint32(18, body.length, true);
    lh.setUint32(22, raw.length, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, extra.length, true);
    const localBytes = new Uint8Array(30 + name.length + extra.length + body.length);
    localBytes.set(new Uint8Array(lh.buffer), 0);
    localBytes.set(name, 30);
    localBytes.set(extra, 30 + name.length);
    localBytes.set(body, 30 + name.length + extra.length);
    locals.push(localBytes);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(8, f.encrypted ? 1 : 0, true);
    ch.setUint16(10, stored ? 0 : (f.method ?? 8), true);
    ch.setUint32(20, body.length, true);
    ch.setUint32(24, f.lyingSize ?? raw.length, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    const centralBytes = new Uint8Array(46 + name.length);
    centralBytes.set(new Uint8Array(ch.buffer), 0);
    centralBytes.set(name, 46);
    central.push(centralBytes);
    offset += localBytes.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, dirSize, true);
  eocd.setUint32(16, offset, true);
  const total = offset + dirSize + 22;
  const zip = new Uint8Array(total);
  let at = 0;
  for (const l of locals) { zip.set(l, at); at += l.length; }
  for (const c of central) { zip.set(c, at); at += c.length; }
  zip.set(new Uint8Array(eocd.buffer), at);
  return zip.buffer;
}

const MATERIAL = () => makeZip([
  { name: 'Ground037_1K-JPG_NormalGL.jpg', data: 'normal-map-bytes-lilac' },
  { name: 'Ground037_1K-JPG_Roughness.jpg', data: 'roughness-map-bytes-grey' },
  { name: 'Ground037_1K-JPG_Color.jpg', data: 'the-actual-colour-map' },
  { name: 'Ground037_1K-JPG_AmbientOcclusion.jpg', data: 'ao-map-bytes-white' },
]);

/* ---------------------------------------------------------------------- listing --- */

test('a real archive lists every entry with the directory own sizes', () => {
  const r = Z.listZip(MATERIAL());
  assert.equal(r.ok, true, r.error);
  assert.equal(r.entries.length, 4);
  assert.deepEqual(r.entries.map((e) => e.name).sort(), [
    'Ground037_1K-JPG_AmbientOcclusion.jpg',
    'Ground037_1K-JPG_Color.jpg',
    'Ground037_1K-JPG_NormalGL.jpg',
    'Ground037_1K-JPG_Roughness.jpg',
  ]);
});

test('input that is not a zip is refused, and says which way it is wrong', () => {
  for (const [bad, re] of [
    [new Uint8Array(4).buffer, /too short/],
    [new TextEncoder().encode('not a zip at all, but long enough to be one honestly').buffer, /not a zip|end-of-central/],
  ]) {
    const r = Z.listZip(bad);
    assert.equal(r.ok, false);
    assert.match(r.error, re);
  }
});

/* ------------------------------------------------------------------- extracting --- */

test('THE COLOUR MAP IS CHOSEN, NOT THE FIRST IMAGE', async () => {
  // The whole point. A material ships six maps and five are wrong: a normal map is a lilac
  // surface, a roughness map is grey, an AO map is nearly white. All six are images and all six
  // would upload successfully, so a reader that took entries[0] would build a library of
  // plausible-looking, uniformly wrong textures.
  const r = await Z.extractFromZip(MATERIAL(), Z.pickBaseColour);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.name, 'Ground037_1K-JPG_Color.jpg');
  assert.equal(new TextDecoder().decode(r.bytes), 'the-actual-colour-map');
});

test('and every spelling the sources use is recognised', async () => {
  for (const name of ['x_BaseColor.png', 'x_Color.jpg', 'x_diffuse.jpg', 'x_albedo.png', 'x_COL.jpg']) {
    const zip = makeZip([{ name: 'x_Normal.jpg', data: 'wrong' }, { name, data: 'right' }]);
    const r = await Z.extractFromZip(zip, Z.pickBaseColour);
    assert.equal(r.ok, true, `${name}: ${r.error}`);
    assert.equal(new TextDecoder().decode(r.bytes), 'right', name);
  }
});

test('AN ARCHIVE WITH NO COLOUR MAP IS A REFUSAL, NOT A FALLBACK', async () => {
  // Returning the normal map here would be a wrong answer that looks like a right one, and it
  // would look right all the way through the upload and into somebody game.
  const zip = makeZip([
    { name: 'x_NormalGL.jpg', data: 'lilac' },
    { name: 'x_Roughness.jpg', data: 'grey' },
  ]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, false);
  assert.equal(r.bytes, undefined);
  assert.match(r.error, /no entry matched/);
  assert.match(r.error, /x_NormalGL\.jpg/, 'and it must list what was there, so the predicate can be judged');
});

test('a stored (uncompressed) entry reads back exactly', async () => {
  const zip = makeZip([{ name: 'a_Color.png', data: 'stored-colour-bytes', stored: true }]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, true, r.error);
  assert.equal(new TextDecoder().decode(r.bytes), 'stored-colour-bytes');
});

test('A SHORT INFLATE IS A FAILURE — an image that is 90% there is a broken upload', async () => {
  // The directory says how big the entry should be. A truncated download that still inflates must
  // not pass as a success, because the next step uploads it and Roblox will take it.
  const zip = makeZip([{ name: 'a_Color.jpg', data: 'twelve bytes', lyingSize: 999 }]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, false);
  assert.match(r.error, /inflated to \d+ bytes, the directory says 999/);
});

test('an encrypted entry is named, not handed back as noise', async () => {
  const zip = makeZip([{ name: 'a_Color.jpg', data: 'x', encrypted: true }]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, false);
  assert.match(r.error, /encrypted/);
});

test('an unimplemented compression method is refused by number', async () => {
  const zip = makeZip([{ name: 'a_Color.jpg', data: 'x', method: 14 }]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, false);
  assert.match(r.error, /method 14/);
});

test('mac metadata is not mistaken for an image', async () => {
  const zip = makeZip([
    { name: '__MACOSX/._a_Color.jpg', data: 'resource fork' },
    { name: 'a_Color.jpg', data: 'the real one' },
  ]);
  const r = await Z.extractFromZip(zip, Z.pickBaseColour);
  assert.equal(r.ok, true, r.error);
  assert.equal(new TextDecoder().decode(r.bytes), 'the real one');
});
