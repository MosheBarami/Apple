/**
 * THE DOCS MAY NOT DENY A SURFACE THE PRODUCT SHIPS.
 *
 * apps/site/tests/withdrawn-modes.test.mjs guards the opposite direction — no page may sell a mode
 * nobody can pick — and nothing guarded this one. /docs/faq answered "Is there an API or a way to
 * script Apple itself?" with "Not yet. The web workspace and Studio plugin are the two supported
 * surfaces at v0.1. If you have an automation use case, email us."
 *
 * The API had already shipped. `GET /v1` answers 401 with "Provide an API key as
 * `Authorization: Bearer gk_live_…`" on the live worker — gated, not absent — and PUBLIC_ROUTES
 * declares chat completions, projects, transcripts, starting a run, an event stream and an MCP
 * endpoint. Minting a key is behind a signed-in session and nothing else: no plan gate, no
 * allowlist. The panel that does it sits in Settings under Connections and is not feature-flagged.
 * The FAQ answer was last edited the day before the API landed and nobody came back to it.
 *
 * WHY THAT COSTS SOMETHING. A customer who wants to automate reads the manual, is told the thing
 * does not exist, and either goes away or finds it later in their own account and stops believing
 * the manual. Both are worse than silence.
 *
 * WHAT THIS GUARDS, AND THE ONE THING IT DELIBERATELY DOES NOT. It guards the denial, not the
 * wording of the answer — a page may say the API is young, versioned, or unsupported. It also
 * refuses a page that offers a client library: `packages/sdk` is `"private": true` and published
 * nowhere, so naming it sends a reader to install something that does not exist. (The panel in
 * apps/web still names it; that file is not this one's to edit, and the defect is recorded.)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { visibleText } from './lib/visible-copy.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SITE = join(HERE, '..');
const ROOT = join(SITE, '..', '..');
const faq = readFileSync(join(SITE, 'src', 'pages', 'docs', 'faq.astro'), 'utf8');

function pages() {
  const dir = join(SITE, 'src', 'pages');
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.astro'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

/** The routes the worker actually serves under /v1, read from its own table. */
const PUBLIC_PATHS = (() => {
  const src = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'public-api.ts'), 'utf8');
  const at = src.indexOf('export const PUBLIC_ROUTES');
  assert.notEqual(at, -1, 'THIS GUARD IS BROKEN, NOT THE PAGES: PUBLIC_ROUTES is gone from apps/worker/src/public-api.ts');
  const table = src.slice(at, src.indexOf('\n];', at));
  const paths = [...table.matchAll(/path: '([^']+)'/g)].map((m) => m[1]);
  assert.ok(paths.length > 0, 'PUBLIC_ROUTES parsed to no routes — the parse is wrong, not the product');
  return paths;
})();

test('THE PREMISE IS STILL TRUE: there is a /v1 API and anybody signed in can get a key', () => {
  assert.ok(
    PUBLIC_PATHS.includes('/v1') && PUBLIC_PATHS.some((p) => p.startsWith('/v1/projects')),
    `THIS GUARD IS STALE, NOT THE PAGES: the public API no longer declares a discovery route and ` +
      `project routes. It declares: ${PUBLIC_PATHS.join(', ')}. If the API was withdrawn, the FAQ ` +
      'should go back to saying so — re-read this file rather than deleting it.',
  );

  // No plan or allowlist gate on minting: the route sits behind the ordinary JWT middleware only.
  const index = readFileSync(join(ROOT, 'apps', 'worker', 'src', 'index.ts'), 'utf8');
  const mint = index.slice(index.indexOf("app.post('/api/keys'"), index.indexOf("app.post('/api/keys'") + 1200);
  assert.ok(mint.length > 100, 'THIS GUARD IS BROKEN: POST /api/keys could not be located in the worker');
  assert.doesNotMatch(
    mint,
    /\bplan\b|isPlanId|requireAdmin|ADMIN_KEY/,
    'THIS GUARD IS STALE, NOT THE PAGES: minting an API key now consults a plan or an admin key, so ' +
      '"anybody signed in can get one" has stopped being true. Say what is true instead.',
  );
});

