/**
 * THE THINKING CARD SAID THE MODEL WAS THINKING HARD. IT WAS NOT.
 *
 * Defect Dcbbb62. The adaptive policy decides a reasoning tier for every step, and SessionDO
 * rendered it: on screen in the thinking card, and into `run_state` so it survives a refresh.
 * Whether the tier reached the model is a different question. `gatewayModelFor` routes
 * `productModel: 'apple'` — the free lane, and the default — to `clay`, which is a Qwen3 route, and
 * the Workers AI adapter drops `reasoning_effort` for anything that is not a GLM route, because
 * Qwen's binding schema does not document the knob. Sending it anyway would be the wrong fix. So
 * the setting was computed, shown, stored, and then discarded before the request left the building.
 *
 * WHAT IS ASSERTED HERE is the adapter's real payload on one side and the predicate the UI path
 * consults on the other — from the same rule, so the two cannot answer differently. A test that
 * only checked the predicate would prove the product agrees with itself and nothing about whether
 * the model was ever told.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'effort-applied-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');

function bundle(rel, name) {
  const out = join(TMP, `${name}.mjs`);
  execFileSync(
    join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', ...rel), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${out}`],
    { stdio: 'pipe', cwd: WORKER },
  );
  return import(pathToFileURL(out).href);
}

const P = await bundle(['providers', 'index.ts'], 'providers');
const G = await bundle(['gateway.ts'], 'gateway');
const S = await bundle(['do', 'session.ts'], 'session');

/** No KV override, so `getModels` falls back to DEFAULT_MODELS. */
const env = { KV: { async get() { return null; } } };

/** What the adapter would really put on the wire for this model id. */
function payloadFor(modelId) {
  const { payload } = P.workersAiAdapter.encode({
    modelId,
    messages: [{ role: 'user', content: 'hi' }],
    maxTokens: 100,
    temperature: 0.3,
    reasoningEffort: 'high',
  });
  return payload;
}

test('BOTH lanes are now told how hard to think — the defect this file documented is gone', () => {
  //[[ THIS ASSERTED THE DEFECT, AND SAID SO ITSELF.
  //
  //   It read: the adapter really does DROP the effort on the free lane's model, and really does
  //   send it on the paid one — with a failure message naming the day this would stop being true:
  //   "the fixture is wrong: <model> now accepts reasoning_effort and this defect no longer exists".
  //
  //   That day is 2026-09-20. The free lane moved off @cf/qwen/qwen3-30b-a3b-fp8 because it was
  //   measured at 1/12 for 718 neurons against glm-5.3-flash's 11/12 for 125, and both lanes now
  //   run a model that accepts the field. So a free-tier run is finally told how hard to think, and
  //   the reasoning tier the thinking panel displays is one the request actually carried — which
  //   was its own separate defect: a status line reporting a setting the run never used.
  //
  //   Re-aimed rather than deleted, because the property worth guarding did not disappear, it
  //   inverted: every lane a person can reach must receive the effort the policy chose for it.
  for (const productModel of ['apple', 'apple-max']) {
    const cfg = G.DEFAULT_MODELS[S.gatewayModelFor('stone', productModel)];
    assert.equal(
      'reasoning_effort' in payloadFor(cfg.id),
      true,
      `${productModel} runs ${cfg.id}, which drops reasoning_effort — its thinking panel would report a tier the request never carried`,
    );
  }
});

test('the predicate the UI path consults agrees with what the adapter actually sends', async () => {
  G.resetModelCache();
  for (const [mode, productModel] of [['stone', 'apple'], ['clay', 'apple'], ['stone', 'apple-max'], ['rune', 'apple-max'], ['clay', 'apple-max']]) {
    const key = S.gatewayModelFor(mode, productModel);
    const sent = 'reasoning_effort' in payloadFor(G.DEFAULT_MODELS[key].id);
    assert.equal(
      await G.reasoningEffortApplies(env, key),
      sent,
      `${productModel}/${mode}: the product would say the effort ${sent ? 'was not' : 'was'} applied`,
    );
  }
});

test('an unknown model key is not claimed to have applied anything', async () => {
  G.resetModelCache();
  assert.equal(await G.reasoningEffortApplies(env, 'no-such-model'), false);
});

test('a KV override that repoints the free lane at a GLM route changes the answer', async () => {
  // The predicate must follow the config that is LIVE, not the one in DEFAULT_MODELS — otherwise it
  // is a second, stale copy of the rule rather than the same one.
  G.resetModelCache();
  const overridden = {
    KV: {
      async get() {
        return JSON.stringify({
          clay: { id: '@cf/zai-org/glm-5.3-flash', nativeTools: true, maxTokens: 2000, ctx: 1000, temperature: 0.3 },
        });
      },
    },
  };
  assert.equal(await G.reasoningEffortApplies(overridden, 'clay'), true);
  G.resetModelCache();
});

