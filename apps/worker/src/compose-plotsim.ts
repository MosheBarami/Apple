/**
 * THE PLOT SIMULATOR (owner, 2026-10-01: "make it actually a full game with maps, different keyboards, more gui, a shop,
 * machines and plots for 4 players — if you find assets it's better than generating one from parts").
 *
 * A hub with N claimable plots around it (hub-layout.ts, studded-map.ts), a shop of machines that earn every second on
 * the player's own plot (AppleShop + AppleMachines), presses on your own machines pay, upgrades (AppleUpgrades), rebirth,
 * and the studded simulator HUD (stud-ui.ts plotSimHud).
 *
 * WHAT the game is about is the AGENT's, argument by argument (compose_game's `plotSim`): the machines (their names, what
 * each earns and costs, which model backs each one), the upgrades, the currency and its symbol, the rebirth numbers, the
 * scenery it chose from the library. The harness holds no ladder of its own: it used to recolour the hero in "Classic /
 * Neon / Ice / Gold / Lava / Galaxy" tiers with a keyboard emoji, name library models "Mega / Ultra / Royal ...", and
 * default to "Coins" and a set of tapping upgrades, so every simulator came out as the first one anyone asked for. What
 * it checks is the economy's arithmetic (prices rise, a payback exists) and reports a short ladder as short. Pure:
 * plotSimSteps turns a recipe into composer steps (tests/plot-sim.test.mjs).
 */
import { COMPONENTS } from './components.generated';
import { luau, rng, LANE_WIDTH, plotTiles, retireDefaultSpawn, type LibRef, type Step } from './compose';
import { hubLayout } from './hub-layout';
import { studdedMap, STUD_PALETTE } from './studded-map';
import { plotSimHud, type StudColour } from './stud-ui';
import { readUpgrades, upgradeBlurb, upgradeIcon, type UpgradeSpec } from './upgrades-tool';
import { cleanText } from './compose-tycoon';
import type { MapFacts } from './world-steps';

/** A machine the shop sells: a library model (ref), or a model already in the place (from), recoloured when a hue is given. */
export interface MachineSpec {
  id: string; name: string; price: number; income: number; perPress?: number; icon?: string; colour?: StudColour;
  from?: string;      // a path already in the place, e.g. "Workspace.<Model>"
  hue?: number;       // the colour family of a recoloured copy (0..1 turn)
  ref?: LibRef;       // a library model
}

export interface PlotSimRecipe {
  kind: 'plot-sim';
  title: string; subject: string; seed: number; players: number;
  /** The money's name, in the user's language; the HUD's counter is named for it and every config carries it. */
  currency: string;
  /** Printed before a price; none unless the agent gave one. */
  symbol: string;
  /** The object already in the place that the agent named as the hub's centrepiece (Workspace.<hero>). */
  hero?: string;
  machines: MachineSpec[];
  hubProps: { key: string; ref: LibRef; at: 'shop' | 'sell' | 'hub'; height: number }[];
  /** Library scenery the agent chose, scattered over the island off the roads and plots. */
  decor?: { key: string; ref: LibRef; height: number; count: number }[];
  /** A library piece the agent chose, set along both sides of every road, every ROAD_LAMP_STEP studs. */
  roadside?: { key: string; ref: LibRef; height: number };
  /** The hero's footprint [width, depth]: the hub is made to hold it. */
  heroSize?: [number, number];
  upgrades: UpgradeSpec[];
  rebirth: { cost: number; growth: number; multiplier: number };
  hasComponents?: boolean;                // ServerScriptService.AppleComponents already holds the game's economy
  surface?: 'studs' | 'keep';
  /** The agent asked for the default Baseplate and SpawnLocation to go (the map has its own ground and spawn). */
  clearDefaultGround?: boolean;
}

/** Rebirth numbers used when the agent gives none; reported in the result. */
export const DEFAULT_REBIRTH = { cost: 50_000, growth: 3, multiplier: 0.5 };

