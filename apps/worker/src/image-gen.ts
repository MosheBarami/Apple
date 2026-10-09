// make_image: Roblox game art from Lucid Origin (owner, 2026-10-09: "only him generates all of the UI/GUI/assets").
//
// The agent (Kimi) designs the screen and writes its scripts; every picture in it (button skins, panel frames, title
// banners, icons, textures, backgrounds) comes from this model. Lucid Origin returns a JPEG with no transparency, so
// cut-out art is generated on one flat key colour and the key is removed here, from the edges inward, before the
// pixels go to the plugin, which uploads them into the Studio user's own account (ops/Image.luau).
import jpeg from 'jpeg-js';

export const IMAGE_KINDS = ['icon', 'button', 'panel', 'banner', 'texture', 'background', 'sprite'] as const;
export type ImageKind = (typeof IMAGE_KINDS)[number];

export interface Rgba { width: number; height: number; data: Uint8Array }

/** What each kind is generated at, what it is delivered at (the box it is fitted into), and whether it is cut out. */
const KIND: Record<ImageKind, { gen: [number, number]; out: [number, number]; cut: boolean; words: string }> = {
  icon: { gen: [1024, 1024], out: [256, 256], cut: true, words: 'a single game icon, bold readable silhouette, centered with a generous empty margin around it' },
  button: { gen: [1024, 512], out: [512, 256], cut: true, words: 'a single wide game UI button seen straight on, no text, no letters, centered with an empty margin around it' },
  panel: { gen: [1024, 1024], out: [512, 512], cut: true, words: 'an empty game UI window panel frame seen straight on, no text, plain empty middle area, the frame fills most of the image' },
  banner: { gen: [1536, 512], out: [768, 256], cut: true, words: 'a game UI title banner or ribbon seen straight on, centered with an empty margin around it' },
  texture: { gen: [512, 512], out: [256, 256], cut: false, words: 'a seamless tileable texture that fills the entire frame edge to edge, even flat lighting, no border, no vignette, no text' },
  background: { gen: [1536, 864], out: [1024, 576], cut: false, words: 'a full-frame illustration, no text, no UI elements' },
  sprite: { gen: [1024, 1024], out: [512, 512], cut: true, words: 'a single object, centered with a generous empty margin around it' },
};

export interface ImagePlan { prompt: string; kind: ImageKind; genW: number; genH: number; outW: number; outH: number; cut: boolean; key: [number, number, number]; steps: number }

/** The model prompt and sizes for one request. Text is only drawn when the request quotes it. */
export function planImage(a: { prompt: string; kind: ImageKind; style?: string; size?: [number, number]; steps?: number }): ImagePlan {
  const k = KIND[a.kind];
  const subject = `${a.prompt} ${a.style ?? ''}`.toLowerCase();
  // The key colour must not be in the subject: green art is cut from magenta.
  const greenish = /\b(green|lime|emerald|grass|leaf|leaves|jungle|forest|slime|mint|olive)\b/.test(subject);
  const key: [number, number, number] = greenish ? [255, 0, 255] : [0, 255, 0];
  const keyWords = greenish ? 'pure magenta #FF00FF' : 'pure green #00FF00';
  const parts = [
    a.prompt.trim(),
    a.style?.trim(),
    `Roblox game UI art, ${k.words}`,
    /"[^"]+"/.test(a.prompt) ? 'render the quoted text exactly, bold and legible' : 'no text',
    'crisp clean edges, high quality',
    k.cut ? `isolated on a flat solid ${keyWords} background, the whole background is that one flat colour, no gradient, no shadow on the background, no floor` : '',
  ].filter(Boolean);
  const [outW, outH] = a.size ?? k.out;
  return { prompt: parts.join('. '), kind: a.kind, genW: k.gen[0], genH: k.gen[1], outW, outH, cut: k.cut, key, steps: a.steps ?? 24 };
}

export function decodeJpegBase64(b64: string): Rgba {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const img = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxMemoryUsageInMB: 256 });
  return { width: img.width, height: img.height, data: img.data as Uint8Array };
}

/**
 * Removes the flat background: everything connected to the image edges whose colour is near the edge colour (not the
 * requested key exactly, because the model paints it a little off), then any other pixel very near it (holes inside a
 * ring), then softens the boundary and takes the key's tint off it.
 */
