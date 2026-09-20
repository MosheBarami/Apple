/**
 * A PHONE GETS FEWER LAYERS, NOT THE SAME LAYERS DRAWN WORSE.
 *
 * WHAT WENT WRONG AND HOW IT WENT UNSEEN FOR AS LONG AS IT DID. The owner's instruction for this
 * site includes, verbatim, "do not attempt to reproduce every expensive desktop effect" on a phone.
 * landing.css has carried a block SAYING that since the four capability stages were built, and it
 * was true of those four. The atmosphere behind them had never been looked at, and reading either
 * file would not have told anybody: Horizon.astro contained no width, no breakpoint and no
 * matchMedia other than the reduced-motion one, and there is no line to notice in a file where the
 * line is absent. It took two measurements against the LIVE origin on 2026-09-21 to see it:
 *
 *   `document.getAnimations()`  375x812 -> 56 running, of which 26 `stratum-drift`
 *                              1440x900 -> 72 running, of which 26 `stratum-drift`
 *   canvas backing store        375x812 at dpr 2 -> 750x1624  = 1.22 megapixels
 *                              1440x900 at dpr 1 -> 1425x900  = 1.28 megapixels
 *
 * The phone was repainting 95% of the desktop's pixel count every frame, forever, and running the
 * identical twenty-six composited transforms, on the device with the smaller battery.
 *
 * SO THIS FILE GUARDS THE SHAPE OF THE FIX RATHER THAN ITS NUMBERS, and the distinction is the
 * whole design of it. It does not assert "the phone is cheaper than the desktop" — a rule like that
 * is satisfied by drawing the same picture with sparser rails, which is precisely the failure the
 * instruction names. It asserts that NAMED LAYERS ARE ABSENT on a phone while the named layers that
 * carry the art direction are PRESENT AND UNCHANGED. Thin the floor to pass this and it goes red.
 *
 * IT EXECUTES THE COMPONENT'S SCRIPT. horizon-runs.test.mjs already explains why reading markup
 * cannot tell a live canvas from a dead one — a whole hero effect shipped to production with its
 * element, its class and its bundle all present and not one pixel moving. The same reasoning
 * applies twice as hard to an absence: "the sky is not drawn on a phone" is not a sentence any
 * amount of source-reading can confirm, because a `for..of` over an empty array and a `for..of`
 * over a hundred and ten motes are the same six characters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const HORIZON = readFileSync(join(SITE, 'src', 'components', 'Horizon.astro'), 'utf8');
const LANDING = readFileSync(join(SITE, 'src', 'styles', 'landing.css'), 'utf8');

/** Everything below the frontmatter fence: the component documents `<canvas>` above it. */
const BODY = HORIZON.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

function clientScript() {
  const match = /<script(?![^>]*\bis:inline\b)[^>]*>([\s\S]*?)<\/script>/i.exec(BODY);
  assert.ok(match, 'Horizon.astro has no client <script> — there is nothing to run');
  assert.ok(match[1].trim().length > 200, 'the extracted client script is too small to be the horizon');
  return match[1];
}

/**
 * Run the component against a recording 2D context at a given viewport, and return a census of the
 * layers it drew in one frame.
 *
 * `width` is answered to BOTH a real `(max-width: N)` query and the element's own rect, so a
 * component that decided on `innerWidth` instead of on the query would be measured the same way.
 */
