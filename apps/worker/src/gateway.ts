// Model gateway: the single entry point for ALL inference in the product.
//
// Spend safety is enforced here, not at call sites, so there is no way to spend money by
// forgetting a check:
//   1. the kill switch and the global neuron budget are consulted BEFORE any tokens are spent
//   2. calls run through Cloudflare AI Gateway (caching + independent rate limiting + logs)
//   3. actual usage is settled back to the budget ledger afterwards
//   4. there are NO automatic retries — a retry is a second bill for the same request
//
// PROVIDER NEUTRALITY. As of 2026-08-31 the transport lives behind an adapter (see ./providers):
// this file owns spend policy, the prompted-tool fallback and response post-processing, and an
// adapter owns one provider's wire format. The production path is unchanged — every model key
// still resolves to a Workers AI model id, so adapterForModelId() returns the Workers AI adapter
// and the call is still `env.AI.run(id, payload, gatewayOpts(...))` with the same payload and the
// same options. Nothing else is credentialed, and the layer reports that honestly.
import type { Env } from './env';
import type { GatewayMessage, GatewayRequest, GatewayResponse, GatewayToolCall, GatewayToolDef } from '@golem/shared';
import { estimateNeurons, neuronsFor, MAX_NEURONS_PER_REQUEST } from './pricing';
import {
  adapterForModelId,
  contentText,
  estimateNeuronsForModel,
  gatewayOpts,
  modelById,
  neuronsForModelTokens,
  recordProviderCall,
} from './providers';

export { providerHealth, capabilityTable, providerAvailability, selectProvider } from './providers';

export interface ModelCfg {
  id: string;
  nativeTools: boolean;
  maxTokens: number;
  ctx: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

/** The provider refused before running the model, so nothing was billed. Safe to try again. */
export class RateLimitedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitedError';
  }
}

/** Thrown when spend policy — not the provider — refuses a call. Callers surface these kindly. */
export class BudgetError extends Error {
  constructor(
    readonly reason: 'killed' | 'daily_cap' | 'monthly_cap' | 'request_too_large',
    message: string,
  ) {
    super(message);
    this.name = 'BudgetError';
  }
}

export const DEFAULT_MODELS: Record<string, ModelCfg> = {
  // ---------------------------------------------------------------------------
  // GLM-5.3 Flash is the production model for every user-facing path: reasoning,
  // Luau authoring, Studio agent work, debugging, tool use and vision.
  //
  // reasoning effort is 'low' on purpose and it is the single most important setting here.
  // MEASURED on the same debugging prompt (2026-08-30):
  //   default  -> 249 output tokens, 11.69 neurons, answer produced
  //   'low'    ->  24 output tokens,  1.46 neurons, answer produced   <-- 8x cheaper
  //   'medium' -> 600 output tokens, 28.13 neurons, budget consumed by reasoning, NO answer
  // Higher effort makes the model think past its own token budget and return nothing, so 'low'
  // is both the cheap option and the correct one.
  // ---------------------------------------------------------------------------
  // maxTokens here is the absolute per-call CEILING. The adaptive reasoning policy sets the
  // actual budget per step (see reasoning.ts); these are 1.25x the base budgets so a high-effort
  // step is not silently clamped back down. The bill is bounded by the daily/monthly neuron caps,
  // not by this number, so raising it does not move the maximum monthly cost.
  // Budgets are sized for what a BUILD actually costs to express, not for prose. Measured: asked
  // for a market stall under the art-direction brief, the model emits a 5,326-character run_luau
  // build script — and at 2,400 output tokens that was guillotined mid-JSON (finish_reason
  // "length"), so the tool call was unparseable and the agent silently built nothing. Raising the
  // ceiling is what makes the quality bar expressible. The bill is bounded by the daily/monthly
  // neuron caps, not by this number, and settlement is on ACTUAL usage, so a short step still
  // costs a short step.
  clay: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 2000, ctx: 1048576, temperature: 0.3, reasoningEffort: 'low' },
  stone: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 5600, ctx: 1048576, temperature: 0.25, reasoningEffort: 'low' },
  rune: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 6500, ctx: 1048576, temperature: 0.25, reasoningEffort: 'low' },
  // Housekeeping and vision run on the same model: it is multimodal, so a separate vision
  // model is no longer needed, and one model means one behaviour to reason about.
  memory: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: false, maxTokens: 800, ctx: 1048576, temperature: 0.2, reasoningEffort: 'low' },
  // Vision runs the critique loops, which return structured JSON and need room for it. The eval
  // harness asks for 20 scored dimensions each with a justification, which is the largest response
  // in the product; at 2,000 tokens it arrived truncated. 4,000 output tokens is ~182 neurons,
  // still far inside the 1,200-neuron per-request ceiling.
  vision: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: false, maxTokens: 4000, ctx: 1048576, temperature: 0.3, reasoningEffort: 'low' },
};

