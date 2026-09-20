/**
 * THE HORIZON ACTUALLY RUNS.
 *
 * WHY THIS FILE EXISTS, and it is the same reason as its sibling `flow-field-runs.test.mjs`. The
 * flow field shipped to production with `document.currentScript` as the way it found its <canvas>.
 * Astro hoists a component's <script> into a bundled `<script type="module">`, and
 * `document.currentScript` is null in every module script by spec, so the expression resolved to
 * undefined, the `instanceof` guard refused, and NOTHING RAN. The canvas element was in the served
 * HTML. The class was in the served HTML. The bundle contained `requestAnimationFrame`. Every one of
 * those observations was true and every one of them was consistent with a hero that had not moved a
 * pixel since before the file was written.
 *
 * Reading the shipped markup cannot tell the difference. So this harness does the only thing that
 * can: it EXECUTES Horizon.astro's client script against a recording 2D context and asserts that a
 * composition comes out the other end — a floor, a band, a wash and a sky.
 *
 * It deliberately does NOT pin the selector's spelling. `querySelector` below is a small real
 * matcher over a real element description, so renaming the hook to something that still matches the
 * element keeps this green, and only a hook that matches NOTHING turns it red. The property under
 * guard is "the script reaches its canvas", not "the script says `canvas.horizon`".
 *
 * ONE DIFFERENCE FROM THE SIBLING, and it is a defect the sibling would have had if its prose had
 * been worded differently: the component's own documentation talks ABOUT `<canvas>`, in the
 * frontmatter, above the markup. A scanner that reads prose finds the account of the element before
 * the element. Comments and the frontmatter fence are stripped before anything is located here, for
 * the same reason four other scanners in this repository already do it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = join(SITE, 'src', 'components', 'Horizon.astro');

const SOURCE = readFileSync(COMPONENT, 'utf8');

/**
 * Everything below the frontmatter fence. The component's documentation quotes both
 * `<script type="module">` and `<canvas>` — it is explaining the defect this file guards — and a
 * scanner that reads the whole source finds the ACCOUNT of the element before the element. Reading
 * the raw file extracted a "client script" that began in a comment and would not parse.
 */
const BODY = SOURCE.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');

/** The same, with every comment removed as well: for locating elements, never for running code. */
const MARKUP = BODY
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ');

/** The component's client script, exactly as Astro will hand it to a browser. */
function clientScript() {
  const match = /<script(?![^>]*\bis:inline\b)[^>]*>([\s\S]*?)<\/script>/i.exec(BODY);
  assert.ok(match, 'Horizon.astro has no client <script> — there is nothing to run');
  const body = match[1];
  assert.ok(body.trim().length > 200, 'the extracted client script is too small to be the horizon');
  return body;
}

/** The element the component renders, as a description a selector can be matched against. */
function renderedCanvas() {
  const tag = /<canvas\b([^>]*)>/i.exec(MARKUP);
  assert.ok(tag, 'Horizon.astro renders no <canvas>');
  const attrs = tag[1];
  const classAttr = /\bclass=["']([^"']*)["']/i.exec(attrs);
  return {
    tag: 'canvas',
    classes: new Set((classAttr?.[1] ?? '').split(/\s+/).filter(Boolean)),
    attrs,
  };
}

/**
 * Run the component script in a sandbox that behaves like a browser in the ways the script uses,
 * and record everything it draws and schedules.
 */
