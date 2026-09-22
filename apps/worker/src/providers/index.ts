// The provider layer's public surface.
//
// Everything above this directory imports from `./providers` and never from a provider file
// directly, so adding a fifth provider is one new adapter plus one line in registry.ts.
//
// STATE OF THE WORLD (2026-09-18): exactly one provider is usable. Cloudflare Workers AI is bound
// and serves the Apple / Apple MAX routes plus the internal visual specialist. OpenAI, Google and DeepSeek are fully implemented
// and fully DISABLED — no credential exists for any of them, `availability()` says so, and their
// `invoke()` refuses before touching the network.
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
export { openaiAdapter, OPENAI_MODELS, classifyHttpError, encodeOpenAiChat, decodeOpenAiChat } from './openai';
export { googleAdapter, GOOGLE_MODELS, encodeGemini, decodeGemini, toGeminiTools, toGeminiContents, fromGeminiFunctionCall, dataUrlToInlineData } from './google';
export { deepseekAdapter, DEEPSEEK_MODELS, deepseekUnsupportedKeys } from './deepseek';
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
