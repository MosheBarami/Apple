/**
 * A PLUGIN THAT STOPS POLLING IS AN EVENT NOTHING FIRED.
 *
 * Defect D68b938: every `studio_status connected:true` in session.ts is broadcast by something that
 * HAPPENS — a poll arriving, a pairing, the op queue being cleared. A plugin going away does not
 * happen. It is the absence of the next poll, and an absence broadcasts nothing, so an open tab
 * kept a green "Studio · <place>" pill in its header until the page was reloaded, the socket
 * dropped, or the user clicked the app's own "disconnect Studio". `pluginConnected()` — which the
 * model reads — correctly refused to build the entire time. Two answers to one question on one
 * screen: the same shape this file already documents as fixed for a different pair of readers.
 *
 * HOW TIME IS MADE TO PASS HERE. These tests move `Date.now` rather than reaching into the
 * session's clocks. Every rule under test (`connectedGiven`, `pollDueBy`, the heartbeat fields)
 * reads the real clock, so advancing it is the plugin genuinely going quiet — whereas rewriting
 * `pluginLastSeenMs` by hand would be the test asserting its own bookkeeping.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

const REAL_NOW = Date.now;

/** Run `fn` with the world's clock `ms` further on than it really is. */
async function afterMs(ms, fn) {
  Date.now = () => REAL_NOW() + ms;
  try {
    return await fn();
  } finally {
    Date.now = REAL_NOW;
  }
}

/** A session whose plugin has just polled, exactly as a live one would be. */
async function polledOnce() {
  const h = sessionHarness();
  await new Promise((r) => setTimeout(r, 0));
  await h.session.handlePluginPoll({});
  h.sent.length = 0;
  return h;
}

const ping = (h) => h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'ping' }));
const statuses = (h) => h.sent.filter((m) => m.type === 'studio_status');

test('a plugin that stops polling is announced to every open tab', async () => {
  const h = await polledOnce();
  assert.equal(h.session.pluginConnectedNow(), true, 'the fixture is wrong: the plugin must start connected');

  // Long past any deadline the worker issued: POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS is 13s.
  await afterMs(120_000, async () => {
    assert.equal(h.session.pluginConnectedNow(), false, 'the fixture is wrong: the plugin must now read as gone');
    await ping(h);
  });

  const said = statuses(h);
  assert.equal(said.length, 1, 'the tab was never told the plugin went away — the pill stays green');
  assert.equal(said[0].connected, false);
  assert.equal(said[0].place?.placeName ?? null, h.session.boundPlace?.placeName ?? null);
  assert.ok(
    typeof said[0].lastSeenAt === 'number' && said[0].lastSeenAt > 0,
    '"never connected" and "connected until a moment ago" are different facts; lastSeenAt must carry the second one',
  );
});

test('it is said once, not once per ping per tab', async () => {
  const h = await polledOnce();
  await afterMs(120_000, async () => {
    await ping(h);
    await ping(h);
    await ping(h);
  });
  assert.equal(statuses(h).length, 1, 'the disconnect was re-broadcast on every ping');
});

test('a live plugin produces no disconnect frame at all', async () => {
  const h = await polledOnce();
  // Two seconds later the plugin is well inside the deadline it was given.
  await afterMs(2_000, async () => {
    assert.equal(h.session.pluginConnectedNow(), true);
    await ping(h);
  });
  assert.deepEqual(statuses(h), [], 'a healthy link was announced as broken');
});

test('a plugin that comes back is announced again when it next goes away', async () => {
  const h = await polledOnce();
  await afterMs(120_000, async () => { await ping(h); });
  assert.equal(statuses(h).length, 1);

  // It reconnects: a poll arrives, which re-arms the announcement.
  await h.session.handlePluginPoll({});
  h.sent.length = 0;
  await afterMs(120_000, async () => { await ping(h); });
  assert.equal(statuses(h).length, 1, 'after a reconnect the second disconnect was never announced');
});

test('the explicit disconnect route does not produce a second frame on the next ping', async () => {
  const h = await polledOnce();
  const res = await h.session.fetch(
    new Request('https://do/studio/revoke', { method: 'POST', headers: { 'X-User-Id': 'u-owner' } }),
  );
  assert.equal(res.status, 200);
  assert.equal(statuses(h).length, 1, 'revoke must announce the disconnect itself');
  h.sent.length = 0;
  await ping(h);
  assert.deepEqual(statuses(h), [], 'the same disconnect was announced twice');
});
