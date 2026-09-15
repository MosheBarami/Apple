// Typed fetch helpers for the Apple worker API. All authed calls carry the
// user's Supabase access token as a Bearer header.
import { PRICE_CURRENCY, type RobloxScope, type AssetSourcePolicy } from '@golem/shared';
import type { CheckpointMeta, MessageDto, MessageRevisionDto, PairingCodeDto, QuotaState, PlanId, StudioLinkSummary } from '@golem/shared';
import type { MilestoneBrief, NextResponse, RoadmapResponse } from '../components/roadmap/model';
import type { AttributionResponse } from '../components/ws/credits-model';
import type { FilesResponse, FileVersion } from '../components/ws/files-model';
import type { OpLogRow } from '../components/ws/op-vocabulary';
import { mockBrief, mockNext, mockRoadmap } from '../components/roadmap/mock';
import { MOCK_MODE, mockAttribution, mockCounters, mockDiagnostics, mockMe, mockMemory, mockNotifications, mockSpend, mockUsageDays } from './mock';
import type { InboxResponse, MarkReadResult } from './notification-inbox.ts';
import type { DeliveryPreference, NotificationEventPrefs } from './notification-prefs.ts';
import type { BillingChange, SubscriptionView } from './billing-copy';
import { getAccessToken } from './supabase';
import { noteReachability } from './connectivity';
import type { SearchType } from './search-filters';

