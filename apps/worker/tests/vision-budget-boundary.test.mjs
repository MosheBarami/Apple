/** Over-cap GLM vision requests must fail in chat() before reservation or provider invocation. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = mkdtempSync(join(tmpdir(), 'vision-budget-boundary-'));
const bundle = join(temporary, 'gateway.mjs');
try {
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
    [join(WORKER, 'src', 'gateway.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${bundle}`],
    { cwd: WORKER, stdio: 'pipe' });
  const G = await import(pathToFileURL(bundle).href);

  test('chat refuses too many conservatively priced inline images before reserve or AI.run', async () => {
    G.resetModelCache();
    const seen = { reserve: 0, run: 0 };
    const env = {
      KV: { get: async () => null },
      AI: { run: async () => { seen.run++; throw new Error('AI.run must not be reached'); } },
      BUDGET_DO: {
        idFromName: () => 'singleton',
        get: () => ({ fetch: async () => { seen.reserve++; throw new Error('reserve must not be reached'); } }),
      },
    };
    const image = { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } };
    await assert.rejects(
      G.chat(env, { model: 'vision', messages: [{ role: 'user', content: Array(20).fill(image) }], maxTokens: 4000 }),
      (error) => error instanceof G.BudgetError && error.reason === 'request_too_large',
    );
    assert.deepEqual(seen, { reserve: 0, run: 0 });
  });
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
