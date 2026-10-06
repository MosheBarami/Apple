/**
 * WORLDKIT: the world pieces StudPilot builds from parts (planning/STYLE-BIBLE.md §4), the world's counterpart of
 * studkit.ts. Blocks place `{ "world": <component>, ... }` nodes; recipe.ts expands them here into plain part specs with
 * computed CFrames, so a model only gives positions, sizes in studs and colour names. Everything is anchored, chunky
 * (nothing thinner than 0.4 studs but fence rails) and saturated, with the stud texture on walkable tops.
 */
const STUD_IMAGE = 'rbxassetid://7447638591';

/** Ground and material colours (bible §4.1), with the studs' tint. */
export const SURFACES = {
  grass: ['#4FAE2C', '#2A6512'],
  sand: ['#F2D38B', '#A9843E'],
  dirt: ['#B87A45', '#5E3818'],
  brick: ['#D86A4A', '#7A2C16'],
  stone: ['#B9C2CC', '#6E7A86'],
  wood: ['#C98A4B', '#7A4A22'],
} as const;
export type Surface = keyof typeof SURFACES;

/** Awning stripes and flower colours by name (the candy palette, bible §3.2). */
export const CANDY = { red: '#E0263F', berry: '#FF4FA3', sun: '#FFD23A', lime: '#7FD82A', sky: '#1FA6E0', grape: '#8A3FFC', white: '#FFFFFF' } as const;

type V = Record<string, unknown>;
export interface Spec { className: string; name: string; props?: V; attributes?: V; children?: Spec[] }

const v3 = (x: number, y: number, z: number) => ({ t: 'Vector3', v: [x, y, z] });
const enumOf = (kind: string, item: string) => ({ t: 'EnumItem', v: `Enum.${kind}.${item}` });
/** A CFrame at (x, y, z) turned `yaw` radians about the vertical. */
const cframe = (x: number, y: number, z: number, yaw = 0) => {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return { t: 'CFrame', v: [x, y, z, c, 0, s, 0, 1, 0, -s, 0, c] };
};
const tag = (component: string, part: string): V => ({ WorldKit: `${component}.${part}` });
const num = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
const surface = (s: unknown): Surface => (typeof s === 'string' && s in SURFACES ? (s as Surface) : 'grass');
const candy = (c: unknown, d: keyof typeof CANDY) => CANDY[(typeof c === 'string' && c in CANDY ? c : d) as keyof typeof CANDY];

function part(component: string, name: string, size: number[], cf: unknown, colour: string, opts: { shape?: string; material?: string; studs?: string; collide?: boolean } = {}): Spec {
  return {
    className: 'Part', name,
    props: {
      Anchored: true, CanCollide: opts.collide ?? true, Size: v3(size[0]!, size[1]!, size[2]!), CFrame: cf, Color: colour,
      Material: enumOf('Material', opts.material ?? 'SmoothPlastic'), TopSurface: enumOf('SurfaceType', 'Smooth'), BottomSurface: enumOf('SurfaceType', 'Smooth'),
      ...(opts.shape ? { Shape: enumOf('PartType', opts.shape) } : {}),
    },
    attributes: tag(component, name),
    ...(opts.studs ? { children: [{ className: 'Texture', name: 'Studs', props: { Texture: STUD_IMAGE, Face: enumOf('NormalId', 'Top'), StudsPerTileU: 2, StudsPerTileV: 2, Transparency: 0.25, Color3: opts.studs } }] } : {}),
  };
}

function title(text: unknown, height: number, colour = '#FFD23A'): Spec {
  return {
    className: 'BillboardGui', name: 'Title',
    props: { Size: { t: 'UDim2', v: [0, 280, 0, 70] }, StudsOffsetWorldSpace: v3(0, height, 0), AlwaysOnTop: false, MaxDistance: 160 },
    attributes: tag('title', 'holder'),
    children: [{
      className: 'TextLabel', name: 'Label',
      props: { Size: { t: 'UDim2', v: [1, 0, 1, 0] }, BackgroundTransparency: 1, Text: text, TextScaled: true, Font: enumOf('Font', 'FredokaOne'), TextColor3: colour },
      attributes: { StudKit: 'billboard.title' },
      children: [{ className: 'UIStroke', name: 'Outline', props: { Thickness: 4, Color: '#3A1A06', LineJoinMode: enumOf('LineJoinMode', 'Round') } }],
    }],
  };
}