export class ApiError extends Error {
  status: number;
  /**
   * The parsed body, when there was one.
   *
   * Some refusals are ANSWERS. The bulk-invite route replies 400 with the full per-row `rejected`
   * list — which index failed and why — and collapsing that to the single word in `error` throws
   * away the only part the person can act on. Optional, so every existing `new ApiError(msg,
   * status)` is unchanged and no caller is obliged to look.
   */
  body: unknown;
  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.status = status;
    this.body = body;
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
    // The parsed body rides along. Most callers want only `message`; the bulk-invite form needs
    // the per-row `rejected` list, which arrives on a 400 when every row was refused — and that
    // list is the only part of the refusal the person can act on.
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

// ---------------------------------------------------------------- notifications
//
// The worker has served an inbox, an unread count, a collapsed view and a mark-read write for a
// while, and nothing in this app ever called any of it — so a person who closed the tab never
// learned their build had failed, which is the hole the whole subsystem was written to close.
//
// `items`, `unread` and `groups` arrive on ONE response deliberately. The worker's own comment on
// the route explains why: two requests would be two reads at two instants, and the number under
// the heading would disagree with the list under it. So there is no separate groups fetcher here,
// and tests/notification-inbox.test.mjs fails if the component grows one.

export const fetchNotifications = (unreadOnly = false): Promise<InboxResponse> =>
  MOCK_MODE
    ? Promise.resolve(mockNotifications())
    : request<InboxResponse>(unreadOnly ? '/api/notifications?unread=true' : '/api/notifications');

/**
 * Mark rows read — specific ids, or everything that has been delivered.
 *
 * The response carries `unread` as well as `marked` precisely so the badge can be updated from the
 * write instead of a refetch. Use the number it returns: `all: true` does NOT mark a row that
 * quiet hours is still holding, so the answer to "mark everything" is often not zero.
 */
export const markNotificationsRead = (body: { ids?: string[]; all?: boolean }): Promise<MarkReadResult> =>
  MOCK_MODE
    ? Promise.resolve({ marked: body.all ? 2 : (body.ids?.length ?? 0), unread: 0 })
    : request<MarkReadResult>('/api/notifications/read', { method: 'POST', body: JSON.stringify(body) });

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
 * What moving to `plan` would cost this account right now.
 *
 * READ-ONLY. It asks Stripe a question; it does not buy anything, and the change is still made in
 * the portal. It REJECTS rather than resolving to a zero when there is nothing to price against or
 * Stripe cannot answer — the caller has to say the amount is unknown, because it is. A resolved
 * zero would be the page telling someone a charge costs nothing on the strength of a failed fetch.
 */
export interface BillingPreview {
  /** Major units, already converted by the worker. Negative when the change leaves a credit. */
  amountDue: number;
  currency: string;
  /** Unix SECONDS, Stripe's clock. */
  prorationDate: number | null;
  lines: { description: string; amount: number }[];
}

export const fetchBillingPreview = (plan: PlanId): Promise<BillingPreview> =>
  request<BillingPreview>(`/api/billing/preview?plan=${encodeURIComponent(plan)}`);

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

/**
 * The transcript — asked as a MEMBER, not as the owner.
 *
 * This used to request /api/projects/:id/messages, which `withOwnedProject` gates owner-only. A
 * collaborator opening a shared project therefore loaded an EMPTY conversation and saw only
 * whatever arrived live over the socket afterwards: the whole history of the project they had just
 * been invited into was a 404 the client rendered as "no messages". /api/shared/:id/messages
 * proxies the same Durable Object read and gates on `read`, which the owner passes too — so there
 * is no separate owner path to keep in step, and there is exactly one way the app reads a
 * transcript.
 */
export const fetchMessages = (projectId: string, limit = 100) =>
  request<{ messages: MessageDto[] }>(`/api/shared/${encodeURIComponent(projectId)}/messages?limit=${limit}`);

/**
 * The earlier versions of one message the user edited.
 *
 * Fetched on demand rather than with the transcript: a long conversation of rewritten prompts would
 * otherwise carry every draft of every message on every load, to draw a panel almost nobody opens.
 * The COUNT comes with the transcript, which is all the conversation needs to know whether to offer
 * the panel at all. Same shared path as the transcript itself, gated on `read`, so a collaborator
 * who can see a message can see how it got there.
 */
export const fetchMessageRevisions = (projectId: string, messageId: string) =>
  request<{ revisions: MessageRevisionDto[] }>(
    `/api/shared/${encodeURIComponent(projectId)}/messages/${encodeURIComponent(messageId)}/revisions`,
  );

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
  /**
   * When a notification is allowed to arrive: the zone, the quiet window, the digest.
   *
   * WHOLESALE across layers, unlike the one below. Half of one person's window and half of
   * another's is a window nobody set — see apps/worker/src/preferences.ts.
   */
  notify_delivery?: DeliveryPreference;
  /**
   * Which kinds to hear about at all. MERGES PER ENTRY across org, account and project, so a
   * project can mute one kind without un-muting everything the person silenced account-wide.
   */
  notify_events?: NotificationEventPrefs;
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

/** The history of builds, read the same way the transcript is — see fetchMessages. */
export const fetchCheckpoints = (projectId: string) =>
  request<{ checkpoints: CheckpointMeta[] }>(`/api/shared/${encodeURIComponent(projectId)}/checkpoints`);

/**
 * WHAT APPLE ACTUALLY DID INSIDE STUDIO.
 *
 * The worker has recorded every op since the oplog existed and served it here, and nothing in this
 * app had ever called it — a grep for 'studio/diagnostics' across apps/web returned nothing at all.
 * `limit` and `before` page it; the worker owns their bounds and answers a cursor it cannot parse
 * with a refusal rather than the newest page.
 */
export interface StudioOpLog {
  recentOps: OpLogRow[];
  limit: number;
  nextBefore: number | null;
}

//[[ TWO AGENTS NAMED TWO DIFFERENT ENDPOINTS `fetchStudioDiagnostics`, AND BOTH ARE REAL.
//
//   One returns the connection's state — is Studio paired, when does the token lapse, is the open
//   place the bound one. The other returns the op LOG: what Studio has been asked to do, paged.
//   They answer different questions, and the name that fitted both was the reason they collided.
//
//   The op log is the one renamed, because "diagnostics" in every message the pairing dialog
//   prints means the connection, and a rename there would leave the word meaning two things in
//   one product.
export const fetchStudioOpLog = (projectId: string, opts: { limit?: number; before?: number | null } = {}) => {
  const q = new URLSearchParams();
  if (opts.limit) q.set('limit', String(opts.limit));
  if (opts.before) q.set('before', String(opts.before));
  const query = q.toString();
  return request<StudioOpLog>(
    `/api/projects/${encodeURIComponent(projectId)}/studio/diagnostics${query ? `?${query}` : ''}`,
  );
};

export const createPairingCode = (projectId: string): Promise<PairingCodeDto> =>
  MOCK_MODE
    ? Promise.resolve({ code: 'GLM-7F3K2Q', expiresAtIso: new Date(Date.now() + 9 * 60_000).toISOString() })
    : request<PairingCodeDto>(`/api/projects/${encodeURIComponent(projectId)}/pairing`, { method: 'POST' });

// ---------------------------------------------------------------- the Studio link, for its owner
//
// THREE ROUTES THE WORKER HAS SERVED WITH NOTHING CALLING THEM. `/studio/diagnostics` carries the
// bound place, when the pairing was made and when its 30-day clock runs out, any place mismatch,
// and the last operations; `/studio/disconnect` revokes the plugin's token; `/studio/place/rebind`
// is the way out of a place mismatch that is not re-pairing. docs/troubleshooting and docs/plugin
// have both been telling users to "disconnect from the web workspace" — a promise with no control
// behind it until these were called from somewhere.
//
// All three are under /api/projects, so all three are OWNER ONLY: a collaborator is answered 404,
// and the dialog has to render that as "we could not check" rather than as "nothing is paired".

/**
 * The whole state of this project's Studio link.
 *
 * Mirrors what apps/worker/src/do/session.ts assembles at `/studio/diagnostics`, the way MemberRow
 * below mirrors RosterEntry. Every field that can be unknown is `null` rather than a zero or an
 * empty string, because "Studio has never reported a place" and "Studio has a place open" are two
 * different sentences and the record exists to keep them apart.
 */
export interface StudioDiagnosticsResponse {
  link: StudioLinkSummary;
  agentStatus: string;
  /** When the pairing token was issued, and when it lapses. Null when nothing is paired. */
  pairedAt: number | null;
  pairingExpiresAt: number | null;
  /** What Studio last said about itself. Null when it has never reported. */
  openPlace: { placeName: string; placeId: number; gameId: number; isRunMode: boolean } | null;
  /** Set when the open place is not the bound one. `message` is the worker's own wording. */
  placeMismatch: {
    expectedPlaceName: string;
    openPlaceName: string;
    openPlaceId: number;
    message: string;
  } | null;
  recentOps: { op_id: string; kind: string | null; ok: number | null; summary: string | null; created_at: number }[];
}

export const fetchStudioDiagnostics = (projectId: string): Promise<StudioDiagnosticsResponse> =>
  MOCK_MODE
    ? Promise.resolve(mockDiagnostics())
    : request<StudioDiagnosticsResponse>(`/api/projects/${encodeURIComponent(projectId)}/studio/diagnostics`);

/** Revoke the plugin's token. The next poll is answered 401 and Studio clears its own session. */
export const disconnectStudio = (projectId: string): Promise<{ ok: boolean; revoked: boolean }> =>
  request(`/api/projects/${encodeURIComponent(projectId)}/studio/disconnect`, { method: 'POST' });

/** Forget the bound place, so the next state event from Studio binds whatever is open now. */
export const rebindPlace = (projectId: string): Promise<{ ok: boolean }> =>
  request(`/api/projects/${encodeURIComponent(projectId)}/studio/place/rebind`, { method: 'POST' });

/**
 * Throw away the changes waiting for Studio to collect them.
 *
 * The fourth route, and the one that did not exist until now: automatic cancellation was built (a
 * run that ends takes its queued ops with it) and explicit cancellation was not, so a user whose
 * Studio closed mid-build watched the depth climb with no control over it.
 *
 * `discarded` is the count the SERVER removed, not the count the browser last saw — those differ
 * every time an op is collected between the render and the click.
 */
export const discardStudioQueue = (projectId: string): Promise<{ ok: boolean; discarded: number }> =>
  request(`/api/projects/${encodeURIComponent(projectId)}/studio/queue`, { method: 'DELETE' });

/**
 * CONNECTING DISCORD, FROM THE SIDE THAT CAN PROVE WHO YOU ARE.
 *
 * The code is minted here — signed in, on a project this account owns — and typed into Discord.
 * That direction is the proof: only somebody signed in to this account can produce a code, so
 * presenting one in Discord is evidence of having been signed in. Doing it the other way round
 * would prove nothing about the Discord user at all.
 */
export interface DiscordLink {
  discordUserId: string;
  appleUserId: string;
  projectId: string;
  projectName: string;
  linkedAt: number;
}

export const createDiscordCode = (projectId: string): Promise<PairingCodeDto> =>
  MOCK_MODE
    ? Promise.resolve({ code: 'K7MQ2XRB', expiresAtIso: new Date(Date.now() + 9 * 60_000).toISOString() })
    : request<PairingCodeDto>(`/api/projects/${encodeURIComponent(projectId)}/discord-code`, { method: 'POST' });

export const fetchDiscordLink = (): Promise<{ link: DiscordLink | null }> =>
  MOCK_MODE ? Promise.resolve({ link: null }) : request<{ link: DiscordLink | null }>('/api/discord/link');

export const disconnectDiscord = (): Promise<{ removed: boolean }> =>
  MOCK_MODE ? Promise.resolve({ removed: true }) : request<{ removed: boolean }>('/api/discord/link', { method: 'DELETE' });

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
/**
 * `audited` is on every one of these answers, and it is not decoration.
 *
 * The membership change has already happened by the time the history append runs, so a failed
 * append cannot undo it — the route says `ok: true, audited: false` and means both words. A client
 * that reads the first and drops the second has turned "we did this and did not record it" into
 * "we did this". See lib/member-history.ts, which is where that flag becomes a sentence.
 */
export interface MemberMutation {
  ok: boolean;
  audited?: boolean;
}

export const inviteMember = (
  projectId: string,
  body: { userId: string; role: string; expiresAt?: string | null },
): Promise<MemberMutation & { userId: string; role: string; event: string }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members`, { method: 'POST', body: JSON.stringify(body) });

/** Revoked, not deleted: "this access ended" is a fact worth keeping. */
export const removeMember = (projectId: string, userId: string): Promise<MemberMutation> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, { method: 'DELETE' });

/**
 * Paused, which is a different state from removed — and re-admission is one click rather than a
 * re-invitation.
 *
 * THE REASON IS STORED AND AUDITED, so it is worth asking for. This was called with `''` from the
 * one control that reached it, which meant the row the server takes care to write always said
 * null: an audit trail of pauses with no reason on any of them.
 */
export const suspendMember = (projectId: string, userId: string, reason: string): Promise<MemberMutation> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/suspend`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });

