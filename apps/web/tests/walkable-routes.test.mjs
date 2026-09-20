/**
 * EVERY ADDRESS BETWEEN TWO REAL ADDRESSES IS ALSO A REAL ADDRESS.
 *
 * `/app` was the project shelf and `/app/projects/<id>` was a project on it, and `/app/projects` —
 * the address sitting directly between them — resolved to nothing and fell through to the
 * not-found page. Nothing in the product ever LINKED there, which is why it survived: every link
 * that existed worked. People reach it the ordinary way instead, by deleting the id off the end of
 * a project URL somebody sent them, which is what anyone does when they want to get back to the
 * list.
 *
 * This does not pin `/projects`. It asserts the RULE: if a route declares a parameterised child,
 * the parent path it hangs off must itself resolve to something. That is a property of the route
 * table rather than a fact about one URL, so a new `/teams/:id` added next month is covered by this
 * file on the day it lands, without anyone remembering to come back here.
 *
 * It reads the route table as source text because this app has no DOM test environment — no jsdom,
 * no testing-library, just `node --test`. The parse is therefore kept deliberately narrow and, more
 * importantly, ASSERTS ITS OWN NON-VACUITY: if the extraction stops finding routes because the file
 * was reorganised, these tests fail loudly rather than passing over an empty list. A route checker
 * that silently found no routes is the same shape of bug as the one it exists to catch.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const APP = readFileSync(join(WEB, 'src', 'app.tsx'), 'utf8');

/** Every `path=` declared on a <Route>, in source order. */
function declaredPaths() {
  return [...APP.matchAll(/<Route\b[^>]*?\bpath=(?:"([^"]*)"|\{'([^']*)'\})/g)]
    .map((m) => m[1] ?? m[2])
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Does the table declare an `index` route — the one path that has no `path=` attribute? */
function hasIndex() {
  return /<Route\b[^>]*\bindex\b/.test(APP);
}

const PATHS = declaredPaths();

test('the route table was actually parsed, so nothing below can pass over an empty list', () => {
  assert.ok(PATHS.length >= 8,
    `only ${PATHS.length} routes were extracted from app.tsx — the parse has drifted from the file `
    + 'and every check in this file would be vacuous. Fix the extraction, do not delete the test.');
  assert.ok(hasIndex(), 'no index route was found; the shelf has no home and the walk-up rule has no target');
  assert.ok(PATHS.some((p) => /:/.test(p)),
    'no parameterised route was found, so the rule under test has nothing to apply to');
});

test('a parameterised route can be walked up to: its parent path resolves too', () => {
  const missing = [];
  const declared = new Set(PATHS);

  for (const path of PATHS) {
    if (!path.includes('/:')) continue;
    // Walk up one segment at a time, from the parameter outwards. `/projects/:id/roadmap` must be
    // reachable at `/projects/:id` and at `/projects`.
    const parts = path.split('/').filter(Boolean);
    for (let i = parts.length - 1; i > 0; i--) {
      const parent = '/' + parts.slice(0, i).join('/');
      if (parent === '/') continue;               // the index route covers the root
      if (parts[i - 1].startsWith(':')) continue; // a bare parameter is not an address anyone types
      if (!declared.has(parent)) missing.push({ child: path, parent });
    }
  }

  assert.deepEqual(missing, [],
    'these paths sit between two routes that work and resolve to the not-found page — somebody who '
    + 'deletes the last segment off a URL they were sent lands on "This apple is lost": '
    + missing.map((m) => `${m.parent} (parent of ${m.child})`).join(', '));
});

test('the shelf keeps one canonical address rather than rendering at two', () => {
  // `/projects` is satisfied by a redirect, not by mounting the dashboard a second time. Two live
  // URLs for one page is how a share link, a bookmark and an analytics row stop agreeing about
  // where the shelf is.
  const block = /<Route\b[^>]*\bpath="\/projects"[^>]*element=\{([^}]*)\}/.exec(APP);
  assert.ok(block, 'no /projects route is declared at all');
  assert.match(block[1], /Navigate/,
    'the /projects route mounts a page instead of redirecting, so the shelf now answers at two URLs');
  assert.match(block[1], /replace/,
    'the /projects redirect does not replace history, so Back bounces the visitor between two URLs');
});
