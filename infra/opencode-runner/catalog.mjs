import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isolatedEnvironment, runProcess, RunnerError, OPENCODE_VERSION } from './cli.mjs';

/** The verbose CLI prints a provider/id line followed by one pretty-printed JSON object. */
export function parseCliModels(text) {
  const records = [];
  for (const block of text.split(/^opencode\//m).slice(1)) {
    const newline = block.indexOf('\n');
    if (newline < 1) throw new RunnerError('catalog_invalid', 'Incomplete CLI catalog.');
    let model;
    try { model = JSON.parse(block.slice(newline + 1)); } catch { throw new RunnerError('catalog_invalid', 'Invalid CLI catalog.'); }
    if (model.id !== block.slice(0, newline).trim() || model.providerID !== 'opencode') {
      throw new RunnerError('catalog_invalid', 'CLI model identity did not match.');
    }
    records.push(model);
  }
  if (!records.length) throw new RunnerError('catalog_empty', 'OpenCode returned no model metadata.');
  return records;
}

export async function checkVersion(executable) {
  let output = '';
  const code = await runProcess({ executable, args: ['--version'], timeoutMs: 10_000,
    environment: { env: { PATH: '/usr/bin:/bin' }, cwd: tmpdir() }, onStdout: (chunk) => { output += chunk; } });
  if (code !== 0 || output.trim() !== OPENCODE_VERSION) throw new RunnerError('version_mismatch', 'OpenCode version does not match the pinned runner version.');
}

export async function discoverModels({ executable, apiKey, signal, fetcher = fetch }) {
  await checkVersion(executable);
  const root = await mkdtemp(join(tmpdir(), 'studpilot-models-'));
  try {
    const environment = await isolatedEnvironment(root, { apiKey });
    let output = '';
    const code = await runProcess({ executable, args: ['models', 'opencode', '--pure', '--refresh', '--verbose'],
      environment, signal, timeoutMs: 60_000, onStdout: (chunk) => { output += chunk; } });
    if (code !== 0) throw new RunnerError('catalog_unavailable', 'OpenCode CLI catalog could not be refreshed.');
    const response = await fetcher('https://opencode.ai/zen/v1/models', { redirect: 'error',
      signal: signal ?? AbortSignal.timeout(15_000) });
    if (!response.ok) throw new RunnerError('catalog_unavailable', 'OpenCode API catalog could not be refreshed.');
    const api = await response.json();
    if (!Array.isArray(api.data)) throw new RunnerError('catalog_invalid', 'OpenCode API returned invalid catalog data.');
    const apiIds = new Set(api.data.map((model) => model.id));
    // Discovery is not runtime verification, policy permission or a recommendation. Those gates
    // are joined by the service; Jev's System One API cannot satisfy the chat inference contract.
    const models = parseCliModels(output).filter((model) => apiIds.has(model.id)
      && model.cost?.input === 0 && model.cost?.output === 0 && model.status === 'active'
      && model.capabilities?.input?.text === true && model.capabilities?.output?.text === true
      && model.api?.url === 'https://opencode.ai/zen/v1'
      && ['@ai-sdk/openai-compatible', '@ai-sdk/openai', '@ai-sdk/anthropic', '@ai-sdk/google'].includes(model.api?.npm));
    return { version: `opencode-${OPENCODE_VERSION}-${Date.now()}`, checkedAt: new Date().toISOString(),
      source: 'https://opencode.ai/docs/zen/', cliVersion: OPENCODE_VERSION, models };
  } finally { await rm(root, { recursive: true, force: true }); }
}
