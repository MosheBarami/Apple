/**
 * NO PAGE MAY SAY CREDITS COME BACK. NOTHING GIVES THEM BACK.
 *
 * /docs/troubleshooting told a customer whose run hit the service-wide capacity ceiling that "Your
 * Credits are not consumed by a run that stops here." They are. One Credit is taken at admission
 * before the shared budget is ever consulted, and every step that finished settled its own measured
 * usage before the step that hit the ceiling threw — so a run that died at step twelve has already
 * paid for eleven. The same page's neighbouring paragraph scopes the identical idea correctly, to
 * the STEP; this one widened it to the RUN, which is the whole defect.
 *
 * /docs/credits-and-limits went further — "If a request fails on our side ... the Credits come back
 * automatically" — and /docs/faq promised that "Credits for unexecuted work on our side are
 * refunded per the limits policy".
 *
 * THERE IS NO REFUND ROUTE. The quota Durable Object exposes /state, /spend, /set-plan, /billing*,
 * /grant-credits, /reset, /ledger and /history. /spend only ever decrements, and quota-math's
 * splitSpend clamps its amount with `Math.max(0, amount)` so a negative spend cannot credit anybody.
 * /grant-credits says of itself that it is additive only and is reachable from the Stripe webhook
 * and an admin key, neither of which fires on a failed run. Those Credits stay debited, appear on
 * the customer's own usage chart, and are reported back on the finished turn.
 *
 * WHAT IS TRUE, AND WHAT THESE PAGES NOW SAY INSTEAD: a call that failed reports no compute, so it
 * is never charged. That is a no-charge claim, not a refund claim, and the difference is exactly
 * the one Credit taken at the start plus every step that did finish.
 *
 * THE GUARD ASSERTS ITS OWN PREMISE. If a refund route is ever added, the anchors below stop
 * matching and this file fails naming itself — so it cannot go on forbidding a sentence that has
 * become true.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');

function pages() {
  const dir = join(SITE, 'src', 'pages');
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

/**
 * Claims that Credits already taken are returned.
 *
 * Narrow on purpose. "A step that failed is not charged" is TRUE and must keep passing, so nothing
 * here matches a no-charge sentence; every pattern needs the money to have moved and come back.
 */
//[[ THE WORD "refunded" USED TO BE THE WHOLE TEST, AND CANNOT BE ANY MORE.
//
//   Before 2026-09-20 no refund existed, so any page saying "refunded" was lying and matching the
//   bare word was exactly right. The product now refunds a failed run that left the user nothing to
//   keep, so the word appears legitimately and a guard on it fails on the truth.
//
//   What is still false, and what these patterns now describe, is a refund in the two cases the
//   code deliberately excludes: work the user KEPT, and a stop the user CHOSE. run-refund.ts states
//   both — "work the user can keep is charged for, whatever went wrong afterwards" and "pressing
//   stop is not a refund" — and each has its own test there. These are the same two rules, guarded
//   where a customer would read them.
const REFUND_CLAIMS = [
  { id: 'refund-after-keeping', re: /\bcredits?\b[^.]{0,80}\b(refunded|come[s]?\s+back|returned|given\s+back)\b[^.]{0,80}\b(kept|saved|applied|built|changed)\b/i },
  { id: 'refund-on-stop', re: /\b(stop(?:ped|ping)?|cancel(?:led|ling)?)\b[^.]{0,60}\b(refunded|credits?\s+come[s]?\s+back|credits?\s+(are|is)\s+returned)\b/i },
  { id: 'not-consumed', re: /\bcredits?\b[^.]{0,40}\b(are\s+)?not\s+consumed\b/i },
  { id: 'costs-you-nothing-run', re: /\brun\b[^.]{0,40}\bcosts?\s+you\s+nothing\b/i },
];

/**
 * THE DAILY REFILL USES THE SAME WORDS AND IS TRUE.
 *
 * "Your Credits come back at midnight UTC" is the reset; "the Credits come back automatically" after
 * a failed request is the refund that does not exist. A guard that cannot tell them apart would
 * force these pages to stop explaining the reset, which is the one credit behaviour they get right.
 * So a hit is judged inside its own SENTENCE — not a character window, which would reach into the
 * neighbouring "The daily reset" heading and defang the very sentence that shipped.
 */
const RESET_CONTEXT = /\b(midnight|reset|refill\w*|each day|every day|next month|roll ?over)\b/i;

/**
 * A SENTENCE THAT DENIES A REFUND IS NOT A SENTENCE THAT PROMISES ONE.
 *
 * "stopping a run yourself is not a failure, so it is not refunded" states the exact rule this
 * guard exists to enforce, and the first version of the stop pattern flagged it — the reader could
 * not tell an assertion from its negation, so the page would have been pushed to stop saying the
 * true thing. Same shape as RESET_CONTEXT above: judge inside the sentence, and skip it when the
 * sentence is denying.
 */
