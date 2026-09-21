// A licence tag that the licence text does not corroborate must buy nothing, and a vendored
// dependency must never be licensed by the repository that vendored it.
//
// WHY THIS EXISTS. The whole argument for acquiring from GitHub rather than from more Hugging Face
// compilations is a rights tier: `runs/rights-clearance.json` grades all four Hugging Face sources
// `publisher_declaration_only`, because a card tag is an uploader's assertion about files that came
// from thousands of third parties who never saw it. `screen-row-licences.mjs` then measured what
// one such tag was covering: 808,084 unlicensed rows against 37,267 permissive, on a repository
// tagged `odc-by`.
//
// If this acquisition path accepts GitHub's `license.spdx_id` without reading the LICENSE, it has
// reproduced exactly that defect one layer up — a detection standing in for a document — and the
// rows would carry `upstream_licence_text_verified` while nothing verified any text. If it takes
// `Packages/` and `node_modules/`, it has licensed other people's code with this repository's
// grant, and the corpus gets bigger in the one way that makes it less defensible.
//
// Both failures are invisible: more rows, no error, every field populated.
//
// WHAT THIS PROVES, STATED NARROWLY: that corroboration fails closed on an unrecognised or
// contradicting text; that vendor exclusion matches whole path segments rather than substrings;
// that dedupe normalisation ignores line endings and trailing space but not real content; and that
// every row in the artifact carries retrieved-licence evidence and is approved for nothing.
//
// It proves nothing about whether the upstream author held the rights they granted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isVendoredPath, licenceTextCorroborates, normalisedSha256, isGeneratedLuau, shapeSha256, gitBlobSha1 } from './acquire-github-luau.mjs';
import { execFileSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROWS = join(ROOT, 'data/roblox-github-v1/rows.jsonl');
const REPOS = join(ROOT, 'data/roblox-github-v1/repos.jsonl');

const MIT = 'MIT License\n\nCopyright (c) 2024 Someone\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...';
const APACHE = 'Apache License\nVersion 2.0, January 2004\nhttp://www.apache.org/licenses/';
const RESERVED = 'Copyright (c) 2024 Someone. All rights reserved. You may not copy or redistribute this software.';

test('a licence text that does not carry the grant fails closed', () => {
  assert.equal(licenceTextCorroborates('MIT', MIT), true);
  assert.equal(licenceTextCorroborates('Apache-2.0', APACHE), true);

  // The case this exists for: GitHub's detector calls an all-rights-reserved notice MIT.
  assert.equal(licenceTextCorroborates('MIT', RESERVED), false,
    'an "all rights reserved" notice corroborated an MIT tag');
  // Crossed tags must not corroborate each other.
  assert.equal(licenceTextCorroborates('MIT', APACHE), false);
  assert.equal(licenceTextCorroborates('Apache-2.0', MIT), false);
  // An SPDX id nobody mapped is not permission.
  assert.equal(licenceTextCorroborates('WTFPL', MIT), false, 'an unmapped SPDX id was corroborated');
  assert.equal(licenceTextCorroborates('MIT', ''), false, 'an empty licence file corroborated a tag');
  assert.equal(licenceTextCorroborates('MIT', 'Permission   is\nhereby  granted, free of charge'), true,
    'corroboration broke on line wrapping, which every real LICENSE file has');
});

test('a blob fetched one at a time is checked against the sha the pinned tree named', () => {
  // WHY THIS EXISTS. Two repositories are over the 600 MiB snapshot cap and hold 1,956 Luau files
  // between them. Buffering a 1.8 GiB tarball would take the process down, so those files arrive
  // one blob at a time — and a blob arriving alone has none of the integrity a tar archive gives
  // for free. A truncated body, a substituted file or a base64 decode that silently lost bytes
  // would be written into rows.jsonl under this repository's licence, with a pinned permalink
  // pointing at content that is not what is stored. The tree already named a sha per file; this is
  // what turns that into a check.
  //
  // It is git's own labelling, so git is the oracle: `git hash-object` must agree, or the check is
  // comparing against something other than what the tree recorded.
  const cases = ['hello world\n', '', 'local x = 1\n-- ünïcödé ✓\n', 'a'.repeat(5000)];
  for (const text of cases) {
    const buf = Buffer.from(text, 'utf8');
    const fromGit = execFileSync('git', ['hash-object', '--stdin'], { input: buf }).toString().trim();
    assert.equal(gitBlobSha1(buf), fromGit,
      `gitBlobSha1 disagrees with git hash-object on a ${buf.length}-byte blob`);
  }

  // A single flipped byte must not hash to the same name, or the check certifies nothing.
  const good = Buffer.from('local x = 1\n');
  const tampered = Buffer.from('local x = 2\n');
  assert.notEqual(gitBlobSha1(good), gitBlobSha1(tampered));

  // And the length is inside the hash, so a truncation is caught even when the prefix is honest.
  assert.notEqual(gitBlobSha1(Buffer.from('local x = 1\n')), gitBlobSha1(Buffer.from('local x = 1')));

  // Binary is hashed as bytes, not as a string. A NUL must not terminate anything.
  const withNul = Buffer.from([0x6c, 0x00, 0x78]);
  assert.equal(gitBlobSha1(withNul), execFileSync('git', ['hash-object', '--stdin'], { input: withNul }).toString().trim());
});

test('a row acquired blob-by-blob is indistinguishable from one acquired from a tarball',
  { skip: !existsSync(ROWS) && 'rows.jsonl is gitignored and absent from this checkout' }, () => {
    // The two acquisition paths share the walk, the vendored exclusion, the dedupe and the row
    // literal on purpose: a second row builder would be a second definition of what a row is, and
    // the two would drift silently. The ledger records WHICH path each repository took, and this
    // asserts the rows themselves carry no trace of it.
    const repos = readFileSync(REPOS, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    const byBlob = repos.filter((r) => r.acquired_via === 'git_blob_api_at_pinned_revision');
    if (byBlob.length === 0) return; // --oversized has not been run in this checkout

    for (const r of byBlob) {
      assert.equal(r.status, 'acquired');
      assert.equal(r.evidence_tier, 'licence_text',
        `${r.source_id} came in by blob and skipped the licence-text tier the tarball path enforces`);
      assert.equal(r.licence_text_corroborates_tag, true);
      assert.ok(r.oversized_blob_fetch, `${r.source_id} records no blob-fetch accounting`);
      assert.equal(r.oversized_blob_fetch.integrity_failures, 0,
        `${r.source_id} wrote rows from a run that had blobs fail their sha check`);
      assert.ok(r.oversized_blob_fetch.fetched <= r.oversized_blob_fetch.blobs_in_tree);
    }

    const ids = new Set(byBlob.map((r) => r.source_id));
    const tarKeys = new Set();
    const blobKeys = new Set();
    for (const line of readFileSync(ROWS, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const row = JSON.parse(line);
      const target = ids.has(row.provenance?.source_id) ? blobKeys : tarKeys;
      if (target.size < 400) for (const k of Object.keys(row)) target.add(k);
    }
    assert.ok(blobKeys.size > 0, 'the ledger names blob-acquired repositories and no row came from one');
    assert.deepEqual([...blobKeys].sort(), [...tarKeys].sort(),
      'a blob-acquired row has a different shape from a tarball-acquired one; the two paths have drifted');
  });

test('vendor exclusion matches whole path segments, not substrings', () => {
  for (const p of [
    'Packages/Roact/init.lua',
    'src/node_modules/x/y.lua',
    'Packages/_Index/roblox_roact@1.4.4/roact/src/init.lua',
    'DevPackages/Jest/init.luau',
    'ServerPackages/Thing/init.luau',
    'vendor/lib.lua',
    'third_party/a/b.luau',
  ]) assert.equal(isVendoredPath(p), true, `${p} was not recognised as vendored`);

  // A substring match would eat these, and they are the repository's own source.
  for (const p of [
    'src/PackagesTest/thing.luau',
    'src/MyPackages.luau',
    'src/init.luau',
    'tests/vendoring.lua',
    'src/_IndexHelper.luau',
  ]) assert.equal(isVendoredPath(p), false, `${p} was wrongly excluded as vendored`);
});

test('dedupe ignores line endings and trailing space, and nothing else', () => {
  const a = 'local x = 1\nreturn x\n';
  assert.equal(normalisedSha256(a), normalisedSha256('local x = 1\r\nreturn x\r\n'), 'CRLF defeated dedupe');
  assert.equal(normalisedSha256(a), normalisedSha256('local x = 1   \nreturn x\n\n\n'), 'trailing space defeated dedupe');
  assert.notEqual(normalisedSha256(a), normalisedSha256('local x = 2\nreturn x\n'), 'dedupe collapsed different code');
  // Indentation is content in Luau style and must not be normalised away.
  assert.notEqual(normalisedSha256('if a then\n\tb()\nend'), normalisedSha256('if a then\nb()\nend'),
    'dedupe collapsed files that differ in indentation');
});

test('machine-generated files are marked, and hand-written code is not', () => {
  // The exact banner on all 8,187 rows the first repository contributed.
  assert.equal(isGeneratedLuau('-- This file was @generated by Tarmac. It is not intended for manual editing.\nreturn {}'), true);
  assert.equal(isGeneratedLuau('--!strict\n-- AUTO-GENERATED FILE - DO NOT EDIT\nreturn {}'), true);
  assert.equal(isGeneratedLuau('-- Generated by rojo-sourcemap\nreturn {}'), true);

  // A banner buried 4kB down is a comment about something else, not a generator marker.
  assert.equal(isGeneratedLuau('local x = 1\n'.repeat(400) + '-- @generated'), false,
    'a marker far outside the header was read as a generator banner');
  assert.equal(isGeneratedLuau('local Players = game:GetService("Players")\nreturn Players'), false,
    'hand-written game code was marked machine-generated');
});

test('shape hashing collapses one template used many times, and nothing else', () => {
  // The 8,187-row case: identical programs, different numbers.
  const stub = (x, y) => `return {\n\tImage = "rbxassetid://1",\n\tOffset = Vector2.new(${x}, ${y}),\n}`;
  assert.equal(shapeSha256(stub(975, 50)), shapeSha256(stub(12, 12)),
    'two instances of one generated template hashed to different shapes — the count would stay inflated');
  assert.equal(shapeSha256(stub(975, 50)), shapeSha256(stub(1, 2)));

  // Generated templates vary by STRING as well as by number — asset ids, icon names, service
  // names. This assertion exists because a falsification run removed the string placeholder and
  // nothing went red: the mechanism was there and nothing was watching it.
  const named = (id, name) => `return { Image = "rbxassetid://${id}", Name = "${name}" }`;
  assert.equal(shapeSha256(named(1, 'a-arrow-down')), shapeSha256(named(99999, 'zoom-out')),
    'two instances of one template differing only in string literals hashed to different shapes');

  // Different programs must not collapse. A shape collision here would understate the corpus.
  assert.notEqual(shapeSha256(stub(1, 1)), shapeSha256('local p = game:GetService("Players")\nreturn p'));
  assert.notEqual(shapeSha256('if a then b() end'), shapeSha256('while a do b() end'));
  // Comments are not program shape; a file re-licensed in its header is the same program.
  assert.equal(shapeSha256('-- Copyright 2021 Alice\nreturn 1'), shapeSha256('-- Copyright 2024 Bob\nreturn 1'));
  // But structure is. Deleting a statement must change the shape.
  assert.notEqual(shapeSha256('a() b()'), shapeSha256('a()'));
});

const haveRows = existsSync(ROWS);
test('every acquired row carries retrieved-licence evidence and is approved for nothing',
  { skip: !haveRows && 'acquisition has not been run' }, () => {
    const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(rows.length > 50, `the artifact holds ${rows.length} rows — this test would check almost nothing`);

    const contents = new Set();
    for (const r of rows) {
      assert.equal(r.rights.status, 'upstream_licence_text_verified', `${r.id}: rights status is not the verified tier`);
      assert.match(r.rights.licence_text_sha256, /^[0-9a-f]{64}$/, `${r.id}: no sha256 of a retrieved licence text`);
      assert.ok(r.rights.licence_text_url.includes(r.provenance.revision),
        `${r.id}: the licence evidence URL is not pinned to the revision the file came from`);
      assert.match(r.provenance.revision, /^[0-9a-f]{40}$/, `${r.id}: revision is not a full commit sha`);
      assert.ok(r.provenance.source_path && !r.provenance.source_path.startsWith('/'), `${r.id}: no repository-relative path`);
      assert.equal(isVendoredPath(r.provenance.source_path), false, `${r.id}: a vendored file entered the corpus`);
      assert.match(r.provenance.source_path, /\.(luau|lua)$/i, `${r.id}: a non-Luau file entered the corpus`);

      // Rights clearance is not approval, and this artifact must never be the thing that flips it.
      assert.equal(r.training_approved, false, `${r.id}: acquisition flipped training_approved`);
      assert.equal(r.semantic_quality_pass, null, `${r.id}: acquisition asserted a quality verdict it never measured`);
      assert.equal(r.production_training_ready, false, `${r.id}: acquisition flipped production_training_ready`);

      assert.ok(r.text.length > 0, `${r.id}: empty text`);
      // Marked, not dropped: the split must exist on every row so a reported total can be halved.
      assert.equal(typeof r.generated, 'boolean', `${r.id}: no machine-generated verdict`);
      assert.match(r.shape_sha256, /^[0-9a-f]{64}$/, `${r.id}: no shape hash`);
      assert.equal(r.generated, isGeneratedLuau(r.text), `${r.id}: the stored generated verdict disagrees with its own text`);
      assert.ok(!contents.has(r.normalized_sha256), `${r.id}: duplicate content survived dedupe`);
      contents.add(r.normalized_sha256);
    }
  });

test('a repository whose licence text contradicted its tag contributed no rows',
  { skip: !existsSync(REPOS) && 'acquisition has not been run' }, () => {
    const repos = readFileSync(REPOS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    assert.ok(repos.length > 0, 'no repository records — this test would check nothing');
    const byId = new Map(repos.map((r) => [r.source_id, r]));

    for (const r of repos) {
      if (r.status === 'rejected_licence_text_mismatch') {
        assert.equal(r.rows_written, 0, `${r.source_id}: rejected for a licence mismatch and still wrote rows`);
        assert.equal(r.evidence_tier, 'licence_text_mismatch');
      }
      if (r.status === 'acquired') {
        assert.equal(r.evidence_tier, 'licence_text', `${r.source_id}: acquired at a tier below retrieved text`);
        assert.equal(r.licence_text_corroborates_tag, true);
      }
    }

    if (!haveRows) return;
    // No row may exist for a repository that was rejected or never recorded. This is the join that
    // catches rows surviving a later rejection — the artifact is append-only and a stale row would
    // otherwise sit there licensed by a verdict that has since been withdrawn.
    const rows = readFileSync(ROWS, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
    for (const row of rows) {
      const rec = byId.get(row.provenance.source_id);
      assert.ok(rec, `${row.id}: row from ${row.provenance.source_id}, which has no repository record`);
      assert.equal(rec.status, 'acquired', `${row.id}: row from ${row.provenance.source_id}, whose status is "${rec.status}"`);
      assert.equal(row.rights.licence_text_sha256, rec.licence_text_sha256,
        `${row.id}: the row's licence evidence disagrees with its repository's`);
    }
  });
