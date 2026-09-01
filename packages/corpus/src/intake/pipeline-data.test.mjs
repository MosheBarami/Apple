// Assertions about the DATA the pipeline has produced, not about its functions.
//
// The defect these guard against was invisible to every unit test in this package,
// because each stage's function was correct in isolation. `scan.mjs` wrote a verdict
// to `record.security`; `retrievalRank` reads `provenanceRecord.security`. Both were
// right about their own half and nothing joined them, so `retrievalRank` returned 0
// for all 170 provenance records and reported a number the whole time.
//
// A stage is not done when its function passes. It is done when the field the next
// stage reads is populated on disk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { retrievalRank } from './records.mjs';

const url = (p) => new URL(`../../data/${p}`, import.meta.url);
const load = (p) => JSON.parse(readFileSync(url(p), 'utf8'));
const HAVE_DATA = existsSync(url('sources.json')) && existsSync(url('content.json'));

test('a scanned source carries its verdict on the provenance record too', { skip: !HAVE_DATA }, () => {
  const sources = load('sources.json');
  const offenders = [];
  for (const rec of Object.values(sources.records)) {
    if (!rec.provenance || rec.security?.class === 'unscanned' || !rec.security) continue;
    if (rec.provenance.security?.safe !== rec.security.safe) {
      offenders.push(`${rec.id}: record says safe=${rec.security.safe}, provenance says ${rec.provenance.security?.safe}`);
    }
  }
  assert.deepEqual(offenders, [], `verdict written to only one of two places:\n  ${offenders.join('\n  ')}`);
});

test('every content record with a checkout is reachable by retrieval', { skip: !HAVE_DATA }, () => {
  // Rank 0 means "excluded from every use". If a licence-clear, security-clean
  // source ranks 0, that is a plumbing failure wearing a policy decision's clothes.
  const content = load('content.json');
  const sources = load('sources.json');
  const prov = Object.values(sources.records).map((r) => r.provenance).filter(Boolean);
  const dead = content.records.filter((r) => retrievalRank(r, prov) === 0);
  assert.deepEqual(
    dead.map((r) => r.observedIn[0]),
    [],
    'these content records rank 0 and so are retrievable by nothing',
  );
});

test('the domain and quality stages have actually run', { skip: !HAVE_DATA }, () => {
  // The fields existed from the day contentRecord() was written and stayed at their
  // defaults. "The field exists" and "the stage ran" are different facts.
  const content = load('content.json');
  const scored = content.records.filter((r) => typeof r.qualityScore === 'number');
  assert.equal(scored.length, content.records.length, 'every content record must carry a quality score');

  const tagged = content.records.filter((r) => r.engineEra !== 'unknown');
  assert.ok(tagged.length > 0, 'no record carries an era; the domain stage has not run');

  for (const r of content.records) {
    assert.ok(r.qualityScore >= 0 && r.qualityScore <= 1, `${r.observedIn[0]}: score out of range`);
    assert.ok(Array.isArray(r.libraries));
    assert.ok(Array.isArray(r.deprecatedPatterns));
  }
});

test('quality does not simply track popularity', { skip: !HAVE_DATA }, () => {
  // If it did, it would be double-counting the popularity term retrievalRank already
  // applies, while calling the second count quality.
  const content = load('content.json');
  const sources = load('sources.json');
  const byId = new Map(Object.values(sources.records).map((r) => [r.provenance?.id, r.provenance]).filter(([k]) => k));
  const pairs = content.records
    .map((r) => ({ q: r.qualityScore, stars: byId.get(r.observedIn[0])?.stars }))
    .filter((p) => typeof p.q === 'number' && typeof p.stars === 'number');
  assert.ok(pairs.length >= 10, 'need a real sample to say anything');

  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const q = pairs.map((p) => p.q);
  const s = pairs.map((p) => Math.log1p(p.stars));
  const mq = mean(q);
  const ms = mean(s);
  const cov = mean(pairs.map((_, i) => (q[i] - mq) * (s[i] - ms)));
  const sd = (xs, m) => Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
  const r = cov / (sd(q, mq) * sd(s, ms));
  assert.ok(Math.abs(r) < 0.8, `quality correlates with stars at r=${r.toFixed(3)}; it is acting as a popularity proxy`);
});
