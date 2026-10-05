//[[ THE LAYOUT FLAGS: WHAT A MODEL-FREE LOOK AT THE PLACE'S GEOMETRY CAN SAY, WITHOUT A RENDER.
//
//   Measured 2026-10-04 (t1 round 1, causes C4): a perfect 32-node mirrored grid of identical clusters, slab walls and a
//   roof, no terrain, and caves placed beyond the outer wall. check_composition judges height hierarchy and mass; it could
//   not see any of that because it reads a flat part list with no names and no grouping. This reads the typed Workspace
//   tree (get_tree) and the Lighting rig, costs no model call, and reports FACTS the agent decides about:
//
//     repeated_grid    many identical models on a regular lattice (or in a line at an even spacing)
//     mirrored         many identical models laid out as reflections of one another about their centre
//     outside_walls    objects whose centres lie outside the enclosure the walls make (or, with no walls, outside the ground
//                      plates the map stands on)
//     open_flat_map    no terrain, no enclosing walls and nothing standing up, in a place with enough parts to be a map
//     dark_lighting    ambient, brightness and time of day that leave the scene near-black with too few lights to read it
//
//   STRUCTURAL, NOT A SUBJECT. Nothing here knows what the scene is about. The one place the request is read is `open_flat_map`:
//   when the request names an ENCLOSED SPACE (a cave, a tunnel, an interior...) the flag is `high` instead of `info`, because an
//   open flat field is then the opposite of what was asked. That is a class of space, not a game or a subject; it never
//   selects a tool, a recipe or a skill, and a flat open map the request did not describe as enclosed is reported as information.
//
//   Every threshold is a named constant below and a flag states the numbers it measured, so the agent can disagree with it.
//   A tree the plugin cut off (`truncated`) is said to be a sample. ]]

export type FlagKind = 'repeated_grid' | 'mirrored' | 'outside_walls' | 'open_flat_map' | 'dark_lighting';
export interface SceneFlag { kind: FlagKind; severity: 'high' | 'info'; text: string }

/** Identical units needed before repetition is a pattern, not a pair of copies. */
export const MIN_REPEATS = 6;
/** Studs within which two coordinates are the same lattice line, or a mirrored partner is found. */
const LATTICE_TOL = 1.5;
/** A grid's occupied lattice cells must be at least this share of its cells for the group to read as a grid. */
const GRID_FILL = 0.75;
/** Share of a group that must have a mirrored partner (own twins on the axis included), and the share that must be a real pair. */
const MIRROR_SHARE = 0.8;
const MIRROR_PAIRED = 0.6;
/** A line of identical units is "even" when its gaps vary less than this share of their mean. */
const EVEN_GAP = 0.06;
/** Wall-like parts: at least this tall, at most this thick, at least this long (studs). */
const WALL_MIN_HEIGHT = 8;
const WALL_MAX_THICK = 8;
const WALL_MIN_LENGTH = 24;
/** Floor-like parts: at least this wide in both directions and at most this thick. */
const FLOOR_MIN_SPAN = 40;
const FLOOR_MAX_THICK = 8;
/** An enclosure needs at least this many walls and at least this span in both directions. */
const ENCLOSURE_MIN_WALLS = 3;
const ENCLOSURE_MIN_SPAN = 30;
/** Studs of slack past a wall or a ground plate before a centre counts as outside. */
const BOUNDS_MARGIN = 3;
/** Parts a place needs before "no terrain, no enclosure" describes a map. */
const MAP_MIN_PARTS = 20;
/** A place whose parts rise no more than this above their lowest point is flat. */
const FLAT_HEIGHT = 14;
/** Very dark lighting: ambient (0..255) at most this by day, or this at night, with fewer lights than this in the workspace. */
const DARK_AMBIENT = 40;
const DARK_NIGHT_AMBIENT = 70;
const DARK_MAX_LIGHTS = 4;
/** Words that say the request is for an enclosed space. A class of space, never a subject (see the header). */
const ENCLOSED_SPACE = /\b(?:caves?|caverns?|tunnels?|interiors?|indoors?|underground|dungeons?|rooms?|corridors?|hallways?|inside)\b/i;

