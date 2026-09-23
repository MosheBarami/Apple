/**
 * APPLE'S LORA ADAPTERS REACH THE BINDING ONLY WHEN ASKED FOR (D-VISION-1, training).
 *
 * Properties:
 *   - an admin eval can serve a named adapter on a lab base, and the adapter rides in the payload;
 *   - with no adapter asked for, the payload carries no `lora` field at all (base model, unchanged);
 *   - the lab bases are addressable by key and are the Workers AI models that accept adapters.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const TMP = mkdtempSync(join(tmpdir(), 'lora-serving-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const out = join(TMP, 'gateway.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'gateway.ts'), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${out}`],
  { cwd: WORKER, stdio: 'pipe' });
const G = await import(pathToFileURL(out).href);

const REPLY = { choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } };

function fakeEnv() {
  const seen = { runs: [] };
  const env = {
    AI: { run: async (id, payload) => { seen.runs.push({ id, payload }); return structuredClone(REPLY); } },
    KV: { get: async () => null },
    AI_GATEWAY_ID: 'golem-gw',
    ENVIRONMENT: 'test',
    BUDGET_DO: {
      idFromName: () => 'singleton',
      get: () => ({ fetch: async (url, init) => ({ json: async () => ({ ok: true, reserved: init?.body ? JSON.parse(init.body).neurons : 0 }) }) }),
    },
  };
  return { env, seen };
}
const MSGS = [{ role: 'system', content: 'You are Apple.' }, { role: 'user', content: 'Write a coin pickup.' }];

test('an admin eval serves the named adapter on a lab base', async () => {
  G.resetModelCache();
  const { env, seen } = fakeEnv();
  await G.chat(env, { model: 'lab-llama-3b', messages: MSGS, maxTokens: 64 }, { lora: 'apple-v5', kind: 'admin:lora-eval' });
  assert.equal(seen.runs.length, 1);
  assert.equal(seen.runs[0].id, '@cf/meta/llama-3.2-3b-instruct');
  assert.equal(seen.runs[0].payload.lora, 'apple-v5');
});

test('with no adapter asked for, the payload carries no lora field', async () => {
  G.resetModelCache();
  const { env, seen } = fakeEnv();
  await G.chat(env, { model: 'lab-llama-3b', messages: MSGS, maxTokens: 64 }, { kind: 'admin:lora-eval' });
  await G.chat(env, { model: 'agent', messages: MSGS, maxTokens: 64 }, { kind: 'agent:step:low' });
  assert.equal(seen.runs.length, 2);
  for (const r of seen.runs) assert.equal('lora' in r.payload, false, `${r.id} was sent an adapter nobody asked for`);
});

test('the lab bases are the adapter-capable Workers AI models', async () => {
  G.resetModelCache();
  const { env } = fakeEnv();
  const models = await G.getModels(env);
  assert.equal(models['lab-llama-3b']?.id, '@cf/meta/llama-3.2-3b-instruct');
  assert.equal(models['lab-qwen-coder-32b']?.id, '@cf/qwen/qwen2.5-coder-32b-instruct');
});
