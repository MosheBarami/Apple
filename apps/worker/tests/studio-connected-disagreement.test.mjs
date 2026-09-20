/**
 * THE SCREEN AND THE MODEL MUST NOT ANSWER "IS STUDIO CONNECTED" DIFFERENTLY.
 *
 * The owner's report was that the plugin shows connected, the web app shows its green pill, and
 * the assistant then says it cannot see Studio. The cause was one expression:
 *
 *     const deadline = this.pollDueBy || last + POLL_WAIT_IDLE_MS + POLL_STALE_GRACE_MS;
 *
 * `pollDueBy` is "last answer + the sleep we issued + grace" — it exists to EXTEND the window when
 * we told the plugin to sleep longer than the default idle. Written with `||` it REPLACES the
 * window instead, so a deadline that has already lapsed outvotes a heartbeat that arrived after
 * it. A plugin reconnecting to a still-warm SessionDO produces exactly that state, and the six
 * seconds it lasts are not small: a run started inside it computes `studioConnected` once, builds
 * its system prompt from that, and carries "Roblox Studio is NOT connected" plus a tool set with
 * no building tools for the whole run.
 *
 * These tests drive the REAL SessionDO through the real harness, and read the private state the
 * two readers share, because the defect was that two readers disagreed — so a test that consults
 * only one of them could not have seen it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

/** Both public readers, as the screen and the model each reach them. */
const bothAnswers = (session) => ({
  model: session.pluginConnectedNow(),
  // `connectedGiven` is the single rule both readers are; calling it with the same freshest
  // heartbeat the DO holds is what the browser broadcast path resolves to.
  screen: session.connectedGiven(Math.max(session.lastSeenWrittenAt, session.pluginLastSeenMs)),
});

test('a lapsed issued deadline does not outvote a heartbeat that arrived after it', () => {
  const h = sessionHarness();
  const now = Date.now();
  // The state a reconnecting poll leaves on a warm instance: heartbeat just written, and the
  // deadline issued for the PREVIOUS poll already in the past because the hold has not refreshed
  // it yet.
  h.session.pluginLastSeenMs = now;
  h.session.lastSeenWrittenAt = 0;
  h.session.pollDueBy = now - 750;

  const answer = bothAnswers(h.session);
  assert.equal(answer.model, true, 'the model must see the connection the heartbeat proves');
  assert.equal(answer.screen, answer.model, 'the screen and the model must not disagree');
});

test('pollDueBy still EXTENDS the window, which is the whole reason it exists', () => {
  const h = sessionHarness();
  const now = Date.now();
  // A long sleep we issued: the heartbeat-derived deadline would expire mid-hold, and pollDueBy is
  // what carries the link across it. Deleting the Math.max in favour of the heartbeat alone would
  // turn this red.
  h.session.pluginLastSeenMs = now - 60_000;
  h.session.lastSeenWrittenAt = 0;
  h.session.pollDueBy = now + 30_000;
  assert.equal(h.session.pluginConnectedNow(), true);
});

test('a genuinely dead plugin still reads disconnected — the fix did not just answer yes', () => {
  const h = sessionHarness();
  const now = Date.now();
  h.session.pluginLastSeenMs = now - 120_000;
  h.session.lastSeenWrittenAt = 0;
  h.session.pollDueBy = now - 60_000;
  assert.equal(h.session.pluginConnectedNow(), false);
});

test('a plugin that has never polled reads disconnected', () => {
  const h = sessionHarness();
  h.session.pluginLastSeenMs = 0;
  h.session.lastSeenWrittenAt = 0;
  h.session.pollDueBy = Date.now() + 30_000;
  assert.equal(h.session.pluginConnectedNow(), false, 'no heartbeat ever is not a connection');
});
