// Cloudflare Workers AI adapter — the ONLY provider Golem actually runs.
//
// This is a lift of the code that lived inline in gateway.ts, moved behind the adapter interface
// WITHOUT changing a byte of its arithmetic:
//   * encode() builds the same wire payload gateway.ts built, in the same order, and computes the
//     same promptChars the reservation was charged against
//   * invoke() is the same `env.AI.run(id, payload, gatewayOpts(...))` call with the same options
//   * decode() is extractText / extractToolCalls / extractUsage, unchanged
//   * classifyError()'s `retryable` is the EXACT regex gateway.ts used for its rate-limit retry
//
// Workers AI is reached through a BINDING, not HTTP: there is no key and no base URL, which is
// why its availability is "does env.AI exist", not "is a secret set".
import type { Env } from '../env';
import {
  contentChars,
  type EncodedRequest,
  type ErrorClassification,
  type GatewayToolCall,
  type InvokeContext,
  type NormalizedRequest,
  type NormalizedResponse,
  type NormalizedUsage,
  type ProviderAdapter,
  type ProviderAvailability,
  type ProviderModel,
  errorMessage,
} from './types';

/** Product-model routing. Apple chosen 2026-09-18; Apple MAX moved to GLM-5.3 Flash on 2026-09-19. */
export const APPLE_MODEL_ID = '@cf/qwen/qwen3-30b-a3b-fp8';

/**
 * THE MAX LANE AND THE VISUAL CRITIC ARE NOW THE SAME MODEL, and that is worth saying rather than
 * leaving for someone to notice two equal strings.
 *
 * The paid lane ran on glm-4.7-flash, which has no row in docs/evals/RESULTS.md — it was never
 * measured on this product's suite. The only MAX model that was is glm-5.3-flash, and it had been
 * demoted to vision. So the mode a customer pays for was the unevaluated one, and the owner's call
 * on 2026-09-19 put it back.
 *
 * They remain two LANES, not one: `stone`/`rune` and `vision` keep their own maxTokens, temperature
 * and tool settings in DEFAULT_MODELS. They merely resolve to the same weights now, which is what
 * makes the MAX lane multimodal as a side effect.
 */
export const APPLE_MAX_MODEL_ID = '@cf/zai-org/glm-5.3-flash';
export const VISION_MODEL_ID = '@cf/zai-org/glm-5.3-flash';

export const APPLE_CONTEXT_WINDOW = 32_768;
export const APPLE_MAX_CONTEXT_WINDOW = 1_310_720;
export const VISION_CONTEXT_WINDOW = 1_310_720;

/**
 * The catalogue must list every id DEFAULT_MODELS can point at. `modelById()` returns undefined for
 * anything missing here; the gateway then falls back to `neuronsFor()` so billing still settles
 * correctly, but the capability table and the public readiness contract would describe a model the
 * product no longer runs. Catalogue and gateway.ts DEFAULT_MODELS move together.
 *
 * Context windows and capability flags below are from Cloudflare's model catalogue, checked
 * 2026-09-18. Costs mirror MODEL_PRICES in pricing.ts — if one moves, move both.
 */
