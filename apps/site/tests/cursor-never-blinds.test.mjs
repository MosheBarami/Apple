/**
 * THE CUSTOM CURSOR CANNOT LEAVE A READER WITH NO POINTER.
 *
 * `cursor: none` is how a custom cursor replaces the real one. It is page-wide, it is an
 * instruction to the operating system, and nothing on screen explains it. Written as a static rule
 * it turns EVERY failure of the component that draws the replacement into a site where the reader
 * cannot see what they are aiming at: a bundle that 404s, a throw before the first frame, a browser
 * that refuses the module, a reader with scripting off.
 *
 * That is not hypothetical here. A hero effect shipped to production on this site whose script
 * never executed, while the element, the class and the bundle were all present in the served HTML
 * and every reading of that HTML said the feature was there.
 *
 * So the whole design rests on one property: `cursor: none` is reachable ONLY under a class that
 * the script adds, and the script adds it only from inside a frame it has already painted. This
 * file asserts that property two ways, because either one alone can be satisfied by a page that
 * still blinds somebody:
 *
 *   1. STATICALLY, over every stylesheet and every component <style> the site ships — not over the
 *      one file somebody remembered. A second `cursor: none` added anywhere else, by anyone, is the
 *      defect, and a check that only reads Cursor.astro would never see it.
 *   2. BY RUNNING THE REAL SCRIPT. A rule that is correctly scoped is worth nothing if the script
 *      adds the class before it draws, or adds it on a phone, or leaves it behind when the reader
 *      turns motion down. The class must not exist until a frame has been painted.
 *
 * WHAT IT PINS. Properties. It does not pin `has-cursor` as a spelling: the class name is read out
 * of the component's own stylesheet and then looked for in what the script does, so renaming it in
 * both places keeps this green and renaming it in one turns it red. That is the actual risk.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');
const COMPONENT = join(SRC, 'components', 'Cursor.astro');
const SOURCE = readFileSync(COMPONENT, 'utf8');

/** Everything below the frontmatter fence: the frontmatter is prose ABOUT `cursor: none`. */
const BODY = SOURCE.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/** Strip comments before looking for a declaration. Four scanners in this repo have needed this:
    the better a defect is documented, the more a prose-reading scanner finds its own explanation. */
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* ------------------------------------------------------------------ every sheet the site ships --- */

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

/**
 * Every piece of CSS this site serves: the stylesheets, and every `<style>` inside a component, a
 * layout or a page. DERIVED from the directory rather than listed — a hand-written list is a
 * denominator that silently stops growing, and this repository has been bitten by three of them.
 */
function sheets() {
  const out = [];
  for (const file of walk(SRC)) {
    if (file.endsWith('.css')) {
      out.push({ file, css: readFileSync(file, 'utf8') });
      continue;
    }
    if (!file.endsWith('.astro')) continue;
    const src = readFileSync(file, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
    for (const m of src.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)) out.push({ file, css: m[1] });
  }
  return out;
}

