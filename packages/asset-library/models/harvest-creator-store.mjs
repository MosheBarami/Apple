#!/usr/bin/env node
// Harvest free Roblox Creator Store models for the model library (D-MODELLIB-1).
//
// Runs genre x kind keyword searches against the unauthenticated toolbox-service endpoints the
// worker already uses (assets.ts), then reads every hit's details: creator and verified badge,
// votes, price, scriptCount, triangles and instance counts. The details are Roblox's own report of
// what the model contains, which is what lets a free model be judged before anyone loads it.
//
// Output: ../sources/models-creator-store.jsonl, one row per free public Model. Nothing is
// downloaded: Creator Store bytes need a signed-in Roblox session, so these rows are inserted by
// asset id through the plugin, and only script-free rows from trusted creators are marked usable.
//
//   node packages/asset-library/models/harvest-creator-store.mjs [--pages 2]
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
// Gzipped: the plain harvest is ~30 MB of JSON lines, ~4 MB compressed.
const OUT = join(HERE, '..', 'sources', 'models-creator-store.jsonl.gz');
const SEARCH = 'https://apis.roblox.com/toolbox-service/v1/marketplace/10';
const DETAILS = 'https://apis.roblox.com/toolbox-service/v1/items/details';
const PAGES = Number(process.argv[process.argv.indexOf('--pages') + 1]) || 2;

