/**
 * w12 — PLANS AND CREDITS SURFACED IN THE PRODUCT, not only in the webhook.
 *
 * Two things on /usage disagreed with the server that enforces them:
 *
 *   1. It offered a signed-in user a WAITLIST for Pro, while PLAN_LIMITS had four tiers and QuotaDO
 *      was already applying them. plans.tsx was written to replace that — its own header says so —
 *      and was then never imported by anything, so the contradiction stayed on screen and the
 *      component that fixed it sat in the repo with zero callers.
 *   2. The Credits ring was handed `creditsRemaining`, which is allowance PLUS purchased credits, and
 *      divided it by the daily allowance. With 1,440 credits on the free plan it rendered a full
 *      ring captioned "1481 of 60" and an aria-label saying that was what remained TODAY. Credits
 *      are not today's and do not reset. Verified in the browser before and after: it now reads
 *      "41 of 60 Credits of allowance remaining today" with the credits on their own line.
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
import { readFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const usage = readFileSync(join(WEB, 'src', 'routes', 'usage.tsx'), 'utf8');
const plans = readFileSync(join(WEB, 'src', 'components', 'plans.tsx'), 'utf8');
const css = readFileSync(join(WEB, 'src', 'styles.css'), 'utf8');

// The enforced table, so the figures the ladder prints can be checked against what the server
// applies rather than against a literal in this file.
const sharedOut = join(mkdtempSync(join(tmpdir(), 'plans-shared-')), 'shared.mjs');
execFileSync(join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, '..', '..', 'packages', 'shared', 'src', 'index.ts'), '--bundle', '--format=esm',
   '--platform=neutral', '--main-fields=main,module', '--outfile=' + sharedOut], { stdio: 'pipe' });
const { PLAN_IDS, PLAN_LIMITS, CREDITS_PER_BUILD } = await import(sharedOut);

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
  assert.doesNotMatch(plans, /\bcreditsPerMonth:\s*\d/, 'an allowance literal would be a second source of truth');
});

test('THE PRO WAITLIST IS GONE from the signed-in page', () => {
  // It told a user Pro did not exist yet while their quota was already being enforced against it.
  assert.doesNotMatch(usageCode, /waitlist/i, 'no waitlist on a page that knows the user has a plan');
  assert.doesNotMatch(usageCode, /PlanCard/, 'and the card that carried it is gone');
});

test('THE RING SHOWS THE ALLOWANCE, never allowance-plus-credits', () => {
  // The precise regression: creditsRemaining is the sum, and the ring's denominator is the daily
  // allowance, so any credit balance made the caption read as nonsense.
  assert.doesNotMatch(usageCode, /quota\.creditsRemaining/,
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

// --- w14: the upgrade and downgrade path --------------------------------------------------

/**
 * THE RETURN FROM STRIPE IS NOT AN ENTITLEMENT.
 *
 * The plan moves when the webhook applies the subscription event, which may not have landed by the
 * time the browser comes back. A page that says "You're on Pro!" on the success URL is lying in
 * exactly the way the waitlist was — confidently, and about the one thing the user just paid for.
 */
