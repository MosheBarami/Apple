#!/usr/bin/env node
// The big harvest: everything a community already assembled, on one pass, metadata only.
//
// WHAT CHANGED SINCE harvest-assets.mjs. That script took the two sources with the most convenient
// APIs — Poly Haven and ambientCG — and stopped at 7,277 rows, which is a demo rather than a
// library. A 15-source survey then probed every candidate by actually fetching it, and this is
// built from what survived verification. Nothing here is authored; every row points at work
// somebody else published, under a licence they printed, on a page recorded in the row.
//
// THE ONE SOURCE THAT NEEDS NO UPLOAD AT ALL is the Roblox Creator Store: those rows already carry
// a Roblox asset id, so a game references them directly. Everything else is a catalogue entry
// until its bytes are imported, and the library says so by leaving robloxAssetId null.
//
// LICENCE IS A GATE, NOT A COLUMN. Per-asset and per-set licences are read from the source and
// anything whose canonical id is not allowed in the library is DROPPED AND COUNTED. A harvest that
// silently kept a CC-BY-NC icon would put an obligation on a paying customer that nobody agreed to.
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'packages', 'corpus', 'data', 'library');
const NOW = new Date().toISOString();
const UA = { 'user-agent': 'apple-asset-harvest/2 (+roblox asset library; contact via repository)' };

const slug = (s) =>
  String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s/-]/g, '').trim()
    .replace(/[\s_]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'x';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, { json = true, tries = 3, headers = {} } = {}) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: { ...UA, ...headers } });
      if (res.status === 404) return null;
      if (res.ok) return json ? await res.json() : await res.text();
      lastErr = new Error(`HTTP ${res.status}`);
      // 429 and 5xx are worth waiting out; a 400 will be a 400 again.
      if (res.status < 500 && res.status !== 429) break;
    } catch (e) { lastErr = e; }
    await sleep(600 * (i + 1));
  }
  throw lastErr ?? new Error(`failed: ${url}`);
}

/* ---------------------------------------------------------------------- licence gate --- */

/**
 * The canonical-id mapping, kept deliberately in step with normaliseLicence in
 * apps/worker/src/asset-library.ts. It is duplicated rather than imported because that file is
 * TypeScript inside a Worker bundle and this is a plain script — and the duplication is made safe
 * by tests/library-harvest.test.mjs, which asserts the two agree on every string this harvest
 * actually produced. A silent divergence here would admit a licence the worker would then refuse.
 */
