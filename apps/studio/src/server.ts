/**
 * The agent worker's routes, reached only through the `studpilot` worker's /studio/* proxy (same origin as the app, so
 * the signed-in Supabase session carries over).
 *
 *   GET  /studio/api/health          build marker
 *   ANY  /studio/agent/<projectId>…  the project's agent (WebSocket chat + its HTTP helpers)
 *
 * Every agent request is checked against the project's owner first; the agent instance is named by the project id, so
 * a person can only ever reach the agent of a project they own.
 */
import { getAgentByName } from 'agents';
import { projectOf } from './conversation-id.ts';

export { StudPilotAgent } from './agent.ts';
export { FlueStudPilotAgent } from './legacy.ts';

const AGENT_PREFIX = '/studio/agent/';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/studio/api/health') {
      return Response.json({ ok: true, buildSha: env.BUILD_SHA ?? 'development' });
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
