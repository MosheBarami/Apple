#!/usr/bin/env node
// Turn a pack into the assets inside it.
//
// 5,386 library rows are POINTERS TO ARCHIVES, not assets. A Kenney row named "City Kit
// (Suburban)" is one row standing for 130 separate buildings; an OpenGameArt row is a tileset. A
// search for "suburban house" finds the pack, an import cannot say which file it means, and the
// 130 things somebody actually wanted are invisible.
//
// This unpacks them ONCE, HERE, and writes one provenance row per file — each with its own name,
// its own kind and its own tags. Nothing is stored: the archive is read in memory, the entry names
// are recorded, and the bytes are discarded. The import path re-fetches the archive and finds the
// entry again by the slug in the row's id, which is why the id has to be derived from the entry
// name rather than from a counter.
//
// ONE ZIP READER, NOT TWO. It bundles `apps/worker/src/unzip.ts` rather than reimplementing the
// format here. A second reader would be a second set of bugs, and the two would disagree about
// exactly the archives that are unusual — which is the only kind where it matters.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIB = join(ROOT, 'packages', 'corpus', 'data', 'library');
const WORKER = join(ROOT, 'apps', 'worker');
const NOW = new Date().toISOString();

const arg = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const LIMIT = Number(arg('--limit', '0')) || Infinity;

const bundled = join(mkdtempSync(join(tmpdir(), 'expand-')), 'unzip.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'unzip.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + bundled],
  { cwd: WORKER, stdio: 'pipe' });
const { listZip } = await import(`file://${bundled}`);

const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s/-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'x';

/** The same word table the harvester uses, for the same reason: a mis-kinded row is invisible. */
const KIND_WORDS = [
  ['foliage', /\b(tree|plant|foliage|grass|bush|flower|leaf|leaves|forest|nature|moss|fern|cactus|mushroom)\b/],
  ['character', /\b(character|human|person|people|creature|animal|figure|npc|avatar|zombie|skeleton|knight|robot)\b/],
  ['vehicle', /\b(vehicle|car|truck|boat|ship|plane|aircraft|bike|train|tractor|van|bus)\b/],
  ['building', /\b(building|house|architecture|structure|wall|roof|door|window|bridge|tower|ruin|castle|fence|stairs)\b/],
  ['ground', /\b(ground|terrain|floor|road|path|pavement|gravel|sand|soil|dirt|rock|cliff|snow|asphalt|concrete|tiles?|paving)\b/],
  ['ui_icon', /\b(icon|button|cursor|badge|ui|hud|interface|menu|logo|arrow|cross|check)\b/],
  ['particle', /\b(particle|smoke|spark|flame|fire|explosion|dust|trail|star)\b/],
  ['texture', /\b(texture|pattern|material|surface|tile)\b/],
  ['prop', /\b(furniture|prop|decor|tool|weapon|sword|shield|gun|food|container|barrel|crate|lamp|chair|table|bench|sign|chest|key|coin|gem|bottle|book)\b/],
];
function kindFrom(words, fallback) {
  const t = ' ' + words.filter(Boolean).join(' ').toLowerCase().replace(/[-_/]+/g, ' ') + ' ';
  for (const [kind, re] of KIND_WORDS) if (re.test(t)) return kind;
  return fallback;
}

/** "buildingTiles_002.png" -> "Building Tiles 002". The file name is the only name a file has. */
function titleFrom(path) {
  const base = path.split('/').pop()?.replace(/\.[a-z0-9]+$/i, '') ?? path;
  return base
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase()) || base;
}

async function fetchBuffer(url, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'user-agent': 'apple-asset-harvest/2 (+roblox asset library)' },
        signal: AbortSignal.timeout(180_000),
      });
      if (res.ok) return await res.arrayBuffer();
      if (res.status === 404) return null;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
  }
  return null;
}