type Vec = [number, number, number];
interface Unit { name: string; path: string; centre: Vec; size: Vec; parts: number; sig: string }
interface Walk { units: Unit[]; walls: Box[]; floors: Box[]; parts: Box[]; lights: number; nodes: number }
interface Box { lo: Vec; hi: Vec }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const tagged = (v: unknown): unknown => (isObj(v) && typeof v.t === 'string' && 'v' in v ? v.v : v);
const vec = (v: unknown): Vec | null => {
  const t = tagged(v);
  return Array.isArray(t) && t.length >= 3 && t.slice(0, 3).every((n) => typeof n === 'number' && Number.isFinite(n)) ? [t[0] as number, t[1] as number, t[2] as number] : null;
};
const num = (v: unknown): number | null => {
  const t = tagged(v);
  return typeof t === 'number' && Number.isFinite(t) ? t : null;
};
const round1 = (n: number): number => Math.round(n * 10) / 10;
const kids = (n: Record<string, unknown>): Record<string, unknown>[] => (Array.isArray(n.children) ? (n.children as unknown[]).filter(isObj) : []);

function boxOf(pos: Vec, size: Vec): Box {
  return { lo: [pos[0] - size[0] / 2, pos[1] - size[1] / 2, pos[2] - size[2] / 2], hi: [pos[0] + size[0] / 2, pos[1] + size[1] / 2, pos[2] + size[2] / 2] };
}
function unionOf(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const lo: Vec = [Infinity, Infinity, Infinity];
  const hi: Vec = [-Infinity, -Infinity, -Infinity];
  for (const b of boxes) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i]!, b.lo[i]!); hi[i] = Math.max(hi[i]!, b.hi[i]!); }
  return { lo, hi };
}

/** Walk the Workspace tree once: the leaf units (models and loose parts), the wall-like and floor-like parts, light instances. */
function walkTree(root: Record<string, unknown>): Walk {
  const w: Walk = { units: [], walls: [], floors: [], parts: [], lights: 0, nodes: 0 };
  /** The boxes of every part at or below a node, and whether any descendant model holds parts of its own. */
  const partBoxes = (n: Record<string, unknown>, out: Box[]): void => {
    w.nodes += 1;
    const cls = typeof n.class === 'string' ? n.class : '';
    if (cls === 'PointLight' || cls === 'SpotLight' || cls === 'SurfaceLight') w.lights += 1;
    const props = isObj(n.props) ? n.props : {};
    const pos = vec(props.Position) ?? vec(props.CFrame);
    const size = vec(props.Size);
    if (pos && size && (num(props.Transparency) ?? 0) < 0.95) {
      const b = boxOf(pos, size);
      out.push(b);
      w.parts.push(b);
      const h = size[1];
      const thick = Math.min(size[0], size[2]);
      const long = Math.max(size[0], size[2]);
      if (h >= WALL_MIN_HEIGHT && thick <= WALL_MAX_THICK && long >= WALL_MIN_LENGTH) w.walls.push(b);
      if (size[0] >= FLOOR_MIN_SPAN && size[2] >= FLOOR_MIN_SPAN && h <= FLOOR_MAX_THICK) w.floors.push(b);
    }
    for (const c of kids(n)) partBoxes(c, out);
  };
  const holdsSubUnits = (n: Record<string, unknown>): boolean => kids(n).some((c) => (c.class === 'Model' || c.class === 'Folder') && (hasParts(c)));
  const hasParts = (n: Record<string, unknown>): boolean => {
    const props = isObj(n.props) ? n.props : {};
    return (vec(props.Position) ?? vec(props.CFrame)) !== null && vec(props.Size) !== null ? true : kids(n).some(hasParts);
  };
  const visit = (n: Record<string, unknown>, top: boolean): void => {
    const cls = typeof n.class === 'string' ? n.class : '';
    const container = cls === 'Model' || cls === 'Folder' || top;
    if (container && holdsSubUnits(n)) {
      w.nodes += 1;
      for (const c of kids(n)) visit(c, false);
      return;
    }
    const boxes: Box[] = [];
    if (cls === 'Model' || cls === 'Folder') {
      partBoxes(n, boxes);
      const u = unionOf(boxes);
      if (u) {
        const size: Vec = [u.hi[0] - u.lo[0], u.hi[1] - u.lo[1], u.hi[2] - u.lo[2]];
        w.units.push({
          name: String(n.name ?? ''), path: String(n.path ?? ''), centre: [(u.lo[0] + u.hi[0]) / 2, (u.lo[1] + u.hi[1]) / 2, (u.lo[2] + u.hi[2]) / 2], size, parts: boxes.length,
          sig: `${cls}|${round1(size[0])}x${round1(size[1])}x${round1(size[2])}|${boxes.length}`,
        });
      }
      return;
    }
    if (top) {
      for (const c of kids(n)) visit(c, false);
      return;
    }
    // A loose part (or anything else holding parts): one unit per node, plus whatever sits under it.
    partBoxes(n, boxes);
    const props = isObj(n.props) ? n.props : {};
    const pos = vec(props.Position) ?? vec(props.CFrame);
    const size = vec(props.Size);
    if (pos && size && (num(props.Transparency) ?? 0) < 0.95) {
      w.units.push({ name: String(n.name ?? ''), path: String(n.path ?? ''), centre: pos, size, parts: 1, sig: `${cls}|${round1(size[0])}x${round1(size[1])}x${round1(size[2])}|1` });
    }
  };
  visit(root, true);
  return w;
}

