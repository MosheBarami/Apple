// The provider layer's public surface.
//
// Everything above this directory imports from `./providers` and never from a provider file
// directly, so adding a fifth provider is one new adapter plus one line in registry.ts.
//
// STATE OF THE WORLD (V3 gate G01): one platform provider. The Workers AI binding serves StudPilot, the
// one customer engine, and the visual specialist. The direct-HTTP OpenAI, Google and DeepSeek
// adapters, which never had a credential, are gone.
export * from './types';
export * from './cost';
export * from './health';
export * from './registry';

export {
  workersAiAdapter,
  acceptsReasoningEffort,
  gatewayOpts,
  STUDPILOT_MODEL_ID,
  STUDPILOT_CONTEXT_WINDOW,
  WORKERS_AI_MODELS,
} from './workers-ai';