function run({
  reduced = false,
  rect = { width: 1009, height: 768 },
  dpr = 1,
  accent = '#00d492',
  ground = '#050807',
  context = true,
} = {}) {
  const described = renderedCanvas();
  const ops = [];
  const gradients = [];

  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
  };
  // Every recorded op carries the paint state it was issued under, because "what colour was that
  // drawn in" is a question about the moment of the call and not about the end of the frame.
  const record = (name) => (...args) => {
    ops.push({ name, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle, alpha: ctx.globalAlpha });
  };
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
    createLinearGradient: (...args) => {
      const gradient = {
        args,
        stops: [],
        addColorStop(offset, color) { this.stops.push({ offset, color }); return this; },
      };
      gradients.push(gradient);
      return gradient;
    },
  });

  class HTMLCanvasElement {}
  const canvas = Object.assign(new HTMLCanvasElement(), {
    width: 300,   // the spec default. If the script never resizes, it stays here — and this is
    height: 150,  // exactly what production showed while the flow field was dead.
    getContext: (kind) => (context && kind === '2d' ? ctx : null),
    getBoundingClientRect: () => ({ width: rect.width, height: rect.height, left: 0, top: 0 }),
  });

  /** A small real selector matcher, so this asserts reachability rather than spelling. */
  const querySelector = (selector) => {
    const parsed = /^([a-zA-Z]+)?((?:\.[-\w]+)*)$/.exec(String(selector).trim());
    if (!parsed) return null;
    const [, tag, classPart] = parsed;
    if (tag && tag.toLowerCase() !== described.tag) return null;
    const wanted = classPart ? classPart.slice(1).split('.') : [];
    return wanted.every((name) => described.classes.has(name)) ? canvas : null;
  };

  const frames = [];
  const cancelled = [];
  let nextFrame = 1;
  const windowListeners = new Map();
  const documentListeners = new Map();
  const mediaListeners = [];
  const add = (map) => (type, fn) => { if (!map.has(type)) map.set(type, []); map.get(type).push(fn); };

  const documentStub = {
    hidden: false,
    documentElement: {},
    querySelector,
    addEventListener: add(documentListeners),
    // Present and null, exactly as a module script sees it. The original defect is reproducible.
    currentScript: null,
  };

  const sandbox = {
    document: documentStub,
    HTMLCanvasElement,
    devicePixelRatio: dpr,
    Math,
    console,
    getComputedStyle: () => ({
      getPropertyValue: (prop) => {
        if (prop === '--accent') return accent;
        if (prop === '--ground') return ground;
        return '';
      },
    }),
    matchMedia: (query) => ({
      matches: /prefers-reduced-motion\s*:\s*reduce/i.test(String(query)) ? reduced : false,
      addEventListener: (_type, fn) => mediaListeners.push(fn),
    }),
    addEventListener: add(windowListeners),
    requestAnimationFrame: (fn) => { const id = nextFrame++; frames.push({ id, fn }); return id; },
    cancelAnimationFrame: (id) => { cancelled.push(id); },
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(clientScript(), sandbox, { timeout: 5000, filename: 'Horizon.astro' });

  /** Advance the scheduled loop by `count` frames, the way a browser would. */
  const advance = (count) => {
    for (let i = 0; i < count; i++) {
      const next = frames.shift();
      if (!next) break;
      next.fn(i * 16);
    }
  };

  const fire = (map, type, event) => { for (const fn of map.get(type) ?? []) fn(event); };

  /** Every stroked segment in a run of ops, as {from, to} pairs. */
  const segmentsIn = (list) => {
    const out = [];
    let from = null;
    for (const op of list) {
      if (op.name === 'moveTo') from = op.args;
      else if (op.name === 'lineTo' && from) out.push({ from, to: op.args, alpha: op.alpha, style: op.strokeStyle });
    }
    return out;
  };
  const segments = () => segmentsIn(ops);

  /**
   * The segments of the MOST RECENT frame alone.
   *
   * `ops` is cumulative, and that fact already produced a wrong reading here: asking for the
   * commonest line origin across eight frames returns the origin of whichever frame drew first,
   * because every frame contributes the same number of rails from its own — moving — vanishing
   * point. A test for "the point moved" that averages over the movement cannot see it.
   */
  const frame = () => {
    let start = 0;
    for (let i = ops.length - 1; i >= 0; i--) {
      if (ops[i].name === 'clearRect') { start = i; break; }
    }
    return segmentsIn(ops.slice(start));
  };

  return {
    ops, canvas, ctx, frames, cancelled, advance, gradients, segments, frame,
    scheduled: () => frames.length,
    count: (name) => ops.filter((op) => op.name === name).length,
    onWindow: (type, event) => fire(windowListeners, type, event),
    onDocument: (type, event) => fire(documentListeners, type, event),
    hide: (hidden) => { documentStub.hidden = hidden; fire(documentListeners, 'visibilitychange', {}); },
  };
}

test('the horizon finds its canvas and draws — the defect that shipped is caught here', () => {
  const sky = run();
  // boot() schedules the first frame rather than drawing inside itself, so a browser would paint on
  // the next tick. Advance the way a browser does before asking what was drawn.
  sky.advance(2);

  assert.ok(sky.count('stroke') > 0,
    'the horizon drew nothing. It could not reach its <canvas>, so the page is whatever was behind '
    + 'it with a dead canvas element on top — which is what the served HTML cannot show.');
  assert.ok(sky.segments().length >= 30,
    `only ${sky.segments().length} line segments were drawn; there is no perspective grid here`);
  assert.ok(sky.count('arc') > 20,
    `only ${sky.count('arc')} particles were drawn; the sky above the horizon is empty`);
  assert.ok(sky.count('fillRect') > 0, 'no glow band was filled at the horizon');
});

