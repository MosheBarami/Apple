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

export function composeSummary(_args: Record<string, unknown>, result: unknown, failed: boolean): string {
  if (failed) return 'Could not build the game';
  const r = result as { game?: string; built?: Record<string, number> } | undefined;
  return r?.game ? `Built ${r.game} from ${plural(r.built?.import ?? 0, 'library piece')}` : 'Built your game';
}
