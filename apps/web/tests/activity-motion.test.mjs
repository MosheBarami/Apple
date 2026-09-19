/**
 * The reduced-motion contract, enforced against the actual stylesheet.
 *
 * The brief's rule is one sentence: `prefers-reduced-motion` must remove
 * TRAVEL, not remove FEEDBACK. That is easy to state, easy to agree with, and
 * very easy to break six months later by adding one more `animation:` line to a
 * `.gx-act` rule — which is precisely the failure this file exists to catch.
 *
 * It checks the policy from both sides:
 *
 *   * `motionPlan` withholds the `.is-moving` class, so a reduced-motion viewer
 *     never gets the travel rules in the first place;
 *   * every travel rule in `workspace.css` really is gated behind that class,
 *     and the `prefers-reduced-motion: reduce` block re-asserts it in case a
 *     stale class survives a render;
 *   * that same block does NOT switch off the things that report state — the
 *     in-flight ring, the live pip's halo, the failure colours, the loading bar.
 *     Removing those would leave a viewer with vestibular sensitivity looking at
 *     a timeline that never appears to change.
 *
 * Deterministic and offline: it reads a file off disk and parses it. No DOM, no
 * browser, no network.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { motionPlan } from '../src/components/ws/activity-model.ts';

const CSS = readFileSync(new URL('../src/design/system.css', import.meta.url), 'utf8')
  // Comments carry example declarations and prose about animation; parsing them
  // as rules would produce confident nonsense.
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The byte range of the `prefers-reduced-motion: reduce` block, by brace matching. */
function reducedMotionRanges(css) {
  const ranges = [];
  const re = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;
  let match;
  while ((match = re.exec(css)) !== null) {
    const open = css.indexOf('{', match.index);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          ranges.push([match.index, i]);
          break;
        }
      }
    }
  }
  assert.ok(ranges.length > 0, 'the stylesheet must have a reduced-motion block at all');
  return ranges;
}

const REDUCE_RANGES = reducedMotionRanges(CSS);

/** Every `selector { body }` pair, with where it starts. Rule bodies here never nest. */
function rules(css) {
  const out = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(css)) !== null) {
    out.push({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2], at: m.index });
  }
  return out;
}

const RULES = rules(CSS);
const inReduce = (rule) => REDUCE_RANGES.some(([from, to]) => rule.at > from && rule.at < to);
/** Rules that style the activity timeline or an evidence card. */
const isActivity = (rule) => /\.gx-(?:act|ev|ring)\b/.test(rule.selector);
const animates = (rule) => /animation\s*:\s*(?!none)[^;]+/.test(rule.body);
const transitions = (rule) => /transition\s*:\s*(?!none)[^;]+/.test(rule.body);

// ---------------------------------------------------------------------------
// 1. The JS half: reduced motion never even receives the travel class
// ---------------------------------------------------------------------------

test('motionPlan is the switch: reduced motion yields is-still, otherwise is-moving', () => {
  assert.equal(motionPlan(true).className, 'is-still');
  assert.equal(motionPlan(false).className, 'is-moving');
  assert.equal(motionPlan(true).travel, false);
  assert.equal(motionPlan(true).feedback, true, 'feedback is not negotiable');
});

test('no rule keys travel off the still class', () => {
  const offenders = RULES.filter((r) => r.selector.includes('is-still') && (animates(r) || transitions(r)));
  assert.deepEqual(offenders.map((r) => r.selector), []);
});

// ---------------------------------------------------------------------------
// 2. The CSS half: every travel rule is gated, and re-neutralised under reduce
// ---------------------------------------------------------------------------

test('every animation on the activity timeline is gated behind .gx-act.is-moving', () => {
  const ungated = RULES.filter(
    (r) => !inReduce(r) && isActivity(r) && animates(r) && !r.selector.includes('.gx-act.is-moving'),
  );
  assert.deepEqual(
    ungated.map((r) => r.selector),
    [],
    'an ungated animation reaches a reduced-motion viewer the moment matchMedia is unavailable',
  );
});