function frame({ width = 1440, height = 900, dpr = 1, pointerAt = null } = {}) {
  const ops = [];
  const ctx = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 0 };
  const record = (name) => (...args) => { ops.push({ name, args }); };
  Object.assign(ctx, {
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
    arc: record('arc'),
    fill: record('fill'),
    createLinearGradient: () => ({ addColorStop() { return this; } }),
  });

  class HTMLCanvasElement {}
  const canvas = Object.assign(new HTMLCanvasElement(), {
    width: 300,
    height: 150,
    getContext: (kind) => (kind === '2d' ? ctx : null),
    getBoundingClientRect: () => ({ width, height, left: 0, top: 0 }),
  });

  const frames = [];
  const windowListeners = new Map();
  const add = (map) => (type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };

  /** A real evaluation of the one query family this component asks, against `width`. */
  const matchMedia = (query) => {
    const q = String(query);
    if (/prefers-reduced-motion\s*:\s*reduce/i.test(q)) return { matches: false, addEventListener() {} };
    const max = /\(\s*max-width\s*:\s*(\d+)px\s*\)/i.exec(q);
    if (max) return { matches: width <= Number(max[1]), addEventListener() {} };
    const min = /\(\s*min-width\s*:\s*(\d+)px\s*\)/i.exec(q);
    if (min) return { matches: width >= Number(min[1]), addEventListener() {} };
    return { matches: false, addEventListener() {} };
  };

  const sandbox = {
    document: { hidden: false, documentElement: {}, querySelector: (s) => (/canvas/.test(String(s)) ? canvas : null), addEventListener() {}, currentScript: null },
    HTMLCanvasElement,
    devicePixelRatio: dpr,
    innerWidth: width,
    innerHeight: height,
    Math,
    console,
    getComputedStyle: () => ({ getPropertyValue: (p) => (p === '--accent' ? '#00d492' : p === '--ground' ? '#050807' : '') }),
    matchMedia,
    addEventListener: add(windowListeners),
    requestAnimationFrame: (fn) => { frames.push(fn); return frames.length; },
    cancelAnimationFrame: () => {},
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(clientScript(), sandbox, { timeout: 5000, filename: 'Horizon.astro' });

  if (pointerAt) {
    for (const fn of windowListeners.get('pointermove') ?? []) fn({ clientX: pointerAt[0], clientY: pointerAt[1] });
  }

  // Drain the scheduled loop. Each call re-schedules, so take a fixed number of turns; the pointer
  // chase is EASED at 0.055 per frame and needs more than one to move anywhere measurable.
  ops.length = 0;
  for (let i = 0; i < 40; i++) {
    const next = frames.shift();
    if (!next) break;
    next(i * 16);
  }

  // The rails are the only strokes that start at the vanishing point: every one of them is
  // moveTo(vpx, vpy) then lineTo(edge, h). The rungs are horizontal and start at x = 0.
  const rails = [];
  for (let i = 0; i < ops.length - 2; i++) {
    if (ops[i].name !== 'moveTo' || ops[i + 1].name !== 'lineTo') continue;
    const [x0, y0] = ops[i].args;
    const [, y1] = ops[i + 1].args;
    if (Math.abs(y1 - y0) > 1) rails.push({ x0, y0 });
  }

  return {
    arcs: ops.filter((o) => o.name === 'arc').length,
    fillRects: ops.filter((o) => o.name === 'fillRect').length,
    strokes: ops.filter((o) => o.name === 'stroke').length,
    horizontals: ops.filter((o, i) => o.name === 'moveTo' && o.args[0] === 0 && ops[i + 1]?.name === 'lineTo').length,
    rails: rails.length,
    /** Where the rails converge: the vanishing point, as the frame actually placed it. */
    vanishingX: rails.length ? rails[0].x0 : null,
    total: ops.length,
  };
}

const DESKTOP = { width: 1440, height: 900, dpr: 1 };
const PHONE = { width: 375, height: 812, dpr: 2 };

test('the sky layer is drawn on a desktop and is absent on a phone', () => {
  const desktop = frame(DESKTOP);
  const phone = frame(PHONE);

  // An `arc` is issued by exactly one thing in this component: a mote of the sky.
  assert.ok(desktop.arcs > 50,
    `the desktop frame drew ${desktop.arcs} sky particles — the layer this test measures the absence of is not there to begin with`);
  assert.equal(phone.arcs, 0,
    `a phone frame drew ${phone.arcs} sky particles; the sky is meant to be absent at 375px, not smaller`);
});

