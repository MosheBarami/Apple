// Typed fetch helpers for the Apple worker API. All authed calls carry the
// user's Supabase access token as a Bearer header.
import { PRICE_CURRENCY, type RobloxScope, type AssetSourcePolicy } from '@golem/shared';
import type { CheckpointMeta, MessageDto, PairingCodeDto, QuotaState, PlanId } from '@golem/shared';
import type { MilestoneBrief, NextResponse, RoadmapResponse } from '../components/roadmap/model';
import type { AttributionResponse } from '../components/ws/credits-model';
import type { FilesResponse, FileVersion } from '../components/ws/files-model';
import { mockBrief, mockNext, mockRoadmap } from '../components/roadmap/mock';
import { MOCK_MODE, mockAttribution, mockCounters, mockMe, mockMemory, mockSpend, mockUsageDays } from './mock';
import type { BillingChange, SubscriptionView } from './billing-copy';
import { getAccessToken } from './supabase';
import { noteReachability } from './connectivity';
import type { SearchType } from './search-filters';

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init: RequestInit = {}, extraHeaders: Record<string, string> = {}): Promise<T> {
  const token = await getAccessToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers });
  } catch {
    // THE ONLY PLACE THAT KNOWS THE REQUEST NEVER LEFT. lib/connectivity.ts reads `navigator.onLine`
    // in one direction only and takes the other direction from here — see the banner's comment for
    // why the browser's own opinion is not enough.
    noteReachability(false);
    throw new ApiError('Network error — check your connection.', 0);
  }
  // A 500 is the worker telling us it is there, so ANY answer clears a connection warning.
  noteReachability(true);
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) {
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

// ---------------------------------------------------------------- me / usage

export interface MeResponse {
  userId: string;
  email: string | null;
  profile: { id: string; plan: string; is_admin: boolean; display_name: string | null } | null;
  quota: QuotaState;
  /**
   * The SUBSCRIPTION, which is not the same thing as `quota.plan`.
   *
   * `quota.plan` says what may be spent today. It cannot say when the plan renews, that it cancels
   * at the end of the period, that a renewal failed and is being retried, or that a payment is
   * waiting on a card authentication. All four arrive on the same Stripe event, and all four used
   * to be discarded by the webhook. Optional because an older worker will not send it.
   */
  billing?: SubscriptionView;
}

export interface UsageDay {
  day: string; // YYYY-MM-DD
  credits: number;
  events: number;
}

export const fetchMe = (): Promise<MeResponse> =>
  MOCK_MODE ? Promise.resolve(mockMe) : request<MeResponse>('/api/me');

export const fetchUsage = (): Promise<{ days: UsageDay[] }> =>
  MOCK_MODE ? Promise.resolve({ days: mockUsageDays() }) : request<{ days: UsageDay[] }>('/api/me/usage');

// ---------------------------------------------------------------- billing (w14)
//
// Both of these return a URL to Stripe's own hosted page and nothing else. Neither changes a plan:
// entitlement is recomputed by the webhook from the subscription events that follow, so coming back
// from Stripe means "refetch and see", not "you are on Pro now".

export interface BillingConfig {
  /** False on a deployment with no Stripe key — the ladder then says so instead of offering a button. */
  checkout: boolean;
  /** The tiers this deployment has a configured price for. */
  purchasable: PlanId[];
  /** ISO 4217 code this deployment actually charges in. Optional: an older worker does not send it. */
  currency?: string;
}

export const fetchBillingConfig = (): Promise<BillingConfig> =>
  MOCK_MODE
    ? Promise.resolve({ checkout: true, purchasable: ['builder', 'studio'] as PlanId[], currency: PRICE_CURRENCY })
    : request<BillingConfig>('/api/billing/config');

export const startCheckout = (plan: PlanId): Promise<{ url: string }> =>
  request<{ url: string }>('/api/billing/checkout', { method: 'POST', body: JSON.stringify({ plan }) });

export const openBillingPortal = (): Promise<{ url: string }> =>
  request<{ url: string }>('/api/billing/portal', { method: 'POST' });

/**
 * What has happened to this account's billing, newest first.
 *
 * The plan used to be overwritten in place, so an account's history was whatever its current row
 * happened to be. QuotaDO records each change now, and this is where the person it is about reads
 * it. Scoped to the caller by the worker — there is no id in this path that could name anyone else.
 */
export const fetchBillingHistory = (): Promise<{ events: BillingChange[] }> =>
  MOCK_MODE ? Promise.resolve({ events: [] }) : request<{ events: BillingChange[] }>('/api/billing/history');

// ---------------------------------------------------------------- project session

// There is deliberately NO fetch for the model/provider roster here. Which
// foundation model serves a request is chosen by the routing layer, not by the
// user, so the product UI has nothing to render it with. The worker still
// exposes that roster for ADMIN diagnostics; if it is ever needed on screen it
// belongs behind /admin, never in the normal product surface.

export const fetchMessages = (projectId: string, limit = 100) =>
  request<{ messages: MessageDto[] }>(`/api/projects/${encodeURIComponent(projectId)}/messages?limit=${limit}`);

export interface SearchHit {
  id: string;
  type: SearchType;
  /** 'you' | 'apple' | 'system' — the dimension the panel filters on. */
  author: string;
  /** A checkpoint's label, a tool's name. Null for records that have no name of their own. */
  title: string | null;
  createdAt: string;
  snippet: string;
  /** Offset of the match INSIDE `snippet`, already adjusted for any leading ellipsis. */
  matchStart: number;
  matchLength: number;
  occurrences: number;
  /** Which field the snippet was cut from, so the panel marks the line the match is actually in. */
  matchedIn: 'title' | 'body';
  /** Relevance. Ordering is by this, never by time — see apps/worker/src/search.ts. */
  score: number;
  /** Present on records anchored to a message, so the workspace can jump to it. */
  messageId?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchHit[];
  /** How many matched per type, with every filter applied EXCEPT the type filter. */
  counts: Record<SearchType, number>;
  /** How many matched under the full filter, before the cap. */
  total: number;
  /** True when the cap cut the list — there are more matches than these. */
  more: boolean;
  tooShort?: boolean;
  /**
   * True when the filters as sent can match nothing — a date that could not be read, or a type
   * spelled wrongly. The panel says which value, because the alternative is a blank result list
   * the user reads as "there is nothing here".
   */
  impossible?: boolean;
  /** Filter values the server could not use, as `name:value`. */
  ignored: string[];
  /** What the server actually applied, which is the only version worth rendering. */
  applied: { types: SearchType[]; authors: string[]; from: number | null; to: number | null };
  scanned: number;
  /** True when a scan hit its row cap: there may be matches nobody looked at. */
  scanTruncated: boolean;
}

/**
 * Search one project — its messages, artifacts, checkpoints, activity and memory.
 *
 * Server-side deliberately: `fetchMessages` only pages the most recent hundred into the client, so
 * a filter over that would answer "not found" for text that is in the conversation. The filters
 * travel as a query string built by `lib/search-filters.ts`, whose spellings are held against the
 * worker's parser in apps/web/tests/search-filters.test.mjs.
 */
export const searchProject = (projectId: string, params: URLSearchParams): Promise<SearchResponse> =>
  request<SearchResponse>(`/api/projects/${encodeURIComponent(projectId)}/search?${params.toString()}`);

// ------------------------------------------------------------------- memory

/** The shape the worker stores and the panel edits. Mirrors apps/worker/src/memory.ts. */
export interface Memory {
  summary: string | null;
  facts: string[];
}

export interface MemoryResponse {
  memory: Memory;
  /** ISO timestamp of the last human correction, or null if only the model has written it. */
  editedAt: string | null;
}

/**
 * What Apple actually believes about this project.
 *
 * Read from the Durable Object rather than from the `projects.memory_summary` column the dashboard
 * uses. That column is a MIRROR, written best-effort at the tail of a run, so it lags — a viewer
 * showing it would be telling the user something the agent is not using. It also carries only the
 * summary, never the facts, which are the part most likely to be wrong in a way that matters.
 */
export const fetchMemory = (projectId: string): Promise<MemoryResponse> =>
  MOCK_MODE
    ? Promise.resolve(mockMemory)
    : request<MemoryResponse>(`/api/projects/${encodeURIComponent(projectId)}/memory`);

/**
 * Replace what Apple believes about this project.
 *
 * The WHOLE memory is sent, not a patch. Facts are free-text strings a model rewrites every few
 * turns, so client and server would need a shared notion of identity for them and would not agree
 * for long. The server normalises what it receives — trimming, deduplicating, capping — and returns
 * what it actually stored, which is what the panel then shows: a caller that kept its own copy
 * would display a fact the agent will never read.
 */
export const saveMemory = (projectId: string, memory: Memory): Promise<MemoryResponse> =>
  MOCK_MODE
    ? Promise.resolve({ memory, editedAt: new Date().toISOString() })
    : request<MemoryResponse>(`/api/projects/${encodeURIComponent(projectId)}/memory`, {
        method: 'PUT',
        body: JSON.stringify({ memory }),
      });

// -------------------------------------------------------- scoped memory & preferences

/** Mirrors apps/worker/src/memory-store.ts. `org` < `user` < `project` — later wins. */
export type MemoryScope = 'org' | 'user' | 'project';
export type MemoryKind = 'fact' | 'instruction' | 'preference' | 'profile';

export interface MemoryEntry {
  scope: MemoryScope;
  scopeId: string;
  key: string;
  kind: MemoryKind;
  value: string;
  source: 'user' | 'model' | 'import';
  createdAt: string;
  updatedAt: string;
  /** null means "until someone deletes it". */
  expiresAt: string | null;
  updatedBy: string;
}

export type CodingStyle = 'idiomatic' | 'minimal' | 'commented' | 'strict-typed' | 'oop' | 'functional';
export type ResponseLength = 'brief' | 'normal' | 'detailed';
export type ToolPermission = 'allow' | 'ask' | 'deny';

export interface Preferences {
  coding_style?: CodingStyle;
  roblox_conventions?: string[];
  language?: string;
  model?: string;
  response_length?: ResponseLength;
  tool_permissions?: Record<string, ToolPermission>;
  /** Where a build may take assets from. NARROWS across layers — the server decides, not this. */
  asset_sources?: AssetSourcePolicy;
}

export interface PromptProfile {
  about?: string;
  goals?: string;
  tone?: string;
  experience?: string;
}

export interface ScopeMemoryResponse {
  scope: MemoryScope;
  scopeId: string;
  canWrite: boolean;
  entries: MemoryEntry[];
  preferences: { prefs: Preferences; rejected: { key: string; reason: string }[] };
  profile: PromptProfile;
}

/**
 * What one project's NEXT run will act on, after org, user and project layers are resolved.
 *
 * `shadowedBy` is the part that matters in the UI: a setting overridden at another layer reads as a
 * broken control unless the product says which layer is answering instead. The resolution is done
 * on the server by the same function the agent uses — re-deriving the precedence rule in the
 * browser would be a second implementation of it, and the two would diverge.
 */
export interface PersonalisationResponse {
  preferences: Preferences;
  sources: Partial<Record<keyof Preferences, MemoryScope>>;
  profile: PromptProfile;
  projectInstructions: string[];
  teamInstructions: string[];
  resolved: {
    key: string;
    value: string;
    kind: MemoryKind;
    scope: MemoryScope;
    expiresAt: string | null;
    shadowedBy: { scope: MemoryScope; value: string }[];
  }[];
}

export interface MemoryAuditEntry {
  id: string;
  scope: MemoryScope;
  scopeId: string;
  key: string;
  action: 'put' | 'delete' | 'import' | 'purge';
  actor: string;
  at: string;
  before: string | null;
  after: string | null;
}

export interface MemoryScopesResponse {
  user: { scopeId: string; canWrite: boolean };
  orgs: { scopeId: string; role: string; canWrite: boolean }[];
}

const scopePath = (scope: MemoryScope, scopeId: string) => `/api/memory/${scope}/${encodeURIComponent(scopeId)}`;

export const fetchMemoryScopes = () => request<MemoryScopesResponse>('/api/memory/scopes');

export const fetchScopeMemory = (scope: MemoryScope, scopeId: string) =>
  request<ScopeMemoryResponse>(scopePath(scope, scopeId));

export const fetchPersonalisation = (projectId: string) =>
  request<PersonalisationResponse>(`/api/projects/${encodeURIComponent(projectId)}/personalisation`);

/**
 * Write one entry. `ttlDays` is sent only when it is a real number — the server refuses a
 * non-finite TTL outright, and sending NaN because a text input was empty would turn "no expiry"
 * into a rejected save.
 */
export const saveMemoryEntry = (
  scope: MemoryScope,
  scopeId: string,
  key: string,
  entry: { value: string; kind: MemoryKind; ttlDays?: number },
) =>
  request<{ entry: MemoryEntry }>(`${scopePath(scope, scopeId)}/entries/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: JSON.stringify({
      value: entry.value,
      kind: entry.kind,
      ...(typeof entry.ttlDays === 'number' && Number.isFinite(entry.ttlDays) && entry.ttlDays > 0 ? { ttlDays: entry.ttlDays } : {}),
    }),
  });

export const deleteMemoryEntry = (scope: MemoryScope, scopeId: string, key: string) =>
  request<{ deleted: boolean }>(`${scopePath(scope, scopeId)}/entries/${encodeURIComponent(key)}`, { method: 'DELETE' });

export const savePreferences = (scope: MemoryScope, scopeId: string, preferences: Preferences) =>
  request<{ preferences: Preferences; rejected: { key: string; reason: string }[] }>(`${scopePath(scope, scopeId)}/preferences`, {
    method: 'PUT',
    body: JSON.stringify({ preferences }),
  });

export const savePromptProfile = (userId: string, profile: PromptProfile) =>
  request<{ profile: PromptProfile }>(`/api/memory/user/${encodeURIComponent(userId)}/profile`, {
    method: 'PUT',
    body: JSON.stringify({ profile }),
  });

export const fetchMemoryAudit = (scope: MemoryScope, scopeId: string, limit = 50) =>
  request<{ audit: MemoryAuditEntry[] }>(`${scopePath(scope, scopeId)}/audit?limit=${limit}`);

export const importMemory = (scope: MemoryScope, scopeId: string, bundle: unknown) =>
  request<{ imported: number; rejected: { key: string; reason: string }[] }>(`${scopePath(scope, scopeId)}/import`, {
    method: 'POST',
    body: JSON.stringify(bundle),
  });

/**
 * Download one scope's memory as a file.
 *
 * Not `request<T>`: the filename lives in Content-Disposition, and a plain <a href> cannot carry
 * the Bearer token /api/* requires. Same shape as downloadExport, deliberately.
 */
export async function downloadMemoryExport(scope: MemoryScope, scopeId: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`${scopePath(scope, scopeId)}/export`, { headers });
  if (!res.ok) throw new ApiError(`Could not export memory (${res.status})`, res.status);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const named = /filename="([^"]+)"/.exec(disposition)?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named ?? `apple-memory-${scope}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const fetchCheckpoints = (projectId: string) =>
  request<{ checkpoints: CheckpointMeta[] }>(`/api/projects/${encodeURIComponent(projectId)}/checkpoints`);

export const createPairingCode = (projectId: string): Promise<PairingCodeDto> =>
  MOCK_MODE
    ? Promise.resolve({ code: 'GLM-7F3K2Q', expiresAtIso: new Date(Date.now() + 9 * 60_000).toISOString() })
    : request<PairingCodeDto>(`/api/projects/${encodeURIComponent(projectId)}/pairing`, { method: 'POST' });

/**
 * Download the whole conversation as a file.
 *
 * Not `request<T>` because that parses JSON and throws away the response — and the FILENAME lives
 * in the response, in Content-Disposition. Re-deriving it here from the project name would be a
 * second implementation of the server's slug rule, and the two would disagree the first time
 * either changed. The server names the file; the browser saves what it was given.
 *
 * A plain <a href> cannot be used at all: the route needs a Bearer token, and an anchor sends no
 * headers. So the bytes are fetched and handed to the browser as a blob.
 */
/**
 * Fetch a generated image and hand back an object URL the browser can render.
 *
 * WHY THIS EXISTS AT ALL: a plain <img src="/api/..."> cannot authenticate. /api/* requires a
 * Bearer token, bearerToken() reads only the Authorization header and the WebSocket subprotocol,
 * and an <img> tag sends neither. So the tag would get a 401, fire onError, and render the
 * "no longer available" message — for an image that exists and is a second old. The honest fallback
 * is what would have made it invisible.
 *
 * WHY A BLOB AND NOT A SIGNED URL. A signed URL would let the tag work directly, and it would be a
 * second way to authorise a read: a bearer credential living in a URL, and URLs leak — into logs,
 * referrers, history, and into the transcripts this product renders. One auth mechanism is worth
 * more than a simpler tag, and downloadExport below already established this exact shape for the
 * same reason. The cost is real and accepted: the image does not stream, and the caller must revoke.
 *
 * The caller OWNS the returned URL and must URL.revokeObjectURL it, or the blob is held for the
 * life of the document.
 */
export async function fetchImageObjectUrl(projectId: string, imageId: string): Promise<string> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(
      `/api/projects/${encodeURIComponent(projectId)}/images/${encodeURIComponent(imageId)}`,
      { headers },
    );
  } catch {
    // THE ONLY PLACE THAT KNOWS THE REQUEST NEVER LEFT. lib/connectivity.ts reads `navigator.onLine`
    // in one direction only and takes the other direction from here — see the banner's comment for
    // why the browser's own opinion is not enough.
    noteReachability(false);
    throw new ApiError('Network error — check your connection.', 0);
  }
  noteReachability(true);
  if (!res.ok) {
    // The status is what separates "this expired" from "your session did" from "not yours", and
    // the taxonomy in error-taxonomy.ts is what turns it into something worth reading. Collapsing
    // them here would put the caller back to guessing.
    throw new ApiError(res.status === 404 ? 'image expired or not found' : `image fetch failed (${res.status})`, res.status);
  }
  return URL.createObjectURL(await res.blob());
}

