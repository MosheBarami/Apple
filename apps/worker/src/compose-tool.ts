/**
 * compose_game: the user's idea becomes a NEW game made from components (compose.ts), in their Studio (compose-run.ts).
 * It replaces plan_game/build_game, which copied a whole saved game and cut it down (rejected by the owner, 2026-09-30).
 *
 * The idea picks a template and its pieces (ideaRecipe). An idea no template can build yet is refused in plain words:
 * a game that ignores the idea's twist is worse than no game.
 */
import type { AgentCtx } from './tools';
import { composeSteps, type Recipe } from './compose';
import { runSteps } from './compose-run';
import { orchardRecipe } from './recipes';
import { libraryReady, librarySafetyCopy } from './local-owner-corpus';
import { userWantsOwnSurface } from './surfaces';
import { isPlotSimRequest, plotSimRecipe, plotSimSteps, heroSpot, type PlotSimRecipe } from './compose-plotsim';
import type { LibRef } from './compose';

export type IdeaPlan = { recipe: Recipe; template: string } | { error: string };

/** A stable seed from the idea's words, so the same idea lays out the same map and a new idea a new one. */
export function ideaSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text.toLowerCase().replace(/\s+/g, ' ').trim()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

const LANE_DEFENSE = /\b(defen[cd]|protect|guard|tower|siege|invad|attack(ers)?|waves?|hold (off|back))\b/i;
const VEG = /\b(veg(etable|gie|etables|gies)?|carrots?|tomato(es)?|pumpkins?|eggplants?|broccoli|potato(es)?|corn|cabbages?)\b/i;
const FRUIT_HOME = /\b(orchard|farm|garden|fruit trees?|apple trees?|crops?|harvest)\b/i;

