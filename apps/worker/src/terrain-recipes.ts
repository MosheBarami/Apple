/**
 * TERRAIN RECIPES — a landform the model names, expanded into ordinary terrain operations.
 *
 * Measured 2026-09-23 on the sky-island mission: left to place balls itself, the model built a flat
 * grey slab (2/10 on its own check), then an L-shaped water tube, then a rock ball sitting ON the
 * Baseplate. The shapes are not the model's strength; naming the landform and its size is. A recipe
 * is pure arithmetic over the same bounded actions edit_terrain already runs (fill_ball, fill_block,
 * replace_material), so it needs no new plugin capability and every step stays inside the plugin's
 * 65,536-voxel ceiling — which is why the island radius is capped at 70 studs.
 */

export type TerrainOperation = Record<string, unknown> & { action: string };

export interface RecipeResult {
  operations: TerrainOperation[];
  /** What the model needs to place things on the result, reported back in the tool result. */
  facts: Record<string, unknown>;
}

const M = (name: string) => `Enum.Material.${name}`;
const round = (n: number) => Math.round(n * 10) / 10;

function vec3(v: unknown): [number, number, number] | null {
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))
    ? [v[0] as number, v[1] as number, v[2] as number]
    : null;
}

export const TERRAIN_RECIPES = ['floating_island', 'waterfall'] as const;
export const ISLAND_RADIUS = { min: 12, max: 70 } as const;

/**
 * floating_island {center, radius}: a rock mass with an underside of four shrinking, slightly offset
 * balls (so it tapers to a point instead of stacking slabs), the top cut flat a quarter of the radius
 * above the centre, a grass cap on that plateau, and slate on the lower underside for strata.
 *
 * waterfall {top, height, width, endsIn}: a sheet of Terrain water four studs deep hanging from `top`
 * (the edge it pours over) — a curtain, not a tube — ending in a pool of water or, for a fall into
 * the sky, in nothing (put add_effect's waterfall mist where it ends).
 */
export function expandTerrainRecipe(recipe: string, a: Record<string, unknown>): RecipeResult | { error: string } {
  if (recipe === 'floating_island') {
    const c = vec3(a.center);
    if (!c) return { error: 'floating_island needs center: [x, y, z]' };
    const r = typeof a.radius === 'number' ? a.radius : NaN;
    if (!Number.isFinite(r) || r < ISLAND_RADIUS.min || r > ISLAND_RADIUS.max) {
      return { error: `floating_island radius must be ${ISLAND_RADIUS.min}-${ISLAND_RADIUS.max} studs` };
    }
    const [x, y, z] = c;
    const plateau = y + 0.25 * r;
    const jitter = [[0.12, -0.08], [-0.1, 0.1], [0.06, 0.12], [-0.08, -0.06]] as const;
    const operations: TerrainOperation[] = [{ action: 'fill_ball', center: [x, y, z], radius: r, material: M('Rock') }];
    for (let k = 1; k <= 4; k++) {
      const [jx, jz] = jitter[k - 1]!;
      operations.push({
        action: 'fill_ball',
        center: [round(x + jx * r), round(y - 0.42 * r * k), round(z + jz * r)],
        radius: round(r * (0.78 - 0.14 * k)),
        material: M('Rock'),
      });
    }
    operations.push(
      // Everything above the plateau goes: a flat top is what reads as land you can stand on.
      { action: 'fill_block', center: [x, round(plateau + 0.6 * r), z], size: [round(2.4 * r), round(1.2 * r), round(2.4 * r)], material: M('Air') },
      { action: 'replace_material', min: [round(x - r), round(plateau - 5), round(z - r)], max: [round(x + r), round(plateau + 1), round(z + r)], sourceMaterial: M('Rock'), targetMaterial: M('Grass') },
      { action: 'replace_material', min: [round(x - r), round(y - 2 * r), round(z - r)], max: [round(x + r), round(y - 0.5 * r), round(z + r)], sourceMaterial: M('Rock'), targetMaterial: M('Slate') },
    );
    return {
      operations,
      facts: {
        recipe,
        surfaceY: round(plateau),
        usableRadius: round(r * 0.85),
        bottomY: round(y - 0.42 * r * 4 - r * 0.22),
        placeOnTop: `stand things on y=${round(plateau)} within ${round(r * 0.85)} studs of [${x}, ${z}]`,
      },
    };
  }
  if (recipe === 'waterfall') {
    const top = vec3(a.top);
    if (!top) return { error: 'waterfall needs top: [x, y, z], the point on the edge it pours over' };
    const height = typeof a.height === 'number' ? a.height : NaN;
    const width = typeof a.width === 'number' ? a.width : 8;
    if (!Number.isFinite(height) || height < 8 || height > 400) return { error: 'waterfall height must be 8-400 studs' };
    if (!Number.isFinite(width) || width < 4 || width > 40) return { error: 'waterfall width must be 4-40 studs' };
    const [x, y, z] = top;
    const operations: TerrainOperation[] = [
      { action: 'fill_block', center: [x, round(y - height / 2), z], size: [width, height, 4], material: M('Water') },
    ];
    const pool = a.endsIn === 'pool';
    if (pool) operations.push({ action: 'fill_ball', center: [x, round(y - height), z], radius: Math.max(8, width), material: M('Water') });
    return {
      operations,
      facts: {
        recipe,
        bottomY: round(y - height),
        endsIn: pool ? 'pool' : 'open air — add_effect waterfall mist here',
      },
    };
  }
  return { error: `recipe must be one of ${TERRAIN_RECIPES.join(', ')}` };
}
