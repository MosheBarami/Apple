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
import { isCompleteToolCall } from './tool-call-integrity';
import { estimateNeurons, neuronsFor, MAX_NEURONS_PER_REQUEST } from './pricing';
import { recordEvent } from './analytics';
import {
  acceptsReasoningEffort,
  adapterForModelId,
  contentText,
  estimateNeuronsForModel,
  gatewayOpts,
  modelById,
  neuronsForModelTokens,
  ProviderError,
  recordProviderCall,
  workersAiAdapter,
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
  // The adaptive reasoning policy still chooses effort per step. Only GLM routes receive an
  // explicit reasoning_effort because Cloudflare documents that control for GLM-4.7/5.3;
  // Qwen3 uses its documented default reasoning behaviour.
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
  // -------------------------------------------------------------------------
  // PRODUCT RUN ROUTING. Plan and Agent share the measured GLM-5.3 Flash foundation. Product-model
  // entitlement still controls paid capabilities and reasoning policy; the run mode controls tools.
  // Both keys exist because callers name the product mode directly.
  //[[ APPLE MAX RUNS ON GLM-5.3 FLASH. Owner decision, 2026-09-19, and the evidence agrees with it.
  //
  //   The lane was on glm-4.7-flash, and a fresh-context reviewer found the problem with that:
  //   `docs/evals/RESULTS.md` has NO glm-4.7 row at all. The only MAX model ever measured on this
  //   product's eval suite is glm-5.3-flash, and it had been demoted to
  //   the vision lane — so the mode a customer pays for was the unevaluated one.
  //
  //   Read honestly, that is an argument for 5.3 and NOT a claim that 5.3 is 2.1 points better:
  //   docs/research/hf-specialists.md says the suite is saturated and the spread is inside
  //   run-to-run variance, and docs/evals/FINDINGS.md says the suite no longer exists in that form.
  //   What can be said is that one of these two has been measured on this product and the other has
  //   not, and the paid lane should not be the unmeasured one.
  //
  //   It also buys two capabilities: 5.3 Flash is natively multimodal, so the MAX lane and the
  //   visual critic are now the same model rather than two, and the context window goes from 131k
  //   to 1.3M. Prompt trimming is governed by MAX_PROMPT_CHARS in do/session.ts, not by `ctx`, so
  //   the bigger window changes what is POSSIBLE here, not what is sent today.
  //
  //   COST: 5.3 Flash is dearer per token than 4.7 Flash and Cloudflare requires a paid plan or
  //   prepaid AI Gateway credits for it. The daily and monthly neuron caps remain the spend gate;
  //   this raises the price of a MAX step, not the ceiling on the bill. ]]
  plan: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 6500, ctx: 1_310_720, temperature: 0.25, reasoningEffort: 'low' },
  agent: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 6500, ctx: 1_310_720, temperature: 0.25, reasoningEffort: 'low' },

  memory: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: false, maxTokens: 800, ctx: 32_768, temperature: 0.2 },

  // The visual critic sends real image_url data URLs and must remain on a multimodal model.
  vision: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: false, maxTokens: 4000, ctx: 1_310_720, temperature: 0.3, reasoningEffort: 'low' },
};

let modelCache: { at: number; models: Record<string, ModelCfg> } | null = null;

/**
 * The production KV override was written by the temporary free-tier migration and still exists
 * on the live account. Leaving it authoritative would make changing DEFAULT_MODELS a no-op: the
 * worker would deploy the new product split and then immediately replace it with a stale prior
 * production map from `config:models`. Only these known old ids are ignored, so an operator can still
 * opt a custom model key into a deliberate experiment without silently changing user routing.
 */
const LEGACY_USER_MODEL_IDS = new Set([
  '@cf/openai/gpt-oss-20b',
  '@cf/openai/gpt-oss-120b',
  '@cf/meta/llama-3.2-11b-vision-instruct',
  // '@cf/zai-org/glm-5.3-flash' WAS HERE AND IS NOT ANY MORE. This set exists to stop a stale KV
  // override dragging users back onto a model the product has moved off. 5.3 Flash is the model the
  // product has moved ON to, so leaving it here would silently discard a deliberate KV experiment
  // naming the current production model — a filter that ignores the thing it is meant to protect.
]);

