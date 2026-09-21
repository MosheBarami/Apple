/**
 * THE PAGE HAS TO TELL HIM WHICH HALF OF WHAT HE ASKED FOR EXISTS.
 *
 * LEDGER ROW `extract-every-roblox-ui-genre`. He asked for every kind of Roblox UI pulled from the
 * internet and turned into "נכס מוכן ועובד" — a ready, working asset — in the model's own library.
 * The construction half shipped and the pictures on this page are its proof. The ready-made-asset
 * half did not, and cannot: apps/worker/src/assets.ts records that the catalogue which tried held
 * 511,208 rows of which 0 were insertable, because every route from a file to a usable Roblox
 * asset ends in a permanent upload into his own account. He deleted it on 2026-09-20.
 *
 * A gallery that shows sixteen screens and says nothing about that gap lets him keep believing the
 * asset store is coming. That is a lie by composition — the same one the FAILURES section of this
 * page already exists to refuse — so `librarySection` is held to the same standard here.
 *
 * TWO PROPERTIES, and the second is the one that rots:
 *   1. The section says both halves, in English and in Hebrew, and does not ask him to choose.
 *   2. ITS NUMBERS ARE READ OFF THE CORPUS. A typed "16 kinds of screen" is the literal that
 *      survives the next change to the library, which is exactly how the asset refusal string went
 *      on naming a catalogue that had been deleted for ten months.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const BUILDER = join(HERE, 'build-showcase-gallery.mjs');
const CORPUS = join(REPO, 'packages/corpus/data/ui-construction.json');

/** The gallery over a one-screen fixture: enough page to inspect, no dependence on real evidence. */
function build({ corpus = null, corpusPath = null, results = null, genre = 'tycoon' } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  const ui = join(dir, 'ui');
  const maps = join(dir, 'maps');
  mkdirSync(ui, { recursive: true });
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(ui, 'manifest.json'), JSON.stringify({
    base: 'https://example.invalid', model: 'rune', genre,
    counts: { targets: 2, built: 1, byOutcome: { built: 1, truncated_code_block: 1 } },
    results: results ?? [
      { target: 'screen-shop', id: 'screen-shop', genre: 'tycoon', outcome: 'built', guiNodes: 4, files: { svg: 'a.svg' } },
      { target: 'screen-social', id: 'screen-social', genre: 'tycoon', outcome: 'truncated_code_block', detail: 'stopped inside the block' },
    ],
  }));
  writeFileSync(join(maps, 'manifest.json'), JSON.stringify({ counts: { built: 0 }, results: [] }));
  const out = join(dir, 'showcase.html');
  const extra = [];
  if (corpus) {
    const f = join(dir, 'corpus.json');
    writeFileSync(f, JSON.stringify(corpus));
    extra.push('--corpus', f);
  } else if (corpusPath) {
    extra.push('--corpus', corpusPath);
  }
  execFileSync(process.execPath, [BUILDER, '--ui', ui, '--maps', maps, '--out', out, ...extra], { stdio: ['ignore', 'pipe', 'pipe'] });
  const html = readFileSync(out, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return html;
}

const corpus = () => JSON.parse(readFileSync(CORPUS, 'utf8'));

test('the page reports the REAL library it will ship with', () => {
  const d = corpus();
  const sources = new Set([...d.genres, ...d.screens].flatMap((e) => e.sources ?? [])).size;
  const html = build();
  assert.match(html, new RegExp(`${d.screens.length} kinds of screen`));
  assert.match(html, new RegExp(`${d.genres.length} genres`));
  assert.match(html, new RegExp(`${sources.toLocaleString()} cited sources`));
  // The corpus's own sentence about what it does not contain, quoted rather than paraphrased.
  assert.ok(html.includes(d.note), 'the page must quote the corpus note about holding no assets');
});

