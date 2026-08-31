// OpenAI adapter — DISABLED. There is no OPENAI_API_KEY on this account and none is being added.
//
// The code is real and complete so that adding the secret is the only step to enabling it, but
// `availability()` reads env at call time and reports {available:false, reason:'no_credentials'}
// until one exists, and `invoke()` refuses rather than reaching the network without a key.
//
// The OpenAI chat-completions wire shape is also what Workers AI and DeepSeek speak, so the
// encode/decode helpers here are exported and reused by deepseek.ts.
import type { Env } from '../env';
import {
  contentChars,
  ProviderError,
  type EncodedRequest,
  type ErrorClassification,
  type GatewayToolCall,
  type InvokeContext,
  type NormalizedRequest,
  type NormalizedResponse,
  type NormalizedUsage,
  type ProviderAdapter,
  type ProviderAvailability,
  type ProviderId,
  type ProviderModel,
  errorMessage,
} from './types';

export const OPENAI_BASE_URL = 'https://api.openai.com/v1';

export const OPENAI_MODELS: readonly ProviderModel[] = [
  {
    id: 'gpt-5.6-luna',
    displayName: 'GPT-5.6 Luna',
    provider: 'openai',
    supportsTools: true,
    supportsVision: true,
    // NOT VERIFIED. The product brief established the id, tool/vision support and the price; it did
    // not establish these two, and no call has ever been made to check. They are conservative
    // placeholders and are declared as such below rather than dressed up as facts.
    contextWindow: 128_000,
    maxOutput: 16_384,
    inputCostPer1M: 0.2,
    outputCostPer1M: 1.2,
    unverifiedFields: ['contextWindow', 'maxOutput'],
  },
];

// ---------------------------------------------------------------------------
// OpenAI chat-completions wire shape — shared with DeepSeek
// ---------------------------------------------------------------------------

export interface OpenAiWireMessage {
  role: string;
  content: unknown;
  tool_call_id?: string;
  name?: string;
  tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
}

export function encodeOpenAiChat(req: NormalizedRequest): EncodedRequest {
  const messages: OpenAiWireMessage[] = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    ...(m.name ? { name: m.name } : {}),
    ...(m.toolCalls?.length
      ? {
          tool_calls: m.toolCalls.map((c) => ({
            id: c.id,
            type: 'function' as const,
            function: { name: c.name, arguments: c.arguments },
          })),
        }
      : {}),
  }));

  const payload: Record<string, unknown> = {
    model: req.modelId,
    messages,
    max_tokens: req.maxTokens,
    temperature: req.temperature,
  };
  if (req.tools?.length) {
    payload.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (req.jsonSchema) payload.response_format = { type: 'json_schema', json_schema: req.jsonSchema };
  // OpenAI expresses thinking budget as a scalar effort, same vocabulary Golem already uses.
  if (req.reasoningEffort) payload.reasoning_effort = req.reasoningEffort;

  const promptChars =
    messages.reduce((n, m) => n + contentChars(m.content as NormalizedRequest['messages'][number]['content']), 0) +
    JSON.stringify(payload.tools ?? '').length;
  return { payload, promptChars };
}

