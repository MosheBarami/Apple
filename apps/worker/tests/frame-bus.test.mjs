/**
 * FRAME ADMISSION: the gates between a plugin's pixel payload and a browser.
 *
 * WHAT THESE PROTECT. The frame body is a base64 string produced inside Studio
 * on a user's own machine and forwarded by the worker to that user's browser.
 * Before frame-bus.ts existed the worker forwarded it verbatim: no size ceiling,
 * no rate ceiling, and no check that the declared width and height had anything
 * to do with the payload. Each of those is asserted here, and each has a
 * specific failure it prevents:
 *
 *   - size:      a payload large enough to wedge the socket or the browser tab
 *   - dimension: a frame whose declared size disagrees with its bytes, which
 *                paints garbage or reads past the end of its buffer
 *   - rate:      a capture loop with no floor, which stalls the user's Studio
 *                because every rasterise runs on its main thread
 *   - eviction:  an unbounded replay buffer inside a long-lived Durable Object
 *
 * AND ONE CORRECTNESS PROPERTY that is easy to get wrong quietly: the RLE codec
 * must round-trip exactly, and must never make a frame BIGGER than sending it
 * raw. A compressor that can silently inflate its input is a bug waiting for
 * the one scene that triggers it, and that scene would be a busy one — exactly
 * when the bandwidth mattered most.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  admitFrame,
  FrameRate,
  FrameRing,
  MAX_FRAME_BASE64,
  MAX_FRAME_PIXELS,
  PLAYTEST_FRAME_MIN_INTERVAL_MS,
  packFrame,
  rleDecode,
  rleEncode,
} from '../src/frame-bus.ts';

// ---------------------------------------------------------------- helpers

const b64 = (bytes) => Buffer.from(bytes).toString('base64');

/** Pixels shaped like the plugin's rasteriser output: flat fills, flat quads. */
function flatScene(w, h, boxes = 24, seed = 7) {
  const px = new Uint8Array(w * h * 3);
  const SKY = [0x9f, 0xc7, 0xe8];
  const GROUND = [0x6e, 0x7a, 0x63];
  for (let y = 0; y < h; y += 1) {
    const c = 1 - ((y + 0.5) / h) * 2 < -0.02 ? GROUND : SKY;
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 3;
      px[i] = c[0];
      px[i + 1] = c[1];
      px[i + 2] = c[2];
    }
  }
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let b = 0; b < boxes; b += 1) {
    const bw = Math.max(1, Math.floor(w * (0.06 + rnd() * 0.18)));
    const bh = Math.max(1, Math.floor(h * (0.08 + rnd() * 0.3)));
    const x0 = Math.floor(rnd() * (w - bw));
    const y0 = Math.floor(rnd() * (h - bh));
    const col = [Math.floor(rnd() * 200) + 30, Math.floor(rnd() * 200) + 30, Math.floor(rnd() * 200) + 30];
    for (let y = y0; y < y0 + bh; y += 1) {
      for (let x = x0; x < x0 + bw; x += 1) {
        const i = (y * w + x) * 3;
        px[i] = col[0];
        px[i + 1] = col[1];
        px[i + 2] = col[2];
      }
    }
  }
  return px;
}

/** Pixels with no runs at all: the adversarial case for RLE. */
function noise(w, h) {
  const px = new Uint8Array(w * h * 3);
  for (let i = 0; i < px.length; i += 1) px[i] = (i * 2654435761) % 256;
  return px;
}

function frameOf(px, w, h, extra = {}) {
  return {
    rgbBase64: b64(px),
    width: w,
    height: h,
    view: 'eye',
    subject: 'game.Workspace',
    capturedAt: 1_000_000,
    ...extra,
  };
}

function pngStub(w, h) {
  const b = new Uint8Array(24);
  b.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a], 0);
  b.set([0,0,0,13,0x49,0x48,0x44,0x52], 8);
  b[16]=(w>>>24)&255; b[17]=(w>>>16)&255; b[18]=(w>>>8)&255; b[19]=w&255;
  b[20]=(h>>>24)&255; b[21]=(h>>>16)&255; b[22]=(h>>>8)&255; b[23]=h&255;
  return b;
}

