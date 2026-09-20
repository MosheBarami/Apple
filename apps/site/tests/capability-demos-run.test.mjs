/**
 * THE FOUR CAPABILITY STAGES ACTUALLY RESPOND.
 *
 * WHY THIS FILE EXISTS, and it is the same reason as `horizon-runs.test.mjs` and
 * `flow-field-runs.test.mjs`. The flow field shipped to production having found its <canvas> with
 * `document.currentScript`. Astro hoists a page's <script> into a bundled `<script type="module">`
 * and `currentScript` is null in every module script by specification, so the expression resolved
 * to undefined, the guard refused, and NOTHING RAN. The element was in the served HTML. The class
 * was in the served HTML. The bundle was in the served HTML. Every one of those observations was
 * true and every one of them was consistent with a page that had not moved a pixel.
 *
 * The section this file covers is four things a reader is invited to press. Reading the markup
 * cannot tell a live control from a dead one, and reading the script cannot either — the failure
 * above is invisible in both. So this harness EXECUTES index.astro's client script against a
 * recording DOM and then presses the controls, and asserts what comes back out.
 *
 * WHAT IT PINS, AND WHAT IT REFUSES TO PIN. It pins PROPERTIES:
 *
 *   - reading a node prints that node's read and moves the write gate
 *   - the gate opens on the third read and not before
 *   - selecting a defect turns exactly one marker on
 *   - the third ask produces the refusal, marked as refused
 *   - the mesh strokes lines into a real 2D context
 *   - the still frame is removed only AFTER a frame has been drawn
 *
 * It pins no call spelling and no argument list. §2 of the working rules: eight guards in one
 * session went red because the code under them improved, every one of them pinned to an
 * expression. `select(id)` gaining a second argument, or `safely` gaining a name, must not turn
 * this red.
 *
 * THE HARNESS BUILDS THE DOM, SO THE HARNESS COULD DRIFT FROM THE PAGE. That is the one way a file
 * like this quietly stops checking anything: the markup renames `.rd-node` to `.rd-item`, the
 * script follows it, and a harness still serving `.rd-node` keeps passing over a script that can no
 * longer find anything on the real page. The last test in this file closes that hole — every hook
 * the harness serves has to be present in index.astro's own markup, with comments and the
 * frontmatter fence stripped first, because a scanner that reads prose finds the ACCOUNT of an
 * element before the element.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE = join(SITE, 'src', 'pages', 'index.astro');
const SOURCE = readFileSync(PAGE, 'utf8');

/** Everything below the frontmatter fence. */
const BODY = SOURCE.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/** The same, with every comment removed as well: for locating markup, never for running code. */
const MARKUP = BODY
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The page's client script, exactly as Astro will hand it to a browser. */
function clientScript() {
  const blocks = [...BODY.matchAll(/<script(?![^>]*\bis:inline\b)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const hit = blocks.find((b) => /data-demo/.test(b));
  assert.ok(hit, 'index.astro has no client <script> that reaches the capability stages');
  assert.ok(hit.trim().length > 400, 'the extracted script is too small to be the four stages');
  return hit;
}

/* ------------------------------------------------------------------ a DOM small enough to read --- */

/**
 * The selector language this harness understands: `.a`, `tag.a`, `[data-x="y"]`, and a descendant
 * chain of those. Anything else THROWS rather than returning null, because a selector this cannot
 * parse must not be reported as an element that is not there — that is the failure-to-observe
 * shape, and it is what this whole file exists to prevent.
 */
function parseCompound(part) {
  const m = /^([a-zA-Z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/.exec(part);
  if (!m) throw new Error(`the harness cannot parse the selector part: ${part}`);
  const attrs = [...(m[3] ?? '').matchAll(/\[([\w-]+)(?:=["']([^"']*)["'])?\]/g)].map((a) => [a[1], a[2]]);
  return { tag: m[1] ?? null, classes: (m[2] ?? '').split('.').filter(Boolean), attrs };
}

class El {
  constructor(tag, attrs = {}) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
    this.textContent = '';
    this.style = { setProperty() {} };
    const cls = new Set(String(attrs.class ?? '').split(/\s+/).filter(Boolean));
    const owner = this;
    this.classList = {
      add: (c) => cls.add(c),
      remove: (c) => cls.delete(c),
      contains: (c) => cls.has(c),
      toggle: (c, on) => { if (on === undefined) { cls.has(c) ? cls.delete(c) : cls.add(c); } else if (on) cls.add(c); else cls.delete(c); return cls.has(c); },
    };
    this._classes = cls;
    this.append = (...kids) => { for (const k of kids) { k.parent = owner; owner.children.push(k); } return owner; };
  }

  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); if (name === 'class') { this._classes.clear(); for (const c of String(value).split(/\s+/).filter(Boolean)) this._classes.add(c); } }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); }
  dispatch(type, event = {}) { for (const fn of this.listeners.get(type) ?? []) fn(event); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); this.parent = null; }
  getBoundingClientRect() { return { width: 460, height: 190, left: 0, top: 0 }; }
  setPointerCapture() {}

  get descendants() {
    const out = [];
    const walk = (n) => { for (const k of n.children) { out.push(k); walk(k); } };
    walk(this);
    return out;
  }

  matches(compound) {
    const { tag, classes, attrs } = parseCompound(compound);
    if (tag && tag !== this.tag) return false;
    if (!classes.every((c) => this._classes.has(c))) return false;
    return attrs.every(([k, v]) => (v === undefined ? this.attrs.has(k) : this.getAttribute(k) === v));
  }

  querySelectorAll(selector) {
    const parts = selector.trim().split(/\s+/);
    let pool = this.descendants;
    for (let i = 0; i < parts.length; i += 1) {
      const compound = parts[i];
      if (i === parts.length - 1) return pool.filter((n) => n.matches(compound));
      const next = [];
      for (const n of pool) if (n.matches(compound)) next.push(...n.descendants);
      pool = [...new Set(next)];
    }
    return [];
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
}

