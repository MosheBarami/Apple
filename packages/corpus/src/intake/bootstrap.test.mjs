// The corpus must be reproducible from a fresh clone.
//
// `raw/` is gitignored and always will be: it holds ~49MB of third-party repositories
// whose redistribution rights we do not have. What a fresh clone MUST have is enough
// metadata to fetch them back at the exact commits every downstream verdict was
// computed against — the scan results, content hashes, quality scores and extracted
// rules all cite a checkout, and a checkout at a different commit is a different fact.
//
// These run against the REAL tracked files rather than fixtures, because the claim
// being tested is about this repository's actual contents: "someone who clones this
// can rebuild the corpus". A fixture would pass while the claim was false.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planBootstrap, planRegistries, loadClassOf, FETCHABLE_CLASSES } from '../bootstrap.mjs';

const CORPUS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOCK = path.join(CORPUS, 'raw', 'manifest.json');

const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : null;

test('the checkout lock is tracked, not gitignored with the content it describes', () => {
  // The .gitignore said the corpus was "re-fetchable from raw/manifest.json" while
  // ignoring raw/manifest.json. This is that claim, made checkable.
  assert.ok(lock, 'packages/corpus/raw/manifest.json is missing from the checkout');
  assert.ok(lock.sources && typeof lock.sources === 'object', 'the lock has no sources map');
  assert.ok(Object.keys(lock.sources).length > 0, 'the lock names no checkouts');
});

