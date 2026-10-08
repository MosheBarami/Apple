import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createEventParser, isolatedEnvironment, runProcess, invokeCli } from './cli.mjs';

const event = (type, part) => JSON.stringify({ type, part }) + '\n';
const complete = (text = 'OK', finish = {}) => event('step_start', { type: 'step-start' })
  + event('text', { id: 'p1', text }) + event('step_finish', { reason: 'stop', cost: 0,
    tokens: { input: 17, output: 2, cache: { read: 0 } }, ...finish });

test('NDJSON handles chunk boundaries and multibyte text, uses reported tokens', () => {
  const deltas = [], parser = createEventParser({ onText: (x) => deltas.push(x) });
  for (const byte of Buffer.from(complete('שלום'))) parser.push(Uint8Array.of(byte));
  const result = parser.end(0);
  assert.equal(result.text, 'שלום'); assert.deepEqual(deltas, ['שלום']);
  assert.equal(result.usage.inputTokens, 17); assert.equal(result.usage.reasoningTokens, null);
});

for (const [name, output, status, code] of [
  ['zero exit without completion', event('text', { text: 'OK' }), 0, 'incomplete'],
  ['error event with zero exit', JSON.stringify({ type: 'error', error: { data: { message: 'secret' } } }) + '\n', 0, 'inference_error'],
  ['truncated response', complete('partial', { reason: 'length' }), 0, 'incomplete'],
  ['internal tool event', event('tool_use', { type: 'tool' }), 0, 'isolation_violation'],
  ['paid result', complete('OK', { cost: 0.01 }), 0, 'not_free'],
  ['unknown cost', complete('OK', { cost: undefined }), 0, 'not_free'],
  ['nonzero exit', complete(), 1, 'process_failed'],
  ['invalid JSON', 'broken\n', 0, 'invalid_events'],
]) test(name, () => {
  assert.throws(() => { const parser = createEventParser(); parser.push(output); parser.end(status); },
    (error) => error.code === code && !error.message.includes('secret'));
});

test('duplicate finalized text parts are not rendered or counted twice', () => {
  const parser = createEventParser(); parser.push(complete() + event('text', { id: 'p1', text: 'OK' }));
  assert.equal(parser.end(0).text, 'OK');
});

test('isolation uses clean roots, denies every tool, disables personal config and plugins', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runner-isolation-test-'));
  try {
    const result = await isolatedEnvironment(root, { apiKey: 'test-key', model: 'opencode/free-test' });
    assert.deepEqual(Object.keys(result.env).filter((key) => /KEY|TOKEN|SECRET/.test(key)), ['OPENCODE_API_KEY']);
    assert.equal(result.env.HOME, join(root, 'home'));
    assert.equal(result.env.OPENCODE_DISABLE_CLAUDE_CODE, 'true');
    assert.equal(result.env.OPENCODE_DISABLE_DEFAULT_PLUGINS, 'true');
    const config = JSON.parse(await readFile(result.env.OPENCODE_CONFIG, 'utf8'));
    assert.deepEqual(config.permission, { '*': 'deny' });
    assert.deepEqual(config.mcp, {}); assert.deepEqual(config.plugin, []);
    assert.equal(config.share, 'disabled');
    assert.equal(config.small_model, config.model);
    assert.equal(config.agent['studpilot-inference'].steps, 1);
    assert.equal(JSON.stringify(config).includes('test-key'), false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('process receives literal input through stdin, no shell interpretation', async () => {
  const input = '$(touch /tmp/should-not-exist) `printf secret` ; --model paid';
  let output = '';
  const code = await runProcess({ executable: process.execPath,
    args: ['-e', 'process.stdin.pipe(process.stdout)'], input,
    environment: { cwd: tmpdir(), env: { PATH: '/usr/bin:/bin' } },
    onStdout: (chunk) => { output += chunk; } });
  assert.equal(code, 0); assert.equal(output, input);
});

test('timeout terminates and reports an actionable bounded failure', async () => {
  await assert.rejects(runProcess({ executable: process.execPath,
    args: ['-e', 'setInterval(()=>{},1000)'], timeoutMs: 40,
    environment: { cwd: tmpdir(), env: {} } }), (error) => error.code === 'timeout');
});

test('cancellation stops an active process and an already cancelled request never starts', async () => {
  const abort = new AbortController();
  const promise = runProcess({ executable: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'],
    signal: abort.signal, environment: { cwd: tmpdir(), env: {} } });
  setTimeout(() => abort.abort(), 30);
  await assert.rejects(promise, (error) => error.code === 'cancelled');
  await assert.rejects(runProcess({ executable: process.execPath, args: [], signal: abort.signal,
    environment: { cwd: tmpdir(), env: {} } }), /abort/i);
});

test('unlisted or paid model identities are refused before starting OpenCode', async () => {
  await assert.rejects(invokeCli({ executable: '/does/not/exist', modelId: 'paid', allowedModels: new Set(['free']),
    input: 'OK' }), (error) => error.code === 'model_unavailable');
});
