/**
 * THE COMPOSER. A game is made from components, never by copying a whole world and cutting it down (owner, 2026-09-30).
 *
 * A Recipe says what the game is: its words, the library pieces it uses (bodies and costumes for its
 * creatures, the things players place, the props of its map) and the numbers of its systems. `composeSteps` turns a
 * Recipe into Steps: import these library pieces, lay out a NEW map made for the idea, install these components,
 * write the game's config, place these props, write its studded HUD. Steps are small and plain so two executors can run the
 * same list: the worker (plugin ops, `runSteps`) and the Studio proof harness (packages/components/proof).
 *
 * Nothing here decides the idea; `recipes.ts` does. Everything here is pure and tested (tests/compose.test.mjs).
 */
import { COMPONENTS } from './components.generated';
import { studdedMap, studLighting, STUD_PALETTE, type StudPalette } from './studded-map';
import { waveDefenseHud } from './stud-ui';

/** A piece of the owner library: its game (a unique hash prefix) and path, as library_extract and import_owner_library take them. */
export interface LibRef { game: string; path: string }

export interface EnemySpec {
  name: string;
  /** A creature made from pieces: a rigged body wearing a costume (AppleCreatures). */
  body?: LibRef; costume?: LibRef; upright?: boolean; limbColor?: string; scale?: number; stretch?: number;
  /** A size for the whole creature (a boss is bigger), applied after it is built. */
  size?: number;
  /** Or a whole library creature as it is. */
  model?: LibRef;
  health: number; speed: number; reward: number; damage: number;
}
export interface DefenderSpec {
  id: string; name: string; model: LibRef; price: number; range: number; damage: number; rate: number;
  projectile?: LibRef; projectileColor?: string; color?: string; blurb?: string; rarity?: string; height?: number;
  /** The wave a player must reach before it is sold (progression). */
  unlock?: number;
}
export interface PropSpec { ref: LibRef; count: number; height?: number; where: 'scatter' | 'border' | 'rows' }
export interface Recipe {
  title: string;
  currency: string;
  start: number;
  words: Record<string, string>;
  /** The studded map's colours; the style spec's palette for any left out. */
  palette?: Partial<StudPalette>;
  enemies: EnemySpec[];
  defenders: DefenderSpec[];
  props: PropSpec[];
  base: LibRef;
  waves: { first: number; between: number; baseHealth: number; clearBonus?: number; list: { enemy: string; count: number; every: number }[][] };
  /** 'studs' (the default) gives everything the game is made of classic studs; 'keep' when the user asked for their own surfaces. */
  surface?: 'studs' | 'keep';
  seed: number;
}

export type Step =
  | { kind: 'import'; key: string; ref: LibRef; into: string }
  | { kind: 'create'; parent: string; items: InstanceSpecLite[] }
  | { kind: 'script'; className: 'Script' | 'LocalScript' | 'ModuleScript'; parent: string; name: string; source: string }
  /**
   * Copy the piece in `from` (an import folder) to `parent` as `name`. It keeps its own world orientation and turns
   * `yaw` degrees about the vertical; with `along` it turns so its longer horizontal side runs along world X or Z.
   * It is scaled uniformly so its world-aligned height is `height`, or its longer horizontal side is `length`, and
   * stands with the bottom of its world-aligned box centred on `at`.
   */
  | { kind: 'place'; from: string; parent: string; name: string; at: [number, number, number]; yaw: number; height?: number; length?: number; along?: 'x' | 'z' }
  /** Remove every instance of these classes under `root` (a library piece's own sounds and scripts). */
  | { kind: 'strip'; root: string; classes: string[] }
  | { kind: 'hide'; paths: string[] }
  /** Set properties of one existing instance (Lighting). */
  | { kind: 'set'; path: string; props: Record<string, unknown> }
  /** Give every part under these places a classic surface on every face (surfaces.ts, after Resurface). */
  | { kind: 'surface'; paths: string[]; surface: 'studs' }
  | { kind: 'delete'; paths: string[] };

export interface InstanceSpecLite {
  className: string; name: string;
  props?: Record<string, unknown>;
  attributes?: Record<string, string | number | boolean>;
  children?: InstanceSpecLite[];
}

