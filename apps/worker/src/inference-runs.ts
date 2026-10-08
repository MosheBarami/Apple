import { ENGINE_RELEASE, isAiProviderId, parseInferenceSelection, type AiModelCatalog,
  type AiModelRecord, type InferenceSelection } from '@studpilot/shared';
import type { Env } from './env';
import { getAiConnection } from './ai-connections';
import type { RoutingCandidate } from './inference-router';
import { signRunnerRequest } from '../../../packages/shared/src/runner-auth.ts';
import type { ModelCfg } from './gateway';

export interface PinnedInference {
  actorId: string; selection: InferenceSelection; policyVersion: string; engineVersion: string;
  candidates: (RoutingCandidate & { connectionRevision?: number })[];
  projectId?: string;
  managedModels?: Record<string, ModelCfg>;
}
export const inferencePreferenceKey = (owner: string, project?: string) => `ai:selection:${owner}:${project ?? 'default'}`;
export function requireInferenceRoute(env: Pick<Env, 'AI_BYOK_ENABLED' | 'AI_OPENCODE_ENABLED'>, route: InferenceSelection['route']): void {
  if (route === 'byok' && env.AI_BYOK_ENABLED !== 'true') throw new Error('Bring Your Own Key is not enabled in this environment. Your route was not changed.');
  if (route === 'opencode-free' && env.AI_OPENCODE_ENABLED !== 'true') throw new Error('OpenCode Free is not enabled in this environment. Your route was not changed.');
}
export async function savedInferenceSelection(env: Pick<Env, 'KV'>, owner: string, project?: string): Promise<InferenceSelection> {
  const keys = project ? [inferencePreferenceKey(owner, project), inferencePreferenceKey(owner)] : [inferencePreferenceKey(owner)];
  for (const key of keys) {
    const raw = await env.KV.get(key); if (!raw) continue;
    let value; try { value = JSON.parse(raw); } catch { throw new Error('The saved inference selection is unreadable. Choose a route again.'); }
    const selection = parseInferenceSelection(value);
    if (!selection) throw new Error('The saved inference selection is invalid. Choose a route again.');
    return selection;
  }
  return { route: 'studpilot' };
}
export async function runnerRequest(env: Env, path: string, method = 'GET', input?: unknown, signal?: AbortSignal): Promise<Response> {
  if (!env.OPENCODE_RUNNER_URL || !env.OPENCODE_RUNNER_SIGNING_KEY) throw new Error('OpenCode Free runner is not configured.');
  const url = new URL(env.OPENCODE_RUNNER_URL);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) {
    throw new Error('OpenCode runner must use a configured HTTPS service origin.');
  }
  const body = input === undefined ? '' : JSON.stringify(input);
  const headers = await signRunnerRequest(env.OPENCODE_RUNNER_SIGNING_KEY, method, path, body);
  return fetch(new URL(path, url), { method, headers: { ...headers, 'Content-Type': 'application/json' },
    ...(body ? { body } : {}), redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(125_000)]) : AbortSignal.timeout(125_000) });
}
const managedModel = (): AiModelRecord => ({ provider: 'cloudflare', producer: 'Z.AI', id: ENGINE_RELEASE.modelId,
  name: ENGINE_RELEASE.label, protocol: 'workers-http', lifecycle: 'active', contextWindow: ENGINE_RELEASE.configuration.ctx,
  maxOutput: ENGINE_RELEASE.configuration.maxTokens, inputCostPer1M: null, outputCostPer1M: null,
  capabilities: { tools: true, structuredOutput: true, text: true }, source: 'https://developers.cloudflare.com/workers-ai/models/',
  checkedAt: '2026-10-08', access: 'listed', runtimeCheckedAt: null });

