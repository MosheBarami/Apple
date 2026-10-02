import type { AgentCtx } from './tools';
import type { StudioOp } from '@apple/shared';

/**
 * PUTTING IMPORTED MODELS WHERE A PLAYER WOULD FIND THEM.
 *
 * A library model arrives at its original coordinates: under the map, inside a wall or a hundred studs away. Each one is
 * put on the ground near the spawn (or on a plot) with the Studio operations the agent already has: spatial_query finds
 * the ground and the model's box and says what overlaps it, transform_instances moves it, clone_instances makes the
 * copies. A model rests on a surface (its box bottom on the ray hit), overlaps nothing that is already there, and a
 * spot that fails is dropped for the next one; a model with no room is removed rather than left inside something.
 */

export type Vec3 = [number, number, number];
export interface Box { center: Vec3; size: Vec3; bottomY: number; topY: number }
/** Where a model already stands: centre and half the diagonal of its box (a turn cannot change it). */
export interface Footprint { x: number; z: number; r: number }
export interface Anchor { x: number; z: number; /** The height of the ground here. */ y: number; /** Usable radius around it (plots only). */ r: number; kind: 'spawn' | 'plot' }
export interface PlaceSpec {
  count: number; on: 'ground' | 'spawn' | 'plots'; spread: number;
  /** A core's map piece: the library worked out where the whole group stands on another map's ground; it moves by exactly this. */
  offset?: Vec3;
}

export const MAX_ATTEMPTS = 8;
export const MAX_COPIES = 20;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const CEILING = 80;          // rays start this far above the area's ground
const LEVEL_TOLERANCE = 12;  // a hit further than this from the area's ground is a roof or a pit, not the ground
const TAKEN = 18;            // spatial_query.exclude takes 20 paths: the model itself and the latest placed ones

/** The i-th of `total` spots on a sunflower spiral from rMin to rMax: neighbours in the sequence are far apart. */
export function spiralPoint(cx: number, cz: number, rMin: number, rMax: number, i: number, total: number, phase = 0): [number, number] {
  const t = (i + 0.5) / Math.max(1, total);
  const r = Math.sqrt(rMin * rMin + (rMax * rMax - rMin * rMin) * t);
  const a = phase + i * GOLDEN_ANGLE;
  return [cx + r * Math.cos(a), cz + r * Math.sin(a)];
}
/** Half the diagonal of a box footprint: turning the model cannot make it wider than this. */
export const footprintRadius = (size: Vec3): number => Math.hypot(size[0], size[2]) / 2;
/** Whether a model of radius r at (x, z) would touch one already placed (with a gap between them). */
export function crowded(x: number, z: number, r: number, placed: readonly Footprint[], gap = 2): boolean {
  return placed.some((p) => Math.hypot(p.x - x, p.z - z) < p.r + r + gap);
}
/** The move that puts a box's bottom on the ground at (x, z): the centre goes there, the bottom lands on groundY. */
export function restingMove(box: Box, x: number, z: number, groundY: number): Vec3 {
  return [x - box.center[0], groundY - box.bottomY, z - box.center[2]];
}
/** A ray hit a model may stand on: something facing up, near the height of the area, not a roof, a wall side or a pit. */
export function standable(ground: { hit?: unknown; position?: unknown; normal?: unknown } | undefined, levelY: number, tolerance = LEVEL_TOLERANCE): boolean {
  if (!ground || ground.hit !== true || !Array.isArray(ground.position) || !Array.isArray(ground.normal)) return false;
  const y = Number(ground.position[1]), up = Number(ground.normal[1]);
  return Number.isFinite(y) && Number.isFinite(up) && up >= 0.9 && Math.abs(y - levelY) <= tolerance;
}
/** A turn about the vertical for the index-th copy: spread around the circle, different for another seed. */
export const yawFor = (index: number, seed: number): number => Math.round(((index * 137.508 + seed * 29) % 360) * 10) / 10;
/**
 * The spot for copy k on its attempt-th try. Plots try the plot's middle first; open ground walks a spiral around the spawn,
 * past its doorstep, out to `spread`: the copies' first tries are spread over the whole disc and a retry is on the same ring
 * a turn of the spiral away.
 */
