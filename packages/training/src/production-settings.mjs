#!/usr/bin/env node
/**
 * WHAT A CUSTOMER'S REQUEST ACTUALLY LOOKS LIKE BY THE TIME IT REACHES THE PROVIDER.
 *
 * WHY THIS IS A MODULE AND NOT THREE NUMBERS IN A SCRIPT. Two defects in this repository's own
 * history came from getting this wrong, and both produced a real number attached to the wrong
 * thing:
 *
 *   - An eval hardcoded maxTokens 1,100 and reported a model as broken that was not; production
 *     never uses that budget.
 *   - An eval keyed the budget on the GATEWAY CONFIG NAME. The budget is not a property of the
 *     gateway: the worker computes it as `tokensForEffort(baseTokensFor(mode), effort)`, so MODE
 *     picks the base and EFFORT scales it, and two lanes reaching the same gateway from different
 *     modes arrive at different budgets. The same table also pinned Apple MAX to `stone`, which
 *     hid the one mode where MAX differs from the free lane.
 *
 * So the resolution is done once, here, in the order the worker does it, and every field that went
 * into it travels with the answer. A run that cannot say which gateway, which effort and which
 * budget it used is not a measurement.
 *
 * THE CEILING IS PART OF THE ANSWER. gateway.ts clamps with
 * `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, so what the provider saw is the
 * MINIMUM of what the lane asked for and what its config allows. Reporting only the request would
 * name a number that was never sent.
 *
 * These tables are mirrors. `production-settings.test.mjs` reads apps/worker/src and goes red when
 * the worker moves and this does not, which is the only thing that makes a mirror safe.
 */

/** apps/worker/src/do/session.ts — MODE_BASE_TOKENS. */
export const MODE_BASE_TOKENS = Object.freeze({ clay: 4400, stone: 4400, rune: 5200 });

/** apps/worker/src/reasoning.ts — BASELINE, ENTITLEMENT_FLOOR, and the effort multipliers. */
export const BASELINE_EFFORT = Object.freeze({ clay: 'low', stone: 'high', rune: 'high' });
export const ENTITLEMENT_FLOOR = Object.freeze({ apple: 'low', 'apple-max': 'high' });

//   2026-09-20: high moved from 1.25 to 2, and stone's ceiling from 5600 to 6500. The worker's
//   `high` tier was asking for LESS room than `medium` — 4400 x 1.25 = 5500 on the tier chosen for
//   the hardest steps — and a 16-step build died on step 1 with "the model reached its output
//   limit". Asking past the ceiling is free because gateway.ts clamps before it reserves, so high
//   now resolves to whatever the model will give. stone and rune are the same model and were given
//   different ceilings; they now match.
export const EFFORT_SCALE = Object.freeze({ low: 1, medium: 2.5, high: 2 });
const RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

/** apps/worker/src/gateway.ts — DEFAULT_MODELS: the per-call ceiling and the model behind each key. */
export const GATEWAY_CEILING = Object.freeze({ clay: 6500, stone: 6500, rune: 6500, vision: 4000, memory: 800 });
export const GATEWAY_MODEL_ID = Object.freeze({
  clay: '@cf/qwen/qwen3-30b-a3b-fp8',
  stone: '@cf/zai-org/glm-5.3-flash',
  rune: '@cf/zai-org/glm-5.3-flash',
  memory: '@cf/qwen/qwen3-30b-a3b-fp8',
  vision: '@cf/zai-org/glm-5.3-flash',
});

/** Product vocabulary in, internal specialist out. A person picks Plan / Agent / Super Agent. */
export const MODE_ALIASES = Object.freeze({
  plan: 'clay', clay: 'clay',
  agent: 'stone', stone: 'stone',
  'super-agent': 'rune', super: 'rune', rune: 'rune',
});

/** Mirrors gatewayModelFor in apps/worker/src/do/session.ts. */
export function gatewayFor(mode, lane) {
  if (lane === 'apple') return 'stone';
  if (lane === 'apple-max') return mode === 'clay' ? 'stone' : mode;
  return mode;
}

/**
 * The effort a lane asks for BEFORE any escalation signal — a FLOOR, not the whole story.
 *
 * chooseEffort starts at BASELINE[mode], raises it to ENTITLEMENT_FLOOR[lane], then raises it
 * further on signals (ambiguous request, visual design work, interface design work, recovery from
 * a failed step). Signals only ever RAISE. /api/admin/model-test does not run classifyRequest, so
 * a run must record `effortIsAFloor` rather than claim to have reproduced the policy's verdict on
 * these particular prompts — and for UI prompts specifically, `uiDesignTask` would raise a real
 * request to `high` anyway, so the floor is where a real build starts, not below it.
 */
export function effortFor(mode, lane) {
  const base = BASELINE_EFFORT[mode];
  const floor = lane ? ENTITLEMENT_FLOOR[lane] : undefined;
  return floor !== undefined && RANK[floor] > RANK[base] ? floor : base;
}

/** Mirrors tokensForEffort in apps/worker/src/reasoning.ts. */
export const tokensForEffort = (base, effort) => Math.round(base * EFFORT_SCALE[effort]);

/**
 * Resolve one run's settings, in the worker's own order, with everything that went into it kept.
 *
 * @param {{lane?: string|null, mode?: string, model?: string|null, effort?: string|null, maxTokens?: string|number|null}} input
 */
export function resolveSettings(input = {}) {
  const lane = input.lane ?? null;
  const modeArg = input.mode ?? 'agent';
  const mode = MODE_ALIASES[modeArg] ?? null;
  if (!mode) throw new Error(`unknown mode "${modeArg}"`);

  const gateway = lane ? gatewayFor(mode, lane) : (input.model ?? mode);
  const effort = input.effort ?? (lane ? effortFor(mode, lane) : BASELINE_EFFORT[mode] ?? 'high');

  const requestedTokens = Number(
    input.maxTokens ?? (lane ? tokensForEffort(MODE_BASE_TOKENS[mode], effort) : GATEWAY_CEILING[gateway] ?? 5500),
  );
  const ceiling = GATEWAY_CEILING[gateway] ?? null;
  const effectiveTokens = ceiling === null ? requestedTokens : Math.min(requestedTokens, ceiling);

  return {
    lane,
    productMode: lane ? modeArg : null,
    specialist: mode,
    gateway,
    modelId: GATEWAY_MODEL_ID[gateway] ?? '(unknown)',
    effort,
    effortIsAFloor: Boolean(lane) && !input.effort,
    baseTokens: MODE_BASE_TOKENS[mode] ?? null,
    requestedTokens,
    gatewayCeiling: ceiling,
    effectiveTokens,
    clampedByCeiling: effectiveTokens < requestedTokens,
  };
}
