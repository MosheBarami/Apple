/**
 * THE PANEL MUST NOT SAY "CLEAR TO PUBLISH" ON THE STRENGTH OF AN EMPTY LIST.
 *
 * The attribution ledger spent its whole life empty, because nothing wrote to it. An
 * empty ledger produces a clean report, so every project looked compliant. The producer
 * is fixed now — but the browser still cannot tell "no third-party asset was used" from
 * "the recording did not happen", and a panel that reads those as a clearance would
 * reintroduce exactly the reassurance that was wrong before.
 *
 * That is what the first test pins. The rest pin the ordering of the verdicts, because
 * a blocker hidden behind a credit count is the same failure in a smaller form.
 *
 * Run with:  node --test           (from apps/web)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WEB = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'credits-')), 'm.mjs');
execFileSync(
  join(WEB, '..', 'worker', 'node_modules', '.bin', 'esbuild'),
  [join(WEB, 'src/components/ws/credits-model.ts'), '--format=esm', `--outfile=${out}`],
  { stdio: 'pipe' },
);
const { readiness, READINESS_TONE, creditLine, creditsText } = await import(out);

const entry = (over = {}) => ({
  assetId: 'kenney/nature-kit/tree-pine-01',
  name: 'Tree Pine 01',
  author: 'Kenney',
  licence: 'CC0-1.0',
  licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  sourceUrl: 'https://kenney.nl/assets/nature-kit',
  modifications: [],
  ...over,
});

const res = (over = {}) => ({
  attribution: {
    projectId: 'p1',
    generatedAt: '2026-09-01T00:00:00.000Z',
    original: [],
    userGenerated: [],
    required: [],
    courtesy: [],
    sourceCredits: [],
    unaccounted: [],
    ...(over.attribution ?? {}),
  },
  commercialUse: {
    projectId: 'p1',
    ok: true,
    checked: 0,
    counts: {},
    findings: [],
    ...(over.commercialUse ?? {}),
  },
});

test('an empty ledger is "nothing recorded", never "clear to publish"', () => {
  const v = readiness(res());
  assert.equal(v.state, 'nothing_recorded');
  assert.doesNotMatch(v.title, /clear/i, 'the heading must not read as a clearance');
  assert.match(v.body, /not a clearance to publish/i, 'and it has to say so outright');
  assert.equal(READINESS_TONE[v.state], 'muted', 'an unknown is not drawn as a success');
});

test('an actually-empty-but-checked project is clear, and says how many it checked', () => {
  // The difference from the case above is `checked`, which is the only evidence the
  // browser gets that the ledger was ever written to.
  const v = readiness(res({ commercialUse: { checked: 3 } }));
  assert.equal(v.state, 'clear');
  assert.match(v.title, /3 assets checked/);
  assert.equal(READINESS_TONE.clear, 'good');
});

test('a blocker outranks any number of credits', () => {
  const v = readiness(
    res({
      attribution: { required: [entry(), entry(), entry()] },
      commercialUse: {
        checked: 4,
        ok: false,
        findings: [
          { assetId: 'x', name: 'X', code: 'non_commercial', severity: 'blocker', why: 'w', remediation: 'r' },
          { assetId: 'y', name: 'Y', code: 'attribution_required', severity: 'warning', why: 'w', remediation: 'r' },
        ],
      },
    }),
  );
  assert.equal(v.state, 'blocked', 'a blocker must not be hidden behind a credit count');
  assert.match(v.title, /1 asset cannot ship/);
  assert.equal(READINESS_TONE.blocked, 'bad');
});

test('warnings alone are obligations, not blockers, and say publishing is not blocked', () => {
  const v = readiness(
    res({
      attribution: { required: [entry({ licence: 'CC-BY-4.0' })] },
      commercialUse: {
        checked: 1,
        findings: [{ assetId: 'y', name: 'Y', code: 'attribution_required', severity: 'warning', why: 'w', remediation: 'r' }],
      },
    }),
  );
  assert.equal(v.state, 'obligations');
  assert.match(v.body, /Nothing here blocks publishing/);
  assert.equal(READINESS_TONE.obligations, 'warn');
});

test('a source credit counts as an obligation even with no licence-required entries', () => {
  // Poly Haven asks for a credit its licence does not require. Counting only `required`
  // would drop it, and it is still a credit that has to ship.
  const v = readiness(
    res({
      attribution: { sourceCredits: [{ text: 'Powered by Poly Haven', url: 'https://polyhaven.com', when: 'live_api', why: 'manifest §14' }] },
      commercialUse: { checked: 2 },
    }),
  );
  assert.equal(v.state, 'obligations');
  assert.match(v.title, /1 credit has to ship/);
});

test('a credit line says whether the asset was modified, rather than leaving it blank', () => {
  assert.equal(creditLine(entry()), 'Tree Pine 01 by Kenney — CC0-1.0 (as published)');
  assert.equal(
    creditLine(entry({ modifications: ['rescaled', 'retextured'] })),
    'Tree Pine 01 by Kenney — CC0-1.0 (modified: rescaled, retextured)',
  );
});

test('the pasteable block is empty when nothing is owed, not a heading with no entries', () => {
  assert.equal(creditsText(res().attribution), '');
  const withBoth = creditsText({
    ...res().attribution,
    required: [entry({ licence: 'CC-BY-4.0' })],
    sourceCredits: [{ text: 'Powered by Poly Haven', url: 'https://polyhaven.com', when: 'live_api', why: '' }],
  });
  assert.match(withBoth, /^Credits\n/);
  assert.match(withBoth, /Powered by Poly Haven — https:\/\/polyhaven\.com$/);
});
