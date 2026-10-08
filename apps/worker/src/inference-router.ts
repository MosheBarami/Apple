import { ENGINE_RELEASE, type AiModelRecord, type InferenceRouteId, type InferenceSelection,
  type InferenceTask, type RoutingDecision } from '@studpilot/shared';

export interface RoutingRequirements {
  task: InferenceTask;
  features: { blocks: number; dependencies: number; unresolvedFields: number; failedChecks: number; customCode: boolean };
  inputTokens: number; outputTokens: number; tools: boolean; structuredOutput: boolean;
  maxCostUsd?: number; allowTraining?: boolean;
}
export interface RoutingCandidate {
  connectionRevision?: number;
  route: InferenceRouteId; model: AiModelRecord; connectionId: string | null; catalogVersion: string;
  available: boolean; rateLimitedUntil?: number; circuitOpenUntil?: number;
  privacy: 'zero-retention' | 'training' | 'unknown';
  freeVerified?: boolean; serviceUseAllowed?: boolean;
  measurements?: Partial<Record<InferenceTask, { attempts: number; passed: number; medianLatencyMs: number | null }>>;
}
export function taskComplexity(features: RoutingRequirements['features']): RoutingDecision['complexity'] {
  if (features.failedChecks >= 2 || features.dependencies >= 4 || features.unresolvedFields >= 4
    || (features.customCode && features.blocks >= 3)) return 'complex';
  if (features.customCode || features.blocks >= 2 || features.dependencies > 0 || features.unresolvedFields > 0 || features.failedChecks > 0) return 'medium';
  return 'simple';
}
export function routeInference(selection: InferenceSelection, requirements: RoutingRequirements,
  candidates: RoutingCandidate[], now = Date.now()): { decision: RoutingDecision; candidate: RoutingCandidate } {
  const rejected: string[] = [];
  const eligible = candidates.filter((candidate) => {
    const model = candidate.model;
    let why: string | null = null;
    if (candidate.route !== selection.route) why = 'different route';
    else if (!candidate.available || model.lifecycle === 'retired') why = 'unavailable or retired';
    else if ((candidate.rateLimitedUntil ?? 0) > now || (candidate.circuitOpenUntil ?? 0) > now) why = 'temporarily unavailable';
    else if (selection.route === 'byok' && !selection.autoRouting
      && (candidate.connectionId !== selection.connectionId || model.provider !== selection.provider || model.id !== selection.modelId)) why = 'not selected';
    else if (selection.route === 'byok' && selection.autoRouting
      && !selection.autoRouting.allowedConnectionIds.includes(candidate.connectionId ?? '')) why = 'connection was not allowed';
    else if (selection.route === 'opencode-free' && (!candidate.freeVerified || !candidate.serviceUseAllowed
      || model.inputCostPer1M !== 0 || model.outputCostPer1M !== 0)) why = 'free service route is not verified';
    else if (selection.route === 'opencode-free' && selection.modelId && selection.modelId !== model.id) why = 'not selected';
    else if (requirements.tools && model.capabilities.tools !== true) why = 'tool capability not verified';
    else if (requirements.tools && model.verification?.tools?.passed === false) why = 'native tool test did not pass';
    else if (requirements.structuredOutput && model.capabilities.structuredOutput !== true) why = 'structured output not verified';
    else if (model.capabilities.text === false) why = 'not a text model';
    else if (model.contextWindow === null && !(selection.route === 'byok' && !selection.autoRouting)) why = 'context budget not verified';
    else if (model.contextWindow !== null && requirements.inputTokens + requirements.outputTokens > model.contextWindow) why = 'context budget exceeded';
    else if (model.maxOutput !== null && requirements.outputTokens > model.maxOutput) why = 'output budget exceeded';
    else if (candidate.privacy === 'training' && !requirements.allowTraining) why = 'training consent is required';
    else if (selection.route === 'opencode-free' && candidate.privacy === 'unknown') why = 'privacy terms are not reviewed';
    if (!why && requirements.maxCostUsd !== undefined) {
      if (model.inputCostPer1M === null || model.outputCostPer1M === null) why = 'price is unknown';
      else if ((requirements.inputTokens * model.inputCostPer1M + requirements.outputTokens * model.outputCostPer1M) / 1_000_000 > requirements.maxCostUsd) why = 'budget exceeded';
    }
    if (why) rejected.push(`${model.name}: ${why}`);
    return !why;
  });
  if (!eligible.length) throw new Error(`No model can serve this ${selection.route} task. ${rejected.slice(0, 3).join('; ')}`);
  const complexity = taskComplexity(requirements.features);
  // Only measured outcomes contribute quality/latency; unknown models are never called stronger.
  const score = (candidate: RoutingCandidate) => {
    const sample = candidate.measurements?.[requirements.task];
    if (!sample || sample.attempts < 3) return 0;
    const quality = sample.passed / sample.attempts;
    return quality * (complexity === 'complex' ? 100 : 50)
      - (sample.medianLatencyMs ?? 0) / (complexity === 'simple' ? 1000 : 5000);
  };
  eligible.sort((a, b) => score(b) - score(a) || a.model.id.localeCompare(b.model.id)
    || (a.connectionId ?? '').localeCompare(b.connectionId ?? ''));
  const candidate = eligible[0]!;
  const sample = candidate.measurements?.[requirements.task];
  return { candidate, decision: { route: selection.route, task: requirements.task, complexity,
    provider: selection.route === 'studpilot' ? ENGINE_RELEASE.provider : candidate.model.provider,
    modelId: candidate.model.id, connectionId: candidate.connectionId, catalogVersion: candidate.catalogVersion,
    policyVersion: ENGINE_RELEASE.policyVersion,
    reason: selection.route === 'byok' && !selection.autoRouting ? 'Using the model and private connection you selected.'
      : sample && sample.attempts >= 3 ? `Eligible for this task; ${sample.passed}/${sample.attempts} measured checks passed.`
      : 'Eligible for this task; no measured quality advantage is claimed.' } };
}
