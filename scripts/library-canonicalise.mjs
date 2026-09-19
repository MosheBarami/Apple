#!/usr/bin/env node
/**
 * THE LIBRARY'S CANONICAL COUNT — one unit, deduplicated, with the tags kept.
 *
 * `index.json` published 474,745 and that number mixed two different kinds of thing:
 *
 *   KENNEY was counted as 215. Those are PACKS. `kenney-expanded.json` enumerates the 56,718
 *   individual files inside them, every one sharing a sourceUrl with its pack, and it is the file —
 *   not the pack — that a user can put in their game. Counting the pack instead of its contents
 *   understates the library by 56,503; counting both double-counts.
 *
 *   CREATOR STORE was counted as 102,780. There are 81,311 distinct assets. The harvest ran once
 *   per search term and kept a row per match, so the same asset appears up to TEN times — the same
 *   `robloxAssetId`, differing only in `tags` (["wall","meshpart"] and ["fence","meshpart","wall"]
 *   are the same MeshPart found by two searches). `robloxAssetId` unique count is 81,311 exactly,
 *   which is what makes this a certainty rather than an inference.
 *
 *   OPENGAMEART has two enumerations with different id schemes and 6,518 rows in common by
 *   sourceUrl. The union is 5,635, not 5,400 and not 12,458.
 *
 * DEDUPLICATION MERGES, IT DOES NOT DROP. Dropping the nine extra Creator Store rows would throw
 * away the search terms that found them, and the library's whole job is being findable. The
 * surviving row carries the union of every duplicate's tags.
 *
 * THE UNIT IS "A THING A USER CAN INSERT". Packs are still counted and still published — as
 * `containers`, under their own name — because "215 Kenney packs" is a true and useful sentence.
 * What is forbidden is adding it to a count of files and presenting the sum as one number.
 *
 *   node scripts/library-canonicalise.mjs            report the counts, write nothing
 *   node scripts/library-canonicalise.mjs --write    rewrite index.json and the deduped sources
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'packages/corpus/data/library');
const read = (f) => {
  const j = JSON.parse(readFileSync(join(DIR, f), 'utf8'));
  return Array.isArray(j) ? j : (j.assets ?? []);
};
const normUrl = (u) => String(u ?? '').replace(/[#?].*$/, '').replace(/\/$/, '').toLowerCase();

/**
 * Which file holds the insertable items for a source, and which holds containers.
 *
 * Named rather than inferred from a filename suffix: "-expanded" means different things for these
 * two sources — Kenney's expanded file is the CONTENTS of its base file's packs, OpenGameArt's is a
 * second enumeration of the same kind of thing. A rule that guessed from the name would be right
 * once and wrong once, and the wrong one is silent.
 */
const SOURCES = {
  creator_store: { items: ['creator_store.json'], dedupe: 'id' },
  creator_store_audio: { items: ['creator_store_audio.json'], dedupe: 'id' },
  iconify: { items: ['iconify.json'], dedupe: 'id' },
  game_icons: { items: ['game_icons.json'], dedupe: 'id' },
  cgbookcase: { items: ['cgbookcase.json'], dedupe: 'id' },
  kenney: { items: ['kenney-expanded.json'], containers: ['kenney.json'], dedupe: 'id' },
  opengameart: { items: ['opengameart.json', 'opengameart-expanded.json'], dedupe: 'sourceUrl' },
};

/** Merge duplicates into one row, keeping the union of their tags. */
function dedupe(rows, by) {
  const key = (r) => (by === 'sourceUrl' ? normUrl(r.sourceUrl) || r.id : r.id);
  const out = new Map();
  let merged = 0;
  for (const r of rows) {
    const k = key(r);
    if (!k) continue;
    const seen = out.get(k);
    if (!seen) { out.set(k, { ...r, tags: [...new Set(r.tags ?? [])] }); continue; }
    merged += 1;
    seen.tags = [...new Set([...(seen.tags ?? []), ...(r.tags ?? [])])].sort();
  }
  return { rows: [...out.values()], merged };
}

const report = { measuredAt: new Date().toISOString(), unit: 'one item a user can insert', perSource: {}, items: 0, containers: 0 };
const deduped = {};

