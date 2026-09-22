// Google Gemini adapter — DISABLED. No GOOGLE_API_KEY exists on this account.
//
// Gemini is the only one of the four that does NOT speak the OpenAI wire shape, so this file
// carries the real work of the provider-neutral layer: a complete two-way translation between
// Golem's normalized request/response and Gemini's `contents` / `functionDeclarations` /
// `functionCall` / `functionResponse` vocabulary.
//
// Both directions matter and both are implemented:
//   OUT  tool definitions  -> tools[].functionDeclarations[]
//        assistant tool calls -> parts[].functionCall  { name, args: object }
//        tool results         -> parts[].functionResponse { name, response }
//        images (data: URLs)  -> parts[].inlineData { mimeType, data }
//        system message       -> systemInstruction (Gemini has no `system` role)
//   IN   parts[].functionCall -> GatewayToolCall { name, arguments: JSON string }
//        candidates[0].content.parts[].text -> text
//        usageMetadata        -> NormalizedUsage
import type { Env } from '../env';
import {
  ProviderError,
  contentText,
  type EncodedRequest,
  type GatewayMessage,
  type GatewayToolCall,
  type GatewayToolDef,
  type InvokeContext,
  type NormalizedRequest,
  type NormalizedResponse,
  type NormalizedUsage,
  type ProviderAdapter,
  type ProviderAvailability,
  type ProviderModel,
} from './types';
import { classifyHttpError } from './openai';

export const GOOGLE_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export const GOOGLE_MODELS: readonly ProviderModel[] = [
  {
    id: 'gemini-3.7-flash',
    displayName: 'Gemini 3.7 Flash',
    provider: 'google',
    supportsTools: true,
    supportsVision: true,
    // NOT VERIFIED — see unverifiedFields. Gemini Flash models are historically large-context, but
    // "historically" is not a source, and this provider has never been called from here.
    contextWindow: 1_048_576,
    maxOutput: 8_192,
    inputCostPer1M: 0.75,
    outputCostPer1M: 3.75,
    unverifiedFields: ['contextWindow', 'maxOutput'],
  },
];

// ---------------------------------------------------------------------------
// wire types
// ---------------------------------------------------------------------------

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters: unknown;
}

// ---------------------------------------------------------------------------
// OUT: Golem -> Gemini
// ---------------------------------------------------------------------------

/** Tool definitions: OpenAI's `tools[].function` becomes Gemini's single `functionDeclarations` block. */
export function toGeminiTools(tools: readonly GatewayToolDef[]): { functionDeclarations: GeminiFunctionDeclaration[] }[] {
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/** `data:image/png;base64,AAAA` -> Gemini inlineData. Returns null for anything that is not a data URL. */
export function dataUrlToInlineData(url: string): { mimeType: string; data: string } | null {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  if (!m) return null;
  return { mimeType: m[1]!, data: m[2]! };
}

function partsForContent(content: GatewayMessage['content']): GeminiPart[] {
  if (typeof content === 'string') return content ? [{ text: content }] : [];
  const parts: GeminiPart[] = [];
  for (const p of content) {
    if ('text' in p) {
      if (p.text) parts.push({ text: p.text });
    } else {
      const inline = dataUrlToInlineData(p.image_url.url);
      // A non-data URL cannot be inlined; Gemini would need a Files API upload, which this adapter
      // does not do. Degrade to a marker rather than silently dropping the attachment.
      parts.push(inline ? { inlineData: inline } : { text: '[image omitted: not a data: URL]' });
    }
  }
  return parts;
}

export interface GeminiConversation {
  systemInstruction?: { parts: GeminiPart[] };
  contents: GeminiContent[];
}

/**
 * Messages -> Gemini conversation. Gemini has no `system` role and no `tool` role: the system
 * message becomes `systemInstruction`, and a tool result becomes a user turn carrying a
 * `functionResponse` part keyed by the tool's NAME (Gemini correlates by name, not by call id).
 */
export function toGeminiContents(messages: readonly GatewayMessage[]): GeminiConversation {
  let systemInstruction: { parts: GeminiPart[] } | undefined;
  const contents: GeminiContent[] = [];

  for (const m of messages) {
    if (m.role === 'system') {
      const parts = partsForContent(m.content);
      // Multiple system messages concatenate; Gemini accepts only one instruction block.
      systemInstruction = { parts: [...(systemInstruction?.parts ?? []), ...parts] };
      continue;
    }
    if (m.role === 'tool') {
      const name = m.name ?? m.toolCallId ?? 'tool';
      let response: Record<string, unknown>;
      const raw = contentText(m.content);
      try {
        const parsed: unknown = JSON.parse(raw);
        response = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? (parsed as Record<string, unknown>)
          : { result: parsed };
      } catch {
        response = { result: raw };
      }
      contents.push({ role: 'user', parts: [{ functionResponse: { name, response } }] });
      continue;
    }
    if (m.role === 'assistant') {
      const parts = partsForContent(m.content);
      for (const c of m.toolCalls ?? []) {
        let args: Record<string, unknown> = {};
        try {
          const parsed: unknown = JSON.parse(c.arguments || '{}');
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) args = parsed as Record<string, unknown>;
        } catch {
          /* a model that emitted unparseable arguments gets an empty object, not a crash */
        }
        parts.push({ functionCall: { name: c.name, args } });
      }
      contents.push({ role: 'model', parts });
      continue;
    }
    contents.push({ role: 'user', parts: partsForContent(m.content) });
  }

  return systemInstruction ? { systemInstruction, contents } : { contents };
}

