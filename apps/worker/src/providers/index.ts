// The provider layer's public surface.
//
// Everything above this directory imports from `./providers` and never from a provider file
// directly, so adding a fifth provider is one new adapter plus one line in registry.ts.
//
// STATE OF THE WORLD (D-VISION-1): one platform provider. The Workers AI binding serves Apple,
// Apple MAX and the visual specialist, and — through AI Gateway Unified Billing — the outside
// models (Gemini 3.8 Flash, GPT-5.6 Sol and Luna). The direct-HTTP OpenAI, Google and DeepSeek
// adapters, which never had a credential, are gone.
export * from './types';
export * from './cost';
export * from './health';
export * from './registry';

export {
  workersAiAdapter,
  acceptsReasoningEffort,
  gatewayOpts,
  APPLE_MODEL_ID,
  APPLE_MAX_MODEL_ID,
  VISION_MODEL_ID,
  APPLE_CONTEXT_WINDOW,
  APPLE_MAX_CONTEXT_WINDOW,
  VISION_CONTEXT_WINDOW,
  WORKERS_AI_MODELS,
} from './workers-ai';
export { classifyHttpError, encodeOpenAiChat, decodeOpenAiChat } from './openai';
export {
  openrouterAdapter,
  encodeOpenRouterChat,
  postOpenRouterChat,
  checkOpenRouterKey,
  openRouterFailure,
  scrubKey,
  CustomerKeyError,
  isCustomerKeyError,
  OPENROUTER_BASE_URL,
  type FetchLike,
} from './openrouter';
