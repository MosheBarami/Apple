/**
 * Ready-made models for the agent to look at, choose and place (owner, 2026-10-02: models come from the owner library
 * or the Roblox-owned Creator Store first, procedural rarely; and, after the benchmark that put a knife on a treasure
 * chest and party balloons on a hot air balloon: the harness never picks what fits).
 *
 * The agent searches with its own words (find_library_model, browse_owner_library), previews what it found here
 * (previewLibraryModels: evidence, off the place), chooses in its own loop with the conversation in context, and places
 * (placeLibraryPiece) or builds another way when none fits. Nothing in this file chooses a candidate, derives a name from
 * the request, or decorates a placed model: dress_object (dress-object.ts) is the opt-in presentation.
 *
 * Every candidate is a copy WITHOUT scripts or sounds: an owner-library piece is imported into ServerStorage (where no
 * script runs), stripped, and placed as a copy (place_copies destroys scripts and sounds and anchors the parts); a
 * Creator Store row goes through insert_library_model's own gate (insertAndProveClean). Studs come from the plugin's
 * surface rule on every part a write adds, "if needed" (it skips Neon, Glass and parts that already have a surface).
 */
import type { AgentCtx } from './tools';
import type { InstanceSpecLite } from './compose';
import { typed } from './compose-run';
import { GAME_ID, LIBRARY_IMPORT_MS, libraryMaterials, librarySafetyCopy } from './local-owner-corpus';
import { rgbBase64ToDataUrl } from './png';
import { imagePathFor, storeImage } from './imagegen';

type V3 = [number, number, number];

/** A player is 5 studs tall: the yardstick every measured size is reported against. */
export const PLAYER_HEIGHT = 5;

/**
 * A catalog name as it may be shown and repeated: no control characters, no markdown or markup, at most 60 characters
 * (review 2026-10-02: library names went into the chat text, which is replayed to the model and drawn as markdown).
 */
