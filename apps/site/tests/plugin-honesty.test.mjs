// EVERY PAGE THAT TALKS ABOUT THE PLUGIN OR ABOUT WORKING IN STUDIO SAYS, ON THAT PAGE, THAT NEW CUSTOMERS CANNOT GET THE PLUGIN (M2 site fix cycles 1 and 2).
//
// STUDIO_PLUGIN_STORE_LIVE is false while the Creator Store listing is unavailable: a new customer can sign up, chat and plan, and cannot build in
// Studio. The first rebuild said "it builds the piece in your own Studio place" in the hero, the meta description and the rail, labelled "Pair the plugin"
// as "Works today", and put the only caveat in the last sentence of the page. The sweep that closed that was derived from the BUILT site, so a page written
// tomorrow is held tomorrow, and it was conditional on the flag, so the day the listing is back it asks for the opposite caveat instead of demanding the old one.
//
// FIX CYCLE 2: THE SWEEP HAD A HOLE AGAINST ITS OWN SCOPE. Its list of talk was a handful of verbs (pair, build, change, edit "in Studio"), so a page that said
// "Every request is applied to your place through the Studio plugin, so you can start building today" passed with no caveat (measured: the whole suite green), and
// /terms ("have an AI agent apply them inside Roblox Studio via the StudPilot plugin"), /docs/credits-and-limits ("pairing Studio") and /docs/privacy-and-data
// (the plugin and the word pair 41 characters apart) were invisible to it. The scope now is the broad one: a sentence TALKS when it names the plugin at all, or
// names Studio or the place being edited together with ANY action verb, in either order. The caveat is required on every page that talks, unless the route is
// on LEGAL_DEBT, a named, shrink-only list.
//
// The caveat is one of the ways the product itself says it (the status page's known issue, the pricing note, the docs plugin page): "not open to new
// customers", "cannot get", "installation is unavailable", "not on the Creator Store", "cannot build in Studio".
import test from 'node:test';
import assert from 'node:assert/strict';
import { distPage, pageWordsOf, realPages, textOf } from './lib/dist.mjs';

const shared = await import('../../../packages/shared/src/index.ts');

const VERBS = 'build|builds|built|building|change|changes|changed|changing|edit|edits|edited|editing|apply|applies|applied|applying|create|creates|created|creating|insert|inserts|inserted|write|writes|wrote|written|run|runs|running|make|makes|made|making|modify|modifies|modified|add|adds|added|adding|pair|pairs|paired|pairing|connect|connects|connected|connecting|publish|publishes|playtest|playtests|play test|play tests|install|installs|installed|installing|open|opens|use|uses|using|read|reads|inspect|inspects|undo|undoes|control|controls|work|works|working';
const STUDIO = '(?:Roblox )?Studio|(?:your|the|a|that|an open) (?:own )?place';
/** A sentence talks about the plugin when it names it, or names Studio or the place being edited next to any action verb, in either order. */
const TALKS = new RegExp(`\\bplugins?\\b|\\b(?:${VERBS})\\b[^.]{0,80}\\b(?:${STUDIO})\\b|\\b(?:${STUDIO})\\b[^.]{0,80}\\b(?:${VERBS})\\b`, 'i');
const CAVEAT = /not open to new customers|new customers cannot|cannot get (?:it|the plugin)|installation is unavailable|installation unavailable|is not on the Creator Store|cannot be installed from the Roblox Creator Store|cannot build (?:it )?(?:in|inside) Studio/i;
const sentences = (text) => text.split(/(?<=[.!?])\s+/);

/**
 * Pages that talk about the plugin and are another lane's to rewrite (the legal pages, rewritten in parallel to this lane). A shrink-only debt: the test fails
 * when a listed page no longer talks without the caveat, so the line is deleted rather than left to hide the next one.
 */
const LEGAL_DEBT = new Set(['/privacy/', '/terms/', '/docs/privacy-and-data/']);

/** The sentences of a page that talk, and whether the page carries the caveat anywhere (the words of the page itself, not its menu). */
function audit(html) {
  const words = pageWordsOf(html);
  return { hits: sentences(words).filter((s) => TALKS.test(s)), caveat: CAVEAT.test(words) };
}