export async function pinRunInference(env: Env, actorId: string, rawSelection: unknown, projectId?: string): Promise<PinnedInference> {
  if (!actorId) throw new Error('Inference requires a verified account.');
  // Older callers omitted this additive field and retain their managed transport. New clients
  // fetch their saved preference and send it explicitly; no legacy wire id opts into a private key.
  const selection = rawSelection === undefined ? { route: 'studpilot' as const } : parseInferenceSelection(rawSelection);
  if (!selection) throw new Error('That inference selection is invalid. Choose a supported route.');
  requireInferenceRoute(env, selection.route);
  const pinned: PinnedInference = { actorId, selection, policyVersion: ENGINE_RELEASE.policyVersion,
    engineVersion: ENGINE_RELEASE.version, candidates: [], ...(projectId ? { projectId } : {}) };
  if (selection.route === 'studpilot') {
    const { getModels } = await import('./gateway');
    pinned.managedModels = structuredClone(await getModels(env));
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(pinned.managedModels)));
    const configHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
    pinned.candidates.push({ route: 'studpilot', model: managedModel(), connectionId: null,
      catalogVersion: `${ENGINE_RELEASE.configVersion}-${configHash}`, available: true, privacy: 'unknown' });
    return pinned;
  }
  if (selection.route === 'byok') {
    const ids = selection.autoRouting ? selection.autoRouting.allowedConnectionIds : [selection.connectionId];
    for (const id of ids) {
      const connection = await getAiConnection(env, actorId, id);
      if (!connection || !isAiProviderId(connection.view.provider)) throw new Error('A selected AI connection is no longer available to your account.');
      if (!selection.autoRouting && connection.view.provider !== selection.provider) throw new Error('Provider and connection do not match.');
      const catalog = connection.catalog as AiModelCatalog | null;
      if (!catalog || catalog.provider !== connection.view.provider || !Array.isArray(catalog.models)) throw new Error('Load models for the selected connection first.');
      for (const model of catalog.models) {
        if (!selection.autoRouting && model.id !== selection.modelId) continue;
        if (model.provider !== connection.view.provider) continue;
        pinned.candidates.push({ route: 'byok', model: structuredClone(model), connectionId: id,
          connectionRevision: connection.view.revision, catalogVersion: catalog.version,
          available: !['invalid', 'unavailable'].includes(connection.view.status), privacy: 'unknown',
          ...(model.quality ? { measurements: model.quality } : {}) });
      }
    }
  } else {
    const response = await runnerRequest(env, '/v1/models');
    if (!response.ok) throw new Error('OpenCode Free runner is unavailable. Your route was not changed.');
    const catalog = await response.json() as { version: string; checkedAt: string; models: any[] };
    if (!catalog.version || !Array.isArray(catalog.models)) throw new Error('OpenCode runner returned an invalid model catalog.');
    for (const model of catalog.models) {
      if (selection.modelId && model.id !== selection.modelId) continue;
      pinned.candidates.push({ route: 'opencode-free', connectionId: null, catalogVersion: catalog.version,
        available: model.available === true, freeVerified: model.policy?.runtimeVerified === true,
        serviceUseAllowed: model.policy?.serviceUseAllowed === true, privacy: model.policy?.dataUse ?? 'unknown',
        model: { provider: 'opencode', producer: null, id: model.id, name: model.name, protocol: 'opencode-cli',
          lifecycle: model.status === 'active' ? 'active' : 'unknown', contextWindow: model.limit?.context ?? null,
          maxOutput: model.limit?.output ?? null, inputCostPer1M: model.cost?.input ?? null, outputCostPer1M: model.cost?.output ?? null,
          capabilities: { tools: model.policy?.capabilities?.tools ?? null,
            structuredOutput: model.policy?.capabilities?.structuredOutput ?? null, text: model.capabilities?.output?.text === true },
          source: 'https://opencode.ai/docs/zen/', checkedAt: catalog.checkedAt, access: 'listed', runtimeCheckedAt: null } });
    }
  }
  if (!pinned.candidates.length) throw new Error('The selected model is not available in this connection catalog.');
  if (!pinned.candidates.some((candidate) => candidate.available)) throw new Error('The selected route has no verified available model.');
  return pinned;
}
