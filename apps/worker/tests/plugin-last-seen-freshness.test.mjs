/**
 * "LAST SEEN" MUST BE THE LAST POLL, NOT THE LAST CHECKPOINT OF IT.
 *
 * Defect Da78780. `pluginLastSeenAt()` carried a comment saying it reads "the larger of the
 * checkpointed value and the in-memory one … because the heartbeat is only written to storage every
 * 4s, so reporting [storage] would age the link by four seconds every time somebody opened a tab".
 * The code did not do that. It read `Math.max(stored, this.lastSeenWrittenAt)`, and
 * `lastSeenWrittenAt` is assigned `now` in the same statement as `storage.put('pluginLastSeen',
 * now)` — it IS the checkpoint clock, always equal to `stored` and never ahead of it. So the
 * Math.max could not move the answer by a millisecond, and the number the pairing dialog and the
 * link note render was the last CHECKPOINT: up to four seconds stale, and stalest during a fast run
 * where the checkpoint is skipped most.
 *
 * The in-memory heartbeat is `pluginLastSeenMs`, written on every poll. `pluginConnected()` three
 * lines above already took the max of all three clocks; this asserts the two readers now ask the
 * same question of the same clocks.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

const REAL_NOW = Date.now;
// A FROZEN base, not `REAL_NOW() + ms`: two reads of the real clock inside one block differ by a
// millisecond or two, and this test measures a difference of exactly 2,000.
const BASE = REAL_NOW();

async function at(ms, fn) {
  Date.now = () => BASE + ms;
  try {
    return await fn();
  } finally {
    Date.now = REAL_NOW;
  }
}

test('a poll between checkpoints still moves "last seen"', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  await new Promise((r) => setTimeout(r, 0));

  // First poll: 4,000 ms have passed since `lastSeenWrittenAt` (0), so this one DOES checkpoint.
  await at(0, () => h.session.handlePluginPoll({}));
  const checkpointed = await h.session.pluginLastSeenAt();
  assert.ok(checkpointed !== null, 'the fixture is wrong: the first poll must record a heartbeat');

  // Second poll two seconds later. Under the 4,000 ms rule this one is deliberately NOT written to
  // storage — which is exactly the window the reported age was wrong in.
  const reported = await at(2_000, async () => {
    await h.session.handlePluginPoll({});
    assert.equal(
      await h.ctx.storage.get('pluginLastSeen'),
      checkpointed,
      'the fixture is wrong: this poll was supposed to skip the checkpoint',
    );
    return h.session.pluginLastSeenAt();
  });

  assert.equal(
    reported - checkpointed,
    2_000,
    `"last seen" reported the checkpoint, ${reported - checkpointed}ms behind the poll that actually arrived`,
  );
});

test('the age it reports and the verdict it reports come from the same clocks', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  await new Promise((r) => setTimeout(r, 0));
  await at(0, () => h.session.handlePluginPoll({}));

  for (const ms of [0, 1_000, 2_000, 3_500, 7_000]) {
    await at(ms, async () => {
      await h.session.handlePluginPoll({});
      const last = await h.session.pluginLastSeenAt();
      assert.equal(last, Date.now(), `at +${ms}ms the reported last-seen was ${Date.now() - last}ms stale`);
      assert.equal(await h.session.pluginConnected(), true);
    });
  }
});

test('a plugin that has never polled reports no last-seen at all', async () => {
  const h = sessionHarness({ store: [['pluginLastSeen', 0]] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(await h.session.pluginLastSeenAt(), null, 'never-paired must stay a third state, not zero');
});
