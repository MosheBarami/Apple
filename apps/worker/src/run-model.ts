// Which model a run is on, and — for a model on the customer's own key — which key it spends.
//
// A chat frame may carry `model`, a catalogue id (GET /api/models). Two lanes come out of it:
//
//   * APPLE. No `model`, or a built-in id (`apple`, `apple-max`). The existing gateway lane, the
//     existing entitlement check, the existing Credits. Nothing about it changes here.
//   * CUSTOMER KEY. Any other catalogue id. The run goes through OpenRouter on the customer's own
//     saved key and spends no Apple Credits (D-BYOK-1). Every other guard — the step ceiling, the
//     duplicate-call guard, tool permissions, the kill switch, Stop — is the same run loop's.
//
// What the run REMEMBERS is the lane, the model id and whose key; never the key. The key is opened
// again for every step (`keyForRun`), used for that one call and dropped, so an evicted Durable
// Object, a persisted AgentState or a transcript row can never carry it.
import type { Env } from './env';
import { isCatalogueModelIdShape, PRODUCT_MODELS, registryModel, type ProductModel } from '@golem/shared';
import { catalogueEntry, keylessFree, type CatalogueOptions } from './model-catalogue';
import { openModelKey, type ModelKeyEnv } from './model-keys';

/** Persisted on the run. Carries no secret. */
export interface CustomerRunModel {
  provider: 'openrouter';
  /** OpenRouter's own model id, from the catalogue. */
  modelId: string;
  label: string;
  free: boolean;
  /** Whose saved key the run spends: the person who started it. */
  keyOwnerId: string;
}

export type RunModelChoice =
  | { lane: 'apple'; productModel: ProductModel | undefined }
  | { lane: 'customer'; modelId: string; label: string; free: boolean }
  | { lane: 'refused'; message: string };

export const UNKNOWN_MODEL_MESSAGE = 'That model is not available any more. Pick another one.';

function isProductModel(v: string): v is ProductModel {
  // The Apple lanes only until the gateway can run the registry's third-party models (step 3).
  return (PRODUCT_MODELS as readonly string[]).includes(v) && registryModel(v)?.route === 'workers-ai';
}

/**
 * Read the frame's `model` against the catalogue. `productModel` is the older field and is kept
 * authoritative when `model` is absent, so a client that predates the picker behaves exactly as
 * before. When both are present and name different Apple models the frame is refused rather than
 * one silently winning, because the two would bill differently.
 */
export async function resolveRunModel(
  env: Env,
  frameModel: unknown,
  productModel: ProductModel | undefined,
  opts: CatalogueOptions = {},
): Promise<RunModelChoice> {
  if (frameModel === undefined || frameModel === null) return { lane: 'apple', productModel };
  if (!isCatalogueModelIdShape(frameModel)) return { lane: 'refused', message: UNKNOWN_MODEL_MESSAGE };
  if (isProductModel(frameModel)) {
    if (productModel !== undefined && productModel !== frameModel) {
      return { lane: 'refused', message: UNKNOWN_MODEL_MESSAGE };
    }
    return { lane: 'apple', productModel: frameModel };
  }
  const entry = await catalogueEntry(env, frameModel, opts);
  if (!entry || entry.builtIn || !entry.supportsTools) return { lane: 'refused', message: UNKNOWN_MODEL_MESSAGE };
  return { lane: 'customer', modelId: entry.id, label: entry.label, free: entry.free };
}

export function missingKeyMessage(label: string): string {
  return `Add your OpenRouter key in Settings to use ${label}.`;
}

/**
 * The key for ONE model call on a customer-key run.
 *
 * The customer's own saved key first. A FREE model may fall back to the platform key, and only when
 * the owner has added one (D-FREE-1); a paid model never does, since Apple would be paying for a run
 * the customer chose to put on their own account.
 */
export async function keyForRun(
  env: ModelKeyEnv & Pick<Env, 'OPENROUTER_API_KEY'>,
  model: Pick<CustomerRunModel, 'free' | 'keyOwnerId' | 'label'>,
): Promise<{ ok: true; apiKey: string } | { ok: false; message: string }> {
  const own = await openModelKey(env, model.keyOwnerId, 'openrouter');
  if (own) return { ok: true, apiKey: own };
  if (model.free && keylessFree(env)) return { ok: true, apiKey: env.OPENROUTER_API_KEY!.trim() };
  return { ok: false, message: missingKeyMessage(model.label) };
}
