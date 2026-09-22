/**
 * AN AUTOMATIC RETRY MUST NOT MULTIPLY THE BILL.
 *
 * The owner's row, verbatim: "a run that produced nothing the user can keep must not bill for the
 * attempt, and no automatic retry may multiply inference cost." run-refund.ts and its own test file
 * own the first clause. NOTHING owned the second one, and on 2026-09-20 the ladder this guards grew
 * from four attempts over 7.6 s to seven over 63 s — a fourteenfold rise in how many times one
 * request may be re-sent, argued for in a comment that asserts, in prose, that "nothing is billed,
 * and the reservation is held".
 *
 * That assertion is true. It was true in a comment, which is not a place a claim about somebody's
 * money can live: the file's existing tests pin the ladder's DURATION and the two error
 * classifications either side of it, and not one of them counts a reservation. So the ladder could
 * have been rebuilt to reserve per attempt and every test in the repository would still have been
 * green while the owner's worst case multiplied by seven.
 *
 * THE PROPERTY, not the wording: however many times the gateway re-sends one request, the shared
 * budget is reserved ONCE, settled AT MOST once, and released at most once. Attempts are free
 * because the request never reached the model; the moment one of them is paid for, retrying it
 * seven times is seven times the bill.
 *
 * THIS RUNS THE REAL GATEWAY. It bundles apps/worker/src/gateway.ts with esbuild and drives it with
 * a synthetic Workers AI binding and a synthetic BudgetDO that counts what it is asked to do — the
 * same harness gateway-finish-reason.test.mjs uses. It is not a grep over the source: a test that
 * asserts `release` appears once in the file passes over a `release` that appears once and is
 * inside the loop. No network call and no paid provider call is made.
 *
 * THE LADDER'S SLEEPS ARE NOT SLEPT. `globalThis.setTimeout` is swapped for one that fires on the
 * next tick and records the delay it was asked for, so the seven-attempt case costs milliseconds
 * instead of 63 seconds. The recorded delays are asserted against the ladder in the source, which
 * is what stops the swap from turning "the ladder waited" into something this test cannot see.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(WORKER, 'src', 'gateway.ts'), 'utf8');
const temporary = mkdtempSync(join(tmpdir(), 'retry-bill-'));
const bundle = join(temporary, 'gateway.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'gateway.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${bundle}`],
  { cwd: WORKER, stdio: 'pipe' },
);
const G = await import(`file://${bundle}`);

/**
 * How many attempts the ladder in the source allows, read from the source rather than typed.
 *
 * A typed 7 would be a second copy of the ladder's length, and this file would go on asserting the
 * old shape after the next change to it — which is the exact failure the ladder's own test file
 * documents when PLAN_LIMITS moved out from under a regex.
 */
function ladderFromSource() {
  const m = /RATE_LIMIT_WAITS_MS\s*=\s*\[([^\]]+)\]/.exec(SRC);
  assert.ok(
    m,
    'RATE_LIMIT_WAITS_MS could not be read out of gateway.ts, so this file does not know how many '
      + 'attempts to expect and has verified nothing. Follow the constant; do not read a pass here.',
  );
  const waits = m[1]
    .split(',')
    .map((n) => Number(n.trim().replace(/_/g, '')))
    .filter((n) => Number.isFinite(n));
  assert.ok(waits.length > 0, 'the ladder parsed to zero waits — the shape of the constant changed');
  return waits;
}

/** A refusal the Workers AI adapter classifies as retryable (WORKERS_AI_RETRYABLE). */
const rateLimited = () => new Error('AiError: 3021: Rate limit exceeded for this model');
/** A refusal it classifies as NOT retryable — the model ran and the tokens were billed. */
const inferenceFailed = () => new Error('AiError: 5000: internal error while running inference');

/**
 * `behaviour(attempt)` is called per model call and either throws or returns a raw response.
 * Everything the fake budget object is asked to do is counted, never summarised: the counts are the
 * measurement, and a fake that answered `{ok:true}` without recording would let this test pass on a
 * gateway that reserved seven times.
 */
function fakeEnv(behaviour) {
  const seen = { runs: 0, reserved: [], settled: [], released: [] };
  return {
    seen,
    env: {
      AI: {
        run: async () => {
          const out = behaviour(seen.runs);
          seen.runs += 1;
          if (out instanceof Error) throw out;
          return structuredClone(out);
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
            if (url.endsWith('/reserve')) {
              seen.reserved.push(body);
              return { json: async () => ({ ok: true, reserved: body.neurons }) };
            }
            if (url.endsWith('/settle')) seen.settled.push(body);
            if (url.endsWith('/release')) seen.released.push(body);
            return { json: async () => ({ ok: true }) };
          },
        }),
      },
    },
  };
}

const ok = (text, outputTokens) => ({
  choices: [{ finish_reason: 'stop', message: { content: text } }],
  usage: { prompt_tokens: 12, completion_tokens: outputTokens },
});

