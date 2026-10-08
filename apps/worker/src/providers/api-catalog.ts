import type { AiModelCatalog, AiModelRecord, AiProviderId } from '@studpilot/shared';
import type { AiCredentials } from '../ai-connections';
import { apiProvider } from './api-registry';
import { checkedApiFetch, providerUrl } from './api-transport';

const positive = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
const price = (value: unknown) => {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof parsed === 'number' && Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};
const flag = (value: unknown): boolean | null => typeof value === 'boolean' ? value : null;
const words = (value: unknown) => typeof value === 'string' && value.length <= 300 ? value : null;

export function normalizeApiModels(providerId: AiProviderId, records: Record<string, any>[], checkedAt: string): AiModelRecord[] {
  const provider = apiProvider(providerId);
  const models: AiModelRecord[] = [];
  for (const record of records) {
    const id = words(providerId === 'google' || providerId === 'fireworks' ? record.name : record.id ?? record.name ?? record.model_name);
    if (!id || /[\x00-\x1f?#]/.test(id)) continue;
    const parameters = Array.isArray(record.supported_parameters) ? record.supported_parameters : null;
    const geminiChat = Array.isArray(record.supportedGenerationMethods) ? record.supportedGenerationMethods.includes('generateContent') : null;
    const mistralChat = flag(record.capabilities?.completion_chat);
    const retired = record.archived === true || record.active === false || record.status === 'deprecated';
    models.push({ provider: providerId, producer: provider.producer ?? words(record.model_developer ?? record.author),
      id, name: words(record.display_name ?? record.displayName ?? record.displayName ?? record.name) ?? id,
      protocol: provider.protocol,
      lifecycle: retired ? 'retired' : record.status === 'active' || record.active === true || record.archived === false ? 'active' : 'unknown',
      contextWindow: positive(record.context_length ?? record.max_context_length ?? record.context_window
        ?? record.inputTokenLimit ?? record.limits?.maxInputTokens ?? record.max_model_len),
      maxOutput: positive(record.outputTokenLimit ?? record.max_completion_tokens ?? record.top_provider?.max_completion_tokens),
      inputCostPer1M: record.pricing?.prompt !== undefined ? (price(record.pricing.prompt) === null ? null : price(record.pricing.prompt)! * 1_000_000) : null,
      outputCostPer1M: record.pricing?.completion !== undefined ? (price(record.pricing.completion) === null ? null : price(record.pricing.completion)! * 1_000_000) : null,
      capabilities: {
        tools: flag(record.capabilities?.function_calling ?? record.supports_function_calling ?? record.supports_tools)
          ?? (parameters ? parameters.includes('tools') : null),
        structuredOutput: parameters ? parameters.includes('structured_outputs') : flag(record.capabilities?.structured_outputs),
        text: geminiChat ?? mistralChat ?? (typeof record.type === 'string' ? ['chat', 'text-generation', 'chat-completion'].includes(record.type) : null),
      },
      source: provider.docs, checkedAt, access: 'listed', runtimeCheckedAt: null,
    });
  }
  return models;
}

/** Explicit catalogs only where the vendor does not document an account models endpoint. */
const DOCUMENTED_MODELS: Partial<Record<AiProviderId, AiModelRecord[]>> = {
  minimax: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.7-highspeed'].map((id) => ({
    provider: 'minimax', producer: 'MiniMax', id, name: id, protocol: 'chat-completions', lifecycle: 'active',
    contextWindow: id === 'MiniMax-M3' ? 1_000_000 : 204_800, maxOutput: null, inputCostPer1M: null, outputCostPer1M: null,
    capabilities: { tools: true, structuredOutput: null, text: true }, source: apiProvider('minimax').docs,
    checkedAt: '2026-10-08T00:00:00.000Z', access: 'listed', runtimeCheckedAt: null,
  })),
  zai: ['glm-5.3', 'glm-5.2', 'glm-5.1'].map((id) => ({
    provider: 'zai', producer: 'Z.AI', id, name: id.toUpperCase(), protocol: 'chat-completions', lifecycle: 'active',
    contextWindow: null, maxOutput: 131_072, inputCostPer1M: null, outputCostPer1M: null,
    capabilities: { tools: true, structuredOutput: null, text: true }, source: apiProvider('zai').docs,
    checkedAt: '2026-10-08T00:00:00.000Z', access: 'listed', runtimeCheckedAt: null,
  })),
};

/** No global account cache. Callers persist this only under that owner's connection and revision. */
export async function discoverApiModels(provider: AiProviderId, credentials: AiCredentials,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}): Promise<AiModelCatalog> {
  const definition = apiProvider(provider), checkedAt = new Date().toISOString();
  if (!definition.modelsPath) {
    const models = structuredClone(DOCUMENTED_MODELS[provider] ?? []);
    if (!models.length) throw new Error('A documented model catalog is not available.');
    return { provider, checkedAt, version: `${provider}-documented-2026-10-08`, models };
  }
  const rows: Record<string, any>[] = [], seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page++) {
    const url = new URL(providerUrl(provider, credentials, 'models'));
    if (cursor) url.searchParams.set(provider === 'google' || provider === 'fireworks' ? 'pageToken'
      : provider === 'anthropic' ? 'after_id' : 'page_token', cursor);
    if (provider === 'cloudflare') { url.searchParams.set('page', String(page + 1)); url.searchParams.set('per_page', '100'); }
    const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000);
    const response = await checkedApiFetch(provider, url.toString(), credentials, { method: 'GET', signal }, options.fetcher);
    const body = await response.json() as any;
    if (provider === 'cloudflare' && body.success !== true) throw new Error('Cloudflare did not confirm catalog discovery.');
    const items = Array.isArray(body) ? body : body.data ?? body.models ?? body.result;
    if (!Array.isArray(items) || items.some((item) => !item || typeof item !== 'object')) throw new Error('Provider catalog response is invalid.');
    rows.push(...items);
    if (rows.length > 10_000) throw new Error('Provider catalog is too large; narrow the connection catalog.');
    cursor = body.nextPageToken ?? body.next_page_token
      ?? (provider === 'anthropic' && body.has_more ? body.last_id : undefined);
    const moreCloudflare = provider === 'cloudflare' && Number(body.result_info?.total_pages) > page + 1;
    if (!cursor && !moreCloudflare) {
      const models = normalizeApiModels(provider, rows, checkedAt);
      if (!models.length) throw new Error('No usable model identities were returned.');
      return { provider, checkedAt, version: `${provider}-${crypto.randomUUID()}`, models };
    }
    if (cursor && seen.has(cursor)) throw new Error('Provider catalog pagination repeated.');
    if (cursor) seen.add(cursor);
  }
  throw new Error('Provider catalog pagination did not complete.');
}
