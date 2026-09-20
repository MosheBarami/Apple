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

import { isVendoredPath, licenceTextCorroborates, normalisedSha256 } from './acquire-github-luau.mjs';

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
