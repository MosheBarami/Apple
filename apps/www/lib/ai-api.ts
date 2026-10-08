import type { AiConnectionView, AiModelCatalog, AiProviderId, InferenceSelection } from '../../../packages/shared/src/index';
import { authHeaders } from './supabase';
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body: unknown) { super(message); this.name = 'ApiError'; }
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(await authHeaders());
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, signal: init.signal ?? AbortSignal.timeout(120000) });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(typeof body?.error === 'string' ? body.error : 'AI connection request failed.', response.status, body);
  return body as T;
}
export const fetchAiProviders = (): Promise<{ providers: { id: AiProviderId; name: string; producer: string | null;
  source: string; accountIdRequired: boolean; endpoint: string; billing: string }[] }> => request('/api/me/ai/providers');
export const fetchAiConnections = (): Promise<{ connections: AiConnectionView[] }> => request('/api/me/ai/connections');
export const addAiConnection = (body: { provider: AiProviderId; name: string; credentials: { apiKey: string; accountId?: string } }): Promise<{ connection: AiConnectionView }> =>
  request('/api/me/ai/connections', { method: 'POST', body: JSON.stringify(body) });
export const replaceAiConnection = (id: string, body: { name: string; credentials: { apiKey: string; accountId?: string } }): Promise<{ connection: AiConnectionView }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
export const removeAiConnection = (id: string): Promise<{ removed: boolean }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}`, { method: 'DELETE' });
export const fetchAiModels = (id: string): Promise<{ catalog: AiModelCatalog | null; connection: AiConnectionView }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}/models`);
export const refreshAiModels = (id: string): Promise<{ catalog: AiModelCatalog; status: string; inferenceVerified: boolean; message: string }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}/models/refresh`, { method: 'POST' });
export const testAiConnection = (id: string, modelId: string): Promise<{ verified: boolean; provider: string; modelId: string }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}/check`, { method: 'POST', body: JSON.stringify({ modelId }) });
export const testAiBuildingSupport = (id: string, modelId: string): Promise<{ tools: boolean; message: string }> =>
  request(`/api/me/ai/connections/${encodeURIComponent(id)}/capabilities`, { method: 'POST', body: JSON.stringify({ modelId }) });
export const fetchInferenceSelection = (projectId?: string): Promise<{ selection: InferenceSelection }> =>
  request(projectId ? `/api/projects/${encodeURIComponent(projectId)}/ai-selection` : '/api/me/ai/selection');
export const saveInferenceSelection = (selection: InferenceSelection, projectId?: string): Promise<{ selection: InferenceSelection }> =>
  request(projectId ? `/api/projects/${encodeURIComponent(projectId)}/ai-selection` : '/api/me/ai/selection',
    { method: 'PUT', body: JSON.stringify({ selection }) });
export const fetchOpenCodeModels = (): Promise<{ version?: string; models: { id: string; name: string; available: boolean }[] }> =>
  request('/api/me/ai/opencode/models');