// ---------------------------------------------------------------- size cap

test('a frame larger than the base64 ceiling is refused, not truncated', () => {
  const huge = 'A'.repeat(MAX_FRAME_BASE64 + 4);
  const v = admitFrame({ ...frameOf(new Uint8Array(3), 1, 1), rgbBase64: huge });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'too-large');
});

test('a frame claiming more pixels than the renderer can produce is refused', () => {
  // The plugin clamps to 320x240 in Render.capture, so anything larger cannot
  // have come from a render this worker asked for.
  const w = 400;
  const h = 400;
  assert.ok(w * h > MAX_FRAME_PIXELS);
  const v = admitFrame(frameOf(new Uint8Array(9), w, h));
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'too-many-pixels');
});

test('a frame at exactly the pixel ceiling is admitted', () => {
  // A ceiling that also rejects the legal maximum is an off-by-one, and would
  // silently drop the largest render the agent legitimately takes.
  const w = 320;
  const h = 240;
  assert.equal(w * h, MAX_FRAME_PIXELS);
  const v = admitFrame(frameOf(flatScene(w, h), w, h));
  assert.equal(v.ok, true);
});

// ---------------------------------------------------------------- dimensions

test('declared dimensions must match the payload, or the frame is refused', () => {
  // The failure this prevents: the browser decodes width*height*3 bytes out of
  // a shorter buffer and paints black where there was no data, which is
  // indistinguishable from a scene that really is black there.
  const px = flatScene(32, 32);
  const v = admitFrame(frameOf(px, 64, 64)); // claims 4x the pixels it has
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'payload-mismatch');
});

test('a payload longer than needed is fine — the encoder pads to a group boundary', () => {
  // Render.luau encodes three pixels at a time, so the last group can carry up
  // to two pixels of padding. Refusing that would reject valid frames.
  const w = 5;
  const h = 5;
  const px = new Uint8Array(w * h * 3 + 6);
  const v = admitFrame(frameOf(px, w, h));
  assert.equal(v.ok, true);
});

test('nonsense dimensions are refused rather than coerced', () => {
  for (const [w, h] of [
    [0, 10],
    [10, 0],
    [-4, 4],
    [1.5, 4],
    [Number.NaN, 4],
  ]) {
    const v = admitFrame(frameOf(new Uint8Array(300), w, h));
    assert.equal(v.ok, false, `${w}x${h} must be refused`);
    assert.equal(v.reason, 'bad-dimensions');
  }
});

test('a payload that is not valid base64 is refused', () => {
  const v = admitFrame({ ...frameOf(new Uint8Array(3), 1, 1), rgbBase64: '!!!not base64!!!' });
  assert.equal(v.ok, false);
});

test('an empty payload is refused', () => {
  const v = admitFrame({ ...frameOf(new Uint8Array(3), 1, 1), rgbBase64: '' });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'empty');
});

test('a bounded Studio viewport PNG is admitted with its source intact', () => {
  const v = admitFrame({
    ...frameOf(pngStub(160, 100), 160, 100),
    encoding: 'png',
    source: 'studio_viewport',
  });
  assert.equal(v.ok, true);
  assert.equal(v.frame.encoding, 'png');
  assert.equal(v.frame.source, 'studio_viewport');
});

test('PNG dimensions must agree with the capture metadata', () => {
  const v = admitFrame({
    ...frameOf(pngStub(160, 100), 200, 100),
    encoding: 'png',
    source: 'studio_viewport',
  });
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'payload-mismatch');
});

// ---------------------------------------------------------------- RLE codec

test('RLE round-trips exactly on rasteriser-shaped pixels', () => {
  for (const [w, h] of [
    [160, 100],
    [288, 180],
    [48, 32],
  ]) {
    const px = flatScene(w, h);
    const back = rleDecode(rleEncode(px), w * h);
    assert.deepEqual(back, px, `${w}x${h} must round-trip byte for byte`);
  }
});

test('RLE round-trips exactly on pixels with no runs at all', () => {
  const px = noise(64, 40);
  assert.deepEqual(rleDecode(rleEncode(px), 64 * 40), px);
});

