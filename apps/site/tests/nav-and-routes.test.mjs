// EVERY LINK IN THE HEADER AND THE FOOTER GOES SOMEWHERE THAT EXISTS (handoff 2.2: the new nav).
//
// The new navigation is How it works, Catalog, Pricing, Docs, Blog, Discord, Sign in, and one primary "Start free (beta)".
// It is read from the BUILT pages (the header and footer of the front page, then every other page's), never from a list
// in this file: a link added to the nav tomorrow is checked tomorrow. Each link must resolve to a page the build emitted,
// to a redirect the build emitted (a removed route that Astro redirects), or to the app, which is served by the worker
// under /app and is not in this build; the only app links allowed are the two doors, sign in and sign up.
//
// The primary navigation may not point at a redirect (a nav item that bounces is a page nobody maintains). The footer may.
//
// The resolver is run on links it must reject first.
//
// Run with:  pnpm --filter @studpilot/site build && node --test tests/nav-and-routes.test.mjs   (from apps/site)
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DIST, distPage, distPages, hrefsOf, regionsWith, textOf } from './lib/dist.mjs';

const shared = await import('../../../packages/shared/src/index.ts');

const APP_DOORS = new Set(['/app/login', '/app/signup']);

/** What a built path resolves to: { kind: 'page' | 'redirect' | 'missing', file }. A fragment or a query is dropped first. */
function resolveBuilt(href) {
  const path = href.split('#')[0].split('?')[0];
  const candidates = [join(DIST, path, 'index.html'), join(DIST, `${path.replace(/\/$/, '')}.html`)];
  for (const file of candidates) {
    if (existsSync(file)) {
      const html = readFileSync(file, 'utf8');
      const redirect = /<meta http-equiv="refresh"[^>]*url=/i.test(html);
      return { kind: redirect ? 'redirect' : 'page', file };
    }
  }
  return { kind: 'missing', file: null };
}

const classify = (href) => {
  if (/^https?:\/\//.test(href) || href.startsWith('mailto:')) return 'external';
  if (href.startsWith('#')) return 'fragment';
  if (href.startsWith('/app/') || href === '/app') return APP_DOORS.has(href) ? 'app door' : 'app (not a door)';
  return 'site';
};

/** The links of the primary navigation and of the footer, read from the built HTML of a page. */
function chrome(html) {
  const primary = regionsWith(html, 'id="primary-nav"');
  const header = html.match(/<header\b[\s\S]*?<\/header>/i);
  const footer = html.match(/<footer\b[^>]*data-site-footer[\s\S]*?<\/footer>/i);
  return { primaryHtml: primary[0]?.inner ?? '', headerHtml: header?.[0] ?? '', footerHtml: footer?.[0] ?? '' };
}

test('the resolver can see: it finds a page, a redirect and a missing path, and tells an app door from another app route', () => {
  assert.equal(resolveBuilt('/pricing/').kind, 'page');
  assert.equal(resolveBuilt('/pricing').kind, 'page');
  assert.equal(resolveBuilt('/pricing/#compare').kind, 'page');
  assert.equal(resolveBuilt('/no-such-page/').kind, 'missing');
  assert.equal(resolveBuilt('/proof/').kind, 'redirect');
  assert.equal(classify('/app/login'), 'app door');
  assert.equal(classify('/app/admin'), 'app (not a door)');
  assert.equal(classify('https://discord.gg/x'), 'external');
});

test('the header carries exactly the new navigation, derived from the built front page', () => {
  const { primaryHtml, headerHtml } = chrome(distPage('/').html);
  assert.ok(primaryHtml.length > 0, 'the front page has no <nav id="primary-nav">');
  const labels = [...primaryHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => textOf(m[1]));
  for (const want of ['How it works', 'Catalog', 'Pricing', 'Docs', 'Blog', 'Discord', 'Sign in', 'Start free (beta)']) {
    assert.ok(labels.includes(want), `the primary navigation has no "${want}" (it has: ${labels.join(', ')})`);
  }
  for (const gone of ['Engine', 'Showcase', 'Proof', 'Changelog', 'Product']) assert.ok(!labels.includes(gone), `the navigation still carries the old "${gone}"`);
  const start = [...primaryHtml.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/gi)].find((m) => textOf(m[1]) === 'Start free (beta)');
  assert.match(start[0], /href="\/app\/signup"/, 'the primary button does not go to the app\'s sign-up route');
  assert.match(start[0], /btn-primary/, 'the "Start free (beta)" link is not the primary button');
  assert.match(headerHtml, /data-theme-toggle/, 'the header has lost the theme toggle');
});

