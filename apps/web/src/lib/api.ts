// Typed fetch helpers for the Golem worker API. All authed calls carry the
// user's Supabase access token as a Bearer header.
import type { CheckpointMeta, MessageDto, PairingCodeDto, QuotaState } from '@golem/shared';
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

export const fetchMe = () => request<MeResponse>('/api/me');
export const fetchUsage = () => request<{ days: UsageDay[] }>('/api/me/usage');

// ---------------------------------------------------------------- project session

export const fetchMessages = (projectId: string, limit = 100) =>
  request<{ messages: MessageDto[] }>(`/api/projects/${encodeURIComponent(projectId)}/messages?limit=${limit}`);

export const fetchCheckpoints = (projectId: string) =>
  request<{ checkpoints: CheckpointMeta[] }>(`/api/projects/${encodeURIComponent(projectId)}/checkpoints`);

export const createPairingCode = (projectId: string) =>
  request<PairingCodeDto>(`/api/projects/${encodeURIComponent(projectId)}/pairing`, { method: 'POST' });

export const purgeProject = (projectId: string) =>
  request<{ ok: boolean }>(`/api/projects/${encodeURIComponent(projectId)}/purge`, { method: 'POST' });

// ---------------------------------------------------------------- admin (X-Admin-Key)

export interface AdminCounterRow {
  day: string;
  key: string;
  value: number;
}

export const adminStats = (adminKey: string) =>
  request<{ counters: AdminCounterRow[] }>('/api/admin/stats', {}, { 'X-Admin-Key': adminKey });

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

export const adminSpend = (adminKey: string) =>
  request<SpendReport>('/api/admin/spend', {}, { 'X-Admin-Key': adminKey });

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
