// Model gateway: the single entry point for ALL inference in the product.
//
// Spend safety is enforced here, not at call sites, so there is no way to spend money by
// forgetting a check:
//   1. the kill switch and the global neuron budget are consulted BEFORE any tokens are spent
//   2. calls run through Cloudflare AI Gateway (caching + independent rate limiting + logs)
//   3. actual usage is settled back to the budget ledger afterwards
//   4. there are NO automatic retries — a retry is a second bill for the same request
import type { Env } from './env';
import type { GatewayRequest, GatewayResponse, GatewayToolCall, GatewayToolDef } from '@golem/shared';
import { estimateNeurons, neuronsFor, MAX_NEURONS_PER_REQUEST } from './pricing';

export interface ModelCfg {
  id: string;
  nativeTools: boolean;
  maxTokens: number;
  ctx: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
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
  // Clay: cheap conversational model. ~5x cheaper per token than the builder model.
  clay: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: true, maxTokens: 1200, ctx: 32768, temperature: 0.3 },
  // Stone/Rune: the measured-best builder (97.6 on the Roblox eval suite).
  stone: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 2000, ctx: 128000, temperature: 0.25, reasoningEffort: 'low' },
  rune: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 2400, ctx: 128000, temperature: 0.25, reasoningEffort: 'low' },
  // Cheap worker used for routine agent steps that do not need the flagship (see router).
  cheap: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: true, maxTokens: 1200, ctx: 32768, temperature: 0.25 },
  // Housekeeping: memory distillation, summarisation. Never needs the flagship.
  memory: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: false, maxTokens: 600, ctx: 32768, temperature: 0.2 },
  vision: { id: '@cf/meta/llama-3.2-11b-vision-instruct', nativeTools: false, maxTokens: 900, ctx: 8192, temperature: 0.3 },
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

/** AI Gateway options attached to every env.AI.run call: caching, logging, and cost attribution. */
function gatewayOpts(env: Env, kind: string, cacheTtl: number) {
  const id = env.AI_GATEWAY_ID;
  if (!id) return undefined;
  return { gateway: { id, cacheTtl, collectLog: true, metadata: { kind } } };
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

// ---------------------------------------------------------------------------
// response normalization
// ---------------------------------------------------------------------------
function extractText(r: any): string {
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

function extractToolCalls(r: any): GatewayToolCall[] {
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

function extractUsage(r: any, inputChars: number, text: string): { inputTokens: number; outputTokens: number } {
  const u = r?.usage ?? r?.result?.usage;
  const inTok = u?.prompt_tokens ?? u?.input_tokens;
  const outTok = u?.completion_tokens ?? u?.output_tokens;
  if (typeof inTok === 'number' && typeof outTok === 'number') return { inputTokens: inTok, outputTokens: outTok };
  // no usage reported: estimate conservatively so unmetered calls still cost the budget something
  return { inputTokens: Math.ceil(inputChars / 3.5), outputTokens: Math.ceil(text.length / 3.5) };
}

// ---------------------------------------------------------------------------
// main entry
// ---------------------------------------------------------------------------
export interface ChatOptions {
  /** what this call is for, used for spend attribution in the admin report */
  kind?: string;
  /** seconds; 0 disables caching for this call */
  cacheTtl?: number;
}

export async function chat(env: Env, req: GatewayRequest, opts: ChatOptions = {}): Promise<GatewayResponse> {
  const models = await getModels(env);
  const cfg = models[req.model];
  if (!cfg) throw new Error(`unknown model key: ${req.model}`);

  const usePrompted = !!req.tools?.length && !cfg.nativeTools;
  let messages = req.messages.map((m) => ({
    role: m.role,
    content: m.content,
    ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
    ...(m.name ? { name: m.name } : {}),
  }));
  if (usePrompted) {
    if (messages[0]?.role === 'system') {
      messages = [{ ...messages[0], content: messages[0].content + promptedToolPreamble(req.tools!) }, ...messages.slice(1)];
    }
    messages = messages.map((m) => (m.role === 'tool' ? { ...m, role: 'user' as const, content: `Tool result:\n${m.content}` } : m));
  }

  const maxTokens = Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens);
  const payload: Record<string, unknown> = {
    messages,
    max_tokens: maxTokens,
    temperature: req.temperature ?? cfg.temperature,
  };
  if (req.tools?.length && cfg.nativeTools) {
    payload.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
  if (cfg.reasoningEffort) payload.reasoning = { effort: cfg.reasoningEffort };
  if (req.jsonSchema) payload.response_format = { type: 'json_schema', json_schema: req.jsonSchema };

  // ---- spend gate: nothing below this line runs without a reservation ----
  const inputChars = messages.reduce((n, m) => n + m.content.length, 0) + JSON.stringify(payload.tools ?? '').length;
  const estimate = estimateNeurons(cfg.id, inputChars, maxTokens);
  if (estimate > MAX_NEURONS_PER_REQUEST) {
    throw new BudgetError('request_too_large', BUDGET_MESSAGES.request_too_large!);
  }
  const reserved = await reserve(env, cfg.id, estimate);

  const kind = opts.kind ?? req.model;
  let raw: unknown;
  try {
    // NOTE: exactly one attempt. Retrying inference bills the same work twice; the caller
    // decides whether a failure is worth another paid attempt.
    raw = await env.AI.run(cfg.id as Parameters<Ai['run']>[0], payload as never, gatewayOpts(env, kind, opts.cacheTtl ?? 0) as never);
  } catch (e) {
    await release(env, reserved);
    const msg = e instanceof Error ? e.message : String(e);
    if (/4006|daily free allocation|neurons/i.test(msg)) {
      throw new BudgetError('daily_cap', BUDGET_MESSAGES.daily_cap!);
    }
    throw new Error(`inference failed (${cfg.id}): ${msg}`);
  }

  let text = extractText(raw);
  let toolCalls = cfg.nativeTools ? extractToolCalls(raw) : [];
  if (usePrompted) {
    const parsed = parsePromptedToolCalls(text);
    toolCalls = parsed.calls;
    text = parsed.cleaned;
  }
  // NOTE: no fence-parsing fallback in native mode — tool results contain untrusted content and
  // parsing quoted fences would turn that content into executed tool calls.

  const usage = extractUsage(raw, inputChars, text);
  const actual = neuronsFor(cfg.id, usage.inputTokens, usage.outputTokens);
  await settle(env, reserved, actual, cfg.id, kind);

  return {
    text,
    toolCalls,
    usage,
    neurons: actual,
    provider: 'workers-ai',
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
