/**
 * Every model call is metered by the main worker's budget (StudioGate.reserveModel / settleModel: the product's daily
 * and monthly ceilings and kill switch) before it runs.
 *
 * A streamed reply reports its usage only when the step ends, so its reservation is held in `holds` and settled by the
 * agent at the step's REAL usage (settleNext). Settling streams at the reservation (as this did until 2026-10-08) counted
 * each step at its worst case (up to 32,000 neurons) and used up the whole day's shared budget in about ten steps.
 */
export interface Holds {
  /** One entry per streamed call, oldest first, each with the model it was reserved for (a fallback model keeps its own price). */
  pending: { model: string; reserved: number }[];
}

/** The token counts a settlement needs. `cachedInputTokens` is the part of the input served from the prompt cache. */
export interface StepUsage {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
}

export function meteredAi(env: Env, holds?: Holds): Ai {
  const run = async (model: string, inputs: Record<string, unknown>, options?: unknown) => {
    const asked = inputs?.max_completion_tokens ?? inputs?.max_tokens;
    const maxOut = typeof asked === 'number' ? asked : 4096;
    const hold = await env.GATE.reserveModel(model, JSON.stringify(inputs ?? {}).length, maxOut);
    if (!hold.ok) throw new Error(hold.message);
    try {
      const result = await (env.AI.run as (m: string, i: unknown, o?: unknown) => Promise<unknown>)(model, inputs, options);
      const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } } } | null)?.usage;
      if (usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number') {
        await env.GATE.settleModel(model, hold.reserved, {
          inputTokens: usage.prompt_tokens,
          outputTokens: usage.completion_tokens,
          cachedInputTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
        });
      } else if (holds) {
        holds.pending.push({ model, reserved: hold.reserved });
      } else {
        await env.GATE.settleModel(model, hold.reserved, null);
      }
      return result;
    } catch (e) {
      await env.GATE.releaseModel(model, hold.reserved);
      throw e;
    }
  };
  return new Proxy({} as Ai, {
    get(_target, prop) {
      if (prop === 'run') return run;
      const ai = env.AI as unknown as Record<string | symbol, unknown>;
      const value = ai[prop];
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(ai) : value;
    },
  });
}

/** Settles the oldest held reservation at a step's real token usage, cached input at its cached rate. */
export async function settleNext(env: Env, holds: Holds, usage: StepUsage): Promise<void> {
  const hold = holds.pending.shift();
  if (hold) await env.GATE.settleModel(hold.model, hold.reserved, usage).catch(() => undefined);
}

/** Gives back reservations no step settled (an aborted or failed turn). */
export async function releaseAll(env: Env, holds: Holds): Promise<void> {
  for (const hold of holds.pending.splice(0)) await env.GATE.releaseModel(hold.model, hold.reserved).catch(() => undefined);
}
