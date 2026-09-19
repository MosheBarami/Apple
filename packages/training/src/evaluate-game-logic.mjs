#!/usr/bin/env node
/** Opt-in seed-curriculum baseline. Never a production promotion score. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { GAME_LOGIC_CURRICULUM } from './game-logic-curriculum.mjs';
import { detectContextDependencies } from './audit-dataset.mjs';
import { execute, isRefusal } from '../../../scripts/lib/sandbox-host.mjs';
import { readSpendLedger, reserveSpend } from './spend-ledger.mjs';

const MODEL = '@cf/zai-org/glm-5.3-flash';
const BASE = 'https://apple.moshe-barami111.workers.dev';
const MAX_TOKENS = 1600;
const SYSTEM = 'Return only one fenced luau code block containing the complete standalone module requested. No explanation, no tool calls. The module must return the requested function.';
// Official price checked 2026-09-18; no cache discount assumed. Reserve $0.005 per
// request (above bounded prompt + 1600 output tokens); never retry uncertain calls.
export const EVALUATION_RESERVE_USD = 0.05;
export const REQUEST_RESERVE_USD = 0.005;
export const PRICE_SOURCE = 'https://developers.cloudflare.com/workers-ai/models/glm-5.3-flash/';

export async function checkCandidate(example, answer) {
  const match = /^\s*```(?:luau|lua)\s*\n([\s\S]*?)\n```\s*$/.exec(answer);
  if (!match) return { passed: false, reason: 'expected_single_code_block' };
  const source = match[1];
  const context = detectContextDependencies(source);
  if (!context.parseOk || !context.standalone || context.implicitGlobals.length) return { passed: false, reason: 'invalid_or_context_dependent_source' };
  const result = await execute({
    runtime: 'luau', backend: 'local-process',
    source: `local candidate = (function()\n${source}\nend)()\n${example.checks}\nprint("APPLE-BASELINE-PASS")`,
    limits: { wallMs: 2000, memoryMb: 64, outputBytes: 4096 },
  });
  if (isRefusal(result)) return { passed: false, reason: `refused:${result.code}` };
  return {
    passed: result.ok && result.stdout.trim() === 'APPLE-BASELINE-PASS',
    reason: result.reason, exitCode: result.exitCode,
    stderr: result.stderr.slice(0, 2000), durationMs: result.durationMs,
    engineVerified: false,
  };
}

export function usageCost(usage) {
  const input = usage?.inputTokens;
  const output = usage?.outputTokens;
  if (![input, output].every((n) => Number.isSafeInteger(n) && n >= 0) || input + output === 0) return null;
  return (input * 0.15 + output * 0.50) / 1_000_000;
}

export async function evaluateGameLogic({ live = false, adminKey, output, budgetPath, fetchImpl = fetch, examples = GAME_LOGIC_CURRICULUM } = {}) {
  if (!live) throw new Error('paid evaluation requires explicit --live; no request made');
  if (!budgetPath) throw new Error('existing total budget ledger is required');
  readSpendLedger(budgetPath);
  if (!adminKey) throw new Error('GOLEM_ADMIN_KEY is required');
  if (!output || examples.length < 1 || examples.length > 10) throw new Error('new output directory and 1..10 examples required');
  if (examples.some((e) => Buffer.byteLength(e.prompt + SYSTEM) > 2000)) throw new Error('prompt exceeds bounded cost allocation');
  const directory = resolve(output);
  mkdirSync(directory, { recursive: false });
  const headers = { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey };
  const preflight = await fetchImpl(`${BASE}/api/admin/models`, { headers, signal: AbortSignal.timeout(15_000) });
  const config = await preflight.json();
  if (!preflight.ok || config?.stone?.id !== MODEL) throw new Error('live model preflight failed; no inference requested');
  const records = [];
  let reservedUsd = 0;
  for (const example of examples) {
    if (reservedUsd + REQUEST_RESERVE_USD > EVALUATION_RESERVE_USD + 1e-9) break;
    reservedUsd += REQUEST_RESERVE_USD;
    let record = { id: example.id, family: example.family, reservedUsd: REQUEST_RESERVE_USD, observedTokenCostUsd: null };
    // Write the reservation BEFORE the external request so a crash leaves its cost uncertain,
    // never apparently free. Neither the credential nor customer data is persisted.
    const path = join(directory, `${example.id}.json`);
    reserveSpend(budgetPath, { id: `evaluation:${directory}:${example.id}`, usd: REQUEST_RESERVE_USD });
    writeFileSync(path, JSON.stringify({ ...record, status: 'reserved_request_not_settled' }, null, 2), { flag: 'wx' });
    try {
      const response = await fetchImpl(`${BASE}/api/admin/model-test`, {
        method: 'POST', headers,
        body: JSON.stringify({ model: 'stone', prompt: example.prompt, system: SYSTEM, maxTokens: MAX_TOKENS, tools: false, rag: false }),
        signal: AbortSignal.timeout(60_000),
      });
      const body = await response.json();
      if (!response.ok || body.ok !== true || body.model !== MODEL) throw new Error(`inference failed or model changed (HTTP ${response.status})`);
      const cost = usageCost(body.usage);
      record = { ...record, status: 'response_received', model: body.model, usage: body.usage, neurons: body.neurons ?? null, observedTokenCostUsd: cost, response: String(body.text ?? ''), check: await checkCandidate(example, String(body.text ?? '')) };
      writeFileSync(path, JSON.stringify(record, null, 2));
      records.push(record);
      if (cost === null || cost > REQUEST_RESERVE_USD) break;
    } catch (error) {
      // Do not echo an upstream body, which may contain credentials. No retries.
      record = { ...record, status: 'uncertain_or_failed', error: error?.name === 'TimeoutError' ? 'timeout' : 'request_or_local_check_failed' };
      writeFileSync(path, JSON.stringify(record, null, 2));
      records.push(record);
      break;
    }
  }
  const report = {
    kind: 'seed-curriculum-baseline-not-promotion', model: MODEL,
    requested: records.length, planned: examples.length, passed: records.filter((r) => r.check?.passed).length,
    reservedUsd, observedTokenCostUsd: records.reduce((sum, r) => sum + (r.observedTokenCostUsd ?? 0), 0),
    uncertainRequests: records.filter((r) => r.observedTokenCostUsd === null).length,
    totalBudget: readSpendLedger(budgetPath),
    pricingSource: PRICE_SOURCE, invoiceVerified: false, trainingStarted: false, studioVerified: false,
  };
  writeFileSync(join(directory, 'report.json'), JSON.stringify(report, null, 2), { flag: 'wx' });
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 5 || args[0] !== '--live' || args[1] !== '--out' || args[3] !== '--budget') throw new Error('usage: evaluate-game-logic.mjs --live --out NEW_DIRECTORY --budget EXISTING_LEDGER');
  console.log(JSON.stringify(await evaluateGameLogic({ live: true, adminKey: process.env.GOLEM_ADMIN_KEY, output: args[2], budgetPath: args[4] }), null, 2));
}
