/**
 * THREE THINGS THIS SITE PUBLISHED THAT THE PRODUCT DOES NOT HAVE.
 *
 * Found by reviewers reading the deployed docs as somebody who had just paid:
 *
 *   /docs/faq          told a customer to "ask in Plan mode — 2 credits", and /docs/modes says on
 *                      the same site "It is not a read-only Plan mode". The FAQ named a mode that
 *                      does not exist and put a price on it.
 *   /docs/credits...   said "Pro (when it ships) queues ahead", inventing a fourth tier. The plans
 *                      are Free, Pro and Max (the stored ids builder and studio are not their names),
 *                      and there is no paid queue priority at all.
 *   /docs/updating     told a customer to look for "StudPilot v0.2.0 · protocol 1" at the bottom of the
 *                      panel. The shipped plugin is 1.0.0 and prints
 *                      "StudPilot Studio · 1.0.0 · independent preview".
 *
 * Each of these is a sentence a customer acts on — looks for a mode, waits for a tier, checks a
 * version — so each of them ends in confusion rather than in a wrong belief they never test.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const DOCS = join(HERE, '..', 'src', 'pages', 'docs');
const pages = readdirSync(DOCS).filter((f) => f.endsWith('.astro'));
const text = (f) => readFileSync(join(DOCS, f), 'utf8');

test('THE PLUGIN VERSION THE DOCS NAME IS THE ONE THE PLUGIN PRINTS', () => {
  // Read it out of the plugin rather than out of another document. The panel's own string is the
  // thing a customer compares against, so that is the string this asserts on.
  const panel = readFileSync(join(ROOT, 'apps', 'studpilot-plugin', 'src', 'init.server.luau'), 'utf8');
  const shown = /text\("(StudPilot Studio · [^"]+)"/.exec(panel);
  assert.ok(shown, 'the plugin panel no longer prints a version line — re-aim this test');
  const version = /(\d+\.\d+\.\d+)/.exec(shown[1])[1];

  for (const f of pages) {
    const body = text(f);
    for (const [, found] of body.matchAll(/StudPilot v?(\d+\.\d+\.\d+)\s*·/g)) {
      assert.equal(found, version,
        `${f} tells a customer to look for StudPilot ${found} at the bottom of the panel; it prints ${version}`);
    }
  }
});

/**
 * THE TWO WAYS A PAGE INVENTS WHAT THE PLAN TABLE DOES NOT HAVE, as functions so the guard can be
 * fed text it must refuse (the last test) as well as the pages it must pass.
 *
 * A TIER: a capitalised word directly before "plan" or "tier" that is neither a plan the table
 * lists nor an ordinary word, a tier name that has no other use ("Builder", "Enterprise",
 * "Premium", "Ultimate"; "Studio plan" is caught by the first rule), or a name followed by "(when it ships)". This used to be a
 * single `if (!ids.includes('pro'))` around a scan for "Pro". When Pro became a listed plan the
 * condition turned permanently false and the scan never ran again, so it could no longer fail on
 * anything; the scan now runs on every page and what it compares against is the table.
 *
 * A QUEUE: a sentence that gives a plan priority, and does not deny it. "Pro (when it ships) queues
 * ahead" was published once, and "Priority during busy periods" was a Pro highlight until
 * 2026-09-20; no plan buys a place in the queue. A sentence that DENIES it ("No plan buys a place
 * further up that queue") is the page being correct, and is not flagged.
 */
const ORDINARY_BEFORE_PLAN = new Set(['Your', 'The', 'This', 'That', 'Each', 'Every', 'Any', 'No', 'Their', 'Our', 'Changing', 'Paid', 'Monthly', 'Daily']);
function inventedTiers(body, names) {
  const found = [];
  for (const [, word, noun] of body.matchAll(/\b([A-Z][A-Za-z]+) (plans?|tiers?)\b/g)) {
    if (!names.includes(word) && !ORDINARY_BEFORE_PLAN.has(word)) found.push(`"${word} ${noun}"`);
  }
  for (const [, word] of body.matchAll(/\b(Builder|Enterprise|Premium|Ultimate)\b/g)) found.push(`"${word}"`);
  for (const [, word] of body.matchAll(/\b([A-Z][A-Za-z]+) \(when it ships\)/g)) found.push(`"${word} (when it ships)"`);
  // The other direction: a page denying a plan the table lists ("there is no Pro tier").
  for (const [, word, noun] of body.matchAll(/\bno (\w+) (plan|tier)\b/gi)) {
    if (names.some((n) => n.toLowerCase() === word.toLowerCase())) found.push(`"no ${word} ${noun}" (it is listed)`);
  }
  return found;
}
const QUEUE_CLAIM = /\b(priority (queue|access|during)|queues? ahead|ahead (of|in) the (queue|line)|(skip|jump)s? the (queue|line)|further up (the|that) queue|front of the (queue|line))\b/i;
const DENIAL = /\b(no|not|never|nothing|neither|cannot|without)\b/i;
function queueClaims(body) {
  return body.split(/(?<=[.!?])\s+/).filter((sentence) => QUEUE_CLAIM.test(sentence) && !DENIAL.test(sentence)).map((x) => x.trim());
}
const docText = (f) => visibleText(text(f).replace(/<code>[\s\S]*?<\/code>/g, ''));
/* The changelog is read too: it is history, and may say what WAS true, but it may not call the plans of today by names they
   do not have. It carried "there is no Pro tier. The paid tiers are Builder and Studio" next to a pricing page selling Pro and Max. */