function isModelCfg(value: unknown): value is ModelCfg {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const cfg = value as Partial<ModelCfg>;
  return (
    typeof cfg.id === 'string' && cfg.id.length > 0 &&
    typeof cfg.nativeTools === 'boolean' &&
    typeof cfg.maxTokens === 'number' && Number.isFinite(cfg.maxTokens) && cfg.maxTokens > 0 &&
    typeof cfg.ctx === 'number' && Number.isFinite(cfg.ctx) && cfg.ctx > 0 &&
    typeof cfg.temperature === 'number' && Number.isFinite(cfg.temperature) &&
    (cfg.reasoningEffort === undefined || cfg.reasoningEffort === 'low' || cfg.reasoningEffort === 'medium' || cfg.reasoningEffort === 'high')
  );
}

function configuredModels(value: unknown): Record<string, ModelCfg> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, ModelCfg> = {};
  for (const [key, cfg] of Object.entries(value as Record<string, unknown>)) {
    if (!isModelCfg(cfg)) continue;
    // This is a migration guard, not a general provider policy. Custom keys remain available for
    // admin experiments; only the five user-facing keys are protected from the stale production
    // map, which is the path that would otherwise reintroduce GPT-OSS after this deploy.
    if (Object.prototype.hasOwnProperty.call(DEFAULT_MODELS, key) && LEGACY_USER_MODEL_IDS.has(cfg.id)) continue;
    out[key] = cfg;
  }
  return out;
}

export async function getModels(env: Env): Promise<Record<string, ModelCfg>> {
  if (modelCache && Date.now() - modelCache.at < 60_000) return modelCache.models;
  let models = { ...DEFAULT_MODELS };
  try {
    const raw = await env.KV.get('config:models');
    if (raw) models = { ...models, ...configuredModels(JSON.parse(raw)) };
  } catch {
    /* keep defaults */
  }
  modelCache = { at: Date.now(), models };
  return models;
}

/**
 * WILL A REASONING EFFORT SENT TO THIS MODEL KEY ACTUALLY REACH THE MODEL?
 *
 * The adaptive policy decides an effort for every step and SessionDO renders it to the user. On the
 * The adaptive policy decides an effort before the call and this helper verifies that the selected
 * provider route can actually receive that control.
 *
 * This answers the question the UI needs BEFORE the call, from the same rule the adapter applies
 * inside it, so the two cannot drift. It resolves the model key through `getModels` — a KV override
 * can repoint a product mode, and the answer has to follow the config that is live rather
 * than the one in DEFAULT_MODELS.
 *
 * A model served by any adapter other than Workers AI answers FALSE. That is deliberate and it is
 * the honest direction: no other adapter has been measured to honour the field, and "we do not know
 * that it was applied" must render as nothing rather than as a claim. When a second provider is
 * credentialed, the thing to do is give it its own predicate — not to make this one optimistic.
 */
export async function reasoningEffortApplies(env: Env, modelKey: string): Promise<boolean> {
  const cfg = (await getModels(env))[modelKey];
  if (!cfg) return false;
  return adapterForModelId(cfg.id) === workersAiAdapter && acceptsReasoningEffort(cfg.id);
}

/** Test seam: model configuration is cached for a minute in production. */
export function resetModelCache(): void {
  modelCache = null;
}

// ---------------------------------------------------------------------------
// Budget plumbing
// ---------------------------------------------------------------------------

function budgetStub(env: Env) {
  return env.BUDGET_DO.get(env.BUDGET_DO.idFromName('singleton'));
}

