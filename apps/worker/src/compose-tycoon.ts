/**
 * THE TYCOON (owner, 2026-10-02: "make me a laundry tycoon make no mistakes" came out as the keyboard game's plot
 * simulator with washing machines in its shop; "he doesn't really focus on what the user asks, instead on what you
 * built for him in the past").
 *
 * A tycoon is its own game, not a plot simulator: every player gets a base where droppers drop the game's item onto a
 * conveyor, machines over the belt turn it into the next thing and multiply what it is worth, a seller at the end pays
 * the owner, and buy pads on the floor unlock the next dropper, machine or speed-up in turn (AppleTycoon).
 *
 * WHAT the game is made of is the AGENT's: compose_game's `tycoon` argument carries the item, the dropper, the machines
 * in order and what each makes of the item, the seller and the currency, in the user's own words and language. The
 * harness holds no trade of its own (it used to hold a laundry chain, a pizza chain and a generic "Cleaner, Polisher,
 * Packer" fallback, and every tycoon came out as one of them): a missing field is reported by name and the agent fills
 * it. A machine's look is a library piece the agent chose (`look: { gameId, path }`) or parts when it gave none. Pure:
 * tycoonSteps turns a recipe into composer steps.
 */
import { COMPONENTS } from './components.generated';
import { luau, type LibRef, type Step, type InstanceSpecLite } from './compose';
import { studdedScreen } from './stud-ui';

type V3 = [number, number, number];

/** One machine on the belt: what it is called, what the item becomes, its colour, how much it multiplies, its library look. */
export interface TycoonMachine { name: string; becomes: string; color: string; times: number; look?: LibRef }
/** What the game is made of, from the agent. */
export interface TycoonTheme {
  title: string;
  /** What drops: its name, colour and (optional) look: a shape, a size [x,y,z] and a material the agent chose. */
  item: { name: string; color: string; shape?: 'Ball' | 'Block' | 'Cylinder'; size?: V3; material?: string };
  dropper: string;
  machines: TycoonMachine[];
  seller: { name: string; look?: LibRef };
  currency: string;
  /** Printed before a price on a pad; none unless the agent gave one. */
  symbol: string;
  players: number;
  /** Pad prices the agent set; any it left out take the documented default (reported with a time-to-next-purchase check). */
  prices?: { dropper2?: number; dropper3?: number; fastBelt?: number; machines?: number[] };
}

export interface TycoonRecipe {
  kind: 'tycoon';
  title: string; seed: number; players: number;
  theme: TycoonTheme;
  hasComponents?: boolean;
  surface?: 'studs' | 'keep';
  /** The agent asked for the default Baseplate and SpawnLocation to go (the map has its own ground and spawn). */
  clearDefaultGround?: boolean;
}

const HEX = /^#[0-9a-f]{6}$/i;
/**
 * A name a sign can hold, in any language: control characters and markup characters out, whitespace collapsed, cut at
 * `max` characters (by code point, never mid-character). Nothing is cut at a word and no word is dropped. `cut` says
 * whether it was shortened, so the result can tell the agent. Pure.
 */