export function encodeGemini(req: NormalizedRequest): EncodedRequest {
  const convo = toGeminiContents(req.messages);
  const generationConfig: Record<string, unknown> = {
    maxOutputTokens: req.maxTokens,
    temperature: req.temperature,
  };
  if (req.jsonSchema) {
    generationConfig.responseMimeType = 'application/json';
    generationConfig.responseSchema = req.jsonSchema;
  }
  if (req.reasoningEffort) {
    // Gemini expresses thinking budget as a token count, not a scalar effort. Map Golem's three
    // levels onto budgets in the same spirit as the GLM measurements: low means "barely think".
    const budget = req.reasoningEffort === 'high' ? 4_096 : req.reasoningEffort === 'medium' ? 1_024 : 128;
    generationConfig.thinkingConfig = { thinkingBudget: budget };
  }

  const payload: Record<string, unknown> = { ...convo, generationConfig };
  if (req.tools?.length) payload.tools = toGeminiTools(req.tools);

  // Same conservative accounting as every other adapter: every character of every part, plus the
  // encoded tool block, charged to the pre-flight reservation.
  const partChars = (parts: GeminiPart[]): number =>
    parts.reduce(
      (n, p) => n + (p.text?.length ?? 0) + (p.inlineData?.data.length ?? 0) + JSON.stringify(p.functionCall ?? p.functionResponse ?? '').length,
      0,
    );
  const promptChars =
    partChars(convo.systemInstruction?.parts ?? []) +
    convo.contents.reduce((n, c) => n + partChars(c.parts), 0) +
    JSON.stringify(payload.tools ?? '').length;

  return { payload, promptChars };
}

// ---------------------------------------------------------------------------
// IN: Gemini -> Golem
// ---------------------------------------------------------------------------

interface GeminiResponseShape {
  candidates?: { content?: { parts?: GeminiPart[] }; finishReason?: string }[];
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  promptFeedback?: { blockReason?: string };
}

/** `functionCall` part -> GatewayToolCall. Gemini's `args` is an object; Golem carries a JSON string. */
export function fromGeminiFunctionCall(part: GeminiPart, index: number): GatewayToolCall | null {
  const fc = part.functionCall;
  if (!fc || typeof fc.name !== 'string' || !fc.name) return null;
  return { id: `tc_${index}_${Date.now()}`, name: fc.name, arguments: JSON.stringify(fc.args ?? {}) };
}

export function decodeGemini(raw: unknown, promptChars: number, modelId: string): NormalizedResponse {
  const r = (raw ?? {}) as GeminiResponseShape;
  const candidate = r.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];

  const text = parts
    .map((p) => p.text ?? '')
    .join('')
    .trim();

  const toolCalls: GatewayToolCall[] = [];
  for (const p of parts) {
    const call = fromGeminiFunctionCall(p, toolCalls.length);
    if (call) toolCalls.push(call);
  }

  const u = r.usageMetadata;
  const usage: NormalizedUsage =
    typeof u?.promptTokenCount === 'number'
      ? {
          inputTokens: u.promptTokenCount,
          outputTokens: u.candidatesTokenCount ?? 0,
          cachedInputTokens: u.cachedContentTokenCount ?? 0,
        }
      : {
          inputTokens: Math.ceil(promptChars / 3.5),
          outputTokens: Math.ceil(text.length / 3.5),
          cachedInputTokens: 0,
        };

  const finish = candidate?.finishReason;
  const blocked = !!r.promptFeedback?.blockReason || finish === 'SAFETY' || finish === 'RECITATION';
  return {
    text,
    toolCalls,
    usage,
    truncated: finish === 'MAX_TOKENS',
    finishReason: toolCalls.length
      ? 'tool_calls'
      : finish === 'MAX_TOKENS'
        ? 'length'
        : blocked
          ? 'error'
          : 'stop',
    provider: 'google',
    model: modelId,
  };
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export const googleAdapter: ProviderAdapter = {
  id: 'google',
  models: GOOGLE_MODELS,

  availability(env: Env): ProviderAvailability {
    const key = env.GOOGLE_API_KEY?.trim();
    const available = !!key;
    return {
      provider: 'google',
      available,
      reason: available ? null : 'no_credentials',
      detail: available
        ? 'GOOGLE_API_KEY is set.'
        : 'No GOOGLE_API_KEY secret is configured on this worker, so Gemini cannot be called.',
      unsupportedModelKeys: [],
    };
  },

  encode: encodeGemini,

  async invoke(env: Env, payload: unknown, ctx: InvokeContext): Promise<unknown> {
    const key = env.GOOGLE_API_KEY?.trim();
    if (!key) {
      throw new ProviderError('auth', 'google', 'Gemini is not configured: GOOGLE_API_KEY is unset.', undefined, false);
    }
    // The key travels in a header, never in the query string.
    const url = `${GOOGLE_BASE_URL}/models/${encodeURIComponent(ctx.modelId)}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const cls = classifyHttpError(new ProviderError('unknown', 'google', body, res.status));
      throw new ProviderError(cls.kind, 'google', `google HTTP ${res.status}: ${body.slice(0, 400)}`, res.status, cls.retryable);
    }
    return res.json();
  },

  decode: decodeGemini,

  classifyError: classifyHttpError,
};