let modelCache: { at: number; models: Record<string, ModelCfg> } | null = null;

export async function getModels(env: Env): Promise<Record<string, ModelCfg>> {
  if (modelCache && Date.now() - modelCache.at < 60_000) return modelCache.models;
  let models = { ...DEFAULT_MODELS };
  try {
    const raw = await env.KV.get('config:models');
    if (raw) models = { ...models, ...(JSON.parse(raw) as Record<string, ModelCfg>) };
  } catch {
    /* keep defaults */
  }
  modelCache = { at: Date.now(), models };
  return models;
}

// ---------------------------------------------------------------------------
// Budget plumbing
// ---------------------------------------------------------------------------

function budgetStub(env: Env) {
  return env.BUDGET_DO.get(env.BUDGET_DO.idFromName('singleton'));
}

const BUDGET_MESSAGES: Record<string, string> = {
  daily_cap: "Golem has reached today's shared building capacity. It resets at midnight UTC.",
  monthly_cap: "Golem has reached this month's shared building capacity.",
  request_too_large: 'That request needs more context than a single step allows — try narrowing it.',
  killed: 'AI generation is paused right now.',
};

async function reserve(env: Env, model: string, neurons: number): Promise<number> {
  const res = await budgetStub(env).fetch('https://do/reserve', {
    method: 'POST',
    body: JSON.stringify({ neurons, model }),
  });
  const data = (await res.json()) as { ok: boolean; reserved?: number; reason?: string; message?: string };
  if (!data.ok) {
    const reason = (data.reason ?? 'daily_cap') as BudgetError['reason'];
    throw new BudgetError(reason, data.message ?? BUDGET_MESSAGES[reason] ?? BUDGET_MESSAGES.daily_cap!);
  }
  return data.reserved ?? neurons;
}

async function settle(env: Env, reserved: number, actual: number, model: string, kind: string): Promise<void> {
  await budgetStub(env)
    .fetch('https://do/settle', { method: 'POST', body: JSON.stringify({ reserved, actual, model, kind }) })
    .catch(() => {});
}

async function release(env: Env, reserved: number): Promise<void> {
  await budgetStub(env)
    .fetch('https://do/release', { method: 'POST', body: JSON.stringify({ reserved }) })
    .catch(() => {});
}

