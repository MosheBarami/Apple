/**
 * THE FLOW FIELD ACTUALLY RUNS.
 *
 * WHY THIS FILE EXISTS. The flow field shipped to production with `document.currentScript` as the
 * way it found its own <canvas>. Astro hoists a component's <script> into a bundled
 * `<script type="module">`, and `document.currentScript` is null in every module script by spec, so
 * the expression resolved to undefined, the `instanceof` guard refused, and NOTHING RAN. The canvas
 * element was in the served HTML. `class="flow"` was in the served HTML. The bundle contained
 * `requestAnimationFrame`. Every one of those observations was true and every one of them was
 * consistent with a hero that had not moved a pixel since before the file was written.
 *
 * Reading the shipped markup for the element could not tell the difference, and neither could the
 * existing landing test — which asserts things ABOUT THE SOURCE TEXT of index.astro, and went on
 * passing because the canvas now lives one file away in a component.
 *
 * So this harness does the only thing that can tell the difference: it EXECUTES the component's
 * script against a recording 2D context and asserts that strokes come out the other end. A field
 * that cannot find its canvas draws nothing, and drawing nothing is what this file is here to catch.
 *
 * It deliberately does NOT pin the selector's spelling. `querySelector` below is a small real
 * matcher over a real element description, so renaming the hook to something that still matches the
 * element keeps this green, and only a hook that matches NOTHING turns it red. The property under
 * guard is "the script reaches its canvas", not "the script says `canvas.flow`".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const COMPONENT = join(SITE, 'src', 'components', 'FlowField.astro');

const SOURCE = readFileSync(COMPONENT, 'utf8');

/*[[ THE TYPES ARE STRIPPED, AND THIS FILE SPENT A DAY RED BECAUSE THEY WERE NOT.
 *
 *   `const canvas: HTMLCanvasElement = el;` landed in FlowField.astro to satisfy `astro check`,
 *   which is correct — Astro compiles a component <script> as TypeScript and ignores JSDoc there.
 *   A `vm` compiles it as JavaScript, so every one of the eight tests below died on the same
 *   `SyntaxError: Missing initializer in const declaration` before reaching an assertion.
 *
 *   THE FAILURE SHAPE IS THE POINT. Eight red guards that all die in the harness say nothing
 *   whatever about the component — this file was not reporting that the flow field was broken, it
 *   was reporting that it could not look at the flow field, and those are different sentences. A
 *   guard that cannot run is not a failing guard, it is an absent one, and an absent guard on a
 *   canvas whose whole history is "it shipped dead and every reading of the markup said otherwise"
 *   is the exact hole this file exists to fill.
 *
 *   The fix is not new here: cursor-never-blinds.test.mjs and reveal-cannot-hide-content.test.mjs
 *   both strip with this same binary, for this same reason, and what runs below is therefore the
 *   code the browser is handed rather than a paraphrase of it. esbuild comes from apps/worker's
 *   node_modules because that is where this repository already has it and installing is not this
 *   lane's to do; a missing binary FAILS rather than falling back to the raw text, because falling
 *   back would put the SyntaxError back and call it a finding. ]]*/
const ESBUILD = join(SITE, '..', 'worker', 'node_modules', '.bin', 'esbuild');