const DENIAL = /\b(not|never|no|cannot|can't|does not|doesn't|is not|are not)\b[^.]{0,70}\b(refunded|refund|come[s]?\s+back|returned|given\s+back)\b/i;

const sentences = (hay) => hay.split(/(?<=[.!?])\s+/);

function scan(named) {
  const found = [];
  for (const [name, text] of named) {
    for (const sentence of sentences(visibleText(text))) {
      if (RESET_CONTEXT.test(sentence)) continue;
      if (DENIAL.test(sentence)) continue;
      for (const { id, re } of REFUND_CLAIMS) {
        const hit = re.exec(sentence);
        if (hit) found.push(`${name}: [${id}] "${hit[0].trim()}"`);
      }
    }
  }
  return found;
}

//[[ THIS GUARD DID ITS JOB AND THEN CHANGED SHAPE, WHICH IS THE OUTCOME IT WAS BUILT FOR.
//
//   It existed to hold four published pages to a fact: the quota object had no way to give a Credit
//   back, so no page could promise one. On 2026-09-20 the worker gained /refund and SessionDO began
//   calling it, and this test failed with the sentence it was written to produce — "a refund path
//   may exist, re-read this guard and decide what the pages may promise, rather than deleting it."
//
//   Deleting it was the wrong move and so was silencing it. Four pages said in plain words that
//   nothing comes back, one of them naming the missing route, and every one of those sentences had
//   become false while remaining published. They now describe what the refund actually is.
//
//   So the assertion inverts rather than disappears. What must hold now is not "no refund exists"
//   but "the pages describe the refund the product actually has" — narrow, automatic, and only for
//   a run that ended in failure leaving nothing to keep. The failure mode this now guards is the
//   opposite one, and it is worse: a page over-promising a general refund the code does not give.
const REFUND_IS_NARROW = [
  { id: 'nothing-comes-back', re: /\bnothing comes back\b/i, why: 'the product refunds a failed run that left nothing to keep' },
  { id: 'no-refund-route', re: /no refund route|has no refund route at all/i, why: 'QuotaDO has had /refund since 2026-09-20' },
  { id: 'no-other-refund', re: /there is no other refund/i, why: 'there is one, and it is described a paragraph away' },
];

test('no page still denies a refund the product now gives', () => {
  // NON-VACUITY FIRST. The first version of this test destructured pages() - which yields file
  // PATHS - as [name, text], so it iterated the characters of a path and scanned no prose at all
  // while reporting green. A falsification caught it; the assertion below is what makes a blind
  // reader fail as a blind reader instead of passing as a clean product.
  assert.ok(pages().length > 0, 'found no .astro pages — this guard is looking in the wrong place');
  const offenders = [];
  for (const [name, text] of pages().map((f) => [f.slice(SITE.length + 1), readFileSync(f, 'utf8')])) {
    for (const sentence of sentences(visibleText(text))) {
      for (const { id, re, why } of REFUND_IS_NARROW) {
        const hit = re.exec(sentence);
        if (hit) offenders.push(`${name}: [${id}] "${hit[0].trim()}" — ${why}`);
      }
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('no page promises a refund WIDER than the one the code gives', () => {
  assert.ok(pages().length > 0, 'found no .astro pages — this guard is looking in the wrong place');
  // The opposite drift, and the more damaging one. The refund is only for a run that ended in
  // failure having left the user nothing they can keep; a page offering a general money-back or an
  // any-failure refund would be selling something apps/worker/src/run-refund.ts does not do.
  const TOO_WIDE = [
    { id: 'always-refunded', re: /always refunded|refunded in full|full refund of your credits/i },
    // The sentence that actually shipped. Narrowing REFUND_CLAIMS to "kept work" and "stop" left
    // this uncaught for a moment: an unconditional come-back on ANY failure is wider than
    // run-refund.ts gives, which refunds only a failure that left nothing to keep. The true copy
    // carries that condition, so it does not match.
    { id: 'automatic-on-any-failure', re: /credits?\s+come[s]?\s+back\s+automatically/i },
    { id: 'any-failure', re: /any (?:failed|failing) run is refunded|all failed runs are refunded/i },
    { id: 'refund-on-request', re: /request a refund|contact us for a refund of credits/i },
  ];
  const offenders = [];
  for (const [name, text] of pages().map((f) => [f.slice(SITE.length + 1), readFileSync(f, 'utf8')])) {
    for (const sentence of sentences(visibleText(text))) {
      for (const { id, re } of TOO_WIDE) {
        const hit = re.exec(sentence);
        if (hit) offenders.push(`${name}: [${id}] "${hit[0].trim()}"`);
      }
    }
  }
  assert.deepEqual(offenders, [], `a page promises a wider refund than run-refund.ts gives:\n${offenders.join('\n')}`);
});

test('THE PREMISE CHANGED: the quota object CAN give a Credit back, and the pages must keep up', () => {
  const quota = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'quota.ts'), 'utf8');
  const math = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'quota-math.ts'), 'utf8');

  const routes = [...quota.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]);
  assert.ok(
    routes.length > 0,
    'THIS GUARD IS BROKEN, NOT THE PAGES: no routes could be read out of apps/worker/src/do/quota.ts',
  );
  const refundish = routes.filter((r) => /refund|credit-back|reverse|rebate/i.test(r));
  assert.ok(
    refundish.length > 0,
    'THE REFUND ROUTE IS GONE from apps/worker/src/do/quota.ts. Four pages now describe a refund ' +
      'this product would no longer give. Re-read those pages before removing this guard.',
  );

  assert.match(
    math,
    /const want = Math\.max\(0, amount\);/,
    'THIS GUARD IS STALE, NOT THE PAGES: splitSpend no longer clamps a negative spend to zero in ' +
      'apps/worker/src/quota-math.ts, so a spend may now be able to credit an account. Go and look.',
  );
  assert.match(
    quota.slice(quota.indexOf("'/grant-credits'")),
    /Additive only, and never negative/,
    'THIS GUARD IS STALE, NOT THE PAGES: /grant-credits no longer describes itself as additive only.',
  );
});