/** Pull the project and image ids back out of a path this app generated, or null. */
export function parseImagePath(src: string): { projectId: string; imageId: string } | null {
  const m = /^\/api\/projects\/([A-Za-z0-9_-]{1,64})\/images\/([0-9a-fA-F-]{36})$/.exec(src);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { projectId: m[1], imageId: m[2] };
}

/**
 * The same, for generated sound — and it is not symmetry for its own sake.
 *
 * `generate_sound` emits an asset_picker whose link is this path, labelled "Listen". That link was
 * rendered as a plain anchor, and every /api/* path needs a Bearer JWT an anchor cannot send, so
 * the click opened a tab holding `{"error":"unauthorized"}` for a sound that existed and worked.
 * An asset link may legitimately point anywhere — a catalogue page, a fragment — so the player is
 * offered only for a path this app generated, and everything else stays the link it was.
 */
export function parseAudioPath(src: string): { projectId: string; audioId: string } | null {
  // The UUID shape rather than 36 loose hex-or-dash characters: the worker's route validates the id
  // with UUID_RE and 404s anything else before it touches KV, so a laxer regex here would only
  // build players that fail for a reason unrelated to the sound.
  const m = /^\/api\/projects\/([A-Za-z0-9_-]{1,64})\/audio\/([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/.exec(src);
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  return { projectId: m[1], audioId: m[2] };
}

/**
 * Fetch generated audio and hand back an object URL an <audio> element can play.
 *
 * fetchImageObjectUrl's reasoning, for the other media type: a bearer credential in a URL is a
 * credential in logs, referrers and history, so there is one auth mechanism and the cost is that
 * the bytes do not stream. Generated sounds are seconds long and already bounded by the worker's
 * one-hour TTL, so that cost is small and the caller owns the revoke.
 */
export async function fetchAudioObjectUrl(projectId: string, audioId: string): Promise<string> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/audio/${encodeURIComponent(audioId)}`, { headers });
  } catch {
    noteReachability(false);
    throw new ApiError('Network error — check your connection.', 0);
  }
  noteReachability(true);
  if (!res.ok) {
    // 404 is a real expiry; 401 is a session that timed out. explainFailure draws that line for the
    // caller, and it can only draw it if the status arrives intact.
    throw new ApiError(res.status === 404 ? 'sound expired or not found' : `sound fetch failed (${res.status})`, res.status);
  }
  return URL.createObjectURL(await res.blob());
}

/**
 * Save a generated sound to disk.
 *
 * `?download=1` is the worker's own attachment branch, which builds the filename from the id and
 * the served content type — never from anything stored. Naming the file here instead would be a
 * second rule for what a generated sound is called, and the two would disagree the first time
 * either changed.
 */
export async function downloadProjectAudio(projectId: string, audioId: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/audio/${encodeURIComponent(audioId)}?download=1`,
    { headers },
  );
  if (!res.ok) throw new ApiError(`Could not download that sound (${res.status})`, res.status);
  const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = named ?? `sound-${audioId}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Next frame rather than immediately, for downloadExport's reason: a synchronous revoke can race
  // the browser's own read of the blob and save a zero-byte file.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/** What a finished export was, so the caller can name the file rather than guess at it. */
export interface ExportSaved {
  filename: string;
  bytes: number;
  /** True only when the worker sent a digest AND it matched. False means unchecked, never "bad". */
  verified: boolean;
}

/**
 * Save the conversation, watching it arrive and checking what arrived.
 *
 * TWO THINGS THIS DOES THAT `res.blob()` CANNOT.
 *
 *   IT CAN BE WATCHED. A single await produces one event — "done" — so the UI's only honest state
 *   was "Preparing…", indefinitely, whether the transfer was moving or dead. The reader loop
 *   reports bytes as they land, with the server's declared total when there is one and `null` when
 *   there is not: a missing Content-Length must reach the caller as an ABSENCE, because the moment
 *   it becomes 0 somebody divides by it.
 *
 *   IT IS CHECKED. The worker sends X-Golem-Export-SHA256 over the bytes it actually wrote, and a
 *   truncated transfer is otherwise undetectable — a Markdown file that ends mid-sentence and a
 *   JSON file that will not parse both save silently. The digest is recomputed over what was
 *   received and the file is saved ONLY if it matches, because a half file on disk under a
 *   plausible name is worse than no file: it looks like the export, and it gets kept.
 *
 * A response with no digest header saves anyway and reports `verified: false`. An older worker is
 * the normal case during a deploy, and refusing to save then would turn a rollout into an outage.
 */
export async function downloadExport(
  projectId: string,
  format: 'md' | 'json',
  onProgress?: (p: { received: number; total: number | null }) => void,
): Promise<ExportSaved> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/export?format=${format}`, { headers });
  } catch {
    // THE ONLY PLACE THAT KNOWS THE REQUEST NEVER LEFT. lib/connectivity.ts reads `navigator.onLine`
    // in one direction only and takes the other direction from here — see the banner's comment for
    // why the browser's own opinion is not enough.
    noteReachability(false);
    throw new ApiError('Network error — check your connection.', 0);
  }
  noteReachability(true);
  if (!res.ok) {
    // The error body IS JSON even though the success body is not.
    const body = await res.json().catch(() => null);
    const msg =
      body && typeof body === 'object' && 'error' in body && typeof (body as { error: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `Export failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }

  const declaredLength = Number(res.headers.get('Content-Length'));
  const total = Number.isFinite(declaredLength) && declaredLength > 0 ? declaredLength : null;
  const declaredDigest = (res.headers.get('X-Golem-Export-SHA256') ?? '').trim().toLowerCase();

  const chunks: Uint8Array[] = [];
  let received = 0;
  const reader = res.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      received += value.byteLength;
      onProgress?.({ received, total });
    }
  } else {
    // No readable body — a response double, or an engine that does not expose one. The file still
    // has to save; what is lost is the watching, and that is reported as one final event rather
    // than as silence.
    const whole = new Uint8Array(await res.arrayBuffer());
    chunks.push(whole);
    received = whole.byteLength;
    onProgress?.({ received, total });
  }

  const bytes = new Uint8Array(received);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }

  let verified = false;
  if (declaredDigest) {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    if (hex !== declaredDigest) {
      // Named as a broken TRANSFER. "Export failed" would send the user to look at their project.
      throw new ApiError('That export arrived incomplete and was not saved — try again.', 0);
    }
    verified = true;
  }

  const filename = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `project-export.${format}`;
  const type = format === 'md' ? 'text/markdown;charset=utf-8' : 'application/json;charset=utf-8';
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next frame rather than immediately: a synchronous revoke can race the browser's
  // own read of the blob and produce a zero-byte file on some engines.
  requestAnimationFrame(() => URL.revokeObjectURL(url));
  return { filename, bytes: received, verified };
}

export const purgeProject = (projectId: string) =>
  request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/purge`, { method: 'POST' });

// ---------------------------------------------------------------- members and access
//
// The collaboration routes live under /api/shared/:id rather than /api/projects/:id, and the
// difference is the whole point: /api/projects gates on `getOwnedProject`, which answers only for
// the owner, while /api/shared resolves a ROLE and names the action each route performs. An owner
// is a member of their own project through `projects.owner_id`, so every call here works for them
// too — there is no separate owner path to keep in step.

/** What `/api/shared/:id` answers: who you are here and what that lets you do. */
export interface ProjectAccessResponse {
  project: { id: string; name: string; ownerId: string };
  role: string;
  capabilities: string[];
}

export const fetchProjectAccess = (projectId: string): Promise<ProjectAccessResponse> =>
  request<ProjectAccessResponse>(`/api/shared/${encodeURIComponent(projectId)}`);

/** One row of the roster. Mirrors RosterEntry in apps/worker/src/membership.ts. */
export interface MemberRow {
  userId: string;
  handle: string;
  /** The role the row CARRIES, live or not — "was an editor" is a sentence an admin needs. */
  role: string | null;
  displayName: string | null;
  status: 'active' | 'expired' | 'revoked' | 'suspended';
  origin: 'owner' | 'invite' | 'link';
  guest: boolean;
  invitedBy: string | null;
  invitedAt: string | null;
  acceptedAt: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
  suspendedAt: string | null;
  suspendedReason: string | null;
  suspendedBy: string | null;
}

export interface MembersResponse {
  members: MemberRow[];
  /** Every row that exists, whatever the filter — so "0 of 12" is sayable. */
  total: number;
  /** Rows the filter admitted, before the page window. */
  matched: number;
  more: boolean;
  limit: number;
  offset: number;
  filters: { q: string | null; role: string | null; status: string; origin: string | null };
  /** True when the link-derived grants could not all be read: a short list, said out loud. */
  partial?: boolean;
  incomplete?: string[];
}

export const fetchMembers = (projectId: string, params: URLSearchParams): Promise<MembersResponse> =>
  request<MembersResponse>(`/api/shared/${encodeURIComponent(projectId)}/members?${params.toString()}`);

/**
 * Invite someone, or change what an existing member may do.
 *
 * ONE ROUTE FOR BOTH, because it is one row: the insert merges on (project_id, user_id), so a
 * second call with a different role is the role change. The server names the event it turns out to
 * be — invited, role_changed, renewed, reactivated — and returns it.
 */
export const inviteMember = (
  projectId: string,
  body: { userId: string; role: string; expiresAt?: string | null },
): Promise<{ ok: boolean; userId: string; role: string; event: string }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members`, { method: 'POST', body: JSON.stringify(body) });

/** Revoked, not deleted: "this access ended" is a fact worth keeping. */
export const removeMember = (projectId: string, userId: string): Promise<{ ok: boolean }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

/** Paused, which is a different state from removed — and re-admission is one click rather than a re-invitation. */
export const suspendMember = (projectId: string, userId: string, reason: string): Promise<{ ok: boolean }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

export const reactivateMember = (projectId: string, userId: string): Promise<{ ok: boolean }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
  });

// ---------------------------------------------------------------- roadmap

// The wire shapes live in components/roadmap/model.ts and are imported here as
// types only, so this layer gains no runtime dependency on a component. That
// module is also what `node --test` loads, which is why the types and the
// layout that consumes them are written in one place: a field renamed on the
// worker is renamed once, there, and every call below still typechecks against
// the same definition the tests pin.
//
// All three routes read the roadmap FROM THE PROJECT and therefore need the
// Studio plugin attached. With no place to inspect the worker returns 409 with
// the reason rather than a generic template, so callers should surface
// `ApiError.status === 409` as an explanation, not as a failure.

export const fetchRoadmap = (projectId: string, polish = false): Promise<RoadmapResponse> =>
  MOCK_MODE
    ? mockRoadmap(polish)
    : request<RoadmapResponse>(
        `/api/projects/${encodeURIComponent(projectId)}/roadmap${polish ? '?polish=1' : ''}`,
      );

/**
 * What this project owes and whether it can ship. Both reports come from one request
 * because they read the same asset set and must not be able to disagree.
 */
export const fetchAttribution = (projectId: string): Promise<AttributionResponse> =>
  MOCK_MODE
    ? mockAttribution()
    : request<AttributionResponse>(`/api/projects/${encodeURIComponent(projectId)}/attribution`);

/** §32: the small contextual set on its own, without the whole timeline. */
export const fetchNextMilestones = (projectId: string): Promise<NextResponse> =>
  MOCK_MODE
    ? mockNext()
    : request<NextResponse>(`/api/projects/${encodeURIComponent(projectId)}/roadmap/next`);

/**
 * §33: turn one milestone into something a run can execute.
 *
 * Only the id crosses the wire. The worker rebuilds the brief from a fresh
 * scan precisely so that a client cannot hand the builder arbitrary
 * instructions wearing Apple's own roadmap as a disguise.
 */
export const fetchMilestoneBrief = (projectId: string, milestoneId: string): Promise<MilestoneBrief> =>
  MOCK_MODE
    ? mockBrief(milestoneId)
    : request<MilestoneBrief>(`/api/projects/${encodeURIComponent(projectId)}/roadmap/brief`, {
        method: 'POST',
        body: JSON.stringify({ milestoneId }),
      });

// ---------------------------------------------------------------- admin (X-Admin-Key)

export interface AdminCounterRow {
  day: string;
  key: string;
  value: number;
}

export const adminStats = (adminKey: string): Promise<{ counters: AdminCounterRow[] }> =>
  MOCK_MODE
    ? Promise.resolve({ counters: mockCounters() })
    : request<{ counters: AdminCounterRow[] }>('/api/admin/stats', {}, { 'X-Admin-Key': adminKey });

export interface SpendReport {
  state: {
    day: string;
    month: string;
    dayNeurons: number;
    dayPending: number;
    monthBillableNeurons: number;
    killed: boolean;
    killedReason: string | null;
    dayRemainingFraction: number;
    estimatedMonthUsd: number;
    freeRemainingToday: number;
  };
  limits: {
    freeNeuronsPerDay: number;
    billableNeuronsPerDay: number;
    billableNeuronsPerMonth: number;
    maxNeuronsPerRequest: number;
  };
  maxMonthlyUsd: number;
  days: { day: string; neurons: number; calls: number; billableNeurons: number; billableUsd: number }[];
  breakdown: { day: string; model: string; kind: string; neurons: number; calls: number; usd: number }[];
}

export const adminSpend = (adminKey: string): Promise<SpendReport> =>
  MOCK_MODE
    ? Promise.resolve(mockSpend() as SpendReport)
    : request<SpendReport>('/api/admin/spend', {}, { 'X-Admin-Key': adminKey });

export const adminKillSwitch = (adminKey: string, killed: boolean, reason?: string) =>
  request<{ ok: boolean; killed: boolean }>(
    '/api/admin/kill-switch',
    { method: 'POST', body: JSON.stringify({ killed, reason }) },
    { 'X-Admin-Key': adminKey },
  );

export const adminSpendLimits = (adminKey: string, limits: Record<string, number>) =>
  request<{ ok: boolean; limits: Record<string, number> }>(
    '/api/admin/spend-limits',
    { method: 'POST', body: JSON.stringify(limits) },
    { 'X-Admin-Key': adminKey },
  );

export interface ModelTestResponse {
  ok: boolean;
  ms: number;
  text?: string;
  toolCalls?: { id: string; name: string; arguments: string }[];
  usage?: { inputTokens: number; outputTokens: number };
  provider?: string;
  model?: string;
  finishReason?: string;
  error?: string;
}

export const adminModelTest = (adminKey: string, body: { model: string; prompt: string; tools?: boolean }) =>
  request<ModelTestResponse>(
    '/api/admin/model-test',
    { method: 'POST', body: JSON.stringify(body) },
    { 'X-Admin-Key': adminKey },
  );

export interface RagHit {
  title: string;
  url: string;
  score: number;
  preview: string;
}

export const adminRagTest = (adminKey: string, query: string) =>
  request<{ hits: RagHit[] }>('/api/admin/rag-test', { method: 'POST', body: JSON.stringify({ query }) }, { 'X-Admin-Key': adminKey });

// ---------------------------------------------------------------- project files
//
// The workspace Apple writes into, from the browser. `request<T>` for everything except the
// download, which needs the response rather than its JSON — the same split, and the same reason, as
// downloadExport above.

export const fetchProjectFiles = (projectId: string, prefix = '') =>
  request<FilesResponse>(
    `/api/projects/${encodeURIComponent(projectId)}/files${prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''}`,
  );

export const fetchProjectFile = (projectId: string, path: string, version?: number) =>
  request<{ path: string; version: number; bytes: number; savedAt: number; content: string }>(
    `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}` +
      (version === undefined ? '' : `&version=${version}`),
  );

export const fetchFileHistory = (projectId: string, path: string) =>
  request<{ path: string; versions: FileVersion[]; deleted: boolean }>(
    `/api/projects/${encodeURIComponent(projectId)}/files/history?path=${encodeURIComponent(path)}`,
  );

export interface FileOpRequest {
  // The folder operations take a PREFIX in `path` rather than a file, and are named separately for
  // that reason: one op that guessed from the shape of the string would delete a whole folder for
  // anyone who typed a path without an extension.
  op: 'rename' | 'move' | 'copy' | 'delete' | 'undelete' | 'revert' | 'move_folder' | 'delete_folder';
  path: string;
  to?: string;
  version?: number;
}

/**
 * Perform one file operation.
 *
 * The REFUSAL is what this signature is shaped around. `request<T>` throws an ApiError carrying the
 * worker's sentence, and the worker also sends a machine-readable `code` — which `request` drops.
 * So this reads the response itself on the failure path, and hands the caller both, because
 * `files-model.refusalCopy` translates by code and matching on prose would break the first time
 * either side reworded a sentence.
 */
export async function fileOp(projectId: string, body: FileOpRequest): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; code?: string; error: string }> {
  const token = await getAccessToken();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/op`, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch {
    noteReachability(false);
    return { ok: false, error: 'Network error — check your connection.' };
  }
  noteReachability(true);
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    return {
      ok: false,
      code: typeof parsed?.code === 'string' ? parsed.code : undefined,
      error: typeof parsed?.error === 'string' ? parsed.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, result: parsed ?? {} };
}