const STUD_COLOURS = ['blue', 'pink', 'yellow', 'red', 'purple', 'green', 'orange', 'cyan'];
const LIB = /^[0-9a-f]{8,64}$/;
const asRef = (v: unknown): LibRef | undefined => {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  return typeof o.gameId === 'string' && LIB.test(o.gameId) && typeof o.path === 'string' && o.path.startsWith('/') ? { game: o.gameId, path: o.path } : undefined;
};

/**
 * The machines the agent proposed, checked for what only arithmetic can say: each has a name, a price, an income and a
 * model (a library `look` or a model `from` already in the place); prices rise strictly with each tier (otherwise the
 * cheaper one is never worth buying after the dearer one) and incomes are positive. Anything else about the ladder (how
 * many tiers, what they are called, how fast they pay back) is the agent's design; payback times are returned as
 * information, and a short ladder is reported as short. Pure.
 */
export interface MachineEconomy { name: string; price: number; income: number; paybackSeconds: number }
export function readMachines(raw: unknown): { machines: MachineSpec[]; economy: MachineEconomy[]; notes: string[] } | { error: string; missing: string[] } {
  const list = Array.isArray(raw) ? raw : [];
  if (list.length < 1 || list.length > 6) return { error: 'machines is required: 1 to 6 machines, each { name, price, income, look { gameId, path } or from "Workspace.<Model>" }', missing: ['machines (1 to 6)'] };
  const missing: string[] = [];
  const out: MachineSpec[] = [];
  const notes: string[] = [];
  list.forEach((m, i) => {
    const o = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    const name = cleanText(o.name, 30);
    const price = Number(o.price), income = Number(o.income);
    const ref = asRef(o.look);
    const from = typeof o.from === 'string' && /^Workspace\.[^.\[\]]{1,40}$/.test(o.from) ? o.from : undefined;
    if (!name.text) missing.push(`machines[${i}].name`);
    else if (name.cut) notes.push(`machines[${i}].name was cut to 30 characters`);
    if (!(price >= 1 && price <= 1e12)) missing.push(`machines[${i}].price (a number from 1)`);
    if (!(income > 0 && income <= 1e9)) missing.push(`machines[${i}].income (a number above 0, per second)`);
    if (!ref && !from) missing.push(`machines[${i}].look { gameId, path } or machines[${i}].from "Workspace.<Model>" (what stands on the plot)`);
    const hue = typeof o.hue === 'number' && o.hue >= 0 && o.hue <= 1 ? o.hue : undefined;
    const colour = STUD_COLOURS.includes(String(o.colour)) ? String(o.colour) as StudColour : undefined;
    out.push({
      id: `M${i + 1}`, name: name.text, price: Math.round(price), income, ...(Number(o.perPress) > 0 ? { perPress: Number(o.perPress) } : {}),
      ...(typeof o.icon === 'string' && o.icon.trim() ? { icon: Array.from(o.icon.trim()).slice(0, 2).join('') } : {}),
      ...(colour ? { colour } : {}), ...(ref ? { ref } : {}), ...(from ? { from } : {}), ...(hue !== undefined ? { hue } : {}),
    });
  });
  if (missing.length) return { error: `The machines are missing: ${missing.join('; ')}. Fill them in and call compose_game again.`, missing };
  for (let i = 1; i < out.length; i++) {
    if (!(out[i]!.price > out[i - 1]!.price)) return { error: `machines[${i}].price (${out[i]!.price}) must be higher than machines[${i - 1}].price (${out[i - 1]!.price}): tiers rise in price, or the cheaper one is never worth buying after the dearer one`, missing: [`machines[${i}].price`] };
  }
  const economy = out.map((m) => ({ name: m.name, price: m.price, income: m.income, paybackSeconds: Math.round(m.price / m.income) }));
  if (out.length < 3) notes.push(`a short ladder: ${out.length} machine${out.length === 1 ? '' : 's'}, so the shop sells ${out.length === 1 ? 'one thing' : 'two things'} (the agent may add tiers)`);
  for (const e of economy) {
    if (e.paybackSeconds > 1800) notes.push(`${e.name} pays itself back in about ${Math.round(e.paybackSeconds / 60)} minutes: a very slow tier`);
    if (e.paybackSeconds < 2) notes.push(`${e.name} pays itself back in under 2 seconds: the tier is free in practice`);
  }
  return { machines: out, economy, notes };
}

