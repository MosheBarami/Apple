// The few product calls the chat makes outside the agent: the chat list (Supabase, under RLS) and the worker's own
// routes for the Studio connection, undo and credits. The worker routes are same-origin (see lib/proxy.ts).
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
  place?: { placeName?: string } | null;
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

export interface StudioCandidate {
  pickId: string;
  placeName: string;
  placeId: number;
}

/** What one Connect press found: bound, several waiting Studios to choose from, or none yet. */
export type ConnectResult =
  | { status: "connected"; placeName: string }
  | { status: "choose"; candidates: StudioCandidate[] }
  | { status: "waiting" };

/** Bind this project to the Roblox Studio waiting with the StudPilot plugin (no code). `pickId` answers a choice. */
export async function connectStudio(projectId: string, pickId?: string): Promise<ConnectResult> {
  const res = await fetch(`/api/projects/${projectId}/connect`, {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify(pickId ? { pickId } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<ConnectResult> & { error?: string };
  if (!res.ok || !body.status) {
    throw new Error(body.error ?? `could not connect (${res.status})`);
  }
  return body as ConnectResult;
}

/** Whether a Roblox account is linked to this StudPilot account (Connect matches the Studio signed into it). */
export async function robloxLink(): Promise<{ linked: boolean; username: string | null } | null> {
  const res = await fetch("/api/roblox/link", { headers: await authHeaders(), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as { linked: boolean; username: string | null };
}

/** Where to send the browser to link a Roblox account; it comes back to `returnTo` with ?roblox=linked. */
export async function robloxLinkUrl(returnTo: string): Promise<string> {
  const res = await fetch("/api/roblox/link-ticket", {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ returnTo }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !body.url) throw new Error("Could not start linking your Roblox account. Please try again.");
  return body.url;
}

/** Disconnect Studio from this project; it will not reconnect by itself until Connect is pressed again. */
export async function disconnectStudio(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/studio/disconnect`, {
    method: "POST",
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error("Could not disconnect Studio. Please try again.");
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

/** Whether Roblox uploads are connected (make_image puts drawn art into the person's own Roblox account with it). */
export async function robloxUploads(): Promise<{ connected: boolean; username: string | null } | null> {
  const res = await fetch("/api/roblox/uploads", { headers: await authHeaders(), signal: AbortSignal.timeout(15_000) }).catch(() => null);
  if (!res?.ok) return null;
  return (await res.json()) as { connected: boolean; username: string | null };
}

/** Where to send the browser to allow uploads with Roblox; it comes back to `returnTo` with ?roblox=uploads. */
export async function robloxUploadsUrl(returnTo: string): Promise<string> {
  const res = await fetch("/api/roblox/link-ticket", {
    method: "POST",
    headers: { ...(await authHeaders()), "Content-Type": "application/json" },
    body: JSON.stringify({ returnTo, uploads: true }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !body.url) throw new Error("Could not open Roblox. Please try again.");
  return body.url;
}
