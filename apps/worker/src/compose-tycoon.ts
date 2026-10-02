/**
 * THE TYCOON (owner, 2026-10-02: "make me a laundry tycoon make no mistakes" came out as the keyboard game's plot
 * simulator with washing machines in its shop; "he doesn't really focus on what the user asks, instead on what you
 * built for him in the past").
 *
 * A tycoon is its own game, not a plot simulator: every player gets a base where droppers drop the game's item onto a
 * conveyor, machines over the belt turn it into the next thing and multiply what it is worth, a seller at the end pays
 * the owner, and buy pads on the floor unlock the next dropper, machine or speed-up in turn (AppleTycoon).
 *
 * WHAT the game is made of comes from the request, never from a template's own nouns: the agent fills `theme` from the
 * user's words (compose_game's tycoon argument: the item, the machines in order and what each makes, the seller), and
 * tycoonTheme only fills what it left out. The library supplies each machine's look when it has one; otherwise the
 * machine is built from parts and still named for what it is. Pure: tycoonSteps turns a recipe into composer steps.
 */
import { COMPONENTS } from './components.generated';
import { luau, type LibRef, type Step, type InstanceSpecLite } from './compose';
import { studLighting } from './studded-map';
import { studdedScreen } from './stud-ui';

type V3 = [number, number, number];

/** One machine on the belt: what it is called, what to look for in the library, what the item becomes and its colour. */
export interface TycoonMachine { name: string; search?: string; becomes: string; color: string; times: number }
/** What the game is made of, from the request. */
export interface TycoonTheme {
  subject: string;
  item: { name: string; color: string };
  dropper: string;
  machines: TycoonMachine[];
  seller: { name: string; search?: string };
  currency: string;
}

export interface TycoonRecipe {
  kind: 'tycoon';
  title: string; seed: number; players: number;
  theme: TycoonTheme;
  /** The library piece each machine (by index) and the seller wear, when the library has one. */
  looks: { machines: (LibRef | undefined)[]; seller?: LibRef };
  hasComponents?: boolean;
  surface?: 'studs' | 'keep';
}

