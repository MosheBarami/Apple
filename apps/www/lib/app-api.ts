// The signed-in app's own calls beyond lib/api.ts: project rename/delete (Supabase, under the "own projects" RLS
// policy), the account and credits view (GET /api/me), Studio disconnect and account export/deletion (worker routes).
import { authHeaders, supabase } from "@/lib/supabase";

export interface AppProject {
  id: string;
  name: string;
  place_name: string | null;
  updated_at: string;
  last_activity_at: string | null;
}

export async function listAppProjects(): Promise<AppProject[]> {
  const { data, error } = await supabase()
    .from("projects")
    .select("id, name, place_name, updated_at, last_activity_at")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []) as AppProject[];
}

export async function renameProject(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 80);
  if (!clean) {
    throw new Error("A project needs a name.");
  }
  const { error } = await supabase()
    .from("projects")
    .update({ name: clean })
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    throw new Error(error.message);
  }
}

/** Removes the project row; its messages and checkpoints go with it (on delete cascade). */
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase()
    .from("projects")
    .delete()
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(15_000));
  if (error) {
    throw new Error(error.message);
  }
}

/** The worker counts in ledger units; this many make one credit (INTERNAL_PER_CREDIT in packages/shared). */
const UNITS = 150;

export interface Account {
  email: string | null;
  plan: string;
  /** All figures in credits. */
  allowance: number;
  purchased: number;
  daily: number;
  monthly: number;
  usedToday: number;
  usedThisMonth: number;
  resetsAtIso: string | null;
  unmetered: boolean;
}

/** GET /api/me. Null when it cannot be read; never a made-up number. */
export async function fetchAccount(): Promise<Account | null> {
  const res = await fetch("/api/me", {
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    return null;
  }
  const body = (await res.json()) as {
    email?: string;
    quota?: Record<string, unknown>;
  };
  const q = body.quota ?? {};
  const n = (k: string) => (typeof q[k] === "number" ? (q[k] as number) / UNITS : null);
  const allowance = n("allowanceRemaining");
  const purchased = n("credits");
  if (allowance === null || purchased === null) {
    return null;
  }
  return {
    allowance,
    daily: n("creditsDaily") ?? 0,
    email: body.email ?? null,
    monthly: n("creditsMonthly") ?? 0,
    plan: typeof q.plan === "string" ? q.plan : "free",
    purchased,
    resetsAtIso: typeof q.resetsAtIso === "string" ? q.resetsAtIso : null,
    unmetered: q.unmetered === true,
    usedThisMonth: n("creditsUsedThisMonth") ?? 0,
    usedToday: n("creditsUsedToday") ?? 0,
  };
}

export async function disconnectStudio(projectId: string): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/studio/disconnect`, {
    method: "POST",
    headers: await authHeaders(),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Studio could not be disconnected (${res.status}).`);
  }
}

export async function exportAccount(): Promise<Blob> {
  const res = await fetch("/api/me/export", { headers: await authHeaders() });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `The export could not be made (${res.status}).`);
  }
  return res.blob();
}

export const DELETE_ACCOUNT_PHRASE = "DELETE MY ACCOUNT";

export async function deleteAccount(): Promise<void> {
  const res = await fetch("/api/me/delete", {
    method: "POST",
    headers: { ...(await authHeaders()), "content-type": "application/json" },
    body: JSON.stringify({ confirm: DELETE_ACCOUNT_PHRASE }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    throw new Error(body.error ?? body.message ?? `The account could not be deleted (${res.status}).`);
  }
}

/** The last request's outcome per project, as this browser saw it (there is no server column for it). */
export type LastOutcome = "finished" | "stopped" | "failed";

const OUTCOME_KEY = "studpilot:last-outcome";

export function readOutcomes(): Record<string, { outcome: LastOutcome; at: number }> {
  try {
    return JSON.parse(localStorage.getItem(OUTCOME_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function writeOutcome(projectId: string, outcome: LastOutcome): void {
  try {
    const all = readOutcomes();
    all[projectId] = { at: Date.now(), outcome };
    localStorage.setItem(OUTCOME_KEY, JSON.stringify(all));
  } catch {
    /* Storage blocked: the dashboard simply shows no status. */
  }
}

/** Numbers people can read: 29.55 -> "29.6", 1250 -> "1,250", 666512.95 -> "667K". */
export function formatCredits(n: number): string {
  if (!Number.isFinite(n)) {
    return "–";
  }
  const abs = Math.abs(n);
  if (abs >= 100_000) {
    return new Intl.NumberFormat("en", { maximumFractionDigits: 1, notation: "compact" }).format(n);
  }
  return new Intl.NumberFormat("en", { maximumFractionDigits: abs >= 100 ? 0 : 1 }).format(n);
}
