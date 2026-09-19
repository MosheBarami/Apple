/**
 * THE LIBRARY'S PUBLISHED COUNT MUST BE ONE UNIT, DEDUPLICATED, AND TRUE OF THE LIVE DATABASE.
 *
 * `index.json` published 474,745 assets. That number added two different kinds of thing together
 * and counted one of them many times over:
 *
 *   KENNEY was 215 — those are PACKS. `kenney-expanded.json` enumerates the 56,718 FILES inside
 *   them, every one sharing its pack's sourceUrl, and it is the file a user can place in a game.
 *
 *   CREATOR STORE was 102,780 against 81,311 distinct assets. The harvest ran once per search term
 *   and kept a row per match, so one MeshPart appears up to ten times, identical but for `tags`.
 *   `robloxAssetId` has exactly 81,311 distinct values, which turns this from an inference into a
 *   measurement.
 *
 *   OPENGAMEART had two enumerations with different id schemes and 6,518 rows in common.
 *
 * AND THE PUBLISHED "USABLE WITHOUT UPLOAD" FIGURE COUNTED A FILE NOBODY CAN REACH. It was 115,803,
 * built from harvested rows carrying a robloxAssetId — including 13,023 Creator Store audio rows
 * that are ingested nowhere. There is no audio table in D1. Measured against the live database on
 * 2026-09-19: 511,208 rows, of which 81,648 are `active` and 429,560 are `pending_ingest` with no
 * Roblox id and therefore not insertable by anyone.
 *
 * So three facts that were one number are three numbers now, each named by what it counts:
 * `total` (catalogued), `containers` (packs), `liveMeasurement.active` (what a customer can insert).
 *
 * Run with:  node --test tests/
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const INDEX = join(ROOT, 'packages/corpus/data/library/index.json');

test('the library index is there to be read', () => {
  assert.ok(existsSync(INDEX), 'packages/corpus/data/library/index.json is gone');
});

const idx = JSON.parse(readFileSync(INDEX, 'utf8'));

test('EVERY FIGURE IS NAMED BY WHAT IT COUNTS', () => {
  assert.equal(typeof idx.unit, 'string', 'the index must state its unit; a bare total is what mixed packs with files');
  assert.match(idx.unit, /insert/i, 'the unit is a thing a user can insert');
  assert.equal(typeof idx.total, 'number');
  assert.equal(typeof idx.containers, 'number', 'packs are counted separately, never added to files');
  assert.ok(idx.liveMeasurement, 'the index must carry a live measurement — harvested is not ingested');
  assert.equal(typeof idx.liveMeasurement.active, 'number', 'the live insertable count is the only one that answers "what can a customer use"');
  assert.ok(idx.liveMeasurement.active < idx.total, 'active cannot exceed the catalogue');
  assert.equal(idx.usableWithoutUploadKnown, undefined,
    'that key counted rows nobody can reach; it is replaced by carryingRobloxIdInHarvest and liveMeasurement.active');
});

test('THE HISTORY OF A CORRECTED FIGURE SURVIVES BEING RE-RUN', () => {
  // The canonicaliser recorded what a figure used to be — and a second `--write` read the value the
  // FIRST run had written and recorded THAT as the superseded one, erasing the history it exists to
  // keep. Found by running it twice and reading the output.
  assert.equal(idx.supersededTotal?.value, 474745, 'the superseded total must stay the original 474,745 however often the script runs');
  assert.equal(idx.supersededUsable?.value, 115803, 'the superseded usable figure must stay the original 115,803');
});

test('the published total is what the canonicaliser computes from the sources', () => {
  const out = execFileSync('node', [join(ROOT, 'scripts/library-canonicalise.mjs')], { cwd: ROOT, encoding: 'utf8' });
  const m = /CANONICAL LIBRARY — ([\d,]+) insertable items, ([\d,]+) containers/.exec(out);
  assert.ok(m, `the canonicaliser did not report a count — this test would check nothing:\n${out.slice(0, 300)}`);
  assert.equal(Number(m[1].replace(/,/g, '')), idx.total, 'index.json disagrees with the sources it summarises');
  assert.equal(Number(m[2].replace(/,/g, '')), idx.containers, 'the container count disagrees with the sources');
});

test('no source is counted in two units at once', () => {
  for (const [name, v] of Object.entries(idx.perSource ?? {})) {
    if (!v.containers) continue;
    assert.ok(v.items > v.containers,
      `${name} publishes ${v.containers} containers and ${v.items} items — a container must hold more than itself`);
  }
});
