import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The live docs page said: "Roblox removed the previous plugin listing (107230158271368)."
 *
 * 107230158271368 is the CURRENT listing. The removed predecessor is a different id, on a different
 * account, under a different name, and is deliberately not published anywhere on this site. So the
 * sentence told a reader that the id the product depends on today is a dead one — while the page's
 * own install instructions below it described getting that very asset.
 *
 * The shape of the mistake is worth naming, because a rename will reproduce it: the page derived the
 * id from one source of truth and the PROSE AROUND IT from memory. One of the two was updated when
 * the asset was republished. This test pins the other one.
 */

const SRC = fileURLToPath(new URL('../src/', import.meta.url));

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.(astro|tsx|ts)$/.test(p)) yield p;
  }
}

const files = [...walk(SRC)].map((path) => ({ path, text: readFileSync(path, 'utf8') }));

// A page that renders the asset id is a page whose reader will attach the surrounding prose TO that
// id. Pages that never show it are free to talk about history.
const rendersAssetId = files.filter((f) => /STUDIO_PLUGIN_ASSET_ID/.test(f.text));

const STALE = /(previous|former|old|earlier|replaced|superseded)\s+(?:\w+\s+)?listing/i;

/** Comments are where the mistake gets EXPLAINED, so they are exempt; only shipped prose counts. */
const prose = (text) => text.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

function check(pages) {
  const bad = [];
  for (const f of pages) {
    const m = prose(f.text).match(STALE);
    if (m) bad.push(`${f.path.replace(SRC, '')}: says "${m[0]}" on a page that prints the current id`);
  }
  assert.deepEqual(bad, [], bad.join('\n'));
}

test('a page that shows the current asset id never calls it a previous listing', () => {
  assert.ok(rendersAssetId.length > 0, 'nothing renders the asset id — this check would be vacuous');
  check(rendersAssetId);
});

test('the guard fails when the exact sentence that shipped is put back', () => {
  const victim = rendersAssetId.find((f) => f.path.endsWith('docs/plugin.astro'));
  assert.ok(victim, 'docs/plugin.astro no longer prints the asset id — this falsification is vacuous');
  const reintroduced = victim.text.replace(
    /<strong>Public installation is unavailable[\s\S]{0,80}?<\/strong>/,
    '<strong>Public installation is unavailable.</strong> Roblox removed the previous plugin listing',
  );
  assert.notEqual(reintroduced, victim.text, 'the mutation did not land — re-aim it before trusting this test');
  // Run the REAL check over the mutated page, not a hand-rolled regex match beside it.
  assert.throws(() => check([{ path: victim.path, text: reintroduced }]));
});

test('while a refusal is recorded, the install page states the reason rather than only the outcome', async () => {
  // No catch: if this specifier stops resolving the test must go red, not quietly assert nothing.
  const shared = await import('../../../packages/shared/src/index.ts');
  const refusal = shared.STUDIO_PLUGIN_STORE_REFUSAL ?? null;
  const page = files.find((f) => f.path.endsWith('docs/plugin.astro'))?.text ?? '';

  // "Unavailable" and "refused" are different facts, and a reader deciding whether to wait needs the
  // second one. The page must reach for the reason, not restate the outcome in new words.
  assert.match(page, /STUDIO_PLUGIN_STORE_REFUSAL/, 'the page does not consult the refusal at all');
  assert.match(page, /refusal\.reason/, 'the page never prints the reason Roblox gave');

  if (refusal) {
    assert.ok(refusal.reason.length > 3, 'a refusal with no reason is not a refusal anyone can act on');
    assert.ok(
      refusal.appealId === null || typeof refusal.appealedAt === 'string',
      'an appeal id with no sent-at date cannot be checked against the appeal window',
    );
  }
});
