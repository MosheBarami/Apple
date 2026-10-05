/**
 * The functions the rendered guards run INSIDE the page, and the arithmetic they report with.
 *
 * Test support (tests/ folder: test code for the dead-end checker). Each `inPage*` function is passed to
 * `page.evaluate`, so it is serialised: it may not close over anything in this module, and the helpers it
 * needs are declared inside it. What comes back is plain data; the contrast arithmetic happens here, in
 * Node, from the colours the browser DREW (never from a token somebody remembered).
 *
 * A colour is read through a canvas, not parsed from the string: `getComputedStyle` answers
 * `color(srgb 0.65 0.49 1 / 0.75)` or `oklab(...)` for a `color-mix()`, and a parser written for
 * `rgb()` would read those as nothing.
 */
import { contrastRgb } from '../css-tokens.mjs';

/**
 * Every element whose own box is painted with something close to one of `targets` ([r, g, b] each), with its drawn text and
 * icons; or, with `only` (a data-probe id from an earlier call), just that element in whatever state the page is in now (hovered);
 * or, with `selector` and no `targets`, every match whatever its fill (a transparent one is drawn on what is behind it).
 */
export function inPageFilledElements({ targets = null, tolerance = 0, only = null, selector = null }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    // fillStyle keeps the colour (not premultiplied) and getImageData returns it premultiplied-undone: alpha is d[3].
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  /** The colour a pixel inside `el` shows: its own background laid over its ancestors' until one is opaque. */
  const paint = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let out = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i -= 1) out = over(layers[i], out);
    return out;
  };
  const opacityBetween = (node, stop) => {
    let o = 1;
    for (let n = node; n && n !== stop; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    return o;
  };
  const visible = (el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 1 && r.height > 1;
  };
  const label = (el) => (el.getAttribute('aria-label') || el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
  const SHAPES = new Set(['path', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'rect']);

  const found = [];
  const scope = only !== null ? [document.querySelector(`[data-probe="${only}"]`)].filter(Boolean) : selector !== null ? document.querySelectorAll(selector) : document.body.querySelectorAll('*');
  for (const el of scope) {
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue;
    const cs = getComputedStyle(el);
    if (!visible(el) || Number(cs.opacity) < 0.05) continue;
    const bg = rgba(cs.backgroundColor);
    if (targets !== null && bg[3] === 0) continue;
    const fill = bg[3] === 1 ? bg : over(bg, paint(el.parentElement ?? document.documentElement));
    const hit = targets === null ? -1 : targets.findIndex((t) => [0, 1, 2].every((i) => Math.abs(t.rgb[i] - fill[i]) <= tolerance));
    if (targets !== null && hit < 0) continue;
    const foreground = [];
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let t = walker.nextNode(); t; t = walker.nextNode()) {
      if (!t.textContent.trim()) continue;
      const p = t.parentElement;
      if (!p || !visible(p)) continue;
      const o = opacityBetween(p, el);
      if (o < 0.05) continue;
      const c = rgba(getComputedStyle(p).color);
      foreground.push({ kind: 'text', what: t.textContent.trim().slice(0, 24), colour: [c[0], c[1], c[2], c[3] * o] });
    }
    for (const s of el.querySelectorAll('svg, svg *')) {
      const tag = s.tagName.toLowerCase();
      if (!SHAPES.has(tag) || !visible(s.closest('svg'))) continue;
      const ss = getComputedStyle(s);
      const o = opacityBetween(s, el);
      if (o < 0.05) continue;
      if (ss.stroke !== 'none' && parseFloat(ss.strokeWidth) > 0) {
        const c = rgba(ss.stroke);
        foreground.push({ kind: 'icon', what: tag + ' stroke', colour: [c[0], c[1], c[2], c[3] * o * Number(ss.strokeOpacity)] });
      }
      if (ss.fill !== 'none') {
        const c = rgba(ss.fill);
        foreground.push({ kind: 'icon', what: tag + ' fill', colour: [c[0], c[1], c[2], c[3] * o * Number(ss.fillOpacity)] });
      }
    }
    if (!el.hasAttribute('data-probe')) { window.__probeCount = (window.__probeCount ?? 0) + 1; el.setAttribute('data-probe', String(window.__probeCount)); }
    found.push({ id: el.getAttribute('data-probe'), tag: el.tagName.toLowerCase(), cls: (el.getAttribute('class') || '').slice(0, 50), name: label(el), fx: el.getAttribute('data-fx'), target: hit, fill, foreground });
  }
  return found;
}

/**
 * Before any key is pressed: remember what every element's border and box-shadow look like at rest, so a focus
 * indicator is what CHANGES when focus arrives (a border that is always accent is not a focus ring).
 */
