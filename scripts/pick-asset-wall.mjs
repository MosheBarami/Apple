#!/usr/bin/env node
// The assets shown on the landing page, chosen once and VERIFIED, not guessed.
//
// THE OWNER'S COMPLAINT THIS ANSWERS: "you never checked how it pulls assets and shows them in a
// nice preview on the site and shows where it took them from."
//
// WHY THE ROWS CANNOT SIMPLY BE READ OUT OF D1. The library stores what an asset IS — its licence,
// its author, its source page — and not a picture of it. Two of the three curated sources do not
// put a thumbnail in their harvest at all, and a URL guessed from the id is wrong: Poly Haven's
// slugs are case-sensitive (`ArmChair_01`, not the lowercased `armchair-01` our ids carry) and the
// guess 404s silently. So the preview comes from each source's own API, and every one is
// HEAD-checked before it is written down.
//
// A BROKEN IMAGE MUST NEVER SHIP. A card whose picture fails renders as a hole, and a hole on a
// page about an asset library says the library is broken. Anything that does not answer 200 with
// an image content-type is dropped here, loudly, rather than discovered by a visitor.
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'apps', 'site', 'src', 'data', 'asset-wall.json');
//[[ THE PICTURES ARE COPIED HERE, NOT HOT-LINKED.
//
//   The first version pointed each card at the pack's own CDN. Every URL answered 200 to curl and
//   NONE of them rendered: 24 cards in the DOM, 24 <img> elements, `loaded: 0`. A cross-origin
//   image is at the mercy of the other site's referrer policy, its hotlink protection and its
//   CORS headers, and none of that is visible from a shell.
//
//   That is exactly the hole this script exists to prevent, one layer further out — verifying the
//   bytes exist on their server says nothing about whether a browser will draw them on ours. So
//   the bytes come here, are served from our own origin, and the only thing that can break them
//   afterwards is us.
//
//   It is also the honest reading of the licences: CC0 asks nothing, and CC-BY asks for the credit
//   the card already prints. Neither asks us to send visitors' requests to the author's server.
const IMGDIR = join(ROOT, 'apps', 'site', 'public', 'assets', 'wall');
const WANT = Number(process.argv[2] ?? 24);

const get = async (url, as = 'json') => {
  const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return as === 'json' ? r.json() : r.text();
};

/**
 * Fetch the picture and keep it, or say it is not there.
 *
 * Returns the local path it was written to, or null. Nothing downstream may assume a picture
 * exists — the card is dropped rather than rendered as a hole.
 */
async function keepImage(url, id) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(25_000) });
    const type = (r.headers.get('content-type') ?? '').split(';')[0];
    if (!r.ok || !type.startsWith('image/')) return null;
    const bytes = new Uint8Array(await r.arrayBuffer());
    // A "200" that is 43 bytes of tracking pixel is not the asset. Anything this small is a
    // placeholder or an error page wearing an image content-type.
    if (bytes.length < 400) return null;
    const ext = type === 'image/png' ? 'png' : type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : null;
    if (!ext) return null;
    const file = `${id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.${ext}`;
    mkdirSync(IMGDIR, { recursive: true });
    writeFileSync(join(IMGDIR, file), bytes);
    return { path: `/assets/wall/${file}`, bytes: bytes.length };
  } catch { return null; }
}

const sources = [];

//[[ POLY HAVEN — CC0, keyless, and the one with real 3D props a Roblox builder recognises.
sources.push(async () => {
  const all = await get('https://api.polyhaven.com/assets?t=models');
  return Object.entries(all).map(([slug, a]) => ({
    id: `poly_haven/models/${slug.toLowerCase()}`,
    name: a.name ?? slug,
    kind: 'prop',
    pack: 'Poly Haven',
    author: (a.authors && Object.keys(a.authors)[0]) || 'Poly Haven',
    licence: 'CC0 1.0',
    licenceUrl: 'https://polyhaven.com/license',
    source: `https://polyhaven.com/a/${slug}`,
    img: a.thumbnail_url,
  }));
});

