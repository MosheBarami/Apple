// Tests for the §3 licence classifier in src/intake/licence.mjs.
//
// The classifier's job is to be *conservative in a checkable way*, so the tests
// are written around the two ways it could fail expensively:
//
//   1. Granting rights nobody gave it. A README saying "open source" is the
//      canonical version of this, and §3 names it, so it gets a test of its own
//      and asserts on `evidence: 'none'` rather than only on the class — a
//      verdict that quarantined for the wrong reason is a verdict that will
//      stop quarantining the day the reason changes.
//   2. Mirroring `training` off `reuse`. CC-BY is the case that separates them
//      (reuse allowed, training not), so that pair is asserted explicitly, and
//      a whole-table invariant backs it up.
//
// Pure functions, no I/O, no network. Run:
//     node --test packages/corpus/src/intake/licence.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { classify, attributionText, detectLicences, normaliseSpdx, CLASS_BY_SPDX, LICENCE_CLASSES } from './licence.mjs';

// ---------------------------------------------------------------------------
// Fixtures. Abbreviated licence texts, but every phrase the detectors key on is
// verbatim from the real thing — including the cross-references the GPL family
// makes to each other, which are the only reason the detectors need care.
// ---------------------------------------------------------------------------

const MIT = `MIT License

Copyright (c) 2024 Some Developer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software.`;

const APACHE = `                                 Apache License
                           Version 2.0, January 2004
                        http://www.apache.org/licenses/

   TERMS AND CONDITIONS FOR USE, REPRODUCTION, AND DISTRIBUTION

   1. Definitions.`;

const CC_BY = `Attribution 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm.

Section 3 -- License Conditions.

  a. Attribution.`;

const CC_BY_SA = `Attribution-ShareAlike 4.0 International

=======================================================================

Creative Commons Corporation ("Creative Commons") is not a law firm.`;

const AGPL = `                    GNU AFFERO GENERAL PUBLIC LICENSE
                       Version 3, 19 November 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>

  13. Remote Network Interaction; Use with the GNU General Public License.

  Notwithstanding any other provision of this License, you have permission to
link or combine any covered work with a work licensed under version 3 of the
GNU General Public License into a single combined work.`;

const GPL3 = `                    GNU GENERAL PUBLIC LICENSE
                       Version 3, 29 June 2007

 Copyright (C) 2007 Free Software Foundation, Inc. <https://fsf.org/>

  13. Use with the GNU Affero General Public License.

  Notwithstanding any other provision of this License, you have permission to
link or combine any covered work with a work licensed under version 3 of the
GNU Affero General Public License into a single combined work.`;

const MPL = `Mozilla Public License Version 2.0
==================================

1. Definitions`;

const PROV = {
  id: 'github.com/somedev/shop-ui@0123456789abcdef0123456789abcdef01234567',
  host: 'github.com',
  owner: 'somedev',
  repo: 'shop-ui',
  ref: 'main',
  sha: '0123456789abcdef0123456789abcdef01234567',
  url: 'https://github.com/somedev/shop-ui',
};

// ---------------------------------------------------------------------------
// The seven cases the classifier exists for.
// ---------------------------------------------------------------------------

test('an MIT licence file grants reuse and, being permissive with proven evidence, training', () => {
  const v = classify({ licenseFileText: MIT });
  assert.equal(v.class, 'COMMERCIAL_REUSABLE');
  assert.equal(v.reuse, 'allowed');
  assert.equal(v.training, 'allowed');
  assert.equal(v.spdx, 'MIT');
  assert.equal(v.evidence, 'license-file');
  assert.equal(v.evidencePath, 'LICENSE');
});

test('an Apache-2.0 SPDX header with no licence file is still evidence, recorded as such', () => {
  const v = classify({ spdxId: 'Apache-2.0', spdxPath: 'src/init.luau' });
  assert.equal(v.class, 'COMMERCIAL_REUSABLE');
  assert.equal(v.reuse, 'allowed');
  assert.equal(v.training, 'allowed');
  assert.equal(v.spdx, 'Apache-2.0');
  assert.equal(v.evidence, 'spdx-header');
  assert.equal(v.evidencePath, 'src/init.luau');
});

test('CC-BY-4.0 allows reuse with attribution but NOT training — the two verdicts are independent', () => {
  const v = classify({ licenseFileText: CC_BY });
  assert.equal(v.class, 'ATTRIBUTION_REQUIRED');
  assert.equal(v.reuse, 'allowed-with-attribution');
  // The whole point of the field pair: reuse is permitted and training is not.
  assert.equal(v.training, 'forbidden');
  assert.equal(v.spdx, 'CC-BY-4.0');
  assert.match(v.reason, /credit/i);
});