test('the grid is a perspective grid: rails converge on one point, rungs span the width', () => {
  const sky = run({ rect: { width: 1000, height: 800 } });
  sky.advance(1);
  const segs = sky.frame();

  // Rails: many segments sharing one start point, fanning out to different ends. That shared point
  // IS the vanishing point, and a grid whose lines do not share one is not in perspective.
  const apex = new Map();
  for (const s of segs) {
    const key = `${Math.round(s.from[0])},${Math.round(s.from[1])}`;
    apex.set(key, (apex.get(key) ?? 0) + 1);
  }
  const [point, fan] = [...apex.entries()].sort((a, b) => b[1] - a[1])[0];
  assert.ok(fan >= 10,
    `the widest fan of lines from a single point is ${fan}; the rails are not converging anywhere`);
  const [, vy] = point.split(',').map(Number);

  // Rungs: horizontal, full width, and all of them below the vanishing point's line.
  const rungs = segs.filter((s) => s.from[1] === s.to[1]);
  assert.ok(rungs.length >= 3, `only ${rungs.length} horizontal ground lines; the floor has no depth`);
  for (const rung of rungs) {
    assert.ok(rung.from[1] >= vy - 1,
      `a ground line was drawn at y=${rung.from[1]}, above the horizon at y=${vy} — the floor is in the sky`);
  }
  // Depth: the gaps between rungs must GROW toward the viewer. Even spacing is a ladder, not a plane.
  const ys = rungs.map((r) => r.from[1]).sort((a, b) => a - b);
  const gaps = ys.slice(1).map((y, i) => y - ys[i]);
  assert.ok(gaps.length >= 2 && gaps[gaps.length - 1] > gaps[0],
    `rung spacing ${gaps.map((g) => Math.round(g)).join(', ')} does not open out toward the viewer`);
});

test('the decoration is thinnest where a centred control sits, and densest on the empty floor', () => {
  // apps/web/tests/decoration-yields-to-the-composer.test.mjs records the rule the hard way: a mesh
  // that was densest directly behind the composer read, correctly, as broken. A hero whose content
  // is centred puts its composer around 0.51h to 0.65h. Every grid line — the densest thing this
  // component draws — must be below that band.
  const h = 800;
  const sky = run({ rect: { width: 1000, height: h } });
  sky.advance(1);

  // Not vacuous: a horizon that drew nothing at all would satisfy "nothing strayed upward".
  assert.ok(sky.segments().length >= 30, 'no grid was drawn, so this check would pass on an empty canvas');

  const strayed = sky.segments().filter((s) => s.from[1] < h * 0.68 && s.to[1] < h * 0.68);
  assert.deepEqual(strayed.map((s) => `${s.from.join()} -> ${s.to.join()}`), [],
    'grid lines are being drawn up into the band where a centred primary control lives; the '
    + 'scenery is loudest behind the one object the screen exists to serve');
});

test('the canvas is sized to the box it occupies, not left at the 300x150 default', () => {
  const sky = run({ rect: { width: 1009, height: 768 }, dpr: 1 });

  assert.equal(sky.canvas.width, 1009,
    'the backing buffer kept the default width; the horizon is being drawn at the wrong scale');
  assert.equal(sky.canvas.height, 768,
    'the backing buffer kept the default height; the horizon is being drawn at the wrong scale');
});

test('device pixel ratio is honoured and capped, so a 3x phone does not render nine times the pixels', () => {
  const plain = run({ rect: { width: 400, height: 300 }, dpr: 1 });
  assert.equal(plain.canvas.width, 400, 'a 1x display should get a 1:1 buffer');

  const retina = run({ rect: { width: 400, height: 300 }, dpr: 2 });
  assert.equal(retina.canvas.width, 800, 'a 2x display should get a 2x buffer');

  const excessive = run({ rect: { width: 400, height: 300 }, dpr: 4 });
  assert.equal(excessive.canvas.width, 800,
    'devicePixelRatio is not capped at 2 — a high-density screen pays for pixels nobody can see');
});

test('reduced motion draws ONE complete composition and then stops, rather than showing an empty box', () => {
  const still = run({ reduced: true });

  assert.equal(still.scheduled(), 0,
    'a frame is still scheduled under prefers-reduced-motion; the loop was never actually stopped');
  assert.equal(still.count('clearRect'), 1,
    `the still path drew ${still.count('clearRect')} frames; prefers-reduced-motion asks for one`);

  // COMPLETE, not merely non-empty. Somebody who asked for less motion is owed the design standing
  // still, and every part of it: the floor, the band at the horizon and the sky above it.
  assert.ok(still.segments().length >= 30, 'the still frame has no perspective grid');
  assert.ok(still.count('fillRect') >= 2, 'the still frame has no glow band and no ground wash');
  assert.ok(still.count('arc') > 20, 'the still frame has an empty sky');
});