// ------------------------------------------------------------------------------------------------ the map

export type P2 = [number, number];
export interface Layout {
  lane: P2[];            // waypoints (x, z), gate first, base last
  plots: P2[];           // plot centres
  spawn: P2;             // where players appear
  ground: { center: P2; size: P2 };
  scatter: P2[];         // free spots for props, away from the lane and the plots
  rows: P2[];            // free spots on a grid, nearest the base first, for orderly rows (an orchard)
  border: { at: P2; along: 'x' | 'z' }[]; // spots along the edge of the ground, with the edge's direction
  /** A plot-simulator map (hub-layout.ts): a central hub with spoke roads to the plots; `lane` is empty. */
  hub?: { center: P2; radius: number; shopPad: P2; sellPad: P2; heroSpot: P2; spokes: P2[][] };
  /** Tiles along one side of a plot (the plots are plotTiles x plotTiles); PLOT_TILES when absent. */
  plotTiles?: number;
}

export const TILE = 6;              // studs between tile centres
export const PLOT_TILES = 3;        // 3 x 3 tiles per plot
export const LANE_WIDTH = 10;
export const FENCE = 12;            // studs per fence piece along the edge
const PLOT_HALF = (TILE * PLOT_TILES) / 2;

/** Distance from point p to segment ab, on the ground plane. */
export function segDist(p: P2, a: P2, b: P2): number {
  const [px, pz] = p, [ax, az] = a, [bx, bz] = b;
  const dx = bx - ax, dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}
export function laneDist(p: P2, lane: P2[]): number {
  let d = Infinity;
  for (let i = 0; i < lane.length - 1; i++) d = Math.min(d, segDist(p, lane[i]!, lane[i + 1]!));
  return d;
}

/** A small seeded random, so the same recipe lays out the same map. */
export function rng(seed: number): () => number {
  let s = Math.imul((seed >>> 0) ^ 0x5bd1e995, 2654435761) >>> 0 || 1;
  const next = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  for (let i = 0; i < 8; i++) next(); // small seeds start alike; stir them first
  return next;
}

/**
 * The map for a lane-defense idea: a winding lane from the enemies' gate (north) to the base (south), four plots
 * beside it (each tile within reach of the lane, none on it), the players' spawn in the open, and free spots for
 * props. The seed mirrors and stretches the shape so two games do not share a map.
 */
