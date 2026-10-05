// EVERY PAGE THAT TALKS ABOUT PAIRING THE PLUGIN OR BUILDING IN STUDIO SAYS, ON THAT PAGE, THAT NEW CUSTOMERS CANNOT GET THE PLUGIN (M2 site fix cycle 1).
//
// STUDIO_PLUGIN_STORE_LIVE is false while the Creator Store listing is unavailable: a new customer can sign up, chat and plan, and cannot build in
// Studio. The first rebuild said "it builds the piece in your own Studio place" in the hero, the meta description and the rail, labelled "Pair the plugin"
// as "Works today", and put the only caveat in the last sentence of the page. This is the sweep that was missing: it is derived from the BUILT site, so a
// page written tomorrow is held tomorrow, and it is conditional on the flag, so the day the listing is back it asks for the opposite caveat (that the
// plugin is free on the Creator Store) instead of demanding the old one.
//
// A page "talks about" the plugin when one of its sentences pairs it with something or says StudPilot builds, changes or edits in Studio or in your place.
// The caveat is one of the ways the product itself says it (the status page's known issue, the pricing note, the docs plugin page): "not open to new
// customers", "cannot get", "installation is unavailable", "not on the Creator Store", "cannot build in Studio". The docs pages that ARE the plugin's
// documentation and the pages that quote the app's own words are included: they carry the caveat too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { distPage, realPages, textOf } from './lib/dist.mjs';

const shared = await import('../../../packages/shared/src/index.ts');

const TALKS = /\bpair(?:s|ed|ing)?\b[^.]{0,30}\bplugin\b|\bplugin\b[^.]{0,40}\bpair|\b(?:build|builds|built|building|change|changes|edit|edits)\b[^.]{0,50}\b(?:in|inside|into) (?:your|the|roblox|a|that) (?:own )?(?:roblox )?(?:studio|place)\b/i;
const CAVEAT = /not open to new customers|new customers cannot|cannot get (?:it|the plugin)|installation is unavailable|installation unavailable|is not on the Creator Store|cannot be installed from the Roblox Creator Store|cannot build (?:it )?(?:in|inside) Studio/i;
/** Pages that only mention the plugin in passing through the shared chrome (the header and footer carry no such sentence), none are exempt. */
const sentences = (text) => text.split(/(?<=[.!?])\s+/);

test('the scanners can see: a hero sentence is a plugin talk, and the three ways the site says it cannot be had are caveats', () => {
  assert.match('You ask in the web app, and a plugin builds the piece in your own Studio place.', TALKS);
  assert.match('Open StudPilot in Roblox Studio and type the 6-character code. Pair the plugin first.', TALKS);
  assert.doesNotMatch('Ask for any piece. It looks pro, it works.', TALKS);
  for (const c of ['The Studio plugin is not open to new customers yet.', 'Public installation is unavailable right now.', 'The plugin is not on the Creator Store.', 'new customers cannot get it yet']) assert.match(c, CAVEAT);
});

test('while the plugin cannot be had, every built page that talks about pairing it or building in Studio says so on the same page', () => {
  assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the plugin can be had now: re-aim this test (the caveat to demand becomes "free on the Creator Store")');
  const pages = realPages();
  let talkers = 0;
  const bad = [];
  for (const { route, html } of pages) {
    const text = textOf(html);
    const hits = sentences(text).filter((s) => TALKS.test(s));
    if (hits.length === 0) continue;
    talkers += 1;
    if (!CAVEAT.test(text)) bad.push(`${route}: "${hits[0].slice(0, 110)}" and no caveat anywhere on the page`);
  }
  assert.deepEqual(bad, []);
  assert.ok(talkers >= 6, `only ${talkers} pages talk about the plugin: the scan is blind`);
  for (const route of ['/', '/how-it-works/', '/catalog/', '/pricing/', '/blog/what-works-today/', '/docs/getting-started/', '/docs/plugin/']) {
    assert.match(textOf(distPage(route).html), CAVEAT, `${route} does not say new customers cannot get the plugin`);
  }
});

test('while the plugin cannot be had, the caveat is where the claim is: the front page says it in the hero, before the first button, and in the meta description', () => {
  const html = distPage('/').html;
  const hero = textOf(html.slice(html.indexOf('<h1'), html.indexOf('hero__cta')));
  assert.match(hero, CAVEAT, 'the hero makes its claim and the caveat is somewhere else on the page');
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  assert.match(description, CAVEAT, 'the meta description (what a search result shows) leaves the caveat out');
});
