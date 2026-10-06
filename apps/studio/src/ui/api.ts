// The few product calls the Studio app makes outside the agent: the project list (Supabase, under RLS) and the
// Studio pairing routes of the main worker (same origin, the user's own session).
import { nextProjectName, UNTITLED_PREFIX } from '../../../web/src/lib/project-names.ts';
import { authHeaders, supabase } from './session.ts';

export interface Project {
  id: string;
  name: string;
  updated_at: string;
  last_activity_at: string | null;
}

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase
    .from('projects')
    .select('id, name, updated_at, last_activity_at')
    .is('archived_at', null)
    .order('updated_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data } = await supabase.from('projects').select('id, name, updated_at, last_activity_at').eq('id', id).maybeSingle();
  return (data as Project | null) ?? null;
}

/** Same naming as the /app shelf (apps/web/src/lib/use-create-project.ts): "Untitled piece N", one more than the highest. */
export async function createProject(): Promise<string> {
  const { data: session } = await supabase.auth.getSession();
  const ownerId = session.session?.user.id;
  if (!ownerId) throw new Error('Not signed in');
  const taken = await supabase.from('projects').select('name').like('name', `${UNTITLED_PREFIX} %`);
  if (taken.error) throw new Error(taken.error.message);
  const { data, error } = await supabase
    .from('projects')
    .insert({ owner_id: ownerId, name: nextProjectName((taken.data ?? []).map((row) => row.name)) })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export interface StudioLink {
  paired: boolean;
  connected: boolean;
}

export async function studioLink(projectId: string): Promise<StudioLink | null> {
  const res = await fetch(`/api/projects/${projectId}/studio/diagnostics?limit=1`, { headers: await authHeaders() });
  if (!res.ok) return null;
  const body = (await res.json()) as { link?: StudioLink };
  return body.link ?? null;
}

export interface PairingCode {
  code: string;
  expiresAtIso: string;
}

export async function pairingCode(projectId: string): Promise<PairingCode> {
  const res = await fetch(`/api/projects/${projectId}/pairing`, { method: 'POST', headers: await authHeaders() });
  const body = (await res.json().catch(() => ({}))) as Partial<PairingCode> & { error?: string };
  if (!res.ok || !body.code) throw new Error(body.error ?? `could not make a code (${res.status})`);
  return { code: body.code, expiresAtIso: body.expiresAtIso ?? '' };
}