const request = {
  model: 'agent',
  messages: [{ role: 'user', content: 'Build the thing.' }],
  maxTokens: 512,
};

/** Runs `fn` with the ladder's sleeps collapsed, and hands back every delay that was asked for. */
async function withoutSleeping(fn) {
  const real = globalThis.setTimeout;
  const waited = [];
  // Still a real timer, at zero delay: replacing it with a synchronous call would change the
  // await ordering inside the loop, and a test that alters control flow to observe it is measuring
  // its own instrument.
  globalThis.setTimeout = (cb, ms, ...rest) => {
    waited.push(ms);
    return real(cb, 0, ...rest);
  };
  try {
    return { waited, result: await fn() };
  } finally {
    globalThis.setTimeout = real;
  }
}

test('seven attempts at one request are one reservation, and nothing is settled', async () => {
  G.resetModelCache();
  const ladder = ladderFromSource();
  const { env, seen } = fakeEnv(() => rateLimited());

  const { waited } = await withoutSleeping(async () => {
    await assert.rejects(
      () => G.chat(env, request, { kind: 'retry-bill-test' }),
      (e) => e.name === 'RateLimitedError',
      'an exhausted ladder must surface as a rate limit, not as a crash',
    );
  });

  assert.equal(
    seen.runs,
    ladder.length + 1,
    `the ladder allows ${ladder.length} waits, so ${ladder.length + 1} attempts; the gateway made ${seen.runs}`,
  );
  assert.deepEqual(waited, ladder, 'the waits actually taken are not the ladder in the source');
  assert.equal(
    seen.reserved.length,
    1,
    `${seen.runs} attempts took ${seen.reserved.length} reservations against the shared budget. `
      + 'One request must reserve once however many times it is re-sent, or the owner\'s worst-case '
      + `bill multiplies by ${seen.runs}.`,
  );
  assert.equal(
    seen.settled.length,
    0,
    'a request the provider never ran settled neurons. Nothing reached the model, so nothing may be '
      + 'charged for it.',
  );
  assert.equal(seen.released.length, 1, 'the held reservation must be handed back exactly once');
  assert.equal(
    seen.released[0].reserved,
    seen.reserved[0].neurons,
    'the amount released is not the amount reserved — the difference is stranded budget nobody spent',
  );
});

test('a retry that eventually succeeds is billed once, for one response', async () => {
  G.resetModelCache();
  // Two refusals, then the answer. The refusals are free; the answer is not.
  const { env, seen } = fakeEnv((attempt) => (attempt < 2 ? rateLimited() : ok('done', 100)));

  const { waited, result } = await withoutSleeping(() => G.chat(env, request, { kind: 'retry-bill-test' }));

  assert.equal(result.text, 'done');
  assert.equal(seen.runs, 3, 'two refusals and one answer');
  assert.equal(waited.length, 2, 'one wait per refusal');
  assert.equal(seen.reserved.length, 1, 'three attempts must not take three reservations');
  assert.equal(seen.settled.length, 1, 'three attempts must not settle three times');
  assert.equal(seen.released.length, 0, 'a reservation that was settled must not also be released');
  // THE BILL ITSELF, not just the number of writes. `actual` is what the day's spend is charged,
  // and it has to be the usage of the ONE response that happened — not the sum over attempts.
  const single = fakeEnv(() => ok('done', 100));
  G.resetModelCache();
  await G.chat(single.env, request, { kind: 'retry-bill-test' });
  assert.equal(
    seen.settled[0].actual,
    single.seen.settled[0].actual,
    'the retried call settled a different number of neurons than the same call made once. The '
      + 'refusals never reached the model and must not appear in the bill.',
  );
});

test('THE CONTROL: a failure that DID reach the model is not retried at all', () => {
  // The distinction the whole policy rests on, stated in gateway.ts as "a FAILED INFERENCE is never
  // retried. The model ran, tokens were billed, and running it again bills the same work twice."
  // Without this the first test is satisfiable by a gateway that retries everything.
  return (async () => {
    G.resetModelCache();
    const { env, seen } = fakeEnv(() => inferenceFailed());
    const { waited } = await withoutSleeping(async () => {
      await assert.rejects(
        () => G.chat(env, request, { kind: 'retry-bill-test' }),
        (error) => {
          assert.equal(error?.name, 'ProviderError');
          assert.equal(error?.kind, 'transient',
            'a transport/provider outage must keep its structured classification for SessionDO');
          assert.match(error?.message ?? '', /inference failed/);
          return true;
        },
        'a non-retryable provider failure must surface as itself',
      );
    });
    assert.equal(seen.runs, 1, 'a billed failure was re-sent — that bills the same work twice');
    assert.deepEqual(waited, [], 'the gateway waited before giving up on a failure it must not retry');
    assert.equal(seen.reserved.length, 1);
    assert.equal(seen.settled.length, 0);
    assert.equal(seen.released.length, 1, 'the reservation for a call that failed must be handed back');
  })();
});

test.after(() => rmSync(temporary, { recursive: true, force: true }));