export function cutBackground(img: Rgba, tolerance = 70): Rgba {
  const { width: w, height: h } = img;
  const d = new Uint8Array(img.data);
  const border: number[][] = [[], [], []];
  const take = (i: number) => { for (let c = 0; c < 3; c++) border[c]!.push(d[i * 4 + c]!); };
  for (let x = 0; x < w; x++) { take(x); take((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { take(y * w); take(y * w + w - 1); }
  const key = border.map((ch) => ch.sort((p, q) => p - q)[ch.length >> 1]!) as [number, number, number];
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = d[i * 4]! - key[0], g = d[i * 4 + 1]! - key[1], b = d[i * 4 + 2]! - key[2];
    dist[i] = Math.sqrt(r * r + g * g + b * b);
  }
  const bg = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0, tail = 0;
  const seed = (i: number) => { if (!bg[i] && dist[i]! <= tolerance) { bg[i] = 1; queue[tail++] = i; } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (head < tail) {
    const i = queue[head++]!;
    const x = i % w, y = (i / w) | 0;
    if (x > 0) seed(i - 1);
    if (x < w - 1) seed(i + 1);
    if (y > 0) seed(i - w);
    if (y < h - 1) seed(i + w);
  }
  for (let i = 0; i < w * h; i++) if (!bg[i] && dist[i]! <= tolerance * 0.55) bg[i] = 1;
  for (let i = 0; i < w * h; i++) {
    if (bg[i]) { d[i * 4 + 3] = 0; continue; }
    const x = i % w, y = (i / w) | 0;
    const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
    if (!edge) continue;
    const alpha = Math.max(0.15, Math.min(1, (dist[i]! - tolerance) / tolerance));
    d[i * 4 + 3] = Math.round(alpha * 255);
    // Un-mix the key from a half-covered pixel: colour = (seen - key * (1 - a)) / a.
    for (let c = 0; c < 3; c++) d[i * 4 + c] = Math.max(0, Math.min(255, Math.round((d[i * 4 + c]! - key[c]! * (1 - alpha)) / alpha)));
  }
  // A drop shadow painted on the key (a darker green ellipse under the object) is key-hued, not key-coloured: clear it.
  const green = key[1] > key[0] && key[1] > key[2];
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const rr = d[i * 4]!, gg = d[i * 4 + 1]!, bb = d[i * 4 + 2]!;
    if (green ? gg - Math.max(rr, bb) > 60 : Math.min(rr, bb) - gg > 80) d[i * 4 + 3] = 0;
  }
  keepMainShapes(w, h, d);
  // Spill: pixels near the cut lose the key's tint (green fringe on a dark frame).
  for (let i = 0; i < w * h; i++) {
    if (d[i * 4 + 3] === 0) continue;
    const x = i % w, y = (i / w) | 0;
    let near = false;
    for (let dy = -2; dy <= 2 && !near; dy++) for (let dx = -2; dx <= 2 && !near; dx++) {
      const xx = x + dx, yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && d[(yy * w + xx) * 4 + 3] === 0) near = true;
    }
    if (!near) continue;
    if (green) d[i * 4 + 1] = Math.min(d[i * 4 + 1]!, Math.max(d[i * 4]!, d[i * 4 + 2]!));
    else { const cap = Math.max(d[i * 4 + 1]!, Math.min(d[i * 4]!, d[i * 4 + 2]!) * 0.5); d[i * 4] = Math.min(d[i * 4]!, cap + (d[i * 4]! - cap) * 0.5); d[i * 4 + 2] = Math.min(d[i * 4 + 2]!, cap + (d[i * 4 + 2]! - cap) * 0.5); }
  }
  return { width: w, height: h, data: d };
}

/** Keeps the subject: the largest opaque shape and any other at least 15% of its size; specks and shadows go. */
function keepMainShapes(w: number, h: number, d: Uint8Array): void {
  const label = new Int32Array(w * h);
  const sizes: number[] = [0];
  const queue = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (label[start] || d[start * 4 + 3]! <= 16) continue;
    const id = sizes.length;
    let head = 0, tail = 0, n = 0;
    label[start] = id; queue[tail++] = start;
    while (head < tail) {
      const i = queue[head++]!; n++;
      const x = i % w, y = (i / w) | 0;
      for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) {
        if (j >= 0 && !label[j] && d[j * 4 + 3]! > 16) { label[j] = id; queue[tail++] = j; }
      }
    }
    sizes.push(n);
  }
  const largest = Math.max(...sizes);
  for (let i = 0; i < w * h; i++) if (label[i] && sizes[label[i]!]! < largest * 0.15) d[i * 4 + 3] = 0;
}

/**
 * The 9-slice insets of a cut-out frame or button: how far in from each edge its corners curve, measured from where the
 * shape first reaches (nearly) its full width and height, plus a margin. Lets a skin stretch without bending corners.
 */
