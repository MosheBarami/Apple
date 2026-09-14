/**
 * w12 — PLANS AND CREDITS SURFACED IN THE PRODUCT, not only in the webhook.
 *
 * Two things on /usage disagreed with the server that enforces them:
 *
 *   1. It offered a signed-in user a WAITLIST for Pro, while PLAN_LIMITS had four tiers and QuotaDO
 *      was already applying them. plans.tsx was written to replace that — its own header says so —
 *      and was then never imported by anything, so the contradiction stayed on screen and the
 *      component that fixed it sat in the repo with zero callers.
 *   2. The Sparks ring was handed `sparksRemaining`, which is allowance PLUS purchased credits, and
 *      divided it by the daily allowance. With 1,440 credits on the free plan it rendered a full
 *      ring captioned "1481 of 60" and an aria-label saying that was what remained TODAY. Credits
 *      are not today's and do not reset. Verified in the browser before and after: it now reads
 *      "41 of 60 Sparks of allowance remaining today" with the credits on their own line.
 *
 * WHAT THESE TESTS ARE, stated because it bounds what they prove: apps/web has no DOM renderer, so
 * nothing here mounts the page. These read the ROUTE'S SOURCE and pin the wiring — that it derives
 * from the shared model rather than re-reading the payload, that the ladder is rendered, and that
 * the waitlist is gone. Structural, and they would each have failed before the change. The
 * behaviour of the numbers themselves is tested against the model in usage-meter.test.mjs, which is
 * the same model this page now uses.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const usage = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8');
const plans = readFileSync(join(WEB, 'src', 'components', 'plans.tsx'), 'utf8');
const css = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');

/** Source with comments stripped, so a class named in prose is not mistaken for one in use. */
const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const usageCode = code(usage);

test('THE PLAN LADDER IS ACTUALLY RENDERED — it had zero callers', () => {
  assert.match(usageCode, /import \{ PlanLadder \}/, 'the usage route must import it');
  assert.match(usageCode, /<PlanLadder\b/, 'and render it');
  assert.match(plans, /export function PlanLadder/, 'and it must still be what is exported');
});

test('the ladder reads the enforced table, so it cannot drift from the server again', () => {
  assert.match(plans, /PLAN_LIMITS/, 'allowances come from the enforced table');
  assert.match(plans, /PLAN_IDS/, 'and every tier the server knows is listed');
  assert.match(plans, /from '@golem\/shared'/, 'from shared, not a local copy');
  // No tier count, no price and no allowance may be written into this file as a literal.
  assert.doesNotMatch(plans, /\bsparksPerMonth:\s*\d/, 'an allowance literal would be a second source of truth');
});

test('THE PRO WAITLIST IS GONE from the signed-in page', () => {
  // It told a user Pro did not exist yet while their quota was already being enforced against it.
  assert.doesNotMatch(usageCode, /waitlist/i, 'no waitlist on a page that knows the user has a plan');
  assert.doesNotMatch(usageCode, /PlanCard/, 'and the card that carried it is gone');
});

test('THE RING SHOWS THE ALLOWANCE, never allowance-plus-credits', () => {
  // The precise regression: sparksRemaining is the sum, and the ring's denominator is the daily
  // allowance, so any credit balance made the caption read as nonsense.
  assert.doesNotMatch(usageCode, /quota\.sparksRemaining/,
    'the page must not read the combined figure at all');
  assert.match(usageCode, /remaining=\{view\.allowanceRemaining\}/, 'the arc is the allowance');
  assert.match(usageCode, /daily=\{view\.allowanceTotal\}/, 'over the allowance total');
  assert.match(usageCode, /allowance remaining/, 'and the label says which balance it is');
});

test('the page and the rail share ONE model of the same two balances', () => {
  // Two independent readings of one payload is how a page comes to disagree with itself, which is
  // the failure this page already had against the server.
  assert.match(usageCode, /import \{ meterView \}/, 'the page derives from the shared model');
  assert.match(usageCode, /meterView\(me\.data\?\.quota/, 'over the same payload');
  assert.match(usageCode, /pending: me\.isPending/, 'and passes loading through, not as a failure');
});

test('credits are reported beside the allowance and only when there are some', () => {
  assert.match(usageCode, /view\.credits > 0 &&/, 'no zero-credit noise on every plan');
  assert.match(usageCode, /do not expire/, 'and the rule that makes them different is stated');
});

test('every class the ladder uses is styled, so it cannot render as a raw block', () => {
  // It was written, never imported, and never styled. Rendering it without this would have put an
  // unstyled stack of text on the page, which is worse than the waitlist it replaced.
  const used = [...plans.matchAll(/className=(?:"([^"]+)"|\{`([^`]+)`\})/g)]
    .flatMap((m) => (m[1] ?? m[2]).split(/[\s$}{?:'"]+/))
    .map((c) => c.replace(/^\./, '').trim())
    .filter((c) => /^plan/.test(c));
  const missing = [...new Set(used)].filter((c) => !css.includes(`.${c}`));
  assert.deepEqual(missing, [], `plan classes with no style: ${missing.join(', ')}`);
  assert.ok(used.length >= 6, `expected the ladder to use several plan classes, saw ${used.length}`);
});

test('the current-plan rail follows the writing direction', () => {
  // This app renders RTL. box-shadow offsets are physical, so an inset shadow would put the rail on
  // the left in every language; the rail is a positioned pseudo-element taking inset-inline-start.
  // Confirmed live in both directions: RTL resolves to right:-1px, LTR to left:-1px.
  const block = css.slice(css.indexOf('.plan.is-current'), css.indexOf('.plan__head'));
  assert.match(block, /inset-inline-start/, 'the rail must use a logical inset');
  assert.doesNotMatch(block, /box-shadow:[^;]*inset\s+-?\d/, 'a physical inset offset ignores direction');
});
