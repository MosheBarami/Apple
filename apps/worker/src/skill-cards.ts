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

function words(text: string): Set<string> {
  return new Set(text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? []);
}

function pick(text: string, tool: string | undefined, exclude: readonly string[], limit: number): SkillCard[] {
  const w = words(text);
  return SKILL_CARDS.map((card) => ({
    card,
    score: card.triggers.filter((t) => w.has(t)).length + (tool && card.tools.includes(tool) ? 1 : 0),
  }))
    .filter((s) => s.score >= MIN_SCORE && !exclude.includes(s.card.id))
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
  const cards = canBuild ? pick(text, undefined, [], MAX_PROMPT_CARDS) : [];
  if (cards.length === 0) return { block: null, ids: [] };
  return {
    block:
      '## Craft recipes for this request\nGeneral Roblox techniques that match what was asked. Apply them with the tools you have; they are guidance, not a template to copy.\n\n' +
      cards.map(renderSkillCard).join('\n\n'),
    ids: cards.map((c) => c.id),
  };
}

/** One new card for the plan's next pending step, or null (no plan, no match, already shown, run cap). */
export function skillSteerForStep(
  plan: RunPlan | undefined,
  trace: readonly PlanTraceEntry[],
  shown: readonly string[],
): { message: string; ids: string[] } | null {
  if (!plan || shown.length >= MAX_CARDS_PER_RUN) return null;
  const step = nextPlanStep(plan, trace);
  if (!step) return null;
  const [card] = pick(`${step.title} ${step.detail ?? ''}`, step.tool, shown, 1);
  if (!card) return null;
  return { message: `Before "${fenceForQuote(step.title)}", the recipe for this kind of step:\n\n${renderSkillCard(card)}`, ids: [card.id] };
}