test('THE DERIVED NUMBERS — a different library gives a different page', () => {
  // THIS IS THE TEST THAT HAD TO BE RE-AIMED. The first version asserted the page says "16 kinds
  // of screen" and read 16 out of the real corpus — but the real corpus HAS 16, so replacing
  // `${lib.screens}` with the literal `16` rendered identical bytes and the mutation stayed green.
  // A test that cannot distinguish a derived number from a typed one does not defend derivation.
  //
  // So the builder is handed a corpus that is deliberately nothing like the real one. Only code
  // that actually counts can follow it.
  const html = build({
    corpus: {
      note: 'A fixture corpus. Nothing here is a real construction observation.',
      genres: [{ genre: 'g1', sources: ['s1'] }, { genre: 'g2', sources: ['s1', 's2'] }],
      screens: [{ genre: 'screen-a', sources: ['s3'] }, { genre: 'screen-b', sources: [] }, { genre: 'screen-c', sources: ['s4'] }],
    },
  });
  assert.match(html, /3 kinds of screen/, 'the screen count must be counted, not typed');
  assert.match(html, /2 genres/, 'the genre count must be counted, not typed');
  assert.match(html, /4 cited sources/, 'sources are de-duplicated across every entry, then counted');
  assert.doesNotMatch(html, /16 kinds of screen/, 'the real library must not leak into a page built from another one');
  assert.ok(html.includes('A fixture corpus.'), 'the quoted note follows the corpus too');
});

test('the section states BOTH halves — what exists and what will not', () => {
  const html = build();
  assert.match(html, /What the library actually is/);
  assert.match(html, /get_ui_construction/, 'the tool the model calls must be named, or "reachable" is an assertion');
  assert.match(html, /511,208/, 'the catalogue that failed is named with its measured size');
  assert.match(html, /0 of them could be inserted/, 'and with the number that made it worthless');
  assert.match(html, /no store of ready-made assets, and there will not be one/i);
});

test('it tells him, and does not ask him to pick', () => {
  // He has granted blanket autonomous authority and asked not to be made to choose between
  // options. A section that ended in a question would be handing the decision back.
  const html = build();
  const section = /What the library actually is([\s\S]*?)<\/div>\s*<footer/.exec(html);
  assert.ok(section, 'the library section must sit where this test can read it');
  assert.doesNotMatch(section[1], /\?\s*<\/(li|p|h2)>/, 'no question is put to the owner in this section');
});

test('the Hebrew half carries its own direction, because an inherited one renders wrong', () => {
  // apps/web/tests/bidi-content.test.mjs measured this: an RTL block that inherits an LTR
  // document's direction puts its bullets and its full stops on the wrong side. He is the one
  // person this section is written for; getting it backwards would be worse than English alone.
  const html = build();
  assert.match(html, /<div class="he" dir="rtl" lang="he">/);
  assert.match(html, /הספרייה קיימת/, 'the Hebrew half states the part that exists');
  assert.match(html, /לא יהיה/, 'and the part that will not');
});

test('a corpus that cannot be read removes the claim rather than printing a hole', () => {
  // The gallery is built on machines that may not carry packages/corpus, and on a tree where the
  // file has moved. A section reading "undefined kinds of screen" would be worse than no section:
  // it is still a claim, and it is false. Now that the corpus path is an argument, this is checked
  // by pointing the builder at one that does not exist rather than by reading the source.
  const html = build({ corpusPath: join(tmpdir(), 'no-such-ui-construction.json') });
  assert.doesNotMatch(html, /undefined|NaN/, 'no hole may reach the page');
  assert.doesNotMatch(html, /What the library actually is/, 'an uncountable library makes no claim at all');
  // The rest of the gallery still builds — an absent corpus is not a reason to lose the evidence.
  assert.match(html, /Interface screens/);
});