const CHANGELOG = visibleText(readFileSync(join(HERE, '..', 'src', 'pages', 'changelog.astro'), 'utf8'));

test('NO PAGE INVENTS A PLAN, and the three that exist are the three that are named', async () => {
  // The plans come from the shared PLAN_TABLE through PLAN_COPY, not from a parse of its source: the
  // table moved twice (PLAN_LIMITS, then PLAN_TABLE) and each move broke the parse. A guard whose
  // own input is wrong reports the wrong defect, so the `>= 3` check below is doing real work.
  const { PLAN_COPY, LISTED_PLAN_IDS } = await import('../../../packages/shared/src/index.ts');
  const names = LISTED_PLAN_IDS.map((id) => PLAN_COPY[id].name);
  assert.deepEqual(names, ['Free', 'Pro', 'Max'], 'the listed plans changed — decide what the docs may name');
  assert.ok(pages.length >= 5, `read only ${pages.length} docs pages — this would pass on nothing`);

  for (const f of pages) {
    assert.deepEqual(inventedTiers(docText(f), names), [], `${f} names a tier the plan table does not list (${names.join(', ')})`);
  }
  assert.deepEqual(inventedTiers(CHANGELOG, names), [], `changelog.astro names a tier the plan table does not list (${names.join(', ')})`);
});

test('NO PAGE, AND NO PLAN CARD, GIVES A PLAN A PLACE IN A QUEUE', async () => {
  // The changelog is not scanned for this: its v0.1 entry records that a priority queue was once PROMISED
  // ("Pro (..., priority queue, ...) opens as a waitlist"), which is history, and the same entry says it is gone.
  const { PLAN_COPY, LISTED_PLAN_IDS } = await import('../../../packages/shared/src/index.ts');
  const surfaces = [
    ...pages.map((f) => [`docs/${f}`, docText(f)]),
    ['pricing.astro', visibleText(readFileSync(join(HERE, '..', 'src', 'pages', 'pricing.astro'), 'utf8'))],
    ...LISTED_PLAN_IDS.map((id) => [`PLAN_COPY.${id}`, [PLAN_COPY[id].blurb, ...PLAN_COPY[id].highlights].join('. ')]),
  ];
  for (const [name, body] of surfaces) assert.deepEqual(queueClaims(body), [], `${name} gives a plan queue priority, which no plan has`);
});

test('the two guards above have teeth: they refuse what was published and pass what is true', async () => {
  const names = ['Free', 'Pro', 'Max'];
  // The sentences that shipped, and invented tiers of every shape the scan knows.
  assert.deepEqual(queueClaims('Pro (when it ships) queues ahead.'), ['Pro (when it ships) queues ahead.']);
  assert.equal(queueClaims('Priority during busy periods').length, 1);
  assert.equal(queueClaims('Paid plans get priority access when it is busy.').length, 1);
  assert.deepEqual(inventedTiers('Pro (when it ships) queues ahead.', names), ['"Pro (when it ships)"']);
  assert.deepEqual(inventedTiers('The Premium plan and the Team tier.', names), ['"Premium plan"', '"Team tier"', '"Premium"']);
  assert.deepEqual(inventedTiers('Upgrade to the Studio plan, or Builder.', names), ['"Studio plan"', '"Builder"']);
  assert.deepEqual(inventedTiers('Ask about Enterprise.', names), ['"Enterprise"']);
  // The changelog line that shipped next to a pricing page selling Pro and Max.
  assert.deepEqual(
    inventedTiers('Since withdrawn: there is no Pro tier. The paid tiers are Builder and Studio.', names),
    ['"Builder"', '"no Pro tier" (it is listed)'],
  );
  assert.deepEqual(inventedTiers('Since replaced: the plans are Free, Pro and Max, so there is no priority queue.', names), []);
  // And the true sentences do not trip them: the denial the docs carry, ordinary English, real names.
  assert.deepEqual(queueClaims('No plan buys a place further up that queue — paying changes your allowance, not your turn.'), []);
  assert.deepEqual(queueClaims('Requests are queued per account, and under heavy load a request may briefly wait.'), []);
  assert.deepEqual(inventedTiers('Your plan is Free. The Pro plan and the Max plan add Credits. Changing plans takes effect at once.', names), []);
});

test('the 404 a stranger reaches from a dead share link is written in English', () => {
  const notFound = readFileSync(join(HERE, '..', 'src', 'pages', '404.astro'), 'utf8');
  assert.doesNotMatch(notFound, /\bA studpilot\b/, 'the headline reads "A studpilot" — this is the first page a stranger sees');
  assert.doesNotMatch(notFound, /\bA (a|e|i|o|u)/, 'an "a" before a vowel on the 404 headline');
});
