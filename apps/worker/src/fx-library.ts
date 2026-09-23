// The sound and effect library (D-FXLIB-1): what find_sound / insert_sound / play_library_sound and
// find_vfx / insert_vfx answer from, and the rule that sends every hand-made Sound or particle to
// them.
//
// SOUNDS are Roblox audio asset ids that Roblox's own Creator Store search returned (licensed
// partner audio first, then community uploads), compiled into packages/asset-library/sfx/index.json
// by build-fx-manifest.mjs. They are REAL ids, found rather than guessed: the silent-failure worry
// in sfx.ts and sound-design.ts is about invented ids, which this library never hands out. A
// SoundId the model types itself is still refused unless it is one of these, or one a search tool
// of this run returned.
//
// EFFECTS are the presets in packages/asset-library/vfx/presets.mjs: a small tree of Attachment,
// ParticleEmitter, Beam, Trail, Highlight and PointLight with every visual property set, textured
// with particle textures that ship inside every Roblox client. insert_vfx builds them through the
// plugin's ordinary create_instances / set_props, and links beams and trails to their attachments
// afterwards, because a create call cannot reference a sibling it is creating.
import sfx from '../../../packages/asset-library/sfx/index.json';
import vfx from '../../../packages/asset-library/vfx/index.json';
import type { GatewayToolDef, InstanceSpec, PropValue, StudioOp } from '@golem/shared';
import type { LibraryRule } from './library-guard';
import type { OpCall } from './phase-a-tools';

type Args = Record<string, unknown>;
type SoundRow = [number, string, string, number | null, string];

// --- sounds ------------------------------------------------------------------------------------

const ROWS = sfx.rows as SoundRow[];
const CATEGORY_WORDS = sfx.categoryWords as Record<string, string[]>;
export const SOUND_CATEGORIES: readonly string[] = sfx.categories;
let byId: Map<number, SoundRow> | null = null;

const STOP = new Set(['a', 'an', 'the', 'of', 'for', 'and', 'or', 'sound', 'sounds', 'sfx', 'effect', 'noise', 'audio', 'when', 'with', 'to', 'on', 'in']);

