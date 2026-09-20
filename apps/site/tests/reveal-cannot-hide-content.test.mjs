/**
 * THE FRONT PAGE CANNOT END UP INVISIBLE.
 *
 * The landing now hides its sections at opacity 0 and waits for a class before showing them. That
 * buys motion as the page is read, and it buys one catastrophic failure mode with it: if the class
 * never arrives, the front page renders its copy to nobody.
 *
 * That is not a theoretical worry in this repository. On the same day this was written, a hero
 * effect shipped to production whose script never executed at all — the element was in the served
 * HTML, the bundle was in the served HTML, and the code inside it never ran, because
 * `document.currentScript` is null in a module script. Every reading of the shipped page said the
 * feature was there. So "the script did not run" is the assumed case here, not the unlucky one.
 *
 * landing.css and Landing.astro guarantee the visible final frame FOUR separate ways, and this file
 * exercises each one on its own, by running the real shipped script in a sandbox rather than by
 * reading it:
 *
 *   1. no scripting at all      -> the `.no-js` class is never removed, and the CSS shows everything
 *   2. prefers-reduced-motion   -> the CSS neutralises the hidden state, AFTER the rule that sets it
 *   3. no IntersectionObserver  -> the script reveals everything immediately
 *   4. an observer that never fires -> the failsafe timer reveals everything anyway
 *
 * Any one of the four is sufficient. The tests below assert them separately so that losing one does
 * not quietly leave the page depending on another.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const LAYOUT = readFileSync(join(SITE, 'src', 'layouts', 'Landing.astro'), 'utf8');
const CSS = readFileSync(join(SITE, 'src', 'styles', 'landing.css'), 'utf8');
const PAGE = readFileSync(join(SITE, 'src', 'pages', 'index.astro'), 'utf8');

/** The reveal script as it will be served: the inline block that drives [data-reveal]. */
function revealScript() {
  const blocks = [...LAYOUT.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
  const hit = blocks.filter((b) => /data-reveal/.test(b) && /classList/.test(b));
  assert.equal(hit.length, 1,
    `expected exactly one reveal script in Landing.astro, found ${hit.length}`);
  return hit[0];
}

/** Run the real script against a DOM stub, with the environment dialled per branch. */
function run({ observer = true, fireEntries = true, nodes = 6 } = {}) {
  const made = [];
  for (let i = 0; i < nodes; i++) {
    const classes = new Set();
    const attrs = { 'data-reveal': '', ...(i === 2 ? { 'data-reveal-delay': '140' } : {}) };
    made.push({
      classList: { add: (c) => classes.add(c), contains: (c) => classes.has(c) },
      getAttribute: (k) => (k in attrs ? attrs[k] : null),
      style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
      _classes: classes,
    });
  }

  let observed = [];
  let disconnected = false;
  let timerFn = null;
  let timerMs = null;

  const sandbox = {
    console,
    document: { querySelectorAll: (sel) => (/\[data-reveal\]/.test(sel) ? made : []) },
    setTimeout: (fn, ms) => { timerFn = fn; timerMs = ms; return 1; },
    clearTimeout: () => {},
  };
  if (observer) {
    sandbox.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { observed.push(el); }
      unobserve(el) { observed = observed.filter((o) => o !== el); }
      disconnect() { disconnected = true; }
      /** Drive it the way a browser would when the section scrolls into view. */
      fire(els) { this.cb(els.map((target) => ({ isIntersecting: true, target })), this); }
    };
  }
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  let instance = null;
  if (observer) {
    const Base = sandbox.IntersectionObserver;
    sandbox.IntersectionObserver = class extends Base {
      constructor(cb, opts) { super(cb, opts); instance = this; }
    };
  }
  vm.runInContext(revealScript(), sandbox, { timeout: 5000, filename: 'Landing.astro' });

  if (observer && fireEntries && instance) instance.fire(made);

  return {
    nodes: made,
    shown: () => made.filter((n) => n._classes.has('is-in')).length,
    hidden: () => made.filter((n) => !n._classes.has('is-in')).length,
    delayed: made.find((n) => n.getAttribute('data-reveal-delay')),
    runFailsafe: () => { assert.ok(timerFn, 'no failsafe timer was scheduled'); timerFn(); },
    failsafeMs: () => timerMs,
    disconnected: () => disconnected,
    observedCount: () => observed.length,
  };
}

test('the ordinary path: sections reveal as they scroll into view', () => {
  const r = run({ observer: true, fireEntries: true });
  assert.equal(r.hidden(), 0, `${r.hidden()} sections never revealed on the ordinary path`);
  assert.equal(r.observedCount(), 0, 'revealed elements are still being observed; the observer leaks');
});

test('an element carrying a stagger delay has it applied as a custom property', () => {
  const r = run();
  assert.ok(r.delayed, 'the harness built no delayed element to check');
  assert.equal(r.delayed.style.props['--reveal-delay'], '140ms',
    'data-reveal-delay is not translated into the custom property the stylesheet reads');
});

