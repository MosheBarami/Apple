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
import { mkdtempSync, readFileSync } from 'node:fs';
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
const { readiness, READINESS_TONE, creditLine, copyableCredits } = await import(out);

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
  assert.match(v.title, /3 recorded assets/);
  assert.match(v.title, /nothing owed on them/, 'a claim about the LEDGER, not about the place');
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

test('the panel pastes the WORKER\'s credits document, not one it built itself', () => {
  // The first version of this panel reassembled the block client-side. That is the
  // duplication that put the tool table in three places — and here it is worse than a
  // stale label: renderAttribution prints a loud INCOMPLETE section for assets with no
  // provenance, and a copy that forgot it hands someone a credits file that quietly
  // claims to be complete.
  const panel = readFileSync(join(WEB, 'src/components/ws/credits-panel.tsx'), 'utf8');
  assert.match(panel, /writeText\(copyable\)/, 'the clipboard must carry the server document');
  assert.match(panel, /copyableCredits\(res\)/, 'via the tested decision, not an inline dereference');
  assert.doesNotMatch(panel, /creditsText/, 'and there must be no client-side re-derivation left');

  // And the section is gated on the ENTRIES, because the rendered document always
  // carries a "Credits" header and is therefore never empty.
  assert.match(panel, /a\.required\.length > 0 \|\| a\.sourceCredits\.length > 0/);
});

test('a worker that did not send the credits document costs the button, not the panel', () => {
  // The browser and the worker deploy separately. A worker one version behind returns
  // no `credits` field; the panel reached for it and took the whole workspace down with
  // a TypeError, which is a bad trade for a copy button. Everything else still renders,
  // and the copy is simply not offered — you cannot hand over a document you do not have.
  const owed = { attribution: { required: [entry({ licence: 'CC-BY-4.0' })] }, commercialUse: { checked: 1 } };

  const withDoc = { ...res(owed), credits: 'Credits\n=======\n  - x' };
  assert.equal(copyableCredits(withDoc), 'Credits\n=======\n  - x');

  const missing = res(owed);
  delete missing.credits;
  assert.equal(copyableCredits(missing), null, 'absent field must not throw');
  assert.equal(copyableCredits({ ...res(owed), credits: '   ' }), null, 'nor must a blank one be offered');
});

test('nothing owed means nothing to copy, even though the document is never empty', () => {
  // renderAttribution always writes a "Credits" header, so a non-empty string is not
  // evidence that anything is owed.
  assert.equal(copyableCredits({ ...res({ commercialUse: { checked: 3 } }), credits: 'Credits\n=======' }), null);
});

test('an asset Golem could not account for is not an asset it ruled against', () => {
  // THE ONE THAT MATTERED. The worker grades `missing_provenance` as a blocker, which
  // is right for its own export gate — you cannot certify what you cannot account for.
  // Rendering that as red "N assets cannot ship commercially" is a determination nobody
  // made, and while the curated library does not exist (BLOCKERS §4b) EVERY asset Golem
  // inserts lands unaccounted. So every user with a placed asset was being told their
  // game was not shippable, on evidence that says only that a licence was never read.
  const v = readiness(
    res({
      commercialUse: {
        checked: 2,
        ok: false,
        findings: [
          { assetId: 'unaccounted:roblox:1', name: 'Roblox asset 1', code: 'missing_provenance', severity: 'blocker', why: 'w', remediation: 'r' },
        ],
      },
    }),
  );
  assert.equal(v.state, 'unaccounted');
  assert.doesNotMatch(v.title, /cannot ship/i, 'an unknown must not be worded as a verdict');
  assert.match(v.body, /not a finding that they cannot be used/i);
  assert.match(v.body, /nothing here\s+clears them either/i, 'and it must not read as permission either');
  assert.equal(READINESS_TONE.unaccounted, 'warn', 'amber: red would state the answer');
});

test('a real determination still outranks an unknown', () => {
  // The split must not soften an asset whose licence WAS read and found incompatible.
  const v = readiness(
    res({
      commercialUse: {
        checked: 3,
        ok: false,
        findings: [
          { assetId: 'a', name: 'A', code: 'missing_provenance', severity: 'blocker', why: 'w', remediation: 'r' },
          { assetId: 'b', name: 'B', code: 'non_commercial', severity: 'blocker', why: 'w', remediation: 'r' },
        ],
      },
    }),
  );
  assert.equal(v.state, 'blocked');
  assert.match(v.title, /1 asset cannot ship/, 'and counts only the determined one');
});