export function cleanText(v: unknown, max = 30): { text: string; cut: boolean } {
  const all = Array.from(String(v ?? '').replace(/[\u0000-\u001f\u007f<>"\\]+/g, ' ').replace(/\s+/g, ' ').trim());
  return { text: all.slice(0, max).join('').trim(), cut: all.length > max };
}
export const clean = (v: unknown, max = 30): string => cleanText(v, max).text;
const asLook = (v: unknown): LibRef | undefined => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof o.gameId === 'string' && /^[0-9a-f]{8,64}$/.test(o.gameId) && typeof o.path === 'string' && o.path.startsWith('/') ? { game: o.gameId, path: o.path } : undefined;
};

/**
 * The theme from the agent's `tycoon` argument, field by field, or what is missing. Nothing is filled from a template: a
 * trade's chain, a generic chain and fixed colours are all gone. Names keep their language and are cut only by length
 * (reported in `notes`). Pure.
 */
export function tycoonTheme(given: unknown): { theme: TycoonTheme; notes: string[] } | { error: string; missing: string[] } {
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const missing: string[] = [];
  const notes: string[] = [];
  const text = (v: unknown, path: string, max = 30): string => {
    const c = cleanText(v, max);
    if (!c.text) missing.push(path); else if (c.cut) notes.push(`${path} was cut to ${max} characters`);
    return c.text;
  };
  const colour = (v: unknown, path: string): string => { if (typeof v === 'string' && HEX.test(v)) return v.toLowerCase(); missing.push(`${path} (#rrggbb)`); return '#ffffff'; };
  const item = (g.item && typeof g.item === 'object' ? g.item : {}) as Record<string, unknown>;
  const title = text(g.title, 'title', 40);
  const currency = text(g.currency, 'currency', 12).replace(/[\s.\[\]]/g, '');
  if (!currency && !missing.includes('currency')) missing.push('currency');
  const itemName = text(item.name, 'item.name');
  const itemColor = colour(item.color, 'item.color');
  const dropper = text(g.dropper, 'dropper');
  const rawMachines = Array.isArray(g.machines) ? g.machines : [];
  if (rawMachines.length < 1) missing.push('machines (1 to 4, each { name, becomes, color })');
  const machines: TycoonMachine[] = rawMachines.slice(0, 4).map((m, i) => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const look = asLook(o.look);
    return {
      name: text(o.name, `machines[${i}].name`), becomes: text(o.becomes, `machines[${i}].becomes`), color: colour(o.color, `machines[${i}].color`),
      times: typeof o.times === 'number' && o.times >= 1.5 && o.times <= 5 ? Math.round(o.times * 2) / 2 : 2,
      ...(look ? { look } : {}),
    };
  });
  const seller = (g.seller && typeof g.seller === 'object' ? g.seller : {}) as Record<string, unknown>;
  const sellerName = text(seller.name, 'seller.name');
  if (missing.length) return { error: `The tycoon is missing: ${missing.join('; ')}. Fill them from the user's request and call compose_game again.`, missing };
  const shape = ['Ball', 'Block', 'Cylinder'].find((x) => x.toLowerCase() === String(item.shape ?? '').toLowerCase()) as 'Ball' | 'Block' | 'Cylinder' | undefined;
  const size = Array.isArray(item.size) && item.size.length === 3 && item.size.every((n) => typeof n === 'number' && n > 0.2 && n < 12) ? item.size as V3 : undefined;
  const material = typeof item.material === 'string' && /^[A-Za-z]{3,20}$/.test(item.material) ? item.material : undefined;
  const itemLook = { name: itemName, color: itemColor, ...(shape ? { shape } : {}), ...(size ? { size } : {}), ...(material ? { material } : {}) };
  const players = Math.max(2, Math.min(6, Math.round(Number(g.players) || 4)));
  const pr = (g.prices && typeof g.prices === 'object' ? g.prices : {}) as Record<string, unknown>;
  const price = (v: unknown) => (typeof v === 'number' && v >= 1 && v <= 1e12 ? Math.round(v) : undefined);
  const prices = {
    ...(price(pr.dropper2) ? { dropper2: price(pr.dropper2) } : {}), ...(price(pr.dropper3) ? { dropper3: price(pr.dropper3) } : {}), ...(price(pr.fastBelt) ? { fastBelt: price(pr.fastBelt) } : {}),
    ...(Array.isArray(pr.machines) ? { machines: pr.machines.map(price).filter((n): n is number => n !== undefined) } : {}),
  };
  const sellerLook = asLook(seller.look);
  return {
    theme: {
      title, item: itemLook, dropper, machines, seller: { name: sellerName, ...(sellerLook ? { look: sellerLook } : {}) }, currency,
      symbol: clean(g.symbol, 3), players, ...(Object.keys(prices).length ? { prices } : {}),
    },
    notes,
  };
}

export function tycoonRecipe(seed: number, theme: TycoonTheme, hasComponents = false): TycoonRecipe {
  return { kind: 'tycoon', title: theme.title, seed, players: theme.players, theme, hasComponents };
}

/** A base's centre: two rows facing each other across the spawn street. Pure. */
export function baseCentre(i: number): [number, number] {
  const col = Math.floor(i / 2), side = i % 2 === 0 ? -1 : 1;
  return [(col - 0.5) * 64, side * 40];
}

// A base is a room's worth, not a field (round 2 of the owner's laundry test: a 64-stud plate with everything at the back).
const BASE = 52;
/** Where things stand inside a base, relative to its centre (x along the belt, z toward the street is +). */
const BELT_Z = -8, BELT_Y = 2, BELT_LEN = 40, BELT_X = -3;
const DROPPER_X = [-19, -14, -9];
const MACHINE_X = [-3, 3, 9, 14];
const SELLER_X = 20;
const BASE_COLOURS = ['#4f8cff', '#ff5a7a', '#36c27a', '#ffb02e', '#a066ff', '#2ec4d6'];

export interface TycoonUnlock { id: string; label: string; price: number; after?: string }

/** The documented default pads' prices, used for any the agent did not set (and reported, with the time they imply). */
export const DEFAULT_PRICES = { dropper2: 15, dropper3: 120, fastBelt: 500, machines: [40, 220, 900, 3200] };

/** The pads in the order they unlock. The agent's prices win; the rest are the documented defaults. Pure. */
export function tycoonUnlocks(theme: TycoonTheme): TycoonUnlock[] {
  const out: TycoonUnlock[] = [];
  const pr = theme.prices ?? {};
  const add = (id: string, label: string, price: number) => { out.push({ id, label, price, ...(out.length ? { after: out[out.length - 1]!.id } : {}) }); };
  add('Dropper2', `2 ${theme.dropper}`, pr.dropper2 ?? DEFAULT_PRICES.dropper2);
  theme.machines.forEach((m, i) => {
    add(`Machine${i + 1}`, m.name, pr.machines?.[i] ?? DEFAULT_PRICES.machines[i]!);
    if (i === 0) add('Dropper3', `3 ${theme.dropper}`, pr.dropper3 ?? DEFAULT_PRICES.dropper3);
    if (i === 1) add('FastBelt', `${theme.machines[1]?.name ?? ''} +`, pr.fastBelt ?? DEFAULT_PRICES.fastBelt);
  });
  return out;
}

/**
 * Information, not a verdict: how long each pad takes to afford, in order, with one dropper every 1.6 s, the item worth 1 and
 * every machine bought so far multiplying it. A pad minutes away is a slow game; seconds away, a fast one. The agent reads it and
 * may pass its own `prices`. Pure.
 */
export function tycoonEconomy(theme: TycoonTheme, unlocks = tycoonUnlocks(theme)): { id: string; price: number; secondsToAfford: number }[] {
  let droppers = 1, multiplier = 1;
  return unlocks.map((u) => {
    const secondsToAfford = Math.round(u.price / ((droppers / 1.6) * multiplier));
    if (u.id === 'Dropper2' || u.id === 'Dropper3') droppers += 1;
    const m = /^Machine(\d+)$/.exec(u.id);
    if (m) multiplier *= theme.machines[Number(m[1]) - 1]?.times ?? 2;
    return { id: u.id, price: u.price, secondsToAfford };
  });
}

const part = (name: string, size: V3, at: V3, color: string, extra: Record<string, unknown> = {}): InstanceSpecLite =>
  ({ className: 'Part', name, props: { Size: size, Position: at, Anchored: true, Color: color, Material: 'Plastic', ...extra } });

const udim2 = (xs: number, xo: number, ys: number, yo: number) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const font = { t: 'EnumItem', v: 'Enum.Font.FredokaOne' };

/** A sign: a billboard over a part with one line, readable from across the base. */
function sign(text: string, height: number, colour = '#ffffff', name = 'Label'): InstanceSpecLite {
  return { className: 'BillboardGui', name: 'Sign', props: { Size: udim2(0, 180, 0, 44), StudsOffset: [0, height, 0], MaxDistance: 45, LightInfluence: 0 }, children: [
    { className: 'TextLabel', name, props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, Text: text, TextScaled: true, Font: font, TextColor3: colour }, children: [{ className: 'UIStroke', name: 'Stroke', props: { Thickness: 2, Color: '#1b1b1b' } }] },
  ] };
}

