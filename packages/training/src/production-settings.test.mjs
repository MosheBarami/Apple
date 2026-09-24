import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASELINE_EFFORT, EFFORT_SCALE, ENTITLEMENT_FLOOR, GATEWAY_CEILING, GATEWAY_MODEL_ID, MODE_BASE_TOKENS,
  PRODUCT_MODES, RETIRED_MODES,
  cacheBustTokens, effortFor, gatewayFor, resolveMode, resolveSettings, tokensForEffort,
} from './production-settings.mjs';

/**
 * A MIRROR IS ONLY SAFE WHILE SOMETHING CHECKS IT AGAINST WHAT IT MIRRORS.
 *
 * production-settings.mjs copies four tables out of apps/worker/src. A copy that nobody compares
 * is a copy that silently goes stale, and a stale copy here does not break a build — it produces
 * an eval that reports a real number for settings production stopped using. That is exactly how
 * `PRODUCTION_BUDGET.clay = 6500` survived a whole revision after MODE_BASE_TOKENS.clay moved from
 * 5200 to 4400.
 *
 * So these tests READ THE WORKER'S OWN SOURCE. They do not import it — the worker is TypeScript
 * with Cloudflare types and importing it from here would need a bundler for no benefit — they
 * parse the literal out of the file and compare. When the worker moves, this goes red and names
 * the number that moved.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER_SRC = resolve(HERE, '..', '..', '..', 'apps', 'worker', 'src');
const read = (rel) => readFileSync(resolve(WORKER_SRC, rel), 'utf8');

test('MODE_BASE_TOKENS matches apps/worker/src/do/session.ts', () => {
  const src = read('do/session.ts');
  const m = /const MODE_BASE_TOKENS: Record<ProductMode, number> = \{([^}]*)\}/.exec(src);
  assert.ok(m, 'MODE_BASE_TOKENS is no longer declared the way this guard reads it');
  const found = Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map(([, k, v]) => [k, Number(v)]));
  assert.deepEqual(found, { ...MODE_BASE_TOKENS });
  //[[ THE WORKER'S OWN RUNTIME ALLOWLIST IS THE AUTHORITY ON WHICH MODES EXIST, AND IT IS A
  //   DIFFERENT DECLARATION FROM THE TABLE ABOVE. `VALID_MODES` is the Set `asProductMode` checks;
  //   MODE_BASE_TOKENS is what sizes the budget. They must name the same modes, and a mode added to
  //   one and not the other is a mode that either cannot run or runs with an undefined budget. ]]
  const valid = /const VALID_MODES = new Set<ProductMode>\(\[([^\]]*)\]\)/.exec(src);
  assert.ok(valid, 'VALID_MODES is no longer declared the way this guard reads it');
  const allowed = [...valid[1].matchAll(/'([^']+)'/g)].map(([, k]) => k);
  assert.deepEqual([...PRODUCT_MODES].sort(), [...allowed].sort(),
    'the modes this package resolves and the modes the worker accepts have diverged');
});

test('gatewayModelFor ignores the lane, and the mirror says the same thing', () => {
  const src = read('do/session.ts');
  const body = /export function gatewayModelFor\([^)]*\): string \{([\s\S]*?)\n\}/.exec(src);
  assert.ok(body, 'gatewayModelFor is no longer declared the way this guard reads it');
  //[[ THE LANE NO LONGER ROUTES. 2026-09-22: entitlement still controls effort policy and paid
  //   capability, but it no longer selects a different foundation model, so the function voids its
  //   second argument and returns the mode. The retired body pinned the free lane to `stone` and
  //   sent Apple MAX to `rune` for the non-clay modes; none of those keys exist in the worker now.
  //
  //   Reading the worker's own body is what makes this a mirror rather than a coincidence. If an
  //   Apple lane ever routes again, the two sides disagree and this goes red — instead of the
  //   mirror quietly reporting a request the worker would not send.
  //
  //   RESTATED 2026-09-23 (D-VISION-1). This pinned `void productModel`. The picker's outside
  //   models (Gemini, GPT-5.6) are product models too, and they DO select their own key — but only
  //   through the registry's `unified-billing` route, which neither Apple lane has. So the
  //   property is: the fall-through is the mode, and every other return is behind that route. ]]
  const code = body[1].replace(/\/\/.*$/gm, '');
  assert.match(code, /return mode;\s*$/, 'gatewayModelFor no longer falls through to the mode');
  const returns = [...code.matchAll(/^.*\breturn\b.*$/gm)].map((m) => m[0].trim());
  for (const r of returns.slice(0, -1)) {
    assert.match(r, /route === 'unified-billing'\) return productModel;$/,
      `gatewayModelFor gained a return that is not behind the outside-model route: ${r}`);
  }

  for (const mode of PRODUCT_MODES) {
    for (const lane of ['apple', 'apple-max']) {
      assert.equal(gatewayFor(mode, lane), mode, `the mirror routes ${mode}/${lane} away from the mode`);
    }
  }
  // Both product lanes land on the same model, in BOTH modes. That is the fact that decides
  // everything about training in this package: there is no lesser production lane a fine-tune could
  // improve, and now no mode-specific foundation model either.
  const models = PRODUCT_MODES.map((mode) => GATEWAY_MODEL_ID[gatewayFor(mode, 'apple')]);
  assert.equal(new Set(models).size, 1,
    `production now sends ${PRODUCT_MODES.join(' and ')} to different models, so a fine-tune for one `
    + 'mode is no longer a fine-tune for the product');
  assert.equal(GATEWAY_MODEL_ID[gatewayFor('agent', 'apple')], GATEWAY_MODEL_ID[gatewayFor('agent', 'apple-max')]);
});

//[[ THE RETIRED VOCABULARY MUST BE REFUSED BY NAME, NOT RESOLVE TO undefined.
//
//   Before 2026-09-22 the mode table was an alias map whose keys included `clay`/`stone`/`rune` and
//   `super-agent`. Deleting those keys silently would leave `MODE_ALIASES['stone']` as `undefined`,
//   which is falsy — so every caller's `if (!mode)` guard still fired, but the error said "unknown
//   mode" and named nothing. A caller reading that has no idea the name was retired rather than
//   mistyped, and `resolveSettings` would have built a settings object with a null gateway.
//
//   This asserts the three things that make the refusal useful, and it is the non-vacuity half of
//   the rename: RETIRED_MODES must be non-empty, must cover every name this package used to accept,
//   and must never overlap the live modes.
test('the retired mode names are refused by name, and the refusal names the replacement', () => {
  assert.ok(Object.keys(RETIRED_MODES).length >= 5, 'RETIRED_MODES lost the names it exists to explain');
  for (const name of Object.keys(RETIRED_MODES)) {
    assert.ok(!PRODUCT_MODES.includes(name), `"${name}" is both retired and live`);
    assert.throws(() => resolveMode(name), /is retired/,
      `"${name}" resolved instead of being refused — a stale caller would get undefined, not an error`);
  }
  // The message has to be actionable, so the replacement is named where one exists.
  assert.throws(() => resolveMode('stone'), /now "agent"/);
  assert.throws(() => resolveMode('clay'), /now "plan"/);
  // A name that was never ours is a typo, and says so differently.
  assert.throws(() => resolveMode('stoned'), /unknown mode/);
  assert.throws(() => resolveMode(undefined), /non-empty string/);
  // And the live names resolve to themselves.
  for (const mode of PRODUCT_MODES) assert.equal(resolveMode(mode), mode);
  // resolveSettings refuses too, rather than returning a settings object with no gateway.
  assert.throws(() => resolveSettings({ lane: 'apple', mode: 'super-agent' }), /is retired/);
});

test('the effort multipliers and entitlement floor match apps/worker/src/reasoning.ts', () => {
  const src = read('reasoning.ts');
  //[[ PARSE THE TABLE AND COMPARE IT, RATHER THAN PINNING THE WHOLE LINE AS A STRING.
  //   The string form went red on the rename for the right reason but read as noise; parsing means
  //   the guard names the mode whose effort moved instead of printing a line the reader must diff
  //   by eye. The declaration shape is still asserted, so a move to a computed table is caught. ]]
  const baseline = /const BASELINE: Record<ProductMode, Effort> = \{([^}]*)\}/.exec(src);
  assert.ok(baseline, 'BASELINE is no longer declared the way this guard reads it');
  const baselineFound = Object.fromEntries(
    [...baseline[1].matchAll(/(?:'([^']+)'|(\w+)):\s*'(\w+)'/g)].map(([, q, w, v]) => [q ?? w, v]),
  );
  assert.deepEqual(baselineFound, { ...BASELINE_EFFORT }, 'the per-mode baseline effort moved');

  const floor = /const ENTITLEMENT_FLOOR: Record<ProductModel, Effort> = \{([^}]*)\}/.exec(src);
  assert.ok(floor, 'ENTITLEMENT_FLOOR is no longer declared the way this guard reads it');
  const floorFound = Object.fromEntries(
    [...floor[1].matchAll(/(?:'([^']+)'|(\w+)):\s*'(\w+)'/g)].map(([, q, w, v]) => [q ?? w, v]),
  );
  assert.deepEqual(floorFound, { ...ENTITLEMENT_FLOOR }, 'the per-lane entitlement floor moved');

  // tokensForEffort scales with a ternary, not a table, so the ternary itself is what is pinned.
  const scale = /const scale = effort === 'high' \? ([\d.]+) : effort === 'medium' \? ([\d.]+) : ([\d.]+);/.exec(src);
  assert.ok(scale, 'tokensForEffort no longer scales the way this guard reads it');
  assert.deepEqual(
    { high: Number(scale[1]), medium: Number(scale[2]), low: Number(scale[3]) },
    { high: EFFORT_SCALE.high, medium: EFFORT_SCALE.medium, low: EFFORT_SCALE.low },
  );
  //[[ 5500 -> 8800. `high` used to scale by 1.25 and now scales by 2, so it asks PAST every
  //   model ceiling and gateway.ts clamps it down. That is free: the clamp runs before the
  //   neuron reservation, so the request resolves to exactly what the model will give. The old
  //   1.25 made the hardest effort tier ask for less room than `medium`, and a 16-step build
  //   died on step 1 at "the model reached its output limit". ]]
  assert.equal(tokensForEffort(4400, 'high'), 8800);
});

test('the gateway ceilings and model ids match apps/worker/src/gateway.ts', () => {
  const src = read('gateway.ts');
  for (const [key, ceiling] of Object.entries(GATEWAY_CEILING)) {
    const line = new RegExp(`^\\s*${key}: \\{ id: '([^']+)'.*maxTokens: (\\d+)`, 'm').exec(src);
    assert.ok(line, `gateway.ts has no ${key} config`);
    assert.equal(line[1], GATEWAY_MODEL_ID[key], `${key} model id drifted`);
    assert.equal(Number(line[2]), ceiling, `${key} ceiling drifted`);
  }
});

test('an Apple MAX Agent request resolves to the settings the worker would send', () => {
  const s = resolveSettings({ lane: 'apple-max', mode: 'agent' });
  assert.equal(s.gateway, 'agent');
  assert.equal(s.modelId, '@cf/zai-org/glm-5.3-flash');
  assert.equal(s.effort, 'high');
  assert.equal(s.baseTokens, 4400);
  assert.equal(s.requestedTokens, 8800);          // 4400 x 2
  assert.equal(s.gatewayCeiling, 6500);
  assert.equal(s.effectiveTokens, 6500);          // asked past the ceiling; the clamp resolves it
  assert.equal(s.clampedByCeiling, true);
  assert.equal(s.effortIsAFloor, true);
});

//[[ THE CLAMP FLAG IS DERIVED, AND THE RUN REPORTS BOTH NUMBERS WHETHER OR NOT IT FIRED.
//
//   This replaced a test built on `--mode super-agent`, a mode that no longer exists. Its property
//   was worth keeping and is now easier to state honestly: a settings object must carry BOTH the
//   budget the lane asked for and the ceiling that may have replaced it, and `clampedByCeiling` must
//   follow from those two rather than be asserted by hand.
//
//   The pair below is the whole point. The free lane in Agent asks for 8800 against the 6500 ceiling
//   and is clamped; the free lane in Plan asks for 4400 and is not. A run that printed only the
//   request would name a number the provider never saw in the first case, and a run that printed
//   only the effective number would hide what the lane asked for in the second.
test('the clamp flag is derived from the two numbers, and the run reports both', () => {
  const clamped = resolveSettings({ lane: 'apple', mode: 'agent' });
  assert.equal(clamped.gateway, 'agent');
  assert.equal(clamped.requestedTokens, tokensForEffort(MODE_BASE_TOKENS.agent, effortFor('agent', 'apple')));
  assert.equal(clamped.requestedTokens, 8800);
  assert.equal(clamped.effectiveTokens, 6500);
  assert.equal(clamped.clampedByCeiling, true);

  const roomy = resolveSettings({ lane: 'apple', mode: 'plan' });
  assert.equal(roomy.gateway, 'plan');
  assert.equal(roomy.requestedTokens, 4400);
  assert.equal(roomy.effectiveTokens, 4400);
  assert.equal(roomy.clampedByCeiling, false, 'the flag must be derived from the numbers, not assumed');

  // The entitlement floor is now the ONLY thing separating the lanes: apple-max raises Plan from its
  // `low` baseline to `high`, so the paid Plan lane asks for more room than the free one while both
  // land on the same model and the same ceiling.
  const paidPlan = resolveSettings({ lane: 'apple-max', mode: 'plan' });
  assert.equal(paidPlan.effort, 'high');
  assert.ok(paidPlan.requestedTokens > roomy.requestedTokens, 'MAX no longer buys more room in Plan');
  assert.equal(paidPlan.clampedByCeiling, true);
});

test('an explicit effort is no longer a floor, and an explicit budget overrides the arithmetic', () => {
  const s = resolveSettings({ lane: 'apple-max', mode: 'agent', effort: 'low', maxTokens: 900 });
  assert.equal(s.effort, 'low');
  assert.equal(s.effortIsAFloor, false);
  assert.equal(s.requestedTokens, 900);
  assert.equal(s.effectiveTokens, 900);
});

//[[ THE CACHE-BUSTING LEVER, WHICH WAS A NO-OP FOR A WHOLE REVISION AND SAID NOTHING.
//
//   eval-ui-generation.mjs shaved `requestedTokens` and printed "cacheBusting: maxTokens is
//   decremented". That worked while the lane resolved to requested 5500 against a 5600 ceiling.
//   Commit 8b61c91 moved requested to 8800 and the ceiling to 6500, so both 8800 and 8799 reached
//   the provider as 6500, the response cache is keyed on what the provider is asked for, and every
//   repeat after that was a replay billed in full. Nothing went red, because nothing asked whether
//   the shave still reached anything.
//
//   THE PROPERTY, and it is the one that matters rather than the arithmetic: for n > 1 the value
//   sent must be a value the PROVIDER sees as different from what sample 1 produces.
test('a cache-busting budget is one the provider actually sees as different', () => {
  for (const [lane, mode] of [['apple', 'agent'], ['apple-max', 'agent'], ['apple', 'plan'], ['apple-max', 'plan']]) {
    const s = resolveSettings({ lane, mode });
    const seen = (n) => (s.gatewayCeiling === null ? n : Math.min(n, s.gatewayCeiling));

    assert.equal(cacheBustTokens(s, 1), s.requestedTokens,
      `${lane}/${mode}: sample 1 must send production's own body, unshaved`);

    const previous = new Set([s.effectiveTokens]);
    for (const n of [2, 3, 4]) {
      const sent = cacheBustTokens(s, n);
      assert.ok(sent !== null, `${lane}/${mode}: sample ${n} has no bustable budget`);
      const arrives = seen(sent);
      assert.ok(!previous.has(arrives),
        `${lane}/${mode}: sample ${n} sends ${sent}, which the provider sees as ${arrives} — a value an `
        + 'earlier sample already produced, so this is a replay and would be billed as a sample.');
      previous.add(arrives);
    }
  }
});

test('shaving the REQUESTED budget is what broke, and the property catches it', () => {
  // The old rule, written out. It is not imported from anywhere -- it is the line that shipped.
  const oldRule = (s, n) => s.requestedTokens - (n - 1);
  const s = resolveSettings({ lane: 'apple', mode: 'agent' });
  assert.equal(s.clampedByCeiling, true, 'this lane must be clamped or the regression cannot be shown');
  const arrives = (v) => Math.min(v, s.gatewayCeiling);
  assert.equal(arrives(oldRule(s, 2)), arrives(oldRule(s, 1)),
    'the old rule sent a different number that arrived identical -- that is the whole defect');
  assert.notEqual(arrives(cacheBustTokens(s, 2)), arrives(cacheBustTokens(s, 1)),
    'the new rule must arrive different');
});

test('a budget too small to shave refuses instead of returning a replay', () => {
  const s = resolveSettings({ lane: 'apple-max', mode: 'agent', maxTokens: 1 });
  assert.equal(cacheBustTokens(s, 1), 1);
  assert.equal(cacheBustTokens(s, 2), null, 'shaving 1 to 0 is not a request; it must refuse');
  assert.equal(cacheBustTokens(s, 0), null);
  assert.equal(cacheBustTokens(s, 1.5), null);
});

//[[ THE MUTATION THAT STAYED GREEN, KEPT AS A TEST SO THE DELETION IS NOT UNDONE BY A LATER READER.
//   The first draft also returned null when the shaved value would clamp back up to effectiveTokens.
//   Removing that branch turned nothing red -- it cannot fire, because effectiveTokens is already
//   min(requested, ceiling) and subtracting a positive number never clamps back up. The branch was
//   deleted. This asserts the arithmetic fact it was defending against, so nobody re-adds it as
//   reassurance and nobody removes the real `sent < 1` refusal thinking it is the same thing.
test('a shaved budget is always strictly under the ceiling, which is why no re-clamp guard is needed', () => {
  for (const [lane, mode] of [['apple', 'agent'], ['apple-max', 'plan'], ['apple', 'plan']]) {
    const s = resolveSettings({ lane, mode });
    for (const n of [2, 3, 10]) {
      const sent = cacheBustTokens(s, n);
      assert.ok(sent < s.effectiveTokens, `${lane}/${mode} n=${n}: ${sent} is not below ${s.effectiveTokens}`);
      if (s.gatewayCeiling !== null) assert.ok(sent < s.gatewayCeiling, 'a shaved budget must be under the ceiling');
    }
  }
});
