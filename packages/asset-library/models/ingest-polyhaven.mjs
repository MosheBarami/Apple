#!/usr/bin/env node
// Ingest one visually reviewed Poly Haven model through its public API. The model and all glTF
// dependencies are hash-checked, packed into one GLB, and kept in the private model store.
// Example: node packages/asset-library/models/ingest-polyhaven.mjs painted_wooden_bench --kind prop --genre City/Roleplay
import { createHash } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gltfToGlb } from './fetch.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const library = resolve(here, '..');
const sourceFile = join(library, 'sources/models-packs.jsonl');
const store = join(library, 'models-store/polyhaven');
const userAgent = 'AppleRobloxAssetLibrary/1.0 (https://github.com/MosheBarami/Apple)';
const [id, ...options] = process.argv.slice(2);
const option = (name) => options[options.indexOf(name) + 1];
const kind = option('--kind');
const genre = option('--genre');
const allowedKinds = new Set(['building', 'prop', 'nature', 'vehicle', 'character', 'pet', 'weapon', 'kit']);
const allowedGenres = new Set(['Simulator/Tycoon', 'Obby', 'Horror/Adventure', 'Shooter/Fighting', 'City/Roleplay', 'Nature']);
if (!/^[a-z0-9_]+$/.test(id ?? '') || !allowedKinds.has(kind) || !allowedGenres.has(genre)) {
  throw new Error('Usage: ingest-polyhaven.mjs <reviewed_asset_id> --kind <kind> --genre <genre>');
}

const packId = `polyhaven-${id}`;
const finalDir = join(store, packId);
if (existsSync(finalDir) || readFileSync(sourceFile, 'utf8').includes(`"id":"${packId}"`)) {
  throw new Error(`${packId} is already ingested`);
}
const request = async (url) => {
  const u = new URL(url);
  if (u.protocol !== 'https:' || !['api.polyhaven.com', 'dl.polyhaven.org'].includes(u.hostname)) throw new Error('Untrusted download host');
  const response = await fetch(u, { headers: { 'User-Agent': userAgent }, redirect: 'error' });
  if (!response.ok) throw new Error(`${u.hostname} answered ${response.status}`);
  return response;
};
const info = await (await request(`https://api.polyhaven.com/info/${id}`)).json();
const files = await (await request(`https://api.polyhaven.com/files/${id}`)).json();
if (info.type !== 2 || !info.name || !Number.isFinite(info.polycount) || info.polycount > 100_000) {
  throw new Error('Asset is not a Roblox-sized model');
}
const gltf = files.gltf?.['1k']?.gltf;
if (!gltf?.url || !gltf?.include || !gltf?.size || !gltf?.md5) throw new Error('Complete 1K glTF missing');
const parts = [[basename(new URL(gltf.url).pathname), gltf], ...Object.entries(gltf.include)];
const bytesPlanned = parts.reduce((n, [, part]) => n + part.size, 0);
if (bytesPlanned > 12_000_000 || parts.length > 12) throw new Error('Asset exceeds download budget');
console.log(`${info.name}: ${parts.length} source files, ${bytesPlanned} bytes; CC0; ${info.polycount} triangles`);
mkdirSync(store, { recursive: true });
const temp = join(store, `.${packId}-${process.pid}`);
mkdirSync(temp);
try {
  for (const [relative, part] of parts) {
    if (relative.startsWith('/') || relative.split('/').includes('..') || !/\.(gltf|bin|png|jpe?g)$/i.test(relative)) throw new Error('Unsafe dependency path');
    const dest = resolve(temp, relative);
    if (!dest.startsWith(temp + '/')) throw new Error('Dependency left temporary directory');
    const data = Buffer.from(await (await request(part.url)).arrayBuffer());
    if (data.length !== part.size || createHash('md5').update(data).digest('hex') !== part.md5) throw new Error(`Checksum failed: ${relative}`);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, data);
  }
  const sourceGltf = join(temp, parts[0][0]);
  if (!gltfToGlb(sourceGltf)) throw new Error('Could not pack glTF dependencies');
  const packed = sourceGltf.replace(/\.gltf$/i, '.glb');
  const modelFile = `${info.name.replace(/[^a-zA-Z0-9 -]/g, '').trim()}.glb`;
  const modelBytes = readFileSync(packed);
  if (modelBytes.readUInt32LE(0) !== 0x46546c67 || modelBytes.readUInt32LE(8) !== modelBytes.length) throw new Error('Invalid GLB');
  const sha256 = createHash('sha256').update(modelBytes).digest('hex');
  const finished = join(temp, modelFile);
  renameSync(packed, finished);
  for (const relative of parts.map(([name]) => name)) rmSync(join(temp, relative), { force: true });
  rmSync(join(temp, 'textures'), { recursive: true, force: true });
  writeFileSync(join(temp, '.done'), JSON.stringify({ id: packId, source: `https://polyhaven.com/a/${id}`, licence: 'CC0-1.0', sha256, at: new Date().toISOString() }) + '\n');
  renameSync(temp, finalDir);
  const row = {
    id: packId, name: info.name, source: 'polyhaven', page: `https://polyhaven.com/a/${id}`,
    download: gltf.url, downloadKind: 'polyhaven-api', downloadBytes: bytesPlanned,
    licence: 'CC0-1.0', creator: Object.keys(info.authors ?? {}).join(', '),
    kind, genres: [genre], tags: [...new Set([...(info.tags ?? []), ...info.name.toLowerCase().split(/[^a-z0-9]+/)])].slice(0, 16),
  };
  appendFileSync(sourceFile, JSON.stringify(row) + '\n');
  console.log(JSON.stringify({ id: packId, file: join(finalDir, modelFile), bytes: statSync(join(finalDir, modelFile)).size, sha256 }));
} catch (error) {
  rmSync(temp, { recursive: true, force: true });
  throw error;
}
