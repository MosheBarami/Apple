/**
 * THE WAIT HAS TO OUTLAST THE THING IT IS WAITING FOR.
 *
 * Measured against this worker's own model_call log on 2026-09-20. Every run that died that day
 * died on a retry ladder spanning 7.6-7.7 s — three waits of 1200/2400/3600 ms. In the SAME window
 * the SAME refusal class cleared at 1.9 s, 5.0 s, 6.2 s, 6.3 s, 12.1 s and 60.6 s. The ladder was
 * inside the distribution of recovery times rather than past it, so whether a customer's run
 * survived was decided by which side of 7.6 s the provider happened to fall on.
 *
 * Retrying here is free: the request never reached the model, the refusal returns in 134-526 ms,
 * nothing is billed, and the reservation is held. The alternative to waiting is discarding work the
 * customer has already paid for. These tests pin that the ladder outlasts the longest recovery that
 * was actually observed, and that the two error classifications either side of it are right.
 *
 * They read the regexes out of gateway.ts and RUN them, rather than asserting that the source
 * contains some text: a test that greps for a pattern passes over a pattern that is present and
 * wrong.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, '..', 'src', 'gateway.ts'), 'utf8');

/** The longest recovery time actually measured for this refusal class, in ms. */
const LONGEST_OBSERVED_RECOVERY_MS = 60_600;

test('the retry ladder outlasts the longest recovery that was measured', () => {
  const m = SRC.match(/RATE_LIMIT_WAITS_MS\s*=\s*\[([^\]]+)\]/);
  assert.ok(m, 'RATE_LIMIT_WAITS_MS could not be read out of gateway.ts — this test knows no ladder, '
    + 'so it has verified nothing. Do not read a pass here as a pass.');
  const waits = m[1].split(',').map((n) => Number(n.trim().replace(/_/g, ''))).filter((n) => Number.isFinite(n));
  assert.ok(waits.length >= 4, `only ${waits.length} waits parsed from the ladder`);

  const total = waits.reduce((a, b) => a + b, 0);
  assert.ok(total >= LONGEST_OBSERVED_RECOVERY_MS,
    `the ladder waits ${total} ms in total; the longest recovery measured for this refusal class was `
    + `${LONGEST_OBSERVED_RECOVERY_MS} ms, so a run hitting that case is still killed by a wait that `
    + 'ends too early. Raise the ladder or record a new measurement that justifies lowering it.');

  // Monotonic backoff, not a flat wall of long sleeps: the common case cleared in under two
  // seconds, and making every caller pay the worst case would be its own defect.
  assert.ok(waits[0] <= 2_000, `the first wait is ${waits[0]} ms; most recoveries measured under 2 s`);
  for (let i = 1; i < waits.length; i++) {
    assert.ok(waits[i] >= waits[i - 1], `wait ${i} (${waits[i]} ms) is shorter than wait ${i - 1}`);
  }
});

test('the ladder length and the loop bound cannot drift apart', () => {
  // MAX_RATE_LIMIT_WAITS indexes into the array. If one is edited and not the other the loop reads
  // undefined and setTimeout(undefined) fires immediately — a ladder that silently stops waiting.
  assert.match(SRC, /MAX_RATE_LIMIT_WAITS\s*=\s*RATE_LIMIT_WAITS_MS\.length/,
    'the bound is written independently of the ladder, so the two can drift');
});

test('an exhausted allowance and a transient are told apart', () => {
  const m = SRC.match(/if \((\/[^/]+\/i)\.test\(msg\)\) \{\s*\n\s*throw new BudgetError\('daily_cap'/);
  assert.ok(m, 'the daily-cap branch could not be read out of gateway.ts; nothing was verified');
  const re = new RegExp(m[1].slice(1, -2), 'i');

  // The defect: `neurons` on its own matched any message containing the word, so a transient was
  // reported to the customer as an exhausted quota — telling somebody to stop trying when trying
  // again would have worked.
  assert.equal(re.test('Request failed: capacity temporarily unavailable, no neurons were spent'), false,
    'a message that merely contains the word "neurons" is still read as the daily cap');
  assert.equal(re.test('error 3021: rate limited'), false, 'a rate limit is read as the daily cap');
  assert.equal(re.test('error 4006: daily free allocation exceeded'), true, 'the real daily cap is no longer caught');
});

test('what the adapter calls retryable and what the customer is told cannot drift apart', () => {
  // TWO REGEXES, IN TWO FILES, THAT MUST AGREE. providers/workers-ai.ts decides which failures are
  // free to retry; gateway.ts decides which exhausted failures are described to the customer as
  // "busy, try again" rather than thrown as `inference failed (model): ...`. A class present in the
  // first and missing from the second is a transient shown to somebody as a crash — which is
  // exactly what `capacity temporarily` was until 2026-09-20.
  const g = SRC.match(/if \((\/[^/]+\/i)\.test\(msg\)\) \{\s*\n\s*throw new RateLimitedError/);
  assert.ok(g, 'the rate-limit branch could not be read out of gateway.ts; nothing was verified');
  const busy = new RegExp(g[1].slice(1, -2), 'i');

  const adapterSrc = readFileSync(join(HERE, '..', 'src', 'providers', 'workers-ai.ts'), 'utf8');
  const a = adapterSrc.match(/WORKERS_AI_RETRYABLE\s*=\s*\/([^/]+)\/i/);
  assert.ok(a, 'WORKERS_AI_RETRYABLE could not be read out of providers/workers-ai.ts, so this test '
    + 'knows only one side of a comparison between two. It has verified nothing.');
  const retryable = new RegExp(a[1], 'i');

  const CORPUS = [
    'error 3021: rate limited',
    'rate limit exceeded for this model',
    'too many requests, slow down',
    'capacity temporarily unavailable',
    'AiError: 3040: Request failed for model on provider workers-ai',
    'error 4006: daily free allocation exceeded',
    'the model returned an empty body',
  ];
  for (const msg of CORPUS) {
    assert.equal(busy.test(msg), retryable.test(msg),
      `"${msg}": the adapter says retryable=${retryable.test(msg)} but the customer-facing branch `
      + `says busy=${busy.test(msg)}. One of the two moved without the other.`);
  }
});
