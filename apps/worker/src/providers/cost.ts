// Cost accounting across providers that bill in different units.
//
// The BudgetDO ceiling is denominated in Cloudflare neurons and nothing is going to change that:
// it is the unit the daily/monthly caps, the Spark price and the admin report are all written in.
// So a provider that bills in tokens has to be converted INTO neurons before it can be reserved
// or settled, or its spend would escape the ceiling entirely.
//
// The conversion is the same one pricing.ts already uses in the other direction:
//   neuronsPerToken = (usdPerMToken / 1e6) / USD_PER_NEURON
// which is to say: price the call in dollars, then divide by the dollar value of a neuron.
import { NEURONS_PER_SPARK, USD_PER_NEURON, neuronsFor, sparksForNeurons } from '../pricing';
import type { ProviderModel } from './types';

export interface CostBreakdown {
  usd: number;
  /** what the BudgetDO ledger is charged, always rounded UP — never under-bill the ledger */
  neurons: number;
  /** the user-facing unit, derived from neurons via NEURONS_PER_SPARK */
  sparks: number;
}

/**
 * Neuron-equivalent cost of a token-billed call.
 *
 * Cached input tokens are charged at the FULL input rate here. Workers AI publishes a discounted
 * cached rate and pricing.ts applies it; OpenAI, Google and DeepSeek discount caching differently
 * and none of it is verified for this product, so we decline to assume a discount we have not
 * measured. Over-charging the internal ledger is the safe direction.
 */
export function neuronsForModelTokens(
  model: ProviderModel,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): number {
  // Workers AI models are priced by the existing table so the production path keeps using the
  // exact numbers (and the exact cached-input discount) it uses today.
  if (model.provider === 'workers-ai') {
    return neuronsFor(model.id, inputTokens, outputTokens, cachedInputTokens);
  }
  const inTok = Math.max(0, inputTokens);
  const outTok = Math.max(0, outputTokens);
  const usd = (inTok * model.inputCostPer1M + outTok * model.outputCostPer1M) / 1_000_000;
  return Math.ceil(usd / USD_PER_NEURON);
}

/** Full breakdown for display: dollars, ledger neurons, and the Spark figure the UI shows. */
export function costOf(
  model: ProviderModel,
  inputTokens: number,
  outputTokens: number,
  cachedInputTokens = 0,
): CostBreakdown {
  const neurons = neuronsForModelTokens(model, inputTokens, outputTokens, cachedInputTokens);
  return { usd: neurons * USD_PER_NEURON, neurons, sparks: sparksForNeurons(neurons) };
}

/**
 * Pre-flight neuron estimate for a token-billed provider, deliberately pessimistic in the same way
 * pricing.estimateNeurons is: assume every allowed output token is spent.
 */
export function estimateNeuronsForModel(model: ProviderModel, promptChars: number, maxOutputTokens: number): number {
  const inputTokens = Math.ceil(Math.max(0, promptChars) / 3.5); // conservative chars→tokens
  return neuronsForModelTokens(model, inputTokens, maxOutputTokens);
}

/** Relative price of a model, used to rank providers in auto-selection. Lower is cheaper. */
export function blendedPricePer1M(model: ProviderModel): number {
  // A Golem step reads far more than it writes, so weight input 3:1 against output. The ranking
  // only has to be stable and defensible, not exact.
  return (model.inputCostPer1M * 3 + model.outputCostPer1M) / 4;
}

export { NEURONS_PER_SPARK, USD_PER_NEURON };
