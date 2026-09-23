/**
 * THE OWNER'S LANDING PICKS ARE MOUNTED IN THE PRODUCT, AND THE ONES THAT MOVE STOP WHEN THEY SHOULD.
 *
 * Twenty-two components were ticked for the public home page and the shared Nav/Footer. They are
 * now twelve mounts, because picks that did one job were merged (four noise grounds into one
 * NoiseField, four Animated Beam variants into one BeamFlow, four button treatments into one
 * CtaButton, and so on). A component nobody imports is a demo, so the first half of this file reads
 * the pages, with comments stripped, and fails when a mount is removed or only described.
 *
 * The second half EXECUTES the pick scripts. The owner picked looping, canvas-drawn grounds, so
 * "nothing loops" is no longer the landing's rule. The rule that replaced it is the one a reader
 * feels: under reduced motion nothing moves, off screen or in a hidden tab nothing draws, and
 * nothing that moves pushes the layout around. Reading source cannot prove a loop stops (the flow
 * field once shipped with a script that never ran at all), so each loop is run against a small
 * recording DOM and its frame queue is inspected.
 *
 * HOW THE TYPESCRIPT RUNS. Node strips erasable types natively. Each pick is copied to a temp dir
 * with its `./motion` and `./noise` imports rewritten to absolute URLs, and motion.ts is imported
 * with a fresh query per harness, because it reads matchMedia once at module load.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(SITE, 'src');
const PICKS = join(SRC, 'components', 'picks');
const read = (...p) => readFileSync(join(SRC, ...p), 'utf8');

/** Comments of every kind this site writes, removed. Scripts and frontmatter stay: imports live there. */
const strip = (s) => s
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const frontmatter = (s) => (/^---\r?\n([\s\S]*?)\r?\n---/.exec(s) ?? [, ''])[1];
const markup = (s) => s.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/* ============================================================================ 1. the mounts === */

/** Every pick of the lane, by picker id, to the place it now lives. */
const LANE = [
  'componentry--cursor-driven-particle-typography', 'eldora--animated-frameworks', 'eldora--integrations',
  'eldora--ipad', 'gsap--modifiers', 'motion--ui-arrow-link', 'motion--conic-gradient-pointer',
  'motion--scramble-text-hover', 'motion--ui-screenshot-scroll-reveal', 'motion--ticker', 'reactbits--dither',
  'reactbits--shape-waves', 'reactbits--specular-button', 'reactbits--topography', 'reactbits--waves',
  'ui-layouts--animated-beam-default', 'ui-layouts--animated-beam-multiple-input',
  'ui-layouts--animated-beam-multiple-output', 'ui-layouts--animated-beam-unidirectional',
  'ui-layouts--button-arrow-right', 'ui-layouts--button-background-shine', 'ui-layouts--liquid-button',
];

