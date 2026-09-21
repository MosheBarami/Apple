// "923 irrelevant, licence-clean but off-topic" was a judgement about repositories nobody opened.
//
// WHY THIS EXISTS. `isRobloxRelevant` decides on two fields: `primary_language` and the owner/name
// string. `docs/github-corpus-licences.md` then reported the 923 it rejected as "irrelevant". A
// repository written mostly in TypeScript and named for its product can hold a thousand Luau files
// and be filed under that word without a byte being counted — the same shape as the 5.45 GB that
// stood in for Luau volume until the trees were read.
//
// WHAT THIS PROVES, STATED NARROWLY: that the widening reads the two fields the relevance filter
// never reads and does not quietly re-implement the filter; that the artifact's headline totals are
// the sum of the rows beneath them rather than numbers typed next to them; and that the 884
// repositories which were NOT opened are never described as empty.
//
// It proves nothing about whether those 884 hold Luau. Nobody has looked, and the artifact says so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { namesRobloxOutsideTheFilter } from './probe-offtopic-leads.mjs';
import { isRobloxRelevant } from './read-github-trees.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ARTIFACT = join(ROOT, 'runs/offtopic-leads-probed.json');

test('the widening reads topics and description — the two fields the relevance filter never reads', () => {
  // Rejected by isRobloxRelevant (language Rust, name says nothing), caught by the widening.
  const tooling = { source_id: 'Kiet1308/Tovek', primary_language: 'Rust', topics: [], description: 'a Roblox script runner' };
  assert.equal(isRobloxRelevant(tooling), false, 'the relevance filter already caught this; the widening would be pointless');
  assert.equal(namesRobloxOutsideTheFilter(tooling), true, 'a description naming Roblox did not widen the sweep');

  const byTopic = { source_id: 'KhanPython/RoAdmin', primary_language: 'JavaScript', topics: ['admin-panel', 'roblox'], description: '' };
  assert.equal(isRobloxRelevant(byTopic), false);
  assert.equal(namesRobloxOutsideTheFilter(byTopic), true, 'a roblox topic did not widen the sweep');

  assert.equal(namesRobloxOutsideTheFilter({ topics: ['rojo'], description: '' }), true);
  assert.equal(namesRobloxOutsideTheFilter({ topics: [], description: 'ships a wally manifest' }), false,
    'the description clause must not fire on wally alone — that is the topics clause, and the two are not the same field');

  // And it must not fire on a repository that names Roblox nowhere. If it did, the 884 would all
  // become candidates and the measurement would be of the sweep, not of the filter's blind spot.
  for (const dull of [
    { source_id: 'sindresorhus/awesome', primary_language: 'Markdown', topics: ['awesome', 'lists'], description: 'Awesome lists about all kinds of interesting topics' },
    { source_id: 'public-apis/public-apis', primary_language: 'Python', topics: ['api'], description: 'A collective list of free APIs' },
  ]) {
    assert.equal(namesRobloxOutsideTheFilter(dull), false, `${dull.source_id} was pulled into the probe`);
  }
  // Missing fields are absence of evidence, not a match.
  assert.equal(namesRobloxOutsideTheFilter({}), false);
});

test('the artifact totals are the sum of its rows, and the unopened are never called empty',
  { skip: !existsSync(ARTIFACT) && 'the off-topic probe has not been run' }, () => {
    const a = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
    const ok = a.probed.filter((p) => p.tree_status === 'ok');

    assert.equal(a.of_those_naming_roblox_in_topics_or_description, a.probed.length,
      'the artifact claims to have probed a different number of repositories than it holds rows for');
    assert.equal(a.trees_read, ok.length);
    assert.equal(a.tree_read_failures, a.probed.length - ok.length);
    assert.equal(a.luau_lua_files_found, ok.reduce((n, p) => n + (p.luau_lua_file_count || 0), 0),
      'the headline file count is not the sum of the per-repository counts');
    assert.equal(a.luau_lua_bytes_found, ok.reduce((n, p) => n + (p.luau_lua_bytes || 0), 0),
      'the headline byte count is not the sum of the per-repository counts');
    assert.equal(a.repositories_holding_any_luau, ok.filter((p) => p.luau_lua_file_count > 0).length);

    // The arithmetic that makes the finding a finding: candidates are a SUBSET of the off-topic set.
    assert.ok(a.of_those_naming_roblox_in_topics_or_description < a.off_topic_by_the_relevance_filter,
      'every off-topic repository became a candidate, so this measures the sweep and not the filter');
    assert.ok(a.off_topic_by_the_relevance_filter < a.admit_candidates);

    // The repositories nobody opened must be recorded as unopened, not as holding nothing.
    const unopened = a.off_topic_by_the_relevance_filter - a.of_those_naming_roblox_in_topics_or_description;
    assert.ok(unopened > 0);
    assert.ok(a.what_this_does_not_establish.some((s) => /not opened|unopened/i.test(s)),
      `${unopened} repositories were never opened and the artifact does not say so`);

    for (const p of ok) {
      assert.ok(p.luau_lua_file_count >= 0);
      assert.ok(Array.isArray(p.matched_on) && p.matched_on.length > 0,
        `${p.source_id} is in the probe without recording which field matched`);
    }
  });