test('the scanner can see: the hero sentence, the /terms sentence, the "applied ... through the Studio plugin" mutation, "pairing Studio" and a plugin pair far apart are talk; ordinary sentences are not; the three ways the site says it cannot be had are caveats', () => {
  for (const talk of [
    'You ask in the web app, and a plugin builds the piece in your own Studio place.',
    'Open StudPilot in Roblox Studio and type the 6-character code. Pair the plugin first.',
    // The sentences the first sweep could not see (the finding's mutation, /terms, /docs/credits-and-limits, /docs/privacy-and-data).
    'Every request is applied to your place through the Studio plugin, so you can start building today.',
    'The service StudPilot lets you describe changes to a Roblox place in natural language and have an AI agent apply them inside Roblox Studio via the StudPilot plugin.',
    'It also covers pairing Studio with a project.',
    'The plugin sends only the place you connect, and a pairing code lasts ten minutes, so you can pair it again.',
    'StudPilot applies the change to the place you have open in Studio.',
  ]) assert.match(talk, TALKS, `not seen as talk: "${talk}"`);
  for (const quiet of [
    'Ask for any piece. It looks pro, it works.',
    'An AI co-pilot for Roblox Studio.',
    'A Roblox place is made of parts.',
    'Paid plans start later, and nobody can buy one yet.',
  ]) assert.doesNotMatch(quiet, TALKS, `read as talk: "${quiet}"`);
  for (const c of ['The Studio plugin is not open to new customers yet.', 'Public installation is unavailable right now.', 'The plugin is not on the Creator Store.', 'new customers cannot get it yet']) assert.match(c, CAVEAT);
});

test('the audit reads what a page says, not its menu: a link labelled "Studio plugin" in the navigation is not a sentence, and a mutated page with no caveat is caught', () => {
  const shell = (main) => `<html><head><title>T | StudPilot</title><meta name="description" content="A page."></head><body><header><nav><a href="/docs/plugin">Studio plugin</a></nav></header><main>${main}</main></body></html>`;
  assert.equal(audit(shell('<p>Credits refill every day.</p><nav><a href="/docs/plugin">The Studio plugin</a></nav>')).hits.length, 0, 'a nav label counts as a sentence');
  const mutated = audit(shell('<p>Credits refill every day.</p><p>Every request is applied to your place through the Studio plugin, so you can start building today.</p>'));
  assert.equal(mutated.hits.length, 1, 'the planted sentence was not found');
  assert.equal(mutated.caveat, false, 'a page with no caveat is read as carrying one');
  const covered = audit(shell('<p>Every request is applied to your place through the Studio plugin.</p><p>New customers cannot get the plugin yet.</p>'));
  assert.equal(covered.hits.length >= 1 && covered.caveat, true, 'the caveat on the same page is not seen');
  const described = audit('<html><head><title>T</title><meta name="description" content="Ask in the chat and a plugin builds it in your own Studio place."></head><body><main><p>Hello.</p></main></body></html>');
  assert.equal(described.hits.length, 1, 'the meta description is not read');
});

test('while the plugin cannot be had, every built page that talks about the plugin or about working in Studio says so on the same page', () => {
  assert.equal(shared.STUDIO_PLUGIN_STORE_LIVE, false, 'the plugin can be had now: re-aim this test (the caveat to demand becomes "free on the Creator Store")');
  const pages = realPages();
  let talkers = 0;
  const bad = [];
  const debt = new Set();
  for (const { route, html } of pages) {
    const { hits, caveat } = audit(html);
    if (hits.length === 0) continue;
    talkers += 1;
    if (caveat) continue;
    if (LEGAL_DEBT.has(route)) debt.add(route);
    else bad.push(`${route}: "${hits[0].slice(0, 110)}" and no caveat anywhere on the page`);
  }
  assert.deepEqual(bad, []);
  assert.ok(talkers >= 10, `only ${talkers} pages talk about the plugin: the scan is blind`);
  for (const route of LEGAL_DEBT) assert.ok(debt.has(route), `${route} no longer talks about the plugin without the caveat: delete it from LEGAL_DEBT, which can only shrink`);
  for (const route of ['/', '/how-it-works/', '/catalog/', '/pricing/', '/blog/what-works-today/', '/docs/getting-started/', '/docs/plugin/', '/docs/credits-and-limits/', '/docs/troubleshooting/']) {
    assert.match(pageWordsOf(distPage(route).html), CAVEAT, `${route} does not say new customers cannot get the plugin`);
  }
});

test('while the plugin cannot be had, the caveat is where the claim is: the front page says it in the hero, before the first button, and in the meta description', () => {
  const html = distPage('/').html;
  const hero = textOf(html.slice(html.indexOf('<h1'), html.indexOf('hero__cta')));
  assert.match(hero, CAVEAT, 'the hero makes its claim and the caveat is somewhere else on the page');
  const description = /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? '';
  assert.match(description, CAVEAT, 'the meta description (what a search result shows) leaves the caveat out');
});
