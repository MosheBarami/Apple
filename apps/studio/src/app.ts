/**
 * The Studio worker's routes. Every agent conversation is one StudPilot project: the conversation id IS
 * the project id, so the owner check below is the whole authorisation story (Flue docs, "Protecting your
 * agents"). The JWT is the user's Supabase session, the same one the /app SPA holds on this origin.
 */
import { setProvider } from '@flue/runtime';
import { cloudflareBindingProvider } from '@flue/runtime/cloudflare/workers-ai';
import { createAgentRouter } from '@flue/runtime/routing';
import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { StudPilot } from './agents/studpilot.ts';
import { projectOf } from './conversation-id.ts';
import { guardModelStream } from './model-stream.ts';
import { parseInferenceSelection } from '../../../packages/shared/src/inference.ts';

const bound = env as unknown as Env;

/**
 * Every model call is metered by the main worker's budget (StudioGate.reserveModel / settleModel: the same daily and
 * monthly ceilings and kill switch as the product's own agent) and goes through the account's AI Gateway. A refused
 * reservation fails the call with the product's own message. A streamed reply reports no usage here, so it settles at
 * the reserved estimate, which can only over-count.
 */
/**
 * GLM on Workers AI reasons at a high effort unless told otherwise, and with the builder's context that took minutes per
 * call: U01's builder never reached its first tool in 15 minutes (2026-10-06). The product's own loop has always run GLM at
 * low effort, temperature 0.25 and 6,500 output tokens (apps/worker/src/gateway.ts MODELS.agent); the Studio agent now
 * does the same unless a caller sets them.
 */
export function withAgentDefaults(model: string, inputs: Record<string, unknown>): Record<string, unknown> {
  if (!/glm/i.test(model)) return inputs;
  // Flue asks for the model's whole output window (max_completion_tokens); reserved at that size, the builder's step
  // passed the 1,200-neuron step cap and was refused before it ran (U01, 2026-10-06). The output is capped at 6500.
  const cap = (n: unknown) => (typeof n === 'number' ? Math.min(n, 6500) : n);
  const out = inputs.max_tokens === undefined && inputs.max_completion_tokens === undefined
    ? { max_tokens: 6500 }
    : { ...(inputs.max_tokens !== undefined ? { max_tokens: cap(inputs.max_tokens) } : {}), ...(inputs.max_completion_tokens !== undefined ? { max_completion_tokens: cap(inputs.max_completion_tokens) } : {}) };
  return {
    ...inputs,
    reasoning_effort: inputs.reasoning_effort ?? 'low',
    temperature: inputs.temperature ?? 0.25,
    ...out,
  };
}