export function candidatePoint(anchor: Anchor, k: number, attempt: number, count: number, spread: number, phase: number): [number, number] {
  if (anchor.kind === 'plot') return attempt === 0 ? [anchor.x, anchor.z] : spiralPoint(anchor.x, anchor.z, 0, anchor.r, attempt, MAX_ATTEMPTS, phase);
  const rMax = Math.max(10, Math.min(spread, 400)), rMin = Math.min(14, rMax * 0.2);
  return spiralPoint(anchor.x, anchor.z, rMin, rMax, k * MAX_ATTEMPTS + attempt, count * MAX_ATTEMPTS, phase);
}
/** Shrink the counts of several components so the total stays within `cap`, never below one each. */
export function fitCounts(counts: readonly number[], cap: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= cap) return [...counts];
  const scaled = counts.map((c) => Math.max(1, Math.floor((c * cap) / total)));
  for (let i = 0; scaled.reduce((a, b) => a + b, 0) > cap && i < 1000; i++) {
    const at = scaled.indexOf(Math.max(...scaled));
    if (scaled[at]! <= 1) break;
    scaled[at]! -= 1;
  }
  return scaled;
}

/* ------------------------------------------------------------------------------------- with Studio --- */

export interface PlaceState { placed: Footprint[]; recent: string[]; anchors: Partial<Record<'spawn' | 'plots', Anchor[]>> }
export const newPlaceState = (): PlaceState => ({ placed: [], recent: [], anchors: {} });
export interface PlaceOutcome {
  wanted: number;
  placed: number;
  paths: string[];
  /** Why fewer than wanted: cannot be arranged (not a model or part), no room found, out of time, or Studio went away. */
  stopped?: 'not_arrangeable' | 'no_room' | 'time' | 'disconnected';
}

export type Reply = { ok: true; data: Record<string, unknown> } | { ok: false; failure?: string; error?: string };
export async function ask(ctx: AgentCtx, op: StudioOp, timeoutMs = 60_000): Promise<Reply> {
  const out = await ctx.execStudioOp(op, timeoutMs);
  return out.ok ? { ok: true, data: (out.data ?? {}) as Record<string, unknown> } : { ok: false, failure: out.failure, error: out.error };
}
export const gone = (r: Reply) => !r.ok && r.failure === 'transport';
const vec = (v: unknown): Vec3 | undefined => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n))) ? [Number(v[0]), Number(v[1]), Number(v[2])] : undefined;

export async function boundsOf(ctx: AgentCtx, path: string): Promise<Box | Reply> {
  const r = await ask(ctx, { op: 'spatial_query', action: 'bounds', path });
  if (!r.ok) return r;
  const center = vec(r.data.center), size = vec(r.data.size), bottomY = Number(r.data.bottomY), topY = Number(r.data.topY);
  return center && size && Number.isFinite(bottomY) && Number.isFinite(topY) ? { center, size, bottomY, topY } : { ok: false, error: 'no box' };
}
export const isBox = (v: Box | Reply): v is Box => 'center' in v;

export async function groundAt(ctx: AgentCtx, x: number, top: number, z: number, exclude: string[]) {
  const r = await ask(ctx, { op: 'spatial_query', action: 'find_ground', position: [x, top, z], exclude: exclude.slice(0, 20) });
  return r.ok ? { reply: r, ground: r.data.result as { hit?: unknown; position?: unknown; normal?: unknown } | undefined } : { reply: r, ground: undefined };
}

const SPATIAL = /(?:^Model$|Part$|Operation$)/;
const median = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)]!;
/**
 * Where the play area is when the map has no SpawnLocation (most saved maps have none): the middle of the models and parts that
 * stand in the Workspace, at the ground level most rays dropped around it land on. Undefined when nothing there can be measured.
 */
