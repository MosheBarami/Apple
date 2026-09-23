// The model picker's vocabulary: which models exist, which plan may choose each, and what each one
// costs relative to the others.
//
// THE MODEL REGISTRY (owner decision D-VISION-1, docs/autonomy/DECISIONS.md) is the single source
// for the worker, the web app, the site and the SDK. The product offers five models by name:
//
//   Free plan            Apple
//   Pro plan (builder)   + Apple MAX
//   Max plan (studio,    + Gemini 3.8 Flash, GPT-5.6, GPT-5.6 Luna
//   and enterprise)
//
// Every one of them is called through the same `env.AI.run` binding and AI Gateway. The Apple
// lanes are Workers AI models billed in neurons; the other three are third-party models on
// Cloudflare Unified Billing, paid from prepaid AI Gateway credits — no provider key is held.
//
// THE PLAN IDS ARE WIRE LITERALS AND ARE NOT RENAMED. `builder` and `studio` are stored in QuotaDO
// and mapped to Stripe prices; only their DISPLAY names became "Pro" and "Max" (PLAN_COPY). The
// model ids `apple` and `apple-max` are likewise the values older clients already send.
//
// Everything below is data. Nothing here imports a value from ./index.ts: index.ts re-exports this
// file and evaluates it first, so a value import back into index.ts would be read before it exists.

import type { PlanId } from './index.ts';

/** The entitlement ladder. Not a PlanId: four plans map onto three tiers (TIER_FOR_PLAN). */
export type ModelTier = 'free' | 'pro' | 'max';

/** The request format the adapter must encode. OpenAI's 5.6 family accepts only `responses`. */
export type ModelWire = 'chat' | 'responses';

/**
 * How the call is paid for. Both go through `env.AI.run` and the gateway; the difference is the
 * wallet — Workers AI neurons, or prepaid AI Gateway credits — and therefore which ceiling in
 * BudgetDO a reservation is charged against.
 */
export type ModelRoute = 'workers-ai' | 'unified-billing';

export type ModelId = 'apple' | 'apple-max' | 'gemini-3.8-flash' | 'gpt-5.6' | 'gpt-5.6-luna';

export interface RegistryModel {
  id: ModelId;
  displayName: string;
  /** One line for the picker and the site: what the model is for, never a benchmark claim. */
  blurb: string;
  vendor: 'Apple' | 'Google' | 'OpenAI';
  /** The exact id `env.AI.run` is called with. */
  providerModelId: string;
  /**
   * The Workers AI fine-tune (LoRA) name, once one has passed the eval gate. UNSET on purpose:
   * Apple stays on the base model until a trained adapter beats it on the product's own eval.
   */
  lora?: string;
  wire: ModelWire;
  route: ModelRoute;
  /** The lowest tier that may select this model. */
  tier: ModelTier;
  /**
   * The published, rounded cost ratio against Apple MAX, for the picker's "×N credits" badge and
   * the pricing page. BILLING DOES NOT READ IT: a run is charged from its measured tokens at the
   * provider's own price (apps/worker/src/pricing.ts), so this number can only be wrong on a
   * label, never on a bill.
   */
  creditMultiplier: number;
  nativeTools: boolean;
  vision: boolean;
  ctx: number;
  maxOutputTokens: number;
  /** The reasoning effort sent to the provider. Apple's lanes are chosen per step instead. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * The largest reservation one model call may make, in neurons (the internal unit for every
   * wallet: USD converts at the same rate). Sized to admit a ~64k-token prompt at the full output
   * ceiling at this model's price — apps/worker/tests/model-step-caps.test.mjs derives it back from
   * the price table, so a price change that outgrows the cap turns that test red.
   */
  maxNeuronsPerStep: number;
  /** Zero Data Retention as the provider's catalogue reports it. False where it is not claimed. */
  zdr: boolean;
}

/** In display order. The picker, the plan table and the site all read this order. */
export const MODEL_REGISTRY: readonly RegistryModel[] = [
  {
    id: 'apple',
    displayName: 'Apple',
    blurb: 'Fast, capable help for smaller changes.',
    vendor: 'Apple',
    // Apple is meant to become a small open model with Apple's own LoRA. Until an adapter passes
    // the eval gate it runs on the measured GLM-5.3 Flash foundation at low effort.
    providerModelId: '@cf/zai-org/glm-5.3-flash',
    wire: 'chat',
    route: 'workers-ai',
    tier: 'free',
    creditMultiplier: 1,
    nativeTools: true,
    vision: true,
    ctx: 1_310_720,
    maxOutputTokens: 6_500,
    reasoningEffort: 'low',
    maxNeuronsPerStep: 1_200,
    zdr: false,
  },
  {
    id: 'apple-max',
    displayName: 'Apple MAX',
    blurb: 'The full builder for larger multi-file work.',
    vendor: 'Apple',
    providerModelId: '@cf/zai-org/glm-5.3-flash',
    wire: 'chat',
    route: 'workers-ai',
    tier: 'pro',
    creditMultiplier: 1,
    nativeTools: true,
    vision: true,
    ctx: 1_310_720,
    maxOutputTokens: 6_500,
    // A floor, not a fixed setting: apps/worker/src/reasoning.ts raises every Apple MAX step to it.
    reasoningEffort: 'high',
    maxNeuronsPerStep: 1_200,
    zdr: false,
  },
  {
    id: 'gemini-3.8-flash',
    displayName: 'Gemini 3.8 Flash',
    blurb: "Google's fast model, with a very long memory for big projects.",
    vendor: 'Google',
    providerModelId: 'google/gemini-3.8-flash',
    wire: 'chat',
    route: 'unified-billing',
    tier: 'max',
    creditMultiplier: 6,
    nativeTools: true,
    vision: true,
    ctx: 1_048_576,
    maxOutputTokens: 6_500,
    // Gemini's default thinking level is medium, and thinking bills as output. Low until measured.
    reasoningEffort: 'low',
    maxNeuronsPerStep: 6_600,
    zdr: false,
  },
  {
    id: 'gpt-5.6',
    displayName: 'GPT-5.6',
    blurb: "OpenAI's flagship, for the hardest builds.",
    vendor: 'OpenAI',
    // There is no `openai/gpt-5.6`: Cloudflare's 5.6 flagship is Sol (the design doc, §1.2).
    providerModelId: 'openai/gpt-5.6-sol',
    wire: 'responses',
    route: 'unified-billing',
    tier: 'max',
    // 15× at the catalogue's $2/$10, 40× at the changelog's standard $5/$30. Reserved and labelled
    // at the dearer figure until one live bill shows which is charged.
    creditMultiplier: 40,
    nativeTools: true,
    vision: false,
    ctx: 1_050_000,
    maxOutputTokens: 6_500,
    reasoningEffort: 'low',
    maxNeuronsPerStep: 46_900,
    zdr: false,
  },
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    blurb: "OpenAI's cost-efficient 5.6 model.",
    vendor: 'OpenAI',
    providerModelId: 'openai/gpt-5.6-luna',
    wire: 'responses',
    route: 'unified-billing',
    tier: 'max',
    creditMultiplier: 2,
    nativeTools: true,
    vision: false,
    ctx: 1_050_000,
    maxOutputTokens: 6_500,
    reasoningEffort: 'low',
    maxNeuronsPerStep: 1_900,
    zdr: false,
  },
];