/** The scenery the agent chose, as the recipe holds it. Pure. */
export function readScenery(raw: unknown): { hubProps: PlotSimRecipe['hubProps']; decor: NonNullable<PlotSimRecipe['decor']>; roadside?: PlotSimRecipe['roadside']; notes: string[] } {
  const hubProps: PlotSimRecipe['hubProps'] = [], decor: NonNullable<PlotSimRecipe['decor']> = [];
  let roadside: PlotSimRecipe['roadside'];
  const notes: string[] = [];
  (Array.isArray(raw) ? raw : []).slice(0, 8).forEach((s, i) => {
    const o = (s && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    const ref = asRef(o.look);
    if (!ref) { notes.push(`scenery[${i}] has no look { gameId, path }: skipped`); return; }
    const height = Math.min(80, Math.max(0.5, Number(o.height) || 8));
    const kind = String(o.kind);
    if (kind === 'roadside') roadside ??= { key: 'RoadSide', ref, height };
    else if (kind === 'shop' || kind === 'hub') hubProps.push({ key: `HubProp_${i + 1}`, ref, at: kind, height });
    else decor.push({ key: `Decor_${i + 1}`, ref, height, count: Math.min(30, Math.max(1, Math.round(Number(o.count) || 8))) });
  });
  return { hubProps, decor, ...(roadside ? { roadside } : {}), notes };
}

/** The library pieces a plot simulator imports, each with its staging key. */
export function plotSimPieces(recipe: PlotSimRecipe): { key: string; ref: LibRef }[] {
  return [
    ...recipe.machines.filter((m) => m.ref).map((m) => ({ key: `Machine_${m.id}`, ref: m.ref! })),
    ...recipe.hubProps.map((p) => ({ key: p.key, ref: p.ref })),
    ...(recipe.decor ?? []).map((d) => ({ key: d.key, ref: d.ref })),
    ...(recipe.roadside ? [{ key: recipe.roadside.key, ref: recipe.roadside.ref }] : []),
  ];
}

/** Tiles on a side of a plot: 4x4 is a base with room for a ladder of machines, not a 3x3 doormat. */
export const PLOT_TILES = 4;
/** Studs between a plot's tile centres: a machine is a tile wide. */
export const PLOT_TILE = 9;
/** Studs between two lamps on one side of a road. */
export const ROAD_LAMP_STEP = 16;

export function plotSimSteps(recipe: PlotSimRecipe): Step[] {
  const steps: Step[] = [];
  const layout = hubLayout(recipe.seed, recipe.players, { plotTiles: PLOT_TILES, tile: PLOT_TILE, ...(recipe.heroSize ? { hero: recipe.heroSize } : {}) });
  const hub = layout.hub!;
  const staged = plotSimPieces(recipe);

  // 1. Folders. AppleComponents is created only when the place does not have it: an object's economy and upgrades
  //    (add_upgrades) already live there, and a create replaces what it names.
  steps.push({ kind: 'create', parent: 'game.ServerStorage', items: [
    { className: 'Folder', name: 'AppleParts', children: staged.map((s) => ({ className: 'Folder', name: s.key })) },
    { className: 'Folder', name: 'AppleDefenders' },
  ] });
  if (!recipe.hasComponents) steps.push({ kind: 'create', parent: 'game.ServerScriptService', items: [{ className: 'Folder', name: 'AppleComponents' }] });
  steps.push({ kind: 'create', parent: 'game.ReplicatedStorage', items: [{ className: 'Folder', name: 'AppleComponents' }] });

  // 2. The library pieces.
  for (const s of staged) steps.push({ kind: 'import', key: s.key, ref: s.ref, into: `game.ServerStorage.AppleParts.${s.key}` });

  // 3. The hub map: plots in a ring, spoke roads, the shop and sell pads (studded-map.ts hub mode).
  const mapItems = studdedMap({
    layout, tile: PLOT_TILE, plotTiles: (c) => plotTiles(c, layout.plotTiles, PLOT_TILE), plotHalf: (PLOT_TILE * (layout.plotTiles ?? 3)) / 2, laneWidth: LANE_WIDTH,
    seed: rng(recipe.seed ^ 0x51ed), words: { plot: 'Plot', shop: 'SHOP', sell: 'REBIRTH' }, // a plot simulator sells nothing: the second pad opens Rebirth (AppleMachinesClient)
  }, STUD_PALETTE);
  steps.push({ kind: 'create', parent: 'game.Workspace', items: [{ className: 'Folder', name: 'AppleMap', children: [...mapItems, { className: 'Folder', name: 'Props' }] }] });
  // The default Baseplate and SpawnLocation are the user's until the agent says the map replaces them (clearDefaultGround).
  // Lighting is not touched: set_mood is the agent's own call.
  if (recipe.clearDefaultGround) steps.push({ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] });
  else steps.push(...retireDefaultSpawn());

  // 4. The hub's library props beside their pads.
  let n = 0;
  for (const p of recipe.hubProps) {
    const at = p.at === 'shop' ? hub.shopPad : p.at === 'sell' ? hub.sellPad : hub.center;
    const off = p.at === 'hub' ? [hub.radius * 0.6, 0] : [0, 0];
    steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${p.key}`, parent: 'Workspace.AppleMap.Props', name: `HubProp${++n}`,
      at: [at[0] + off[0]!, 0, at[1] + off[1]!], yaw: Math.round((Math.atan2(-at[0], -at[1]) * 180) / Math.PI), height: p.height });
  }
  // Pieces along the roads, alternating sides, facing the road.
  if (recipe.roadside) {
    let k = 0;
    for (const spoke of hub.spokes) {
      const a = spoke[0]!, b = spoke[spoke.length - 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len < 8) continue;
      const [ux, uz] = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      for (let d = ROAD_LAMP_STEP / 2, side = 1; d < len - 2; d += ROAD_LAMP_STEP, side = -side) {
        const off = side * (LANE_WIDTH / 2 + 2);
        const x = a[0] + ux * d - uz * off, z = a[1] + uz * d + ux * off;
        steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${recipe.roadside.key}`, parent: 'Workspace.AppleMap.Props', name: `RoadSide${++k}`,
          at: [Math.round(x * 10) / 10, 0, Math.round(z * 10) / 10], yaw: Math.round((Math.atan2(uz * side, -ux * side) * 180) / Math.PI), height: recipe.roadside.height });
      }
    }
  }
  // The island's scenery: each library piece copied over the free ground (layout.scatter is off roads, plots and hub).
  const turn = rng(recipe.seed ^ 0xdec0);
  let spot = 0;
  for (const d of recipe.decor ?? []) {
    for (let k = 0; k < d.count && spot < layout.scatter.length; k++, spot++) {
      const [x, z] = layout.scatter[spot]!;
      steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${d.key}`, parent: 'Workspace.AppleMap.Props', name: `${d.key}_${k + 1}`,
        at: [x, 0, z], yaw: Math.round(turn() * 360), height: Math.round(d.height * (0.8 + turn() * 0.4)) });
    }
  }

  // 5. The components: money, the shop on plots, machines that earn, upgrades, presses, the HUD, effects, boot.
  const want = ['economy', 'shop', 'machines', 'upgrades', 'animate', 'gameui', 'fx', 'boot'];
  for (const id of want) {
    const c = COMPONENTS[id];
    if (!c) throw new Error(`component ${id} is not bundled`);
    for (const f of c.files) steps.push({ kind: 'script', className: f.className, parent: `game.${f.parent}`, name: f.name, source: f.source });
  }

  // 6. The config the systems read. Machines are staged by AppleBoot into ServerStorage.AppleDefenders, where the shop
  //    finds what it sells: a model already in the place (recoloured when a hue is given) or a library model, fitted to a plot tile.
  const stage = recipe.machines.map((m) => ({
    from: m.from ?? `ServerStorage.AppleParts.Machine_${m.id}`, to: 'ServerStorage.AppleDefenders', name: m.id, width: PLOT_TILE - 0.6,
    ...(m.hue !== undefined ? { hue: m.hue } : {}),
  }));
  const config = {
    title: recipe.title,
    start: ['AppleShop', 'AppleMachines'],
    stage,
    economy: { currency: recipe.currency, start: recipe.machines[0]?.price ?? 25 },
    shop: {
      refund: 0.5,
      // Every player's plot starts with the cheapest machine already earning (AppleShop giveStarter).
      ...(recipe.machines[0] ? { starter: recipe.machines[0].id } : {}),
      // A machine is not a tower: no range, damage or rate in its shop row. AppleShop's defaults stand in.
      items: recipe.machines.map((m) => ({ id: m.id, name: m.name, price: m.price, unlock: 0, blurb: `+${m.income}/s` })),
    },
    machines: Object.fromEntries(recipe.machines.map((m) => [m.id, { income: m.income, ...(m.perPress ? { perPress: m.perPress } : {}) }])),
    rebirth: recipe.rebirth,
  };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ServerScriptService.AppleComponents', name: 'AppleGameConfig',
    source: `-- ${recipe.title.replace(/[\r\n]/g, ' ')}: what this game's systems read. Written by StudPilot's composer; edit freely.\nreturn ${luau(config)}\n` });
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage.AppleComponents', name: 'AppleClientConfig',
    source: `-- ${recipe.title.replace(/[\r\n]/g, ' ')}: what the screens show. Written by StudPilot's composer; edit freely.\nreturn ${luau({ currency: recipe.currency, counter: recipe.currency, ...(recipe.symbol ? { symbol: recipe.symbol } : {}), words: { shop: 'Shop', plot: 'Plot' } })}\n` });
  // The upgrades screen is the simulator HUD's own Upgrades panel (AppleUpgradesClient reads these names); the money counter
  // is named for the currency, so a renamed currency is found by name everywhere.
  const upgradesConfig = { currency: recipe.currency, screen: 'AppleHUD', counter: recipe.currency, button: 'Upgrades', panel: 'UpgradesPanel', perPress: 1, upgrades: recipe.upgrades,
    ...(recipe.symbol ? { symbol: recipe.symbol } : {}) };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage', name: 'AppleUpgradesConfig',
    source: `-- The game's upgrades (AppleUpgrades). Written by StudPilot's composer; edit freely.\nreturn ${luau(upgradesConfig)}\n` });

  // 7. Studs on the map and on every library piece.
  if ((recipe.surface ?? 'studs') === 'studs') steps.push({ kind: 'surface', surface: 'studs', paths: ['game.Workspace.AppleMap', 'game.ServerStorage.AppleParts'] });

  // 8. The simulator HUD.
  steps.push({ kind: 'create', parent: 'game.StarterGui', items: [plotSimHud(
    recipe.machines.map((m) => ({ id: m.id, name: m.name, price: m.price, income: m.income, icon: m.icon, colour: m.colour })),
    recipe.upgrades.map((u) => ({ id: u.id, label: u.label, cost: u.cost, icon: upgradeIcon(u), blurb: upgradeBlurb(u, recipe.currency) })),
    { currency: recipe.currency, symbol: recipe.symbol, shop: 'Shop', upgrades: 'Upgrades', rebirth: 'Rebirth' },
  )] });
  return steps;
}

