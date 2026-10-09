/**
 * The agent worker's routes, reached only through the `studpilot` worker's /studio/* proxy (same origin as the app, so
 * the signed-in Supabase session carries over).
 *
 *   GET  /studio/api/health          build marker
 *   ANY  /studio/agent/<projectId>…  the project's agent (WebSocket chat + its HTTP helpers)
 *   GET  /studio/api/admin/history/<projectId>  the operator's export of that conversation (X-Admin-Key)
 *   GET  /studio/api/admin/object/<agent|flue>/<objectId>  raw storage of one agent object, by id (X-Admin-Key)
 *
 * Every agent request is checked against the project's owner first; the agent instance is named by the project id, so
 * a person can only ever reach the agent of a project they own.
 */
import { getAgentByName } from 'agents';
import { projectOf } from './conversation-id.ts';

export { StudPilotAgent } from './agent.ts';
export { FlueStudPilotAgent } from './legacy.ts';

const AGENT_PREFIX = '/studio/agent/';
const ADMIN_HISTORY_PREFIX = '/studio/api/admin/history/';
const ADMIN_OBJECT_PREFIX = '/studio/api/admin/object/';

/** Constant-time comparison of two secrets (hashes compared, so length leaks nothing either). */
async function sameSecret(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([a, b].map((v) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
  const p = new Uint8Array(x!), q = new Uint8Array(y!);
  let diff = 0;
  for (let i = 0; i < p.length; i++) diff |= p[i]! ^ q[i]!;
  return diff === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/studio/api/health') {
      return Response.json({ ok: true, buildSha: env.BUILD_SHA ?? 'development' });
    }
    // The operator's export of one project's agent conversation (every step, tool call, result and error). Only with the
    // admin key, which only the operator holds; without it the route does not exist.
    if (url.pathname.startsWith(ADMIN_HISTORY_PREFIX)) {
      if (!env.ADMIN_KEY || !(await sameSecret(request.headers.get('X-Admin-Key') ?? '', env.ADMIN_KEY))) return new Response('Not found', { status: 404 });
      const projectId = projectOf(url.pathname.slice(ADMIN_HISTORY_PREFIX.length));
      if (!projectId) return new Response('Not found', { status: 404 });
      const agent = await getAgentByName(env.StudPilotAgent, projectId);
      return Response.json(await agent.exportHistory());
    }
    // The same export by Durable Object id (a conversation whose project no longer exists), for either agent class.
    if (url.pathname.startsWith(ADMIN_OBJECT_PREFIX)) {
      if (!env.ADMIN_KEY || !(await sameSecret(request.headers.get('X-Admin-Key') ?? '', env.ADMIN_KEY))) return new Response('Not found', { status: 404 });
      const [kind, hex] = url.pathname.slice(ADMIN_OBJECT_PREFIX.length).split('/');
      if (!hex || !/^[0-9a-f]{64}$/.test(hex)) return new Response('Not found', { status: 404 });
      if (kind === 'agent') {
        const stub = env.StudPilotAgent.get(env.StudPilotAgent.idFromString(hex));
        return Response.json(await stub.dumpStorage());
      }
      if (kind === 'flue') {
        const stub = env.FLUE_STUDPILOT.get(env.FLUE_STUDPILOT.idFromString(hex));
        return Response.json(await stub.dumpStorage());
      }
      return new Response('Not found', { status: 404 });
    }
    if (!url.pathname.startsWith(AGENT_PREFIX)) return new Response('Not found', { status: 404 });

    const projectId = projectOf(url.pathname.slice(AGENT_PREFIX.length).split('/')[0] ?? '');
    // A browser WebSocket cannot set headers, so the token comes in the query; an HTTP helper may use the header.
    const auth = request.headers.get('Authorization') ?? '';
    const token = url.searchParams.get('token') ?? (auth.startsWith('Bearer ') ? auth.slice(7) : '');
    if (!projectId || !token) return Response.json({ error: 'unauthorized' }, { status: 401 });
    const open = await env.GATE.openProject(token, projectId);
    if (!open.ok) return Response.json({ error: 'not found' }, { status: 404 });

    const agent = await getAgentByName(env.StudPilotAgent, projectId);
    await agent.setProject({ name: open.projectName, canBuild: open.canBuild });
    // The token has done its job; it never reaches the agent.
    url.searchParams.delete('token');
    const headers = new Headers(request.headers);
    headers.delete('Authorization');
    return agent.fetch(new Request(url, { method: request.method, headers, body: request.body, ...(request.body ? { duplex: 'half' } : {}) } as RequestInit));
  },
} satisfies ExportedHandler<Env>;
