/**
 * THE GREEN PILL THAT OUTLIVED THE DURABLE OBJECT THAT PAINTED IT.
 *
 * `studio-silence-broadcast.test.mjs` proves the disconnect is announced when a tab pings a session
 * that has been alive the whole time. The deployed product failed anyway, three different ways, and
 * all three are absences this file makes into assertions:
 *
 *  1. MEASURED ON THE LIVE PRODUCT, 2026-09-20: after the plugin stopped polling, the topbar pill
 *     stayed green for 57.1s in one run, 114.4s in a second, and in a third the browser was NEVER
 *     told — six ping frames went out at 25s intervals and six pongs came back over 150 seconds on
 *     a healthy socket, and not one `studio_status {connected:false}` ever arrived.
 *
 *  2. WHY THE THIRD RUN NEVER HEARD ANYTHING. The guard read "did I announce connected?", and a
 *     Durable Object that is evicted while its hibernated sockets stay open wakes with that memory
 *     wiped. It then reads its own amnesia as "there is nothing on any screen to correct" and
 *     returns on the first line, forever. A failure to REMEMBER rendered as an observation.
 *
 *  3. WHY THE FIRST TWO TOOK A MINUTE AND TWO MINUTES. The only thing that woke an idle session was
 *     the tab's own ping, and a browser throttles a background tab's timers to about one a minute.
 *     "Bounded by one ping" is therefore not a bound the product controls at all.
 *
 * Time moves here the way it does in the sibling file: by moving `Date.now`, so the plugin is
 * genuinely quiet rather than the test rewriting the session's own bookkeeping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness, SessionDO } from './session-harness.mjs';

const REAL_NOW = Date.now;

async function afterMs(ms, fn) {
  Date.now = () => REAL_NOW() + ms;
  try {
    return await fn();
  } finally {
    Date.now = REAL_NOW;
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0));
const ping = (h) => h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'ping' }));
const statuses = (h) => h.sent.filter((m) => m.type === 'studio_status');

/** A session whose plugin has just polled, exactly as a live one would be. */
async function polledOnce(store) {
  const h = sessionHarness(store ? { store } : {});
  await settle();
  await h.session.handlePluginPoll({});
  h.sent.length = 0;
  return h;
}

/**
 * The SAME project, on a new Durable Object instance, over the storage the old one wrote.
 *
 * This is eviction: durable state survives, every instance field is born again at its initialiser,
 * and the browser's socket — which in production is hibernated, not closed — is still there.
 */
function afterEviction(h) {
  const sent = [];
  const ws = {
    send: (d) => sent.push(JSON.parse(d)),
    deserializeAttachment: () => ({ userId: 'u-owner', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now() }),
    serializeAttachment: () => {},
  };
  let alarmAt = null;
  const ctx = {
    storage: {
      sql: h.sql,
      get: async (k) => h.store.get(k),
      put: async (k, v) => {
        if (typeof k === 'object') for (const [a, b] of Object.entries(k)) h.store.set(a, b);
        else h.store.set(k, v);
      },
      delete: async (k) => {
        if (Array.isArray(k)) { for (const key of k) h.store.delete(key); return; }
        h.store.delete(k);
      },
      getAlarm: async () => alarmAt,
      setAlarm: async (at) => { alarmAt = at; },
      deleteAlarm: async () => { alarmAt = null; },
      deleteAll: async () => h.store.clear(),
    },
    blockConcurrencyWhile: async (fn) => await fn(),
    getWebSockets: () => [ws],
    acceptWebSocket: () => {},
  };
  return { session: new SessionDO(ctx, h.env), sent, ws, ctx, store: h.store, sql: h.sql, env: h.env };
}

test('an evicted session still corrects the green pill an earlier instance painted', async () => {
  const live = await polledOnce();
  assert.equal(live.session.pluginConnectedNow(), true, 'the fixture is wrong: the plugin must start connected');

  const woken = afterEviction(live);
  await settle();
  // The revived instance agrees the link is up — the heartbeat is durable — so nothing is said yet.
  assert.equal(woken.session.pluginConnectedNow(), true);

  await afterMs(120_000, async () => {
    assert.equal(woken.session.pluginConnectedNow(), false, 'the fixture is wrong: the plugin must now read as gone');
    await ping(woken);
  });

  const said = statuses(woken);
  assert.equal(said.length, 1, 'the tab was never told the plugin went away — the pill stays green for as long as the tab is open');
  assert.equal(said[0].connected, false);
  assert.ok(
    typeof said[0].lastSeenAt === 'number' && said[0].lastSeenAt > 0,
    'the revived instance must carry the durable heartbeat, not report "never connected"',
  );
});

test('and still says it only once, however many pings arrive', async () => {
  const live = await polledOnce();
  const woken = afterEviction(live);
  await settle();
  await afterMs(120_000, async () => {
    await ping(woken);
    await ping(woken);
    await ping(woken);
  });
  assert.equal(statuses(woken).length, 1, 'the disconnect was re-broadcast on every ping');
});

test('a project that never paired is not told about a link it never had', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  await settle();
  await afterMs(120_000, async () => { await ping(h); });
  assert.deepEqual(statuses(h), [], 'an unpaired project was sent a disconnect for a plugin that never existed');
});

test('the disconnect is SCHEDULED, so no browser has to ask for it', async () => {
  // A plugin arriving at a session that thinks it is gone: the `!wasConnected` transition, which is
  // what a first pairing and a Studio restart both look like.
  const h = await polledOnce([['pluginLastSeen', 0]]);
  const at = await h.ctx.storage.getAlarm();
  assert.ok(typeof at === 'number', 'nothing was scheduled — the disconnect waits on a browser ping again');

  // POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS is 13s. The alarm is the bound the owner can be given.
  const ahead = at - REAL_NOW();
  assert.ok(ahead > 0 && ahead <= 13_500, `the watchdog is ${ahead}ms out; the bound on a stale pill must be about 13s`);
});

test('the alarm alone tells the tab, with no ping and no run', async () => {
  const h = await polledOnce([['pluginLastSeen', 0]]);
  await afterMs(120_000, async () => {
    await h.session.alarm();
  });
  const said = statuses(h);
  assert.equal(said.length, 1, 'the alarm fired and nobody was told the plugin had gone');
  assert.equal(said[0].connected, false);
});

test('a live plugin re-arms the watchdog instead of being declared dead by it', async () => {
  const h = await polledOnce([['pluginLastSeen', 0]]);
  // Two seconds on, the plugin is well inside the deadline it was given: the alarm must find a
  // healthy link, say nothing, and leave a successor behind it.
  await afterMs(2_000, async () => {
    await h.session.alarm();
    assert.deepEqual(statuses(h), [], 'a healthy link was announced as broken');
    const next = await h.ctx.storage.getAlarm();
    assert.ok(typeof next === 'number' && next > Date.now(), 'the watchdog fired once and left no successor — the chain is broken');
  });
});

test('nobody is watching, so nothing is scheduled', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  h.ctx.getWebSockets = () => [];
  await settle();
  await h.session.handlePluginPoll({});
  assert.equal(await h.ctx.storage.getAlarm(), null, 'a pill nobody can see is not worth waking a Durable Object for');
});
