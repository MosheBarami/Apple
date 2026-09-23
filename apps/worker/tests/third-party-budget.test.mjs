/**
 * THE THIRD-PARTY WALLET IN BudgetDO (D-VISION-1, rollout step 2).
 *
 * Gemini 3.8 Flash, GPT-5.6 (Sol) and GPT-5.6 Luna are paid from prepaid AI Gateway credits, not in
 * Workers AI neurons. BudgetDO keeps them on their own dollar ceiling ($5/day, $60/month in
 * pricing.ts). The properties:
 *
 *   - a third-party reservation never spends, or is admitted by, Apple's neuron day;
 *   - the third-party day refuses at its ceiling, with a sentence that says Apple still works;
 *   - each model's step cap is its own: a Sol step far above Apple's 1,200 is admitted, and one
 *     neuron over Sol's cap is not;
 *   - a hold is released and settled on the ledger it was taken on;
 *   - an operator ratchet of the per-request cap reaches the third-party models too.
 *
 * Same storage harness as budget-admission.test.mjs: deep copies on get/put, as real DO storage
 * serialises.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { MODEL_REGISTRY } from '@golem/shared';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'budget-tp-')), 'budget.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'budget.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const { BudgetDO } = await import(`file://${out}`);

// Restated independently of pricing.ts, so an edit to the constants is a visible diff here.
const USD_PER_NEURON = 0.011 / 1000;
const TP_DAY = Math.floor(5 / USD_PER_NEURON);
const TP_MONTH = Math.floor(60 / USD_PER_NEURON);

const SOL = 'openai/gpt-5.6-sol';
const GLM = '@cf/zai-org/glm-5.3-flash';
const SOL_CAP = MODEL_REGISTRY.find((m) => m.providerModelId === SOL).maxNeuronsPerStep;

function budget(seed = {}) {
  const m = new Map(Object.entries(seed));
  const storage = {
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(a, b) {
      if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) m.set(k, structuredClone(v));
      else m.set(a, structuredClone(b));
    },
    async delete(k) { m.delete(k); },
    sql: { exec() { return { toArray: () => [] }; } },
  };
  const o = new BudgetDO({ storage, blockConcurrencyWhile: (fn) => fn() }, {});
  const call = async (path, body, method = 'POST') =>
    (await o.fetch(new Request('https://do' + path, { method, ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}) }))).json();
  return { call, stored: (k) => m.get(k), state: () => call('/state', null, 'GET') };
}

const today = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

test('the compiled third-party ceilings are $5 a day and $60 a month', async () => {
  const s = await budget().state();
  assert.equal(s.thirdParty.dayCeilingUsd, 5);
  assert.equal(s.thirdParty.monthCeilingUsd, 60);
});

test('a Sol step above Apple\'s 1,200 cap is admitted, and it never touches the neuron day', async () => {
  const b = budget();
  assert.ok(SOL_CAP > 1_200, 'the premise: Sol\'s cap is its own, not the global one');
  const r = await b.call('/reserve', { neurons: SOL_CAP, model: SOL });
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = await b.state();
  assert.equal(s.dayPending, 0, 'the neuron day moved for a third-party reservation');
  assert.ok(s.thirdParty.dayPendingUsd > 0);
});

test('one neuron over a model\'s own cap is refused; an Apple step keeps the 1,200 cap', async () => {
  const b = budget();
  assert.equal((await b.call('/reserve', { neurons: SOL_CAP + 1, model: SOL })).reason, 'request_too_large');
  assert.equal((await b.call('/reserve', { neurons: 1_201, model: GLM })).reason, 'request_too_large');
  assert.equal((await b.call('/reserve', { neurons: 1_200, model: GLM })).ok, true);
});

test('the third-party day refuses at its ceiling and says Apple still works; the neuron day is unaffected', async () => {
  const b = budget({ thirdParty: { day: today(), month: thisMonth(), dayNeurons: TP_DAY - 100, dayPending: 0, monthNeurons: TP_DAY - 100 } });
  const refused = await b.call('/reserve', { neurons: 101, model: SOL });
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, 'third_party_daily_cap');
  assert.match(refused.message, /Apple and Apple MAX still work/);
  assert.equal((await b.call('/reserve', { neurons: 100, model: SOL })).ok, true, 'exactly at the ceiling is admitted');
  assert.equal((await b.call('/reserve', { neurons: 500, model: GLM })).ok, true, 'Apple is not refused by the outside models\' ceiling');
});

test('the third-party month refuses independently of the day', async () => {
  const b = budget({ thirdParty: { day: today(), month: thisMonth(), dayNeurons: 0, dayPending: 0, monthNeurons: TP_MONTH - 10 } });
  const refused = await b.call('/reserve', { neurons: 11, model: SOL });
  assert.equal(refused.reason, 'third_party_monthly_cap');
});

test('a full neuron day does not refuse a third-party model', async () => {
  const b = budget({
    budget: { day: today(), month: thisMonth(), dayNeurons: 100_000, dayPending: 0, dayBillableNeurons: 90_000, monthBillableNeurons: 90_000 },
  });
  assert.equal((await b.call('/reserve', { neurons: 10, model: GLM })).reason, 'daily_cap');
  assert.equal((await b.call('/reserve', { neurons: 10, model: SOL })).ok, true);
});

test('release and settle land on the ledger the hold was taken on', async () => {
  const b = budget();
  await b.call('/reserve', { neurons: 5_000, model: SOL });
  await b.call('/release', { reserved: 5_000, model: SOL });
  assert.equal(b.stored('thirdParty').dayPending, 0, 'release did not reach the third-party ledger');

  await b.call('/reserve', { neurons: 5_000, model: SOL });
  await b.call('/settle', { reserved: 5_000, actual: 3_000, model: SOL, kind: 'agent:step' });
  const t = b.stored('thirdParty');
  assert.equal(t.dayPending, 0);
  assert.equal(t.dayNeurons, 3_000);
  assert.equal(t.monthNeurons, 3_000);
  assert.equal(b.stored('budget')?.dayNeurons ?? 0, 0, 'third-party spend was booked on the neuron day');
});

test('an unreadable third-party settlement is charged, never zero', async () => {
  const b = budget();
  await b.call('/reserve', { neurons: 2_000, model: SOL });
  const r = await b.call('/settle', { reserved: 2_000, actual: null, model: SOL, kind: 'k' });
  assert.equal(r.estimated, true);
  assert.equal(b.stored('thirdParty').dayNeurons, 2_000);
});

test('an operator ratchet of the per-request cap reaches the third-party models', async () => {
  const b = budget();
  await b.call('/limits', { maxNeuronsPerRequest: 1_000 });
  assert.equal((await b.call('/reserve', { neurons: 1_001, model: SOL })).reason, 'request_too_large');
  // …and the third-party ceilings can be lowered at runtime but never raised past the compiled figure.
  const raised = await b.call('/limits', { thirdPartyNeuronsPerDay: TP_DAY * 10 });
  assert.equal(raised.limits.thirdPartyNeuronsPerDay, TP_DAY);
  const lowered = await b.call('/limits', { thirdPartyNeuronsPerDay: 1_000 });
  assert.equal(lowered.limits.thirdPartyNeuronsPerDay, 1_000);
  assert.equal((await b.call('/reserve', { neurons: 900, model: 'openai/gpt-5.6-luna' })).ok, true);
  assert.equal((await b.call('/reserve', { neurons: 200, model: 'openai/gpt-5.6-luna' })).reason, 'third_party_daily_cap');
});

test('the kill switch stops the third-party models too', async () => {
  const b = budget();
  await b.call('/kill', { killed: true });
  assert.equal((await b.call('/reserve', { neurons: 10, model: SOL })).reason, 'killed');
});
