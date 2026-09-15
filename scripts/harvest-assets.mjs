#!/usr/bin/env node
// Harvest the Apple asset library from communities that already built it.
//
// The rule this script exists to obey: NOTHING IS AUTHORED HERE. Every row points at a file some
// community published, under a licence that community printed, on a page that is recorded. The
// script reads public APIs, writes provenance rows, and stops. It never fetches geometry — the
// library is asset IDs and metadata (asset-library.ts header), so a 3,000-row harvest is ~4 MB.
//
// Sources, and why each one:
//   poly_haven  — 2,377 assets, uniformly CC0, a real JSON API, still publishing.
//   ambientcg   — ~2,000 PBR materials, uniformly CC0, a real JSON API.
// Both print their licence on an API field or a documented site-wide statement, so `licence` is
// recorded verbatim rather than inferred, which is what validateProvenance demands.
//
// OUTDATED IS A REFUSAL, NOT A WARNING. The owner's rule is that nothing stale enters the library.
// For a texture that means nothing — a CC0 rock is a CC0 rock — so the freshness gate lives in
// harvest-templates.mjs, where "outdated" means "written against a Roblox API that has changed".
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'packages', 'corpus', 'data', 'asset-seeds.json');
const NOW = new Date().toISOString();

const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'x';

async function getJson(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: { 'user-agent': 'apple-asset-harvest/1 (+roblox tooling)' } });
      if (r.ok) return await r.json();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500 * (i + 1)));
  }
  throw new Error(`fetch failed after ${tries}: ${url}`);
}

/**
 * Map a source's own category vocabulary onto ASSET_KINDS.
 *
 * Deliberately a whitelist with a stated default rather than a guess per asset: a mis-kinded row
 * is worse than a generically-kinded one, because the planner filters on kind and would never
 * see it again.
 */
const KIND_WORDS = [
  ['foliage', /\b(tree|plant|foliage|grass|bush|flower|leaf|leaves|forest|nature|moss|fern)\b/],
  ['character', /\b(character|human|person|people|creature|animal|figure)\b/],
  ['vehicle', /\b(vehicle|car|truck|boat|ship|plane|aircraft|bike|train)\b/],
  ['building', /\b(building|house|architecture|structure|wall|roof|door|window|bridge|tower|ruin)\b/],
  ['ground', /\b(ground|terrain|floor|road|path|pavement|gravel|sand|soil|dirt|rock|cliff|snow|asphalt|concrete|tiles?|paving)\b/],
  ['prop', /\b(furniture|prop|decor|tool|weapon|food|container|barrel|crate|lamp|chair|table|bench|sign)\b/],
];
function kindFrom(words, fallback) {
  const t = ' ' + words.join(' ').toLowerCase() + ' ';
  for (const [kind, re] of KIND_WORDS) if (re.test(t)) return kind;
  return fallback;
}

/* ------------------------------------------------------------------------ poly haven --- */

// Site-wide, printed at https://polyhaven.com/license and repeated on every asset page.
const PH_LICENCE = 'CC0';
const PH_LICENCE_URL = 'https://polyhaven.com/license';

async function polyHaven() {
  const rows = [];
  for (const [type, fallbackKind] of [['models', 'prop'], ['textures', 'texture'], ['hdris', 'texture']]) {
    const all = await getJson(`https://api.polyhaven.com/assets?t=${type}`);
    for (const [key, a] of Object.entries(all ?? {})) {
      const words = [...(a.categories ?? []), ...(a.tags ?? []), a.name ?? key];
      const authors = Object.keys(a.authors ?? {});
      rows.push({
        id: `poly_haven/${type}/${slug(key)}`,
        name: a.name ?? key,
        kind: type === 'hdris' ? 'texture' : kindFrom(words, fallbackKind),
        source: 'poly_haven',
        sourceUrl: `https://polyhaven.com/a/${encodeURIComponent(key)}`,
        licence: PH_LICENCE,
        licenceUrl: PH_LICENCE_URL,
        commercialUse: true,
        attributionRequired: false,
        author: authors.length ? authors.join(', ') : 'Poly Haven',
        retrievedAt: NOW,
        importedAt: null,
        modifications: [],
        robloxAssetId: null,
        triangles: null,
        textureResolution: null,
        boundsStuds: null,
        tags: [...new Set(words.flatMap((w) => slug(w).split('-')).filter((t) => t && t.length > 1))].slice(0, 24),
        sha256: null,
        // Not part of AssetProvenance — carried alongside so the ingest step knows what to fetch.
        _download: `https://api.polyhaven.com/files/${encodeURIComponent(key)}`,
        _publishedAt: a.date_published ? new Date(a.date_published * 1000).toISOString() : null,
      });
    }
  }
  return rows;
}

