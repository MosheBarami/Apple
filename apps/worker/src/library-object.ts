/**
 * Library-first objects (owner, 2026-10-02: "FOR 3D MODELS ALWAYS MAKE HIM SEARCH THE CREATOR STORE OR THE LIBRARY FOR
 * MODELS (and make them studded if needed) and just rarely generate procedurally"; asked who picks, the owner chose
 * "the user picks from 3 previews", keyboards from the library too, and the owner library plus Roblox-owned Creator
 * Store models only).
 *
 * One object request is answered in two runs and no model call:
 *   1. offerLibraryObjects: search the owner library catalog (ranked by the paired gateway), then the bundled
 *      Roblox-owned Creator Store index; up to three ready-made models stand side by side in the place, numbered 1-3,
 *      and the chat shows a card with a Studio snapshot of them. The run ends there.
 *   2. placeChosenObject, on "Use visual option N and continue.": that copy is moved onto a stage in front of the
 *      spawn, sized to about three player heights, made to wobble on a click with a library sound, given a counter on
 *      the player's screen, and the others are removed. "None of these look right" builds it with build_object.
 *
 * Every candidate is a copy WITHOUT scripts or sounds: an owner-library piece is imported into ServerStorage (where no
 * script runs), stripped, and placed as a copy (place_copies destroys scripts and sounds and anchors the parts); a
 * Creator Store row goes through insert_library_model's own gate (insertAndProveClean). Studs come from the plugin's
 * surface rule on every part a write adds, "if needed" (it skips Neon, Glass and parts that already have a surface).
 */
import type { AgentCtx } from './tools';
import type { InstanceSpecLite } from './compose';
import { luau } from './compose';
import { typed } from './compose-run';
import { findLibraryModels } from './model-library';
import { LIBRARY_IMPORT_MS, libraryMaterials, librarySafetyCopy } from './local-owner-corpus';
import { contrastStage, COOL_ORB_COLOURS, groundAndSpawn, motionClip, PLAYER_HEIGHT, withRiders, writeObjectHud, type ObjectPart } from './object-tool';
import { findSounds, vfxPlan } from './fx-library';
import { installAnimationPlayer } from './animate-tool';
import { userWantsOwnSurface } from './surfaces';
import { rgbBase64ToDataUrl } from './png';
import { imagePathFor, storeImage } from './imagegen';

type V3 = [number, number, number];

/** Words that are not the object: the request's verbs, articles and size words. */
const STOP = new Set(['a', 'an', 'the', 'me', 'us', 'my', 'our', 'some', 'one', 'please', 'make', 'build', 'create', 'give', 'spawn', 'get',
  'add', 'i', 'want', 'need', 'can', 'you', 'could', 'would', 'for', 'with', 'to', 'and', 'in', 'on', 'it', 'that', 'this', 'really', 'very',
  'super', 'giant', 'big', 'huge', 'small', 'tiny', 'little', 'cute', 'nice', 'new', 'just', 'like', 'pls', 'plz', 'thing']);
const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
/** A catalog name's words, CamelCase split: "GoldenCrown" -> golden, crown (test 3, 2026-10-02: no crown matched). */
const nameWordsOf = (t: string) => words(t.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2'));
/** "keyboards" -> keyboard, "boxes" -> box. Pure. */
export function singular(w: string): string {
  return w.length > 4 && /(ch|sh|x|s)es$/.test(w) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w;
}

/** The object's own words, in order, "of" kept: "make me a stick of butter" -> stick, of, butter. Pure. */
export function objectWords(request: string): string[] {
  const all = words(request);
  return all.filter((w, i) => !STOP.has(w) || (w === 'of' && i > 0 && i < all.length - 1)).filter((w, i, a) => w !== 'of' || (i > 0 && i < a.length - 1));
}

/**
 * What to search for, best first: the whole name ("asmr keyboard"), then its head noun (keyboard). In "a stick of
 * butter" the object is what comes after "of": a stick is only its shape, and searching it would offer sticks of
 * wood. Pure.
 */
export function objectQueries(request: string): string[] {
  const w = objectWords(request);
  const of = w.indexOf('of');
  const content = of > 0 ? w.slice(of + 1).filter((x) => x !== 'of') : w.filter((x) => x !== 'of');
  const out: string[] = [];
  const add = (q: string | undefined) => { if (q && q.length >= 2 && !out.includes(q)) out.push(q); };
  if (content.length > 1) add(content.join(' '));
  add(content.at(-1));
  return out;
}

/** The model's name in the place: "a stick of butter" -> StickOfButter. Pure. */
export function objectNameOf(request: string): string {
  const name = objectWords(request).slice(0, 5).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('').replace(/^[0-9]+/, '');
  return /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name) ? name : 'MyObject';
}

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
  /** A Creator Store row's library id (insert_library_model) and asset id (its thumbnail). */
  id?: string;
  assetId?: number;
  parts?: number;
}

interface CatalogItem { gameId?: unknown; game?: unknown; kind?: unknown; name?: unknown; className?: unknown; path?: unknown; parts?: unknown; instances?: unknown; contains?: unknown }
const PIECE_CLASSES = new Set(['Model', 'MeshPart', 'Part', 'UnionOperation', 'Tool', 'WedgePart']);

