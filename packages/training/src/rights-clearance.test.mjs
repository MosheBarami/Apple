// A rights verdict may never outrun the evidence it names.
//
// WHY THIS EXISTS. `release/sources.json` carried a `declared_license` per source — "mit",
// "odc-by", "apache-2.0", and `null` twice — and that field read like a finding. It was not one.
// It was a metadata tag copied off a dataset card, and a tag is the uploader's assertion about a
// compilation they assembled, not a grant covering each underlying file. The release manifest knew
// this and said so in its own limits: "Publisher and per-row detected licences have not all
// received independent rights clearance." Nothing enforced the distinction, so nothing stopped a
// later session reading `declared_license: "mit"` as clearance and flipping `training_approved`.
//
// WHAT THIS PROVES, STATED NARROWLY: that every `cleared` verdict in runs/rights-clearance.json
// names a licence FILE that was actually retrieved at a PINNED revision, that a card tag can never
// produce a `cleared`, that the policy fails CLOSED on a licence nobody has reviewed, and that the
// summary counts are a recount rather than a claim. It proves nothing about whether the publisher
// held the rights they granted — no test can — and nothing about dataset quality.
//
// WHAT IT IS NOT. It is not a licence opinion and not legal advice. It checks that the artifact's
// own stated standard of evidence was met by the artifact's own contents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { spdxFromText, licenceFromCard, policyVerdict, buildAcquisitionQueue } from './clear-rights.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const report = JSON.parse(readFileSync(join(ROOT, 'runs/rights-clearance.json'), 'utf8'));

const PINNED = /^[0-9a-f]{40}$/;

test('a `cleared` verdict names a licence file retrieved at a pinned revision', () => {
  const cleared = report.admitted_sources.filter((s) => s.verdict === 'cleared');
  assert.ok(cleared.length > 0, 'the artifact must contain at least one cleared source, or it is measuring nothing');
  for (const s of cleared) {
    assert.equal(s.evidence_tier, 'licence_text', `${s.source_id}: cleared on "${s.evidence_tier}" evidence`);
    assert.match(s.licence_text_sha256 ?? '', /^[0-9a-f]{64}$/, `${s.source_id}: no hash of the licence text it was cleared on`);
    assert.ok(s.licence_text_bytes > 0, `${s.source_id}: cleared on an empty licence text`);
    assert.match(s.revision ?? '', PINNED, `${s.source_id}: cleared at a moving ref, so the evidence describes no fixed bytes`);
    assert.ok(s.evidence_url && s.evidence_url.includes(s.revision), `${s.source_id}: evidence URL does not pin the revision it claims`);
    assert.ok(policyVerdict(s.license_spdx).allowed, `${s.source_id}: cleared under a licence the policy does not permit`);
  }
});

test('a dataset-card tag can never produce a clearance', () => {
  for (const s of report.admitted_sources) {
    if (s.evidence_tier !== 'publisher_declaration') continue;
    assert.equal(
      s.verdict,
      'publisher_declaration_only',
      `${s.source_id}: a card tag was promoted to "${s.verdict}"`,
    );
  }
  // And the tier must actually still be in use: if every source somehow became licence_text,
  // this guard would pass vacuously and stop defending anything.
  const tiers = new Set(report.admitted_sources.map((s) => s.evidence_tier));
  assert.ok(tiers.has('publisher_declaration'), 'no source is on card-tag evidence; this guard has gone vacuous');
});

test('the summary is a recount, not a claim', () => {
  const s = report.admitted_summary;
  const count = (v) => report.admitted_sources.filter((x) => x.verdict === v).length;
  assert.equal(s.total, report.admitted_sources.length);
  assert.equal(s.cleared, count('cleared'));
  assert.equal(s.publisher_declaration_only, count('publisher_declaration_only'));
  assert.equal(s.blocked, count('blocked'));
  assert.equal(s.unresolved, count('unresolved'));
  assert.equal(
    s.total,
    s.cleared + s.publisher_declaration_only + s.blocked + s.unresolved,
    'the verdict buckets do not account for every source',
  );
  const mismatches = report.admitted_sources.filter((x) => x.declared_vs_retrieved === 'mismatch').map((x) => x.source_id);
  assert.deepEqual(s.mismatches, mismatches, 'a declared/retrieved mismatch was dropped from the summary');
});

test('the licence policy fails closed on anything nobody reviewed', () => {
  assert.equal(policyVerdict(null).allowed, false, 'a missing licence was treated as permission');
  assert.equal(policyVerdict('').allowed, false);
  assert.equal(policyVerdict('some-license-nobody-has-read').allowed, false, 'an unreviewed licence was permitted');
  assert.equal(policyVerdict('not stated').allowed, false);
  // The product charges money, so a non-commercial clause is fatal rather than inconvenient.
  assert.equal(policyVerdict('cc-by-nc-4.0').allowed, false, 'a non-commercial licence was permitted for a paid product');
  assert.equal(policyVerdict('gpl-3.0').allowed, false, 'copyleft was permitted');
  assert.equal(policyVerdict('cc-by-sa-4.0').allowed, false, 'share-alike was permitted');
  assert.equal(policyVerdict('mit').allowed, true);
  assert.equal(policyVerdict('MIT').allowed, true, 'the policy must not depend on the case of the SPDX id');
  assert.equal(policyVerdict('cc-by-4.0').obligation, 'attribution required', 'CC-BY carries an obligation that must be recorded');
});

