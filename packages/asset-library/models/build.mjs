#!/usr/bin/env node
// Derive the model library manifest from what is actually on disk (D-MODELLIB-1).
//
//   node packages/asset-library/models/build.mjs
//
// Writes, next to this file:
//   manifest.json  every usable row: a model file in the store, or a Creator Store asset id, with
//                  genre, kind, tags, licence, source, counts and size. Committed.
//   index.json     the compact subset the worker bundles for insert_library_model: only rows Apple
//                  may insert (a script-free file, or a script-free Creator Store id from a trusted
//                  creator). Committed.
//   SUMMARY.md     the counts by genre, kind, licence and source. Committed.
//
// File rows are read from ../models-store (gitignored) only when the source pack explicitly
// documents that it was built for Roblox. A generic game-ready model is not a Roblox model.
// A file that is not on disk is not in the manifest, whatever the catalog says.
// Triangle counts and bounding sizes are measured from the
// glTF accessors and OBJ vertices; FBX is not parsed, so those rows say null rather than a guess.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gunzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, '..');
const STORE = join(LIB, 'models-store');
const SOURCES = join(LIB, 'sources');

export const GENRES = ['Simulator/Tycoon', 'Obby', 'Horror/Adventure', 'Shooter/Fighting', 'City/Roleplay', 'Nature'];
export const KINDS = ['building', 'prop', 'nature', 'vehicle', 'character', 'pet', 'weapon', 'kit'];
const MODEL_EXT = new Set(['.glb', '.gltf', '.fbx', '.rbxm']);

const readJsonl = (p) => {
  const gz = existsSync(p + '.gz');
  if (!gz && !existsSync(p)) return [];
  const text = gz ? gunzipSync(readFileSync(p + '.gz')).toString('utf8') : readFileSync(p, 'utf8');
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
};
const tokens = (s) => String(s).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t && !/^\d+$/.test(t));

// Kind from a file's own name when the name is explicit; the pack's kind otherwise.
const KIND_WORDS = [
  ['vehicle', /\b(car|cars|truck|bus|taxi|van|jeep|tank|boat|ship|plane|airplane|helicopter|bike|bicycle|motorcycle|train|wagon|kart|tractor|ambulance|police|firetruck|vehicle|sedan|suv|race)\b/],
  ['weapon', /\b(gun|rifle|pistol|shotgun|sniper|sword|katana|axe|bow|shield|spear|dagger|grenade|blaster|blade|weapon|crossbow|mace|hammer|uzi|smg)\b/],
  ['pet', /\b(pet|pets|cat|dog|puppy|kitten|bunny|rabbit|fox|panda|penguin|chick|duck|pig|cow|sheep|horse|dragon|slime)\b/],
  ['character', /\b(character|npc|rig|human|man|woman|zombie|skeleton|knight|robot|monster|ghost|wizard|mage|rogue|barbarian|astronaut)\b/],
  ['nature', /\b(tree|trees|bush|bushes|flower|flowers|rock|rocks|stone|boulder|grass|mushroom|cliff|cactus|palm|pine|oak|birch|plant|plants|log|stump|crop|crops|hay|lily|reed|fern|leaf|leaves|coral)\b/],
  ['building', /\b(house|home|building|shop|store|cafe|restaurant|school|hospital|station|bank|hotel|tower|castle|mansion|cabin|temple|church|apartment|skyscraper|office|garage|factory|warehouse|barn|hut|tent|wall|roof|door|window|stairs|floor|gate|bridge)\b/],
];
export function kindOf(name, fallback) {
  const t = tokens(name).join(' ');
  for (const [k, re] of KIND_WORDS) if (re.test(t)) return k;
  return KINDS.includes(fallback) ? fallback : 'prop';
}

// ---------- measurement ----------
function glbStats(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) return null; // "glTF"
  const len = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
  return gltfStats(json);
}
function gltfStats(json) {
  let tri = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const m of json.meshes ?? []) {
    for (const p of m.primitives ?? []) {
      const pos = json.accessors?.[p.attributes?.POSITION];
      if (!pos) continue;
      const count = p.indices !== undefined ? json.accessors?.[p.indices]?.count ?? 0 : pos.count;
      if ((p.mode ?? 4) === 4) tri += Math.floor(count / 3);
      if (Array.isArray(pos.min) && Array.isArray(pos.max)) {
        for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], pos.min[i]); max[i] = Math.max(max[i], pos.max[i]); }
      }
    }
  }
  const size = min[0] === Infinity ? null : max.map((v, i) => Math.round((v - min[i]) * 100) / 100);
  return { triangles: tri, size, meshes: (json.meshes ?? []).length };
}
function objStats(text) {
  let tri = 0;
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const line of text.split('\n')) {
    if (line.startsWith('v ')) {
      const v = line.trim().split(/\s+/).slice(1, 4).map(Number);
      for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], v[i]); max[i] = Math.max(max[i], v[i]); }
    } else if (line.startsWith('f ')) {
      tri += Math.max(0, line.trim().split(/\s+/).length - 3);
    }
  }
  return { triangles: tri, size: min[0] === Infinity ? null : max.map((v, i) => Math.round((v - min[i]) * 100) / 100) };
}
function measure(path) {
  const ext = extname(path).toLowerCase();
  try {
    if (ext === '.glb') return glbStats(readFileSync(path));
    if (ext === '.gltf') return gltfStats(JSON.parse(readFileSync(path, 'utf8')));
    if (ext === '.obj') return objStats(readFileSync(path, 'utf8'));
  } catch {
    return { unreadable: true };
  }
  return null;
}

