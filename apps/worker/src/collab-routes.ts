/**
 * THE SHARED SURFACE — every route a collaborator can reach.
 *
 * Its own module, and that is not only tidiness. `index.ts` is the busiest file in the worker and
 * several people are changing it at once; a two-hundred-line block living there is a block that
 * gets lost in a merge, and a security surface that vanishes quietly is worse than one that was
 * never written. Here it is one file with one subject, and index.ts holds a single call.
 *
 * WHAT STAYS IN index.ts, DELIBERATELY: `withOwnedProject`. It is the only function that addresses
 * a Durable Object for a project, and a static check in packages/evals/src/security.test.mjs
 * confines `sessionStub` to that helper, the admin routes and the paired plugin. Moving the stub
 * lookup here would put it outside the file that check reads — which is not "passing the check",
 * it is leaving the check with nothing to look at. So the gate is passed IN.
 *
 * EVERY ROUTE IS REGISTERED WITH A LITERAL PATH. The first draft built them from a table in a
 * `for` loop: shorter, and invisible to every guard in this repository that parses source for
 * `app.get('…'`. tests/webtools-wiring.test.mjs says the same thing about the tool registry — an
 * entry supplied by a spread "would pass every assertion above and be invisible to all of them".
 *
 * THE ACCESS RULE, once, for all of them: a stranger gets 404 — the same answer as a project that
 * does not exist, because three different answers turn an id into an oracle. A member who lacks
 * the capability gets 403, because they already know it exists and need to be told that it is
 * their ROLE in the way. Every route names the action it performs; there is no default.
 */
import type { Context } from 'hono';
import type { Env, AuthedUser } from './env';
import { getProfile, getProjectAccess, listProjectMembers, memberDirectory, supaRest, type ProjectRow } from './supa';
import { capabilitiesFor, asCollabRole, asShareScope, redeemShareLink, GRANTABLE_ROLES, type CollabAction, type CollabRole, type Membership } from './collab';
import { isShareToken, newShareToken, putKvGrant, putShareLink, readShareLink, revokeShareLink } from './collab-links';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** What index.ts's `withOwnedProject` hands back when it lets you in. */
export interface ProjectContext {
  user: AuthedUser;
  project: ProjectRow;
  stub: DurableObjectStub;
  membership: Membership;
  role: CollabRole;
}

/**
 * The gate, injected. Called with an action it admits members; called without one it is
 * owner-only, which is what every pre-existing `/api/projects/*` route relies on.
 */
export type ProjectGate = (
  c: { env: Env; get: (k: 'user') => AuthedUser },
  projectId: string,
  action?: CollabAction,
) => Promise<ProjectContext | null>;

type Ctx = Context<{ Bindings: Env; Variables: { user: AuthedUser } }>;
type Handler = (c: Ctx) => Promise<Response> | Response;
/** Only the three verbs this file registers, so nothing here can reach for a fourth. */
export interface RouteTarget {
  get(path: string, handler: Handler): unknown;
  post(path: string, handler: Handler): unknown;
  delete(path: string, handler: Handler): unknown;
}