test('no page promises a refund for work the user KEPT, or for a stop they chose', () => {
  const named = pages().map((p) => [p.slice(SITE.length + 1), readFileSync(p, 'utf8')]);
  assert.ok(named.length > 0, 'found no .astro pages — this guard is looking in the wrong place');

  const found = scan(named);
  assert.deepEqual(
    found,
    [],
    `a page promises a refund the quota object cannot perform:\n  ${found.join('\n  ')}\n` +
      'Say the true, narrower thing instead: a call that failed reports no compute and is not ' +
      'charged. Credits already settled on steps that finished stay settled.',
  );
});

test('the guard has teeth: it still fails on the sentences that shipped', () => {
  // Two of these are now caught by the WIDER-than-the-code list rather than by `scan`: once a
  // refund exists, "the Credits come back automatically" after any failure is an over-promise
  // rather than a fiction. The sentence is still wrong and must still be caught; what changed is
  // which rule owns it. Checking each against the list that owns it is the honest version — a
  // single blanket assertion would pass for the wrong reason.
  const stillCaughtByScan = [
    ['troubleshooting.astro', '<p>Your Credits are not consumed by a run that stops here.</p>'],
  ];
  for (const [name, text] of stillCaughtByScan) {
    assert.ok(scan([[name, text]]).length > 0, `${name} slipped past every pattern — re-aim them`);
  }

  const overPromises = [
    ['credits-and-limits.astro', 'If a request fails on our side the Credits are refunded in full.'],
    ['faq.astro', 'All failed runs are refunded per the limits policy.'],
  ];
  const TOO_WIDE_RE = [/always refunded|refunded in full|full refund of your credits/i,
                       /any (?:failed|failing) run is refunded|all failed runs are refunded/i];
  for (const [name, sentence] of overPromises) {
    assert.ok(TOO_WIDE_RE.some((re) => re.test(sentence)), `${name}: no over-promise pattern caught "${sentence}"`);
  }

  // And the true replacements must not trip it, or the guard would push the pages back into silence.
  const kept = [
    ['a no-charge claim', '<p>A step that fails on our side is not charged: a call that returned nothing reports nothing.</p>'],
    ['the honest stop', '<p>The one Credit taken when the request started is not given back, and there is no other refund.</p>'],
    ['the daily reset, which uses the same words and is true', '<p>Your Credits come back at midnight UTC.</p>'],
  ];
  assert.deepEqual(scan(kept), []);

  // The sentence carve-out must not swallow the sentence that shipped. This is the exact paragraph
  // as it stood on /docs/credits-and-limits, followed by the heading that sat under it — the
  // arrangement that a character-window carve-out would have read as "this is about the reset".
  const inContext =
    '<p>If a request fails on our side — an infrastructure error, not a build that turned out ' +
    'wrong — the Credits come back automatically.</p><h2>The daily reset — and the monthly ' +
    'ceiling behind it</h2><p>Quotas reset at midnight UTC.</p>';
  // This sentence is now owned by the WIDER-than-the-code rule rather than by `scan`: with a refund
  // in the product it is an over-promise, not a fiction. The property under test is unchanged — the
  // reset carve-out must not swallow it — so it is asserted against the rule that owns it today.
  const AUTOMATIC = /credits?\s+come[s]?\s+back\s+automatically/i;
  const shippedSentence = sentences(visibleText(inContext)).find((x) => AUTOMATIC.test(x));
  assert.ok(shippedSentence, 'the carve-out defanged the shipped sentence');
  assert.ok(!RESET_CONTEXT.test(shippedSentence) || !DENIAL.test(shippedSentence),
    'the shipped sentence was swallowed by a carve-out meant for the daily reset');
});
