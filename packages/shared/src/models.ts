// The model picker's vocabulary: which models a customer can choose, and the keys that unlock the
// ones Apple does not pay for.
//
// Owner decisions D-BYOK-1, D-BYOK-2 and D-FREE-1 (docs/autonomy/DECISIONS.md). The worker is the
// authority for every value here — `GET /api/models` returns the catalogue and
// `GET /api/me/model-keys` returns the saved keys — and the browser renders what it is given. The
// types live in @golem/shared so the picker and the worker cannot drift apart on a field name.

/**
 * Providers a customer may save their OWN key for.
 *
 * OpenRouter only, for now. The owner's list (D-BYOK-1) also names OpenAI, Anthropic, Google and
 * DeepSeek, and a key for one of those is accepted only once the worker can actually spend it — a
 * settings page that stores a key nothing reads tells the customer their key is in use when it is
 * not. OpenRouter reaches every model in the catalogue through one OpenAI-compatible endpoint.
 */
export const BYOK_PROVIDERS = ['openrouter'] as const;
export type ByokProvider = (typeof BYOK_PROVIDERS)[number];

export function isByokProvider(value: unknown): value is ByokProvider {
  return typeof value === 'string' && (BYOK_PROVIDERS as readonly string[]).includes(value);
}

/** What the browser may ever see of a saved key. Never the key itself. */
export interface ModelKeySummary {
  provider: ByokProvider;
  /** The last four characters, so "is this the key I pasted?" can be answered. */
  last4: string;
  /** ISO time the key was saved. */
  addedAt: string;
}

/**
 * The result of checking a key with its provider when it is saved.
 *
 * `unchecked` is its own answer: the provider could not be asked (network, outage), which is not
 * the same fact as "the key works".
 */
export type ModelKeyCheck = 'valid' | 'invalid' | 'unchecked';

/** One row of the model picker. */
export interface CatalogueModel {
  /**
   * The id a chat frame sends back as `model`. Built-in Apple models use their ProductModel id
   * (`apple`, `apple-max`); every other id is OpenRouter's own model id, read from OpenRouter.
   */
  id: string;
  label: string;
  vendor: string;
  /** True when the model can only run on the customer's own key. */
  requiresKey: boolean;
  /** Priced at zero by the provider today (D-FREE-1). Free promotions end; this is read live. */
  free: boolean;
  supportsTools: boolean;
  /** Apple's own models: they run on Apple and spend Apple Credits. */
  builtIn: boolean;
}

export interface ModelCatalogue {
  models: CatalogueModel[];
  free: {
    /** When the free list was read from OpenRouter, ISO. */
    readAt: string;
    /** `live`: read from OpenRouter within the last hour. `snapshot`: the live read failed. */
    source: 'live' | 'snapshot';
    /** True when Apple holds a platform OpenRouter key, so free models run without the customer's. */
    keyless: boolean;
  };
}

/** Longest model id a frame may carry. OpenRouter ids are well under this. */
export const CATALOGUE_MODEL_ID_MAX = 128;

/** Shape check only; whether the id is in the catalogue is the worker's question. */
export function isCatalogueModelIdShape(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= CATALOGUE_MODEL_ID_MAX &&
    /^[a-z0-9][a-z0-9._:/-]*$/i.test(value)
  );
}
