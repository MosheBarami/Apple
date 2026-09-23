#!/usr/bin/env node
// The sound and effect library (D-FXLIB-1): writes sfx/manifest.json + sfx/index.json and
// vfx/manifest.json + vfx/index.json from what is on disk.
//
//   node packages/asset-library/build-fx-manifest.mjs
//
// Sources, and what "on disk" means for each:
// - sfx/packs/, vfx/packs/: committed CC0 packs. Every file is walked; its licence is read from the
//   pack's own License.txt and its metadata (duration, size) from sources/<source>.jsonl.
// - sources/*.jsonl: one row per item a harvester found, with its licence and source URL. A row
//   with an assetId is playable in Roblox as it is; a row with a file under sfx-store/ or
//   vfx-store/ is a download kept on this machine only (gitignored: not redistributable or too big);
//   a row with neither is a reference to a page.
// - vfx/presets.mjs: the effect presets insert_vfx builds.
//
// Every category is derived by fx-categories.mjs from the item's own name and tags, never typed.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sfxCategory, vfxCategory, SFX_CATEGORIES, SFX_RULES, VFX_RULES, tokensOf } from './fx-categories.mjs';
import { PRESETS, ENGINE_TEXTURES } from './vfx/presets.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));

/** How many playable Roblox sounds the worker bundles (the rest stay searchable in the manifest's source files). */
export const SFX_INDEX_CAP = 30000;

function readJsonl(file) {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
}

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, out);
    else out.push(abs);
  }
  return out;
}

function licenceOf(packDir) {
  const file = readdirSync(packDir).find((f) => /^licen[cs]e(\.txt|\.md)?$/i.test(f));
  if (!file) return { license: null, licenseFile: null };
  const text = readFileSync(join(packDir, file), 'utf8');
  const license = /CC0|Creative Commons Zero|creativecommons\.org\/publicdomain\/zero/i.test(text) ? 'CC0-1.0'
    : /creativecommons\.org\/licenses\/by\/(\d\.\d)/i.test(text) ? `CC-BY-${RegExp.$1}` : null;
  return { license, licenseFile: relative(HERE, join(packDir, file)) };
}

function sourceFiles(kind) {
  const dir = join(HERE, kind, 'sources');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.jsonl') && f !== 'skipped.jsonl').sort();
}

