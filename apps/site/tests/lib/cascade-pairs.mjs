/**
 * THE TEXT AND THE GROUND IT IS DRAWN ON, PAIRED BY STATE AND CONTEXT: the arithmetic behind contrast.test.mjs.
 *
 * Not itself a test file (a helper under tests/lib/; `node --test tests/*.test.mjs` never collects it).
 *
 * WHY IT EXISTS. The first version of the contrast guard asked "does any rule give this element a fill?" and merged
 * the answers of every rule that styled the element: its rest state, its hover state, and nothing else. Two shapes got
 * through it, both verified green:
 *
 *   .zz-btn { color: var(--paper) }  .zz-btn:hover { background: var(--accent) }
 *       paper text that is only ever on a fill WHEN HOVERED. At rest it is paper on the paper page, 1:1, and the old
 *       guard measured the one pair it found (paper on the accent, 6.5:1) and passed.
 *   .zz-b2 { color: var(--accent-ink); background: var(--accent) }  .zz-modal .zz-b2 { background: var(--surface-3) }
 *       an accent label that is on the accent everywhere but inside a modal, where the descendant rule's fill was
 *       never collected because the rule's selector is a different string.
 *
 * A reader sees ONE state of ONE element in ONE context. So a pair here is the colour that wins in a state and a
 * context together with the fill that wins in the SAME state and context:
 *
 *   - a rule is { subject, context, states }: the element it styles (the last compound, states removed), what must
 *     surround it (the selector before the last combinator), and the pseudo-classes it needs (:hover, :focus-visible...);
 *   - for each subject, each context that any of its rules names and each state set that any of its rules names (and
 *     the resting state), the rules that APPLY are those whose context is empty or that context, and whose states are
 *     all in that state set; of those, the highest specificity wins (a tie keeps both: either could);
 *   - the winning text colour is paired with the winning fill. No fill means the page: measured on every surface. A
 *     fill that is a page surface is measured on every surface too, so the check never gets looser than it was. An
 *     opaque fill is the ground. A translucent fill is laid over each surface.
 *
 * A rule bound to a theme (`[data-theme='light'] .x`, `:root:not([data-theme='light']) .x`) is read only in that theme.
 * A colour may be any value that resolves: a token, a token with a fallback (`var(--paper, #000)`), a literal, a
 * color-mix. (The first version matched `color: var(--x)` and nothing else, so a fallback was not a use at all.)
 */
import { colourOf, expandVars, splitTop } from '@studpilot/design/css-tokens';

const STATES = ['hover', 'focus-visible', 'focus-within', 'focus', 'active', 'disabled', 'checked', 'target', 'visited', 'enabled'];
// A state is a pseudo-class that decides WHEN or for WHICH INSTANCE a rule applies: the interaction states, and the structural ones
// (`:nth-child(2)`, `:first-child`), whose argument is part of the state so that `.x:nth-child(2) { background }` is the second one only.
const STATE_RE = new RegExp(`:(?:(?:nth-child|nth-last-child|nth-of-type|nth-last-of-type)\\([^)]*\\)|(?:first-child|last-child|only-child|first-of-type|last-of-type|only-of-type)|(?:${STATES.join('|')}))(?![\\w-])`, 'g');
const INHERITED = /^(?:inherit|currentcolor|initial|unset|revert|revert-layer)$/i;

/** Every rule of every style source: { selector, body }. A keyframe step and an at-rule are not rules about an element. */
export function rulesOf(styleSources) {
  return styleSources
    .flatMap((css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].split(';').pop().trim().replace(/\s+/g, ' '), body: m[2] })))
    .filter((r) => r.selector && !r.selector.startsWith('@') && !/^(?:from|to|\d+(?:\.\d+)?%)(?:\s*,\s*(?:from|to|\d+(?:\.\d+)?%))*$/i.test(r.selector));
}

/** The last declaration of one of `props` in a rule body, as its value (`!important` dropped), or null. */
function lastDecl(body, props) {
  let found = null;
  for (const m of body.matchAll(/(?:^|[;\s])([a-z-]+)\s*:\s*([^;}]+)/gi)) if (props.includes(m[1].toLowerCase())) found = m[2].replace(/!important/i, '').trim();
  return found;
}

/** Remove balanced `name( ... )` groups of the given pseudo-class names from a selector. */
function withoutGroups(selector, names) {
  let out = '';
  for (let i = 0; i < selector.length; i += 1) {
    const hit = names.find((n) => selector.startsWith(`:${n}(`, i));
    if (!hit) { out += selector[i]; continue; }
    let depth = 0;
    let j = i + hit.length + 1;
    for (; j < selector.length; j += 1) { if (selector[j] === '(') depth += 1; else if (selector[j] === ')' && --depth === 0) break; }
    i = j;
  }
  return out;
}