test('the floor and the band are drawn at full strength on a phone, not thinned', () => {
  const desktop = frame(DESKTOP);
  const phone = frame(PHONE);

  // THIS IS THE HALF THAT STOPS THE CHEAP FIX. "Fewer effects" is satisfiable by deleting a layer
  // and is NOT satisfiable by drawing the same layer with fewer lines, so the rails and the rungs
  // are held to the desktop's own count.
  assert.ok(desktop.rails >= 30, `the desktop drew ${desktop.rails} rails — too few to be the floor`);
  assert.equal(phone.rails, desktop.rails,
    `the phone drew ${phone.rails} rails against the desktop's ${desktop.rails}; the floor is meant to be identical, and a sparser one is the same picture drawn worse`);
  assert.ok(phone.horizontals >= 1, 'the phone drew no ground cross-lines at all');
  assert.ok(phone.fillRects >= 2,
    `the phone issued ${phone.fillRects} fills; the glow band and its core are two of them and are the art direction of the whole page`);
});

test('the vanishing point chases a pointer on a desktop and ignores one on a phone', () => {
  const still = frame({ ...PHONE });
  const touched = frame({ ...PHONE, pointerAt: [340, 120] });
  assert.equal(touched.vanishingX, still.vanishingX,
    `a pointer at x=340 moved the phone's vanishing point from ${still.vanishingX} to ${touched.vanishingX}. `
    + 'pointermove fires for a finger, so this is the horizon swinging while somebody scrolls the page');

  const restStop = frame({ ...DESKTOP });
  const leaned = frame({ ...DESKTOP, pointerAt: [1380, 300] });
  assert.notEqual(leaned.vanishingX, restStop.vanishingX,
    'the desktop vanishing point did not move for a pointer — the lean is the reason this layer is a canvas at all, and this test would pass trivially if it were gone everywhere');
});

/* ------------------------------------------------------------------ the stylesheet's half --- */

/**
 * THE SELECTORS ONLY, WITH THE PROSE BESIDE THEM REMOVED — AND THE FIRST DRAFT OF THIS FILE PROVED
 * WHY. `\.light-column\b[^{}]*\{[^{}]*animation:\s*none` is an honest-looking way to ask "does this
 * block stop the light column", and it fired on the COMMENT explaining that the light column is
 * deliberately left alone: the phrase ".light-column" in the prose, then no brace for eighty lines,
 * then the `{ animation: none }` belonging to an entirely different selector. Every assertion below
 * was reading commentary rather than rules, and three of them were green for that reason.
 *
 * This site has the same scar in five other guards (`tests/lib/visible-copy.mjs` is the shared
 * version for prose); the rule it teaches is that a scanner which cannot tell a rule from the note
 * beside it will eventually be quieted by deleting the note.
 */
function rulesOnly(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, ' ');
}

/** The body of the first `@media` block whose condition matches `re`, braces balanced. */
function mediaBlock(css, re) {
  const at = css.search(re);
  if (at < 0) return null;
  const open = css.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

test('the twenty-six drifting strata stop on a phone, and the one whole-sky drift does not', () => {
  const phone = rulesOnly(mediaBlock(LANDING, /@media\s*\(\s*max-width\s*:\s*767px\s*\)/i) ?? '');
  assert.ok(phone.trim(), 'landing.css has no (max-width: 767px) block — the phone rules live there');

  // The bands are declared animated at the top level; the phone block is what takes it back.
  assert.match(rulesOnly(LANDING), /^\s*\.u-stratum,\s*\.stratum\s*\{\s*animation:\s*stratum-drift/m,
    'the strata are no longer animated at the top level, so there is nothing for the phone block to stop');
  assert.match(phone, /\.stratum\b[^{}]*\{[^{}]*animation:\s*none/,
    'the phone block does not stop .stratum — twenty-six independently phased transforms run at 375px exactly as they do at 1440px');
  assert.match(phone, /\.strata\b[^{}]*\{[^{}]*animation:\s*none/,
    'the phone block does not stop the .strata group sway');

  // FEWER, NOT NONE. If a later pass answers "expensive on a phone" by stopping everything, the
  // hero becomes a still image and this goes red — which is the correction, not a false alarm.
  assert.doesNotMatch(phone, /\.light-column\b[^{}]*\{[^{}]*animation:\s*none/,
    'the phone block stops the light column too; the composer is the focal object and the thing that lights it should still breathe');
  assert.doesNotMatch(phone, /\.atmosphere\s+svg\b[^{}]*\{[^{}]*animation:\s*none/,
    'the phone block stops the whole-sky drift as well, which leaves a phone with no moving atmosphere at all rather than with less of one');
});
