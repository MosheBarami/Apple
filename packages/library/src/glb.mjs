// The facts L5's automatic checks need from a binary glTF (GLB), read from its JSON chunk: triangles, meshes,
// materials, the size of its bounding box and whether it has textures. Pure apart from the read.
import { readFileSync } from 'node:fs';

/** Parses the JSON chunk of a GLB buffer. Throws on anything that is not GLB version 2. */
export function glbJson(buf) {
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
  if (buf.readUInt32LE(4) !== 2) throw new Error(`GLB version ${buf.readUInt32LE(4)}, expected 2`);
  const len = buf.readUInt32LE(12);
  if (buf.readUInt32LE(16) !== 0x4e4f534a) throw new Error('GLB first chunk is not JSON');
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** { triangles, meshes, materials, images, size: [x, y, z] } of a glTF document (size from POSITION min/max). */
export function glbStats(gltf) {
  let triangles = 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      const mode = p.mode ?? 4;
      const pos = gltf.accessors?.[p.attributes?.POSITION];
      const count = p.indices !== undefined ? gltf.accessors?.[p.indices]?.count ?? 0 : pos?.count ?? 0;
      if (mode === 4) triangles += Math.floor(count / 3);
      else if (mode === 5 || mode === 6) triangles += Math.max(0, count - 2);
      if (pos?.min && pos?.max) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], pos.min[i]); hi[i] = Math.max(hi[i], pos.max[i]); }
    }
  }
  const size = lo[0] === Infinity ? [0, 0, 0] : hi.map((h, i) => Math.round((h - lo[i]) * 1000) / 1000);
  return { triangles, meshes: (gltf.meshes ?? []).length, materials: (gltf.materials ?? []).length, images: (gltf.images ?? []).length, size };
}

export const readGlbStats = (path) => glbStats(glbJson(readFileSync(path)));
