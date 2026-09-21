// A truncated file tree is a floor, and must never be rendered as a total.
//
// WHY THIS EXISTS. `docs/github-corpus-licences.md` reported "1,063 licence-verified,
// Roblox-relevant repositories. 5.45 GB." The 5.45 GB was repository size — checkouts, images,
// binaries, vendored dependencies — standing in a Luau-shaped hole, because the trees had never
// been read and `luau_lua_file_count` was 0 on every row. The document said so in its own words,
// which is the only reason it was not a lie. The moment the trees ARE read, that protection is
// gone: the field now carries a number, and a number is believed.
//
// GitHub truncates a recursive tree above roughly 100k entries. When it does, the count that comes
// back is a lower bound on a repository that is, by definition, one of the largest in the corpus —
// so the error runs in the direction of understating exactly the repositories that matter most,
// and it understates them silently. `summariseTree` answers by writing FLOOR ONLY into
// `estimated_rows_basis`, and these assertions are what keep it there.
//
// WHAT THIS PROVES, STATED NARROWLY: that a truncated tree is labelled as a floor and a complete
// one is not; that the Luau total is the sum of its two extensions rather than an independent
// number that can drift; that seeing a licence file in a tree is never recorded as having read it;
// that the relevance filter still rejects the awesome-lists the raw sweep dragged in; and that no
// row in the artifact was admitted to training by a pass that only counts files.
//
// It proves nothing about whether GitHub's licence detection was correct, and nothing about
// whether any of these files are worth training on.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { summariseTree, isRobloxRelevant, isLuauPath, preferredLicenceFile } from './read-github-trees.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = join(ROOT, 'discovery/v2/github-trees.jsonl');

const tree = (entries, truncated = false) => ({ sha: 'deadbeef', truncated, tree: entries });
const blob = (path, size = 100, sha = 'aaaa') => ({ path, type: 'blob', size, sha });

test('a truncated tree is labelled a floor; a complete tree is not', () => {
  const entries = [blob('src/a.luau', 10), blob('src/b.lua', 20)];

  const complete = summariseTree(tree(entries, false));
  assert.equal(complete.tree_truncated, false);
  assert.doesNotMatch(complete.estimated_rows_basis, /FLOOR/,
    'a complete tree was described as a floor, which understates a count that is exact');

  const cut = summariseTree(tree(entries, true));
  assert.equal(cut.tree_truncated, true);
  assert.match(cut.estimated_rows_basis, /FLOOR ONLY/,
    'GitHub truncated the tree and the row basis did not say the count is a lower bound');
  assert.match(cut.estimated_rows_basis, /lower bound, not a total/,
    'the floor label must say what it means in words a reader cannot round off');
});

test('the Luau total is the sum of its two extensions, never an independent number', () => {
  const s = summariseTree(tree([
    blob('src/init.luau'), blob('src/theme.luau'), blob('legacy/old.lua'),
    blob('README.md'), blob('art/logo.png'), { path: 'src', type: 'tree', sha: 'bbbb' },
  ]));
  assert.equal(s.file_count_luau_ext, 2);
  assert.equal(s.file_count_lua_ext, 1);
  assert.equal(s.luau_lua_file_count, s.file_count_luau_ext + s.file_count_lua_ext);
  // .lua must keep counting: most Roblox source predates the .luau extension, and dropping it
  // would quietly halve the corpus while every count still looked self-consistent.
  assert.ok(s.file_count_lua_ext > 0, 'the .lua extension stopped counting');
  assert.equal(s.file_count_total, 5, 'tree entries were counted as files');
  assert.equal(s.estimated_rows_one_file_per_row, s.luau_lua_file_count);
});

test('byte totals come only from Luau blobs, not from the whole repository', () => {
  const s = summariseTree(tree([
    blob('src/a.luau', 300), blob('src/b.lua', 200), blob('vendor/huge.dll', 90_000_000),
  ]));
  assert.equal(s.luau_lua_bytes, 500,
    'a non-Luau blob entered the Luau byte total — this is the 5.45 GB defect returning');
});

test('seeing a licence file in a tree is never recorded as having read it', () => {
  const withFile = summariseTree(tree([blob('LICENSE', 1067, 'cafe'), blob('src/a.luau')]));
  assert.equal(withFile.license_file_name, 'LICENSE');
  assert.equal(withFile.license_file_sha, 'cafe');

  const without = summariseTree(tree([blob('src/a.luau')]));
  assert.equal(without.license_file_name, null,
    'a repository with no licence file at its root was given one');
  assert.equal(without.license_file_sha, null);

  // A licence file nested inside a dependency licenses that dependency, not this repository.
  const nested = summariseTree(tree([blob('node_modules/x/LICENSE', 1000, 'beef'), blob('src/a.luau')]));
  assert.equal(nested.license_file_name, null,
    "a vendored dependency's licence was taken as the repository's own grant");
});