test('SessionDO omits the claim instead of downgrading it, and clears the replayed copy too', () => {
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(src, /const effortApplied = await reasoningEffortApplies\(this\.env, gatewayModel\);/);
  // Omitted from the broadcast...
  assert.match(src, /\.\.\.\(effortApplied \? \{ effort: choice\.effort, effortReason: choice\.reason \} : \{\}\)/);
  // ...and cleared from the run state, which `runSnapshot` replays on a refresh. Leaving it there
  // would put the same claim back on screen by the other route.
  assert.match(src, /delete agent\.effort;\s*\n\s*delete agent\.effortReason;/);
  assert.equal(
    /\n\s*effort: choice\.effort,\n\s*effortReason: choice\.reason,\n/.test(src),
    false,
    'the effort is still broadcast unconditionally somewhere',
  );
});

test('there is one rule, not a copy of the regex next to the UI', () => {
  const adapter = readFileSync(join(WORKER, 'src', 'providers', 'workers-ai.ts'), 'utf8');
  const matches = adapter.match(/\/\^@cf\\\/zai-org\\\/glm-\//g) ?? [];
  assert.equal(matches.length, 1, 'the GLM route test appears more than once — the two can now disagree');
  assert.match(adapter, /if \(req\.reasoningEffort && acceptsReasoningEffort\(req\.modelId\)\)/);
});

// ---------------------------------------------------------------------------
// THE BROADCAST ITSELF.
//
// Everything above establishes that the adapter drops the field and that the predicate says so.
// This drives the real `runStep` and reads the frame the browser would actually receive, because
// the defect was not in either half — it was in what the product SAID about them.
// ---------------------------------------------------------------------------
import * as esbuild from 'esbuild';
import { makeSql } from './session-harness.mjs';

const GATEWAY_STUB = join(TMP, 'gateway-stub.mjs');
writeFileSync(
  GATEWAY_STUB,
  `export class BudgetError extends Error { constructor(r, m) { super(m); this.reason = r; } }
   export class RateLimitedError extends Error {}
   // Throwing here stops the step immediately AFTER the agent_status frame has been broadcast,
   // which is the frame under test. SessionDO turns it into a 'model_failed' finish, which is fine:
   // nothing below reads the outcome.
   export async function chat() { throw new Error('the step stops here on purpose'); }
   export async function reasoningEffortApplies(env) { return env.__effortApplies === true; }
  `,
);
const RUN_OUT = join(TMP, 'session-run.mjs');
await esbuild.build({
  entryPoints: [join(WORKER, 'src', 'do', 'session.ts')],
  bundle: true, format: 'esm', target: 'es2022', outfile: RUN_OUT,
  alias: { 'cloudflare:workers': CF_SHIM },
  plugins: [{
    name: 'gateway-stub',
    setup(b) {
      b.onResolve({ filter: /^\.\.\/gateway$/ }, () => ({ path: GATEWAY_STUB }));
    },
  }],
});
const { SessionDO: RunnableSessionDO } = await import(pathToFileURL(RUN_OUT).href);

/** One step of a real run, with the frames the browser would have received. */
async function stepWith({ effortApplies }) {
  const sent = [];
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Place', ownerId: 'u1' }], ['pluginLastSeen', Date.now()]]);
  const ws = {
    send: (d) => sent.push(JSON.parse(d)),
    deserializeAttachment: () => ({ userId: 'u1', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now() }),
    serializeAttachment: () => {},
  };
  const ctx = {
    id: { toString: () => 'do-1' },
    storage: {
      sql: makeSql(),
      get: async (k) => store.get(k),
      put: async (k, v) => { if (typeof k === 'object') for (const [a, b] of Object.entries(k)) store.set(a, b); else store.set(k, v); },
      delete: async () => {},
      setAlarm: async () => {},
      deleteAlarm: async () => {},
      getAlarm: async () => null,
    },
    blockConcurrencyWhile: async (fn) => await fn(),
    getWebSockets: () => [ws],
    acceptWebSocket: () => {},
  };
  const env = {
    __effortApplies: effortApplies,
    AI: { run: async () => { throw new Error('the test must never call a model'); } },
    CORPUS: { prepare: () => ({ first: async () => null }) },
    QUOTA_DO: { idFromName: () => ({}), get: () => ({ fetch: async () => Response.json({ plan: 'free', creditsRemaining: 100, creditsDaily: 100 }) }) },
  };
  const session = new RunnableSessionDO(ctx, env);
  await new Promise((r) => setTimeout(r, 0));
  const agent = {
    status: 'running', mode: 'stone', productModel: effortApplies ? 'apple-max' : 'apple',
    msgId: 'm1', llm: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'restyle the shop panel', pinned: true }],
    step: 0, maxSteps: 16, creditsSpent: 1, trace: [], finalText: '',
    startedAt: Date.now(), lastStepAt: Date.now(), userId: 'u1',
    traits: { visualDesignTask: true, uiDesignTask: true, multiSystemTask: false, ambiguousRequest: false, conversational: false },
  };
  // runStep does not catch — `alarm()` does — so the deliberate stop is caught here. Anything
  // ELSE thrown must still fail the test, or a broken fixture would read as a passing one.
  await session.runStep(agent).catch((e) => {
    if (!/the step stops here on purpose/.test(String(e?.message))) throw e;
  });
  return { sent, agent, status: sent.filter((m) => m.type === 'agent_status' && 'effort' in m) };
}

