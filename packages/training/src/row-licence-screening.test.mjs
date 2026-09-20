// Per-row licence evidence outranks the repository tag, and a tag must never be promoted to one.
//
// WHY THIS EXISTS. The acquisition queue read each dataset's repository licence tag and called
// 2,069,435 rows acquirable. The largest single entry, `Pinkstack/luau-pretrain-corpus-unfiltered`
// at 845,351 rows, is tagged `odc-by` — and ships a per-row `license_type` column whose measured
// distribution is 808,084 `no_license` against 37,267 `permissive`. The tag was covering a corpus
// that is 95.6% unlicensed, and the 37,267 that are licensed are the same rows v1 already holds.
//
// A screening that drifted back toward trusting the tag would restore a six-figure overcount with
// nothing visibly broken. These assertions are what make that drift loud.
//
// WHAT THIS PROVES, STATED NARROWLY: that no dataset contributes permissive rows without naming
// the column those rows were counted from; that an unrecognised licence value is never counted as
// permission; that the measured buckets account for every row; that overlapping subsets are
// collapsed rather than summed; and that the two artifacts agree on the population they describe.
// It proves nothing about whether a scraper's licence detection was correct.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyColumns, splitFrequencies } from './screen-row-licences.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const screening = JSON.parse(readFileSync(join(ROOT, 'runs/row-licence-screening.json'), 'utf8'));
const clearance = JSON.parse(readFileSync(join(ROOT, 'runs/rights-clearance.json'), 'utf8'));

test('permissive rows are only ever counted from a named licence column', () => {
  for (const d of screening.datasets) {
    if (d.rows_permissive == null) continue;
    assert.equal(d.tier, 'per_row_licence', `${d.id}: counted permissive rows at tier "${d.tier}"`);
    assert.ok(d.licence_column_used, `${d.id}: counted permissive rows without naming the column`);
    assert.ok(
      d.licence_columns.includes(String(d.licence_column_used).toLowerCase()),
      `${d.id}: counted from "${d.licence_column_used}", which is not one of its licence columns`,
    );
  }
});

test('a dataset with no per-row licence contributes no permissive rows', () => {
  for (const d of screening.datasets) {
    if (d.tier === 'per_row_licence') continue;
    assert.equal(d.rows_permissive, null, `${d.id}: tier "${d.tier}" produced a permissive row count`);
    assert.equal(d.rows_not_permissive, null, `${d.id}: tier "${d.tier}" produced a rejected row count`);
    assert.ok(d.note, `${d.id}: unscreened for licence and no note saying so`);
  }
  // A dataset that traces rows to a source file still has no licence for them. The two tiers must
  // stay distinct, or "we know where it came from" starts reading as "we may use it".
  const sourceOnly = screening.datasets.filter((d) => d.tier === 'per_row_source_only');
  for (const d of sourceOnly) {
    assert.ok(d.provenance_columns.length > 0, `${d.id}: at tier per_row_source_only with no provenance column`);
    assert.equal(d.licence_columns.length, 0, `${d.id}: has a licence column but was filed as source-only`);
  }
});

test('measured buckets account for every row in the dataset', () => {
  const measured = screening.datasets.filter((d) => d.rows_permissive != null);
  assert.ok(measured.length > 0, 'nothing was measured per row; this guard is vacuous');
  for (const d of measured) {
    assert.equal(
      d.rows_permissive + d.rows_not_permissive,
      d.rows_total,
      `${d.id}: ${d.rows_permissive} + ${d.rows_not_permissive} does not account for ${d.rows_total} rows`,
    );
  }
});

test('the finding that forced this file survives: the unfiltered corpus is mostly unlicensed', () => {
  const d = screening.datasets.find((x) => x.id === 'Pinkstack/luau-pretrain-corpus-unfiltered');
  assert.ok(d, 'the dataset this screening was built to catch has left the artifact');
  assert.equal(d.tier, 'per_row_licence');
  assert.ok(
    d.rows_not_permissive > d.rows_permissive,
    'the unfiltered corpus is no longer recorded as majority-unlicensed; if upstream really changed, re-aim this at the new measurement rather than deleting it',
  );
  assert.equal(d.repository_tag, 'odc-by', 'the repository tag this case is about has changed');
});

