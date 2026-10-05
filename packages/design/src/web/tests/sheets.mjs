/**
 * Reads the stylesheets of both apps the way the "what is drawn" guards need them read: every rule
 * flattened to { file, selector, body }, every custom property an app sheet declares, and a lookup
 * that resolves a `var()` to the value a theme would give it.
 *
 * Test support (it lives in tests/ so the dead-end checker counts it as test code). Nothing here
 * is a hand-written file list: the sheets are DERIVED from the app directories, and the guards that
 * use this assert a floor on what it found, because a scan that read nothing reports a clean app.
 */
import { colourOf, expandVars, rgbOfHex, sharedBlock, splitTop, stripComments, surfacesOf, theme, themeBlocks } from '../css-tokens.mjs';
import { readText, walkText } from './repo-walk.mjs';

/** The CSS of a file: the file itself, or the <style> blocks of an .astro page. */
export function cssOf(file) {
  const src = readText(file);
  return stripComments(file.rel.endsWith('.astro') ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') : src);
}

/** Every .css and .astro file of both apps, as { path, rel, css }. */
export function appSheets() {
  return walkText(['apps/site/src', 'apps/web/src']).filter((f) => /\.(css|astro)$/.test(f.rel)).map((f) => ({ ...f, css: cssOf(f) }));
}

/**
 * Every innermost rule as { file, selector, body }. A rule inside @media, @supports or @layer is
 * found (the at-rule's own head never matches, because its body holds a brace); @keyframes steps
 * come out as rules named `from`, `to` or a percentage, which nothing here selects.
 */
export function flatRules(sheets) {
  const out = [];
  for (const f of sheets) {
    for (const m of f.css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = m[1].split(';').pop().trim().replace(/\s+/g, ' ');
      if (selector && !selector.startsWith('@')) out.push({ file: f.rel, selector, body: m[2] });
    }
  }
  return out;
}

/** The value of a property in a rule body (the last one wins, `!important` dropped), or null. */
export function declOf(body, prop) {
  const found = [...body.matchAll(new RegExp(`(?:^|[;\\s])${prop}\\s*:\\s*([^;}]+)`, 'gi'))];
  return found.length ? found[found.length - 1][1].replace(/!important/i, '').trim() : null;
}

/** Every custom property the app sheets declare: name -> the set of distinct values written. */
export function customProperties(sheets) {
  const map = new Map();
  for (const f of sheets) {
    for (const m of f.css.matchAll(/(?:^|[;{\s])(--[a-z0-9-]+)\s*:\s*([^;}]+)/gi)) {
      if (!map.has(m[1])) map.set(m[1], new Set());
      map.get(m[1]).add(m[2].trim());
    }
  }
  return map;
}

/**
 * The lookup `expandVars` wants: a token the design file declares for the theme wins; otherwise the
 * value an app sheet gave the name. A name the app sheets declare with two DIFFERENT values is
 * ambiguous and throws, because answering with one of them would be a guess about the cascade.
 */
export function lookupFor(themeRaw, appProps) {
  return (name) => {
    const own = themeRaw[name.slice(2)];
    if (own !== undefined) return own;
    const vals = appProps.get(name);
    if (!vals) return undefined;
    if (vals.size > 1) throw new Error(`${name} is declared with ${vals.size} different values in the app sheets (${[...vals].join(' | ')}); resolve it before measuring through it`);
    return [...vals][0];
  };
}

/* ------------------------------------------------------------------ what a focus rule draws */


const LENGTH = /^-?(?:\d*\.)?\d+(?:px|em|rem)?$/;

/** A rule is a focus rule when any selector of its list names a focus pseudo-class. */
export const isFocusRule = (rule) => splitTop(rule.selector).some((s) => /:focus/.test(s));

/**
 * What a focus rule DRAWS as its ring, resolved through `lookup`:
 *   rings       an `outline` / `outline-color` colour, and every ring-shaped `box-shadow` layer
 *               (no offset, no blur, a spread: `0 0 0 3px X`, `inset 0 0 0 1px X`). A glow
 *               (`0 0 12px X`) and a drop shadow are not rings and are not collected.
 *   border      the colour the rule gives the border, which can carry the focus when the ring is a wash
 *   unresolved  a declaration that draws something and whose colour could not be worked out
 * Each entry is { prop, text, colour: [r, g, b, a] }. `outline: none` and `box-shadow: none` draw nothing.
 */
export function focusDrawing(rule, lookup) {
  const rings = [];
  const unresolved = [];
  let border = null;
  const expand = (v) => expandVars(v, lookup);
  const add = (prop, text, token) => {
    const colour = token === undefined ? null : colourOf(token);
    (colour ? rings : unresolved).push({ prop, text, colour });
  };

  const outline = declOf(rule.body, 'outline');
  if (outline !== null) {
    const text = expand(outline);
    const tokens = text === null ? null : splitTop(text, ' ');
    if (tokens === null) unresolved.push({ prop: 'outline', text: outline, colour: null });
    else if (!tokens.includes('none') && tokens[0] !== '0') add('outline', text, tokens.find((t) => colourOf(t)));
  }
  const outlineColour = declOf(rule.body, 'outline-color');
  if (outlineColour !== null) {
    const text = expand(outlineColour);
    if (text === null) unresolved.push({ prop: 'outline-color', text: outlineColour, colour: null });
    else add('outline-color', text, text);
  }

  const shadow = declOf(rule.body, 'box-shadow');
  if (shadow !== null) {
    const text = expand(shadow);
    if (text === null) unresolved.push({ prop: 'box-shadow', text: shadow, colour: null });
    else if (text !== 'none') {
      for (const layer of splitTop(text, ',')) {
        const tokens = splitTop(layer, ' ');
        const lens = tokens.filter((t) => LENGTH.test(t)).map(parseFloat);
        if (lens.length < 2) continue;
        const [x, y, blur = 0, spread = 0] = lens;
        if (x === 0 && y === 0 && blur === 0 && spread > 0) add('box-shadow', layer, tokens.find((t) => colourOf(t)));
      }
    }
  }

  // The border is read only for a rule that draws a ring: a hover or focus border tweak on its own
  // is not a ring, and reading it would make every ambiguous alias it names a reason to throw.
  const edge = rings.length ? declOf(rule.body, 'border-color') : null;
  if (edge !== null) {
    const text = expand(edge);
    const colour = text === null ? null : colourOf(splitTop(text, ' ')[0]);
    if (colour) border = { prop: 'border-color', text, colour };
  }
  return { rings, border, unresolved };
}

/** The theme as a stylesheet sees it: a `lookup` for var() and the five surfaces as [name, [r, g, b]]. */
export function worldFor(mode, appProps) {
  const t = theme(themeBlocks()[mode], sharedBlock());
  return { t, lookup: lookupFor(t.raw, appProps), surfaces: Object.entries(surfacesOf(t)).map(([name, hex]) => [name, rgbOfHex(hex)]) };
}