interface OpenAiResponseShape {
  choices?: {
    finish_reason?: string;
    message?: {
      content?: string | null;
      tool_calls?: { id?: string; type?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

export function decodeOpenAiChat(
  raw: unknown,
  promptChars: number,
  modelId: string,
  provider: ProviderId,
): NormalizedResponse {
  const r = (raw ?? {}) as OpenAiResponseShape;
  const choice = r.choices?.[0];
  const text = typeof choice?.message?.content === 'string' ? choice.message.content : '';

  const toolCalls: GatewayToolCall[] = [];
  for (const tc of choice?.message?.tool_calls ?? []) {
    const name = tc.function?.name;
    if (typeof name !== 'string' || !name) continue;
    toolCalls.push({
      id: typeof tc.id === 'string' ? tc.id : `tc_${toolCalls.length}_${Date.now()}`,
      name,
      arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : '{}',
    });
  }

  const u = r.usage;
  const usage: NormalizedUsage =
    typeof u?.prompt_tokens === 'number' && typeof u?.completion_tokens === 'number'
      ? {
          inputTokens: u.prompt_tokens,
          outputTokens: u.completion_tokens,
          cachedInputTokens: u.prompt_tokens_details?.cached_tokens ?? 0,
        }
      : {
          // no usage reported: estimate conservatively so unmetered calls still cost the budget
          inputTokens: Math.ceil(promptChars / 3.5),
          outputTokens: Math.ceil(text.length / 3.5),
          cachedInputTokens: 0,
        };

  const finish = choice?.finish_reason;
  return {
    text,
    toolCalls,
    usage,
    finishReason: toolCalls.length
      ? 'tool_calls'
      : finish === 'length'
        ? 'length'
        : finish === 'content_filter'
          ? 'error'
          : 'stop',
    provider,
    model: modelId,
  };
}

/**
 * Shared HTTP error classification for OpenAI-compatible endpoints. `retryable` is true only for
 * refusals that happen BEFORE the model runs, where nothing was billed.
 */
export function classifyHttpError(e: unknown): ErrorClassification {
  const status = e instanceof ProviderError ? e.status : undefined;
  const msg = errorMessage(e);
  if (status === 429 || /\b429\b|rate limit|too many requests/i.test(msg)) {
    return { kind: 'rate_limit', retryable: true };
  }
  if (status === 401 || status === 403 || /\b401\b|\b403\b|unauthor|invalid (api )?(key|token)/i.test(msg)) {
    return { kind: 'auth', retryable: false };
  }
  if (/context (length|window)|maximum context|prompt is too long|too many tokens|string too long/i.test(msg)) {
    return { kind: 'context_length', retryable: false };
  }
  if (/content (filter|policy)|safety|flagged|blocked/i.test(msg)) return { kind: 'content_filter', retryable: false };
  if ((status !== undefined && status >= 500) || /\b5\d\d\b|timed? ?out|network|temporarily/i.test(msg)) {
    // A 5xx may or may not have run the model. We do not know, so we do not retry and do not bill twice.
    return { kind: 'transient', retryable: false };
  }
  return { kind: 'unknown', retryable: false };
}

/** POST a chat-completions payload. Never reached without a key — invoke() checks first. */
export async function postJson(
  provider: ProviderId,
  url: string,
  apiKey: string,
  payload: unknown,
): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const cls = classifyHttpError(new ProviderError('unknown', provider, body, res.status));
    throw new ProviderError(cls.kind, provider, `${provider} HTTP ${res.status}: ${body.slice(0, 400)}`, res.status, cls.retryable);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export const openaiAdapter: ProviderAdapter = {
  id: 'openai',
  models: OPENAI_MODELS,

  availability(env: Env): ProviderAvailability {
    const key = env.OPENAI_API_KEY?.trim();
    const available = !!key;
    return {
      provider: 'openai',
      available,
      reason: available ? null : 'no_credentials',
      detail: available
        ? 'OPENAI_API_KEY is set.'
        : 'No OPENAI_API_KEY secret is configured on this worker, so OpenAI cannot be called.',
      unsupportedModelKeys: [],
    };
  },

  encode: encodeOpenAiChat,

  async invoke(env: Env, payload: unknown, _ctx: InvokeContext): Promise<unknown> {
    const key = env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new ProviderError('auth', 'openai', 'OpenAI is not configured: OPENAI_API_KEY is unset.', undefined, false);
    }
    return postJson('openai', `${OPENAI_BASE_URL}/chat/completions`, key, payload);
  },

  decode(raw: unknown, promptChars: number, modelId: string): NormalizedResponse {
    return decodeOpenAiChat(raw, promptChars, modelId, 'openai');
  },

  classifyError: classifyHttpError,
};