export function cleanName(s: string): string {
  return s.replace(/[\x00-\x1f\x7f]/g, ' ').replace(/[`*_[\]<>|#~\\{}]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Model';
}

/** One candidate: a piece of the owner library, or a Roblox-owned Creator Store row. */
export interface LibraryCandidate {
  source: 'owner' | 'store';
  name: string;
  /** The game the owner-library piece comes from. */
  game?: string;
  gameId?: string;
  path?: string;
  /** A Creator Store row's library id (insert_library_model). */
  id?: string;
  parts?: number;
}

/** A candidate as the agent names it back: { id } for a store row, { gameId, path } for an owner-library piece. */
export function candidateOf(raw: unknown): LibraryCandidate | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'each model is an object: { id } from find_library_model, or { gameId, path } from browse_owner_library' };
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' && r.name.trim() ? cleanName(r.name) : undefined;
  if (typeof r.gameId === 'string' || typeof r.path === 'string') {
    if (typeof r.gameId !== 'string' || !GAME_ID.test(r.gameId)) return { error: 'gameId must be a library game id (8-64 hex characters) from browse_owner_library' };
    if (typeof r.path !== 'string' || !r.path.startsWith('/') || r.path.length > 400) return { error: 'path must be the library path of the piece, from browse_owner_library, e.g. "/Workspace/Name"' };
    return { source: 'owner', name: name ?? cleanName(r.path.split('/').filter(Boolean).pop()?.replace(/#\d+$/, '') ?? 'Model'), gameId: r.gameId, path: r.path, ...(typeof r.game === 'string' ? { game: cleanName(r.game) } : {}) };
  }
  if (typeof r.id === 'string' && r.id.trim()) return { source: 'store', name: name ?? 'Model', id: r.id.trim() };
  return { error: 'give { id } (from find_library_model) or { gameId, path } (from browse_owner_library)' };
}

interface CatalogItem { gameId?: unknown; game?: unknown; kind?: unknown; name?: unknown; className?: unknown; path?: unknown; parts?: unknown; instances?: unknown; contains?: unknown }
const PIECE_CLASSES = new Set(['Model', 'MeshPart', 'Part', 'UnionOperation', 'Tool', 'WedgePart']);
const MAX_PARTS = 400, MAX_INSTANCES = 1500;

/**
 * Why a catalog row cannot be copied into a place as a script-free object, or null when it can: a character (a Humanoid
 * inside), an empty piece, a class that is not a piece, one too big to copy. A mechanical safety fact, never a taste. Pure.
 */
export function copyBlocker(i: CatalogItem): string | null {
  if (i.kind !== 'model') return `kind is ${String(i.kind ?? 'unknown')}, not a model`;
  if (!PIECE_CLASSES.has(String(i.className))) return `a ${String(i.className ?? 'unknown')} is not a copyable piece`;
  const parts = Number(i.parts ?? 0), instances = Number(i.instances ?? 0);
  if (!(parts >= 1)) return 'it holds no parts';
  if (parts > MAX_PARTS) return `${parts} parts is more than ${MAX_PARTS}, too big to copy`;
  if (instances > MAX_INSTANCES) return `${instances} instances is more than ${MAX_INSTANCES}, too big to copy`;
  if (Array.isArray(i.contains) && i.contains.some((c) => c === 'Humanoid')) return 'it holds a Humanoid (a character, not an object)';
  return null;
}

/**
 * The library's own answer for a models search with a copyability note on every row, so the agent sees what can be placed
 * and why a row cannot, and chooses with all of it in view. Nothing is dropped, ranked or de-duplicated here. Pure.
 */
export function annotateModels<T extends CatalogItem>(items: T[]): (T & { copyable: boolean; notCopyableBecause?: string })[] {
  return items.map((i) => {
    const why = copyBlocker(i);
    return { ...i, copyable: why === null, ...(why ? { notCopyableBecause: why } : {}) };
  });
}

/** Where along x a new thing may stand in front of the spawn: the middle first, then 8 studs at a time either side. */
export const LANE_STEPS = [0, 8, -8, 16, -16, 24, -24, 32, -32, 40, -40, 48, -48, 56, -56, 64, -64];

/**
 * Whether an overlap answer (the parts in a box, at most 50 listed, and how many there were) holds anything that is in
 * the way: a listed part outside `ignore` (the thing being replaced, the numbered row), or more than were listed. Pure.
 */
export function blocksLane(parts: unknown, count: unknown, ignore: string[]): boolean {
  const listed = Array.isArray(parts) ? parts.filter((p): p is string => typeof p === 'string') : [];
  if (Number(count ?? listed.length) > listed.length) return true;
  const bare = (p: string) => p.replace(/^game\./, '');
  const skip = ignore.map(bare);
  return listed.some((p) => !skip.some((g) => bare(p) === g || bare(p).startsWith(`${g}.`)));
}

/**
 * The x nearest the middle where a box `width` by `depth` centred at z stands on empty ground (nothing from the floor up
 * to 40 studs), or 0 when there is none or Studio cannot say. Only used when the agent gave no place: a second thing
 * must not stand in the first one.
 */
export async function freeLaneX(ctx: AgentCtx, width: number, depth: number, z: number, ignore: string[]): Promise<number> {
  for (const x of LANE_STEPS) {
    const r = await ctx.execStudioOp({ op: 'spatial_query', action: 'overlap', center: [x, 20.3, z], size: [width, 40, depth] }, 15_000).catch(() => null);
    if (!r?.ok) return 0;
    const d = r.data as { parts?: unknown; count?: unknown };
    if (!blocksLane(d.parts, d.count, ignore)) return x;
  }
  return 0;
}

const PARTS_FOLDER = 'game.ServerStorage.AppleParts';
type Exec = AgentCtx['execStudioOp'];
const vec = (v: unknown): V3 | null => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n))) ? v.map(Number) as V3 : null;
export async function bounds(exec: Exec, path: string): Promise<{ center: V3; size: V3; bottomY: number } | null> {
  const b = await exec({ op: 'spatial_query', action: 'bounds', path }, 15_000).catch(() => null);
  const d = (b?.ok ? b.data : null) as { center?: unknown; size?: unknown; bottomY?: unknown } | null;
  const center = vec(d?.center), size = vec(d?.size);
  return center && size && Number.isFinite(Number(d?.bottomY)) ? { center, size, bottomY: Number(d!.bottomY) } : null;
}

// ------------------------------------------------------------------------------------------------ names ---

/**
 * A name an instance may carry and a path may name: any language, letters and digits, spaces, "_" and "-", at most 40
 * characters. Dots, brackets, quotes and control characters are removed because they break paths. Empty when nothing is left.
 * Pure.
 */
export function safeObjectName(raw: unknown): string {
  return String(raw ?? '').replace(/[\x00-\x1f\x7f.[\]\\"'`]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
}

/**
 * A free name for a new thing in Workspace. The agent supplies the name; with none, the piece's own name is used, never
 * words of the request. A name that is taken is an error the agent resolves (another name, or `replace: true` to remove
 * the thing that is there): nothing the run did not make is ever deleted unasked. Not a decision about taste: only a path.
 */
export async function allocateName(ctx: AgentCtx, wanted: unknown, fallback: unknown, replace = false): Promise<{ name: string; path: string } | { error: string }> {
  const name = safeObjectName(wanted) || safeObjectName(fallback);
  if (!name) return { error: 'name the object: a short name in any language (letters, digits, spaces, "_", "-")' };
  const path = `game.Workspace.${name}`;
  const there = await ctx.execStudioOp({ op: 'get_instance', path }, 10_000).catch(() => null);
  if (there?.ok) {
    if (!replace) return { error: `${path} already exists in the place (made earlier, by the user or by this run). Choose another name, or pass replace: true to remove it and put this there.` };
    const gone = await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => null);
    if (!gone?.ok) return { error: `${path} could not be replaced: ${String(gone?.error ?? 'delete refused').slice(0, 160)}` };
  }
  return { name, path };
}

