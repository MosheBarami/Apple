// Opt-in local proof only. Loads only the development key, never promotes it to service credentials.
import { readFile, writeFile } from 'node:fs/promises';
import { discoverModels } from './catalog.mjs';
import { invokeCli } from './cli.mjs';

const value = (flag) => { const index = process.argv.indexOf(flag); return index >= 0 ? process.argv[index + 1] : undefined; };
if (!process.argv.includes('--live-free')) throw new Error('Explicit --live-free is required.');
const executable = value('--executable');
const modelId = value('--model');
if (!executable || !modelId) throw new Error('--executable and --model are required.');
let apiKey = process.env.OPENCODE_API_KEY;
if (!apiKey && value('--dev-env-file')) {
  const lines = (await readFile(value('--dev-env-file'), 'utf8')).split('\n');
  const line = lines.find((entry) => /^OPENCODE_API_KEY=/.test(entry));
  apiKey = line?.slice('OPENCODE_API_KEY='.length).trim().replace(/^(['"])(.*)\1$/, '$2');
}
try {
  const catalog = await discoverModels({ executable, apiKey });
  const modelInfo = catalog.models.find((model) => model.id === modelId);
  if (!modelInfo) throw new Error('The model is not free in both catalogs.');
  const started = Date.now();
  const result = await invokeCli({ executable, apiKey, modelId, modelInfo, allowedModels: new Set([modelId]),
    input: 'Reply with exactly OK.', prompt: 'You are an inference endpoint. Reply only to the request. No tools.',
    ...(process.argv.includes('--local-diagnostic') ? { onDiagnostic: (chunk) => {
      const text = String(chunk).replaceAll(apiKey ?? '\u0000', '[redacted]')
        .replace(/\b[A-Za-z0-9_+/=-]{28,}\b/g, '[redacted]');
      const errors = text.split('\n').filter((line) => /ERROR|Error|error=/.test(line));
      if (errors.length) console.error(errors.join('\n').slice(0, 1800));
    } } : {}),
    timeoutMs: 120_000 });
  const proof = { checkedAt: new Date().toISOString(), boundary: 'isolated-local-cli',
    deployment: false, websiteVerified: false, studioVerified: false, credential: apiKey ? 'development-key' : 'none',
    availableFreeModels: catalog.models.map(({ id, name, api }) => ({ id, name, protocol: api.npm })),
    latencyMs: Date.now() - started, ...result };
  if (value('--output')) await writeFile(value('--output'), JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(proof));
} catch (error) {
  // Only this controlled probe has a fixed public prompt and a single known development key.
  // The server never returns raw diagnostics. Strip that key and token-like strings here.
  const diagnostic = String(error.localDiagnostic ?? '').replaceAll(apiKey ?? '\u0000', '[redacted]')
    .replace(/\b[A-Za-z0-9_+/=-]{28,}\b/g, '[redacted]').slice(0, 300);
  console.error(JSON.stringify({ ok: false, code: error.code ?? 'probe_failed', category: error.category,
    status: error.status, access: error.access, diagnosticTerms: error.diagnosticTerms,
    ...(process.argv.includes('--local-diagnostic') ? { diagnostic } : {}),
    message: error.code ? error.message : 'Probe failed; no credentials or raw provider output are logged.' }));
  process.exitCode = 1;
}
