/**
 * THE PLOT SIMULATOR (owner, 2026-10-01: "make it actually a full game with maps, different keyboards, more gui, a shop,
 * machines and plots for 4 players — if you find assets it's better than generating one from parts").
 *
 * compose_game had one template (orchard lane defense); every other idea fell through to "build it yourself", and the
 * model built plots and screens out of single parts. This is the second template, and the general one for "turn this
 * into a game": a hub with N claimable plots around it (hub-layout.ts, studded-map.ts), a shop of machines that earn
 * every second on the player's own plot (AppleShop + AppleMachines), presses on your own machines pay, upgrades
 * (AppleUpgrades), rebirth, and the studded simulator HUD (stud-ui.ts plotSimHud).
 *
 * Library first: the machines are the player's own object when the place has one (build_object's model, recoloured
 * per tier and fitted to a plot tile) plus models of the same subject found in the owner library; the hub's props are
 * library pieces. Pure: plotSimSteps turns a recipe into composer steps (tests/plot-sim.test.mjs).
 */
import { COMPONENTS } from './components.generated';
import { luau, rng, LANE_WIDTH, plotTiles, type LibRef, type Step } from './compose';
import { hubLayout } from './hub-layout';
import { studdedMap, studLighting, STUD_PALETTE } from './studded-map';
import { plotSimHud, type StudColour } from './stud-ui';
import { DEFAULT_UPGRADES, KIND_ICON, upgradeBlurb, type UpgradeSpec } from './upgrades-tool';

/** A machine the shop sells: the player's own object recoloured (from), or a library model (ref). */
export interface MachineSpec {
  id: string; name: string; price: number; income: number; perPress?: number; icon?: string; colour?: StudColour;
  from?: string;      // a path already in the place, e.g. "Workspace.ASMRKeyboard"
  hue?: number;       // the colour family of a recoloured copy (0..1 turn)
  ref?: LibRef;       // a library model
}

export interface PlotSimRecipe {
  kind: 'plot-sim';
  title: string; subject: string; seed: number; players: number;
  currency: 'Coins';                      // AppleGameUI's money counter is named Coins
  hero?: string;                          // the object already in the place (Workspace.<hero>), the hub's centrepiece
  machines: MachineSpec[];
  hubProps: { key: string; ref: LibRef; at: 'shop' | 'sell' | 'hub'; height: number }[];
  /** Library scenery (trees, rocks) scattered over the island off the roads and plots: a map, not a flat square. */
  decor?: { key: string; ref: LibRef; height: number; count: number }[];
  /** A library street light set along both sides of every road, every ROAD_LAMP_STEP studs. */
  roadside?: { key: string; ref: LibRef; height: number };
  /** The hero's footprint on its stage [width, depth]: the hub is made to hold it. */
  heroSize?: [number, number];
  upgrades: UpgradeSpec[];
  rebirth: { cost: number; growth: number; multiplier: number };
  hasComponents?: boolean;                // ServerScriptService.AppleComponents already holds the game's economy
  surface?: 'studs' | 'keep';
}

const SIM = /\b(simulator|sim|tycoon|idle|clicker|incremental|plots?|machines?|factory|rebirths?)\b/i;
const FULL_GAME = /\b(make|turn) (it|this|that)( actually| into)?( a| an)? (full|fully|real|whole|proper)?\s*(game|simulator|tycoon)\b/i;

/** "a keyboard simulator with plots", "make it actually a full game with ... plots for 4 players". Pure. */
export function isPlotSimRequest(text: string | undefined): boolean {
  const t = String(text ?? '');
  return SIM.test(t) || FULL_GAME.test(t);
}

/** "for 4 players", "6 plots"; 4 when unsaid, 2..8. Pure. */
export function playersIn(text: string | undefined): number {
  const m = /\b(\d{1,2})\s*(players?|plots?)\b/i.exec(String(text ?? ''));
  const n = m ? Number(m[1]) : 4;
  return Math.max(2, Math.min(8, Number.isFinite(n) ? n : 4));
}

