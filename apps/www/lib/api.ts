// The few product calls the chat makes outside the agent: the chat list (Supabase, under RLS) and the worker's own
// routes for Studio pairing, undo and credits. The worker routes are same-origin (see lib/proxy.ts).
import { authHeaders, supabase } from "@/lib/supabase";

export interface Project {
  id: string;
  name: string;
  updated_at: string;
  last_activity_at: string | null;
}

const PROJECT_COLUMNS = "id, name, updated_at, last_activity_at";

export async function listProjects(): Promise<Project[]> {
  const { data, error } = await supabase()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(100)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as Project[];
}

export async function getProject(id: string): Promise<Project | null> {
  const { data } = await supabase()
    .from("projects")
    .select(PROJECT_COLUMNS)
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(15_000))
    .maybeSingle();
  return (data as Project | null) ?? null;
}

/** A chat is one project: the conversation id the agent route takes is the project id. */
export async function createProject(name: string): Promise<string> {
  const { data: session } = await supabase().auth.getSession();
  const ownerId = session.session?.user.id;
  if (!ownerId) {
    throw new Error("Not signed in");
  }
  const { data, error } = await supabase()
    .from("projects")
    .insert({ owner_id: ownerId, name: name.trim().slice(0, 80) || "New chat" })
    .select("id")
    .abortSignal(AbortSignal.timeout(15_000))
    .single();
  if (error) {
    throw new Error(error.message);
  }
  return (data as { id: string }).id;
}

/** Where the first message waits while the new chat's page opens (sessionStorage, per chat). */
export const firstMessageKey = (projectId: string) =>
  `studpilot:first:${projectId}`;

export interface StudioLink {
  paired: boolean;
  connected: boolean;
}

export async function studioLink(projectId: string): Promise<StudioLink | null> {
  const res = await fetch(
    `/api/projects/${projectId}/studio/diagnostics?limit=1`,
    { headers: await authHeaders(), signal: AbortSignal.timeout(15_000) }
  );
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as { link?: StudioLink };
  return body.link ?? null;
}

export interface PairingCode {
  code: string;
  expiresAtIso: string;
}

export async function pairingCode(projectId: string): Promise<PairingCode> {
  const res = await fetch(`/api/projects/${projectId}/pairing`, {
    method: "POST",
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<PairingCode> & {
    error?: string;
  };
  if (!(res.ok && body.code)) {
    throw new Error(body.error ?? `could not make a code (${res.status})`);
  }
  return { code: body.code, expiresAtIso: body.expiresAtIso ?? "" };
}

/** Retire only the one unclaimed code this dialog was displaying. */
export async function cancelPairingCode(projectId: string, code: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/pairing/cancel`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Could not replace the connection code. Please try again.");
}

export interface Checkpoint {
  id: string;
  label: string;
  createdAt: number;
}

/** Must match the label SessionDO gives it (apps/worker/src/do/session.ts, /studio-tool). */
const STUDIO_CHECKPOINT_LABEL = "before StudPilot Studio changes";

/** The newest checkpoint the Studio agent took before changing the place, or null. */
export async function latestStudioCheckpoint(
  projectId: string
): Promise<Checkpoint | null> {
  const res = await fetch(`/api/projects/${projectId}/checkpoints`, {
    headers: await authHeaders(),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as
    | { checkpoints?: Checkpoint[] }
    | Checkpoint[];
  const list = Array.isArray(body) ? body : (body.checkpoints ?? []);
  return list.find((c) => c.label === STUDIO_CHECKPOINT_LABEL) ?? null;
}

export async function restoreCheckpoint(
  projectId: string,
  checkpointId: string
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/restore`, {
    method: "POST",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: JSON.stringify({ checkpointId }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    error?: string;
  };
  if (!res.ok || body.ok === false) {
    throw new Error(
      body.error ?? `the place could not be put back (${res.status})`
    );
  }
}

export interface Credits {
  /** Renewable allowance left in the current period, in credits. */
  allowance: number;
  /** Purchased, non-expiring credits. */
  purchased: number;
  unmetered: boolean;
}

/** The worker counts in ledger units; this many make one credit (INTERNAL_PER_CREDIT in packages/shared). */
const LEDGER_UNITS_PER_CREDIT = 150;

/** GET /api/me carries the quota. Null when it cannot be read; never a made-up number. */
export async function fetchCredits(): Promise<Credits | null> {
  const res = await fetch("/api/me", { headers: await authHeaders() });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    quota?: {
      allowanceRemaining?: number;
      credits?: number;
      unmetered?: boolean;
    };
  };
  const q = body.quota;
  if (
    typeof q?.allowanceRemaining !== "number" ||
    typeof q.credits !== "number"
  ) {
    return null;
  }
  return {
    allowance: q.allowanceRemaining / LEDGER_UNITS_PER_CREDIT,
    purchased: q.credits / LEDGER_UNITS_PER_CREDIT,
    unmetered: q.unmetered === true,
  };
}