async function mapAnchor(ctx: AgentCtx, ignore: readonly string[]): Promise<Anchor | undefined> {
  type Node = { path?: unknown; class?: unknown; children?: Node[] };
  const tree = await ask(ctx, { op: 'get_tree', root: 'game.Workspace', maxDepth: 3, maxNodes: 300 });
  const pieces: string[] = [];
  // What was just imported still stands at its old coordinates: it says nothing about where the map is.
  const walk = (n: Node) => { for (const k of n.children ?? []) { if (typeof k.path !== 'string' || ignore.includes(k.path)) continue; if (SPATIAL.test(String(k.class))) pieces.push(k.path); else if (k.class === 'Folder') walk(k); } };
  if (tree.ok) walk(tree.data.root as Node);
  const boxes: Box[] = [];
  for (const path of pieces.filter((_, i) => i % Math.ceil(pieces.length / 24) === 0)) {
    const b = await boundsOf(ctx, path);
    if (isBox(b)) boxes.push(b);
    else if (gone(b)) return undefined;
  }
  if (!boxes.length) return undefined;
  const mx = median(boxes.map((b) => b.center[0])), mz = median(boxes.map((b) => b.center[2])), top = Math.max(...boxes.map((b) => b.topY)) + 10;
  const nearest = [...boxes].sort((a, b) => Math.hypot(a.center[0] - mx, a.center[2] - mz) - Math.hypot(b.center[0] - mx, b.center[2] - mz)).slice(0, 8);
  const tries: [number, number][] = [[mx, mz], ...Array.from({ length: 11 }, (_, i) => spiralPoint(mx, mz, 6, 60, i, 11)), ...nearest.map((b): [number, number] => [b.center[0], b.center[2]])];
  // Roofs and floors both face up: the ground is the height most of the rays that hit something land on.
  const hits: { x: number; z: number; y: number }[] = [];
  for (const [x, z] of tries) {
    const { reply, ground } = await groundAt(ctx, x, top, z, []);
    if (gone(reply)) return undefined;
    if (ground?.hit === true && Array.isArray(ground.position) && Array.isArray(ground.normal) && Number(ground.normal[1]) >= 0.9 && Number.isFinite(Number(ground.position[1]))) hits.push({ x, z, y: Number(ground.position[1]) });
  }
  if (!hits.length) return undefined;
  const levels = new Map<number, number>();
  for (const h of hits) levels.set(Math.round(h.y / 2), (levels.get(Math.round(h.y / 2)) ?? 0) + 1);
  const level = [...levels].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]![0] * 2;
  const at = hits.find((h) => Math.abs(h.y - level) <= 2) ?? hits[0]!;
  return { x: at.x, z: at.z, y: at.y, r: 0, kind: 'spawn' };
}

async function spawnAnchor(ctx: AgentCtx, ignore: readonly string[]): Promise<Anchor> {
  const found = await ask(ctx, { op: 'query_instances', root: 'game.Workspace', className: 'SpawnLocation', limit: 1 });
  const path = found.ok && Array.isArray(found.data.matches) ? (found.data.matches[0] as { path?: unknown } | undefined)?.path : undefined;
  if (typeof path === 'string') {
    const b = await boundsOf(ctx, path);
    if (isBox(b)) return { x: b.center[0], z: b.center[2], y: b.bottomY, r: 0, kind: 'spawn' };
  }
  const middle = await mapAnchor(ctx, ignore);
  if (middle) return middle;
  const { ground } = await groundAt(ctx, 0, 500, 0, []);
  const y = ground?.hit === true && Array.isArray(ground.position) ? Number(ground.position[1]) : 0;
  return { x: 0, z: 0, y: Number.isFinite(y) ? y : 0, r: 0, kind: 'spawn' };
}

const PLOT_CLASSES = new Set(['Model', 'Part', 'MeshPart', 'UnionOperation']);
async function plotAnchors(ctx: AgentCtx): Promise<Anchor[]> {
  const found = await ask(ctx, { op: 'query_instances', root: 'game.Workspace', name: 'Plot', limit: 40 });
  const hits = found.ok && Array.isArray(found.data.matches) ? found.data.matches as { path?: unknown; className?: unknown }[] : [];
  const paths: string[] = [];
  for (const h of hits) {
    if (typeof h.path !== 'string') continue;
    if (PLOT_CLASSES.has(String(h.className))) paths.push(h.path);
    else if (h.className === 'Folder') {
      const tree = await ask(ctx, { op: 'get_tree', root: h.path, maxDepth: 1, maxNodes: 60 });
      const kids = tree.ok ? (tree.data.root as { children?: { path?: unknown; class?: unknown }[] } | undefined)?.children ?? [] : [];
      for (const k of kids) if (typeof k.path === 'string' && PLOT_CLASSES.has(String(k.class))) paths.push(k.path);
    }
  }
  // A plot inside another match is a piece of it, not a second plot.
  const whole = [...new Set(paths)].filter((p) => !paths.some((q) => q !== p && p.startsWith(q + '.'))).slice(0, 24);
  const anchors: Anchor[] = [];
  for (const path of whole) {
    const b = await boundsOf(ctx, path);
    if (isBox(b)) anchors.push({ x: b.center[0], z: b.center[2], y: b.topY, r: Math.max(2, Math.min(60, Math.min(b.size[0], b.size[2]) / 2 * 0.8)), kind: 'plot' });
  }
  return anchors;
}