test('no page tells a reader there is no API', () => {
  // A GUARD THAT FORBIDS TRUE SENTENCES IS A GUARD THAT GETS DELETED.
  //
  // Both of the first two patterns were wider than the property when this file was written, and the
  // cases are ordinary things an /docs/api page would want to say. `no API` matched "if you have no
  // API key, mint one" — a sentence about the feature existing — so it now refuses to fire in front
  // of "key". `API ... not yet` matched "the API is not yet documented", which is TRUE and is the
  // kind of honesty this repository is for; it is narrowed to denials of the surface's existence.
  // Measured both ways before narrowing, and the teeth test below still catches what shipped.
  const DENIALS = [
    { id: 'no-api', re: /\bno\s+(public\s+)?api\b(?!\s*keys?\b)/i },
    { id: 'api-unavailable', re: /\bapi\b[^.?]{0,30}\b(is\s+)?not\s+(yet\s+)?(available|offered|exposed|exist)/i },
    { id: 'two-supported-surfaces', re: /\bthe\s+two\s+supported\s+surfaces\b/i },
    { id: 'cannot-script', re: /\b(cannot|can't|no way to)\s+script\s+apple\b/i },
  ];
  const found = [];
  for (const p of pages()) {
    const hay = visibleText(readFileSync(p, 'utf8'));
    for (const { id, re } of DENIALS) {
      const hit = re.exec(hay);
      if (hit) found.push(`${p.slice(SITE.length + 1)}: [${id}] "${hit[0].trim()}"`);
    }
  }
  assert.deepEqual(
    found,
    [],
    `a page denies an API the product serves at ${PUBLIC_PATHS.length} routes:\n  ${found.join('\n  ')}`,
  );
});

test('the FAQ points at the surface that exists, and at nothing that does not', () => {
  const hay = visibleText(faq);
  assert.match(hay, /\/v1\b/, 'the FAQ never names the API path, so a reader has nowhere to start');
  assert.match(hay, /Settings\s*(&rarr;|→|-&gt;|>)\s*Connections/i,
    'the FAQ does not say where a key is minted, which is the one thing a reader needs next');

  // There is no /docs/api page. A link to one would trade a false sentence for a dead link, and
  // apps/site/tests/links-resolve.test.mjs would only catch it after a build.
  assert.doesNotMatch(hay, /\/docs\/api\b/, 'the FAQ links to a docs page for the API that does not exist');

  // And no offer of a client library while the package is unpublished.
  const sdk = JSON.parse(readFileSync(join(ROOT, 'packages', 'sdk', 'package.json'), 'utf8'));
  if (sdk.private === true) {
    for (const p of pages()) {
      assert.doesNotMatch(
        visibleText(readFileSync(p, 'utf8')),
        /\b(install|download|use)\b[^.]{0,30}\bthe\s+(apple\s+)?sdk\b/i,
        `${p.slice(SITE.length + 1)} offers an SDK, and packages/sdk is private and published nowhere`,
      );
    }
  }
});

test('the guard has teeth: it fails on the answer that shipped', () => {
  const shipped =
    '<p>Not yet. The web workspace and Studio plugin are the two supported surfaces at v0.1. If ' +
    'you have an automation use case, email us — real use cases move the roadmap.</p>';
  const hay = visibleText(shipped);
  assert.match(hay, /\bthe\s+two\s+supported\s+surfaces\b/i, 'the shipped answer slipped past — re-aim the patterns');

  // And a plainer denial, so the guard is not pinned to one sentence.
  const NO_API = /\bno\s+(public\s+)?api\b(?!\s*keys?\b)/i;
  assert.match(visibleText('<p>There is no public API.</p>'), NO_API);

  // The replacement must pass, or the guard would forbid the truth along with the lie — and so must
  // the two true sentences the earlier, wider patterns wrongly caught.
  for (const fine of [
    '<p>Yes. There is an HTTP API at <code>/v1</code> with scoped keys.</p>',
    '<p>If you have no API key yet, mint one under Settings.</p>',
    '<p>The API is not yet documented on its own page.</p>',
  ]) {
    const hay = visibleText(fine);
    assert.doesNotMatch(hay, NO_API, fine);
    assert.doesNotMatch(hay, /\bapi\b[^.?]{0,30}\b(is\s+)?not\s+(yet\s+)?(available|offered|exposed|exist)/i, fine);
  }
});
