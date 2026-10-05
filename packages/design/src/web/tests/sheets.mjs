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
  return stripComments(/\.(?:astro|html)$/.test(file.rel) ? [...src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n') : src);
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
 *   rings       an `outline` / `outline-color` colour, a Tailwind `--tw-ring-color`, and every ring-shaped `box-shadow` layer
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

  // Tailwind draws a ring as `box-shadow: 0 0 0 <width> var(--tw-ring-color)`, so a rule that sets the colour
  // variable on focus is setting the ring's colour: a correction of a vendored utility's ring is read as one.
  const ringColour = declOf(rule.body, '--tw-ring-color');
  if (ringColour !== null) {
    const text = expand(ringColour);
    if (text === null) unresolved.push({ prop: '--tw-ring-color', text: ringColour, colour: null });
    else add('--tw-ring-color', text, text);
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

/* ------------------------------------------------------------------ colours written on a theme root */

/** CSS Color Module named colours, and `transparent`. A spec constant, not a repo list. */
const NAMED_COLOURS = new Set(('aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen transparent').split(' '));
const COLOUR_FUNCTION = /(?<![\w-])(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(/i;

/** True when a declaration value writes a literal colour: hex, any colour function, or a named colour. */
export function carriesColour(value) {
  if (/#[0-9a-f]{3,8}(?![\w-])/i.test(value)) return true;
  if (COLOUR_FUNCTION.test(value)) return true;
  const words = value.replace(/(['"])(?:(?!\1).)*\1/g, ' ').replace(/url\([^)]*\)/gi, ' ');
  for (const m of words.matchAll(/(?<![\w-])([a-z]+)(?![\w(-])/gi)) if (NAMED_COLOURS.has(m[1].toLowerCase())) return true;
  return false;
}

/** The names a theme goes by when nothing names the root element: `.dark`, `.dark-mode`, `.is-light`, `.theme-sepia`. */
const THEME_CLASS = /^\.(?:dark|light|(?:dark|light)[-_]?(?:mode|theme|scheme)|(?:is|has|theme|mode|scheme)[-_](?:dark|light))$/i;
/** `[data-theme]`, `[data-mode="dark"]`, `[data-bs-theme=dark]`, `[data-color-scheme=dark]`: any attribute whose name says theme, mode or scheme. */
const THEME_ATTRIBUTE = /^\[[\w-]*(?:theme|mode|scheme)[\w-]*(?:\s*[~|^$*]?=\s*[^\]]*)?\]$/i;

/** The last compound of a complex selector (the element the rule STYLES), or null for one that cannot be read. */
function subjectOf(selector) {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(c)) cut = i + 1;
  }
  return selector.slice(cut).trim() || null;
}

/**
 * Is one selector of a list a THEME ROOT: a rule whose SUBJECT, the element it styles, is the document element
 * or the element a theme is switched on. Two shapes:
 *   - the subject is `html`, `:root` or `body` with ANY qualifier: `html.no-js`, `html[dir=rtl]`, `:root.dark-mode`,
 *     `body.is-dark`, `html:where(.dark)`, `html > body.x`. (The first version listed the qualifiers it knew, and a
 *     rule on `html.no-js` or `[data-bs-theme=dark]` slipped through.)
 *   - the subject names no element but is a theme switch: `.dark`, `.dark-mode`, `.is-light`, `.theme-dark`, `[data-theme]`,
 *     `[data-mode="dark"]`, `[data-bs-theme=dark]`, any attribute whose name says theme, mode or scheme, alone or with pseudo-classes.
 * A descendant of the root (`html .card`, `[data-theme=light] .card`) is a component scoping its own value, not a root,
 * and a pseudo-element (`html::selection`) is not the element.
 */
export function isThemeRoot(part) {
  const compact = part.trim().replace(/\[[^\]]*\]/g, (m) => m.replace(/\s+/g, ''));
  const subject = subjectOf(compact);
  if (!subject || /::/.test(subject.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, ''))) return false;
  if (/^(?::root|html|body)(?![\w-])/i.test(subject)) return true;
  const bare = subject.replace(/\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '');
  const simples = bare.match(/\.[\w-]+|\[[^\]]*\]|:[\w-]+|#[\w-]+|[^.[:#]+/g) ?? [];
  if (simples.length === 0 || simples.some((x) => /^[^.[:#]/.test(x))) return false;
  const themed = simples.filter((x) => THEME_CLASS.test(x) || THEME_ATTRIBUTE.test(x));
  return themed.length > 0 && simples.every((x) => THEME_CLASS.test(x) || THEME_ATTRIBUTE.test(x) || x.startsWith(':'));
}

/**
 * Every colour a stylesheet writes on a theme root, in any nesting (`@media`, `@layer`, `@supports`)
 * and in any colour syntax: as { selector, prop, value }.
 */
export function themeRootColours(css) {
  const out = [];
  for (const m of stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].split(';').pop().trim().replace(/\s+/g, ' ');
    if (!selector || selector.startsWith('@')) continue;
    if (!splitTop(selector).some(isThemeRoot)) continue;
    for (const d of splitTop(m[2], ';')) {
      const colon = d.indexOf(':');
      if (colon === -1) continue;
      const [prop, value] = [d.slice(0, colon).trim(), d.slice(colon + 1).trim()];
      if (carriesColour(value)) out.push({ selector, prop, value });
    }
  }
  return out;
}

/**
 * Every colour written by an inline `style` attribute on the document or body element in markup (an .astro layout or
 * apps/web/index.html): `<html style="--paper:#000">`, `<body style="background:#fff">`. A stylesheet guard never reads it.
 * As { tag, prop, value }.
 */
export function inlineRootColours(markup) {
  const out = [];
  for (const m of markup.replace(/<!--[\s\S]*?-->/g, ' ').matchAll(/<(html|body)\b[^>]*?\sstyle\s*=\s*(["'])([\s\S]*?)\2/gi)) {
    for (const d of splitTop(m[3], ';')) {
      const colon = d.indexOf(':');
      if (colon === -1) continue;
      const [prop, value] = [d.slice(0, colon).trim(), d.slice(colon + 1).trim()];
      if (carriesColour(value)) out.push({ tag: m[1].toLowerCase(), prop, value });
    }
  }
  return out;
}

/**
 * Every colour a SCRIPT writes on the document or body element: `document.documentElement.style.setProperty('--paper', '#000')`,
 * `document.body.style.background = '#fff'`. As { target, text }.
 */
export function scriptRootColours(script) {
  const out = [];
  for (const m of script.matchAll(/(documentElement|document\.body)\.style\.(?:setProperty\(\s*['"`][^'"`]+['"`]\s*,\s*|[\w]+\s*=\s*)(['"`])([^'"`]*)\2/g)) {
    if (carriesColour(m[3])) out.push({ target: m[1], text: m[0].slice(0, 80) });
  }
  return out;
}

/* ------------------------------------------------------------------ where a legacy primary button is restyled */

/** The compounds of one selector part, left to right: split at the combinators (space, >, +, ~) outside parentheses and brackets. */
function compoundsOf(part) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const c of part.trim()) {
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    if (depth === 0 && /[\s>+~]/.test(c)) { if (cur) out.push(cur); cur = ''; } else cur += c;
  }
  if (cur) out.push(cur);
  return out;
}

/** A compound with its `:not()`, `:has()` and `:where()` groups taken out (balanced). */
function withoutNegations(compound) {
  let out = '';
  for (let i = 0; i < compound.length; i += 1) {
    const hit = [':not(', ':has(', ':where('].find((p) => compound.startsWith(p, i));
    if (!hit) { out += compound[i]; continue; }
    let depth = 0;
    let j = i + hit.length - 1;
    for (; j < compound.length; j += 1) { if (compound[j] === '(') depth += 1; else if (compound[j] === ')' && --depth === 0) break; }
    i = j;
  }
  return out;
}

/** The ways an element can satisfy a compound's classes: `.a.b` is one way, `:is(.a,.b)` is two. Each way is a list of class names. */
function classWays(compound) {
  const bare = withoutNegations(compound);
  const groups = [...bare.matchAll(/:is\(([^()]*)\)/g)];
  const named = (text) => (text.match(/\.[\w-]+/g) ?? []).map((c) => c.slice(1));
  let ways = [named(bare.replace(/:is\(([^()]*)\)/g, ''))];
  for (const g of groups) ways = ways.flatMap((base) => splitTop(g[1]).map((alt) => [...base, ...named(alt)]));
  return ways;
}

/**
 * Where the app's sheets restyle a legacy primary button, DERIVED from the rules and not listed: for every selector part whose subject
 * positively names `.btn-primary` or `.gx-btn--primary` (a `:not(.btn-primary)` does not count), the classes of each ancestor it demands
 * (`:is(.shelf,.usage-page)` is a choice, so it is one chain per choice) and the classes of the subject itself. Returns
 *   { chains: [[['auth-page'], ['auth-card']], ...] }   one entry per distinct set of ancestors, each ancestor a list of classes; [] is "no ancestor"
 *   { subjects: [['btn-block', 'btn-primary'], ...] }   the distinct class lists of the control itself
 * so a guard can draw the control inside every page wrapper that restyles it, whether or not the mock data happens to render one there.
 */
export function primaryButtonContexts(rules) {
  const chains = new Map([['', []]]);
  const subjects = new Map();
  for (const r of rules) {
    for (const part of splitTop(r.selector)) {
      const compounds = compoundsOf(part);
      if (compounds.length === 0) continue;
      const own = classWays(compounds[compounds.length - 1]);
      const ways = own.filter((w) => w.includes('btn-primary') || w.includes('gx-btn--primary'));
      if (ways.length === 0) continue;
      for (const way of ways) subjects.set([...way].sort().join(' '), [...way].sort());
      let product = [[]];
      for (const ancestor of compounds.slice(0, -1)) {
        const choices = classWays(ancestor).filter((w) => w.length > 0);
        if (choices.length === 0) continue;
        product = product.flatMap((base) => choices.map((choice) => [...base, choice]));
      }
      for (const chain of product) chains.set(chain.map((c) => c.join('.')).join(' > '), chain);
    }
  }
  return { chains: [...chains.values()], subjects: [...subjects.values()] };
}

/**
 * The class lists the app's own markup gives its page wrappers: every static `className="..."` of apps/web's components, as a list of
 * class names. A stylesheet names `.shelf` and the page writes `page shelf`, and a rule or a custom property keyed on `.page.shelf`
 * (the dashboard's `--sh-*` scope) only exists on the real element; a guard that draws a bare `.shelf` draws a page that is not there.
 */
export function markupClassLists() {
  const out = new Set();
  for (const f of walkText(['apps/web/src']).filter((x) => /\.tsx$/.test(x.rel))) {
    for (const m of readText(f).matchAll(/className=(?:"([^"{}$]+)"|\{\s*(?:'([^'{}$]+)'|`([^`{}$]+)`)\s*\})/g)) {
      const names = (m[1] ?? m[2] ?? m[3]).trim().split(/\s+/).filter(Boolean);
      if (names.length > 0) out.add(names.join(' '));
    }
  }
  return [...out].map((l) => l.split(' '));
}

/** The shortest class list in the app's markup that carries every one of `classes` (so `['shelf']` is `['page', 'shelf']`); `classes` itself when none does. */
export function asTheMarkupWritesIt(classes, lists) {
  const carrying = lists.filter((l) => classes.every((c) => l.includes(c)));
  if (carrying.length === 0) return classes;
  return carrying.reduce((a, b) => (b.length < a.length ? b : a));
}
