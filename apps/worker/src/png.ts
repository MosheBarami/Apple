// PNG encoding for the visual inspection loop.
//
// The Studio plugin rasterises a scene and sends back raw packed RGB (it has no zlib), so the
// bytes become a real image here, where Workers gives us `CompressionStream('deflate')` — which
// emits exactly the zlib-wrapped stream a PNG IDAT chunk requires.
//
// Deliberately minimal: 8-bit truecolour, no interlace, filter type 0 on every scanline. These are
// small critique frames, not deliverables, so smarter filtering would buy nothing.

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // the CRC covers the type and the data, but not the length prefix
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function deflate(raw: Uint8Array): Promise<Uint8Array> {
  // 'deflate' (not 'deflate-raw') produces the zlib container — header + adler32 — that PNG wants.
  const source = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(raw);
      c.close();
    },
  });
  const out = source.pipeThrough(new CompressionStream('deflate'));
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Decode the plugin's base64 payload into RGB bytes (3 per pixel, row-major, top-left origin). */
export function decodeRgbBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Build a PNG from tightly packed RGB bytes. Throws if the buffer does not match the dimensions. */
export async function encodePng(rgb: Uint8Array, width: number, height: number): Promise<Uint8Array> {
  const expected = width * height * 3;
  if (rgb.length !== expected) {
    throw new Error(`pixel buffer is ${rgb.length} bytes, expected ${expected} for ${width}x${height}`);
  }

  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  // [10] compression=0, [11] filter=0, [12] interlace=0 — already zero

  const stride = width * 3;
  const raw = new Uint8Array(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // per-scanline filter: None
    raw.set(rgb.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  }

  const parts = [SIGNATURE, chunk('IHDR', ihdr), chunk('IDAT', await deflate(raw)), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    png.set(p, at);
    at += p.length;
  }
  return png;
}

/** base64 of arbitrary bytes, chunked so a large image cannot blow the call-argument limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(s);
}

/** Convenience: plugin payload -> `data:` URL a vision model can consume directly. */
export async function rgbBase64ToDataUrl(rgbBase64: string, width: number, height: number): Promise<string> {
  const png = await encodePng(decodeRgbBase64(rgbBase64), width, height);
  return `data:image/png;base64,${bytesToBase64(png)}`;
}
