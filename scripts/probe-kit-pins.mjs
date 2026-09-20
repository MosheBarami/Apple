#!/usr/bin/env node
// Ask Roblox, live, what each pinned kit sound actually is, and write down the answer.
//
// WHY A SEPARATE FILE FROM THE HARVEST. The harvest is a search: it asks "what free sound effects
// exist for 'jumpscare'" and writes 13,000 rows into a 10 MB file git does not track. That file
// cannot be the evidence for the fifty ids the kits pin, because it is not in a fresh checkout —
// and a guard that cannot read its evidence reports clean. This asks the opposite question, one id
// at a time — "what IS 138850305566950" — and writes fifty rows that are small enough to commit.
//
// It reads the ids out of genre-kits.ts rather than taking a list, so the ledger cannot drift from
// the kits by someone editing one and not the other: the probe has no opinion about which ids
// exist, it only reports on the ones the product actually ships.
//
// Run: node scripts/probe-kit-pins.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KITS = join(ROOT, 'apps', 'worker', 'src', 'genre-kits.ts');
const OUT = join(ROOT, 'packages', 'corpus', 'data', 'kit-pins.json');
const ENDPOINT = 'https://apis.roblox.com/toolbox-service/v1/items/details';
const UA = { 'user-agent': 'apple-asset-harvest/2 (+roblox asset library; contact via repository)', accept: 'application/json' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const src = readFileSync(KITS, 'utf8');
const pins = [...src.matchAll(/sfx\("([^"]+)", (\d+), "([^"]+)", "([^"]+)"\)/g)]
  .map((m) => ({ role: m[1], assetId: Number(m[2]), name: m[3], author: m[4] }));
if (!pins.length) {
  // Zero pins is a broken regex, not a product with no sounds, and writing an empty ledger would
  // make every assertion downstream vacuous.
  console.error('found no pins in genre-kits.ts — refusing to write an empty ledger');
  process.exit(1);
}

const rows = [];
// An id that never answered is NOT an id that answered "no". They are recorded separately, and the
// guard refuses a ledger with any of these in it, because "we could not reach Roblox" must never
// be written down as "this asset is fine".
const unresolved = [];

for (const pin of pins) {
  let body = null;
  let lastErr = null;
  for (let attempt = 0; attempt < 3 && body === null; attempt++) {
    try {
      const res = await fetch(`${ENDPOINT}?assetIds=${pin.assetId}`, { headers: UA });
      if (res.ok) { body = await res.json(); break; }
      lastErr = `HTTP ${res.status}`;
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { lastErr = String(e.message ?? e); }
    await sleep(700 * (attempt + 1));
  }
  if (body === null) { unresolved.push({ assetId: pin.assetId, name: pin.name, why: lastErr ?? 'no response' }); continue; }

  const entry = (body?.data ?? [])[0] ?? {};
  const asset = entry.asset ?? {};
  const creator = entry.creator ?? {};
  const fiat = entry.fiatProduct ?? {};

  // asset.audioDetails.audioType, NOT asset.audioType. The first version of this read the flat
  // path, which is where the v2 SEARCH puts it, and got `undefined` fifty times out of fifty. It
  // was caught only because the check was written as `!== 'SoundEffect'` and so failed loudly on
  // every row; written the other way round — `!== 'Music'` — the same typo would have passed a
  // three-minute song as a sound effect and nobody would ever have seen it. So absence is recorded
  // as absence here and refused by the guard, rather than collapsed into a value.
  const audio = asset.audioDetails ?? {};
  const reported = (v) => (v === undefined || v === null ? { reported: false } : { reported: true, value: v });

  rows.push({
    assetId: pin.assetId,
    role: pin.role,
    // What the ENDPOINT says the name is, not what the kit calls it. The guard compares the two,
    // which is only a check at all because this side is copied from the response.
    name: asset.name ?? null,
    exists: Object.keys(asset).length > 0,
    assetTypeId: asset.typeId ?? null,
    audioType: reported(audio.audioType),
    durationSeconds: reported(asset.duration ?? asset.durationSeconds),
    creatorName: creator.name ?? null,
    isVerifiedCreator: creator.isVerifiedCreator === true,
    isFree: fiat.isFree === true,
    hasScripts: asset.hasScripts === true,
  });
  await sleep(150);
}

writeFileSync(OUT, JSON.stringify({
  probedAt: new Date().toISOString(),
  endpoint: ENDPOINT,
  source: 'apps/worker/src/genre-kits.ts',
  pinCount: pins.length,
  unresolved,
  pins: rows,
}, null, 1) + '\n');

console.error(`probed ${pins.length} pins · ${rows.length} answered · ${unresolved.length} unresolved`);
// A field the endpoint DID NOT REPORT counts as a failure here, not as a pass. That is the whole
// lesson of the audioDetails path above: `reported: false` must never be mistaken for a good value.
const bad = rows.filter((r) =>
  !r.exists || r.assetTypeId !== 3 || !r.isFree || !r.isVerifiedCreator || r.hasScripts
  || r.audioType.reported !== true || r.audioType.value !== 'SoundEffect'
  || r.durationSeconds.reported !== true || r.durationSeconds.value > 30);
console.error(bad.length ? `${bad.length} FAILED the gate: ${JSON.stringify(bad, null, 1)}` : 'every pin: exists, typeId 3 Audio, SoundEffect, under 30s, free, verified creator, no scripts');
if (unresolved.length) console.error(`UNRESOLVED (the ledger records these as unchecked, not as passing): ${JSON.stringify(unresolved)}`);
