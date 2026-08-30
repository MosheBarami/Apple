// GLB inspector — hard numbers for any generated or downloaded 3D asset.
//
// Exists because "the generator returned SUCCEEDED" says nothing about whether the mesh is usable.
// A model can succeed and still be 300k triangles, 40 studs tall when it should be 4, pivoted at
// its centre so it sinks into the floor, or carrying an 8K texture that dwarfs the page it loads
// on. This reads the actual glTF and reports those facts.
//
// Pure parsing — no dependencies, no network. GLB is a 12-byte header followed by chunks; the
// first is JSON (the glTF document), the second is the binary buffer.
//
// Usage: node packages/evals/src/glb-inspect.mjs <file.glb> [--json] [--profile P] [--height N]

import { readFileSync } from 'node:fs';

const GLB_MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;

// glTF primitive modes; only these three produce triangles
const TRI_MODES = { 4: 'TRIANGLES', 5: 'TRIANGLE_STRIP', 6: 'TRIANGLE_FAN' };

export function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB file (bad magic)');
  const version = dv.getUint32(4, true);
  const total = dv.getUint32(8, true);
  let off = 12;
  let json = null;
  let bin = null;
  while (off + 8 <= buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const start = off + 8;
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(buf.subarray(start, start + len)));
    else if (type === CHUNK_BIN) bin = buf.subarray(start, start + len);
    off = start + len + ((4 - (len % 4)) % 4); // chunks are 4-byte aligned
  }
  if (!json) throw new Error('GLB contains no JSON chunk');
  return { version, declaredLength: total, gltf: json, bin };
}

/** Read the min/max already recorded on POSITION accessors — glTF requires them, so no maths. */
function accessorBounds(gltf, accessorIndex) {
  const a = gltf.accessors?.[accessorIndex];
  if (!a?.min || !a?.max) return null;
  return { min: a.min.slice(0, 3), max: a.max.slice(0, 3) };
}

function applyMatrix(m, v) {
  // column-major 4x4, as glTF stores it
  return [
    m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12],
    m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
    m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14],
  ];
}

/** A node's local transform, from either an explicit matrix or its TRS components. */
function trs(node) {
  if (node.matrix) return node.matrix;
  const t = node.translation ?? [0, 0, 0];
  const s = node.scale ?? [1, 1, 1];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [x2, y2, z2] = [x + x, y + y, z + z];
  const [xx, xy, xz] = [x * x2, x * y2, x * z2];
  const [yy, yz, zz] = [y * y2, y * z2, z * z2];
  const [wx, wy, wz] = [w * x2, w * y2, w * z2];
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let v = 0;
      for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = v;
    }
  }
  return out;
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Full inspection: geometry counts, world bounds, materials, textures, and rig presence. */
export function inspectGlb(buf) {
  const { version, gltf, bin } = parseGlb(buf);

  let triangles = 0;
  let vertices = 0;
  let primitives = 0;
  let untriangulated = 0;
  const modes = new Set();

  for (const mesh of gltf.meshes ?? []) {
    for (const p of mesh.primitives ?? []) {
      primitives++;
      const mode = p.mode ?? 4;
      modes.add(TRI_MODES[mode] ?? `mode${mode}`);
      if (!TRI_MODES[mode]) {
        untriangulated++;
        continue;
      }
      const posIdx = p.attributes?.POSITION;
      const vCount = posIdx != null ? (gltf.accessors?.[posIdx]?.count ?? 0) : 0;
      vertices += vCount;
      const idxCount = p.indices != null ? (gltf.accessors?.[p.indices]?.count ?? 0) : vCount;
      triangles += mode === 4 ? Math.floor(idxCount / 3) : Math.max(0, idxCount - 2);
    }
  }

  // world-space bounds: walk the scene graph so node transforms are honoured
  let lo = null;
  let hi = null;
  const consider = (p) => {
    if (!lo) {
      lo = [...p];
      hi = [...p];
      return;
    }
    for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i]);
      hi[i] = Math.max(hi[i], p[i]);
    }
  };
  const walk = (nodeIndex, parent) => {
    const node = gltf.nodes?.[nodeIndex];
    if (!node) return;
    const world = mul(parent, trs(node));
    if (node.mesh != null) {
      for (const p of gltf.meshes?.[node.mesh]?.primitives ?? []) {
        const b = accessorBounds(gltf, p.attributes?.POSITION);
        if (!b) continue;
        // all 8 corners of the local AABB, so rotation is accounted for
        for (const cx of [b.min[0], b.max[0]]) {
          for (const cy of [b.min[1], b.max[1]]) {
            for (const cz of [b.min[2], b.max[2]]) consider(applyMatrix(world, [cx, cy, cz]));
          }
        }
      }
    }
    for (const c of node.children ?? []) walk(c, world);
  };
  for (const n of gltf.scenes?.[gltf.scene ?? 0]?.nodes ?? []) walk(n, IDENTITY);

  const size = lo ? [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]] : [0, 0, 0];

  const images = (gltf.images ?? []).map((img, i) => {
    const bv = img.bufferView != null ? gltf.bufferViews?.[img.bufferView] : null;
    return { index: i, mimeType: img.mimeType ?? null, name: img.name ?? null, bytes: bv?.byteLength ?? null, uri: img.uri ?? null };
  });

  const materials = (gltf.materials ?? []).map((m) => ({
    name: m.name ?? null,
    baseColorFactor: m.pbrMetallicRoughness?.baseColorFactor ?? null,
    hasBaseColorTexture: m.pbrMetallicRoughness?.baseColorTexture != null,
    hasNormalTexture: m.normalTexture != null,
    hasMetallicRoughnessTexture: m.pbrMetallicRoughness?.metallicRoughnessTexture != null,
    doubleSided: !!m.doubleSided,
    alphaMode: m.alphaMode ?? 'OPAQUE',
  }));

  return {
    version,
    fileBytes: buf.byteLength,
    binBytes: bin?.byteLength ?? 0,
    triangles,
    vertices,
    primitives,
    primitiveModes: [...modes],
    untriangulatedPrimitives: untriangulated,
    meshes: gltf.meshes?.length ?? 0,
    nodes: gltf.nodes?.length ?? 0,
    materials,
    images,
    textureBytes: images.reduce((n, i) => n + (i.bytes ?? 0), 0),
    animations: gltf.animations?.length ?? 0,
    skins: gltf.skins?.length ?? 0,
    boundsMin: lo,
    boundsMax: hi,
    size,
    generator: gltf.asset?.generator ?? null,
    extensionsUsed: gltf.extensionsUsed ?? [],
  };
}

