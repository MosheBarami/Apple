/**
 * compose_game: a NEW game made from components on a map made for it, in the user's Studio (compose.ts, compose-run.ts). It
 * replaces plan_game/build_game, which copied a whole saved game and cut it down (rejected by the owner, 2026-09-30).
 *
 * THE AGENT CHOOSES AND FILLS THE TEMPLATE (owner directive "generalize-not-patch", 2026-10-02). The tool used to read the
 * request itself: a regex routed an idea to a template, tables of trades supplied the machines (laundry, bakery, pizza...),
 * a hero object found in the place decided the subject, and library searches picked the look of every machine by comparing
 * names. Every game came out as whatever an earlier benchmark had been about. Now the agent names the `template`, supplies
 * everything that makes THIS game what it is (names, the chain, the machines, the economy, the library pieces it chose), and
 * the tool validates what only arithmetic and structure can say, reports what is missing by name, and builds. An idea no
 * template can express is not refused: the tool lists what each template makes and cannot make, and the agent builds it
 * another way.
 */
import type { AgentCtx } from './tools';
import { composeSteps } from './compose';
import { PLAY_TEST_STOP, runSteps } from './compose-run';
import { libraryReady, librarySafetyCopy } from './local-owner-corpus';
import { userWantsOwnSurface } from './surfaces';
import { tycoonEconomy, tycoonForUser, tycoonRecipe, tycoonSteps, tycoonTheme, tycoonUnlocks } from './compose-tycoon';
import { heroSpot, plotSimSteps, readPlotSim } from './compose-plotsim';
import { LANE_NEEDS, readLaneDefense } from './compose-lane';
import { bounds } from './library-object';

/** A stable seed from the idea's words, so the same idea lays out the same map and a new idea a new one. */
export function ideaSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase().replace(/\s+/g, ' ').trim()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

/** What each template makes and cannot make, and what it needs from the agent. Information for choosing. */
export const TEMPLATES = [
  {
    template: 'tycoon',
    makes: 'a base per player where droppers drop an item onto a conveyor, machines over the belt turn it into the next thing and multiply its worth, a seller pays the owner, and buy pads unlock the next dropper or machine',
    cannot: 'combat, waves, shared worlds, anything without a belt-and-machines chain',
    needs: 'tycoon { title, currency, item { name, color, shape?, size?, material? }, dropper, machines[1-4] { name, becomes, color, times?, look? { gameId, path } }, seller { name, look? } }; optional: players, prices, symbol',
  },
  {
    template: 'plot-sim',
    makes: 'a hub with claimable plots around it, a shop of machines that earn every second on your plot, upgrades, rebirth and a studded HUD',
    cannot: 'a belt chain, combat, anything without plots and a shop',
    needs: 'plotSim { title, subject, currency, machines[1-6] { name, price, income, look { gameId, path } or from "Workspace.<Model>" }, upgrades[1-9] { label, kind, amount, cost } }; optional: players, rebirth, symbol, scenery[], hero',
  },
  {
    template: 'lane-defense',
    makes: 'enemies that walk a road to a base in waves while the player buys defenders and places them on plots beside the road',
    cannot: 'anything without a road, waves and placed defenders',
    needs: LANE_NEEDS,
  },
] as const;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** What stopped a build, in the user's words. */
function stoppedText(why: string): string {
  return why === PLAY_TEST_STOP
    ? 'Studio is in a Play test, so nothing could be built. Stop the test (the red square at the top of Studio), then ask again.'
    : 'Studio disconnected while the game was being built, so it is only partly there. Reconnect and ask again to finish it.';
}

/** What a composed game earlier left in the place: facts, so the agent chooses `extend` or `replace`. */
async function readExisting(ctx: AgentCtx): Promise<{ map: boolean; components: string[] }> {
  const map = await ctx.execStudioOp({ op: 'get_instance', path: 'game.Workspace.AppleMap' }, 15_000).catch(() => null);
  const comps = await ctx.execStudioOp({ op: 'get_tree', root: 'game.ServerScriptService.AppleComponents', maxDepth: 1, maxNodes: 80 }, 20_000).catch(() => null);
  const kids = comps?.ok ? ((comps.data as { root?: { children?: { name?: string }[] } }).root?.children ?? []) : [];
  return { map: map?.ok === true, components: comps?.ok ? kids.map((k) => String(k.name ?? '')).filter(Boolean).slice(0, 20) : [] };
}

/** The earlier composed game's own folders: removed only when the agent said `existing: "replace"`. */
const COMPOSED_PATHS = ['game.Workspace.AppleMap', 'game.ServerScriptService.AppleComponents', 'game.ReplicatedStorage.AppleComponents', 'game.ServerStorage.AppleParts',
  'game.ServerStorage.AppleDefenders', 'game.ServerStorage.AppleEnemies', 'game.ServerStorage.AppleTycoonParts', 'game.StarterGui.AppleHUD', 'game.StarterGui.TycoonHUD'];