/** Restores AT THE ROLE THE GRANT CARRIED — the route refuses to take one, so this cannot promote. */
export const reactivateMember = (projectId: string, userId: string): Promise<MemberMutation & { role?: string }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/reactivate`, {
    method: 'POST',
  });

// ---------------------------------------------------------------- share links
//
// Minting, listing, revoking and redeeming a link by URL. The worker has had all four for a while
// and none of them had a caller: there was no share-link function in this file at all, so a link
// could only be created with curl and — until GET /links existed — could never be revoked at all,
// because the token was unrecoverable the moment the mint response scrolled away.

/** One link, exactly as GET /api/shared/:id/links reports it. */
export interface ShareLinkRow {
  /** The secret itself. It IS the link: revoking takes it, and re-sending needs it. */
  token: string;
  scope: 'project' | 'chat' | 'build';
  resourceId: string | null;
  role: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdBy: string;
  createdAt: string;
  /**
   * Computed by the worker THROUGH `redeemShareLink` — the function that actually decides — rather
   * than by reading the columns a second way, so this can never say live about a link the door
   * will refuse.
   */
  state: string;
}

export interface ShareLinksResponse {
  links: ShareLinkRow[];
  /** True when KV could not be read whole: a short list, said out loud rather than shown short. */
  partial: boolean;
}

export const fetchShareLinks = (projectId: string): Promise<ShareLinksResponse> =>
  request<ShareLinksResponse>(`/api/shared/${encodeURIComponent(projectId)}/links`);

export const createShareLink = (
  projectId: string,
  body: { scope: 'project' | 'chat' | 'build'; role: string; resourceId?: string | null; expiresAt?: string | null },
): Promise<{ token: string; scope: string; role: string; resourceId: string | null; expiresAt: string | null }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/links`, { method: 'POST', body: JSON.stringify(body) });

