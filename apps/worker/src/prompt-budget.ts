// How much transcript one agent step may send, DERIVED from the model it is sent to.
//
// It was two constants in do/session.ts (60,000 / 42,000 chars), written when the model took 32k
// tokens. Apple MAX now runs on a 1.3M-token model and round 4 of the gauntlet (2026-09-23) hit
// 56,935 of 60,000 with 23 turn groups dropped — the model re-read what it had built and lost its
// plan. The real ceilings are three, and the budget is the tightest of them:
//
//   1. RESERVATION. gateway.ts refuses a step whose pessimistic estimate (every allowed output token
//      spent, chars/3.5 input tokens, no cache discount) exceeds the model's per-step neuron cap.
//      For glm-5.3-flash that cap is what binds, not the window. The budget is found by asking the
//      SAME estimator the gate uses, so the two cannot drift apart.
//   2. CONTEXT WINDOW, at a deliberately pessimistic chars-per-token so dense code cannot overflow it.
//   3. STORAGE. The transcript is persisted in the run state; a SQLite-backed Durable Object value
//      may be 2 MB, and a string with one non-Latin-1 character is stored two bytes per character.
//
// `fixedChars` is what rides on every step outside the transcript — the tool definitions — and is
// charged against the reservation and the window before the transcript gets anything.
import { modelById } from './providers/registry';
import { estimateNeuronsForModel } from './providers/cost';
import { estimateNeurons, maxNeuronsPerStepFor } from './pricing';
import { DEFAULT_MODELS } from './gateway';

/** Share of each ceiling actually used, so an estimate a little off does not refuse a step. */
export const BUDGET_MARGIN = 0.85;
/** A trim cuts to this share of the budget, so the steps after it are cache-served appends. */
export const TRIM_TARGET_SHARE = 0.7;
/** Pessimistic chars per token for the window check (code tokenises denser than prose). */
export const WINDOW_CHARS_PER_TOKEN = 2.5;
/** Largest transcript persisted with the run: two bytes a char stays well under 2 MB with the rest. */
export const PERSISTED_TRANSCRIPT_MAX_CHARS = 600_000;
/** Never below this, whatever the arithmetic says: a step needs its request and its last turns. */
export const MIN_TRANSCRIPT_CHARS = 24_000;

export interface BudgetModel {
  id: string;
  maxTokens: number;
  ctx: number;
}

export interface PromptBudget {
  maxChars: number;
  targetChars: number;
  limitedBy: 'reservation' | 'context' | 'storage' | 'floor';
}

/** Largest prompt (chars) whose admission estimate stays within `cap`. */
function reservableChars(modelId: string, maxTokens: number, cap: number): number {
  const priced = modelById(modelId);
  const estimate = (chars: number) =>
    priced ? estimateNeuronsForModel(priced, chars, maxTokens) : estimateNeurons(modelId, chars, maxTokens);
  if (estimate(0) > cap) return 0;
  let lo = 0;
  let hi = 50_000_000;
  if (estimate(hi) <= cap) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (estimate(mid) <= cap) lo = mid;
    else hi = mid;
  }
  return lo;
}

export function promptBudget(model: BudgetModel, fixedChars: number): PromptBudget {
  const cap = maxNeuronsPerStepFor(model.id) * BUDGET_MARGIN;
  const byReservation = reservableChars(model.id, model.maxTokens, cap) - fixedChars;
  const byContext = Math.floor((model.ctx - model.maxTokens) * WINDOW_CHARS_PER_TOKEN * BUDGET_MARGIN) - fixedChars;
  const candidates: [number, PromptBudget['limitedBy']][] = [
    [byReservation, 'reservation'],
    [byContext, 'context'],
    [PERSISTED_TRANSCRIPT_MAX_CHARS, 'storage'],
  ];
  let [maxChars, limitedBy] = candidates.reduce((a, b) => (b[0] < a[0] ? b : a));
  if (maxChars < MIN_TRANSCRIPT_CHARS) {
    maxChars = MIN_TRANSCRIPT_CHARS;
    limitedBy = 'floor';
  }
  return { maxChars, targetChars: Math.floor(maxChars * TRIM_TARGET_SHARE), limitedBy };
}

/** The budget for a gateway model KEY (`agent`, `plan`, or a registry id), from its DEFAULT_MODELS row. */
export function promptBudgetForKey(modelKey: string, fixedChars: number): PromptBudget {
  const cfg = DEFAULT_MODELS[modelKey];
  if (!cfg) return { maxChars: MIN_TRANSCRIPT_CHARS, targetChars: Math.floor(MIN_TRANSCRIPT_CHARS * TRIM_TARGET_SHARE), limitedBy: 'floor' };
  return promptBudget(cfg, fixedChars);
}