// -------------------------------------------------------------------------------------------- measuring ---

/** The volume-weighted colour of a tree's parts, as #rrggbb ('#ffffff' when unknown). */
export function mainColourOf(tree: unknown): string {
  const by = new Map<string, number>();
  const walk = (n: { props?: Record<string, { v?: unknown }>; children?: unknown[] }) => {
    const size = vec(n.props?.Size?.v), col = n.props?.Color?.v;
    if (size && Array.isArray(col) && col.length === 3 && (Number(n.props?.Transparency?.v ?? 0) < 0.9)) {
      const hex = '#' + (col as number[]).map((c) => Math.max(0, Math.min(255, Math.round(c * 255))).toString(16).padStart(2, '0')).join('');
      by.set(hex, (by.get(hex) ?? 0) + size[0] * size[1] * size[2]);
    }
    for (const c of n.children ?? []) walk(c as typeof n);
  };
  if (tree && typeof tree === 'object') walk(tree as Parameters<typeof walk>[0]);
  return [...by.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '#ffffff';
}

const NAMED: [string, [number, number, number]][] = [['yellow', [245, 205, 48]], ['orange', [240, 140, 40]], ['red', [200, 40, 40]], ['pink', [240, 130, 180]],
  ['purple', [140, 70, 190]], ['blue', [50, 110, 220]], ['light blue', [140, 200, 240]], ['green', [60, 160, 70]], ['brown', [120, 80, 45]],
  ['tan', [200, 165, 120]], ['white', [240, 240, 240]], ['grey', [140, 140, 140]], ['black', [25, 25, 25]]];

/** The nearest plain colour word for a #rrggbb. Pure. */
export function colourName(hex: string | undefined): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? '');
  if (!m) return 'unknown colour';
  const c = [parseInt(m[1]!, 16), parseInt(m[2]!, 16), parseInt(m[3]!, 16)];
  return NAMED.map(([n, v]) => [n, v.reduce((a, x, i) => a + (x - c[i]!) ** 2, 0)] as const).sort((a, b) => a[1] - b[1])[0]![0];
}

/**
 * The world-aligned box of a tree's visible parts, from each part's Size and CFrame (the box place_copies fits by), or
 * null when the tree carries none. Model:GetBoundingBox is oriented to the model's pivot, so for a turned piece it is
 * not the box the stage and the click body must cover (review 2026-10-02). Pure.
 */
