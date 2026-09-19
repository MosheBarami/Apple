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
const REFUND_CLAIMS = [
  { id: 'refunded', re: /\brefunded\b/i },
  { id: 'credits-come-back', re: /\bcredits?\b[^.]{0,60}\bcomes?\s+back\b/i },
  { id: 'credits-returned', re: /\bcredits?\b[^.]{0,40}\b(are|is)\s+(returned|given\s+back|put\s+back)\b/i },
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

const sentences = (hay) => hay.split(/(?<=[.!?])\s+/);

function scan(named) {
  const found = [];
  for (const [name, text] of named) {
    for (const sentence of sentences(visibleText(text))) {
      if (RESET_CONTEXT.test(sentence)) continue;
      for (const { id, re } of REFUND_CLAIMS) {
        const hit = re.exec(sentence);
        if (hit) found.push(`${name}: [${id}] "${hit[0].trim()}"`);
      }
    }
  }
  return found;
}

test('THE PREMISE IS STILL TRUE: the quota object cannot give a Credit back', () => {
  const quota = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'do', 'quota.ts'), 'utf8');
  const math = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'quota-math.ts'), 'utf8');

  const routes = [...quota.matchAll(/url\.pathname === '([^']+)'/g)].map((m) => m[1]);
  assert.ok(
    routes.length > 0,
    'THIS GUARD IS BROKEN, NOT THE PAGES: no routes could be read out of apps/worker/src/do/quota.ts',
  );
  const refundish = routes.filter((r) => /refund|credit-back|reverse|rebate/i.test(r));
  assert.deepEqual(
    refundish,
    [],
    `apps/worker/src/do/quota.ts now exposes ${refundish.join(', ')}. A refund path may exist — ` +
      're-read this guard and decide what the pages may promise, rather than deleting it.',
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

test('no page tells a customer that spent Credits come back', () => {
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

test('the guard has teeth: it fails on the three sentences that shipped', () => {
  const shipped = [
    ['troubleshooting.astro', '<p>Your Credits are not consumed by a run that stops here.</p>'],
    ['credits-and-limits.astro', '<p>If a request fails on our side the Credits come back automatically.</p>'],
    ['faq.astro', '<p>Credits for unexecuted work on our side are refunded per the limits policy.</p>'],
  ];
  for (const [name, text] of shipped) {
    assert.ok(scan([[name, text]]).length > 0, `${name} slipped past every pattern — re-aim them`);
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
  assert.ok(scan([['in context', inContext]]).length > 0, 'the carve-out defanged the shipped sentence');
});