export const WORKERS_AI_MODELS: readonly ProviderModel[] = [
  {
    // Authoring flagship for Agent and Super Agent. 97.6 overall on the repo's own 56-task Roblox
    // eval, 100.0 on api-knowledge and ui-implementation (docs/evals/FINDINGS.md).
    id: '@cf/openai/gpt-oss-120b',
    displayName: 'GPT-OSS 120B',
    provider: 'workers-ai',
    supportsTools: true,
    supportsVision: false,
    contextWindow: 128_000,
    maxOutput: 6_500,
    inputCostPer1M: 0.35,
    outputCostPer1M: 0.75,
    unverifiedFields: [],
  },
  {
    // Plan mode and housekeeping: cheap, tool-capable, and structurally unable to mutate anything
    // in Plan mode (see router.ts).
    id: '@cf/openai/gpt-oss-20b',
    displayName: 'GPT-OSS 20B',
    provider: 'workers-ai',
    supportsTools: true,
    supportsVision: false,
    contextWindow: 128_000,
    maxOutput: 2_000,
    inputCostPer1M: 0.2,
    outputCostPer1M: 0.3,
    unverifiedFields: [],
  },
  {
    // The ONLY free-eligible model here that accepts image input. vision.ts sends real pixels and
    // instructs the model to judge only what it can see, so this entry existing and being
    // vision-capable is what keeps the visual critic visual.
    id: '@cf/meta/llama-3.2-11b-vision-instruct',
    displayName: 'Llama 3.2 11B Vision',
    provider: 'workers-ai',
    supportsTools: false,
    supportsVision: true,
    contextWindow: 128_000,
    maxOutput: 4_000,
    inputCostPer1M: 0.049,
    outputCostPer1M: 0.68,
    unverifiedFields: [],
  },
  {
    id: APPLE_MODEL_ID,
    displayName: 'Qwen3 30B A3B FP8',
    provider: 'workers-ai',
    supportsTools: true,
    supportsVision: false,
    contextWindow: APPLE_CONTEXT_WINDOW,
    maxOutput: 2_000,
    inputCostPer1M: 0.0509,
    outputCostPer1M: 0.335,
    unverifiedFields: ['maxOutput'],
  },
  // ONE ROW, because APPLE_MAX_MODEL_ID and VISION_MODEL_ID are now the same id. A second row for
  // the same string would make `modelById()` return whichever came first and quietly hide the other
  // one's figures — two catalogue entries for one model is a disagreement waiting to be believed.
  {
    id: VISION_MODEL_ID,
    displayName: 'GLM-5.3 Flash',
    provider: 'workers-ai',
    supportsTools: true,
    supportsVision: true,
    contextWindow: VISION_CONTEXT_WINDOW,
    maxOutput: 6_500,
    inputCostPer1M: 0.15,
    outputCostPer1M: 0.5,
    unverifiedFields: [],
  },
];

/**
 * Options attached to every env.AI.run call: session affinity, caching, logging, cost attribution.
 *
 * SESSION AFFINITY IS WHY cached_tokens WAS ALWAYS 0. Workers AI does prefix caching — it reuses
 * the prefill tensors for the shared prefix of consecutive requests and bills those tokens at a
 * discounted cached rate — but only when consecutive requests land on the same model instance, and
 * that requires the `x-session-affinity` header. Golem sent none, so every step re-prefilled an
 * identical ~5,200-token prefix of system prompt plus tool definitions from cold.
 * https://developers.cloudflare.com/changelog/product/workers-ai/ ("Prefix caching and session
 * affinity") describes exactly this workload: "When an agent sends a new prompt, it resends all
 * previous prompts, tools, and context from the session."
 *
 * The key is the caller's own session identifier and is never shared between tenants. It is a
 * ROUTING hint, not a cache key: it decides which instance serves the request, so a collision costs
 * a cache miss, never a cross-tenant read. Response caching, which WOULD be a cross-tenant risk, is
 * a different feature and stays off (cacheTtl 0) on every agent call.
 *
 * THAT LAST SENTENCE IS TRUE ABOUT WHAT THIS WORKER SENDS AND IT DOES NOT MEAN NOTHING IS REPLAYED.
 * Measured 2026-09-20T23:31Z-2026-09-21T00:00Z, six sixteen-prompt runs through
 * /api/admin/model-test, which reaches llmChat with no options at all and therefore with cacheTtl 0:
 *
 *     gap between runs   answers byte-identical
 *     ~2 min             16 of 16
 *     ~3.5 min           13 of 16
 *     ~5 min              2 of 16
 *     ~9 min              0 of 16
 *
 * Monotonic decay with the time gap is a cache with a TTL of roughly five minutes. It is not
 * determinism, which would be 16 of 16 at every gap. WHERE it lives is NOT established here — only
 * that it is not this worker's response cache, because this worker asked for none. What IS
 * established is the billing consequence: gateway.ts computes neurons locally from the returned
 * usage, so the two runs two minutes apart were charged 207 neurons EACH for one generation. An
 * eval that treats such a pair as two samples reports a precision that does not exist;
 * docs/frontier-for-roblox.md §8.3 discards one on exactly this evidence.
 */
export function gatewayOpts(env: Env, kind: string, cacheTtl: number, sessionId?: string) {
  const id = env.AI_GATEWAY_ID;
  const affinity = sessionId ? { extraHeaders: { 'x-session-affinity': sessionId } } : undefined;
  if (!id) return affinity;
  return { ...affinity, gateway: { id, cacheTtl, collectLog: true, metadata: { kind } } };
}

