import type { RoutingCandidate } from './inference-router';
const states = new Map<string, { failures: number; circuitOpenUntil: number; rateLimitedUntil: number; at: number }>();
const key = (actor: string, connection: string | null, model: string, revision?: number) => JSON.stringify([actor, connection, model, revision ?? 0]);
export function routeHealth(actor: string, candidate: RoutingCandidate) {
  const state = states.get(key(actor, candidate.connectionId, candidate.model.id, candidate.connectionRevision));
  const saved = candidate.model.availability;
  const retryAt = saved?.retryAt ? Date.parse(saved.retryAt) : 0;
  const checkedAt = saved?.checkedAt ? Date.parse(saved.checkedAt) : 0;
  return { ...candidate,
    circuitOpenUntil: Math.max(state?.circuitOpenUntil ?? 0,
      saved?.kind === 'unavailable' && Number.isFinite(checkedAt) ? checkedAt + 30_000 : 0),
    rateLimitedUntil: Math.max(state?.rateLimitedUntil ?? 0,
      saved?.kind === 'rate_limited' ? Number.isFinite(retryAt) && retryAt > 0 ? retryAt : checkedAt + 60_000 : 0) };
}
export function recordRouteFailure(actor: string, candidate: RoutingCandidate, code: string, retryAfterMs?: number) {
  const now = Date.now();
  for (const [id, state] of states) if (now - state.at > 3600_000) states.delete(id);
  if (states.size >= 1000) states.delete(states.keys().next().value!);
  const id = key(actor, candidate.connectionId, candidate.model.id, candidate.connectionRevision), previous = states.get(id);
  const failures = code === 'unavailable' ? (previous?.failures ?? 0) + 1 : 0;
  states.set(id, { at: now, failures,
    rateLimitedUntil: code === 'rate_limit' ? now + (retryAfterMs ?? 60_000) : previous?.rateLimitedUntil ?? 0,
    circuitOpenUntil: code === 'unavailable' && failures >= 3 ? now + 30_000 : previous?.circuitOpenUntil ?? 0 });
}
export function recordRouteSuccess(actor: string, candidate: RoutingCandidate) { states.delete(key(actor, candidate.connectionId, candidate.model.id, candidate.connectionRevision)); }
