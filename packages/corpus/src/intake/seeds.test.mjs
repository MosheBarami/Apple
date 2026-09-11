// Tests for the seed manifest and the kind-capability policy.
//
// The rule under test is §H, which is the one place in the intake chain where a
// plausible-looking source can talk its way into permission it never had:
//
//     "'Open source' in a forum title is not a license."
//
// So the assertions that matter are the DEMOTIONS. A test suite that only proves
// good input is accepted cannot tell a working cap from an absent one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  KIND_POLICY, SEED_KINDS, SEED_CATEGORIES,
  parseGitHubUrl, validateSeed, loadSeeds, seedRecord, capKind,
} from './seeds.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MANIFEST = join(HERE, '..', '..', 'seeds', 'manifest.json');

const ok = { id: 'gh-x-y', url: 'https://github.com/x/y', category: 'ui-framework', kind: 'repo' };

// ------------------------------------------------------------------ url parsing
test('parseGitHubUrl extracts owner and repo, and rejects non-repo urls', () => {
  assert.deepEqual(parseGitHubUrl('https://github.com/dphfox/Fusion'), { owner: 'dphfox', repo: 'Fusion' });
  assert.deepEqual(parseGitHubUrl('https://github.com/a/b.git'), { owner: 'a', repo: 'b' });
  assert.equal(parseGitHubUrl('https://devforum.roblox.com/t/thing/123'), null);
  assert.equal(parseGitHubUrl('https://github.com/onlyowner'), null);
  assert.equal(parseGitHubUrl(null), null);
});

// ------------------------------------------------------------------ validation
test('validateSeed throws rather than skipping a malformed entry', () => {
  // Silently dropping a seed is the failure mode this guards: it would look
  // considered and never have been looked at.
  for (const field of ['id', 'url', 'category', 'kind']) {
    const bad = { ...ok, [field]: '' };
    assert.throws(() => validateSeed(bad), new RegExp(field));
  }
  assert.throws(() => validateSeed({ ...ok, kind: 'blog' }), /unknown kind/);
  assert.throws(() => validateSeed({ ...ok, category: 'vibes' }), /unknown category/);
});

test('a "repo" seed whose url is not a GitHub repo is rejected', () => {
  assert.throws(
    () => validateSeed({ ...ok, url: 'https://devforum.roblox.com/t/x/1' }),
    /not a GitHub repo/,
  );
});

test('loadSeeds refuses duplicate ids instead of merging them', () => {
  assert.throws(() => loadSeeds({ entries: [ok, { ...ok }] }), /duplicate id/);
});

// ------------------------------------------------------------------ initial state
test('a fresh seed record refuses on every field that could be mistaken for a verdict', () => {
  const r = seedRecord(ok);
  assert.equal(r.resolved, false);
  assert.equal(r.licence.class, 'UNCLEAR_QUARANTINE');
  assert.equal(r.licence.reuse, 'forbidden');
  assert.equal(r.licence.training, 'forbidden');
  assert.equal(r.security.safe, false);
  assert.equal(r.security.class, 'unscanned');
  assert.equal(r.provenance, null);
});

// ------------------------------------------------------------------ §H, the cap
const PERMISSIVE = {
  class: 'COMMERCIAL_REUSABLE', reuse: 'allowed', training: 'allowed',
  spdx: 'MIT', evidence: 'prose', evidencePath: null, reason: 'README says MIT.',
};

test('a DevForum thread claiming MIT is capped to REFERENCE_ONLY, with the reason kept', () => {
  const capped = capKind(PERMISSIVE, 'devforum');
  assert.equal(capped.class, 'REFERENCE_ONLY');
  assert.equal(capped.reuse, 'forbidden');
  assert.equal(capped.training, 'forbidden');
  assert.equal(capped.cappedFrom, 'COMMERCIAL_REUSABLE');
  assert.match(capped.reason, /README says MIT/, 'the original finding must survive the demotion');
  assert.match(capped.reason, /not a licence/);
});

test('the same verdict on a repo is untouched — the cap is about the KIND, not the words', () => {
  assert.deepEqual(capKind(PERMISSIVE, 'repo'), PERMISSIVE);
});

test('a Hugging Face card cannot self-promote either', () => {
  // A dataset card's licence field says nothing about the licences of what was
  // scraped into the dataset.
  assert.equal(capKind(PERMISSIVE, 'huggingface').class, 'REFERENCE_ONLY');
});

test('the cap never PROMOTES a refusal', () => {
  for (const cls of ['UNSAFE_EXCLUDED', 'UNCLEAR_QUARANTINE']) {
    const refused = { ...PERMISSIVE, class: cls, reuse: 'forbidden', training: 'forbidden' };
    assert.equal(capKind(refused, 'devforum').class, cls, `${cls} must survive the cap`);
    assert.equal(capKind(refused, 'repo').class, cls);
  }
});

test('every kind in the policy is internally consistent', () => {
  for (const kind of SEED_KINDS) {
    const p = KIND_POLICY[kind];
    assert.equal(typeof p.canProveLicence, 'boolean');
    assert.equal(typeof p.strategy, 'string');
    assert.ok(p.note && p.note.length > 10, `${kind} needs a note explaining the policy`);
    // A kind that cannot prove a licence must not be able to content-hash either:
    // both require actually holding the bytes.
    if (!p.canProveLicence && p.canContentHash) {
      assert.fail(`${kind} claims it can content-hash but cannot prove a licence`);
    }
  }
});

// ------------------------------------------------------------------ the real file
test('the shipped seed manifest is well-formed and is a floor, not a ceiling', () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const loaded = loadSeeds(manifest);
  assert.ok(loaded.count >= 200, `expected the full appendix, got ${loaded.count}`);
  assert.equal(loaded.count, manifest.count, 'the declared count must match the entries');
  // Only repos can prove a licence, so the ratio is the honest ceiling on how much
  // of this manifest can ever become reusable rather than reference.
  assert.ok(loaded.byKind.repo > 100, 'the appendix is mostly GitHub repos');
  assert.ok(loaded.byKind.devforum > 0, 'and it carries DevForum threads that cannot self-prove');
  for (const cat of Object.keys(loaded.byCategory)) {
    assert.ok(SEED_CATEGORIES.includes(cat), `category ${cat} is not in the closed list`);
  }
});
