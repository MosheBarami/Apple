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
  return { width: w, height: h, data: d };
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