/** [ids, classes and attributes and pseudo-classes, types and pseudo-elements] of a whole selector part. `:where()` counts for nothing. */
export function specificityOf(part) {
  const s = withoutGroups(part, ['where']);
  const ids = (s.match(/#[\w-]+/g) ?? []).length;
  const pseudoElements = (s.match(/::[\w-]+/g) ?? []).length;
  const pseudoClasses = (s.replace(/::[\w-]+/g, '').match(/:[\w-]+/g) ?? []).filter((p) => !/^:(?:not|is|has|where)$/.test(p)).length;
  const classes = (s.match(/\.[\w-]+/g) ?? []).length + (s.match(/\[[^\]]+\]/g) ?? []).length + pseudoClasses;
  const types = (s.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~(,])[a-z][\w-]*/gi) ?? []).length + pseudoElements;
  return [ids, classes, types];
}
const compareSpec = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The last compound of a complex selector and what comes before it, split at the last combinator outside brackets and parentheses. */
function splitSubject(selector) {
  let depth = 0;
  let cut = 0;
  for (let i = 0; i < selector.length; i += 1) {
    const c = selector[i];
    if (c === '(' || c === '[') depth += 1;
    else if (c === ')' || c === ']') depth -= 1;
    else if (depth === 0 && /[\s>+~]/.test(c)) cut = i + 1;
  }
  return { context: selector.slice(0, cut).trim(), subject: selector.slice(cut).trim() };
}

/**
 * One selector part, read: { subject, context, states, theme, specificity }.
 *   subject  the element it styles with its states and :not() groups taken out and its simple selectors sorted, so
 *            `.b.a:hover` and `.a.b` name the same element
 *   context  the selector before the last combinator, without a theme switch or a leading html/:root/body
 *   states   the pseudo-classes the subject needs: :hover, :focus-visible...
 *   theme    'dark' or 'light' when the part is bound to one (`[data-theme='light'] x`, `:root:not([data-theme='light']) x`), else null
 */
