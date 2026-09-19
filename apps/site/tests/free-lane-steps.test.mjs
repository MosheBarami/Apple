/**
 * THE FREE LANE'S PER-REQUEST CEILING IS PART OF THE OFFER, SO IT BELONGS ON THE OFFER.
 *
 * /pricing sells the free allowance in "quality-gated builds" and its own FAQ defines that unit as
 * "read the tree, edit scripts, create instances, then render it and critique the picture" — about
 * sixteen steps, measured. A free request runs three. `maxStepsFor` clamps the Apple lane to Clay's
 * limit whatever mode was chosen, and a free account cannot leave that lane: `canUseProductModel`
 * refuses Apple MAX for plan 'free', enforced server-side from the quota object.
 *
 * WHAT IS NOT WRONG, AND IS WORTH WRITING DOWN SO IT IS NOT "FIXED" LATER. The arithmetic is
 * honest. 2,310 Credits a month is 69,300 neurons, which is exactly thirty 2,300-neuron builds, and
 * billing is from measured usage rather than a flat 77 per run — Clay's steps are cheaper than the
 * Stone steps that figure was measured on, so a free month buys MORE compute than it advertises,
 * not less. The tools are not filtered by lane either: render and visual critique are available
 * free. A free customer really can complete a quality-gated build. What they cannot do is complete
 * one inside a single request, and nothing a person could read before signing up said so — the only
 * statement of it in the whole product was a "Step 2 of 3" counter during a run they had already
 * started.
 *
 * So this is a disclosure guard, not a limit guard. The number is the owner's to move; what this
 * fixes in place is that the pages state whatever it currently is.
 *
 * IT ALSO HOLDS THE SECOND CLAIM ON THE SAME PAGE. /docs/modes said Apple and Apple MAX "currently
 * share a foundation model". The gateway maps Apple to one third-party model and MAX to another,
 * and has since MAX changed lanes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');

/** Comments out first: session.ts explains an EARLIER set of step limits, "3/8/14", in prose. */
const stripTs = (src) => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');

const session = stripTs(readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'session.ts'), 'utf8'));
const gateway = stripTs(readFileSync(join(ROOT, 'apps', 'worker', 'src', 'gateway.ts'), 'utf8'));
const shared = stripTs(readFileSync(join(ROOT, 'packages', 'shared', 'src', 'index.ts'), 'utf8'));

const pricing = readFileSync(join(SITE, 'src', 'pages', 'pricing.astro'), 'utf8');
const modes = readFileSync(join(SITE, 'src', 'pages', 'docs', 'modes.astro'), 'utf8');

/** The ceiling a run on the free Apple lane is clamped to, read out of the worker. */
const FREE_LANE_STEPS = (() => {
  const m = /const STEP_LIMITS: Record<GolemMode, number> = \{([^}]*)\}/.exec(session);
  assert.ok(m, 'THIS GUARD IS BROKEN, NOT THE PAGES: STEP_LIMITS is no longer declared in session.ts the way this reads it');
  const clay = /clay:\s*(\d+)/.exec(m[1]);
  assert.ok(clay, 'STEP_LIMITS no longer names a clay limit');
  const value = Number(clay[1]);
  assert.ok(Number.isInteger(value) && value > 0, 'the clay step limit did not read as a usable number');
  return value;
})();

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

test('THE PREMISE IS STILL TRUE: a free request is clamped to the Clay ceiling', () => {
  assert.match(
    session,
    /productModel === 'apple' \? Math\.min\(STEP_LIMITS\[mode\], STEP_LIMITS\.clay\)/,
    'THIS GUARD IS STALE, NOT THE PAGES: maxStepsFor no longer clamps the Apple lane to the Clay ' +
      'ceiling. If free runs got longer, the pages are understating the product — go and look ' +
      'before changing either.',
  );
  assert.match(
    shared,
    /if \(model !== 'apple-max'\) return false;\s*return isPlanId\(plan\) && plan !== 'free';/,
    'THIS GUARD IS STALE, NOT THE PAGES: canUseProductModel no longer refuses Apple MAX to Free, so ' +
      'a free account may no longer be pinned to the three-step lane.',
  );
});

test('the Free offer states the per-request step ceiling', () => {
  const n = String(FREE_LANE_STEPS);
  const word = WORDS[FREE_LANE_STEPS] ?? n;
  const states = new RegExp(`\\b(${n}|${word})\\b[^.]{0,40}\\bsteps?\\b|\\bsteps?\\b[^.]{0,20}\\b(${n}|${word})\\b`, 'i');

  for (const [name, src] of [['pricing.astro', pricing], ['docs/modes.astro', modes]]) {
    assert.match(
      visibleText(src),
      states,
      `${name} does not tell a reader that a free request runs at most ${FREE_LANE_STEPS} steps. ` +
        'The page sells an allowance in builds measured at about sixteen steps; the shape of one ' +
        'request is part of what is being offered.',
    );
  }
});

test('no page claims Apple and Apple MAX share a foundation model', () => {
  const model = (lane) => {
    const m = new RegExp(`\\b${lane}: \\{ id: '([^']+)'`).exec(gateway);
    assert.ok(m, `THIS GUARD IS BROKEN, NOT THE PAGES: the ${lane} model id is no longer readable from gateway.ts`);
    return m[1];
  };
  const apple = model('clay');
  const appleMax = model('stone');

  if (apple === appleMax) {
    // Not a failure of the page — a change in the product. Say so loudly rather than pass quietly,
    // because the corrected sentence would then be the false one.
    assert.fail(
      `Apple and Apple MAX now both run ${apple}. /docs/modes says they run on different foundation ` +
        'models, which has stopped being true. Fix the page, then re-aim this test.',
    );
  }

  for (const [name, src] of [['docs/modes.astro', modes], ['pricing.astro', pricing]]) {
    assert.doesNotMatch(
      visibleText(src),
      /\bshares?\s+(a|the|one)\s+(foundation|base|underlying)\s+model\b/i,
      `${name} says Apple and Apple MAX share a model; the gateway runs ${apple} and ${appleMax}.`,
    );
  }
});

test('the guard has teeth', () => {
  // The step disclosure: the Free card as it shipped, with no step line at all.
  const shippedCard =
    '<li>About 30 quality-gated builds a month</li><li>Apple · limited free access</li>' +
    '<li>Unlimited projects</li>';
  const n = String(FREE_LANE_STEPS);
  const word = WORDS[FREE_LANE_STEPS] ?? n;
  const states = new RegExp(`\\b(${n}|${word})\\b[^.]{0,40}\\bsteps?\\b|\\bsteps?\\b[^.]{0,20}\\b(${n}|${word})\\b`, 'i');
  assert.doesNotMatch(visibleText(shippedCard), states, 'the shipped card would have passed — re-aim this');
  assert.match(visibleText('<li>Up to 3 steps per request</li>'), states, 'the replacement does not satisfy its own check');

  // The model claim: the sentence as it shipped.
  const shippedSentence = 'They currently share a foundation model.';
  assert.match(visibleText(shippedSentence), /\bshares?\s+(a|the|one)\s+(foundation|base|underlying)\s+model\b/i,
    'the shipped sentence slipped past the pattern — re-aim it');
});