/** `sel { … }` pairs, flat. Good enough: no sheet here nests a rule inside a rule. */
function rules(css) {
  const out = [];
  for (const m of strip(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    out.push({ selector: m[1].trim(), body: m[2] });
  }
  return out;
}

/** The class the component's own stylesheet scopes `cursor: none` to. Read, never typed twice. */
function guardClass() {
  const hits = rules(BODY)
    .filter((r) => /(?:^|[;\s])cursor\s*:\s*none/i.test(r.body))
    .flatMap((r) => r.selector.split(',').map((s) => s.trim()));
  assert.ok(hits.length, 'Cursor.astro declares no `cursor: none` at all — there is nothing to guard');
  const classes = hits.map((sel) => (/:root\.([\w-]+)/.exec(sel) ?? [])[1]).filter(Boolean);
  assert.ok(classes.length, `every \`cursor: none\` selector must be scoped to a :root class; got ${hits.join(' | ')}`);
  assert.equal(new Set(classes).size, 1, `two different guard classes are in play: ${[...new Set(classes)].join(', ')}`);
  return classes[0];
}

/* ---------------------------------------------------------------------- the script, type-free --- */

const ESBUILD = join(SITE, '..', 'worker', 'node_modules', '.bin', 'esbuild');

function clientScript() {
  const m = /<script(?![^>]*\bis:inline\b)[^>]*>([\s\S]*?)<\/script>/i.exec(BODY);
  assert.ok(m, 'Cursor.astro has no client <script> — there is nothing to run');
  const code = m[1];
  assert.ok(code.trim().length > 400, 'the extracted script is too small to be the cursor');
  // Astro compiles a component script as TypeScript and this one carries real annotations, which a
  // `vm` cannot parse. Stripped with the same esbuild binary reveal-cannot-hide-content.test.mjs
  // already uses, so what runs below is the code the browser gets rather than a paraphrase.
  const dir = mkdtempSync(join(tmpdir(), 'cursor-'));
  const src = join(dir, 'cursor.ts');
  writeFileSync(src, code);
  try {
    return execFileSync(ESBUILD, [src, '--loader:.ts=ts', '--format=esm', '--target=es2022'],
      { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err) {
    return assert.fail(`could not strip types from the cursor script: ${err.message}`);
  }
}

/* ----------------------------------------------------------------------- a DOM small enough to read --- */

class El {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.textContent = '';
    this.style = {};
    const cls = new Set(String(attrs.class ?? '').split(/\s+/).filter(Boolean));
    this._classes = cls;
    this.classList = {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on) cls.add(c); else cls.delete(c); },
    };
  }

  append(...kids) { for (const k of kids) { k.parent = this; this.children.push(k); } return this; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(fn); }
  getBoundingClientRect() { return { left: 100, top: 100, width: 80, height: 40 }; }

  get descendants() { const o = []; const w = (n) => { for (const k of n.children) { o.push(k); w(k); } }; w(this); return o; }

  matches(sel) {
    for (const part of sel.split(',').map((s) => s.trim())) {
      const cls = [...part.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
      const at = [...part.matchAll(/\[([\w-]+)(?:=["']([^"']*)["'])?\]/g)];
      const tag = (/^([a-zA-Z][\w-]*)/.exec(part) ?? [])[1];
      if (tag && tag !== this.tag) continue;
      if (!cls.every((c) => this._classes.has(c))) continue;
      if (!at.every(([, k, v]) => (v === undefined ? this.attrs.has(k) : this.getAttribute(k) === v))) continue;
      return true;
    }
    return false;
  }

  closest(sel) { let n = this; while (n) { if (n.matches(sel)) return n; n = n.parent; } return null; }
  querySelector(sel) { return this.descendants.find((n) => n.matches(sel)) ?? null; }
}

/** The site, as far as the cursor is concerned, plus the switches this file needs to flip. */
function world({ fine = true, reduced = false } = {}) {
  const ring = new El('div', { class: 'cursor-ring' });
  const label = new El('span', { class: 'cursor-label' });
  ring.append(label);
  const dot = new El('div', { class: 'cursor-dot' });
  const overlay = new El('div', { class: 'cursor' }).append(ring, dot);

  const link = new El('a', { class: 'pill', href: '/app' });
  const field = new El('textarea', {});
  const handle = new El('canvas', { class: 'gm-canvas', 'data-cursor': 'drag', 'data-cursor-label': 'turn' });
  const plain = new El('p', {});

  const html = new El('html');
  html.append(new El('body').append(overlay, link, field, handle, plain));

  const media = new Map();
  const frames = [];
  const docListeners = new Map();

  const document = {
    documentElement: html,
    hidden: false,
    querySelector: (s) => html.querySelector(s),
    addEventListener(t, fn) { if (!docListeners.has(t)) docListeners.set(t, []); docListeners.get(t).push(fn); },
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 860,
    matchMedia: (q) => {
      const mq = { media: q, matches: /reduced-motion/.test(q) ? reduced : fine, listeners: [], addEventListener(t, fn) { this.listeners.push(fn); } };
      media.set(q, mq);
      return mq;
    },
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    addEventListener() {},
  };

  const fire = (type, event) => { for (const fn of docListeners.get(type) ?? []) fn(event); };
  const tick = (n = 1) => {
    for (let i = 0; i < n; i += 1) {
      const fn = frames.shift();
      if (!fn) return;
      fn();
    }
  };
  const flip = (matcher, value) => {
    for (const [q, mq] of media) if (matcher.test(q)) { mq.matches = value; for (const fn of mq.listeners) fn(); }
  };

  return { html, overlay, ring, dot, label, link, field, handle, plain, document, window, frames, fire, tick, flip };
}

function run(opts = {}) {
  const w = world(opts);
  const sandbox = {
    document: w.document,
    window: w.window,
    HTMLElement: El,
    Element: El,
    console: { error() {} },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(clientScript(), sandbox, { filename: 'Cursor.astro:client' });
  return w;
}

/* ----------------------------------------------------------------------------------- the tests --- */

test('the harness found a real component, a real guard class and a runnable script', () => {
  const guard = guardClass();
  assert.match(guard, /^[\w-]+$/);
  const all = sheets();
  assert.ok(all.length >= 6, `only ${all.length} sheets found under src — the walk has drifted`);
  assert.ok(all.some((s) => /cursor\s*:\s*none/i.test(strip(s.css))), 'no sheet declares `cursor: none`');
  assert.ok(clientScript().includes('requestAnimationFrame'), 'the extracted script has no frame loop');
});

test('NO STYLESHEET ON THIS SITE HIDES THE POINTER OUTSIDE THE GUARD CLASS', () => {
  const guard = guardClass();
  const bad = [];
  for (const { file, css } of sheets()) {
    for (const rule of rules(css)) {
      if (!/(?:^|[;\s])cursor\s*:\s*none/i.test(rule.body)) continue;
      for (const sel of rule.selector.split(',').map((s) => s.trim())) {
        // An at-rule preamble (`@media …`) is not a selector; the rules inside it were captured
        // separately by the flat pass above, so skipping it here loses nothing.
        if (sel.startsWith('@')) continue;
        if (!sel.includes(`.${guard}`)) bad.push(`${relative(SITE, file)}: ${sel}`);
      }
    }
  }
  assert.deepEqual(bad, [],
    'these rules hide the native pointer without requiring the custom one to be running, so a ' +
    `script that never runs leaves the reader with no pointer at all:\n  ${bad.join('\n  ')}`);
});

test('the guard class does not exist until a frame has actually been painted', () => {
  const guard = guardClass();
  const w = run();
  assert.equal(w.html.classList.contains(guard), false,
    'the pointer was hidden before anything was drawn — a throw in the first frame now blinds the reader');
  assert.ok(w.frames.length > 0, 'no frame was ever scheduled, so nothing would draw');
  w.tick();
  assert.equal(w.html.classList.contains(guard), true, 'a frame was painted and the pointer was never hidden');
});

test('a coarse pointer and reduced motion each keep the native cursor, before and after load', () => {
  const guard = guardClass();

  for (const [label, opts] of [['a coarse pointer', { fine: false }], ['reduced motion', { reduced: true }]]) {
    const w = run(opts);
    assert.equal(w.frames.length, 0, `${label}: the loop started anyway`);
    w.tick(3);
    assert.equal(w.html.classList.contains(guard), false, `${label}: the native pointer was hidden`);
  }

  // AND THE SETTING CHANGES AFTER LOAD, which is the case a one-shot check at start-up misses: a
  // reader turning motion down, or a trackpad being unplugged from a tablet.
  const w = run();
  w.tick();
  assert.equal(w.html.classList.contains(guard), true);
  w.flip(/reduced-motion/, true);
  assert.equal(w.html.classList.contains(guard), false,
    'motion was turned down and the pointer stayed hidden with a loop that had stopped');
});

test('the state follows what the pointer is over, from the tag or from data-cursor', () => {
  const w = run();
  w.tick();

  w.fire('pointerover', { target: w.plain });
  assert.equal(w.overlay.getAttribute('data-state'), null, 'ordinary page copy got a control state');

  w.fire('pointerover', { target: w.link });
  assert.equal(w.overlay.getAttribute('data-state'), 'link', 'an <a> did not read as a control');

  w.fire('pointerover', { target: w.field });
  assert.equal(w.overlay.getAttribute('data-state'), 'text', 'a text field did not read as text');

  // `data-cursor` is the override, for the cases a tag cannot express: a <canvas> you drag.
  w.fire('pointerover', { target: w.handle });
  assert.equal(w.overlay.getAttribute('data-state'), 'drag');
  assert.equal(w.label.textContent, 'turn', 'the drag state carries no label');

  // And it goes back, rather than latching on the last interesting thing the pointer crossed.
  w.fire('pointerover', { target: w.plain });
  assert.equal(w.overlay.getAttribute('data-state'), null,
    'the state latched: leaving a control left the cursor still shaped like one');
  assert.equal(w.label.textContent, '', 'the label latched on a control the pointer has left');
});

test('the dot is exactly under the pointer and the ring is not', () => {
  const w = run();
  w.fire('pointermove', { clientX: 400, clientY: 300, pointerType: 'mouse' });
  w.tick();
  const at = (el) => (/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/.exec(el.style.transform) ?? []).slice(1).map(Number);
  const [dx, dy] = at(w.dot);
  const [rx, ry] = at(w.ring);
  assert.deepEqual([dx, dy], [400, 300], 'the dot is not where the pointer is, so the cursor lies about where a click lands');
  assert.ok(Math.hypot(rx - dx, ry - dy) > 1, 'the ring is exactly on the dot, so it has no physics at all');

  // …and it catches up rather than trailing forever.
  w.tick(40);
  const [rx2, ry2] = at(w.ring);
  assert.ok(Math.hypot(rx2 - dx, ry2 - dy) < 1, 'the ring never settles on the pointer');
});

test('the overlay is inert: it is aria-hidden and takes no pointer events', () => {
  assert.match(BODY, /class="cursor"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*class="cursor"/,
    'the cursor overlay is not aria-hidden, so a screen reader is told about a picture of a mouse');
  // EVERY rule for `.cursor`, not the first one found. The component declares three — the base
  // rule and two `display: none` fallbacks inside @media blocks — and a `find` returned whichever
  // the flat parse reached first, then reported the overlay as hittable because that one happened
  // not to mention pointer-events. That is a failure to observe rendered as an observation, in the
  // file whose whole subject is not doing that.
  const forOverlay = rules(BODY).filter((r) => r.selector.split(',').some((x) => x.trim().endsWith('.cursor')));
  assert.ok(forOverlay.length, 'no rule for .cursor at all');
  assert.ok(
    forOverlay.some((r) => /pointer-events\s*:\s*none/.test(r.body)),
    'no rule makes the overlay inert, so it is the hover target for every control on the site',
  );
});
