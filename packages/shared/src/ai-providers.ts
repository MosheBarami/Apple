/** API accounts only. Coding subscriptions and arbitrary user-supplied origins are separate. */
export const AI_PROVIDER_IDS = ['openai', 'anthropic', 'google', 'xai', 'deepseek', 'mistral', 'groq',
  'cerebras', 'together', 'fireworks', 'openrouter', 'deepinfra', 'moonshot', 'minimax', 'zai',
  'qwen', 'huggingface', 'cohere', 'cloudflare'] as const;
export type AiProviderId = typeof AI_PROVIDER_IDS[number];
export interface AiConnectionView {
  id: string; provider: AiProviderId; name: string; hint: string;
  status: 'unverified' | 'catalog_loaded' | 'verified' | 'invalid' | 'unavailable';
  createdAt: string; updatedAt: string; revision: number;
  catalogVersion: string | null; checkedAt: string | null;
}
export type ApiProtocol = 'responses' | 'chat-completions' | 'anthropic' | 'gemini' | 'cohere' | 'workers-http' | 'opencode-cli';
export interface AiModelRecord {
  provider: AiProviderId | 'opencode';
  producer: string | null;
  /** Explicit upstream host returned by an aggregator's model API; never inferred from its id. */
  hostedBy?: string;
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
  availability?: { kind: 'available' | 'rate_limited' | 'unavailable' | 'access_denied'; checkedAt: string; retryAt?: string };
  verification?: { tools?: { passed: boolean; checkedAt: string } };
  /** Actual scoped probe outcomes, not a reputation score inferred from a model name. */
  quality?: Partial<Record<'tools' | 'schema' | 'luau' | 'repair' | 'planning' | 'intake' | 'summary' | 'evidence',
    { attempts: number; passed: number; medianLatencyMs: number | null; latenciesMs?: number[] }>>;
}
export interface AiModelCatalog { version: string; provider: AiProviderId; checkedAt: string; models: AiModelRecord[] }
export function isAiProviderId(value: unknown): value is AiProviderId {
  return typeof value === 'string' && (AI_PROVIDER_IDS as readonly string[]).includes(value);
}
