// A PAGE THAT OFFERS SIGN IN WITH ROBLOX SAYS, IN THE SAME PARAGRAPH, THAT IT IS IN A LIMITED TEST (M2 site fix cycle 2, finding 0).
//
// The Roblox OAuth app is in Roblox's private mode: up to 10 unique users until Roblox reviews the app (planning/roblox-oauth-setup.md; the review
// is owner action X9, open). The app draws the Roblox button for every visitor, so the 11th person gets a failed consent. The first rebuild said
// "Works today" and "or sign in with Roblox" on three pages with no word of the limit. ROBLOX_OAUTH_REVIEWED (packages/shared) is the one flag; the
// pages derive their sentences from it (src/lib/roblox-signin.ts), and this test reads the BUILT site, so a page written tomorrow is held tomorrow.
//
//   while the flag is false: every block of text on every page that offers Sign in with Roblox (a paragraph, a list item, a heading, a button, a
//     title or a description) also says "in a limited test until Roblox approves the app" in the same block;
//   when the flag is true:   no page says it is in a limited test any more (the opposite lie).
//
// THE LEGAL PAGES ARE A NAMED DEBT. /privacy, /terms and /docs/privacy-and-data describe what is held when someone signs in with Roblox and are being
// rewritten by another lane; they are listed in LEGAL_DEBT and may only shrink: the test fails when a listed page no longer offends, so the line is
// deleted rather than left to hide the next one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { SITE, blocksOf, metaTextOf, realPages } from './lib/dist.mjs';

const shared = await import('../../../packages/shared/src/index.ts');

/** What makes a sentence an OFFER of the Roblox sign-in: a sign-in or sign-up verb with Roblox, or the name of the sign-in itself. */
const OFFER = /\b(?:sign(?:s|ed|ing)?[ -]?(?:in|up)|log(?:s|ged|ging)?[ -]?in|continue|connect(?:ing)?|authori[sz]e)\b[^.!?]{0,40}\bwith Roblox\b|\bRoblox[ -](?:sign[- ]?in|log[- ]?in|login)\b|\bor with Roblox\b/i;
/** The limit, both halves: it is a limited test, and it ends when Roblox approves the app. */
const LIMIT = [/\blimited test\b/i, /\buntil Roblox approves the app\b/i];
const hasLimit = (block) => LIMIT.every((re) => re.test(block));

/**
 * Pages that describe what is held for a Roblox sign-in and are another lane's to rewrite. A shrink-only debt. /docs/ is here only because its list
 * quotes the summary line of /docs/privacy-and-data ("what it holds when you sign in with Roblox"), a sentence about data and not an offer.
 */
const LEGAL_DEBT = new Set(['/privacy/', '/terms/', '/docs/', '/docs/privacy-and-data/']);

/** Every block of words the reader or a search result gets from a page: its text blocks, then its title and descriptions. */
const wordsOf = (html) => [...blocksOf(html), ...metaTextOf(html)];
const offenders = (blocks) => blocks.filter((b) => OFFER.test(b) && !hasLimit(b));

test('the scanner can see: the three sentences the first rebuild shipped are offers, the qualified sentence is not an offender, and Roblox in passing is not an offer', () => {
  for (const offer of [
    'Make an account with your email and a password, or sign in with Roblox. You do not need a card.',
    'Use your email, or sign in with Roblox. Google and Discord are coming.',
    'You can sign in with your email, or with Roblox.',
    'Sign in with Roblox',
    'Continue with Roblox',
    'Log in with Roblox on the sign-in page.',
    'Roblox sign-in works for everyone.',
    'You can also use Sign in with Roblox on the sign-in page.',
  ]) {
    assert.ok(OFFER.test(offer), `not seen as an offer: "${offer}"`);
  }
  assert.ok(offenders(['Make an account with your email and a password, or sign in with Roblox.']).length === 1);
  assert.deepEqual(offenders(['Sign in with Roblox is in a limited test until Roblox approves the app. Email sign-in works for everyone.']), []);
  assert.deepEqual(offenders(['Sign in with Roblox is in a limited test.']).length, 1, 'half a limit passes: the sentence must say it ends when Roblox approves the app');
  assert.deepEqual(offenders(['Sign in with Roblox until Roblox approves the app.']).length, 1, 'half a limit passes: the sentence must say it is a limited test');
  for (const passing of ['A Roblox place is made of parts.', 'Roblox Studio is the editor.', 'Edits stay inside the Roblox account you connect.']) {
    assert.ok(!OFFER.test(passing), `a sentence that is not an offer is read as one: "${passing}"`);
  }
});

