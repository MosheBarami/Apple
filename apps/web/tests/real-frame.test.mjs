/**
 * The decoder, against a REAL frame from a real place.
 *
 * WHY THIS EXISTS BESIDE playtest-viewport.test.mjs. That file covers the decoder's
 * edges with 2x1 hand-made pixels, which is the right shape for edges and proves
 * nothing about real output. The frame this reads is the one
 * `docs/evidence/2026-09-01-browser-drew-a-real-frame.md` is about: 160x100, rasterised
 * out of the live benchmark place by the plugin's own Render.luau, 952 parts
 * considered and 628 visible.
 *
 * That evidence rested on ONE manual browser session. A review's fair objection was
 * that `encodeRGB` — the base64 packer the whole claim depends on — is covered by no
 * test at all. This does not test encodeRGB directly (it is a local function inside a
 * Luau module) but it does test the thing that matters: that the shipped decoder turns
 * real plugin output back into the exact pixels, on both wire encodings, in CI, every
 * run.
 *
 * The fixture is the committed evidence PNG rather than a 64KB base64 blob, so the
 * picture in the evidence document and the bytes in this test cannot drift apart.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeFrame } from '../src/lib/frame-decode.ts';
import { rleEncode } from '../../worker/src/frame-bus.ts';

const PNG = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..',
  'docs', 'evidence', '2026-09-01-playtest-frame-parkour.png');

/** Minimal PNG reader: 8-bit RGB, no interlace — which is what we wrote. */
function readPng(file) {
  const buf = readFileSync(file);
  let pos = 8; // signature
  let width = 0, height = 0;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      assert.equal(data[8], 8, 'expected 8-bit channels');
      assert.equal(data[9], 2, 'expected colour type 2 (RGB)');
      assert.equal(data[12], 0, 'expected no interlace');
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 3;
  const out = new Uint8Array(width * height * 3);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i += 1) {
      const a = i >= 3 ? cur[i - 3] : 0;
      const b = prev[i];
      const c = i >= 3 ? prev[i - 3] : 0;
      const x = line[i];
      if (filter === 0) cur[i] = x;
      else if (filter === 1) cur[i] = (x + a) & 255;
      else if (filter === 2) cur[i] = (x + b) & 255;
      else if (filter === 3) cur[i] = (x + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        cur[i] = (x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else assert.fail(`unsupported PNG filter ${filter}`);
    }
    out.set(cur, y * stride);
    prev = cur;
  }
  return { width, height, rgb: out };
}

const frame = readPng(PNG);

test('the committed evidence frame is the size the plugin rasterises at', () => {
  // PLAYTEST_FRAME_WIDTH/HEIGHT in frame-bus.ts. If those move, this fixture is stale.
  assert.deepEqual([frame.width, frame.height], [160, 100]);
  assert.equal(frame.rgb.length, 160 * 100 * 3);
});

test('it is a picture, not a fill — the decode is worth testing on it', () => {
  // A frame of one colour would round-trip through anything. This one has the 141
  // distinct colours the evidence document reports.
  const seen = new Set();
  for (let i = 0; i < frame.rgb.length; i += 3) {
    seen.add((frame.rgb[i] << 16) | (frame.rgb[i + 1] << 8) | frame.rgb[i + 2]);
  }
  assert.equal(seen.size, 141, 'the frame no longer has the colour count the evidence cites');
});

test('rgb24: the shipped decoder returns the exact bytes, on real output', () => {
  const out = decodeFrame({
    rgbBase64: Buffer.from(frame.rgb).toString('base64'),
    encoding: 'rgb24',
    width: frame.width,
    height: frame.height,
  });
  assert.ok(out, 'decodeFrame returned null on a real frame');
  assert.equal(out.length, frame.rgb.length);
  assert.ok(Buffer.from(out).equals(Buffer.from(frame.rgb)), 'the decoded pixels differ from the source');
});

test('rle24: the real frame survives the packing the wire actually uses', () => {
  // The ledger records "RLE24 packs it 82,944 -> 8,868 bytes and round-trips
  // byte-exactly" as a measurement from one manual session. This is that, in CI.
  const packed = rleEncode(frame.rgb);
  assert.ok(packed.length < frame.rgb.length, 'RLE made this frame bigger');
  const out = decodeFrame({
    rgbBase64: Buffer.from(packed).toString('base64'),
    encoding: 'rle24',
    width: frame.width,
    height: frame.height,
  });
  assert.ok(out, 'decodeFrame returned null on a real RLE frame');
  assert.ok(Buffer.from(out).equals(Buffer.from(frame.rgb)),
    'the RLE round-trip is not byte-exact on real geometry');
});

test('RLE earns its place on this frame rather than in principle', () => {
  // A codec that compresses a synthetic gradient and not a real render is not a codec
  // this product should be paying for. The claimed ratio is ~10.7%.
  const packed = rleEncode(frame.rgb);
  const ratio = packed.length / frame.rgb.length;
  assert.ok(ratio < 0.35, `RLE only reached ${(ratio * 100).toFixed(1)}% on a real frame`);
});