function walk(d, out = []) {
  if (!existsSync(d)) return out;
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

// ---------- rows ----------
const packs = new Map([...readJsonl(join(SOURCES, 'models-packs.jsonl')), ...readJsonl(join(SOURCES, 'models-github.jsonl'))].map((r) => [r.id, r]));
const scans = existsSync(join(HERE, 'scan-report.json')) ? JSON.parse(readFileSync(join(HERE, 'scan-report.json'), 'utf8')) : [];
const scanByFile = new Map(scans.map((s) => [s.file, s]));

const rows = [];
const seenSha = new Map();
let duplicates = 0;
for (const src of existsSync(STORE) ? readdirSync(STORE, { withFileTypes: true }) : []) {
  if (!src.isDirectory()) continue;
  for (const packDir of readdirSync(join(STORE, src.name), { withFileTypes: true })) {
    if (!packDir.isDirectory()) continue;
    const pack = packs.get(packDir.name);
    const root = join(STORE, src.name, packDir.name);
    // The owner's Roblox-only rule is fail-closed. A conversion to .glb/.rbxm does not prove
    // that the source model was purpose-built for Roblox.
    if (!pack || pack.robloxSpecific !== true || !existsSync(join(root, '.done'))) continue;
    for (const f of walk(root)) {
      const ext = extname(f).toLowerCase();
      if (!MODEL_EXT.has(ext)) continue;
      const rel = relative(LIB, f);
      const bytes = readFileSync(f);
      const sha256 = createHash('sha256').update(bytes).digest('hex');
      // The same file shipped in two packs (Kenney re-uses models across kits) is one row.
      if (seenSha.has(sha256)) { duplicates++; continue; }
      seenSha.set(sha256, rel);
      const name = basename(f, extname(f)).replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
      const sub = relative(root, dirname(f));
      const scan = ext === '.rbxm' ? scanByFile.get(relative(STORE, f)) ?? null : null;
      if (ext === '.rbxm' && (!scan || !scan.clean)) continue; // an unscanned or dirty Roblox file is never a row
      const m = ext === '.rbxm' ? null : measure(f);
      rows.push({
        id: `${pack.id}/${relative(root, f).replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9/_-]+/g, '-')}`,
        name,
        genres: (pack.genres ?? []).filter((g) => GENRES.includes(g)),
        kind: kindOf(`${name} ${sub}`, pack.kind),
        tags: [...new Set([...tokens(name), ...tokens(sub), ...(pack.tags ?? []).flatMap(tokens)])].slice(0, 16),
        licence: pack.licence,
        attribution: pack.attribution ?? null,
        creator: pack.creator ?? null,
        source: pack.source,
        pack: pack.id,
        packName: pack.name,
        page: pack.page ?? null,
        path: rel,
        format: ext.slice(1),
        bytes: bytes.length,
        sha256,
        triangles: m?.triangles ?? null,
        size: m?.size ?? scan?.size ?? null,
        parts: scan?.parts ?? null,
        scan: scan
          ? { method: 'lune rbx-dom parse', scriptsFound: scan.scriptsFound, removed: scan.removed, findings: scan.findings, clean: scan.clean }
          : { method: 'mesh file, cannot hold scripts', scriptsFound: 0, removed: 0, clean: true },
      });
    }
  }
}

// Creator Store rows: inserted by id, never downloaded. Roblox's own details decide scripts.
// Trust is Roblox itself, a Roblox endorsement, or a real vote record (5+ up, 4x the downs). The
// verified-creator badge is NOT a signal here: every one of the 49,548 harvested models had it
// (measured 2026-09-23), because the store surfaces only verified creators' models.
// `shouldSandbox` is not a signal either: 99.3% of the harvest carries it, script-free or not.
const TRUSTED = (r) => r.creatorId === 1 || r.endorsed === true || ((r.upVotes ?? 0) >= 5 && (r.upVotes ?? 0) >= 4 * (r.downVotes ?? 0));
/** One library model may not cost a place more than this many triangles. */
const MAX_TRIANGLES = 100_000;
const csSeen = new Set();
for (const r of [...readJsonl(join(SOURCES, 'models-creator-store.jsonl')), ...readJsonl(join(SOURCES, 'models-roblox-kits.jsonl'))]) {
  if (!Number.isInteger(r.assetId) || csSeen.has(r.assetId)) continue;
  csSeen.add(r.assetId);
  const scriptFree = r.hasScripts === false && (r.scriptCount ?? 0) === 0;
  // Compact on purpose: ~50,000 of these. What every Creator Store row shares is written once, in
  // manifest.creatorStore, instead of 50,000 times.
  rows.push({
    id: `cs-${r.assetId}`,
    name: r.name,
    genres: (r.genres ?? []).filter((g) => GENRES.includes(g)),
    kind: KINDS.includes(r.kind) ? r.kind : kindOf(r.name, 'prop'),
    tags: [...new Set([...tokens(r.name), ...(r.tags ?? []).flatMap(tokens)])].slice(0, 8),
    ...(r.creatorId === 1 ? { source: 'roblox-official' } : {}),
    creator: r.creator ?? null,
    assetId: r.assetId,
    format: 'creator-store',
    triangles: r.triangles ?? null,
    parts: r.meshParts ?? null,
    trusted: TRUSTED(r),
    scan: { clean: scriptFree, scriptsFound: r.scriptCount ?? (r.hasScripts ? null : 0) },
  });
}

rows.sort((a, b) => a.id.localeCompare(b.id));
// Names of other companies' characters and franchises. The 2026-09-20 catalogue was removed partly
// for rows like these, so a row that names one stays catalogued but is never offered for insert.
const BRANDED = /\b(pokemon|pikachu|charizard|mario|luigi|yoshi|bowser|nintendo|zelda|sonic|minecraft|creeper|fortnite|disney|mickey|marvel|spider ?man|iron ?man|batman|superman|dc comics|star ?wars|darth|vader|yoda|jedi|mandalorian|naruto|goku|dragon ?ball|one ?piece|demon ?slayer|jujutsu|shrek|toothless|how to train your dragon|dreamworks|family guy|peter griffin|simpsons?|rick and morty|minion|minions|spongebob|peppa|paw patrol|barbie|lego|hello kitty|sanrio|among ?us|freddy|fnaf|five nights|huggy|poppy playtime|skibidi|undertale|master ?chief|call of duty|gta|grand theft|mcdonald|coca|pepsi|nike|adidas|ferrari|lamborghini|bugatti|porsche|tesla|bmw|audi|mercedes|toyota|honda|nissan|ford|chevrolet|chevy|mclaren|harry potter|hogwarts|genshin|roblox doors|rainbow friends|thomas the tank|godzilla|transformers|optimus)\b/i;
for (const r of rows) if (BRANDED.test(r.name)) r.branded = true;
// An Animations/ folder holds clips rigged to a character, not something to stand in a place.
// A Creator Store id is unconditionally loadable only when Roblox itself owns it. Measured in Studio 2026-09-23:
// InsertService:LoadAsset (the plugin's only insert path; GetObjects is banned from the shipped
// plugin) answered "User is not authorized to access Asset" for all 20 trusted free models of other
// creators and loaded all 24 Roblox-owned ids. The rest stay catalogued as reference-only rows.
const insertable = (r) => r.scan.clean && !r.branded && !((r.triangles ?? 0) > MAX_TRIANGLES) && !/\/animations?\//i.test(r.path ?? '') && (r.path ? r.format !== 'obj' : r.trusted === true && r.source === 'roblox-official');
// AssetService:LoadAssetAsync can load a free third-party model only when the owner has already
// enabled third-party asset loading in this published experience. Keep those rows separate from
// always-loadable Roblox-owned rows; a Studio permission error is a normal, non-mutating result.
const conditional = (r) => r.assetId !== undefined && r.source !== 'roblox-official' && r.trusted === true
  && r.scan.clean && !r.branded && !((r.triangles ?? 0) > MAX_TRIANGLES);
const indexable = (r) => insertable(r) || conditional(r);

// ---------- outputs ----------
const count = (f) => rows.reduce((m, r) => { for (const k of [].concat(f(r))) m[k] = (m[k] ?? 0) + 1; return m; }, {});
const CS = {
  licence: 'Roblox-free',
  source: 'creator-store',
  page: 'https://create.roblox.com/store/asset/<assetId>',
  scanMethod: 'Roblox toolbox details (hasScripts, scriptCount); re-scanned in the place at insert, and the plugin refuses any asset carrying a script',
};
for (const r of rows) if (r.assetId !== undefined) { r.licence ??= CS.licence; r.source ??= CS.source; }
const licenceClass = (l) => /^CC0|public/i.test(l) ? 'CC0' : /^CC-BY/i.test(l) ? 'CC-BY' : /Roblox/i.test(l) ? 'Roblox-free' : /MIT|Apache|BSD|ISC|Unlicense|Zlib/i.test(l) ? 'MIT/permissive' : l;
const totals = {
  rows: rows.length,
  files: rows.filter((r) => r.path).length,
  creatorStoreIds: rows.filter((r) => r.assetId).length,
  insertable: rows.filter(insertable).length,
  conditional: rows.filter(conditional).length,
  duplicatesDropped: duplicates,
  brandedNotInsertable: rows.filter((r) => r.branded).length,
  // Catalogue rows that are never downloaded: their licence or host is not on the allowlist.
  referenceOnly: [...packs.values()].filter((p) => p.use === 'reference-only' || !/^(CC0|CC0-1\.0|Public ?Domain|CC-BY-[34]\.0|CC-BY|MIT|Apache-2\.0|BSD-[23]-Clause|Unlicense|ISC|0BSD|Zlib)$/i.test(String(p.licence ?? ''))).length,
  referenceOnlyByLicence: [...packs.values()].filter((p) => p.use === 'reference-only').reduce((m, p) => { const k = String(p.licence ?? 'unknown'); m[k] = (m[k] ?? 0) + 1; return m; }, {}),
  storeBytes: rows.filter((r) => r.path).reduce((n, r) => n + r.bytes, 0),
  byGenre: count((r) => (r.genres.length ? r.genres : ['(none)'])),
  byKind: count((r) => r.kind),
  byLicence: count((r) => licenceClass(r.licence)),
  bySource: count((r) => r.source),
  byFormat: count((r) => r.format),
};
// Creator Store rows are written without the defaults they share (licence, source) to keep the file small.
const slim = rows.map((r) => (r.assetId === undefined ? r : { ...r, licence: undefined, source: r.source === CS.source ? undefined : r.source }));
writeFileSync(join(HERE, 'manifest.json'), JSON.stringify({ generated: 'node packages/asset-library/models/build.mjs', creatorStore: CS, totals, rows: slim }) + '\n');

// index.json: [id, name, genreBits, kindIndex, tags, ref, licence, attribution|null, triangles|null, size|null, requiresThirdPartyLoading?]
// ref is a number for a Creator Store id and a store path for a file.
const licences = [...new Set(rows.filter(indexable).map((r) => r.licence))];
const index = {
  genres: GENRES,
  kinds: KINDS,
  licences,
  rows: rows.filter(indexable).map((r) => [
    r.id,
    r.name.slice(0, 60),
    r.genres.reduce((b, g) => b | (1 << GENRES.indexOf(g)), 0),
    KINDS.indexOf(r.kind),
    r.tags.filter((t) => !tokens(r.name).includes(t)).slice(0, 8).join(' '),
    r.assetId ?? r.path,
    licences.indexOf(r.licence),
    r.attribution && /^CC-BY/i.test(r.licence ?? '') ? r.attribution.slice(0, 120) : null,
    r.triangles,
    r.size,
    conditional(r) || undefined,
  ]),
};
writeFileSync(join(HERE, 'index.json'), JSON.stringify(index) + '\n');

const table = (o) => ['| key | rows |', '|---|---|', ...Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `| ${k} | ${v} |`)].join('\n');
writeFileSync(join(HERE, 'SUMMARY.md'), `# Model library (D-MODELLIB-1)

Generated by \`node packages/asset-library/models/build.mjs\` from the files in \`models-store/\` and the
Creator Store harvest. Do not edit by hand.

- Rows: **${totals.rows}** (${totals.files} downloaded model files, ${totals.creatorStoreIds} Creator Store ids)
- Normally loadable candidates: **${totals.insertable}** (script-free; Roblox-owned Creator Store ids). Conditional third-party candidates: **${totals.conditional}** (trusted, script-free and under ${MAX_TRIANGLES.toLocaleString('en-US')} triangles; require this experience to permit third-party asset loading). Downloaded files need an explicit preview and owner-approved upload path before the agent may offer them.
- Model files on disk: ${(totals.storeBytes / 1e6).toFixed(1)} MB (duplicates dropped: ${duplicates})

## By genre
${table(totals.byGenre)}

## By kind
${table(totals.byKind)}

## By licence
${table(totals.byLicence)}

## By source
${table(totals.bySource)}

## By format
${table(totals.byFormat)}
`);
console.log(JSON.stringify({ ...totals, byGenre: undefined, byKind: undefined, bySource: undefined }, null, 0));