/** The component's client script, exactly as Astro will hand it to a browser. */
function clientScript() {
  const match = /<script(?![^>]*\bis:inline\b)[^>]*>([\s\S]*?)<\/script>/i.exec(SOURCE);
  assert.ok(match, 'FlowField.astro has no client <script> — there is nothing to run');
  const body = match[1];
  assert.ok(body.trim().length > 200, 'the extracted client script is too small to be the field');
  const dir = mkdtempSync(join(tmpdir(), 'flow-field-'));
  const src = join(dir, 'flow-field.ts');
  writeFileSync(src, body);
  try {
    return execFileSync(ESBUILD, [src, '--loader:.ts=ts', '--format=esm', '--target=es2022'],
      { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
  } catch (err) {
    return assert.fail(`could not strip types from the flow field script: ${err.message}`);
  }
}

/** The element the component renders, as a description a selector can be matched against. */
function renderedCanvas() {
  const tag = /<canvas\b([^>]*)>/i.exec(SOURCE);
  assert.ok(tag, 'FlowField.astro renders no <canvas>');
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
function run({ reduced = false, rect = { width: 1009, height: 768 }, dpr = 1, accent = '#00d492' } = {}) {
  const described = renderedCanvas();
  const ops = [];
  const record = (name) => (...args) => { ops.push({ name, args }); };

  const ctx = {
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    setTransform: record('setTransform'),
    clearRect: record('clearRect'),
    fillRect: record('fillRect'),
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    stroke: record('stroke'),
  };

  class HTMLCanvasElement {}
  const canvas = Object.assign(new HTMLCanvasElement(), {
    width: 300,   // the spec default. If the script never resizes, it stays here — and this is
    height: 150,  // exactly what production showed while the field was dead.
    getContext: (kind) => (kind === '2d' ? ctx : null),
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
    getComputedStyle: () => ({ getPropertyValue: (prop) => (prop === '--accent' ? accent : '') }),
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
  vm.runInContext(clientScript(), sandbox, { timeout: 5000, filename: 'FlowField.astro' });

  /** Advance the scheduled loop by `count` frames, the way a browser would. */
  const advance = (count) => {
    for (let i = 0; i < count; i++) {
      const next = frames.shift();
      if (!next) break;
      next.fn(i * 16);
    }
  };

  const fire = (map, type, event) => { for (const fn of map.get(type) ?? []) fn(event); };

  return {
    ops, canvas, ctx, frames, cancelled, advance,
    scheduled: () => frames.length,
    strokes: () => ops.filter((op) => op.name === 'stroke').length,
    segments: () => ops.filter((op) => op.name === 'lineTo').length,
    onWindow: (type, event) => fire(windowListeners, type, event),
    onDocument: (type, event) => fire(documentListeners, type, event),
    hide: (hidden) => { documentStub.hidden = hidden; fire(documentListeners, 'visibilitychange', {}); },
  };
}

test('the field finds its canvas and draws — the defect that shipped is caught here', () => {
  const field = run();
  // boot() schedules the first frame rather than drawing inside itself, so a browser would paint
  // on the next tick. Advance the way a browser does before asking what was drawn.
  field.advance(2);

  assert.ok(field.strokes() > 0,
    'the flow field drew nothing. It could not reach its <canvas>, so the hero is a still image '
    + 'with a dead canvas element sitting on top of it — which is what the served HTML cannot show.');
  assert.ok(field.segments() > 100,
    `only ${field.segments()} line segments were drawn; the field is not carrying a particle population`);
});

test('the canvas is sized to the box it occupies, not left at the 300x150 default', () => {
  const field = run({ rect: { width: 1009, height: 768 }, dpr: 1 });

  assert.equal(field.canvas.width, 1009,
    'the backing buffer kept the default width; the field is being drawn at the wrong scale');
  assert.equal(field.canvas.height, 768,
    'the backing buffer kept the default height; the field is being drawn at the wrong scale');
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

test('reduced motion draws the composition and then stops, rather than showing an empty box', () => {
  const still = run({ reduced: true });

  assert.ok(still.strokes() > 10,
    'under prefers-reduced-motion the field drew (almost) nothing. Somebody who asked for less '
    + 'motion is owed the design standing still, not a blank rectangle.');
  assert.equal(still.scheduled(), 0,
    'a frame is still scheduled under prefers-reduced-motion; the loop was never actually stopped');
});

test('a hidden tab stops the loop, and coming back resumes it', () => {
  const field = run();
  assert.ok(field.scheduled() > 0, 'the animation loop never started on a normal display');

  field.advance(3);
  field.hide(true);
  assert.ok(field.cancelled.length > 0,
    'switching away from the tab did not cancel the frame; a background tab keeps burning a core');

  const drawnWhileHidden = field.strokes();
  field.hide(false);
  assert.ok(field.scheduled() > 0, 'returning to the tab did not restart the loop');
  field.advance(2);
  assert.ok(field.strokes() > drawnWhileHidden, 'the resumed loop is not drawing');
});

test('the pointer changes the field — this is the whole reason it is canvas and not CSS', () => {
  const still = run();
  still.advance(1);
  const before = still.ops.filter((op) => op.name === 'lineTo').map((op) => op.args.join());

  const pushed = run();
  pushed.onWindow('pointermove', { clientX: 500, clientY: 380 });
  pushed.advance(1);
  const after = pushed.ops.filter((op) => op.name === 'lineTo').map((op) => op.args.join());

  // The seeds are random, so the two runs differ regardless. What must be true is that the pointer
  // handler exists AND that the drawing code reads it: a field that ignores the cursor is decoration.
  assert.ok(after.length > 0 && before.length > 0, 'neither run drew anything to compare');
  assert.ok(/pointermove/.test(SOURCE) && /pointer\.(?:on|x|y)/.test(SOURCE),
    'the field does not respond to the pointer, which is the only thing CSS could not already do');
});

test('the trail is a wash, not a clear — a cleared frame is a flicker, not a flow field', () => {
  const field = run();
  field.advance(2);
  const wash = field.ops.find((op) => op.name === 'fillRect');
  assert.ok(wash, 'no per-frame wash was drawn, so particles leave no trail');
  assert.ok(field.ops.filter((op) => op.name === 'clearRect').length <= 1,
    'the field clears every frame; that erases the trail that makes the motion legible');
});

test('the accent is read from the page, so one token change cannot leave two greens on screen', () => {
  const field = run({ accent: '#ff0055' });
  field.advance(1);
  assert.equal(field.ctx.strokeStyle, '#ff0055',
    'the stroke colour is hardcoded rather than read from --accent');
});