const COMPONENTS: Record<string, (n: V) => Spec> = {
  /** A straight path from `from` to `to` ([x, z]), `width` studs wide, in a surface colour, studded, just above the ground. */
  path: (n) => {
    const [x1, z1] = (n.from as number[]).map(Number) as [number, number];
    const [x2, z2] = (n.to as number[]).map(Number) as [number, number];
    const len = Math.max(1, Math.hypot(x2 - x1, z2 - z1));
    const yaw = Math.atan2(x2 - x1, z2 - z1);
    const [colour, studs] = SURFACES[surface(n.surface)];
    return part('path', String(n.name ?? 'Path'), [num(n.width, 8), 0.4, len + num(n.width, 8) * 0.5], cframe((x1 + x2) / 2, 0.2, (z1 + z2) / 2, yaw), colour, { studs });
  },
  /**
   * A market stall (bible §4.3, R10/R11): a wooden counter, four posts, a striped awning in two candy colours and a
   * floating title. `at` is [x, z]; it faces `facing` degrees.
   */
  stall: (n) => {
    const [x, z] = (n.at as number[]).map(Number) as [number, number];
    const yaw = (num(n.facing, 0) * Math.PI) / 180;
    const local = (dx: number, dy: number, dz: number) => cframe(x + dx * Math.cos(yaw) + dz * Math.sin(yaw), dy, z - dx * Math.sin(yaw) + dz * Math.cos(yaw), yaw);
    const a = candy(n.stripe, 'red'), b = candy(n.stripe2, 'white');
    const kids: Spec[] = [
      part('stall', 'Counter', [12, 3.5, 4], local(0, 1.75, 2), SURFACES.wood[0], { material: 'WoodPlanks' }),
      part('stall', 'CounterTop', [12.6, 0.6, 4.6], local(0, 3.8, 2), '#8A5A2E', { material: 'WoodPlanks' }),
      ...[[-5.6, 3.6], [5.6, 3.6], [-5.6, -2], [5.6, -2]].map(([dx, dz], i) => part('stall', `Post${i + 1}`, [0.8, 9, 0.8], local(dx!, 4.5, dz!), '#7A4A22', { material: 'WoodPlanks' })),
      ...Array.from({ length: 6 }, (_, i) => part('stall', `Awning${i + 1}`, [2.2, 0.5, 7.4], { ...local(-5.5 + i * 2.2, 9.2, 0.8), v: [...(local(-5.5 + i * 2.2, 9.2, 0.8).v.slice(0, 3)), ...tiltRow(yaw)] }, i % 2 ? b : a)),
      { ...part('stall', 'Sign', [6, 1.6, 0.5], local(0, 10.6, 4.4), candy(n.stripe, 'red')), children: [title(n.title, 3)] },
    ];
    return { className: 'Model', name: String(n.name ?? 'Stall'), attributes: tag('stall', 'holder'), children: kids };
  },
  /** A soft green hill: a big ball sunk into the ground, studded, for backdrops (bible §4.4: close the horizon). */
  hill: (n) => {
    const [x, z] = (n.at as number[]).map(Number) as [number, number];
    const size = num(n.size, 40);
    const [colour, studs] = SURFACES[surface(n.surface ?? 'grass')];
    return part('hill', String(n.name ?? 'Hill'), [size, size * 0.6, size], cframe(x, size * 0.12, z), colour, { shape: 'Ball', studs, collide: true });
  },
  /** A ring of hills around a centre that closes the horizon: `count` hills at `radius`, sizes varied, a gap at `gap` degrees. */
  hillring: (n) => {
    const [x, z] = (n.center as number[]).map(Number) as [number, number];
    const radius = num(n.radius, 140), count = Math.max(4, Math.min(24, Math.floor(num(n.count, 12))));
    const gap = (num(n.gap, 0) * Math.PI) / 180;
    const hills: Spec[] = [];
    for (let i = 0; i < count; i += 1) {
      const a = gap + 0.35 + (i / count) * (Math.PI * 2 - 0.7);
      const jitter = ((Math.sin((i + 1) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      hills.push(COMPONENTS.hill!({ name: `Hill${i + 1}`, at: [x + Math.sin(a) * radius * (0.92 + jitter * 0.16), z + Math.cos(a) * radius * (0.92 + jitter * 0.16)], size: 46 + jitter * 40 }));
    }
    return { className: 'Model', name: String(n.name ?? 'Hills'), attributes: tag('hillring', 'holder'), children: hills };
  },
  /** A flower bed: a raised wooden border with a dirt top and small flowers in two candy colours. */
  flowers: (n) => {
    const [x, z] = (n.at as number[]).map(Number) as [number, number];
    const w = num(n.width, 10), d = num(n.depth, 5);
    const a = candy(n.colour, 'berry'), b = candy(n.colour2, 'sun');
    const blooms: Spec[] = [];
    let k = 0;
    for (let i = 0; i < Math.floor(w / 1.6); i += 1) for (let j = 0; j < Math.floor(d / 1.6); j += 1) {
      const jitter = ((Math.sin((k + 1) * 78.233) * 43758.5453) % 1 + 1) % 1;
      blooms.push(part('flowers', `Bloom${k += 1}`, [1, 1, 1], cframe(x - w / 2 + 0.9 + i * 1.6 + jitter * 0.4, 1.6 + jitter * 0.3, z - d / 2 + 0.9 + j * 1.6), (i + j) % 2 ? a : b, { shape: 'Ball', collide: false }));
    }
    return { className: 'Model', name: String(n.name ?? 'Flowers'), attributes: tag('flowers', 'holder'), children: [
      part('flowers', 'Border', [w + 1, 1, d + 1], cframe(x, 0.5, z), SURFACES.wood[0], { material: 'WoodPlanks' }),
      part('flowers', 'Soil', [w, 0.4, d], cframe(x, 1.05, z), SURFACES.dirt[0], { studs: SURFACES.dirt[1] }),
      ...blooms,
    ] };
  },
};

/** The awning's slope: tilted 12 degrees down towards the front, about the stall's own axis. */
function tiltRow(yaw: number): number[] {
  const t = (12 * Math.PI) / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw), ct = Math.cos(t), st = Math.sin(t);
  // R = Ry(yaw) * Rx(t)
  return [c, s * st, s * ct, 0, ct, -st, -s, c * st, c * ct];
}

export const WORLD_COMPONENTS = Object.keys(COMPONENTS);

/** A recipe item with `world` nodes in it, as plain part specs. Pure. */
export function expandWorld(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(expandWorld);
  if (!node || typeof node !== 'object') return node;
  const n = node as V;
  if (typeof n.world === 'string') {
    const make = COMPONENTS[n.world];
    if (!make) throw new Error(`WorldKit has no component "${n.world}" (it has ${WORLD_COMPONENTS.join(', ')})`);
    return make(n);
  }
  return Object.fromEntries(Object.entries(n).map(([k, v]) => [k, k === 'children' || k === 'items' ? expandWorld(v) : v]));
}