export const MODEL_IDS: readonly ModelId[] = MODEL_REGISTRY.map((m) => m.id);

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}

export function registryModel(id: unknown): RegistryModel | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/**
 * The registry row whose provider id this is. Two Apple lanes share one provider id today, so this
 * answers with the FIRST — callers use it for properties the two share (route, price, step cap),
 * never to say which lane a call was.
 */
export function registryModelByProviderId(providerModelId: string): RegistryModel | undefined {
  return MODEL_REGISTRY.find((m) => m.providerModelId === providerModelId);
}

/** Every plan names its tier; the type makes a fifth plan without one a compile error. */
export const TIER_FOR_PLAN: Readonly<Record<PlanId, ModelTier>> = {
  free: 'free',
  builder: 'pro',
  studio: 'max',
  enterprise: 'max',
};

const TIER_RANK: Readonly<Record<ModelTier, number>> = { free: 0, pro: 1, max: 2 };

/**
 * May an account on `plan` select `modelId` right now?
 *
 * A free-tier model needs no plan at all, so it stays usable while a billing read is unavailable.
 * Every other model is refused for an absent, malformed or unknown plan — fail closed. There is no
 * owner/admin exception; those identities are not documented model entitlements.
 */
export function canUseModel(modelId: unknown, plan?: string): boolean {
  const model = registryModel(modelId);
  if (!model) return false;
  if (model.tier === 'free') return true;
  const tier = typeof plan === 'string' && Object.prototype.hasOwnProperty.call(TIER_FOR_PLAN, plan)
    ? TIER_FOR_PLAN[plan as PlanId]
    : undefined;
  return tier !== undefined && TIER_RANK[tier] >= TIER_RANK[model.tier];
}

/** The plan display name that unlocks a tier, for "Included with …" copy. */
export const TIER_PLAN_NAME: Readonly<Record<Exclude<ModelTier, 'free'>, string>> = {
  pro: 'Pro',
  max: 'the Max plan',
};

/**
 * Why a locked model is locked, in the words the picker and the refusal both use. "the Max plan"
 * rather than "Max" because a plan called Max beside a model called Apple MAX is two different
 * things with one name, and the buyer has to be able to tell which one a sentence means.
 */
export function lockedReason(modelId: unknown): string {
  const model = registryModel(modelId);
  if (!model || model.tier === 'free') return '';
  return `Included with ${TIER_PLAN_NAME[model.tier]}`;
}

/**
 * The refusal for a model the account may not use, at admission and at every later step: the same
 * words as the picker's locked row, as a sentence. Empty for a free model, which is never refused.
 */
export function modelRefusal(modelId: unknown): string {
  const model = registryModel(modelId);
  if (!model) return 'That model is not available. Choose another one.';
  if (model.tier === 'free') return '';
  return `${model.displayName} is included with ${TIER_PLAN_NAME[model.tier]}. Choose Apple to continue free.`;
}

/** The best model an account may use, in registry order of preference, for a downgrade fallback. */
export function bestEntitledModel(plan: string | undefined, preferred?: unknown): ModelId {
  if (canUseModel(preferred, plan)) return preferred as ModelId;
  // The Apple lanes first: falling back to a dearer third-party model the person did not choose
  // would spend their Credits faster than the model they had.
  if (canUseModel('apple-max', plan)) return 'apple-max';
  return 'apple';
}

/** One row of GET /api/models. */
export interface ModelListing {
  id: ModelId;
  displayName: string;
  vendor: RegistryModel['vendor'];
  tier: ModelTier;
  creditMultiplier: number;
  /** Computed for the asking account by canUseModel — never a literal. */
  available: boolean;
  /** Empty when available. */
  lockedReason: string;
}

export function modelListing(plan: string | undefined): ModelListing[] {
  return MODEL_REGISTRY.map((m) => {
    const available = canUseModel(m.id, plan);
    return {
      id: m.id,
      displayName: m.displayName,
      vendor: m.vendor,
      tier: m.tier,
      creditMultiplier: m.creditMultiplier,
      available,
      lockedReason: available ? '' : lockedReason(m.id),
    };
  });
}