const INDEX = ['pages', 'index.astro'];
const MOUNTS = [
  { ids: ['reactbits--waves'], file: INDEX, name: 'NoiseField', from: 'picks/NoiseField.astro', use: /<section\b[^>]*data-field-host[^>]*>\s*<NoiseField\s+mode="lines"/ },
  { ids: ['reactbits--shape-waves'], file: INDEX, name: 'NoiseField', from: 'picks/NoiseField.astro', use: /<section\b[^>]*data-field-host[^>]*>\s*<NoiseField\s+mode="bricks"/ },
  { ids: ['reactbits--topography', 'reactbits--dither'], file: INDEX, name: 'NoiseField', from: 'picks/NoiseField.astro', use: /<section\b[^>]*data-field-host[^>]*>\s*<NoiseField\s+mode="contours"/ },
  { ids: ['motion--conic-gradient-pointer'], file: INDEX, name: 'PointerRim', from: 'picks/PointerRim.astro', use: /<form\b[^>]*class="composer"[^>]*\bdata-rim\b[^>]*>\s*<PointerRim\s*\/>/ },
  { ids: ['gsap--modifiers', 'motion--ticker'], file: INDEX, name: 'Marquee', from: 'components/Marquee.astro', use: /<Marquee\b[^>]*\bfills="hero-start"/ },
  { ids: ['ui-layouts--animated-beam-default', 'ui-layouts--animated-beam-multiple-input', 'ui-layouts--animated-beam-multiple-output', 'ui-layouts--animated-beam-unidirectional'], file: INDEX, name: 'BeamFlow', from: 'picks/BeamFlow.astro', use: /<BeamFlow\b[^>]*\/>/ },
  { ids: ['eldora--ipad', 'motion--ui-screenshot-scroll-reveal'], file: INDEX, name: 'DeviceFrame', from: 'picks/DeviceFrame.astro', use: /<DeviceFrame\b[^>]*>\s*<div class="demos"/ },
  { ids: ['eldora--animated-frameworks', 'eldora--integrations'], file: INDEX, name: 'MakerTiles', from: 'picks/MakerTiles.astro', use: /<MakerTiles\b[^>]*\bmakers=\{/ },
  { ids: ['motion--ui-arrow-link'], file: INDEX, name: 'ArrowLink', from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href=/ },
  { ids: ['motion--ui-arrow-link'], file: ['components', 'ConsentProof.astro'], name: 'ArrowLink', from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href="\/proof"/ },
  { ids: ['motion--ui-arrow-link'], file: ['components', 'BuiltScreen.astro'], name: 'ArrowLink', from: 'picks/ArrowLink.astro', use: /<ArrowLink\b[^>]*href=/ },
  { ids: ['ui-layouts--button-arrow-right', 'ui-layouts--liquid-button', 'ui-layouts--button-background-shine', 'reactbits--specular-button'], file: INDEX, name: 'CtaButton', from: 'picks/CtaButton.astro', use: /<CtaButton\b[^>]*href="\/app\/signup"/ },
  { ids: ['ui-layouts--button-arrow-right', 'ui-layouts--liquid-button', 'ui-layouts--button-background-shine', 'reactbits--specular-button'], file: ['components', 'Nav.astro'], name: 'CtaButton', from: 'picks/CtaButton.astro', use: /<CtaButton\b[^>]*href="\/app\/signup"/ },
  { ids: ['componentry--cursor-driven-particle-typography'], file: ['components', 'Footer.astro'], name: 'ParticleWord', from: 'picks/ParticleWord.astro', use: /<ParticleWord\b[^>]*\/>/ },
];

/** Why a mount is missing, or null when it is there. Pure, so the mutation test below can use it. */
function missing(mount, source) {
  const s = strip(source);
  const importRe = new RegExp(`import\\s+${mount.name}\\s+from\\s+['"][^'"]*${mount.from.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}['"]`);
  if (!importRe.test(frontmatter(s))) return `${mount.file.join('/')} does not import ${mount.name}`;
  if (!mount.use.test(markup(s))) return `${mount.file.join('/')} imports ${mount.name} but does not mount it where it belongs (${mount.use})`;
  return null;
}

/** Picks applied by a script rather than a component tag, each with the test below that proves it. */
const APPLIED = { 'motion--scramble-text-hover': 'Scramble text runs on the real navigation links' };

test('every pick of the landing lane is accounted for by a mount', () => {
  assert.equal(new Set(LANE).size, 22, 'the lane list drifted');
  const covered = new Set([...MOUNTS.flatMap((m) => m.ids), ...Object.keys(APPLIED)]);
  assert.deepEqual(LANE.filter((id) => !covered.has(id)), [], 'a pick has no mount in this file');
  assert.deepEqual([...covered].filter((id) => !LANE.includes(id)), [], 'a mount names a pick outside the lane');
});

for (const mount of MOUNTS) {
  test(`${mount.name} is mounted in ${mount.file.join('/')} (${mount.ids.join(', ')})`, () => {
    assert.equal(missing(mount, read(...mount.file)), null);
  });
}

test('the Nav and Footer that carry picks are on the home page', () => {
  const page = strip(read(...INDEX));
  for (const name of ['Nav', 'Footer']) {
    assert.match(frontmatter(page), new RegExp(`import\\s+${name}\\s+from`), `index.astro does not import ${name}`);
    assert.match(markup(page), new RegExp(`<${name}\\b`), `index.astro does not render <${name}>`);
  }
});

test('Scramble text runs on the real navigation links', () => {
  const nav = strip(read('components', 'Nav.astro'));
  const script = (/<script>([\s\S]*?)<\/script>/.exec(nav) ?? [, ''])[1];
  assert.match(script, /import\s*\{\s*scrambleOnHover\s*\}\s*from\s*'\.\/picks\/scramble'/, 'Nav.astro does not import the scramble');
  assert.match(script, /scrambleOnHover\(\s*document\.querySelectorAll[^)]*#primary-nav[^)]*\)\s*\)/, 'the scramble is not applied to the #primary-nav links');
  assert.match(markup(nav), /id="primary-nav"/, 'the nav the scramble targets is not rendered');
});

test('each pick component starts its own behaviour, so a mount is never an inert shell', () => {
  const RUNS = [
    ['picks/NoiseField.astro', 'mountFields', './noise-field'],
    ['picks/PointerRim.astro', 'mountRims', './pointer-rim'],
    ['picks/BeamFlow.astro', 'mountBeams', './beam-flow'],
    ['picks/DeviceFrame.astro', 'mountDevices', './device-frame'],
    ['picks/MakerTiles.astro', 'mountMakerTiles', './maker-tiles'],
    ['picks/CtaButton.astro', 'mountCtas', './cta-button'],
    ['picks/ParticleWord.astro', 'mountParticleWords', './particle-word'],
    ['Marquee.astro', 'mountTickers', './picks/ticker'],
  ];
  for (const [file, fn, mod] of RUNS) {
    const s = strip(read('components', ...file.split('/')));
    const script = (/<script>([\s\S]*?)<\/script>/.exec(s) ?? [, ''])[1];
    assert.ok(script.includes(`import { ${fn} } from '${mod}'`) && new RegExp(`\\b${fn}\\(\\)`).test(script),
      `${file} does not import and call ${fn}()`);
  }
});

test('removing a mount turns this file red (the checker is not vacuous)', () => {
  for (const mount of MOUNTS) {
    const source = read(...mount.file);
    const tagless = source.replace(new RegExp(`<${mount.name}\\b[\\s\\S]*?(?:\\/>|<\\/${mount.name}>)`, 'g'), '');
    assert.notEqual(missing(mount, tagless), null, `${mount.name} still "passes" with every <${mount.name}> removed from ${mount.file.join('/')}`);
    const commented = source.replace(new RegExp(`(<${mount.name}\\b[\\s\\S]*?(?:\\/>|<\\/${mount.name}>))`, 'g'), '{/* $1 */}');
    assert.notEqual(missing(mount, commented), null, `${mount.name} still "passes" when it is only commented in`);
  }
});

/* ======================================================================= 2. the sheets obey === */

const SHEETS = ['arrow-link', 'beam-flow', 'cta-button', 'device-frame', 'maker-tiles', 'noise-field', 'particle-word', 'pointer-rim', 'ticker']
  .map((n) => [n, strip(readFileSync(join(PICKS, `${n}.css`), 'utf8'))]);

test('no pick sheet brings in a glow, a gradient fill, violet, a hidden cursor or green', () => {
  for (const [name, css] of SHEETS) {
    assert.doesNotMatch(css, /background(?:-image)?\s*:[^;]*gradient\(/, `${name}.css paints a gradient background (masks are fine, fills are not)`);
    assert.doesNotMatch(css, /box-shadow\s*:[^;]*\b0\s+0\s+\d+px/, `${name}.css draws a glow`);
    assert.doesNotMatch(css, /var\(--autonomous/, `${name}.css uses the Autonomous violet`);
    assert.doesNotMatch(css, /cursor\s*:\s*none/, `${name}.css hides the cursor`);
    assert.doesNotMatch(css, /var\(--(?:green|success)|#(?:0f0|00ff00|22c55e|16a34a)\b/i, `${name}.css uses green`);
  }
});

test('a sheet that animates or moves something has a reduced-motion answer', () => {
  let movers = 0;
  for (const [name, css] of SHEETS) {
    const moves = /animation\s*:\s*(?!none)[\w-]+/.test(css) || /transition\s*:[^;]*\b(?:transform|width|stroke-dashoffset)\b/.test(css);
    if (!moves) continue;
    movers += 1;
    assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/, `${name}.css moves things and has no reduced-motion block`);
  }
  assert.ok(movers >= 4, `only ${movers} moving sheets found; the scan has drifted`);
});

/* ================================================================ 3. the loops, executed === */

class El {
  constructor(tag, attrs = {}, kids = []) {
    this.tag = tag;
    this.attrs = new Map(Object.entries(attrs));
    this.dataset = {};
    for (const [k, v] of this.attrs) if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-(\w)/g, (_, c) => c.toUpperCase())] = v;
    this.cls = new Set(String(attrs.class ?? '').split(/\s+/).filter(Boolean));
    this.children = [];
    this.parentElement = null;
    this.listeners = new Map();
    this.textContent = attrs.text ?? '';
    this.value = '';
    this.rect = { left: 0, top: 0, width: 800, height: 400 };
    this.clientWidth = 800;
    this.clientHeight = 400;
    const style = { setProperty(k, v) { this[k] = v; } };
    this.style = style;
    const cls = this.cls;
    this.classList = {
      add: (...c) => c.forEach((x) => cls.add(x)),
      remove: (...c) => c.forEach((x) => cls.delete(x)),
      contains: (c) => cls.has(c),
      toggle: (c, on) => { const want = on === undefined ? !cls.has(c) : !!on; if (want) cls.add(c); else cls.delete(c); return want; },
    };
    this.append(...kids);
    if (tag === 'canvas') { this.width = 300; this.height = 150; this.ctx = recordingContext(this); }
  }
  append(...kids) { for (const k of kids) { k.parentElement = this; this.children.push(k); } }
  appendChild(k) { this.append(k); return k; }
  remove() { const p = this.parentElement; if (p) p.children = p.children.filter((c) => c !== this); this.parentElement = null; }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); if (n === 'class') { this.cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach((c) => this.cls.add(c)); } }
  hasAttribute(n) { return this.attrs.has(n); }
  get id() { return this.getAttribute('id') ?? ''; }
  get offsetLeft() { return this.parentElement ? this.parentElement.children.indexOf(this) * 100 : 0; }
  getBoundingClientRect() { const r = this.rect; return { ...r, right: r.left + r.width, bottom: r.top + r.height }; }
  getContext() { return this.ctx ?? null; }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(fn); }
  dispatchEvent(e) { this.fire(e.type, e); return true; }
  fire(t, e = {}) { for (const fn of this.listeners.get(t) ?? []) fn({ type: t, target: this, ...e }); }
  focus() { this.focused = true; }
  setSelectionRange() {}
  cloneNode() {
    const c = new El(this.tag, Object.fromEntries(this.attrs));
    c.textContent = this.textContent;
    for (const k of this.children) c.append(k.cloneNode(true));
    return c;
  }
  get descendants() { const out = []; const walk = (n) => n.children.forEach((k) => { out.push(k); walk(k); }); walk(this); return out; }
  matchesOne(part) {
    if (part === ':focus-visible') return false;
    const m = /^([a-z][\w-]*)?((?:\.[\w-]+)*)((?:\[[^\]]+\])*)$/i.exec(part);
    if (!m) throw new Error(`the harness cannot parse ${part}`);
    if (m[1] && m[1] !== this.tag) return false;
    if (!(m[2] ?? '').split('.').filter(Boolean).every((c) => this.cls.has(c))) return false;
    return [...(m[3] ?? '').matchAll(/\[([\w-]+)\]/g)].every((a) => this.attrs.has(a[1]));
  }
  matches(sel) { return this.matchesOne(sel.trim()); }
  querySelectorAll(sel) {
    const parts = sel.trim().split(/\s+/);
    let pool = this.descendants;
    for (let i = 0; i < parts.length - 1; i++) pool = [...new Set(pool.filter((n) => n.matchesOne(parts[i])).flatMap((n) => n.descendants))];
    return pool.filter((n) => n.matchesOne(parts.at(-1)));
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  closest(sel) { let n = this; while (n) { if (n.matchesOne(sel)) return n; n = n.parentElement; } return null; }
}