class HTMLCanvasElement extends El {
  constructor(attrs = {}) {
    super('canvas', attrs);
    this.width = 0;
    this.height = 0;
    this.strokes = 0;
    this.contextRefused = false;
  }

  getContext(kind) {
    if (this.contextRefused || kind !== '2d') return null;
    const canvas = this;
    return {
      canvas,
      globalAlpha: 1, lineWidth: 1, strokeStyle: '', lineCap: '', lineJoin: '',
      setTransform() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
      stroke() { canvas.strokes += 1; },
    };
  }
}

/** The page's four stages, as the harness serves them. Kept honest by the last test in this file. */
function page({ refuseContext = false, reduced = false, small = false } = {}) {
  const node = (path, kids, depth) => new El('button', { class: 'rd-node', 'data-path': path, 'data-kids': String(kids), 'aria-pressed': 'false' });
  const tree = new El('article', { class: 'demo', 'data-demo': 'tree' }).append(
    new El('ul', { class: 'rd-tree' }).append(
      node('Workspace', 2), node('Baseplate', 0), node('SpawnLocation', 1),
      node('ServerScriptService', 1), node('Main', 0), node('ReplicatedStorage', 0),
    ),
    new El('p', { class: 'rd-log' }),
    new El('p', { class: 'rd-gate', 'data-read': '0' }),
  );

  const mark = (id) => new El('button', { class: 'cw-mark', 'data-defect': id });
  const item = (id) => new El('button', { class: 'cw-defect', 'data-defect': id, 'aria-pressed': 'false' });
  const eye = new El('article', { class: 'demo', 'data-demo': 'eye' }).append(
    new El('div', { class: 'cw-render' }).append(mark('d1'), mark('d2'), mark('d3')),
    new El('ul', { class: 'cw-defects' }).append(item('d1'), item('d2'), item('d3')),
  );

  const ask = (n, lines, refused) => new El('button', {
    class: 'lu-ask', 'data-ask': String(n), 'data-lines': lines,
    'data-refused': refused ? 'true' : 'false', 'aria-pressed': n === 0 ? 'true' : 'false',
  });
  const out = new El('pre', { class: 'lu-out' });
  const code = new El('code');
  code.textContent = 'local Players = game:GetService("Players")';
  out.append(code);
  const lu = new El('article', { class: 'demo', 'data-demo': 'code' }).append(
    new El('div', { class: 'lu-asks' }).append(
      ask(0, 'local Players = game:GetService("Players")', false),
      ask(1, 'local store = DataStoreService:GetDataStore("Purchases")', false),
      ask(2, 'refused  edit_script\n\n  Nothing was written.', true),
    ),
    out,
  );

  const canvas = new HTMLCanvasElement({ class: 'gm-canvas' });
  canvas.contextRefused = refuseContext;
  const fallback = new El('svg', { class: 'gm-still' });
  const gm = new El('article', { class: 'demo', 'data-demo': 'cube' }).append(canvas, fallback);

  const root = new El('html');
  const body = new El('body').append(tree, eye, lu, gm);
  root.append(body);

  const frames = [];
  const document = {
    documentElement: root,
    hidden: false,
    listeners: new Map(),
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); },
  };
  const errors = [];
  const window = {
    devicePixelRatio: 2,
    matchMedia: (q) => ({ matches: /reduced-motion/.test(q) ? reduced : small, media: q, addEventListener() {} }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    addEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '#00d492' }),
  };

  return { root, body, tree, eye, lu, gm, canvas, fallback, out, code, document, window, frames, errors, HTMLCanvasElement };
}

