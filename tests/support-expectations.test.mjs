/**
 * What each plan can expect from support, and the one inbox it goes to.
 *
 * WHAT WAS THERE. Exactly one plan said anything about support — Enterprise's 'Direct support'
 * bullet — and it was rendered only inside the signed-in app, because the pricing page filters to
 * plans with a price and Enterprise has none. So a person deciding whether to pay $12 or $40 a
 * month could read allowances, modes, projects and checkpoints, and could not learn whether anyone
 * would answer them. No channel, no hours, no reply expectation, on any tier, anywhere.
 *
 * AND THE ONE SUPPORT LINK IN THE APP POINTED SOMEWHERE ELSE. plans.tsx offered
 * hello@apple.build while every address on the marketing site was apple.labs.app@gmail.com. One of
 * those two mailboxes is read by a human; a customer cannot tell which, and picking wrong looks
 * from their side exactly like being ignored.
 *
 * WHAT IS DELIBERATELY NOT ASSERTED: a response time. The owner has not committed to one and this
 * product is in beta — a checker that demanded an SLA would be demanding that someone invent a
 * promise. What is required is that every plan states its channel AND says plainly what is promised
 * about a reply, including where the honest answer is "nothing yet".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(join(ROOT, 'packages', 'shared', 'src', 'index.ts'));

const read = (...p) => readFileSync(join(ROOT, ...p), 'utf8');
const PLANS_TSX = read('apps', 'web', 'src', 'components', 'plans.tsx');
const PRICING = read('apps', 'site', 'src', 'pages', 'pricing.astro');

test('every plan the product sells states a support channel and a reply expectation', () => {
  assert.ok(S.PLAN_SUPPORT, 'there is no per-plan support statement at all');
  for (const id of S.PLAN_IDS) {
    const row = S.PLAN_SUPPORT[id];
    assert.ok(row, `${id} says nothing about support`);
    assert.ok(row.channel && row.channel.length > 3, `${id} names no channel`);
    // The half that was missing everywhere: whether anyone will actually reply.
    assert.ok(row.promise && row.promise.length > 20, `${id} does not say what to expect of a reply`);
  }
});

test('the statement is about support, not a restatement of the tier name', () => {
  for (const id of S.PLAN_IDS) {
    const { channel, promise } = S.PLAN_SUPPORT[id];
    const text = `${channel} ${promise}`.toLowerCase();
    assert.equal(text.trim(), text.trim().replace(/^(free|builder|studio|enterprise)$/, ''), `${id} is a tier name`);
    assert.ok(/email|contact|inbox/.test(text), `${id} names no way to reach anyone: ${text}`);
  }
});

test('there is one support mailbox, and both halves of the product use it', () => {
  assert.match(S.SUPPORT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]+$/, 'SUPPORT_EMAIL is not an address');
  const files = [
    ['apps', 'web', 'src', 'components', 'plans.tsx'],
    ['apps', 'site', 'src', 'components', 'Footer.astro'],
    ['apps', 'site', 'src', 'layouts', 'DocsLayout.astro'],
    ['apps', 'site', 'src', 'pages', 'status.astro'],
    ['apps', 'site', 'src', 'pages', 'docs', 'faq.astro'],
    ['apps', 'site', 'src', 'pages', 'docs', 'troubleshooting.astro'],
  ];
  for (const parts of files) {
    const src = read(...parts);
    for (const m of src.matchAll(/mailto:(\$\{SUPPORT_EMAIL\}|[^"'?\s)}]+)/g)) {
      // Reading the constant is the better form of being right, so it counts as a match.
      if (m[1] === '${SUPPORT_EMAIL}') continue;
      assert.equal(
        m[1],
        S.SUPPORT_EMAIL,
        `${parts.join('/')} points support at ${m[1]}, not the one mailbox a human reads`,
      );
    }
  }
});

test('the app shows it for every plan, including the one with no price', () => {
  // The ladder in the app is the only surface that renders all four tiers.
  assert.match(PLANS_TSX, /PLAN_SUPPORT/, 'the plan ladder does not render the support statement');
});

test('the pricing page shows it too — the page built to prevent this omission omitted it', () => {
  assert.match(PRICING, /PLAN_SUPPORT/, 'the marketing pricing page still publishes no support expectation');
});
