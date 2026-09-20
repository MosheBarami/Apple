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

//[[ 2026-09-21 — THIS GUARD READ THE WRONG TWO ROWS AND SO IT NEVER FIRED.
//
//   It took Apple to be gateway key `clay` and Apple MAX to be `stone`, found two different model
//   ids, and passed. `clay` is the PLAN-MODE specialist; it is not the Apple lane. `gatewayModelFor`
//   in session.ts pins Apple to `stone` in every mode and lets Apple MAX reach `stone` or `rune`.
//   So the comparison it was making was Plan-vs-Agent, and the comparison it was named for — the
//   free lane against the paid one — was never made. production-settings.mjs records the identical
//   class of mistake from the other side: "The same table also pinned Apple MAX to `stone`, which
//   hid the one mode where MAX differs from the free lane."
//
//   The cost was exactly what the guard existed to prevent. On 2026-09-20 commit 8b61c91 gave
//   `stone` and `rune` the same ceiling; they were already the same model id; /docs/modes went on
//   telling readers the two lanes "run on different third-party foundation models" and this test
//   went on agreeing.
//
//   Re-aimed at the property rather than at either sentence: work out which model ids each lane can
//   actually reach, then refuse whichever claim the ids contradict. It is now a guard against the
//   page being wrong in EITHER direction, which is what makes it survive the product moving again.
test('no page claims a difference between Apple and Apple MAX that the gateway does not make', () => {
  const idOf = (key) => {
    const m = new RegExp(`\\b${key}: \\{ id: '([^']+)'`).exec(gateway);
    assert.ok(m, `THIS GUARD IS BROKEN, NOT THE PAGES: the ${key} model id is no longer readable from gateway.ts`);
    return m[1];
  };

  //[[ The lane -> gateway-key mapping is READ, not retyped. If gatewayModelFor stops being
  //   recognisable the guard says so about itself instead of quietly comparing the wrong keys,
  //   which is the whole reason this test had to be rewritten.
  const fn = /export function gatewayModelFor\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(session);
  assert.ok(fn, 'THIS GUARD IS BROKEN, NOT THE PAGES: gatewayModelFor is no longer readable from session.ts');
  const body = fn[1];
  assert.match(body, /'apple'.*?return 'stone'/s, 'THIS GUARD IS BROKEN: Apple is no longer pinned to one gateway key');
  assert.match(body, /'apple-max'/, 'THIS GUARD IS BROKEN: gatewayModelFor no longer mentions apple-max');

  const appleIds = new Set([idOf('stone')]);
  // Apple MAX reaches `stone` in Plan and its own specialist elsewhere: stone or rune.
  const maxIds = new Set([idOf('stone'), idOf('rune')]);
  const sameModel = appleIds.size === maxIds.size && [...appleIds].every((id) => maxIds.has(id));

  const claimsShared = /\bshares?\s+(a|the|one)\s+(foundation|base|underlying)\s+model\b/i;
  const claimsDifferent = /\b(different|separate|distinct)\s+(third-party\s+)?(foundation|base|underlying)\s+models?\b/i;
  const forbidden = sameModel ? claimsDifferent : claimsShared;
  const because = sameModel
    ? `both lanes run ${[...appleIds].join(', ')}`
    : `Apple runs ${[...appleIds].join(', ')} and Apple MAX runs ${[...maxIds].join(', ')}`;

  for (const [name, src] of [['docs/modes.astro', modes], ['pricing.astro', pricing]]) {
    assert.doesNotMatch(
      visibleText(src),
      forbidden,
      `${name} claims ${sameModel ? 'different models' : 'a shared model'}, but ${because}.`,
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

  //[[ The model claim: BOTH sentences this page has shipped, because the guard now refuses whichever
  //   one the gateway contradicts and a pattern that only catches one of them is half a guard.
  assert.match(visibleText('They currently share a foundation model.'),
    /\bshares?\s+(a|the|one)\s+(foundation|base|underlying)\s+model\b/i,
    'the 2026-08 sentence slipped past the shared-model pattern — re-aim it');
  assert.match(visibleText('they run on different third-party foundation models — neither is a model we trained'),
    /\b(different|separate|distinct)\s+(third-party\s+)?(foundation|base|underlying)\s+models?\b/i,
    'the 2026-09 sentence slipped past the different-model pattern — re-aim it');
});
