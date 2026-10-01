/**
 * STUDS BY DEFAULT (owner, 2026-10-01): every part Apple makes, from every component and tool, is studded unless the
 * user asked for another surface. The studs are Resurface's (cxmeel, https://github.com/cxmeel/resurface-plugin): a
 * MaterialVariant on Plastic with a stud colour map and normal map, one stud per tile, so a brick, a ball, a mesh or a
 * union all get classic studs on every face. The plugin's Surface family (apps/apple-plugin/src/ops/Surface.luau) does
 * the work; the image ids live here because the shipped plugin holds none.
 */
import type { StudioOp, SurfaceMaps } from '@golem/shared';

/** Resurface's surface maps (src/Assets/MaterialVariants.luau), public images by cxmeel. */
export const SURFACE_MAPS = {
  studs: { colorMap: 'rbxassetid://10509831729', normalMap: 'rbxassetid://10509831753', studsPerTile: 1 },
  inlet: { colorMap: 'rbxassetid://10509827175', normalMap: 'rbxassetid://10509827228', studsPerTile: 1 },
  universal: { colorMap: 'rbxassetid://10509840768', normalMap: 'rbxassetid://10509840812', studsPerTile: 2 },
  weld: { colorMap: 'rbxassetid://10509843977', normalMap: 'rbxassetid://10509844001', studsPerTile: 2 },
  glue: { colorMap: 'rbxassetid://10509635556', normalMap: 'rbxassetid://10509645465', studsPerTile: 1 },
} as const satisfies Record<string, SurfaceMaps>;
export type SurfaceKind = keyof typeof SURFACE_MAPS | 'smooth' | 'smooth_no_outlines';

/**
 * Whether the user asked for a surface of their own. Only the user's words count (never the model's choice of
 * material): "smooth", "no studs", "realistic", "textured", or a named material for the build ("marble floor",
 * "neon", "wooden planks"...). Anything else is studded.
 */
const OWN_SURFACE = [
  /\b(no[ -]?studs?|without (the )?studs|unstudded|not studded|studless|turn off (the )?studs)\b/i,
  /\b(realistic|photo-?real(istic)?|smooth|textured|pbr)\s+(look|style|graphics|parts|surfaces?|blocks|plastic|textures?|materials?|world|map)\b/i,
  /\b(use|with|add|apply|give it)\s+(real\s+)?(textures?|materials?|surface ?appearances?)\b/i,
  /\b(marble|granite|concrete|metal(lic)?|wood(en)?|brick|glass|slate|cobblestone|sand ?stone|fabric|foil)\s+(textures?|materials?|floors?|walls?|surfaces?|parts|look)\b/i,
];
export function userWantsOwnSurface(request: string | undefined): boolean {
  return !!request && OWN_SURFACE.some((r) => r.test(request));
}

/** The op that tells the plugin what this run's new parts get. */
export function surfaceDefaultOp(request: string | undefined): Extract<StudioOp, { op: 'set_surface_default' }> {
  return userWantsOwnSurface(request) ? { op: 'set_surface_default', surface: 'keep' } : { op: 'set_surface_default', surface: 'studs', maps: SURFACE_MAPS.studs };
}

/** The op that gives these places a surface on every face. */
export function applySurfaceOp(paths: string[], surface: SurfaceKind = 'studs'): Extract<StudioOp, { op: 'apply_surface' }> {
  return surface === 'smooth' || surface === 'smooth_no_outlines'
    ? { op: 'apply_surface', paths, surface }
    : { op: 'apply_surface', paths, surface, maps: SURFACE_MAPS[surface] };
}