test('every transition on the activity timeline is gated the same way', () => {
  const ungated = RULES.filter(
    (r) => !inReduce(r) && isActivity(r) && transitions(r) && !r.selector.includes('.gx-act.is-moving'),
  );
  assert.deepEqual(ungated.map((r) => r.selector), []);
});

test('a generic reduced-motion policy neutralises activity travel', () => {
  const generic = RULES.filter(
    (r) => inReduce(r)
      && /(^|,)\s*\*\s*(,|$)/.test(r.selector)
      && /animation\s*:\s*none\s*!important/.test(r.body)
      && /transition\s*:\s*none\s*!important/.test(r.body),
  );
  assert.ok(generic.length > 0, 'reduced motion needs a generic animation and transition reset');
});

// ---------------------------------------------------------------------------
// 3. Feedback survives — this is the half that is easy to get wrong
// ---------------------------------------------------------------------------

test('reduced motion never hides an activity element outright', () => {
  const hidden = RULES.filter(
    (r) =>
      inReduce(r) &&
      isActivity(r) &&
      /(display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0\b)/.test(r.body),
  );
  assert.deepEqual(
    hidden.map((r) => r.selector),
    [],
    'removing the element removes the feedback, which is the one thing reduced motion must not do',
  );
});

test('the in-flight ring keeps reading as unfinished when it stops spinning', () => {
  const base = RULES.find((r) => !inReduce(r) && r.selector === '.gx-ring__spin');
  assert.ok(base, 'the in-flight ring has no base rule');
  assert.match(base.body, /stroke-dasharray/, 'the ring must remain a partial arc when motion stops');
  const generic = RULES.some(
    (r) => inReduce(r) && /\*\s*(,|$)/.test(r.selector) && /animation\s*:\s*none\s*!important/.test(r.body),
  );
  const explicit = RULES.some(
    (r) => inReduce(r) && r.selector.includes('.gx-ring__spin') && /animation\s*:\s*none/.test(r.body),
  );
  assert.ok(generic || explicit, 'the ring must stop under reduced motion');
});

test('the live pip keeps a halo with no animation at all', () => {
  // The pulse is the animated version; the plain ring underneath is what a
  // reduced-motion viewer sees, and it must exist outside the is-moving rule.
  const base = RULES.find(
    (r) =>
      !inReduce(r) &&
      r.selector === '.gx-act__phase.is-active .gx-act__pip' &&
      /box-shadow/.test(r.body),
  );
  assert.ok(base, 'the active pip needs a static halo, not only a keyframed one');
  assert.equal(animates(base), false);
});

test('the loading bar is parked, not deleted', () => {
  const base = RULES.find((r) => !inReduce(r) && r.selector === '.gx-ev__bar');
  assert.ok(base, 'the evidence loading bar has no base rule');
  assert.match(base.body, /background:/, 'the bar must remain visible');
  const parked = RULES.filter((r) => inReduce(r) && r.selector.includes('.gx-ev__bar'));
  const generic = RULES.some(
    (r) => inReduce(r) && /\*\s*(,|$)/.test(r.selector) && /animation\s*:\s*none\s*!important/.test(r.body),
  );
  assert.ok(parked.length > 0 || generic, 'the bar must be parked under reduced motion');
  if (parked.length > 0) {
    assert.match(parked.map((r) => r.body).join(' '), /background-position/);
  }
});

test('the reduce block never restyles a state colour', () => {
  // Colour is how failure, recovery and liveness are reported. A reduced-motion
  // viewer gets exactly the same palette as everyone else.
  const recoloured = RULES.filter((r) => inReduce(r) && isActivity(r) && /(^|\s|;)color\s*:/.test(r.body));
  assert.deepEqual(recoloured.map((r) => r.selector), []);
});