/**
 * THE SECOND AXIS, AND THE SENTENCE THAT WOULD HAVE ROTTED.
 *
 * The gallery answered one question — every kind of screen, one game — and the owner asked a
 * second one: "כל סוג אפשרי מסוגו", every possible kind of its kind, so the model can build almost
 * any Roblox UI. A grid held at one genre cannot show that the genre kit does anything at all.
 *
 * So the page now carries two grids: the type axis held at one genre, and the genre axis held at
 * one type. These tests hold the split, and hold the two ways it lies:
 *   1. A cross-genre row leaking into the one-game grid, where it reads as a seventeenth type.
 *   2. Two cards titled "hud" showing different interfaces with nothing saying why — the model
 *      answering two questions while looking like it gave two answers to one.
 * And the third, which is the one this repository keeps re-learning: the section note said "all
 * for a tycoon game" as a TYPED LITERAL. That was true the day it was written and would have gone
 * on claiming tycoon over a band of six other genres, exactly as the asset refusal went on naming
 * a catalogue deleted in September.
 */
// TWO TYCOON ROWS, DELIBERATELY. The genre the first grid is held at is the majority of the rows,
// so a fixture with one row per genre is a three-way tie broken alphabetically — it would be
// asserting against `fps_arena` while reading as though it asserted against tycoon. The real
// manifest is sixteen of one genre and a handful of others; this is that shape, smaller.
const CROSS = [
  { target: 'screen-hud', id: 'screen-hud', genre: 'tycoon', outcome: 'built', guiNodes: 9, files: { svg: 'a.svg' } },
  { target: 'screen-shop', id: 'screen-shop', genre: 'tycoon', outcome: 'built', guiNodes: 8, files: { svg: 'c.svg' } },
  { target: 'screen-hud', id: 'screen-hud', genre: 'fps_arena', outcome: 'built', guiNodes: 7, files: { svg: 'b.svg' } },
  { target: 'screen-hud', id: 'screen-hud', genre: 'horror', outcome: 'does_not_compile', detail: 'SyntaxError' },
];

test('the two axes are two grids, and a cross-genre row does not sit in the one-game grid', () => {
  const html = build({ results: CROSS });
  const band = html.indexOf('The same screen, other genres');
  assert.ok(band > 0, 'no cross-genre band on a page whose manifest carries two genres');
  const firstGrid = html.slice(html.indexOf('Interface screens'), band);
  assert.ok(!/fps_arena|fps arena/.test(firstGrid), 'a cross-genre card leaked into the one-game grid');
  assert.ok(/fps arena/.test(html.slice(band)), 'the cross-genre card is not in the band either — it vanished');
});

