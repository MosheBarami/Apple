// NO TWO LANDMARKS OF THE SAME KIND SHARE A NAME ON A PAGE (M2 site fix cycle 1, review finding).
//
// The footer's docs links were `<nav aria-label="Documentation">` and every docs page's sidebar was `<nav aria-label="Documentation">` too, so a screen
// reader's landmark list read "Primary, Documentation, Product, Documentation, Company and community" on every docs page: two landmarks of the same
// role and name that cannot be told apart. The check is on the built pages, for navigation landmarks and for any other landmark that carries a name
// (a <section aria-label>, a <form role="search">): within one page, two landmarks of one role may not share an accessible name, and when a page has more
// than one navigation each is named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realPages } from './lib/dist.mjs';

/** The named landmarks of a document, as [role, name] pairs. */
function landmarks(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, ' ');
  const out = [];
  for (const m of body.matchAll(/<nav\b([^>]*)>/g)) out.push(['navigation', /aria-label="([^"]*)"/.exec(m[1])?.[1] ?? null]);
  for (const m of body.matchAll(/<(?:section|aside|form|div)\b([^>]*\brole="(search|region|complementary)"[^>]*)>/g)) out.push([m[2], /aria-label="([^"]*)"/.exec(m[1])?.[1] ?? null]);
  return out;
}

test('the landmark reader can see: it finds two navs with one name and a nav with none', () => {
  const doc = '<nav aria-label="Docs">x</nav><nav aria-label="Docs">y</nav><nav>z</nav>';
  assert.deepEqual(landmarks(doc), [['navigation', 'Docs'], ['navigation', 'Docs'], ['navigation', null]]);
});

test('on every built page no two landmarks of one role share a name, and every navigation is named', () => {
  const pages = realPages();
  assert.ok(pages.length > 15);
  let navs = 0;
  for (const { route, html } of pages) {
    const seen = new Set();
    for (const [role, name] of landmarks(html)) {
      if (role === 'navigation') {
        navs += 1;
        assert.ok(name, `${route} has a <nav> with no name`);
      }
      if (name === null) continue;
      const key = `${role}:${name.toLowerCase()}`;
      assert.ok(!seen.has(key), `${route} has two ${role} landmarks named "${name}"`);
      seen.add(key);
    }
  }
  assert.ok(navs >= pages.length * 2, `only ${navs} navigation landmarks were read from ${pages.length} pages: the reader is blind`);
});
