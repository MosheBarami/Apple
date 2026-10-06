// Drives the rebuilt Studio agent (apps/studio, a Flue agent at /studio/api/agents/studpilot/<project>~<chat>) for the harness's
// `--agent studio` runs. The agent is reached exactly as the browser reaches it: with the test user's own Supabase session, minted
// through the Supabase admin magic-link flow for that EXISTING user (no password, no new account). Nothing secret is printed.

const SUPABASE_REF = 'npqvyijsvzkuwddyhtpm';

/** A session for an existing user. Needs SUPABASE_ACCESS_TOKEN (the Management API token in the owner's .env). */
export async function mintUserSession(userId, { managementToken, fetch = globalThis.fetch } = {}) {
  if (!managementToken) throw new Error('SUPABASE_ACCESS_TOKEN is not set, so no session can be made for the Studio agent');
  const base = `https://${SUPABASE_REF}.supabase.co`;
  const keys = await (await fetch(`https://api.supabase.com/v1/projects/${SUPABASE_REF}/api-keys?reveal=true`, { headers: { Authorization: `Bearer ${managementToken}` } })).json();
  const secret = Array.isArray(keys) ? keys.find((k) => k.type === 'secret')?.api_key : undefined;
  const publishable = Array.isArray(keys) ? keys.find((k) => k.type === 'publishable')?.api_key : undefined;
  if (!secret || !publishable) throw new Error('the Supabase project keys could not be read');
  const admin = { apikey: secret, 'content-type': 'application/json' };
  const user = await (await fetch(`${base}/auth/v1/admin/users/${userId}`, { headers: admin })).json();
  if (!user?.email) throw new Error(`the test user ${userId} was not found`);
  const link = await (await fetch(`${base}/auth/v1/admin/generate_link`, { method: 'POST', headers: admin, body: JSON.stringify({ type: 'magiclink', email: user.email }) })).json();
  const tokenHash = link?.hashed_token ?? link?.properties?.hashed_token;
  if (!tokenHash) throw new Error('a sign-in link could not be made for the test user');
  const v = await (await fetch(`${base}/auth/v1/verify`, { method: 'POST', headers: { apikey: publishable, 'content-type': 'application/json' }, body: JSON.stringify({ type: 'magiclink', token_hash: tokenHash }) })).json();
  if (!v?.access_token || v?.user?.id !== userId) throw new Error('the test user\'s session could not be verified');
  return v.access_token;
}

/** The conversation id for one piece: a fresh chat in the test project, so no piece sees another. */
export function evalConversationId(projectId, requestId, stamp) {
  return `${projectId}~eval-${String(requestId).toLowerCase()}-${stamp}`.slice(0, 36 + 1 + 48);
}

/**
 * Sends one request and waits for the reply. Returns the reply text, the tool steps the conversation shows (top-level and
 * the coordinator's `task` delegations), and how it ended.
 */
export async function runStudioRequest({ apiBase, token, conversationId, text, timeoutMs }) {
  const sdk = await import('@flue/sdk'); // a root devDependency, the same version apps/studio uses
  const client = sdk.createFlueClient({ url: `${apiBase}/studio/api/agents/studpilot/${conversationId}`, token });
  const sent = await client.send({ message: { kind: 'user', body: text } });
  let reply;
  let endedBy = 'done';
  let error = null;
  try {
    reply = await client.read(sent, { signal: AbortSignal.timeout(timeoutMs) });
  } catch (e) {
    endedBy = e?.name === 'TimeoutError' || e?.name === 'AbortError' ? 'timeout' : 'failed';
    error = String(e?.message ?? e).slice(0, 500);
    if (endedBy === 'timeout') await client.abort?.().catch(() => undefined);
  }
  const steps = [];
  try {
    const history = await client.history?.();
    for (const m of history?.messages ?? []) {
      if (m.role !== 'assistant') continue;
      for (const p of m.parts ?? []) {
        if (p.type !== 'dynamic-tool') continue;
        steps.push({ tool: p.toolName, ok: p.state === 'output-available' && !p.errorText, summary: JSON.stringify(p.input ?? {}).slice(0, 300), ...(p.errorText ? { error: String(p.errorText).slice(0, 300) } : {}) });
      }
    }
  } catch {
    /* the step list is evidence for the claim audit; a reply without it is still a reply */
  }
  return { reply: reply?.text ?? '', endedBy, error, steps };
}
