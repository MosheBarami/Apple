// Fetch Poly Haven's 3D models (master plan §4.3 #1, #2, #4, #5) through its public API only (api.polyhaven.com; no
// page scraping, as its terms ask), with a User-Agent naming StudPilot: each model's metadata and its 1K glTF with the
// files it includes (buffer, textures) at their relative paths, each checked against the API's md5. Sequential, half a
// second apart. Resumable: a model folder with a fetch.json is not fetched again.
//
//   node packages/library/tools/fetch-polyhaven-models.mjs <out-dir>
import { writeFileSync, mkdirSync, existsSync, createWriteStream, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';

const UA = { 'user-agent': 'StudPilot-Library/1.0 (+https://studpilot.app; models for Roblox games, CC0)' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (p) => createHash('md5').update(readFileSync(p)).digest('hex');

async function save(url, path, sum) {
  mkdirSync(dirname(path), { recursive: true });
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(path));
  if (sum && md5(path) !== sum) throw new Error(`md5 does not match the API: ${url}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = process.argv[2];
  if (!out) { console.error('usage: fetch-polyhaven-models.mjs <out-dir>'); process.exit(2); }
  mkdirSync(out, { recursive: true });
  const all = await (await fetch('https://api.polyhaven.com/assets?t=models', { headers: UA })).json();
  writeFileSync(join(out, 'assets.json'), JSON.stringify(all));
  const ids = Object.keys(all).sort();
  console.log(`${ids.length} models`);
  let done = 0;
  for (const id of ids) {
    const dir = join(out, id);
    if (existsSync(join(dir, 'fetch.json'))) continue;
    try {
      const g = (await (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: UA })).json())?.gltf?.['1k']?.gltf;
      if (!g?.url) throw new Error('no 1K glTF');
      await save(g.url, join(dir, `${id}.gltf`), g.md5);
      for (const [rel, f] of Object.entries(g.include ?? {})) await save(f.url, join(dir, rel), f.md5);
      writeFileSync(join(dir, 'fetch.json'), JSON.stringify({ id, url: g.url, sha256: createHash('sha256').update(readFileSync(join(dir, `${id}.gltf`))).digest('hex'), files: 1 + Object.keys(g.include ?? {}).length, at: new Date().toISOString() }));
      done += 1;
      if (done % 50 === 0) console.log(`${done} fetched`);
    } catch (e) { console.log(`${id}: ${e.message}`); }
    await wait(500);
  }
  console.log(`${done} fetched`);
}
