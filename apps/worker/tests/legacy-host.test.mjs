/**
 * THE OLD NAME MUST NOT SERVE THE PRODUCT.
 *
 * `golem.moshe-barami111.workers.dev` was not a stale leftover — it was a COMPLETE, CURRENT second
 * copy. Measured 2026-09-19: `/`, `/app`, `/pricing`, `/privacy` and `/terms` all returned 200 with
 * bytes identical to the studpilot host, `/app` served the same JS bundle byte for byte, `robots.txt`
 * said `Allow: /`, and nothing redirected. `rel=canonical` was present, which is a hint to a
 * crawler and not an instruction to a browser: a person arriving from a bookmark, an old link or a
 * search result stayed on the old brand's hostname for their whole session, address bar included.
 *
 * The rule this pins has two halves, and the second is why it is not simply "block the old host":
 *
 *   PAGES REDIRECT. Anything a person reads moves to the canonical origin, permanently.
 *   APIs DO NOT. `/api/*` and `/v1` keep answering where they are, because a redirect turns an
 *   authenticated POST into a request that can lose its body, and because "stop showing a person
 *   the old name" and "sever the old name" are different promises. Every shipped client points at
 *   the canonical origin, so nothing installed depends on either behaviour — but the asymmetry is
 *   deliberate and has to survive someone tidying it.
 *
 * THE CANONICAL ORIGIN IS NOW https://studpilot.app, and the former hosts (golem, and apple) are the
 * stand-in Worker in infra/legacy-proxy until 2027-01-02, which makes the same split in front of
 * this Worker (tests/legacy-proxy.test.mjs). This file pins what THIS Worker does with the shared
 * constants; the one shipped client allowed to name a former host is the Studio plugin's fallback.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '../../..');
const INDEX = readFileSync(join(ROOT, 'apps/worker/src/index.ts'), 'utf8');
const shared = await import(join(ROOT, 'packages/shared/src/index.ts'));

test('the canonical origin and the legacy host are both named once, in the shared package', () => {
  assert.equal(shared.PRODUCT_ORIGIN, 'https://studpilot.app');
  assert.equal(shared.LEGACY_PRODUCT_HOST, 'golem.moshe-barami111.workers.dev');
  // A redirect from a host to itself is a loop: the product must not be the host it redirects away from.
  assert.notEqual(new URL(shared.PRODUCT_ORIGIN).hostname, shared.LEGACY_PRODUCT_HOST);
  // The redirect must READ them, not restate them. A destination typed beside the redirect is how
  // you end up 308-ing a host to a slightly different spelling of itself.
  assert.match(INDEX, /url\.hostname !== LEGACY_PRODUCT_HOST/, 'the redirect does not read the shared legacy host');
  assert.match(INDEX, /new URL\(url\.pathname \+ url\.search, PRODUCT_ORIGIN\)/, 'the redirect does not read the shared origin');
});

test('page routes on the legacy host are redirected permanently', () => {
  assert.match(INDEX, /return c\.redirect\(target\.toString\(\), 308\)/,
    'the legacy host no longer issues a permanent redirect for page routes');
});

test('API routes on the legacy host are deliberately NOT redirected', () => {
  // The exemption is the load-bearing half. If someone "simplifies" this to redirect everything,
  // an authenticated POST to /api on the old host becomes a request that can arrive without its
  // body — a silent data loss that looks like a tidy-up in the diff.
  assert.match(INDEX, /url\.pathname\.startsWith\('\/api\/'\) \|\| url\.pathname\.startsWith\('\/v1'\)/,
    'the API exemption on the legacy-host redirect is gone');
});

test('no shipped client points at a former host, except the plugin fallback that says so', () => {
  // The reason pages can be redirected at all. Checked per file rather than asserted in prose, and
  // against the files that EXIST: a client list that names a deleted file passes on every run.
  const APPLE_HOST = 'apple.moshe-barami111.workers.dev';
  const clients = [
    'apps/studpilot-plugin/src/Bridge.luau',
    'apps/studpilot-plugin/src/init.server.luau',
    'packages/sdk/luau/StudPilotClient.luau',
    'packages/sdk/src/wire.mjs',
    'packages/sdk/python/studpilot_sdk/client.py',
  ];
  const offenders = [];
  for (const rel of clients) {
    const text = readFileSync(join(ROOT, rel), 'utf8');
    if (text.includes(shared.LEGACY_PRODUCT_HOST)) offenders.push(`${rel} -> ${shared.LEGACY_PRODUCT_HOST}`);
    // The plugin's one-release fallback is the single place that may name the apple host, once, as
    // the fallback and not as the primary.
    const hits = text.split(APPLE_HOST).length - 1;
    if (rel === 'apps/studpilot-plugin/src/Bridge.luau') {
      if (!new RegExp(`local FALLBACK_ORIGIN = "https://${APPLE_HOST.replace(/\./g, '\\.')}"`).test(text) || hits !== 1) {
        offenders.push(`${rel} -> the apple host must appear exactly once, as FALLBACK_ORIGIN (found ${hits})`);
      }
      assert.match(text, /local STUDPILOT_ORIGIN = "https:\/\/studpilot\.app"/, 'the plugin primary is not the product origin');
    } else if (hits) offenders.push(`${rel} -> ${APPLE_HOST}`);
  }
  assert.deepEqual(offenders, [], `these shipped clients still point at a former host: ${offenders.join('; ')}`);
});

test('the guard fails if the redirect is removed', () => {
  // Falsification: the shape this file exists to prevent is the middleware simply not being there.
  const without = INDEX.replace(/app\.use\('\*', async \(c, next\) => \{[\s\S]*?return c\.redirect\(target\.toString\(\), 308\);\n\}\);/, '');
  assert.notEqual(without, INDEX, 'the mutation did not land — re-aim it before trusting this test');
  assert.doesNotMatch(without, /return c\.redirect\(target\.toString\(\), 308\)/);
});
