/**
 * A LANE MUST BE ABLE TO ASK FOR ENOUGH OUTPUT THAT ITS MODEL CAN ANSWER.
 *
 * The free lane routed to a reasoning model with a 1600-token request. A reasoning model spends
 * output budget thinking before it writes, so it did not return a short answer — it returned an
 * empty one, with finishReason "length", while the customer was charged for the compute. Measured
 * on the deployed gateway: 0 of 3 prompts answered at 1600, 1 of 3 at 2000, 2 of 3 at 3200.
 *
 * Nothing in the repository could have caught that, because the two numbers involved live in
 * different files and were never compared: the gateway's per-model ceiling in gateway.ts, and the
 * session's per-step request in session.ts. These tests put them in the same room.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const GATEWAY = readFileSync(join(SRC, 'gateway.ts'), 'utf8');
const SESSION = readFileSync(join(SRC, 'do', 'session.ts'), 'utf8');

/** The gateway's per-model ceiling, and which model id each lane actually reaches. */
function gatewayLanes() {
  const out = {};
  for (const m of GATEWAY.matchAll(/^\s*(clay|stone|rune):\s*\{\s*id:\s*'([^']+)'[^}]*maxTokens:\s*(\d+)/gm)) {
    out[m[1]] = { id: m[2], maxTokens: Number(m[3]) };
  }
  return out;
}

function sessionBudgets() {
  const m = /MODE_BASE_TOKENS: Record<GolemMode, number> = \{([^}]*)\}/.exec(SESSION);
  assert.ok(m, 'MODE_BASE_TOKENS is no longer one literal — re-read this guard');
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*(\d+)/g)].map((x) => [x[1], Number(x[2])]));
}

/** The multiplier `tokensForEffort` applies at the top tier. */
const HIGH_MULTIPLIER = 1.25;

test('the parse found both tables — otherwise every assertion below is vacuous', () => {
  const g = gatewayLanes();
  const s = sessionBudgets();
  assert.deepEqual(Object.keys(g).sort(), ['clay', 'rune', 'stone']);
  assert.deepEqual(Object.keys(s).sort(), ['clay', 'rune', 'stone']);
});

test('no lane asks for more than its model is configured to give', () => {
  // Our own arithmetic must not be what truncates a reply. base × high must fit the ceiling.
  const g = gatewayLanes();
  for (const [lane, base] of Object.entries(sessionBudgets())) {
    const asked = Math.round(base * HIGH_MULTIPLIER);
    assert.ok(asked <= g[lane].maxTokens,
      `${lane} asks for ${asked} at high effort but the gateway caps it at ${g[lane].maxTokens}`);
  }
});

test('a lane on a REASONING model has room to think AND answer', () => {
  // The measured floor. qwen3 returned zero characters at 1600 and answered at 3000; anything at or
  // below the measured-empty figure would ship the same silence again. 3200 is the lowest budget
  // observed to answer more than one prompt in three, so it is the floor a reasoning lane must clear.
  const MEASURED_EMPTY = 1600;
  const MEASURED_WORKABLE = 3200;
  const g = gatewayLanes();
  const s = sessionBudgets();
  for (const [lane, cfg] of Object.entries(g)) {
    if (!/qwen|reason/i.test(cfg.id)) continue;
    assert.ok(s[lane] > MEASURED_EMPTY,
      `${lane} runs ${cfg.id}, a reasoning model, on ${s[lane]} tokens — measured to return NOTHING at ${MEASURED_EMPTY}`);
    assert.ok(s[lane] >= MEASURED_WORKABLE,
      `${lane} asks for ${s[lane]}; ${MEASURED_WORKABLE} was the lowest budget observed to answer`);
  }
});

test('the reasoning lane is identified by its model id, not by its name', () => {
  // Non-vacuity for the test above: if no lane matches the reasoning pattern it passes silently,
  // which is how a guard quietly stops guarding after a model swap.
  const reasoning = Object.entries(gatewayLanes()).filter(([, c]) => /qwen|reason/i.test(c.id));
  assert.ok(reasoning.length > 0,
    'no lane matched the reasoning-model pattern — if the models changed, re-measure the floor rather than deleting this');
});

test('no lane routes a BUILD to a model measured unable to emit code', () => {
  // The free lane sent every mode to qwen3-30b. Measured on the deployed gateway, same twelve
  // prompts, each lane at its own production budget: glm-5.3-flash 11/12 for 125 neurons, qwen3
  // 1/12 for 718 — ten of its twelve returned no code at all. A build mode may not be pointed at a
  // model that cannot produce a module; Plan may, because Plan inspects and proposes.
  const routing = /function gatewayModelFor\([^)]*\)[^{]*\{([\s\S]*?)\n\}/.exec(SESSION);
  assert.ok(routing, 'gatewayModelFor is no longer one function — re-read this guard');
  const free = /productModel === 'apple'\) return ([^;]+);/.exec(routing[1]);
  assert.ok(free, "the free lane's routing line could not be found");
  assert.match(free[1], /'stone'/,
    'the free lane points at clay again; clay is qwen3-30b, measured at 1/12 for 718 neurons against stone 11/12 for 125');
});
