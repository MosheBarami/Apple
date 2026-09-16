/**
 * HOW FAST ONE DISCORD ACCOUNT MAY TALK TO US.
 *
 * The link decides WHO may spend an account. This file decides HOW OFTEN anybody may ask, which is
 * a different question and is not answered anywhere else in the product. The IP limiter in
 * index.ts sees Discord's edge rather than the person. The per-account quota is never reached by
 * `/link`, `/unlink`, or by a `/status` that starts no run — those commands cost the caller
 * nothing and cost us a Durable Object round trip each. Unlimited, they are a free amplifier
 * pointed at our own storage, and the person holding the key is not even the person paying.
 *
 * What is asserted here:
 *   - the ceiling is real: N commands pass, N+1 does not
 *   - ONE ceiling covers every command, so per-command limits cannot multiply into a number no
 *     reader of the constants would predict
 *   - `/build`, the only command that spends money, is held to a lower one as well
 *   - being refused does not consume the budget for the command you were not allowed to run
 *   - the count is in STORAGE, so eviction does not reset it — an in-memory limiter on an object
 *     that is evicted within seconds of going idle is not a limiter
 *   - a spent window is deleted, so this object does not accumulate one row per Discord user id
 *     that ever typed a command
 *
 * The Durable Object runtime is shimmed exactly as discord-link.test.mjs shims it: the real
 * storage semantics (get/put/delete/list by prefix) are exercised without workerd, and nothing
 * about the LOGIC is faked.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'virtual:cloudflare-workers', shortCircuit: true };
    if (/^\.{1,2}\//.test(spec) && !/\.[a-z]+$/.test(spec)) return next(`${spec}.ts`, ctx);
    return next(spec, ctx);
  },
  load(url, ctx, next) {
    if (url === 'virtual:cloudflare-workers') {
      return {
        format: 'module',
        shortCircuit: true,
        source: 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }',
      };
    }
    return next(url, ctx);
  },
});

const { DiscordDO } = await import('../src/do/discord.ts');
const { RATE_DEFAULT, RATE_WINDOW_MS, rateLimitForCommand } = await import('../src/discord.ts');

// ------------------------------------------------------------------ the shim

function memoryStorage(map = new Map()) {
  let alarm = null;
  return {
    map,
    get alarmAt() {
      return alarm;
    },
    async get(key) {
      return map.get(key);
    },
    async put(key, value) {
      map.set(key, value);
    },
    async delete(key) {
      return map.delete(key);
    },
    async list({ prefix } = {}) {
      const out = new Map();
      for (const [k, v] of map) if (!prefix || k.startsWith(prefix)) out.set(k, v);
      return out;
    },
    async setAlarm(at) {
      alarm = at;
    },
    async deleteAlarm() {
      alarm = null;
    },
  };
}

/** `map` is passed in so a test can build a SECOND object over the same rows — i.e. an eviction. */
function makeDO(map) {
  const storage = memoryStorage(map);
  const obj = new DiscordDO({ storage }, { SESSION_DO: null });
  return {
    storage,
    obj,
    rate: async (discordUserId, command) =>
      (
        await obj.fetch(
          new Request('https://do/rate', { method: 'POST', body: JSON.stringify({ discordUserId, command }) }),
        )
      ).json(),
  };
}

/** Run one command `n` times and return the verdicts, in order. */
async function run(d, who, command, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(await d.rate(who, command));
  return out;
}

// ------------------------------------------------------------------ the bound

test('a Discord user gets exactly the documented number of commands, and then is refused', async () => {
  const d = makeDO();
  const verdicts = await run(d, '4242', 'status', RATE_DEFAULT + 1);
  assert.deepEqual(
    verdicts.slice(0, RATE_DEFAULT).map((v) => v.ok),
    Array(RATE_DEFAULT).fill(true),
    `the first ${RATE_DEFAULT} commands must be allowed`,
  );
  assert.equal(verdicts[RATE_DEFAULT].ok, false, `command ${RATE_DEFAULT + 1} must be refused`);
  assert.ok(verdicts[RATE_DEFAULT].retryAfterS > 0, 'a refusal has to say how long to wait');
  assert.ok(verdicts[RATE_DEFAULT].retryAfterS <= RATE_WINDOW_MS / 1000, 'and not longer than the window itself');
});

test('one ceiling covers every command, so per-command limits cannot multiply', async () => {
  // The bug this exists to prevent: a bucket per command means five commands at twenty a minute is
  // a hundred a minute, and the number a reader takes away from RATE_DEFAULT is wrong by 5x.
  const d = makeDO();
  const spread = ['status', 'credits', 'link', 'unlink'];
  let allowed = 0;
  for (let i = 0; i < RATE_DEFAULT + 4; i++) {
    const v = await d.rate('4242', spread[i % spread.length]);
    if (v.ok) allowed++;
  }
  assert.equal(allowed, RATE_DEFAULT, 'spreading the load across commands must not buy extra headroom');
});

test('/build is held to a lower ceiling than the commands that cost nothing', async () => {
  const limit = rateLimitForCommand('build');
  assert.ok(limit < RATE_DEFAULT, 'the command that spends money must be limited harder');
  const d = makeDO();
  const verdicts = await run(d, '4242', 'build', limit + 1);
  assert.equal(verdicts[limit - 1].ok, true, `build ${limit} must still be allowed`);
  assert.equal(verdicts[limit].ok, false, `build ${limit + 1} must be refused`);
  // …and the wide bucket is nowhere near spent, so this refusal is the narrow one doing its job.
  assert.ok(limit + 1 < RATE_DEFAULT, 'otherwise this test cannot tell the two buckets apart');
  assert.equal((await d.rate('4242', 'status')).ok, true, 'a build limit must not lock the user out of /status');
});

