// Tests for the rule the whole source-intelligence design exists to enforce.
//
// SOURCE-INTELLIGENCE.md §2: "100 identical forks must not count as 100
// independent examples." The headline test below is that sentence, executable —
// a hundred forks in, a hundred ProvenanceRecords and exactly one ContentRecord
// with weight 1 out. If that ever goes green-to-red, the corpus is lying about how
// much evidence it has.
//
// The rest pin the ways that rule is usually broken by accident: a caller passing
// weight, popularity leaking into weight instead of ranking, and a quarantined
// source being dropped instead of preserved.
//
// Run: node --test packages/corpus/src/intake/records.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';

import { contentHash } from './contenthash.mjs';
import {
  UNSCANNED_SECURITY,
  UNVERIFIED_LICENCE,
  collapse,
  contentRecord,
  provenanceId,
  provenanceRecord,
  retrievalRank,
} from './records.mjs';

const MIT = {
  class: 'COMMERCIAL_REUSABLE',
  reuse: 'allowed',
  training: 'allowed',
  spdx: 'MIT',
  evidence: 'license-file',
  evidencePath: 'LICENSE',
  reason: 'MIT LICENSE file at the repository root.',
};
const SAFE = { safe: true, class: null, signals: [], reason: 'No exploit or loader signals found.' };

const SOURCE = {
  'README.md': '# Shop\n',
  'src/Shop.luau': 'local Shop = {}\nreturn Shop\n',
};

const UPSTREAM_ID = `github.com/owner0/shop@${'sha0'.padEnd(40, '0')}`;

const fork = (n, over = {}) =>
  provenanceRecord({
    host: 'github.com',
    owner: `owner${n}`,
    repo: 'shop',
    ref: 'main',
    sha: `sha${n}`.padEnd(40, '0'),
    discoveredAt: '2026-08-31',
    isFork: n > 0,
    upstream: n > 0 ? UPSTREAM_ID : null,
    licence: MIT,
    security: SAFE,
    contentHash: contentHash(SOURCE, { repo: 'shop' }),
    ...over,
  });

test('100 identical forks collapse to one ContentRecord with weight 1', () => {
  const forks = Array.from({ length: 100 }, (_, n) => fork(n));
  const { content, provenance } = collapse(forks);

  assert.equal(provenance.length, 100, 'every fork survives as provenance');
  assert.equal(content.length, 1, 'one distinct content');
  assert.equal(content[0].weight, 1, 'a hundred forks are one piece of evidence');
  assert.equal(content[0].observedIn.length, 100, 'and all hundred locations are recorded');
  assert.deepEqual(new Set(content[0].observedIn), new Set(forks.map((f) => f.id)));
});

test('a divergent fork is a second ContentRecord, still weight 1 each', () => {
  const divergent = contentHash({ ...SOURCE, 'src/Extra.luau': 'return {}\n' }, { repo: 'shop' });
  const forks = [...Array.from({ length: 9 }, (_, n) => fork(n)), fork(9, { contentHash: divergent })];
  const { content, provenance } = collapse(forks);

  assert.equal(provenance.length, 10);
  assert.equal(content.length, 2);
  assert.deepEqual(content.map((c) => c.weight), [1, 1]);
  assert.deepEqual(content.map((c) => c.observedIn.length).sort(), [1, 9]);
});

test('collapse output is stable no matter what order discovery visited the forks in', () => {
  const forks = Array.from({ length: 5 }, (_, n) => fork(n));
  const a = collapse(forks).content.map((c) => c.contentHash);
  const b = collapse([...forks].reverse()).content.map((c) => c.contentHash);
  assert.deepEqual(a, b);
});

test('re-discovering the same location does not inflate observedIn', () => {
  const one = fork(0);
  const { content, provenance } = collapse([one, one, one]);
  assert.equal(provenance.length, 3, 'provenance keeps every input, unconditionally');
  assert.equal(content[0].observedIn.length, 1, 'but one location is one location');
  assert.equal(content[0].weight, 1);
});

test('a source with no content hash keeps its provenance record', () => {
  // §1 hashes after the security gate, so a quarantined source has no hash yet; §4
  // requires it to stay auditable rather than disappear.
  const quarantined = fork(0, {
    contentHash: null,
    licence: UNVERIFIED_LICENCE,
    security: { safe: false, class: 'executor', signals: [], reason: 'loadstring payload fetcher' },
  });
  const { content, provenance } = collapse([quarantined]);
  assert.equal(provenance.length, 1);
  assert.equal(content.length, 0);
});