/** A dropper built from parts: a hopper on four legs over the belt, named, with its spout under it. */
function dropperModel(id: string, theme: TycoonTheme, x: number, z: number, colour: string, named: boolean): InstanceSpecLite {
  const y = BELT_Y + 0.5;
  return { className: 'Model', name: id, children: [
    part('Hopper', [4, 3, 8.4], [x, y + 7, z], colour, { Material: 'SmoothPlastic' }),
    // Heaped with what it drops, in the item's own colour and material (plain plastic unless the agent chose another).
    ...[[-0.8, 8.9, -2], [0.7, 9.1, 0.2], [-0.3, 8.8, 2.2], [0.9, 8.7, -1.1]].map(([dx, dy, dz], k) =>
      ({ className: 'Part', name: `Heap${k + 1}`, props: { Shape: 'Ball', Size: [2.2, 2.2, 2.2], Position: [x + dx!, y + dy!, z + dz!], Anchored: true, CanCollide: false, Color: theme.item.color, Material: theme.item.material ?? 'Plastic' } })),
    part('Funnel', [2.4, 1.2, 2.4], [x, y + 5, z], '#3b3f4a'),
    // The legs stand outside the rails, so nothing on the belt runs into them.
    ...[[-1.7, -3.9], [1.7, -3.9], [-1.7, 3.9], [1.7, 3.9]].map(([dx, dz], k) => part(`Leg${k + 1}`, [0.5, 8, 0.5], [x + dx!, y + 2.5, z + dz!], '#3b3f4a')),
    { ...part('Spout', [1, 0.4, 1], [x, y + 4.2, z], '#000000', { Transparency: 1, CanCollide: false, CanTouch: false }) },
    ...(named ? [{ ...part('Name', [0.2, 0.2, 0.2], [x, y + 10, z], '#000000', { Transparency: 1, CanCollide: false }), children: [sign(theme.dropper, 1.6)] }] : []),
  ] };
}

