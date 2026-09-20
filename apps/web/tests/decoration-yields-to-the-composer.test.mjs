/**
 * THE DECORATION IS NOT ALLOWED TO BE LOUDEST BEHIND THE CONTROL.
 *
 * The workspace paints an accent mesh across the whole viewport at 0.2 opacity, masked so it fades
 * in rather than sitting flat. The mask used to be `linear-gradient(transparent 22%, #000 78%)`:
 * full strength from 78% of the way down, held to the floor. The composer floats in that band on a
 * 0.08-alpha surface, so the mesh was densest directly behind the one control the screen exists to
 * serve — and showed through it. In the screenshot the owner sent it does not read as atmosphere.
 * It reads as a green texture leaking into the bottom corner and being sliced by the composer's
 * edge, and "the whole thing looks broken" was a fair reading of it.
 *
 * WHAT THIS ASSERTS IS THE RULE, NOT THE GRADIENT. It parses the mask's own stops and checks that
 * the decoration has faded before the region where the composer lives. A different gradient, a
 * different number of stops, a different technique entirely — all fine, as long as the bottom of
 * the screen belongs to the control rather than to the scenery.
 *
 * It deliberately does NOT assert an opacity. Dimming the mesh everywhere was the other way to fix
 * this and the wrong one: it would have thinned the atmosphere in the empty middle of the workspace,
 * which is the one place it is doing useful work.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const CSS = readFileSync(join(WEB, 'src', 'design', 'system.css'), 'utf8');

/** Strip comments so a described gradient cannot be mistaken for a declared one. */
const CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');

/** The `.studio-atmosphere__mesh` declaration block. */
function meshRule() {
  const m = /\.studio-atmosphere__mesh\s*\{([^{}]*)\}/.exec(CODE);
  assert.ok(m, 'no .studio-atmosphere__mesh rule — this check would be vacuous');
  return m[1];
}

/**
 * The mask's stops as {percent, visible} pairs, in order. A stop is "visible" when it is not
 * transparent — the colour itself does not matter, only whether the layer shows there.
 */
function maskStops(decl) {
  const mask = /mask-image\s*:\s*linear-gradient\(([^)]*(?:\([^)]*\)[^)]*)*)\)/.exec(decl);
  assert.ok(mask, 'the mesh has no linear-gradient mask, so nothing limits where it paints');
  const parts = mask[1].split(',').map((p) => p.trim()).filter(Boolean);
  const stops = [];
  for (const part of parts) {
    const pct = /(-?[\d.]+)%/.exec(part);
    if (!pct) continue; // a bare direction like `to bottom`
    stops.push({ percent: Number(pct[1]), visible: !/^transparent\b|rgba\([^)]*,\s*0\s*\)/.test(part) });
  }
  assert.ok(stops.length >= 2, `parsed ${stops.length} mask stops; the parse has drifted from the CSS`);
  return stops;
}

/** How visible the mask is at a given percentage down, interpolating between stops. */
function visibilityAt(stops, percent) {
  let prev = stops[0];
  for (const stop of stops) {
    if (percent <= stop.percent) {
      if (stop === prev) return stop.visible ? 1 : 0;
      const span = stop.percent - prev.percent || 1;
      const t = (percent - prev.percent) / span;
      const from = prev.visible ? 1 : 0;
      const to = stop.visible ? 1 : 0;
      return from + (to - from) * t;
    }
    prev = stop;
  }
  return prev.visible ? 1 : 0;
}

test('the mask is parsed from the real rule, so nothing below passes over an empty list', () => {
  const stops = maskStops(meshRule());
  assert.ok(stops.some((s) => s.visible), 'no stop is visible — the mesh would never paint at all');
  assert.ok(stops.some((s) => !s.visible), 'no stop is transparent — the mask is not limiting anything');
});

test('the mesh has faded out before the band the composer occupies', () => {
  const stops = maskStops(meshRule());

  // The composer floats in the bottom quarter. Measured on the deployed workspace at 790px tall:
  // the composer's own box starts around 76% of the viewport and runs to the floor.
  for (const depth of [80, 88, 95, 100]) {
    const v = visibilityAt(stops, depth);
    assert.ok(v < 0.35,
      `at ${depth}% down the screen the decorative mesh is ${(v * 100).toFixed(0)}% visible. That is `
      + 'the band the composer floats in, on a nearly transparent surface — the scenery is showing '
      + 'through the primary control.');
  }
});

test('and it is still doing its job in the middle of the workspace', () => {
  const stops = maskStops(meshRule());
  // Fixing the above by dimming the whole layer, or by masking it away everywhere, would trade one
  // defect for a blanker screen. The empty middle of the thread is where the atmosphere earns its
  // place, so it must remain substantially visible there.
  const mid = visibilityAt(stops, 48);
  assert.ok(mid > 0.75,
    `the mesh is only ${(mid * 100).toFixed(0)}% visible at mid-screen. It was moved off the `
    + 'composer, not deleted — a workspace with nothing behind the thread reads as unfinished.');
});

test('the still state stops the motion without hiding the layer', () => {
  // `is-still` is applied for prefers-reduced-motion AND for a hidden tab. It must stop animation
  // and nothing else: a visitor who asked for less motion is owed the composition standing still,
  // and a backgrounded tab must look identical the moment it comes forward.
  const still = /\.studio-atmosphere\.is-still[^{]*\{([^{}]*)\}/.exec(CODE);
  assert.ok(still, 'no .is-still rule — the atmosphere animates for everyone, always');
  assert.match(still[1], /animation\s*:\s*none/, 'the still state does not stop the animation');
  assert.doesNotMatch(still[1], /display\s*:\s*none|opacity\s*:\s*0(?!\.)/,
    'the still state hides the atmosphere instead of freezing it, so reduced motion gets a blank panel');
});
