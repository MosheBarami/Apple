// Offline software renderer — the same algorithm as apps/plugin/src/Render.luau, in Node.
//
// Why a second copy: the visual eval suite has to grade stored scenes with no live Roblox Studio
// attached, and regression fixtures must re-render deterministically long after the place that
// produced them is gone. The plugin renderer is the one that runs in production; this one exists
// so the eval harness is not hostage to a running Studio. They must stay in agreement — the
// material table, camera presets, sun direction and fog curve below are the shared contract.
//
// SCENE SCHEMA (what capture-scene dumps and fixtures store)
//   { name?, lighting?: {brightness, clockTime, ambient:[r,g,b], hasAtmosphere},
//     parts: [ { name, material, size:[x,y,z], pos:[x,y,z], rot?:[9 floats, row-major],
//                color:[0-255,0-255,0-255], transparency } ] }

const CORNERS = [
  [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
  [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
];
// quads wound CCW seen from outside, with the outward normal
const FACES = [
  [0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]],
  [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]],
];

// [brightness multiplier, roughness, emissive] — keep in sync with apps/plugin/src/Render.luau
const MATERIAL_LOOK = {
  Neon: [1.25, 1.0, true], Glass: [1.05, 0.8, false], ForceField: [1.1, 0.9, true],
  Metal: [1.0, 0.15, false], DiamondPlate: [0.95, 0.2, false], Foil: [1.05, 0.15, false],
  CorrodedMetal: [0.85, 0.6, false], Concrete: [0.86, 0.9, false], Slate: [0.8, 0.85, false],
  Brick: [0.88, 0.9, false], Cobblestone: [0.84, 0.9, false], Rock: [0.82, 0.9, false],
  Basalt: [0.72, 0.9, false], Limestone: [0.95, 0.85, false], Marble: [1.0, 0.45, false],
  Granite: [0.85, 0.7, false], Sand: [1.0, 0.95, false], Grass: [0.9, 0.95, false],
  LeafyGrass: [0.86, 0.95, false], Ground: [0.82, 0.95, false], Mud: [0.7, 0.95, false],
  Snow: [1.1, 0.9, false], Ice: [1.05, 0.5, false], Water: [0.95, 0.35, false],
  Wood: [0.92, 0.8, false], WoodPlanks: [0.92, 0.8, false], Fabric: [0.88, 1.0, false],
  Plastic: [1.0, 0.5, false], SmoothPlastic: [1.0, 0.4, false], Glacier: [1.05, 0.6, false],
  Asphalt: [0.7, 0.9, false], Pebble: [0.85, 0.9, false], Salt: [1.05, 0.9, false],
};

function norm(v) {
  const m = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / m, v[1] / m, v[2] / m];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

const SUN = norm([0.35, -0.85, 0.4]);
const SKY = [0x9f, 0xc7, 0xe8];
const GROUND = [0x6e, 0x7a, 0x63];
/** Anything this big in plan is a baseplate-style ground plane: drawn, but excluded from framing. */
const GROUND_PLANE_STUDS = 600;