/** "Coin_Pickup-02" -> coin, pickup, 02 (the same split the library build uses). */
export function tokensOf(s: string): string[] {
  return String(s ?? '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function hasPhrase(tokens: string[], phrase: string): boolean {
  const words = phrase.split(' ');
  for (let i = 0; i + words.length <= tokens.length; i++) if (words.every((w, j) => tokens[i + j] === w)) return true;
  return false;
}

/** The categories a query names, by the same words that categorised the rows. */
function queryCategories(tokens: string[]): Set<string> {
  const out = new Set<string>();
  for (const [cat, words] of Object.entries(CATEGORY_WORDS)) if (words.some((w) => hasPhrase(tokens, w))) out.add(cat);
  for (const t of tokens) if (SOUND_CATEGORIES.includes(t)) out.add(t);
  if (tokens.includes('music') || tokens.includes('song') || tokens.includes('soundtrack')) out.add('music').add('music_loop');
  return out;
}

export interface SoundHit {
  assetId: number;
  soundId: string;
  name: string;
  category: string;
  seconds: number | null;
  licence: string;
}

function hit(row: SoundRow): SoundHit {
  return {
    assetId: row[0],
    soundId: `rbxassetid://${row[0]}`,
    name: row[1],
    category: row[2],
    seconds: row[3],
    licence: row[4] === 'L' ? 'Roblox licensed partner audio (cleared for every experience)' : 'Roblox Creator Store free audio',
  };
}

export function librarySound(assetId: number): SoundHit | null {
  byId ??= new Map(ROWS.map((r) => [r[0], r]));
  const row = byId.get(assetId);
  return row ? hit(row) : null;
}

/** Library sounds for plain words. Ties keep the library's own order: licensed first, then by likes. */
const LONG_KINDS = new Set(['music', 'music_loop', 'ambient', 'nature', 'wind', 'rain', 'crowd']);

export function findSounds(query: string, opts: { category?: string; limit?: number; maxSeconds?: number } = {}): SoundHit[] {
  const tokens = tokensOf(query).filter((t) => !STOP.has(t));
  const cats = opts.category ? new Set([opts.category]) : queryCategories(tokens);
  const limit = Math.max(1, Math.min(40, Math.floor(opts.limit ?? 8)));
  // A click, a coin or a hit is a one-shot: a long row is a worse answer unless a long kind was asked.
  const oneShot = ![...cats].some((c) => LONG_KINDS.has(c));
  const scored: Array<[number, number]> = [];
  ROWS.forEach((row, index) => {
    if (opts.category && row[2] !== opts.category) return;
    if (opts.maxSeconds !== undefined && row[3] !== null && row[3] > opts.maxSeconds) return;
    const name = tokensOf(row[1]);
    let score = cats.has(row[2]) ? 3 : 0;
    for (const t of tokens) {
      if (name.includes(t)) score += 4;
      else if (t.length >= 4 && name.some((w) => w.startsWith(t))) score += 2;
    }
    if (score > 0 && oneShot && row[3] !== null && row[3] > 6) score -= 3;
    if (score > 0 || (!tokens.length && opts.category)) scored.push([score, index]);
  });
  scored.sort((x, y) => y[0] - x[0] || x[1] - y[1]);
  return scored.slice(0, limit).map(([, index]) => hit(ROWS[index]!));
}

/** The digits of `rbxassetid://123`, or of a bare 123, or null. */
export function soundAssetId(value: unknown): number | null {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : '';
  const m = /^(?:rbxassetid:\/\/)?(\d{1,20})$/.exec(text);
  return m ? Number(m[1]) : null;
}

/**
 * A SoundId written by hand (set_properties): allowed only for a library id, or an id a search tool
 * of this run returned. Anything else plays silence without an error, which is why it is refused.
 */
export function refuseSoundId(props: Record<string, unknown> | undefined, discovered?: ReadonlySet<number>): { error: string } | null {
  if (!props || !('SoundId' in props)) return null;
  const raw = props.SoundId;
  const value = raw && typeof raw === 'object' && 'v' in (raw as Record<string, unknown>) ? (raw as { v: unknown }).v : raw;
  if (value === '') return null;
  const id = soundAssetId(value);
  if (id !== null && (librarySound(id) || discovered?.has(id))) return null;
  return {
    error: `Refused (D-FXLIB-1): SoundId ${JSON.stringify(value)} is not a sound from Apple's library. An id that does not exist plays silence and reports nothing, so sounds come from find_sound / insert_sound({"query":"<what it should sound like>","parent":"<path>"}). Nothing was changed.`,
  };
}

// --- effects -----------------------------------------------------------------------------------

interface PresetPart {
  className: string;
  name: string;
  props: Record<string, PropValue>;
  emit?: number;
  packTexture?: string;
  under?: string;
  links?: [string, string];
}
interface Preset {
  name: string;
  category: string;
  kind: 'burst' | 'loop' | 'beam' | 'trail' | 'area' | 'highlight';
  summary: string;
  use: string;
  attachments?: Array<{ name: string; position: [number, number, number] }>;
  parts: PresetPart[];
}

export const PRESETS = vfx.presets as unknown as Preset[];
export const PRESET_NAMES: string[] = PRESETS.map((p) => p.name);
const VFX_WORDS = vfx.categoryWords as Record<string, string[]>;
/** Engine texture paths a preset may name; the plugin's CONTENT_PROPERTY holds the same list. */
export const ENGINE_TEXTURE_PATHS: string[] = Object.values(vfx.engineTextures as Record<string, string>);

export function findVfx(query: string): Array<Pick<Preset, 'name' | 'category' | 'kind' | 'summary' | 'use'>> {
  const tokens = tokensOf(query).filter((t) => !STOP.has(t));
  const cats = new Set(Object.entries(VFX_WORDS).filter(([, words]) => words.some((w) => hasPhrase(tokens, w))).map(([c]) => c));
  const scored = PRESETS.map((p, index) => {
    const words = new Set(tokensOf(`${p.name} ${p.category} ${p.summary} ${p.use}`));
    let score = cats.has(p.category) ? 5 : 0;
    for (const t of tokens) if (words.has(t)) score += 2;
    return { p, score, index };
  });
  const hits = tokens.length ? scored.filter((s) => s.score > 0) : scored;
  hits.sort((x, y) => y.score - x.score || x.index - y.index);
  return hits.map(({ p }) => ({ name: p.name, category: p.category, kind: p.kind, summary: p.summary, use: p.use }));
}

const BASE_PARTS = new Set(['Part', 'MeshPart', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'UnionOperation', 'SpawnLocation', 'Seat', 'VehicleSeat']);
const pascal = (name: string) => name.split('_').map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');

export interface VfxOptions {
  /** One colour for the whole effect, 0-255 RGB. */
  color?: [number, number, number];
  /** Size multiplier, 0.25 to 4. */
  scale?: number;
  /** Emission-rate multiplier for looping emitters, 0.1 to 4. */
  rate?: number;
  /** "loop" keeps a one-shot effect running, to preview it. */
  mode?: 'placed' | 'loop';
}

export interface VfxPlan {
  items: InstanceSpec[];
  links: Array<{ path: string; props: Record<string, PropValue> }>;
  created: string[];
  skipped: string[];
}

function tuned(part: PresetPart, preset: Preset, o: VfxOptions): Record<string, PropValue> {
  const props: Record<string, PropValue> = { ...part.props };
  if (o.color) {
    const rgb = o.color.map((x) => Math.round(Math.max(0, Math.min(255, x))) / 255) as [number, number, number];
    if (part.className === 'Highlight') { props.FillColor = { t: 'Color3', v: rgb }; props.OutlineColor = { t: 'Color3', v: rgb }; }
    else if (part.className === 'PointLight') props.Color = { t: 'Color3', v: rgb };
    else props.Color = { t: 'ColorSequence', v: [[0, rgb], [1, rgb]] };
  }
  const k = o.scale === undefined ? 1 : Math.max(0.25, Math.min(4, o.scale));
  if (k !== 1) {
    const size = props.Size;
    if (size && size.t === 'NumberSequence') props.Size = { t: 'NumberSequence', v: size.v.map(([t, v, env]) => [t, v * k, (env ?? 0) * k]) };
    for (const key of ['Width0', 'Width1', 'Range'] as const) {
      const p = props[key];
      if (p && p.t === 'number') props[key] = { t: 'number', v: key === 'Range' ? Math.min(60, p.v * k) : p.v * k };
    }
  }
  if (part.className === 'ParticleEmitter') {
    const rate = props.Rate && props.Rate.t === 'number' ? props.Rate.v : 0;
    if (part.emit !== undefined) {
      // One-shot: off until the game fires it with emitter:Emit(emitter:GetAttribute("AppleEmitCount")).
      if (o.mode === 'loop') props.Rate = { t: 'number', v: Math.max(1, part.emit) };
      else props.Enabled = { t: 'bool', v: false };
    } else if (o.rate !== undefined) {
      props.Rate = { t: 'number', v: rate * Math.max(0.1, Math.min(4, o.rate)) };
    }
  }
  void preset;
  return props;
}

/**
 * The instances one preset becomes on `target` (a node from get_tree: its path and class).
 *
 * - loop / burst / highlight on a part: an Attachment "<Preset>FX" holding the emitters and light;
 *   a Highlight goes on the target itself. On an Attachment, the parts go straight under it.
 * - beam / trail on a part: the preset's attachments on the part (the beams and trails inside the
 *   first one), linked afterwards.
 * - area (snow, rain, fireflies): the emitters on the part, whose whole face emits; on Workspace or a
 *   Folder, first an invisible anchored host part over the area.
 */
export function vfxPlan(presetName: string, target: { path: string; className: string }, o: VfxOptions = {}): VfxPlan | { error: string } {
  const preset = PRESETS.find((p) => p.name === presetName);
  if (!preset) return { error: `unknown preset "${presetName}". Choose one of: ${PRESET_NAMES.join(', ')}.` };
  const mark = (extra: Record<string, PropValue> = {}): Record<string, PropValue> => ({ AppleVfx: { t: 'string', v: preset.name }, ...extra });
  const spec = (part: PresetPart): Omit<InstanceSpec, 'parent'> => ({
    className: part.className,
    name: part.name,
    props: tuned(part, preset, o),
    attributes: mark(part.emit !== undefined ? { AppleEmitCount: { t: 'number', v: part.emit } } : {}),
  });
  const P = pascal(preset.name);
  const isPart = BASE_PARTS.has(target.className);
  const isAttachment = target.className === 'Attachment';
  const plan: VfxPlan = { items: [], links: [], created: [], skipped: [] };
  const top = (item: InstanceSpec) => { plan.items.push(item); plan.created.push(`${item.parent}.${item.name}`); };

  if (preset.kind === 'beam' || preset.kind === 'trail') {
    if (!isPart) return { error: `${preset.name} needs a part to stand on (its attachments are placed on it); ${target.path} is a ${target.className}.` };
    const attachments = preset.attachments ?? [];
    const pathOf = (name: string) => `${target.path}.${P}${name}`;
    for (const [i, a] of attachments.entries()) {
      const inside = preset.parts.filter((part) => (part.under ? part.under === a.name : i === 0));
      top({
        className: 'Attachment', name: `${P}${a.name}`, parent: target.path,
        props: { Position: { t: 'Vector3', v: a.position } }, attributes: mark(),
        children: inside.map(spec),
      });
    }
    for (const part of preset.parts) {
      if (!part.links) continue;
      const home = part.under ?? attachments[0]!.name;
      plan.links.push({
        path: `${pathOf(home)}.${part.name}`,
        props: { Attachment0: { t: 'Instance', v: pathOf(part.links[0]) }, Attachment1: { t: 'Instance', v: pathOf(part.links[1]) } },
      });
    }
    return plan;
  }

  if (preset.kind === 'area') {
    let host = target.path;
    if (!isPart) {
      if (target.className !== 'Workspace' && target.className !== 'Folder' && target.className !== 'Model') {
        return { error: `${preset.name} covers an area: target a large part over it, or Workspace / a Folder to get an invisible host part made. ${target.path} is a ${target.className}.` };
      }
      host = `${target.path}.${P}Area`;
      top({
        className: 'Part', name: `${P}Area`, parent: target.path, attributes: mark(),
        props: {
          Anchored: { t: 'bool', v: true }, CanCollide: { t: 'bool', v: false }, CanQuery: { t: 'bool', v: false }, CanTouch: { t: 'bool', v: false },
          Transparency: { t: 'number', v: 1 }, Size: { t: 'Vector3', v: preset.name === 'fireflies' ? [80, 8, 80] : [120, 1, 120] },
          Position: { t: 'Vector3', v: preset.name === 'fireflies' ? [0, 6, 0] : [0, 60, 0] },
        },
        children: preset.parts.map(spec),
      });
      return plan;
    }
    for (const part of preset.parts) top({ ...spec(part), parent: host });
    return plan;
  }

  // loop, burst, highlight
  const onTarget = preset.parts.filter((p) => p.under === 'target');
  const rest = preset.parts.filter((p) => p.under !== 'target');
  for (const part of onTarget) top({ ...spec(part), parent: target.path });
  if (!rest.length) return plan;
  if (isAttachment) {
    for (const part of rest) top({ ...spec(part), parent: target.path });
  } else if (isPart) {
    top({ className: 'Attachment', name: `${P}FX`, parent: target.path, attributes: mark(), children: rest.map(spec) });
  } else if (onTarget.length) {
    plan.skipped.push(...rest.map((p) => `${p.name} (${p.className}: a ${target.className} cannot emit; target a part inside it for the full effect)`));
  } else {
    return { error: `${preset.name} emits from a part or an Attachment; ${target.path} is a ${target.className}. Target a part (for a model, its main part).` };
  }
  return plan;
}

// --- the guard (D-UIONLY-1's shape, for sounds and effects) -------------------------------------

const FX_CLASSES: ReadonlySet<string> = new Set(['Sound', 'ParticleEmitter', 'Beam', 'Trail', 'Fire', 'Smoke', 'Sparkles']);

export const FX_RULE: LibraryRule = {
  decision: 'D-FXLIB-1',
  what: 'sound and particle effect',
  classes: FX_CLASSES,
  suggest: (cls) =>
    cls === 'Sound'
      ? 'insert_sound({"query":"<what it should sound like>","parent":"<part, or game.SoundService>"}) — a script then plays it with :Play() or :Clone()'
      : `insert_vfx({"preset":"<one of ${PRESET_NAMES.join(', ')}>","target":"<part>"}) — find_vfx lists them; a script fires a one-shot with emitter:Emit(emitter:GetAttribute("AppleEmitCount"))`,
};

// --- the tools ---------------------------------------------------------------------------------

function toolError(value: unknown): value is { error: unknown } {
  return !!value && typeof value === 'object' && 'error' in (value as Record<string, unknown>);
}
function decodeTagged(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const o = value as Record<string, unknown>;
  return typeof o.t === 'string' && ('v' in o || o.t === 'nil') ? (o.t === 'nil' ? null : o.v) : value;
}
type TreeNode = { path?: string; name?: string; class?: string; attributes?: Record<string, unknown>; children?: TreeNode[] };
async function readNode(call: OpCall, path: string): Promise<TreeNode | { error: unknown }> {
  const tree = await call({ op: 'get_tree', root: path, maxDepth: 1, maxNodes: 400 } as StudioOp);
  if (toolError(tree)) return tree;
  const root = tree && typeof tree === 'object' ? (tree as { root?: TreeNode }).root : undefined;
  return root && typeof root === 'object' ? root : { error: `Studio returned no tree for ${path}` };
}
/** Delete what an earlier call of the same tool left under `node` with `attribute` = `value`. */
async function clearPrevious(call: OpCall, node: TreeNode, attribute: string, value: unknown, name?: string): Promise<{ error: unknown } | number> {
  const previous = (node.children ?? [])
    .filter((c) => typeof c.path === 'string' && decodeTagged(c.attributes?.[attribute]) !== undefined && (name ? c.name === name : decodeTagged(c.attributes?.[attribute]) === value))
    .map((c) => c.path as string);
  if (!previous.length) return 0;
  const removed = await call({ op: 'delete_instances', paths: previous } as StudioOp);
  return toolError(removed) ? removed : previous.length;
}

function pickSound(a: Args, discovered?: ReadonlySet<number>): SoundHit | { error: string } {
  if (a.assetId !== undefined && a.assetId !== null && a.assetId !== '') {
    const id = soundAssetId(a.assetId);
    const found = id === null ? null : librarySound(id);
    if (found) return found;
    // An audio id a search tool of this run returned (search_assets): found by Roblox, not guessed.
    if (id !== null && discovered?.has(id)) return { assetId: id, soundId: `rbxassetid://${id}`, name: `Sound ${id}`, category: 'misc', seconds: null, licence: 'Roblox Creator Store audio found by search_assets this run' };
    return { error: `${JSON.stringify(a.assetId)} is not a sound in Apple's library. Use find_sound to pick one, or pass query instead.` };
  }
  const query = String(a.query ?? '').trim();
  if (!query) return { error: 'pass query (what it should sound like) or assetId (from find_sound)' };
  const top = findSounds(query, { limit: 1, category: a.category ? String(a.category) : undefined });
  return top[0] ?? { error: `no library sound matches "${query}". Try plainer words (e.g. "coin", "explosion", "door open").` };
}

export const findSound = {
  def: {
    name: 'find_sound',
    description:
      `Search Apple's sound library: ${ROWS.length.toLocaleString('en-US')} Roblox audio ids from Roblox's own Creator Store (licensed partner audio from Roblox, APM, ProSoundEffects and Monstercat first, then free community uploads) — every one plays in any experience, nothing to upload. ` +
      'Plain words ("coin pickup", "sword swing", "rebirth", "horror sting", "rain loop", "button click"); category narrows to one of: ' +
      `${SOUND_CATEGORIES.join(', ')}. Returns assetId, name, category and seconds. Put one in the place with insert_sound; hear it first with play_library_sound. Nothing is changed by this call.`,
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What it should sound like, e.g. "coin pickup" or "door creak".' },
        category: { type: 'string', enum: [...SOUND_CATEGORIES] },
        maxSeconds: { type: 'number', description: 'Only sounds at most this long (a UI click wants < 1).' },
        limit: { type: 'number', description: '1 to 40, default 8.' },
      },
      required: [],
    },
  } satisfies GatewayToolDef,
  run: (a: Args): unknown => {
    const query = String(a.query ?? '');
    const category = a.category ? String(a.category) : undefined;
    if (category && !SOUND_CATEGORIES.includes(category)) return { error: `unknown category "${category}". Choose one of: ${SOUND_CATEGORIES.join(', ')}.` };
    if (!query.trim() && !category) return { categories: SOUND_CATEGORIES, total: ROWS.length, hint: 'pass query or category' };
    const hits = findSounds(query, { category, limit: a.limit === undefined ? undefined : Number(a.limit), maxSeconds: a.maxSeconds === undefined ? undefined : Number(a.maxSeconds) });
    return { query, count: hits.length, sounds: hits };
  },
};

