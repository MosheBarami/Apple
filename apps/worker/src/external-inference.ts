import { isAiProviderId, type GatewayRequest, type GatewayResponse, type RoutingDecision, type GatewayToolCall, type AiProviderId } from '@studpilot/shared';
import type { Env } from './env';
import { getAiConnection, updateAiConnectionCheck } from './ai-connections';
import { invokeApi, ApiInvocationError } from './providers/api-transport';
import { isCompleteToolCall } from './tool-call-integrity';
import { routeInference, type RoutingRequirements } from './inference-router';
import { runnerRequest, requireInferenceRoute, type PinnedInference } from './inference-runs';
import { routeHealth, recordRouteFailure, recordRouteSuccess } from './inference-health';

export async function externalInference(env: Env, request: GatewayRequest, pinned: PinnedInference,
  options: { requirements: RoutingRequirements; requestId: string; runId: string;
    signal?: AbortSignal; stream?: boolean; onText?: (delta: string) => void; onRoute?: (decision: RoutingDecision) => void }) : Promise<GatewayResponse> {
  // Recheck every call so rollback also stops already-pinned runs at their next inference boundary.
  requireInferenceRoute(env, pinned.selection.route);
  const { candidate, decision } = routeInference(pinned.selection, options.requirements,
    pinned.candidates.map((candidate) => routeHealth(pinned.actorId, candidate)));
  options.onRoute?.(decision);
  let result: { provider: AiProviderId | 'opencode'; model: string; text: string; toolCalls: GatewayToolCall[];
    finishReason: GatewayResponse['finishReason']; truncated: boolean; replay: unknown;
    usage: { inputTokens: number | null; outputTokens: number | null } };
  if (pinned.selection.route === 'byok') {
    const connection = await getAiConnection(env, pinned.actorId, candidate.connectionId!);
    if (!connection || connection.view.revision !== candidate.connectionRevision
      || connection.view.provider !== candidate.model.provider) throw new Error('The AI connection was removed or replaced. Choose it again for a new run.');
    if (['invalid', 'unavailable'].includes(connection.view.status)) throw new Error('The selected AI connection is unavailable. Test or replace its key.');
    // Credentials are fetched afresh for every inference and never persisted in the run or router.
    if (!isAiProviderId(candidate.model.provider)) throw new Error('That provider cannot serve a BYOK connection.');
    try { result = await invokeApi(candidate.model.provider, connection.credentials, {
      modelId: candidate.model.id, messages: request.messages, tools: request.tools,
      requiredTool: request.requiredTool, jsonSchema: request.jsonSchema,
      maxTokens: Math.min(request.maxTokens ?? 6500, candidate.model.maxOutput ?? 6500), temperature: request.temperature ?? 0.25,
    }, { signal: options.signal, stream: options.stream }); }
    catch (error) {
      if (error instanceof ApiInvocationError) {
        recordRouteFailure(pinned.actorId, candidate, error.code, error.retryAfterMs);
        if (['auth', 'billing'].includes(error.code)) await updateAiConnectionCheck(env, pinned.actorId,
          connection.view.id, connection.view.revision, error.code === 'auth' ? 'invalid' : 'unavailable',
          connection.catalog, connection.view.catalogVersion);
        else if (['rate_limit', 'unavailable'].includes(error.code)) {
          const catalog = connection.catalog as { models?: any[] } | null;
          if (catalog?.models) await updateAiConnectionCheck(env, pinned.actorId, connection.view.id, connection.view.revision,
            connection.view.status, { ...catalog, models: catalog.models.map((model) => model.id === candidate.model.id
              ? { ...model, availability: { kind: error.code === 'rate_limit' ? 'rate_limited' : 'unavailable',
                checkedAt: new Date().toISOString(), ...(error.retryAfterMs !== undefined
                  ? { retryAt: new Date(Date.now() + error.retryAfterMs).toISOString() } : {}) } } : model) }, connection.view.catalogVersion);
        }
      }
      throw error;
    }
    const stillOwned = await getAiConnection(env, pinned.actorId, candidate.connectionId!);
    if (!stillOwned || stillOwned.view.revision !== candidate.connectionRevision) {
      throw new Error('The AI connection changed while the provider was running. Its result was discarded; start a new run with the current key.');
    }
    recordRouteSuccess(pinned.actorId, candidate);
    // Auto routing may select another explicitly allowed provider; the selected candidate is authoritative.
    if (result.provider !== candidate.model.provider) throw new Error('Inference provider did not match its routing decision.');
  } else if (pinned.selection.route === 'opencode-free') {
    const payload = {
      actorId: pinned.actorId, runId: options.runId, requestId: options.requestId, modelId: candidate.model.id,
      catalogVersion: candidate.catalogVersion, maxTokens: request.maxTokens ?? 6500,
      allowTraining: pinned.selection.allowTraining === true,
      instructions: 'Return a single JSON object: {"text": string, "toolCalls": [{"id": string, "name": string, "arguments": object}]}. '
        + 'Only offered tools may be requested. These are requests for StudPilot; no Studio operation has run yet.',
      input: JSON.stringify({ messages: request.messages, tools: request.tools ?? [], requiredTool: request.requiredTool,
        jsonSchema: request.jsonSchema }),
    };
    let response = await runnerRequest(env, '/v1/infer', 'POST', payload, options.signal);
    if (response.status === 409) {
      const failure = await response.clone().json().catch(() => null) as { error?: string } | null;
      // This is still the model-call boundary: no tool from this request has been executed.
      // Recover this one interrupted inference only, with the same pinned model/catalog and a
      // distinct request id; completed old Studio actions remain in the worker's ledger/history.
      if (failure?.error === 'interrupted_by_restart') response = await runnerRequest(env, '/v1/infer', 'POST',
        { ...payload, requestId: `${options.requestId}-recovery-1` }, options.signal);
    }
    if (!response.ok) throw new Error('OpenCode Free could not complete inference. The route was not changed.');
    const raw = await response.json() as any;
    if (raw.model !== candidate.model.id || raw.catalogVersion !== candidate.catalogVersion || raw.cost !== 0 || raw.finishReason !== 'stop') {
      throw new Error('OpenCode Free returned an unverified or incomplete result.');
    }
    let envelope;
    try { envelope = JSON.parse(raw.text); } catch { throw new Error('OpenCode did not return the structured StudPilot inference result.'); }
    if (typeof envelope.text !== 'string' || !Array.isArray(envelope.toolCalls)) throw new Error('OpenCode returned an invalid inference contract.');
    const offered = new Set((request.tools ?? []).map((tool) => tool.name));
    const toolCalls = envelope.toolCalls.map((call: any) => {
      if (typeof call.id !== 'string' || !call.id || !offered.has(call.name)
        || !call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments)) throw new Error('OpenCode requested an unoffered or malformed tool.');
      return { id: call.id, name: call.name, arguments: JSON.stringify(call.arguments) };
    });
    result = { provider: 'opencode', model: raw.model, text: envelope.text, toolCalls,
      usage: { inputTokens: typeof raw.usage?.inputTokens === 'number' ? raw.usage.inputTokens : null,
        outputTokens: typeof raw.usage?.outputTokens === 'number' ? raw.usage.outputTokens : null },
      finishReason: toolCalls.length ? 'tool_calls' as const : 'stop' as const, truncated: false, replay: null };
  } else throw new Error('Managed inference must use its existing gateway.');
  if (result.usage.inputTokens === null || result.usage.outputTokens === null
    || !Number.isFinite(result.usage.inputTokens) || !Number.isFinite(result.usage.outputTokens)) {
    throw new Error('The provider did not report token usage. This response cannot be marked fully verified.');
  }
  const offered = new Set((request.tools ?? []).map((tool) => tool.name));
  if (result.toolCalls.some((call) => !offered.has(call.name))) throw new ApiInvocationError('invalid_response',
    result.provider, 'The model requested a tool that was not offered.');
  const toolCalls = result.truncated ? result.toolCalls.filter(isCompleteToolCall) : result.toolCalls;
  // Publish only after ownership, complete response and usage checks. Interrupted/revoked
  // calls must never leak a plausible success into the transcript through a streaming callback.
  if (result.text && !result.truncated) options.onText?.(result.text);
  return { text: result.text, toolCalls, usage: { inputTokens: result.usage.inputTokens!, outputTokens: result.usage.outputTokens! },
    // No platform provider spend occurred: the user's provider pays its own bill; service admission is separate.
    neurons: 0, provider: result.provider, model: result.model,
    finishReason: toolCalls.length ? 'tool_calls' : result.finishReason,
    ...(!result.truncated ? { providerReplay: { provider: result.provider, modelId: result.model, content: result.replay } } : {}),
    routing: decision,
  };
}