export async function anchorsFor(ctx: AgentCtx, on: PlaceSpec['on'], state: PlaceState, ignore: readonly string[] = []): Promise<Anchor[]> {
  if (on === 'plots') {
    state.anchors.plots ??= await plotAnchors(ctx);
    if (state.anchors.plots.length) return state.anchors.plots;
  }
  state.anchors.spawn ??= [await spawnAnchor(ctx, ignore)];
  return state.anchors.spawn;
}

/** A saved map rarely ships a SpawnLocation; without one players start at the origin, often far below or beside the map.
 * When the place has none, one studded pad goes on the ground where the play area is (the same spot the models were placed around). */
export async function ensureSpawn(ctx: AgentCtx, state: PlaceState): Promise<boolean> {
  const found = await ask(ctx, { op: 'query_instances', root: 'game.Workspace', className: 'SpawnLocation', limit: 1 });
  if (!found.ok || !Array.isArray(found.data.matches) || found.data.matches.length > 0) return false;
  const at = (await anchorsFor(ctx, 'spawn', state))[0];
  if (!at) return false;
  const made = await ask(ctx, { op: 'create_instances', items: [{ className: 'SpawnLocation', name: 'SpawnLocation', parent: 'game.Workspace', props: {
    Anchored: { t: 'bool', v: true }, Size: { t: 'Vector3', v: [12, 1, 12] }, Position: { t: 'Vector3', v: [at.x, at.y + 0.5, at.z] },
    Color: { t: 'Color3', v: [0.33, 0.8, 0.35] }, Material: { t: 'EnumItem', v: 'Enum.Material.Plastic' },
    TopSurface: { t: 'EnumItem', v: 'Enum.SurfaceType.Studs' },
  } }] });
  return made.ok;
}

/**
 * Put `roots` (paths just imported) on the ground. One root with a count is copied count times (clone_instances, one copy
 * at a time just before its turn); several roots are each placed once. Every model: try up to MAX_ATTEMPTS spots, each a
 * ray down from above the area's ground, a move that rests the box bottom on the hit, then an overlap check; keep the
 * first spot that overlaps nothing. A model that finds none is deleted (a copy we made or the import we just brought).
 */