/**
 * Thresholds per intended use, written out explicitly so a failure says WHY and so the numbers can
 * be argued with rather than being buried inside a boolean.
 */
export const USE_PROFILES = {
  // One hero object on a web page: quality matters, bytes matter more than polygons.
  web_hero: { maxTriangles: 60_000, maxFileBytes: 3_500_000, maxTextureBytes: 2_500_000, originAtBase: true },
  // A Roblox prop the player walks past. Roblox streams these, so polygons are the binding limit.
  roblox_prop: { maxTriangles: 10_000, maxFileBytes: 2_000_000, maxTextureBytes: 1_500_000, originAtBase: true },
  // A Roblox hero object the player walks up to and looks at.
  roblox_hero: { maxTriangles: 25_000, maxFileBytes: 4_000_000, maxTextureBytes: 3_000_000, originAtBase: true },
};

/**
 * Judge an inspection against an intended use.
 *
 * The pivot check is the one people forget: a mesh whose origin sits at its centre sinks halfway
 * into the floor when placed, and one whose origin lies outside its bounds swings wildly when
 * rotated. `intendedHeight` is in the target unit — Roblox studs, or metres on the web.
 */
export function judgeAsset(info, { profile = 'roblox_prop', intendedHeight = null, heightTolerance = 0.5 } = {}) {
  const p = USE_PROFILES[profile];
  if (!p) throw new Error(`unknown profile "${profile}"`);
  const checks = [];
  const add = (id, passed, detail) => checks.push({ id, passed, detail });

  add('triangles', info.triangles > 0 && info.triangles <= p.maxTriangles, `${info.triangles} triangles (max ${p.maxTriangles})`);
  add('file_size', info.fileBytes <= p.maxFileBytes, `${(info.fileBytes / 1e6).toFixed(2)} MB (max ${(p.maxFileBytes / 1e6).toFixed(2)} MB)`);
  add('texture_size', info.textureBytes <= p.maxTextureBytes, `${(info.textureBytes / 1e6).toFixed(2)} MB of texture (max ${(p.maxTextureBytes / 1e6).toFixed(2)} MB)`);
  add('has_geometry', info.triangles > 0 && info.meshes > 0, `${info.meshes} mesh(es), ${info.primitives} primitive(s)`);
  add(
    'triangulated',
    info.untriangulatedPrimitives === 0,
    info.untriangulatedPrimitives ? `${info.untriangulatedPrimitives} non-triangle primitives` : 'all primitives are triangles',
  );
  add('has_material', info.materials.length > 0, `${info.materials.length} material(s)`);
  const textured = info.materials.some((m) => m.hasBaseColorTexture);
  add('textured', textured, textured ? 'base colour texture present' : 'no base colour texture — untextured grey is a placeholder look');

  // a mesh flat in one axis is usually a failed generation, not a design choice
  const [sx, sy, sz] = info.size;
  const maxDim = Math.max(sx, sy, sz);
  const minDim = Math.min(sx, sy, sz);
  add('not_degenerate', maxDim > 0 && minDim / maxDim > 0.01, `bounds ${sx.toFixed(2)} x ${sy.toFixed(2)} x ${sz.toFixed(2)}`);

  if (p.originAtBase && info.boundsMin) {
    const tol = Math.max(0.05 * (sy || 1), 1e-3);
    add('origin_at_base', Math.abs(info.boundsMin[1]) <= tol, `base of bounds is ${info.boundsMin[1].toFixed(3)} on Y (want ~0, tolerance ${tol.toFixed(3)})`);
    const cx = (info.boundsMin[0] + info.boundsMax[0]) / 2;
    const cz = (info.boundsMin[2] + info.boundsMax[2]) / 2;
    const horiz = Math.max(Math.abs(cx), Math.abs(cz));
    add('origin_centred', horiz <= Math.max(0.1 * maxDim, 1e-3), `horizontal centre offset ${horiz.toFixed(3)}`);
  }

  if (intendedHeight != null) {
    const ratio = sy / intendedHeight;
    add('scale_plausible', ratio >= 1 - heightTolerance && ratio <= 1 + heightTolerance, `height ${sy.toFixed(2)} vs intended ${intendedHeight} (ratio ${ratio.toFixed(2)})`);
  }

  const failed = checks.filter((c) => !c.passed);
  return { profile, passed: failed.length === 0, checks, failed: failed.map((f) => `${f.id}: ${f.detail}`) };
}

