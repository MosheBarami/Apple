#!/usr/bin/env node
// Writes ui-components.json, the component library insert_ui_component builds from (D-UIONLY-1).
//
// Input: ui-components.spec.mjs (which library file plays which role), index.json, the PNGs in
// packs/, and sources/ui.jsonl. Nothing visual is typed by hand: a path the index does not list
// stops the build, sizes and 9-slice margins are measured off the PNG, every colour is a pixel of
// a named library file, fonts are the import-ok font rows of the sources list, and each
// component's references are the sources rows that show the same element.
//
//   node packages/asset-library/build-ui-components.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import { SKINS, ICONS, INK, COMPONENTS } from './ui-components.spec.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/* ------------------------------------------------------------------ PNG -> RGBA --- */

/** Decodes the PNGs the packs hold: 8-bit RGBA, and palette images at 1/2/4/8 bits, no interlace. */
export function decodePng(bytes) {
  let at = 8;
  let w = 0, h = 0, depth = 0, type = 0, palette = null, trns = null;
  const idat = [];
  while (at < bytes.length) {
    const len = bytes.readUInt32BE(at);
    const kind = bytes.toString('latin1', at + 4, at + 8);
    const data = bytes.subarray(at + 8, at + 8 + len);
    if (kind === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9];
      if (data[12] !== 0) throw new Error('interlaced PNG');
    } else if (kind === 'PLTE') palette = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    at += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  if (!channels || (type !== 3 && depth !== 8)) throw new Error(`unsupported PNG type ${type}/${depth}`);
  const raw = inflateSync(Buffer.concat(idat));
  const stride = Math.ceil((w * channels * depth) / 8);
  const bpp = Math.max(1, (channels * depth) / 8);
  const lines = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = lines.subarray(y * stride, (y + 1) * stride);
    const up = y ? lines.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[x - bpp] : 0;
      const b = up ? up[x] : 0;
      const c = up && x >= bpp ? up[x - bpp] : 0;
      let v = src[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[x] = v & 255;
    }
  }
  const rgba = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const row = y * stride;
      if (type === 3) {
        const bit = x * depth;
        const idx = (lines[row + (bit >> 3)] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        rgba[o] = palette[idx * 3]; rgba[o + 1] = palette[idx * 3 + 1]; rgba[o + 2] = palette[idx * 3 + 2];
        rgba[o + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        const p = row + x * channels;
        const g = type === 0 || type === 4;
        rgba[o] = lines[p]; rgba[o + 1] = lines[p + (g ? 0 : 1)]; rgba[o + 2] = lines[p + (g ? 0 : 2)];
        rgba[o + 3] = type === 6 ? lines[p + 3] : type === 4 ? lines[p + 1] : 255;
      }
    }
  }
  return { w, h, rgba };
}

/* ---------------------------------------------------------------- measuring --- */

const px = (img, x, y) => { const o = (y * img.w + x) * 4; return [img.rgba[o], img.rgba[o + 1], img.rgba[o + 2], img.rgba[o + 3]]; };
const lum = ([r, g, b]) => {
  const ch = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
};
export const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

/** The opaque bounding box, the corner radius read off its top row, the centre and darkest pixels. */
function measure(img) {
  // Semi-transparent pieces (a shadow track, a glass bar) count by their own strongest alpha.
  let maxA = 0;
  for (let i = 3; i < img.rgba.length; i += 4) maxA = Math.max(maxA, img.rgba[i]);
  const solid = Math.max(1, maxA >> 1);
  let top = -1, bottom = -1, left = img.w, right = -1;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (px(img, x, y)[3] < solid) continue;
      if (top < 0) top = y;
      bottom = y; left = Math.min(left, x); right = Math.max(right, x);
    }
  }
  if (top < 0) throw new Error('image has no opaque pixel');
  let first = left;
  while (first < right && px(img, first, top)[3] < solid) first++;
  const radius = first - left;
  // Corner plus a few pixels of border, never more than just under half the side it cuts.
  const mx = Math.max(1, Math.min(radius + 4, Math.floor(img.w / 2) - 1));
  const my = Math.max(1, Math.min(radius + 4, Math.floor(img.h / 2) - 1));
  // The centre is sampled where the fill is: the middle of the opaque box.
  const cx = (left + right) >> 1, cy = (top + bottom) >> 1;
  let centre = px(img, cx, cy);
  if (centre[3] < solid) {
    // A ring or an outline has a transparent middle; its colour is the first opaque pixel above it.
    for (let y = cy; y >= top; y--) { const p = px(img, cx, y); if (p[3] >= solid) { centre = p; break; } }
  }
  let edge = centre, edgeL = lum(centre);
  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      const p = px(img, x, y);
      if (p[3] >= solid && lum(p) < edgeL) { edge = p; edgeL = lum(p); }
    }
  }
  return { slice: [mx, my, img.w - mx, img.h - my], centre: centre.slice(0, 3), edge: edge.slice(0, 3) };
}

