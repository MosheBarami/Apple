// Opt-in, provider-scoped matrix. No Studio mutation; Luau is compiled, never executed.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const MATRIX_VERSION = 'studpilot-provider-matrix-1';
const root = fileURLToPath(new URL('..', import.meta.url));
const uncode = (text) => text.trim().replace(/^```(?:json|luau|lua)?\s*\n/, '').replace(/\n```$/, '');
export async function compileOnly(source, compiler) {
  if (!isAbsolute(compiler)) throw new Error('An absolute Luau compiler path is required.');
  const directory = await mkdtemp(join(tmpdir(), 'studpilot-matrix-luau-'));
  try {
    const path = join(directory, 'probe.luau'); await writeFile(path, source, { mode: 0o600 });
    try { execFileSync(compiler, ['--binary', path], { timeout: 10000, maxBuffer: 1_000_000, stdio: 'pipe' }); return true; }
    catch { return false; } // Never print compiler diagnostics: they can quote generated/private text.
  } finally { await rm(directory, { recursive: true, force: true }); }
}

export async function evaluateMatrix({ model, invoke, validateParams, block, compiler, budgetUsd }) {
  if (!(budgetUsd > 0) || model.inputCostPer1M === null || model.outputCostPer1M === null) {
    throw new Error('A known catalog price and explicit positive matrix budget are required.');
  }
  const tests = [
    { task: 'intake', metric: 'valid-json', prompt: 'Return only JSON with exactly {"kind":"ui","custom":false}.',
      assess: async (result) => { try { const value = JSON.parse(uncode(result.text)); return value.kind === 'ui' && value.custom === false && Object.keys(value).length === 2; } catch { return false; } } },
    { task: 'schema', metric: 'real-block-parameters', prompt: `Return only JSON parameters for this actual StudPilot block. Use title "Proof" and screen "ProofUI", and use defaults for everything else. Schema: ${JSON.stringify(block.params)}`,
      assess: async (result) => { try { const value = JSON.parse(uncode(result.text)); return value.title === 'Proof' && value.screen === 'ProofUI' && validateParams(block, value).ok; } catch { return false; } } },
    { task: 'luau', metric: 'luau-syntax', prompt: 'Return only a strict Luau ModuleScript with function clampAmount(amount: number, limit: number): number returning math.clamp(amount, 0, limit). Export it in a table. No Roblox calls.',
      assess: async (result) => compileOnly(uncode(result.text), compiler) },
    { task: 'repair', metric: 'syntax-repair', prompt: 'Fix the syntax of this Luau module, keep clampAmount, and return only the repaired source: local function clampAmount(amount: number, limit: number): number return math.clamp(amount, 0, limit) return {clampAmount=clampAmount}',
      assess: async (result) => uncode(result.text).includes('clampAmount') && await compileOnly(uncode(result.text), compiler) },
    { task: 'tools', metric: 'typed-native-tool', prompt: 'Call probe_result with ok=true and count=3. This is a protocol test, no action has run.',
      tools: [{ name: 'probe_result', description: 'Return the typed protocol result.', parameters: { type: 'object', properties: { ok: { type: 'boolean' }, count: { type: 'integer', minimum: 1, maximum: 5 } }, required: ['ok', 'count'], additionalProperties: false } }],
      assess: async (result) => { try { const call = result.toolCalls[0], value = JSON.parse(call.arguments); return result.toolCalls.length === 1 && call.name === 'probe_result' && value.ok === true && value.count === 3 && Object.keys(value).length === 2; } catch { return false; } } },
  ];
  const outcomes = []; let spent = 0, usageComplete = true;
  for (const test of tests) {
    const request = { modelId: model.id, messages: [{ role: 'user', content: test.prompt }],
      maxTokens: 2048, temperature: 0.25, ...(test.tools ? { tools: test.tools, requiredTool: 'probe_result' } : {}) };
    const worstInput = new TextEncoder().encode(JSON.stringify(request)).length + 1024;
    const reservation = (worstInput * model.inputCostPer1M + request.maxTokens * model.outputCostPer1M) / 1_000_000;
    if (spent + reservation > budgetUsd) { outcomes.push({ task: test.task, metric: test.metric, status: 'not_run', reason: 'budget' }); continue; }
    const started = Date.now();
    try {
      const result = await invoke(request);
      if (result.usage.inputTokens === null || result.usage.outputTokens === null) throw new Error('Missing usage.');
      const costUsd = (result.usage.inputTokens * model.inputCostPer1M + result.usage.outputTokens * model.outputCostPer1M) / 1_000_000;
      spent += costUsd;
      const passed = !result.truncated && result.finishReason !== 'error' && await test.assess(result);
      outcomes.push({ task: test.task, metric: test.metric, status: 'measured', passed, latencyMs: Date.now() - started,
        usage: result.usage, costUsd });
    } catch (error) {
      usageComplete = false;
      outcomes.push({ task: test.task, metric: test.metric, status: 'failed', code: error.code ?? 'probe_failed' });
      // No repeated auth/billing/quota or unknown inference failures; unknown spend cannot be assumed zero.
      break;
    }
  }
  return { matrixVersion: MATRIX_VERSION, checkedAt: new Date().toISOString(), modelId: model.id, provider: model.provider,
    budgetUsd, measuredCostUsd: usageComplete ? spent : null, knownMeasuredCostUsd: spent, usageComplete,
    outcomes, scope: 'JSON/schema/compiled Luau/native tool probes; no game behavior or Studio acceptance',
    requested: tests.length, measured: outcomes.filter((outcome) => outcome.status === 'measured').length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name) => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  const provider = arg('--provider');
  if (!process.argv.includes('--live') || !['huggingface', 'cloudflare'].includes(provider) || !arg('--dev-env-file') || !arg('--model')
    || !arg('--compiler') || !arg('--output')) throw new Error('Use --live --provider huggingface --dev-env-file <ignored file> --model <exact id> --compiler <absolute luau-compile> --budget-usd <cap> --output <proof file>.');
  const lines = (await readFile(arg('--dev-env-file'), 'utf8')).split('\n');
  const keyName = provider === 'huggingface' ? 'HF_TOKEN' : 'CLOUDFLARE_API_TOKEN_MASTER';
  const line = lines.find((line) => line.startsWith(keyName + '='));
  const apiKey = line?.slice(keyName.length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!apiKey) throw new Error('The explicitly selected development provider key is missing.');
  const accountLine = lines.find((line) => line.startsWith('CLOUDFLARE_ACCOUNT_ID='));
  const credentials = { apiKey, ...(provider === 'cloudflare' ? { accountId: accountLine?.slice('CLOUDFLARE_ACCOUNT_ID='.length).trim().replace(/^(['"])(.*)\1$/, '$2') } : {}) };
  const directory = await mkdtemp(join(tmpdir(), 'studpilot-model-matrix-'));
  try {
    const entry = join(directory, 'entry.ts'), bundle = join(directory, 'matrix.mjs');
    await writeFile(entry, ['providers/api-catalog', 'providers/api-transport', 'block-schema'].map((name) =>
      `export * from ${JSON.stringify(join(root, 'apps/worker/src', name + '.ts'))};`).join('\n'));
    execFileSync(join(root, 'apps/worker/node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${bundle}`], { stdio: 'pipe' });
    const { discoverApiModels, invokeApi, validateParams } = await import(pathToFileURL(bundle).href);
    const catalog = await discoverApiModels(provider, credentials);
    const model = catalog.models.find((model) => model.id === arg('--model')); if (!model) throw new Error('Model not in the exact catalog.');
    const block = JSON.parse(await readFile(join(root, 'packages/blocks/ui/window/block.json'), 'utf8'));
    const proof = await evaluateMatrix({ model, block, validateParams, compiler: arg('--compiler'), budgetUsd: Number(arg('--budget-usd')),
      invoke: (request) => invokeApi(provider, credentials, request) });
    await writeFile(arg('--output'), JSON.stringify(proof, null, 2) + '\n');
    console.log(JSON.stringify({ matrixVersion: proof.matrixVersion, requested: proof.requested, measured: proof.measured,
      measuredCostUsd: proof.measuredCostUsd, statuses: proof.outcomes.map(({ task, status, passed }) => ({ task, status, passed })) }));
  } catch { console.error('Matrix could not be completed. No credentials, raw diagnostics or generated source were logged.'); process.exitCode = 1; }
  finally { await rm(directory, { recursive: true, force: true }); }
}
