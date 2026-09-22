/**
 * Turning a StudioFrame back into pixels.
 *
 * The worker picks an encoding per frame — raw packed RGB, or run-length
 * records when those came out smaller (see apps/worker/src/frame-bus.ts). This
 * is the other half of that contract.
 *
 * TWO RULES, BOTH ABOUT NOT INVENTING PIXELS.
 *
 *   1. AN ABSENT `encoding` MEANS 'rgb24'. Every frame emitted before the field
 *      existed is raw RGB, and a decoder that defaults correctly reads them
 *      without needing to know the field was ever added.
 *
 *   2. A FRAME THAT DOES NOT DECODE CLEANLY IS NOT DRAWN. Not padded, not
 *      truncated, not partially painted. A half-decoded frame renders as real
 *      geometry with a black region next to it, which is indistinguishable from
 *      a scene that actually has a hole in it — and the whole premise of this
 *      surface is that what you see was really rendered.
 */
import type { StudioFrame } from '@golem/shared';

function fromBase64(s: string): Uint8Array | null {
  try {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/**
 * Expand run-length records: [count 1..255][r][g][b].
 *
 * Bounded by `pixels`, so a malformed or hostile stream cannot drive an
 * unbounded write. A stream that ends short is rejected rather than
 * zero-filled, because a zero fill is black and black is a colour a real scene
 * could legitimately be.
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
  return w === out.length ? out : null;
}

/**
 * A frame's pixels as packed 24-bit RGB, or null if it cannot be trusted.
 *
 * Exported separately from the canvas painting so it can be tested in Node,
 * round-tripped against the worker's encoder, with no DOM involved.
 */
export function decodeFrame(frame: Pick<StudioFrame, 'rgbBase64' | 'encoding' | 'width' | 'height'>): Uint8Array | null {
  const { width, height } = frame;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) return null;
  const pixels = width * height;

  if (frame.encoding === 'png') return null;

  const bytes = fromBase64(frame.rgbBase64);
  if (!bytes) return null;

  if (frame.encoding === 'rle24') return rleDecode(bytes, pixels);

  // rgb24, including every frame that predates the `encoding` field. The
  // plugin's base64 encoder pads to a 3-pixel group, so a payload slightly
  // longer than needed is expected; shorter is a frame we refuse to guess at.
  if (bytes.length < pixels * 3) return null;
  return bytes.subarray(0, pixels * 3);
}

/** Browser-native image source for encoded Studio captures. */
export function frameImageSrc(frame: Pick<StudioFrame, 'rgbBase64' | 'encoding'>): string | null {
  if (frame.encoding !== 'png' || !frame.rgbBase64) return null;
  return 'data:image/png;base64,' + frame.rgbBase64;
}

/** Paint a decoded frame onto a canvas, sizing the canvas to it. Returns success. */
export function paintFrame(canvas: HTMLCanvasElement, frame: StudioFrame): boolean {
  const rgb = decodeFrame(frame);
  if (!rgb) return false;
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;

  const { width, height } = frame;
  const image = ctx.createImageData(width, height);
  for (let p = 0, s = 0, d = 0; p < width * height; p += 1) {
    image.data[d] = rgb[s]!;
    image.data[d + 1] = rgb[s + 1]!;
    image.data[d + 2] = rgb[s + 2]!;
    image.data[d + 3] = 255;
    s += 3;
    d += 4;
  }
  canvas.width = width;
  canvas.height = height;
  ctx.putImageData(image, 0, 0);
  return true;
}