test('weight cannot be set by a caller', () => {
  const record = contentRecord({ contentHash: 'abc', observedIn: ['x'], weight: 100 });
  assert.equal(record.weight, 1);

  const forks = Array.from({ length: 3 }, (_, n) => fork(n));
  const hash = forks[0].contentHash;
  assert.equal(collapse(forks, { [hash]: { weight: 42 } }).content[0].weight, 1);
});

test('details flow into the ContentRecord but cannot rewrite the collapse', () => {
  const forks = [fork(0), fork(1)];
  const hash = forks[0].contentHash;
  const { content } = collapse(forks, {
    [hash]: {
      libraries: ['roblox-ui-components'],
      engineEra: 'legacy',
      deprecatedPatterns: ['hand-set UI properties'],
      qualityScore: 0.7,
      contentHash: 'lies',
      observedIn: ['lies'],
    },
  });
  assert.equal(content[0].contentHash, hash);
  assert.deepEqual(content[0].observedIn, [forks[0].id, forks[1].id]);
  assert.deepEqual(content[0].libraries, ['roblox-ui-components']);
  assert.equal(content[0].engineEra, 'legacy');
  assert.equal(content[0].qualityScore, 0.7);
});

test('provenance ids are stable and commit-pinned', () => {
  assert.equal(
    provenanceId({ host: 'github.com', owner: 'roblox', repo: 'creator-docs', sha: 'abc123' }),
    'github.com/roblox/creator-docs@abc123',
  );
  assert.throws(() => provenanceId({ host: 'github.com', owner: 'x', repo: 'y' }), /needs a sha/);
});

test('an unclassified record defaults to quarantined and unscanned, never to usable', () => {
  const record = provenanceRecord({ host: 'github.com', owner: 'x', repo: 'y', sha: 'z' });
  assert.equal(record.licence.class, 'UNCLEAR_QUARANTINE');
  assert.equal(record.licence.training, 'forbidden');
  assert.deepEqual(record.security, UNSCANNED_SECURITY);
  assert.equal(record.contentHash, null);
});

test('popularity moves the retrieval rank and never the weight', () => {
  const popular = [fork(0, { stars: 4000, forkCount: 900 })];
  const obscure = [fork(1, { stars: 2, forkCount: 0 })];
  const rankOf = (records) => {
    const { content, provenance } = collapse(records);
    return { rank: retrievalRank(content[0], provenance), weight: content[0].weight };
  };

  const hot = rankOf(popular);
  const cold = rankOf(obscure);
  assert.ok(hot.rank > cold.rank, 'a widespread pattern ranks higher');
  assert.equal(hot.weight, 1);
  assert.equal(cold.weight, 1);
  // Log-damped: 2000x the stars must not buy anything like 2000x the rank.
  assert.ok(hot.rank < cold.rank * 10, `popularity is damped (${hot.rank} vs ${cold.rank})`);
});

test('a hundred identical forks rank above one, without weighing more than one', () => {
  const many = collapse(Array.from({ length: 100 }, (_, n) => fork(n)));
  const one = collapse([fork(0)]);
  assert.ok(retrievalRank(many.content[0], many.provenance) > retrievalRank(one.content[0], one.provenance));
  assert.equal(many.content[0].weight, one.content[0].weight);
});

test('excluded and quarantined sources do not rank at all', () => {
  const unsafe = collapse([
    fork(0, { security: { safe: false, class: 'executor', signals: [], reason: 'script hub' } }),
  ]);
  assert.equal(retrievalRank(unsafe.content[0], unsafe.provenance), 0);

  const unclear = collapse([fork(1, { licence: UNVERIFIED_LICENCE })]);
  assert.equal(retrievalRank(unclear.content[0], unclear.provenance), 0);

  // But reference-only is retrievable: §3 keeps it readable and citable.
  const reference = collapse([
    fork(2, { licence: { ...MIT, class: 'REFERENCE_ONLY', reuse: 'forbidden', training: 'forbidden' } }),
  ]);
  assert.ok(retrievalRank(reference.content[0], reference.provenance) > 0);
});

test('content observed only in unknown locations ranks zero rather than guessing', () => {
  assert.equal(retrievalRank(contentRecord({ contentHash: 'h', observedIn: ['nowhere'] }), []), 0);
});