// [genre, kind, keyword]. Kind is the query's intent; the row keeps it unless the name says otherwise.
const Q = [];
const add = (genre, kind, words) => words.forEach((w) => Q.push([genre, kind, w]));
add('Simulator/Tycoon', 'kit', ['simulator map', 'simulator asset pack', 'tycoon kit', 'tycoon map', 'tycoon building', 'simulator kit', 'clicker simulator map']);
add('Simulator/Tycoon', 'prop', ['dropper', 'conveyor', 'pet egg', 'egg incubator', 'coin pile', 'gem', 'crystal', 'treasure chest', 'sell pad', 'upgrade pad', 'leaderboard board', 'portal', 'vending machine', 'machine', 'money', 'gold bar', 'crate', 'barrel', 'lamp post']);
add('Simulator/Tycoon', 'building', ['shop building', 'simulator shop', 'tycoon base', 'factory', 'warehouse', 'market stall', 'stand']);
add('Obby', 'kit', ['obby kit', 'obby', 'obby stages', 'parkour map', 'tower of hell', 'obby map']);
add('Obby', 'prop', ['checkpoint', 'kill brick', 'lava', 'jump pad', 'spinner', 'truss', 'moving platform', 'obby platform', 'finish line', 'start pad', 'trampoline', 'spikes']);
add('Horror/Adventure', 'building', ['haunted house', 'abandoned house', 'mansion', 'hospital', 'cabin', 'castle', 'ruins', 'temple', 'dungeon', 'cave', 'lighthouse', 'church', 'tower', 'pirate ship', 'shipwreck']);
add('Horror/Adventure', 'prop', ['graveyard', 'tombstone', 'coffin', 'torch', 'lantern', 'skull', 'cobweb', 'pumpkin', 'candle', 'bones', 'cage', 'altar', 'door', 'bookshelf', 'chandelier']);
add('Horror/Adventure', 'kit', ['horror map', 'backrooms', 'horror kit', 'adventure map', 'dungeon kit', 'escape room']);
add('Shooter/Fighting', 'weapon', ['gun', 'rifle', 'pistol', 'shotgun', 'sniper', 'sword', 'katana', 'axe', 'bow', 'shield', 'spear', 'hammer', 'dagger', 'grenade', 'rocket launcher']);
add('Shooter/Fighting', 'prop', ['sandbag', 'barricade', 'barrier', 'military crate', 'ammo box', 'target', 'watchtower', 'bunker', 'tank trap', 'oil drum']);
add('Shooter/Fighting', 'kit', ['fps map', 'arena map', 'military base', 'battle royale map', 'combat arena', 'war map', 'laser tag']);
add('City/Roleplay', 'building', ['house', 'modern house', 'apartment', 'skyscraper', 'shop', 'store', 'cafe', 'restaurant', 'school', 'police station', 'fire station', 'gas station', 'bank', 'office building', 'hotel', 'supermarket', 'pizza place', 'bakery', 'garage']);
add('City/Roleplay', 'prop', ['street light', 'traffic light', 'bench', 'trash can', 'mailbox', 'fire hydrant', 'bus stop', 'sofa', 'bed', 'table', 'chair', 'kitchen', 'fridge', 'tv', 'desk', 'wardrobe', 'bathroom', 'computer', 'sign', 'road', 'sidewalk', 'parking lot']);
add('City/Roleplay', 'kit', ['city map', 'town map', 'roleplay map', 'city pack', 'modular building kit', 'road kit', 'furniture pack', 'suburb']);
add('City/Roleplay', 'vehicle', ['car', 'police car', 'bus', 'truck', 'taxi', 'ambulance', 'fire truck', 'van', 'motorcycle', 'bicycle', 'train', 'boat', 'airplane', 'helicopter', 'tractor', 'go kart', 'tank', 'jeep', 'race car', 'chassis']);
add('Nature', 'nature', ['tree', 'low poly tree', 'pine tree', 'palm tree', 'oak tree', 'cherry blossom', 'bush', 'flower', 'rock', 'boulder', 'grass', 'mushroom', 'log', 'stump', 'cliff', 'waterfall', 'cloud', 'mountain', 'cactus', 'coral', 'crops', 'hay bale', 'fence', 'bridge', 'pond']);
add('Nature', 'kit', ['nature pack', 'low poly nature', 'forest pack', 'tree pack', 'island map', 'farm', 'garden', 'camp', 'beach']);
add('Simulator/Tycoon', 'pet', ['pet', 'cat', 'dog', 'dragon pet', 'bunny', 'fox', 'panda', 'unicorn', 'bee', 'penguin', 'slime', 'low poly animal']);
add('City/Roleplay', 'character', ['npc', 'character rig', 'r15 rig', 'dummy', 'shopkeeper', 'zombie', 'monster', 'robot', 'knight', 'animal', 'horse', 'bird', 'fish']);
// Style passes: the same library seen through the look Apple builds in.
for (const s of ['low poly', 'cartoon', 'stylized']) {
  add('Nature', 'nature', [`${s} tree`, `${s} rock`, `${s} bush`]);
  add('City/Roleplay', 'building', [`${s} house`, `${s} shop`]);
  add('City/Roleplay', 'vehicle', [`${s} car`]);
  add('Simulator/Tycoon', 'prop', [`${s} chest`, `${s} props`]);
  add('Horror/Adventure', 'building', [`${s} castle`]);
  add('Shooter/Fighting', 'weapon', [`${s} sword`, `${s} gun`]);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    const res = await fetch(url, { headers: { accept: 'application/json' } }).catch(() => null);
    if (res?.ok) return res.json();
    await sleep(res?.status === 429 ? 8000 * (i + 1) : 1500 * (i + 1));
  }
  return null;
}

// Which kind a row is. The query's kind is the default; words in the model's own name override it,
// so "Police Car" found by the query "police station" is a vehicle, not a building.
const KIND_WORDS = [
  ['vehicle', /\b(car|cars|truck|bus|taxi|van|jeep|tank|boat|ship|plane|airplane|helicopter|bike|bicycle|motorcycle|train|kart|chassis|tractor|ambulance)\b/i],
  ['weapon', /\b(gun|rifle|pistol|shotgun|sniper|sword|katana|axe|bow|shield|spear|dagger|grenade|launcher|blade|weapon)\b/i],
  ['pet', /\bpets?\b/i],
  ['nature', /\b(tree|trees|bush|bushes|flower|flowers|rock|rocks|boulder|grass|mushroom|cliff|waterfall|cactus|palm|pine|oak|foliage|plant|plants)\b/i],
  ['kit', /\b(kit|pack|map|bundle|set|collection|template)\b/i],
  ['character', /\b(npc|rig|dummy|character|zombie|monster|robot|knight)\b/i],
  ['building', /\b(house|home|building|shop|store|cafe|restaurant|school|hospital|station|bank|hotel|tower|castle|mansion|cabin|temple|church|apartment|skyscraper|office|garage|factory|warehouse)\b/i],
];
function kindOf(name, fallback) {
  for (const [k, re] of KIND_WORDS) if (re.test(name)) return k;
  return fallback;
}