test('a hidden tab stops the loop, and coming back resumes it', () => {
  const sky = run();
  assert.ok(sky.scheduled() > 0, 'the animation loop never started on a normal display');

  sky.advance(3);
  sky.hide(true);
  assert.ok(sky.cancelled.length > 0,
    'switching away from the tab did not cancel the frame; a background tab keeps burning a core');

  const drawnWhileHidden = sky.count('stroke');
  sky.hide(false);
  assert.ok(sky.scheduled() > 0, 'returning to the tab did not restart the loop');
  sky.advance(2);
  assert.ok(sky.count('stroke') > drawnWhileHidden, 'the resumed loop is not drawing');
});

test('the grid scrolls toward the reader — a still grid is a background image with extra steps', () => {
  const rungs = (sky) => sky.frame().filter((s) => s.from[1] === s.to[1]).map((s) => s.from[1]);
  const sky = run({ rect: { width: 1000, height: 800 } });
  sky.advance(1);
  const first = rungs(sky);

  sky.advance(30);
  const later = rungs(sky);

  assert.ok(first.length && later.length, 'no ground lines to compare between frames');
  assert.notDeepEqual(later, first,
    'the ground lines are at identical heights 30 frames apart; the grid is not moving at all');
});

test('the pointer moves the vanishing point — this is the whole reason it is canvas and not an image', () => {
  const apexOf = (sky) => {
    const tally = new Map();
    for (const s of sky.frame()) {
      const key = `${s.from[0]},${s.from[1]}`;
      tally.set(key, (tally.get(key) ?? 0) + 1);
    }
    return [...tally.entries()].sort((a, b) => b[1] - a[1])[0][0];
  };

  const idle = run({ rect: { width: 1000, height: 800 } });
  idle.advance(8);
  const centred = apexOf(idle);

  const pushed = run({ rect: { width: 1000, height: 800 } });
  pushed.onWindow('pointermove', { clientX: 940, clientY: 240 });
  pushed.advance(8);
  const leaned = apexOf(pushed);

  assert.notEqual(leaned, centred,
    `the vanishing point sat at ${centred} whether or not the cursor moved; the horizon ignores the `
    + 'pointer, which is the only thing a fixed background image could not already do');
  assert.ok(Number(leaned.split(',')[0]) > Number(centred.split(',')[0]),
    'the vanishing point moved away from a cursor on the right rather than toward it');

  // And it EASES rather than snapping: one frame must not already be at the destination.
  const nudged = run({ rect: { width: 1000, height: 800 } });
  nudged.onWindow('pointermove', { clientX: 940, clientY: 240 });
  nudged.advance(1);
  const early = Number(apexOf(nudged).split(',')[0]);
  const settled = Number(leaned.split(',')[0]);
  assert.ok(early > 500 && early < settled,
    `the vanishing point jumped straight to ${early}; it is snapping to the cursor, not easing`);
});

test('the frame is cleared, not washed — a horizon that smears is fog', () => {
  const sky = run();
  sky.advance(4);
  assert.ok(sky.count('clearRect') >= 4,
    'the horizon is not cleared every frame, so the grid smears into its own previous positions');
});

test('the accent and the ground are read from the page, so one token change cannot leave two greens', () => {
  const sky = run({ accent: '#ff0055', ground: '#102030' });
  sky.advance(1);

  const strokes = sky.ops.filter((op) => op.name === 'stroke');
  assert.ok(strokes.length > 0, 'nothing was stroked, so there is no colour to inspect');
  for (const op of strokes) {
    assert.match(String(op.strokeStyle), /255\s*,\s*0\s*,\s*85/,
      `a grid line was stroked in ${op.strokeStyle}; the accent is hardcoded rather than read from --accent`);
  }

  const stops = sky.gradients.flatMap((g) => g.stops.map((s) => s.color)).join(' ');
  assert.match(stops, /255\s*,\s*0\s*,\s*85/, 'the glow band does not use the page accent');
  assert.match(stops, /16\s*,\s*32\s*,\s*48/,
    'the horizon does not read --ground, so its falloff cannot follow the theme onto a light page');
});

test('without a 2D context nothing is drawn at all, and whatever is behind shows through', () => {
  const sky = run({ context: false });
  assert.equal(sky.ops.length, 0, 'the script drew through a context it does not have');
  assert.equal(sky.scheduled(), 0, 'a loop was scheduled for a canvas that cannot be painted');
});

test('the layer is decoration: hidden from assistive technology and untouchable by the pointer', () => {
  const described = renderedCanvas();
  assert.match(described.attrs, /aria-hidden=["']true["']/i,
    'the horizon announces itself to a screen reader; it is scenery and carries no information');
  assert.match(MARKUP, /pointer-events\s*:\s*none/i,
    'the horizon is not pointer-events: none, so a full-viewport canvas is eating every click');
});
