// A channel, bank or road cut along a line, as the terrain operations the plugin already has.
//
// Owner benchmark 2026-10-02: two terrain builds needed channels and cuts that run along a line, and the terrain tool only
// knew points and boxes, so each one cost a hand-computed ring of fill_ball calls. `path` takes the
// line and its width and depth and expands it here, from the same fill_block operation the tool already runs, so it needs
// no plugin change and no landform recipe (nothing here knows what the channel is FOR).
//
// The line is the SURFACE: each point's y is the top of the channel and `depth` studs go down from it. A covered cut is a path
// whose y is its ceiling. Blocks are axis-aligned squares laid at half-width steps, so the cross-section is
// rectangular on the axes and up to 1.4x the width on a diagonal.
//
// Pure: the operations and the facts about them, or the one sentence that says what is wrong.

import { sampleAlong, type Vec3 } from './placement.ts';

export const TERRAIN_CELL = 4;
export const TERRAIN_VOXEL_CAP = 65_536;
/** Operations one path may expand to. A path over this is split by the model, not silently truncated. */
export const TERRAIN_PATH_OP_CAP = 256;
/** Share of a `Water` path's depth the water fills when the caller does not say (the surface sits below the bank). */
export const WATER_LEVEL_DEFAULT = 0.75;

const MATERIAL = /^Enum\.Material\.[A-Za-z]+$/;
const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

export interface TerrainPathExpansion {
  operations: Record<string, unknown>[];
  facts: { samples: number; lengthStuds: number; stepStuds: number; operations: number };
}

export function expandTerrainPath(p: Record<string, unknown>, limit = 100_000): TerrainPathExpansion | { error: string } {
  const points = p.points;
  if (!Array.isArray(points) || points.length < 2 || points.length > 32 || !points.every((v) => Array.isArray(v) && v.length === 3 && v.every(finite))) {
    return { error: 'path needs points: 2-32 positions [x, y, z], where y is the surface along the line.' };
  }
  if ((points as Vec3[]).some((v) => v.some((n) => Math.abs(n) > limit))) return { error: 'path.points holds a position outside the world.' };
  const width = p.width;
  const depth = p.depth;
  if (!finite(width) || width < TERRAIN_CELL || width > 200) return { error: `path.width must be ${TERRAIN_CELL}-200 studs.` };
  if (!finite(depth) || depth < 1 || depth > 200) return { error: 'path.depth must be 1-200 studs (how far down from the line the channel goes).' };
  const fill = p.fill === undefined ? 'Air' : p.fill;
  if (fill !== 'Air' && fill !== 'Water' && fill !== 'material') return { error: 'path.fill must be "Air" (carve), "Water" (carve and fill with water) or "material" (fill with path.material).' };
  if (fill === 'material' && !(typeof p.material === 'string' && MATERIAL.test(p.material))) return { error: 'path.fill "material" needs path.material, e.g. "Enum.Material.Sand".' };
  const level = p.waterLevel === undefined ? WATER_LEVEL_DEFAULT : p.waterLevel;
  if (p.waterLevel !== undefined && fill !== 'Water') return { error: 'path.waterLevel applies only with fill "Water".' };
  if (!finite(level) || level < 0 || level > 1) return { error: 'path.waterLevel must be 0-1: the share of the depth the water fills (default 0.75; 0 leaves the channel dry).' };
  const water = fill === 'Water' && level > 0;

  const cells = Math.ceil(width / TERRAIN_CELL) * Math.ceil(depth / TERRAIN_CELL) * Math.ceil(width / TERRAIN_CELL);
  if (cells > TERRAIN_VOXEL_CAP) return { error: `one block of this path would touch ${cells} voxels; the limit is ${TERRAIN_VOXEL_CAP} per operation. Use a smaller width or depth.` };

  const step = Math.max(TERRAIN_CELL, width / 2);
  const samples = sampleAlong(points as Vec3[], { spacing: step });
  const length = (points as Vec3[]).slice(1).reduce((n, v, i) => n + Math.hypot(v[0] - (points as Vec3[])[i]![0], v[1] - (points as Vec3[])[i]![1], v[2] - (points as Vec3[])[i]![2]), 0);
  const total = samples.length * (water ? 2 : 1);
  if (total > TERRAIN_PATH_OP_CAP) {
    return { error: `this path needs ${total} blocks (${samples.length} along ${Math.round(length)} studs at a ${Math.round(step)}-stud step); the limit is ${TERRAIN_PATH_OP_CAP} per call. Split it into two paths, or widen it.` };
  }

  const block = (at: Vec3, height: number, yCenter: number, material: string): Record<string, unknown> => ({
    action: 'fill_block',
    center: [round(at[0]), round(yCenter), round(at[2])],
    size: [width, height, width],
    material,
  });
  const operations: Record<string, unknown>[] = [];
  // Carve first, for every sample, so water laid by one block is never carved away by the next.
  const first = fill === 'material' ? (p.material as string) : 'Enum.Material.Air';
  for (const at of samples) operations.push(block(at, depth, at[1] - depth / 2, first));
  if (water) {
    // Water fills the lower `level` of the depth (default three quarters): the surface sits below the bank, as a channel's does.
    const waterHeight = Math.max(TERRAIN_CELL, Math.round(depth * level));
    for (const at of samples) operations.push(block(at, waterHeight, at[1] - depth + waterHeight / 2, 'Enum.Material.Water'));
  }
  return { operations, facts: { samples: samples.length, lengthStuds: Math.round(length), stepStuds: step, operations: operations.length } };
}

const round = (n: number) => Math.round(n * 100) / 100;