export function worldBox(tree: unknown): { center: V3; size: V3; bottomY: number } | null {
  let lo: V3 | null = null, hi: V3 | null = null;
  const walk = (n: { props?: Record<string, { v?: unknown }>; children?: unknown[] }) => {
    const size = vec(n.props?.Size?.v), cf = n.props?.CFrame?.v;
    if (size && Array.isArray(cf) && cf.length === 12 && cf.every((x) => Number.isFinite(Number(x))) && Number(n.props?.Transparency?.v ?? 0) < 1) {
      const [x, y, z, r00, r01, r02, r10, r11, r12, r20, r21, r22] = cf.map(Number) as number[];
      // Half-extent of the rotated box along each world axis: |R| times the half size.
      const h = [size[0] / 2, size[1] / 2, size[2] / 2];
      const ext: V3 = [
        Math.abs(r00!) * h[0]! + Math.abs(r01!) * h[1]! + Math.abs(r02!) * h[2]!,
        Math.abs(r10!) * h[0]! + Math.abs(r11!) * h[1]! + Math.abs(r12!) * h[2]!,
        Math.abs(r20!) * h[0]! + Math.abs(r21!) * h[1]! + Math.abs(r22!) * h[2]!,
      ];
      const a: V3 = [x! - ext[0], y! - ext[1], z! - ext[2]], b: V3 = [x! + ext[0], y! + ext[1], z! + ext[2]];
      lo = lo ? lo.map((v, i) => Math.min(v, a[i]!)) as V3 : a;
      hi = hi ? hi.map((v, i) => Math.max(v, b[i]!)) as V3 : b;
    }
    for (const c of n.children ?? []) walk(c as typeof n);
  };
  if (tree && typeof tree === 'object') walk(tree as Parameters<typeof walk>[0]);
  if (!lo || !hi) return null;
  const l = lo as V3, u = hi as V3;
  return { center: [(l[0] + u[0]) / 2, (l[1] + u[1]) / 2, (l[2] + u[2]) / 2], size: [u[0] - l[0], u[1] - l[1], u[2] - l[2]], bottomY: l[1] };
}

interface TreeNode { class?: unknown; name?: unknown; children?: unknown[] }
/** What a staged piece holds, counted from its tree: parts, scripts and sounds (taken out afterwards), a Humanoid. Pure. */
export function inventoryOf(root: unknown): { parts: number; scripts: number; sounds: number; humanoid: boolean } {
  const out = { parts: 0, scripts: 0, sounds: 0, humanoid: false };
  const walk = (n: TreeNode) => {
    const c = String(n.class ?? '');
    if (/Part$|^Part$|^UnionOperation$|^MeshPart$/.test(c)) out.parts++;
    else if (c === 'Script' || c === 'LocalScript' || c === 'ModuleScript') out.scripts++;
    else if (c === 'Sound') out.sounds++;
    else if (c === 'Humanoid') out.humanoid = true;
    for (const k of n.children ?? []) walk(k as TreeNode);
  };
  if (root && typeof root === 'object') walk(root as TreeNode);
  return out;
}

/** A size in words against the player: "about 12 studs at its longest, 2.4 player heights". Pure. */
export function sizeWords(size: V3): string {
  const longest = Math.max(...size);
  return `about ${Math.round(longest)} studs at its longest (${Math.round(longest / PLAYER_HEIGHT * 10) / 10} player heights; a player is ${PLAYER_HEIGHT} studs tall)`;
}

// -------------------------------------------------------------------------------------------- staging ---

/** A piece's leftovers from its own game: a price tag, a "Buy" prompt, a click nothing answers once its script is out. */
async function stripLeftovers(ctx: AgentCtx, root: string): Promise<void> {
  await ctx.execStudioOp({ op: 'strip_descendants', root, classes: ['BillboardGui', 'ProximityPrompt', 'ClickDetector'] }, 30_000).catch(() => undefined);
}

/**
 * Brings one candidate into `into` (a folder in ServerStorage, where no script runs) and strips scripts, sounds and
 * leftovers. Returns the path to copy from, and what the piece held before it was stripped, or { error }.
 */
