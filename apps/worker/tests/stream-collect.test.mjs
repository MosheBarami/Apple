/** Live reasoning: a streamed step is rebuilt into the same response as an unstreamed one (stream-collect.ts). */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'sc-')), 's.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [join(WORKER, 'src', 'stream-collect.ts'), '--bundle', '--format=esm', '--outfile=' + out], { cwd: WORKER, stdio: 'pipe' });
const S = await import(`file://${out}`);

// Captured from @cf/zai-org/glm-5.3-flash with stream:true on 2026-10-01 (trimmed fields), plus reasoning deltas.
const LINES = [
  'data: {"choices":[{"delta":{"content":"","reasoning_content":null,"role":"assistant"},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"content":null,"reasoning_content":"The user wants "},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"content":null,"reasoning_content":"2 + 3."},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"content":null,"tool_calls":[{"function":{"arguments":"","name":"add"},"id":"call_538","index":0,"type":"function"}]},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":"{\\"a\\": 2","name":null},"id":null,"index":0,"type":"function"}]},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"tool_calls":[{"function":{"arguments":", \\"b\\": 3}","name":null},"id":null,"index":0,"type":"function"}]},"finish_reason":null,"index":0}]}',
  'data: {"choices":[{"delta":{"reasoning_content":null},"finish_reason":"tool_calls","index":0}],"usage":{"prompt_tokens":0,"completion_tokens":0}}',
  'data: {"response":"","usage":{"prompt_tokens":175,"completion_tokens":17,"total_tokens":192,"neurons":3.15}}',
  'data: [DONE]',
];

test('a streamed GLM step: reasoning arrives piece by piece, and the whole response matches an unstreamed one', async () => {
  const bytes = new TextEncoder().encode(LINES.join('\n') + '\n');
  // Split into awkward chunks, as the network does.
  const stream = new ReadableStream({ start(c) { for (let i = 0; i < bytes.length; i += 37) c.enqueue(bytes.slice(i, i + 37)); c.close(); } });
  const seen = [];
  const raw = await S.collectStream(stream, (d) => seen.push(d));
  assert.deepEqual(seen, ['The user wants ', '2 + 3.'], 'reasoning reaches the caller as it arrives');
  const m = raw.choices[0].message;
  assert.equal(m.reasoning_content, 'The user wants 2 + 3.');
  assert.equal(m.tool_calls.length, 1);
  assert.equal(m.tool_calls[0].function.name, 'add');
  assert.deepEqual(JSON.parse(m.tool_calls[0].function.arguments), { a: 2, b: 3 });
  assert.equal(m.tool_calls[0].id, 'call_538');
  assert.equal(raw.choices[0].finish_reason, 'tool_calls');
  assert.equal(raw.usage.completion_tokens, 17, 'the real usage (last line) is kept, not the zeros before it');
});
