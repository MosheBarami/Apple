// THREE PLACES WHERE THE SITE SAID LESS THAN IT KNEW.
//
//   /pricing never mentioned the service-wide inference ceiling. A prospect reads "about N builds a
//   month, free" and signs up; a few busy accounts later a run stops with "Apple has reached today's
//   shared building capacity" while their own balance still shows Credits. /docs/credits-and-limits
//   and /docs/troubleshooting both disclose it — the page people decide on did not.
//
//   /docs/billing documented five sections of paid-subscription procedure as if it were live. The
//   only caveat on the page covered extra Credits, so nothing told a reader that no subscription
//   can be started at all, while /pricing and /terms both say checkout is closed.
//
//   /404 is the only URL whose own canonical returns 404, and the page nominated it anyway.
//
// The cap figure is checked against the worker's own constant rather than a number typed here, so
// the sentence cannot outlive the ceiling it describes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const dist = (rel) => fileURLToPath(new URL(`../dist/${rel}`, import.meta.url));

/**
 * Rendered HTML keeps the source's line breaks, so a sentence that wraps in the .astro file
 * contains a newline in dist/. Every phrase assertion below reads this, not the raw bytes — the
 * first version of this guard went red on a page that said exactly the right thing, which is the
 * failure mode a copy guard must not have.
 */
const flat = (html) => html.replace(/\s+/g, ' ');

const pricing = read('../src/pages/pricing.astro');
const billing = read('../src/pages/docs/billing.astro');
const base = read('../src/layouts/Base.astro');
const notFound = read('../src/pages/404.astro');

const workerPricing = read('../../worker/src/pricing.ts');
const shared = read('../../../packages/shared/src/index.ts');

const num = (src, name) => {
  const m = new RegExp(`export const ${name}[^=]*=\\s*([\\d_]+)`).exec(src);
  assert.ok(m, `${name} not found`);
  return Number(m[1].replace(/_/g, ''));
};

test('/pricing discloses the shared ceiling, with the figure derived from the worker', () => {
  assert.match(pricing, /DAILY_NEURON_CEILING/, '/pricing does not read the worker ceiling');
  assert.match(pricing, /shared building capacity/i, 'the message a reader will actually see is not quoted');

  if (!existsSync(dist('pricing/index.html'))) return;
  const html = flat(readFileSync(dist('pricing/index.html'), 'utf8'));

  const ceiling = num(workerPricing, 'FREE_NEURONS_PER_DAY') + num(workerPricing, 'BILLABLE_NEURONS_PER_DAY');
  const perCredit = num(shared, 'NEURONS_PER_CREDIT');
  const serviceCredits = Math.floor(ceiling / perCredit);

  assert.ok(
    html.includes(serviceCredits.toLocaleString('en-US')),
    `the rendered page does not carry the service-wide figure ${serviceCredits.toLocaleString('en-US')}`,
  );
  assert.match(html, /shared building capacity/i);
  // and it must say the customer's own balance is not what ran out
  assert.match(html, /your own balance still shows Credits/i);
});

test('the shared-cap sentence is the whole point, so it must be above the FAQ', () => {
  if (!existsSync(dist('pricing/index.html'))) return;
  const html = flat(readFileSync(dist('pricing/index.html'), 'utf8'));
  const cap = html.search(/shared building capacity/i);
  const compare = html.search(/What each plan includes/i);
  assert.ok(cap !== -1 && compare !== -1);
  assert.ok(cap < compare, 'the disclosure is below the comparison table, not beside the plan cards');
});

test('/docs/billing says checkout is closed, and asks rather than asserts it', () => {
  assert.match(billing, /\/api\/billing\/config/, 'the page types the answer instead of asking');
  assert.match(billing, /checkoutOpen/, 'no derived flag');
  assert.match(billing, /!checkoutOpen &&/, 'the caveat is not gated on the probe');

  if (!existsSync(dist('docs/billing/index.html'))) return;
  const html = flat(readFileSync(dist('docs/billing/index.html'), 'utf8'));
  // The live deployment has no Stripe key, so the probe answers closed and this must render.
  assert.match(html, /no way to become a paying customer yet/i);
  assert.doesNotMatch(
    /<meta name="description" content="([^"]*)"/.exec(html)[1],
    /^What happens when a payment fails/,
    'the description still reads as though subscriptions are live',
  );
});

test('the 404 page nominates no canonical and is marked noindex', () => {
  assert.match(base, /noindex\?: boolean/, 'Base has no noindex prop');
  assert.match(notFound, /\n  noindex\n/, '404.astro does not pass noindex');

  if (!existsSync(dist('404.html'))) return;
  const html = flat(readFileSync(dist('404.html'), 'utf8'));
  assert.match(html, /<meta name="robots" content="noindex/);
  assert.doesNotMatch(html, /rel="canonical"/, 'the 404 still nominates itself as a destination');
  assert.doesNotMatch(html, /og:url/, 'og:url is the same destination claim in the other half of the head');
});

test('noindex is opt-in: every other route keeps its canonical', () => {
  for (const route of ['pricing/index.html', 'docs/index.html', 'index.html', 'privacy/index.html']) {
    if (!existsSync(dist(route))) continue;
    const html = readFileSync(dist(route), 'utf8');
    assert.match(html, /rel="canonical"/, `${route} lost its canonical`);
    assert.doesNotMatch(html, /name="robots" content="noindex/, `${route} was marked noindex`);
  }
});

test('the a/an slip in /docs/updating is gone, and nowhere else', () => {
  for (const rel of ['../src/pages/docs/updating.astro']) {
    assert.doesNotMatch(read(rel), /\ba\s+Apple\b/, 'the article is wrong again');
  }
  // the corrected sentence is still the sentence
  assert.match(read('../src/pages/docs/updating.astro'), /not an\s+Apple choice/);
});

// ---------------------------------------------------------------------------
// The guard can fail.
// ---------------------------------------------------------------------------
test('the guard rejects the pages that shipped', () => {
  assert.doesNotMatch('One build costs about 77 Credits, so every figure above is a number of builds.', /shared building capacity/i);
  assert.doesNotMatch(
    '<p>Everything to do with money lives in the billing portal.</p>',
    /no way to become a paying customer yet/i,
  );
  assert.doesNotMatch('<link rel="canonical" href="/404/">', /name="robots" content="noindex/);
  assert.match('That is platform behaviour, not a\n    Apple choice.', /\ba\s+Apple\b/);
});