/**
 * The catalog hits that ARE the object, best first: the name holds the query's head word as a whole word ("Butter",
 * "Vanilla Donut"; never "Butterfly" or "Buttermilk"), an exact name first, then the head word last in the name, then
 * anywhere. One per source game, at most `limit`. Characters (a Humanoid inside), empty pieces and pieces too big to
 * copy are left out. Pure.
 */
export function rankCatalog(items: CatalogItem[], query: string, limit = 3): LibraryCandidate[] {
  const head = singular(words(query).at(-1) ?? '');
  const qWords = words(query).map(singular);
  if (!head) return [];
  const scored: { c: LibraryCandidate; score: number; order: number }[] = [];
  items.forEach((i, order) => {
    if (i.kind !== 'model' || typeof i.gameId !== 'string' || typeof i.path !== 'string' || typeof i.name !== 'string') return;
    if (!PIECE_CLASSES.has(String(i.className))) return;
    const parts = Number(i.parts ?? 0), instances = Number(i.instances ?? 0);
    if (!(parts >= 1) || parts > 400 || instances > 1500) return;
    if (Array.isArray(i.contains) && i.contains.some((c) => c === 'Humanoid')) return;
    // A diminutive is the same word ("Rubber Ducky" for a rubber duck, "Doggie"); a longer word is another thing
    // ("Butterfly" is not butter).
    const nameWords = nameWordsOf(i.name.replace(/#\d+$/, '')).map(singular).map((w) => [`${head}y`, `${head}ie`, `${head}${head.at(-1)}y`, `${head}${head.at(-1)}ie`].includes(w) ? head : w);
    if (!nameWords.includes(head)) return;
    const exact = nameWords.join(' ') === qWords.join(' ') || nameWords.join(' ') === head;
    const score = exact ? 3 : nameWords.at(-1) === head ? 2 : 1;
    scored.push({ c: { source: 'owner', name: cleanName(i.name.replace(/#\d+$/, '')), game: typeof i.game === 'string' ? cleanName(i.game) : undefined, gameId: i.gameId, path: i.path, parts }, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  // A name where the word is not last ("Butter fly", "Donut Booth") is another thing, offered only when nothing is the
  // thing itself: one honest option beats a butterfly.
  const best = scored[0]?.score ?? 0;
  const out: LibraryCandidate[] = [];
  for (const s of scored.filter((x) => best < 2 || x.score >= 2)) {
    if (out.some((o) => o.gameId === s.c.gameId)) continue; // different looks, not three copies from one game
    out.push(s.c);
    if (out.length >= limit) break;
  }
  return out;
}

/** Roblox-owned Creator Store rows whose name holds the head word (the bundled index; no third-party rows). Pure. */
export function storeCandidates(query: string, limit = 3): LibraryCandidate[] {
  const head = singular(words(query).at(-1) ?? '');
  if (!head) return [];
  const found = findLibraryModels({ query, creatorStoreOnly: true, includeThirdParty: false, limit: 10 }) as { results?: { id: string; name: string; assetId?: number }[] };
  return (found.results ?? [])
    .filter((r) => typeof r.assetId === 'number' && words(r.name).map(singular).includes(head))
    .slice(0, limit)
    .map((r) => ({ source: 'store' as const, name: cleanName(r.name), id: r.id, assetId: r.assetId }));
}

/** Where the numbered candidates stand: a row in front of the spawn. */
export const LINEUP = 'game.Workspace.ApplePicks';

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
 * to 40 studs), or 0 when there is none or Studio cannot say. A second object stood in the first one (test 4, the duck
 * on the butter's stage, 2026-10-02).
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
const SLOTS: V3[] = [[-18, 0, -30], [0, 0, -30], [18, 0, -30]];
const PICK_LENGTH = 12;

/** What the owner is shown: the options, the snapshot, and the sentence. */
export interface ObjectOffer {
  request: string;
  name: string;
  options: (LibraryCandidate & { index: number })[];
  image?: string;
  text: string;
}

type Exec = AgentCtx['execStudioOp'];
const vec = (v: unknown): V3 | null => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(Number(n))) ? v.map(Number) as V3 : null;
async function bounds(exec: Exec, path: string): Promise<{ center: V3; size: V3; bottomY: number } | null> {
  const b = await exec({ op: 'spatial_query', action: 'bounds', path }, 15_000).catch(() => null);
  const d = (b?.ok ? b.data : null) as { center?: unknown; size?: unknown; bottomY?: unknown } | null;
  const center = vec(d?.center), size = vec(d?.size);
  return center && size && Number.isFinite(Number(d?.bottomY)) ? { center, size, bottomY: Number(d!.bottomY) } : null;
}

/** The owner-library catalog, through the paired plugin (the owner's Mac only). */
async function catalog(ctx: AgentCtx, q: string): Promise<CatalogItem[]> {
  const out = await ctx.execStudioOp({ op: 'query_owner_library', action: 'list', q, kind: 'model', limit: 25 }, 60_000).catch(() => null);
  return out?.ok ? ((out.data as { items?: CatalogItem[] }).items ?? []) : [];
}

/** Up to three candidates for the request: owner library first, then Roblox-owned Creator Store rows. */
export async function findObjectCandidates(ctx: AgentCtx, request: string): Promise<LibraryCandidate[]> {
  const found: LibraryCandidate[] = [];
  const has = (c: LibraryCandidate) => found.some((f) => (f.gameId && f.gameId === c.gameId) || (f.id && f.id === c.id));
  for (const q of objectQueries(request)) {
    for (const c of rankCatalog(await catalog(ctx, q), q, 3)) if (found.length < 3 && !has(c)) found.push(c);
    if (found.length >= 3) break;
  }
  if (found.length < 3) {
    for (const q of objectQueries(request)) {
      for (const c of storeCandidates(q, 3)) if (found.length < 3 && !has(c)) found.push(c);
      if (found.length >= 3) break;
    }
  }
  return found;
}

/** A big number floating over a candidate, so the owner can tell 1 from 2 in Studio. */
function numberTag(index: number, at: V3): InstanceSpecLite {
  return {
    className: 'Part', name: `Tag${index}`,
    props: { Size: [1, 1, 1], Position: at, Anchored: true, CanCollide: false, CanQuery: false, CanTouch: false, Transparency: 1 },
    children: [{ className: 'BillboardGui', name: 'Number', props: { Size: { t: 'UDim2', v: [0, 90, 0, 90] }, AlwaysOnTop: true, LightInfluence: 0 },
      children: [{ className: 'TextLabel', name: 'Text', props: { Size: { t: 'UDim2', v: [1, 0, 1, 0] }, BackgroundTransparency: 1, Text: String(index), TextScaled: true, Font: { t: 'EnumItem', v: 'Enum.Font.FredokaOne' }, TextColor3: '#ffffff' },
        children: [{ className: 'UIStroke', name: 'Outline', props: { Color: '#111111', Thickness: 4 } }] }] }],
  };
}

/**
 * A library piece's leftovers from its own game: a price tag or icon floating over it, a "Buy" prompt, a click nothing
 * answers once its script is out. Its own call after the script strip, so a plugin that does not know these classes
 * refuses only this one (the scripts are out either way).
 */
async function stripLeftovers(ctx: AgentCtx, root: string): Promise<void> {
  await ctx.execStudioOp({ op: 'strip_descendants', root, classes: ['BillboardGui', 'ProximityPrompt', 'ClickDetector'] }, 30_000).catch(() => undefined);
}

/** Removes the numbered row and the imported pieces behind it. */
export async function clearLineup(ctx: AgentCtx): Promise<void> {
  // One path at a time: delete_instances refuses the whole list when one path is missing (review 2026-10-02: the row
  // was never taken down because its pick folders were already gone).
  for (const path of [LINEUP, `${PARTS_FOLDER}.ApplePick1`, `${PARTS_FOLDER}.ApplePick2`, `${PARTS_FOLDER}.ApplePick3`]) {
    await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  }
}

/**
 * Stands up to three candidates in the place, numbered, and returns what the chat card shows, or null when the
 * library has nothing that is the object (the run then builds it). Nothing here costs a model call.
 */
export async function offerLibraryObjects(ctx: AgentCtx, request: string): Promise<ObjectOffer | null> {
  const candidates = await findObjectCandidates(ctx, request);
  if (!candidates.length) return null;
  // A safety copy first, as for every library import: Studio undo, or the checkpoint, takes the row back out.
  const copy = await librarySafetyCopy(ctx, 'before showing ready-made models');
  if ('error' in copy) return null;
  await clearLineup(ctx);
  // The row goes where nothing stands (three 12-stud picks 18 apart, with room round them).
  const own = objectNameOf(request);
  const rowX = await freeLaneX(ctx, 58, 16, SLOTS[0]![2], [LINEUP, `game.Workspace.${own}`, `game.Workspace.${own}Stage`]);
  const slots = SLOTS.map(([x, y, z]) => [x + rowX, y, z] as V3);
  const made = await ctx.execStudioOp({ op: 'create_instances', items: [
    { ...typed({ className: 'Model', name: 'ApplePicks' }), parent: 'game.Workspace' },
  ] }, 20_000);
  if (!made.ok) return null;
  const folder = await ctx.execStudioOp({ op: 'get_instance', path: PARTS_FOLDER }, 10_000).catch(() => null);
  // A folder made here is taken away again at the end: a later compose_game makes its own AppleParts.
  const madeFolder = !folder?.ok;
  if (madeFolder) await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleParts' }), parent: 'game.ServerStorage' }] }, 20_000).catch(() => undefined);
  const placed: (LibraryCandidate & { index: number })[] = [];
  const tags: InstanceSpecLite[] = [];
  for (const c of candidates) {
    const index = placed.length + 1;
    const slot = slots[index - 1]!;
    const into = `${PARTS_FOLDER}.ApplePick${index}`;
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: `ApplePick${index}` }), parent: PARTS_FOLDER }] }, 20_000).catch(() => undefined);
    let from = into;
    if (c.source === 'owner') {
      // The game's own materials first, so a piece that names one does not draw as bare plastic (only missing ones).
      await libraryMaterials(ctx, c.gameId!).catch(() => undefined);
      // ServerStorage: no script runs there; the strip and the copy below take every script and sound out.
      const imported = await ctx.execStudioOp({ op: 'import_owner_library', gameId: c.gameId!, path: c.path!, mode: 'self', parent: into, applyServiceProperties: false, studioData: true }, LIBRARY_IMPORT_MS).catch(() => null);
      if (!imported?.ok) continue;
      await ctx.execStudioOp({ op: 'strip_descendants', root: into, classes: ['LocalScript', 'Script', 'ModuleScript', 'Sound'] }, 30_000).catch(() => undefined);
      await stripLeftovers(ctx, into);
    } else {
      // A Creator Store row passes insert_library_model's own gate (source policy, in-place scan, zero scripts proved).
      const { TOOLS } = await import('./tools');
      const inserted = await TOOLS.insert_library_model!.run(ctx, { id: c.id, parent: into }).catch(() => ({ error: 'insert failed' })) as Record<string, unknown>;
      const paths = Array.isArray(inserted.inserted) ? inserted.inserted.filter((p): p is string => typeof p === 'string') : [];
      if ('error' in inserted || paths.length !== 1) continue;
      from = paths[0]!;
    }
    const copied = await ctx.execStudioOp({ op: 'place_copies', items: [{ from, parent: LINEUP, name: `Pick${index}`, at: slot, length: PICK_LENGTH, along: 'x' }] }, 60_000).catch(() => null);
    const ok = copied?.ok && ((copied.data as { placed?: unknown[] })?.placed?.length ?? 1) > 0;
    await ctx.execStudioOp({ op: 'delete_instances', paths: [into] }, 20_000).catch(() => undefined);
    if (!ok) continue;
    let b = await bounds(ctx.execStudioOp, `${LINEUP}.Pick${index}`);
    // A tall thin thing fitted by its length would tower over the row: fitted by its height instead.
    if (b && b.size[1] > 2 * Math.max(b.size[0], b.size[2]) && b.size[1] > PICK_LENGTH) {
      const again = await ctx.execStudioOp({ op: 'place_copies', items: [{ from: `${LINEUP}.Pick${index}`, parent: LINEUP, name: `Pick${index}Tall`, at: slot, height: PICK_LENGTH, along: 'x' }] }, 60_000).catch(() => null);
      if (again?.ok) {
        await ctx.execStudioOp({ op: 'delete_instances', paths: [`${LINEUP}.Pick${index}`] }, 20_000).catch(() => undefined);
        await ctx.execStudioOp({ op: 'rename_instance', path: `${LINEUP}.Pick${index}Tall`, name: `Pick${index}` }, 20_000).catch(() => undefined);
        b = await bounds(ctx.execStudioOp, `${LINEUP}.Pick${index}`);
      }
    }
    tags.push(numberTag(index, [slot[0], (b ? b.bottomY + b.size[1] : 8) + 3, slot[2]]));
    placed.push({ ...c, index });
  }
  if (madeFolder) await ctx.execStudioOp({ op: 'delete_instances', paths: [PARTS_FOLDER] }, 20_000).catch(() => undefined);
  if (!placed.length) { await clearLineup(ctx); return null; }
  await ctx.execStudioOp({ op: 'create_instances', items: tags.map((t) => ({ ...typed(t), parent: LINEUP })) }, 20_000).catch(() => undefined);
  // The snapshot for the card: the active Studio camera on the row. No snapshot is still a choice (the row is in Studio).
  let image: string | undefined;
  await ctx.execStudioOp({ op: 'camera_focus', path: LINEUP }, 10_000).catch(() => undefined);
  const shot = await ctx.execStudioOp({ op: 'capture_studio_viewport' }, 45_000).catch(() => null);
  const frame = shot?.ok ? shot.data as { encoding?: string; rgbBase64?: string; width?: number; height?: number } : null;
  if (frame?.rgbBase64 && frame.width && frame.height && ctx.projectId) {
    // Stored like a generated image and served by its project route, so the card links to it instead of carrying it.
    try {
      const png = frame.encoding === 'png' ? frame.rgbBase64 : (await rgbBase64ToDataUrl(frame.rgbBase64, frame.width, frame.height)).replace(/^data:image\/png;base64,/, '');
      image = imagePathFor(ctx.projectId, await storeImage(ctx.env, png, ctx.projectId));
    } catch { image = undefined; }
  }
  const what = objectWords(request).join(' ') || 'object';
  const listed = placed.map((p) => `${p.index}. ${p.name}${p.game ? ` (from ${p.game})` : ' (Roblox)'}`).join('; ');
  const text = `I found ${placed.length === 1 ? 'a ready-made model' : `${placed.length} ready-made models`} for your ${what} and stood ${placed.length === 1 ? 'it' : 'them'} in your place, numbered: ${listed}. `
    + `Pick the one you want and I will put it on a stage, make it react when clicked and add a counter. If none of them is right, choose "None of these" and I will build one.`;
  return { request, name: objectNameOf(request), options: placed, ...(image ? { image } : {}), text };
}

/** What the session keeps between the offer and the pick. */
export interface PendingObjectChoice { request: string; name: string; options: (LibraryCandidate & { index: number })[] }

/** The volume-weighted colour of a tree's parts, as #rrggbb ('#ffffff' when unknown). */
function mainColourOf(tree: unknown): string {
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

/** The target size: about three player heights along its longest side, height first for a tall thing. Pure. */
export function libraryFit(size: V3): { length?: number; height?: number } {
  const across = Math.max(size[0], size[2]);
  return size[1] > across * 1.2 ? { height: 3 * PLAYER_HEIGHT } : { length: 3 * PLAYER_HEIGHT };
}

/**
 * The picked candidate becomes the object: moved onto a stage in front of the spawn and sized, the others removed,
 * a whole-model wobble on a click with a library sound (two-level rig: every part welded to one invisible body that
 * a single Motor6D turns, so repeated part names never matter), a counter and a hint, the camera and the studded
 * mood. Returns the build_object-shaped result the session ends the run with, or { error } (the run then builds it).
 */
export async function placeChosenObject(ctx: AgentCtx, pending: PendingObjectChoice, index: number) {
  const pick = pending.options.find((o) => o.index === index);
  if (!pick) return { error: 'That option is not there any more.' };
  const from = `${LINEUP}.Pick${index}`;
  const before = await bounds(ctx.execStudioOp, from);
  if (!before) return { error: 'The picked model is no longer in the place.' };
  const name = /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(pending.name) ? pending.name : 'MyObject';
  const model = `game.Workspace.${name}`;
  const stageName = `game.Workspace.${name}Stage`;
  for (const path of [model, stageName]) await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  const fit = libraryFit(before.size);
  // Beside what is already there, never in it: the size it will have (its long side along x) on its stage, with a gap.
  const k = fit.length ? fit.length / Math.max(before.size[0], before.size[2], 0.1) : fit.height! / Math.max(before.size[1], 0.1);
  const wide = Math.max(before.size[0], before.size[2]) * k, deep = Math.min(before.size[0], before.size[2]) * k;
  const x = await freeLaneX(ctx, wide + 18, deep + 18, -26, [LINEUP, model, stageName]);
  const at: V3 = [x, 2, -26];
  const copied = await ctx.execStudioOp({ op: 'place_copies', items: [{ from, parent: 'game.Workspace', name, at, ...fit, along: 'x' }] }, 60_000);
  if (!copied.ok) return { error: `The picked model could not be moved: ${String(copied.error ?? '').slice(0, 200)}` };
  await clearLineup(ctx);
  // The world box of its visible parts (worldBox), or the model's own box when the tree is too big to read whole.
  const tree = await ctx.execStudioOp({ op: 'get_tree', root: model, maxDepth: 12, maxNodes: 400 }, 30_000).catch(() => null);
  const whole = tree?.ok && !(tree.data as { truncated?: unknown }).truncated;
  const b = (whole ? worldBox((tree!.data as { root?: unknown }).root) : null) ?? await bounds(ctx.execStudioOp, model);
  if (!b) return { error: 'The placed model has no measurable size.', changed: true, projectMutated: true };
  const [sx, sy, sz] = b.size, [cx, , cz] = b.center;
  const problems: string[] = [];

  // The stage under it, a colour that stands apart from the model's own, then the ground, the spawn and the studs.
  const stageColor = contrastStage(mainColourOf(tree?.ok ? (tree.data as { root?: unknown }).root : null));
  const pad = 6;
  await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Model', name: `${name}Stage`, children: [
    { className: 'Part', name: 'Stage', props: { Size: [sx + pad * 2, 2, sz + pad * 2], Position: [cx, 1, cz], Anchored: true, Color: stageColor, Material: 'Plastic' } },
    { className: 'Part', name: 'Rim', props: { Size: [sx + pad * 2 + 2, 1, sz + pad * 2 + 2], Position: [cx, 0.5, cz], Anchored: true, Color: '#8e5b32', Material: 'Plastic' } },
  ] }), parent: 'game.Workspace' }] }, 30_000).catch(() => undefined);
  // The original request decides the surface, not the "Use visual option" message that picked it.
  await groundAndSpawn(ctx, userWantsOwnSurface(pending.request) ? null : [stageName]);

  // The rig: an invisible body around the whole model that every part is welded to, turned by one Motor6D on a root.
  const body: ObjectPart = { name: 'AppleBody', shape: 'block', size: [sx + 0.2, sy + 0.2, sz + 0.2], at: [0, 0, 0], color: '#ffffff', move: { as: 'wobble', on: 'click', sound: 'squish' } };
  const mk = (spec: InstanceSpecLite) => ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed(spec), parent: model }] }, 20_000);
  // Touchable: walking into it presses it too (AppleAnimate's step-on for a part's own click clip), which is also how
  // the play check presses it, since a check cannot click.
  const madeBody = await mk({ className: 'Part', name: 'AppleBody', props: { Size: body.size, Position: b.center, Anchored: true, CanCollide: false, CanTouch: true, CanQuery: true, Transparency: 1 } });
  let moves = false;
  if (madeBody.ok) {
    const welded = await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleBody`, joint: 'weld' }, 60_000);
    const madeRoot = welded.ok ? await mk({ className: 'Part', name: 'AppleRoot', props: { Size: [1, 1, 1], Position: [cx, b.bottomY + 0.5, cz], Anchored: true, CanCollide: false, CanTouch: false, CanQuery: false, Transparency: 1 } }) : welded;
    const motor = madeRoot.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleRoot`, parts: [`${model}.AppleBody`], joint: 'motor' }, 60_000) : madeRoot;
    if (motor.ok) {
      await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${model}.AppleRoot.AppleBody`, at: [cx, b.bottomY, cz] }, 20_000).catch(() => undefined);
      const sound = findSounds('squish', { limit: 1, maxSeconds: 4 })[0]?.soundId;
      const clips = { 'AppleBody.wobble': { ...motionClip(body), ...(sound ? { sound, volume: 0.7 } : {}) } };
      const wrote = await ctx.execStudioOp({ op: 'edit_script', path: `${model}.AppleAnimations`, source: `-- What ${name} does, played by AppleAnimate. Written by Apple; edit freely.\nreturn ${luau(clips)}\n`, create: { className: 'ModuleScript', parent: model } }, 60_000);
      const player = wrote.ok ? await installAnimationPlayer(ctx) : 'animations not written';
      moves = wrote.ok && !player;
      if (!moves) problems.push(`motion: ${String(wrote.ok ? player : wrote.error).slice(0, 160)}`);
    } else problems.push(`rig: ${String(motor.error ?? '').slice(0, 160)}`);
  } else problems.push(`body: ${String(madeBody.error ?? '').slice(0, 160)}`);

  if (moves) {
    const hud = await writeObjectHud(ctx, name, { counter: 'Presses', hint: 'Click it!' });
    if (hud) problems.push(hud);
  }
  await ctx.execStudioOp({ op: 'camera_focus', path: model }, 10_000).catch(() => undefined);
  const { TOOLS } = await import('./tools');
  await TOOLS.set_mood!.run(ctx, { mood: 'studded' }).catch(() => undefined);
  await ctx.objectMemory?.save({ name, request: pending.request, library: { source: pick.source, name: pick.name, game: pick.game, gameId: pick.gameId, path: pick.path, id: pick.id }, size: [sx, sy, sz] }).catch(() => undefined);

  const what = objectWords(pending.request).join(' ') || 'object';
  const longest = Math.round(Math.max(sx, sy, sz));
  const from_ = pick.source === 'owner' ? `your library ("${pick.name}"${pick.game ? ` from ${pick.game}` : ''})` : `the Roblox Creator Store ("${pick.name}")`;
  const forUser = [
    `Your ${what} is a ready-made model from ${from_}, about ${longest} studs, on a stage in front of the spawn. Its own scripts and sounds were left out.`,
    moves ? 'Click it and it wobbles with a squish. A counter on your screen counts every press.' : '',
  ].filter(Boolean).join('\n');
  return {
    changed: true, projectMutated: true, object: model, library: { source: pick.source, name: pick.name, ...(pick.game ? { game: pick.game } : {}) },
    size: [Math.round(sx), Math.round(sy), Math.round(sz)], moving: moves ? 1 : 0, ...(problems.length ? { problems } : {}),
    built: `a ready-made ${pick.name} from ${pick.source === 'owner' ? 'the owner library' : 'the Creator Store'}, scripts and sounds left out, on a stage${moves ? '; clicking it makes it wobble with a squish; a counter and a hint are on the player\'s screen' : ''}`,
    forUser,
  };
}

/**
 * The number on an object's counter after a play check walked the player into it (its "${name}HUD" screen's Value),
 * or undefined when the screen was not read. Pure.
 */
export function pressesSeen(detail: unknown, name: string): number | undefined {
  const sees = (detail as { playerSees?: unknown } | null)?.playerSees;
  if (typeof sees !== 'string') return undefined;
  const screen = sees.split(' | ').find((line) => line.includes(`ScreenGui "${name}HUD" (enabled)`));
  const value = screen ? /"(\d+)" \[Value\]/.exec(screen) : null;
  return value ? Number(value[1]) : undefined;
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

/**
 * "Make it 100x cooler" on a ready-made object (test 3, 2026-10-01; library objects 2026-10-02): the same kit
 * build_object adds, put around the model that is there instead of rebuilding it — the library's sparkle shimmer and a
 * warm light on its body, four neon orbs circling above it on a spinning hub, and a lit stage rim. No model call.
 */
export async function coolLibraryObject(ctx: AgentCtx, spec: { name?: unknown; request?: unknown }) {
  const name = String(spec.name ?? '');
  if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(name)) return { error: 'The object is not recorded.' };
  const model = `game.Workspace.${name}`;
  const body = `${model}.AppleBody`;
  // What an earlier "cooler" added goes first, then the object is measured by its own body: measured with an earlier
  // crown still on, the new crown stood on top of the old one, 3 studs over the butter (live 2026-10-02).
  for (const path of [`${model}Cool`, `${model}.Crown`, `${body}.CrownRoot`, `${body}.SparkleShimmerFX`, `${body}.CoolLight`, `${body}.LevelUpAuraFX`, `${model}.Glow`]) {
    await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  }
  const b = await bounds(ctx.execStudioOp, body) ?? await bounds(ctx.execStudioOp, model);
  if (!b) return { error: `${name} is no longer in the place.` };
  const problems: string[] = [];
  // A few twinkles and a soft light, never a haze: at scale 2.5, rate 2 with the level-up aura on top, the butter turned
  // into a white blob a few seconds into Play (live 2026-10-02), and the model the user picked could not be seen.
  const fx = vfxPlan('sparkle_shimmer', { path: body, className: 'Part' }, { scale: 1.5, rate: 0.5 });
  const light = { className: 'PointLight', name: 'CoolLight', parent: body, props: { Brightness: { t: 'number' as const, v: 1 }, Range: { t: 'number' as const, v: 12 }, Color: { t: 'Color3' as const, v: [1, 0.85, 0.5] as [number, number, number] } } };
  const sparkled = await ctx.execStudioOp({ op: 'create_instances', items: [...('error' in fx ? [] : fx.items), light] }, 60_000).catch(() => null);
  if (!sparkled?.ok) problems.push('sparkles');

  // The orbs: their own small model, a hub spinning on a loop with four neon balls riding it.
  const [cx, , cz] = b.center, y = b.bottomY + b.size[1] + 3;
  const r = Math.max(4, Math.min(12, Math.max(b.size[0], b.size[2]) / 2));
  const cool = `${model}Cool`;
  const orbs = ([[r, 0], [0, r], [-r, 0], [0, -r]] as [number, number][]).map(([dx, dz], i) => ({
    className: 'Part', name: `CoolOrb${i + 1}`,
    props: { Shape: { t: 'EnumItem', v: 'Enum.PartType.Ball' }, Size: [1.8, 1.8, 1.8], Position: [cx + dx, y, cz + dz], Anchored: false, CanCollide: false, Color: COOL_ORB_COLOURS[i]!, Material: 'Neon' },
  }) as InstanceSpecLite);
  const made = await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Model', name: `${name}Cool`, children: [
    { className: 'Part', name: 'Root', props: { Size: [1, 1, 1], Position: [cx, y, cz], Anchored: true, CanCollide: false, CanQuery: false, Transparency: 1 } },
    { className: 'Part', name: 'CoolHalo', props: { Size: [1, 1, 1], Position: [cx, y, cz], Anchored: false, CanCollide: false, CanQuery: false, Transparency: 1 } },
    ...orbs,
  ] }), parent: 'game.Workspace' }] }, 30_000).catch(() => null);
  let spins = false;
  if (made?.ok) {
    const names = ['CoolHalo', 'CoolOrb1', 'CoolOrb2', 'CoolOrb3', 'CoolOrb4'];
    const rigged = await ctx.execStudioOp({ op: 'rig_model', root: `${cool}.Root`, parts: names.map((n) => `${cool}.${n}`), joint: 'motor' }, 60_000);
    if (rigged.ok) {
      // Each orb hinges at the hub, so the same turn carries it round in a circle.
      for (const n of names.slice(1)) await ctx.execStudioOp({ op: 'set_joint_pivot', joint: `${cool}.Root.${n}`, at: [cx, y, cz] }, 20_000).catch(() => undefined);
      const halo: ObjectPart = { name: 'CoolHalo', shape: 'block', size: [1, 1, 1], at: [0, 0, 0], color: '#ffffff', move: { as: 'spin', on: 'loop' } };
      const clips = { 'CoolHalo.spin': withRiders(motionClip(halo), 'CoolHalo', names.slice(1)) };
      const wrote = await ctx.execStudioOp({ op: 'edit_script', path: `${cool}.AppleAnimations`, source: `-- ${name}'s orbs, played by AppleAnimate. Written by Apple; edit freely.\nreturn ${luau(clips)}\n`, create: { className: 'ModuleScript', parent: cool } }, 60_000);
      spins = wrote.ok && !(await installAnimationPlayer(ctx));
    }
  }
  if (!spins) problems.push('orbs');

  // A real crown from the library on top (library first, owner 2026-10-02), welded to the body so it wobbles with it:
  // the crown's parts to its own invisible root, that root to the body (a second weld pass over the whole object would
  // also join the motor's root and break the rig). Scripts and sounds out, as for every library piece.
  let crowned = false;
  const crownPick = (await (async () => {
    // "crown" first: the library's GoldenCrown (Fighters) reads silver and green; the plain Crown is a modelled one.
    for (const q of ['crown', 'golden crown']) {
      const hit = rankCatalog(await catalog(ctx, q), q, 1)[0];
      if (hit) return hit;
    }
    return undefined;
  })());
  if (crownPick?.gameId && crownPick.path && b.size.every((n) => n > 0)) {
    const folderPath = `${PARTS_FOLDER}.AppleCrown`;
    await ctx.execStudioOp({ op: 'delete_instances', paths: [folderPath] }, 20_000).catch(() => undefined);
    const parts = await ctx.execStudioOp({ op: 'get_instance', path: PARTS_FOLDER }, 10_000).catch(() => null);
    const madeFolder = !parts?.ok;
    if (madeFolder) await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleParts' }), parent: 'game.ServerStorage' }] }, 20_000).catch(() => undefined);
    await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Folder', name: 'AppleCrown' }), parent: PARTS_FOLDER }] }, 20_000).catch(() => undefined);
    const imported = await ctx.execStudioOp({ op: 'import_owner_library', gameId: crownPick.gameId, path: crownPick.path, mode: 'self', parent: folderPath, applyServiceProperties: false, studioData: true }, LIBRARY_IMPORT_MS).catch(() => null);
    if (imported?.ok) {
      await ctx.execStudioOp({ op: 'strip_descendants', root: folderPath, classes: ['LocalScript', 'Script', 'ModuleScript', 'Sound'] }, 30_000).catch(() => undefined);
      await stripLeftovers(ctx, folderPath);
      // Big enough to read from the spawn (a 60% crown on the 7-stud butter was a speck, 90% still a thin ring): a little
      // over the short side, never more than half the long one.
      const crownWidth = Math.max(5, Math.min(Math.max(b.size[0], b.size[2]) / 2, Math.min(b.size[0], b.size[2]) * 1.1));
      const top: V3 = [cx, b.bottomY + b.size[1] - 0.2, cz];
      const placed = await ctx.execStudioOp({ op: 'place_copies', items: [{ from: folderPath, parent: model, name: 'Crown', at: top, length: crownWidth }] }, 60_000).catch(() => null);
      const cb = placed?.ok ? await bounds(ctx.execStudioOp, `${model}.Crown`) : null;
      if (cb) {
        const root = await ctx.execStudioOp({ op: 'create_instances', items: [{ ...typed({ className: 'Part', name: 'CrownRoot', props: { Size: [1, 1, 1], Position: cb.center, Anchored: true, CanCollide: false, CanQuery: false, CanTouch: false, Transparency: 1 } }), parent: `${model}.Crown` }] }, 20_000);
        const inner = root.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.Crown.CrownRoot`, joint: 'weld' }, 60_000) : root;
        const outer = inner.ok ? await ctx.execStudioOp({ op: 'rig_model', root: `${model}.AppleBody`, parts: [`${model}.Crown.CrownRoot`], joint: 'weld' }, 60_000) : inner;
        // rig_model anchors its root; the body is moved by its motor, so it is let go again.
        await ctx.execStudioOp({ op: 'set_props', path: `${model}.AppleBody`, props: { Anchored: { t: 'bool', v: false } } }, 20_000).catch(() => undefined);
        crowned = outer.ok;
      }
      if (!crowned) await ctx.execStudioOp({ op: 'delete_instances', paths: [`${model}.Crown`] }, 20_000).catch(() => undefined);
    }
    await ctx.execStudioOp({ op: 'delete_instances', paths: [madeFolder ? PARTS_FOLDER : folderPath] }, 20_000).catch(() => undefined);
  }

  // A glow outline on the whole model (the library's preset). No level-up aura: it is a few-second burst for a player,
  // and left on it was a column of light that washed the object out.
  const glow = vfxPlan('egg_glow', { path: model, className: 'Model' });
  const shone = 'error' in glow ? null : await ctx.execStudioOp({ op: 'create_instances', items: glow.items }, 60_000).catch(() => null);
  // An outline only: the preset's fill washed the model out and hid its own print (the butter's "BUTTER", live 2026-10-02).
  if (shone?.ok) await ctx.execStudioOp({ op: 'set_props', path: `${model}.Glow`, props: { FillTransparency: { t: 'number', v: 1 } } }, 20_000).catch(() => undefined);

  await ctx.execStudioOp({ op: 'set_props', path: `game.Workspace.${name}Stage.Rim`, props: { Color: { t: 'Color3', v: [0.71, 0.3, 1] }, Material: { t: 'EnumItem', v: 'Enum.Material.Neon' } } }, 20_000).catch(() => undefined);
  await ctx.objectMemory?.save({ ...spec, cool: true }).catch(() => undefined);
  const what = objectWords(String(spec.request ?? '')).join(' ') || 'object';
  const added = [crowned ? `it wears a crown from your library ("${crownPick!.name}"${crownPick!.game ? ` from ${crownPick!.game}` : ''})` : '',
    sparkled?.ok ? 'it sparkles' : '', shone?.ok ? 'it glows' : '',
    spins ? 'four neon orbs circle above it' : '', 'the rim of its stage lights up'].filter(Boolean);
  return {
    changed: true, projectMutated: true, object: model, ...(problems.length ? { problems } : {}),
    forUser: `Your ${what} is cooler now: ${added.slice(0, -1).join(', ')}${added.length > 1 ? ' and ' : ''}${added.at(-1)}. The model itself is the same one you picked.`,
  };
}