/** Stops the NEXT person. Grants already minted from the link are a membership revocation. */
export const revokeShareLink = (projectId: string, token: string): Promise<{ ok: boolean; revoked: boolean }> =>
  request(`/api/shared/${encodeURIComponent(projectId)}/links/revoke`, { method: 'POST', body: JSON.stringify({ token }) });

/**
 * Present a link and become a member, or be told exactly why not.
 *
 * The project id is NOT sent: the token is looked up by itself, and the answer carries the project
 * it belongs to. A caller that had to name the project would have to learn it from somewhere, and
 * the only place to learn it is the link.
 */
export const redeemShareLinkToken = (
  token: string,
): Promise<{ ok: boolean; projectId: string; role: string; scope: string; resourceId?: string | null }> =>
  request('/api/shared/links/redeem', { method: 'POST', body: JSON.stringify({ token }) });

/**
 * MANY INVITATIONS, ONE REQUEST — and a per-row answer for every one of them.
 *
 * The route is refused whole rather than truncated past its cap, and validates every row before it
 * writes anything, so `applied` is all-or-nothing across the accepted rows. What a caller must not
 * throw away is `rejected`: it names each refused row BY INDEX with its reason (bad_row, bad_user,
 * unknown_role, owner_is_not_a_member, duplicate, bad_expiry), which is the half the person needs
 * in order to correct their list. A UI that shows only "3 of 5 added" has discarded it.
 */