export async function placeModels(ctx: AgentCtx, roots: string[], spec: PlaceSpec, state: PlaceState, seed: number, deadline: number, now: () => number = Date.now): Promise<PlaceOutcome> {
  const count = Math.max(1, Math.min(MAX_COPIES, Math.floor(spec.count) || 1));
  const single = roots.length === 1;
  const jobs = single ? Array.from({ length: count }, (_, k) => k) : roots.slice(0, MAX_COPIES).map((_, k) => k);
  const outcome: PlaceOutcome = { wanted: jobs.length, placed: 0, paths: [] };
  const anchors = await anchorsFor(ctx, spec.on, state, roots);
  // A model that finds no room on its plot tries the open ground near the spawn for its last tries.
  const fallback = spec.on === 'plots' && anchors[0]!.kind === 'plot' ? (await anchorsFor(ctx, 'spawn', state, roots))[0] : undefined;
  const phase = ((seed % 360) * Math.PI) / 180;
  // Every copy is made where the template still stands, so the template is the last of its copies to be placed
  // and its box is read once.
  let shared: Box | undefined;
  let templateDone = false;
  for (const k of jobs) {
    if (now() > deadline) { outcome.stopped = 'time'; break; }
    const template = single ? roots[0]! : roots[k]!;
    const isTemplate = single ? k === count - 1 : true;
    let box = single ? shared : undefined;
    if (!box) {
      const read = await boundsOf(ctx, template);
      if (!isBox(read)) { outcome.stopped = gone(read) ? 'disconnected' : 'not_arrangeable'; break; }
      box = read;
      if (single) shared = box;
    }
    let path = template;
    if (!isTemplate) {
      const made = await ask(ctx, { op: 'clone_instances', paths: [template] });
      const created = made.ok && Array.isArray(made.data.created) ? made.data.created[0] : undefined;
      if (typeof created !== 'string') { if (gone(made)) { outcome.stopped = 'disconnected'; break; } outcome.stopped ??= 'no_room'; continue; }
      path = created;
    }
    const anchor = anchors[k % anchors.length]!;
    const r = footprintRadius(box.size);
    let at: Vec3 = [...box.center], bottom = box.bottomY, done = false;
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !done; attempt++) {
      const from = fallback && attempt >= MAX_ATTEMPTS - 3 ? fallback : anchor;
      const [x, z] = candidatePoint(from, k, attempt, count, spec.spread, phase);
      if (crowded(x, z, r, state.placed)) continue;
      const { reply, ground } = await groundAt(ctx, x, from.y + CEILING, z, [path, ...state.recent.slice(-TAKEN)]);
      if (gone(reply)) { outcome.stopped = 'disconnected'; break; }
      if (!standable(ground, from.y)) continue;
      const move = restingMove({ ...box, center: at, bottomY: bottom }, x, z, Number((ground!.position as number[])[1]));
      const turned = await ask(ctx, { op: 'transform_instances', paths: [path], move, rotate: [0, yawFor(k, seed), 0] });
      if (!turned.ok) { if (gone(turned)) outcome.stopped = 'disconnected'; break; }
      at = [at[0] + move[0], at[1] + move[1], at[2] + move[2]]; bottom += move[1];
      const seen = await ask(ctx, { op: 'spatial_query', action: 'check_placement', path });
      if (gone(seen)) { outcome.stopped = 'disconnected'; break; }
      // A check that cannot be made is not a pass; only parts inside the model's box count as overlap.
      if (seen.ok && Number(seen.data.overlapCount) === 0) done = true;
    }
    if (outcome.stopped === 'disconnected') break;
    if (done) {
      state.placed.push({ x: at[0], z: at[2], r });
      state.recent.push(path);
      outcome.placed += 1;
      outcome.paths.push(path);
      if (isTemplate) templateDone = true;
    } else {
      await ask(ctx, { op: 'delete_instances', paths: [path] });
      outcome.stopped ??= 'no_room';
      if (isTemplate) templateDone = true; // gone, so there is nothing left to clean up
    }
  }
  // Out of time before the template's own turn: it still stands at its old coordinates, which is nowhere a player should find it.
  if (single && !templateDone && outcome.stopped === 'time') await ask(ctx, { op: 'delete_instances', paths: [roots[0]!] });
  return outcome;
}

/**
 * Pieces that travel together (a game core's plots, stands and spawns whose scripts expect them side by side) keep their
 * layout; the whole group is only moved up or down, by one offset, until its lowest point rests on the ground of the world
 * it now stands in. Nothing moves when the ground under it is not near the spawn's level (a roof, a pit, or nothing).
 */
export async function settleGroup(ctx: AgentCtx, paths: string[], state: PlaceState): Promise<'moved' | 'fine' | 'skipped'> {
  const boxes: Box[] = [];
  for (const path of paths.slice(0, 20)) {
    const b = await boundsOf(ctx, path);
    if (isBox(b)) boxes.push(b);
  }
  if (!boxes.length) return 'skipped';
  const bottom = Math.min(...boxes.map((b) => b.bottomY)), top = Math.max(...boxes.map((b) => b.topY));
  const cx = (Math.min(...boxes.map((b) => b.center[0] - b.size[0] / 2)) + Math.max(...boxes.map((b) => b.center[0] + b.size[0] / 2))) / 2;
  const cz = (Math.min(...boxes.map((b) => b.center[2] - b.size[2] / 2)) + Math.max(...boxes.map((b) => b.center[2] + b.size[2] / 2))) / 2;
  const level = (await anchorsFor(ctx, 'spawn', state, paths))[0]!.y;
  const { ground } = await groundAt(ctx, cx, top + 5, cz, paths);
  if (!standable(ground, level, 40)) return 'skipped';
  const dy = Number((ground!.position as number[])[1]) - bottom;
  if (Math.abs(dy) < 0.5) return 'fine';
  const moved = await ask(ctx, { op: 'transform_instances', paths: paths.slice(0, 20), move: [0, dy, 0] });
  return moved.ok ? 'moved' : 'skipped';
}