const BUDGET_MESSAGES: Record<string, string> = {
  daily_cap: "Apple has reached today's shared building capacity. It resets at midnight UTC.",
  monthly_cap: "Apple has reached this month's shared building capacity.",
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
  /**
   * Who this call is for, for the analytics event log ONLY. Both are optional and both default to
   * an unattributed event rather than to a plausible-looking placeholder: a model trace filed
   * against the wrong tenant is worse than one filed against nobody, and `featureUsage` and
   * `retentionRollup` both report their unattributed count rather than quietly shrinking.
   */
  actorId?: string;
  projectId?: string;
  runId?: string;
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
  // THIS CHECK CANNOT BE FALSIFIED BEHAVIOURALLY, and that is not a reason to remove it.
  // BudgetDO applies the same cap and reserve() throws the identical BudgetError('request_too_large')
  // one hop later, so deleting these lines turns no test red -- measured by rbxai-04, not assumed. It
  // is kept because it fails the call HERE, before a network round trip and two storage writes, and
  // because a cap enforced in exactly one place has a single point of failure. If you are simplifying
  // this, the thing to verify is that budget.ts's own per-request check still refuses: that is what
  // covers this one's absence, and it is the only thing that does.
  if (estimate > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }
  const reserved = await reserve(env, cfg.id, estimate);

  const kind = opts.kind ?? req.model;
  const invokeCtx = { modelId: cfg.id, kind, cacheTtl: opts.cacheTtl ?? 0, ...(opts.sessionId ? { sessionId: opts.sessionId } : {}) };
  let raw: unknown;
  let lastLatencyMs: number | null = null;
  /** One model trace. Every field it cannot establish stays null rather than becoming zero. */
  const trace = (fields: Record<string, unknown>) =>
    recordEvent({
      kind: 'model_call',
      provider: adapter.id,
      model: cfg.id,
      feature: kind,
      actorId: opts.actorId ?? null,
      projectId: opts.projectId ?? null,
      runId: opts.runId ?? null,
      ...fields,
    });
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
    //[[ THE LADDER LANDED INSIDE THE RECOVERY DISTRIBUTION INSTEAD OF PAST IT.
    //
    //   It was 3 waits of 1200/2400/3600 ms — four attempts spanning 7.2 s of waiting, 7.6-7.7 s
    //   wall clock. Measured against this worker's own model_call log on 2026-09-20, every run
    //   that died that day died on exactly that ladder, and in the SAME window the SAME refusal
    //   class cleared at 1.9 s, 5.0 s, 6.2 s, 6.3 s, 12.1 s and 60.6 s. So the ladder sat in the
    //   middle of the distribution of recovery times, and whether a customer's run survived was
    //   decided by which side of 7.6 s the provider happened to fall on.
    //
    //   Run 7cf4690c is the whole thing inside one run: it recovered from this refusal twice, then
    //   on the third occurrence exhausted four attempts in 7.6 s and the run was terminated —
    //   throwing away two already-settled steps the customer had paid for.
    //
    //   Waiting longer is free in the only currency that matters here. The request never reached
    //   the model, the refusal returns in 134-526 ms, nothing is billed, and the reservation is
    //   held. The alternative to waiting is discarding billed work. So the ladder now spans PAST
    //   the observed distribution rather than into it: 1/2/4/8/16/32 s, 63 s of waiting over seven
    //   attempts, which covers every recovery time that was actually measured including 60.6 s.
    //
    //   What this does NOT fix is the thing one layer up: when the ladder is finally exhausted,
    //   the run is ended and its already-billed steps are discarded. That is session.ts, which is
    //   being edited by another lane right now and is not mine to touch tonight. It stays open. ]]
    const RATE_LIMIT_WAITS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 32_000];
    const MAX_RATE_LIMIT_WAITS = RATE_LIMIT_WAITS_MS.length;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_WAITS; attempt++) {
      const started = Date.now();
      try {
        raw = await adapter.invoke(env, encoded.payload, invokeCtx);
        lastErr = null;
        lastLatencyMs = Date.now() - started;
        recordProviderCall(adapter.id, { model: cfg.id, latencyMs: lastLatencyMs, ok: true });
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
        // A failed ATTEMPT is its own trace. The retry loop swallows rate-limit rejections and the
        // call still succeeds, so a log that only recorded the final outcome would show a clean run
        // through a window the product spent waiting — the error breakdown exists to see that.
        trace({
          outcome: 'failed',
          latencyMs: Date.now() - started,
          errorKind: cls.kind,
        });
        if (!cls.retryable || attempt === MAX_RATE_LIMIT_WAITS) break;
        // no tokens were spent; hold the reservation and wait for the window to roll
        await new Promise((r) => setTimeout(r, RATE_LIMIT_WAITS_MS[attempt]!));
      }
    }
    if (lastErr) {
      await release(env, reserved);
      const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
      const classified = adapter.classifyError(lastErr);
      //[[ `neurons` ON ITS OWN MATCHED ANY MESSAGE CONTAINING THE WORD.
      //   Workers AI writes "neurons" in messages that are not the daily cap, and this branch tells
      //   the customer their allowance is spent and that waiting will not help. A transient
      //   reported as an exhausted quota is the worse of the two errors: it tells somebody to stop
      //   trying when trying again would have worked. 4006 is the code that means it. ]]
      if (/\b4006\b|daily free allocation/i.test(msg)) {
        throw new BudgetError('daily_cap', BUDGET_MESSAGES.daily_cap!);
      }
      // `capacity temporarily` is classified RETRYABLE by WORKERS_AI_RETRYABLE and was missing
      // here, so that one class exhausted the ladder and then fell through to the raw
      // `inference failed (model): ...` below — a transient, shown to a customer as a crash.
      if (/\b3021\b|rate limit|too many requests|capacity temporarily/i.test(msg)) {
        throw new RateLimitedError(
          'Apple is handling a burst of requests right now. Nothing was charged — try that again in a moment.',
        );
      }
      // Preserve the provider's structured failure kind across the gateway boundary. SessionDO
      // can safely keep a run asleep through a transport outage without pattern-matching provider
      // prose, while auth/context/content-filter/unknown failures remain terminal because repeating
      // them has no evidence of becoming valid.
      if (lastErr instanceof ProviderError) throw lastErr;
      throw new ProviderError(
        classified.kind,
        adapter.id,
        `inference failed (${cfg.id}): ${msg}`,
        undefined,
        classified.retryable,
      );
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
  // A response cut at the output ceiling can end INSIDE a tool call. Such a call is not a request the
  // model made; it is the first half of one. Drop it here, for every adapter, so it is never executed
  // and never echoed back to the provider (tool-call-integrity.ts has the production failure). If
  // nothing complete survives, the response is reported as `length` below, which is the finish the
  // run loop already recovers from by asking for the same work in smaller calls.
  if (decoded.truncated) toolCalls = toolCalls.filter(isCompleteToolCall);
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
  trace({
    outcome: 'ok',
    latencyMs: lastLatencyMs,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cachedInputTokens: usage.cachedInputTokens ?? null,
    neurons: actual,
  });

  return {
    text,
    toolCalls,
    usage: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens },
    neurons: actual,
    provider: adapter.id,
    model: cfg.id,
    // The adapter is the provider-format boundary and already normalises `length`, `stop`, and
    // provider errors. Replacing those values with `stop` made an output-budget truncation look like
    // a complete answer to every caller, including the eval harness. A surviving native/prompted
    // tool call takes precedence. A provider `tool_calls` marker with no retained structured call is
    // not compatible with GatewayResponse and keeps the established `stop` fallback.
    finishReason: toolCalls.length
      ? 'tool_calls'
      : decoded.truncated
        ? 'length'
        : decoded.finishReason === 'tool_calls'
          ? 'stop'
          : decoded.finishReason,
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

// ---------------------------------------------------------------------------
// operator raw probe
// ---------------------------------------------------------------------------

export interface RawProbeRequest {
  /** A PROVIDER model id (`@cf/zai-org/glm-5.3-flash`), not a DEFAULT_MODELS key. */
  model: string;
  prompt: string;
  /** optional system message, so the real production prompt can be reproduced exactly */
  system?: string;
  /** optional tool definitions, so tool-calling behaviour can be probed, not just prose */
  tools?: { name: string; description: string; parameters: unknown }[];
  maxTokens?: number;
  reasoning?: string;
  /**
   * Workers AI prefix-caching affinity key. Sending the same value on consecutive probes is what
   * lets the shared prefix be reused; omitting it is the old behaviour, under which cached_tokens
   * was always 0. Present so the two can be compared in one experiment rather than argued about.
   */
  sessionId?: string;
}

export interface RawProbeResult {
  /** exactly what the provider returned, unnormalised — the entire point of a probe */
  raw: unknown;
  /** what the global neuron ledger was charged for it */
  neurons: number;
}

/**
 * One un-normalised model call, for an operator adapting the normalizer to a new model's shape.
 *
 * WHY IT LIVES HERE. It cannot go through `chat()` — `chat()`'s whole job is to normalise away the
 * raw shape this exists to reveal (including `usage.prompt_tokens_details.cached_tokens`). But
 * before this function existed, `/api/admin/raw-probe` did the obvious thing and called
 * `env.AI.run` itself, which made it the ONE path in the product that could spend model tokens
 * with no reservation: the kill switch and the daily/monthly neuron caps never saw it, so an
 * operator tool could quietly drain the day's allocation while every guard read "fine". The file
 * header's claim that "there is no way to spend money by forgetting a check" is only true if a
 * call like this one is metered here rather than at the route. So it is: reserve -> run -> settle,
 * release on failure, exactly like `embed()`.
 *
 * ONLY THE GLOBAL LEDGER IS CHARGED. No user Credits are spent and QuotaDO is never touched —
 * Credits are the per-user quota, and no user should be billed for an operator's diagnostic.
 */
export async function rawProbe(env: Env, req: RawProbeRequest, kind = 'admin:raw-probe'): Promise<RawProbeResult> {
  const maxTokens = req.maxTokens ?? 200;
  const messages = [
    ...(req.system ? [{ role: 'system', content: req.system }] : []),
    { role: 'user', content: req.prompt },
  ];
  const payload: Record<string, unknown> = { messages, max_tokens: maxTokens };
  if (req.tools?.length) {
    payload.tools = req.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  if (req.reasoning) payload.reasoning = { effort: req.reasoning };

  // Same pessimistic pre-flight as chat(): count the characters actually going on the wire and
  // assume every allowed output token is spent.
  const promptChars = messages.reduce((n, m) => n + m.content.length, 0) + JSON.stringify(payload.tools ?? '').length;
  const priced = modelById(req.model);
  const estimate = priced
    ? estimateNeuronsForModel(priced, promptChars, maxTokens)
    : estimateNeurons(req.model, promptChars, maxTokens);
  // Same cap, same redundancy, same reason to keep it as the check earlier in this file -- see the
  // note there before simplifying either.
  if (estimate > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }

  // ---- spend gate: nothing below this line runs without a reservation ----
  // reserve() throws BudgetError when the kill switch is on or a cap is exhausted, so those
  // refusals happen BEFORE any token is spent, which is the whole point.
  const reserved = await reserve(env, req.model, estimate);
  let raw: unknown;
  try {
    // No retries, for the same reason chat() has none: a failed inference was still billed.
    raw = await env.AI.run(req.model as never, payload as never, gatewayOpts(env, kind, 0, req.sessionId) as never);
  } catch (e) {
    // Nothing ran, so hand the reservation back.
    await release(env, reserved);
    throw e;
  }
  // Past this line the model HAS run and the tokens ARE spent, so the reservation must be settled
  // and must never be released — an accounting failure here has to fail towards over-billing the
  // ledger, never towards a spend the caps cannot see.
  const usage = workersAiAdapter.decode(raw, promptChars, req.model).usage;
  const computed = priced
    ? neuronsForModelTokens(priced, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens)
    : neuronsFor(req.model, usage.inputTokens, usage.outputTokens, usage.cachedInputTokens);
  const actual = Math.ceil(Math.max(usage.reportedNeurons ?? 0, computed));
  await settle(env, reserved, actual, req.model, kind);
  return { raw, neurons: actual };
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