export function inPageRememberRest() {
  // Nothing may hold focus while the resting look is read: an element left focused by an earlier walk would be remembered WITH its ring.
  document.activeElement?.blur();
  const rest = new WeakMap();
  for (const el of document.querySelectorAll('*')) {
    const cs = getComputedStyle(el);
    rest.set(el, { border: [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join('|'), shadow: cs.boxShadow, outline: `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}` });
  }
  window.__rest = rest;
  return document.querySelectorAll('*').length;
}

/**
 * The focus indicator the browser draws around the element that has focus now: the best of its own outline, its
 * ring-shaped box-shadow layers (no offset, no blur, a spread) and a border that changed on focus, and the same
 * three on any ancestor that reacts to the focus inside it (`:focus-within`, the composer card). Each indicator is
 * laid over the surface behind its element and measured against that surface. Returns null when nothing is focused.
 */
export function inPageFocusIndicator() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (css) => {
    g.clearRect(0, 0, 1, 1);
    g.fillStyle = '#000';
    g.fillStyle = css;
    g.fillRect(0, 0, 1, 1);
    const d = g.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, bottom) => [0, 1, 2].map((i) => top[i] * top[3] + bottom[i] * (1 - top[3])).concat(1);
  const paint = (node) => {
    const layers = [];
    for (let n = node; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] === 1) break;
    }
    let out = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i -= 1) out = over(layers[i], out);
    return out;
  };
  const lum = ([r, g2, b]) => { const f = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const label = (n) => `<${n.tagName.toLowerCase()}${n.getAttribute('data-slot') ? ` data-slot=${n.getAttribute('data-slot')}` : ''}> "${(n.getAttribute('aria-label') || n.textContent || n.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}" .${(n.getAttribute('class') || '').split(/\s+/)[0]}`;
  const indicators = [];
  const read = (node, where) => {
    const cs = getComputedStyle(node);
    const was = window.__rest?.get(node);
    const surface = paint(node.parentElement ?? document.documentElement);
    const add = (kind, css, width) => {
      const c = rgba(css);
      if (c[3] === 0) return;
      const seen = over(c, surface);
      indicators.push({ kind: `${where} ${kind}`, width, colour: css, ratio: ratio(seen, surface) });
    };
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 && `${cs.outlineStyle}|${cs.outlineWidth}|${cs.outlineColor}` !== was?.outline) add('outline', cs.outlineColor, cs.outlineWidth);
    if (cs.boxShadow !== 'none' && cs.boxShadow !== was?.shadow) {
      // Split the computed list at the commas outside parentheses.
      const layers = [];
      let depth = 0;
      let cur = '';
      for (const ch of cs.boxShadow) {
        if (ch === '(') depth += 1;
        if (ch === ')') depth -= 1;
        if (ch === ',' && depth === 0) { layers.push(cur); cur = ''; } else cur += ch;
      }
      layers.push(cur);
      for (const layer of layers) {
        const lengths = [...layer.matchAll(/(-?[\d.]+)px/g)].map((m) => parseFloat(m[1]));
        if (lengths.length < 4 || lengths[0] !== 0 || lengths[1] !== 0 || lengths[2] !== 0 || !(lengths[3] > 0)) continue;
        const colour = layer.replace(/(-?[\d.]+)px/g, ' ').replace(/\binset\b/, ' ').trim();
        add('ring', colour, `${lengths[3]}px`);
      }
    }
    const border = [cs.borderTopColor, cs.borderRightColor, cs.borderBottomColor, cs.borderLeftColor].join('|');
    if (parseFloat(cs.borderTopWidth) > 0 && border !== was?.border) add('border', cs.borderTopColor, cs.borderTopWidth);
  };
  read(el, 'own');
  let n = el.parentElement;
  for (let i = 0; n && i < 5; i += 1, n = n.parentElement) if (n.matches(':focus-within')) read(n, 'ancestor');
  const best = indicators.reduce((a, b) => (!a || b.ratio > a.ratio ? b : a), null);
  const r = el.getBoundingClientRect();
  if (!el.hasAttribute('data-fid')) { window.__fidCount = (window.__fidCount ?? 0) + 1; el.setAttribute('data-fid', String(window.__fidCount)); }
  return { id: el.getAttribute('data-fid'), who: label(el), indicators, best: best ? { kind: best.kind, ratio: best.ratio, colour: best.colour, width: best.width } : null, visible: r.width > 1 && r.height > 1 };
}

/** Every element the browser draws with a backdrop filter (a frosted pane), as readable strings. Flat means none. */
export function inPageBackdropFilters(selector = '*') {
  const out = [];
  for (const el of document.querySelectorAll(selector)) {
    const cs = getComputedStyle(el);
    const v = cs.backdropFilter || cs.webkitBackdropFilter;
    if (v && v !== 'none') out.push(`<${el.tagName.toLowerCase()} class="${(el.getAttribute('class') || '').slice(0, 60)}"> backdrop-filter: ${v}`);
  }
  return out;
}

/** The ratio of a drawn foreground ([r, g, b, a]) over a drawn fill ([r, g, b]), with the foreground's own alpha laid over the fill first. */
export function drawnRatio(fg, fill) {
  const a = fg[3];
  const seen = [0, 1, 2].map((i) => fg[i] * a + fill[i] * (1 - a));
  return contrastRgb(seen, fill.slice(0, 3));
}

/** The bar a drawn pair must clear: 4.5:1 for text (WCAG 1.4.3) and 3:1 for an icon (1.4.11). */
export const BAR = { text: 4.5, icon: 3 };

/** The failures of a list of filled elements as readable lines: { text, ratio } pairs under the bar. */
export function failuresOf(elements, where) {
  const out = [];
  for (const e of elements) {
    for (const f of e.foreground) {
      const ratio = drawnRatio(f.colour, e.fill);
      if (ratio < BAR[f.kind]) out.push(`${where} <${e.tag} class="${e.cls}"> "${e.name}": ${f.kind} ${f.what} is ${ratio.toFixed(2)}:1 on the fill (needs ${BAR[f.kind]}), drawn rgb(${f.colour.slice(0, 3).map(Math.round).join(', ')}) on rgb(${e.fill.slice(0, 3).map(Math.round).join(', ')})`);
    }
  }
  return out;
}