/** Distinct values of `xs` within `tol` of each other counted once. */
function lattice(xs: number[], tol: number): number[] {
  const sorted = [...xs].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of sorted) if (!out.length || x - out[out.length - 1]! > tol) out.push(x);
  return out;
}

function repetition(units: Unit[]): SceneFlag[] {
  const flags: SceneFlag[] = [];
  const groups = new Map<string, Unit[]>();
  for (const u of units) groups.set(u.sig, [...(groups.get(u.sig) ?? []), u]);
  for (const g of [...groups.values()].sort((a, b) => b.length - a.length)) {
    if (g.length < MIN_REPEATS) break;
    const [sx, sy, sz] = g[0]!.size;
    const what = `${g.length} identical objects (${round1(sx)} x ${round1(sy)} x ${round1(sz)} studs${g[0]!.parts > 1 ? `, ${g[0]!.parts} parts each` : ''}, e.g. ${g.slice(0, 2).map((u) => u.name).filter(Boolean).join(', ') || 'unnamed'})`;
    const ux = lattice(g.map((u) => u.centre[0]), LATTICE_TOL);
    const uz = lattice(g.map((u) => u.centre[2]), LATTICE_TOL);
    const cells = ux.length * uz.length;
    const asGrid = ux.length >= 2 && uz.length >= 2 && g.length / cells >= GRID_FILL;
    let line = false;
    if ((ux.length === 1 || uz.length === 1) && g.length >= MIN_REPEATS) {
      const along = (ux.length === 1 ? uz : ux);
      if (along.length >= MIN_REPEATS) {
        const gaps = along.slice(1).map((v, i) => v - along[i]!);
        const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const dev = Math.max(...gaps.map((x) => Math.abs(x - mean)));
        line = mean > 0 && dev / mean <= EVEN_GAP;
      }
    }
    if (asGrid || line) {
      flags.push({
        kind: 'repeated_grid', severity: 'high',
        text: `${what} sit on a regular ${asGrid ? `${ux.length} x ${uz.length} grid` : 'line at an even spacing'}. Players read a pattern like this as a placeholder; vary size, tilt and spacing, and cluster them by purpose.`,
      });
      continue;
    }
    const cx = g.reduce((a, u) => a + u.centre[0], 0) / g.length;
    const cz = g.reduce((a, u) => a + u.centre[2], 0) / g.length;
    // A reflection pairs a unit with a DIFFERENT unit at its mirror position; a unit on the axis is its own twin and only counts
    // toward the total, never as proof (a line of units along an axis would otherwise reflect onto itself).
    const share = (f: (u: Unit) => [number, number]): number => {
      let paired = 0;
      let onAxis = 0;
      for (const u of g) {
        const [x, z] = f(u);
        if (Math.abs(u.centre[0] - x) <= LATTICE_TOL && Math.abs(u.centre[2] - z) <= LATTICE_TOL) onAxis += 1;
        else if (g.some((o) => o !== u && Math.abs(o.centre[0] - x) <= LATTICE_TOL && Math.abs(o.centre[2] - z) <= LATTICE_TOL)) paired += 1;
      }
      return paired / g.length >= MIRROR_PAIRED && (paired + onAxis) / g.length >= MIRROR_SHARE ? (paired + onAxis) / g.length : 0;
    };
    const best = Math.max(
      share((u) => [2 * cx - u.centre[0], u.centre[2]]),
      share((u) => [u.centre[0], 2 * cz - u.centre[2]]),
      share((u) => [2 * cx - u.centre[0], 2 * cz - u.centre[2]]),
    );
    if (best >= MIRROR_SHARE) {
      flags.push({
        kind: 'mirrored', severity: 'high',
        text: `${what} are laid out as mirror images of one another about their centre (${Math.round(best * 100)}% have a reflected twin). Natural places are not symmetrical; break the mirror with different counts, sizes and positions on each side.`,
      });
    }
  }
  return flags.slice(0, 3);
}

