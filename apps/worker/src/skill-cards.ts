//[[ GENERAL CRAFT KNOWLEDGE THE RUN PULLS IN BY ITSELF.
//
//   Measured 2026-09-23 against the simulator reference images (docs/gauntlet/visual): UI without
//   outlines, gradients or cartoon fonts, cards collapsed to zero height, missing-glyph icons, maps
//   that were a ground plane plus one template, default flat lighting. The recipes that fix those
//   existed only behind search tools the model rarely called. So retrieval is not left to the model:
//   the request picks at most MAX_PROMPT_CARDS cards for the system prompt, and each next plan step
//   may add one more, never repeating one and never past MAX_CARDS_PER_RUN.
//
//   Matching is deterministic keyword overlap against each card's trigger list, not a Vectorize
//   query: it costs no subrequest, cannot fail, and is testable. The cards themselves are genre-
//   agnostic and cite the Creator Docs chunks they came from (packages/corpus/data/skill-cards.json). ]]
import data from '../../../packages/corpus/data/skill-cards.json' with { type: 'json' };
import { nextPlanStep, type PlanTraceEntry, type RunPlan } from './run-plan';
import { fenceForQuote } from './run-parts';
import { afterSkillPush, creatorSkillsForStep, type SkillPushInput, type SkillPushState } from './skill-push';

export interface SkillCard {
  id: string;
  title: string;
  domain: string;
  tools: string[];
  triggers: string[];
  recipe: string[];
  avoid: string[];
  check: string;
  docs: { title: string; url: string; vecId: string }[];
}

export const SKILL_CARDS: readonly SkillCard[] = data.cards;
export const MAX_PROMPT_CARDS = 2;
export const MAX_CARDS_PER_RUN = 5;
export const MAX_CARD_CHARS = 2200;
/** Two distinct trigger words (or one plus the step's tool): one shared word like "build" is not a match. */
const MIN_SCORE = 2;
/** The card a request for a whole game matches. */
export const WHOLE_GAME_CARD = 'game-from-idea';

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []);
}

function pick(text: string, tool: string | undefined, exclude: readonly string[], limit: number, minScore = MIN_SCORE, domain?: string): SkillCard[] {
  const w = words(text);
  return SKILL_CARDS.filter((card) => !domain || card.domain === domain)
    .map((card) => ({
      card,
      score: card.triggers.filter((t) => w.has(t)).length + (tool && card.tools.includes(tool) ? 1 : 0),
    }))
    .filter((s) => s.score >= minScore && !exclude.includes(s.card.id))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.card);
}

export function renderSkillCard(card: SkillCard): string {
  const text = [
    `### ${card.title} [skill:${card.id}]`,
    ...card.recipe.map((r) => `- ${r}`),
    `Avoid: ${card.avoid.join(' ')}`,
    `Check: ${card.check}`,
    `Docs: ${card.docs.map((d) => d.url).join(' ')}`,
  ].join('\n');
  return text.length <= MAX_CARD_CHARS ? text : text.slice(0, MAX_CARD_CHARS - 1) + '…';
}

/** The system-prompt block for a run that can build; null when nothing matches. */
export function skillCardsForRun(text: string, canBuild: boolean): { block: string | null; ids: string[] } {
  let cards = canBuild ? pick(text, undefined, [], MAX_PROMPT_CARDS) : [];
  // A request for a whole game gets its genre's card with the game-from-idea card, on ONE matching word instead of two: the
  // genre cards' triggers are the genre's own vocabulary, and a request names a genre in few of them. The genre card takes the
  // second slot (the map and prop cards still come with the plan step that builds them).
  if (cards.some((c) => c.id === WHOLE_GAME_CARD) && !cards.some((c) => c.domain === 'genre')) {
    const [genre] = pick(text, undefined, [], 1, 1, 'genre');
    if (genre) cards = [...cards.filter((c) => c.id === WHOLE_GAME_CARD), genre];
  }
  if (cards.length === 0) return { block: null, ids: [] };
  return {
    block:
      '## Craft recipes for this request\nGeneral Roblox techniques that match what was asked. Apply them with the tools you have; they are guidance, not a template to copy.\n\n' +
      cards.map(renderSkillCard).join('\n\n'),
    ids: cards.map((c) => c.id),
  };
}

/**
 * What the plan's next pending step is handed before it runs, as ONE harness note: one new card (no plan, no match, already
 * shown or the run cap: none) and, when `creator` is passed, the researched creator skills for the step (skill-push.ts).
 * `skills` is the run's skill-push record after this push, for the caller to store.
 */
export function skillSteerForStep(
  plan: RunPlan | undefined,
  trace: readonly PlanTraceEntry[],
  shown: readonly string[],
  creator?: Pick<SkillPushInput, 'request' | 'state' | 'context'>,
): { message: string; ids: string[]; skills?: SkillPushState } | null {
  if (!plan) return null;
  let card: { message: string; ids: string[] } | null = null;
  const step = shown.length >= MAX_CARDS_PER_RUN ? undefined : nextPlanStep(plan, trace);
  if (step) {
    const [picked] = pick(`${step.title} ${step.detail ?? ''}`, step.tool, shown, 1);
    if (picked) card = { message: `Before "${fenceForQuote(step.title)}", the recipe for this kind of step:\n\n${renderSkillCard(picked)}`, ids: [picked.id] };
  }
  const push = creator ? creatorSkillsForStep({ plan, trace, ...creator }) : null;
  if (!card && !push) return null;
  return {
    message: [card?.message, push?.message].filter(Boolean).join('\n\n'),
    ids: card?.ids ?? [],
    ...(push ? { skills: afterSkillPush(creator?.state, push) } : {}),
  };
}