export async function composeGame(ctx: AgentCtx, a: Record<string, unknown>) {
  const blocked = libraryReady(ctx);
  if (blocked) return { error: blocked };
  const idea = String(a.request ?? '').trim() || ctx.userRequest?.() || '';
  const template = String(a.template ?? '');
  // No template named, or one that is not offered: not a refusal, a menu. The agent builds it another way if none fits.
  if (!TEMPLATES.some((t) => t.template === template)) {
    return {
      changed: false, template: 'none', templates: TEMPLATES,
      note: `Pass template (${TEMPLATES.map((t) => t.template).join(' | ')}) and its argument object. If none of these can make the user's idea, nothing was built by this tool: build it with your other tools (search the library, preview, build_object, dress_object) and do not tell the user it cannot be done.`,
    };
  }
  // What an earlier composed game left: said, and the agent decides.
  const existing = await readExisting(ctx);
  const choice = String(a.existing ?? '');
  if ((existing.map || existing.components.length) && choice !== 'extend' && choice !== 'replace') {
    return {
      changed: false, template, existing,
      note: 'The place already holds a composed game or components (the map and the scripts listed). Nothing was changed. Pass existing: "extend" to build on what is there (its economy and components stay) or existing: "replace" to remove that game first. Pick the one the user\'s message calls for; it may have nothing to do with the earlier game.',
    };
  }
  const hasComponents = choice === 'extend' && existing.components.length > 0;
  const seed = ideaSeed(idea || template);
  const surface = userWantsOwnSurface(idea) ? 'keep' : 'studs';
  const clearDefaultGround = a.clearDefaultGround === true;

  let steps; let title = ''; let forUser = ''; let extra: Record<string, unknown> = {}; let afterRun: ((report: { problems: string[]; critical: string[] }) => Promise<void>) | undefined;
  let verify: (() => Promise<string[]>) | undefined;
  if (template === 'tycoon') {
    const t = tycoonTheme(a.tycoon);
    if ('error' in t) return { changed: false, template, error: t.error, missing: t.missing };
    const recipe = tycoonRecipe(seed, t.theme, hasComponents);
    recipe.surface = surface; recipe.clearDefaultGround = clearDefaultGround;
    steps = tycoonSteps(recipe); title = recipe.title;
    const unlocks = tycoonUnlocks(t.theme);
    extra = {
      game: recipe.title, template: 'tycoon', chain: [t.theme.item.name, ...t.theme.machines.map((m) => m.becomes)],
      economy: { pads: tycoonEconomy(t.theme, unlocks), note: 'Information: seconds to afford each pad in order with one dropper (item worth 1). Pass tycoon.prices to change the curve.' },
      ...(t.notes.length ? { notes: t.notes } : {}),
      ...(t.theme.prices ? {} : { defaults: ['pad prices: the documented defaults'] }),
    };
    forUser = tycoonForUser(recipe, { missing: [] });
    verify = async () => {
      const out: string[] = [];
      const hud = await ctx.execStudioOp({ op: 'get_instance', path: 'game.StarterGui.TycoonHUD' }, 20_000).catch(() => null);
      if (!hud?.ok) out.push("the game's screen is not in StarterGui");
      const bases = await ctx.execStudioOp({ op: 'get_instance', path: 'game.Workspace.AppleMap.Tycoons.1.Conveyor' }, 20_000).catch(() => null);
      if (!bases?.ok) out.push('the bases were not built');
      return out;
    };
  } else if (template === 'plot-sim') {
    const p = readPlotSim(a.plotSim, seed, hasComponents);
    if ('error' in p) return { changed: false, template, error: p.error, missing: p.missing };
    const recipe = p.recipe;
    recipe.surface = surface;
    // The hero is the agent's own naming: measured here so the hub is made to hold it, and moved onto the hub after.
    let hb: Awaited<ReturnType<typeof bounds>> = null;
    if (recipe.hero) {
      hb = await bounds(ctx.execStudioOp, `game.Workspace.${recipe.hero}`);
      if (!hb) return { changed: false, template, error: `hero: game.Workspace.${recipe.hero} is not in the place (or has no measurable size). Name an object that exists, or leave hero out.` };
      recipe.heroSize = [Math.max(hb.size[0], 1), Math.max(hb.size[2], 1)];
    }
    steps = plotSimSteps(recipe); title = recipe.title;
    extra = {
      game: recipe.title, template: 'plot-sim',
      machines: recipe.machines.map((m) => `${m.name} (${m.price}, +${m.income}/s${m.ref ? ', from the library' : m.from ? ', a model from your place' : ''})`),
      economy: { machines: p.economy, note: 'Information: seconds for each machine to pay for itself.' },
      ...(p.notes.length ? { notes: p.notes } : {}), ...(p.defaults.length ? { defaults: p.defaults } : {}),
    };
    const libNames = recipe.machines.filter((m) => m.ref).length;
    forUser = [
      recipe.hero ? `Your ${recipe.subject} is now **${recipe.title}**: a hub with it in the middle and ${recipe.players} plots around it, one for each player.` : `**${recipe.title}** is ready: a hub and ${recipe.players} plots around it, one for each player.`,
      `- Every player starts on their own plot with a free ${recipe.machines[0]?.name ?? recipe.subject} already earning ${recipe.currency}.`,
      `- The Shop (button, or the SHOP pad in the hub) sells ${plural(recipe.machines.length, 'machine')}: ${recipe.machines.map((m) => m.name).join(', ')}${libNames ? ` (${libNames} from your library)` : ''}. Each earns every second; pressing your own pays extra.`,
      `- Upgrades make every press and every second worth more; Rebirth starts you over with a permanent boost.`,
    ].join('\n');
    verify = async () => {
      const hud = await ctx.execStudioOp({ op: 'get_instance', path: 'game.StarterGui.AppleHUD' }, 20_000).catch(() => null);
      return hud?.ok ? [] : ["the game's screen is not in StarterGui"];
    };
    afterRun = async (report) => {
      if (!recipe.hero || !hb) return;
      // The hero moves onto the hub's centre and stands on its plaza. Its own stage (if the agent made one) stays: the agent decides.
      const [hx, hz] = heroSpot(recipe);
      const moved = await ctx.execStudioOp({ op: 'transform_instances', paths: [`game.Workspace.${recipe.hero}`], move: [hx - hb.center[0], 0.8 - hb.bottomY, hz - hb.center[2]] }, 30_000).catch(() => null);
      if (!moved?.ok) report.problems.push(`${recipe.hero} could not be moved onto the hub`);
    };
  } else {
    const l = readLaneDefense(a.laneDefense, seed);
    if ('error' in l) return { changed: false, template, error: l.error, missing: l.missing };
    const recipe = l.recipe;
    recipe.surface = surface; recipe.clearDefaultGround = clearDefaultGround;
    steps = composeSteps(recipe); title = recipe.title;
    extra = { game: recipe.title, template: 'lane-defense', ...(l.notes.length ? { notes: l.notes } : {}), ...(l.defaults.length ? { defaults: l.defaults } : {}) };
    forUser = `I built ${recipe.title}: a new map with a winding road to your ${recipe.words.base?.toLowerCase() ?? 'base'}, plots to place defenders on, and waves of enemies (${recipe.enemies.map((e) => e.name).join(', ')}). ` +
      `Buy ${recipe.defenders.map((d) => d.name).join(', ')} in the ${recipe.words.shop ?? 'shop'}, place them beside the road, and every enemy you beat pays ${recipe.currency}. The waves keep coming, bigger each time. Press Play to try it.`;
  }
  const copy = await librarySafetyCopy(ctx, 'before building your game');
  if ('error' in copy) return { error: copy.error };
  if (choice === 'replace') {
    for (const path of COMPOSED_PATHS) await ctx.execStudioOp({ op: 'delete_instances', paths: [path] }, 20_000).catch(() => undefined);
  }
  const report = await runSteps(ctx, steps);
  // A build that could not write (a Play test, or Studio gone) says so and ends here; it is not "done".
  if (report.stopped) return { changed: (report.counts.script ?? 0) > 0, error: stoppedText(report.stopped), forUser: stoppedText(report.stopped) };
  if (verify) report.critical.push(...await verify());
  if (afterRun) await afterRun(report);
  const built = (report.counts.import ?? 0) > 0 || (report.counts.script ?? 0) > 0;
  if (report.critical.length) {
    return {
      changed: built, template, error: `The game was not finished: ${report.critical.join('; ')}.`, problems: report.problems.slice(0, 12),
      forUser: `I started building ${title}, but part of it did not come out (${report.critical[0]}), so it is not playable yet. I will not call it done.`,
    };
  }
  return {
    changed: built,
    ...extra,
    built: report.counts,
    ...(report.missing.length ? { missingPieces: report.missing } : {}),
    ...(report.problems.length ? { problems: report.problems.slice(0, 12) } : {}),
    ...(clearDefaultGround ? {} : { scene: 'The default Baseplate and SpawnLocation were left as they were; pass clearDefaultGround: true if the new map should replace them. Lighting was not changed (set_mood is yours).' }),
    forUser,
    note: 'The game is built from components; do not rebuild any of it by hand. Check it once in play (play_check; judge_game for a composed game), fix only what is broken, and answer from forUser in your own friendly words. Name no tools, paths or counts.',
  };
}

export function composeSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  if (failed) return 'Could not build the game';
  const r = result as { game?: string; built?: Record<string, number> } | undefined;
  return r?.game ? `Built ${r.game} from ${plural(r.built?.import ?? 0, 'library piece')}` : 'Built your game';
}

const THINGS = { laundry: ['washing machine'] };