export const insertSound = {
  def: {
    name: 'insert_sound',
    description:
      'The ONLY way to put a Sound in the place (D-FXLIB-1): adds one library sound as a Sound instance, by query (the best match) or by assetId from find_sound. ' +
      'parent: a part for a sound heard from that spot (3D), or game.SoundService / game.ReplicatedStorage for a sound scripts play (UI clicks, rewards, music). ' +
      'looped for music and ambience; volume 0 to 1 (default 0.5). Re-inserting the same name under the same parent replaces it. ' +
      'Scripts play it by path (sound:Play(), or :Clone() it per use); creating a Sound any other way is refused.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What it should sound like; the best library match is used.' },
        assetId: { type: 'number', description: 'A library assetId from find_sound (instead of query).' },
        category: { type: 'string', enum: [...SOUND_CATEGORIES] },
        parent: { type: 'string', description: 'Where the Sound goes. Default game.SoundService.' },
        name: { type: 'string', description: 'Instance name, e.g. "CoinPickup". Default: from the sound\'s own name.' },
        looped: { type: 'boolean' },
        volume: { type: 'number', description: '0 to 1, default 0.5.' },
      },
      required: [],
    },
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args, discovered?: ReadonlySet<number>): Promise<unknown> => {
    const sound = pickSound(a, discovered);
    if ('error' in sound) return sound;
    const parent = String(a.parent ?? '').trim() || 'game.SoundService';
    const volume = a.volume === undefined ? 0.5 : Number(a.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) return { error: 'volume must be between 0 and 1' };
    const fallback = tokensOf(sound.name).slice(0, 4).map((w) => w[0]!.toUpperCase() + w.slice(1)).join('') || 'Sound';
    const name = String(a.name ?? '').trim() || (/^[A-Za-z]/.test(fallback) ? fallback : `Sfx${fallback}`);
    if (!/^[A-Za-z][A-Za-z0-9_]{0,59}$/.test(name)) return { error: 'name must be letters, digits and underscores, starting with a letter' };
    const node = await readNode(call, parent);
    if (toolError(node)) return node;
    const cleared = await clearPrevious(call, node, 'AppleSound', undefined, name);
    if (toolError(cleared)) return cleared;
    if ((node.children ?? []).some((c) => c.name === name && decodeTagged(c.attributes?.AppleSound) === undefined)) {
      return { error: `${parent}.${name} already exists and was not made by insert_sound; pass another name.` };
    }
    const created = await call({
      op: 'create_instances',
      items: [{
        className: 'Sound', name, parent,
        props: { SoundId: { t: 'string', v: sound.soundId }, Volume: { t: 'number', v: volume }, Looped: { t: 'bool', v: a.looped === true } },
        attributes: { AppleSound: { t: 'number', v: sound.assetId } },
      }],
    } as StudioOp);
    if (toolError(created)) return cleared ? { ...(created as Record<string, unknown>), projectMutated: true } : created;
    return { inserted: `${parent}.${name}`, sound, looped: a.looped === true, volume, replaced: cleared > 0 };
  },
};