const tally = (rows, key) => {
  const out = {};
  for (const r of rows) {
    const k = typeof key === 'function' ? key(r) : r[key];
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

/** "Coin_Pickup-02.ogg" -> "Coin Pickup 02". */
const cleanName = (name) => String(name ?? '').replace(/\.(wav|mp3|ogg|flac|aiff?)$/i, '').replace(/[_\s]+/g, ' ').trim().slice(0, 80);

// --- SFX -------------------------------------------------------------------------------------

/** Roblox's own licence line for Creator Store audio: free to use inside Roblox experiences. */
const ROBLOX_LICENSE = { licensed: 'Roblox-licensed-partner-audio', community: 'Roblox-Creator-Store-free-audio' };

function sfxRows() {
  const rows = [];
  const skipped = [];
  // Committed packs: walk every audio file, take metadata from the harvester's row when there is one.
  const packsDir = join(HERE, 'sfx', 'packs');
  const meta = new Map();
  for (const f of sourceFiles('sfx')) for (const r of readJsonl(join(HERE, 'sfx', 'sources', f))) if (r.file) meta.set(r.file, r);
  const packs = [];
  for (const pack of existsSync(packsDir) ? readdirSync(packsDir).sort() : []) {
    const dir = join(packsDir, pack);
    if (!statSync(dir).isDirectory()) continue;
    const { license, licenseFile } = licenceOf(dir);
    let files = 0;
    let bytes = 0;
    for (const abs of walk(dir)) {
      if (!/\.(ogg|mp3|wav)$/i.test(abs)) continue;
      const file = relative(HERE, abs);
      const m = meta.get(file) ?? {};
      if (/^preview\.ogg$/i.test(abs.split('/').pop())) { skipped.push({ file, reason: 'pack preview medley, not a sound effect' }); continue; }
      files += 1;
      bytes += statSync(abs).size;
      const name = cleanName(m.name ?? abs.split('/').pop());
      const tags = [...new Set([...(m.tags ?? []), ...tokensOf(m.pack ?? pack.replace(/^kenney-/, ''))])];
      rows.push({
        id: m.id ?? `pack:${file}`,
        source: m.source ?? pack.split('-')[0],
        name,
        category: sfxCategory({ name, tags: [...tags, file.split('/').slice(-2, -1)[0]], music: /music|jingle/i.test(pack) }),
        durationSec: m.durationSec ?? null,
        license,
        sourceUrl: m.sourceUrl ?? null,
        use: 'upload-source',
        file,
      });
    }
    packs.push({ id: pack, dir: relative(HERE, dir), license, licenseFile, files, bytes });
  }
  // Harvested rows that are not pack files: Roblox asset ids, gitignored store files, references.
  for (const f of sourceFiles('sfx')) {
    for (const r of readJsonl(join(HERE, 'sfx', 'sources', f))) {
      if (r.file && r.file.startsWith('sfx/packs/')) continue; // walked above
      const music = (r.audioType === 'Music' && !/\(SFX\)\s*$/i.test(r.name ?? '')) || /music/i.test(r.pack ?? '') || (r.tags ?? []).some((t) => /^music$/i.test(t));
      const name = cleanName(r.name);
      const query = (r.queries ?? []).find((q) => q) ?? r.query ?? '';
      const row = {
        id: r.id ?? `${r.source}:${r.assetId}`,
        source: r.source,
        name,
        category: sfxCategory({ name, tags: r.tags ?? [], query, music }),
        durationSec: r.durationSec ?? null,
        license: r.source === 'roblox' ? ROBLOX_LICENSE[r.tier] ?? ROBLOX_LICENSE.community : r.license ?? null,
        sourceUrl: r.sourceUrl ?? (r.assetId ? `https://create.roblox.com/store/asset/${r.assetId}` : null),
        use: r.assetId ? 'play' : r.file ? 'store-only' : 'reference-only',
      };
      if (r.assetId) Object.assign(row, { assetId: r.assetId, tier: r.tier, creator: r.creator, upVotes: r.upVotes ?? 0 });
      if (r.file) row.file = r.file;
      if (!row.license || !row.sourceUrl) { skipped.push({ id: r.id, reason: 'no licence or source URL' }); continue; }
      rows.push(row);
    }
  }
  return { rows, packs, skipped: [...skipped, ...readJsonl(join(HERE, 'sfx', 'sources', 'skipped.jsonl'))] };
}

/**
 * The worker bundles only rows it can PLAY: Roblox asset ids. Licensed partner audio first (Roblox,
 * APM, Monstercat, ProSoundEffects: cleared for every experience), then community uploads by votes.
 * Compact rows: [assetId, name, category, seconds, flags] — flags "L" licensed, "C" community.
 * Rows are ordered by rank within their category, so a search that ties keeps the better-cleared, better-liked sound.
 * `categoryWords` is the category rule itself, so the worker maps a query to a category with the
 * same words that categorised the rows.
 */
function sfxIndex(rows) {
  const playable = rows.filter((r) => r.use === 'play');
  const score = (r) => (r.tier === 'licensed' ? 1e9 : 0) + (r.upVotes ?? 0);
  const ranked = [...playable].sort((a, b) => score(b) - score(a) || a.assetId - b.assetId);
  // Filled round-robin by category (music counts triple), so 18k music tracks cannot crowd out the
  // few hundred "reward" or "win" stings a game needs most.
  const seen = new Map();
  const turn = new Map(ranked.map((r) => {
    const n = seen.get(r.category) ?? 0;
    seen.set(r.category, n + 1);
    return [r, n / (r.category === 'music' ? 3 : 1)];
  }));
  const chosen = ranked
    .map((r, i) => [r, i])
    .sort(([a, i], [b, j]) => turn.get(a) - turn.get(b) || i - j)
    .slice(0, SFX_INDEX_CAP)
    .map(([r]) => r);
  return {
    version: 1,
    columns: ['assetId', 'name', 'category', 'seconds', 'flags'],
    categories: SFX_CATEGORIES,
    categoryWords: Object.fromEntries(SFX_RULES),
    rows: chosen.map((r) => [r.assetId, r.name.slice(0, 60), r.category, r.durationSec == null ? null : Math.round(r.durationSec * 10) / 10, r.tier === 'licensed' ? 'L' : 'C']),
  };
}

// --- VFX -------------------------------------------------------------------------------------

function vfxRows() {
  const rows = [];
  const packsDir = join(HERE, 'vfx', 'packs');
  const meta = new Map();
  for (const f of sourceFiles('vfx')) for (const r of readJsonl(join(HERE, 'vfx', 'sources', f))) if (r.file) meta.set(r.file, r);
  const packs = [];
  for (const pack of existsSync(packsDir) ? readdirSync(packsDir).sort() : []) {
    const dir = join(packsDir, pack);
    if (!statSync(dir).isDirectory()) continue;
    const { license, licenseFile } = licenceOf(dir);
    let files = 0;
    let bytes = 0;
    for (const abs of walk(dir)) {
      if (!/\.png$/i.test(abs)) continue;
      const file = relative(HERE, abs);
      const m = meta.get(file) ?? {};
      files += 1;
      bytes += statSync(abs).size;
      const name = cleanName(m.name ?? abs.split('/').pop().replace(/\.png$/i, ''));
      rows.push({
        id: m.id ?? `pack:${file}`, source: m.source ?? pack.split('-')[0], kind: m.kind ?? 'texture', name,
        category: vfxCategory({ name, tags: [...(m.tags ?? []), ...file.split('/').slice(2, -1)] }),
        license, sourceUrl: m.sourceUrl ?? null, use: 'upload-source', file,
        ...(m.width ? { width: m.width, height: m.height } : {}), ...(m.grid ? { grid: m.grid } : {}),
      });
    }
    packs.push({ id: pack, dir: relative(HERE, dir), license, licenseFile, files, bytes });
  }
  const scans = existsSync(join(HERE, 'vfx', 'scan-report.json')) ? JSON.parse(readFileSync(join(HERE, 'vfx', 'scan-report.json'), 'utf8')) : [];
  const scanByFile = new Map(scans.map((s) => [s.file, s]));
  for (const f of sourceFiles('vfx')) {
    for (const r of readJsonl(join(HERE, 'vfx', 'sources', f))) {
      if (r.file && r.file.startsWith('vfx/packs/')) continue;
      const name = cleanName(r.name);
      const row = {
        id: r.id ?? `${r.source}:${r.assetId}`, source: r.source, kind: r.kind ?? 'pack', name,
        category: vfxCategory({ name, tags: r.tags ?? [], query: r.query ?? '' }),
        license: r.license ?? null, sourceUrl: r.sourceUrl ?? (r.assetId ? `https://create.roblox.com/store/asset/${r.assetId}` : null),
        // 'by-id': a Creator Store id kept as a catalogue reference. Nothing inserts it yet:
        // insert_asset refuses every Model, and the plugin takes engine particle textures only.
        use: r.assetId ? 'by-id' : r.file ? 'store-only' : 'reference-only',
      };
      if (r.assetId) Object.assign(row, { assetId: r.assetId, creator: r.creator ?? null });
      if (r.file) row.file = r.file;
      if (r.scan) row.scan = r.scan;
      const scan = r.file ? scanByFile.get(r.file) : null;
      if (scan) row.scan = { method: scan.method, verdict: scan.verdict, scripts: scan.scripts, findings: scan.findings };
      if (!row.license || !row.sourceUrl) continue;
      rows.push(row);
    }
  }
  for (const [key, path] of Object.entries(ENGINE_TEXTURES)) {
    rows.push({
      id: `engine:${path}`, source: 'roblox-engine', kind: 'texture', name: key, category: vfxCategory({ name: key }),
      license: 'Roblox-engine-content', sourceUrl: 'https://create.roblox.com/docs/reference/engine/classes/ParticleEmitter#Texture',
      use: 'engine', texture: `rbxasset://textures/${path}`,
    });
  }
  return { rows, packs, scans };
}

function presetIndex() {
  return PRESETS.map((p) => ({
    name: p.name, category: p.category, kind: p.kind, summary: p.summary, use: p.use,
    ...(p.attachments ? { attachments: p.attachments } : {}),
    parts: p.parts.map(({ packTexture, ...part }) => ({ ...part, ...(packTexture ? { packTexture } : {}) })),
  }));
}

export function build() {
  const sfx = sfxRows();
  const vfx = vfxRows();
  const bytesOf = (packs) => packs.reduce((nb, p) => nb + p.bytes, 0);
  const sfxManifest = {
    generatedBy: 'packages/asset-library/build-fx-manifest.mjs',
    decision: 'D-FXLIB-1',
    totals: {
      items: sfx.rows.length,
      byUse: tally(sfx.rows, 'use'),
      byCategory: tally(sfx.rows, 'category'),
      byLicense: tally(sfx.rows, 'license'),
      bySource: tally(sfx.rows, 'source'),
      playableIndexed: Math.min(SFX_INDEX_CAP, sfx.rows.filter((r) => r.use === 'play').length),
      committedPackBytes: bytesOf(sfx.packs),
    },
    packs: sfx.packs,
    skipped: sfx.skipped.length,
    // The rows themselves are sources/*.jsonl (committed) and index.json; repeating 70k rows here
    // would double the repository weight for nothing.
    rowsIn: ['sfx/packs/', ...sourceFiles('sfx').map((f) => `sfx/sources/${f}`)],
  };
  const vfxManifest = {
    generatedBy: 'packages/asset-library/build-fx-manifest.mjs',
    decision: 'D-FXLIB-1',
    totals: {
      items: vfx.rows.length,
      presets: PRESETS.length,
      byUse: tally(vfx.rows, 'use'),
      byCategory: tally(vfx.rows, 'category'),
      byLicense: tally(vfx.rows, 'license'),
      bySource: tally(vfx.rows, 'source'),
      presetsByCategory: tally(PRESETS, 'category'),
      committedPackBytes: bytesOf(vfx.packs),
      scanned: vfx.scans.length,
      scanVerdicts: tally(vfx.scans, 'verdict'),
    },
    packs: vfx.packs,
    presets: PRESETS.map((p) => ({ name: p.name, category: p.category, kind: p.kind, parts: p.parts.map((x) => x.className) })),
    rows: vfx.rows,
  };
  const vfxIndex = {
    version: 1,
    engineTextures: ENGINE_TEXTURES,
    categoryWords: Object.fromEntries(VFX_RULES),
    presets: presetIndex(),
    textures: vfx.rows.filter((r) => r.use === 'upload-source').map((r) => [r.file, r.category]),
  };
  return { sfxManifest, sfxIndex: sfxIndex(sfx.rows), vfxManifest, vfxIndex, rows: { sfx: sfx.rows, vfx: vfx.rows } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = build();
  writeFileSync(join(HERE, 'sfx', 'manifest.json'), JSON.stringify(out.sfxManifest) + '\n');
  writeFileSync(join(HERE, 'sfx', 'index.json'), JSON.stringify(out.sfxIndex) + '\n');
  writeFileSync(join(HERE, 'vfx', 'manifest.json'), JSON.stringify(out.vfxManifest, null, 1) + '\n');
  writeFileSync(join(HERE, 'vfx', 'index.json'), JSON.stringify(out.vfxIndex) + '\n');
  const t = out.sfxManifest.totals;
  console.log(`sfx: ${t.items} items (${JSON.stringify(t.byUse)}), index ${out.sfxIndex.rows.length}`);
  console.log(`vfx: ${out.vfxManifest.totals.items} items, ${PRESETS.length} presets`);
}