/** The template and pieces for an idea, or why none fits yet. */
export function ideaRecipe(idea: string): IdeaPlan {
  const text = idea.trim();
  if (!text) return { error: 'There is no idea to build yet.' };
  const seed = ideaSeed(text);
  if (LANE_DEFENSE.test(text) && (VEG.test(text) || FRUIT_HOME.test(text))) {
    const recipe = orchardRecipe(seed);
    if (!FRUIT_HOME.test(text) && /garden/i.test(text)) recipe.title = 'Garden Siege';
    return { recipe, template: 'lane-defense/orchard' };
  }
  return { error: 'The components for that kind of game are not ready yet, so nothing was built. The ones that are: defending a place from waves of vegetables (an orchard, a farm, a garden).' };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export async function composeGame(ctx: AgentCtx, a: Record<string, unknown>) {
  const blocked = libraryReady(ctx);
  if (blocked) return { error: blocked };
  const idea = String(a.request ?? '').trim() || ctx.userRequest?.() || '';
  const plan = ideaRecipe(idea);
  // A simulator / tycoon / "make it a full game" idea is the plot simulator (compose-plotsim.ts), unless it is the
  // orchard lane defense the first template already answers.
  if ('error' in plan && isPlotSimRequest(idea)) return composePlotSim(ctx, idea);
  // No template is not a refusal (owner, 2026-10-01: every request gets done): the agent builds it with its own tools.
  if ('error' in plan) {
    return {
      changed: false, template: 'none',
      note: 'No ready game template fits this idea, so nothing was built by this tool. Build it yourself now with your tools, completely, in the studded style: read_creation_skill any-idea-done-right (and map-improve, props-rig-animate as needed). Do not tell the user it cannot be done.',
    };
  }
  const copy = await librarySafetyCopy(ctx, 'before building your game');
  if ('error' in copy) return { error: copy.error };
  const { recipe } = plan;
  // Studs on everything unless the user asked for a surface of their own (owner, 2026-10-01; surfaces.ts).
  recipe.surface = userWantsOwnSurface(idea) ? 'keep' : 'studs';
  const steps = composeSteps(recipe);
  const report = await runSteps(ctx, steps);
  const built = (report.counts.import ?? 0) > 0 || (report.counts.script ?? 0) > 0;
  if (report.critical.length) {
    return {
      changed: built, error: `The game was not finished: ${report.critical.join('; ')}.`,
      forUser: `I started building ${recipe.title}, but part of it did not come out (${report.critical[0]}), so it is not playable yet. I will not call it done.`,
      problems: report.problems.slice(0, 12),
    };
  }
  const enemies = recipe.enemies.map((e) => e.name.toLowerCase());
  const forUser = report.stopped
    ? `Studio disconnected while ${recipe.title} was being built, so it is only partly there. Reconnect and ask again to finish it.`
    : `I built ${recipe.title}: a new map with a winding road to your ${recipe.words.base?.toLowerCase() ?? 'base'}, four plots to plant on, and waves of walking vegetables (${enemies.join(', ')}). ` +
      `Buy ${recipe.defenders.map((d) => d.name).join(', ')} in the ${recipe.words.shop ?? 'shop'}, plant them next to the road, and they throw fruit at the veggies; every veggie you beat pays ${recipe.currency.toLowerCase()}. ` +
      `The waves keep coming, bigger each time. Press Play to try it.`;
  return {
    changed: built,
    game: recipe.title,
    template: plan.template,
    built: report.counts,
    ...(report.missing.length ? { missingPieces: report.missing } : {}),
    ...(report.problems.length ? { problems: report.problems.slice(0, 12) } : {}),
    forUser,
    note: 'Now run judge_game {request} as a player would, fix only what it lists, and answer from forUser in your own friendly words. Name no tools, paths or counts.',
  };
}

type TreeNode = { name?: string; class?: string; path?: string; children?: TreeNode[]; props?: Record<string, unknown> };
const triple = (raw: unknown): [number, number, number] | null => {
  const v = (raw as { v?: unknown } | undefined)?.v;
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number') ? v as [number, number, number] : null;
};

/** What the place already holds that the simulator should build on: its object (the hero) and its economy. */
async function readPlace(ctx: AgentCtx): Promise<{ hero?: string; hasComponents: boolean }> {
  const ws = await ctx.execStudioOp({ op: 'get_tree', root: 'game.Workspace', maxDepth: 2, maxNodes: 600 }, 30_000).catch(() => null);
  const kids = ws?.ok ? ((ws.data as { root?: TreeNode }).root?.children ?? []) : [];
  // build_object's signature: a Model with an AppleAnimations module. The biggest one is the game's centrepiece.
  const heroes = kids.filter((k) => k.class === 'Model' && (k.children ?? []).some((c) => c.name === 'AppleAnimations') && k.name !== 'AppleMap');
  heroes.sort((x, y) => (y.children?.length ?? 0) - (x.children?.length ?? 0));
  const comps = await ctx.execStudioOp({ op: 'get_tree', root: 'game.ServerScriptService.AppleComponents', maxDepth: 0, maxNodes: 1 }, 20_000).catch(() => null);
  return { ...(heroes[0]?.name ? { hero: heroes[0].name } : {}), hasComponents: Boolean(comps?.ok) };
}

/** Things that are the same kind of machine to a player: searched when the library has too few of the subject itself. */
const KIN: Record<string, string[]> = {
  keyboard: ['piano', 'typewriter', 'synth', 'keytar'], piano: ['keyboard', 'organ', 'synth'], car: ['truck', 'kart', 'bus'],
  computer: ['laptop', 'monitor', 'console'], drill: ['excavator', 'digger', 'miner'], oven: ['stove', 'grill', 'fryer'],
};

/** Library models of the subject, then of its kin, one per source game: different looks for the machine ladder. */
async function subjectModels(ctx: AgentCtx, subject: string, limit: number): Promise<LibRef[]> {
  // Half the subject itself, half its kin, then the subject again for what is left: the library's keyboards are four
  // flat desk props, its grand pianos are the machines a player wants to buy (owner's screenshots, 2026-10-01).
  const own = await libraryModels(ctx, subject, limit);
  const kin = KIN[subject] ?? [];
  const out = own.slice(0, kin.length ? Math.ceil(limit / 2) : limit);
  for (const k of kin) {
    if (out.length >= limit) break;
    for (const r of await libraryModels(ctx, k, limit - out.length, 20)) if (!out.some((o) => o.game === r.game)) out.push(r);
  }
  for (const r of own) if (out.length < limit && !out.includes(r)) out.push(r);
  return out.slice(0, limit);
}

/** Library models of the subject (the owner library first): the machines beyond the hero's own tiers. */
async function libraryModels(ctx: AgentCtx, q: string, limit: number, minParts = 15): Promise<LibRef[]> {
  const out = await ctx.execStudioOp({ op: 'query_owner_library', action: 'list', q, kind: 'model', limit: 20 }, 60_000).catch(() => null);
  if (!out?.ok) return [];
  const items = ((out.data as { items?: { gameId?: string; path?: string; kind?: string; parts?: number }[] }).items ?? [])
    .filter((i) => i.kind === 'model' && typeof i.gameId === 'string' && typeof i.path === 'string' && (i.parts ?? 0) >= minParts);
  const seen = new Set<string>();
  const refs: LibRef[] = [];
  for (const i of items) {
    if (seen.has(i.gameId!)) continue; // one per source game: different looks, not four copies of one
    seen.add(i.gameId!);
    refs.push({ game: i.gameId!, path: i.path! });
    if (refs.length >= limit) break;
  }
  return refs;
}

async function composePlotSim(ctx: AgentCtx, idea: string) {
  const place = await readPlace(ctx);
  const draft = plotSimRecipe(idea, ideaSeed(idea), { ...place, library: [], hubProps: [], hasComponents: place.hasComponents });
  // Library first (owner, 2026-10-01: "if you find assets it's better than generating one from parts"): up to four
  // other models of the subject, the hub's stands, and scenery for the island.
  const [library, shop, trees, rocks, stage] = await Promise.all([
    subjectModels(ctx, draft.subject, place.hero ? 4 : 6),
    libraryModels(ctx, 'shop', 1, 5),
    libraryModels(ctx, 'tree', 2, 5),
    libraryModels(ctx, 'rock', 1, 2),
    place.hero ? ctx.execStudioOp({ op: 'get_instance', path: `game.Workspace.${place.hero}Stage.Stage` }, 20_000).catch(() => null) : Promise.resolve(null),
  ]);
  const stageSize = stage?.ok ? triple((stage.data as { props?: Record<string, unknown> }).props?.Size) : null;
  const hubProps: PlotSimRecipe['hubProps'] = [
    // No sell stand: a plot simulator sells nothing, and a SELL stand that does nothing is a fake (owner's critique).
    ...(shop[0] ? [{ key: 'HubShop', ref: shop[0], at: 'shop' as const, height: 12 }] : []),
  ];
  const recipe = plotSimRecipe(idea, ideaSeed(idea), { ...place, library, hubProps, hasComponents: place.hasComponents });
  recipe.decor = [
    // Two kinds of tree when the library has them: sixteen copies of one tree read as copies.
    ...trees.map((ref, k) => ({ key: k ? `DecorTree${k + 1}` : 'DecorTree', ref, height: 18, count: trees.length > 1 ? 8 : 16 })),
    ...(rocks[0] ? [{ key: 'DecorRock', ref: rocks[0], height: 5, count: 10 }] : []),
  ];
  if (stageSize) recipe.heroSize = [stageSize[0], stageSize[2]];
  if (!recipe.machines.length) {
    return { changed: false, template: 'none', note: `No ${recipe.subject} is in the place and the owner library has no ${recipe.subject} model, so there is nothing to sell yet. Build the ${recipe.subject} first with build_object, then call compose_game again.` };
  }
  const copy = await librarySafetyCopy(ctx, 'before building your game');
  if ('error' in copy) return { error: copy.error };
  recipe.surface = userWantsOwnSurface(idea) ? 'keep' : 'studs';
  const report = await runSteps(ctx, plotSimSteps(recipe));
  // The hero moves onto the hub's centre, with its stage: the game is built around what the player already made.
  if (recipe.hero) {
    const root = await ctx.execStudioOp({ op: 'get_instance', path: `game.Workspace.${recipe.hero}.Root` }, 20_000).catch(() => null);
    const at = root?.ok ? triple((root.data as { props?: Record<string, unknown> }).props?.Position) : null;
    if (at) {
      const [hx, hz] = heroSpot(recipe);
      const moved = await ctx.execStudioOp({ op: 'transform_instances', paths: [`game.Workspace.${recipe.hero}`, `game.Workspace.${recipe.hero}Stage`], move: [hx - at[0], 0, hz - at[2]] }, 30_000).catch(() => null);
      if (!moved?.ok) report.problems.push(`the ${recipe.subject} could not be moved onto the hub`);
    } else report.problems.push(`the ${recipe.subject}'s position could not be read, so it stays where it was`);
  }
  // The screen is what makes it playable: read it back rather than trust the create (live 2026-10-01: refused, unnoticed).
  const hud = await ctx.execStudioOp({ op: 'get_instance', path: 'game.StarterGui.AppleHUD' }, 20_000).catch(() => null);
  if (!hud?.ok && !report.critical.some((c) => c.startsWith("the game's screen"))) report.critical.push("the game's screen is not in StarterGui");
  const built = (report.counts.script ?? 0) > 0;
  if (report.critical.length) {
    return { changed: built, error: `The game was not finished: ${report.critical.join('; ')}.`, problems: report.problems.slice(0, 12),
      forUser: `I started building ${recipe.title}, but part of it did not come out (${report.critical[0]}), so it is not playable yet.` };
  }
  const libNames = recipe.machines.filter((m) => m.ref).length;
  const forUser = report.stopped
    ? `Studio disconnected while ${recipe.title} was being built, so it is only partly there. Reconnect and ask again to finish it.`
    // Short lines a player reads at a glance (round 8 of the owner's test 1: one long sentence with two brackets in a row).
    : [
      `Your ${recipe.subject} is now **${recipe.title}**: a hub${recipe.hero ? ` with your ${recipe.subject} in the middle` : ''} and ${recipe.players} plots around it, one for each player.`,
      `- Every player starts on their own plot with a free ${recipe.machines[0]?.name ?? recipe.subject} already earning Coins.`,
      `- The Shop (button, or the SHOP pad in the hub) sells ${recipe.machines.length} ${recipe.subject}s: ${recipe.machines.map((m) => m.name).join(', ')}${libNames ? ` (${libNames} from your library)` : ''}. Each earns every second; pressing your own pays extra.`,
      `- Upgrades make every press and every second worth more; Rebirth starts you over with a permanent boost.`,
    ].join('\n');
  return {
    changed: built, game: recipe.title, template: 'plot-sim', built: report.counts,
    machines: recipe.machines.map((m) => `${m.name} ($${m.price}, +${m.income}/s${m.ref ? ', from the library' : m.from ? ', your own' : ''})`),
    ...(report.missing.length ? { missingPieces: report.missing } : {}),
    ...(report.problems.length ? { problems: report.problems.slice(0, 12) } : {}),
    forUser,
    note: 'The game is built from components; do not rebuild any of it by hand. Check it once in play (play_check), fix only what is broken, and answer from forUser in your own friendly words. Name no tools, paths or counts.',
  };
}

export function composeSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  if (failed) return 'Could not build the game';
  const r = result as { game?: string; built?: Record<string, number> } | undefined;
  return r?.game ? `Built ${r.game} from ${plural(r.built?.import ?? 0, 'library piece')}` : 'Built your game';
}
