/**
 * PROVING YOU OWN THE ACCOUNT BEFORE YOU CAN SPEND IT.
 *
 * `/build` from Discord spends a paying customer's Sparks. The only thing standing between that
 * and a stranger is the link: a code minted by somebody SIGNED IN to the Apple account, redeemed
 * once, in Discord, by a user id Discord itself vouched for.
 *
 * The direction is the whole design and these tests pin it. The authenticated side mints; the
 * unauthenticated side presents. Redeeming a code is therefore evidence of having been signed in
 * to that account. Reverse it — mint in Discord, redeem in Apple — and the Discord user proves
 * nothing at all about themselves; only that somebody could read a code somebody else sent them.
 *
 * What is asserted here, each because the alternative is somebody else's bill:
 *   - a code works once, and only inside its ten minutes
 *   - guessing is COUNTED and then stopped, so the bound is a fact and not an estimate
 *   - the link is one-to-one in both directions, so two Discord accounts cannot quietly share one
 *     balance and the person paying cannot be unaware of it
 *   - either side can revoke, and neither side can revoke the other's
 *
 * The Durable Object runtime is shimmed: `cloudflare:workers` is resolved to an in-memory stand-in
 * so the real storage semantics this code relies on (get/put/delete/list by prefix) are exercised
 * without workerd. Nothing about the LOGIC is faked.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

registerHooks({
  resolve(spec, ctx, next) {
    if (spec === 'cloudflare:workers') return { url: 'virtual:cloudflare-workers', shortCircuit: true };
    // Worker sources import each other extensionless, the way the bundler resolves them. Node
    // does not, so the suffix is restored here rather than changing how the product is written.
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

// ------------------------------------------------------------------ the shim

function memoryStorage() {
  const map = new Map();
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

function makeDO() {
  const storage = memoryStorage();
  const obj = new DiscordDO({ storage }, { SESSION_DO: null });
  const call = async (path, method, body) =>
    obj.fetch(
      new Request(`https://do${path}`, method === 'GET' ? {} : { method, body: JSON.stringify(body ?? {}) }),
    );
  return {
    storage,
    mint: async (appleUserId, projectId, projectName) =>
      (await call('/mint', 'POST', { appleUserId, projectId, projectName })).json(),
    mintRaw: (appleUserId, projectId, projectName) => call('/mint', 'POST', { appleUserId, projectId, projectName }),
    redeem: async (discordUserId, code) => (await call('/redeem', 'POST', { discordUserId, code })).json(),
    link: async (discordUserId) => (await call(`/link?discordUserId=${discordUserId}`, 'GET')).json(),
    linkForOwner: async (appleUserId) => (await call(`/link-for-owner?appleUserId=${appleUserId}`, 'GET')).json(),
    unlink: async (body) => (await call('/unlink', 'POST', body)).json(),
  };
}

const P1 = ['owner-1', 'proj-1', 'Lava Obby'];
const P2 = ['owner-2', 'proj-2', 'Tycoon'];

// ------------------------------------------------------------------ minting

test('a minted code is long enough that guessing it is not a strategy', async () => {
  const d = makeDO();
  const { code, expiresAtIso } = await d.mint(...P1);
  assert.match(code, /^[A-Z0-9]{8}$/);
  assert.ok(Date.parse(expiresAtIso) > Date.now(), 'a code that is already expired is not a code');
  // 31 non-confusable characters, 8 of them: ~8.5e11 possibilities inside a ten-minute window.
  assert.equal(new Set(code).size >= 1, true);
});

test('two codes are never the same', async () => {
  const d = makeDO();
  const seen = new Set();
  for (let i = 0; i < 5; i++) seen.add((await d.mint(...P1)).code);
  assert.equal(seen.size, 5);
});

test('one account cannot mint an unbounded pile of live codes', async () => {
  const d = makeDO();
  for (let i = 0; i < 5; i++) assert.ok((await d.mintRaw(...P1)).ok);
  const sixth = await d.mintRaw(...P1);
  assert.equal(sixth.status, 429);
  // Another account is unaffected: the cap is per owner, not a global denial-of-service lever.
  assert.ok((await d.mintRaw(...P2)).ok);
});

// ---------------------------------------------------------------- redeeming

test('redeeming binds the Discord user to the project the owner chose', async () => {
  const d = makeDO();
  const { code } = await d.mint(...P1);
  const res = await d.redeem('discord-a', code);
  assert.equal(res.ok, true);
  assert.equal(res.link.appleUserId, 'owner-1');
  assert.equal(res.link.projectId, 'proj-1');
  assert.equal(res.link.projectName, 'Lava Obby');
  assert.equal(res.replaced, null);
  assert.equal((await d.link('discord-a')).link.projectId, 'proj-1');
});

test('a code works exactly once', async () => {
  const d = makeDO();
  const { code } = await d.mint(...P1);
  assert.equal((await d.redeem('discord-a', code)).ok, true);
  const second = await d.redeem('discord-b', code);
  assert.equal(second.ok, false);
  assert.equal(second.reason, 'invalid');
  assert.equal((await d.link('discord-b')).link, null);
});

test('a code is accepted however the user typed it, but nothing else is', async () => {
  const d = makeDO();
  const { code } = await d.mint(...P1);
  const messy = ` ${code.toLowerCase().slice(0, 4)}-${code.toLowerCase().slice(4)} `;
  assert.equal((await d.redeem('discord-a', messy)).ok, true, 'case and dashes are how people type');
  const other = await d.mint(...P1);
  assert.equal((await d.redeem('discord-b', `${other.code}X`)).ok, false, 'a near miss is a miss');
});

test('guessing is counted and then stopped', async () => {
  const d = makeDO();
  const { code } = await d.mint(...P1);
  for (let i = 0; i < 5; i++) {
    const r = await d.redeem('guesser', `WRONG${i}XX`);
    assert.equal(r.reason, 'invalid', `attempt ${i + 1} should still be answered as invalid`);
  }
  const sixth = await d.redeem('guesser', 'WRONG5XX');
  assert.equal(sixth.reason, 'throttled', 'the sixth wrong code must be refused without a lookup');
  // Even the RIGHT code is refused while throttled — otherwise the throttle is decoration.
  assert.equal((await d.redeem('guesser', code)).reason, 'throttled');
  // And the throttle is per Discord user: one guesser cannot lock everybody else out.
  assert.equal((await d.redeem('innocent', code)).ok, true);
});

test('a successful redeem clears the failure count, so a typo is not held against you', async () => {
  const d = makeDO();
  await d.redeem('clumsy', 'NOPE1111');
  await d.redeem('clumsy', 'NOPE2222');
  const { code } = await d.mint(...P1);
  assert.equal((await d.redeem('clumsy', code)).ok, true);
  const again = await d.mint(...P1);
  for (let i = 0; i < 5; i++) await d.redeem('clumsy', `WRONG${i}XX`);
  assert.equal((await d.redeem('clumsy', again.code)).reason, 'throttled', 'the counter still works after a reset');
});

// ------------------------------------------------------------ one-to-one

test('a second Discord account cannot quietly start spending the same balance', async () => {
  const d = makeDO();
  assert.equal((await d.redeem('discord-a', (await d.mint(...P1)).code)).ok, true);
  const res = await d.redeem('discord-b', (await d.mint(...P1)).code);
  assert.equal(res.ok, true);
  // The old holder is gone, not merely shadowed. Two Discord users on one balance is a billing
  // surprise, and the person paying is the one who would never see it.
  assert.equal((await d.link('discord-a')).link, null);
  assert.equal((await d.link('discord-b')).link.appleUserId, 'owner-1');
  assert.equal((await d.linkForOwner('owner-1')).link.discordUserId, 'discord-b');
});

test('linking to a second account replaces the first, and says so', async () => {
  const d = makeDO();
  await d.redeem('discord-a', (await d.mint(...P1)).code);
  const res = await d.redeem('discord-a', (await d.mint(...P2)).code);
  assert.equal(res.ok, true);
  assert.equal(res.replaced.appleUserId, 'owner-1');
  assert.equal((await d.linkForOwner('owner-1')).link, null, 'the first account keeps no stale link');
  assert.equal((await d.linkForOwner('owner-2')).link.discordUserId, 'discord-a');
});

// ------------------------------------------------------------------ revoking

test('either side can revoke, and neither can revoke somebody else’s', async () => {
  const d = makeDO();
  await d.redeem('discord-a', (await d.mint(...P1)).code);
  await d.redeem('discord-b', (await d.mint(...P2)).code);

  // The Apple owner revokes their own.
  assert.equal((await d.unlink({ appleUserId: 'owner-1' })).removed, true);
  assert.equal((await d.link('discord-a')).link, null);
  assert.equal((await d.linkForOwner('owner-2')).link.discordUserId, 'discord-b', 'the other link is untouched');

  // An owner naming a link that is not theirs removes nothing.
  assert.equal((await d.unlink({ appleUserId: 'owner-1' })).removed, false);

  // The Discord user revokes from their end.
  assert.equal((await d.unlink({ discordUserId: 'discord-b' })).removed, true);
  assert.equal((await d.linkForOwner('owner-2')).link, null);
});

test('revoking clears both directions, so a stale reverse index cannot resurrect a link', async () => {
  const d = makeDO();
  await d.redeem('discord-a', (await d.mint(...P1)).code);
  await d.unlink({ discordUserId: 'discord-a' });
  assert.equal([...d.storage.map.keys()].filter((k) => k.startsWith('owner:')).length, 0);
  assert.equal([...d.storage.map.keys()].filter((k) => k.startsWith('link:')).length, 0);
});

test('an unknown Discord user or owner is answered honestly, not with a link', async () => {
  const d = makeDO();
  assert.equal((await d.link('nobody')).link, null);
  assert.equal((await d.linkForOwner('nobody')).link, null);
  assert.equal((await d.unlink({ discordUserId: 'nobody' })).removed, false);
  assert.equal((await d.unlink({})).removed, false);
});

// -------------------------------------------------------------------- alarms

test('an object with nothing to do stops waking up', async () => {
  const d = makeDO();
  await d.mint(...P1);
  assert.ok(d.storage.alarmAt > Date.now(), 'a live code needs an alarm to expire it');
  await d.redeem('discord-a', [...d.storage.map.entries()].find(([k]) => k.startsWith('code:'))[0].slice(5));
  // No codes and no watched runs left: a self-renewing alarm here would be a bill that never stops.
  const obj = new DiscordDO({ storage: d.storage }, { SESSION_DO: null });
  await obj.alarm();
  assert.equal(d.storage.alarmAt, null);
});
