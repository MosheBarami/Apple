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
function build({ corpus = null, corpusPath = null } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'gallery-'));
  const ui = join(dir, 'ui');
  const maps = join(dir, 'maps');
  mkdirSync(ui, { recursive: true });
  mkdirSync(maps, { recursive: true });
  writeFileSync(join(ui, 'manifest.json'), JSON.stringify({
    base: 'https://example.invalid', model: 'rune', genre: 'tycoon',
    counts: { targets: 2, built: 1, byOutcome: { built: 1, truncated_code_block: 1 } },
    results: [
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