/**
 * A core's map pieces move together by the offset the library worked out (its bare floor beside the new world's spawn), so the
 * game's scripts still find them where they expect: side by side. A piece Studio cannot move as a whole (a Folder) moves through
 * its models and parts; one that cannot move at all is counted, not hidden.
 */
export async function moveBy(ctx: AgentCtx, paths: string[], move: Vec3, depth = 0): Promise<{ moved: number; failed: number; gone: boolean }> {
  if (!paths.length) return { moved: 0, failed: 0, gone: false };
  const all = await ask(ctx, { op: 'transform_instances', paths: paths.slice(0, 50), move });
  if (all.ok) return { moved: paths.length, failed: 0, gone: false };
  if (gone(all)) return { moved: 0, failed: paths.length, gone: true };
  const total = { moved: 0, failed: 0, gone: false };
  for (const path of paths.slice(0, 50)) {
    const one = paths.length === 1 ? all : await ask(ctx, { op: 'transform_instances', paths: [path], move });
    if (one.ok) { total.moved += 1; continue; }
    if (gone(one)) return { ...total, failed: total.failed + 1, gone: true };
    const tree = depth < 3 ? await ask(ctx, { op: 'get_tree', root: path, maxDepth: 1, maxNodes: 60 }) : undefined;
    const root = tree?.ok ? tree.data.root as { class?: unknown; children?: { path?: unknown; class?: unknown }[] } | undefined : undefined;
    const inside = root?.class === 'Folder' ? (root.children ?? []).filter((k): k is { path: string; class: string } => typeof k.path === 'string' && (k.class === 'Folder' || SPATIAL.test(String(k.class)))).map((k) => k.path) : [];
    if (!inside.length) { total.failed += 1; continue; }
    const deeper = await moveBy(ctx, inside, move, depth + 1);
    total.moved += deeper.moved ? 1 : 0; total.failed += deeper.moved ? 0 : 1;
    if (deeper.gone) return { ...total, gone: true };
  }
  return total;
}

/**
 * A system's world pieces (a donation board, egg stands, a row of plots) keep their own layout and move together to open ground
 * near the play area: spots on the spawn spiral are tried, and the first one where every measurable piece rests on the ground
 * and overlaps nothing is kept. A group with no room goes back to where it arrived.
 */
export async function placeGroup(ctx: AgentCtx, paths: string[], state: PlaceState, seed: number, deadline: number, now: () => number = Date.now): Promise<'placed' | 'no_room' | 'skipped' | 'disconnected'> {
  const roots = paths.slice(0, 20);
  const measured: string[] = [], boxes: Box[] = [];
  for (const p of roots) {
    const b = await boundsOf(ctx, p);
    if (isBox(b)) { measured.push(p); boxes.push(b); } else if (gone(b)) return 'disconnected';
  }
  if (!boxes.length) return 'skipped';
  const minX = Math.min(...boxes.map((b) => b.center[0] - b.size[0] / 2)), maxX = Math.max(...boxes.map((b) => b.center[0] + b.size[0] / 2));
  const minZ = Math.min(...boxes.map((b) => b.center[2] - b.size[2] / 2)), maxZ = Math.max(...boxes.map((b) => b.center[2] + b.size[2] / 2));
  const bottom = Math.min(...boxes.map((b) => b.bottomY));
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, r = Math.hypot(maxX - minX, maxZ - minZ) / 2;
  const anchor = (await anchorsFor(ctx, 'spawn', state, roots))[0]!;
  const phase = ((seed % 360) * Math.PI) / 180, tries = MAX_ATTEMPTS * 2;
  const moved: Vec3 = [0, 0, 0];
  for (let attempt = 0; attempt < tries && now() <= deadline; attempt++) {
    const [x, z] = spiralPoint(anchor.x, anchor.z, Math.max(20, r + 10), Math.max(60, r * 3 + 40), attempt, tries, phase);
    if (crowded(x, z, r, state.placed)) continue;
    const { reply, ground } = await groundAt(ctx, x, anchor.y + CEILING, z, [...roots, ...state.recent.slice(-TAKEN)].slice(0, 20));
    if (gone(reply)) return 'disconnected';
    if (!standable(ground, anchor.y)) continue;
    const move: Vec3 = [x - cx - moved[0], Number((ground!.position as number[])[1]) - bottom - moved[1], z - cz - moved[2]];
    const went = await moveBy(ctx, roots, move);
    if (went.gone) return 'disconnected';
    if (!went.moved) return 'skipped';
    moved[0] += move[0]; moved[1] += move[1]; moved[2] += move[2];
    const clear = await groupClear(ctx, measured);
    if (clear === 'disconnected') return 'disconnected';
    if (clear === 'clear') { state.placed.push({ x, z, r }); state.recent.push(...measured); return 'placed'; }
  }
  if (moved.some((v) => v !== 0)) await moveBy(ctx, roots, [-moved[0], -moved[1], -moved[2]]);
  return 'no_room';
}