function bounds(w: Walk): SceneFlag[] {
  const flags: SceneFlag[] = [];
  const wallBox = unionOf(w.walls);
  const enclosed = w.walls.length >= ENCLOSURE_MIN_WALLS && wallBox
    && wallBox.hi[0] - wallBox.lo[0] >= ENCLOSURE_MIN_SPAN && wallBox.hi[2] - wallBox.lo[2] >= ENCLOSURE_MIN_SPAN;
  const region = enclosed ? wallBox : unionOf(w.floors);
  if (!region) return flags;
  const inside = (u: Unit): boolean =>
    u.centre[0] >= region.lo[0] - BOUNDS_MARGIN && u.centre[0] <= region.hi[0] + BOUNDS_MARGIN
    && u.centre[2] >= region.lo[2] - BOUNDS_MARGIN && u.centre[2] <= region.hi[2] + BOUNDS_MARGIN;
  // Walls and ground plates are the bounds, not things inside them.
  const things = w.units.filter((u) => !(u.size[1] >= WALL_MIN_HEIGHT && Math.min(u.size[0], u.size[2]) <= WALL_MAX_THICK && Math.max(u.size[0], u.size[2]) >= WALL_MIN_LENGTH)
    && !(u.size[0] >= FLOOR_MIN_SPAN && u.size[2] >= FLOOR_MIN_SPAN && u.size[1] <= FLOOR_MAX_THICK));
  const outside = things.filter((u) => !inside(u));
  // If most things are outside, the "region" is not what the map is built in (a lone ground plate beside the build), not a boundary broken.
  if (!outside.length || outside.length > things.length / 2) return flags;
  const names = outside.slice(0, 4).map((u) => u.name || 'unnamed').join(', ');
  flags.push({
    kind: 'outside_walls', severity: 'high',
    text: `${outside.length} of ${things.length} objects stand outside the ${enclosed ? 'walls that enclose the map' : 'ground the map stands on'} (${names}${outside.length > 4 ? ', ...' : ''}): ` +
      `the ${enclosed ? 'walls' : 'ground'} span x ${Math.round(region.lo[0])}..${Math.round(region.hi[0])}, z ${Math.round(region.lo[2])}..${Math.round(region.hi[2])}. Move them inside, or extend what encloses them.`,
  });
  return flags;
}

function openFlat(w: Walk, terrainSolidVoxels: number | null | undefined, request: string | undefined): SceneFlag[] {
  if (w.parts.length < MAP_MIN_PARTS) return [];
  const wallBox = unionOf(w.walls);
  const enclosed = w.walls.length >= ENCLOSURE_MIN_WALLS && wallBox
    && wallBox.hi[0] - wallBox.lo[0] >= ENCLOSURE_MIN_SPAN && wallBox.hi[2] - wallBox.lo[2] >= ENCLOSURE_MIN_SPAN;
  if (enclosed) return [];
  // Unknown terrain is not "no terrain": a read that failed says nothing, and nothing is flagged on it.
  if (terrainSolidVoxels === undefined || terrainSolidVoxels === null || terrainSolidVoxels > 0) return [];
  const all = unionOf(w.parts)!;
  const rise = all.hi[1] - all.lo[1];
  const tallest = Math.max(...w.units.map((u) => u.size[1]), 0);
  if (rise > FLAT_HEIGHT) return [];
  const wants = request ? ENCLOSED_SPACE.test(request) : false;
  return [{
    kind: 'open_flat_map', severity: wants ? 'high' : 'info',
    text: `The map has no terrain, no walls enclosing it and everything stands within ${round1(rise)} studs of one level (tallest object ${round1(tallest)} studs): it reads as an open flat field.` +
      (wants ? ' The request describes an enclosed space (walls, a ceiling, depth), which this is not.' : ''),
  }];
}