export function laneLayout(seed: number): Layout {
  const r = rng(seed);
  const flip = r() < 0.5 ? -1 : 1;
  const w = 38 + Math.round(r() * 6);
  const base: P2[] = [[0, -110], [0, -60], [w, -60], [w, 0], [-w, 0], [-w, 50], [0, 50], [0, 92]];
  const lane = base.map(([x, z]) => [x * flip, z] as P2);
  // Each plot hugs a straight stretch of the lane (1 stud of grass between), so its far tiles are 21 studs away at most.
  const hug = LANE_WIDTH / 2 + 1 + PLOT_HALF;
  const plotsRaw: P2[] = [[w - hug, -60 + hug], [-hug, -85], [-w + hug, hug], [hug, 50 + hug]];
  const plots = plotsRaw.map(([x, z]) => [x * flip, z] as P2);
  const spawn: P2 = [6 * flip, 25];
  const ground = { center: [0, 2] as P2, size: [176, 264] as P2 }; // the gate (z -110) and the base's plaza (to z 120) both inside
  const scatter: P2[] = [];
  const [gx, gz] = ground.center, [sx, sz] = ground.size;
  for (let tries = 0; scatter.length < 60 && tries < 4000; tries++) {
    const p: P2 = [gx - sx / 2 + 8 + r() * (sx - 16), gz - sz / 2 + 8 + r() * (sz - 16)];
    if (laneDist(p, lane) < LANE_WIDTH / 2 + 6) continue;
    if (plots.some(([x, z]) => Math.abs(p[0] - x) < PLOT_HALF + 5 && Math.abs(p[1] - z) < PLOT_HALF + 5)) continue;
    if (Math.hypot(p[0] - spawn[0], p[1] - spawn[1]) < 10) continue;
    if (scatter.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 9)) continue;
    scatter.push([Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10]);
  }
  const clear = (p: P2, room: number) => laneDist(p, lane) >= LANE_WIDTH / 2 + room
    && !plots.some(([x, z]) => Math.abs(p[0] - x) < PLOT_HALF + room && Math.abs(p[1] - z) < PLOT_HALF + room)
    && Math.hypot(p[0] - spawn[0], p[1] - spawn[1]) >= 10;
  const rows: P2[] = [];
  for (let z = gz - sz / 2 + 12; z <= gz + sz / 2 - 12; z += FENCE) {
    for (let x = gx - sx / 2 + 12; x <= gx + sx / 2 - 12; x += FENCE) if (clear([x, z], 7)) rows.push([x, z]);
  }
  const border: { at: P2; along: 'x' | 'z' }[] = [];
  for (let x = gx - sx / 2 + FENCE / 2; x < gx + sx / 2; x += FENCE) {
    border.push({ at: [x, gz - sz / 2 + 2], along: 'x' }, { at: [x, gz + sz / 2 - 2], along: 'x' });
  }
  for (let z = gz - sz / 2 + FENCE / 2; z < gz + sz / 2; z += FENCE) {
    border.push({ at: [gx - sx / 2 + 2, z], along: 'z' }, { at: [gx + sx / 2 - 2, z], along: 'z' });
  }
  // The orchard grows around what it defends: rows fill from the base outwards.
  const home = lane[lane.length - 1]!;
  rows.sort((a, b) => Math.hypot(a[0] - home[0], a[1] - home[1]) - Math.hypot(b[0] - home[0], b[1] - home[1]));
  return { lane, plots, spawn, ground, scatter, rows, border: border.filter((b) => laneDist(b.at, lane) > LANE_WIDTH) };
}

/** Every tile centre of a plot. */
export function plotTiles(center: P2, size: number = PLOT_TILES): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < size; i++) for (let j = 0; j < size; j++) {
    out.push([center[0] + (i - (size - 1) / 2) * TILE, center[1] + (j - (size - 1) / 2) * TILE]);
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ Luau text

/** A JSON-like value as a Luau table literal (the game's config modules). */
export function luau(value: unknown, indent = ''): string {
  if (value === null || value === undefined) return 'nil';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '0';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'string') return JSON.stringify(value).replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => `\\u{${h}}`);
  const next = indent + '\t';
  if (Array.isArray(value)) {
    if (value.length === 0) return '{}';
    return `{\n${value.map((v) => next + luau(v, next)).join(',\n')},\n${indent}}`;
  }
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return '{}';
  return `{\n${entries.map(([k, v]) => `${next}${/^[A-Za-z_][A-Za-z0-9_]*$/.test(k) ? k : `[${JSON.stringify(k)}]`} = ${luau(v, next)}`).join(',\n')},\n${indent}}`;
}

