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

//[[ 2026-09-22: THE MODE VOCABULARY IS NOW THE GATEWAY VOCABULARY, AND THE LANE STOPPED ROUTING.
//
//   The worker settled on `ProductMode = 'plan' | 'agent'` with Autonomous as a boolean ON Agent
//   rather than a third mode. The keys in apps/worker/src/gateway.ts DEFAULT_MODELS were renamed to
//   match, so `plan` and `agent` are simultaneously the product mode, the gateway key and the model
//   the provider is asked for. `clay`/`stone`/`rune` no longer exist anywhere in the worker.
//
//   `gatewayModelFor(mode, productModel)` now ignores its second argument entirely and returns the
//   mode. That is a real product change, not a simplification: the entitlement axis still controls
//   effort policy and paid capability, but it no longer selects a different foundation model. So
//   every lane in every mode sends the same request — which makes the §10 claim in
//   docs/frontier-for-roblox.md hold MORE widely, not less, and roblox-frontier.test.mjs asserts
//   that rather than the retired `super-agent -> rune` difference.
//
//   The retired names are kept below as an explicit REJECTION list. A caller passing `stone` gets a
//   named error instead of `undefined` propagating into a settings object that then reports a null
//   gateway — which is the failure this module exists to prevent.
//]]

/** apps/worker/src/do/session.ts — MODE_BASE_TOKENS. */
export const MODE_BASE_TOKENS = Object.freeze({ plan: 4400, agent: 4400 });

/** apps/worker/src/reasoning.ts — BASELINE, ENTITLEMENT_FLOOR, and the effort multipliers. */
export const BASELINE_EFFORT = Object.freeze({ plan: 'low', agent: 'high' });
export const ENTITLEMENT_FLOOR = Object.freeze({ apple: 'low', 'apple-max': 'high' });

//   2026-09-20: high moved from 1.25 to 2, and the Agent ceiling from 5600 to 6500. The worker's
//   `high` tier was asking for LESS room than `medium` — 4400 x 1.25 = 5500 on the tier chosen for
//   the hardest steps — and a 16-step build died on step 1 with "the model reached its output
//   limit". Asking past the ceiling is free because gateway.ts clamps before it reserves, so high
//   now resolves to whatever the model will give. The two modes are the same model and are given
//   the same ceiling.
export const EFFORT_SCALE = Object.freeze({ low: 1, medium: 2.5, high: 2 });
const RANK = Object.freeze({ low: 0, medium: 1, high: 2 });

/** apps/worker/src/gateway.ts — DEFAULT_MODELS: the per-call ceiling and the model behind each key. */
export const GATEWAY_CEILING = Object.freeze({ plan: 6500, agent: 6500, vision: 4000, memory: 800 });
export const GATEWAY_MODEL_ID = Object.freeze({
  plan: '@cf/zai-org/glm-5.3-flash',
  agent: '@cf/zai-org/glm-5.3-flash',
  memory: '@cf/qwen/qwen3-30b-a3b-fp8',
  vision: '@cf/zai-org/glm-5.3-flash',
});

/**
 * The modes a person can actually pick, DERIVED from the worker's own table rather than retyped.
 * A second hand-written list here is rule 7 of the working rules: it drifts, and nothing notices.
 */
export const PRODUCT_MODES = Object.freeze(Object.keys(MODE_BASE_TOKENS));

/**
 * Names this package accepted before the product contract settled on Plan/Agent, and what they
 * became. Nothing resolves through this — it exists so `resolveMode` can NAME the retirement in its
 * error instead of reporting an unknown mode, which is the difference between a fixable message and
 * a hunt through git history.
 */
export const RETIRED_MODES = Object.freeze({
  clay: 'plan',
  stone: 'agent',
  rune: 'agent',
  'super-agent': 'agent',
  super: 'agent',
  specialist: null,
});

/**
 * Canonical product mode in, canonical product mode out — or a thrown error naming why not.
 *
 * Mirrors `asProductMode` in apps/worker/src/do/session.ts, which is the runtime allowlist that
 * decides this in production. A retired name throws rather than returning null so that a stale
 * caller cannot quietly resolve to `undefined` and report a settings object with no gateway.
 */
