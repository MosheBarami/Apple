/**
 * THE BAR DREW THE SAME PICTURE FOR "STILL ASKING" AND FOR "IT DID NOT ANSWER".
 *
 * usage-meter.tsx renders an empty bar for both, and says in a comment beside the two class names
 * that this is fine because they differ: "The class differs so a load reads as a load and a failure
 * reads as a failure." The classes did differ. Neither had a rule anywhere in the bundle —
 * `.gx-usage__fill.is-pending` had none at all, and the only `.is-unknown` selector in the tree
 * belongs to `.rk__health` in a different component.
 *
 * MEASURED, in Chromium, through the real component in the real rail, by forcing each state at its
 * one call site (`quotaPending` / `quotaFailed` in components/layout.tsx):
 *
 *   BEFORE  pending  bar 291×3 rgb(61,59,58) · fill width 0 · animation none
 *   BEFORE  unknown  bar 291×3 rgb(61,59,58) · fill width 0 · animation none
 *
 * The same picture, to the pixel, for "we have not asked yet" and "the usage service did not
 * answer" — which is the merged state this repository has now found five times, on the panel that
 * tells a customer how much they have left.
 *
 *   AFTER   pending  fill 87.3×3 rgb(189,186,182), animation-name gx-usage-sweep
 *   AFTER   unknown  bar repeating-linear-gradient(90deg, rgb(61,59,58) 0 2px, transparent 2px 5px)
 *   AFTER   pending, prefers-reduced-motion: fill display:none, bar dotted in rgb(189,186,182)
 *   AFTER   unknown, prefers-reduced-motion: unchanged, dotted in rgb(61,59,58)
 *   AFTER   light theme: pending sweeps rgb(85,85,85) on rgb(221,221,221); unknown dots rgb(221,221,221)
 *
 * WHAT IS ASSERTED HERE is the property that makes those pictures different: neither state may be
 * drawn as a LENGTH (a bar at some width is a claim about a balance nobody has), and the two
 * treatments may not be the same treatment — including under reduced motion, where the thing that
 * distinguished them was switched off. The geometry above is evidence; apps/web mounts nothing in
 * `node --test`, and that bound is stated rather than papered over.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (...p) => readFileSync(join(WEB, 'src', ...p), 'utf8');
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CSS = strip(read('components', 'usage-meter.css'));
const TSX = strip(read('components', 'usage-meter.tsx'));
/** The declaration block for a selector, or '' when nothing draws it. */
const ruleFor = (sel) => {
  const m = new RegExp(`${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^{}]*)\\}`).exec(CSS);
  return m ? m[1] : '';
};
/** Everything inside the reduced-motion block. */
const REDUCED = (/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(CSS) ?? ['', ''])[1];

test('the component still marks the two states apart in the markup', () => {
  // If this ever stops being true the rules below are aimed at nothing, and a green test would be
  // saying the opposite of the truth.
  assert.match(TSX, /gx-usage__fill is-pending/);
  assert.match(TSX, /gx-usage__fill is-unknown/);
  assert.match(TSX, /className=\{`gx-usage is-\$\{v\.tone\}`\}/, 'the tone must reach the root, or is-unknown has nothing to hang off');
});

test('WAITING IS DRAWN, AND IT IS DRAWN AS MOTION RATHER THAN AS A LENGTH', () => {
  const pending = ruleFor('.gx-usage__fill.is-pending');
  assert.notEqual(pending, '', '.gx-usage__fill.is-pending has no rule — a load looks like an empty bar');
  assert.match(pending, /animation:\s*gx-usage-sweep/, 'a segment that sits still is a number');
  assert.match(CSS, /@keyframes gx-usage-sweep\s*\{[\s\S]{0,200}?transform:\s*translateX/,
    'the sweep must be a transform — animating width IS drawing a balance travelling through values');
  // And the segment is a fraction of the track, never the whole of it: a full bar reads as a full
  // allowance, which is the most expensive thing this panel could get wrong.
  const width = /width:\s*(\d+)%/.exec(pending);
  assert.ok(width && Number(width[1]) > 0 && Number(width[1]) < 50, `the waiting segment is ${width?.[1]}% — it must read as a marker, not a reading`);
});

test('AND "IT DID NOT ANSWER" IS DRAWN TOO, motionless, on the track itself', () => {
  const unknown = ruleFor('.gx-usage.is-unknown .gx-usage__bar');
  assert.notEqual(unknown, '', 'a failed usage fetch draws the same empty track as everything else');
  assert.match(unknown, /repeating-linear-gradient/, 'the track has to stop looking like a track');
  assert.doesNotMatch(unknown, /animation/, 'nothing is happening, which is the whole of what this state means');
  // The fill stays at zero width here — there is no reading, so there is nothing to draw.
  assert.doesNotMatch(ruleFor('.gx-usage.is-unknown .gx-usage__bar'), /width:\s*\d+%/);
});

test('THE TWO ARE NOT THE SAME PICTURE — which is the entire defect', () => {
  const pending = ruleFor('.gx-usage__fill.is-pending') + ruleFor('.gx-usage.is-pending .gx-usage__bar');
  const unknown = ruleFor('.gx-usage.is-unknown .gx-usage__bar');
  assert.notEqual(pending.replace(/\s+/g, ''), unknown.replace(/\s+/g, ''),
    'loading and failed are painted identically again');
});

test('and they are still not the same picture with motion switched off', () => {
  // The opt-out rule 5 of docs/DESIGN-LOCK.md requires is where this defect would come back: turn
  // the sweep off and the two states collapse into one empty track again unless something else
  // carries the difference.
  assert.notEqual(REDUCED, '', 'a rule that adds motion must add its own opt-out in the same commit');
  assert.match(REDUCED, /\.gx-usage__fill\.is-pending\s*\{[^{}]*display:\s*none/,
    'the segment must be REMOVED, not frozen — a segment that has stopped is a length again');
  const quiet = /\.gx-usage\.is-pending \.gx-usage__bar\s*\{([^{}]*)\}/.exec(REDUCED);
  assert.ok(quiet, 'with the sweep gone, waiting needs a still picture of its own');
  assert.notEqual(
    quiet[1].replace(/\s+/g, ''),
    ruleFor('.gx-usage.is-unknown .gx-usage__bar').replace(/\s+/g, ''),
    'under reduced motion the two states are painted identically',
  );
});

test('none of it introduces a colour, which is rule 1 of the locked system', () => {
  // Whole-file, so this cannot pass by looking at the wrong half of it.
  assert.doesNotMatch(CSS, /#[0-9a-fA-F]{3,8}\b/, 'no raw hex in a declaration');
  // And the two new states paint with the panel's existing vocabulary rather than a new step.
  assert.match(ruleFor('.gx-usage__fill.is-pending'), /var\(--muted\)/);
  assert.match(ruleFor('.gx-usage.is-unknown .gx-usage__bar'), /var\(--surface-3\)/);
});
