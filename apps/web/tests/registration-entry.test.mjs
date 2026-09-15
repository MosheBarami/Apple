// Where a "Start building" button actually lands a stranger.
//
// Every call to action on the public site pointed at `/app`. That reads as correct and is not:
// `/app` is the dashboard, the dashboard is inside `AuthGuard`, and an unauthenticated visitor is
// redirected to `/login`. So the button that says "Start building — free" put a person who has
// never heard of this product in front of a SIGN-IN form, and asked them to notice a small "Create
// an account" link at the bottom of it.
//
// Nothing about that looks broken, which is exactly why it survived an accessibility pass: the
// existing e2e spec checks these CTAs for keyboard reach, focus rings and contrast, all of which
// they pass. A button can be perfectly accessible and still send you to the wrong screen.
//
// This test lives in apps/web/tests because that is where the site's own cross-checks already live
// — tests/contrast.test.mjs reads the site stylesheets for the same reason: apps/site has no test
// runner of its own, and the routes being asserted about belong to apps/web.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..', '..', 'site', 'src');
const APP = readFileSync(join(HERE, '..', 'src', 'app.tsx'), 'utf8');

function astroFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...astroFiles(full));
    else if (name.endsWith('.astro')) out.push(full);
  }
  return out;
}

/** Every `<a …>text</a>` on the public site, with its href and its visible words. */
function links() {
  const found = [];
  for (const file of astroFiles(SITE)) {
    const body = readFileSync(file, 'utf8');
    for (const m of body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
      const attrs = m[1];
      const href = /href=(?:"([^"]*)"|\{([^}]*)\})/.exec(attrs);
      if (!href) continue;
      const text = m[2]
        .replace(/<[^>]*>/g, ' ')
        .replace(/\{[^}]*\}/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      found.push({ file, href: href[1] ?? href[2] ?? '', text });
    }
  }
  return found;
}

const ALL = links();

/** Words that promise a beginning. Someone reading these has no account yet. */
const REGISTRATION = /\b(start building|get started|create an account|sign up|try it free|start free)\b/i;

test('the site has links to check at all', () => {
  // F-64 first. A scraper that matches nothing reports no violations, which is indistinguishable
  // from a site with no problems.
  assert.ok(ALL.length > 20, `only scraped ${ALL.length} links from the site — the scraper is broken`);
  const appLinks = ALL.filter((l) => l.href.includes('/app'));
  assert.ok(appLinks.length >= 5, `only ${appLinks.length} links point into the app`);
});

test('a link that promises a beginning does not land a stranger on the sign-in form', () => {
  const offenders = [];
  for (const link of ALL) {
    if (!REGISTRATION.test(link.text)) continue;
    // `/app` and `/app/login` both put a signed-out reader in front of the sign-in form. Only the
    // registration route, or a page that explains the plans first, is an honest destination for
    // these words.
    const landsOnSignIn = /^\/app\/?$/.test(link.href) || link.href.includes('/app/login');
    if (landsOnSignIn) offenders.push(`${link.file}: "${link.text}" -> ${link.href}`);
  }
  assert.deepEqual(offenders, []);
});

test('the registration links found are the ones we expect to exist', () => {
  // The negative assertion above passes trivially on a site with no CTAs at all. This is what makes
  // it mean something: the CTAs exist, they are on the pages a visitor actually arrives at, and
  // they point at signup.
  const toSignup = ALL.filter((l) => l.href.includes('/app/signup'));
  assert.ok(toSignup.length >= 3, `only ${toSignup.length} links reach the signup route`);
  const pages = new Set(toSignup.map((l) => l.file.split('/').pop()));
  assert.ok(pages.has('index.astro'), 'the landing page has no registration link');
  assert.ok(pages.has('pricing.astro'), 'the pricing page has no registration link');
});

test('"Sign in" still means sign in', () => {
  // The other half. Sending a returning user to the registration form is the same defect mirrored,
  // and it is the easy mistake to make while fixing the first one.
  const signIn = ALL.filter((l) => /^sign in$/i.test(l.text) && l.href.includes('/app'));
  assert.ok(signIn.length >= 1, 'no "Sign in" link points into the app');
  for (const l of signIn) {
    assert.ok(!l.href.includes('/app/signup'), `${l.file}: "Sign in" points at the registration form`);
  }
});

test('every app route the site links to is a route the app has', () => {
  // A CTA aimed at a path with no route renders the not-found page, and the visitor reads that as
  // the product being broken before they have used any of it.
  const declared = new Set([...APP.matchAll(/path="([^"]+)"/g)].map((m) => m[1]));
  assert.ok(declared.size > 5, `only ${declared.size} routes parsed out of app.tsx`);
  const missing = [];
  for (const link of ALL) {
    const m = /^\/app(\/[a-z-]*)?$/.exec(link.href);
    if (!m) continue;
    const route = m[1];
    // Bare `/app` is the index route, which has no `path` of its own.
    if (route === undefined || route === '/' || route === '') continue;
    if (!declared.has(route)) missing.push(`${link.file}: ${link.href}`);
  }
  assert.deepEqual(missing, []);
});