/** A 2D context that counts what is drawn and answers the few reads the picks make. */
function recordingContext(canvas) {
  const state = { draws: 0 };
  return new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 100 });
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) });
      if (k === 'getImageData') return () => ({ data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(255) });
      return () => { t.draws += 1; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

const GLOBALS = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'MutationObserver', 'IntersectionObserver', 'innerHeight'];

/** A page to mount into, with a frame queue, an observer that is told what is on screen, and a motion setting. */
function harness({ reduced = false } = {}) {
  const frames = new Map();
  let nextId = 1;
  let now = performance.now();
  const mq = { matches: reduced, media: '(prefers-reduced-motion: reduce)', ls: [], addEventListener(_, f) { this.ls.push(f); } };
  const observers = [];
  class IO {
    constructor(cb) { this.cb = cb; this.targets = new Set(); observers.push(this); }
    observe(el) { this.targets.add(el); }
    unobserve(el) { this.targets.delete(el); }
    disconnect() { this.targets.clear(); }
  }
  const body = new El('body');
  const root = new El('html', {}, [body]);
  const docLs = new Map();
  const winLs = new Map();
  const timers = [];
  const document = {
    documentElement: root,
    visibilityState: 'visible',
    fonts: { ready: Promise.resolve() },
    querySelectorAll: (s) => root.querySelectorAll(s),
    querySelector: (s) => root.querySelector(s),
    getElementById: (id) => root.descendants.find((n) => n.id === id) ?? null,
    createElementNS: (_, tag) => new El(tag),
    addEventListener(t, f) { if (!docLs.has(t)) docLs.set(t, []); docLs.get(t).push(f); },
  };
  const window = {
    matchMedia: () => mq,
    IntersectionObserver: IO,
    devicePixelRatio: 1,
    innerHeight: 800,
    addEventListener(t, f) { if (!winLs.has(t)) winLs.set(t, []); winLs.get(t).push(f); },
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
  };
  const saved = GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]);
  Object.assign(globalThis, {
    window, document, IntersectionObserver: IO, innerHeight: 800,
    requestAnimationFrame: (fn) => { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame: (id) => { frames.delete(id); },
    getComputedStyle: () => ({ getPropertyValue: () => '#5b7cfa', fontFamily: 'sans-serif' }),
    MutationObserver: class { observe() {} },
  });
  return {
    body, document, window, mq,
    /** Run every frame currently queued, `n` times over. */
    flush(n = 1) {
      for (let i = 0; i < n; i++) {
        now += 16;
        const batch = [...frames.entries()];
        frames.clear();
        for (const [, fn] of batch) fn(now);
      }
    },
    get pending() { return frames.size; },
    /** Tell every observer watching `el` whether it is on screen. */
    see(el, on) { for (const o of observers) if (o.targets.has(el)) o.cb([{ target: el, isIntersecting: on }]); },
    tab(visible) { document.visibilityState = visible ? 'visible' : 'hidden'; for (const f of docLs.get('visibilitychange') ?? []) f(); },
    setReduced(on) { mq.matches = on; for (const f of mq.ls) f(); },
    fireWindow(t) { for (const f of winLs.get(t) ?? []) f(); },
    restore() {
      for (const [k, d] of saved) { if (d) Object.defineProperty(globalThis, k, d); else delete globalThis[k]; }
    },
  };
}