// ---------------------------------------------------------------------------
if (process.argv[1]?.endsWith('glb-inspect.mjs')) {
  const file = process.argv[2];
  if (!file) {
    console.log('usage: glb-inspect.mjs <file.glb> [--json] [--profile web_hero|roblox_prop|roblox_hero] [--height N]');
    process.exit(1);
  }
  const args = process.argv.slice(3);
  const profile = args.includes('--profile') ? args[args.indexOf('--profile') + 1] : 'roblox_prop';
  const height = args.includes('--height') ? Number(args[args.indexOf('--height') + 1]) : null;
  const info = inspectGlb(readFileSync(file));
  const verdict = judgeAsset(info, { profile, intendedHeight: height });
  if (args.includes('--json')) {
    console.log(JSON.stringify({ info, verdict }, null, 1));
  } else {
    console.log(`file        ${(info.fileBytes / 1e6).toFixed(2)} MB  (binary ${(info.binBytes / 1e6).toFixed(2)} MB, textures ${(info.textureBytes / 1e6).toFixed(2)} MB)`);
    console.log(`geometry    ${info.triangles} triangles, ${info.vertices} vertices, ${info.primitives} primitives [${info.primitiveModes.join(', ')}]`);
    console.log(`bounds      ${info.size.map((v) => v.toFixed(2)).join(' x ')}   min ${info.boundsMin?.map((v) => v.toFixed(2)).join(',')}`);
    console.log(`materials   ${info.materials.length}  images ${info.images.length} [${info.images.map((i) => i.mimeType).join(', ')}]`);
    console.log(`rig         ${info.animations} animation(s), ${info.skins} skin(s)`);
    console.log(`generator   ${info.generator ?? 'unknown'}`);
    console.log(`\nprofile "${verdict.profile}": ${verdict.passed ? 'PASS' : 'FAIL'}`);
    for (const c of verdict.checks) console.log(`  ${c.passed ? 'ok  ' : 'FAIL'} ${c.id.padEnd(18)} ${c.detail}`);
  }
  process.exit(verdict.passed ? 0 : 1);
}
