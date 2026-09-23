// D-MODELLIB-2: Apple never makes a model from scratch.
//
// Owner order (2026-09-24): "NEVER generate from scratch models and 3d — only plain simple parts
// like floor etc. Search the library for the perfect model/kit instead, same for everything."
//
// So the generic writers may still lay plain structure — a floor, a path, a wall, a pad, a plaza —
// but a prop (a tree, a fence, a stall, a shop, a lamp, a chest, a pet, a coin...) comes from
// find_library_model + insert_library_model, never from Parts assembled by hand and never from an
// AI 3D generator. Three shapes are refused, each one a way the gauntlet saw a hand-made prop:
//   1. a Model assembled from Parts in one create_instances batch (a prop is a group of parts);
//   2. a part, Folder or Model NAMED as a prop, or inside one named as a prop;
//   3. a ball-shaped part, a MeshPart or a SpecialMesh: none of them is floor, wall or path.
// Luau is held to the same rule on its creations (run_luau only: a game script that spawns a
// projectile or clones a template at runtime is gameplay, not modelling).

export const MODEL_DECISION = 'D-MODELLIB-2';

const BASEPARTS = new Set(['Part', 'WedgePart', 'CornerWedgePart', 'TrussPart', 'MeshPart', 'UnionOperation', 'Seat', 'VehicleSeat', 'SpawnLocation']);
const HAND_MESH = new Set(['MeshPart', 'SpecialMesh', 'BlockMesh', 'CylinderMesh', 'UnionOperation']);

/** Things that are props, never plain structure. Singular; plurals are folded before the lookup. */
const PROP_WORDS = new Set([
  'tree', 'trunk', 'leaf', 'leave', 'foliage', 'canopy', 'branch', 'bush', 'shrub', 'hedge', 'flower', 'plant', 'mushroom', 'cactus',
  'palm', 'pine', 'oak', 'rock', 'boulder', 'pebble', 'cliff', 'log', 'stump', 'cloud',
  'fence', 'railing', 'gate', 'stall', 'booth', 'kiosk', 'shop', 'store', 'house', 'building', 'hut', 'cabin', 'tower', 'castle',
  'roof', 'chimney', 'awning', 'canopy', 'door', 'window', 'lamp', 'lamppost', 'streetlight', 'lantern', 'torch', 'light', 'bench', 'chair',
  'table', 'desk', 'sofa', 'bed', 'shelf', 'counter', 'sign', 'signpost', 'crate', 'barrel', 'chest', 'treasure', 'box', 'statue',
  'fountain', 'well', 'cart', 'wagon', 'car', 'vehicle', 'wheel', 'tire', 'boat', 'ship', 'plane', 'pet', 'egg', 'coin', 'gem', 'crystal',
  'orb', 'trophy', 'leaderboard', 'scoreboard', 'podium', 'umbrella', 'tent', 'flag', 'banner', 'vending', 'machine', 'dropper',
  'portal', 'npc', 'character', 'dummy', 'weapon', 'sword', 'gun', 'tool', 'pickup', 'decoration', 'decor', 'prop',
]);

/** "PalmTree_3" -> ["palm", "tree"], "market-stalls" -> ["market", "stall"]. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)
    .map((w) => (w.length > 3 && w.endsWith('es') && PROP_WORDS.has(w.slice(0, -2)) ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w));
}

/** A part named for what it does (ShopTrigger, CoinPad, EggHitbox) is gameplay structure, not a prop. */
const FUNCTION_WORDS = new Set(['trigger', 'hitbox', 'zone', 'pad', 'button', 'touch', 'region', 'collider', 'spawn', 'checkpoint', 'kill', 'lava', 'floor', 'ground', 'baseplate', 'path', 'road', 'wall', 'platform', 'plaza', 'stage']);

export function propWordIn(name: unknown): string | null {
  if (typeof name !== 'string') return null;
  const ws = words(name);
  if (ws.some((w) => FUNCTION_WORDS.has(w))) return null;
  return ws.find((w) => PROP_WORDS.has(w)) ?? null;
}

const lastSegment = (path: unknown) => (typeof path === 'string' ? path.split('.').pop() : undefined);

const SUGGEST =
  'Instead: find_library_model with the plain noun (e.g. "oak tree", "wooden fence", "market stall", "shop building"), then insert_library_model with the id it returns; set its position and scale afterwards. ' +
  'Plain structure is still yours to build: floors, paths, walls, pads, plazas and baseplates as plain Block or Cylinder Parts, named for what they are (Floor, Path, Plaza, RebirthPad), grouped in a Folder rather than a Model.';