//[[ THE OTHER WAY A REASONING TIER CAN BE WRONG: nobody chose it.
//
//   `vision` carries `reasoningEffort: 'low'` in the model table, and TWO call sites use that model
//   for entirely different work. `vision.ts` states 'high' for the visual critic and argues it in a
//   comment — including that 'medium' measured as spending the whole budget on reasoning and
//   returning an empty string. `tools.ts` OCR stated nothing and took 'low' from the table.
//
//   That is not wrong today; 'low' is right for transcription. It is wrong STRUCTURALLY: changing
//   the table for the critic's sake would move OCR with it, silently, for a reason that has nothing
//   to do with OCR. docs/backlog/REASONING-EFFORT-POLICY-NOTE.md named this as the one small thing
//   worth changing and did not change it, because the neighbouring file was held by another lane.
//
//   The call site now states its own tier. This asserts THAT — not the value — because the value is
//   a judgement somebody may revise and the coupling is the defect. ]]
test('OCR states its own reasoning tier rather than inheriting the vision default', () => {
  const source = readFileSync(join(WORKER, 'src', 'tools.ts'), 'utf8');
  const start = source.indexOf('async function readImageText');
  assert.notEqual(start, -1, 'readImageText is gone — re-aim this test, do not delete it');
  const end = source.indexOf("\n}", source.indexOf("{ kind: 'visual:ocr'", start));
  assert.notEqual(end, -1, 'the OCR call site could not be located; this test would be vacuous');
  //[[ COMMENTS OUT FIRST, and this line exists because the first version of this test PASSED OVER
  //   THE DELETED CODE. The comment that explains the setting at the call site quotes it —
  //   "`vision` carries `reasoningEffort: 'low'` in the model table" — so the regex matched the
  //   prose after the real line was removed. A guard satisfied by its own explanation is not a
  //   guard, and it was found the only way this kind of thing is found: by deleting the line and
  //   watching the test stay green. ]]
  const fn = source.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  // Non-vacuity: the slice really is the OCR call and really does reach the gateway.
  assert.match(fn, /model: 'vision'/, 'the slice is not the vision call it is supposed to be');
  assert.match(fn, /'visual:ocr'/);
  assert.match(
    fn,
    /reasoningEffort:\s*'(minimal|low|medium|high)'/,
    'the OCR call passes no reasoningEffort, so it inherits whatever the vision entry in the model '
    + "table happens to say. Change that entry for the critic's sake and transcription moves with it.",
  );
});

test('the free lane is sent NO effort at all — not a downgraded one', async () => {
  const { sent, agent, status } = await stepWith({ effortApplies: false });
  assert.ok(sent.some((m) => m.type === 'agent_status'), 'the step never reached the status broadcast; the fixture is wrong');
  assert.deepEqual(status, [], 'the thinking card was told a tier the provider was never sent');
  assert.equal(agent.effort, undefined, 'the run state still replays the claim after a refresh');
  assert.equal(agent.effortReason, undefined);
});

test('the paid lane still reports its tier, or the fix has simply deleted the feature', async () => {
  const { agent, status } = await stepWith({ effortApplies: true });
  assert.equal(status.length, 1, 'the effort is no longer reported anywhere');
  assert.equal(status[0].effort, 'high');
  assert.match(status[0].effortReason, /\S/);
  assert.equal(agent.effort, 'high', 'a refresh must still replay it');
});