//[[ AMBIENTCG — CC0 surfaces. `include=imageData` is required or previewImage comes back empty,
//   which would have produced a wall of typed placeholders that looked like a rendering bug.
sources.push(async () => {
  const d = await get('https://ambientcg.com/api/v2/full_json?type=Material&limit=60&include=imageData');
  return (d.foundAssets ?? []).map((a) => ({
    id: `ambientcg/material/${String(a.assetId).toLowerCase()}`,
    name: a.displayName || a.assetId,
    kind: 'texture',
    pack: 'ambientCG',
    author: 'Lennart Demes',
    licence: 'CC0 1.0',
    licenceUrl: 'https://docs.ambientcg.com/books/website/page/licensing',
    source: `https://ambientcg.com/view?id=${a.assetId}`,
    img: a.previewImage?.['256-PNG'] ?? a.previewImage?.['128-PNG'] ?? null,
  }));
});

//[[ GAME-ICONS — CC-BY, and the licence is why each card names its author rather than the pack.
//   4,239 icons by dozens of people; crediting "game-icons.net" would discharge nothing.
sources.push(async () => {
  const { readFileSync } = await import('node:fs');
  const j = JSON.parse(readFileSync(join(ROOT, 'packages', 'corpus', 'data', 'library', 'game_icons.json'), 'utf8'));
  return (j.assets ?? []).filter((a) => a._download).map((a) => ({
    id: a.id,
    name: a.name,
    kind: 'ui_icon',
    pack: 'game-icons.net',
    author: a.author,
    licence: a.licence,
    licenceUrl: a.licenceUrl,
    source: a.sourceUrl,
    img: a._download,
  }));
});

const pools = [];
for (const [i, fn] of sources.entries()) {
  try {
    const rows = (await fn()).filter((r) => r.img);
    pools.push(rows);
    console.error(`source ${i + 1}: ${rows.length} candidate(s)`);
  } catch (e) {
    // A source that failed is NOT a source with nothing in it, and the difference decides whether
    // the wall is short because the library is small or because a request timed out.
    console.error(`source ${i + 1} FAILED: ${e.message}`);
    pools.push(null);
  }
}
if (pools.every((p) => p === null)) {
  console.error('\nEVERY SOURCE FAILED. Not writing a file — an empty wall committed now would be\n'
    + 'indistinguishable from a library with nothing in it.');
  process.exit(2);
}

// Round-robin so one pack cannot fill the wall: a wall of 24 icons is not evidence of a library
// with props, textures and icons in it.
const picked = [];
const live = pools.filter(Boolean);
for (let i = 0; picked.length < WANT * 2 && i < 400; i++) {
  for (const p of live) if (p[i]) picked.push(p[i]);
}

const kept = [];
let bytes = 0;
for (const row of picked) {
  if (kept.length >= WANT) break;
  const got = await keepImage(row.img, row.id);
  if (!got) { console.error(`  dropped ${row.id}: image did not answer with usable bytes`); continue; }
  bytes += got.bytes;
  // `remote` is kept as provenance — where the picture came from — while `img` is what the page
  // actually loads. Conflating the two is how a local copy quietly becomes a hot-link again.
  kept.push({ ...row, remote: row.img, img: got.path });
}

const byPack = {};
for (const r of kept) byPack[r.pack] = (byPack[r.pack] ?? 0) + 1;

if (kept.length < WANT) {
  console.error(`\nONLY ${kept.length} of ${WANT} assets had a live picture. Writing what survived —\n`
    + 'the page renders the count it actually has, so a short wall is visible rather than padded.');
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: kept.length, byPack, assets: kept }, null, 1));
console.error(`\nwrote ${kept.length} assets to ${OUT.slice(ROOT.length + 1)} — ${Object.entries(byPack).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
console.error(`${(bytes / 1024).toFixed(0)} KiB of pictures in apps/site/public/assets/wall/, served from our own origin`);