/* -------------------------------------------------------------------------- ambientcg --- */

const ACG_LICENCE = 'CC0 1.0 Universal';
const ACG_LICENCE_URL = 'https://ambientcg.com/terms';

async function ambientCg() {
  const rows = [];
  for (const type of ['Material', '3DModel']) {
    for (let offset = 0; offset < 4000; offset += 200) {
      const url = `https://ambientcg.com/api/v2/full_json?limit=200&offset=${offset}&type=${type}`
        + '&include=tagData,displayData';
      const page = await getJson(url);
      const found = page?.foundAssets ?? [];
      if (!found.length) break;
      for (const a of found) {
        const id = a.assetId;
        if (!id) continue;
        const words = [...(a.tags ?? []), a.displayName ?? id, a.category ?? ''];
        rows.push({
          id: `ambientcg/${slug(type)}/${slug(id)}`,
          name: a.displayName || id,
          kind: type === 'Material' ? kindFrom(words, 'texture') : kindFrom(words, 'prop'),
          source: 'ambientcg',
          sourceUrl: `https://ambientcg.com/view?id=${encodeURIComponent(id)}`,
          licence: ACG_LICENCE,
          licenceUrl: ACG_LICENCE_URL,
          commercialUse: true,
          attributionRequired: false,
          author: 'ambientCG (Lennart Demes)',
          retrievedAt: NOW,
          importedAt: null,
          modifications: [],
          robloxAssetId: null,
          triangles: null,
          textureResolution: null,
          boundsStuds: null,
          tags: [...new Set(words.flatMap((w) => slug(w).split('-')).filter((t) => t && t.length > 1))].slice(0, 24),
          sha256: null,
          _download: `https://ambientcg.com/get?file=${encodeURIComponent(id)}_1K-JPG.zip`,
          _publishedAt: a.releaseDate ? a.releaseDate.replace(' ', 'T') + 'Z' : null,
        });
      }
      if (found.length < 200) break;
    }
  }
  return rows;
}

/* ------------------------------------------------------------------------------- main --- */

const sources = { poly_haven: polyHaven, ambientcg: ambientCg };
const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = Object.entries(sources).filter(([k]) => !wanted.length || wanted.includes(k));

const assets = [];
const perSource = {};
for (const [name, fn] of run) {
  const before = assets.length;
  try {
    assets.push(...(await fn()));
  } catch (e) {
    // A source that fails must say so in the artefact rather than silently shrinking the harvest.
    perSource[name] = { error: String(e.message ?? e), count: 0 };
    console.error(`${name}: FAILED ${e.message ?? e}`);
    continue;
  }
  perSource[name] = { count: assets.length - before };
  console.error(`${name}: ${assets.length - before}`);
}

// An id collision would silently overwrite provenance, so it is counted and reported.
const seen = new Map();
const dupes = [];
for (const a of assets) {
  if (seen.has(a.id)) dupes.push(a.id);
  else seen.set(a.id, a);
}

const byKind = {};
for (const a of seen.values()) byKind[a.kind] = (byKind[a.kind] ?? 0) + 1;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({
  generatedAt: NOW,
  note: 'Harvested from public CC0 APIs. Metadata only — no asset bytes are stored or re-hosted.',
  perSource,
  duplicateIds: dupes.length,
  counts: { total: seen.size, byKind },
  assets: [...seen.values()],
}, null, 1) + '\n');
console.error(`\n${seen.size} assets -> ${OUT}`);
console.error(JSON.stringify(byKind));