async function stage(ctx: AgentCtx, c: LibraryCandidate, into: string): Promise<{ from: string; held: ReturnType<typeof inventoryOf> } | { error: string }> {
  let from = into;
  if (c.source === 'owner') {
    // The game's own materials first, so a piece that names one does not draw as bare plastic (only missing ones).
    await libraryMaterials(ctx, c.gameId!).catch(() => undefined);
    const imported = await ctx.execStudioOp({ op: 'import_owner_library', gameId: c.gameId!, path: c.path!, mode: 'self', parent: into, applyServiceProperties: false, studioData: true }, LIBRARY_IMPORT_MS).catch(() => null);
    if (!imported?.ok) return { error: `could not be imported: ${String(imported?.error ?? 'no answer from Studio').slice(0, 160)}` };
  } else {
    // A Creator Store row passes insert_library_model's own gate (source policy, in-place scan, zero scripts proved).
    const { TOOLS } = await import('./tools');
    const inserted = await TOOLS.insert_library_model!.run(ctx, { id: c.id, parent: into }).catch(() => ({ error: 'insert failed' })) as Record<string, unknown>;
    const paths = Array.isArray(inserted.inserted) ? inserted.inserted.filter((p): p is string => typeof p === 'string') : [];
    if ('error' in inserted) return { error: String(inserted.error).slice(0, 200) };
    if (paths.length !== 1) return { error: 'was inserted as several pieces; place it with insert_library_model instead' };
    from = paths[0]!;
  }
  const tree = await ctx.execStudioOp({ op: 'get_tree', root: from, maxDepth: 12, maxNodes: 600 }, 30_000).catch(() => null);
  const held = inventoryOf(tree?.ok ? (tree.data as { root?: unknown }).root : null);
  await ctx.execStudioOp({ op: 'strip_descendants', root: into, classes: ['LocalScript', 'Script', 'ModuleScript', 'Sound'] }, 30_000).catch(() => undefined);
  await stripLeftovers(ctx, into);
  return { from, held };
}

/** Makes AppleParts in ServerStorage when it is not there, and says whether this call made it (it is taken away again). */
async function ensureParts(ctx: AgentCtx): Promise<boolean> {
  const folder = await ctx.execStudioOp({ op: 'get_instance', path: PARTS_FOLDER }, 10_000).catch(() => null);
  if (folder?.ok) return false;
  await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleParts' }), parent: 'game.ServerStorage' }] }, 20_000).catch(() => undefined);
  return true;
}
const gone = (ctx: AgentCtx, path: string) => ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);

/** A big number floating over a candidate, so a snapshot can tell 1 from 2. */
function numberTag(index: number, at: V3): InstanceSpecLite {
  return {
    className: 'Part', name: `Tag${index}`,
    props: { Size: [1, 1, 1], Position: at, Anchored: true, CanCollide: false, CanQuery: false, CanTouch: false, Transparency: 1 },
    children: [{ className: 'BillboardGui', name: 'Number', props: { Size: { t: 'UDim2', v: [0, 90, 0, 90] }, AlwaysOnTop: true, LightInfluence: 0 },
      children: [{ className: 'TextLabel', name: 'Text', props: { Size: { t: 'UDim2', v: [1, 0, 1, 0] }, BackgroundTransparency: 1, Text: String(index), TextScaled: true, Font: { t: 'EnumItem', v: 'Enum.Font.FredokaOne' }, TextColor3: '#ffffff' },
        children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 4 } }] }] }],
  };
}

/** The temporary lineup a snapshot is taken of: always taken down again. */
const LINEUP = 'game.Workspace.ApplePreviewLineup';
const SLOT_GAP = 18;
const PICK_LENGTH = 12;

export interface ModelPreview {
  index: number;
  name: string;
  source: 'owner' | 'store';
  game?: string;
  id?: string;
  gameId?: string;
  path?: string;
  parts?: number;
  /** Measured, studs [x, y, z], and said against the player. */
  size?: V3;
  sizeNote?: string;
  dominantColour?: string;
  dominantColourName?: string;
  /** Scripts and sounds the piece carried (they are always left out of a placed copy). */
  scriptsAndSoundsLeftOut?: number;
  /** A fact that stops it being placed as an object (a Humanoid inside, too big to read whole), never a verdict on fit. */
  blockedBecause?: string;
  note?: string;
}

/**
 * Evidence for choosing: each named candidate staged off the place (ServerStorage only; scripts and sounds stripped) and
 * measured: part count, size, dominant colour. With `snapshot`, the candidates also stand in a numbered row in Workspace
 * for one viewport capture shown to the user, and the row is taken down before this returns. Nothing the agent sees is
 * left behind; nothing here chooses.
 */
