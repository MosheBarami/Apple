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
}

// Prices verified against developers.cloudflare.com/workers-ai/platform/pricing (2026-08-30).
// If Cloudflare changes a price, update it here — nothing else needs to change.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  '@cf/openai/gpt-oss-120b': { id: '@cf/openai/gpt-oss-120b', usdPerMInput: 0.35, usdPerMOutput: 0.75 },
  '@cf/openai/gpt-oss-20b': { id: '@cf/openai/gpt-oss-20b', usdPerMInput: 0.2, usdPerMOutput: 0.3 },
  '@cf/qwen/qwen3-30b-a3b-fp8': { id: '@cf/qwen/qwen3-30b-a3b-fp8', usdPerMInput: 0.051, usdPerMOutput: 0.335 },
  '@cf/qwen/qwen2.5-coder-32b-instruct': { id: '@cf/qwen/qwen2.5-coder-32b-instruct', usdPerMInput: 0.66, usdPerMOutput: 1.0 },
  '@cf/meta/llama-3.2-11b-vision-instruct': { id: '@cf/meta/llama-3.2-11b-vision-instruct', usdPerMInput: 0.049, usdPerMOutput: 0.68 },
  '@cf/baai/bge-small-en-v1.5': { id: '@cf/baai/bge-small-en-v1.5', usdPerMInput: 0.02, usdPerMOutput: 0 },
  '@cf/baai/bge-m3': { id: '@cf/baai/bge-m3', usdPerMInput: 0.012, usdPerMOutput: 0 },
};

/** Neurons a call consumed, from token counts. Unknown models are costed at the most expensive rate. */
export function neuronsFor(modelId: string, inputTokens: number, outputTokens: number): number {
  const price =
    MODEL_PRICES[modelId] ??
    Object.values(MODEL_PRICES).reduce((worst, p) => (p.usdPerMInput > worst.usdPerMInput ? p : worst));
  return Math.ceil(inputTokens * neuronsPerToken(price.usdPerMInput) + outputTokens * neuronsPerToken(price.usdPerMOutput));
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
 */
export const BILLABLE_NEURONS_PER_DAY = 15_000;

/** Independent monthly backstop: 460,000 × $0.011/1000 ≈ $5.06. */
export const BILLABLE_NEURONS_PER_MONTH = 460_000;

/** Total neurons usable in a day (free + billable) before generation stops. */
export const DAILY_NEURON_CEILING = FREE_NEURONS_PER_DAY + BILLABLE_NEURONS_PER_DAY;

/** A single request may never reserve more than this — one runaway agent cannot drain the day. */
export const MAX_NEURONS_PER_REQUEST = 1_200;

/** Sparks are the user-facing unit. This is what one Spark is allowed to cost. */
export const NEURONS_PER_SPARK = 90;

export const PLAN_LIMITS = {
  free: { sparksPerDay: 60, sparksPerMonth: 900 },
  pro: { sparksPerDay: 400, sparksPerMonth: 6_000 },
} as const;

export function sparksForNeurons(neurons: number): number {
  return Math.max(1, Math.ceil(neurons / NEURONS_PER_SPARK));
}