/** What the game is about: the hero's own words ("ASMRKeyboard" -> "keyboard"), else the noun before "simulator". Pure. */
export function subjectOf(text: string | undefined, hero?: string): string {
  if (hero) {
    const words = hero.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').split(/[^A-Za-z]+/).filter(Boolean);
    const last = words[words.length - 1];
    if (last) return last.toLowerCase();
  }
  const m = /\b([a-z]+)\s+(simulator|tycoon|factory|clicker)\b/i.exec(String(text ?? ''));
  return m ? m[1]!.toLowerCase() : 'machine';
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const TIER_NAMES = ['Classic', 'Neon', 'Ice', 'Gold', 'Lava', 'Galaxy'];
const TIER_HUES = [0, 0.83, 0.55, 0.13, 0.02, 0.72];
const TIER_COLOURS: StudColour[] = ['blue', 'pink', 'blue', 'yellow', 'red', 'purple'];

/**
 * The machines: up to four tiers of the hero recoloured, then the library's own models of the subject, each tier
 * dearer and earning more. Prices grow about 4.5x a tier and income about 3.5x, so every tier is worth buying. Pure.
 */
export function machineLadder(subject: string, hero: string | undefined, library: LibRef[]): MachineSpec[] {
  const out: MachineSpec[] = [];
  const tier = (i: number) => ({ price: Math.round(25 * 4.5 ** i), income: Math.max(1, Math.round(1 * 3.5 ** i)) });
  // Different models first (owner, 2026-10-01: "different keyboards"; four of six were the hero recoloured): the
  // hero's own Classic opens the ladder, the library's models fill the middle, and the hero in gold tops it. Recoloured
  // tiers only make up what the library could not.
  const heroTiers = hero ? Math.min(4, Math.max(2, 6 - library.length)) : 0;
  const heroTier = (i: number) => {
    out.push({ id: `${cap(subject)}${TIER_NAMES[i]}`, name: `${TIER_NAMES[i]} ${cap(subject)}`, ...tier(out.length), perPress: 1 + out.length,
      from: `Workspace.${hero}`, ...(TIER_HUES[i] ? { hue: TIER_HUES[i] } : {}), icon: '⌨️', colour: TIER_COLOURS[i] });
  };
  const middle = heroTiers > 2 ? [1, 2].slice(0, heroTiers - 2) : [];
  if (hero) { heroTier(0); for (const i of middle) heroTier(i); }
  library.slice(0, 6 - heroTiers).forEach((ref, k) => {
    // Named for what it is (owner's play test, 2026-10-01: a grand piano was sold as "Royal Keyboard").
    const own = (ref.path.split('/').pop() ?? '').replace(/[^A-Za-z ]+/g, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 3).map(cap).join(' ');
    out.push({ id: `${cap(subject)}Lib${k + 1}`, name: `${['Mega', 'Ultra', 'Royal', 'Mythic', 'Cosmic', 'Titan'][k]} ${own.length >= 3 && own.length <= 20 ? own : cap(subject)}`, ...tier(out.length),
      ref, icon: '✨', colour: TIER_COLOURS[(out.length) % TIER_COLOURS.length] });
  });
  if (hero) heroTier(3);
  return out;
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
/** Studs between a plot's tile centres: a machine is a tile wide, and at the lane-defense 6 a 76-stud keyboard was a
 *  5.4-stud mat (owner's critique, 2026-10-01). */
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
  steps.push({ kind: 'delete', paths: ['game.Workspace.Baseplate', 'game.Workspace.SpawnLocation'] });
  const light = studLighting();
  steps.push({ kind: 'set', path: 'game.Lighting', props: light.props });
  steps.push({ kind: 'create', parent: 'game.Lighting', items: light.effects });

  // 4. The hub's library props beside their pads.
  let n = 0;
  for (const p of recipe.hubProps) {
    const at = p.at === 'shop' ? hub.shopPad : p.at === 'sell' ? hub.sellPad : hub.center;
    const off = p.at === 'hub' ? [hub.radius * 0.6, 0] : [0, 0];
    steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${p.key}`, parent: 'Workspace.AppleMap.Props', name: `HubProp${++n}`,
      at: [at[0] + off[0]!, 0, at[1] + off[1]!], yaw: Math.round((Math.atan2(-at[0], -at[1]) * 180) / Math.PI), height: p.height });
  }
  // Lamps along the roads, alternating sides, facing the road (owner's critique, 2026-10-01: the roads were bare).
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
        steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${recipe.roadside.key}`, parent: 'Workspace.AppleMap.Props', name: `RoadLamp${++k}`,
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
      steps.push({ kind: 'place', from: `ServerStorage.AppleParts.${d.key}`, parent: 'Workspace.AppleMap.Props', name: `${d.key}${k + 1}`,
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
  //    finds what it sells: the hero recoloured per tier and fitted to a plot tile, library models fitted the same way.
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
      items: recipe.machines.map((m) => ({ id: m.id, name: m.name, price: m.price, range: 0, damage: 0, rate: 0, unlock: 0, blurb: `+${m.income}/s` })),
    },
    machines: Object.fromEntries(recipe.machines.map((m) => [m.id, { income: m.income, ...(m.perPress ? { perPress: m.perPress } : {}) }])),
    rebirth: recipe.rebirth,
  };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ServerScriptService.AppleComponents', name: 'AppleGameConfig',
    source: `-- ${recipe.title}: what this game's systems read. Written by Apple's composer; edit freely.\nreturn ${luau(config)}\n` });
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage.AppleComponents', name: 'AppleClientConfig',
    source: `-- ${recipe.title}: what the screens show. Written by Apple's composer; edit freely.\nreturn ${luau({ currency: recipe.currency, words: { shop: 'Shop', plot: 'Plot' } })}\n` });
  // The upgrades screen is the simulator HUD's own Upgrades panel (AppleUpgradesClient reads these names).
  const upgradesConfig = { currency: recipe.currency, screen: 'AppleHUD', counter: 'Coins', button: 'Upgrades', panel: 'UpgradesPanel', perPress: 1, upgrades: recipe.upgrades };
  steps.push({ kind: 'script', className: 'ModuleScript', parent: 'game.ReplicatedStorage', name: 'AppleUpgradesConfig',
    source: `-- The game's upgrades (AppleUpgrades). Written by Apple's composer; edit freely.\nreturn ${luau(upgradesConfig)}\n` });

  // 7. Studs on the map and on every library piece (the hero keeps its own smooth keycaps: it is not under these).
  if ((recipe.surface ?? 'studs') === 'studs') steps.push({ kind: 'surface', surface: 'studs', paths: ['game.Workspace.AppleMap', 'game.ServerStorage.AppleParts'] });

  // 8. The simulator HUD, then the hero's own small screen goes (its counter and upgrades are part of this one now).
  //    The new screen comes first: live 2026-10-01 the old one was deleted, the new one was refused, and there was none.
  steps.push({ kind: 'create', parent: 'game.StarterGui', items: [plotSimHud(
    recipe.machines.map((m) => ({ id: m.id, name: m.name, price: m.price, income: m.income, icon: m.icon, colour: m.colour })),
    recipe.upgrades.map((u) => ({ id: u.id, label: u.label, cost: u.cost, icon: u.icon ?? KIND_ICON[u.kind], blurb: upgradeBlurb(u, recipe.currency) })),
    { currency: recipe.currency, shop: 'Shop', upgrades: 'Upgrades', rebirth: 'Rebirth' },
  )] });
  if (recipe.hero) {
    steps.push({ kind: 'delete', paths: [`game.StarterGui.${recipe.hero}HUD`, `game.StarterPlayer.StarterPlayerScripts.${recipe.hero}HUDScript`] });
  }
  return steps;
}

/** Where the hero goes: the centre of the hub. */
export function heroSpot(recipe: PlotSimRecipe): [number, number] {
  return hubLayout(recipe.seed, recipe.players, { plotTiles: PLOT_TILES, tile: PLOT_TILE, ...(recipe.heroSize ? { hero: recipe.heroSize } : {}) }).hub!.heroSpot;
}

/** The recipe for an idea, given what the place and the library hold. Pure. */
export function plotSimRecipe(idea: string, seed: number, found: { hero?: string; library: LibRef[]; hubProps: PlotSimRecipe['hubProps']; hasComponents: boolean }): PlotSimRecipe {
  const subject = subjectOf(idea, found.hero);
  return {
    kind: 'plot-sim', title: `${cap(subject)} Simulator`, subject, seed, players: playersIn(idea), currency: 'Coins',
    ...(found.hero ? { hero: found.hero } : {}),
    machines: machineLadder(subject, found.hero, found.library),
    hubProps: found.hubProps,
    upgrades: DEFAULT_UPGRADES,
    rebirth: { cost: 50_000, growth: 3, multiplier: 0.5 },
    hasComponents: found.hasComponents,
  };
}