/** The instance name a library path ends in ("Tomato#4" is the fourth sibling named Tomato; %2F is a slash). */
export function libName(ref: LibRef): string {
  const last = ref.path.split('/').filter(Boolean).pop() ?? 'Item';
  return last.replace(/#\d+$/, '').replace(/%2F/g, '/');
}

// ------------------------------------------------------------------------------------------------ the steps


/** The library pieces a recipe uses, each with the key it is staged under (ServerStorage.AppleParts.<key>). */
export function pieces(recipe: Recipe): { key: string; ref: LibRef }[] {
  const out: { key: string; ref: LibRef }[] = [];
  const seen = new Map<string, string>();
  const add = (prefix: string, ref: LibRef | undefined): string | undefined => {
    if (!ref) return undefined;
    const id = `${ref.game}:${ref.path}`;
    const known = seen.get(id);
    if (known) return known;
    const key = `${prefix}${out.length + 1}`;
    seen.set(id, key);
    out.push({ key, ref });
    return key;
  };
  for (const e of recipe.enemies) { add('Body', e.body); add('Costume', e.costume); add('Enemy', e.model); }
  for (const d of recipe.defenders) { add('Defender', d.model); add('Projectile', d.projectile); }
  for (const p of recipe.props) add('Prop', p.ref);
  add('Base', recipe.base);
  return out;
}

export function composeSteps(recipe: Recipe): Step[] {
  const steps: Step[] = [];
  const layout = laneLayout(recipe.seed);
  const staged = pieces(recipe);
  const keyOf = (ref: LibRef) => staged.find((s) => s.ref.game === ref.game && s.ref.path === ref.path)!.key;
  const partPath = (ref: LibRef) => `ServerStorage.AppleParts.${keyOf(ref)}`;

  // 1. Folders the rest lands in.
  steps.push({ kind: 'create', parent: 'game.ServerStorage', items: [
    { className: 'Folder', name: 'AppleParts', children: staged.map((s) => ({ className: 'Folder', name: s.key })) },
    { className: 'Folder', name: 'AppleEnemies' }, { className: 'Folder', name: 'AppleDefenders' },
  ] });
  steps.push({ kind: 'create', parent: 'game.ServerScriptService', items: [{ className: 'Folder', name: 'AppleComponents' }] });
  steps.push({ kind: 'create', parent: 'game.ReplicatedStorage', items: [{ className: 'Folder', name: 'AppleComponents' }, { className: 'Folder', name: 'AppleProjectiles' }] });

  // 2. The library pieces.
  for (const s of staged) steps.push({ kind: 'import', key: s.key, ref: s.ref, into: `game.ServerStorage.AppleParts.${s.key}` });

  // 3. A new studded map, laid out for this idea (studded-map.ts), and its daylight.
  const mapItems = studdedMap({
    layout, tile: TILE, plotTiles, plotHalf: PLOT_HALF, laneWidth: LANE_WIDTH, seed: rng(recipe.seed ^ 0x51ed),
    words: { gate: recipe.words.gate, base: recipe.words.base, plot: recipe.words.plot },
  }, { ...STUD_PALETTE, ...recipe.palette });
  steps.push({ kind: 'create', parent: 'game.Workspace', items: [{ className: 'Folder', name: 'AppleMap', children: [...mapItems, { className: 'Folder', name: 'Props' }] }] });
  steps.push({ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] });
  const light = studLighting();
  steps.push({ kind: 'set', path: 'game.Lighting', props: light.props });
  steps.push({ kind: 'create', parent: 'game.Lighting', items: light.effects });

  // 4. Props, placed on the new map (the base at the lane's end, the rest on free spots).
  const r = rng(recipe.seed ^ 0x9e3779b9);
  const free = [...layout.scatter];
  const rows = [...layout.rows];
  const border = [...layout.border];
  let n = 0;
  const end = layout.lane[layout.lane.length - 1]!;
  steps.push({ kind: 'place', from: partPath(recipe.base), parent: 'Workspace.AppleMap.Props', name: `Prop${++n}`, at: [end[0], 0, end[1] + 14], yaw: 180, height: 22 });
  const taken: P2[] = [];
  const nearTaken = (q: P2) => taken.some((t) => Math.hypot(q[0] - t[0], q[1] - t[1]) < 8);
  for (const p of recipe.props) {
    for (let i = 0; i < p.count; i++) {
      if (p.where === 'border') {
        // A fence runs around the whole edge: every border spot, turned along its edge, sized to meet the next.
        const b = border.shift();
        if (!b) break;
        steps.push({ kind: 'place', from: partPath(p.ref), parent: 'Workspace.AppleMap.Props', name: `Prop${++n}`, at: [b.at[0], 0, b.at[1]], yaw: 0, along: b.along, length: FENCE });
        continue;
      }
      let spot: P2 | undefined;
      if (p.where === 'rows') {
        while (rows.length && (spot = rows.shift()) && nearTaken(spot)) spot = undefined;
      } else {
        while (free.length && (spot = free.splice(Math.floor(r() * free.length), 1)[0]) && nearTaken(spot)) spot = undefined;
      }
      if (!spot) break;
      taken.push(spot);
      steps.push({ kind: 'place', from: partPath(p.ref), parent: 'Workspace.AppleMap.Props', name: `Prop${++n}`, at: [spot[0], 0, spot[1]],
        yaw: p.where === 'rows' ? 0 : Math.round(r() * 360), ...(p.height ? { height: p.height } : {}) });
    }
  }

  // 5. The components.
  const want = ['motion', 'economy', 'creatures', 'waves', 'defenders', 'shop', 'gameui', 'fx', 'boot'];
  for (const id of want) {
    const c = COMPONENTS[id];
    if (!c) throw new Error(`component ${id} is not bundled`);
    for (const f of c.files) steps.push({ kind: 'script', className: f.className, parent: `game.${f.parent}`, name: f.name, source: f.source });
  }

  // 6. The game's config: what the components read.
  const stage: { from: string; to: string; name: string; height?: number; color?: string }[] = [];
  const creatures: Record<string, unknown> = {};
  for (const e of recipe.enemies) {
    if (e.body && e.costume) creatures[e.name] = { body: partPath(e.body), costume: partPath(e.costume), into: 'ServerStorage.AppleEnemies', upright: e.upright ?? true, limbColor: e.limbColor, scale: e.scale, stretch: e.stretch, size: e.size };
    else if (e.model) stage.push({ from: partPath(e.model), to: 'ServerStorage.AppleEnemies', name: e.name });
  }
  for (const d of recipe.defenders) {
    stage.push({ from: partPath(d.model), to: 'ServerStorage.AppleDefenders', name: d.id, ...(d.height ? { height: d.height } : {}) });
    if (d.projectile) stage.push({ from: partPath(d.projectile), to: 'ReplicatedStorage.AppleProjectiles', name: `${d.id}Shot`, height: 1.6, ...(d.projectileColor ? { color: d.projectileColor } : {}) });
  }
  const config = {
    title: recipe.title,
    start: ['AppleShop', 'AppleWaves', 'AppleDefenders'],
    stage,
    creatures,
    prepare: ['ServerStorage.AppleEnemies', 'ServerStorage.AppleDefenders'],
    economy: { currency: recipe.currency, start: recipe.start, dataKey: `Apple_${recipe.seed}` },
    waves: {
      first: recipe.waves.first, between: recipe.waves.between, baseHealth: recipe.waves.baseHealth, rewardShare: 'killer', clearBonus: recipe.waves.clearBonus ?? 15,
      enemies: Object.fromEntries(recipe.enemies.map((e) => [e.name, { health: e.health, speed: e.speed, reward: e.reward, damage: e.damage }])),
      list: recipe.waves.list,
    },
    shop: {
      refund: 0.5,
      items: recipe.defenders.map((d) => ({ id: d.id, name: d.name, price: d.price, range: d.range, damage: d.damage, rate: d.rate, unlock: d.unlock ?? 0,
        ...(d.projectile ? { projectile: `${d.id}Shot` } : {}), ...(d.color ? { color: d.color } : {}), blurb: d.blurb, rarity: d.rarity })),
    },
  };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ServerScriptService.AppleComponents', name: 'AppleGameConfig',
    source: `-- ${recipe.title}: what this game's systems read. Written by Apple's composer; edit freely.\nreturn ${luau(config)}\n` });
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage.AppleComponents', name: 'AppleClientConfig',
    source: `-- ${recipe.title}: what the screens show. Written by Apple's composer; edit freely.\nreturn ${luau({ currency: recipe.currency, words: recipe.words })}\n` });

  // 7. Studs on everything the game is made of: the map, the props, every library piece (bodies, costumes, trees,
  //    projectiles) before the boot script copies them into creatures and defenders, so all of it shares one surface.
  if ((recipe.surface ?? 'studs') === 'studs') {
    steps.push({ kind: 'surface', surface: 'studs', paths: ['game.Workspace.AppleMap', 'game.ServerStorage.AppleParts'] });
  }

  // 8. The game's own studded HUD (stud-ui.ts), real editable instances in StarterGui that AppleGameUI makes work.
  steps.push({ kind: 'create', parent: 'game.StarterGui', items: [waveDefenseHud(
    recipe.defenders.map((d) => ({ id: d.id, name: d.name, price: d.price, blurb: d.blurb })), recipe.words,
  )] });
  return steps;
}