export interface BulkInviteRow {
  userId: string;
  role: string;
  expiresAt?: string | null;
}

export interface BulkInviteResponse {
  applied: boolean;
  error?: string;
  /** The cap, returned with a `too_many` refusal so a client can split the batch. */
  max?: number;
  invited: { userId: string; role: string; expiresAt: string | null; ok: boolean; event: string }[];
  rejected: { index: number; userId: string | null; error: string }[];
  audited: boolean;
  counts: { invited: number; rejected: number };
}

export const bulkInviteMembers = (projectId: string, members: BulkInviteRow[]): Promise<BulkInviteResponse> =>
  request<BulkInviteResponse>(`/api/shared/${encodeURIComponent(projectId)}/members/bulk`, {
    method: 'POST',
    body: JSON.stringify({ members }),
  });

/**
 * What removing this person WOULD do, before it is done. A read; nothing on the server changes.
 *
 * `footprintAvailable: false` is the field that matters. The counts come from the project's
 * Durable Object, which can be unreachable — and a preview that renders an unread count as 0 tells
 * an admin the departing member holds nothing, which is the failure this whole route exists to
 * avoid. Callers must render that case as "we could not count their work", never as zero.
 */
export interface MemberFootprint {
  comments: number;
  openComments: number;
  reviewsRequested: number;
  reviewsAwaiting: number;
  /** Open reviews where they are the ONLY reviewer: those can never be approved once they go. */
  reviewsSoleReviewer: number;
  approvals: number;
  versions: number;
  authorsCurrentHead: boolean;
  retained: string[];
  blocked: string[];
}