const TMP = mkdtempSync(join(tmpdir(), 'picks-landing-'));
writeFileSync(join(TMP, 'package.json'), '{"type":"module"}');
let run = 0;

/** Import a pick's TypeScript with a fresh copy of motion.ts behind it. */
async function load(name) {
  run += 1;
  const motion = `${pathToFileURL(join(PICKS, 'motion.ts')).href}?run=${run}`;
  const noise = pathToFileURL(join(PICKS, 'noise.ts')).href;
  const src = readFileSync(join(PICKS, `${name}.ts`), 'utf8')
    .replace(/from '\.\/motion'/g, `from '${motion}'`)
    .replace(/from '\.\/noise'/g, `from '${noise}'`);
  assert.doesNotMatch(src, /from '\.\//, `${name}.ts has a relative import this harness does not resolve`);
  const file = join(TMP, `${name}-${run}.ts`);
  writeFileSync(file, src);
  return import(pathToFileURL(file).href);
}

/** Wrap a test body so the fake page is always taken down again. */
const withPage = (opts, fn) => async () => {
  const h = harness(opts);
  try { await fn(h); } finally { h.restore(); }
};

for (const mode of ['lines', 'bricks', 'contours']) {
  const field = (h) => {
    const host = new El('div', { class: `nf nf--${mode}`, 'data-nf': mode }, [new El('canvas')]);
    host.clientWidth = 400; host.clientHeight = 200;
    h.body.append(new El('section', { 'data-field-host': '' }, [host]));
    return { host, ctx: host.children[0].ctx };
  };

  test(`NoiseField ${mode}: draws while on screen, stops off screen and in a hidden tab`, withPage({}, async (h) => {
    const { host, ctx } = field(h);
    (await load('noise-field')).mountFields();
    assert.equal(h.pending, 0, 'it drew before anyone could see it');
    h.see(host, true);
    assert.ok(h.pending > 0, 'on screen, it did not start');
    h.flush(4);
    assert.ok(ctx.draws > 0, 'frames ran but nothing was drawn');
    assert.ok(host.classList.contains('is-on'), 'the field never faded in');
    h.see(host, false);
    h.flush(2);
    assert.equal(h.pending, 0, 'off screen, the loop kept running');
    h.see(host, true);
    assert.ok(h.pending > 0, 'back on screen, it did not resume');
    h.tab(false);
    h.flush(2);
    assert.equal(h.pending, 0, 'in a hidden tab, the loop kept running');
  }));

  test(`NoiseField ${mode}: under reduced motion it is one still picture, and flipping the setting stops it`, withPage({ reduced: true }, async (h) => {
    const { host, ctx } = field(h);
    (await load('noise-field')).mountFields();
    h.see(host, true);
    h.flush(3);
    assert.equal(h.pending, 0, 'under reduced motion it animates');
    assert.ok(ctx.draws > 0, 'under reduced motion it is blank instead of still');
    h.setReduced(false);
    assert.ok(h.pending > 0, 'turning reduced motion off did not start it');
    h.setReduced(true);
    h.flush(2);
    assert.equal(h.pending, 0, 'turning reduced motion on mid-visit did not stop it');
  }));
}

test('NoiseField never sizes its own box, so it cannot shift the layout', () => {
  const css = SHEETS.find(([n]) => n === 'noise-field')[1];
  assert.match(css, /\.nf\s*\{[^}]*position:\s*absolute[^}]*inset:\s*0/, 'the field is not laid out of flow over its section');
  assert.match(css, /\.nf\s*\{[^}]*pointer-events:\s*none/, 'the field can take a click meant for a control');
  assert.doesNotMatch(readFileSync(join(PICKS, 'noise-field.ts'), 'utf8'), /host\.style\.(?:width|height)|\.style\.(?:width|height)\s*=/, 'the script sizes an element');
});

