// Fetch ambientCG materials (master plan §4.3 #6) through its official API: every material's metadata, and its
// 1K-JPG zip streamed once to hash it and keep only the colour map (the preview the critics grade; the full map set is
// fetched again when the material is uploaded). Sequential, half a second apart. Resumable: an asset folder with a
// fetch.json is not fetched again.
//
//   node packages/library/tools/fetch-ambientcg.mjs <out-dir>
import { writeFileSync, mkdirSync, existsSync, createWriteStream, readFileSync, rmSync, readdirSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; library ingestion of CC0 materials)' };
const API = 'https://ambientcg.com/api/v3/assets?type=material&limit=250&include=title,tags,releaseDate,technique,dimensions,downloads';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** The 1K-JPG download of an asset, or undefined. Pure. */
export const oneK = (asset) => (asset.downloads ?? []).find((d) => d.attributes === '1K-JPG');

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: fetch-ambientcg.mjs <out-dir>'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const assets = [];
  for (let url = API; url;) {
    const page = await (await fetch(url, { headers: UA })).json();
    assets.push(...page.assets);
    url = page.nextPageHttp || null;
    await wait(500);
  }
  writeFileSync(join(out, 'assets.json'), JSON.stringify(assets));
  console.log(`${assets.length} materials listed`);
  let done = 0, skipped = 0;
  for (const a of assets) {
    const dir = join(out, a.id);
    if (existsSync(join(dir, 'fetch.json'))) continue;
    const dl = oneK(a);
    if (!dl) { skipped += 1; continue; }
    mkdirSync(dir, { recursive: true });
    const zip = join(dir, 'tmp.zip');
    try {
      const res = await fetch(dl.url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await pipeline(Readable.fromWeb(res.body), createWriteStream(zip));
      const buf = readFileSync(zip);
      const sha256 = createHash('sha256').update(buf).digest('hex');
      execFileSync('bsdtar', ['-xf', zip, '-C', dir, '*_Color.jpg'], { stdio: 'ignore' });
      const color = readdirSync(dir).find((f) => /_Color\.jpg$/i.test(f));
      if (color) renameSync(join(dir, color), join(dir, 'color.jpg'));
      writeFileSync(join(dir, 'fetch.json'), JSON.stringify({ id: a.id, file: dl.url.split('file=')[1], bytes: buf.length, sha256, color: !!color, at: new Date().toISOString() }));
      done += 1;
    } catch (e) {
      console.log(`${a.id}: ${e.message}`);
    } finally {
      rmSync(zip, { force: true });
    }
    if (done % 100 === 0 && done) console.log(`${done} fetched`);
    await wait(500);
  }
  console.log(`${done} fetched, ${skipped} without a 1K-JPG`);
}
