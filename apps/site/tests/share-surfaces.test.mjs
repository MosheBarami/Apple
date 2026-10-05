// WHAT A LINK UNFURLS INTO IS COPY TOO: the share card, the web manifest and the title and description tags are read like a page.
//
// Handoff M2, "Copy": must not claim anything the product does not yet do, and the promise is the plan's, marked beta. The share card
// (apps/site/brand/og.html, rendered to public/og.png) is what every link to the site shows, and the manifest is what a phone shows when it is
// added to the home screen. Both said "Describe a Roblox game. StudPilot builds it ... straight into the place you have open in Studio" and
// "Works inside Roblox Studio": whole-game framing the plan forbids ("Not in version 1: whole games from one line"), the competitor shape
// scripts/check-copy.mjs bans, and a claim about Studio that is true of nobody who just arrived, because new customers cannot get the plugin.
// No guard read either file: every one of them read pages.
//
// WHAT THIS READS, derived and never listed:
//   - brand/og.html: the words a reader sees (comments, styles and tags out), and its Beta label and its promise, word for word;
//   - public/site.webmanifest: name, short_name and description;
//   - every built page: <title>, the description, og:title, og:description, og:image:alt, twitter:title and twitter:description;
// against the banned copy (tests/lib/banned-copy.mjs), the competitor shapes (scripts/lib/copy-shapes.mjs, the list check-copy reads), and,
// while STUDIO_PLUGIN_STORE_LIVE is false, the Studio-works claims. The scanners are run on the old card's text first.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/share-surfaces.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BANNED, STUDIO_BUILD_CLAIMS } from './lib/banned-copy.mjs';
import { SITE, attrsOf, distPages, realPages, textOf } from './lib/dist.mjs';
import { SHAPES } from '../../../scripts/lib/copy-shapes.mjs';

const shared = await import('../../../packages/shared/src/index.ts');
const PROMISE = "Ask for any piece. It looks pro, it works, and we never claim what we didn't prove.";
const OLD_CARD = "Describe a Roblox game. StudPilot builds it. The parts, the scripts, the systems, straight into the place you have open in Studio. Works inside Roblox Studio · Free to start";

/** The words a person sees on a card source: comments, styles, scripts and tags out. */
const cardText = (html) =>
  textOf(html.replace(/<!--[\s\S]*?-->/g, ' '));

/** Every shape this text breaks, as short names. */
function problems(text) {
  const out = [];
  for (const [re, what] of BANNED) if (re.test(text)) out.push(what);
  for (const shape of SHAPES) if (shape.re.test(text)) out.push(`competitor shape ${shape.id}`);
  if (!shared.STUDIO_PLUGIN_STORE_LIVE) for (const [re, what] of STUDIO_BUILD_CLAIMS) if (re.test(text)) out.push(what);
  return out;
}

test('the scanners can see: the old card, the old manifest and each banned shape are caught; the new promise passes', () => {
  assert.ok(problems(OLD_CARD).length >= 2, `the old card was not caught: ${JSON.stringify(problems(OLD_CARD))}`);
  assert.ok(problems('Describe a Roblox game. StudPilot builds it.').some((p) => /whole-game|describe-it-then-builds-it/.test(p)));
  assert.ok(problems('Works inside Roblox Studio').some((p) => /works inside/.test(p)));
  assert.ok(problems('StudPilot builds it in your own Studio place.').length >= 1);
  assert.deepEqual(problems(PROMISE), []);
  assert.deepEqual(problems('An AI co-pilot for Roblox Studio. Free while in beta.'), []);
  assert.equal(cardText('<!-- works inside Roblox Studio --><style>h1{}</style><h1>Hi</h1>'), 'Hi');
});

test('the share card (brand/og.html) says the plan\'s promise under a Beta label, and nothing the banned copy or the competitor shapes name', () => {
  const file = join(SITE, 'brand', 'og.html');
  assert.ok(existsSync(file), 'apps/site/brand/og.html is missing');
  const text = cardText(readFileSync(file, 'utf8'));
  assert.ok(text.length > 40, 'the card holds almost no text: the scan found nothing to judge');
  assert.ok(text.includes(PROMISE), 'the card does not carry the plan\'s promise, word for word');
  assert.match(text, /\bBeta\b/, 'the card does not carry the Beta label');
  assert.match(text, /the bar we are building to/i, 'the card does not frame the promise as the bar being built to');
  assert.deepEqual(problems(text), [], `the share card says what it must not: ${text}`);
});

test('the web manifest names the product as a beta co-pilot and says nothing the banned copy or the competitor shapes name', () => {
  const manifest = JSON.parse(readFileSync(join(SITE, 'public', 'site.webmanifest'), 'utf8'));
  for (const k of ['name', 'short_name', 'description']) assert.ok(typeof manifest[k] === 'string' && manifest[k].length > 0, `the manifest has no ${k}`);
  assert.match(`${manifest.name} ${manifest.description}`, /\bbeta\b/i, 'the manifest does not say beta');
  assert.deepEqual(problems(`${manifest.name}. ${manifest.short_name}. ${manifest.description}`), [], 'the manifest says what it must not');
});

/** The title and the description tags of a built page: [{ tag, text }]. */
function tagsOf(html) {
  const out = [];
  const title = html.match(/<title>([\s\S]*?)<\/title>/);
  if (title) out.push({ tag: 'title', text: textOf(title[1]) });
  for (const m of html.matchAll(/<meta\b[^>]*>/g)) {
    const a = attrsOf(m[0]);
    const key = a.name ?? a.property;
    if (['description', 'og:title', 'og:description', 'og:image:alt', 'twitter:title', 'twitter:description'].includes(key) && a.content !== undefined) {
      out.push({ tag: key, text: a.content.replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"') });
    }
  }
  return out;
}

test('the tag reader can see: it reads a title, a description and the og and twitter twins', () => {
  const tags = tagsOf('<title>A | StudPilot</title><meta name="description" content="d"><meta property="og:description" content="o"><meta name="twitter:title" content="t"><meta property="og:image:alt" content="a">');
  assert.deepEqual(tags.map((t) => t.tag), ['title', 'description', 'og:description', 'twitter:title', 'og:image:alt']);
});

test('every built page\'s title, description and share tags say nothing the banned copy or the competitor shapes name, and claim no Studio build while the plugin cannot be had', () => {
  const pages = realPages();
  let read = 0;
  for (const { route, html } of pages) {
    for (const t of tagsOf(html)) {
      read += 1;
      assert.deepEqual(problems(t.text), [], `${route} <${t.tag}>: "${t.text}"`);
    }
  }
  assert.ok(read >= pages.length * 5, `only ${read} tags were read from ${pages.length} pages: the reader is blind`);
});

test('every built page nominates the card as its og:image, and the card is a file the build ships', () => {
  const pages = realPages();
  for (const { route, html } of pages) {
    const m = html.match(/<meta property="og:image" content="([^"]+)"/);
    assert.ok(m, `${route} has no og:image`);
    assert.equal(m[1], 'https://studpilot.app/og.png', `${route} nominates ${m[1]}`);
  }
  assert.ok(distPages().length > 0);
  assert.ok(existsSync(join(SITE, 'dist', 'og.png')), 'dist/og.png is missing');
});