export const playLibrarySound = {
  def: {
    name: 'play_library_sound',
    description:
      'Play one library sound out loud in Studio, for the person at the keyboard only (SoundService:PlayLocalSound). Nothing is added to the place. Use it to let them hear a choice before insert_sound, by query or by assetId from find_sound.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        assetId: { type: 'number' },
        category: { type: 'string', enum: [...SOUND_CATEGORIES] },
        volume: { type: 'number', description: '0 to 1, default 0.6.' },
      },
      required: [],
    },
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args, discovered?: ReadonlySet<number>): Promise<unknown> => {
    const sound = pickSound(a, discovered);
    if ('error' in sound) return sound;
    const volume = a.volume === undefined ? 0.6 : Number(a.volume);
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) return { error: 'volume must be between 0 and 1' };
    const played = await call({ op: 'preview_sound', soundId: sound.soundId, volume } as StudioOp);
    if (toolError(played)) return played;
    return { played: true, sound, volume };
  },
};

export const findVfxTool = {
  def: {
    name: 'find_vfx',
    description:
      `List Apple's Roblox effect presets that match plain words ("coin", "level up", "portal", "rain", "hit"). There are ${PRESETS.length}: ${PRESET_NAMES.join(', ')}. ` +
      'Each is a finished, art-directed ParticleEmitter / Beam / Trail / Highlight / light set with engine textures — nothing to upload. Returns name, kind (burst = one-shot, loop, beam, trail, area, highlight), what it is and where it goes. Put one in with insert_vfx. Nothing is changed by this call.',
    parameters: { type: 'object', properties: { query: { type: 'string' } }, required: [] },
  } satisfies GatewayToolDef,
  run: (a: Args): unknown => {
    const presets = findVfx(String(a.query ?? ''));
    return { count: presets.length, presets };
  },
};

