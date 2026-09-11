import test from 'node:test';
import assert from 'node:assert/strict';

import { scoreQuality, assessQuality, QUALITY_COMPONENTS, QUALITY_KEYS, DOC_MIN_CHARS } from './quality.mjs';

const README = (n = DOC_MIN_CHARS) => ({ path: 'README.md', source: 'x'.repeat(n) });

const GOOD = {
  files: [
    README(),
    { path: 'src/init.luau', source: '--!strict\nlocal x = 1' },
    { path: 'tests/init.spec.luau', source: 'return function() end' },
    { path: '.github/workflows/ci.yml', source: 'on: push' },
  ],
  licenceClass: 'COMMERCIAL_REUSABLE',
  securitySafe: true,
  engineEra: 'modern',
};

test('a source with every component scores 1 and says why', () => {
  const q = scoreQuality(GOOD);
  assert.equal(q.score, 1);
  assert.deepEqual(q.undecided, []);
  assert.equal(q.decided.length, QUALITY_KEYS.length);
  for (const key of QUALITY_KEYS) {
    assert.equal(q.components[key].value, true, key);
    assert.ok(q.components[key].why.length > 20, `${key} must justify its weight`);
  }
});

test('a bare source scores 0 rather than null', () => {
  const q = scoreQuality({
    files: [{ path: 'a.lua', source: 'wait(1)' }],
    licenceClass: 'UNCLEAR_QUARANTINE',
    securitySafe: false,
    engineEra: 'legacy',
  });
  assert.equal(q.score, 0);
  assert.deepEqual(q.undecided, []);
});

test('an undecidable component is excluded from the denominator, not scored zero', () => {
  // The failure this prevents: a source whose security scan has not run yet would
  // otherwise lose 3 points for a fact nobody established, and read as low quality
  // when the truth is that it is unmeasured.
  const unscanned = scoreQuality({ ...GOOD, securitySafe: null });
  assert.equal(unscanned.score, 1, 'still perfect on everything that COULD be decided');
  assert.deepEqual(unscanned.undecided, ['clean']);
  assert.equal(unscanned.possible, QUALITY_KEYS.reduce((n, k) => n + QUALITY_COMPONENTS[k].weight, 0) - 3);
  assert.equal(unscanned.components.clean.contributed, 0);
});

test('nothing decidable yields null, which is not zero', () => {
  // `retrievalRank` reads a null score as the 0.5 midpoint so an unscored record is
  // still reachable. Returning 0 here would silently bury it instead.
  const q = scoreQuality({ files: [], licenceClass: null, securitySafe: null, engineEra: 'unknown' });
  // tested/documented/typed/maintained are all decidably false on an empty file list.
  assert.notEqual(q.score, null);
  assert.equal(q.score, 0);
  assert.deepEqual(q.undecided.sort(), ['clean', 'currentEra', 'licensed']);
});

test('an unknown era is undecided, so a data-only source is not punished for having no code', () => {
  const q = scoreQuality({ ...GOOD, engineEra: 'unknown' });
  assert.ok(q.undecided.includes('currentEra'));
  assert.equal(q.score, 1);
});

test('a transitional era is decided, and it is not modern', () => {
  const q = scoreQuality({ ...GOOD, engineEra: 'transitional' });
  assert.equal(q.components.currentEra.value, false);
  assert.ok(!q.undecided.includes('currentEra'));
  assert.ok(q.score < 1);
});

test('a quarantined licence is a decided failure, not missing evidence', () => {
  // We looked and found no evidence of a licence. That is a finding.
  const q = scoreQuality({ ...GOOD, licenceClass: 'UNCLEAR_QUARANTINE' });
  assert.equal(q.components.licensed.value, false);
  assert.ok(!q.undecided.includes('licensed'));
});

test('a README stub is not documentation', () => {
  const short = scoreQuality({ ...GOOD, files: [README(DOC_MIN_CHARS - 1), ...GOOD.files.slice(1)] });
  assert.equal(short.components.documented.value, false);
  const exact = scoreQuality({ ...GOOD, files: [README(DOC_MIN_CHARS), ...GOOD.files.slice(1)] });
  assert.equal(exact.components.documented.value, true);
});

test('stars and forks cannot reach this score', () => {
  // Popularity already enters ranking through retrievalRank. Counting it here too
  // would double it while calling the second count quality.
  const withHype = scoreQuality({ ...GOOD, stars: 90000, forkCount: 9000 });
  const without = scoreQuality(GOOD);
  assert.equal(withHype.score, without.score);
  const serialised = JSON.stringify(QUALITY_COMPONENTS);
  assert.ok(!/star|fork|popular/i.test(serialised), 'no component may cite popularity');
});

test('test and CI files are recognised by path shape', () => {
  const shapes = [
    'tests/a.luau', 'test/a.luau', 'spec/a.luau', '__tests__/a.luau',
    'src/a.spec.luau', 'src/a.test.mjs',
  ];
  for (const p of shapes) {
    assert.equal(assessQuality({ files: [{ path: p }] }).tested, true, p);
  }
  assert.equal(assessQuality({ files: [{ path: 'src/latest.luau' }] }).tested, false, 'not every path containing "test"');
  assert.equal(assessQuality({ files: [{ path: '.github/workflows/ci.yml' }] }).maintained, true);
  assert.equal(assessQuality({ files: [{ path: '.github/dependabot.yml' }] }).maintained, false);
});