/**
 * Put a text file into the project workspace.
 *
 * Shaped like `fileOp` rather than like `request<T>`, and for the same reason: the worker sends a
 * machine-readable `code` with every refusal and `request` drops it, so the panel would be left
 * matching on prose to tell "that name is taken" from "that is not a workspace file type".
 *
 * `overwrite` is never sent on the first attempt. An occupied path comes back as a refusal the user
 * answers, so replacing the plan Apple wrote is always something they chose.
 */
export async function uploadProjectFile(
  projectId: string,
  path: string,
  content: string,
  opts: { overwrite?: boolean } = {},
): Promise<{ ok: true; result: Record<string, unknown> } | { ok: false; code?: string; error: string }> {
  const token = await getAccessToken();
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let res: Response;
  try {
    res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/content`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ path, content, ...(opts.overwrite ? { overwrite: true } : {}) }),
    });
  } catch {
    noteReachability(false);
    return { ok: false, error: 'Network error — check your connection.' };
  }
  noteReachability(true);
  const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    return {
      ok: false,
      code: typeof parsed?.code === 'string' ? parsed.code : undefined,
      error: typeof parsed?.error === 'string' ? parsed.error : `Request failed (${res.status})`,
    };
  }
  return { ok: true, result: parsed ?? {} };
}

/**
 * Save the whole workspace as one ZIP.
 *
 * Same shape as downloadProjectFile — the route needs a Bearer token, an <a href> sends none, so
 * the bytes are fetched and handed over as a blob, and the SERVER names the file. It is also the
 * one download here that can legitimately be empty-handed: a project with no files is answered with
 * a sentence rather than with a zip of nothing, and that arrives as an ApiError like any refusal.
 */
export async function downloadProjectArchive(projectId: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/files/archive`, { headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
    throw new ApiError(typeof body?.error === 'string' ? body.error : `Could not download those files (${res.status})`, res.status);
  }
  const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement('a');
  a.href = url;
  a.download = named ?? 'project-files.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Save one workspace file to disk.
 *
 * Same shape as downloadExport: the server names the file in Content-Disposition, an <a href>
 * cannot carry the Bearer token /api/* requires, so the bytes are fetched and handed over as a blob.
 */
export async function downloadProjectFile(projectId: string, path: string): Promise<void> {
  const token = await getAccessToken();
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(
    `/api/projects/${encodeURIComponent(projectId)}/files/content?path=${encodeURIComponent(path)}&download=1`,
    { headers },
  );
  if (!res.ok) throw new ApiError(`Could not download that file (${res.status})`, res.status);
  const named = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1];
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = named ?? path.slice(path.lastIndexOf('/') + 1);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------- the customer's own Roblox key

export interface StoredRobloxKey {
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  scopes: RobloxScope[];
  fingerprint: string;
  hint: string;
  createdAt: string;
  lastUsedAt: string | null;
}

/**
 * Connect, inspect and disconnect the customer's own Roblox Open Cloud key.
 *
 * NOTHING HERE RETURNS THE KEY. The PUT sends one and gets back a description; the GET never had
 * it. That is a property of the server, and it is restated here so nobody adds a `fetchRobloxKey`
 * that reads a secret into the browser because the type looked like it should.
 */
export const fetchRobloxKey = (): Promise<{ credential: StoredRobloxKey | null }> =>
  request('/api/me/roblox-key');

export const putRobloxKey = (body: {
  apiKey: string;
  robloxCreatorId: string;
  creatorType: 'user' | 'group';
  scopes: RobloxScope[];
}): Promise<{ credential: StoredRobloxKey }> =>
  request('/api/me/roblox-key', { method: 'PUT', body: JSON.stringify(body) });

export const deleteRobloxKey = (): Promise<{ removed: boolean }> =>
  request('/api/me/roblox-key', { method: 'DELETE' });