test('AGPL-3.0 forbids reuse but is reference material, not an unsafe source', () => {
  const v = classify({ licenseFileText: AGPL });
  assert.equal(v.class, 'COPYLEFT');
  assert.equal(v.reuse, 'forbidden');
  assert.equal(v.training, 'forbidden');
  assert.equal(v.spdx, 'AGPL-3.0');
  // §3 is explicit that copyleft is legitimate reference material. A verdict
  // that reads as a security judgement would get it excluded from retrieval too.
  assert.notEqual(v.class, 'UNSAFE_EXCLUDED');
  assert.match(v.reason, /legitimate reference material, not unsafe/i);
});

test('a README claiming "open source" with no LICENSE is NOT a licence: quarantine, evidence none', () => {
  const v = classify({
    readmeText: 'This project is open source! Free to use in your own games — feel free to use this however you like.',
    repoDescription: 'An open-source Roblox shop UI',
  });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.reuse, 'forbidden');
  assert.equal(v.training, 'forbidden');
  assert.equal(v.spdx, null);
  // Asserted by name: a claim of openness must produce NO evidence at all, not
  // weak evidence. This is the single easiest mistake in the module.
  assert.equal(v.evidence, 'none');
  assert.equal(v.evidencePath, null);
  assert.match(v.reason, /absence of evidence is not permission/i);
  assert.match(v.reason, /claims openness/i);
});

test('an empty repository quarantines — the default is quarantine, not permissive', () => {
  const v = classify({});
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.reuse, 'forbidden');
  assert.equal(v.training, 'forbidden');
  assert.equal(v.spdx, null);
  assert.equal(v.evidence, 'none');
  // classify() with no argument at all must behave identically.
  assert.deepEqual(classify(), v);
});

