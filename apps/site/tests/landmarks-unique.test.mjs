// NO TWO LANDMARKS OF THE SAME KIND SHARE A NAME ON A PAGE (M2 site fix cycles 1 and 2, review findings).
//
// The footer's docs links were `<nav aria-label="Documentation">` and every docs page's sidebar was `<nav aria-label="Documentation">` too, so a screen
// reader's landmark list read "Primary, Documentation, Product, Documentation, Company and community" on every docs page: two landmarks of the same
// role and name that cannot be told apart. The check is on the built pages.
//
// FIX CYCLE 2: THE READER SAW ONLY ONE WAY OF NAMING A LANDMARK. It matched a <section>, <aside>, <form> or <div> only when it carried an explicit role
// ("search", "region", "complementary"), but the built pages name their regions with aria-label or aria-labelledby on a bare <section> (every section of the
// landing and the pricing page does), which is a region landmark with no role attribute at all, and aria-labelledby was never resolved. Measured: two
// region landmarks sharing one name on the catalog (a <section aria-label> changed to its neighbour's name) left landmarks-unique and the whole site suite green.
//
// WHAT A LANDMARK IS HERE (HTML-AAM): <nav> is navigation; <aside> is complementary; <section> is a region and <form> is a form ONLY when named (an unnamed one is
// not a landmark); <main> is main; any element with role=navigation, region, complementary, search, form or main is that landmark. A name is aria-label, else the
// text of the element(s) aria-labelledby points at. Within one page two landmarks of one role may not share a name (case-insensitive), and every <nav> is named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { realPages, regionsWith, textOf, attrsOf } from './lib/dist.mjs';

const ROLES = new Set(['navigation', 'region', 'complementary', 'search', 'form', 'main']);
const IMPLICIT = { nav: 'navigation', aside: 'complementary', section: 'region', form: 'form', main: 'main' };

/** The accessible name of an element given its start-tag attributes: aria-label, else the text of what aria-labelledby points at, else null. */
function nameOf(attrs, html) {
  const label = attrs['aria-label']?.trim();
  if (label) return label;
  const ids = (attrs['aria-labelledby'] ?? '').split(/\s+/).filter(Boolean);
  if (ids.length === 0) return null;
  const text = ids.map((id) => regionsWith(html, `id="${id}"`).map((r) => textOf(r.inner)).join(' ')).join(' ').replace(/\s+/g, ' ').trim();
  return text || null;
}

/** The landmarks of a document, as { role, name, tag }. An unnamed <section> or <form> is not a landmark and is left out. */
function landmarks(html) {
  const body = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
  const out = [];
  for (const m of body.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g)) {
    const tag = m[1].toLowerCase();
    const attrs = attrsOf(m[0]);
    const explicit = attrs.role?.trim().toLowerCase();
    const role = explicit && ROLES.has(explicit) ? explicit : IMPLICIT[tag];
    if (!role) continue;
    const name = nameOf(attrs, body);
    if ((role === 'region' || role === 'form') && !explicit && !name) continue;
    out.push({ role, name, tag });
  }
  return out;
}

/** The problems of one document: two landmarks of one role with one name, and a navigation with no name. */
function problems(html) {
  const out = [];
  const seen = new Set();
  for (const { role, name, tag } of landmarks(html)) {
    if (role === 'navigation' && !name) out.push('a <nav> with no name');
    if (!name) continue;
    const key = `${role}:${name.toLowerCase()}`;
    if (seen.has(key)) out.push(`two ${role} landmarks named "${name}" (<${tag}>)`);
    seen.add(key);
  }
  return out;
}

test('the landmark reader can see: two navs with one name, a nav with none, two bare <section aria-label> with one name, a <section aria-labelledby> that resolves to the same heading text, an <aside> and a <form> name, and a role-only landmark', () => {
  const nav = '<nav aria-label="Docs">x</nav><nav aria-label="Docs">y</nav><nav>z</nav>';
  assert.deepEqual(landmarks(nav).map((l) => [l.role, l.name]), [['navigation', 'Docs'], ['navigation', 'Docs'], ['navigation', null]]);
  assert.deepEqual(problems(nav), ['two navigation landmarks named "Docs" (<nav>)', 'a <nav> with no name']);

  // The finding's mutation: two region landmarks, bare <section>, one name.
  assert.deepEqual(problems('<section class="a" aria-label="The four kinds of pieces">x</section><section class="b" aria-label="The four kinds of pieces">y</section>'), ['two region landmarks named "The four kinds of pieces" (<section>)']);
  // aria-labelledby is resolved: two sections pointing at two headings with the same words.
  const labelled = '<section aria-labelledby="t1">a</section><h2 id="t1">How it works</h2><section aria-labelledby="t2">b</section><h2 id="t2">How  it works</h2>';
  assert.deepEqual(problems(labelled), ['two region landmarks named "How it works" (<section>)']);
  // Different names are fine, and an unnamed <section> or <form> is not a landmark at all.
  assert.deepEqual(problems('<section aria-label="A">x</section><section aria-label="B">y</section><section>z</section><form>q</form>'), []);
  assert.deepEqual(landmarks('<section>z</section><form>q</form>'), []);
  assert.deepEqual(problems('<aside aria-label="Note">x</aside><aside aria-label="note">y</aside>'), ['two complementary landmarks named "note" (<aside>)']);
  assert.deepEqual(problems('<form aria-label="Find">x</form><div role="search" aria-label="Find">y</div><form role="search" aria-label="Find">z</form>'), ['two search landmarks named "Find" (<form>)']);
  assert.deepEqual(problems('<div role="region" aria-label="R">x</div><section aria-label="r">y</section>'), ['two region landmarks named "r" (<section>)']);
});

test('on every built page no two landmarks of one role share a name, however the name is given, and every navigation is named', () => {
  const pages = realPages();
  assert.ok(pages.length > 15);
  let navs = 0;
  let regions = 0;
  const bad = [];
  for (const { route, html } of pages) {
    for (const l of landmarks(html)) {
      if (l.role === 'navigation') navs += 1;
      if (l.role === 'region') regions += 1;
    }
    for (const p of problems(html)) bad.push(`${route}: ${p}`);
  }
  assert.deepEqual(bad, []);
  assert.ok(navs >= pages.length * 2, `only ${navs} navigation landmarks were read from ${pages.length} pages: the reader is blind`);
  // The built pages name their regions with aria-label and aria-labelledby on bare <section>s: if none is read, the reader is back to seeing only explicit roles.
  assert.ok(regions >= 20, `only ${regions} named regions were read from ${pages.length} pages: bare <section aria-label> and aria-labelledby are not seen`);
});
