// A library that files every asset under a guessed genre answers every question, and wrongly.
//
// WHY THIS EXISTS. The ask — extract every kind of Roblox UI into the model's library so it almost
// never builds one from scratch — has now been answered with a count of GENRES (a count of the map)
// and with a count of UI-constructing rows (a measurement nothing could look up). The third way to
// get it wrong is the one this file guards: build a real index, then fill in the genre column by
// guessing, so that `byScreen` sums to 1,060 and every lookup returns something. The number would
// look better than the honest one and every value in it would be untrustworthy.
//
// Only about a tenth of Roblox UI source names the screen it builds. The rest is `init.luau` in a
// component folder. So `screen: null` is the common case and has to stay a first-class answer.
//
// WHAT THIS PROVES, STATED NARROWLY:
//
//   - word tokens are WORDS: `heatmap` does not answer `map`, and `ShopFrame` does answer `shop`;
//   - the screen vocabulary is derived from the reference library's own filenames, so a screen
//     added there is picked up and a vocabulary that came back empty is refused;
//   - a file naming no screen classifies to null, and a file naming TWO classifies to null as
//     well — two claims are not an answer;
//   - instance names are read from code and not from prose, because a comment mentioning the shop
//     is not a shop screen;
//   - the composition key is order-independent, so the same interface built in a different order
//     lands in the same bucket;
//   - the committed manifest's arithmetic adds up, its `usable` count is not louder than what was
//     measured, and nothing in it claims training approval.
//
// It proves nothing about whether any indexed asset is a GOOD interface.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  wordTokens,
  deriveScreenVocabulary,
  instanceNames,
  classifyScreen,
  compositionKey,
  syntaxReportApplies,
} from './build-ui-asset-library.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REPO = join(ROOT, '..', '..');
const SCREEN_DIR = join(REPO, 'packages/corpus/data/ui-references');
const MANIFEST = join(REPO, 'packages/corpus/data/ui-assets-github-v1.json');

const GUI = new Set(['Frame', 'TextLabel', 'ScreenGui', 'ScrollingFrame', 'UIListLayout']);
const SCREENS = [
  { id: 'screen-shop', terms: ['shop', 'shops'] },
  { id: 'screen-map', terms: ['map', 'maps'] },
  { id: 'screen-hud', terms: ['hud', 'huds'] },
];

test('tokens are words, so a substring cannot answer for a word', () => {
  assert.deepEqual(wordTokens('ShopFrame'), ['shop', 'frame']);
  assert.deepEqual(wordTokens('escape_menu'), ['escape', 'menu']);
  assert.deepEqual(wordTokens('UIListLayout'), ['ui', 'list', 'layout']);
  // The whole reason tokens exist rather than `path.includes(term)`.
  assert.equal(wordTokens('heatmapRenderer').includes('map'), false,
    'heatmap answered a query for map');
  assert.equal(wordTokens('src/Workshop/init').includes('shop'), false,
    'Workshop answered a query for shop');
});

test('the screen vocabulary comes from the reference library, not from this file', () => {
  const screens = deriveScreenVocabulary(SCREEN_DIR);
  assert.ok(screens.length >= 10, `expected the screen-*.json family, got ${screens.length}`);
  const ids = screens.map((s) => s.id);
  assert.ok(ids.includes('screen-shop') && ids.includes('screen-inventory'));
  // Singular and plural are mechanical, not a typed synonym list.
  assert.deepEqual(screens.find((s) => s.id === 'screen-rewards').terms.sort(), ['reward', 'rewards']);
  assert.deepEqual(screens.find((s) => s.id === 'screen-shop').terms.sort(), ['shop', 'shops']);
});

test('an empty vocabulary directory yields no screens, which the driver must refuse', () => {
  const d = mkdtempSync(join(tmpdir(), 'ui-vocab-'));
  try {
    // A directory of non-screen files must not silently become a vocabulary of zero terms that
    // classifies the whole corpus as unclassified and looks like a fact about the corpus.
    writeFileSync(join(d, 'tycoon.json'), '{}');
    assert.equal(deriveScreenVocabulary(d).length, 0);
  } finally { rmSync(d, { recursive: true, force: true }); }
});

test('instance names are read from code, and a comment naming the shop is not a shop', () => {
  const src = '-- this module deliberately does not build the shop\n'
    + 'local panel = Instance.new("Frame")\npanel.Name = "InventoryPanel"\nreturn panel\n';
  const names = instanceNames(src, GUI);
  assert.ok(names.includes('InventoryPanel'), 'the .Name literal was missed');
  assert.ok(names.includes('panel'), 'the variable receiving a GUI construction was missed');
  assert.equal(names.join(' ').toLowerCase().includes('shop'), false,
    'a comment mentioning the shop leaked into the names');
});

test('a variable holding a non-GUI instance is not an interface name', () => {
  const names = instanceNames('local part = Instance.new("Part")\nreturn part\n', GUI);
  assert.equal(names.includes('part'), false, 'a Part was treated as UI');
});

test('a file that names no screen classifies to null, not to a nearest guess', () => {
  const r = classifyScreen('src/components/init.luau', ['container', 'root'], SCREENS);
  assert.equal(r.screen, null);
  assert.equal(r.evidence, 'none');
});

test('a file naming TWO screens classifies to null — two claims are not an answer', () => {
  const r = classifyScreen('src/ui/shop/map.luau', [], SCREENS);
  assert.equal(r.screen, null);
  assert.equal(r.evidence, 'ambiguous');
});