const channels = (v: unknown): number[] | null => {
  const t = tagged(v);
  return Array.isArray(t) && t.length >= 3 && t.slice(0, 3).every((n) => typeof n === 'number') ? (t.slice(0, 3) as number[]) : null;
};

function darkness(lightingRaw: unknown, lights: number): SceneFlag[] {
  const root = isObj(lightingRaw) && isObj(lightingRaw.root) ? lightingRaw.root : null;
  const props = root && isObj(root.props) ? root.props : null;
  if (!props) return [];
  const brightness = num(props.Brightness);
  const clock = num(props.ClockTime);
  const exposure = num(props.ExposureCompensation) ?? 0;
  // Colour3 values arrive 0..1 from the typed tree.
  const peak = (v: unknown): number => { const c = channels(v); return c ? Math.max(...c) * (Math.max(...c) <= 1 ? 255 : 1) : 0; };
  const ambient = Math.max(peak(props.Ambient), peak(props.OutdoorAmbient));
  if (brightness === null || clock === null) return [];
  const night = clock < 5 || clock > 19;
  const veryDark = lights < DARK_MAX_LIGHTS && exposure <= 0.5 && ((ambient <= DARK_AMBIENT && brightness <= 1.5) || (night && ambient <= DARK_NIGHT_AMBIENT && brightness <= 2));
  if (!veryDark) return [];
  return [{
    kind: 'dark_lighting', severity: 'high',
    text: `The lighting leaves the scene very dark: ambient ${Math.round(ambient)}/255, brightness ${round1(brightness)}, time ${round1(clock)}h, exposure ${round1(exposure)}, and ${lights} light(s) in the workspace. ` +
      'A player cannot read the ground or the route; raise ambient or exposure, or add lights where players walk.',
  }];
}
export interface SceneFlagsInput {
  /** `get_tree` data for game.Workspace: `{ root, truncated? }`. */
  workspace: unknown;
  /** `get_tree` data for game.Lighting, depth 1. */
  lighting?: unknown;
  /** Solid voxels in a terrain read around the build; undefined or null when no read was made. */
  terrainSolidVoxels?: number | null;
  /** The user's request, read only for the enclosed-space class (see the header). */
  request?: string;
}

export interface SceneFlagsResult { flags: SceneFlag[]; units: number; truncated: boolean }

/** The flags for a place, or null when the tree cannot be read. Pure. */
export function sceneFlags(i: SceneFlagsInput): SceneFlagsResult | null {
  if (!isObj(i.workspace) || !isObj(i.workspace.root)) return null;
  const w = walkTree(i.workspace.root);
  const flags = [
    ...repetition(w.units),
    ...bounds(w),
    ...openFlat(w, i.terrainSolidVoxels, i.request),
    ...darkness(i.lighting, w.lights),
  ];
  return { flags, units: w.units.length, truncated: i.workspace.truncated === true };
}

/** The middle of the place's parts in plan, for centring a terrain read on the build; the origin when there are none. */
export function footprintCentre(workspace: unknown): [number, number] {
  if (!isObj(workspace) || !isObj(workspace.root)) return [0, 0];
  const u = unionOf(walkTree(workspace.root).parts);
  return u ? [Math.round((u.lo[0] + u.hi[0]) / 2), Math.round((u.lo[2] + u.hi[2]) / 2)] : [0, 0];
}

/** The flags as the lines the agent reads. */
export function flagLines(r: SceneFlagsResult): string[] {
  return r.flags.map((f) => `[${f.severity}] ${f.kind}: ${f.text}`);
}
