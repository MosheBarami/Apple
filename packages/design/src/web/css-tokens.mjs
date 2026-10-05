/**
 * Reads packages/design/src/web/tokens.css the way a test (or a script) needs it read: per theme,
 * with `var()` chains resolved, and with the WCAG arithmetic next to it so no test restates it.
 *
 * Nothing here knows a token's value. Every number a test checks is derived from the file at the
 * moment it runs, which is the whole point: a ratio typed into a test measures the colour somebody
 * remembered, not the colour that ships.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TOKENS_CSS_PATH = fileURLToPath(new URL('./tokens.css', import.meta.url));
export const ACCENTS_JSON_PATH = fileURLToPath(new URL('./accents.json', import.meta.url));

/**
 * The accent of the system before M2 (dark, light and their translucent forms). It may appear in
 * no tracked source file outside packages/design: a surface that needs the accent reads the token.
 * Listed here, in the one place allowed to name them, so a guard elsewhere never types one.
 */
export const OLD_ACCENT_LITERALS = [
  '#5b7cfa', '#4568e8', '#8ca4ff', '#4264e8', '#3155d4',
  'rgba(91,124,250', 'rgba(69,104,232',
];

export const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

export function readTokensCss() {
  return readFileSync(TOKENS_CSS_PATH, 'utf8');
}

/** Every top-level rule of a stylesheet as { selector, body }, comments stripped. */
export function topLevelRules(css) {
  const src = stripComments(css);
  const out = [];
  let depth = 0;
  let head = '';
  let bodyStart = -1;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (c === '{') {
      if (depth === 0) { bodyStart = i + 1; }
      depth += 1;
    } else if (c === '}') {
      depth -= 1;
      if (depth === 0) out.push({ selector: head.trim().replace(/\s+/g, ' '), body: src.slice(bodyStart, i) });
      if (depth === 0) head = '';
    } else if (depth === 0) {
      head += c;
    }
  }
  return out;
}

/** `--name: value;` pairs of one body, in source order (duplicates kept, so a test can count them). */
export function declarations(body) {
  return [...body.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => ({ name: m[1], value: m[2].trim() }));
}

export const DARK_SELECTOR = ":root, :root[data-theme='dark']";
export const LIGHT_SELECTOR = ":root[data-theme='light']";

/** The two theme blocks of the token file: { dark: Decl[], light: Decl[] }. */
export function themeBlocks(css = readTokensCss()) {
  const rules = topLevelRules(css);
  const pick = (selector) => {
    const found = rules.filter((r) => r.selector === selector);
    if (found.length !== 1) throw new Error(`tokens.css must hold exactly one "${selector}" block, found ${found.length}`);
    return declarations(found[0].body);
  };
  return { dark: pick(DARK_SELECTOR), light: pick(LIGHT_SELECTOR) };
}

/** The theme-independent block (`:root` alone): type, radii, space, motion, and the colours that stay put in both themes. */
export function sharedBlock(css = readTokensCss()) {
  const found = topLevelRules(css).filter((r) => r.selector === ':root');
  if (found.length !== 1) throw new Error(`tokens.css must hold exactly one ":root" block, found ${found.length}`);
  return declarations(found[0].body);
}

/** A theme as a name -> raw value map, plus a resolver that follows var() to a colour. */
export function theme(decls, shared = []) {
  const raw = Object.fromEntries([...shared, ...decls].map((d) => [d.name.slice(2), d.value]));
  const resolve = (name, seen = new Set()) => {
    const v = raw[name];
    if (v === undefined) return null;
    const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
    if (hex) return '#' + (hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1]).toLowerCase();
    const ref = /^var\(--([a-z0-9-]+)\)$/i.exec(v);
    if (ref && !seen.has(ref[1])) return resolve(ref[1], new Set([...seen, name]));
    return null; // rgba(), color-mix(), lengths: not a solid colour
  };
  return { raw, resolve };
}

