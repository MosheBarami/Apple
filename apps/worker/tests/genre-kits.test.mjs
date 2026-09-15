// The gate this file exists for: a genre kit MUST NOT be able to contain an asset whose licence
// the library refuses.
//
// A kit is the one place in the product where assets are handed over as a SET — "give me horror"
// returns nine things at once. That is exactly where a share-alike or non-commercial row would slip
// past unnoticed, because nobody inspects nine rows they asked for as one. The licence decision is
// not re-implemented here or there: both sides call LICENCES/allowedInLibrary in asset-library.ts.
//
// Run: node --test apps/worker/tests/genre-kits.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const out = join(tmpdir(), `apple-kits-${process.pid}.mjs`);
// `--bundle` with no --platform and no --main-fields, and it resolves: genre-kits.ts reaches only
// licences.ts, which has no imports at all. That is the design, not a coincidence — the kits must
// be able to ask the licence question without dragging D1, Vectorize and the AI gateway in behind
// it. If either file ever grows a workspace import, this line starts needing flags and says so.
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'genre-kits.ts'), '--bundle', '--format=esm', `--outfile=${out}`],
  { cwd: WORKER, stdio: 'pipe' },
);
const K = await import(`file://${out}`);
rmSync(out, { force: true });

const { GENRE_KITS, GENRE_KIT_IDS, getGenreKit, admitToKit, kitSlotNeeds } = K;

// ==============================================================================================
// 1. The licence gate — the whole point of the file
// ==============================================================================================

test('admitToKit refuses every licence the library refuses', () => {
  // Verbatim strings as the sources actually print them, not canonical ids: the gate has to hold
  // on the string a harvester would really carry.
  const refused = [
    'CC BY-SA 4.0',
    'Creative Commons Attribution-ShareAlike 4.0',
    'CC BY-NC 4.0',
    'Creative Commons Attribution-NonCommercial 4.0',
    'CC BY-NC-SA 4.0',
    'GPL-3.0',
    'GNU General Public License',
  ];
  for (const licence of refused) {
    const verdict = admitToKit({ id: 'x/y/z', name: 'thing', kind: 'ui_icon', licence, robloxAssetId: 1 });
    assert.equal(verdict.admitted, false, `${licence} was admitted into a kit`);
    assert.match(verdict.why, /share-?alike|non-?commercial|source-distribution|excluded/i, `${licence} was refused without saying why: ${verdict.why}`);
  }
});

test('an unrecognised licence string is refused, never guessed at', () => {
  const verdict = admitToKit({ id: 'x/y/z', name: 'thing', kind: 'ui_icon', licence: 'free for everyone forever, trust me', robloxAssetId: 1 });
  assert.equal(verdict.admitted, false);
  assert.match(verdict.why, /not a recognised licence|unrecognised/i);
});

test('the licences the library allows are admitted', () => {
  for (const licence of ['CC0 1.0', 'CC BY 4.0', 'Roblox Terms of Use — free on the Creator Store audio library']) {
    const verdict = admitToKit({ id: 'x/y/z', name: 'thing', kind: 'ui_icon', licence, robloxAssetId: 1 });
    assert.equal(verdict.admitted, true, `${licence} was refused: ${verdict.why}`);
  }
});

test('no kit as SHIPPED contains a pinned asset the gate would refuse', () => {
  // `kit.pinned ?? []` was the first version of this loop and it passed while checking NOTHING:
  // GENRE_KITS never carried a `pinned` property at all, so every kit iterated an empty array and
  // the suite reported clean. Falsification caught it — a deliberately planted CC-BY-NC row stayed
  // green. The count assertions below exist so this test can never again pass by seeing nothing.
  let checked = 0;
  for (const kit of GENRE_KITS) {
    assert.ok(Array.isArray(kit.pinned) && kit.pinned.length > 0, `kit ${kit.id} pins nothing — this test would check it vacuously`);
    for (const p of kit.pinned) {
      const verdict = admitToKit(p);
      assert.equal(verdict.admitted, true, `kit ${kit.id} pins ${p.id} under "${p.licence}", which the gate refuses: ${verdict.why}`);
      assert.ok(Number.isInteger(p.robloxAssetId) && p.robloxAssetId > 0, `kit ${kit.id} pin ${p.id} has no usable Roblox asset id`);
      checked++;
    }
  }
  assert.equal(checked, 50, `expected 50 pinned assets across ten kits, checked ${checked}`);
});

// ==============================================================================================
// 2. The kits are a real, coherent, named thing — not forty shallow ones
// ==============================================================================================

test('there are exactly ten kits, each addressable by name', () => {
  assert.equal(GENRE_KITS.length, 10);
  assert.equal(new Set(GENRE_KIT_IDS).size, 10);
  for (const id of GENRE_KIT_IDS) assert.equal(getGenreKit(id).id, id);
});

test('getGenreKit on an unknown name lists the real ones rather than returning nothing', () => {
  const miss = getGenreKit('battle-royale-metaverse');
  assert.equal(miss, null);
});

test('every kit covers UI, VFX, SFX and a palette — a partial kit is not a kit', () => {
  for (const kit of GENRE_KITS) {
    const needs = new Set(kitSlotNeeds(kit));
    for (const required of ['ui_icon', 'particle', 'sfx']) {
      assert.ok(needs.has(required), `kit ${kit.id} has no ${required} slot`);
    }
    assert.ok(kit.palette.length >= 4, `kit ${kit.id} has ${kit.palette.length} colours — not a palette`);
    for (const c of kit.palette) assert.match(c.hex, /^#[0-9a-f]{6}$/, `kit ${kit.id} colour ${c.role} is not a hex colour`);
    assert.ok(kit.lighting && Object.keys(kit.lighting).length > 0, `kit ${kit.id} has no lighting`);
  }
});

test('every slot records WHY it is in this kit — a curated selection with no reason is a copy', () => {
  for (const kit of GENRE_KITS) {
    for (const slot of kit.slots) {
      assert.ok(slot.why.length > 25, `kit ${kit.id} slot ${slot.need} has no real reason: "${slot.why}"`);
      assert.ok(slot.query.length > 0, `kit ${kit.id} slot ${slot.need} has no query`);
    }
  }
});
