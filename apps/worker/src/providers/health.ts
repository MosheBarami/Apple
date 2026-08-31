// Per-provider health: last latency, last error, recent success rate.
//
// This is an IN-MEMORY ring per isolate and nothing else. No KV, no D1, no Durable Object — a
// health widget is not worth a storage write on every inference call, and an isolate that has not
// served a request has nothing useful to say anyway. Read it for "is this provider answering right
// now, from where I am standing"; do not read it as a global SLA.
import type { ProviderErrorKind, ProviderId } from './types';

/** Samples retained per provider. Small on purpose: this lives in the isolate's memory. */
export const HEALTH_RING_SIZE = 32;

export interface HealthSample {
  at: number;
  model: string;
  latencyMs: number;
  ok: boolean;
  errorKind?: ProviderErrorKind;
  errorMessage?: string;
}

export interface ProviderHealth {
  provider: ProviderId;
  /** samples currently retained (capped at HEALTH_RING_SIZE) */
  calls: number;
  ok: number;
  failed: number;
  lastLatencyMs: number | null;
  lastAt: number | null;
  lastError: { kind: ProviderErrorKind; message: string; at: number } | null;
  /** median latency over the retained window, or null when nothing has been recorded */
  medianLatencyMs: number | null;
}

const rings = new Map<ProviderId, HealthSample[]>();

export function recordProviderCall(provider: ProviderId, sample: Omit<HealthSample, 'at'> & { at?: number }): void {
  const ring = rings.get(provider) ?? [];
  ring.push({ at: sample.at ?? Date.now(), ...sample });
  while (ring.length > HEALTH_RING_SIZE) ring.shift();
  rings.set(provider, ring);
}

function summarize(provider: ProviderId, ring: readonly HealthSample[]): ProviderHealth {
  const last = ring[ring.length - 1];
  const ok = ring.filter((s) => s.ok).length;
  let lastError: ProviderHealth['lastError'] = null;
  for (let i = ring.length - 1; i >= 0; i--) {
    const s = ring[i]!;
    if (!s.ok) {
      lastError = { kind: s.errorKind ?? 'unknown', message: s.errorMessage ?? '', at: s.at };
      break;
    }
  }
  const lat = ring.map((s) => s.latencyMs).sort((a, b) => a - b);
  const median = lat.length ? lat[Math.floor(lat.length / 2)]! : null;
  return {
    provider,
    calls: ring.length,
    ok,
    failed: ring.length - ok,
    lastLatencyMs: last ? last.latencyMs : null,
    lastAt: last ? last.at : null,
    lastError,
    medianLatencyMs: median,
  };
}

/**
 * Health for one provider, or for every provider that has been called in this isolate.
 * This is the function the worker surfaces (see gateway.ts, which re-exports it).
 */
export function providerHealth(provider?: ProviderId): ProviderHealth[] {
  if (provider) return [summarize(provider, rings.get(provider) ?? [])];
  return [...rings.entries()].map(([id, ring]) => summarize(id, ring));
}

/** Test seam. Never called in production. */
export function resetProviderHealth(): void {
  rings.clear();
}