/** part-local offset -> world, honouring the part's rotation matrix (identity when absent) */
function toWorld(part, local) {
  const r = part.rot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const [x, y, z] = local;
  return [
    part.pos[0] + r[0] * x + r[1] * y + r[2] * z,
    part.pos[1] + r[3] * x + r[4] * y + r[5] * z,
    part.pos[2] + r[6] * x + r[7] * y + r[8] * z,
  ];
}
function rotateVec(part, v) {
  const r = part.rot ?? [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [
    r[0] * v[0] + r[1] * v[1] + r[2] * v[2],
    r[3] * v[0] + r[4] * v[1] + r[5] * v[2],
    r[6] * v[0] + r[7] * v[1] + r[8] * v[2],
  ];
}

const isGroundPlane = (p) => p.size[0] > GROUND_PLANE_STUDS || p.size[2] > GROUND_PLANE_STUDS;
const renderable = (p) => (p.transparency ?? 0) < 0.95;

/** World bounds of the scene, ignoring ground planes so framing stays useful. */
export function sceneBounds(parts) {
  let lo = null;
  let hi = null;
  for (const p of parts) {
    if (!renderable(p) || isGroundPlane(p)) continue;
    for (const c of CORNERS) {
      const w = toWorld(p, [c[0] * p.size[0], c[1] * p.size[1], c[2] * p.size[2]]);
      if (!lo) {
        lo = [...w];
        hi = [...w];
      } else {
        for (let i = 0; i < 3; i++) {
          lo[i] = Math.min(lo[i], w[i]);
          hi[i] = Math.max(hi[i], w[i]);
        }
      }
    }
  }
  return lo ? { lo, hi } : null;
}

/** Build a look-at basis: camera position plus its three world axes. */
function lookAt(eye, target) {
  const forward = norm(sub(target, eye));
  let right = cross(forward, [0, 1, 0]);
  if (Math.hypot(...right) < 1e-6) right = [1, 0, 0]; // degenerate: looking straight down
  right = norm(right);
  return { eye, right, up: cross(right, forward), forward };
}

/** Camera presets — must match Render.viewpoints in the plugin. */
export function viewpoints(lo, hi, which = 'all') {
  const centre = scale(add(lo, hi), 0.5);
  const size = sub(hi, lo);
  const radius = Math.max(Math.hypot(...size) * 0.5, 4);
  // Framing distance. Measured: at 2.1x the subject filled only 8-11% of the frame, and the critic
  // correctly called that out ("a postage stamp in a void") while also hallucinating detail it
  // could not resolve. 1.35x puts the subject at roughly a third of the frame with margin to read
  // its silhouette against the horizon.
  const d = radius * 1.35;
  const look = (offset, at) => lookAt(add(centre, offset), at ?? centre);
  const all = [
    // three-quarter establishing shot: the most informative single angle for composition
    { name: 'hero', cam: look([d * 0.72, d * 0.52, d * 0.72]) },
    { name: 'front', cam: look([0, radius * 0.45, d]) },
    { name: 'side', cam: look([d, radius * 0.45, 0]) },
    // plan view reads layout and negative space, which perspective flattens
    { name: 'top', cam: look([0.01, d * 1.15, 0.01]) },
    // roughly player eye height, for what someone standing in the scene actually sees
    { name: 'eye', cam: lookAt(add(centre, [d * 0.85, -size[1] * 0.5 + 6, d * 0.85]), add(centre, [0, -size[1] * 0.25, 0])) },
  ];
  if (which === 'all') return all;
  const picked = all.filter((v) => v.name === which);
  return picked.length ? picked : [all[0]];
}

/** Rasterise one view to raw RGB bytes plus what was measurably in frame. */
export function renderView(scene, cam, width, height, fovDeg = 55) {
  const px = width * height;
  const colour = new Uint8Array(px * 3);
  const depth = new Float64Array(px).fill(Infinity);
  const tanHalf = Math.tan((fovDeg * Math.PI) / 180 / 2);
  const aspect = width / height;

  for (let i = 0; i < px; i++) {
    // below the horizon reads as ground, so objects sit against something rather than float
    const c = 1 - ((Math.floor(i / width) + 0.5) / height) * 2 < -0.02 ? GROUND : SKY;
    colour[i * 3] = c[0];
    colour[i * 3 + 1] = c[1];
    colour[i * 3 + 2] = c[2];
  }

  const project = (w) => {
    const rel = sub(w, cam.eye);
    const z = dot(rel, cam.forward);
    if (z <= 0.05) return null;
    return [
      ((dot(rel, cam.right) / (z * tanHalf * aspect)) * 0.5 + 0.5) * width,
      (1 - ((dot(rel, cam.up) / (z * tanHalf)) * 0.5 + 0.5)) * height,
      z,
    ];
  };

  const tri = (a, b, c, rgb) => {
    const minx = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0])));
    const maxx = Math.min(width - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
    const miny = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1])));
    const maxy = Math.min(height - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
    if (minx > maxx || miny > maxy) return;
    const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(area) < 1e-6) return;
    const inv = 1 / area;
    const ia = 1 / a[2];
    const ib = 1 / b[2];
    const ic = 1 / c[2];
    for (let y = miny; y <= maxy; y++) {
      const py = y + 0.5;
      for (let x = minx; x <= maxx; x++) {
        const pxx = x + 0.5;
        const w0 = ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (pxx - a[0])) * inv;
        const w1 = ((c[0] - b[0]) * (py - b[1]) - (c[1] - b[1]) * (pxx - b[0])) * inv;
        const w2 = 1 - w0 - w1;
        if (w0 < -0.002 || w1 < -0.002 || w2 < -0.002) continue;
        const z = 1 / (w2 * ia + w0 * ic + w1 * ib); // perspective-correct: interpolate 1/z
        const i = y * width + x;
        if (z >= depth[i]) continue;
        depth[i] = z;
        colour[i * 3] = rgb[0];
        colour[i * 3 + 1] = rgb[1];
        colour[i * 3 + 2] = rgb[2];
      }
    }
  };

  let considered = 0;
  let visible = 0;
  let clipped = 0;
  const materials = new Map();
  const palette = new Set();

  for (const part of scene.parts) {
    if (!renderable(part) || isGroundPlane(part)) continue;
    considered++;
    const sp = [];
    let ok = true;
    for (const c of CORNERS) {
      const p = project(toWorld(part, [c[0] * part.size[0], c[1] * part.size[1], c[2] * part.size[2]]));
      if (!p) {
        ok = false; // a corner is behind the near plane: skip rather than near-clip
        break;
      }
      sp.push(p);
    }
    if (!ok) {
      clipped++;
      continue;
    }
    visible++;
    const mat = part.material ?? 'Plastic';
    materials.set(mat, (materials.get(mat) ?? 0) + 1);
    const [mv, rough, emissive] = MATERIAL_LOOK[mat] ?? [1.0, 0.6, false];
    const base = part.color.map((v) => v / 255);
    // quantise to a 16^3 cube: counts perceptibly distinct hues, not float noise
    palette.add(Math.floor(base[0] * 15) * 256 + Math.floor(base[1] * 15) * 16 + Math.floor(base[2] * 15));
    const alpha = 1 - (part.transparency ?? 0);

    for (const f of FACES) {
      const n = rotateVec(part, f[4]);
      const fc = toWorld(part, [
        ((CORNERS[f[0]][0] + CORNERS[f[2]][0]) / 2) * part.size[0],
        ((CORNERS[f[0]][1] + CORNERS[f[2]][1]) / 2) * part.size[1],
        ((CORNERS[f[0]][2] + CORNERS[f[2]][2]) / 2) * part.size[2],
      ]);
      if (dot(n, norm(sub(fc, cam.eye))) >= 0) continue; // backface cull
      const lam = emissive ? 1.2 : mv * (0.26 + 0.74 * (Math.max(0, -dot(n, SUN)) * (1 - rough * 0.35) + rough * 0.25));
      const [a, b, c2, d] = [sp[f[0]], sp[f[1]], sp[f[2]], sp[f[3]]];
      // distance fog keeps depth ordering readable in a flat-shaded image
      const fog = Math.max(0, Math.min(0.55, (a[2] + b[2] + c2[2] + d[2]) / 4 / 900));
      const rgb = [
        Math.round((Math.min(1, base[0] * lam * alpha) * (1 - fog) + 0.62 * fog) * 255),
        Math.round((Math.min(1, base[1] * lam * alpha) * (1 - fog) + 0.72 * fog) * 255),
        Math.round((Math.min(1, base[2] * lam * alpha) * (1 - fog) + 0.85 * fog) * 255),
      ];
      tri(a, b, c2, rgb);
      tri(a, c2, d, rgb);
    }
  }

  let filled = 0;
  for (let i = 0; i < px; i++) if (depth[i] < Infinity) filled++;

  return {
    rgb: colour,
    meta: {
      width,
      height,
      partsConsidered: considered,
      partsVisible: visible,
      partsOffCamera: clipped,
      subjectCoverage: Math.round((filled / px) * 100) / 100,
      distinctColours: palette.size,
      materials: [...materials].map(([material, parts]) => ({ material, parts })).sort((a, b) => b.parts - a.parts),
    },
  };
}

/** Render every requested viewpoint of a scene. */
export function renderScene(scene, { width = 288, height = 180, view = 'all' } = {}) {
  const b = sceneBounds(scene.parts);
  if (!b) return { error: 'nothing renderable in this scene' };
  const L = scene.lighting;
  return {
    subject: scene.name ?? 'scene',
    boundsSize: sub(b.hi, b.lo).map((v) => Math.round(v * 10) / 10),
    views: viewpoints(b.lo, b.hi, view).map((v) => ({ name: v.name, ...renderView(scene, v.cam, width, height) })),
    // Lighting is reported, never rendered — see SceneLighting in @golem/shared for why.
    lighting: L
      ? {
          brightness: L.brightness ?? 3,
          clockTime: L.clockTime ?? 14.5,
          ambient: L.ambient ?? [0, 0, 0],
          lightInstances: L.lightInstances ?? 0,
          effects: L.effects ?? (L.hasAtmosphere ? ['Atmosphere'] : []),
        }
      : undefined,
  };
}