/** A machine: its gate across the belt (what changes the item), a stand beside the belt, and a body of parts when the library has no look. */
function machineModel(id: string, m: TycoonMachine, x: number, z: number, hasLook: boolean, side: number): InstanceSpecLite {
  const y = BELT_Y + 0.5;
  return { className: 'Model', name: id, children: [
    part('Gate', [2.2, 4.2, 6.6], [x, y + 2.1, z], m.color, { Material: 'Neon', Transparency: 0.55, CanCollide: false, CanTouch: true }),
    part('ArchLeft', [2.6, 5.2, 0.6], [x, y + 2.6, z - 3.6], '#3b3f4a'), part('ArchRight', [2.6, 5.2, 0.6], [x, y + 2.6, z + 3.6], '#3b3f4a'),
    part('ArchTop', [2.6, 0.6, 7.8], [x, y + 5.4, z], '#3b3f4a'),
    ...(hasLook ? [] : [
      part('Body', [6, 6, 5], [x, y + 2.5, z - side * 7.5], m.color, { Material: 'SmoothPlastic' }),
      part('Window', [3, 3, 0.4], [x, y + 3, z - side * 4.9], '#2a3b55', { Material: 'Glass', Transparency: 0.3 }),
    ]),
    { ...part('Name', [0.2, 0.2, 0.2], [x, y + 7.5, z - side * 3], '#000000', { Transparency: 1, CanCollide: false }), children: [sign(m.name, 1.4, m.color)] },
  ] };
}

/** A pad: a green square on the floor that says what it builds and for how much. */
function padPart(u: TycoonUnlock, at: V3, theme: TycoonTheme): InstanceSpecLite {
  return { ...part(u.id, [5, 0.4, 5], at, '#2fd66b', { Material: 'Neon', CanCollide: false, CanTouch: true }), attributes: { Id: u.id, Price: u.price },
    children: [sign(`${u.label} - ${short(u.price, theme)}`, 2.4, '#ffffff')] };
}

