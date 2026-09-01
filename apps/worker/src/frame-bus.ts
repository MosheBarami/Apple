/**
 * The frame path's admission control: what a frame must be to reach a browser,
 * how often one may, and how the pixels are packed on the way.
 *
 * WHY THIS EXISTS AS A GATE RATHER THAN A HELPER.
 *
 * Before this file, `emitFrame` in do/session.ts took whatever the plugin
 * handed it and broadcast it verbatim to every attached socket. Three things
 * were wrong with that, and all three are user-visible rather than theoretical:
 *
 *   1. NO SIZE CEILING. The frame body is a base64 string produced inside
 *      Studio on the user's machine. A plugin build with a bad clamp, or a
 *      tampered one, could hand the DO an arbitrarily large string and the DO
 *      would forward it. The browser then either allocates it or dies trying.
 *
 *   2. NO RATE CEILING. `render_view` frames arrived at whatever rate the
 *      agent happened to call the tool. That was survivable while frames came
 *      only from an occasional critique. A playtest capture loop asks for them
 *      on a timer, and a timer with no floor under it is a flood.
 *
 *   3. NO DIMENSION CHECK. `width`, `height` and the pixel payload arrived as
 *      three independent numbers. If they disagreed the browser drew garbage,
 *      or read past the end of its buffer and drew nothing, with no error
 *      anywhere. A frame whose declared size does not match its actual bytes
 *      is not a frame, and the honest thing is to refuse it.
 *
 * WHAT IS DELIBERATELY NOT HERE: any repair. Every failure returns a reason and
 * drops the frame. A frame that is resized, padded or truncated into shape is a
 * picture of something that was never rendered, and this system's whole premise
 * is that the pixels are real.
 */
import type { FrameEncoding, StudioFrame } from '@golem/shared';

/**
 * Ceilings, and the measurements behind them.
 *
 * MAX_FRAME_PIXELS matches the plugin rasteriser's own clamp (320x240 in
 * Render.capture), so a frame bigger than the renderer can produce cannot be
 * one this worker asked for.
 *
 * MAX_FRAME_BASE64 is sized from the raw-RGB worst case at the largest render
 * the agent uses (288x180 -> 202.5 KB of base64) with headroom, because the
 * critique path legitimately sends those. It is a ceiling on absurdity, not a
 * budget: the playtest stream lives far below it (see PLAYTEST_FRAME_*).
 */
export const MAX_FRAME_PIXELS = 320 * 240;
export const MAX_FRAME_BASE64 = 320 * 1024;

/**
 * The playtest capture budget.
 *
 * 160x100 is the measured sweet spot. At that size a frame of representative
 * rasteriser output is ~5 KB of RLE base64 (~62.5 KB raw), which is legible
 * enough to see a door open or a platform move, and small enough that a
 * minute of streaming is a fifth of a megabyte rather than two and a half.
 *
 * MIN_INTERVAL_MS is a floor on the CAPTURE REQUEST rate, and it is not
 * primarily about bandwidth. The rasteriser runs synchronously on Studio's
 * main thread: every frame briefly freezes the user's editor and, during a
 * playtest, briefly stalls the simulation being tested. Asking faster would
 * make the thing being observed worse, which is the one cost a viewport must
 * not impose.
 */
export const PLAYTEST_FRAME_WIDTH = 160;
export const PLAYTEST_FRAME_HEIGHT = 100;
export const PLAYTEST_FRAME_MIN_INTERVAL_MS = 1500;
/** Hard stop on frames per playtest, so a long run cannot stream unbounded. */
export const PLAYTEST_FRAME_BUDGET = 40;

/** How many recent frames the DO keeps for replay. Bounded on both count and bytes. */
export const FRAME_RING_CAPACITY = 6;
export const FRAME_RING_MAX_BYTES = 512 * 1024;

export type RejectReason =
  | 'empty'
  | 'too-many-pixels'
  | 'too-large'
  | 'bad-dimensions'
  | 'payload-mismatch'
  | 'rate-limited'
  | 'budget-exhausted';

export interface FrameAccepted {
  ok: true;
  frame: StudioFrame;
  /** Bytes of base64 actually going on the wire, after any re-encoding. */
  wireBytes: number;
  /** True when re-encoding chose RLE, i.e. the frame compressed. */
  compressed: boolean;
}
export interface FrameRejected {
  ok: false;
  reason: RejectReason;
  detail: string;
}
export type FrameAdmission = FrameAccepted | FrameRejected;

// ---------------------------------------------------------------- base64
// Workers have atob/btoa, and so does Node 18+, so these need no polyfill. They
// are wrapped only to make a malformed payload a rejection rather than a throw.

function decodeBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function encodeBase64(bytes: Uint8Array): string {
  let bin = '';
  // Chunked so a large frame cannot blow the argument limit of String.fromCharCode.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

// ---------------------------------------------------------------- RLE24
/**
 * Run-length records over 24-bit pixels: [count 1..255][r][g][b].
 *
 * This is a good fit for exactly one reason, and it is a property of the
 * producer rather than a hope: the plugin's rasteriser is flat-shaded. It fills
 * whole spans with one packed sky colour, one packed ground colour, and one
 * colour per visible quad face — there is no gradient, no texture and no
 * dither anywhere in its output. Measured against synthetic frames built to
 * that structure, RLE is 10-22x smaller.
 *
 * It is NOT unconditionally smaller. On high-entropy input every run is length
 * one and the encoding costs four bytes per pixel instead of three — measured
 * at 1.33x LARGER. So `packFrame` below encodes both ways and keeps the winner.
 * A compressor that can silently inflate its input is a bug waiting for the one
 * scene that triggers it.
 */
export function rleEncode(rgb: Uint8Array): Uint8Array {
  const pixels = Math.floor(rgb.length / 3);
  // Worst case is one record per pixel.
  const out = new Uint8Array(pixels * 4);
  let w = 0;
  let i = 0;
  while (i < pixels) {
    const o = i * 3;
    const r = rgb[o]!;
    const g = rgb[o + 1]!;
    const b = rgb[o + 2]!;
    let n = 1;
    while (n < 255 && i + n < pixels) {
      const p = (i + n) * 3;
      if (rgb[p] !== r || rgb[p + 1] !== g || rgb[p + 2] !== b) break;
      n += 1;
    }
    out[w] = n;
    out[w + 1] = r;
    out[w + 2] = g;
    out[w + 3] = b;
    w += 4;
    i += n;
  }
  return out.subarray(0, w);
}

/**
 * Inverse of rleEncode, bounded by `pixels` so a malformed stream cannot make
 * the decoder allocate or write beyond the frame it claims to be.
 */
export function rleDecode(packed: Uint8Array, pixels: number): Uint8Array | null {
  if (packed.length % 4 !== 0) return null;
  const out = new Uint8Array(pixels * 3);
  let w = 0;
  for (let i = 0; i < packed.length; i += 4) {
    const n = packed[i]!;
    if (n === 0) return null;
    const r = packed[i + 1]!;
    const g = packed[i + 2]!;
    const b = packed[i + 3]!;
    if (w + n * 3 > out.length) return null;
    for (let k = 0; k < n; k += 1) {
      out[w] = r;
      out[w + 1] = g;
      out[w + 2] = b;
      w += 3;
    }
  }
  // A stream that decodes to fewer pixels than declared would leave the tail
  // black, which reads as real geometry. Refuse instead.
  return w === out.length ? out : null;
}

/**
 * Choose the packing for a frame's pixels. Returns the smaller of raw RGB and
 * RLE, labelled with which it is.
 */
export function packFrame(rgb: Uint8Array): { base64: string; encoding: FrameEncoding } {
  const raw = encodeBase64(rgb);
  const packed = encodeBase64(rleEncode(rgb));
  return packed.length < raw.length
    ? { base64: packed, encoding: 'rle24' }
    : { base64: raw, encoding: 'rgb24' };
}

// ---------------------------------------------------------------- admission

/** What the plugin hands over, before anything has been checked. */
export interface RawFrame {
  rgbBase64: string;
  width: number;
  height: number;
  view: string;
  subject: string;
  capturedAt: number;
}

/**
 * Validate and re-pack one frame. The returned frame is safe to broadcast: its
 * declared dimensions are known to match its payload, and its payload is known
 * to be within the ceiling.
 *
 * `recompress` is off for the ordinary critique path, which already works and
 * whose consumers are unchanged, and on for the playtest stream, where the
 * saving is the difference between 2.4 MB/min and 0.2 MB/min.
 */
export function admitFrame(input: RawFrame, opts: { recompress?: boolean } = {}): FrameAdmission {
  const { width, height, rgbBase64 } = input;

  if (!rgbBase64) return { ok: false, reason: 'empty', detail: 'no pixel payload' };

  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    return { ok: false, reason: 'bad-dimensions', detail: `${width}x${height} is not a frame size` };
  }
  const pixels = width * height;
  if (pixels > MAX_FRAME_PIXELS) {
    return { ok: false, reason: 'too-many-pixels', detail: `${pixels} pixels exceeds ${MAX_FRAME_PIXELS}` };
  }
  if (rgbBase64.length > MAX_FRAME_BASE64) {
    return { ok: false, reason: 'too-large', detail: `${rgbBase64.length} base64 chars exceeds ${MAX_FRAME_BASE64}` };
  }

  const bytes = decodeBase64(rgbBase64);
  if (!bytes) return { ok: false, reason: 'empty', detail: 'payload is not valid base64' };

  // THE CHECK THAT MATTERS MOST. Dimensions and payload arrive as independent
  // claims; only agreement between them makes either trustworthy. The
  // rasteriser's base64 encoder pads to a 3-pixel group boundary, so a payload
  // slightly longer than width*height*3 is expected and fine — shorter never is.
  if (bytes.length < pixels * 3) {
    return {
      ok: false,
      reason: 'payload-mismatch',
      detail: `${width}x${height} needs ${pixels * 3} bytes, payload has ${bytes.length}`,
    };
  }

  if (!opts.recompress) {
    return {
      ok: true,
      compressed: false,
      wireBytes: rgbBase64.length,
      frame: { ...input, encoding: 'rgb24' },
    };
  }

  const exact = bytes.subarray(0, pixels * 3);
  const { base64, encoding } = packFrame(exact);
  return {
    ok: true,
    compressed: encoding === 'rle24',
    wireBytes: base64.length,
    frame: { ...input, rgbBase64: base64, encoding },
  };
}

