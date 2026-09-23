// THE TERRAIN LOOP (gauntlet round 6, 2026-09-23).
//
// Asked for a full simulator hub, Apple MAX shaped five heightmaps and then made 951 edit_terrain
// calls in a row — one small ball of grass each — until the day's shared capacity ran out. It never
// reached a prop, a script or a single UI screen. Every call succeeded and changed the place, so
// neither the duplicate guard (the arguments differed) nor the idle guard (it was writing) fired.
//
// So terrain writes are counted: a run of consecutive terrain writes is capped, and the cap is
// lifted by any successful change that is not terrain. The ground stays the model's to shape — it
// just cannot be the whole run.

import { projectMutatingToolNames } from './tools';

/** Consecutive terrain writes allowed before the next one is refused. Round 6's first, sane run made 19. */
export const TERRAIN_STREAK_CAP = 24;

let writers: ReadonlySet<string> | null = null;
/** The terrain writers, read from the tool registry rather than listed by hand. */
export function isTerrainWriter(tool: string): boolean {
  writers ??= new Set(projectMutatingToolNames().filter((n) => /terrain/.test(n)));
  return writers.has(tool);
}

/** The refusal for a terrain write past the cap, or null when it may run. */
export function terrainStreakRefusal(streak: number, tool: string): string | null {
  if (!isTerrainWriter(tool) || streak < TERRAIN_STREAK_CAP) return null;
  return (
    `Not run: that would be terrain edit ${streak + 1} in a row. The ground is shaped enough for now — ` +
    'move on to the next part of the game: props from find_library_model + insert_library_model, the ' +
    'gameplay scripts, the UI. Terrain tools open again after you change something else. For a large ' +
    'area use a few shape_terrain heightmap calls (each up to 65,536 voxels), never many small edit_terrain balls.'
  );
}

/** The streak after a call ran: terrain writes add one, any other successful change resets it. */
export function nextTerrainStreak(streak: number, tool: string, ok: boolean, mutated: boolean): number {
  if (isTerrainWriter(tool)) return ok ? streak + 1 : streak;
  return ok && mutated ? 0 : streak;
}