/**
 * One row per image inside an archive.
 *
 * ROBLOX-INGESTIBLE FILES ONLY. A Kenney pack also carries .obj, .fbx, .mtl and a licence text,
 * and a row for a .obj would be a row with no upload path — the exact thing this whole pass exists
 * to remove. The formats here are the ones Roblox's own documentation lists.
 */
function rowsFromEntries(pack, entries) {
  const out = [];
  const seen = new Set();
  for (const e of entries) {
    if (!/\.(png|jpe?g|bmp|tga)$/i.test(e.name)) continue;
    if (e.name.includes('__MACOSX') || e.name.split('/').pop()?.startsWith('.')) continue;
    // A pack's own preview and its licence card are not assets in it.
    if (/\b(preview|sample|license|licence|readme|thumbnail)\b/i.test(e.name)) continue;
    const id = `${pack.source}/${pack.packSlug}/${slug(e.name.replace(/\.[a-z0-9]+$/i, ''))}`;
    // Two entries in different folders can slugify to the same id, and the import path finds an
    // entry BY that slug — so a collision would make one of them unreachable. Dropped and counted.
    if (seen.has(id)) continue;
    seen.add(id);
    const title = titleFrom(e.name);
    out.push({
      id,
      name: title,
      kind: kindFrom([title, e.name, pack.name], 'prop'),
      source: pack.source,
      sourceUrl: pack.sourceUrl,
      licence: pack.licence,
      licenceUrl: pack.licenceUrl,
      commercialUse: true,
      attributionRequired: pack.attributionRequired,
      author: pack.author,
      retrievedAt: NOW,
      importedAt: null,
      // The pack it came out of, recorded as a modification because that is what it is: the file
      // was taken out of a distribution somebody assembled, and the row should say so.
      modifications: [`extracted from ${pack.name}`],
      robloxAssetId: null,
      triangles: null,
      textureResolution: null,
      boundsStuds: null,
      tags: [...new Set([
        ...slug(pack.name).split('-'),
        ...slug(title).split('-'),
      ].filter((t) => t && t.length > 1))].slice(0, 24),
      sha256: null,
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------ kenney --- */

async function expandKenney() {
  const packs = JSON.parse(readFileSync(join(LIB, 'kenney.json'), 'utf8')).assets.slice(0, LIMIT);
  const rows = [];
  const failed = [];
  let done = 0;
  for (const p of packs) {
    if (!p._download) { failed.push({ id: p.id, why: 'the pack row has no archive URL' }); continue; }
    const buf = await fetchBuffer(p._download);
    if (!buf) { failed.push({ id: p.id, why: `could not download ${p._download}` }); continue; }
    const listing = listZip(buf);
    if (!listing.ok) { failed.push({ id: p.id, why: listing.error }); continue; }
    const before = rows.length;
    rows.push(...rowsFromEntries({
      source: 'kenney',
      packSlug: p.id.split('/')[2] ?? slug(p.name),
      name: p.name,
      sourceUrl: p.sourceUrl,
      licence: p.licence,
      licenceUrl: p.licenceUrl,
      author: p.author,
      attributionRequired: p.attributionRequired,
    }, listing.entries));
    // A pack that yielded nothing is worth naming: it means the archive held only geometry, which
    // is true of several Kenney 3D kits and is a fact about the pack, not a failure of this pass.
    if (rows.length === before) failed.push({ id: p.id, why: 'no Roblox-ingestible image in the archive' });
    if (++done % 20 === 0) console.error(`kenney ${done}/${packs.length} — ${rows.length} rows`);
  }
  return { rows, failed, packs: packs.length };
}

/* ------------------------------------------------------------------------- opengameart --- */

/**
 * OpenGameArt expands from METADATA, not by downloading.
 *
 * The community mirror lists every file of every submission with its own URL, so a submission with
 * five loose PNGs becomes five rows without fetching anything. Submissions that ship a single zip
 * stay as they are: downloading 5,171 archives — one of them is 34 MB — to find out would cost
 * tens of gigabytes for rows whose import path has to re-fetch the archive anyway.
 */
async function expandOpenGameArt() {
  const rows = [];
  const skipped = [];
  let offset = 0;
  const splits = ['2d_art', 'texture', 'concept_art'];
  for (const split of splits) {
    for (offset = 0; offset < 20000; offset += 100) {
      let page;
      try {
        const res = await fetch(`https://datasets-server.huggingface.co/rows?dataset=nyuuzyou%2FOpenGameArt-CC0`
          + `&config=default&split=${split}&offset=${offset}&length=100`, { signal: AbortSignal.timeout(60_000) });
        if (!res.ok) break;
        page = await res.json();
      } catch { break; }
      const got = page?.rows ?? [];
      if (!got.length) break;
      for (const { row: r } of got) {
        const files = (Array.isArray(r?.files) ? r.files : []).filter((f) => /\.(png|jpe?g|bmp|tga)$/i.test(f?.name ?? ''));
        if (!files.length) { skipped.push({ id: r?.id ?? r?.title, why: 'the submission ships an archive, not loose images' }); continue; }
        const packSlug = slug(r?.id ?? r?.title ?? String(offset));
        for (const f of files) {
          const title = titleFrom(f.name);
          rows.push({
            id: `opengameart/${packSlug}/${slug(f.name.replace(/\.[a-z0-9]+$/i, ''))}`,
            name: title,
            kind: kindFrom([title, f.name, r?.title, ...(Array.isArray(r?.tags) ? r.tags : [])], 'ui_icon'),
            source: 'opengameart',
            sourceUrl: r?.url ?? 'https://opengameart.org',
            licence: 'CC0',
            licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            commercialUse: true,
            attributionRequired: false,
            author: r?.author ?? r?.submitter ?? 'OpenGameArt contributor',
            retrievedAt: NOW,
            importedAt: null,
            modifications: [`one file of "${r?.title ?? 'a submission'}"`],
            robloxAssetId: null,
            triangles: null,
            textureResolution: null,
            boundsStuds: null,
            tags: [...new Set([
              ...(Array.isArray(r?.tags) ? r.tags : []).flatMap((t) => slug(t).split('-')),
              ...slug(title).split('-'),
            ].filter((t) => t && t.length > 1))].slice(0, 24),
            sha256: null,
            // The file's own direct URL, which is what makes these importable with no archive at
            // all — the one thing the pack rows could not offer.
            _download: f.url,
          });
        }
      }
      if (got.length < 100) break;
    }
  }
  return { rows, skipped };
}

/* -------------------------------------------------------------------------------- main --- */

const which = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const run = [
  ['kenney', expandKenney],
  ['opengameart', expandOpenGameArt],
].filter(([k]) => !which.length || which.includes(k));

for (const [name, fn] of run) {
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (e) {
    writeFileSync(join(LIB, `${name}-expanded.json`), JSON.stringify({
      generatedAt: NOW, source: name, failed: true, error: String(e.message ?? e), assets: [],
    }, null, 1) + '\n');
    console.error(`${name}: FAILED — ${e.message ?? e}`);
    continue;
  }
  const byKind = {};
  for (const r of result.rows) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  writeFileSync(join(LIB, `${name}-expanded.json`), JSON.stringify({
    generatedAt: NOW,
    source: name,
    failed: false,
    tookMs: Date.now() - started,
    note: 'One row per FILE, expanded from the pack rows in ' + name + '.json. The pack rows stay: '
      + 'they are what a person searches for when they want a whole kit.',
    counts: { rows: result.rows.length, byKind },
    failedPacks: result.failed ?? [],
    skipped: (result.skipped ?? []).length,
    assets: result.rows,
  }, null, 1) + '\n');
  console.error(`${name}: ${result.rows.length} rows  ${JSON.stringify(byKind)}`);
  if (result.failed?.length) console.error(`  ${result.failed.length} packs yielded nothing`);
  if (result.skipped?.length) console.error(`  ${result.skipped.length} submissions ship archives rather than loose files`);
}