export interface MemberImpact {
  userId: string;
  /** Null for somebody who was never here — different from a member with nothing to their name. */
  member: MemberRow | null;
  footprint: MemberFootprint | null;
  footprintAvailable: boolean;
  effects: {
    accessEndsImmediately: boolean;
    linkGrantRevoked: boolean;
    reRedemptionBarred: boolean;
    ownershipUnchanged: boolean;
    historyRetained: boolean;
  };
  partial?: boolean;
  incomplete?: string[];
}

export const fetchMemberImpact = (projectId: string, userId: string): Promise<MemberImpact> =>
  request<MemberImpact>(
    `/api/shared/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}/impact`,
  );

/**
 * What has happened to a membership: invited, role changed, renewed, suspended, reactivated,
 * revoked — and the acceptance of a share link, which lives on the KV grant rather than in
 * Postgres and is merged in by the route.
 *
 * `partial` says the link grants could not all be read. A history with a silent hole in it is the
 * failure the route goes out of its way to avoid, so a caller that drops the flag undoes the care.
 */
export interface MemberEvent {
  kind: string;
  subjectId: string | null;
  actorId: string | null;
  fromRole: string | null;
  toRole: string | null;
  reason: string | null;
  at: string | null;
  source: 'history' | 'grant';
}

export interface MemberEventsResponse {
  events: MemberEvent[];
  scope: 'project' | 'member';
  partial?: boolean;
  incomplete?: string[];
}

/** Any member may read their own history; reading somebody else's needs manage_members (403). */
export const fetchMemberEvents = (projectId: string, userId?: string, limit?: number): Promise<MemberEventsResponse> => {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (limit) params.set('limit', String(limit));
  const qs = params.toString();
  return request<MemberEventsResponse>(
    `/api/shared/${encodeURIComponent(projectId)}/members/events${qs ? `?${qs}` : ''}`,
  );
};

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

// ---------------------------------------------------------------- automations
//
// The saved instructions a project keeps. Every one of these routes is driven end-to-end by
// apps/worker/tests/automation-routes-live.test.mjs, which instantiates the real app — so the
// spellings below are held against the server rather than against a reading of its source.

/** One automation as the worker renders it: the row, plus the two sentences a person checks it by. */
export interface AutomationView {
  id: string;
  ownerId: string;
  projectId: string;
  name: string;
  description: string | null;
  prompt: string;
  mode: string;
  trigger: string;
  timezone: string;
  event: string | null;
  enabled: boolean;
  overlap: string;
  missedRuns: string;
  maxRetries: number;
  budget: { maxCreditsPerRun: number; maxRunsPerDay: number };
  createdAt: number;
  updatedAt: number;
  nextFireAt: number | null;
  lastFireAt: number | null;
  /** `describeSchedule` — a schedule a person cannot read back is one they cannot check. */
  describes: string;
  /** The daylight-saving disclosure, or null when the schedule has no wall hour to be moved. */
  dstNote: string | null;
}

export interface AutomationRunRow {
  id: string;
  automationId: string;
  projectId: string;
  trigger: string;
  dueAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  outcome: string | null;
  attempt: number;
  runId: string | null;
  credits: number | null;
  error: string | null;
  fold: string | null;
}

export interface AutomationSpend {
  runs: number;
  credits: number;
  /** Fires whose cost was never recorded. NOT zero — see automationSpend in the worker. */
  unreadable: number;
  failures: number;
}

export const fetchAutomations = (projectId: string): Promise<{ automations: AutomationView[] }> =>
  request(`/api/projects/${encodeURIComponent(projectId)}/automations`);

export const createAutomation = (projectId: string, body: unknown): Promise<{ automation: AutomationView }> =>
  request(`/api/projects/${encodeURIComponent(projectId)}/automations`, { method: 'POST', body: JSON.stringify(body) });