test('SPDX is read from licence text, and unrecognised text yields null rather than a guess', () => {
  assert.equal(spdxFromText('Attribution 4.0 International\n\nCreative Commons Corporation'), 'cc-by-4.0');
  assert.equal(spdxFromText('MIT License\n\nCopyright (c) 2019 Roblox Corporation'), 'mit');
  assert.equal(spdxFromText('Apache License\nVersion 2.0, January 2004'), 'apache-2.0');
  assert.equal(spdxFromText('a licence nobody has ever seen'), null, 'unrecognised licence text was given an SPDX id');
  assert.equal(spdxFromText(''), null);
  assert.equal(spdxFromText(undefined), null);
  // The NonCommercial and ShareAlike variants share CC-BY's opening line. Reading only that line
  // would clear an NC corpus into a paid product.
  assert.equal(
    spdxFromText('Attribution-NonCommercial 4.0 International\nCreative Commons Corporation'),
    'cc-by-nc-4.0',
    'a NonCommercial Creative Commons licence was read as plain CC-BY',
  );
  assert.equal(
    spdxFromText('Attribution-ShareAlike 4.0 International\nCreative Commons Corporation'),
    'cc-by-sa-4.0',
    'a ShareAlike Creative Commons licence was read as plain CC-BY',
  );
});

test('a card licence is read from front matter only', () => {
  assert.equal(licenceFromCard('---\nlicense: mit\ntags:\n- luau\n---\n# Card'), 'mit');
  assert.equal(licenceFromCard('---\ntags:\n- luau\n---\nThis repository is released under the MIT License.'), null,
    'prose in the card body was read as a front-matter declaration');
  assert.equal(licenceFromCard('# No front matter here'), null);
});

test('an acquirable dataset is permitted, ungated, and not held out for evaluation', () => {
  const q = report.acquisition_queue;
  assert.ok(q.items.length > 0, 'the acquisition queue is empty; it is measuring nothing');
  for (const item of q.items) {
    if (!item.acquirable) continue;
    assert.equal(item.policy_bucket, 'permit', `${item.id}: acquirable under bucket "${item.policy_bucket}"`);
    assert.equal(item.gated, false, `${item.id}: acquirable while gated`);
    assert.equal(item.held_out_for_evaluation, false, `${item.id}: acquirable while held out for evaluation`);
    assert.equal(item.blocked_reason, null, `${item.id}: acquirable while carrying a blocking reason`);
  }
  for (const item of q.items) {
    if (item.acquirable) continue;
    assert.ok(item.blocked_reason, `${item.id}: not acquirable and no reason given`);
  }
});

test('queue totals are recomputed from the items and cannot exceed what was measured', () => {
  const { items, totals } = report.acquisition_queue;
  const sum = (f) => items.filter(f).reduce((a, b) => a + b.rows, 0);
  assert.equal(totals.datasets, items.length);
  assert.equal(totals.rows_measured, sum(() => true));
  assert.equal(totals.rows_acquirable, sum((i) => i.acquirable));
  assert.equal(totals.datasets_acquirable, items.filter((i) => i.acquirable).length);
  assert.ok(
    totals.rows_acquirable <= totals.rows_measured,
    'more rows are acquirable than were ever measured',
  );
  assert.ok(
    totals.rows_acquirable_after_collapsing_suspected_mirrors <= totals.rows_acquirable,
    'collapsing duplicate uploads increased the row count',
  );
  // Every measured row lands in exactly one disposition. A row that silently leaves the ledger is
  // how an unlicensed corpus becomes an "acquirable" one.
  const accounted =
    totals.rows_acquirable
    + totals.rows_blocked_licence
    + totals.rows_blocked_no_grant
    + sum((i) => !i.acquirable && i.policy_bucket === 'permit');
  assert.equal(accounted, totals.rows_measured, 'measured rows are unaccounted for between the buckets');
});

test('the queue is rebuilt from the registers rather than trusted', () => {
  // Recompute from the same inputs the generator used, if they are present. The discovery register
  // is untracked working-tree state from another lane, so its absence is not a failure.
  let register;
  try {
    register = readFileSync(join(ROOT, 'discovery/v2/hf-datasets.jsonl'), 'utf8')
      .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return; // nothing to cross-check against in this checkout
  }
  const measured = readFileSync(join(ROOT, 'runs/hf-luau-corpus-measured.jsonl'), 'utf8')
    .split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const rebuilt = buildAcquisitionQueue(register, measured);
  assert.deepEqual(
    rebuilt.totals,
    report.acquisition_queue.totals,
    'the committed queue totals do not reproduce from the registers they were built from',
  );
});

test('the artifact keeps saying what it does not know', () => {
  const text = report.limits.join(' ');
  assert.match(text, /4,269/, 'the unprobed GitHub repositories dropped out of the limits');
  assert.match(text, /gh auth/, 'the reason those repositories are unprobed dropped out of the limits');
  assert.match(
    text,
    /does not mean the publisher held the rights/,
    'the artifact stopped saying that a retrieved licence is not proof of title',
  );
});