export function suggestSlice(img: Rgba): [number, number, number, number] {
  const { width: w, height: h, data } = img;
  const solid = (x: number, y: number) => data[(y * w + x) * 4 + 3]! > 128;
  const colH = (x: number) => { let n = 0; for (let y = 0; y < h; y++) if (solid(x, y)) n++; return n; };
  const rowW = (y: number) => { let n = 0; for (let x = 0; x < w; x++) if (solid(x, y)) n++; return n; };
  let maxH = 0, maxW = 0;
  for (let x = 0; x < w; x++) maxH = Math.max(maxH, colH(x));
  for (let y = 0; y < h; y++) maxW = Math.max(maxW, rowW(y));
  let l = 0, rr = w - 1, t = 0, b = h - 1;
  while (l < w - 1 && colH(l) < maxH * 0.97) l++;
  while (rr > 0 && colH(rr) < maxH * 0.97) rr--;
  while (t < h - 1 && rowW(t) < maxW * 0.97) t++;
  while (b > 0 && rowW(b) < maxW * 0.97) b--;
  const m = 6;
  const out = [l + m, t + m, w - rr + m, h - b + m].map((v) => Math.max(4, Math.round(v)));
  // Always leave a middle to stretch.
  if (out[0]! + out[2]! > w - 4) { const k = (w - 4) / (out[0]! + out[2]!); out[0] = Math.floor(out[0]! * k); out[2] = Math.floor(out[2]! * k); }
  if (out[1]! + out[3]! > h - 4) { const k = (h - 4) / (out[1]! + out[3]!); out[1] = Math.floor(out[1]! * k); out[3] = Math.floor(out[3]! * k); }
  return out as [number, number, number, number];
}

/** The smallest box holding every visible pixel, with a small margin; null when nothing is left. */
export function cropToContent(img: Rgba, margin = 2): Rgba | null {
  const { width: w, height: h, data } = img;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3]! > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  x0 = Math.max(0, x0 - margin); y0 = Math.max(0, y0 - margin); x1 = Math.min(w - 1, x1 + margin); y1 = Math.min(h - 1, y1 + margin);
  const cw = x1 - x0 + 1, ch = y1 - y0 + 1;
  const out = new Uint8Array(cw * ch * 4);
  for (let y = 0; y < ch; y++) out.set(data.subarray(((y + y0) * w + x0) * 4, ((y + y0) * w + x0 + cw) * 4), y * cw * 4);
  return { width: cw, height: ch, data: out };
}

/** Fits the image inside w x h (keeping its shape unless exact), averaging with alpha weighting so edges stay clean. */
export function resizeTo(img: Rgba, boxW: number, boxH: number, exact = false): Rgba {
  const scale = Math.min(boxW / img.width, boxH / img.height, 1);
  const w = exact ? boxW : Math.max(1, Math.round(img.width * scale));
  const h = exact ? boxH : Math.max(1, Math.round(img.height * scale));
  if (w === img.width && h === img.height) return img;
  const out = new Uint8Array(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const ya = Math.floor(y * sy), yb = Math.max(ya + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const xa = Math.floor(x * sx), xb = Math.max(xa + 1, Math.floor((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = ya; yy < yb && yy < img.height; yy++) for (let xx = xa; xx < xb && xx < img.width; xx++) {
        const i = (yy * img.width + xx) * 4;
        const al = img.data[i + 3]!;
        r += img.data[i]! * al; g += img.data[i + 1]! * al; b += img.data[i + 2]! * al; a += al; n++;
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out[o] = Math.round(r / a); out[o + 1] = Math.round(g / a); out[o + 2] = Math.round(b / a); }
      out[o + 3] = n ? Math.round(a / n) : 0;
    }
  }
  return { width: w, height: h, data: out };
}

export function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/** The whole post-process: decode, cut (cut-out kinds), crop, fit. */
export function finishImage(jpegBase64: string, plan: ImagePlan): Rgba | { error: string } {
  let img = decodeJpegBase64(jpegBase64);
  if (plan.cut) {
    const cropped = cropToContent(cutBackground(img));
    if (!cropped) return { error: 'The background removal left nothing: describe a clear single subject and try again.' };
    img = cropped;
  }
  return resizeTo(img, plan.outW, plan.outH, plan.kind === 'texture');
}

/** PNG bytes of an RGBA image (for an Open Cloud upload): zlib-deflated scanlines with filter 0, CRC32 per chunk. */
export async function encodeRgbaPng(img: Rgba): Promise<Uint8Array> {
  const { width: w, height: h, data } = img;
  const raw = new Uint8Array((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const idat = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const crcTable = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (bytes: Uint8Array) => { let c = 0xffffffff; for (const b of bytes) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, body: Uint8Array) => {
    const out = new Uint8Array(12 + body.length);
    const v = new DataView(out.buffer);
    v.setUint32(0, body.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(body, 8);
    v.setUint32(8 + body.length, crc(out.subarray(4, 8 + body.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const hv = new DataView(ihdr.buffer);
  hv.setUint32(0, w); hv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 6;
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { png.set(p, o); o += p.length; }
  return png;
}