export interface ModelRefusal {
  error: string;
  refused: string[];
}

function refusal(found: string[]): ModelRefusal {
  const unique = [...new Set(found)].slice(0, 8);
  return {
    error: `Refused (${MODEL_DECISION}): Apple never builds a model from scratch. ${unique.join('; ')}. ${SUGGEST} Nothing was sent to Studio.`,
    refused: unique,
  };
}

function shapeIsBall(props: unknown): boolean {
  if (!props || typeof props !== 'object') return false;
  const shape = (props as Record<string, unknown>).Shape;
  const v = shape && typeof shape === 'object' ? (shape as { v?: unknown }).v : shape;
  return typeof v === 'string' ? /ball/i.test(v) : v === 0;
}

/** Does this create_instances item hold a BasePart anywhere below it? */
function holdsParts(item: Record<string, unknown>): boolean {
  const kids = Array.isArray(item.children) ? (item.children as unknown[]) : [];
  return kids.some((k) => !!k && typeof k === 'object' && (BASEPARTS.has(String((k as Record<string, unknown>).className)) || holdsParts(k as Record<string, unknown>)));
}

/** A create_instances payload that makes a prop by hand, or null. */
export function refuseHandMadeModel(items: unknown): ModelRefusal | null {
  const found: string[] = [];
  const walk = (list: unknown, ancestorProp: string | null) => {
    if (!Array.isArray(list)) return;
    for (const raw of list) {
      if (!raw || typeof raw !== 'object') continue;
      const item = raw as Record<string, unknown>;
      const cls = String(item.className ?? '');
      const name = typeof item.name === 'string' ? item.name : cls;
      const named = typeof item.name === 'string' ? item.name : '';
      const functional = named !== '' && propWordIn(named) === null && words(named).some((w) => FUNCTION_WORDS.has(w));
      const prop = functional ? null : (propWordIn(item.name) ?? propWordIn(lastSegment(item.parent)) ?? ancestorProp);
      if (cls === 'Model' && holdsParts(item)) found.push(`a Model "${name}" assembled from Parts`);
      else if (HAND_MESH.has(cls)) found.push(`a ${cls} "${name}" (a hand-made mesh)`);
      else if (BASEPARTS.has(cls) && shapeIsBall(item.props)) found.push(`a ball-shaped ${cls} "${name}" (a ball is never floor, wall or path)`);
      else if (prop && (BASEPARTS.has(cls) || ((cls === 'Model' || cls === 'Folder') && holdsParts(item)))) found.push(`a ${cls} "${name}" that makes a ${prop}`);
      walk(item.children, prop);
    }
  };
  walk(items, null);
  return found.length ? refusal(found) : null;
}

const NEW_CLASS = /\bInstance\s*(?:\.\s*new|\[\s*(["'])new\1\s*\])\s*(?:\(\s*)?(?:(["'])([A-Za-z]\w*)\2|\[(=*)\[([A-Za-z]\w*)\]\4\])/g;
const NAME_SET = /\.\s*Name\s*=\s*(["'])([^"'\n]{1,80})\1/g;
const BALL = /Enum\s*\.\s*PartType\s*\.\s*Ball\b|\.\s*Shape\s*=\s*(["'])Ball\1/;

/** Luau (comments already stripped by the caller) that builds a prop by hand, or null. */
export function refuseHandMadeModelLuau(variants: readonly string[]): ModelRefusal | null {
  for (const code of variants) {
    const made = [...code.matchAll(NEW_CLASS)].map((m) => m[3] ?? m[5] ?? '');
    const parts = made.filter((c) => BASEPARTS.has(c));
    const found: string[] = [];
    for (const c of made) if (HAND_MESH.has(c)) found.push(`Instance.new("${c}") (a hand-made mesh)`);
    if (parts.length && made.includes('Model')) found.push('a Model assembled from Instance.new parts');
    if (parts.length && BALL.test(code)) found.push('a ball-shaped part');
    if (parts.length) {
      for (const m of code.matchAll(NAME_SET)) {
        const w = propWordIn(m[2]);
        if (w) found.push(`a part named "${m[2]}" that makes a ${w}`);
      }
    }
    if (found.length) return refusal(found);
  }
  return null;
}

/** The AI 3D generators are closed to the agent: 3D comes from the library. */
export function refuseGeneratedModel(tool: string): ModelRefusal {
  return refusal([`${tool} generates a 3D model from scratch`]);
}
