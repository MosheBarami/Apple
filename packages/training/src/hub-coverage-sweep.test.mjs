// A search that returned nothing is not a finding until the search is known to work.
//
// WHY THIS EXISTS. This sweep's headline is a NEGATIVE: twenty additional Roblox terms surfaced
// zero new Roblox datasets, therefore the Hub is covered. A negative result is exactly the shape
// that a broken instrument also produces. An expired token, a renamed endpoint, a typo in the URL,
// a rate limit — every one of them returns "0 new datasets" and none of them means the Hub is
// covered. `docs/FAILURES.md` has this pattern under its own number; this file is the guard.
//
// So the artifact must carry proof the instrument was alive: terms that actually reached the API,
// terms that actually returned rows, and a baseline that is not empty. If a future run has every
// search fail, these assertions go red rather than quietly reporting complete coverage.
//
// WHAT THIS PROVES, STATED NARROWLY: that the sweep's own numbers are internally consistent, that
// a failed search is never counted as an empty one, and that the relevance classifier still
// rejects the specific false positives that a wider net catches. It proves nothing about datasets
// whose metadata never mentions Roblox — the artifact's own limits say so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { looksRoblox, TERMS_NEW, TERMS_ALREADY_SWEPT } from './sweep-hub-coverage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sweep = JSON.parse(readFileSync(join(ROOT, 'runs/hub-coverage-sweep.json'), 'utf8'));

test('the instrument is proved alive before its silence is believed', () => {
  const s = sweep.summary;
  assert.equal(s.terms_failed, 0, `${s.terms_failed} searches failed; a failed search is not an empty one`);
  assert.equal(s.terms_searched, s.terms_tried, 'not every term reached the API, so coverage is unproven');
  assert.ok(sweep.baseline_ids > 0, 'the baseline of known ids is empty, so "new" means nothing');
  // At least one term must have returned rows. If every search came back empty, the most likely
  // explanation is a broken client, not a Hub with no Roblox data on it.
  const productive = sweep.per_term.filter((t) => t.searched && t.returned > 0);
  assert.ok(
    productive.length > 0,
    'every search returned zero rows; that is a broken search client, not evidence of coverage',
  );
});

test('a term that failed to search is never counted as a term that found nothing', () => {
  for (const t of sweep.per_term) {
    if (t.searched) {
      assert.equal(typeof t.returned, 'number', `${t.term}: searched but no result count`);
      assert.equal(typeof t.new_relevant, 'number', `${t.term}: searched but no relevance count`);
    } else {
      assert.ok(t.why_not, `${t.term}: not searched and no reason recorded`);
      assert.equal(t.returned, null, `${t.term}: not searched but carries a result count`);
      assert.equal(t.new_relevant, null, `${t.term}: not searched but carries a relevance count`);
    }
  }
});

test('the summary is a recount of the per-term rows', () => {
  const s = sweep.summary;
  assert.equal(s.terms_tried, sweep.per_term.length);
  assert.equal(s.terms_tried, TERMS_NEW.length);
  assert.equal(s.terms_searched, sweep.per_term.filter((t) => t.searched).length);
  assert.equal(s.terms_failed, sweep.per_term.filter((t) => !t.searched).length);
  assert.equal(s.new_and_roblox, sweep.new_and_roblox.length);
  assert.equal(s.new_ids_total, s.new_and_roblox + s.new_and_not_roblox);
  // The per-term relevance counts are per term and may double-count an id found by two terms, so
  // the distinct total can only ever be smaller.
  const perTermRelevant = sweep.per_term.reduce((a, t) => a + (t.new_relevant ?? 0), 0);
  assert.ok(s.new_and_roblox <= perTermRelevant, 'more distinct Roblox hits than per-term hits');
});

test('every dataset called Roblox material names what made it Roblox material', () => {
  for (const r of sweep.new_and_roblox) {
    assert.ok(Array.isArray(r.matched_on) && r.matched_on.length > 0, `${r.id}: called Roblox material with no matched keyword`);
    assert.ok(r.matched_query, `${r.id}: no record of which query found it`);
  }
});

test('the terms tried are actually new, and the old ones are recorded', () => {
  assert.ok(TERMS_ALREADY_SWEPT.length > 0, 'no baseline terms recorded, so "new terms" is meaningless');
  const old = new Set(TERMS_ALREADY_SWEPT.map((t) => t.toLowerCase()));
  for (const t of TERMS_NEW) {
    assert.equal(old.has(t.toLowerCase()), false, `"${t}" was already swept and is being counted as new coverage`);
  }
});

test('the classifier rejects what a wider net drags in', () => {
  // These are real hits from this sweep. "datastore" is an engine feature AND a generic ML term;
  // "rojo" is Spanish for red.
  assert.equal(looksRoblox({ id: 'OpenSciLM/OpenScholar-DataStore-V3', author: 'OpenSciLM', tags: [] }).relevant, false);
  assert.equal(looksRoblox({ id: 'DataStore/orca-whirlpool-historical-data', author: 'DataStore', tags: [] }).relevant, false);
  assert.equal(looksRoblox({ id: 'paulagb/hackathon-dataset_rojo4', author: 'paulagb', tags: [] }).relevant, false);
  assert.equal(looksRoblox({ id: 'wentingzhao/knn-prompt-datastore', author: 'wentingzhao', tags: [] }).relevant, false);

  // And still accepts real material, including when only the tags say so.
  assert.equal(looksRoblox({ id: 'Roblox/luau_corpus', author: 'Roblox', tags: ['code'] }).relevant, true);
  assert.equal(looksRoblox({ id: 'someone/mystery-corpus', author: 'someone', tags: ['luau', 'code'] }).relevant, true);
  assert.equal(looksRoblox({ id: 'someone/x', author: 'someone', tags: ['roblox'] }).relevant, true);
  assert.deepEqual(looksRoblox({ id: 'a/b', author: 'a', tags: [] }).matched_on, []);
  // Missing fields must not throw; a repo with no tags is common.
  assert.equal(looksRoblox({ id: 'a/b' }).relevant, false);
});

test('the artifact keeps saying what it does not know', () => {
  const text = sweep.limits.join(' ');
  assert.match(text, /reach of Hugging Face SEARCH, not the contents of the Hub/i,
    'the artifact stopped distinguishing search reach from Hub contents');
  assert.match(text, /first 100 results/, 'the artifact stopped disclosing the per-term result cap');
});