const ids = new Map(); // id -> { genres:Set, kind, found:Set }
let qn = 0;
for (const [genre, kind, kw] of Q) {
  qn++;
  let cursor = '';
  for (let p = 0; p < PAGES; p++) {
    const url = `${SEARCH}?keyword=${encodeURIComponent(kw)}&limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const d = await getJson(url);
    if (!d?.data) break;
    for (const hit of d.data) {
      const e = ids.get(hit.id) ?? { genres: new Set(), kind, found: new Set() };
      e.genres.add(genre);
      e.found.add(kw);
      ids.set(hit.id, e);
    }
    cursor = d.nextPageCursor;
    if (!cursor) break;
    await sleep(350);
  }
  if (qn % 20 === 0) console.error(`queries ${qn}/${Q.length}, ids ${ids.size}`);
}

const all = [...ids.keys()];
const rows = [];
const refused = { notFree: 0, notModel: 0, notPurchasable: 0, missing: 0 };
for (let i = 0; i < all.length; i += 100) {
  const batch = all.slice(i, i + 100);
  const d = await getJson(`${DETAILS}?assetIds=${batch.join(',')}`);
  if (!d?.data) { refused.missing += batch.length; continue; }
  const seen = new Set();
  for (const row of d.data) {
    const a = row.asset;
    if (!a) continue;
    seen.add(a.id);
    const free = row.fiatProduct?.isFree === true || (row.product?.isFree === true);
    if (!free) { refused.notFree++; continue; }
    if (a.typeId !== 10) { refused.notModel++; continue; }
    // visibilityStatus is a surfacing signal, not moderation (assets.ts, measured 2026-08-31).
    if (row.fiatProduct?.purchasable === false) { refused.notPurchasable++; continue; }
    const e = ids.get(a.id);
    const tech = a.modelTechnicalDetails ?? {};
    const counts = tech.instanceCounts ?? {};
    const creator = row.creator ?? {};
    const vote = row.voting ?? {};
    rows.push({
      id: `cs-${a.id}`,
      assetId: a.id,
      name: String(a.name ?? '').trim(),
      source: creator.id === 1 ? 'roblox-official' : 'creator-store',
      page: `https://create.roblox.com/store/asset/${a.id}`,
      creator: creator.name ?? null,
      creatorId: creator.id ?? null,
      creatorType: creator.type ?? null,
      verifiedCreator: creator.isVerifiedCreator === true,
      endorsed: a.isEndorsed === true,
      upVotes: vote.upVotes ?? null,
      downVotes: vote.downVotes ?? null,
      // Absent is not zero: a details row that does not say is recorded as unknown, never as clean.
      hasScripts: typeof a.hasScripts === 'boolean' ? a.hasScripts : null,
      scriptCount: typeof a.scriptCount === 'number' ? a.scriptCount : (a.hasScripts === false ? 0 : null),
      triangles: tech.objectMeshSummary?.triangles ?? null,
      vertices: tech.objectMeshSummary?.vertices ?? null,
      meshParts: counts.meshPart ?? null,
      sandboxed: a.capabilities?.shouldSandbox === true,
      categoryPath: a.categoryPath ?? null,
      objectTypes: a.objectTypes ?? [],
      genres: [...e.genres],
      kind: kindOf(String(a.name ?? ''), e.kind),
      tags: [...e.found].slice(0, 6),
      created: a.createdUtc ?? null,
      updated: a.updatedUtc ?? null,
      licence: 'Roblox-free',
    });
  }
  refused.missing += batch.filter((x) => !seen.has(x)).length;
  if ((i / 100) % 20 === 0) console.error(`details ${i}/${all.length}, kept ${rows.length}`);
  await sleep(300);
}

rows.sort((a, b) => a.assetId - b.assetId);
writeFileSync(OUT, gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
console.log(JSON.stringify({ queries: Q.length, pages: PAGES, ids: ids.size, kept: rows.length, refused, out: OUT }));