// ---------------------------------------------------------------------------
// response normalization (moved verbatim from gateway.ts)
// ---------------------------------------------------------------------------

export function extractText(r: any): string {
  // Reasoning models (GLM-5.3) return message.content alongside message.reasoning_content.
  // Only `content` is the answer — reasoning_content is an internal scratchpad and must never
  // reach the user or be fed back as if it were the model's reply.
  const rc = r?.choices?.[0]?.message;
  if (rc && typeof rc.content === 'string' && rc.content.length > 0) return rc.content;
  if (typeof r === 'string') return r;
  if (typeof r?.response === 'string') return r.response;
  if (typeof r?.output_text === 'string') return r.output_text;
  if (typeof r?.result?.response === 'string') return r.result.response;
  if (Array.isArray(r?.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) if (typeof c?.text === 'string') parts.push(c.text);
      }
    }
    if (parts.length) return parts.join('');
  }
  const choice = r?.choices?.[0]?.message;
  if (typeof choice?.content === 'string') return choice.content;
  return '';
}

export function extractToolCalls(r: any): GatewayToolCall[] {
  const out: GatewayToolCall[] = [];
  const push = (name: unknown, args: unknown, id?: unknown) => {
    if (typeof name !== 'string' || !name) return;
    const argStr = typeof args === 'string' ? args : JSON.stringify(args ?? {});
    out.push({ id: typeof id === 'string' ? id : `tc_${out.length}_${Date.now()}`, name, arguments: argStr });
  };
  const lists = [r?.tool_calls, r?.result?.tool_calls, r?.choices?.[0]?.message?.tool_calls];
  for (const list of lists) {
    if (Array.isArray(list)) {
      for (const tc of list) {
        if (tc?.function) push(tc.function.name, tc.function.arguments, tc.id);
        else push(tc?.name, tc?.arguments ?? tc?.parameters, tc?.id);
      }
      if (out.length) return out;
    }
  }
  if (Array.isArray(r?.output)) {
    for (const item of r.output) if (item?.type === 'function_call') push(item.name, item.arguments, item.call_id ?? item.id);
  }
  return out;
}

export function extractUsage(r: any, inputChars: number, text: string): NormalizedUsage {
  const u = r?.usage ?? r?.result?.usage;
  const inTok = u?.prompt_tokens ?? u?.input_tokens;
  const outTok = u?.completion_tokens ?? u?.output_tokens;
  const cached = u?.prompt_tokens_details?.cached_tokens ?? 0;
  const reported = typeof u?.neurons === 'number' ? u.neurons : undefined;
  if (typeof inTok === 'number' && typeof outTok === 'number') {
    return { inputTokens: inTok, outputTokens: outTok, cachedInputTokens: cached, reportedNeurons: reported };
  }
  // no usage reported: estimate conservatively so unmetered calls still cost the budget something
  return {
    inputTokens: Math.ceil(inputChars / 3.5),
    outputTokens: Math.ceil(text.length / 3.5),
    cachedInputTokens: 0,
    reportedNeurons: reported,
  };
}

/**
 * The retry gate, kept as its own named regex because it is a SPENDING decision, not a cosmetic
 * one: it is the exact set of failures where the request never reached the model, nothing was
 * billed, and running it again is free. Anything outside this set is charged and never retried.
 */
export const WORKERS_AI_RETRYABLE = /\b3021\b|rate limit|too many requests|capacity temporarily/i;

/**
 * DOES THIS MODEL ACTUALLY TAKE A REASONING EFFORT?
 *
 * The gate itself is not new — `encode` has always dropped `reasoning_effort` for anything that is
 * not a GLM route, because sending an undocumented field to Qwen is the wrong fix. What is new is
 * that the answer is ASKABLE from outside, and that matters because the product was telling users
 * about a setting this function had silently discarded: on the free lane the reasoning tier was
 * computed, rendered in the thinking card, written into the run's replayable history, and then
 * dropped here before the request left the building. A label with nothing behind it.
 *
 * Exported so there is ONE rule rather than a second copy of this regex living next to the UI.
 */
export function acceptsReasoningEffort(modelId: string): boolean {
  return /^@cf\/zai-org\/glm-/.test(modelId);
}