test('a licence file named UNLICENSE or LICENSE-APACHE is found, because eleven of them were not', () => {
  // HISTORY. The first matcher was /^(LICEN[CS]E|COPYING)(\.[A-Za-z0-9]+)?$/i. Against the 1,063
  // trees it wrote "NO licence file found at the repository root" onto eleven repositories that
  // each had one, and 310 licence-clean Luau files were dropped from the corpus as a result. The
  // exclusion was recorded as a rights fact. It was a regex.
  //
  // These names are not hypothetical: every string below is a real root entry read from GitHub on
  // 2026-09-21 in the repositories named beside it.
  const cases = [
    ['UNLICENSE', 'Unlicense', 'TokenManiac/Base64, Heliodex/VM, tp-link-extender/2013 and four more'],
    ['LICENSE-APACHE.md', 'Apache-2.0', 'rniraclefire/pretty-fusion-utils, rniraclefire/funk'],
    ['LICENSE-APACHE.txt', 'Apache-2.0', 'techs-sus/azalea'],
    ['LICENSE-APACHE', 'Apache-2.0', 'project-roadwork/spatial-grid'],
  ];
  for (const [name, spdx, where] of cases) {
    const s = summariseTree(tree([blob(name, 1067, 'cafe'), blob('src/a.luau')]), spdx);
    assert.equal(s.license_file_name, name, `${name} (${where}) was not seen as a licence file`);
    assert.equal(s.license_file_sha, 'cafe');
  }

  // The widening must not swallow source files that merely talk about licences.
  for (const notALicence of ['license-checker.luau', 'licensing.md', 'NOTICE', 'LICENSES/readme.md']) {
    assert.equal(summariseTree(tree([blob(notALicence), blob('src/a.luau')]), 'MIT').license_file_name, null,
      `${notALicence} was taken for a licence grant`);
  }

  // Sift/LICENSE.luau really is the MIT text under a .luau extension. It stays in.
  assert.equal(summariseTree(tree([blob('LICENSE.luau')]), 'MIT').license_file_name, 'LICENSE.luau');
});

test('a dual-licensed root picks the file that matches the detected licence, not the first one', () => {
  // WHY THIS IS NOT COSMETIC. acquire-github-luau.mjs fetches exactly license_file_name and runs
  // licenceTextCorroborates(api_license_guess, thatText). Handing it LICENSE-MIT for an Apache-2.0
  // repository produces `licence_text_mismatch` and zero rows — a false rejection that reads in the
  // artifact exactly like a real rights finding.
  const dual = ['LICENSE-APACHE.md', 'LICENSE-MIT.md'];
  assert.equal(preferredLicenceFile(dual, 'Apache-2.0'), 'LICENSE-APACHE.md');
  assert.equal(preferredLicenceFile(dual, 'MIT'), 'LICENSE-MIT.md');
  assert.equal(preferredLicenceFile(['LICENSE-APACHE', 'LICENSE-BSD'], 'BSD-3-Clause'), 'LICENSE-BSD');

  // With nothing to go on, the bare LICENSE wins over a qualified one, and the choice is stable.
  assert.equal(preferredLicenceFile(['LICENSE-MIT', 'LICENSE'], null), 'LICENSE');
  assert.equal(preferredLicenceFile(['LICENSE-MIT', 'LICENSE'], 'GPL-3.0'), 'LICENSE',
    'an unrecognised SPDX id must fall back to the stable order, not to tree order');
  assert.equal(preferredLicenceFile([], 'MIT'), null);
});

test('the relevance filter rejects the awesome-lists the raw sweep dragged in', () => {
  // These four are the largest licence-clean repositories in the sweep by stars, and none of them
  // has anything to do with Roblox. Training on them is training on awesome-lists.
  for (const id of ['sindresorhus/awesome', 'public-apis/public-apis', 'fffaraz/awesome-cpp', 'rust-unofficial/awesome-rust']) {
    assert.equal(isRobloxRelevant({ source_id: id, primary_language: 'Markdown' }), false, `${id} passed as Roblox-relevant`);
  }
  assert.equal(isRobloxRelevant({ source_id: 'boatbomber/Highlighter', primary_language: 'Luau' }), true);
  assert.equal(isRobloxRelevant({ source_id: 'someone/plain-lua-lib', primary_language: 'Lua' }), true);
  assert.equal(isRobloxRelevant({ source_id: 'someone/roblox-thing', primary_language: 'TypeScript' }), true);
  assert.equal(isLuauPath('src/init.luau'), true);
  assert.equal(isLuauPath('src/init.lua'), true);
  assert.equal(isLuauPath('src/init.luaurc'), false);
  assert.equal(isLuauPath('README.md'), false);
});

test('the artifact agrees with the folds, and admits nothing', { skip: !existsSync(ARTIFACT) && 'tree pass has not been run' }, () => {
  const rows = readFileSync(ARTIFACT, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  assert.ok(rows.length > 100, `the artifact holds ${rows.length} rows — this test would check almost nothing`);

  const measured = rows.filter((r) => r.tree_status === 'ok');
  assert.ok(measured.length > 100, `only ${measured.length} trees were read — the partition is too thin to assert against`);

  for (const r of measured) {
    assert.equal(r.luau_lua_file_count, r.file_count_luau_ext + r.file_count_lua_ext,
      `${r.source_id}: Luau total disagrees with its parts`);
    assert.ok(r.luau_lua_file_count <= r.file_count_total,
      `${r.source_id}: more Luau files than files`);
    if (r.tree_truncated) {
      assert.match(r.estimated_rows_basis, /FLOOR ONLY/, `${r.source_id}: truncated tree not labelled a floor`);
    }
    if (!r.license_file_name) {
      assert.equal(r.license_verified, 'github_api_detection',
        `${r.source_id}: claims a licence file is present with no licence file in its tree`);
    }
    // The tier must never reach licence_text here. This pass reads a tree; it does not read text.
    assert.notEqual(r.license_verified, 'licence_text',
      `${r.source_id}: a tree read was recorded as having read the licence text`);
    assert.equal(r.admitted_to_training, false,
      `${r.source_id}: a pass that only counts files admitted a repository to training`);
  }

  // Every row carries a licence GitHub detected as permissive. A tree read must not change that.
  const classes = new Set(measured.map((r) => r.license_class));
  assert.deepEqual([...classes], ['permissive_osi'],
    `the tree pass is reading repositories outside the permissive partition: ${[...classes].join(', ')}`);
});