test('the path and the instance name are distinguishable channels of evidence', () => {
  assert.deepEqual(classifyScreen('src/ui/shop.luau', [], SCREENS), { screen: 'screen-shop', evidence: 'source_path' });
  assert.deepEqual(classifyScreen('src/ui/init.luau', ['ShopFrame'], SCREENS), { screen: 'screen-shop', evidence: 'instance_name' });
});

test('a syntax report about a different corpus certifies nothing', () => {
  // The join is by row id. A report produced against a three-row fixture shares no row ids with
  // the real corpus, so every real asset comes back "not in the failure list" — which reads as
  // PASSING. A report that never looked at these rows would have certified all of them.
  const real = 'packages/training/data/roblox-github-v1';
  assert.equal(syntaxReportApplies({ corpus: real, rows_checked: 27671 }, real, 27671), true);
  assert.equal(syntaxReportApplies({ corpus: 'some/fixture', rows_checked: 3 }, real, 27671), false,
    'a report about another corpus was accepted');
  assert.equal(syntaxReportApplies({ corpus: real, rows_checked: 3 }, real, 27671), false,
    'a report that covered 3 of 27,671 rows was accepted as covering all of them');
  assert.equal(syntaxReportApplies(null, real, 27671), false);

  // THE CASE THAT PINS THE IDENTITY CHECK SEPARATELY. A falsification run deleted the
  // `report.corpus !== corpusRelPath` line and this test stayed GREEN, because every fixture that
  // named a different corpus ALSO had a different row count — the row count was doing all the
  // work. A sibling corpus of the same size would then have certified this one.
  assert.equal(syntaxReportApplies({ corpus: 'packages/training/data/roblox-github-v2', rows_checked: 27671 }, real, 27671), false,
    'a report about a DIFFERENT corpus of the same size was accepted');
});

test('the composition key does not depend on the order the classes were found in', () => {
  assert.equal(compositionKey(['UIListLayout', 'Frame', 'TextLabel']), compositionKey(['TextLabel', 'Frame', 'UIListLayout']));
  assert.equal(compositionKey(['Frame']), 'Frame');
  assert.equal(compositionKey([]), '', 'an empty construction must not silently key as something');
});

// ---------------------------------------------------------------------------------------------
// The committed manifest.
// ---------------------------------------------------------------------------------------------

test('the committed manifest adds up, and claims no more than it measured',
  { skip: existsSync(MANIFEST) ? false : 'packages/corpus/data/ui-assets-github-v1.json is not in this checkout' }, () => {
    const m = JSON.parse(readFileSync(MANIFEST, 'utf8'));
    const t = m.totals;

    assert.equal(m.assets.length, t.assets, 'the asset list must be the whole index, not a sample');
    assert.equal(t.handWritten + t.machineGenerated, t.assets);
    assert.equal(t.withAScreen + t.withoutAScreen, t.assets);
    assert.equal(
      Object.values(m.byScreen).reduce((a, b) => a + b, 0), t.withAScreen,
      'byScreen must account for exactly the assets that named a screen — if it sums to the whole index, something filled the column in by guessing',
    );
    assert.equal(Object.values(m.byComposition).reduce((a, b) => a + b, 0), t.assets,
      'every asset must have a composition key; that is the point of it being the primary key');
    assert.equal(Object.values(m.bySpdx).reduce((a, b) => a + b, 0), t.assets);

    // `usable` is the number that will get quoted. It must be derivable from the rows, not
    // asserted — and it must require an OBSERVED parse, not an un-disproven one.
    const usable = m.assets.filter((x) => !x.machineGenerated && x.syntaxOk === true);
    assert.equal(usable.length, t.usable, 'the usable count does not match the assets it claims to count');
    assert.ok(t.usable <= t.assets);
    assert.equal(new Set(usable.map((x) => x.shape)).size, t.usableDistinctShapes);
    assert.equal(m.assets.filter((x) => x.syntaxOk === null).length, t.parseNotMeasured);
    assert.equal(
      t.usable + m.assets.filter((x) => !x.machineGenerated && x.syntaxOk !== true).length,
      t.handWritten,
      'every hand-written asset is either counted usable or accounted for as unproven',
    );

    // Rights and approval must survive the trip into the library.
    for (const a of m.assets) {
      assert.ok(a.rights.spdx, `${a.id} lost its SPDX id`);
      assert.equal(a.rights.status, 'upstream_licence_text_verified', `${a.id} carries a weaker rights tier than the corpus claims`);
      assert.match(a.provenance.permalink, /^https:\/\/github\.com\/.+\/blob\/[0-9a-f]{7,40}\//,
        `${a.id} has no permalink pinned to a revision — the bytes are not stored here, so an unpinned link is the whole provenance gone`);
    }
    assert.equal(m.policy.trainingApproved, false,
      'the library must not be the place training approval quietly becomes true');
    assert.equal(m.policy.sourceBytesStored, false);

    // If the syntax gate has not run, the field must be null everywhere rather than optimistic,
    // and nothing may be counted usable.
    if (t.failsToParse === null) {
      assert.ok(m.assets.every((x) => x.syntaxOk === null),
        'the syntax gate was not run, so no asset may claim it parses');
      assert.equal(t.usable, 0, 'assets were called usable with no parse evidence at all');
    } else {
      assert.equal(m.assets.filter((x) => x.syntaxOk === false).length, t.failsToParse);
    }
  });