/**
 * The map this recipe builds, in the numbers the world pass needs to give the agent concrete steps (world-steps.ts): the island's
 * bounds, the hub, each plot, and eight spots of free ground. From the same layout the steps were made from, so nothing is measured
 * twice and nothing is guessed.
 */
export function plotSimMapFacts(recipe: PlotSimRecipe): MapFacts {
  const layout = hubLayout(recipe.seed, recipe.players, { plotTiles: PLOT_TILES, tile: PLOT_TILE, ...(recipe.heroSize ? { hero: recipe.heroSize } : {}) });
  const hub = layout.hub!;
  const stride = Math.max(1, Math.floor(layout.scatter.length / 8));
  return {
    root: 'game.Workspace.AppleMap',
    ground: { center: layout.ground.center, half: [layout.ground.size[0] / 2, layout.ground.size[1] / 2] },
    hub: { path: 'game.Workspace.AppleMap.Hub', center: hub.center, half: hub.radius },
    plots: layout.plots.map((at, i) => ({ path: `game.Workspace.AppleMap.Plots.Plot${i + 1}`, at })),
    free: layout.scatter.filter((_, i) => i % stride === 0).slice(0, 8),
    frame: (PLOT_TILES * PLOT_TILE) / 2 + 1,
  };
}

/** Where the hero goes: the centre of the hub. */
export function heroSpot(recipe: PlotSimRecipe): [number, number] {
  return hubLayout(recipe.seed, recipe.players, { plotTiles: PLOT_TILES, tile: PLOT_TILE, ...(recipe.heroSize ? { hero: recipe.heroSize } : {}) }).hub!.heroSpot;
}

