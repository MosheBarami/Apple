// EVERY PAGE TITLE FOLLOWS ONE PATTERN: "<Page> | StudPilot" (M2 site fix cycle 1, review finding on page titles).
//
// The titles of the rebuilt pages dropped the product name or mixed separators ("Blog (beta)", "Catalog: the four kinds of pieces (beta)",
// "Status — StudPilot", "Documentation — StudPilot"): a browser tab, a bookmark or a search result showed no product name on three of the six main
// routes, and two separator styles were in use. The pattern is the page's own words, a vertical bar and the name, and the front page's is the
// one exception: it leads with the name ("StudPilot: an AI co-pilot for Roblox Studio (beta)").
//
// /privacy and /terms (and the docs page about privacy, "Privacy & data") are the legal lane's and still use the old em dash until that lane lands; they are listed
// by route as a named debt that can only shrink (a listed page that conforms fails until it is removed). Read from the BUILT pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realPages } from './lib/dist.mjs';
import { textOf } from './lib/dist.mjs';

const HOME_TITLE = 'StudPilot: an AI co-pilot for Roblox Studio (beta)';
const LEGAL_DEBT = new Set(['/privacy/', '/terms/', '/docs/privacy-and-data/']);
const conforms = (title) => /^[^|]+ \| StudPilot$/.test(title) && !/ — /.test(title);
const titleOf = (html) => textOf(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '');

test('the pattern checker can see: it passes "Blog | StudPilot" and refuses the titles that shipped', () => {
  assert.ok(conforms('Blog | StudPilot'));
  for (const bad of ['Blog (beta)', 'Status — StudPilot', 'Documentation — StudPilot', 'Catalog: the four kinds of pieces (beta)', 'StudPilot on Discord', 'A | B | StudPilot']) assert.ok(!conforms(bad), `${bad} passed`);
});

test('every built page\'s title is "<Page> | StudPilot" (the front page leads with the name), no two pages share one, and the legal debt only shrinks', () => {
  const pages = realPages();
  assert.ok(pages.length >= 15);
  const seen = new Map();
  const bad = [];
  const paid = [];
  for (const { route, html } of pages) {
    const t = titleOf(html);
    assert.ok(t.length > 0, `${route} has no <title>`);
    assert.ok(!seen.has(t), `${route} and ${seen.get(t)} share the title "${t}"`);
    seen.set(t, route);
    if (route === '/') {
      assert.equal(t, HOME_TITLE);
      continue;
    }
    if (LEGAL_DEBT.has(route)) {
      if (conforms(t)) paid.push(route);
      continue;
    }
    if (!conforms(t)) bad.push(`${route}: "${t}"`);
  }
  assert.deepEqual(bad, [], 'these titles do not follow "<Page> | StudPilot"');
  assert.deepEqual(paid, [], `these legal pages conform now: delete them from LEGAL_DEBT (${paid.join(', ')})`);
  for (const route of LEGAL_DEBT) assert.ok(seen.size > 0 && pages.some((p) => p.route === route), `${route} is on the debt list and no longer exists`);
});