for (const [name, cfg] of Object.entries(SOURCES)) {
  const raw = cfg.items.flatMap((f) => (existsSync(join(DIR, f)) ? read(f) : []));
  if (raw.length === 0) { report.perSource[name] = { items: 0, note: 'no rows read — the source file is missing or empty' }; continue; }
  const { rows, merged } = dedupe(raw, cfg.dedupe);
  const containers = (cfg.containers ?? []).reduce((n, f) => n + (existsSync(join(DIR, f)) ? read(f).length : 0), 0);
  report.perSource[name] = { read: raw.length, items: rows.length, mergedDuplicates: merged, containers, dedupedBy: cfg.dedupe };
  report.items += rows.length;
  report.containers += containers;
  deduped[name] = rows;
}

const usable = Object.values(deduped).flat().filter((r) => r.robloxAssetId != null).length;
report.usableWithoutUpload = usable;

//[[ HARVESTED IS NOT INGESTED, AND INGESTED IS NOT INSERTABLE. Three different facts, and this
//   index conflated them until they were measured apart against the live database on 2026-09-19:
//
//     511,208  rows in D1 `asset_library`
//      81,648  of them `active` — every one a Creator Store asset carrying a robloxAssetId
//     429,560  `pending_ingest` — catalogued, with no Roblox id, NOT insertable by a user today
//      13,023  Creator Store audio rows harvested to disk and never ingested at all: there is no
//              audio table in D1, so the published "usable" figure counted a file nobody can reach
//
//   So the number that answers "what can a customer actually put in their game" is 81,648, and it
//   is a different number from the size of the catalogue. Both are published, each under its own
//   name, because the honest sentence needs both and the dishonest one is their sum. ]]
report.liveMeasurement = {
  measuredAt: '2026-09-19',
  source: 'D1 golem-corpus, asset_library',
  rows: 511208,
  active: 81648,
  pendingIngest: 429560,
  audioIngested: 0,
  note: 'active = carries a robloxAssetId and can be inserted without an upload. Re-measure with: select status, count(*) from asset_library group by status',
};

if (process.argv.includes('--write')) {
  for (const [name, rows] of Object.entries(deduped)) {
    if (report.perSource[name].mergedDuplicates > 0) {
      const target = SOURCES[name].items[0];
      writeFileSync(join(DIR, target), JSON.stringify({ assets: rows }, null, 0));
    }
  }
  const prev = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
  writeFileSync(join(DIR, 'index.json'), JSON.stringify({
    ...prev,
    usableWithoutUploadKnown: undefined,
    generatedAt: report.measuredAt,
    unit: report.unit,
    total: report.items,
    containers: report.containers,
    // NAMED BY WHAT IT COUNTS. This was `usableWithoutUploadKnown` and it counted harvested rows
    // carrying a robloxAssetId — including 13,023 audio rows that were never ingested anywhere. A
    // customer cannot reach a row that is only on somebody's disk.
    carryingRobloxIdInHarvest: usable,
    liveMeasurement: report.liveMeasurement,
    //[[ WRITTEN ONCE, THEN PRESERVED. The first `--write` recorded what the figure used to be. The
    //   second run read the value the FIRST run had already written and recorded that as the thing
    //   it superseded — so a second run erased the history it exists to keep. Caught by running it
    //   twice and reading the output. `??` rather than assignment: an existing record is the older
    //   and therefore the true one.
    supersededTotal: prev.supersededTotal ?? { value: prev.total, why: 'mixed packs with files and counted Creator Store duplicates; see scripts/library-canonicalise.mjs' },
    supersededUsable: prev.supersededUsable ?? { value: prev.usableWithoutUploadKnown, why: 'counted duplicates and 13,023 audio rows that are ingested nowhere; the live insertable figure is liveMeasurement.active' },
    perSource: report.perSource,
  }, null, 1));
  console.log('written');
}

console.log(`CANONICAL LIBRARY — ${report.items.toLocaleString()} insertable items, ${report.containers.toLocaleString()} containers`);
console.log(`usable with no upload: ${usable.toLocaleString()}`);
for (const [k, v] of Object.entries(report.perSource)) {
  console.log(`  ${k.padEnd(22)} read ${String(v.read ?? 0).padStart(7)}  items ${String(v.items).padStart(7)}  merged ${String(v.mergedDuplicates ?? 0).padStart(6)}  containers ${String(v.containers ?? 0).padStart(5)}`);
}
