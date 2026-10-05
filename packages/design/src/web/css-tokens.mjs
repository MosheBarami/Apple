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

/** sRGB hex -> relative luminance (WCAG 2.x). */
export function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
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
 * carries and the surfaces the token file gives that theme. The numbers are what accents.json
 * records and what the test recomputes.
 *
 *   textOnBase      the accent used as text on --paper                       (needs 4.5)
 *   textWorst       the accent used as text on the worst of the five surfaces (needs 4.5)
 *   ringWorst       the accent as a focus ring on the worst surface           (needs 3)
 *   labelOnAccent   --accent-ink on --accent: the label of an accent button   (needs 4.5)
 *   labelOnStrong   --accent-ink on --accent-strong: the same button hovered  (needs 4.5)
 *   strongOnWash    --accent-strong as text on the accent wash over --surface-2: a selected chip (needs 4.5)
 */
export function measureAccent(values, surfaces) {
  const ratio = (a, b) => Math.round(contrast(a, b) * 100) / 100;
  const worst = (fg) => Math.min(...Object.values(surfaces).map((bg) => contrast(fg, bg)));
  const chipBg = over(surfaces['surface-2'], values['accent-wash']);
  return {
    textOnBase: ratio(values.accent, surfaces.paper),
    textWorst: Math.round(worst(values.accent) * 100) / 100,
    ringWorst: Math.round(worst(values.accent) * 100) / 100,
    labelOnAccent: ratio(values['accent-ink'], values.accent),
    labelOnStrong: ratio(values['accent-ink'], values['accent-strong']),
    strongOnWash: ratio(values['accent-strong'], chipBg),
  };
}

export const AA = { text: 4.5, ring: 3 };

/** What a candidate's measurements must satisfy. Returns the list of failures (empty = AA). */
export function aaFailures(m) {
  const out = [];
  if (m.textOnBase < AA.text) out.push(`accent as text on the base is ${m.textOnBase}:1, needs ${AA.text}`);
  if (m.textWorst < AA.text) out.push(`accent as text on its worst surface is ${m.textWorst}:1, needs ${AA.text}`);
  if (m.ringWorst < AA.ring) out.push(`focus ring on its worst surface is ${m.ringWorst}:1, needs ${AA.ring}`);
  if (m.labelOnAccent < AA.text) out.push(`label on the accent button is ${m.labelOnAccent}:1, needs ${AA.text}`);
  if (m.labelOnStrong < AA.text) out.push(`label on the hovered accent button is ${m.labelOnStrong}:1, needs ${AA.text}`);
  if (m.strongOnWash < AA.text) out.push(`accent-strong text on the accent wash is ${m.strongOnWash}:1, needs ${AA.text}`);
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