test('every link in the primary navigation resolves to a built page (never a redirect), the app door, or the Discord hop', () => {
  const { primaryHtml } = chrome(distPage('/').html);
  const links = hrefsOf(primaryHtml);
  assert.ok(links.length >= 8, `only ${links.length} navigation links were found`);
  for (const href of links) {
    const kind = classify(href);
    if (kind === 'site') {
      const r = resolveBuilt(href);
      assert.equal(r.kind, 'page', `the navigation links to ${href}, which is ${r.kind} in the build`);
    } else assert.equal(kind, 'app door', `the navigation links to ${href}, a ${kind} link`);
  }
});

test('the footer keeps its product links, Privacy, Terms, Status, Discord, the operator line and the beta note, and every link resolves', () => {
  const { footerHtml } = chrome(distPage('/').html);
  assert.ok(footerHtml.length > 0, 'the front page has no <footer data-site-footer>');
  const links = hrefsOf(footerHtml);
  const bare = links.map((l) => l.replace(/\/$/, '') || '/');
  for (const want of ['/how-it-works', '/catalog', '/pricing', '/docs', '/blog', '/privacy', '/terms', '/status', '/discord']) {
    assert.ok(bare.includes(want), `the footer does not link to ${want}`);
  }
  const text = textOf(footerHtml);
  // THE OPERATOR AND THE CONTACT ARE THE OWNER'S DECISION OF 2026-10-05 (OWNER-DECISIONS.md D-13): the operator is StudPilot and the
  // contact is support@studpilot.app. The address is read from the shared config, never typed here, and the footer carries it as a link.
  assert.ok(text.includes(`© ${new Date().getFullYear()} StudPilot.`), 'the footer does not name the operator in its copyright line');
  assert.ok(links.includes(`mailto:${shared.SUPPORT_EMAIL}`), `the footer does not link to mailto:${shared.SUPPORT_EMAIL}`);
  assert.ok(text.includes(shared.SUPPORT_EMAIL), 'the footer does not print the contact address');
  assert.doesNotMatch(text, /\bApple Labs\b|apple\.labs\.app/i, 'the footer still names the former operator or inbox');
  assert.match(text, /\bBeta\b/, 'the footer has no beta note');
  for (const href of links) {
    const kind = classify(href);
    if (kind === 'site') assert.notEqual(resolveBuilt(href).kind, 'missing', `the footer links to ${href}, which the build does not contain`);
  }
});

test('on every built page the header and footer links resolve (a page added tomorrow is checked tomorrow)', () => {
  const pages = distPages();
  let checked = 0;
  for (const { route, html } of pages) {
    const { headerHtml, footerHtml } = chrome(html);
    if (!headerHtml || !footerHtml) continue;
    for (const href of [...hrefsOf(headerHtml), ...hrefsOf(footerHtml)]) {
      const kind = classify(href);
      if (kind === 'site') assert.notEqual(resolveBuilt(href).kind, 'missing', `${route}: the chrome links to ${href}, which the build does not contain`);
      else if (kind.startsWith('app')) assert.equal(kind, 'app door', `${route}: the chrome links to ${href}`);
      checked += 1;
    }
  }
  assert.ok(checked > 100, `only ${checked} chrome links were checked across ${pages.length} pages`);
});

test('the removed routes are redirects the build emits: /models and /proof to the front page and the catalog, /showcase to the catalog, /changelog to the blog', () => {
  const want = { '/models/': '/', '/proof/': '/catalog/', '/showcase/': '/catalog/', '/changelog/': '/blog/' };
  for (const [from, to] of Object.entries(want)) {
    const r = resolveBuilt(from);
    assert.equal(r.kind, 'redirect', `${from} is ${r.kind} in the build: it must be an Astro redirect so the built file overwrites the old static row`);
    const html = readFileSync(r.file, 'utf8');
    const target = html.match(/url=([^"'>\s]+)/i)?.[1];
    const bare = (p) => p?.replace(/\/$/, '') || '/';
    assert.equal(bare(target), bare(to), `${from} redirects to ${target}, expected ${to}`);
    assert.notEqual(resolveBuilt(target).kind, 'missing', `${from} redirects to ${target}, which the build does not contain`);
  }
});
