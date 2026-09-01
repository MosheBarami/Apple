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

const CSS = readFileSync(new URL('../src/styles/workspace.css', import.meta.url), 'utf8')
  // Comments carry example declarations and prose about animation; parsing them
  // as rules would produce confident nonsense.
  .replace(/\/\*[\s\S]*?\*\//g, '');

/** The byte range of the `prefers-reduced-motion: reduce` block, by brace matching. */
function reduceBlockRange(css) {
  const open = css.indexOf('@media (prefers-reduced-motion: reduce)');
  assert.notEqual(open, -1, 'the stylesheet must have a reduced-motion block at all');
  const first = css.indexOf('{', open);
  let depth = 0;
  for (let i = first; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return [open, i];
    }
  }
  throw new Error('unbalanced braces in the reduced-motion block');
}

const [REDUCE_FROM, REDUCE_TO] = reduceBlockRange(CSS);
const REDUCE_BLOCK = CSS.slice(REDUCE_FROM, REDUCE_TO);

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
const inReduce = (rule) => rule.at > REDUCE_FROM && rule.at < REDUCE_TO;
/** Rules that style the activity timeline or an evidence card. */
const isActivity = (rule) => /gx-act|gx-ev\b|gx-ev__/.test(rule.selector);
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

test('the reduce block switches off the activity animations it can reach', () => {
  const killed = RULES.filter((r) => inReduce(r) && isActivity(r) && /animation\s*:\s*none/.test(r.body));
  assert.ok(killed.length > 0, 'the reduce block must name the activity selectors explicitly');
  const named = killed.map((r) => r.selector).join(' ');
  for (const selector of ['.gx-act__step', '.gx-ev', '.gx-ev__bar', '.gx-act__pip']) {
    assert.ok(named.includes(selector), `${selector} animates elsewhere and must be listed under reduce`);
  }
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
  const ring = RULES.find((r) => inReduce(r) && r.selector.includes('.gx-ring__spin'));
  assert.ok(ring, 'the spinner must be addressed under reduce');
  assert.match(ring.body, /animation\s*:\s*none/);
  assert.match(ring.body, /stroke-dasharray/, 'stopped, it still has to look like a partial arc');
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
  const parked = RULES.filter((r) => inReduce(r) && r.selector.includes('.gx-ev__bar'));
  assert.ok(parked.length > 0);
  const body = parked.map((r) => r.body).join(' ');
  assert.match(body, /animation\s*:\s*none/);
  assert.match(body, /background-position/, 'it must still be a visible bar, held at rest');
});

test('the reduce block never restyles a state colour', () => {
  // Colour is how failure, recovery and liveness are reported. A reduced-motion
  // viewer gets exactly the same palette as everyone else.
  const recoloured = RULES.filter((r) => inReduce(r) && isActivity(r) && /(^|\s|;)color\s*:/.test(r.body));
  assert.deepEqual(recoloured.map((r) => r.selector), []);
});
