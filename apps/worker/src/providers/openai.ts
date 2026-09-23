// The OpenAI chat-completions wire shape: encode, decode and HTTP error classification.
//
// There is no OpenAI adapter any more. GPT-5.6 Sol and Luna, and Gemini, run on the Workers AI
// binding through AI Gateway (D-VISION-1; see workers-ai.ts). These helpers stay only because the
// customer-key OpenRouter path (openrouter.ts) speaks this wire; they go when that path goes.
import {
  contentChars,
  ProviderError,
  type EncodedRequest,
  type ErrorClassification,
  type GatewayToolCall,
  type NormalizedRequest,
  type NormalizedResponse,
  type NormalizedUsage,
  type ProviderId,
  errorMessage,
} from './types';

// ---------------------------------------------------------------------------
// OpenAI chat-completions wire shape
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
    truncated: finish === 'length',
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
