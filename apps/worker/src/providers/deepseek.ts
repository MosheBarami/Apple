// DeepSeek adapter — DISABLED. No DEEPSEEK_API_KEY exists on this account.
//
// DeepSeek's API is OpenAI-compatible, so the encode/decode/classify helpers come straight from
// openai.ts. The one thing that is NOT shared is capability: DeepSeek V4 Flash has NO VISION, so
// it can never serve the `vision` model key, and `availability()` says so explicitly — even in the
// hypothetical where a key is present. A provider that silently accepted a vision task and
// returned prose about nothing would be worse than one that refuses.
import type { Env } from '../env';
import {
  MODEL_KEY_NEEDS,
  ProviderError,
  type InvokeContext,
  type NormalizedResponse,
  type ProviderAdapter,
  type ProviderAvailability,
  type ProviderModel,
  type UnsupportedModelKey,
} from './types';
import { classifyHttpError, decodeOpenAiChat, encodeOpenAiChat, postJson } from './openai';

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

export const DEEPSEEK_MODELS: readonly ProviderModel[] = [
  {
    id: 'deepseek-v4-flash',
    displayName: 'DeepSeek V4 Flash',
    provider: 'deepseek',
    supportsTools: true,
    // VERIFIED NO. This is the capability gap that makes DeepSeek unusable for Golem's critique
    // loops, which are the whole reason the `vision` key exists.
    supportsVision: false,
    // NOT VERIFIED — see unverifiedFields.
    contextWindow: 128_000,
    maxOutput: 8_192,
    // Peak-hours pricing, which is the only rate we should ever plan against.
    inputCostPer1M: 0.44,
    outputCostPer1M: 1.32,
    unverifiedFields: ['contextWindow', 'maxOutput'],
  },
];

/** Model keys DeepSeek cannot serve, computed from capability rather than asserted. */
export function deepseekUnsupportedKeys(): UnsupportedModelKey[] {
  const model = DEEPSEEK_MODELS[0]!;
  const out: UnsupportedModelKey[] = [];
  for (const [key, needs] of Object.entries(MODEL_KEY_NEEDS)) {
    if (needs.vision && !model.supportsVision) out.push({ key, reason: 'no_vision' });
    else if (needs.tools && !model.supportsTools) out.push({ key, reason: 'no_tools' });
  }
  return out;
}

export const deepseekAdapter: ProviderAdapter = {
  id: 'deepseek',
  models: DEEPSEEK_MODELS,

  availability(env: Env): ProviderAvailability {
    const key = env.DEEPSEEK_API_KEY?.trim();
    const available = !!key;
    const unsupportedModelKeys = deepseekUnsupportedKeys();
    const visionNote = unsupportedModelKeys.length
      ? ` Even with a key it cannot serve the ${unsupportedModelKeys.map((u) => `\`${u.key}\``).join(', ')} model key${unsupportedModelKeys.length > 1 ? 's' : ''}: DeepSeek V4 Flash has no vision.`
      : '';
    return {
      provider: 'deepseek',
      available,
      reason: available ? null : 'no_credentials',
      detail:
        (available
          ? 'DEEPSEEK_API_KEY is set.'
          : 'No DEEPSEEK_API_KEY secret is configured on this worker, so DeepSeek cannot be called.') + visionNote,
      unsupportedModelKeys,
    };
  },

  encode: encodeOpenAiChat,

  async invoke(env: Env, payload: unknown, _ctx: InvokeContext): Promise<unknown> {
    const key = env.DEEPSEEK_API_KEY?.trim();
    if (!key) {
      throw new ProviderError(
        'auth',
        'deepseek',
        'DeepSeek is not configured: DEEPSEEK_API_KEY is unset.',
        undefined,
        false,
      );
    }
    return postJson('deepseek', `${DEEPSEEK_BASE_URL}/chat/completions`, key, payload);
  },

  decode(raw: unknown, promptChars: number, modelId: string): NormalizedResponse {
    return decodeOpenAiChat(raw, promptChars, modelId, 'deepseek');
  },

  classifyError: classifyHttpError,
};
