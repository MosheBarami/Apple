// Typed fetch helpers for the Golem worker API. All authed calls carry the
// user's Supabase access token as a Bearer header.
import type { CheckpointMeta, MessageDto, PairingCodeDto, QuotaState } from '@golem/shared';
import type { MilestoneBrief, NextResponse, RoadmapResponse } from '../components/roadmap/model';
import { mockBrief, mockNext, mockRoadmap } from '../components/roadmap/mock';
import { MOCK_MODE, mockCounters, mockMe, mockSpend, mockUsageDays } from './mock';
import { getAccessToken } from './supabase';

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
    throw new ApiError('Network error — check your connection.', 0);
  }
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
}

export interface UsageDay {
  day: string; // YYYY-MM-DD
  sparks: number;
  events: number;
}

export const fetchMe = (): Promise<MeResponse> =>
  MOCK_MODE ? Promise.resolve(mockMe) : request<MeResponse>('/api/me');

export const fetchUsage = (): Promise<{ days: UsageDay[] }> =>
  MOCK_MODE ? Promise.resolve({ days: mockUsageDays() }) : request<{ days: UsageDay[] }>('/api/me/usage');

// ---------------------------------------------------------------- project session

// There is deliberately NO fetch for the model/provider roster here. Which
// foundation model serves a request is chosen by the routing layer, not by the
// user, so the product UI has nothing to render it with. The worker still
// exposes that roster for ADMIN diagnostics; if it is ever needed on screen it
// belongs behind /admin, never in the normal product surface.

export const fetchMessages = (projectId: string, limit = 100) =>
  request<{ messages: MessageDto[] }>(`/api/projects/${encodeURIComponent(projectId)}/messages?limit=${limit}`);

export const fetchCheckpoints = (projectId: string) =>
  request<{ checkpoints: CheckpointMeta[] }>(`/api/projects/${encodeURIComponent(projectId)}/checkpoints`);

export const createPairingCode = (projectId: string): Promise<PairingCodeDto> =>
  MOCK_MODE
    ? Promise.resolve({ code: 'GLM-7F3K2Q', expiresAtIso: new Date(Date.now() + 9 * 60_000).toISOString() })
    : request<PairingCodeDto>(`/api/projects/${encodeURIComponent(projectId)}/pairing`, { method: 'POST' });

export const purgeProject = (projectId: string) =>
  request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/purge`, { method: 'POST' });

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
 * instructions wearing Golem's own roadmap as a disguise.
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