test('the reader sees blocks: an offer in one paragraph and the limit in the next paragraph is an offender', () => {
  const split = '<p>Make an account with your email, or sign in with Roblox.</p><p>Sign in with Roblox is in a limited test until Roblox approves the app.</p>';
  assert.equal(offenders(wordsOf(split)).length, 1, 'the limit in the NEXT paragraph satisfied the offer');
  const together = '<p>Make an account with your email. Sign in with <a href="/x">Roblox</a> is in a limited test until Roblox approves the app.</p>';
  assert.deepEqual(offenders(wordsOf(together)), [], 'an inline link split the sentence into two blocks');
  const meta = '<html><head><title>Sign in with Roblox | StudPilot</title><meta name="description" content="Or sign in with Roblox."></head><body></body></html>';
  assert.equal(offenders(wordsOf(meta)).length, 2, 'the title and the description are not read');
});

test('while the Roblox app is in private mode, every built page that offers Sign in with Roblox says it is in a limited test, in the paragraph that offers it', (t) => {
  if (shared.ROBLOX_OAUTH_REVIEWED) return t.skip('Roblox approved the app: the next test holds the opposite');
  const pages = realPages();
  const bad = [];
  const offering = [];
  const debt = new Set();
  for (const { route, html } of pages) {
    const hits = wordsOf(html).filter((b) => OFFER.test(b));
    if (hits.length === 0) continue;
    offering.push(route);
    const unqualified = offenders(hits);
    if (unqualified.length === 0) continue;
    if (LEGAL_DEBT.has(route)) debt.add(route);
    else bad.push(`${route}: "${unqualified[0].slice(0, 120)}" offers it with no limit in the same paragraph`);
  }
  assert.deepEqual(bad, []);
  for (const route of ['/', '/how-it-works/', '/blog/what-works-today/', '/docs/getting-started/']) {
    assert.ok(offering.includes(route), `${route} no longer mentions Sign in with Roblox: the scan is blind or the page changed its words (the pages that offer it: ${offering.join(', ')})`);
  }
  for (const route of LEGAL_DEBT) assert.ok(debt.has(route), `${route} no longer offers Sign in with Roblox without the limit: delete it from LEGAL_DEBT, which can only shrink`);
});

test('once Roblox has approved the app, no page says Sign in with Roblox is in a limited test (the opposite lie)', (t) => {
  if (!shared.ROBLOX_OAUTH_REVIEWED) return t.skip('the app is still in private mode: the test above holds the limit');
  const stale = [];
  for (const { route, html } of realPages()) {
    for (const b of wordsOf(html)) if (/\blimited test\b/i.test(b) && /Roblox/i.test(b)) stale.push(`${route}: "${b.slice(0, 100)}"`);
  }
  assert.deepEqual(stale, []);
});

test('the share card and the manifest do not offer Sign in with Roblox without the limit either', () => {
  for (const file of [join(SITE, 'brand', 'og.html'), join(SITE, 'public', 'site.webmanifest')]) {
    assert.ok(existsSync(file), `${file} is missing`);
    const text = readFileSync(file, 'utf8');
    assert.deepEqual(offenders(wordsOf(text)), [], `${file} offers Sign in with Roblox with no limit`);
  }
});

test('the limit sentences come from one place: the pages that offer it import them, and none types "limited test" itself', () => {
  const lib = readFileSync(join(SITE, 'src', 'lib', 'roblox-signin.ts'), 'utf8');
  assert.match(lib, /ROBLOX_OAUTH_REVIEWED/);
  assert.match(lib, /limited test until Roblox approves the app/);
  for (const page of ['pages/how-it-works.astro', 'pages/index.astro', 'pages/docs/getting-started.astro']) {
    const src = readFileSync(join(SITE, 'src', page), 'utf8');
    assert.match(src, /from '(?:\.\.\/)+lib\/roblox-signin'/, `${page} does not import the Roblox sign-in sentences`);
    assert.match(src, /ROBLOX_OAUTH_REVIEWED/, `${page} does not ask the flag`);
    assert.doesNotMatch(src.replace(/\/\*[\s\S]*?\*\//g, ''), /limited test/i, `${page} types the limit itself instead of reading it`);
  }
});