// ---------------------------------------------------------------------------
// adapter
// ---------------------------------------------------------------------------

export const workersAiAdapter: ProviderAdapter = {
  id: 'workers-ai',
  models: WORKERS_AI_MODELS,

  availability(env: Env): ProviderAvailability {
    // There is no key to check. Workers AI is a binding: if wrangler bound it, it is usable.
    const bound = typeof (env as { AI?: { run?: unknown } }).AI?.run === 'function';
    return {
      provider: 'workers-ai',
      available: bound,
      reason: bound ? null : 'binding_missing',
      detail: bound
        ? 'Cloudflare Workers AI binding is present — Apple and Apple MAX use Workers AI product routes.'
        : 'The `AI` Workers AI binding is not present on this environment.',
      unsupportedModelKeys: [],
    };
  },

  encode(req: NormalizedRequest): EncodedRequest {
    // Assistant tool calls go back to the model as STRUCTURED tool_calls, never as text fences.
    // Serialising them as ```tool_call blocks teaches a model to imitate the pattern in prose,
    // which then never executes — observed with GLM-5.3-flash before this was fixed.
    const messages = req.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      ...(m.name ? { name: m.name } : {}),
      ...(m.toolCalls?.length
        ? {
            tool_calls: m.toolCalls.map((c) => ({
              id: c.id,
              type: 'function',
              function: { name: c.name, arguments: c.arguments },
            })),
          }
        : {}),
    }));

    const payload: Record<string, unknown> = {
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
    // Cloudflare documents reasoning_effort for GLM-4.7/5.3. Qwen3 is reasoning-capable but its
    // binding schema does not document an effort knob, so do not send it an invented field.
    if (req.reasoningEffort && acceptsReasoningEffort(req.modelId)) {
      payload.reasoning_effort = req.reasoningEffort;
    }
    if (req.jsonSchema) payload.response_format = { type: 'json_schema', json_schema: req.jsonSchema };

    const promptChars =
      messages.reduce((n, m) => n + contentChars(m.content), 0) + JSON.stringify(payload.tools ?? '').length;
    return { payload, promptChars };
  },

  async invoke(env: Env, payload: unknown, ctx: InvokeContext): Promise<unknown> {
    return env.AI.run(
      ctx.modelId as Parameters<Ai['run']>[0],
      payload as never,
      gatewayOpts(env, ctx.kind, ctx.cacheTtl, ctx.sessionId) as never,
    );
  },

  decode(raw: unknown, promptChars: number, modelId: string): NormalizedResponse {
    const text = extractText(raw);
    const toolCalls = extractToolCalls(raw);
    const finish = (raw as { choices?: { finish_reason?: string }[] })?.choices?.[0]?.finish_reason;
    return {
      text,
      toolCalls,
      usage: extractUsage(raw, promptChars, text),
      finishReason: toolCalls.length ? 'tool_calls' : finish === 'length' ? 'length' : 'stop',
      provider: 'workers-ai',
      model: modelId,
    };
  },

  classifyError(e: unknown): ErrorClassification {
    const msg = errorMessage(e);
    // `retryable` is computed FIRST and independently, with the original regex, so the retry
    // behaviour is bit-for-bit what it was before the refactor.
    const retryable = WORKERS_AI_RETRYABLE.test(msg);
    if (retryable) return { kind: 'rate_limit', retryable: true };
    // 4006 / "daily free allocation" is Cloudflare saying the account's neuron allowance is spent.
    // It is a limit, but retrying inside the same window buys nothing, so it is not retryable.
    if (/\b4006\b|daily free allocation/i.test(msg)) return { kind: 'rate_limit', retryable: false };
    if (/\b401\b|\b403\b|unauthor|forbidden|invalid (api )?(key|token)/i.test(msg)) {
      return { kind: 'auth', retryable: false };
    }
    if (/context (length|window)|maximum context|prompt is too long|too many tokens/i.test(msg)) {
      return { kind: 'context_length', retryable: false };
    }
    if (/content filter|safety|flagged|blocked by/i.test(msg)) return { kind: 'content_filter', retryable: false };
    if (/\b5\d\d\b|timed? ?out|network|temporarily unavailable/i.test(msg)) {
      return { kind: 'transient', retryable: false };
    }
    return { kind: 'unknown', retryable: false };
  },
};