test('RLE round-trips across a run longer than one record can hold', () => {
  // Records cap at 255 pixels. A 1000-pixel flat span must split into four
  // records and reassemble, not wrap around to a count of zero.
  const px = new Uint8Array(1000 * 3);
  px.fill(0x42);
  const packed = rleEncode(px);
  assert.equal(packed.length, 4 * 4, 'a 1000-pixel run is exactly four records');
  assert.deepEqual(rleDecode(packed, 1000), px);
});

test('a malformed RLE stream decodes to null rather than a partial picture', () => {
  assert.equal(rleDecode(new Uint8Array([3, 1, 2]), 3), null, 'truncated record');
  assert.equal(rleDecode(new Uint8Array([0, 1, 2, 3]), 3), null, 'zero-length run');
  assert.equal(rleDecode(new Uint8Array([9, 1, 2, 3]), 3), null, 'run overruns the frame');
  assert.equal(rleDecode(new Uint8Array([1, 1, 2, 3]), 3), null, 'stream ends short of the frame');
});

test('packing NEVER produces a larger payload than sending raw', () => {
  // The property that makes the adaptive choice safe. Measured: RLE is ~12x
  // smaller on flat-shaded output but 1.33x LARGER on high-entropy input, so
  // an unconditional RLE would have made the worst case worse.
  for (const px of [flatScene(160, 100), noise(160, 100), new Uint8Array(300), flatScene(48, 32, 200)]) {
    const raw = Buffer.from(px).toString('base64');
    const packed = packFrame(px);
    assert.ok(
      packed.base64.length <= raw.length,
      `packed ${packed.base64.length} must not exceed raw ${raw.length}`,
    );
  }
});

test('high-entropy pixels fall back to rgb24, and still round-trip', () => {
  const px = noise(80, 50);
  const packed = packFrame(px);
  assert.equal(packed.encoding, 'rgb24', 'noise must not be RLE-encoded');
  assert.deepEqual(new Uint8Array(Buffer.from(packed.base64, 'base64')), px);
});

test('flat-shaded pixels compress substantially — the whole reason for the codec', () => {
  const px = flatScene(160, 100);
  const raw = Buffer.from(px).toString('base64');
  const packed = packFrame(px);
  assert.equal(packed.encoding, 'rle24');
  // Measured ~12x on this content. Asserting a floor of 4x leaves room for the
  // synthetic scene to change without making the test brittle, while still
  // failing loudly if the codec ever stops working.
  assert.ok(
    raw.length / packed.base64.length > 4,
    `expected >4x, got ${(raw.length / packed.base64.length).toFixed(1)}x`,
  );
});

test('recompression preserves the pixels exactly', () => {
  // The frame the browser paints must be the frame Studio rendered. A codec
  // that quantised or dithered would be inventing pixels.
  const px = flatScene(160, 100);
  const v = admitFrame(frameOf(px, 160, 100), { recompress: true });
  assert.equal(v.ok, true);
  const bytes = new Uint8Array(Buffer.from(v.frame.rgbBase64, 'base64'));
  const decoded = v.frame.encoding === 'rle24' ? rleDecode(bytes, 160 * 100) : bytes.subarray(0, 160 * 100 * 3);
  assert.deepEqual(decoded, px);
});

test('without recompression the payload is passed through untouched', () => {
  // The critique render path is unchanged by any of this, and says so.
  const px = flatScene(288, 180);
  const original = b64(px);
  const v = admitFrame(frameOf(px, 288, 180), { recompress: false });
  assert.equal(v.ok, true);
  assert.equal(v.frame.rgbBase64, original);
  assert.equal(v.frame.encoding, 'rgb24');
});

// ---------------------------------------------------------------- rate cap

test('the first frame is always allowed', () => {
  const rate = new FrameRate();
  assert.equal(rate.take(0).ok, true);
});

