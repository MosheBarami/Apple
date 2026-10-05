// THE SITE SAYS "BETA", AND THE PRICING PAGE SAYS WHAT BETA MEANS FOR MONEY (handoff M2, "Pricing page" and "Copy").
//
// The site ships before any piece has passed the quality bar, so every page that could be read as a promise carries the
// label, and the promise itself is framed as the bar StudPilot is being built to, not a result. The pricing headline is
// the owner's line, word for word: "Free while in beta. Paid plans start later". And nothing on the site can charge:
// no Stripe link, no checkout link, no Enterprise tier (planning/proof/M2/DECISIONS.md section 3).
//
// Reads the BUILT pages. The two scans (a link to a payment host, a word) are run on a synthetic page first so that a
// scanner that finds nothing cannot pass for a clean site.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/beta-labels.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { distPage, distPages, hrefsOf, textOf } from './lib/dist.mjs';

const LABELLED = ['/', '/pricing/', '/how-it-works/'];
const HEADLINE = 'Free while in beta. Paid plans start later';

/** Links and form targets that lead to taking a payment. */
function paymentTargets(html) {
  const hrefs = hrefsOf(html);
  const actions = [...html.matchAll(/<form\b[^>]*?\saction\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((m) => m[1] ?? m[2]);
  return [...hrefs, ...actions].filter((t) => /stripe|checkout|billing-portal|\/api\/billing/i.test(t));
}

test('the scanners can see: a Stripe link, a checkout form and the word Enterprise are all caught', () => {
  assert.deepEqual(paymentTargets('<a href="https://checkout.stripe.com/c/pay/x">Buy</a>'), ['https://checkout.stripe.com/c/pay/x']);
  assert.deepEqual(paymentTargets('<a href="/api/billing/checkout">Buy</a>'), ['/api/billing/checkout']);
  assert.deepEqual(paymentTargets('<form method="post" action="/api/billing/checkout"></form>'), ['/api/billing/checkout']);
  assert.deepEqual(paymentTargets('<a href="/pricing">Pricing</a><a href="/app/signup">Start</a>'), []);
  assert.match(textOf('<h2>Enterprise</h2>'), /Enterprise/i);
});

test('the front page, /pricing and /how-it-works each carry the Beta label in their own content, not only in the shared header and footer', () => {
  for (const route of LABELLED) {
    const html = distPage(route).html;
    const main = textOf(html.slice(html.indexOf('<main'), html.indexOf('</main>')));
    assert.match(main, /\bBeta\b/, `${route} does not say "Beta" in its own content`);
    assert.match(textOf(html), /\bBeta\b/, `${route} does not say "Beta" anywhere a reader can see it`);
  }
});

test('/pricing says, in the owner\'s words, that it is free while in beta and paid plans start later', () => {
  const text = textOf(distPage('/pricing/').html);
  assert.ok(text.includes(HEADLINE), `/pricing does not contain "${HEADLINE}"`);
  const h1 = distPage('/pricing/').html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/);
  assert.ok(h1 && textOf(h1[1]).includes(HEADLINE), 'the headline of /pricing is not the owner\'s line');
});

test('the front page says the promise is the bar being built to, not a result', () => {
  const text = textOf(distPage('/').html);
  assert.ok(text.includes("Ask for any piece. It looks pro, it works, and we never claim what we didn't prove."), 'the plan\'s promise is missing from the front page, word for word');
  assert.match(text, /bar[^.]{0,60}(?:building|built) (?:to|towards?)|(?:building|built) (?:to|towards?)[^.]{0,60}bar/i, 'the promise is not framed as the bar StudPilot is being built to');
});

test('no page links to Stripe or a checkout, and no page names an Enterprise tier', () => {
  const pages = distPages();
  for (const { route, html } of pages) {
    assert.deepEqual(paymentTargets(html), [], `${route} links to a payment or checkout endpoint`);
    assert.doesNotMatch(html, /stripe\.com/i, `${route} references stripe.com`);
    assert.doesNotMatch(textOf(html), /\bEnterprise\b/i, `${route} names an Enterprise tier; none was decided and none is offered`);
  }
});

test('every paid plan card on /pricing is a disabled control, not a link', () => {
  const html = distPage('/pricing/').html;
  const disabled = [...html.matchAll(/<button\b[^>]*\bdisabled\b[^>]*>([\s\S]*?)<\/button>/gi)].map((m) => textOf(m[1]));
  assert.ok(disabled.length >= 2, 'the Pro and Max cards should each end on a disabled "Checkout not open" button');
  for (const label of disabled) assert.match(label, /not open/i);
});
