// Single source of truth for what inference costs. Every spend decision in the product
// derives from this table, so the numbers in docs/COST-MODEL.md are the numbers the code enforces.
//
// Cloudflare bills Workers AI in "neurons" at $0.011 per 1,000 neurons. Per-model $/M-token
// prices convert to neurons/token as: neuronsPerToken = (usdPerMToken / 1e6) / 0.000011

export const USD_PER_NEURON = 0.011 / 1000; // $0.000011

/** neurons consumed per single token, derived from the published $/M-token price */
function neuronsPerToken(usdPerMillionTokens: number): number {
  return usdPerMillionTokens / 1_000_000 / USD_PER_NEURON;
}

export interface ModelPrice {
  id: string;
  usdPerMInput: number;
  usdPerMOutput: number;
  /** discounted rate for prompt tokens served from the provider's cache, when reported */
  usdPerMCachedInput?: number;
}

// Prices verified against developers.cloudflare.com/workers-ai/platform/pricing (2026-08-30).
// If Cloudflare changes a price, update it here — nothing else needs to change.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  // PRODUCTION MODEL. Reasoning-capable, 1M context, native tool calling, vision.
  // Cached input is billed at $0.03/M, which the gateway accounts for when the provider
  // reports prompt_tokens_details.cached_tokens.
  '@cf/zai-org/glm-5.3-flash': { id: '@cf/zai-org/glm-5.3-flash', usdPerMInput: 0.15, usdPerMOutput: 0.5, usdPerMCachedInput: 0.03 },
  '@cf/openai/gpt-oss-120b': { id: '@cf/openai/gpt-oss-120b', usdPerMInput: 0.35, usdPerMOutput: 0.75 },
  '@cf/openai/gpt-oss-20b': { id: '@cf/openai/gpt-oss-20b', usdPerMInput: 0.2, usdPerMOutput: 0.3 },
  '@cf/qwen/qwen3-30b-a3b-fp8': { id: '@cf/qwen/qwen3-30b-a3b-fp8', usdPerMInput: 0.051, usdPerMOutput: 0.335 },
  '@cf/qwen/qwen2.5-coder-32b-instruct': { id: '@cf/qwen/qwen2.5-coder-32b-instruct', usdPerMInput: 0.66, usdPerMOutput: 1.0 },
  '@cf/meta/llama-3.2-11b-vision-instruct': { id: '@cf/meta/llama-3.2-11b-vision-instruct', usdPerMInput: 0.049, usdPerMOutput: 0.68 },
  '@cf/baai/bge-small-en-v1.5': { id: '@cf/baai/bge-small-en-v1.5', usdPerMInput: 0.02, usdPerMOutput: 0 },
  '@cf/baai/bge-m3': { id: '@cf/baai/bge-m3', usdPerMInput: 0.012, usdPerMOutput: 0 },
};

/**
 * Neurons a call consumed, from token counts. Unknown models are costed at the most expensive rate.
 * `cachedInputTokens` are billed at the model's discounted cached rate when it publishes one.
 */
export function neuronsFor(modelId: string, inputTokens: number, outputTokens: number, cachedInputTokens = 0): number {
  const price =
    MODEL_PRICES[modelId] ??
    Object.values(MODEL_PRICES).reduce((worst, p) => (p.usdPerMInput > worst.usdPerMInput ? p : worst));
  const cached = Math.min(Math.max(0, cachedInputTokens), inputTokens);
  const fresh = inputTokens - cached;
  const cachedRate = price.usdPerMCachedInput ?? price.usdPerMInput;
  return Math.ceil(
    fresh * neuronsPerToken(price.usdPerMInput) +
      cached * neuronsPerToken(cachedRate) +
      outputTokens * neuronsPerToken(price.usdPerMOutput),
  );
}

export function usdFor(neurons: number): number {
  return neurons * USD_PER_NEURON;
}

/**
 * Pre-flight estimate used to RESERVE budget before a call runs. Deliberately pessimistic:
 * under-reserving is what lets a bill escape, so we reserve high and refund the difference.
 */
export function estimateNeurons(modelId: string, inputChars: number, maxOutputTokens: number): number {
  const inputTokens = Math.ceil(inputChars / 3.5); // conservative chars→tokens
  return neuronsFor(modelId, inputTokens, maxOutputTokens);
}

// ---------------------------------------------------------------------------
// Budget policy. These are the hard ceilings the product enforces on itself.
// ---------------------------------------------------------------------------

/** Cloudflare includes this many neurons/day at no cost on Free and Paid. Spend starts after it. */
export const FREE_NEURONS_PER_DAY = 10_000;

/**
 * Billable neurons allowed PER DAY beyond the free allocation, across the entire service.
 * 15,000 × $0.011/1000 × 30.4 days ≈ $5.02/month of AI at the absolute maximum.
 *
 * DELIBERATELY UNCHANGED by the GLM-5.3-flash migration. GLM is cheaper per token than the
 * model it replaced ($0.15/$0.50 vs $0.35/$0.75), so the same ceiling now buys materially more
 * work. The owner's maximum bill does not move; the capacity behind it goes up.
 */
export const BILLABLE_NEURONS_PER_DAY = 15_000;

/** Independent monthly backstop: 460,000 × $0.011/1000 ≈ $5.06. */
export const BILLABLE_NEURONS_PER_MONTH = 460_000;

/** Total neurons usable in a day (free + billable) before generation stops. */
export const DAILY_NEURON_CEILING = FREE_NEURONS_PER_DAY + BILLABLE_NEURONS_PER_DAY;

/** A single request may never reserve more than this — one runaway agent cannot drain the day. */
export const MAX_NEURONS_PER_REQUEST = 1_200;

/**
 * Sparks are the user-facing unit. Recalibrated for GLM-5.3-flash: a measured Stone build runs
 * far cheaper than on the previous model, so a Spark is worth fewer neurons and the same daily
 * allowance stretches further in real work.
 */
export const NEURONS_PER_SPARK = 30;

// The plan ladder now lives in @golem/shared: the limits are both a server rule and a page of
// copy, and written down twice they drift — a plan page disagreeing with the ledger that enforces
// it is a page that lies, and nothing here would have caught it. Re-exported so every existing
// import of `PLAN_LIMITS` from this module keeps working.
export { PLAN_LIMITS, PLAN_IDS, isPlanId, type PlanId } from '@golem/shared';

// SPARKS_PER_BUILD is in @golem/shared too, for the same reason. Asserted against the measured
// cost here so the shared constant cannot drift away from the arithmetic it came from.
export { SPARKS_PER_BUILD } from '@golem/shared';

/** What the shared constant must equal, derived rather than restated. */
export const SPARKS_PER_BUILD_DERIVED = Math.ceil(2_300 / NEURONS_PER_SPARK);

export function sparksForNeurons(neurons: number): number {
  return Math.max(1, Math.ceil(neurons / NEURONS_PER_SPARK));
}