function tickerPage(h) {
  const chips = (row) => new El('ul', { class: 'ticker-track' }, row.map((t) => new El('li', {}, [new El('button', { class: 'ticker-chip', 'data-prompt': t, text: t })])));
  const rows = [new El('div', { class: 'ticker-row', 'data-dir': '-1' }, [chips(['A lava obby', 'A pet shop', 'A racing map'])]),
    new El('div', { class: 'ticker-row', 'data-dir': '1' }, [chips(['A zombie wave', 'A tycoon', 'A snowy hub'])])];
  for (const r of rows) r.clientWidth = 760;
  const root = new El('div', { class: 'ticker', 'data-ticker': '', 'data-fills': 'hero-start' }, rows);
  const field = new El('textarea', { id: 'hero-start' });
  h.body.append(field, root);
  return { root, rows, field };
}

test('Ticker: runs only on screen, copies are hidden from readers and the tab order', withPage({}, async (h) => {
  const { root, rows } = tickerPage(h);
  (await load('ticker')).mountTickers();
  h.see(root, true);
  assert.ok(root.classList.contains('is-live') && h.pending > 0, 'on screen, the ticker did not start');
  const track = rows[0].children[0];
  const copies = track.children.filter((c) => c.hasAttribute('data-copy'));
  assert.ok(copies.length >= 3, 'no copies were made, so the row has a seam');
  assert.ok(copies.every((c) => c.getAttribute('aria-hidden') === 'true'), 'a copy is read aloud a second time');
  assert.ok(copies.every((c) => c.querySelectorAll('button').every((b) => b.getAttribute('tabindex') === '-1')), 'a copy is a second tab stop');
  h.flush(5);
  const moved = track.style.transform;
  assert.match(moved, /translate3d\(-?[\d.]+px/, 'the row never moved');
  h.see(root, false);
  h.flush(2);
  assert.equal(h.pending, 0, 'off screen, the ticker kept running');
}));

test('Ticker: keyboard focus stops a row, and a pressed chip is typed into the composer', withPage({}, async (h) => {
  const { root, rows, field } = tickerPage(h);
  (await load('ticker')).mountTickers();
  h.see(root, true);
  rows[0].fire('focusin');
  h.flush(120);
  const a = rows[0].children[0].style.transform;
  h.flush(10);
  assert.equal(rows[0].children[0].style.transform, a, 'a row with a focused chip keeps sliding away');
  const chip = rows[1].querySelector('.ticker-chip');
  root.fire('click', { target: chip });
  assert.equal(field.value, 'A zombie wave', 'the pressed idea was not written into the composer');
  assert.ok(field.focused, 'the composer was not focused after the idea was written');
}));

test('Ticker: under reduced motion it is a still list, with no copies and no frames', withPage({ reduced: true }, async (h) => {
  const { root, rows } = tickerPage(h);
  (await load('ticker')).mountTickers();
  h.see(root, true);
  h.flush(3);
  assert.equal(h.pending, 0, 'under reduced motion the ticker runs');
  assert.equal(root.classList.contains('is-live'), false);
  assert.ok(rows.every((r) => r.children[0].children.every((c) => !c.hasAttribute('data-copy'))), 'copies were added under reduced motion');
  assert.equal(rows[0].children[0].style.transform ?? '', '', 'the row was moved under reduced motion');
}));

function tilesPage(h) {
  const tiles = [0, 1, 2, 3].map((i) => { const t = new El('li', { class: 'mk-tile' }); t.rect = { left: i * 60, top: 0, width: 48, height: 48 }; return t; });
  const root = new El('div', { class: 'mk', 'data-mk': '' }, [new El('ul', { class: 'mk-row' }, tiles), new El('span', { class: 'mk-rail' }, [new El('span', { class: 'mk-light' })])]);
  root.clientWidth = 240;
  h.body.append(root);
  return { root, tiles };
}

test('MakerTiles: the light runs only on screen, and no tile is left tipped when it stops', withPage({}, async (h) => {
  const { root, tiles } = tilesPage(h);
  (await load('maker-tiles')).mountMakerTiles();
  assert.equal(h.pending, 0, 'the light ran before the row was seen');
  h.see(root, true);
  h.flush(3);
  assert.ok(h.pending > 0 && root.classList.contains('is-running'), 'on screen, the light did not run');
  assert.ok(tiles.some((t) => t.classList.contains('is-up')), 'the light passed and no tile tipped up');
  h.see(root, false);
  h.flush(2);
  assert.equal(h.pending, 0, 'off screen, the light kept running');
  assert.ok(tiles.every((t) => !t.classList.contains('is-up')), 'a tile was left tipped up');
}));

test('MakerTiles: under reduced motion no light runs and every tile is simply shown', withPage({ reduced: true }, async (h) => {
  const { root } = tilesPage(h);
  (await load('maker-tiles')).mountMakerTiles();
  h.see(root, true);
  h.flush(3);
  assert.equal(h.pending, 0, 'under reduced motion the light runs');
  assert.equal(root.classList.contains('is-armed'), false, 'under reduced motion the tiles are hidden for an arrival');
}));

function wordPage(h) {
  const host = new El('div', { class: 'pw', 'data-particle-word': 'Apple' }, [new El('canvas')]);
  host.clientWidth = 200; host.clientHeight = 60;
  host.children[0].rect = { left: 0, top: 0, width: 200, height: 60 };
  h.body.append(host);
  return { host, ctx: host.children[0].ctx };
}

test('ParticleWord: sleeps until pointed at, and falls asleep again once every particle is home', withPage({}, async (h) => {
  const { host, ctx } = wordPage(h);
  (await load('particle-word')).mountParticleWords();
  await Promise.resolve(); await Promise.resolve();
  assert.ok(ctx.draws > 0 && host.classList.contains('is-on'), 'the wordmark was never drawn');
  h.see(host, true);
  assert.equal(h.pending, 0, 'a footer nobody touches is running a loop');
  host.fire('pointermove', { clientX: 100, clientY: 30 });
  assert.ok(h.pending > 0, 'the pointer did not wake it');
  h.flush(20);
  host.fire('pointerleave');
  h.flush(400);
  assert.equal(h.pending, 0, 'the particles settled and the loop never slept');
  host.fire('pointermove', { clientX: 100, clientY: 30 });
  h.see(host, false);
  assert.equal(h.pending, 0, 'off screen, it kept running');
}));

test('ParticleWord: under reduced motion the pointer moves nothing', withPage({ reduced: true }, async (h) => {
  const { host, ctx } = wordPage(h);
  (await load('particle-word')).mountParticleWords();
  await Promise.resolve(); await Promise.resolve();
  h.see(host, true);
  host.fire('pointermove', { clientX: 100, clientY: 30 });
  assert.equal(h.pending, 0, 'under reduced motion the particles scatter');
  assert.ok(ctx.draws > 0, 'under reduced motion the wordmark is blank instead of still');
}));

test('BeamFlow: paused until on screen, running while seen, paused again when scrolled past', withPage({}, async (h) => {
  const node = (attr) => new El('span', { class: 'beam-dot', [attr]: '' });
  const fig = new El('figure', { class: 'beam', 'data-beam': '' }, [new El('div', { class: 'beam-grid' }, [
    new El('ul', { class: 'beam-col' }, [node('data-beam-in'), node('data-beam-in')]),
    new El('div', { class: 'beam-hub', 'data-beam-hub': '' }),
    new El('ul', { class: 'beam-col' }, [node('data-beam-out')]),
    new El('svg', { class: 'beam-svg' }),
  ])]);
  h.body.append(fig);
  (await load('beam-flow')).mountBeams();
  assert.equal(fig.querySelectorAll('.beam-run').length, 3, 'one beam per node was not drawn');
  assert.ok(fig.classList.contains('is-paused'), 'a figure that loads below the fold animates unseen');
  h.see(fig, true);
  assert.equal(fig.classList.contains('is-paused'), false, 'on screen, the beams stay paused');
  h.see(fig, false);
  assert.ok(fig.classList.contains('is-paused'), 'off screen, the beams keep running');
  const css = SHEETS.find(([n]) => n === 'beam-flow')[1];
  assert.match(css, /\.beam\.is-paused\s+\.beam-run\s*\{[^}]*animation-play-state:\s*paused/, 'is-paused does not pause the light');
  assert.match(css, /prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.beam\.is-drawn\s+\.beam-run\s*\{[^}]*animation:\s*none/, 'reduced motion does not stop the beams');
}));

test('DeviceFrame: tilts in as it arrives and rests flat; under reduced motion it is always flat', withPage({}, async (h) => {
  const body = new El('div', { class: 'device__body' });
  h.body.append(new El('div', { class: 'device', 'data-device': '' }, [body]));
  body.rect.top = 800;
  (await load('device-frame')).mountDevices();
  assert.match(body.style.transform, /rotateX\(28\.00deg\)/, 'arriving at the bottom of the screen, it is not tilted back');
  body.rect.top = 160;
  h.fireWindow('scroll');
  h.flush(1);
  assert.equal(body.style.transform, '', 'at 20% down the screen it is not flat');
  body.rect.top = 800;
  h.setReduced(true);
  h.flush(1);
  assert.equal(body.style.transform, '', 'under reduced motion it tilts');
  assert.equal(body.style.opacity, '', 'under reduced motion it fades');
}));

test('Scramble: the label keeps its width and its name while scrambling, and does nothing under reduced motion', withPage({}, async (h) => {
  const link = new El('a', { text: 'Pricing' });
  link.rect.width = 57;
  h.body.append(link);
  const { scrambleOnHover } = await load('scramble');
  scrambleOnHover([link]);
  assert.equal(link.getAttribute('aria-label'), 'Pricing', 'a screen reader would hear the scramble');
  link.fire('pointerenter');
  assert.equal(link.style.width, '57px', 'the width is not held, so the bar shifts while letters change');
  h.flush(60);
  assert.equal(link.textContent, 'Pricing', 'the label did not resolve back to its text');
  assert.equal(link.style.width, '', 'the held width was not released');
  h.setReduced(true);
  link.fire('pointerenter');
  assert.equal(h.pending, 0, 'under reduced motion the label scrambles');
}));