test('the success return reports what the SERVER says, and never claims the new plan', () => {
  assert.match(usageCode, /checkout=done|'done'/, 'the return flag is handled');
  assert.match(usage, /changes when Stripe confirms it/, 'and the wait is stated plainly');
  assert.match(usageCode, /me\.refetch\(\)/, 'with a refetch rather than an assumption');
  // The words that would make it a lie.
  assert.doesNotMatch(usage, /You(?:'|’)re now on|Welcome to Pro|Upgrade complete/i);
});

test('the checkout flag is taken back out of the URL', () => {
  // A reload or a shared link would otherwise replay a payment confirmation that never happened.
  assert.match(usageCode, /searchParams\.delete\('checkout'\)/);
  assert.match(usageCode, /replaceState/);
});

test('A CHECKOUT ONLY EVER STARTS A FIRST SUBSCRIPTION', () => {
  // Stripe checkout ADDS a subscription; it does not replace one. A paid user sent to checkout for
  // a different tier is billed for both, so every move from a paid plan goes to the portal.
  assert.match(usageCode, /currentPlan === 'free' && canBuy\) checkout\.mutate/,
    'checkout is gated on having no subscription yet');
  assert.match(usageCode, /else portal\.mutate\(\)/, 'everything else is a portal visit');
});

test('a deployment with no Stripe key offers no button at all', () => {
  // PlanLadder renders "Not available yet" when onChoose is absent, which is honest; a button that
  // 503s is not.
  assert.match(usageCode, /billing\.data\?\.checkout\s*\n?\s*\?/, 'onChoose is conditional on config');
  assert.match(usageCode, /: undefined/, 'and absent when checkout is not configured');
  assert.match(plans, /Not available yet/, 'which the ladder renders as a stated absence');
});

test('cancelling says nothing was charged', () => {
  assert.match(usage, /nothing was charged/i);
});

// --- the numbers on the ladder, not just its wiring -------------------------------------

/**
 * NO TIER ADVERTISES A COUNT OF BUILDS IT CANNOT AFFORD.
 *
 * Free grants 60 Credits a day and a quality-gated build costs 77, so buildsPerDay floors to zero
 * and the pricing page said "up to 0 builds a day". I verified this ladder in a browser and read
 * the layout rather than the figures; scripts/check-offer.mjs is what named it, and it is the same
 * call usage-meter-model.ts already makes for the meter — "0 builds" reads as a fault in the
 * account rather than as a remainder smaller than one job.
 *
 * The underlying incoherence is a pricing decision and is NOT fixed here. check-offer still reports
 * it, G-OFFER-1 still gates it. What is fixed is the page stating a number that is not useful.
 */
test('NO TIER IS ADVERTISED AS AFFORDING ZERO BUILDS A DAY', () => {
  const src = code(plans);
  assert.match(src, /buildsPerDay\(id\) >= 1 \?/, 'the per-day claim must be conditional');
  // The alternative branch has to say something true rather than nothing.
  assert.match(src, /one build costs \{CREDITS_PER_BUILD\}/,
    'a tier that cannot afford a daily build should state the two numbers instead');
});

test('EVERY TIER NOW AFFORDS AT LEAST ONE BUILD A DAY', () => {
  // This test used to say the opposite. It asserted that SOME tier floors to zero builds, as a
  // tripwire: "if no tier floors to zero any more, the conditional branch above is dead and should
  // go". The repricing on 2026-09-14 tripped it, which is the tripwire working — free went from 60
  // Credits a day against a 77-Credit build to 231, exactly three builds.
  //
  // The branch STAYS, and the assertion is inverted rather than deleted. A pricing page printing
  // "up to 0 builds a day" is a specific, public embarrassment, the branch costs four lines, and
  // check-offer's rule 3 only guarantees the FREE tier clears one build — nothing stops a future
  // paid tier being set below it. What changes is that the healthy state is now asserted as the
  // expectation instead of the exception.
  for (const p of PLAN_IDS) {
    assert.ok(Number.isFinite(PLAN_LIMITS[p].creditsPerDay), `${p} has no daily allowance`);
    assert.ok(Number.isFinite(PLAN_LIMITS[p].creditsPerMonth), `${p} has no monthly allowance`);
    assert.ok(
      PLAN_LIMITS[p].creditsPerMonth <= PLAN_LIMITS[p].creditsPerDay * 31,
      `${p} grants a month nobody can reach at its daily rate`,
    );
    assert.ok(
      Math.floor(PLAN_LIMITS[p].creditsPerDay / CREDITS_PER_BUILD) >= 1,
      `${p} grants ${PLAN_LIMITS[p].creditsPerDay} Credits a day and a build costs ${CREDITS_PER_BUILD} — ` +
        'it would advertise itself as affording no builds',
    );
  }
});

// --- coming back from the PORTAL, not only from the checkout -------------------------------

/**
 * THE END STATE WAS CONFIRMED; THE ACT WAS NOT.
 *
 * Cancelling happens in Stripe's portal. The return_url was a bare /app/usage, and the only return
 * handling on this page read `?checkout=`, which is the other round trip entirely — so a user who
 * had just cancelled came back to a page that looked exactly as it had before, and stayed that way
 * until the webhook landed. Stripe's own confirmation was the last thing the product said to them.
 *
 * The note reports what the SERVER now says, for the same reason the checkout branch does: the
 * cancellation is real when the webhook applies it, not when a browser returns to a URL.
 */
test('THE RETURN FROM THE PORTAL IS RECOGNISED AT ALL', () => {
  assert.match(usageCode, /get\('billing'\)|billing=returned/,
    'the portal return flag must be read, or a cancellation is invisible until the webhook lands');
});

test('and it reports the SERVER state rather than asserting the cancellation', () => {
  // Never "You have cancelled" from a URL parameter. The same rule the checkout return already
  // follows, and the reason this page stopped lying about plans.
  assert.match(usageCode, /billingView\?\.state === 'cancelling'|billingView\.state === 'cancelling'/,
    "the note must read the server's own state");
  assert.doesNotMatch(usage, /You(?:'|’)ve cancelled|Your plan has been cancelled|Cancellation confirmed/i,
    'a client-side claim about a cancellation is the sentence this page exists not to print');
});

test('the portal flag is taken back out of the URL too', () => {
  // Same reason as the checkout flag: a reload or a shared link would replay a confirmation.
  assert.match(usageCode, /searchParams\.delete\('billing'\)/);
});

test('and the return refetches, because the webhook may not have landed yet', () => {
  const effect = usageCode.slice(usageCode.indexOf("get('billing')") - 600, usageCode.indexOf("get('billing')") + 600);
  assert.match(effect, /me\.refetch\(\)/, 'the page must ask the server again rather than assume');
});

// --- what the change costs, before the user leaves for Stripe ---------------------------------

/**
 * A PAYING CUSTOMER WAS HANDED STRAIGHT TO STRIPE.
 *
 * The ladder prints each tier's monthly price, and for someone already on a paid tier that is not
 * the number about to be charged: a mid-period change is prorated, net of a credit for the time
 * already bought. `else portal.mutate()` sent them off the page and the first figure they saw was
 * on Stripe's own checkout — the amount, the credit and the date all first appeared after they had
 * committed to going there.
 */
test('A PAID-TO-PAID CHANGE IS NO LONGER A BARE REDIRECT', () => {
  const at = usageCode.indexOf('onChoose=');
  const choose = usageCode.slice(at, at + 900);
  assert.match(
    choose,
    /if \(currentPlan === 'free' && canBuy\) checkout\.mutate\(plan\);[\s\S]*?else if \(canBuy\) setPendingChange\(plan\);/,
    'a paying user choosing a tier that HAS a price must be quoted, not redirected',
  );
  // The redirect that survives is the move down to Free, which is a cancellation and has no
  // upgrade invoice to preview. It must come after the priced branch, never instead of it.
  assert.ok(
    choose.indexOf('setPendingChange(plan)') < choose.indexOf('else portal.mutate()'),
    'the bare redirect may only be the fall-through for a tier with no price',
  );
  assert.match(usageCode, /import \{ ConfirmDialog \}/, 'it asks first');
  assert.match(usageCode, /fetchBillingPreview/, 'and the amount comes from the server');
});

test('the sentence about money comes from billing-copy, not from a template on this page', () => {
  // The same rule the notice follows. A page that formats an amount inline makes the "is this a
  // charge or a credit" call again in every place it prints one.
  assert.match(usageCode, /planChangePreviewLine\(/);
  assert.doesNotMatch(usageCode, /costs \$\{|charges \$\{/, 'no hand-rolled money sentence here');
});

test('THE CHANGE IS STILL STRIPE’S TO MAKE — confirming opens the portal, it does not set a plan', () => {
  assert.match(usageCode, /onConfirm=\{\(\) => portal\.mutate\(\)\}/,
    'the dialog is a preview and a confirmation, never an entitlement');
});

test('nothing is priced until a tier is actually chosen', () => {
  // A preview on page load would ask Stripe a question on every visit to /usage.
  assert.match(usageCode, /enabled: pendingChange !== null/);
});

test('a preview still in flight says so rather than showing an empty amount', () => {
  assert.match(usageCode, /preview\.isPending/,
    'the pending case is its own sentence — a blank where a number goes reads as free');
});
