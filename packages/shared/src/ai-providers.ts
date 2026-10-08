/** API accounts only. Coding subscriptions and arbitrary user-supplied origins are separate. */
export const AI_PROVIDER_IDS = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'groq',
  'cerebras', 'together', 'fireworks', 'openrouter', 'deepinfra', 'moonshot', 'minimax', 'zai',
  'qwen', 'huggingface', 'cohere', 'cloudflare'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];
export type ApiProtocol = 'responses' | 'chat-completions' | 'anthropic' | 'gemini' | 'cohere' | 'workers-http';
export interface AiModelRecord {
  provider: AiProviderId;
  producer: string | null;
  id: string;
  name: string;
  protocol: ApiProtocol;
  lifecycle: 'active' | 'retired' | 'unknown';
  contextWindow: number | null;
  maxOutput: number | null;
  inputCostPer1M: number | null;
  outputCostPer1M: number | null;
  capabilities: { tools: boolean | null; structuredOutput: boolean | null; text: boolean | null };
  source: string;
  checkedAt: string;
  access: 'listed' | 'inference-verified';
  runtimeCheckedAt: string | null;
}
export interface AiModelCatalog { version: string; provider: AiProviderId; checkedAt: string; models: AiModelRecord[] }
export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}