export function registerSharedRoutes(app: RouteTarget, withOwnedProject: ProjectGate, count: (env: Env, key: string) => void): void {
  /**
   * THE SHARED SURFACE.
   *
   * Deliberately a separate family of routes rather than a widening of `/api/projects/*`. Those
   * routes are owner-only and every one of them says so through `withOwnedProject(c, id)`; teaching
   * that helper to admit members WITHOUT naming an action per route would have made a viewer's
   * `POST /restore` succeed, and the diff that did it would have touched one function.
   *
   * Here, every route names the action it performs. `decideAccess` answers, and a stranger gets 404
   * — the same answer as a project that does not exist — while a member who lacks the capability
   * gets 403, because they already know it exists and need to be told which role they are asking
   * with.
   */
  /**
   * The shared gate, with the 404/403 distinction preserved.
   *
   * `withOwnedProject` answers null for both "you are not a member" and "you are a member who may
   * not do this", because its two-argument form has exactly one answer and the existing routes
   * depend on that. Here the difference matters, so a refusal is re-asked as a plain `read` — one
   * extra round trip, on the failure path only — and the two cases are told apart by whether THAT
   * succeeds.
   */
  async function sharedAccess(
    c: Context,
    projectId: string,
    action: CollabAction,
  ): Promise<{ ctx: NonNullable<Awaited<ReturnType<typeof withOwnedProject>>>; status: 200 } | { ctx: null; status: 403 | 404 }> {
    const ctx = await withOwnedProject(c, projectId, action);
    if (ctx) return { ctx, status: 200 };
    if (!UUID_RE.test(projectId)) return { ctx: null, status: 404 };
    const probe = await getProjectAccess(c.env, c.get('user'), projectId, 'read');
    return { ctx: null, status: probe.project === null ? 404 : 403 };
  }

  const collabRefusal = (c: Context, status: 403 | 404) =>
    c.json({ error: status === 403 ? 'forbidden' : 'not found' }, status);

  /** The member directory the store needs, built from the project's LIVE grants only. */
  async function collabDirectory(c: Context, ctx: { user: AuthedUser; project: ProjectRow }) {
    const rows = await listProjectMembers(c.env, ctx.user, ctx.project);
    const profile = await getProfile(c.env, ctx.user.jwt, ctx.project.owner_id);
    return memberDirectory(ctx.project, rows, profile?.display_name ?? null);
  }

  /** One door to the Durable Object's collaboration store, so identity crosses exactly once. */
  async function collabCall(
    stub: DurableObjectStub,
    method: string,
    path: string,
    body: Record<string, unknown>,
    ctx: { user: AuthedUser; role: string },
    directory?: unknown[],
  ) {
    return stub.fetch('https://do/collab', {
      method: 'POST',
      body: JSON.stringify({ method, path, body, userId: ctx.user.userId, role: ctx.role, directory }),
    });
  }

  app.get('/api/shared/:id', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const ctx = gate.ctx;
    const members = await collabDirectory(c, ctx);
    return c.json({
      project: { id: ctx.project.id, name: ctx.project.name, ownerId: ctx.project.owner_id },
      role: ctx.role,
      capabilities: capabilitiesFor(ctx.role),
      members: members.map((m) => ({ userId: m.userId, handle: m.handle, role: m.role, displayName: m.displayName })),
    });
  });

  app.get('/api/shared/:id/ws', async (c) => {
    if (c.req.header('Upgrade')?.toLowerCase() !== 'websocket') return c.json({ error: 'expected websocket' }, 426);
    // `read` opens the socket; every WRITE the socket attempts is gated again inside the Durable
    // Object against the role sent below. Opening at `chat` instead would mean a viewer could not
    // watch a build at all, which is most of what being a viewer is for.
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const ctx = gate.ctx;
    void count(c.env, 'ws_connect');
    const headers = new Headers(c.req.raw.headers);
    headers.set('X-User-Id', ctx.user.userId);
    headers.set('X-User-Jwt', ctx.user.jwt);
    //[[ SET, NEVER APPENDED — the browser's own headers were copied into this object one line above,
    //   and a client that sent `X-Golem-Role: owner` would otherwise have written its own permission
    //   slip. `set` replaces; the value here is the one the access decision produced. ]]
    headers.set('X-Golem-Role', ctx.role);
    return ctx.stub.fetch(new Request('https://do/ws', { headers, method: 'GET' }));
  });

  app.get('/api/shared/:id/messages', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const url = new URL(c.req.url);
    return gate.ctx.stub.fetch(`https://do/messages?${url.searchParams}`);
  });

  app.get('/api/shared/:id/checkpoints', async (c) => {
    // The build history, for a member. Reading it is `read`; CREATING one is `build` and RESTORING
    // one is `restore_version`, and both of those live on the socket, where the Durable Object asks
    // the capability question again — see webSocketMessage in do/session.ts.
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    return gate.ctx.stub.fetch('https://do/checkpoints');
  });

  app.get('/api/shared/:id/members', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    return c.json({ members: await collabDirectory(c, gate.ctx) });
  });

  app.post('/api/shared/:id/members', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const ctx = gate.ctx;
    const body = (await c.req.json().catch(() => null)) as { userId?: unknown; role?: unknown; expiresAt?: unknown } | null;
    const role = asCollabRole(body?.role);
    // `owner` is not in GRANTABLE_ROLES, so an invitation can never confer the project. Checked here
    // as well as in classifyGrant: a row refused on READ is still a row someone managed to write,
    // and a members list containing a phantom owner is a lie the UI would faithfully render.
    if (!role || !(GRANTABLE_ROLES as readonly string[]).includes(role)) return c.json({ error: 'unknown_role' }, 400);
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
    if (userId === ctx.project.owner_id) return c.json({ error: 'owner_is_not_a_member' }, 400);

    const { ok, status } = await supaRest(c.env, ctx.user.jwt, '/project_members', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: JSON.stringify({
        project_id: ctx.project.id,
        user_id: userId,
        role,
        invited_by: ctx.user.userId,
        expires_at: typeof body?.expiresAt === 'string' ? body.expiresAt : null,
        revoked_at: null,
      }),
    });
    if (!ok) return c.json({ error: 'invite_failed', status }, 502);
    return c.json({ ok: true, userId, role }, 201);
  });

  app.delete('/api/shared/:id/members/:userId', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'manage_members');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const ctx = gate.ctx;
    const userId = c.req.param('userId') ?? '';
    if (!UUID_RE.test(userId)) return c.json({ error: 'bad_user' }, 400);
    // Revoked, not deleted: "this access ended" is a fact worth keeping, and a deleted row cannot
    // tell an audit reader that someone ever had access at all.
    const { ok } = await supaRest(
      c.env,
      ctx.user.jwt,
      `/project_members?project_id=eq.${encodeURIComponent(ctx.project.id)}&user_id=eq.${encodeURIComponent(userId)}`,
      { method: 'PATCH', body: JSON.stringify({ revoked_at: new Date().toISOString() }) },
    );
    if (!ok) return c.json({ error: 'revoke_failed' }, 502);
    return c.json({ ok: true, userId, revoked: true });
  });

  app.post('/api/shared/:id/links', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const ctx = gate.ctx;
    const body = (await c.req.json().catch(() => null)) as { scope?: unknown; resourceId?: unknown; role?: unknown; expiresAt?: unknown } | null;
    const scope = asShareScope(body?.scope);
    const role = asCollabRole(body?.role);
    if (!scope) return c.json({ error: 'unknown_scope' }, 400);
    if (!role) return c.json({ error: 'unknown_role' }, 400);
    const resourceId = typeof body?.resourceId === 'string' && body.resourceId.length > 0 ? body.resourceId : null;
    if (scope !== 'project' && resourceId === null) return c.json({ error: 'scoped_link_needs_a_resource' }, 400);

    const token = newShareToken();
    const link = {
      token,
      project_id: ctx.project.id,
      scope,
      resource_id: resourceId,
      role,
      expires_at: typeof body?.expiresAt === 'string' ? body.expiresAt : null,
      revoked_at: null,
      created_by: ctx.user.userId,
      created_at: new Date().toISOString(),
    };
    // Minted through the very function that REDEEMS it, so a link this product would refuse to
    // honour is never handed out: an unredeemable link is a support ticket, and an over-powered one
    // is a breach. `role_too_strong` is the refusal that matters — see collab.ts.
    const check = redeemShareLink(link, { projectId: ctx.project.id, scope, resourceId }, Date.now());
    if (!check.ok) return c.json({ error: check.reason }, 400);
    await putShareLink(c.env, link);
    return c.json({ token, scope, role, resourceId, projectId: ctx.project.id }, 201);
  });

  app.post('/api/shared/links/redeem', async (c) => {
    const user = c.get('user');
    const body = (await c.req.json().catch(() => null)) as { token?: unknown; scope?: unknown; resourceId?: unknown } | null;
    const link = await readShareLink(c.env, body?.token);
    // The REASON comes back — someone who pasted an expired link cannot act on "not found" — but the
    // project id does not, so a probe with a guessed token learns nothing about what exists.
    if (!link) return c.json({ error: 'no_such_link' }, 404);
    const asking = { projectId: link.project_id, scope: body?.scope ?? link.scope, resourceId: body?.resourceId ?? link.resource_id };
    const out = redeemShareLink(link, asking, Date.now());
    if (!out.ok) return c.json({ error: out.reason }, 403);
    if (user.userId === link.created_by) {
      return c.json({ ok: true, projectId: link.project_id, role: out.grant.role, scope: out.grant.scope });
    }
    await putKvGrant(c.env, link.project_id, {
      user_id: user.userId,
      role: out.grant.role,
      expires_at: link.expires_at,
      revoked_at: null,
      display_name: null,
      invited_by: link.created_by,
      via_token: link.token,
    });
    return c.json({ ok: true, projectId: link.project_id, role: out.grant.role, scope: out.grant.scope, resourceId: out.grant.resourceId }, 201);
  });

  app.post('/api/shared/:id/links/revoke', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'share');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    const body = (await c.req.json().catch(() => null)) as { token?: unknown } | null;
    if (!isShareToken(body?.token)) return c.json({ error: 'bad_token' }, 400);
    const link = await readShareLink(c.env, body.token);
    // A link is revocable only from the project it belongs to. Without this, holding ANY project
    // would let you revoke any link in the system by presenting its token.
    if (!link || link.project_id !== gate.ctx.project.id) return c.json({ error: 'no_such_link' }, 404);
    await revokeShareLink(c.env, body.token, new Date().toISOString());
    return c.json({ ok: true, revoked: true });
  });

  // ----------------------------------------------------------- comments, reviews, versions, presence
  /**
   * EVERY ONE OF THESE IS REGISTERED LITERALLY — see the note at the top of this file.
   *
   * The handler factory below is the only thing shared, and it takes the action as an argument
   * rather than looking it up, so there is no table to drift out of agreement with the routes.
   */
  function collabProxy(path: string, method: 'GET' | 'POST', action: CollabAction, needsDirectory = false): Handler {
    return async (c: Ctx) => {
      const gate = await sharedAccess(c, c.req.param('id') ?? '', action);
      if (gate.ctx === null) return collabRefusal(c, gate.status);
      const ctx = gate.ctx;
      const body =
        method === 'GET'
          ? (Object.fromEntries(new URL(c.req.url).searchParams.entries()) as Record<string, unknown>)
          : ((await c.req.json().catch(() => ({}))) as Record<string, unknown>);
      // The member directory is fetched only where it is consulted — mentions and reviewer checks
      // — because it is a second database round trip and a reaction needs nobody's name.
      const directory = needsDirectory ? await collabDirectory(c, ctx) : undefined;
      return collabCall(ctx.stub, method, path, body, ctx, directory);
    };
  }

  app.get('/api/shared/:id/comments', collabProxy('/collab/comments', 'GET', 'read'));
  app.post('/api/shared/:id/comments', collabProxy('/collab/comments', 'POST', 'comment', true));
  app.post('/api/shared/:id/comments/resolve', collabProxy('/collab/comments/resolve', 'POST', 'comment'));
  app.post('/api/shared/:id/reactions', collabProxy('/collab/reactions', 'POST', 'react'));
  app.get('/api/shared/:id/reviews', collabProxy('/collab/reviews', 'GET', 'read'));
  app.post('/api/shared/:id/reviews', collabProxy('/collab/reviews', 'POST', 'request_review', true));
  app.post('/api/shared/:id/reviews/approve', collabProxy('/collab/reviews/approve', 'POST', 'approve'));
  app.get('/api/shared/:id/versions', collabProxy('/collab/versions', 'GET', 'read'));
  app.post('/api/shared/:id/versions', collabProxy('/collab/versions', 'POST', 'build'));
  app.post('/api/shared/:id/versions/restore', collabProxy('/collab/versions/restore', 'POST', 'restore_version'));

  app.get('/api/shared/:id/presence', async (c) => {
    const gate = await sharedAccess(c, c.req.param('id') ?? '', 'read');
    if (gate.ctx === null) return collabRefusal(c, gate.status);
    return gate.ctx.stub.fetch('https://do/collab/presence');
  });
}
