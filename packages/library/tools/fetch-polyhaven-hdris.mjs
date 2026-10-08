// Fetch Poly Haven's outdoor HDRIs (master plan §4.3 #7: skies) through its public API only (api.polyhaven.com; the
// site's pages are never scraped, as its terms ask), with a User-Agent naming StudPilot: each HDRI's metadata, its 1K
// HDR (hashed; the source of the 6-face skybox made at upload) and a 256 px thumbnail for the critics. Sequential,
// half a second apart. Resumable: an asset folder with a fetch.json is not fetched again.
//
//   node packages/library/tools/fetch-polyhaven-hdris.mjs <out-dir>
import { writeFileSync, mkdirSync, existsSync, createWriteStream, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; skies for Roblox games, CC0)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Whether an HDRI is an outdoor sky worth a skybox: outdoor, with open or partial sky view. Pure. */
export const outdoorSky = (a) => (a.categories ?? []).includes('outdoor') && a.attributes?.sky_view !== 'none' && a.attributes?.environment !== 'indoor';

async function save(url, path) {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: fetch-polyhaven-hdris.mjs <out-dir>'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const all = await (await fetch('https://api.polyhaven.com/assets?t=hdris', { headers: UA })).json();
  const ids = Object.keys(all).filter((id) => outdoorSky(all[id])).sort();
  writeFileSync(join(out, 'assets.json'), JSON.stringify(Object.fromEntries(ids.map((id) => [id, all[id]]))));
  console.log(`${ids.length} outdoor HDRIs of ${Object.keys(all).length}`);
  let done = 0;
  for (const id of ids) {
    const dir = join(out, id);
    if (existsSync(join(dir, 'fetch.json'))) continue;
    mkdirSync(dir, { recursive: true });
    try {
      const files = await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json();
      const hdr = files?.hdri?.['1k']?.hdr;
      if (!hdr?.url) throw new Error('no 1K HDR');
      await save(hdr.url, join(dir, 'sky_1k.hdr'));
      const buf = readFileSync(join(dir, 'sky_1k.hdr'));
      if (createHash('md5').update(buf).digest('hex') !== hdr.md5) throw new Error('1K HDR md5 does not match the API');
      await save(`https://cdn.polyhaven.com/asset_img/thumbs/${id}.png?width=256&height=128`, join(dir, 'thumb.webp'));
      writeFileSync(join(dir, 'fetch.json'), JSON.stringify({ id, url: hdr.url, bytes: buf.length, sha256: createHash('sha256').update(buf).digest('hex'), at: new Date().toISOString() }));
      done += 1;
      if (done % 100 === 0) console.log(`${done} fetched`);
    } catch (e) { console.log(`${id}: ${e.message}`); }
    await wait(500);
  }
  console.log(`${done} fetched`);
}