async function meteredRun(model: string, raw: Record<string, unknown>, options?: unknown) {
  const routed = /^@cf\/studpilot\/([0-9a-f-]{36})\/([0-9a-f-]{36})(?:\/(planner|builder|reviewer|tester))?$/.exec(model);
  if (routed) {
    const system = Array.isArray(raw.messages) ? (raw.messages as { role?: string; content?: unknown }[])
      .filter((message) => message.role === 'system' && typeof message.content === 'string')
      .map((message) => message.content).join('\n') : '';
    // These tags are authored by the registered roles, not inferred from the creator's words.
    const role = /<studpilot-role name="(planner|builder|reviewer|tester)">/.exec(system)?.[1];
    const task = role === 'planner' ? 'planning' : role === 'reviewer' || role === 'tester' ? 'evidence' : 'tools';
    const signal = (options as { signal?: AbortSignal } | undefined)?.signal;
    // The reference identifies an owner-checked immutable run; no user key or ambient
    // authentication state is inherited by this isolate or by a delegated agent.
    return bound.GATE.fetch(new Request(`https://studio-gate/inference/${routed[1]}/${routed[2]}`, {
      method: 'POST', body: JSON.stringify({ input: raw, task }), signal,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  const inputs = withAgentDefaults(model, raw ?? {});
  const asked = inputs?.max_completion_tokens ?? inputs?.max_tokens;
  const maxOut = typeof asked === 'number' ? asked : 4096;
  const hold = await bound.GATE.reserveModel(model, JSON.stringify(inputs ?? {}).length, maxOut);
  if (!hold.ok) throw new Error(hold.message);
  try {
    const result = await (bound.AI.run as (m: string, i: unknown, o?: unknown) => Promise<unknown>)(model, inputs, options);
    const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | null)?.usage;
    await bound.GATE.settleModel(
      model,
      hold.reserved,
      usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number'
        ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
        : null,
    );
    return result instanceof Response ? guardModelStream(result) : result;
  } catch (e) {
    await bound.GATE.releaseModel(model, hold.reserved);
    throw e;
  }
}

// Lazy: at upload validation the module runs with no bindings, so nothing here may touch bound.AI before a call.
const metered = new Proxy({} as Ai, {
  get(_target, prop) {
    if (prop === 'run') return meteredRun;
    const ai = bound.AI as unknown as Record<string | symbol, unknown> | undefined;
    if (!ai) return undefined;
    const value = ai[prop];
    return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(ai) : value;
  },
});
setProvider(cloudflareBindingProvider({
  binding: metered,
  gateway: { id: bound.AI_GATEWAY_ID, requestTimeoutMs: 60_000 },
  streamIdleTimeoutMs: 60_000,
}));

const app = new Hono<{ Bindings: Env }>();

// Full public paths: the main worker forwards /studio/api/* unchanged (see its /studio proxy).
const MOUNT = '/studio/api/agents/studpilot';

app.get('/studio/api/health', (c) => c.json({ ok: true, buildSha: c.env.BUILD_SHA ?? 'development' }));

app.use(`${MOUNT}/*`, async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const [conversationId] = c.req.path.slice(MOUNT.length + 1).split('/');
  const projectId = projectOf(conversationId ?? '');
  if (!jwt || !projectId) return c.json({ error: 'unauthorized' }, 401);
  const open = await c.env.GATE.openProject(jwt, projectId);
  if (!open.ok) return c.json({ error: 'not found' }, 404);
  // Sending is what spends model time, and it is not metered against Credits yet: only an owner who may build sends.
  if (c.req.method === 'POST' && !open.canBuild) {
    return c.json({ error: 'StudPilot is in private pre-launch: building is open to approved accounts only.' }, 403);
  }
  // A new message spends the owner's Credits (charged when the response settles, in the agent): none left, none admitted.
  if (c.req.method === 'POST' && !c.req.path.endsWith('/abort')) {
    const spend = await c.env.GATE.canSpend(projectId);
    if (!spend.ok) return c.json({ error: spend.message }, 402);
  }
  return next();
});

app.route(MOUNT, createAgentRouter(StudPilot));

// Rewrite before Hono/Flue read and cache the delivery body. Older clients and the
// managed default keep their existing request. Private choices use Flue's documented
// structured delivery, with a server-created reference pinned before admission.
const originalFetch = app.fetch;
app.fetch = async (request, environment, executionCtx) => {
  const path = new URL(request.url).pathname;
  const conversation = path.startsWith(`${MOUNT}/`) ? path.slice(MOUNT.length + 1) : '';
  const projectId = projectOf(conversation);
  const rawSelection = request.headers.get('X-StudPilot-Inference');
  if (request.method === 'POST' && projectId && rawSelection !== null) {
    let selection;
    try { selection = parseInferenceSelection(JSON.parse(rawSelection)); } catch { selection = null; }
    if (!selection) return Response.json({ error: 'Invalid AI route selection.' }, { status: 400 });
    if (selection.route !== 'studpilot') {
      const auth = request.headers.get('Authorization') ?? '', jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!jwt) return Response.json({ error: 'unauthorized' }, { status: 401 });
      const raw = await request.clone().text();
      if (raw.length > 40000) return Response.json({ error: 'This request is too large.' }, { status: 413 });
      let delivery;
      try { delivery = JSON.parse(raw); } catch { return Response.json({ error: 'Invalid delivery.' }, { status: 400 }); }
      if (delivery?.kind !== 'user' || typeof delivery.body !== 'string' || !delivery.body.trim()
        || delivery.attachments?.length) return Response.json({ error: 'This route accepts text requests only.' }, { status: 400 });
      try {
        const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify({ delivery, selection })));
        const inputHash = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
        const pin = await (environment as Env).GATE.prepareInference(jwt, projectId, selection, {
          conversation, requestKey: typeof delivery.idempotencyKey === 'string' ? delivery.idempotencyKey : crypto.randomUUID(), inputHash,
        });
        const headers = new Headers(request.headers); headers.delete('Content-Length');
        request = new Request(request, { headers, body: JSON.stringify({
          ...delivery, kind: 'signal', type: 'studpilot-creator-request', tagName: 'studpilot-creator-request',
          attributes: { runRef: pin.runRef, requestText: delivery.body },
        }) });
      } catch { return Response.json({ error: 'The selected AI route is unavailable. Test its connection or choose a supported route. No fallback was used.' }, { status: 422 }); }
    }
  }
  return originalFetch(request, environment, executionCtx);
};

export default app;