export function parsePart(raw) {
  let part = raw.replace(/\s+/g, ' ').trim();
  let theme = null;
  const negated = /:not\(\[data-theme=['"]?(light|dark)['"]?\]\)/.exec(part);
  if (negated) { theme = negated[1] === 'light' ? 'dark' : 'light'; part = part.replace(negated[0], ''); }
  const switched = /\[data-theme=['"]?(light|dark)['"]?\]/.exec(part);
  if (switched) { theme = switched[1]; part = part.replace(switched[0], ''); }
  const spec = specificityOf(raw);
  let { context, subject } = splitSubject(part.trim());
  context = context.replace(/^(?:(?::root|html|body)(?![\w-])[\s>+~]*)+/i, '').replace(/\s+/g, ' ').trim();
  if (subject === '' && context !== '') { subject = context; context = ''; }
  const states = [...new Set([...subject.matchAll(STATE_RE)].map((m) => m[0].slice(1)))].sort();
  const bare = withoutGroups(subject.replace(STATE_RE, ''), ['not', 'is', 'where', 'has']);
  const simples = (bare.match(/\.[\w-]+|#[\w-]+|\[[^\]]*\]|::[\w-]+|:[\w-]+|[a-z][\w-]*|\*/gi) ?? []).sort();
  return { subject: simples.join(''), context, states, theme, specificity: spec };
}

/**
 * Every (selector part x declaration) of the sheets that sets a text colour or a fill, parsed:
 * { subject, context, states, theme, specificity, colour, fill, raw }. Pseudo-elements with no element of their own are kept as a subject
 * (`.x::before` pairs only with other `.x::before` rules).
 */
export function entriesOf(rules) {
  const out = [];
  for (const r of rules) {
    const colour = lastDecl(r.body, ['color']);
    const fill = lastDecl(r.body, ['background', 'background-color']);
    if ((colour === null || INHERITED.test(colour)) && (fill === null || /^(?:none|transparent|inherit|initial|unset)$/i.test(fill))) continue;
    for (const raw of splitTop(r.selector)) {
      if (/::(?:-moz-)?selection|::placeholder|::-webkit/.test(raw)) continue;
      out.push({
        ...parsePart(raw),
        colour: colour === null || INHERITED.test(colour) ? null : colour,
        fill: fill === null || /^(?:none|transparent|inherit|initial|unset)$/i.test(fill) ? null : fill,
        raw,
      });
    }
  }
  return out;
}

const keyOf = (xs) => xs.join('|');
/** The rules of the highest specificity among `list` (every one of them when there is a tie). */
function top(list) {
  if (!list.length) return [];
  const best = list.reduce((a, b) => (compareSpec(a.specificity, b.specificity) >= 0 ? a : b)).specificity;
  return list.filter((e) => compareSpec(e.specificity, best) === 0);
}

/**
 * The text-on-ground pairs of one theme: [{ subject, context, states, fgs: [value], fills: [value], raw: [selector] }], one per
 * (subject, context, state set) in which a text colour applies. `fills` is empty when no fill applies in that state and context.
 */
export function pairsFor(entries, mode) {
  const bySubject = new Map();
  for (const e of entries) {
    if (e.theme && e.theme !== mode) continue;
    if (!bySubject.has(e.subject)) bySubject.set(e.subject, []);
    bySubject.get(e.subject).push(e);
  }
  const out = [];
  for (const [subject, list] of bySubject) {
    const texts = list.filter((e) => e.colour !== null);
    if (!texts.length) continue;
    const fills = list.filter((e) => e.fill !== null);
    const contexts = [...new Set(['', ...list.map((e) => e.context)])];
    const stateSets = new Map([[keyOf([]), []]]);
    for (const e of list) stateSets.set(keyOf(e.states), e.states);
    const seen = new Set();
    for (const context of contexts) {
      for (const states of stateSets.values()) {
        const applies = (e) => (e.context === '' || e.context === context) && e.states.every((s) => states.includes(s));
        const fg = top(texts.filter(applies));
        if (!fg.length) continue;
        const bg = top(fills.filter(applies));
        const pair = { subject, context, states, fgs: [...new Set(fg.map((e) => e.colour))], fills: [...new Set(bg.map((e) => e.fill))], raw: [...new Set([...fg, ...bg].map((e) => e.raw))] };
        const key = keyOf([subject, context, pair.fgs.join(','), pair.fills.join(',')]);
        if (!seen.has(key)) { seen.add(key); out.push(pair); }
      }
    }
  }
  return out;
}

/**
 * The colour(s) a value can draw: one when it resolves, or, when it is mixed by a runtime-driven percentage
 * (`color-mix(in srgb, var(--ink) calc(var(--effect, 0) * 100%), var(--muted))`), its two ENDS (the property at 0 and at 1). A mix of
 * two colours moves monotonically between them, so measuring both ends measures every step. Empty when it does not resolve.
 */
export function coloursOfValue(value, lookup) {
  const one = (text) => text && (colourOf(text) ?? colourOf(splitTop(text, ' ')[0] ?? ''));
  const plain = expandVars(value, lookup);
  const direct = plain && one(plain);
  if (direct) return [{ colour: direct, sweep: 'rest' }];
  if (!/calc\(/.test(value)) return [];
  const out = [];
  for (const sweep of ['0', '1']) {
    const text = expandVars(value, (n) => lookup(n) ?? sweep);
    const folded = text && text.replace(/calc\(\s*([\d.]+)\s*\*\s*([\d.]+)(%?)\s*\)/g, (_, a, b, unit) => `${parseFloat(a) * parseFloat(b)}${unit}`);
    const c = folded && one(folded);
    if (c) out.push({ colour: c, sweep: `${sweep}` });
  }
  return out;
}

export const SURFACE_TOKEN = /^var\(--(?:paper|surface)(?:-\d)?\)$/;

/**
 * Measure one pair in one theme. `contrastOf(fgRgbaOverGroundRgb, groundRgb)` and `blend` are passed in (they are the design package's).
 * Returns { kind, ratios: [{ fg, ground, ratio }], unresolved: [string] }: kind is 'fill' when an opaque fill that is not a page surface is the ground.
 */
export function measure(pair, lookup, surfaces, { contrastRgb, blend }) {
  const unresolved = [];
  const fgs = pair.fgs.flatMap((v) => {
    const cs = coloursOfValue(v, lookup);
    if (cs.length === 0) unresolved.push(`color: ${v}`);
    return cs.map((c) => ({ v: cs.length > 1 ? `${v} (at ${c.sweep})` : v, c: c.colour }));
  });
  const colourOfValue = (v) => coloursOfValue(v, lookup)[0]?.colour ?? null;
  const grounds = [];
  let kind = 'surface';
  const everySurface = () => surfaces.map(([name, rgb]) => ({ name: `--${name}`, rgb }));
  if (pair.fills.length === 0) grounds.push(...everySurface());
  for (const v of pair.fills) {
    if (SURFACE_TOKEN.test(v)) { grounds.push(...everySurface()); continue; }
    const c = colourOfValue(v);
    if (!c) { grounds.push(...everySurface()); continue; }
    if (c[3] === 1) { grounds.push({ name: v, rgb: c.slice(0, 3) }); kind = 'fill'; }
    else grounds.push(...surfaces.map(([name, rgb]) => ({ name: `${v} over --${name}`, rgb: blend(rgb, c) })));
  }
  const ratios = [];
  for (const f of fgs) {
    if (!f.c) continue;
    for (const g of grounds) ratios.push({ fg: f.v, ground: g.name, ratio: contrastRgb(blend(g.rgb, f.c), g.rgb) });
  }
  return { kind, ratios, unresolved };
}
