/**
 * SCENE KITS — a whole environment from one call, built by arithmetic.
 *
 * Measured 2026-09-23, five sky-island runs on the default model: a flat grey slab (2/10), a tube
 * waterfall and a 192-stud tree, terrain only, a rock ball sitting on the Baseplate, and — with the
 * terrain recipe available — a hand-added grass ball over the recipe's underside and three glass slabs
 * for a waterfall (2/10 again, 17 minutes). Rules in the brief did not change the shapes the model
 * makes. A kit does: the model names the scene and where, and every tree, crystal and waterfall
 * comes out of the same tested geometry. The model is then free to add to it.
 *
 * Pure: returns the terrain operations and the instance tree. tools.ts runs them.
 */
import { expandTerrainRecipe, type TerrainOperation } from './terrain-recipes';

type Vec3 = [number, number, number];
type Prop = { t: string; v: unknown };
export interface KitItem {
  className: string;
  name: string;
  parent?: string;
  props?: Record<string, Prop>;
  children?: KitItem[];
}

const r1 = (n: number) => Math.round(n * 100) / 100;
const v3 = (v: Vec3): Prop => ({ t: 'Vector3', v: v.map(r1) });
const rgb = (r: number, g: number, b: number): Prop => ({ t: 'Color3', v: [r1(r / 255), r1(g / 255), r1(b / 255)] });
const mat = (m: string): Prop => ({ t: 'EnumItem', v: `Enum.Material.${m}` });
const bool = (b: boolean): Prop => ({ t: 'bool', v: b });
const num = (n: number): Prop => ({ t: 'number', v: r1(n) });

/** Rotation matrix for CFrame.Angles(rx, ry, rz) (degrees), row-major as CFrame.new expects. */
function angles(rxDeg: number, ryDeg: number, rzDeg: number): number[] {
  const [x, y, z] = [rxDeg, ryDeg, rzDeg].map((d) => (d * Math.PI) / 180) as Vec3;
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Rx * Ry * Rz
  return [
    cy * cz, -cy * sz, sy,
    sx * sy * cz + cx * sz, -sx * sy * sz + cx * cz, -sx * cy,
    -cx * sy * cz + sx * sz, cx * sy * sz + sx * cz, cx * cy,
  ];
}
/** The CFrame prop for a part centred at `p`, rotated by `rot`. */
function cf(p: Vec3, rot: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1]): Prop {
  return { t: 'CFrame', v: [...p, ...rot].map((n) => Math.round(n * 10000) / 10000) };
}
/** Where a part of height h ends up when its bottom sits at `base` and it is tilted by `rot`. */
function centreFromBase(base: Vec3, h: number, rot: number[]): Vec3 {
  // The part's up axis is the rotation's second column.
  return [base[0] + rot[1]! * (h / 2), base[1] + rot[4]! * (h / 2), base[2] + rot[7]! * (h / 2)];
}

function part(name: string, size: Vec3, frame: Prop, extra: Record<string, Prop> = {}, children?: KitItem[]): KitItem {
  return {
    className: 'Part',
    name,
    props: { Anchored: bool(true), Size: v3(size), CFrame: frame, TopSurface: { t: 'EnumItem', v: 'Enum.SurfaceType.Smooth' }, BottomSurface: { t: 'EnumItem', v: 'Enum.SurfaceType.Smooth' }, ...extra },
    ...(children ? { children } : {}),
  };
}

/**
 * A stylised tree 30-45 studs tall: a trunk of four tapering, slightly leaning segments, two
 * branches, and a canopy of five overlapping balls in two greens that is wider than it is tall —
 * the shape that reads as "tree" at a distance, where one ball on a stick reads as a lollipop.
 */
export function tree(name: string, ground: Vec3, scale: number, lean: number): KitItem {
  const s = scale;
  const bark = rgb(104, 74, 48);
  const kids: KitItem[] = [];
  const widths = [3.6, 3.0, 2.4, 1.9];
  let top: Vec3 = ground;
  widths.forEach((w, k) => {
    const h = 6.5 * s;
    const c: Vec3 = [ground[0] + lean * k * 0.5 * s, ground[1] + h * (k + 0.5), ground[2]];
    kids.push(part(`Trunk${k + 1}`, [w * s, h, w * s], cf(c), { Color: bark, Material: mat('Wood') }));
    top = [c[0], c[1] + h / 2, c[2]];
  });
  for (const [i, side] of [[1, 1], [2, -1]] as const) {
    const rot = angles(0, 0, side * 42);
    const base: Vec3 = [top[0], top[1] - 7 * s, top[2]];
    kids.push(part(`Branch${i}`, [1.3 * s, 8 * s, 1.3 * s], cf(centreFromBase(base, 8 * s, rot), rot), { Color: bark, Material: mat('Wood') }));
  }
  const greens = [rgb(64, 140, 62), rgb(92, 168, 78)];
  const canopy: [Vec3, number][] = [[[0, 3, 0], 17], [[6, 0, 2], 14], [[-6, 1, -2], 13.5], [[2, -1.5, -6], 12.5], [[-2, 1.5, 6], 12]];
  canopy.forEach(([o, d], i) => {
    const c: Vec3 = [top[0] + o[0] * s, top[1] + 2 * s + o[1] * s, top[2] + o[2] * s];
    kids.push(part(`Leaves${i + 1}`, [d * s, d * s * 0.86, d * s], cf(c), {
      Shape: { t: 'EnumItem', v: 'Enum.PartType.Ball' }, Color: greens[i % 2]!, Material: mat('Grass'),
    }));
  });
  return { className: 'Model', name, children: kids };
}

