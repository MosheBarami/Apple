// The product engine: the one model customers use, and how it is called.
//
// ONE ENGINE (V3 handoff §2, acceptance gate G01). The only customer-facing engine is StudPilot. It runs
// GLM 5.3 Flash on Workers AI (`@cf/zai-org/glm-5.3-flash`), called through `env.AI.run` and AI
// Gateway and billed in neurons. There is no model picker, no model tier and no plan-gated model:
// every plan uses StudPilot, and plans differ only in their allowance (PLAN_LIMITS).
//
// THE WIRE FIELD STAYS. `productModel` and the id `apple` are values clients already send, and
// stored sessions and older clients still carry the retired ids (LEGACY_MODEL_IDS). normalizeModelId
// maps every one of them — and anything else — onto StudPilot, so an old client or an old row is served,
// never refused.
//
// Everything below is data. Nothing here imports a value from ./index.ts: index.ts re-exports this
// file and evaluates it first, so a value import back into index.ts would be read before it exists.

import { ENGINE_RELEASE } from './inference.ts';

export type ModelId = 'apple';

export interface RegistryModel {
  id: ModelId;
  displayName: string;
  /** One line for the product and the site: what the engine is for, never a benchmark claim. */
  blurb: string;
  vendor: 'StudPilot';
  /** The exact id `env.AI.run` is called with. */
  providerModelId: string;
  nativeTools: boolean;
  vision: boolean;
  ctx: number;
  maxOutputTokens: number;
  /** The default reasoning effort. The adaptive policy (apps/worker/src/reasoning.ts) chooses per step. */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /**
   * The largest reservation one model call may make, in neurons. Sized to admit a large prompt at
   * the full output ceiling at this model's price — apps/worker/tests/model-step-caps.test.mjs
   * derives it back from the price table, so a price change that outgrows the cap turns that test red.
   */
  maxNeuronsPerStep: number;
  /** Zero Data Retention as the provider's catalogue reports it. False where it is not claimed. */
  zdr: boolean;
}

/** The single customer engine. A list so callers that iterate keep one shape. */
export const MODEL_REGISTRY: readonly RegistryModel[] = [
  {
    id: 'apple',
    displayName: 'StudPilot',
    blurb: 'Builds complete Roblox games from a short prompt.',
    vendor: 'StudPilot',
    providerModelId: ENGINE_RELEASE.modelId,
    nativeTools: true,
    vision: true,
    ctx: 1_310_720,
    maxOutputTokens: 6_500,
    reasoningEffort: 'low',
    maxNeuronsPerStep: 1_200,
    zdr: false,
  },
];

export const MODEL_IDS: readonly ModelId[] = MODEL_REGISTRY.map((m) => m.id);

/**
 * Retired model ids that stored messages, persisted runs and older clients may still carry. They are
 * a compatibility bridge only: accepted and served by StudPilot, never offered and never refused.
 */
export const LEGACY_MODEL_IDS = ['apple-max', 'gemini-3.8-flash', 'gpt-5.6', 'gpt-5.6-luna'] as const;

export function isModelId(value: unknown): value is ModelId {
  return typeof value === 'string' && (MODEL_IDS as readonly string[]).includes(value);
}

/**
 * THE COMPATIBILITY BRIDGE. Any `productModel` a client sends or a row stores — `apple`, a retired id
 * from LEGACY_MODEL_IDS, or something unknown — is StudPilot, because StudPilot is the only engine there is.
 */
export function normalizeModelId(value: unknown): ModelId {
  void value;
  return 'apple';
}

export function registryModel(id: unknown): RegistryModel | undefined {
  return MODEL_REGISTRY.find((m) => m.id === id);
}

/** The registry row whose provider id this is — for its price cap and capabilities. */
export function registryModelByProviderId(providerModelId: string): RegistryModel | undefined {
  return MODEL_REGISTRY.find((m) => m.providerModelId === providerModelId);
}
