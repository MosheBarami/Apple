// The registry: who exists, who is actually usable right now, and who should serve a given task.
import type { Env } from '../env';
import { blendedPricePer1M } from './cost';
import { deepseekAdapter } from './deepseek';
import { googleAdapter } from './google';
import { openaiAdapter } from './openai';
import { workersAiAdapter } from './workers-ai';
import {
  MODEL_KEY_NEEDS,
  PROVIDER_ORDER,
  type ProviderAdapter,
  type ProviderAvailability,
  type ProviderId,
  type ProviderModel,
} from './types';

export const ADAPTERS: Record<ProviderId, ProviderAdapter> = {
  'workers-ai': workersAiAdapter,
  openai: openaiAdapter,
  google: googleAdapter,
  deepseek: deepseekAdapter,
};

export function getAdapter(id: ProviderId): ProviderAdapter {
  return ADAPTERS[id];
}

/** Every model any adapter knows about, in fixed provider order. */
export function allModels(): ProviderModel[] {
  return PROVIDER_ORDER.flatMap((id) => [...ADAPTERS[id].models]);
}

/**
 * Which adapter owns a provider model id. Unknown ids fall back to Workers AI, because the AI
 * binding is the only transport this worker is configured with: a model key pointed at an
 * unrecognised id (e.g. via the KV `config:models` override) is still a Workers AI model id.
 */
export function adapterForModelId(modelId: string): ProviderAdapter {
  for (const id of PROVIDER_ORDER) {
    if (ADAPTERS[id].models.some((m) => m.id === modelId)) return ADAPTERS[id];
  }
  return workersAiAdapter;
}

export function modelById(modelId: string): ProviderModel | undefined {
  return allModels().find((m) => m.id === modelId);
}

// ---------------------------------------------------------------------------
// availability + capability table
// ---------------------------------------------------------------------------

/** Availability for every provider, recomputed from env on every call. */
export function providerAvailability(env: Env): ProviderAvailability[] {
  return PROVIDER_ORDER.map((id) => ADAPTERS[id].availability(env));
}

export interface CapabilityRow extends ProviderModel {
  available: boolean;
  unavailableReason: ProviderAvailability['reason'];
  availabilityDetail: string;
  unsupportedModelKeys: ProviderAvailability['unsupportedModelKeys'];
}

/**
 * The capability table a UI can render directly. `available` is COMPUTED here — there is no
 * literal `true` anywhere in the model records, by design.
 */
export function capabilityTable(env: Env): CapabilityRow[] {
  const rows: CapabilityRow[] = [];
  for (const id of PROVIDER_ORDER) {
    const adapter = ADAPTERS[id];
    const status = adapter.availability(env);
    for (const model of adapter.models) {
      rows.push({
        ...model,
        available: status.available,
        unavailableReason: status.reason,
        availabilityDetail: status.detail,
        unsupportedModelKeys: status.unsupportedModelKeys,
      });
    }
  }
  return rows;
}

// ---------------------------------------------------------------------------
// auto selection
// ---------------------------------------------------------------------------

export interface AutoSelectOptions {
  /** internal model key (clay/stone/rune/memory/vision); its needs come from MODEL_KEY_NEEDS */
  modelKey?: string;
  /** explicit overrides, used when the caller knows more than the key does */
  needsTools?: boolean;
  needsVision?: boolean;
}

export interface RejectedProvider {
  provider: ProviderId;
  model: string;
  why: string;
}

export type AutoSelection =
  | { ok: true; provider: ProviderId; model: ProviderModel; reasoning: string; rejected: RejectedProvider[] }
  | { ok: false; reasoning: string; rejected: RejectedProvider[] };

function needsFor(opts: AutoSelectOptions): { tools: boolean; vision: boolean } {
  const fromKey = opts.modelKey ? MODEL_KEY_NEEDS[opts.modelKey] : undefined;
  return {
    tools: opts.needsTools ?? fromKey?.tools ?? false,
    vision: opts.needsVision ?? fromKey?.vision ?? false,
  };
}

function usd(n: number): string {
  return `$${n.toFixed(2)}`;
}

/**
 * Pick a provider for a task, and SAY WHY in one sentence the UI can show.
 *
 * The rule is fixed and deterministic, so the same inputs always produce the same answer:
 *   1. drop providers whose credentials are not present
 *   2. drop models that cannot do what the task needs (tools, vision)
 *   3. of what is left, take the cheapest by blended price
 *   4. break ties by PROVIDER_ORDER
 *
 * With only Workers AI credentialed — which is the state of this account — steps 2-4 never have a
 * choice to make, and the answer is GLM-5.3 Flash with the other three named as unavailable.
 */
export function selectProvider(env: Env, opts: AutoSelectOptions = {}): AutoSelection {
  const needs = needsFor(opts);
  const task = opts.modelKey ? `the \`${opts.modelKey}\` task` : 'this task';
  const wants = [needs.tools ? 'tool calling' : null, needs.vision ? 'vision' : null].filter(Boolean).join(' and ');

  const rejected: RejectedProvider[] = [];
  const eligible: ProviderModel[] = [];

  for (const id of PROVIDER_ORDER) {
    const adapter = ADAPTERS[id];
    const status = adapter.availability(env);
    for (const model of adapter.models) {
      if (!status.available) {
        rejected.push({
          provider: id,
          model: model.id,
          why: status.reason === 'no_credentials' ? 'no credentials configured' : 'binding not present',
        });
        continue;
      }
      if (needs.vision && !model.supportsVision) {
        rejected.push({ provider: id, model: model.id, why: 'no vision support' });
        continue;
      }
      if (needs.tools && !model.supportsTools) {
        rejected.push({ provider: id, model: model.id, why: 'no tool-calling support' });
        continue;
      }
      eligible.push(model);
    }
  }

  if (!eligible.length) {
    const names = [...new Set(rejected.map((r) => r.provider))].join(', ');
    return {
      ok: false,
      reasoning: `No provider can serve ${task}: ${rejected.map((r) => `${r.provider} (${r.why})`).join('; ')}.`,
      rejected,
    };
  }

  eligible.sort((a, b) => {
    const d = blendedPricePer1M(a) - blendedPricePer1M(b);
    if (d !== 0) return d;
    return PROVIDER_ORDER.indexOf(a.provider) - PROVIDER_ORDER.indexOf(b.provider);
  });
  const chosen = eligible[0]!;

  const price = `${usd(chosen.inputCostPer1M)}/${usd(chosen.outputCostPer1M)} per 1M tokens in/out`;
  const capability = wants ? ` It supports ${wants}, which ${task} needs.` : '';
  let why: string;
  if (eligible.length === 1) {
    const blockedNames = [...new Set(rejected.map((r) => `${r.provider} (${r.why})`))];
    why = blockedNames.length
      ? `it is the only usable provider — ${blockedNames.join(', ')}`
      : 'it is the only provider configured';
  } else {
    const runnerUp = eligible[1]!;
    why = `it is the cheapest of the ${eligible.length} usable options at ${price}, against ${runnerUp.displayName} at ${usd(runnerUp.inputCostPer1M)}/${usd(runnerUp.outputCostPer1M)}`;
  }

  return {
    ok: true,
    provider: chosen.provider,
    model: chosen,
    reasoning: `auto → ${chosen.displayName} (${chosen.provider}): ${why}.${capability}`,
    rejected,
  };
}