export async function previewLibraryModels(ctx: AgentCtx, raw: unknown[], opts: { snapshot?: boolean } = {}) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 6) return { error: 'models must list 1 to 6 candidates: { id } from find_library_model or { gameId, path } from browse_owner_library' };
  const candidates: LibraryCandidate[] = [];
  for (const r of raw) {
    const c = candidateOf(r);
    if ('error' in c) return c;
    candidates.push(c);
  }
  if (opts.snapshot) {
    // The row stands in the place for a moment; a safety copy first, as for every library import.
    const copy = await librarySafetyCopy(ctx, 'before previewing ready-made models');
    if ('error' in copy) return { error: copy.error };
  }
  const madeFolder = await ensureParts(ctx);
  const previews: ModelPreview[] = [];
  const failed: { name: string; because: string }[] = [];
  const staged: { index: number; into: string; from: string }[] = [];
  try {
    for (const c of candidates) {
      const index = previews.length + 1;
      const into = `${PARTS_FOLDER}.ApplePreview${index}`;
      await gone(ctx, into);
      await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: `ApplePreview${index}` }), parent: PARTS_FOLDER }] }, 20_000).catch(() => undefined);
      const s = await stage(ctx, c, into);
      if ('error' in s) { failed.push({ name: c.name, because: s.error }); await gone(ctx, into); continue; }
      const tree = await ctx.execStudioOp({ op: 'get_tree', root: s.from, maxDepth: 12, maxNodes: 600 }, 30_000).catch(() => null);
      const root = tree?.ok ? (tree.data as { root?: unknown }).root : null;
      const truncated = Boolean(tree?.ok && (tree.data as { truncated?: unknown }).truncated);
      const box = truncated ? null : worldBox(root);
      const hex = mainColourOf(root);
      const inv = inventoryOf(root);
      const blocked = s.held.humanoid ? 'it holds a Humanoid (a character, not an object)' : s.held.parts > MAX_PARTS ? `${s.held.parts} parts is more than ${MAX_PARTS}, too big to copy` : undefined;
      previews.push({
        index, name: c.name, source: c.source, ...(c.game ? { game: c.game } : {}), ...(c.id ? { id: c.id } : {}), ...(c.gameId ? { gameId: c.gameId, path: c.path } : {}),
        parts: s.held.parts || inv.parts,
        ...(box ? { size: box.size.map((n) => Math.round(n * 10) / 10) as V3, sizeNote: sizeWords(box.size) } : { note: 'size not measured (the piece is too big to read whole)' }),
        dominantColour: hex, dominantColourName: colourName(hex),
        scriptsAndSoundsLeftOut: s.held.scripts + s.held.sounds,
        ...(blocked ? { blockedBecause: blocked } : {}),
      });
      staged.push({ index, into, from: s.from });
    }
    let snapshot: { image?: string; note: string } | undefined;
    if (opts.snapshot && staged.length) snapshot = await lineupSnapshot(ctx, staged);
    return {
      previews, ...(failed.length ? { failed } : {}), ...(snapshot ? { snapshot } : {}),
      note: 'Measured evidence, nothing placed and nothing chosen. Choose with the request in view: place one with insert_library_model ({ id } or { gameId, path }, and size/height/scale if it should differ from its own size), or build it another way if none fits (build_object, compose_game, ask the user).',
    };
  } finally {
    for (const s of staged) await gone(ctx, s.into);
    await gone(ctx, `${PARTS_FOLDER}.ApplePreview${previews.length + 1}`);
    if (madeFolder) await gone(ctx, PARTS_FOLDER);
    await gone(ctx, LINEUP);
  }
}

