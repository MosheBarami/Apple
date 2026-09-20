/**
 * THE HARDEST STEP MUST NOT GET THE SMALLEST BUDGET.
 *
 * Observed in production on 2026-09-20: a 16-step tower-defence build at "Reasoning effort: high"
 * died on step 1 of 16 with "The model reached its output limit before finishing this step", and
 * the run was charged 30 Credits for nothing the customer could use.
 *
 * The cause was `tokensForEffort`: `high` scaled the base by 1.25 while `medium` scaled it by 2.5.
 * On mode `stone` that asked for 5,500 tokens of a model configured to give 6,500 — the effort tier
 * chosen for the hardest steps left a thousand tokens of its own model unasked for, and a reasoning
 * model spends its budget on thinking FIRST.
 *
 * These pin the three properties that keep that fixed, and the third is the one that keeps the fix
 * CHEAP rather than merely correct.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'apple-effort-')), 'reasoning.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'reasoning.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + out], { stdio: 'pipe', cwd: WORKER });
const { tokensForEffort } = await import(out);

const GATEWAY = readFileSync(join(WORKER, 'src', 'gateway.ts'), 'utf8');
const SESSION = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');

/** Every mode's base budget, read from session.ts so the two cannot drift. */
function modeBases() {
  const m = SESSION.match(/MODE_BASE_TOKENS[^=]*=\s*\{([^}]*)\}/);
  assert.ok(m, 'MODE_BASE_TOKENS could not be read out of session.ts — this test knows no budgets, '
    + 'so it has verified nothing. Do not read a pass here as a pass.');
  const bases = [...m[1].matchAll(/(\w+)\s*:\s*([0-9_]+)/g)].map(([, k, v]) => [k, Number(v.replace(/_/g, ''))]);
  assert.ok(bases.length >= 3, `only ${bases.length} mode budget(s) parsed`);
  return bases;
}

/** Every configured model ceiling, read from gateway.ts for the same reason. */
function ceilings() {
  const found = [...GATEWAY.matchAll(/maxTokens:\s*([0-9_]+)/g)].map((x) => Number(x[1].replace(/_/g, '')));
  assert.ok(found.length >= 2, `only ${found.length} model ceiling(s) found in gateway.ts`);
  return found;
}

test('high effort asks for at least every model ceiling, in every mode', () => {
  const cap = Math.max(...ceilings());
  for (const [mode, base] of modeBases()) {
    const asked = tokensForEffort(base, 'high');
    assert.ok(asked >= cap,
      `mode ${mode} asks for ${asked} at high effort against a configured ceiling of ${cap}. The `
      + 'hardest steps would be truncated by our own arithmetic rather than by the model — which is '
      + 'exactly what the ceiling in gateway.ts was raised to prevent.');
  }
});

test('effort and budget move in the same direction', () => {
  // The defect in one line: more thinking, less room to finish it.
  for (const [mode, base] of modeBases()) {
    const low = tokensForEffort(base, 'low');
    const high = tokensForEffort(base, 'high');
    assert.ok(high > low, `mode ${mode}: high (${high}) does not exceed low (${low})`);
  }
});

test('asking past the ceiling stays free — the clamp precedes the reservation', () => {
  //[[ THIS IS WHAT MAKES THE FIX CHEAP RATHER THAN MERELY CORRECT.
  //   gateway.ts clamps the request to the model's ceiling and then reserves neurons from the
  //   CLAMPED value. Asking for 2x the base therefore reserves exactly what the ceiling costs. If
  //   that order is ever reversed, this fix silently doubles the reservation on every hard step,
  //   and MAX_NEURONS_PER_REQUEST starts refusing the runs it is meant to protect. ]]
  const clampAt = GATEWAY.indexOf('const maxTokens = Math.min(req.maxTokens');
  assert.ok(clampAt > 0, 'the maxTokens clamp could not be found in gateway.ts; nothing was verified');

  const estimateAt = GATEWAY.indexOf('estimateNeurons(cfg.id, inputChars, maxTokens)');
  assert.ok(estimateAt > 0, 'the reservation estimate could not be found in gateway.ts; nothing was verified');

  assert.ok(clampAt < estimateAt,
    'gateway.ts now estimates the neuron reservation BEFORE clamping the request to the model '
    + 'ceiling. Asking past the ceiling is no longer free, and tokensForEffort asks past it on '
    + 'every high-effort step.');
});