/**
 * A minimum-interval gate with a hard total budget.
 *
 * Deliberately a floor on the interval rather than a token bucket: a bucket
 * permits a burst, and a burst of rasterises is precisely what stalls the
 * user's Studio. There is no accumulated allowance to spend here.
 */
export class FrameRate {
  private lastAt = 0;
  /**
   * Explicit rather than inferred from `lastAt === 0`.
   *
   * A sentinel of 0 is a real timestamp — the Unix epoch, and more to the point
   * whatever a test or a fake clock hands in. Using it to mean "never taken"
   * made the gate skip the interval check for any capture at time 0, which a
   * test caught. A flag cannot be confused with a measurement.
   */
  private primed = false;
  private used = 0;
  // Written out rather than declared as constructor parameter properties: the
  // tests import this module through Node's type stripping, which is
  // erasure-only and cannot desugar that syntax.
  private readonly minIntervalMs: number;
  private readonly budget: number;

  constructor(minIntervalMs: number = PLAYTEST_FRAME_MIN_INTERVAL_MS, budget: number = PLAYTEST_FRAME_BUDGET) {
    this.minIntervalMs = minIntervalMs;
    this.budget = budget;
  }

  /** May a frame be captured at `now`? Consumes the allowance when it may. */
  take(now: number): FrameRejected | { ok: true } {
    if (this.used >= this.budget) {
      return { ok: false, reason: 'budget-exhausted', detail: `${this.budget} frames already captured` };
    }
    const since = now - this.lastAt;
    if (this.primed && since < this.minIntervalMs) {
      return { ok: false, reason: 'rate-limited', detail: `${since}ms since last frame, floor is ${this.minIntervalMs}ms` };
    }
    this.lastAt = now;
    this.primed = true;
    this.used += 1;
    return { ok: true };
  }

  get taken(): number {
    return this.used;
  }

  get remaining(): number {
    return Math.max(0, this.budget - this.used);
  }
}

/**
 * The replay buffer: the last few frames, so a browser that attaches mid-run
 * sees something immediately instead of a blank card until the next capture.
 *
 * Bounded twice, on purpose. A count cap alone still admits six 200 KB critique
 * frames; a byte cap alone still admits a thousand tiny ones. Whichever binds
 * first evicts oldest-first.
 *
 * These live in DO MEMORY, never in storage. A run's worth of frames would be
 * megabytes of durable writes to show something the user was already watching,
 * and losing them on eviction costs nothing that matters — the trace and the
 * tool results are what actually need to survive.
 */
export class FrameRing {
  private items: StudioFrame[] = [];
  private bytes = 0;
  private readonly capacity: number;
  private readonly maxBytes: number;

  constructor(capacity: number = FRAME_RING_CAPACITY, maxBytes: number = FRAME_RING_MAX_BYTES) {
    this.capacity = capacity;
    this.maxBytes = maxBytes;
  }

  push(frame: StudioFrame): void {
    this.items.push(frame);
    this.bytes += frame.rgbBase64.length;
    while (this.items.length > this.capacity || (this.bytes > this.maxBytes && this.items.length > 1)) {
      const gone = this.items.shift();
      if (!gone) break;
      this.bytes -= gone.rgbBase64.length;
    }
  }

  /** Newest last, matching the order the browser received them in. */
  list(): StudioFrame[] {
    return [...this.items];
  }

  get size(): number {
    return this.items.length;
  }

  get byteLength(): number {
    return this.bytes;
  }

  clear(): void {
    this.items = [];
    this.bytes = 0;
  }
}
