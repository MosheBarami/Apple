// Model gateway: single entry point for all inference. Primary provider is Workers AI
// (open-weight models, server-side). Registry is KV-overridable so routing changes
// never require a redeploy. Defensive response normalization because input/output
// schemas differ per model family.
import type { Env } from './env';
import type { GatewayRequest, GatewayResponse, GatewayToolCall, GatewayToolDef } from '@golem/shared';

export interface ModelCfg {
  id: string;
  nativeTools: boolean;
  maxTokens: number;
  ctx: number;
  temperature: number;
  reasoningEffort?: 'low' | 'medium' | 'high';
}

export const DEFAULT_MODELS: Record<string, ModelCfg> = {
  clay: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: true, maxTokens: 2500, ctx: 32768, temperature: 0.3 },
  stone: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 4500, ctx: 128000, temperature: 0.25, reasoningEffort: 'low' },
  rune: { id: '@cf/openai/gpt-oss-120b', nativeTools: true, maxTokens: 6000, ctx: 128000, temperature: 0.25, reasoningEffort: 'medium' },
  memory: { id: '@cf/qwen/qwen3-30b-a3b-fp8', nativeTools: false, maxTokens: 1200, ctx: 32768, temperature: 0.2 },
  vision: { id: '@cf/meta/llama-3.2-11b-vision-instruct', nativeTools: false, maxTokens: 1500, ctx: 8192, temperature: 0.3 },
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

// -- circuit breaker (per isolate, best effort) ------------------------------
const breaker = new Map<string, { fails: number; openUntil: number }>();
function breakerOpen(id: string): boolean {
  const b = breaker.get(id);
  return !!b && b.openUntil > Date.now();
}
function breakerRecord(id: string, ok: boolean) {
  const b = breaker.get(id) ?? { fails: 0, openUntil: 0 };
  if (ok) {
    b.fails = 0;
    b.openUntil = 0;
  } else {
    b.fails += 1;
    if (b.fails >= 3) b.openUntil = Date.now() + 30_000;
  }
  breaker.set(id, b);
}

// -- prompted tool-calling fallback ------------------------------------------
function promptedToolPreamble(tools: GatewayToolDef[]): string {
  const list = tools.map((t) => `- ${t.name}: ${t.description}\n  parameters (JSON schema): ${JSON.stringify(t.parameters)}`).join('\n');
  return `\n\nYou can call tools. Available tools:\n${list}\n\nTo call a tool, reply with ONLY a fenced block:\n\`\`\`tool_call\n{"name": "<tool>", "arguments": { ... }}\n\`\`\`\nOne tool call per reply. When you are finished and no tool is needed, reply with your final answer as plain text (no tool_call block).`;
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

// -- normalization ------------------------------------------------------------
function extractText(r: any): string {
  if (typeof r === 'string') return r;
  if (typeof r?.response === 'string') return r.response;
  if (typeof r?.output_text === 'string') return r.output_text;
  if (typeof r?.result?.response === 'string') return r.result.response;
  if (Array.isArray(r?.output)) {
    const parts: string[] = [];
    for (const item of r.output) {
      if (item?.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c?.text === 'string') parts.push(c.text);
        }
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
    for (const item of r.output) {
      if (item?.type === 'function_call') push(item.name, item.arguments, item.call_id ?? item.id);
    }
  }
  return out;
}

function extractUsage(r: any, req: GatewayRequest, text: string): { inputTokens: number; outputTokens: number } {
  const u = r?.usage ?? r?.result?.usage;
  const inTok = u?.prompt_tokens ?? u?.input_tokens;
  const outTok = u?.completion_tokens ?? u?.output_tokens;
  if (typeof inTok === 'number' && typeof outTok === 'number') return { inputTokens: inTok, outputTokens: outTok };
  const inputChars = req.messages.reduce((n, m) => n + m.content.length, 0);
  return { inputTokens: Math.ceil(inputChars / 4), outputTokens: Math.ceil(text.length / 4) };
}

// -- main entry ---------------------------------------------------------------
export async function chat(env: Env, req: GatewayRequest): Promise<GatewayResponse> {
  const models = await getModels(env);
  const cfg = models[req.model];
  if (!cfg) throw new Error(`unknown model key: ${req.model}`);
  if (breakerOpen(cfg.id)) throw new Error(`model ${cfg.id} temporarily unavailable (circuit open)`);

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

  const payload: Record<string, unknown> = {
    messages,
    max_tokens: req.maxTokens ?? cfg.maxTokens,
    temperature: req.temperature ?? cfg.temperature,
  };
  if (req.tools?.length && cfg.nativeTools) {
    payload.tools = req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } }));
  }
  if (cfg.reasoningEffort) payload.reasoning = { effort: cfg.reasoningEffort };
  if (req.jsonSchema) payload.response_format = { type: 'json_schema', json_schema: req.jsonSchema };

  let raw: unknown;
  let lastErr: unknown;
  const attempts = 3;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      raw = await env.AI.run(cfg.id as Parameters<Ai['run']>[0], payload as never);
      breakerRecord(cfg.id, true);
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      const msg = e instanceof Error ? e.message : String(e);
      // transient provider errors (5xx/8005/capacity) are worth retrying
      // daily allocation exhausted is NOT transient — fail fast with a typed error
      if (/4006|daily free allocation|neurons/i.test(msg)) {
        breakerRecord(cfg.id, false);
        const err = new Error('CAPACITY_EXHAUSTED');
        (err as Error & { code?: string }).code = 'CAPACITY_EXHAUSTED';
        throw err;
      }
      const transient = /8005|Internal server error|429|capacity|timeout|3040/i.test(msg);
      if (!transient || attempt === attempts) {
        breakerRecord(cfg.id, false);
        throw new Error(`inference failed (${cfg.id}): ${msg}`);
      }
      await new Promise((r) => setTimeout(r, attempt * 1500));
    }
  }
  if (lastErr) throw lastErr;

  let text = extractText(raw);
  let toolCalls = cfg.nativeTools ? extractToolCalls(raw) : [];
  if (usePrompted) {
    const parsed = parsePromptedToolCalls(text);
    toolCalls = parsed.calls;
    text = parsed.cleaned;
  }
  // NOTE: deliberately NO fence-parsing fallback in native-tool mode. Tool results contain
  // untrusted content (script sources, Studio logs); if the model quotes a ```tool_call block
  // from that content, parsing it here would turn quoted text into an executed tool call.
  const usage = extractUsage(raw, req, text);
  return {
    text,
    toolCalls,
    usage,
    provider: 'workers-ai',
    model: cfg.id,
    finishReason: toolCalls.length ? 'tool_calls' : 'stop',
  };
}

export async function embed(env: Env, texts: string[]): Promise<number[][]> {
  const r = (await env.AI.run('@cf/baai/bge-small-en-v1.5', { text: texts } as never)) as { data?: number[][] };
  if (!r?.data) throw new Error('embedding failed');
  return r.data;
}