test('every locked checkout pins a url and a full commit SHA', () => {
  // A url alone reproduces "whatever HEAD is today", which is not reproduction.
  const bad = [];
  for (const [name, e] of Object.entries(lock.sources)) {
    if (typeof e.url !== 'string' || !/^https?:\/\//.test(e.url)) bad.push(`${name}: no url`);
    else if (!/^[0-9a-f]{40}$/.test(e.sha ?? '')) bad.push(`${name}: sha is ${JSON.stringify(e.sha)}`);
  }
  assert.deepEqual(bad, [], `entries that cannot be reproduced:\n  ${bad.join('\n  ')}`);
});

test('a fresh clone can restore every locked checkout', () => {
  // THE CLAIM. With nothing on disk, the plan must name a clone for every entry and
  // refuse none of them. A refusal here means the committed metadata describes a
  // checkout that a new contributor cannot obtain.
  const plan = planBootstrap(lock, loadClassOf(), new Map());
  assert.deepEqual(
    plan.refused.map((r) => `${r.name}: ${r.why}`), [],
    'checkouts a fresh clone could not restore',
  );
  assert.equal(plan.clone.length, Object.keys(lock.sources).length);
  assert.equal(plan.satisfied.length, 0);
});

test('every locked checkout is classified fetchable in the tracked ledger', () => {
  // Two tracked files have to agree before bootstrap moves a byte. This is the pair
  // that makes "we only read licence-clear sources" checkable rather than asserted.
  const classOf = loadClassOf();
  const bad = [];
  for (const [name, e] of Object.entries(lock.sources)) {
    const cls = classOf.get(String(e.url).replace(/\.git$/, ''));
    if (!FETCHABLE_CLASSES.has(cls)) bad.push(`${name}: ${cls ?? 'absent from sources.json'}`);
  }
  assert.deepEqual(bad, [], `locked checkouts the ledger does not clear:\n  ${bad.join('\n  ')}`);
});

// ---------------------------------------------------------------- refusals --
// Each of these is a way the bootstrap could quietly do the wrong thing.

const classOf = new Map([
  ['https://github.com/o/ok', 'COMMERCIAL_REUSABLE'],
  ['https://github.com/o/copyleft', 'COPYLEFT'],
  ['https://github.com/o/quarantined', 'UNCLEAR_QUARANTINE'],
]);
const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

test('an entry with no commit is refused rather than fetched at HEAD', () => {
  const plan = planBootstrap(
    { sources: { ok: { url: 'https://github.com/o/ok', sha: 'main' } } }, classOf);
  assert.equal(plan.clone.length, 0);
  assert.match(plan.refused[0].why, /commit SHA/);
});

test('an unclassified url is never fetched, however plausible it looks', () => {
  const plan = planBootstrap(
    { sources: { x: { url: 'https://github.com/someone/else', sha: SHA_A } } }, classOf);
  assert.equal(plan.clone.length, 0);
  assert.match(plan.refused[0].why, /licence classification/);
});

test('a quarantined source is refused even though it is in the ledger', () => {
  const plan = planBootstrap(
    { sources: { q: { url: 'https://github.com/o/quarantined', sha: SHA_A } } }, classOf);
  assert.equal(plan.clone.length, 0);
  assert.match(plan.refused[0].why, /UNCLEAR_QUARANTINE/);
});

test('copyleft is fetchable — reading it is not redistributing it', () => {
  const plan = planBootstrap(
    { sources: { c: { url: 'https://github.com/o/copyleft', sha: SHA_A } } }, classOf);
  assert.equal(plan.clone.length, 1);
});

test('a checkout at the wrong commit is moved, not re-cloned', () => {
  const plan = planBootstrap(
    { sources: { ok: { url: 'https://github.com/o/ok', sha: SHA_A } } },
    classOf, new Map([['ok', SHA_B]]));
  assert.equal(plan.clone.length, 0);
  assert.equal(plan.checkout.length, 1);
  assert.equal(plan.checkout[0].from, SHA_B);
});

test('a checkout already at the pinned commit is left alone', () => {
  const plan = planBootstrap(
    { sources: { ok: { url: 'https://github.com/o/ok', sha: SHA_A } } },
    classOf, new Map([['ok', SHA_A]]));
  assert.deepEqual([plan.clone.length, plan.checkout.length, plan.satisfied.length], [0, 0, 1]);
});

test('a .git suffix does not hide a source from its classification', () => {
  const plan = planBootstrap(
    { sources: { ok: { url: 'https://github.com/o/ok.git', sha: SHA_A } } }, classOf);
  assert.equal(plan.clone.length, 1, 'the .git suffix must be normalised before the lookup');
});

// --- the lock is data, and data can be hostile ---------------------------------
// `raw/manifest.json` is tracked and generated, which makes it exactly the kind of
// file a reviewer skims. Both of these were reachable before 2026-09-01.

test('a checkout name that escapes raw/ is refused', () => {
  const plan = planBootstrap(
    { sources: { '../../../../tmp/pwn': { url: 'https://github.com/o/ok', sha: SHA_A } } }, classOf);
  assert.equal(plan.clone.length, 0);
  assert.match(plan.refused[0].why, /plain directory name/);
});

test('a checkout name with a path separator is refused', () => {
  for (const bad of ['a/b', 'a\\b', '..', '.', 'a b']) {
    const plan = planBootstrap({ sources: { [bad]: { url: 'https://github.com/o/ok', sha: SHA_A } } }, classOf);
    assert.equal(plan.clone.length, 0, `${bad} should not be cloneable`);
  }
});

test('a non-https url is refused, including git transports that execute', () => {
  // `ext::` runs its argument as a command during fetch. Cloning one would falsify
  // this module's own claim that it executes nothing it downloads.
  const hostile = new Map([['ext::sh -c whoami', 'COMMERCIAL_REUSABLE'], ['http://github.com/o/ok', 'COMMERCIAL_REUSABLE']]);
  for (const url of ['ext::sh -c whoami', 'http://github.com/o/ok']) {
    const plan = planBootstrap({ sources: { ok: { url, sha: SHA_A } } }, hostile);
    assert.equal(plan.clone.length, 0, `${url} should not be cloneable`);
    assert.match(plan.refused[0].why, /not https/);
  }
});

test('the real tracked lock passes both checks', () => {
  // The guards must not have made the actual corpus unreproducible.
  const plan = planBootstrap(lock, loadClassOf(), new Map());
  assert.deepEqual(plan.refused, []);
  assert.equal(plan.clone.length, Object.keys(lock.sources).length);
});

// --- the package indexes ------------------------------------------------------
// `raw/_registries/` holds 43MB of Wally and Pesde indexes that enumerate.mjs reads.
// They were absent from the lock entirely, because recordAll walks the top level of
// raw/ and these sit one directory deeper — so "a fresh clone can reproduce the
// corpus" was true of 38 checkouts and quietly false of the stage that discovers new
// ones. A fresh clone could re-fetch them at whatever HEAD happened to be, which is
// re-acquisition rather than reproduction.

test('the lock pins the package indexes as well as the sources', () => {
  const regs = lock.registries ?? {};
  assert.ok(Object.keys(regs).length > 0, 'the lock records no registries');
  for (const [name, e] of Object.entries(regs)) {
    assert.match(e.url ?? '', /^https:\/\//, `${name} has no https url`);
    assert.match(e.sha ?? '', /^[0-9a-f]{40}$/, `${name} has no pinned commit`);
  }
});

test('a fresh clone can restore every package index', () => {
  const plan = planRegistries(lock, new Map());
  assert.deepEqual(plan.refused, []);
  assert.equal(plan.clone.length, Object.keys(lock.registries ?? {}).length);
});

test('the registries are exempt from the LICENCE gate, and from nothing else', () => {
  // An index is names, urls and hashes — not code anything extracts from — and what
  // it yields is classified before its content is read. But the checks that stop a
  // manifest writing outside raw/ or handing git an executing transport still apply.
  const SHA = 'c'.repeat(40);
  assert.equal(planRegistries({ registries: { wally: { url: 'https://github.com/o/i', sha: SHA } } }).clone.length, 1,
    'no licence class is required');
  for (const [name, entry] of [
    ['../escape', { url: 'https://github.com/o/i', sha: SHA }],
    ['ok', { url: 'ext::sh -c whoami', sha: SHA }],
    ['ok', { url: 'http://github.com/o/i', sha: SHA }],
    ['ok', { url: 'https://github.com/o/i', sha: 'main' }],
  ]) {
    const plan = planRegistries({ registries: { [name]: entry } });
    assert.equal(plan.clone.length, 0, `${name} ${entry.url} ${entry.sha} should be refused`);
    assert.equal(plan.refused.length, 1);
  }
});

test('an index already at its pinned commit is left alone', () => {
  const SHA = 'd'.repeat(40);
  const plan = planRegistries({ registries: { wally: { url: 'https://github.com/o/i', sha: SHA } } },
    new Map([['wally', SHA]]));
  assert.deepEqual([plan.clone.length, plan.satisfied.length], [0, 1]);
});