/* ------------------------------------------------------------------- build --- */

function load() {
  const index = JSON.parse(readFileSync(join(HERE, 'index.json'), 'utf8'));
  const known = new Set();
  for (const p of index.packs) for (const [folder, names] of p.folders) for (const n of names) known.add(`${p.id}/${folder ? folder + '/' : ''}${n}.png`);
  const sources = readFileSync(join(HERE, 'sources', 'ui.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  return { known, sources };
}

export function build() {
  const { known, sources } = load();
  const images = {};
  const need = (asset, where) => {
    if (!known.has(asset)) throw new Error(`${where}: ${asset} is not in index.json`);
    const file = join(HERE, 'packs', asset);
    if (!existsSync(file)) throw new Error(`${where}: ${asset} is not on disk`);
    if (!images[asset]) {
      const img = decodePng(readFileSync(file));
      images[asset] = { w: img.w, h: img.h, ...measure(img) };
    }
    return asset;
  };

  const ink = {};
  for (const [key, { asset }] of Object.entries(INK)) ink[key] = images[need(asset, `INK.${key}`)].centre;

  const fonts = {};
  const skins = {};
  for (const [id, s] of Object.entries(SKINS)) {
    if (!fonts[s.font]) {
      const row = sources.find((r) => r.kind === 'font' && r.use === 'import-ok' && r.title.startsWith(s.font) && /Enum\.Font\.\w+/.test(r.style ?? ''));
      if (!row) throw new Error(`skin ${id}: no import-ok font row in sources/ui.jsonl names ${s.font} as a Roblox built-in font`);
      fonts[s.font] = { font: row.style.match(/Enum\.Font\.\w+/)[0], source: row.url, license: row.license };
    }
    const byColour = {};
    for (const colour of s.colours) {
      const roles = {};
      for (const [role, spec] of Object.entries(s.roles)) {
        const path = typeof spec === 'string' ? spec.replaceAll('{colour}', colour) : spec[colour];
        if (!path) throw new Error(`skin ${id}.${role} has no file for colour ${colour}`);
        roles[role] = need(path, `skin ${id}.${role}.${colour}`);
      }
      byColour[colour] = roles;
    }
    skins[id] = { title: s.title, genres: s.genres, font: fonts[s.font].font, colours: s.colours, roles: byColour };
  }
  const icons = {};
  for (const [key, path] of Object.entries(ICONS)) icons[key] = need(path, `icon ${key}`);

  // Which ink reads on each surface is decided here, once, from the two sampled inks. Light text
  // carries an outline in the surface's own darkest pixel (`edge`), the Roblox convention, so it
  // reads on mid-tone fills; only a fill too pale for that (under 1.9:1 against the light ink,
  // e.g. yellow, glass, parchment) takes the dark ink.
  for (const img of Object.values(images)) {
    img.text = contrast(img.centre, ink.ink_light) >= 1.9 ? 'light' : 'dark';
  }

  const components = COMPONENTS.map((c) => {
    for (const [id, s] of Object.entries(skins)) {
      for (const role of c.roles) if (!s.roles[s.colours[0]][role]) throw new Error(`${c.id} needs role ${role}, which skin ${id} lacks`);
    }
    for (const icon of c.icons) if (!icons[icon]) throw new Error(`${c.id} needs icon ${icon}, which ICONS lacks`);
    const re = new RegExp(c.seenIn, 'i');
    const rows = sources.filter((r) => re.test(`${r.title} ${r.style ?? ''}`));
    if (!rows.length) throw new Error(`${c.id}: no row of sources/ui.jsonl matches /${c.seenIn}/`);
    rows.sort((a, b) => (a.use === 'import-ok' ? 0 : 1) - (b.use === 'import-ok' ? 0 : 1));
    return {
      id: c.id, title: c.title, group: c.group, genres: c.genres, roles: c.roles, icons: c.icons,
      seenIn: rows.slice(0, 3).map((r) => ({ url: r.url, title: r.title, use: r.use })),
      sourcesMatched: rows.length,
    };
  });

  return {
    note: 'Generated by build-ui-components.mjs from ui-components.spec.mjs, index.json, packs/ and sources/ui.jsonl. Do not edit by hand.',
    fonts, ink, skins, icons, images, components,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const out = build();
  writeFileSync(join(HERE, 'ui-components.json'), JSON.stringify(out, null, 1) + '\n');
  const per = Object.keys(out.skins).map((g) => `${g} ${out.components.filter((c) => c.genres.includes(g)).length}`);
  console.log(`ui-components.json: ${out.components.length} components, ${Object.keys(out.images).length} images; per genre: ${per.join(', ')}`);
}