/** Seven tilted neon spikes, the tallest taller than a player, half-set into the ground, with a light. */
export function crystalCluster(name: string, ground: Vec3, scale: number, hue: 'cyan' | 'magenta'): KitItem {
  const colour = hue === 'cyan' ? rgb(90, 230, 255) : rgb(240, 110, 255);
  const spikes: [number, number, number, number][] = [
    // height, tilt x, tilt z, offset angle (deg)
    [15, 0, 4, 0], [11, 18, -10, 60], [10, -16, 12, 140], [8.5, 10, 22, 210], [7, -22, -14, 280], [6, 26, 6, 330], [5, -8, -26, 100],
  ];
  const kids: KitItem[] = spikes.map(([h, tx, tz, a], i) => {
    const hh = h * scale;
    const rot = angles(tx, 0, tz);
    const rad = i === 0 ? 0 : 2.2 * scale;
    const base: Vec3 = [ground[0] + Math.cos((a * Math.PI) / 180) * rad, ground[1] - 1.5, ground[2] + Math.sin((a * Math.PI) / 180) * rad];
    return part(`Spike${i + 1}`, [2.2 * scale, hh, 2.2 * scale], cf(centreFromBase(base, hh, rot), rot), {
      Color: colour, Material: mat('Neon'), Transparency: num(0.12), CastShadow: bool(false),
    }, i === 0 ? [{ className: 'PointLight', name: 'Glow', props: { Color: colour, Range: num(22), Brightness: num(3) } }] : undefined);
  });
  return { className: 'Model', name, children: kids };
}

export interface FloatingIslandKit {
  terrain: TerrainOperation[];
  items: KitItem[];
  spawn: Vec3;
  facts: Record<string, unknown>;
}

/** The floating sky island: landform, stream, waterfall, trees, crystals, mist. */
export function floatingIslandKit(a: { center?: unknown; radius?: unknown; trees?: unknown; crystals?: unknown }): FloatingIslandKit | { error: string } {
  const center: Vec3 = Array.isArray(a.center) && a.center.length === 3 && a.center.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? (a.center as Vec3) : [0, 150, 0];
  const radius = typeof a.radius === 'number' ? a.radius : 50;
  const trees = Math.max(2, Math.min(6, typeof a.trees === 'number' ? Math.round(a.trees) : 4));
  const crystals = Math.max(1, Math.min(5, typeof a.crystals === 'number' ? Math.round(a.crystals) : 3));
  const island = expandTerrainRecipe('floating_island', { center, radius });
  if ('error' in island) return island;
  const [x, , z] = center;
  const surfaceY = island.facts.surfaceY as number;
  const bottomY = island.facts.bottomY as number;
  const usable = island.facts.usableRadius as number;

  // The waterfall leaves the +Z edge: a shallow stream cut into the grass up to the rim, then the sheet.
  const edgeZ = z + radius * 0.97;
  const fall = expandTerrainRecipe('waterfall', { top: [x, surfaceY, edgeZ], height: Math.round(surfaceY - bottomY + 30), width: 10 });
  if ('error' in fall) return fall;
  const stream: TerrainOperation = {
    action: 'fill_block', center: [x, surfaceY - 1, r1(z + radius * 0.72)], size: [8, 2, r1(radius * 0.5)], material: 'Enum.Material.Water',
  };

  const items: KitItem[] = [];
  for (let i = 0; i < trees; i++) {
    const ang = (i / trees) * Math.PI * 2 + 0.6; // away from the stream at angle pi/2
    const d = usable * (0.45 + 0.2 * (i % 2));
    const scale = [1.1, 0.9, 1.15, 0.95, 1.05, 0.85][i]!; // 32-44 studs at the base height of ~38
    items.push(tree(`Tree${i + 1}`, [r1(x + Math.cos(ang) * d), surfaceY - 0.5, r1(z + Math.sin(ang) * d * 0.8 - usable * 0.1)], scale, i % 2 ? -1 : 1));
  }
  for (let i = 0; i < crystals; i++) {
    const ang = (i / crystals) * Math.PI * 2 + 2.1;
    const d = usable * 0.85;
    items.push(crystalCluster(`Crystals${i + 1}`, [r1(x + Math.cos(ang) * d), surfaceY, r1(z + Math.sin(ang) * d)], [1.2, 0.9, 1.0, 0.8, 1.1][i]!, i % 2 ? 'magenta' : 'cyan'));
  }
  const mistAt: Vec3 = [x, (fall.facts.bottomY as number) + 4, edgeZ];
  items.push(part('WaterfallMist', [10, 1, 6], cf(mistAt), { Transparency: num(1), CanCollide: bool(false) }, [{
    className: 'ParticleEmitter', name: 'Mist', props: {
      Rate: num(28), Lifetime: { t: 'NumberRange', v: [2.5, 4.5] }, Speed: { t: 'NumberRange', v: [2, 5] },
      Size: { t: 'NumberSequence', v: [[0, 5, 0], [1, 14, 0]] }, Transparency: { t: 'NumberSequence', v: [[0, 0.45, 0], [1, 1, 0]] },
      Color: { t: 'ColorSequence', v: [[0, [1, 1, 1]], [1, [0.85, 0.93, 1]]] }, LightEmission: num(0.3),
    },
  }]));

  return {
    terrain: [...island.operations, stream, ...fall.operations],
    items: [{ className: 'Folder', name: 'SkyIsland', parent: 'Workspace', children: items }],
    spawn: [x - usable * 0.2, surfaceY + 1, z - usable * 0.3],
    facts: { kit: 'floating_island', surfaceY, usableRadius: usable, bottomY, trees, crystals, waterfallEdge: [x, surfaceY, r1(edgeZ)] },
  };
}

/** Every node in an item tree — the plugin's create limit is 400. */
export function countNodes(items: readonly KitItem[]): number {
  return items.reduce((n, i) => n + 1 + countNodes(i.children ?? []), 0);
}
