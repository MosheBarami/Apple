/**
 * "THE LIBRARY HAS NOTHING LIKE THAT" AND "THERE IS NO LIBRARY" ARE DIFFERENT ANSWERS.
 *
 * The curated asset library has a complete read path, a validator, and a 20-entry seed
 * manifest. What it has never had is a caller for `ensureAssetTables` or `upsertAssets`
 * — verified across apps/, packages/, scripts/ and .github/ — so the tables have never
 * been created. Production D1 (`golem-corpus`) holds chunks, static_assets and
 * static_chunks, and no `asset_library` at all.
 *
 * The system prompt tells the model to try `search_asset_library` FIRST. Every one of
 * those calls raised `no such table: asset_library_fts`, which reached the model as a
 * raw SQL string it could do nothing useful with.
 *
 * The tempting fix is the wrong one. Calling `ensureAssetTables` lazily would create
 * the tables and let the search return `[]` — turning a loud failure into a quiet "no
 * matches", which is a claim about a table nobody has ever filled. That is the same
 * defect as the attribution ledger reporting a clean bill from an empty table.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const tools = readFileSync(join(ROOT, 'apps/worker/src/tools.ts'), 'utf8');
const body = tools.slice(tools.indexOf('search_asset_library: {'), tools.indexOf('find_verified_asset: {'));

test('a missing library is reported as missing, not as an empty result', () => {
  // `.includes('no such table')` — the CHECK, not the phrase. The first version matched
  // /no such table/ anywhere in the block, which the explanatory comment above the code
  // satisfies on its own, so deleting the guard entirely left that assertion green.
  assert.match(
    body,
    /\.includes\('no such table'\)/,
    'the missing-table case has to be recognised in code, not only described in a comment',
  );
  assert.match(body, /not available in this deployment/, 'and named for what it is');
  assert.match(
    body,
    /not a statement that it has nothing matching/,
    'the error must rule out the reading that would send the model away satisfied',
  );
});

test('the fallback is named, so the model chooses it rather than stumbling into it', () => {
  assert.match(body, /find_verified_asset/, 'the Creator Store path must be offered');
  assert.match(body, /create_instances/, 'and so must building it from Parts');
});

test('an unexpected failure is still thrown rather than dressed up as a missing library', () => {
  // A timeout, a bind error or a corrupt index must not be reported to the model as
  // "the library is not available in this deployment" — that would send it down the
  // fallback path on evidence that does not support it, and hide a real fault.
  assert.match(body, /throw e;/, 'anything that is not the missing-table case must propagate');
});

test('nothing lazily creates the asset tables', () => {
  // Deliberate. Creating them would make the search return [] — "the curated library
  // has nothing like that" — about a table nobody has ever populated.
  //
  // Matching a CALL, not a mention: the comment above the fix in tools.ts names
  // `ensureAssetTables` to explain why it is absent, and the first version of this
  // assertion failed on that sentence.
  assert.doesNotMatch(body, /ensureAssetTables\s*\(/, 'search must not conjure an empty library');
});

test('the library write path still has no caller, so the blocker is not silently stale', () => {
  // If someone wires up an ingest, this fails and the note in BLOCKERS.md gets
  // revisited rather than sitting there contradicting the code.
  const hits = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (['node_modules', 'raw', 'data', 'dist', '.wrangler'].includes(e.name)) continue;
        walk(join(dir, e.name));
      } else if (/\.(ts|tsx|mjs|js)$/.test(e.name)) {
        const p = join(dir, e.name);
        // The definitions themselves, and this test, both name them legitimately.
        if (p.endsWith('asset-library.ts') || p.endsWith('asset-library-availability.test.mjs')) continue;
        if (/\b(upsertAssets|ensureAssetTables)\s*\(/.test(readFileSync(p, 'utf8'))) hits.push(p.slice(ROOT.length + 1));
      }
    }
  };
  for (const d of ['apps/worker/src', 'apps/web/src', 'packages', 'scripts']) walk(join(ROOT, d));
  assert.deepEqual(
    hits,
    [],
    `the library can now be populated from ${hits.join(', ')} — revisit the blocker and this test`,
  );
});
