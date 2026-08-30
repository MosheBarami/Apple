// Minimal PostgREST client. Always called with the USER's verified JWT so RLS applies.
import type { Env } from './env';

export async function supaRest<T = unknown>(
  env: Env,
  userJwt: string,
  path: string,
  init?: RequestInit & { prefer?: string },
): Promise<{ ok: boolean; status: number; data: T | null }> {
  const headers: Record<string, string> = {
    apikey: env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${userJwt}`,
    'Content-Type': 'application/json',
  };
  if (init?.prefer) headers['Prefer'] = init.prefer;
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1${path}`, { ...init, headers });
  let data: T | null = null;
  try {
    data = (await res.json()) as T;
  } catch {
    /* empty body */
  }
  return { ok: res.ok, status: res.status, data };
}

export interface ProjectRow {
  id: string;
  owner_id: string;
  name: string;
  place_name: string | null;
  memory_summary: string | null;
  memory_facts: unknown[];
}

/** Returns the project row iff the user owns it (RLS enforces). */
export async function getOwnedProject(env: Env, userJwt: string, projectId: string): Promise<ProjectRow | null> {
  const { ok, data } = await supaRest<ProjectRow[]>(
    env,
    userJwt,
    `/projects?id=eq.${encodeURIComponent(projectId)}&select=id,owner_id,name,place_name,memory_summary,memory_facts&limit=1`,
  );
  if (!ok || !data || data.length === 0) return null;
  return data[0] ?? null;
}

export async function getProfile(env: Env, userJwt: string, userId: string) {
  const { ok, data } = await supaRest<{ id: string; plan: string; is_admin: boolean; display_name: string | null }[]>(
    env,
    userJwt,
    `/profiles?id=eq.${encodeURIComponent(userId)}&select=id,plan,is_admin,display_name&limit=1`,
  );
  return ok && data && data[0] ? data[0] : null;
}