test('a cross-genre card names its genre; the one-game cards do not repeat it', () => {
  const html = build({ results: CROSS });
  const band = html.slice(html.indexOf('The same screen, other genres'));
  assert.ok(/card__title">hud — fps arena/.test(band), 'the band card does not say which genre it is');
  assert.ok(/card__title">hud — horror/.test(band), 'the failed band card does not say which genre it is');
  const firstGrid = html.slice(html.indexOf('Interface screens'), html.indexOf('The same screen, other genres'));
  assert.ok(/card__title">hud</.test(firstGrid), 'the one-game grid lost its hud');
  assert.ok(!/card__title">hud — /.test(firstGrid), 'the one-game grid repeats a genre every card already shares');
});

test('the band counts what actually built, rather than claiming the whole row', () => {
  const html = build({ results: CROSS });
  const band = html.slice(html.indexOf('The same screen, other genres'));
  assert.ok(/1 of\s+2 came back building/.test(band.replace(/\s+/g, ' ')),
    'the band does not report 1 of 2 built:\n' + band.slice(0, 700));
});

test('THE GENRE IN THE NOTE IS READ OFF THE ROWS, not typed into the page', () => {
  const asTycoon = build({ results: CROSS, genre: 'tycoon' });
  assert.ok(/all for a tycoon game/.test(asTycoon), 'the note does not name the genre the grid is held at');
  // The same shape of data with the majority genre changed: every sentence that names it must move.
  const asHorror = build({
    genre: 'tycoon',
    results: [
      { target: 'screen-hud', id: 'screen-hud', genre: 'horror', outcome: 'built', guiNodes: 9, files: { svg: 'a.svg' } },
      { target: 'screen-shop', id: 'screen-shop', genre: 'horror', outcome: 'built', guiNodes: 8, files: { svg: 'c.svg' } },
      { target: 'screen-hud', id: 'screen-hud', genre: 'tycoon', outcome: 'built', guiNodes: 7, files: { svg: 'b.svg' } },
    ],
  });
  assert.ok(/all for a horror game/.test(asHorror), 'the note names a genre the rows do not support');
  assert.ok(!/all for a tycoon game/.test(asHorror), 'the note names two genres at once');
  const band = asHorror.slice(asHorror.indexOf('The same screen, other genres'));
  assert.ok(/hud — tycoon/.test(band), 'with horror the majority, tycoon is the one in the band');
});

test('THE PAGE CANNOT BE INVERTED BY THE LAST RUN — the split follows the rows, not ui.genre', () => {
  // THE DEFECT THIS EXISTS FOR, measured 2026-09-21 and visible on the built page. The split read
  // `ui.genre`, which the generator overwrites with whatever the LAST invocation was asked for.
  // After generating one anime_battle screen on top of sixteen tycoon ones, the manifest said
  // `genre: "anime_battle"`, so the one-game grid rendered ONE card and the band rendered the
  // other twenty-one — every tycoon screen on the page, relabelled as the exception. The page had
  // turned inside out and every sentence on it was still grammatical, which is why only a test
  // that counts catches it.
  const results = [
    ...['shop', 'hud', 'lobby', 'map'].map((t) => (
      { target: `screen-${t}`, id: `screen-${t}`, genre: 'tycoon', outcome: 'built', guiNodes: 5, files: { svg: 'a.svg' } }
    )),
    { target: 'screen-hud', id: 'screen-hud', genre: 'anime_battle', outcome: 'built', guiNodes: 6, files: { svg: 'b.svg' } },
  ];
  const html = build({ results, genre: 'anime_battle' }); // the manifest lies; the rows do not
  const band = html.indexOf('The same screen, other genres');
  const firstGrid = html.slice(html.indexOf('Interface screens'), band);
  const cards = (seg) => (seg.match(/card__title">/g) ?? []).length;
  assert.equal(cards(firstGrid), 4, 'the one-game grid must hold the four tycoon screens, not one');
  assert.equal(cards(html.slice(band)), 1, 'the band must hold the single odd genre out, not twenty-one');
  assert.ok(/all for a tycoon game/.test(html), 'the note follows the majority genre, not the last run');
});

test('the band counts GENRES, not rows, when it says how many it covers', () => {
  // Two screens across two genres is "2 other genres", never "4". Counting rows would inflate the
  // claim the moment the band grows a second screen type.
  const results = [
    { target: 'screen-shop', id: 'screen-shop', genre: 'tycoon', outcome: 'built', guiNodes: 5, files: { svg: 'a.svg' } },
    { target: 'screen-hud', id: 'screen-hud', genre: 'tycoon', outcome: 'built', guiNodes: 5, files: { svg: 'a.svg' } },
    { target: 'screen-hud', id: 'screen-hud', genre: 'horror', outcome: 'built', guiNodes: 6, files: { svg: 'b.svg' } },
    { target: 'screen-shop', id: 'screen-shop', genre: 'horror', outcome: 'built', guiNodes: 6, files: { svg: 'b.svg' } },
    { target: 'screen-hud', id: 'screen-hud', genre: 'obby', outcome: 'built', guiNodes: 6, files: { svg: 'b.svg' } },
    { target: 'screen-shop', id: 'screen-shop', genre: 'obby', outcome: 'built', guiNodes: 6, files: { svg: 'b.svg' } },
  ];
  const band = build({ results }).slice(build({ results }).indexOf('The same screen, other genres'));
  const flat = band.replace(/\s+/g, ' ');
  assert.ok(/in 2 other genres/.test(flat), 'the band miscounts its genres:\n' + flat.slice(0, 400));
  assert.ok(/4 of 4 came back building/.test(flat), 'the built count is over rows, which is what it says');
});

test('with one genre there is no band at all, rather than an empty heading', () => {
  const html = build();
  assert.ok(!html.includes('The same screen, other genres'),
    'an empty cross-genre band is printed over a single-genre run');
  assert.ok(html.includes('Interface screens'), 'the one-game grid went missing too');
});
