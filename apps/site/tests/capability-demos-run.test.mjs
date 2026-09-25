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
 *   - exactly one stage is shown at a time, and a tab click or an arrow key moves it
 *   - the Autonomous toggle's state is its own aria-pressed, off at rest
 *   - no STAGE runs an animation-frame loop (RESTATED 2026-09-22: the spinning wireframe mesh,
 *     and the two tests that proved it drew, went with the calm redesign). RESTATED AGAIN
 *     2026-09-23: the owner then picked canvas grounds and a particle wordmark for the front page
 *     on purpose, so "the page ships no canvas" became "the page's own script draws nothing, and
 *     every canvas it does carry belongs to a pick that is decoration (aria-hidden), stops under
 *     reduced motion, sleeps off screen, and cannot shift the layout". Those loops are EXECUTED in
 *     picks-landing.test.mjs; this file checks the page keeps them in that shape
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
  assert.ok(hit.trim().length > 400, 'the extracted script is too small to be the three stages and their tabs');
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
  get id() { return this.getAttribute('id') ?? ''; }
  removeAttribute(name) { this.attrs.delete(name); }
  hasAttribute(name) { return this.attrs.has(name); }
  focus() { this.focused = true; }
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

/** The page's three stages, their tabs and the Autonomous toggle, as the harness serves them. Kept
    honest by the last test in this file. */
function page() {
  const node = (path, kids) => new El('button', { class: 'rd-node', 'data-path': path, 'data-kids': String(kids), 'aria-pressed': 'false' });
  const stage = (demo) => new El('div', { class: 'demo-stage', role: 'tabpanel', id: `stage-${demo}`, 'data-demo': demo });
  const tab = (demo, on) => new El('button', {
    class: 'stage-tab', role: 'tab', id: `tab-${demo}`, 'aria-controls': `stage-${demo}`,
    'aria-selected': on ? 'true' : 'false', tabindex: on ? '0' : '-1', 'data-tab': demo,
  });
  const tabs = new El('div', { class: 'stage-tabs', role: 'tablist' }).append(tab('tree', true), tab('eye', false), tab('code', false));

  const tree = stage('tree').append(
    new El('ul', { class: 'rd-tree' }).append(
      node('Workspace', 2), node('Baseplate', 0), node('SpawnLocation', 1),
      node('ServerScriptService', 1), node('Main', 0), node('ReplicatedStorage', 0),
    ),
    new El('p', { class: 'rd-log' }),
    new El('p', { class: 'rd-gate', 'data-read': '0' }),
  );

  const mark = (id) => new El('button', { class: 'cw-mark', 'data-defect': id });
  const item = (id) => new El('button', { class: 'cw-defect', 'data-defect': id, 'aria-pressed': 'false' });
  const eye = stage('eye').append(
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
  const lu = stage('code').append(
    new El('div', { class: 'lu-asks' }).append(
      ask(0, 'local Players = game:GetService("Players")', false),
      ask(1, 'local store = DataStoreService:GetDataStore("Purchases")', false),
      ask(2, 'refused  edit_script\n\n  Nothing was written.', true),
    ),
    out,
  );

  const auto = new El('button', { class: 'auto-toggle', 'data-mode': 'autonomous', 'aria-pressed': 'false' });

  const root = new El('html');
  const body = new El('body').append(new El('div', { class: 'demos' }).append(tabs, tree, eye, lu), auto);
  root.append(body);

  const frames = [];
  const document = {
    documentElement: root,
    hidden: false,
    listeners: new Map(),
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    getElementById: (id) => root.descendants.find((n) => n.getAttribute('id') === id) ?? null,
    addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(fn); },
  };
  const errors = [];
  const window = {
    devicePixelRatio: 2,
    matchMedia: (q) => ({ matches: false, media: q, addEventListener() {} }),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
    addEventListener() {},
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
  };

  return { root, body, tabs, tree, eye, lu, auto, out, code, document, window, frames, errors };
}

/** Run the real client script against a freshly built page. */
function run(opts = {}) {
  const p = page(opts);
  const sandbox = {
    document: p.document,
    window: p.window,
    requestAnimationFrame: p.window.requestAnimationFrame,
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
  for (const hook of ['.stage-tab', '.rd-node', '.cw-mark', '.cw-defect', '.lu-ask']) {
    const found = p.root.querySelectorAll(hook);
    assert.ok(found.length >= 3, `${hook}: the harness served ${found.length} — there is nothing to press`);
    assert.ok(found.some((el) => el.listeners.size > 0), `${hook} got no listener — the script never reached it`);
  }
});