// ---------------------------------------------------------------------------
// prompted tool-calling fallback (only for models without native tool support)
// ---------------------------------------------------------------------------
function promptedToolPreamble(tools: GatewayToolDef[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}`).join('\n');
  return `\n\nAvailable tools:\n${list}\n\nTo call one, reply with ONLY a fenced block tagged tool_call containing {"name": "<tool>", "arguments": { ... }}. One call per reply. When finished, reply with plain text and no block.`;
}

function parsePromptedToolCalls(text: string): { calls: GatewayToolCall[]; cleaned: string } {
  const calls: GatewayToolCall[] = [];
  const re = /```(?:tool_call|json)?\s*\n?(\{[\s\S]*?\})\s*```/g;
  let cleaned = text;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    try {
      const obj = JSON.parse(m[1]!);
      if (obj && typeof obj.name === 'string') {
        calls.push({ id: `pc_${calls.length}_${Date.now()}`, name: obj.name, arguments: JSON.stringify(obj.arguments ?? {}) });
        cleaned = cleaned.replace(m[0]!, '');
      }
    } catch {
      /* not a tool call */
    }
  }
  return { calls, cleaned: cleaned.trim() };
}

// Response normalization now lives with the provider that produces the shape — see
// providers/workers-ai.ts (extractText / extractToolCalls / extractUsage, moved verbatim).

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------
export interface ChatOptions {
  /** what this call is for, used for spend attribution in the admin report */
  kind?: string;
  /** seconds; 0 disables caching for this call */
  cacheTtl?: number;
  /**
   * Opaque per-session identifier used for Workers AI prefix caching (x-session-affinity). Pass the
   * SAME value for every step of one agent run so the shared system-prompt-and-tools prefix is
   * reused; never share it between tenants. Omit it and every step re-prefills from cold.
   */
  sessionId?: string;
}

export async function chat(env: Env, req: GatewayRequest, opts: ChatOptions = {}): Promise<GatewayResponse> {
  const models = await getModels(env);
  const cfg = models[req.model];
  if (!cfg) throw new Error(`unknown model key: ${req.model}`);

  // Which provider owns this model id. Every DEFAULT_MODELS entry is a Workers AI id, so in
  // production this is always the Workers AI adapter and the call below is the same env.AI.run it
  // has always been. An unrecognised id also resolves to Workers AI — the AI binding is the only
  // transport this worker has.
  const adapter = adapterForModelId(cfg.id);
  const priced = modelById(cfg.id);

  const usePrompted = !!req.tools?.length && !cfg.nativeTools;
  // The prompted-tool fallback is GATEWAY policy, not provider format: it rewrites the
  // conversation into plain text before any adapter sees it, so an adapter never has to know the
  // fallback exists. Assistant tool calls otherwise go back to the model as STRUCTURED tool_calls,
  // never as text fences — serialising them as ```tool_call blocks teaches a model to imitate the
  // pattern in prose, which then never executes (observed with GLM-5.3-flash before this was fixed).
  let messages: GatewayMessage[] = req.messages;
  if (usePrompted) {
    // Prompted-tool mode is text-only by construction; images only ever ride on tool-less
    // vision calls, so flattening to a string here cannot lose an attachment.
    const asText = contentText;
    const first = messages[0];
    if (first?.role === 'system') {
      messages = [{ ...first, content: asText(first.content) + promptedToolPreamble(req.tools!) }, ...messages.slice(1)];
    }
    messages = messages.map((m): GatewayMessage => {
      if (m.role === 'tool') return { ...m, role: 'user' as const, content: `Tool result:\n${asText(m.content)}` };
      if (m.role === 'assistant' && m.toolCalls?.length) {
        const rendered = m.toolCalls
          .map((c) => '```tool_call\n' + JSON.stringify({ name: c.name, arguments: JSON.parse(c.arguments || '{}') }) + '\n```')
          .join('\n');
        const prefix = asText(m.content);
        return { role: 'assistant' as const, content: (prefix ? prefix + '\n' : '') + rendered };
      }
      return m;
    });
  }

  const maxTokens = Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens);
  // Per-call effort wins over the model default: the adaptive policy decides how hard to think
  // based on what the step is, and pays for it out of the same budget.
  const effort = req.reasoningEffort ?? cfg.reasoningEffort;
  const encoded = adapter.encode({
    modelId: cfg.id,
    messages,
    // Tool definitions only reach the wire in NATIVE mode; in prompted mode they are already
    // baked into the system message above.
    tools: cfg.nativeTools ? req.tools : undefined,
    maxTokens,
    temperature: req.temperature ?? cfg.temperature,
    ...(effort ? { reasoningEffort: effort } : {}),
    ...(req.jsonSchema ? { jsonSchema: req.jsonSchema } : {}),
  });

  // ---- spend gate: nothing below this line runs without a reservation ----
  // Providers that bill in tokens are converted to neurons here, so the BudgetDO ceiling applies
  // to every provider in the same unit. For Workers AI this is the identical price-table path.
  const inputChars = encoded.promptChars;
  const estimate = priced
    ? estimateNeuronsForModel(priced, inputChars, maxTokens)
    : estimateNeurons(cfg.id, inputChars, maxTokens);
  if (estimate > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }
  const reserved = await reserve(env, cfg.id, estimate);

  const kind = opts.kind ?? req.model;
  const invokeCtx = { modelId: cfg.id, kind, cacheTtl: opts.cacheTtl ?? 0, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}) };
  let raw: unknown;
  {
    // Retry policy, stated precisely because it is a spending decision:
    //
    //   * A FAILED INFERENCE is never retried. The model ran, tokens were billed, and running
    //     it again bills the same work twice. The caller decides whether to spend again.
    //   * A RATE-LIMIT REJECTION (Workers AI error 3021) is different: the request never reached
    //     the model and NOTHING was billed. Retrying costs nothing and is the only way to ride
    //     out the per-model requests-per-minute ceiling, which GLM-5.3-flash hits easily during
    //     a multi-step agent run. We wait and retry a bounded number of times.
    //
    // The adapter decides which failures are free to retry (`retryable`), and for Workers AI that
    // is the exact regex this loop used before the provider layer existed.
    const MAX_RATE_LIMIT_WAITS = 3;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_WAITS; attempt++) {
      const started = Date.now();
      try {
        raw = await adapter.invoke(env, encoded.payload, invokeCtx);
        lastErr = null;
        recordProviderCall(adapter.id, { model: cfg.id, latencyMs: Date.now() - started, ok: true });
        break;
      } catch (e) {
        lastErr = e;
        const cls = adapter.classifyError(e);
        recordProviderCall(adapter.id, {
          model: cfg.id,
          latencyMs: Date.now() - started,
          ok: false,
          errorKind: cls.kind,
          errorMessage: e instanceof Error ? e.message : String(e),
        });
        if (!cls.retryable || attempt === MAX_RATE_LIMIT_WAITS) break;
        // no tokens were spent; hold the reservation and wait for the window to roll
        await new Promise((r) => setTimeout(r, 1200 * (attempt + 1)));
      }
    }
    if (lastErr) {
      await release(env, reserved);
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      if (/4006|daily free allocation|neurons/i.test(msg)) {
        throw new BudgetError('daily_cap', BUDGET_MESSAGES.daily_cap!);
      }
      if (/\b3021\b|rate limit|too many requests/i.test(msg)) {
        throw new RateLimitedError(
          'Golem is handling a burst of requests right now. Nothing was charged — try that again in a moment.',
        );
      }
      throw new Error(`inference failed (${cfg.id}): ${msg}`);
    }
  }

  const decoded = adapter.decode(raw, inputChars, cfg.id);
  let text = decoded.text;
  let toolCalls = cfg.nativeTools ? decoded.toolCalls : [];
  if (usePrompted) {
    const parsed = parsePromptedToolCalls(text);
    toolCalls = parsed.calls;
    text = parsed.cleaned;
  }
  // NOTE: no fence-parsing fallback in native mode — tool results contain untrusted content and
  // parsing quoted fences would turn that content into executed tool calls. But a fence the model
  // emits as prose must not reach the user either: strip it from the visible reply.
  if (cfg.nativeTools) {
    text = text.replace(/```tool_call[\s\S]*?(?:```|$)/g, '').trim();
  }

  const usage = decoded.usage;
  // Cloudflare returns the exact neuron cost on models that support it; use it when present and
  // fall back to the price table otherwise. Never bill less than the provider says we spent.
  // Token-billed providers have no neuron figure of their own, so the converted cost is the bill.
  const computed = priced
    ? neuronsForModelTokens(priced, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens)
    : neuronsFor(cfg.id, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
  const actual = Math.ceil(Math.max(usage.reportedNeurons ?? 0, computed));
  await settle(env, reserved, actual, cfg.id, kind);

  return {
    text,
    toolCalls,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    neurons: actual,
    provider: adapter.id,
    model: cfg.id,
    finishReason: toolCalls.length ? 'tool_calls' : 'stop',
  };
}

