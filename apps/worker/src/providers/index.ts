// The provider layer's public surface.
//
// Everything above this directory imports from `./providers` and never from a provider file
// directly, so adding a fifth provider is one new adapter plus one line in registry.ts.
//
// STATE OF THE WORLD (2026-08-31): exactly one provider is usable. Cloudflare Workers AI is bound
// and serves GLM-5.3 Flash for every model key. OpenAI, Google and DeepSeek are fully implemented
// and fully DISABLED — no credential exists for any of them, `availability()` says so, and their
// `invoke()` refuses before touching the network.
export * from './types';
export * from './cost';
export * from './health';
export * from './registry';

export { workersAiAdapter, gatewayOpts, GLM_MODEL_ID, WORKERS_AI_MODELS } from './workers-ai';
export { openaiAdapter, OPENAI_MODELS, classifyHttpError, encodeOpenAiChat, decodeOpenAiChat } from './openai';
export { googleAdapter, GOOGLE_MODELS, encodeGemini, decodeGemini, toGeminiTools, toGeminiContents, fromGeminiFunctionCall, dataUrlToInlineData } from './google';
export { deepseekAdapter, DEEPSEEK_MODELS, deepseekUnsupportedKeys } from './deepseek';
