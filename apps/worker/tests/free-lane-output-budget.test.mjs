/**
 * THE FREE LANE MUST BE ABLE TO FINISH A TOOL CALL IT WAS OFFERED.
 *
 * The toolset is chosen by Plan/Agent while the product-model entitlement is independent. This
 * guard keeps a free Agent run from receiving a smaller output budget than the toolset it can call.
 *
 * WHAT THIS ASSERTS is the number that actually reaches the provider, which is neither half on its
 * own: llmChat computes `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, so the request
 * (`tokensForEffort(baseTokensFor(mode), effort)`) and the model config's ceiling
 * (`DEFAULT_MODELS[gatewayModelFor(mode)].maxTokens`) are two different numbers and
 * the free lane was broken by the second one. A guard that read only `MODE_BASE_TOKENS` would have
 * stayed green through the whole defect.
 *
 * The floor is not invented here. `MODE_BASE_TOKENS[mode]` is this product's own measured answer to
 * "what does a tool call in this toolset cost to express" — the market-stall measurement recorded
 * in gateway.ts — so the assertion is that the lane is given at least the budget its own toolset is
 * sized for, whatever that number becomes later.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'free-lane-budget-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } } export class WorkerEntrypoint { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

function bundle(entry, name) {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [entry, '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${out}`],
    { stdio: 'pipe', cwd: WORKER },
  );
  return import(pathToFileURL(out).href);
}

const S = await bundle(join(WORKER, 'src', 'do', 'session.ts'), 'session');
const G = await bundle(join(WORKER, 'src', 'gateway.ts'), 'gateway');
const R = await bundle(join(WORKER, 'src', 'reasoning.ts'), 'reasoning');
const ROUTER = await bundle(join(WORKER, 'src', 'router.ts'), 'router');
const TOOLS = await bundle(join(WORKER, 'src', 'tools.ts'), 'tools');

/** Exactly what llmChat will send as `max_tokens` for one step of this lane. */
function budget(mode, productModel, effort) {
  const requested = R.tokensForEffort(S.baseTokensFor(mode), effort);
  const cfg = G.DEFAULT_MODELS[S.gatewayModelFor(mode, productModel)];
  assert.ok(cfg, `no model config for ${S.gatewayModelFor(mode, productModel)}`);
  return Math.min(requested, cfg.maxTokens);
}

/** The toolset the lane is actually offered, from the same function runStep calls. */
function toolset(mode) {
  return ROUTER.toolsForMode(mode, true, Object.keys(TOOLS.TOOLS));
}

test('the free Agent lane gets the full builder toolset — so this is not a Plan-sized job', () => {
  const free = toolset('agent');
  assert.ok(free.has('run_luau'), 'the free lane is offered run_luau');
  // toolsForMode does not branch on productModel at all, which is the whole premise of the defect.
  assert.deepEqual([...toolset('agent')].sort(), [...toolset('agent')].sort());
  assert.ok(free.size > toolset('plan').size, 'Agent mode is a strictly wider toolset than Plan');
});

test('every lane gets at least the budget its own toolset is sized for', () => {
  for (const mode of ['agent']) {
    for (const productModel of ['apple', 'apple-max', undefined]) {
      const floor = S.baseTokensFor(mode);
      const got = budget(mode, productModel, 'high');
      assert.ok(
        got >= floor,
        `${productModel ?? 'legacy'}/${mode}: max_tokens ${got} is below the ${floor} its toolset is sized for`,
      );
    }
  }
});

test('one engine, one output room: a retired id gets exactly what StudPilot gets (V3 G01)', () => {
  const studpilot = budget('agent', 'apple', 'high');
  const legacy = budget('agent', 'apple-max', 'high');
  // The measured failure was 2000 vs 5500 — a third of the room for the identical toolset.
  assert.ok(studpilot >= 5000, `the Agent lane gets ${studpilot} output tokens`);
  assert.equal(legacy, studpilot, 'a retired product model id is served by the same lane as StudPilot');
});

test('the one request kind asks for enough that its model can answer at all', () => {
  //[[ THIS WAS "Plan mode asks for enough", MEASURED 2026-09-20: a reasoning model given 1600
  //   output tokens returned finishReason "length" and ZERO characters; at 2000 one prompt in three
  //   was answered; at 3000 it answered completely. The Plan mode is gone (V3 G01), the floor is not:
  //   it now binds the one behaviour every request runs.
  //
  //   gateway.ts clamps with `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)` before it
  //   reserves, so asking past the ceiling is free and asking below it is the only way our own
  //   arithmetic can cut a reply short. The ceiling is READ from the routed model, never a literal. ]]
  const asked = R.tokensForEffort(S.baseTokensFor('agent'), 'high');
  assert.ok(asked >= 3200, `a request asks for ${asked}; below 3200 its model was measured returning nothing`);
  const routed = G.DEFAULT_MODELS[S.gatewayModelFor('agent', 'apple')];
  assert.ok(routed, 'the model a request routes to could not be resolved; nothing was verified');
  assert.ok(asked >= routed.maxTokens,
    `a request asks for ${asked}, below the ${routed.maxTokens} its model is sized at — our own `
    + 'arithmetic, not the model, would be what cuts the reply short');
  assert.equal(budget('agent', 'apple', 'high'), routed.maxTokens,
    'the gateway clamp is no longer resolving the high-effort request to the model ceiling');
});