/** Embeddings are cheap but not free, so they are metered on the same ledger. */
export async function embed(env: Env, texts: string[], kind = 'embed'): Promise<number[][]> {
  const model = '@cf/baai/bge-small-en-v1.5';
  const chars = texts.reduce((n, t) => n + t.length, 0);
  const estimate = Math.max(1, estimateNeurons(model, chars, 0));
  const reserved = await reserve(env, model, estimate);
  try {
    // embeddings are deterministic, so a long cache is safe and repeat queries become free
    const r = (await env.AI.run(model, { text: texts } as never, gatewayOpts(env, kind, 86_400) as never)) as {
      data?: number[][];
    };
    if (!r?.data) throw new Error('embedding failed');
    await settle(env, reserved, neuronsFor(model, Math.ceil(chars / 3.5), 0), model, kind);
    return r.data;
  } catch (e) {
    await release(env, reserved);
    throw e;
  }
}

export async function budgetState(env: Env): Promise<unknown> {
  return (await budgetStub(env).fetch('https://do/state')).json();
}
export async function budgetReport(env: Env): Promise<unknown> {
  return (await budgetStub(env).fetch('https://do/report')).json();
}
export async function setKillSwitch(env: Env, killed: boolean, reason?: string): Promise<unknown> {
  return (await budgetStub(env).fetch('https://do/kill', { method: 'POST', body: JSON.stringify({ killed, reason }) })).json();
}