test('a licence file carrying two licences quarantines rather than picking one', () => {
  const v = classify({ licenseFileText: `${MIT}\n\n-----\n\n${APACHE}`, licenseFilePath: 'LICENSE.md' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.spdx, null);
  // Evidence WAS found — a file exists and was read. It is the split between
  // the two licences that no machine can settle, and the reason must say so.
  assert.equal(v.evidence, 'license-file');
  assert.equal(v.evidencePath, 'LICENSE.md');
  assert.match(v.reason, /MIT/);
  assert.match(v.reason, /Apache-2\.0/);
});

// ---------------------------------------------------------------------------
// Detector separation. Each of these pairs shares most of its text with the
// other, and a collision would silently quarantine a good source.
// ---------------------------------------------------------------------------

test('AGPL-3.0 and GPL-3.0 are told apart despite each citing the other by name', () => {
  assert.deepEqual(detectLicences(AGPL), ['AGPL-3.0']);
  assert.deepEqual(detectLicences(GPL3), ['GPL-3.0']);
});

test('CC-BY-SA is copyleft, not attribution-required', () => {
  assert.deepEqual(detectLicences(CC_BY_SA), ['CC-BY-SA-4.0']);
  const v = classify({ licenseFileText: CC_BY_SA });
  assert.equal(v.class, 'COPYLEFT');
  assert.equal(v.reuse, 'forbidden');
});

test('MPL-2.0 is copyleft — its file-level source obligation would follow the user home', () => {
  const v = classify({ licenseFileText: MPL });
  assert.equal(v.spdx, 'MPL-2.0');
  assert.equal(v.class, 'COPYLEFT');
  assert.equal(v.training, 'forbidden');
});

// ---------------------------------------------------------------------------
// Prose evidence: the boundary between "names a licence" and "sounds open".
// ---------------------------------------------------------------------------

test('prose that names a licence with granting language is explicit terms', () => {
  const v = classify({ readmeText: 'Shop UI for Roblox. Licensed under the MIT License.' });
  assert.equal(v.class, 'COMMERCIAL_REUSABLE');
  assert.equal(v.evidence, 'explicit-terms');
  assert.equal(v.spdx, 'MIT');
});

test('prose that mentions a licence without granting under it is not evidence', () => {
  // "MIT" appears, but nothing grants anything — this is a badge, not a licence.
  const v = classify({ readmeText: 'Inspired by an MIT-licensed project I found. This one is free to use.' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.evidence, 'none');
});

test('a forum claim is recorded for the reviewer and counted as nothing', () => {
  const v = classify({ forumClaim: '[Open Source] Free shop UI system — use it in any game!' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.evidence, 'none');
  assert.equal(v.training, 'forbidden');
  assert.match(v.reason, /forum post claims/i);
  assert.match(v.reason, /not a grant/i);
});

// ---------------------------------------------------------------------------
// Disagreement and unknowns.
// ---------------------------------------------------------------------------

test('an SPDX id disagreeing with the licence file quarantines instead of choosing', () => {
  const v = classify({ licenseFileText: MIT, spdxId: 'GPL-3.0' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.evidence, 'license-file');
  assert.match(v.reason, /MIT/);
  assert.match(v.reason, /GPL-3\.0/);
});

test('an unrecognised SPDX id is not a grant', () => {
  const v = classify({ spdxId: 'EPL-2.0' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.evidence, 'spdx-header');
  assert.match(v.reason, /EPL-2\.0/);
});

test('a licence file we cannot read quarantines and names the host guess for the reviewer', () => {
  const v = classify({ licenseFileText: 'All rights reserved. Ask before using.', spdxId: 'MIT' });
  assert.equal(v.class, 'UNCLEAR_QUARANTINE');
  assert.equal(v.evidence, 'license-file');
  assert.match(v.reason, /MIT/);
});

test('SPDX ids normalise across the -only / -or-later spellings', () => {
  assert.deepEqual(normaliseSpdx('gpl-3.0-or-later'), { id: 'GPL-3.0', known: true });
  assert.deepEqual(normaliseSpdx('AGPL-3.0-only'), { id: 'AGPL-3.0', known: true });
  assert.deepEqual(normaliseSpdx('mit'), { id: 'MIT', known: true });
  assert.equal(normaliseSpdx(''), null);
  assert.equal(normaliseSpdx(null), null);
});

// ---------------------------------------------------------------------------
// The training invariant, asserted over the whole table rather than case by
// case — this is the assertion that survives someone adding a licence later.
// ---------------------------------------------------------------------------

test('training is allowed only for permissive classes, never mirrored off reuse', () => {
  for (const [spdx, cls] of Object.entries(CLASS_BY_SPDX)) {
    assert.ok(LICENCE_CLASSES.includes(cls), `${spdx} maps to an unknown class ${cls}`);
    const v = classify({ spdxId: spdx });
    assert.equal(v.class, cls, `${spdx} classified as ${v.class}`);
    if (v.training === 'allowed') {
      assert.equal(v.class, 'COMMERCIAL_REUSABLE', `${spdx} granted training from class ${v.class}`);
      assert.notEqual(v.evidence, 'none', `${spdx} granted training with no evidence`);
    }
  }
});

test('no quarantined or copyleft verdict ever grants reuse or training', () => {
  const quarantined = [classify({}), classify({ readmeText: 'open source!' }), classify({ spdxId: 'EPL-2.0' })];
  for (const v of [...quarantined, classify({ licenseFileText: GPL3 }), classify({ licenseFileText: AGPL })]) {
    assert.equal(v.reuse, 'forbidden');
    assert.equal(v.training, 'forbidden');
  }
});

// ---------------------------------------------------------------------------
// attributionText
// ---------------------------------------------------------------------------

test('attributionText renders the credit an ATTRIBUTION_REQUIRED source needs, pinned to a commit', () => {
  const v = classify({ licenseFileText: CC_BY });
  const line = attributionText(v, PROV);
  assert.match(line, /"somedev\/shop-ui"/);
  assert.match(line, /by somedev/);
  assert.match(line, /CC-BY-4\.0/);
  assert.match(line, /https:\/\/github\.com\/somedev\/shop-ui/);
  // The revision matters: CC-BY's modification notice is only meaningful if a
  // reader can tell which revision the credit refers to.
  assert.match(line, /at 0123456789ab/);
});

test('attributionText returns null for classes whose obligation is not a credit line', () => {
  assert.equal(attributionText(classify({ licenseFileText: MIT }), PROV), null);
  assert.equal(attributionText(classify({ licenseFileText: GPL3 }), PROV), null);
  assert.equal(attributionText(classify({}), PROV), null);
  assert.equal(attributionText(null, PROV), null);
});

test('attributionText degrades honestly when the provenance record is thin', () => {
  const line = attributionText(classify({ licenseFileText: CC_BY }), { id: 'unknown-host/mystery@abc' });
  assert.match(line, /unknown-host\/mystery@abc/);
  assert.match(line, /source URL unrecorded/);
});

test('§3 prose: a grant and a licence name in DIFFERENT sentences is not evidence', () => {
  // Each of these was demonstrated to produce COMMERCIAL_REUSABLE + training=allowed
  // before the prose tier was sentence-scoped. The third is the worst: the README
  // states the OPPOSITE of a grant.
  const cases = [
    'This repository is a dump of a popular game.\n\nAssets are distributed under the original creator terms.\n\nSee the MIT-licensed rewrite for a cleaner take.',
    'All rights reserved.\n\nThis game bundles a vendored copy of Promise, which is released under MIT.',
    'This code is NOT available under any open licence.\n\nIt was inspired by an MIT project.',
  ];
  for (const readmeText of cases) {
    const v = classify({ readmeText });
    assert.equal(v.class, 'UNCLEAR_QUARANTINE', `granted on split-sentence prose: ${readmeText.slice(0, 40)}`);
    assert.equal(v.training, 'forbidden');
    assert.equal(v.reuse, 'forbidden');
  }
});

test('§3 prose: a real single-sentence grant is still accepted for reuse, never for training', () => {
  const v = classify({ readmeText: 'This project is licensed under the MIT License.' });
  assert.equal(v.class, 'COMMERCIAL_REUSABLE');
  assert.equal(v.reuse, 'allowed');
  // Prose can clear reuse. It can never license model weights — only a licence
  // file or an SPDX id can do that.
  assert.equal(v.training, 'forbidden', 'prose alone must not grant training rights');
});