/** What compose_game's `plotSim` argument holds, read and checked, or what is missing. Pure. */
export function readPlotSim(given: unknown, seed: number, hasComponents: boolean): { recipe: PlotSimRecipe; economy: MachineEconomy[]; notes: string[]; defaults: string[] } | { error: string; missing: string[] } {
  const g = (given && typeof given === 'object' ? given : {}) as Record<string, unknown>;
  const missing: string[] = [];
  const notes: string[] = [];
  const text = (v: unknown, path: string, max: number): string => { const c = cleanText(v, max); if (!c.text) missing.push(path); else if (c.cut) notes.push(`${path} was cut to ${max} characters`); return c.text; };
  const title = text(g.title, 'title', 40);
  const subject = text(g.subject, 'subject', 30);
  const currency = text(g.currency, 'currency', 12).replace(/[\s.\[\]]/g, '');
  if (!currency && !missing.includes('currency')) missing.push('currency');
  const machines = readMachines(g.machines);
  if ('error' in machines) missing.push(...machines.missing);
  const upgrades = readUpgrades(g.upgrades);
  if ('error' in upgrades) missing.push('upgrades (1 to 9: { label, kind, amount, cost })');
  if (missing.length || 'error' in machines || 'error' in upgrades) {
    const why = 'error' in machines && !missing.some((m) => !machines.missing.includes(m)) ? machines.error : `The plot simulator is missing: ${missing.join('; ')}. Fill them from the user's request and call compose_game again.`;
    return { error: why, missing };
  }
  const defaults: string[] = [];
  const rb = (g.rebirth && typeof g.rebirth === 'object' ? g.rebirth : {}) as Record<string, unknown>;
  const num = (v: unknown, d: number, lo: number, hi: number, label: string) => { if (typeof v === 'number' && v >= lo && v <= hi) return v; defaults.push(`rebirth.${label} = ${d}`); return d; };
  const rebirth = { cost: num(rb.cost, DEFAULT_REBIRTH.cost, 1, 1e15, 'cost'), growth: num(rb.growth, DEFAULT_REBIRTH.growth, 1, 100, 'growth'), multiplier: num(rb.multiplier, DEFAULT_REBIRTH.multiplier, 0.01, 100, 'multiplier') };
  const scenery = readScenery(g.scenery);
  const players = Math.max(2, Math.min(8, Math.round(Number(g.players) || 4)));
  if (g.players === undefined) defaults.push('players = 4');
  const hero = typeof g.hero === 'string' && /^[^.\[\]\\"]{1,40}$/.test(g.hero.replace(/^game\.Workspace\./, '')) ? g.hero.replace(/^game\.Workspace\./, '') : undefined;
  return {
    recipe: {
      kind: 'plot-sim', title, subject, seed, players, currency, symbol: cleanText(g.symbol, 3).text,
      ...(hero ? { hero } : {}),
      machines: machines.machines, hubProps: scenery.hubProps, ...(scenery.decor.length ? { decor: scenery.decor } : {}), ...(scenery.roadside ? { roadside: scenery.roadside } : {}),
      upgrades, rebirth, hasComponents, ...(g.clearDefaultGround === true ? { clearDefaultGround: true } : {}),
    },
    economy: machines.economy, notes: [...notes, ...machines.notes, ...scenery.notes], defaults,
  };
}
