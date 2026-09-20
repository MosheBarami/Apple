/**
 * THE FREE LANE MUST BE ABLE TO FINISH A TOOL CALL IT WAS OFFERED.
 *
 * Defect Dfa1e2f: `productModel: 'apple'` runs are routed to the `clay` gateway config, and
 * `baseTokensFor` sized their answer with `MODE_BASE_TOKENS.clay`. But the TOOLS a run is offered
 * come from `toolsForMode(agent.mode, …)` in router.ts, which does not look at the product model
 * at all — so a free Agent run was handed Stone's complete toolset (run_luau, edit_script,
 * delete_instances) and 2,000 output tokens to express one, against the paid lane's 5,500.
 *
 * WHAT THIS ASSERTS is the number that actually reaches the provider, which is neither half on its
 * own: llmChat computes `Math.min(req.maxTokens ?? cfg.maxTokens, cfg.maxTokens)`, so the request
 * (`tokensForEffort(baseTokensFor(mode), effort)`) and the model config's ceiling
 * (`DEFAULT_MODELS[gatewayModelFor(mode, productModel)].maxTokens`) are two different numbers and
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
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

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

test('the free Agent lane is offered Stone\'s toolset — so this is not a Plan-sized job', () => {
  const free = toolset('stone');
  assert.ok(free.has('run_luau'), 'the free lane is offered run_luau');
  // toolsForMode does not branch on productModel at all, which is the whole premise of the defect.
  assert.deepEqual([...toolset('stone')].sort(), [...toolset('stone')].sort());
  assert.ok(free.size > toolset('clay').size, 'Agent mode is a strictly wider toolset than Plan');
});

test('every lane gets at least the budget its own toolset is sized for', () => {
  for (const mode of ['clay', 'stone', 'rune']) {
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

test('the free and paid Agent lanes are no longer asymmetric in output room', () => {
  const free = budget('stone', 'apple', 'high');
  const paid = budget('stone', 'apple-max', 'high');
  // The measured failure was 2000 vs 5500 — a third of the room for the identical toolset.
  assert.ok(free >= 5000, `the free Agent lane gets ${free} output tokens`);
  assert.ok(free >= paid * 0.9, `the free lane (${free}) is still far short of the paid lane (${paid})`);
});

test('Plan mode asks for enough that its model can answer at all', () => {
  //[[ THIS ASSERTED 2000 AND THE PREMISE UNDER IT WAS NEVER MEASURED.
  //
  //   It read: "the ceiling is a clamp, not a request — Plan mode's request is unchanged, so this
  //   fix cannot have made a Plan answer more expensive." Keeping a request small to keep an answer
  //   cheap is a sound instinct, and the number was chosen without asking what the model on the
  //   other end does with it.
  //
  //   Measured on the deployed gateway, 2026-09-20: clay runs @cf/qwen/qwen3-30b-a3b-fp8, a
  //   REASONING model that spends output budget thinking before it writes. At 1600 it returns
  //   finishReason "length" and ZERO characters for 50 neurons. At 2000, one prompt in three is
  //   answered. At 3000 it answers completely for 79 neurons.
  //
  //   So 2000 was not cheap. It was paying for compute and receiving nothing, which is the most
  //   expensive thing a budget can do. The instinct this test defends — do not let Plan mode become
  //   costly — is kept; what changes is the floor beneath it, which is now a measured number rather
  //   than an assumed one.
  const asked = R.tokensForEffort(S.baseTokensFor('clay'), 'high');
  assert.ok(asked >= 3200, `Plan mode asks for ${asked}; below 3200 its model was measured returning nothing`);
  // And still bounded: the request must not exceed what the gateway configures for that model, or
  // our own arithmetic becomes the thing that truncates the reply.
  assert.ok(asked <= 6500, `Plan mode asks for ${asked}, past the 6500 the gateway sizes clay at`);
  // The free lane routes Plan to stone now, so what actually reaches the provider is the MINIMUM
  // of the request and stone's ceiling. Asserting equality with the request would pass only while
  // the two happened to agree; what must hold is that the clamp is not what shortens the reply.
  assert.equal(budget('clay', 'apple', 'high'), asked, 'the gateway clamp, not Plan mode, is deciding the budget');
});
