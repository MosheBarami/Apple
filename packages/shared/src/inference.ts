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
  | { route: 'byok'; provider: string; connectionId: string; modelId: string;
      autoRouting?: { enabled: true; allowedConnectionIds: string[] } };

export type InferenceTask = 'intake' | 'planning' | 'schema' | 'luau' | 'repair' | 'tools' | 'summary' | 'evidence';
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