export const updateAutomation = (id: string, body: unknown): Promise<{ automation: AutomationView }> =>
  request(`/api/automations/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) });

export const deleteAutomation = (id: string): Promise<{ ok: true }> =>
  request(`/api/automations/${encodeURIComponent(id)}`, { method: 'DELETE' });

/**
 * Pause or resume.
 *
 * The worker answers with the state its own WRITE produced rather than echoing the request, so a
 * toggle that changed nothing cannot render as a toggle that worked. Callers must use the returned
 * value, not the one they sent.
 */
export const setAutomationEnabled = (id: string, enabled: boolean): Promise<{ ok: true; enabled: boolean }> =>
  request(`/api/automations/${encodeURIComponent(id)}/enabled`, { method: 'POST', body: JSON.stringify({ enabled }) });

/**
 * Fire it now. Answers 202 with the execution id, because the build takes minutes and the request
 * must not hold the connection open for it — the history is where the outcome arrives.
 */
export const runAutomation = (id: string): Promise<{ ok: true; executionId: string }> =>
  request(`/api/automations/${encodeURIComponent(id)}/run`, { method: 'POST' });

export const fetchAutomationRuns = (id: string, limit = 25): Promise<{ runs: AutomationRunRow[] }> =>
  request(`/api/automations/${encodeURIComponent(id)}/runs?limit=${limit}`);

export const fetchAutomationSpend = (id: string, days = 30): Promise<AutomationSpend> =>
  request(`/api/automations/${encodeURIComponent(id)}/spend?days=${days}`);

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

/**
 * Publish the Discord slash-command list. Idempotent — the PUT replaces the whole list — and the
 * only place the bot token is used. It has to be run once after the Discord application exists,
 * and again whenever the command list changes, or Discord keeps offering commands that are gone.
 */
export const adminRegisterDiscordCommands = (adminKey: string) =>
  request<{ ok: boolean; registered: string[] }>(
    '/api/admin/discord/register-commands',
    { method: 'POST' },
    { 'X-Admin-Key': adminKey },
  );

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

// ---------------------------------------------------------------- the inbox / security history
//
// The worker has written a `security_event` row on every key mint, rotation, revocation and
// membership change for a while, and until now nothing in this app fetched it — a security log the
// account holder could not open. See lib/security-history.ts for what the settings page does with
// the rows.
//
// BOUND TO THE CALLER BY THE TOKEN. There is no user id in either path and no variant that takes
// one; the worker reads `c.get('user').userId` off the verified JWT and binds it into every clause.

//[[ THERE IS ONE PAIR OF THESE, AND IT USED TO BE TWO.
//
//   Two agents wrote notification helpers against the same two routes with different signatures —
//   one taking `{ids?, all?}` for the inbox, one taking a bare `ids` array for the security panel.
//   The second version's comment carried a real constraint and it is kept below rather than lost:
//   IDS, NEVER `all`, for a panel that shows only security events, because "mark all read" there
//   would clear the run failures sitting unread beside them.
//
//   That is a rule about the CALL SITE, not about the function. The function above takes both and
//   the security panel passes only ids — which is checked, not merely intended: see
//   apps/web/tests/security-log.test.mjs.

/**
 * Record that this account's password was changed.
 *
 * Supabase performs the change and this worker never sees it, which is why the record has to be
 * ASKED FOR rather than observed. `recorded` comes back from the write and is false when the notice
 * did not land — the page says different things for the two, because "we have noted it in your
 * security history" printed over a notice that was dropped is the observation-failure this
 * codebase keeps finding.
 */
export const reportPasswordChanged = (): Promise<{ recorded: boolean; reason?: string }> =>
  MOCK_MODE
    ? Promise.resolve({ recorded: true })
    : request<{ recorded: boolean; reason?: string }>('/api/security/password-changed', { method: 'POST' });