test('reading a node shows a friendly step and the write gate opens on the third read', () => {
  const p = run();
  const nodes = p.root.querySelectorAll('.rd-node');
  const log = p.root.querySelector('.rd-log');
  const gate = p.root.querySelector('.rd-gate');

  nodes[3].dispatch('click');
  assert.match(log.textContent, /Checking your place/);
  assert.doesNotMatch(log.textContent, /ServerScriptService|get_project_tree/, 'the step exposes technical detail');
  assert.equal(gate.getAttribute('data-read'), '1');

  // The same node twice is ONE read. A gate that counts clicks rather than nodes opens on one
  // node pressed three times, which is not the property the stage is claiming.
  nodes[3].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '1', 'the same node counted twice');

  nodes[0].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '2');
  assert.match(gate.textContent, /changes stay off/i, 'the gate opened before the third read');

  nodes[5].dispatch('click');
  assert.equal(gate.getAttribute('data-read'), '3');
  assert.match(gate.textContent, /Ready to suggest a change/i, 'the gate did not open on the third read');
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

test('exactly one stage is shown at a time, and a tab click or an arrow key moves it', () => {
  const p = run();
  const tabs = p.root.querySelectorAll('.stage-tab');
  const shown = () => ['tree', 'eye', 'code'].filter((d) => !p.root.querySelector(`[data-demo="${d}"]`).hasAttribute('hidden'));

  // The script hides the others on start. Without it all three are visible (the no-JS state).
  assert.deepEqual(shown(), ['tree'], 'on start, not exactly the selected stage is shown');

  tabs[2].dispatch('click');
  assert.deepEqual(shown(), ['code'], 'clicking a tab did not show its stage alone');
  assert.deepEqual(tabs.map((t) => t.getAttribute('aria-selected')), ['false', 'false', 'true']);
  assert.deepEqual(tabs.map((t) => t.getAttribute('tabindex')), ['-1', '-1', '0'],
    'the roving tabindex did not follow the selection, so Tab lands on the wrong tab');

  // ArrowRight from the last tab wraps to the first, and focus goes with it.
  let prevented = false;
  tabs[2].dispatch('keydown', { key: 'ArrowRight', preventDefault: () => { prevented = true; } });
  assert.deepEqual(shown(), ['tree'], 'ArrowRight from the last tab did not wrap to the first');
  assert.ok(prevented, 'the arrow key was not consumed, so the page would also scroll');
  assert.ok(tabs[0].focused, 'focus did not move with the selection');

  tabs[0].dispatch('keydown', { key: 'ArrowLeft', preventDefault() {} });
  assert.deepEqual(shown(), ['code'], 'ArrowLeft from the first tab did not wrap to the last');

  // Any other key is left alone.
  tabs[2].dispatch('keydown', { key: 'a', preventDefault() { throw new Error('consumed an ordinary key'); } });
  assert.deepEqual(shown(), ['code']);
});

test('the Autonomous toggle is off at rest and its state is its own aria-pressed', () => {
  const p = run();
  assert.equal(p.auto.getAttribute('aria-pressed'), 'false', 'the toggle starts on, so the page is violet at rest');
  p.auto.dispatch('click');
  assert.equal(p.auto.getAttribute('aria-pressed'), 'true', 'a press did not turn it on');
  p.auto.dispatch('click');
  assert.equal(p.auto.getAttribute('aria-pressed'), 'false', 'a second press did not turn it off again');
});

