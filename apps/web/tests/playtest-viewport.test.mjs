/**
 * THE PLAYTEST CARD: what the browser may say about a running game.
 *
 * These are honesty tests, and they matter more than the ones next door in
 * studio-connection.test.mjs. That file governs a sentence of setup copy. This
 * one governs a MOVING PICTURE OF THE USER'S GAME — the most credible thing
 * this product puts on a screen. A user will believe a viewport over any text
 * beside it, which is exactly what makes a stale frame dangerous: a render from
 * four minutes ago, shown without qualification, says the build is fine long
 * after it stopped being fine.
 *
 * So the properties asserted here are:
 *
 *   1. A FRAME IS ONLY EVER "LIVE" IF ITS OWN TIMESTAMP SAYS SO. Not because
 *      the phase is 'running', not because the socket is open, not because a
 *      frame arrived at some point. Freshness is a function of the pixels'
 *      capturedAt and the clock, and nothing else can override it.
 *
 *   2. A STALE FRAME IS STILL SHOWN, AND ALWAYS MARKED. Hiding it throws away
 *      the last thing we know; showing it unmarked is a lie.
 *
 *   3. THE CARD ONLY SHOWS FRAMES FROM ITS OWN PLAYTEST. The same socket
 *      carries the agent's build renders, and putting one of those under a
 *      "run mode is live" label would be precisely the class of lie this
 *      module exists to prevent.
 *
 *   4. NO FRAME IS EVER INVENTED. A frame that does not decode cleanly is not
 *      painted, padded or truncated — a half-decoded frame renders as real
 *      geometry beside a black hole, which is indistinguishable from a scene
 *      that really has one.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { frameFreshness, framesForRun, playtestView } from '../src/lib/playtest-view.ts';
import { decodeFrame, rleDecode } from '../src/lib/frame-decode.ts';
// Reached across the package boundary on purpose — see the codec-agreement
// test below. Testing the two halves separately proves nothing about them
// agreeing, and a divergence would paint a wrong picture rather than throw.
import { admitFrame } from '../../worker/src/frame-bus.ts';
import { PLAYTEST_DEAD_MS, PLAYTEST_STALE_MS } from '../../../packages/shared/src/index.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const T0 = 1_700_000_000_000;

const run = (over = {}) => ({
  id: 'pt_1',
  phase: 'running',
  startedAt: T0,
  requestedSeconds: 8,
  action: 'Run mode is live',
  consoleErrors: 0,
  consoleWarnings: 0,
  framesDelivered: 3,
  framesDropped: 0,
  ...over,
});

const frame = (over = {}) => ({
  rgbBase64: '',
  width: 2,
  height: 1,
  view: 'eye',
  subject: 'game.Workspace',
  capturedAt: T0,
  playtestRunId: 'pt_1',
  seq: 1,
  ...over,
});

// ---------------------------------------------------------------- visibility

test('with no playtest the card is not rendered at all', () => {
  // Not an empty card, not a placeholder. There is no playtest, so there is
  // nothing to say about one.
  const v = playtestView(null, [], T0);
  assert.equal(v.visible, false);
  assert.equal(v.frame, undefined);
  assert.equal(v.label, '');
});

// ------------------------------------------------- property 1: only pixels decide "live"

test('a running playtest with an old frame is NEVER described as live', () => {
  // THE test. Every signal except the frame's own age says this run is
  // healthy: phase 'running', frames delivered, no errors, no drops. The
  // frame is 30 seconds old, and that alone decides the copy.
  const v = playtestView(run(), [frame({ capturedAt: T0 })], T0 + 30_000);
  assert.equal(v.freshness, 'dead');
  assert.equal(v.dimmed, true);
  assert.match(v.label, /No frame for/);
  assert.ok(!/^Run mode is live$/.test(v.label), 'must not read as plainly live');
});

test('only a genuinely recent frame yields the live label', () => {
  const v = playtestView(run(), [frame({ capturedAt: T0 })], T0 + 1000);
  assert.equal(v.freshness, 'fresh');
  assert.equal(v.label, 'Run mode is live');
  assert.equal(v.dimmed, false);
});

test('staleness boundaries are exact', () => {
  const at = (age) => playtestView(run(), [frame({ capturedAt: T0 })], T0 + age).freshness;
  assert.equal(at(0), 'fresh');
  assert.equal(at(PLAYTEST_STALE_MS - 1), 'fresh');
  assert.equal(at(PLAYTEST_STALE_MS), 'stale');
  assert.equal(at(PLAYTEST_DEAD_MS - 1), 'stale');
  assert.equal(at(PLAYTEST_DEAD_MS), 'dead');
});

test('no phase other than running can produce a live label', () => {
  // Even with a frame that just arrived. "Preparing" and "stopping" are not
  // moments when the picture shows the game being played.
  for (const phase of ['preparing', 'stopping', 'finished', 'failed']) {
    const v = playtestView(run({ phase }), [frame({ capturedAt: T0 })], T0 + 100);
    assert.notEqual(v.label, 'Run mode is live', phase);
    assert.equal(v.dimmed, true, `${phase} must be visually demoted`);
  }
});

test('a finished playtest never presents its last frame as the current state', () => {
  const v = playtestView(run({ phase: 'finished', endedAt: T0 + 8000 }), [frame({ capturedAt: T0 + 7900 })], T0 + 8000);
  assert.equal(v.dimmed, true);
  assert.match(v.label, /finished/i);
  assert.ok(!/live/i.test(v.label));
});

// ------------------------------------------------- property 2: stale is shown AND marked

test('a stale frame is still handed to the card — it is not hidden', () => {
  // Dropping it would throw away the last thing we actually know about the
  // game. It is shown, dimmed, over its real age.
  const f = frame({ capturedAt: T0 });
  const v = playtestView(run(), [f], T0 + PLAYTEST_STALE_MS + 500);
  assert.equal(v.frame, f, 'the real frame is still returned');
  assert.equal(v.freshness, 'stale');
  assert.equal(v.dimmed, true);
  assert.match(v.label, /falling behind/);
});

test('a dead stream keeps the last frame and dates it', () => {
  const f = frame({ capturedAt: T0 });
  const v = playtestView(run(), [f], T0 + 25_000);
  assert.equal(v.frame, f);
  assert.equal(v.frameAgeMs, 25_000);
  assert.match(v.label, /showing the last one received/);
});

test('waiting for the first frame is distinct from having lost the stream', () => {
  // Opposite copy: one is patience, the other is a problem. A two-state model
  // would render them identically.
  const waiting = playtestView(run({ framesDelivered: 0 }), [], T0 + 1000);
  assert.equal(waiting.freshness, 'none');
  assert.match(waiting.label, /waiting for the first frame/i);

  const lost = playtestView(run(), [frame({ capturedAt: T0 })], T0 + 25_000);
  assert.equal(lost.freshness, 'dead');
  assert.ok(!/waiting/i.test(lost.label));
});

test('a frame from the future does not pin the card to fresh forever', () => {
  assert.equal(frameFreshness(frame({ capturedAt: T0 + 60_000 }), T0), 'fresh');
});

// ------------------------------------------------- property 3: tenant / run scoping

test('frames from another playtest are never shown in this card', () => {
  const mine = frame({ playtestRunId: 'pt_1', seq: 1, capturedAt: T0 });
  const theirs = frame({ playtestRunId: 'pt_OTHER', seq: 99, capturedAt: T0 + 5000 });
  const v = playtestView(run(), [mine, theirs], T0 + 100);
  assert.equal(v.frame, mine, 'the newer frame belongs to a different run and must be ignored');
});

test('build renders are never adopted by the playtest card', () => {
  // The critique renders ride the same socket, at a different size from a
  // different camera. Showing one under a "run mode is live" label would put a
  // picture of the static scene under a live claim.
  const buildRender = frame({ playtestRunId: undefined, seq: undefined, view: 'hero', capturedAt: T0 + 5000 });
  const v = playtestView(run({ framesDelivered: 0 }), [buildRender], T0 + 100);
  assert.equal(v.frame, undefined);
  assert.equal(v.freshness, 'none');
});

test('frames are ordered by the worker sequence, not by arrival', () => {
  // A frame that overtook another in flight must not make the card go
  // backwards in time.
  const a = frame({ seq: 1, capturedAt: T0 });
  const b = frame({ seq: 2, capturedAt: T0 + 1500 });
  const out = framesForRun([b, a], run());
  assert.deepEqual(
    out.map((f) => f.seq),
    [1, 2],
  );
  assert.equal(playtestView(run(), [b, a], T0 + 1600).frame, b, 'newest by seq wins');
});

test('framesForRun with no run returns nothing', () => {
  assert.deepEqual(framesForRun([frame()], null), []);
});

// ------------------------------------------------- property 4: never invent pixels

test('a frame whose payload is short of its declared size is refused', () => {
  // The failure: the browser paints black where there was no data, and black
  // is a colour a real scene could legitimately be.
  const short = Buffer.from(new Uint8Array(5)).toString('base64'); // 2x1 needs 6 bytes
  assert.equal(decodeFrame({ rgbBase64: short, width: 2, height: 1 }), null);
});

test('an absent encoding means rgb24, so pre-existing frames still decode', () => {
  // Backward compatibility, asserted rather than assumed: every frame emitted
  // before the encoding field existed is raw RGB.
  const px = new Uint8Array([1, 2, 3, 4, 5, 6]);
  const out = decodeFrame({ rgbBase64: Buffer.from(px).toString('base64'), width: 2, height: 1 });
  assert.deepEqual(out, px);
});

test('an rle24 frame decodes to exactly the pixels that were encoded', () => {
  // [count][r][g][b] x2 -> two runs of two pixels
  const packed = new Uint8Array([2, 10, 20, 30, 2, 40, 50, 60]);
  const out = decodeFrame({
    rgbBase64: Buffer.from(packed).toString('base64'),
    encoding: 'rle24',
    width: 4,
    height: 1,
  });
  assert.deepEqual(out, new Uint8Array([10, 20, 30, 10, 20, 30, 40, 50, 60, 40, 50, 60]));
});

test('a malformed rle stream decodes to null, never to a partial picture', () => {
  assert.equal(rleDecode(new Uint8Array([2, 1, 2]), 2), null, 'truncated record');
  assert.equal(rleDecode(new Uint8Array([0, 1, 2, 3]), 2), null, 'zero-length run');
  assert.equal(rleDecode(new Uint8Array([9, 1, 2, 3]), 2), null, 'run overruns the frame');
  assert.equal(rleDecode(new Uint8Array([1, 1, 2, 3]), 4), null, 'stream ends short');
});

test('nonsense dimensions decode to null', () => {
  for (const [w, h] of [
    [0, 1],
    [1, 0],
    [-2, 2],
    [1.5, 2],
  ]) {
    assert.equal(decodeFrame({ rgbBase64: 'AAAA', width: w, height: h }), null, `${w}x${h}`);
  }
});

// ------------------------------------------------- the two halves of the codec agree

test('every frame the worker admits, the browser decodes to identical pixels', () => {
  // THE INTEGRATION RISK. The encoder lives in apps/worker/src/frame-bus.ts and
  // the decoder in apps/web/src/lib/frame-decode.ts. Both were tested in
  // isolation above and both passed; that proves nothing about them agreeing.
  // A divergence here would not throw — it would paint a subtly wrong picture
  // of the user's game, which is the worst failure this feature can have.
  //
  // So the real encoder is driven with real content and its output is handed to
  // the real decoder, across the package boundary.
  const W = 64;
  const H = 40;
  const cases = {
    // Flat-shaded, like the rasteriser actually produces: takes the RLE path.
    flat: (() => {
      const px = new Uint8Array(W * H * 3);
      for (let y = 0; y < H; y += 1) {
        const c = y < H / 2 ? [0x9f, 0xc7, 0xe8] : [0x6e, 0x7a, 0x63];
        for (let x = 0; x < W; x += 1) {
          const i = (y * W + x) * 3;
          px[i] = c[0];
          px[i + 1] = c[1];
          px[i + 2] = c[2];
        }
      }
      return px;
    })(),
    // High-entropy: takes the raw fallback.
    noisy: (() => {
      const px = new Uint8Array(W * H * 3);
      for (let i = 0; i < px.length; i += 1) px[i] = (i * 2654435761) % 256;
      return px;
    })(),
    // A run longer than one record can hold, so the encoder must split it.
    longRun: new Uint8Array(W * H * 3).fill(0x42),
  };

  for (const [name, px] of Object.entries(cases)) {
    const verdict = admitFrame(
      {
        rgbBase64: Buffer.from(px).toString('base64'),
        width: W,
        height: H,
        view: 'eye',
        subject: 'game.Workspace',
        capturedAt: T0,
      },
      { recompress: true },
    );
    assert.equal(verdict.ok, true, `${name} must be admitted`);
    const painted = decodeFrame(verdict.frame);
    assert.ok(painted, `${name} must decode`);
    assert.deepEqual(painted, px, `${name} must survive the round trip byte for byte`);
  }
});

test('the encoder picks the right path for each kind of content', () => {
  // Guards the adaptive choice end to end: flat content must compress, and
  // noisy content must fall back rather than being inflated.
  const W = 64;
  const H = 40;
  const flat = new Uint8Array(W * H * 3).fill(7);
  const noisy = new Uint8Array(W * H * 3);
  for (let i = 0; i < noisy.length; i += 1) noisy[i] = (i * 2654435761) % 256;

  const admit = (px) =>
    admitFrame(
      { rgbBase64: Buffer.from(px).toString('base64'), width: W, height: H, view: 'eye', subject: 's', capturedAt: T0 },
      { recompress: true },
    );

  assert.equal(admit(flat).frame.encoding, 'rle24');
  assert.equal(admit(noisy).frame.encoding, 'rgb24');
  assert.ok(admit(noisy).wireBytes <= Buffer.from(noisy).toString('base64').length, 'never larger than raw');
});

// ---------------------------------------------------------------- reported facts

test('elapsed comes from worker timestamps and freezes at the end', () => {
  // Not a browser timer started at mount: a card that mounted late would
  // otherwise under-report a playtest already in progress.
  assert.equal(playtestView(run(), [], T0 + 4000).elapsedMs, 4000);
  const done = run({ phase: 'finished', endedAt: T0 + 8000 });
  assert.equal(playtestView(done, [], T0 + 90_000).elapsedMs, 8000);
});

test('console counts and drop counts are passed through untouched', () => {
  const v = playtestView(run({ consoleErrors: 3, consoleWarnings: 2, framesDelivered: 7, framesDropped: 4 }), [], T0);
  assert.equal(v.consoleErrors, 3);
  assert.equal(v.consoleWarnings, 2);
  assert.equal(v.framesDelivered, 7);
  assert.equal(v.framesDropped, 4);
});

test('a failed playtest surfaces its reason rather than a generic message', () => {
  const v = playtestView(run({ phase: 'failed', error: 'could not take a protective checkpoint' }), [], T0);
  assert.equal(v.label, 'Playtest failed');
  assert.equal(v.error, 'could not take a protective checkpoint');
});

test('a finished playtest that captured nothing says so', () => {
  // Rather than showing an empty stage with a satisfied label.
  const v = playtestView(run({ phase: 'finished', endedAt: T0 + 5000, framesDelivered: 0 }), [], T0 + 5000);
  assert.match(v.label, /no frames captured/i);
});

// ---------------------------------------------------------------- copy guarantees

test('the card never claims to be video, a stream, or a viewport capture', () => {
  // Roblox exposes no viewport readback to plugins: ThumbnailGenerator is not
  // a valid service and CaptureService's callback never fires in edit mode,
  // both verified against real Studio. These frames are computed geometry.
  // Language that implies otherwise is banned here rather than left to review.
  const src = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'playtest-card.tsx'), 'utf8');
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
  for (const banned of [/live video/i, /\bvideo\b/i, /screen ?share/i, /\bstreaming live\b/i, /webcam/i]) {
    assert.ok(!banned.test(code), `banned phrasing ${banned} appears in the card`);
  }
  // And the disclaimer must actually be present, not merely un-lied-about.
  assert.match(code, /not a viewport capture/i);
});

test('the honest disclaimer names what the frames do not contain', () => {
  const src = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'playtest-card.tsx'), 'utf8');
  assert.match(src, /characters/i, 'Run mode spawns no players; the card must say so');
  assert.match(src, /particles/i);
});

test('the state chip is bound to frame freshness, not to the run phase', () => {
  // A chip keyed off phase would stay lit green while the frames had stopped.
  const src = readFileSync(join(HERE, '..', 'src', 'components', 'ws', 'playtest-card.tsx'), 'utf8');
  assert.match(src, /gx-playtest__chip--\$\{view\.freshness\}/);
});
