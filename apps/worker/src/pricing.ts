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

// Prices verified against the current Cloudflare Workers AI model page and pricing page
// (2026-09-18). Where those two primary pages differ by rounding, use the HIGHER rate here: this
// table is a spend reservation boundary, so a small over-reservation is safe and an under-reservation
// is not. If Cloudflare changes a price, update it here — nothing else needs to change.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  '@cf/zai-org/glm-4.7-flash': { id: '@cf/zai-org/glm-4.7-flash', usdPerMInput: 0.0605, usdPerMOutput: 0.4 },
  // THE PAID PRODUCT LANE as of 2026-09-19, and no longer only the internal visual specialist:
  // Apple MAX moved here from glm-4.7-flash. Leaving the old description in place would have
  // been a stale sentence about the one row in this file that customers are billed against.
  // It is dearer than the row above it — $0.15/M in against $0.0605, $0.50/M out against $0.40,
  // which is +41% on an uncached 1M-in/1M-out call — and it is the only Workers AI row here
  // that publishes a cached-input rate, at $0.03/M. A builder lane re-sends a large fixed
  // system prompt on every turn, so most of its input tokens are cached ones, and the discount
  // lands where the increase does. `neuronsFor` already applies it; nothing else changes.
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
 * DELIBERATELY UNCHANGED, because this bounds the BILL and not the work. It is NOT unchanged
 * because inference got cheaper, which is what this comment claimed until 2026-09-20: it justified
 * the ceiling by naming gpt-oss-120b ($0.35/$0.75) as the model glm-5.3-flash replaced and
 * concluding the same cap therefore bought more work. That was true of the 2026-08-30 migration
 * and stopped being true when the paid lane went to glm-4.7-flash and back. The model Apple MAX
 * actually moved off on 2026-09-19 is the $0.0605/$0.40 row above, so the move was +41% on an
 * uncached call — a 1M-in/1M-out reservation went 41,864 → 59,091 neurons. Under an unchanged
 * ceiling that is roughly 29% FEWER reserved MAX steps a day, not more.
 *
 * What takes the sting out is the $0.03/M cached-input rate on the glm-5.3-flash row, which
 * glm-4.7-flash does not publish: a builder lane re-sends a large fixed prefix, session affinity
 * makes Workers AI bill it as cached, and `neuronsFor` applies the discount at SETTLEMENT. The
 * reservation never sees it — `estimateNeurons` passes no cached tokens on purpose — so admission
 * is gated at the pessimistic +41% and the ledger relaxes afterwards.
 *
 * So: the owner's maximum bill does not move. The capacity behind it went DOWN. Anyone sizing
 * plans or asking whether these caps can absorb another paying customer should start from that.
 */
export const BILLABLE_NEURONS_PER_DAY = 15_000;

/** Independent monthly backstop: 460,000 × $0.011/1000 ≈ $5.06. */
export const BILLABLE_NEURONS_PER_MONTH = 460_000;

/** Total neurons usable in a day (free + billable) before generation stops. */
export const DAILY_NEURON_CEILING = FREE_NEURONS_PER_DAY + BILLABLE_NEURONS_PER_DAY;

/** A single request may never reserve more than this — one runaway agent cannot drain the day. */
export const MAX_NEURONS_PER_REQUEST = 1_200;

/**
 * Credits are the user-facing unit. Recalibrated for GLM-5.3-flash when it replaced gpt-oss-120b
 * on 2026-08-30: a measured Stone build runs far cheaper on it than on gpt-oss-120b, so a Credit
 * is worth fewer neurons. gpt-oss-120b is NAMED rather than called "the previous model", because
 * the paid lane has changed models twice since and the phrase silently came to mean glm-4.7-flash
 * — against which this recalibration is not a saving at all (see BILLABLE_NEURONS_PER_DAY above).
 *
 * MOVED TO @golem/shared and re-exported here. The pricing page explains this number to buyers and
 * this module charges with it; defined in two places they can disagree, and the page had already
 * drifted — it quoted the build-blind neuron figure beside the quality-gated price.
 */
export { NEURONS_PER_CREDIT, BUILD_NEURONS } from '@golem/shared';
import { NEURONS_PER_CREDIT as NEURONS_PER_CREDIT_VALUE, BUILD_NEURONS } from '@golem/shared';

// The plan ladder now lives in @golem/shared: the limits are both a server rule and a page of
// copy, and written down twice they drift — a plan page disagreeing with the ledger that enforces
// it is a page that lies, and nothing here would have caught it. Re-exported so every existing
// import of `PLAN_LIMITS` from this module keeps working.
export { PLAN_LIMITS, PLAN_IDS, isPlanId, type PlanId } from '@golem/shared';

// CREDITS_PER_BUILD is in @golem/shared too, for the same reason. Asserted against the measured
// cost here so the shared constant cannot drift away from the arithmetic it came from.
export { CREDITS_PER_BUILD } from '@golem/shared';

/** What the shared constant must equal, derived rather than restated. */
export const CREDITS_PER_BUILD_DERIVED = Math.ceil(BUILD_NEURONS.qualityGated / NEURONS_PER_CREDIT_VALUE);

export function creditsForNeurons(neurons: number): number {
  return Math.max(1, Math.ceil(neurons / NEURONS_PER_CREDIT_VALUE));
}
