import type { AiProviderId } from '@studpilot/shared';
import type { AiCredentials } from '../ai-connections';
import type { NormalizedRequest } from './types';
import { apiProvider } from './api-registry';
import { encodeApiRequest, decodeApiResponse } from './api-codecs';
import { collectApiStream } from './api-stream';

export class ApiInvocationError extends Error {
  constructor(readonly code: 'auth' | 'rate_limit' | 'billing' | 'context' | 'blocked' | 'unavailable' | 'interrupted' | 'invalid_response',
    readonly provider: AiProviderId | 'opencode', message: string, readonly status?: number, readonly retryAfterMs?: number) {
    super(message); this.name = 'ApiInvocationError';
  }
}
export function apiHeaders(provider: AiProviderId, credentials: AiCredentials): Record<string, string> {
  return { 'Content-Type': 'application/json', ...(provider === 'anthropic'
    ? { 'x-api-key': credentials.apiKey, 'anthropic-version': '2023-06-01' }
    : provider === 'google' ? { 'x-goog-api-key': credentials.apiKey }
    : { Authorization: `Bearer ${credentials.apiKey}` }) };
}
export function providerUrl(providerId: AiProviderId, credentials: AiCredentials, operation: 'models' | 'infer',
  modelId?: string, stream = false): string {
  const provider = apiProvider(providerId);
  // No custom origin, port, redirect or endpoint can be supplied in credentials.
  if (providerId === 'cloudflare') {
    if (!credentials.accountId || !/^[a-f0-9]{32}$/.test(credentials.accountId)) throw new Error('Cloudflare requires an account ID and API token.');
    if (operation === 'models') return `${provider.origin}${provider.path}/${credentials.accountId}/ai/models/search`;
    if (!modelId || !/^@(?:cf|hf)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(modelId)) throw new Error('Invalid Cloudflare model ID.');
    return `${provider.origin}${provider.path}/${credentials.accountId}/ai/run/${modelId}`;
  }
  if (providerId === 'google' && operation === 'infer') {
    const id = modelId?.replace(/^models\//, '');
    if (!id || !/^[A-Za-z0-9._-]+$/.test(id)) throw new Error('Invalid Gemini model ID.');
    return `${provider.origin}${provider.path}/${id}:${stream ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  }
  if (operation === 'models' && !provider.modelsPath) throw new Error('This provider uses a documented catalog.');
  return `${provider.origin}${operation === 'models' ? provider.modelsPath : provider.path}`;
}
export async function checkedApiFetch(provider: AiProviderId, url: string, credentials: AiCredentials,
  init: RequestInit, fetcher: typeof fetch = fetch): Promise<Response> {
  const expected = apiProvider(provider).origin;
  if (new URL(url).origin !== expected || new URL(url).username || new URL(url).password) throw new Error('Provider origin mismatch.');
  let response;
  // The pinned local workerd rejects redirect:error. Manual plus
  // explicit rejection below keeps credentials on their reviewed origin in both runtimes.
  try { response = await fetcher(url, { ...init, headers: apiHeaders(provider, credentials), redirect: 'manual' }); }
  catch {
    throw new ApiInvocationError(init.signal?.aborted ? 'interrupted' : 'unavailable', provider,
      init.signal?.aborted ? 'Inference was cancelled or timed out.' : 'The provider could not be reached.');
  }
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel().catch(() => {});
    throw new ApiInvocationError('blocked', provider, 'Provider redirects are not allowed for API credentials.', response.status);
  }
  if (!response.ok) {
    const seconds = Number(response.headers.get('Retry-After'));
    const date = Date.parse(response.headers.get('Retry-After') ?? '');
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 3600_000)
      : Number.isFinite(date) ? Math.max(0, Math.min(date - Date.now(), 3600_000)) : undefined;
    const code = [401, 403].includes(response.status) ? 'auth' : response.status === 429 ? 'rate_limit'
      : response.status === 402 ? 'billing'
      : response.status === 413 ? 'context' : response.status >= 500 ? 'unavailable' : 'blocked';
    // Never surface/log provider response bodies. They can echo API keys, prompts or private paths.
    await response.body?.cancel().catch(() => {});
    throw new ApiInvocationError(code, provider, code === 'auth' ? 'The provider rejected this connection or model access.'
      : code === 'rate_limit' ? 'The provider rate limit or quota was reached.'
      : code === 'billing' ? 'Your provider account requires available inference credits.' : 'The provider rejected the inference request.',
    response.status, retryAfterMs);
  }
  return response;
}

export async function invokeApi(provider: AiProviderId, credentials: AiCredentials, request: NormalizedRequest,
  options: { signal?: AbortSignal; stream?: boolean; onText?: (delta: string) => void; fetcher?: typeof fetch } = {}) {
  const definition = apiProvider(provider), streaming = options.stream ?? Boolean(options.onText);
  const payload = encodeApiRequest(provider, request);
  if (streaming && provider !== 'google') payload.stream = true;
  // These providers document the OpenAI stream usage option; others report it in final events.
  if (streaming && ['openai', 'minimax', 'openrouter', 'together', 'fireworks', 'deepinfra', 'huggingface'].includes(provider)
    && definition.protocol === 'chat-completions') payload.stream_options = { include_usage: true };
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000);
  const response = await checkedApiFetch(provider, providerUrl(provider, credentials, 'infer', request.modelId, streaming), credentials,
    { method: 'POST', body: JSON.stringify(payload), signal }, options.fetcher);
  let raw;
  try {
    if (streaming) {
      if (!response.body) throw new Error('Missing provider stream.');
      raw = await collectApiStream(response.body, definition.protocol);
    } else {
      if (!response.body) throw new Error('Missing provider response.');
      const reader = response.body.getReader(), decoder = new TextDecoder();
      let text = '', bytes = 0;
      try {
        while (true) {
          const chunk = await reader.read(); if (chunk.done) break;
          bytes += chunk.value.byteLength;
          if (bytes > 4 * 1024 * 1024) throw new Error('Provider response exceeded its output limit.');
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      raw = JSON.parse(text);
    }
  } catch { throw new ApiInvocationError('interrupted', provider, 'The provider returned an incomplete or unreadable response.'); }
  if (credentials.apiKey.length >= 8 && JSON.stringify(raw).includes(credentials.apiKey)) {
    throw new ApiInvocationError('invalid_response', provider, 'The provider echoed credential material. Its response was discarded.');
  }
  const result = decodeApiResponse(provider, request.modelId, raw);
  if (result.finishReason === 'error') throw new ApiInvocationError('invalid_response', provider, 'The provider did not confirm a complete response.');
  if (result.text && !result.truncated) options.onText?.(result.text);
  if (result.finishReason === 'error') throw new ApiInvocationError('invalid_response', provider, 'The provider did not complete inference.');
  return result;
}
