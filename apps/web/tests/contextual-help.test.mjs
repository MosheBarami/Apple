/**
 * A failure that has a written answer must carry the link to it.
 *
 * The product already writes good failure copy — error-taxonomy.ts answers "did I lose anything"
 * and "what do I do now" for every status the worker returns — and it already has eleven docs
 * pages, one of which is a troubleshooting page with a section for the exact case the workspace
 * renders as "Something went wrong partway through". The two never met. A user reading a failure
 * had no route to the page written for it, and the only contextual link anywhere in the app was
 * the Studio install affordance.
 *
 * THE FAILURE MODE THIS GUARDS IS A LINK TO NOTHING. A help href is written once and the page it
 * names can be renamed or deleted later, and a dead /docs link looks exactly like a live one until
 * someone clicks it. So every href asserted here is resolved against apps/site/src/pages/docs —
 * if the page is not on disk, this test is red, not the browser.
 *
 * AND IT GUARDS THE ELEMENT, not only the string. /docs is served by the static site, NOT by the
 * SPA: react-router would swallow a <Link to="/docs/...">, resolve it against the app's own route
 * table and render the not-found page. A help link must therefore be a real anchor.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const ESBUILD = join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild');
const DOCS_PAGES = join(WEB, '..', 'site', 'src', 'pages', 'docs');

function bundle(relPath, name) {
  const out = join(mkdtempSync(join(tmpdir(), 'help-')), `${name}.mjs`);
  execFileSync(
    ESBUILD,
    [join(WEB, relPath), '--bundle', '--format=esm', '--platform=neutral', '--main-fields=main,module', '--outfile=' + out],
    { stdio: 'pipe' },
  );
  return import(out);
}

const T = await bundle(join('src', 'lib', 'error-taxonomy.ts'), 'tax');
const E = await bundle(join('src', 'components', 'empty-state-model.ts'), 'empty');

const FAILURE_TSX = readFileSync(join(WEB, 'src', 'components', 'failure.tsx'), 'utf8');
const TURN_TSX = readFileSync(join(WEB, 'src', 'components', 'ws', 'turn.tsx'), 'utf8');
const EMPTY_TSX = readFileSync(join(WEB, 'src', 'components', 'empty-state.tsx'), 'utf8');
// The Studio install link lives in the pairing dialog; the ConnectStudio block that carried it had
// no importer left and was deleted.
const CONNECT_TSX = readFileSync(join(WEB, 'src', 'components', 'pairing-dialog.tsx'), 'utf8');

/** /docs/x -> apps/site/src/pages/docs/x.astro. Anchors and trailing slashes stripped first. */
function docsPageExists(href) {
  const path = href.split('#')[0].replace(/\/$/, '');
  if (path === '/docs') return existsSync(join(DOCS_PAGES, 'index.astro'));
  const slug = path.replace(/^\/docs\//, '');
  return /^[a-z0-9-]+$/.test(slug) && existsSync(join(DOCS_PAGES, `${slug}.astro`));
}

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}
const api = (status, message = 'x') => Object.assign(new ApiError(message, status), { status });

/** The failures that have a page written for them. Each names the page it must reach. */
const EXPECTED_HELP = [
  { err: api(429, 'daily credit allowance used up'), kind: 'out_of_credits', href: '/docs/credits-and-limits' },
  { err: api(502), kind: 'upstream', href: '/docs/troubleshooting' },
  { err: api(500), kind: 'ours', href: '/docs/troubleshooting' },
  { err: api(400), kind: 'rejected', href: '/docs/troubleshooting' },
];

test('a failure with a page written for it carries the link to that page', () => {
  for (const { err, kind, href } of EXPECTED_HELP) {
    const e = T.explainFailure(err);
    assert.equal(e.kind, kind, `expected ${kind}`);
    assert.ok(e.help, `${kind} has no help link — the page exists and the user cannot reach it`);
    assert.equal(e.help.href, href, `${kind} points at the wrong page`);
    assert.ok(e.help.label && e.help.label.length > 3, `${kind}'s help link has no readable label`);
  }
});

test('every help link in the taxonomy names a docs page that is on disk', () => {
  // Harvested from the taxonomy itself rather than from the list above, so a link added later is
  // covered the day it is added.
  const statuses = [0, 400, 401, 403, 404, 426, 429, 500, 502, 503, 504];
  for (const status of statuses) {
    for (const msg of ['x', 'daily credit allowance used up']) {
      const e = T.explainFailure(api(status, msg));
      if (!e.help) continue;
      assert.ok(
        docsPageExists(e.help.href),
        `${e.kind} links to ${e.help.href}, which is not a page under apps/site/src/pages/docs`,
      );
    }
  }
});

test('the help link is an anchor, not a router Link — /docs is not an SPA route', () => {
  assert.match(FAILURE_TSX, /e\.help/, 'failure.tsx never renders the help link');
  const block = FAILURE_TSX.slice(FAILURE_TSX.indexOf('e.help'));
  assert.match(block, /<a\b[^>]*href=\{e\.help\.href\}/, 'the help link must be a real anchor');
  assert.equal(
    /<Link[^>]*to=\{e\.help\.href\}/.test(FAILURE_TSX),
    false,
    'react-router would resolve /docs against the app route table and render not-found',
  );
});

test('the failed-run block in the workspace reaches the section written for it', () => {
  // /docs/troubleshooting has an "Apple stopped mid-build" section and a #messages index. The
  // block that tells a user a run died linked nowhere at all.
  assert.match(TURN_TSX, /\/docs\/troubleshooting#messages/, 'a failed run offers no route to the written answer');
  assert.ok(
    docsPageExists('/docs/troubleshooting#messages'),
    'turn.tsx links to a troubleshooting page that is not on disk',
  );
  const outcome = TURN_TSX.slice(TURN_TSX.indexOf('gx-outcome'), TURN_TSX.indexOf('gx-turn__foot'));
  assert.match(outcome, /stopReason === 'error'/, 'the help link must be conditioned on the run having failed');
  assert.match(outcome, /target="_blank"/, 'a docs link out of the workspace must not replace the conversation');
});

test('the empty states that mean "go and connect Studio" say where that is written', () => {
  for (const name of ['noRoadmap', 'waitingForStudio', 'studioDisconnected']) {
    const spec = E.EMPTY_STATES[name];
    assert.ok(spec.help, `${name} tells the user to do something and does not say where it is documented`);
    assert.ok(docsPageExists(spec.help.href), `${name} links to ${spec.help.href}, which is not on disk`);
    assert.ok(spec.help.label && spec.help.label.length > 3, `${name}'s help link has no readable label`);
  }
});

test('every help link declared on an empty state names a page on disk', () => {
  for (const [name, spec] of Object.entries(E.EMPTY_STATES)) {
    if (!spec.help) continue;
    assert.ok(docsPageExists(spec.help.href), `${name} links to ${spec.help.href}, which is not on disk`);
  }
});

test('the empty-state renderer actually draws the help link', () => {
  // The model half is where the tests are, so the renderer is the half that can silently drop it.
  assert.match(EMPTY_TSX, /spec\.help/, 'empty-state.tsx never reads the help link');
  assert.match(EMPTY_TSX, /<a\b[^>]*href=\{spec\.help\.href\}/, 'the help link must be a real anchor');
});

test('the one contextual link that already worked still does', () => {
  // Regression guard: the Studio install affordance was the only wired context before this, and
  // everything here is additive to it.
  assert.match(CONNECT_TSX, /STUDIO_PLUGIN_INSTALL_HREF/);
});