/** Run the real client script against a freshly built page. */
function run(opts = {}) {
  const p = page(opts);
  const sandbox = {
    document: p.document,
    window: p.window,
    HTMLCanvasElement: p.HTMLCanvasElement,
    getComputedStyle: p.window.getComputedStyle,
    console: { error: (...a) => p.errors.push(a.map(String).join(' ')) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(clientScript(), sandbox, { filename: 'index.astro:client' });
  return p;
}

/* ----------------------------------------------------------------------------------- the tests --- */

test('the harness runs the real script and every stage is wired, so nothing below is vacuous', () => {
  const p = run();
  assert.deepEqual(p.errors, [], 'a stage threw during set-up');
  for (const hook of ['.rd-node', '.cw-mark', '.cw-defect', '.lu-ask']) {
    const found = p.root.querySelectorAll(hook);
    assert.ok(found.length >= 3, `${hook}: the harness served ${found.length} — there is nothing to press`);
    assert.ok(found.some((el) => el.listeners.size > 0), `${hook} got no listener — the script never reached it`);
  }
});

test('reading a node prints that node, and the write gate opens on the third read and not before', () => {
  const p = run();
  const nodes = p.root.querySelectorAll('.rd-node');
  const log = p.root.querySelector('.rd-log');
  const gate = p.root.querySelector('.rd-gate');

  nodes[3].dispatch('click');                       // ServerScriptService, 1 child
  assert.match(log.textContent, /ServerScriptService/, 'the log does not name the node that was read');
  assert.match(log.textContent, /\b1\b/, 'the log does not report what the read found');
  assert.equal(gate.getAttribute('data-read'), '1');

  // The same node twice is ONE read. A gate that counts clicks rather than nodes opens on one
  // node pressed three times, which is not the property the stage is claiming.
  nodes[3].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '1', 'the same node counted twice');

  nodes[0].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '2');
  assert.doesNotMatch(gate.textContent, /checkpoint/i, 'the gate opened before the third read');

  nodes[5].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '3');
  assert.match(gate.textContent, /checkpoint/i, 'the gate did not open on the third read');
});

test('selecting a defect turns exactly one marker on, from either the render or the list', () => {
  const p = run();
  const marks = p.root.querySelectorAll('.cw-mark');
  const items = p.root.querySelectorAll('.cw-defect');

  items[1].dispatch('click');
  assert.deepEqual(marks.map((m) => m.classList.contains('is-on')), [false, true, false]);
  assert.deepEqual(items.map((b) => b.getAttribute('aria-pressed')), ['false', 'true', 'false']);

  // Pressing the marker in the render selects the same defect as its line in the list. They carry
  // one identifier between them; nothing here does index arithmetic.
  marks[2].dispatch('click');
  assert.deepEqual(marks.map((m) => m.classList.contains('is-on')), [false, false, true]);
  assert.deepEqual(items.map((b) => b.getAttribute('aria-pressed')), ['false', 'false', 'true']);
});

test('the third ask produces the refusal, and it is marked as one', () => {
  const p = run();
  const asks = p.root.querySelectorAll('.lu-ask');

  asks[1].dispatch('click');
  assert.match(p.code.textContent, /DataStore/, 'the panel does not show the ask that was pressed');
  assert.equal(p.out.classList.contains('refused'), false);
  assert.deepEqual(asks.map((a) => a.getAttribute('aria-pressed')), ['false', 'true', 'false']);

  asks[2].dispatch('click');
  assert.match(p.code.textContent, /refused/, 'the refusing ask did not produce a refusal');
  assert.equal(p.out.classList.contains('refused'), true, 'the refusal is not marked, so it reads as ordinary output');

  // And it goes back. A stage that can only be broken is a stage a reader leaves broken.
  asks[0].dispatch('click');
  assert.equal(p.out.classList.contains('refused'), false);
});

test('the mesh strokes real lines, and the still frame goes only after one is drawn', () => {
  const p = run();
  assert.ok(p.canvas.strokes >= 12, `the mesh drew ${p.canvas.strokes} lines; a cube with a roof is sixteen edges`);
  assert.ok(p.canvas.width > 0 && p.canvas.height > 0, 'the canvas was never given a backing size');
  assert.equal(p.fallback.parent, null, 'the still frame is still in the page after a frame was drawn');
});