test('the capability stages draw on no animation-frame loop, and the page script draws nothing', () => {
  const p = run();
  assert.equal(p.frames.length, 0, `the page script requested ${p.frames.length} animation frame(s) at start`);
  for (const t of p.root.querySelectorAll('.stage-tab')) t.dispatch('click');
  assert.equal(p.frames.length, 0, 'switching stages started an animation-frame loop');
  assert.doesNotMatch(MARKUP, /<canvas\b/i, 'index.astro renders a <canvas> of its own — drawing belongs in a pick component that sleeps');
  assert.doesNotMatch(clientScript(), /requestAnimationFrame|getContext\(/,
    'the landing script draws — the stages are still pictures, and any moving ground is a pick component');
});

test('every canvas on the front page is a decoration that stops for reduced motion, sleeps off screen, and holds its box', () => {
  const COMPONENTS = join(SITE, 'src', 'components');
  const imported = [...SOURCE.matchAll(/import\s+(\w+)\s+from\s+'(\.\.\/components\/[^']+\.astro)'/g)];
  const footer = readFileSync(join(COMPONENTS, 'Footer.astro'), 'utf8');
  const files = new Set(imported.map((m) => join(SITE, 'src', 'pages', m[2])));
  for (const m of footer.matchAll(/import\s+\w+\s+from\s+'(\.\/[^']+\.astro)'/g)) files.add(join(COMPONENTS, m[1]));
  let canvases = 0;
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const body = src.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');
    if (!/<canvas\b/i.test(body)) continue;
    canvases += 1;
    const name = file.split('/').at(-1);
    const host = /<(\w+)\b([^>]*)>\s*<canvas\b/i.exec(body);
    assert.ok(host && /aria-hidden="true"/.test(host[2]), `${name}: the canvas host is not aria-hidden, so a decoration is announced`);
    const script = /<script>[\s\S]*?from '(\.\/[\w-]+)'[\s\S]*?<\/script>/.exec(body);
    assert.ok(script, `${name}: no script mounts the canvas`);
    const ts = readFileSync(join(dirname(file), `${script[1]}.ts`), 'utf8');
    for (const guard of ['reducedMotion', 'whileVisible']) {
      assert.match(ts, new RegExp(`import\\s*\\{[^}]*\\b${guard}\\b[^}]*\\}\\s*from\\s*'\\./motion'`),
        `${name}: its drawing script does not take ${guard} from picks/motion.ts`);
    }
    const css = /import\s+'(\.\/[\w-]+\.css)'/.exec(src);
    assert.ok(css, `${name}: the canvas has no sheet of its own to hold its box`);
    const sheet = readFileSync(join(dirname(file), css[1]), 'utf8');
    const cls = /class=\{?[`"']([\w-]+)/.exec(host[2])?.[1];
    const block = new RegExp(`\\.${cls}\\s*\\{([^}]*)\\}`).exec(sheet)?.[1] ?? '';
    assert.ok(/position:\s*absolute[\s\S]*inset:\s*0/.test(block) || /(?:^|;|\s)height\s*:/.test(block),
      `${name}: the canvas box is sized by its drawing, so it can shift the layout when the script runs`);
  }
  assert.ok(canvases >= 1, 'no canvas component was found on the front page; the scan has drifted');
});

test('one stage cannot take the others down with it', () => {
  /* ONE STAGE IS MADE TO THROW, NOT MADE TO GIVE UP. A missing element is the case each stage's own
     `if (!x) return;` already handles, so a test built on one would pass with the try/catch
     deleted. So one node's addEventListener throws: a real TypeError, raised inside the tree's
     set-up, with the stages after it still to be built. */
  const p = page();
  const hostile = p.root.querySelector('.rd-node');
  hostile.addEventListener = () => { throw new TypeError('hostile node'); };
  const sandbox = {
    document: p.document, window: p.window, requestAnimationFrame: p.window.requestAnimationFrame,
    getComputedStyle: p.window.getComputedStyle,
    console: { error: (...a) => p.errors.push(a.map(String).join(' ')) },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  assert.doesNotThrow(
    () => vm.runInContext(clientScript(), sandbox, { filename: 'index.astro:client' }),
    'a throw inside one stage escaped the whole script, so the others were never built',
  );

  assert.equal(p.errors.length, 1, 'the throw was not caught and reported');
  const asks = p.root.querySelectorAll('.lu-ask');
  asks[2].dispatch('click');
  assert.equal(p.out.classList.contains('refused'), true, 'the Luau stage died with the tree stage');
  p.auto.dispatch('click');
  assert.equal(p.auto.getAttribute('aria-pressed'), 'true', 'the Autonomous toggle died with the tree stage');
  p.root.querySelectorAll('.stage-tab')[1].dispatch('click');
  assert.equal(p.root.querySelector('[data-demo="eye"]').hasAttribute('hidden'), false, 'the tabs died with the tree stage');
});

test('every hook this harness serves is a hook the page actually renders', () => {
  // The hole this closes: rename `.rd-node` in the markup, follow it in the script, and a harness
  // still serving `.rd-node` keeps passing over a script that can no longer find anything.
  const hooks = [
    'rd-node', 'rd-log', 'rd-gate', 'rd-tree',
    'cw-mark', 'cw-defect', 'cw-render', 'cw-defects',
    'lu-ask', 'lu-asks', 'lu-out',
    'stage-tab', 'stage-tabs', 'demo-stage', 'auto-toggle',
  ];
  for (const hook of hooks) {
    assert.ok(
      new RegExp(`class="[^"]*\\b${hook}\\b`).test(MARKUP),
      `the harness serves .${hook} and index.astro renders no such element — this file is checking a page that does not exist`,
    );
  }
  for (const demo of ['tree', 'eye', 'code']) {
    assert.ok(MARKUP.includes(`s.demo === '${demo}'`) && SOURCE.includes(`demo: '${demo}'`),
      `the page renders no stage for data-demo="${demo}"`);
  }
  assert.match(MARKUP, /data-mode="autonomous"/, 'the page renders no Autonomous toggle for the script to find');
  // The attributes the script reads off the markup rather than off its own constants.
  for (const attr of ['data-path', 'data-kids', 'data-defect', 'data-lines', 'data-refused', 'aria-controls', 'aria-selected']) {
    assert.ok(MARKUP.includes(attr), `the page writes no ${attr}, so the script reads nothing`);
  }
});