test('a second frame inside the interval floor is refused', () => {
  // The cost this protects is not bandwidth. The rasteriser runs synchronously
  // on Studio's main thread, so a burst of captures freezes the editor and
  // stalls the very simulation the user is trying to watch.
  const rate = new FrameRate();
  rate.take(10_000);
  const v = rate.take(10_000 + PLAYTEST_FRAME_MIN_INTERVAL_MS - 1);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'rate-limited');
});

test('a frame exactly at the interval is allowed', () => {
  const rate = new FrameRate();
  rate.take(10_000);
  assert.equal(rate.take(10_000 + PLAYTEST_FRAME_MIN_INTERVAL_MS).ok, true);
});

test('a refused frame does not consume the allowance', () => {
  // Otherwise a fast loop would burn the whole budget on rejections and the
  // user would watch a playtest that never showed them anything.
  const rate = new FrameRate(1000, 5);
  rate.take(0);
  for (let i = 0; i < 20; i += 1) rate.take(1);
  assert.equal(rate.taken, 1);
  assert.equal(rate.take(1000).ok, true);
  assert.equal(rate.taken, 2);
});

test('the budget is a hard stop, however long the playtest runs', () => {
  const rate = new FrameRate(100, 3);
  let t = 0;
  for (let i = 0; i < 3; i += 1) {
    assert.equal(rate.take(t).ok, true);
    t += 100;
  }
  const v = rate.take(t);
  assert.equal(v.ok, false);
  assert.equal(v.reason, 'budget-exhausted');
  assert.equal(rate.remaining, 0);
});

test('no burst is permitted after an idle period', () => {
  // A token bucket would have accumulated allowance here and released it all
  // at once. This is a floor on the interval precisely so it cannot.
  const rate = new FrameRate(1000, 10);
  rate.take(0);
  assert.equal(rate.take(60_000).ok, true, 'one frame after a long idle');
  assert.equal(rate.take(60_001).ok, false, 'but not a second immediately after');
});

// ---------------------------------------------------------------- eviction

test('the ring evicts oldest-first at its count limit', () => {
  const ring = new FrameRing(3, 1e9);
  for (let i = 0; i < 6; i += 1) ring.push({ rgbBase64: 'aaaa', seq: i, width: 1, height: 1 });
  assert.equal(ring.size, 3);
  assert.deepEqual(
    ring.list().map((f) => f.seq),
    [3, 4, 5],
    'newest three, in arrival order',
  );
});

test('the ring evicts on bytes even when the count limit is far off', () => {
  // A count cap alone still admits six 200KB critique frames into a
  // long-lived Durable Object's memory.
  const ring = new FrameRing(100, 1000);
  for (let i = 0; i < 10; i += 1) ring.push({ rgbBase64: 'x'.repeat(400), seq: i, width: 1, height: 1 });
  assert.ok(ring.byteLength <= 1000, `held ${ring.byteLength} bytes`);
  assert.ok(ring.size < 10);
});

test('a single frame over the byte limit is still kept', () => {
  // Evicting down to nothing would leave a reconnecting browser with no
  // picture at all, which is worse than holding one large one.
  const ring = new FrameRing(5, 100);
  ring.push({ rgbBase64: 'x'.repeat(5000), seq: 1, width: 1, height: 1 });
  assert.equal(ring.size, 1);
});

test('clearing the ring releases its byte accounting too', () => {
  const ring = new FrameRing(5, 1e6);
  ring.push({ rgbBase64: 'x'.repeat(100), width: 1, height: 1 });
  ring.clear();
  assert.equal(ring.size, 0);
  assert.equal(ring.byteLength, 0);
});

// ---------------------------------------------------------------- budget maths

test('the playtest stream stays inside its stated per-minute budget', () => {
  // The number the design doc quotes, asserted rather than asserted-in-prose.
  // A frame every 1500ms at 160x100 of representative content.
  const px = flatScene(160, 100);
  const perFrame = packFrame(px).base64.length;
  const framesPerMinute = 60_000 / PLAYTEST_FRAME_MIN_INTERVAL_MS;
  const bytesPerMinute = perFrame * framesPerMinute;
  assert.ok(
    bytesPerMinute < 512 * 1024,
    `${(bytesPerMinute / 1024).toFixed(0)} KB/min exceeds the half-megabyte budget`,
  );
});