test('a refused 2D context leaves the still frame in place rather than an empty panel', () => {
  const p = run({ refuseContext: true });
  assert.deepEqual(p.errors, [], 'a refused context should be handled, not thrown over');
  assert.equal(p.canvas.strokes, 0);
  assert.ok(p.fallback.parent, 'the still frame was removed although nothing was ever drawn');
});

test('reduced motion and a phone both stop the spin and neither stops the drag', () => {
  for (const [label, opts] of [['reduced motion', { reduced: true }], ['a phone', { small: true }]]) {
    const p = run(opts);
    assert.ok(p.canvas.strokes >= 12, `${label}: the mesh was not drawn at all`);
    assert.equal(p.frames.length, 0, `${label}: the loop started anyway`);

    // The drag still turns it: a pointerdown then a move repaints, with no loop running.
    const before = p.canvas.strokes;
    p.canvas.dispatch('pointerdown', { clientX: 10, clientY: 10, pointerId: 1 });
    p.canvas.dispatch('pointermove', { clientX: 40, clientY: 18, pointerId: 1 });
    assert.ok(p.canvas.strokes > before, `${label}: dragging the mesh redrew nothing`);
  }

  // And with neither, it does run. Without this the two assertions above are satisfied by a mesh
  // that never spins under any condition, which is a different bug wearing the same green.
  const p = run();
  assert.ok(p.frames.length > 0, 'the loop never started on a desktop with motion allowed');
});

test('one stage cannot take the other three down with it', () => {
  /* ONE STAGE IS MADE TO THROW, NOT MADE TO GIVE UP. The first draft of this test removed the
     tree's `.rd-log` and asserted the other three still worked — and it passed with the try/catch
     DELETED, because a missing log is exactly the case the tree's own `if (!log ...) return;`
     already handles. It was green for a reason that had nothing to do with the property. A stage
     that declines is not a stage that crashes, and only the second one can take its neighbours
     with it. So one node's addEventListener throws: a real TypeError, raised inside the first
     set-up, with the remaining three still to be built. */
  const p = page();
  const hostile = p.root.querySelector('.rd-node');
  hostile.addEventListener = () => { throw new TypeError('hostile node'); };
  const sandbox = {
    document: p.document, window: p.window, HTMLCanvasElement: p.HTMLCanvasElement,
    getComputedStyle: p.window.getComputedStyle,
    console: { error: (...a) => p.errors.push(a.map(String).join(' ')) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  // The throw must not escape the module. Asserted rather than merely performed, so that the red
  // says what went wrong instead of printing a bare TypeError from inside a vm.
  assert.doesNotThrow(
    () => vm.runInContext(clientScript(), sandbox, { filename: 'index.astro:client' }),
    'a throw inside one stage escaped the whole script, so the other three were never built',
  );

  assert.equal(p.errors.length, 1, 'the throw was not caught and reported');
  const asks = p.root.querySelectorAll('.lu-ask');
  asks[2].dispatch('click');
  assert.equal(p.out.classList.contains('refused'), true, 'the Luau stage died with the tree stage');
  assert.ok(p.canvas.strokes >= 12, 'the mesh died with the tree stage');
});

test('every hook this harness serves is a hook the page actually renders', () => {
  // The hole this closes: rename `.rd-node` in the markup, follow it in the script, and a harness
  // still serving `.rd-node` keeps passing over a script that can no longer find anything.
  const hooks = [
    'rd-node', 'rd-log', 'rd-gate', 'rd-tree',
    'cw-mark', 'cw-defect', 'cw-render', 'cw-defects',
    'lu-ask', 'lu-asks', 'lu-out',
    'gm-canvas', 'gm-still',
  ];
  for (const hook of hooks) {
    assert.ok(
      new RegExp(`class="[^"]*\\b${hook}\\b`).test(MARKUP),
      `the harness serves .${hook} and index.astro renders no such element — this file is checking a page that does not exist`,
    );
  }
  for (const demo of ['tree', 'eye', 'code', 'cube']) {
    assert.ok(MARKUP.includes(`c.demo === '${demo}'`), `the page renders no stage for data-demo="${demo}"`);
  }
  // The attributes the script reads off the markup rather than off its own constants.
  for (const attr of ['data-path', 'data-kids', 'data-defect', 'data-lines', 'data-refused']) {
    assert.ok(MARKUP.includes(attr), `the page writes no ${attr}, so the script reads nothing`);
  }
});
