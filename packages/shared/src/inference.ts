import { isAiProviderId, type AiProviderId } from './ai-providers.ts';
/** Product release identity; package versions and legacy productModel ids are independent. */
export const ENGINE_RELEASE = {
  id: 'studpilot-v1', version: '1.0', label: 'StudPilot V1.0',
  provider: 'workers-ai', modelId: '@cf/zai-org/glm-5.3-flash',
  configVersion: 'studpilot-engine-1', promptVersion: 'studpilot-prompts-1', policyVersion: 'routing-1',
  configuration: { nativeTools: true, maxTokens: 6500, ctx: 1_310_720, temperature: 0.25, reasoningEffort: 'low' },
} as const;

export const INFERENCE_ROUTES = [
  { id: 'studpilot', label: ENGINE_RELEASE.label },
  { id: 'opencode-free', label: 'OpenCode Free' },
  { id: 'byok', label: 'Bring Your Own Key' },
] as const;
export type InferenceRouteId = typeof INFERENCE_ROUTES[number]['id'];
export type InferenceSelection =
  | { route: 'studpilot' }
  | { route: 'opencode-free'; modelId?: string; allowTraining?: boolean }
  | { route: 'byok'; provider: AiProviderId; connectionId: string; modelId: string;
      autoRouting?: { enabled: true; allowedConnectionIds: string[] } };

export type InferenceTask = 'intake' | 'planning' | 'schema' | 'luau' | 'repair' | 'tools' | 'summary' | 'evidence';
export function parseInferenceSelection(value: unknown): InferenceSelection | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const selection = value as Record<string, unknown>;
  const modelId = (id: unknown): id is string => typeof id === 'string' && id.length > 0 && id.length <= 300 && !/[\x00-\x1f?#]/.test(id);
  const connectionId = (id: unknown): id is string => typeof id === 'string' && /^[0-9a-f-]{36}$/.test(id);
  if (selection.route === 'studpilot') return { route: 'studpilot' };
  if (selection.route === 'opencode-free') {
    if (selection.modelId !== undefined && !modelId(selection.modelId)) return null;
    if (selection.allowTraining !== undefined && typeof selection.allowTraining !== 'boolean') return null;
    return { route: 'opencode-free', ...(selection.modelId ? { modelId: selection.modelId as string } : {}),
      ...(selection.allowTraining === true ? { allowTraining: true } : {}) };
  }
  if (selection.route !== 'byok' || !isAiProviderId(selection.provider)
    || !connectionId(selection.connectionId) || !modelId(selection.modelId)) return null;
  let autoRouting: { enabled: true; allowedConnectionIds: string[] } | undefined;
  if (selection.autoRouting !== undefined) {
    const auto = selection.autoRouting as Record<string, unknown>;
    if (!auto || auto.enabled !== true || !Array.isArray(auto.allowedConnectionIds) || auto.allowedConnectionIds.length < 1
      || auto.allowedConnectionIds.length > 16 || auto.allowedConnectionIds.some((id) => !connectionId(id))) return null;
    autoRouting = { enabled: true, allowedConnectionIds: [...new Set(auto.allowedConnectionIds as string[])] };
  }
  return { route: 'byok', provider: selection.provider, connectionId: selection.connectionId, modelId: selection.modelId,
    ...(autoRouting ? { autoRouting } : {}) };
}
export interface RoutingDecision {
  route: InferenceRouteId;
  task: InferenceTask;
  complexity: 'simple' | 'medium' | 'complex';
  provider: string;
  modelId: string;
  connectionId: string | null;
  catalogVersion: string;
  policyVersion: string;
  reason: string;
}
