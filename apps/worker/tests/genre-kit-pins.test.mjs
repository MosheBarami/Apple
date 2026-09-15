// The pins are the one part of a kit that is a CLAIM ABOUT THE WORLD rather than a preference.
//
// A palette is right or wrong by taste. A pinned Roblox asset id is right or wrong by fact: either
// 104131914354223 is a free sound effect from a verified creator today, or a customer's game plays
// silence. genre-kits.test.mjs cannot tell the difference — it checks the LICENCE STRING the pin
// carries, and a fabricated id carrying the string 'Roblox Terms of Use' passes every assertion in
// it. The harvest that proves the ids are real is 10 MB and gitignored, so in a fresh checkout that
// suite runs green while observing nothing about whether the sounds exist.
//
// So the evidence is a ledger: what the live Roblox details endpoint said about each pinned id, on
// a date, checked in. Fifty rows, not ten megabytes. Regenerate with:
//   node scripts/probe-kit-pins.mjs
//
// Run: node --test apps/worker/tests/genre-kit-pins.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const LEDGER = join(ROOT, 'packages', 'corpus', 'data', 'library', 'kit-pins.json');
const KITS = join(ROOT, 'apps', 'worker', 'src', 'genre-kits.ts');

// Parsed out of the source rather than imported, deliberately: this guard must keep working if
// genre-kits.ts stops bundling, and the thing being guarded is the literal in the file.
const src = readFileSync(KITS, 'utf8');
const pins = [...src.matchAll(/sfx\("([^"]+)", (\d+), "([^"]+)", "([^"]+)"\)/g)]
  .map((m) => ({ role: m[1], assetId: Number(m[2]), name: m[3], author: m[4] }));

test('the pins parsed out of genre-kits.ts are the fifty the kits ship', () => {
  // Without this the regex could silently match nothing and every test below would iterate an
  // empty list and report clean — the exact failure the sibling suite already had once.
  assert.equal(pins.length, 50, `parsed ${pins.length} pins out of genre-kits.ts, expected 50`);
  assert.equal(new Set(pins.map((p) => p.assetId)).size, 50, 'two kits pin the same asset id');
});

test('the ledger proving those ids are real is present and readable', () => {
  // A MISSING LEDGER IS NOT A PASS. This is the whole reason the file exists: the alternative
  // shape — skip when absent — turns "we could not check" into a green suite.
  assert.ok(existsSync(LEDGER), `no pin ledger at ${LEDGER} — regenerate it with: node scripts/probe-kit-pins.mjs`);
});

test('every pinned id resolves, live, to a free sound effect from a verified creator', () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const byId = new Map(ledger.pins.map((p) => [p.assetId, p]));
  let checked = 0;
  for (const pin of pins) {
    const row = byId.get(pin.assetId);
    assert.ok(row, `kit pin ${pin.assetId} (${pin.name}) has no ledger row — re-run node scripts/probe-kit-pins.mjs`);
    assert.equal(row.exists, true, `asset ${pin.assetId} (${pin.name}) did not resolve at all when probed`);
    // typeId 3 is Audio. A pin that resolved to an Image would still "exist" and still be free.
    assert.equal(row.assetTypeId, 3, `asset ${pin.assetId} is typeId ${row.assetTypeId}, not Audio (3)`);
    // `reported` is checked BEFORE `value`, and that order is the point. The probe reads audioType
    // out of a nested, undocumented path; when that path moves, the field arrives absent, and an
    // assertion written straight against the value would compare undefined and report whatever the
    // comparison happened to make of it. Absence is its own failure with its own message.
    assert.equal(row.audioType.reported, true, `the endpoint did not report an audioType for ${pin.assetId} — the ledger cannot say this is a sound effect, so it does not`);
    assert.equal(row.audioType.value, 'SoundEffect', `asset ${pin.assetId} is ${row.audioType.value}, not a SoundEffect — a kit must not hand back a song`);
    assert.equal(row.durationSeconds.reported, true, `the endpoint did not report a duration for ${pin.assetId}`);
    assert.ok(row.durationSeconds.value <= 30, `asset ${pin.assetId} runs ${row.durationSeconds.value}s — that is a music bed, not an effect`);
    assert.equal(row.hasScripts, false, `asset ${pin.assetId} reports scripts`);
    assert.equal(row.isFree, true, `asset ${pin.assetId} (${pin.name}) is not free — a paid id in a kit charges a customer we never told`);
    assert.equal(row.isVerifiedCreator, true, `asset ${pin.assetId} is not from a verified creator`);
    // The name is how a human recognises the pin in a diff; a silent rename means the id now points
    // at something else the reviewer did not agree to.
    assert.equal(row.name, pin.name, `asset ${pin.assetId} is now named "${row.name}", the kit calls it "${pin.name}"`);
    checked++;
  }
  assert.equal(checked, 50, `checked ${checked} pins, expected 50`);
});

test('the ledger has no rows for pins that no longer exist', () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  const live = new Set(pins.map((p) => p.assetId));
  const stale = ledger.pins.filter((p) => !live.has(p.assetId)).map((p) => p.assetId);
  assert.deepEqual(stale, [], `ledger carries ${stale.length} rows no kit pins any more: ${stale.join(', ')}`);
});

test('the ledger records WHEN it was probed, so a stale one is visible rather than assumed', () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  assert.match(ledger.probedAt, /^\d{4}-\d{2}-\d{2}T/, 'ledger has no probe date');
  assert.equal(ledger.endpoint, 'https://apis.roblox.com/toolbox-service/v1/items/details');
  // A probe where some ids simply failed to answer must not be written as a clean ledger.
  assert.equal(ledger.unresolved.length, 0, `ledger was written with ${ledger.unresolved.length} ids the probe never resolved: ${JSON.stringify(ledger.unresolved)}`);
});