/** Stands the staged pieces in a numbered row, captures the viewport for the user, takes the row down. */
async function lineupSnapshot(ctx: AgentCtx, staged: { index: number; from: string }[]): Promise<{ image?: string; note: string }> {
  try {
    await gone(ctx, LINEUP);
    const made = await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Model', name: 'ApplePreviewLineup' }), parent: 'game.Workspace' }] }, 20_000);
    if (!made.ok) return { note: 'snapshot not taken: the lineup could not be made' };
    const rowX = await freeLaneX(ctx, SLOT_GAP * staged.length, 16, -30, [LINEUP]);
    const tags: InstanceSpecLite[] = [];
    let placed = 0;
    for (const [n, s] of staged.entries()) {
      const slot: V3 = [rowX + (n - (staged.length - 1) / 2) * SLOT_GAP, 0, -30];
      const copied = await ctx.execStudioOp({ op: 'place_copies', items: [{ from: s.from, parent: LINEUP, name: `Pick${s.index}`, at: slot, length: PICK_LENGTH, along: 'x' }] }, 60_000).catch(() => null);
      if (!copied?.ok) continue;
      placed++;
      const b = await bounds(ctx.execStudioOp, `${LINEUP}.Pick${s.index}`);
      tags.push(numberTag(s.index, [slot[0], (b ? b.bottomY + b.size[1] : 8) + 3, slot[2]]));
    }
    if (!placed) return { note: 'snapshot not taken: nothing could be stood in the row' };
    await ctx.execStudioOp({ op: 'create_instances', items: tags.map((t) => ({ ...typed(t), parent: LINEUP })) }, 20_000).catch(() => undefined);
    await ctx.execStudioOp({ op: 'camera_focus', path: LINEUP }, 10_000).catch(() => undefined);
    const shot = await ctx.execStudioOp({ op: 'capture_studio_viewport' }, 45_000).catch(() => null);
    const frame = shot?.ok ? shot.data as { source?: string; encoding?: string; rgbBase64?: string; width?: number; height?: number } : null;
    if (!frame?.rgbBase64 || !frame.width || !frame.height) return { note: 'snapshot not taken: Studio gave no viewport pixels. The measured evidence above stands.' };
    ctx.emitFrame?.(frame as Parameters<NonNullable<AgentCtx['emitFrame']>>[0]);
    let image: string | undefined;
    if (ctx.projectId) {
      try {
        const png = frame.encoding === 'png' ? frame.rgbBase64 : (await rgbBase64ToDataUrl(frame.rgbBase64, frame.width, frame.height)).replace(/^data:image\/png;base64,/, '');
        image = imagePathFor(ctx.projectId, await storeImage(ctx.env, png, ctx.projectId));
      } catch { image = undefined; }
    }
    return { ...(image ? { image } : {}), note: 'The row was shown to the user (numbers match the previews) and has been taken down. You read the measured evidence, not the pixels.' };
  } finally {
    await gone(ctx, LINEUP);
  }
}

// ------------------------------------------------------------------------------------------- placing ---

/**
 * What the agent asked for in the size of a placed piece. At most one: `size` (its longest side in studs), `height`, or
 * `scale` (times its own size). None: it keeps the size it was made in, and the result reports it against the player.
 */
export interface PlaceSize { size?: number; height?: number; scale?: number }

export function placeSizeOf(a: Record<string, unknown>): PlaceSize | { error: string } {
  const out: PlaceSize = {};
  for (const [k, lo, hi] of [['size', 0.1, 2000], ['height', 0.1, 2000], ['scale', 0.001, 1000]] as const) {
    if (a[k] === undefined) continue;
    const n = Number(a[k]);
    if (!(n >= lo && n <= hi)) return { error: `${k} must be between ${lo} and ${hi}` };
    out[k] = n;
  }
  if (Object.keys(out).length > 1) return { error: 'give one of size (longest side in studs), height or scale, not several' };
  return out;
}

/**
 * Places one candidate as a script-free copy: staged off the place, copied into Workspace at the size the agent asked
 * for (its own size when it asked for none), named as the agent named it, standing where the agent said, or beside what
 * is already there. Pure placement: no stage, no motion, no counter, no light, no ground or spawn change, no camera move.
 * Reports the measured box. Anything beyond that is the agent's own call (dress_object and the other tools).
 */