/** A price as a pad shows it, in the game's own currency: 1500 -> "1.5K Cash", or "$1.5K" when the agent gave a symbol. Pure. */
export function short(n: number, theme: Pick<TycoonTheme, 'currency' | 'symbol'>): string {
  const num = (() => {
    for (const [v, s] of [[1e6, 'M'], [1e3, 'K']] as const) if (n >= v) return `${(n / v).toFixed(1).replace(/\.0$/, '')}${s}`;
    return String(n);
  })();
  return theme.symbol ? `${theme.symbol}${num}` : `${num} ${theme.currency}`;
}

/** The composer steps for a tycoon, from its recipe. Pure. */
export function tycoonSteps(recipe: TycoonRecipe): Step[] {
  const { theme } = recipe;
  const steps: Step[] = [];
  const unlocks = tycoonUnlocks(theme);
  const looks = { machines: theme.machines.map((m) => m.look), seller: theme.seller.look };
  // Every library piece's import folder exists first (live 2026-10-02: "nothing at ...AppleParts.TycoonMachine1").
  const staged = [...looks.machines.flatMap((r, i) => (r ? [`TycoonMachine${i + 1}`] : [])), ...(looks.seller ? ['TycoonSeller'] : [])];
  steps.push({ kind: 'create', parent: 'game.ServerStorage', items: [{ className: 'Folder', name: 'AppleParts', children: staged.map((name) => ({ className: 'Folder', name })) }, { className: 'Folder', name: 'AppleTycoonParts', children:
    Array.from({ length: recipe.players }, (_, i) => ({ className: 'Folder', name: String(i + 1) })) }] });
  if (!recipe.hasComponents) steps.push({ kind: 'create', parent: 'game.ServerScriptService', items: [{ className: 'Folder', name: 'AppleComponents' }] });
  steps.push({ kind: 'create', parent: 'game.ReplicatedStorage', items: [{ className: 'Folder', name: 'AppleComponents' }] });
  looks.machines.forEach((ref, i) => { if (ref) steps.push({ kind: 'import', key: `TycoonMachine${i + 1}`, ref, into: `game.ServerStorage.AppleParts.TycoonMachine${i + 1}` }); });
  if (looks.seller) steps.push({ kind: 'import', key: 'TycoonSeller', ref: looks.seller, into: 'game.ServerStorage.AppleParts.TycoonSeller' });

  // The map: grass, the street with the spawn, and one base per player.
  const cols = Math.ceil(recipe.players / 2);
  const width = cols * 64 + 40, groundX = (cols - 2) * 32;
  const bases: InstanceSpecLite[] = [];
  for (let i = 0; i < recipe.players; i++) {
    const [cx, cz] = baseCentre(i);
    const side = i % 2 === 0 ? 1 : -1; // the street is toward z = 0: belt and pads are laid out facing it
    const z = (dz: number) => cz + side * dz;
    const colour = BASE_COLOURS[i % BASE_COLOURS.length]!;
    const padSlots: V3[] = unlocks.map((_, k) => [cx - 18 + (k % 6) * 7, 1.2, z(4 + Math.floor(k / 6) * 7)]);
    bases.push({ className: 'Model', name: String(i + 1), children: [
      part('Floor', [BASE, 1, BASE], [cx, 0.5, cz], colour),
      part('Spawn', [8, 1, 8], [cx, 1.1, z(17)], '#ffffff', { Material: 'SmoothPlastic' }),
      { ...part('Sign', [0.2, 0.2, 0.2], [cx, 1, z(BASE / 2)], '#000000', { Transparency: 1, CanCollide: false }), children: [sign(`Base ${i + 1}`, 6, colour)] },
      part('Conveyor', [BELT_LEN, 1, 6], [cx + BELT_X, BELT_Y, z(BELT_Z)], '#2b2e36', { Material: 'SmoothPlastic' }),
      // Low rails: what rides the belt is the game, and tall rails would hide it.
      part('RailBack', [BELT_LEN, 0.7, 0.5], [cx + BELT_X, BELT_Y + 0.85, z(BELT_Z) - 3.25], '#ffd34d'),
      part('RailFront', [BELT_LEN, 0.7, 0.5], [cx + BELT_X, BELT_Y + 0.85, z(BELT_Z) + 3.25], '#ffd34d'),
      // A low wall round the base with its door on the street side: a base, not a plate.
      part('WallBack', [BASE, 3, 1], [cx, 2.5, z(-BASE / 2 + 0.5)], '#ffffff'),
      part('WallLeft', [1, 3, BASE], [cx - BASE / 2 + 0.5, 2.5, cz], '#ffffff'),
      part('WallRight', [1, 3, BASE], [cx + BASE / 2 - 0.5, 2.5, cz], '#ffffff'),
      part('WallFrontLeft', [BASE / 2 - 6, 3, 1], [cx - BASE / 4 - 3, 2.5, z(BASE / 2 - 0.5)], '#ffffff'),
      part('WallFrontRight', [BASE / 2 - 6, 3, 1], [cx + BASE / 4 + 3, 2.5, z(BASE / 2 - 0.5)], '#ffffff'),
      { ...part('Seller', [5, 3, 8], [cx + SELLER_X, 2, z(BELT_Z)], '#2fd66b', { Material: 'SmoothPlastic' }), children: [sign(`${theme.seller.name} - ${theme.machines[theme.machines.length - 1]?.becomes ?? theme.item.name}`, 4)] },
      { className: 'Folder', name: 'Drops' },
      { className: 'Folder', name: 'Pads', children: unlocks.map((u, k) => padPart(u, padSlots[k]!, theme)) },
    ] });
  }
  steps.push({ kind: 'create', parent: 'game.Workspace', items: [{ className: 'Folder', name: 'AppleMap', children: [
    part('Ground', [width, 2, 160], [groundX, -1, 0], '#5fbf4a'),
    part('Street', [width, 0.2, 24], [groundX, 0.1, 0], '#9aa3ad', { Material: 'SmoothPlastic' }),
    { className: 'SpawnLocation', name: 'Spawn', props: { Size: [8, 1, 8], Position: [groundX - width / 2 + 12, 0.6, 0], Anchored: true, Color: '#ffffff' } },
    { className: 'Folder', name: 'Tycoons', children: bases },
    { className: 'Folder', name: 'Props' },
  ] }] });
  // The default Baseplate and SpawnLocation are the user's until the agent says the map replaces them (clearDefaultGround).
  // Lighting is not touched: set_mood is the agent's own call.
  if (recipe.clearDefaultGround) steps.push({ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] });

  // The unlockables, held per base until bought (Dropper1 is every player's from the start).
  for (let i = 0; i < recipe.players; i++) {
    const [cx, cz] = baseCentre(i);
    const side = i % 2 === 0 ? 1 : -1;
    const bz = cz + side * BELT_Z;
    const held = `game.ServerStorage.AppleTycoonParts.${i + 1}`;
    steps.push({ kind: 'create', parent: held, items: [
      ...DROPPER_X.map((dx, k) => dropperModel(`Dropper${k + 1}`, theme, cx + dx, bz, '#ff8a3d', k === 0)),
      ...theme.machines.map((m, k) => machineModel(`Machine${k + 1}`, m, cx + MACHINE_X[k]!, bz, !!looks.machines[k], side)),
      { className: 'Model', name: 'FastBelt', children: [part('Booster', [3, 0.3, 6.2], [cx + BELT_X - 14, BELT_Y + 0.6, bz], '#4fe3ff', { Material: 'Neon', CanCollide: false, CanTouch: false })] },
    ] });
    looks.machines.forEach((ref, k) => {
      if (!ref) return;
      // The machine's library look stands behind the belt beside its gate, a tile wide.
      steps.push({ kind: 'place', from: `ServerStorage.AppleParts.TycoonMachine${k + 1}`, parent: `ServerStorage.AppleTycoonParts.${i + 1}.Machine${k + 1}`, name: 'Look',
        at: [cx + MACHINE_X[k]!, 1, bz - side * 7.5], yaw: side > 0 ? 0 : 180, height: 8.5 });
    });
    if (looks.seller) steps.push({ kind: 'place', from: 'ServerStorage.AppleParts.TycoonSeller', parent: `Workspace.AppleMap.Tycoons.${i + 1}`, name: 'SellerLook',
      at: [cx + SELLER_X + 3, 1, bz - side * 9], yaw: side > 0 ? 0 : 180, length: 12 });
  }

  for (const id of ['economy', 'tycoon', 'boot'] as const) {
    const c = COMPONENTS[id];
    if (!c) continue;
    for (const f of c.files) steps.push({ kind: 'script', className: f.className, parent: `game.${f.parent}`, name: f.name, source: f.source });
  }
  const config = {
    title: recipe.title,
    start: ['AppleTycoon'],
    economy: { currency: theme.currency, start: 0 },
    symbol: theme.symbol || undefined,
    tycoon: {
      item: { name: theme.item.name, color: theme.item.color, value: 1, ...(theme.item.shape ? { shape: theme.item.shape } : {}), ...(theme.item.size ? { size: theme.item.size } : {}), ...(theme.item.material ? { material: theme.item.material } : {}) },
      belt: { speed: 7 },
      droppers: { Dropper1: { every: 1.6 }, Dropper2: { every: 1.6 }, Dropper3: { every: 1.2 } },
      machines: Object.fromEntries(theme.machines.map((m, k) => [`Machine${k + 1}`, { times: m.times, color: m.color, becomes: m.becomes }])),
      unlocks,
      start: ['Dropper1'],
      speedUps: { FastBelt: 12 },
    },
  };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ServerScriptService.AppleComponents', name: 'AppleGameConfig',
    source: `-- ${recipe.title}: what this game's systems read. Written by Apple's composer from the request; edit freely.\nreturn ${luau(config)}\n` });
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage.AppleComponents', name: 'AppleClientConfig',
    source: `-- ${recipe.title}: what the screen shows.\nreturn ${luau({ currency: theme.currency, ...(theme.symbol ? { symbol: theme.symbol } : {}) })}\n` });
  if ((recipe.surface ?? 'studs') === 'studs') steps.push({ kind: 'surface', surface: 'studs', paths: ['game.Workspace.AppleMap', 'game.ServerStorage.AppleTycoonParts'] });
  steps.push({ kind: 'create', parent: 'game.StarterGui', items: [studdedScreen({ name: 'TycoonHUD', pieces: [
    { kind: 'counter', name: 'Money', text: '0', icon: theme.symbol || Array.from(theme.currency)[0]!.toUpperCase(), colour: 'green', plus: false, at: 'top-left', caption: theme.currency },
    { kind: 'bar', name: 'Hint', text: Array.from(`${recipe.title}`).slice(0, 40).join(''), colour: 'yellow', at: 'bottom' },
  ] })] });
  return steps;
}

/** What the player is told, from what was built. Pure. */
export function tycoonForUser(recipe: TycoonRecipe, report: { missing: string[] }): string {
  const t = recipe.theme;
  const chain = [t.item.name, ...t.machines.map((m) => m.becomes)].join(' → ');
  const fromLibrary = t.machines.filter((m, k) => m.look && !report.missing.includes(`TycoonMachine${k + 1}`)).length;
  return [
    `**${recipe.title}** is built: ${recipe.players} bases on a street, one for each player.`,
    `- Your ${t.dropper} drops ${t.item.name} onto a conveyor. It goes ${chain}, and each machine makes it worth more.`,
    `- The ${t.seller.name} at the end of the belt pays you ${t.currency} for every one.`,
    `- Step on the green pads to buy, in order: ${tycoonUnlocks(t).map((u) => `${u.label} (${short(u.price, t)})`).join(', ')}.`,
    fromLibrary ? `- ${fromLibrary === t.machines.length ? 'Every machine is a model' : fromLibrary === 1 ? 'One machine is a model' : `${fromLibrary} machines are models`} from your library${fromLibrary < t.machines.length ? '; the rest are built from parts' : ''}.` : '',
  ].filter(Boolean).join('\n');
}