const DENY = /(\bnc\b|non[- ]?commercial|\bsa\b|share[- ]?alike|\bgpl\b|general public|open font|\bofl\b)/i;
function canonicalLicence(verbatim) {
  const t = String(verbatim ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (!t) return null;
  const isCc = /\bcc\b|creative commons/.test(t);
  const nc = /\bnc\b|non[- ]?commercial/.test(t);
  const sa = /\bsa\b|share[- ]?alike/.test(t);
  if (isCc && nc && sa) return 'CC-BY-NC-SA-4.0';
  if (isCc && nc) return 'CC-BY-NC-4.0';
  if (isCc && sa) return 'CC-BY-SA-4.0';
  if (/\bgpl\b|general public license/.test(t)) return /\b2(\.0)?\b/.test(t) ? 'GPL-2.0' : 'GPL-3.0';
  if (/\bmit\b/.test(t)) return 'MIT';
  if (/\bisc\b/.test(t)) return 'ISC';
  if (/apache/.test(t)) return 'Apache-2.0';
  if (/bsd[- ]?3|bsd 3-clause/.test(t)) return 'BSD-3-Clause';
  if (/\bunlicense\b/.test(t)) return 'Unlicense';
  if (/open font license|\bofl\b|sil open font/.test(t)) return 'OFL-1.1';
  if (/\bcc0\b|creative commons zero|public domain dedication/.test(t)) return 'CC0-1.0';
  if (/^pd$|public domain/.test(t)) return 'PD';
  if (/\bcc[- ]?by\b|creative commons attribution/.test(t)) return /3\.0/.test(t) ? 'CC-BY-3.0' : 'CC-BY-4.0';
  if (/roblox terms of use|roblox-tou/.test(t)) return 'ROBLOX-TOU';
  return null;
}
const ALLOWED = new Set(['CC0-1.0', 'CC-BY-4.0', 'CC-BY-3.0', 'MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause', 'Unlicense', 'PD', 'ROBLOX-TOU']);
const ATTRIBUTION = new Set(['CC-BY-4.0', 'CC-BY-3.0', 'MIT', 'ISC', 'Apache-2.0', 'BSD-3-Clause']);

/**
 * Map a source's own vocabulary onto ASSET_KINDS.
 *
 * A whitelist with a stated default rather than a guess per asset: a mis-kinded row is worse than
 * a generically-kinded one, because `keep()` in asset-library.ts filters STRICTLY on kind and the
 * planner would never see it again.
 *
 * This is the second copy — harvest-assets.mjs has the same table — and the duplication is the
 * reason the Creator Store re-harvest died with "kindFrom is not defined" after an edit assumed
 * one was shared. Kept separate on purpose: the two scripts are independent entry points with no
 * shared module, and a lib/ for one function would be a worse trade than eleven duplicated lines.
 */
const KIND_WORDS = [
  ['foliage', /\b(tree|plant|foliage|grass|bush|flower|leaf|leaves|forest|nature|moss|fern)\b/],
  ['character', /\b(character|human|person|people|creature|animal|figure|npc|avatar)\b/],
  ['vehicle', /\b(vehicle|car|truck|boat|ship|plane|aircraft|bike|train)\b/],
  ['building', /\b(building|house|architecture|structure|wall|roof|door|window|bridge|tower|ruin|castle)\b/],
  ['ground', /\b(ground|terrain|floor|road|path|pavement|gravel|sand|soil|dirt|rock|cliff|snow|asphalt|concrete|tiles?|paving)\b/],
  ['ui_icon', /\b(icon|button|cursor|badge|ui|hud|interface|menu|logo)\b/],
  ['particle', /\b(particle|smoke|spark|flame|explosion|dust|trail)\b/],
  ['prop', /\b(furniture|prop|decor|tool|weapon|sword|shield|gun|food|container|barrel|crate|lamp|chair|table|bench|sign|chest|key|coin|gem)\b/],
];
function kindFrom(words, fallback) {
  const t = ' ' + words.filter(Boolean).join(' ').toLowerCase() + ' ';
  for (const [kind, re] of KIND_WORDS) if (re.test(t)) return kind;
  return fallback;
}

/** One row, with every required provenance field filled or explicitly null. */
function row(o) {
  const id = canonicalLicence(o.licence);
  return {
    id: o.id,
    name: o.name,
    kind: o.kind,
    source: o.source,
    sourceUrl: o.sourceUrl,
    licence: o.licence,
    licenceUrl: o.licenceUrl,
    commercialUse: true,
    attributionRequired: ATTRIBUTION.has(id),
    author: o.author,
    retrievedAt: NOW,
    importedAt: null,
    modifications: [],
    robloxAssetId: o.robloxAssetId ?? null,
    triangles: null,
    textureResolution: o.textureResolution ?? null,
    boundsStuds: null,
    tags: [...new Set((o.tags ?? []).flatMap((t) => slug(t).split(/[-/]/)).filter((t) => t && t.length > 1))].slice(0, 24),
    sha256: null,
    _licenceId: id,
    _download: o.download ?? null,
  };
}

/* ----------------------------------------------------------------- roblox creator store --- */

// Roblox caps a toolbox query at 1,000 results (10 pages of 100), verified by probe. So breadth
// comes from many NARROW queries rather than one wide one — the keyword list is the pagination.
const STORE_TERMS = [
  'tree','rock','grass','wall','floor','door','window','roof','fence','crate','barrel','chair','table',
  'lamp','sign','car','truck','boat','plane','sword','shield','gun','bow','potion','coin','gem','key',
  'chest','house','castle','tower','bridge','road','water','fire','smoke','cloud','star','heart','skull',
  'food','bread','apple','flower','bush','grass texture','brick','metal','wood','stone','sand','snow',
  'dirt','concrete','tile','fabric','glass','icon','button','panel','frame','arrow','cursor','badge',
];
// The DEFAULT kind per category, used only when the name and tags say nothing more specific.
//
// Decal defaulted to `ui_icon` in the first version and that was wrong in a way that would have
// hidden the whole category: a Decal on the Creator Store is far more often a surface — a wall, a
// sign, a poster — than a piece of interface, and `keep()` in asset-library.ts filters STRICTLY on
// kind when the planner asks for one. Every "find me a wall texture" would have matched nothing
// while 60,000 wall textures sat in the table under `ui_icon`.
const STORE_CATEGORIES = [['Decal', 'texture'], ['MeshPart', 'prop']];

async function creatorStore() {
  const out = [];
  for (const [category, defaultKind] of STORE_CATEGORIES) {
    for (const term of STORE_TERMS) {
      let pageToken = '';
      for (let page = 0; page < 10; page++) {
        const url = `https://apis.roblox.com/toolbox-service/v2/assets:search?searchCategoryType=${category}`
          + `&query=${encodeURIComponent(term)}&maxPriceCents=0&maxPageSize=100&includeOnlyVerifiedCreators=true`
          + (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : '');
        let body;
        try { body = await get(url); } catch { break; }
        // `creatorStoreAssets` is the key this endpoint actually returns — verified against a
        // live response. The earlier `assets ?? data` guessed at two names it does not use and
        // harvested 0 rows while reporting success, which is why the index now separates "failed"
        // from "returned nothing".
        const items = body?.creatorStoreAssets ?? body?.assets ?? body?.data ?? [];
        if (!items.length) break;
        for (const a of items) {
          const assetId = Number(a?.asset?.id ?? a?.id);
          if (!Number.isSafeInteger(assetId) || assetId <= 0) continue;
          const name = a?.asset?.name ?? a?.name ?? `asset ${assetId}`;
          const author = a?.creator?.name ?? a?.asset?.creatorName ?? 'Roblox creator';
          out.push(row({
            id: `creator_store/${slug(category)}/${assetId}`,
            name,
            // The same word-based mapping every other source uses, so a Creator Store row lands
            // in the same kind an equivalent Poly Haven row would. The category only decides the
            // fallback.
            kind: kindFrom([name, term, ...(Array.isArray(a?.asset?.tags) ? a.asset.tags : [])], defaultKind),
            source: 'creator_store',
            sourceUrl: `https://create.roblox.com/store/asset/${assetId}`,
            // Verbatim from the Creator Hub: Images, Decals and Meshes default to Open Use, and a
            // free listing displays "free to all creators". Both strings are the source's own.
            licence: 'Roblox Terms of Use — Open Use, free on the Creator Store',
            licenceUrl: 'https://create.roblox.com/docs/production/publishing/asset-permissions',
            author,
            tags: [term, category, name],
            // THE POINT OF THIS SOURCE: the id is already a Roblox asset id, so nothing is
            // uploaded and nothing is re-hosted. A game references it the moment it is harvested.
            robloxAssetId: assetId,
          }));
        }
        pageToken = body?.nextPageToken ?? '';
        if (!pageToken) break;
      }
      await sleep(120);
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- iconify --- */

async function iconify() {
  const collections = await get('https://raw.githubusercontent.com/iconify/icon-sets/master/collections.json');
  const out = [];
  const refusedSets = [];
  for (const [prefix, info] of Object.entries(collections ?? {})) {
    const verbatim = info?.license?.title ?? info?.license?.spdx ?? '';
    const id = canonicalLicence(verbatim);
    // The whole set is refused on its own licence, and the refusal is counted rather than skipped.
    // 17 sets are licence-toxic for a commercial product and that is ~26k icons; a harvest that
    // dropped them silently would leave nobody able to say why the totals do not add up.
    if (!id || !ALLOWED.has(id) || DENY.test(verbatim)) {
      refusedSets.push({ prefix, licence: verbatim, total: info?.total ?? 0, canonical: id });
      continue;
    }
    let set;
    try { set = await get(`https://raw.githubusercontent.com/iconify/icon-sets/master/json/${prefix}.json`); }
    catch { refusedSets.push({ prefix, licence: verbatim, total: info?.total ?? 0, canonical: id, error: 'set fetch failed' }); continue; }
    for (const name of Object.keys(set?.icons ?? {})) {
      out.push(row({
        id: `iconify/${slug(prefix)}/${slug(name)}`,
        name: name.replace(/-/g, ' '),
        kind: 'ui_icon',
        source: 'iconify',
        sourceUrl: `https://icon-sets.iconify.design/${prefix}/${encodeURIComponent(name)}/`,
        licence: verbatim,
        licenceUrl: info?.license?.url ?? 'https://github.com/iconify/icon-sets',
        author: info?.author?.name ?? info?.name ?? prefix,
        tags: [prefix, info?.category ?? '', ...(info?.tags ?? []), name],
        // SVG. Roblox takes png/jpeg/bmp/tga, so this needs rasterising before any upload — the
        // row records where the vector is, and the import step is where that conversion belongs.
        download: `https://api.iconify.design/${prefix}/${encodeURIComponent(name)}.svg`,
      }));
    }
    await sleep(60);
  }
  return { rows: out, refusedSets };
}

/* ----------------------------------------------------------------------- game-icons --- */

// license.txt names exactly two contributor folders as CC0; everything else is CC BY 3.0. Read
// from the file rather than assumed, so a new CC0 contributor is picked up rather than mislabelled.
async function gameIcons() {
  const licenceText = await get('https://raw.githubusercontent.com/game-icons/icons/master/license.txt', { json: false });
  const cc0Authors = new Set(
    [...String(licenceText).matchAll(/^-\s*([^,\n]+?)\s*,[^\n]*-\s*CC0\s*$/gim)].map((m) => slug(m[1])),
  );
  const tree = await get('https://api.github.com/repos/game-icons/icons/git/trees/master?recursive=1');
  if (tree?.truncated) throw new Error('the game-icons tree came back TRUNCATED — a partial harvest would look complete');
  const out = [];
  for (const node of tree?.tree ?? []) {
    if (node.type !== 'blob' || !node.path.endsWith('.svg')) continue;
    const parts = node.path.split('/');
    const author = parts[parts.length - 2] ?? 'unknown';
    const name = parts[parts.length - 1].replace(/\.svg$/, '');
    const isCc0 = cc0Authors.has(slug(author));
    out.push(row({
      id: `game_icons/${slug(author)}/${slug(name)}`,
      name: name.replace(/-/g, ' '),
      kind: 'ui_icon',
      source: 'game_icons',
      sourceUrl: `https://game-icons.net/1x1/${author}/${name}.html`,
      licence: isCc0 ? 'CC0 PDD' : 'CC BY 3.0',
      licenceUrl: 'https://github.com/game-icons/icons/blob/master/license.txt',
      author,
      tags: ['game', 'icon', author, name],
      // A real PNG endpoint, so this source needs no rasterising at all — the one icon set that
      // can go straight to a Roblox Image upload.
      download: `https://game-icons.net/icons/ffffff/000000/1x1/${author}/${name}.png`,
    }));
  }
  return { rows: out, cc0Authors: [...cc0Authors] };
}

/* ------------------------------------------------------- opengameart, via the HF mirror --- */

// OpenGameArt itself has no API, a 10-second crawl delay and no sitemap. nyuuzyou/OpenGameArt-CC0
// is a community mirror of its CC0 subset with the direct file URLs already extracted — which is
// the owner's rule working exactly as intended: somebody already did this, so we do not repeat it.
const OGA_SPLIT_KIND = {
  '2d_art': 'ui_icon', texture: 'texture', concept_art: 'ui_icon',
  '3d_art': 'prop', music: null, sound_effect: null, document: null,
};

async function openGameArt() {
  const splits = await get('https://datasets-server.huggingface.co/splits?dataset=nyuuzyou%2FOpenGameArt-CC0');
  const out = [];
  const skipped = {};
  const truncated = [];
  for (const s of splits?.splits ?? []) {
    const kind = OGA_SPLIT_KIND[s.split];
    if (!kind) { skipped[s.split] = 'no Roblox-ingestible form (audio or text)'; continue; }
    for (let offset = 0; ; offset += 100) {
      let page;
      try {
        page = await get(`https://datasets-server.huggingface.co/rows?dataset=nyuuzyou%2FOpenGameArt-CC0`
          + `&config=${encodeURIComponent(s.config)}&split=${encodeURIComponent(s.split)}&offset=${offset}&length=100`);
      } catch (e) {
        // A swallowed break here stopped the 2d_art split at 5,400 of its 7,302 rows and reported
        // a clean finish. A partial harvest must say which split stopped and where.
        truncated.push({ split: s.split, atOffset: offset, why: String(e.message ?? e).slice(0, 120) });
        break;
      }
      const rows = page?.rows ?? [];
      if (!rows.length) break;
      for (const { row: r } of rows) {
        const files = Array.isArray(r?.files) ? r.files : [];
        const first = files.find((f) => /\.(png|jpe?g|bmp|tga)$/i.test(f?.name ?? '')) ?? files[0];
        out.push(row({
          id: `opengameart/${slug(s.split)}/${slug(r?.id ?? r?.title ?? String(offset))}`,
          name: r?.title ?? 'untitled',
          kind,
          source: 'opengameart',
          sourceUrl: r?.url ?? 'https://opengameart.org',
          // The dataset is the CC0 subset by construction; the string is the one OGA prints.
          licence: 'CC0',
          licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
          author: r?.author ?? r?.submitter ?? 'OpenGameArt contributor',
          tags: [s.split, ...(Array.isArray(r?.tags) ? r.tags : []), r?.title ?? ''],
          download: first?.url ?? null,
        }));
      }
      if (rows.length < 100) break;
      await sleep(80);
    }
  }
  return { rows: out, skipped, truncated, expectedRows: splits?.splits?.reduce((n, x) => n + (x.num_rows ?? 0), 0) ?? null };
}

/* ------------------------------------------------------------------------ cgbookcase --- */

async function cgbookcase() {
  const all = await get('https://www.cgbookcase.com/api/textures');
  const list = Array.isArray(all) ? all : (all?.textures ?? []);
  return list.map((t) => {
    const title = t?.title ?? t?.name ?? '';
    const compact = String(title).replace(/\s+/g, '');
    return row({
      id: `cgbookcase/texture/${slug(title)}`,
      name: title,
      kind: 'texture',
      source: 'cgbookcase',
      sourceUrl: `https://www.cgbookcase.com/textures/${slug(title)}`,
      // Read off the per-texture page meta tag the survey verified: <meta name="tex1:license"
      // content="cc0">. The site has no licence PAGE at all — /license, /terms, /about and /faq
      // are 404 — so the per-asset tag is the only thing it actually prints, and it is what is
      // recorded here rather than the homepage's marketing sentence.
      licence: 'cc0',
      licenceUrl: `https://www.cgbookcase.com/textures/${slug(title)}`,
      author: 'cgbookcase',
      tags: ['pbr', 'material', ...(Array.isArray(t?.tags) ? t.tags : []), title],
      textureResolution: 1024,
      // The 1K base-colour PNG, served directly with no zip: the only resolution at this path.
      download: `https://cgbookcase.b-cdn.net/textures/thumbnails/${compact}_1K/${compact}_1K_BaseColor.png`,
    });
  });
}

/* ---------------------------------------------------------------------------- kenney --- */

async function kenney() {
  const slugs = [];
  for (let page = 1; page <= 14; page++) {
    const html = await get(page === 1 ? 'https://kenney.nl/assets' : `https://kenney.nl/assets/page:${page}`, { json: false });
    for (const m of String(html).matchAll(/<h2><a href='https:\/\/kenney\.nl\/assets\/([a-z0-9-]+)'/g)) slugs.push(m[1]);
    await sleep(250);
  }
  const uniq = [...new Set(slugs)];
  const out = [];
  const failedPacks = [];
  for (const s of uniq) {
    let html;
    try { html = await get(`https://kenney.nl/assets/${s}`, { json: false }); }
    catch (e) { failedPacks.push({ slug: s, why: String(e.message ?? e) }); continue; }
    const zip = /href='(https:\/\/kenney\.nl\/media\/pages\/assets\/[^']+\.zip)'/.exec(String(html))?.[1] ?? null;
    const title = /<h1[^>]*>([^<]+)</.exec(String(html))?.[1]?.trim() ?? s.replace(/-/g, ' ');
    const count = Number(/\((\d[\d,]*) assets\)/.exec(String(html))?.[1]?.replace(/,/g, '') ?? 0) || null;
    // ONE ROW PER PACK, not per file. The pack is what Kenney publishes and what a single zip URL
    // addresses; claiming 41,583 rows from 215 zips would be counting files nobody has listed yet.
    // `assetCount` records what the page says the pack holds, so the difference stays visible.
    out.push({
      ...row({
        id: `kenney/pack/${slug(s)}`,
        name: title,
        kind: /ui|icon|interface/i.test(title) ? 'ui_icon' : /texture|pattern/i.test(title) ? 'texture' : 'prop',
        source: 'kenney',
        sourceUrl: `https://kenney.nl/assets/${s}`,
        licence: 'Creative Commons CC0',
        licenceUrl: 'http://creativecommons.org/publicdomain/zero/1.0/',
        author: 'Kenney',
        tags: ['kenney', 'pack', ...title.split(/\s+/)],
        download: zip,
      }),
      assetCount: count,
    });
    if (!zip) failedPacks.push({ slug: s, why: 'no download zip found on the detail page' });
    await sleep(250);
  }
  // NOT named `failed`. It used to be, and the spread below merged it over the source-level
  // `failed: false` flag — so an empty array (which is TRUTHY in JavaScript) turned a harvest of
  // 215 packs into "kenney: failed" in the index. A successful run rendered as a failure, which is
  // the same defect class as a failure rendering as a success and just as hard to notice.
  return { rows: out, failedPacks, packsSeen: uniq.length };
}

/* ------------------------------------------------------------------------------ main --- */

const SOURCES = {
  creator_store: creatorStore,
  iconify,
  game_icons: gameIcons,
  opengameart: openGameArt,
  cgbookcase,
  kenney,
};

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const run = Object.entries(SOURCES).filter(([k]) => !wanted.length || wanted.includes(k));
mkdirSync(OUT_DIR, { recursive: true });

for (const [name, fn] of run) {
  const started = Date.now();
  let result;
  try {
    result = await fn();
  } catch (e) {
    // A source that fails writes a FILE SAYING SO. An absent file and an empty one would otherwise
    // be indistinguishable from a source that legitimately had nothing.
    writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify({
      generatedAt: NOW, source: name, failed: true, error: String(e.message ?? e), assets: [],
    }, null, 1) + '\n');
    console.error(`${name}: FAILED — ${e.message ?? e}`);
    continue;
  }
  const rows = Array.isArray(result) ? result : result.rows;
  const extra = Array.isArray(result) ? {} : { ...result, rows: undefined };
  const licensed = rows.filter((r) => r._licenceId && ALLOWED.has(r._licenceId));
  const dropped = rows.length - licensed.length;
  // DEDUPED PER SOURCE, and the count is reported. The Creator Store sweep finds the same asset
  // under several keywords — 102,780 rows collapse to 81,311 assets — and a source that reported
  // the pre-dedup figure would overstate the library by a fifth. The ingest deduped across files
  // already, so nothing wrong was ever WRITTEN; the number said out loud was the wrong one.
  const seen = new Set();
  const kept = licensed.filter((r) => (seen.has(r.id) ? false : (seen.add(r.id), true)));
  const duplicates = licensed.length - kept.length;
  const byKind = {};
  for (const r of kept) byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
  const byLicence = {};
  for (const r of kept) byLicence[r._licenceId] = (byLicence[r._licenceId] ?? 0) + 1;
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify({
    generatedAt: NOW,
    source: name,
    failed: false,
    tookMs: Date.now() - started,
    counts: { fetched: rows.length, kept: kept.length, droppedOnLicence: dropped, duplicateIds: duplicates, byKind, byLicence },
    ...extra,
    assets: kept,
  }, null, 1) + '\n');
  console.error(`${name}: ${kept.length} kept, ${duplicates} duplicate ids, ${dropped} dropped on licence  ${JSON.stringify(byKind)}`);
}

// A combined index, so one file answers "how big is the library" without reading six.
const parts = Object.keys(SOURCES)
  .map((n) => join(OUT_DIR, `${n}.json`))
  .filter(existsSync)
  .map((p) => JSON.parse(readFileSync(p, 'utf8')));
const total = parts.reduce((n, p) => n + (p.assets?.length ?? 0), 0);
const withRobloxId = parts.reduce((n, p) => n + (p.assets ?? []).filter((a) => a.robloxAssetId).length, 0);
writeFileSync(join(OUT_DIR, 'index.json'), JSON.stringify({
  generatedAt: NOW,
  total,
  usableWithoutUpload: withRobloxId,
  // `p.failed === true`, never `p.failed` — the loose form read an empty detail array as a
  // failure. An identity check is the difference between "this source failed" and "this source
  // returned a value JavaScript happens to consider truthy".
  perSource: Object.fromEntries(parts.map((p) => [p.source, p.failed === true ? { failed: true, error: p.error } : p.counts])),
}, null, 1) + '\n');
console.error(`\nTOTAL ${total} rows · ${withRobloxId} already carry a Roblox asset id`);