export async function placeLibraryPiece(ctx: AgentCtx, c: LibraryCandidate, a: { name?: unknown; at?: unknown; replace?: unknown; size?: PlaceSize }) {
  const copy = await librarySafetyCopy(ctx, 'before placing a ready-made model');
  if ('error' in copy) return { error: copy.error };
  const named = await allocateName(ctx, a.name, c.name, a.replace === true);
  if ('error' in named) return named;
  const madeFolder = await ensureParts(ctx);
  const into = `${PARTS_FOLDER}.ApplePlace`;
  try {
    await gone(ctx, into);
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'ApplePlace' }), parent: PARTS_FOLDER }] }, 20_000).catch(() => undefined);
    const s = await stage(ctx, c, into);
    if ('error' in s) return { error: `${c.name} ${s.error}` };
    if (s.held.humanoid) return { error: `${c.name} holds a Humanoid (a character, not an object); it was not placed` };
    const tree = await ctx.execStudioOp({ op: 'get_tree', root: s.from, maxDepth: 12, maxNodes: 600 }, 30_000).catch(() => null);
    const root = tree?.ok ? (tree.data as { root?: unknown }).root : null;
    const own = tree?.ok && !(tree.data as { truncated?: unknown }).truncated ? worldBox(root) : null;
    // The size asked for becomes the length or height place_copies fits by; a scale needs the piece's own size to be known.
    let fit: { length?: number; height?: number } = {};
    if (a.size?.height !== undefined) fit = { height: a.size.height };
    else if (a.size?.size !== undefined) fit = { length: a.size.size };
    else if (a.size?.scale !== undefined) {
      if (!own) return { error: 'scale needs the size of the piece, which could not be measured; pass size (longest side in studs) instead' };
      fit = { length: Math.max(own.size[0], own.size[2], 0.1) * a.size.scale };
    }
    const width = fit.length ?? Math.max(own?.size[0] ?? 8, own?.size[2] ?? 8);
    const depth = fit.length ? fit.length * (own ? Math.min(own.size[0], own.size[2]) / Math.max(own.size[0], own.size[2], 0.1) : 1) : Math.min(own?.size[0] ?? 8, own?.size[2] ?? 8);
    let at: V3;
    const given = Array.isArray(a.at) && a.at.length === 3 && a.at.every((n) => Number.isFinite(Number(n))) ? a.at.map(Number) as V3 : null;
    if (given) at = given;
    else {
      // The agent said nowhere: beside what is already there, never in it.
      const x = await freeLaneX(ctx, width + 12, depth + 12, -26, [named.path]);
      at = [x, 0, -26];
    }
    const placed = await ctx.execStudioOp({ op: 'place_copies', items: [{ from: s.from, parent: 'game.Workspace', name: named.name, at, ...fit }] }, 60_000).catch(() => null);
    if (!placed?.ok) return { error: `${c.name} could not be placed: ${String(placed?.error ?? 'no answer from Studio').slice(0, 200)}` };
    const b = await bounds(ctx.execStudioOp, named.path);
    return {
      changed: true, projectMutated: true,
      object: named.path,
      placedAt: at,
      ...(b ? { size: b.size.map((n) => Math.round(n * 10) / 10) as V3, sizeNote: sizeWords(b.size), center: b.center, bottomY: b.bottomY } : { sizeNote: 'size not measured' }),
      library: { source: c.source, name: c.name, ...(c.game ? { game: c.game } : {}) },
      scriptsAndSoundsLeftOut: s.held.scripts + s.held.sounds,
      note: 'Placed as a script-free copy, nothing else added: no stage, motion, counter, light or camera change, and the ground and spawn are as they were. Use dress_object to add any of those, play_check to see it, and tell the user what is really there.',
    };
  } finally {
    await gone(ctx, into);
    if (madeFolder) await gone(ctx, PARTS_FOLDER);
  }
}

/** What one play_check measured, said for the answer (shared with the session's tool loop). Pure. */
export function playCheckReading(detail: unknown): { problem?: string; seen: string } {
  const d = (detail ?? {}) as { verdict?: unknown; playerSees?: unknown; leaderstats?: unknown; clientErrors?: unknown[]; serverErrors?: unknown[] };
  const problem = typeof d.verdict === 'string' && /^no_|broken|error|fail/i.test(d.verdict) && typeof d.playerSees === 'string' ? d.playerSees : undefined;
  const errors = (d.clientErrors?.length ?? 0) + (d.serverErrors?.length ?? 0);
  // "Coins 0 at the start → Coins 70 at the end" reads as "Coins went from 0 to 70".
  const ls = typeof d.leaderstats === 'string' ? /^(\w+) (-?[\d.,]+) at the start → \1 (-?[\d.,]+) at the end$/.exec(d.leaderstats.trim()) : null;
  // Not "on their own": presses on the player's own machines pay too (round 13's answer overstated it).
  // A game with no money says nothing about money (round 8 of test 2: "the player has no leaderstats folder").
  const money = ls ? `${ls[1]} went from ${ls[2]} to ${ls[3]} during the test` : typeof d.leaderstats === 'string' && !/^the player has no/i.test(d.leaderstats) ? d.leaderstats : '';
  return { ...(problem ? { problem } : {}), seen: `${money ? `${money}, and ` : ''}${errors ? `${errors} error${errors === 1 ? '' : 's'} came up` : 'nothing errored'}` };
}

const FAULT_LABEL = 'Click it!';