/**
 * Whether a group of roots touches anything that is not part of the group. A root's own neighbours in the group (a plaza and the
 * fountain standing on it) overlap by design; what blocks is a wall, a building or a model that was already there.
 * A check that cannot be made, or more overlaps than the plugin lists, is not a pass.
 */
export async function groupClear(ctx: AgentCtx, roots: readonly string[]): Promise<'clear' | 'blocked' | 'disconnected'> {
  const inside = (p: string) => roots.some((r) => p === r || p.startsWith(r + '.') || p.startsWith(r + '['));
  for (const p of roots) {
    const seen = await ask(ctx, { op: 'spatial_query', action: 'check_placement', path: p });
    if (gone(seen)) return 'disconnected';
    if (!seen.ok) return 'blocked';
    const count = Number(seen.data.overlapCount);
    if (!(count > 0)) continue;
    const listed = Array.isArray(seen.data.overlapping) ? seen.data.overlapping.filter((x): x is string => typeof x === 'string') : [];
    if (listed.length < count || !listed.every(inside)) return 'blocked';
  }
  return 'clear';
}

/**
 * A region brought from another map goes where the design worked out it fits (a move by `offset`, then resting on the ground of
 * the play area). That spot has to be free; when it is not, or there is no offset, the group looks for open ground itself
 * (placeGroup). A region that fits nowhere is deleted rather than left inside something.
 */
export async function placeRegion(ctx: AgentCtx, paths: string[], offset: Vec3 | undefined, state: PlaceState, seed: number, deadline: number, now: () => number = Date.now): Promise<'placed' | 'no_room' | 'skipped' | 'disconnected'> {
  const roots = paths.slice(0, 20);
  if (offset && offset.some((v) => v !== 0)) {
    const went = await moveBy(ctx, roots, offset);
    if (went.gone) return 'disconnected';
    if (went.moved) {
      await settleGroup(ctx, roots, state);
      const clear = await groupClear(ctx, roots);
      if (clear === 'disconnected') return 'disconnected';
      if (clear === 'clear') {
        const boxes: Box[] = [];
        for (const p of roots) { const b = await boundsOf(ctx, p); if (isBox(b)) boxes.push(b); else if (gone(b)) return 'disconnected'; }
        if (boxes.length) {
          const x0 = Math.min(...boxes.map((b) => b.center[0] - b.size[0] / 2)), x1 = Math.max(...boxes.map((b) => b.center[0] + b.size[0] / 2));
          const z0 = Math.min(...boxes.map((b) => b.center[2] - b.size[2] / 2)), z1 = Math.max(...boxes.map((b) => b.center[2] + b.size[2] / 2));
          state.placed.push({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.hypot(x1 - x0, z1 - z0) / 2 });
          state.recent.push(...roots);
        }
        return 'placed';
      }
    }
  }
  const where = await placeGroup(ctx, roots, state, seed, deadline, now);
  if (where === 'no_room') await ask(ctx, { op: 'delete_instances', paths: roots });
  return where;
}