test('being refused does not consume the budget for the command you were not allowed to run', async () => {
  // Spend the WIDE bucket on reads, then ask for a build. The build is refused by the wide bucket
  // — and must not also cost a slot in the narrow one, or a user who was told to slow down comes
  // back after the window with their build budget already gone.
  const d = makeDO();
  await run(d, '4242', 'status', RATE_DEFAULT);
  assert.equal((await d.rate('4242', 'build')).ok, false, 'the wide bucket is spent, so this is refused');
  assert.equal(d.storage.map.has('rate:build:4242'), false, 'a refused command must not have opened a build bucket');
});

test('one user running out does not limit anybody else', async () => {
  const d = makeDO();
  await run(d, '4242', 'status', RATE_DEFAULT + 1);
  assert.equal((await d.rate('9999', 'status')).ok, true, 'the bucket is keyed on the Discord user id');
});

// -------------------------------------------------------- windows and storage

test('the window expires and the user is let back in', async () => {
  const d = makeDO();
  await run(d, '4242', 'status', RATE_DEFAULT + 1);
  // Age the stored window past its end rather than sleeping a minute in a test.
  const row = d.storage.map.get('rate:all:4242');
  d.storage.map.set('rate:all:4242', { ...row, startedAt: row.startedAt - RATE_WINDOW_MS - 1 });
  assert.equal((await d.rate('4242', 'status')).ok, true, 'a limit that never lifts is a ban');
});

test('the count survives eviction, because it is in storage and not in a field on the object', async () => {
  // A Durable Object with no live work is evicted within seconds. An in-memory counter would make
  // the real ceiling "RATE_DEFAULT, unless you pause long enough for us to forget", which is not a
  // ceiling at all — and pausing is free.
  const shared = new Map();
  const first = makeDO(shared);
  await run(first, '4242', 'status', RATE_DEFAULT);
  const second = makeDO(shared); // same rows, brand new instance: the object was evicted
  assert.equal((await second.rate('4242', 'status')).ok, false, 'eviction must not hand back a fresh budget');
});

test('a spent window is deleted, so this object does not grow a row per Discord user for ever', async () => {
  const d = makeDO();
  await d.rate('4242', 'status');
  assert.ok(d.storage.map.has('rate:all:4242'), 'the window has to be written to be enforced');
  const row = d.storage.map.get('rate:all:4242');
  d.storage.map.set('rate:all:4242', { ...row, startedAt: row.startedAt - RATE_WINDOW_MS - 1 });
  await d.obj.alarm();
  assert.equal(d.storage.map.has('rate:all:4242'), false, 'a spent window is indistinguishable from never having run a command');
});

test('a live rate window keeps an alarm, so nothing is left to expire it later', async () => {
  // reschedule() clears the alarm when there is no watch and no live code. If rate rows were not
  // counted there, the row written by the last command of the day would outlive every later
  // wakeup and never be swept.
  const d = makeDO();
  await d.rate('4242', 'status');
  assert.ok(d.storage.alarmAt !== null, 'a row with an expiry and no alarm is a row that is never deleted');
  assert.ok(d.storage.alarmAt <= Date.now() + RATE_WINDOW_MS + 2000, 'and the alarm must land around when the window ends');
});

test('an object whose windows have all expired goes back to sleep', async () => {
  // The other half: sweeping must not leave a self-renewing alarm, which is a bill that never stops.
  const d = makeDO();
  await d.rate('4242', 'status');
  const row = d.storage.map.get('rate:all:4242');
  d.storage.map.set('rate:all:4242', { ...row, startedAt: row.startedAt - RATE_WINDOW_MS - 1 });
  await d.obj.alarm();
  assert.equal(d.storage.alarmAt, null, 'an object with nothing left to do must stop waking up');
});

// ------------------------------------------------------------------ the edges

test('/build cannot dodge its lower ceiling by arriving in a different case', async () => {
  // `rateLimitForCommand` is a plain lookup, so `BUILD` is an unrecognised command — and an
  // unrecognised command gets the WIDE ceiling, which is five times build's own. The spelling
  // would buy the budget. Discord's command names are lower-case, so normalising costs nothing.
  const limit = rateLimitForCommand('build');
  const d = makeDO();
  const verdicts = await run(d, '4242', 'BUILD', limit + 1);
  assert.equal(verdicts[limit].ok, false, 'a differently-cased name must land in the same bucket');
});

/**
 * THE KEY SPACE IS BOUNDED BY THE COMMAND LIST, NOT BY WHAT THE PAYLOAD SAYS.
 *
 * The command name is attacker-influenced text — signed by Discord, but not chosen by us — and it
 * is concatenated into a storage key. The thing that stops `rate:<anything>:<user>` rows being
 * minted at will is that a bucket of one's own is opened ONLY for a name the limit table already
 * knows. An unknown name is bounded by the wide bucket and writes nothing else. Drop that
 * condition and every distinct string in a `data.name` field becomes a row in this object.
 */
test('an unrecognised command gets no bucket of its own, so the key space cannot be grown by naming things', async () => {
  const d = makeDO();
  for (const name of ['not-a-command', 'all:4242', '../../link', 'x'.repeat(200)]) await d.rate('4242', name);
  const keys = [...d.storage.map.keys()].filter((k) => k.startsWith('rate:'));
  assert.deepEqual(keys, ['rate:all:4242'], 'only the wide bucket may exist for commands Apple does not know');
});

test('an interaction with no Discord user id is refused rather than sharing one bucket', async () => {
  // Falling back to a single empty-string key would put every anonymous caller in one bucket and,
  // worse, let the first of them exhaust it for the rest.
  const d = makeDO();
  assert.equal((await d.rate('', 'status')).ok, false, 'no id means no way to limit, which means no.');
});