/** sRGB channels (0 to 255, not necessarily whole) -> relative luminance (WCAG 2.x). */
export function luminanceOf([r8, g8, b8]) {
  const [r, g, b] = [r8, g8, b8].map((c) => c / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

/** sRGB hex -> relative luminance (WCAG 2.x). */
export function luminance(hex) {
  return luminanceOf([1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** The same ratio for two [r, g, b] triples, with no rounding to a whole channel in between. */
export function contrastRgb(a, b) {
  const [x, y] = [luminanceOf(a), luminanceOf(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** `rgba(r,g,b,a)` or `#rrggbb` -> [r,g,b,a]. */
export function parseColour(v) {
  const hex = /^#([0-9a-f]{6})$/i.exec(v.trim());
  if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
  const fn = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(v.trim());
  if (!fn) throw new Error(`not a literal colour: ${v}`);
  return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
}

/** `fg` (possibly translucent) painted over the solid hex `bg`, as a solid hex. */
export function over(bg, fg) {
  const [r, g, b, a] = parseColour(fg);
  const [br, bgG, bb] = parseColour(bg);
  const mix = (f, back) => Math.round(f * a + back * (1 - a));
  return '#' + [mix(r, br), mix(g, bgG), mix(b, bb)].map((n) => n.toString(16).padStart(2, '0')).join('');
}

/** The address-bar band of one theme: what the layouts write into <meta name="theme-color">. */
export function themeColor(mode = 'dark', css = readTokensCss()) {
  const t = theme(themeBlocks(css)[mode]);
  const v = t.resolve('theme-color');
  if (!v) throw new Error(`--theme-color of the ${mode} theme is not a solid colour`);
  return v;
}

export const SURFACES = ['paper', 'paper-2', 'surface', 'surface-2', 'surface-3'];
export const TEXT_INKS = ['ink', 'ink-2', 'muted', 'faint'];
export const STATUS_INKS = ['good', 'warn', 'bad', 'info'];

/**
 * The WCAG measurements of one accent candidate in one theme, from the values the candidate
 * carries and the surfaces the token file gives that theme. UNROUNDED: a ratio of 4.496 is below 4.5
 * and must fail, and rounded to two places it reads 4.50 and passes. Round only to RECORD
 * (`roundRatios`), never to decide.
 *
 *   textOnBase      the accent used as text on --paper                       (needs 4.5)
 *   textWorst       the accent used as text on the worst of the five surfaces (needs 4.5)
 *   ringWorst       the focus ring AS THE TOKEN FILE DRAWS IT (`--accent-ring`, the accent at some
 *                   alpha) composited over each surface, worst of the five    (needs 3)
 *   labelOnAccent   --accent-ink on --accent: the label of an accent button   (needs 4.5)
 *   labelOnStrong   --accent-ink on --accent-strong: the same button hovered  (needs 4.5)
 *   strongOnWash    --accent-strong as text on the accent wash over --surface-2: a selected chip (needs 4.5)
 *
 * `ringOf(accentHex)` is the ring colour the token file derives from an accent, as [r, g, b, a]
 * (see `accentRingOf`). The ring was once measured as the SOLID accent, which made `ringWorst`
 * identical to `textWorst` and a check that could never fire on its own, while the outlines the
 * apps drew were the accent at 45% alpha, about 2:1.
 */
export function measureAccentExact(values, surfaces, ringOf) {
  const rgbs = Object.values(surfaces).map(rgbOfHex);
  const worst = (fg) => Math.min(...rgbs.map((bg) => contrastRgb(rgbOfHex(fg), bg)));
  const ring = ringOf(values.accent);
  const chipBg = blend(rgbOfHex(surfaces['surface-2']), colourOf(values['accent-wash']));
  return {
    textOnBase: contrast(values.accent, surfaces.paper),
    textWorst: worst(values.accent),
    ringWorst: Math.min(...rgbs.map((bg) => contrastRgb(blend(bg, ring), bg))),
    labelOnAccent: contrast(values['accent-ink'], values.accent),
    labelOnStrong: contrast(values['accent-ink'], values['accent-strong']),
    strongOnWash: contrastRgb(rgbOfHex(values['accent-strong']), chipBg),
  };
}

/** What accents.json records: the exact ratios to two places. For the record, not for a verdict. */
export const roundRatios = (m) => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, Math.round(v * 100) / 100]));

export const AA = { text: 4.5, ring: 3 };

/** What a candidate's EXACT measurements must satisfy. Returns the list of failures (empty = AA). */
export function aaFailures(m) {
  const out = [];
  const show = (n) => (Math.floor(n * 1000) / 1000).toFixed(3);
  if (m.textOnBase < AA.text) out.push(`accent as text on the base is ${show(m.textOnBase)}:1, needs ${AA.text}`);
  if (m.textWorst < AA.text) out.push(`accent as text on its worst surface is ${show(m.textWorst)}:1, needs ${AA.text}`);
  if (m.ringWorst < AA.ring) out.push(`focus ring on its worst surface is ${show(m.ringWorst)}:1, needs ${AA.ring}`);
  if (m.labelOnAccent < AA.text) out.push(`label on the accent button is ${show(m.labelOnAccent)}:1, needs ${AA.text}`);
  if (m.labelOnStrong < AA.text) out.push(`label on the hovered accent button is ${show(m.labelOnStrong)}:1, needs ${AA.text}`);
  if (m.strongOnWash < AA.text) out.push(`accent-strong text on the accent wash is ${show(m.strongOnWash)}:1, needs ${AA.text}`);
  return out;
}

/** The solid surfaces of a theme, resolved from the token file. */
export function surfacesOf(t) {
  return Object.fromEntries(SURFACES.map((s) => {
    const v = t.resolve(s);
    if (!v) throw new Error(`--${s} does not resolve to a solid colour`);
    return [s, v];
  }));
}

/* ------------------------------------------------------------------ any colour a stylesheet writes */

/*
 * The helpers below turn what a stylesheet WRITES (`var(--sh-accent-ring)`, `color-mix(in srgb,
 * var(--accent) 45%, transparent)`, `0 0 0 3px var(--halo)`) into the colours it DRAWS, so a test
 * can measure the drawn pair instead of a token somebody remembered. Nothing here knows a value.
 *
 * `color-mix` is evaluated in sRGB whatever space it names. That is exact for the mixes this code
 * base writes against `transparent` (the colour is unchanged and the alpha is the percentage) and
 * close for a mix of two opaque colours, which is all a 3:1 floor needs.
 */

export const rgbOfHex = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

/** Split `s` at `sep` outside parentheses and quotes; whitespace separators collapse. */
export function splitTop(s, sep = ',') {
  const out = [];
  let depth = 0;
  let cur = '';
  let quote = null;
  for (const c of s) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(') depth += 1;
    if (c === ')') depth -= 1;
    if (depth === 0 && (sep === ' ' ? /\s/.test(c) : c === sep)) {
      if (cur.trim() !== '') out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  if (cur.trim() !== '') out.push(cur.trim());
  return out;
}

/**
 * Replace every `var(--name[, fallback])` in `value` by what `lookup('--name')` answers (a string,
 * itself expanded), or by the fallback when it answers nothing. Returns null when a name has neither,
 * so "could not resolve" is never read as a colour.
 */
export function expandVars(value, lookup, depth = 0) {
  if (depth > 16) return null;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const at = value.indexOf('var(', i);
    if (at === -1) { out += value.slice(i); break; }
    out += value.slice(i, at);
    let d = 0;
    let end = at + 3;
    for (; end < value.length; end += 1) {
      if (value[end] === '(') d += 1;
      else if (value[end] === ')') { d -= 1; if (d === 0) break; }
    }
    const inner = value.slice(at + 4, end);
    const comma = inner.indexOf(',');
    const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma === -1 ? null : inner.slice(comma + 1).trim();
    const got = lookup(name);
    const text = got != null ? expandVars(String(got), lookup, depth + 1) : fallback != null ? expandVars(fallback, lookup, depth + 1) : null;
    if (text == null) return null;
    out += text;
    i = end + 1;
  }
  return out;
}

const NAMED = { white: [255, 255, 255, 1], black: [0, 0, 0, 1], transparent: [0, 0, 0, 0] };

/** A literal colour (hex, rgb(), rgba(), white, black, transparent, or a color-mix of those) -> [r, g, b, a], else null. */
export function colourOf(value) {
  const v = String(value).trim().toLowerCase();
  if (NAMED[v]) return [...NAMED[v]];
  let m = /^#([0-9a-f]+)$/.exec(v);
  if (m) {
    const h = m[1];
    if (![3, 4, 6, 8].includes(h.length)) return null;
    const x = h.length <= 4 ? [...h].map((c) => c + c).join('') : h;
    const n = [0, 2, 4, 6].map((i) => (i < x.length ? parseInt(x.slice(i, i + 2), 16) : 255));
    return [n[0], n[1], n[2], n[3] / 255];
  }
  m = /^rgba?\((.*)\)$/.exec(v);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    if (parts.length < 3) return null;
    const ch = (p) => (p.endsWith('%') ? parseFloat(p) * 2.55 : parseFloat(p));
    const alpha = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const out = [ch(parts[0]), ch(parts[1]), ch(parts[2]), alpha];
    return out.some(Number.isNaN) ? null : out;
  }
  m = /^color-mix\((.*)\)$/.exec(v);
  if (m) {
    const parts = splitTop(m[1]);
    if (parts.length !== 3 || !/^in\s/.test(parts[0])) return null;
    const arm = (p) => {
      const trailing = /^(.*?)\s+([\d.]+)%$/.exec(p);
      const leading = /^([\d.]+)%\s+(.*)$/.exec(p);
      const [text, pct] = trailing ? [trailing[1], parseFloat(trailing[2])] : leading ? [leading[2], parseFloat(leading[1])] : [p, null];
      return { c: colourOf(text), pct };
    };
    const [x, y] = [arm(parts[1]), arm(parts[2])];
    if (!x.c || !y.c) return null;
    let [p1, p2] = [x.pct, y.pct];
    if (p1 == null && p2 == null) { p1 = 50; p2 = 50; } else if (p1 == null) p1 = 100 - p2; else if (p2 == null) p2 = 100 - p1;
    const sum = p1 + p2;
    if (!(sum > 0)) return null;
    const [w1, w2] = [p1 / sum, p2 / sum];
    const alpha = x.c[3] * w1 + y.c[3] * w2;
    const ch = (i) => (alpha === 0 ? 0 : (x.c[i] * x.c[3] * w1 + y.c[i] * y.c[3] * w2) / alpha);
    return [ch(0), ch(1), ch(2), alpha * (Math.min(sum, 100) / 100)];
  }
  return null;
}

/** `fg` ([r, g, b, a]) painted over `bg` ([r, g, b]), as [r, g, b] with no rounding. */
export const blend = (bg, [r, g, b, a]) => [r * a + bg[0] * (1 - a), g * a + bg[1] * (1 - a), b * a + bg[2] * (1 - a)];

/**
 * The focus ring of a theme as the token file derives it from an accent: a function
 * accentHex -> [r, g, b, a]. It evaluates the theme block's own `--accent-ring`, so a change to how
 * the ring is made changes what every candidate is measured with.
 */
export function accentRingOf(decls) {
  const raw = Object.fromEntries(decls.map((d) => [d.name, d.value]));
  if (!raw['--accent-ring']) throw new Error('the theme block declares no --accent-ring');
  return (accent) => {
    const text = expandVars(raw['--accent-ring'], (n) => (n === '--accent' ? accent : raw[n]));
    const c = text && colourOf(text);
    if (!c) throw new Error(`--accent-ring (${raw['--accent-ring']}) does not resolve to a colour`);
    return c;
  };
}
