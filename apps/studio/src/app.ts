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

// Every model call goes through the account's own AI Gateway, so spend caps and logs see it.
const bound = env as unknown as Env;
setProvider(cloudflareBindingProvider({ binding: bound.AI, gateway: { id: bound.AI_GATEWAY_ID } }));

const app = new Hono<{ Bindings: Env }>();

const MOUNT = '/api/agents/studpilot';

app.get('/api/health', (c) => c.json({ ok: true }));

app.use(`${MOUNT}/*`, async (c, next) => {
  const auth = c.req.header('Authorization') ?? '';
  const jwt = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const [projectId] = c.req.path.slice(MOUNT.length + 1).split('/');
  if (!jwt || !projectId) return c.json({ error: 'unauthorized' }, 401);
  const open = await c.env.GATE.openProject(jwt, projectId);
  if (!open.ok) return c.json({ error: 'not found' }, 404);
  return next();
});

app.route(MOUNT, createAgentRouter(StudPilot));

export default app;
