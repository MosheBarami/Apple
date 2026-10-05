// THE SITE NAMES WHO RUNS IT, AND NAMES THE SAME ONE EVERYWHERE.
//
// Three places on this site say who operates the service: the footer byline under the wordmark, the
// first sentence of /privacy, and the first sentence of /terms. On 2026-09-20 they said three
// different things, and two of them were the same rename applied without being read:
//
//   footer   <p class="mono">StudPilot</p>           — was "Golem Labs"
//   /privacy 'StudPilot is built and operated by StudPilot ("we", "us").'
//   /terms   'the AI building service for Roblox operated by <another name>.'
//
// The rebrand rewrote the token "Golem" wherever it appeared, so the same name came out in one place
// and not in another, and /privacy identified a company by the name of its product. A privacy
// policy and a terms of service that name different operators are a contradiction in the two
// documents on the site whose entire job is to be precise about who is promising what, and neither
// the build, the typechecker, the link checker nor a screenshot can see it. It is also the exact
// shape the next rename will take.
//
// WHAT CHANGED ON 2026-10-05 (owner decision D-13). The operator is now deliberately "StudPilot",
// and the contact is support@studpilot.app. The old rule here, "the operator is not merely the
// product name repeated", was a guard against an accident and is not true of a decision, so it is
// restated to the property it protected: a product may be its own named operator ONLY WHILE NOTHING IS
// CHARGED. Before money is taken an adult or a company has to be the named operator (BLOCKED.md N9),
// so the day the terms page says paid subscriptions are open, an operator that is just the product's
// name fails here.
//
// WHAT IT GUARDS: the three statements name one operator, that operator is OPERATOR_NAME in
// packages/shared (the one value to change), and the footer byline is the operator. It reads the
// BUILT pages, because the footer is a component and what a reader receives is the rendered page.
//
// Run with:  npx astro build && node --test tests/one-operator.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(SITE, 'dist');
const SHARED = await import(join(SITE, '..', '..', 'packages', 'shared', 'src', 'index.ts'));

// The product's own name. The operator may be this only while nothing is charged (see the header).
const PRODUCT = 'StudPilot';

function page(rel) {
  const file = join(DIST, rel);
  assert.ok(
    existsSync(file),
    `dist/${rel} is missing — run \`npx astro build\` in apps/site first. A guard with no page to ` +
      'read has proved nothing about the pages.',
  );
  // Tags out, entities in, whitespace flattened: what a reader sees, as one line.
  return readFileSync(file, 'utf8')
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/\s+/g, ' ')
    .trim();
}

/** The name following "operated by", up to the sentence end. */
function operatorIn(text, where) {
  const m = text.match(/operated by ([A-Z][A-Za-z0-9&.\- ]*?)\s*[.,(]/);
  assert.ok(
    m,
    `${where} no longer contains an "operated by <name>" sentence, so this guard can no longer see ` +
      'the thing it compares. Re-aim it at wherever the operator is now named; do not delete it.',
  );
  return m[1].trim();
}

test('/terms and /privacy name the SAME operator', () => {
  const terms = operatorIn(page('terms/index.html'), '/terms');
  const privacy = operatorIn(page('privacy/index.html'), '/privacy');
  assert.equal(
    privacy,
    terms,
    `/privacy says the service is operated by "${privacy}" and /terms says "${terms}". These are the ` +
      'two documents on the site whose job is to be exact about who is promising what, and they are ' +
      'the two that must not disagree.',
  );
});

test('the operator the pages name is the one value in packages/shared (OPERATOR_NAME), not a copy that can drift', () => {
  assert.equal(typeof SHARED.OPERATOR_NAME, 'string', 'packages/shared no longer exports OPERATOR_NAME');
  assert.ok(SHARED.OPERATOR_NAME.length > 0);
  for (const [where, rel] of [['/terms', 'terms/index.html'], ['/privacy', 'privacy/index.html']]) {
    assert.equal(operatorIn(page(rel), where), SHARED.OPERATOR_NAME, `${where} names an operator other than OPERATOR_NAME ("${SHARED.OPERATOR_NAME}")`);
  }
});

/**
 * THE RULE THAT REPLACED "the operator is not the product's name". `termsText` is the visible text of /terms.
 * Returns the sentence of the problem, or null: a product may be its own named operator only while paid
 * subscriptions are closed. The terms page says which it is ("Paid subscriptions are open" in its Payments
 * section, from the build-time probe of /api/billing/config).
 */
export function operatorProblem(termsText, operator) {
  const chargingOpen = /Paid subscriptions are open/.test(termsText);
  if (chargingOpen && operator === PRODUCT) {
    return `the terms say paid subscriptions are open, and the operator is "${operator}", the product's own name: before money is charged an adult or a company has to be the named operator (BLOCKED.md N9)`;
  }
  return null;
}

test('the product may be its own named operator only while nothing is charged', () => {
  const operator = operatorIn(page('terms/index.html'), '/terms');
  // The live pages: whichever state the build probe found, the rule holds.
  assert.equal(operatorProblem(page('terms/index.html'), operator), null);
  // The rule itself, on fixtures, so it can fail (a guard that has never been seen red proves nothing).
  assert.match(operatorProblem('8. Payments Paid subscriptions are open. The published plans are', PRODUCT) ?? '', /N9/, 'charging open with the product as its own operator must be refused');
  assert.equal(operatorProblem('8. Payments Paid subscriptions are open. The published plans are', 'Example Ltd'), null, 'a named company may charge');
  assert.equal(operatorProblem('8. Payments Nobody can be charged yet', PRODUCT), null, 'nothing is charged, so the product may be its own operator');
});

test('the footer byline is the operator, said as the operator the terms name', () => {
  // Read on a page that is not the landing: the landing has its own layout and no Footer.astro.
  const html = readFileSync(join(DIST, '404.html'), 'utf8');
  const brand = html.slice(html.indexOf('foot__brand'), html.indexOf('foot__brand') + 2000);
  assert.ok(brand.includes('foot__tag'), 'the footer brand block no longer holds its tagline — re-read this guard');

  const byline = brand.match(/<p class="mono"[^>]*>([^<]+)<\/p>/);
  assert.ok(
    byline,
    'the footer brand block no longer carries a byline. If it was removed on purpose, remove this ' +
      'assertion on purpose too; it is here because the byline was silently turned into a duplicate.',
  );
  const text = byline[1].trim();
  assert.equal(
    text,
    operatorIn(page('terms/index.html'), '/terms'),
    `the footer byline is "${text}" and /terms names a different operator`,
  );
});