test('overlapping permissive subsets are collapsed, not summed', () => {
  const s = screening.summary;
  assert.ok(
    s.rows_permissive_distinct_after_collapsing_overlap <= s.rows_permissive_by_per_row_evidence,
    'collapsing an overlap increased the row count',
  );
  // The specific overlap this exists for: the filtered corpus is the unfiltered one's permissive
  // subset, so summing the two reports 74,534 permissive rows where 37,267 exist.
  const filtered = screening.datasets.find((x) => x.id === 'Pinkstack/luau-pretrain-corpus-filtered');
  const unfiltered = screening.datasets.find((x) => x.id === 'Pinkstack/luau-pretrain-corpus-unfiltered');
  if (filtered && unfiltered && filtered.rows_permissive === unfiltered.rows_permissive) {
    assert.ok(
      s.rows_permissive_distinct_after_collapsing_overlap < s.rows_permissive_by_per_row_evidence,
      'two datasets report the same permissive subset and the summary still added them together',
    );
  }
});

test('the summary is a recount of the datasets, not a claim', () => {
  const s = screening.summary;
  const ds = screening.datasets;
  const tier = (t) => ds.filter((d) => d.tier === t).length;
  assert.equal(s.datasets_screened, ds.filter((d) => d.screened).length);
  assert.equal(s.datasets_not_screened, ds.filter((d) => !d.screened).length);
  assert.equal(s.per_row_licence, tier('per_row_licence'));
  assert.equal(s.per_row_source_only, tier('per_row_source_only'));
  assert.equal(s.no_provenance, tier('no_provenance'));
  assert.equal(
    s.rows_claimed_by_repository_tag,
    ds.reduce((a, d) => a + d.rows_claimed_by_queue, 0),
  );
  assert.equal(
    s.rows_resting_on_repository_tag_alone,
    ds.filter((d) => d.rows_permissive == null).reduce((a, d) => a + d.rows_claimed_by_queue, 0),
  );
  assert.equal(
    s.rows_claimed_by_repository_tag,
    s.rows_resting_on_repository_tag_alone + ds.filter((d) => d.rows_permissive != null).reduce((a, d) => a + d.rows_claimed_by_queue, 0),
    'rows went missing between the screened and unscreened halves',
  );
});

test('the screening and the clearance register describe the same population', () => {
  const queueAcquirable = clearance.acquisition_queue.items.filter((i) => i.acquirable && i.rows > 0);
  assert.equal(
    screening.summary.rows_claimed_by_repository_tag,
    queueAcquirable.reduce((a, i) => a + i.rows, 0),
    'the screening covers a different row population than the queue it was built from',
  );
  assert.equal(screening.datasets.length, queueAcquirable.length, 'a queued dataset was never screened');
  const screened = new Set(screening.datasets.map((d) => d.id));
  for (const i of queueAcquirable) assert.ok(screened.has(i.id), `${i.id}: acquirable but never screened`);
});

test('an unrecognised licence value is never counted as permission', () => {
  assert.deepEqual(splitFrequencies({ permissive: 10, no_license: 90 }), {
    permissive: 10,
    not_permissive: 90,
    values_not_counted_as_permissive: { no_license: 90 },
  });
  // The whole failure mode in one assertion: "no_license" is a scraper reporting that it looked
  // and found nothing, which is the opposite of a grant.
  assert.equal(splitFrequencies({ no_license: 5 }).permissive, 0, '"no_license" was counted as permission');
  assert.equal(splitFrequencies({ 'gpl-3.0': 5 }).permissive, 0, 'copyleft was counted as permissive');
  assert.equal(splitFrequencies({ 'some-licence-nobody-read': 5 }).permissive, 0, 'an unknown value was counted as permission');
  assert.equal(splitFrequencies({ MIT: 5 }).permissive, 5, 'the value match must not depend on case');
  assert.equal(splitFrequencies({}).permissive, 0);
  assert.equal(splitFrequencies(undefined).permissive, 0);
});

test('a licence column outranks a provenance column when both are present', () => {
  assert.equal(classifyColumns(['content', 'license_type', 'repo']).tier, 'per_row_licence');
  assert.equal(classifyColumns(['content', 'repo', 'file_path']).tier, 'per_row_source_only');
  assert.equal(classifyColumns(['instruction', 'input', 'output']).tier, 'no_provenance');
  // A column merely containing the word must not qualify: "license_url" is a link, not a licence.
  assert.equal(classifyColumns(['content', 'license_url']).tier, 'no_provenance');
});

test('the artifact keeps saying what it does not know', () => {
  const text = screening.limits.join(' ');
  assert.match(text, /is not thereby clean/, 'the artifact stopped saying that an unscreened dataset is merely unscreened');
  assert.match(text, /not a licence audit/, 'the artifact stopped saying a scraper detection is not an audit');
});
