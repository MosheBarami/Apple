// Explicit local API probe. Uses the same transport/discovery as connections, never CI by default.
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const option = (flag) => { const at = process.argv.indexOf(flag); return at >= 0 ? process.argv[at + 1] : undefined; };
const provider = option('--provider'), envFile = option('--dev-env-file');
const names = { huggingface: 'HF_TOKEN', openai: 'OPENAI_API_KEY', anthropic: 'ANTHROPIC_API_KEY', google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY', groq: 'GROQ_API_KEY', deepseek: 'DEEPSEEK_API_KEY', zai: 'ZAI_API_KEY', minimax: 'MINIMAX_API_KEY',
  cloudflare: 'CLOUDFLARE_API_TOKEN_MASTER' };
if (!names[provider] || !envFile || (!process.argv.includes('--catalog-only') && !process.argv.includes('--live'))) {
  throw new Error('Use --provider <supported id> --dev-env-file <file> and --catalog-only or --live --model <id>.');
}
const lines = (await readFile(envFile, 'utf8')).split('\n');
const line = lines.find((line) => line.startsWith(names[provider] + '='));
const apiKey = line?.slice(names[provider].length + 1).trim().replace(/^(['"])(.*)\1$/, '$2');
if (!apiKey) throw new Error('No credential was found for this provider.');
const accountLine = lines.find((line) => line.startsWith('CLOUDFLARE_ACCOUNT_ID='));
const credentials = { apiKey, ...(provider === 'cloudflare' ? { accountId: accountLine?.slice('CLOUDFLARE_ACCOUNT_ID='.length).trim().replace(/^(['"])(.*)\1$/, '$2') } : {}) };
const temp = await mkdtemp(join(tmpdir(), 'studpilot-provider-probe-'));
try {
  const entry = join(temp, 'entry.ts'), bundle = join(temp, 'probe.mjs');
  await writeFile(entry, `export * from ${JSON.stringify(join(root, 'apps/worker/src/providers/api-catalog.ts'))};\n`
    + `export * from ${JSON.stringify(join(root, 'apps/worker/src/providers/api-transport.ts'))};`);
  execFileSync(join(root, 'apps/worker/node_modules/.bin/esbuild'), [entry, '--bundle', '--format=esm', `--outfile=${bundle}`], { stdio: 'pipe' });
  const { discoverApiModels, invokeApi } = await import(pathToFileURL(bundle).href);
  const catalog = await discoverApiModels(provider, credentials);
  const safe = { boundary: 'local-real-provider-api', checkedAt: new Date().toISOString(), provider,
    websiteVerified: false, studioVerified: false, deployed: false, catalog };
  if (process.argv.includes('--live')) {
    const model = catalog.models.find((model) => model.id === option('--model'));
    if (!model || model.lifecycle === 'retired') throw new Error('Choose a current exact catalog model ID.');
    const started = Date.now();
    const result = await invokeApi(provider, credentials, { modelId: model.id, maxTokens: 512, temperature: 0.25,
      messages: [{ role: 'user', content: 'Reply with exactly OK.' }] });
    safe.inference = { model: result.model, finishReason: result.finishReason, text: result.text, usage: result.usage,
      latencyMs: Date.now() - started };
  }
  if (option('--output')) await writeFile(option('--output'), JSON.stringify(safe, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ provider, models: catalog.models.length,
    sample: catalog.models.slice(0, 6), ...(safe.inference ? { inference: safe.inference } : {}) }));
} catch (error) {
  console.error(JSON.stringify({ provider, ok: false, code: error.code ?? 'probe_failed', status: error.status,
    message: error.code ? error.message : 'Provider probe failed; no raw error or credential is logged.' }));
  process.exitCode = 1;
} finally { await rm(temp, { recursive: true, force: true }); }