export const insertVfx = {
  def: {
    name: 'insert_vfx',
    description:
      'The ONLY way to put particles, beams or trails in the place (D-FXLIB-1): builds one library effect preset on target. ' +
      `preset: ${PRESET_NAMES.join(', ')} (find_vfx describes each). target: the part it plays on (a player's HumanoidRootPart for auras, the egg for egg_glow); area effects (snow, rain, fireflies) take a big part or game.Workspace. ` +
      'One-shot presets (coin_burst, explosion, magic_hit, water_splash, confetti, pet_hatch, hit_sparks) are placed switched off; a script fires each emitter with emitter:Emit(emitter:GetAttribute("AppleEmitCount")). mode "loop" keeps a one-shot running so it can be seen in Studio. ' +
      'color [r,g,b] 0-255 recolours it, scale 0.25-4 resizes, rate 0.1-4 thins or thickens a looping one. Re-inserting the same preset on the same target replaces it. Creating a ParticleEmitter, Beam, Trail, Fire, Smoke or Sparkles any other way is refused.',
    parameters: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: PRESET_NAMES },
        target: { type: 'string', description: 'Path of the part (or Attachment, or Workspace for area effects), e.g. game.Workspace.Egg' },
        color: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 },
        scale: { type: 'number' },
        rate: { type: 'number' },
        mode: { type: 'string', enum: ['placed', 'loop'] },
      },
      required: ['preset', 'target'],
    },
  } satisfies GatewayToolDef,
  run: async (call: OpCall, a: Args): Promise<unknown> => {
    const target = String(a.target ?? a.path ?? '').trim();
    if (!target) return { error: 'target is required: the path of the part the effect plays on' };
    const color = Array.isArray(a.color) && a.color.length === 3 && a.color.every((x) => Number.isFinite(Number(x))) ? (a.color.map(Number) as [number, number, number]) : undefined;
    const node = await readNode(call, target);
    if (toolError(node)) return node;
    const plan = vfxPlan(String(a.preset ?? ''), { path: node.path ?? target, className: String(node.class ?? '') }, {
      color,
      scale: a.scale === undefined ? undefined : Number(a.scale),
      rate: a.rate === undefined ? undefined : Number(a.rate),
      mode: a.mode === 'loop' ? 'loop' : 'placed',
    });
    if ('error' in plan) return plan;
    const cleared = await clearPrevious(call, node, 'AppleVfx', String(a.preset));
    if (toolError(cleared)) return cleared;
    const created = await call({ op: 'create_instances', items: plan.items } as StudioOp);
    if (toolError(created)) return cleared ? { ...(created as Record<string, unknown>), projectMutated: true } : created;
    for (const link of plan.links) {
      const linked = await call({ op: 'set_props', path: link.path, props: link.props } as StudioOp);
      if (toolError(linked)) return { ...(linked as Record<string, unknown>), projectMutated: true, note: `the effect was created but ${link.path} could not be linked to its attachments` };
    }
    const preset = PRESETS.find((p) => p.name === a.preset)!;
    return {
      inserted: preset.name,
      kind: preset.kind,
      on: node.path ?? target,
      created: plan.created,
      ...(plan.skipped.length ? { skipped: plan.skipped } : {}),
      ...(preset.kind === 'burst' && a.mode !== 'loop' ? { fire: 'placed switched off: for each ParticleEmitter under it, emitter:Emit(emitter:GetAttribute("AppleEmitCount"))' } : {}),
      replaced: cleared > 0,
    };
  },
};