export function resolveMode(name) {
  if (typeof name !== 'string' || name === '') {
    throw new Error(`mode must be a non-empty string, got ${JSON.stringify(name)}`);
  }
  if (Object.prototype.hasOwnProperty.call(MODE_BASE_TOKENS, name)) return name;
  const retired = Object.prototype.hasOwnProperty.call(RETIRED_MODES, name) ? RETIRED_MODES[name] : undefined;
  if (retired !== undefined) {
    throw new Error(
      `mode "${name}" is retired — the product has ${PRODUCT_MODES.join(' / ')}`
      + (retired ? `, and "${name}" is now "${retired}"` : ''),
    );
  }
  throw new Error(`unknown mode "${name}" — the product has ${PRODUCT_MODES.join(' / ')}`);
}

/**
 * Mirrors gatewayModelFor in apps/worker/src/do/session.ts, which reads:
 *
 *     export function gatewayModelFor(mode: ProductMode, productModel?: ProductModel): string {
 *       void productModel;
 *       return mode;
 *     }
 *
 * The lane is accepted and ignored so callers keep working, but it must not influence the answer —
 * production-settings.test.mjs pins the worker's own `void productModel` line, so if the lane ever
 * routes again the mirror goes red instead of reporting a request the worker would not send.
 */
export function gatewayFor(mode, lane) {
  void lane;
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
  const mode = resolveMode(input.mode ?? 'agent');

  const gateway = lane ? gatewayFor(mode, lane) : (input.model ?? mode);
  const effort = input.effort ?? (lane ? effortFor(mode, lane) : BASELINE_EFFORT[mode] ?? 'high');

  const requestedTokens = Number(
    input.maxTokens ?? (lane ? tokensForEffort(MODE_BASE_TOKENS[mode], effort) : GATEWAY_CEILING[gateway] ?? 5500),
  );
  const ceiling = GATEWAY_CEILING[gateway] ?? null;
  const effectiveTokens = ceiling === null ? requestedTokens : Math.min(requestedTokens, ceiling);

  return {
    lane,
    productMode: lane ? mode : null,
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

/**
 * THE `maxTokens` VALUE THAT BUSTS THE RESPONSE CACHE FOR SAMPLE N, OR `null` WHEN IT CANNOT.
 *
 * WHY THIS IS ONE FUNCTION AND NOT A LINE IN EACH RUNNER. The account's AI Gateway serves a
 * byte-identical request from a response cache and bills the replay in full, so a repeat over an
 * identical body is one sample printed twice. Both runners bust it by shaving `maxTokens`, which is
 * in the request body and is not read by the model. Both got the rule wrong in the same way, and it
 * took a live probe to see it, so the rule lives here with its evidence.
 *
 * MEASURED 2026-09-21, one item, six calls against the deployed worker:
 *
 *   sent 8800  clamped to 6500   6527 ms   sha 025cbe29   fresh
 *   sent 8800  clamped to 6500    255 ms   sha 025cbe29   REPLAY
 *   sent 8799  clamped to 6500    187 ms   sha 025cbe29   REPLAY — the shave changed nothing
 *   sent 6000  unclamped         4342 ms   sha b56bd8f3   different answer
 *   sent 5999  unclamped        15117 ms   sha ae23b7de   different answer
 *   sent 6499  unclamped         6372 ms   sha 88fe0d30   different answer — the corrected shave
 *
 * The cache is keyed on what the PROVIDER is asked for, which is the value after llmChat's clamp.
 * Shaving the REQUESTED value — 8800 to 8799 — is erased by the clamp and busts nothing. Shaving the
 * EFFECTIVE value — 6500 to 6499 — reaches the provider and does.
 *
 * `n === 1` returns production's exact requested value: the first sample is the real body. `n > 1`
 * returns `effectiveTokens - (n - 1)`, which is strictly below the ceiling and therefore reaches the
 * provider unchanged. `null` means there is no bustable value and the caller must not run.
 *
 * A DRAFT OF THIS ALSO RETURNED null WHEN THE SHAVED VALUE WOULD CLAMP BACK TO `effectiveTokens`.
 * That branch cannot fire: `effectiveTokens` is already `min(requested, ceiling)`, so subtracting a
 * positive number can never clamp back up. A mutation test removed the branch and every test stayed
 * green, which is what unreachable code looks like from the outside. It was deleted rather than
 * kept as reassurance.
 */
export function cacheBustTokens(settings, n) {
  if (!Number.isInteger(n) || n < 1) return null;
  if (n === 1) return settings.requestedTokens;
  const sent = settings.effectiveTokens - (n - 1);
  return sent < 1 ? null : sent;
}