const cap = (s: string) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
const HEX = /^#[0-9a-f]{6}$/i;
const clean = (v: unknown, max = 28) => String(v ?? '').replace(/[^A-Za-z0-9 '\-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const colourOr = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

/**
 * Starting points for a few trades, used ONLY for what the agent's theme leaves out. Each is the trade's own chain:
 * what comes in, what each machine makes of it, who buys it.
 */
const KNOWN: Record<string, Omit<TycoonTheme, 'subject' | 'currency'>> = {
  laundry: {
    item: { name: 'Dirty Laundry', color: '#8a6d52' }, dropper: 'Laundry Chute',
    machines: [
      { name: 'Washing Machine', search: 'washing machine', becomes: 'Clean Laundry', color: '#dff3ff', times: 2 },
      { name: 'Dryer', search: 'dryer', becomes: 'Dry Laundry', color: '#ffffff', times: 2 },
      { name: 'Folding Table', search: 'folding table', becomes: 'Folded Laundry', color: '#9fd8ff', times: 3 },
    ],
    seller: { name: 'Delivery Van', search: 'van' },
  },
  pizza: {
    item: { name: 'Dough', color: '#f1dca7' }, dropper: 'Dough Maker',
    machines: [
      { name: 'Sauce Station', search: 'sauce', becomes: 'Sauced Pizza', color: '#d8432f', times: 2 },
      { name: 'Cheese Grater', search: 'cheese', becomes: 'Cheesy Pizza', color: '#ffd34d', times: 2 },
      { name: 'Pizza Oven', search: 'pizza oven', becomes: 'Hot Pizza', color: '#e8913a', times: 3 },
    ],
    seller: { name: 'Pizza Counter', search: 'counter' },
  },
};

/** The game's subject from the request: the noun before "tycoon" ("a laundry tycoon" -> "laundry"). Pure. */
export function tycoonSubject(text: string | undefined): string {
  const m = /\b([a-z]+(?:\s[a-z]+)?)\s+tycoon\b/i.exec(String(text ?? ''));
  const words = (m?.[1] ?? '').toLowerCase().split(' ').filter((w) => !['a', 'an', 'the', 'me', 'my', 'make', 'build', 'create'].includes(w));
  return words.join(' ') || 'factory';
}

export function isTycoonRequest(text: string | undefined): boolean {
  return /\btycoon\b/i.test(String(text ?? ''));
}

/**
 * The theme: the agent's own reading of the request first, field by field, then the trade's known chain, then a
 * generic one named after the subject. Never empty, never more than four machines. Pure.
 */
export function tycoonTheme(request: string, given: unknown): TycoonTheme {
  const subject = tycoonSubject(request);
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const known = KNOWN[subject.split(' ').pop()!] ?? KNOWN[subject];
  const generic: Omit<TycoonTheme, 'subject' | 'currency'> = {
    item: { name: `Raw ${cap(subject)}`, color: '#9a8b7a' }, dropper: `${cap(subject)} Dropper`,
    machines: [
      { name: `${cap(subject)} Cleaner`, becomes: `Clean ${cap(subject)}`, color: '#dff3ff', times: 2 },
      { name: `${cap(subject)} Polisher`, becomes: `Shiny ${cap(subject)}`, color: '#ffe27a', times: 2 },
      { name: `${cap(subject)} Packer`, becomes: `Packed ${cap(subject)}`, color: '#b58cff', times: 3 },
    ],
    seller: { name: 'Seller' },
  };
  const base = known ?? generic;
  const gItem = (g.item && typeof g.item === 'object' ? g.item : { name: g.item }) as Record<string, unknown>;
  const gMachines = Array.isArray(g.machines) ? g.machines : [];
  const machines: TycoonMachine[] = (gMachines.length ? gMachines : base.machines).slice(0, 4).map((m, i) => {
    const o = (m && typeof m === 'object' ? m : { name: m }) as Record<string, unknown>;
    const fall = base.machines[i] ?? base.machines[base.machines.length - 1]!;
    const name = clean(o.name) || fall.name;
    return {
      name: cap(name),
      search: clean(o.search, 40) || clean(o.name, 40).toLowerCase() || fall.search,
      becomes: cap(clean(o.becomes) || fall.becomes),
      color: colourOr(o.color, fall.color),
      times: typeof o.times === 'number' && o.times >= 1.5 && o.times <= 5 ? Math.round(o.times * 2) / 2 : fall.times,
    };
  });
  const gSeller = (g.seller && typeof g.seller === 'object' ? g.seller : { name: g.seller }) as Record<string, unknown>;
  return {
    subject,
    item: { name: cap(clean(gItem.name) || base.item.name), color: colourOr(gItem.color, base.item.color) },
    dropper: cap(clean(g.dropper) || base.dropper),
    machines,
    seller: { name: cap(clean(gSeller.name) || base.seller.name), search: clean(gSeller.search, 40) || clean(gSeller.name, 40).toLowerCase() || base.seller.search },
    currency: clean(g.currency, 12).replace(/\s/g, '') || 'Cash',
  };
}

/** "for 4 players"; 4 when unsaid, 2..6 (a base is 64 studs). Pure. */
function playersIn(text: string): number {
  const m = /\b(\d{1,2})\s*(players?|bases?|plots?)\b/i.exec(text);
  return Math.max(2, Math.min(6, m ? Number(m[1]) : 4));
}

export function tycoonRecipe(request: string, seed: number, theme: TycoonTheme, looks: TycoonRecipe['looks'] = { machines: [] }, hasComponents = false): TycoonRecipe {
  return { kind: 'tycoon', title: `${cap(theme.subject)} Tycoon`, seed, players: playersIn(request), theme, looks, hasComponents };
}

/** A base's centre: two rows facing each other across the spawn street. Pure. */
export function baseCentre(i: number): [number, number] {
  const col = Math.floor(i / 2), side = i % 2 === 0 ? -1 : 1;
  return [(col - 1) * 76 + 38, side * 48];
}

const BASE = 64;
/** Where things stand inside a base, relative to its centre (x along the belt, z toward the street is +). */
const BELT_Z = -10, BELT_Y = 2, BELT_LEN = 46, BELT_X = -2;
const DROPPER_X = [-21, -15.5, -10];
const MACHINE_X = [-2, 6, 14, 20];
const SELLER_X = 24;
const BASE_COLOURS = ['#4f8cff', '#ff5a7a', '#36c27a', '#ffb02e', '#a066ff', '#2ec4d6'];

export interface TycoonUnlock { id: string; label: string; price: number; after?: string }

/** The pads in the order they unlock, priced so the next one is about a minute away. Pure. */
export function tycoonUnlocks(theme: TycoonTheme): TycoonUnlock[] {
  const out: TycoonUnlock[] = [];
  const add = (id: string, label: string, price: number) => { out.push({ id, label, price, ...(out.length ? { after: out[out.length - 1]!.id } : {}) }); };
  add('Dropper2', `2nd ${theme.dropper}`, 15);
  theme.machines.forEach((m, i) => {
    add(`Machine${i + 1}`, m.name, [40, 220, 900, 3200][i]!);
    if (i === 0) add('Dropper3', `3rd ${theme.dropper}`, 120);
    if (i === 1) add('FastBelt', 'Faster Belt', 500);
  });
  return out;
}

const part = (name: string, size: V3, at: V3, color: string, extra: Record<string, unknown> = {}): InstanceSpecLite =>
  ({ className: 'Part', name, props: { Size: size, Position: at, Anchored: true, Color: color, Material: 'Plastic', ...extra } });

const udim2 = (xs: number, xo: number, ys: number, yo: number) => ({ t: 'UDim2', v: [xs, xo, ys, yo] });
const font = { t: 'EnumItem', v: 'Enum.Font.FredokaOne' };

/** A sign: a billboard over a part with one line, readable from across the base. */
function sign(text: string, height: number, colour = '#ffffff', name = 'Label'): InstanceSpecLite {
  return { className: 'BillboardGui', name: 'Sign', props: { Size: udim2(0, 220, 0, 54), StudsOffset: [0, height, 0], MaxDistance: 90, LightInfluence: 0 }, children: [
    { className: 'TextLabel', name, props: { Size: udim2(1, 0, 1, 0), BackgroundTransparency: 1, Text: text, TextScaled: true, Font: font, TextColor3: colour }, children: [{ className: 'UIStroke', name: 'Stroke', props: { Thickness: 2, Color: '#1b1b1b' } }] },
  ] };
}

/** A dropper built from parts: a hopper on four legs over the belt, named, with its spout under it. */
function dropperModel(id: string, theme: TycoonTheme, x: number, z: number, colour: string): InstanceSpecLite {
  const y = BELT_Y + 0.5;
  return { className: 'Model', name: id, children: [
    part('Hopper', [4, 3, 8.4], [x, y + 7, z], colour, { Material: 'SmoothPlastic' }),
    part('Funnel', [2.4, 1.2, 2.4], [x, y + 5, z], '#3b3f4a'),
    // The legs stand outside the rails, so nothing on the belt runs into them.
    ...[[-1.7, -3.9], [1.7, -3.9], [-1.7, 3.9], [1.7, 3.9]].map(([dx, dz], k) => part(`Leg${k + 1}`, [0.5, 8, 0.5], [x + dx!, y + 2.5, z + dz!], '#3b3f4a')),
    { ...part('Spout', [1, 0.4, 1], [x, y + 4.2, z], '#000000', { Transparency: 1, CanCollide: false, CanTouch: false }) },
    { ...part('Name', [0.2, 0.2, 0.2], [x, y + 9, z], '#000000', { Transparency: 1, CanCollide: false }), children: [sign(theme.dropper, 1.4)] },
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
function padPart(u: TycoonUnlock, at: V3): InstanceSpecLite {
  return { ...part(u.id, [5, 0.4, 5], at, '#2fd66b', { Material: 'Neon', CanCollide: false, CanTouch: true }), attributes: { Id: u.id, Price: u.price },
    children: [sign(`${u.label} - ${short(u.price)}`, 2.4, '#ffffff')] };
}

function short(n: number): string {
  for (const [v, s] of [[1e6, 'M'], [1e3, 'K']] as const) if (n >= v) return `$${(n / v).toFixed(1).replace(/\.0$/, '')}${s}`;
  return `$${n}`;
}

/** The composer steps for a tycoon, from its recipe. Pure. */
export function tycoonSteps(recipe: TycoonRecipe): Step[] {
  const { theme } = recipe;
  const steps: Step[] = [];
  const unlocks = tycoonUnlocks(theme);
  const looks = recipe.looks;
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
  const width = cols * 76 + 40;
  const bases: InstanceSpecLite[] = [];
  for (let i = 0; i < recipe.players; i++) {
    const [cx, cz] = baseCentre(i);
    const side = i % 2 === 0 ? 1 : -1; // the street is toward z = 0: belt and pads are laid out facing it
    const z = (dz: number) => cz + side * dz;
    const colour = BASE_COLOURS[i % BASE_COLOURS.length]!;
    const padSlots: V3[] = unlocks.map((_, k) => [cx - 20 + (k % 6) * 8, 1.2, z(6 + Math.floor(k / 6) * 8)]);
    bases.push({ className: 'Model', name: String(i + 1), children: [
      part('Floor', [BASE, 1, BASE], [cx, 0.5, cz], colour),
      part('Spawn', [8, 1, 8], [cx, 1.1, z(24)], '#ffffff', { Material: 'SmoothPlastic' }),
      { ...part('Sign', [0.2, 0.2, 0.2], [cx, 1, z(30)], '#000000', { Transparency: 1, CanCollide: false }), children: [sign(`Base ${i + 1}`, 6, colour)] },
      part('Conveyor', [BELT_LEN, 1, 6], [cx + BELT_X, BELT_Y, z(BELT_Z)], '#2b2e36', { Material: 'Fabric' }),
      part('RailBack', [BELT_LEN, 1.4, 0.5], [cx + BELT_X, BELT_Y + 1.2, z(BELT_Z) - 3.25], '#ffd34d'),
      part('RailFront', [BELT_LEN, 1.4, 0.5], [cx + BELT_X, BELT_Y + 1.2, z(BELT_Z) + 3.25], '#ffd34d'),
      { ...part('Seller', [5, 3, 8], [cx + SELLER_X, 2, z(BELT_Z)], '#2fd66b', { Material: 'SmoothPlastic' }), children: [sign(`${theme.seller.name} - sells your ${theme.machines[theme.machines.length - 1]?.becomes ?? theme.item.name}`, 4)] },
      { className: 'Folder', name: 'Drops' },
      { className: 'Folder', name: 'Pads', children: unlocks.map((u, k) => padPart(u, padSlots[k]!)) },
    ] });
  }
  steps.push({ kind: 'create', parent: 'game.Workspace', items: [{ className: 'Folder', name: 'AppleMap', children: [
    part('Ground', [width, 2, 200], [0, -1, 0], '#5fbf4a'),
    part('Street', [width, 0.2, 20], [0, 0.1, 0], '#9aa3ad', { Material: 'SmoothPlastic' }),
    { className: 'SpawnLocation', name: 'Spawn', props: { Size: [8, 1, 8], Position: [-width / 2 + 14, 0.6, 0], Anchored: true, Color: '#ffffff' } },
    { className: 'Folder', name: 'Tycoons', children: bases },
    { className: 'Folder', name: 'Props' },
  ] }] });
  steps.push({ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] });
  const light = studLighting();
  steps.push({ kind: 'set', path: 'game.Lighting', props: light.props });
  steps.push({ kind: 'create', parent: 'game.Lighting', items: light.effects });

  // The unlockables, held per base until bought (Dropper1 is every player's from the start).
  for (let i = 0; i < recipe.players; i++) {
    const [cx, cz] = baseCentre(i);
    const side = i % 2 === 0 ? 1 : -1;
    const bz = cz + side * BELT_Z;
    const held = `game.ServerStorage.AppleTycoonParts.${i + 1}`;
    steps.push({ kind: 'create', parent: held, items: [
      ...DROPPER_X.map((dx, k) => dropperModel(`Dropper${k + 1}`, theme, cx + dx, bz, '#ff8a3d')),
      ...theme.machines.map((m, k) => machineModel(`Machine${k + 1}`, m, cx + MACHINE_X[k]!, bz, !!looks.machines[k], side)),
      { className: 'Model', name: 'FastBelt', children: [part('Booster', [3, 0.3, 6.2], [cx + BELT_X - 14, BELT_Y + 0.6, bz], '#4fe3ff', { Material: 'Neon', CanCollide: false, CanTouch: false })] },
    ] });
    looks.machines.forEach((ref, k) => {
      if (!ref) return;
      // The machine's library look stands behind the belt beside its gate, a tile wide.
      steps.push({ kind: 'place', from: `ServerStorage.AppleParts.TycoonMachine${k + 1}`, parent: `ServerStorage.AppleTycoonParts.${i + 1}.Machine${k + 1}`, name: 'Look',
        at: [cx + MACHINE_X[k]!, 1, bz - side * 8], yaw: side > 0 ? 0 : 180, height: 6.5 });
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
    tycoon: {
      item: { name: theme.item.name, color: theme.item.color, value: 1 },
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
    source: `-- ${recipe.title}: what the screen shows.\nreturn ${luau({ currency: theme.currency })}\n` });
  if ((recipe.surface ?? 'studs') === 'studs') steps.push({ kind: 'surface', surface: 'studs', paths: ['game.Workspace.AppleMap', 'game.ServerStorage.AppleTycoonParts'] });
  steps.push({ kind: 'create', parent: 'game.StarterGui', items: [studdedScreen({ name: 'TycoonHUD', pieces: [
    { kind: 'counter', name: 'Money', text: '0', icon: '$', colour: 'green', plus: false, at: 'top-left', caption: theme.currency },
    { kind: 'bar', name: 'Hint', text: `Step on the green pads to build your ${recipe.title}`.slice(0, 60), colour: 'yellow', at: 'bottom' },
  ] })] });
  return steps;
}

/** What the player is told, from what was built. Pure. */
export function tycoonForUser(recipe: TycoonRecipe, report: { missing: string[] }): string {
  const t = recipe.theme;
  const chain = [t.item.name, ...t.machines.map((m) => m.becomes)].join(' → ');
  const fromLibrary = recipe.looks.machines.filter((r, k) => r && !report.missing.includes(`TycoonMachine${k + 1}`)).length;
  return [
    `**${recipe.title}** is built: ${recipe.players} bases on a street, one for each player.`,
    `- Your ${t.dropper} drops ${t.item.name} onto a conveyor. It goes ${chain}, and each machine makes it worth more.`,
    `- The ${t.seller.name} at the end of the belt pays you ${t.currency} for every one.`,
    `- Step on the green pads to buy, in order: ${tycoonUnlocks(t).map((u) => `${u.label} (${short(u.price)})`).join(', ')}.`,
    fromLibrary ? `- ${fromLibrary} of the machines are models from your library; the rest are built from parts.` : '',
  ].filter(Boolean).join('\n');
}
