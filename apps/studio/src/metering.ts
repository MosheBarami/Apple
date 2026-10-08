/**
 * Every model call is metered by the main worker's budget (StudioGate.reserveModel / settleModel: the product's daily
 * and monthly ceilings and kill switch) before it runs. A streamed reply reports its usage only at the end of the stream,
 * so it settles at the reserved estimate here, which can only over-count the budget; the person's Credits are charged
 * from the real usage in the agent (StudioGate.chargeUsage).
 */
export function meteredAi(env: Env): Ai {
  const run = async (model: string, inputs: Record<string, unknown>, options?: unknown) => {
    const asked = inputs?.max_completion_tokens ?? inputs?.max_tokens;
    const maxOut = typeof asked === 'number' ? asked : 4096;
    const hold = await env.GATE.reserveModel(model, JSON.stringify(inputs ?? {}).length, maxOut);
    if (!hold.ok) throw new Error(hold.message);
    try {
      const result = await (env.AI.run as (m: string, i: unknown, o?: unknown) => Promise<unknown>)(model, inputs, options);
      const usage = (result as { usage?: { prompt_tokens?: number; completion_tokens?: number } } | null)?.usage;
      await env.GATE.settleModel(
        model,
        hold.reserved,
        usage && typeof usage.prompt_tokens === 'number' && typeof usage.completion_tokens === 'number'
          ? { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens }
          : null,
      );
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
