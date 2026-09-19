/**
 * The provider adapter is the one layer that understands provider response shapes. Once it has
 * classified a completion as `length`, the gateway must not rewrite it to `stop`: doing so grades a
 * partial answer as complete and makes an output-token ceiling look like model weakness.
 *
 * This test bundles the real gateway and supplies a synthetic Workers AI binding. It makes no
 * network or paid provider call.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'gateway-finish-reason-'));
const bundle = join(temporary, 'gateway.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'gateway.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${bundle}`],
  { cwd: WORKER, stdio: 'pipe' },
);
const G = await import(`file://${bundle}`);

function fakeEnv(raw) {
  const seen = { runs: 0, settled: [] };
  return {
    seen,
    env: {
      AI: {
        run: async () => {
          seen.runs += 1;
          return structuredClone(raw);
        },
      },
      KV: { get: async () => null },
      AI_GATEWAY_ID: 'test-gateway',
      ENVIRONMENT: 'test',
      BUDGET_DO: {
        idFromName: () => 'singleton',
        get: () => ({
          fetch: async (url, init) => {
            const body = init?.body ? JSON.parse(init.body) : {};
            if (url.endsWith('/reserve')) return { json: async () => ({ ok: true, reserved: body.neurons }) };
            if (url.endsWith('/settle')) seen.settled.push(body);
            return { json: async () => ({ ok: true }) };
          },
        }),
      },
    },
  };
}

const request = {
  model: 'stone',
  messages: [{ role: 'user', content: 'Return a complete Luau module.' }],
  maxTokens: 2400,
};

test('gateway retains a provider length finish after usage is settled', async () => {
  G.resetModelCache();
  const { env, seen } = fakeEnv({
    choices: [{ finish_reason: 'length', message: { content: '```luau\nlocal module = {\n' } }],
    usage: { prompt_tokens: 12, completion_tokens: 2400 },
  });

  const response = await G.chat(env, request, { kind: 'apple-max-base-test' });

  assert.equal(seen.runs, 1);
  assert.equal(seen.settled.length, 1, 'a truncated response still consumed provider usage and must settle');
  assert.equal(response.finishReason, 'length');
  assert.equal(response.text, '```luau\nlocal module = {');
  assert.deepEqual(response.toolCalls, []);
  assert.deepEqual(response.usage, { inputTokens: 12, outputTokens: 2400 });
});

test('gateway still reports an ordinary complete response as stop', async () => {
  G.resetModelCache();
  const { env } = fakeEnv({
    choices: [{ finish_reason: 'stop', message: { content: 'complete' } }],
    usage: { prompt_tokens: 12, completion_tokens: 1 },
  });

  const response = await G.chat(env, request, { kind: 'apple-max-base-test' });
  assert.equal(response.finishReason, 'stop');
  assert.equal(response.text, 'complete');
});

test.after(() => rmSync(temporary, { recursive: true, force: true }));