test('GUARANTEE 3 — with no IntersectionObserver, everything is shown at once', () => {
  const r = run({ observer: false });
  assert.equal(r.hidden(), 0,
    'on a browser without IntersectionObserver the landing renders its copy invisible');
});

test('GUARANTEE 4 — an observer that never fires still cannot hide the page', () => {
  const r = run({ observer: true, fireEntries: false });
  assert.equal(r.shown(), 0, 'the harness is not actually withholding the observer callback');

  assert.ok(r.failsafeMs() > 0 && r.failsafeMs() <= 5000,
    `the failsafe fires after ${r.failsafeMs()}ms — too late to be a failsafe`);
  r.runFailsafe();

  assert.equal(r.hidden(), 0,
    'the failsafe did not reveal every section, so a silent observer leaves copy invisible forever');
  assert.ok(r.disconnected(), 'the failsafe leaves the observer connected and still firing');
});

test('GUARANTEE 1 — without scripting the copy is visible, because .no-js says so', () => {
  assert.match(LAYOUT, /<html[^>]*class="[^"]*\bno-js\b/,
    'the server-rendered <html> has no no-js class, so the CSS fallback below can never apply');
  assert.match(CSS, /\.no-js\s+\[data-reveal\]\s*\{[^}]*opacity:\s*1/,
    'landing.css has no .no-js fallback that shows [data-reveal] content');
  // And the class must be removed by something that runs BEFORE paint, or every visitor sees the
  // no-js frame flash. It is removed in an inline head script, not a hoisted module.
  assert.match(LAYOUT, /<script is:inline>[\s\S]*classList\.remove\('no-js'\)/,
    'no-js is not removed by an inline script, so it is removed after first paint or not at all');
});

test('GUARANTEE 2 — reduced motion shows the content, and wins on cascade order', () => {
  const hide = CSS.search(/html:not\(\.no-js\)\s+\[data-reveal\]\s*\{/);
  assert.ok(hide > -1, 'landing.css does not hide [data-reveal] at all — this check would be vacuous');

  // Find the reduced-motion block that re-shows it, and require it to come LATER in the file.
  const reduced = [...CSS.matchAll(/@media\s*\([^)]*prefers-reduced-motion[^)]*\)\s*\{/gi)]
    .map((m) => ({ at: m.index, body: blockAt(CSS, m.index + m[0].length - 1) }))
    .filter((b) => /\[data-reveal\]/.test(b.body) && /opacity:\s*1/.test(b.body));

  assert.ok(reduced.length > 0,
    'no prefers-reduced-motion rule re-shows [data-reveal]. The landing stops all transitions under '
    + 'reduced motion, and a stopped transition on an element left at opacity 0 is a blank page.');
  assert.ok(reduced.some((b) => b.at > hide),
    'the reduced-motion rule that re-shows [data-reveal] is declared BEFORE the rule that hides it, '
    + 'so the hidden state wins on cascade order and reduced-motion visitors get an empty page');
});

test('the reveal is actually used by the page, so none of the above is theatre', () => {
  const marks = PAGE.match(/data-reveal(?![-\w])/g) ?? [];
  assert.ok(marks.length >= 6,
    `only ${marks.length} elements on the landing are marked for reveal; the mechanism is unused`);
  assert.match(PAGE, /data-reveal-delay/,
    'nothing on the landing staggers, so collections arrive as one block');
});

test('nothing carries both a reveal and a scroll-driven animation over the same property', () => {
  // WHY: `.step` was marked for reveal and ALREADY had `animation: step-focus` on a `view()`
  // timeline animating opacity from 0.5 to 1. A CSS animation beats a normal declaration, so the
  // reveal's `opacity: 1` lost and three cards sat live at half opacity — visible, wrong, and
  // invisible to a test that only asks "is anything hidden". Two mechanisms must never own one
  // property on one element.
  const timeline = [...CSS.matchAll(/([^{}]+)\{([^{}]*animation-timeline\s*:[^{}]*)\}/g)]
    .flatMap(([, sel]) => sel.split(',').map((s) => s.trim()))
    .map((s) => s.replace(/^.*\s/, ''))
    .filter((s) => /^\.[-\w]+$/.test(s))
    .map((s) => s.slice(1));

  assert.ok(timeline.length > 0,
    'no scroll-driven animation was found in landing.css — this check would be vacuous');

  const clash = [];
  for (const cls of timeline) {
    const re = new RegExp(`class="[^"]*\\b${cls}\\b[^"]*"[^>]*\\bdata-reveal\\b`);
    const re2 = new RegExp(`data-reveal\\b[^>]*class="[^"]*\\b${cls}\\b`);
    if (re.test(PAGE) || re2.test(PAGE)) clash.push(cls);
  }
  assert.deepEqual(clash, [],
    `these carry both a scroll-driven animation and data-reveal, so two rules fight over one `
    + `opacity and the animation silently wins: ${clash.join(', ')}`);
});

/** Read a brace-balanced block starting at the `{` at `open`. */
function blockAt(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (!depth) return text.slice(open + 1, i); }
  }
  return '';
}
