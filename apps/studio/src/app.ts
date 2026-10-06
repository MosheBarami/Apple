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
  return {
    ...inputs,
    reasoning_effort: inputs.reasoning_effort ?? 'low',
    temperature: inputs.temperature ?? 0.25,
    ...(inputs.max_tokens === undefined && inputs.max_completion_tokens === undefined ? { max_tokens: 6500 } : {}),
  };
}

async function meteredRun(model: string, raw: Record<string, unknown>, options?: unknown) {
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
    return result;
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
setProvider(cloudflareBindingProvider({ binding: metered, gateway: { id: bound.AI_GATEWAY_ID } }));

const app = new Hono<{ Bindings: Env }>();

// Full public paths: the main worker forwards /studio/api/* unchanged (see its /studio proxy).
const MOUNT = '/studio/api/agents/studpilot';

app.get('/studio/api/health', (c) => c.json({ ok: true }));

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

export default app;
