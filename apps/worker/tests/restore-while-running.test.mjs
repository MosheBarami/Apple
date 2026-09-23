/**
 * A RESTORE DOES NOT START WHILE APPLE IS BUILDING.
 *
 * A restore clears the place and rebuilds it from a snapshot. A run in flight is at that moment
 * sending its own changes to the same place. Editing a message and starting a chat both refuse
 * while a run is going; `checkpoint_restore` never looked, so an admin pressing Restore mid-build
 * interleaved the two — the snapshot went back in and the run kept writing over it.
 *
 * Driven against the real SessionDO over a real SQLite. The property is that NOTHING of the
 * restore happens (no phase announced to the room, no op queued for Studio) and that the person
 * who pressed it — and only that person — is told why in plain words.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionHarness } from './session-harness.mjs';

function running(status) {
  const h = sessionHarness();
  h.store.set('agent', { status, steps: [], messages: [] });
  return h;
}

for (const status of ['running', 'stopping']) {
  test(`a restore pressed while the agent is ${status} is refused, and nothing is restored`, async () => {
    const h = running(status);
    await h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'checkpoint_restore', checkpointId: 'cp-1' }));

    const errors = h.sent.filter((m) => m.type === 'error');
    assert.deepEqual(errors.map((m) => m.code), ['busy'], 'the person who pressed Restore is told the project is busy');
    assert.match(errors[0].message, /stop/i, 'the refusal says what to do next');
    assert.ok(errors[0].message.length < 90, 'short enough for a young reader');
    assert.equal(h.sent.some((m) => m.type === 'restore_status'), false, 'no restore phase was announced — the restore never began');
    assert.equal(h.session.opQueue.length, 0, 'nothing was sent to Studio');
  });
}

test('the HTTP restore route refuses the same way', async () => {
  const h = running('running');
  const res = await h.session.fetch(
    new Request('https://do/restore', { method: 'POST', body: JSON.stringify({ checkpointId: 'cp-1' }) }),
  );
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.ok, false);
  assert.match(body.error, /stop/i);
  assert.equal(h.sent.some((m) => m.type === 'restore_status'), false, 'the route never reached the restore');
});

test('CONTROL: with no run going the restore does begin', async () => {
  // Without this the test above would hold on a handler that refused every restore.
  const h = sessionHarness();
  await h.session.webSocketMessage(h.ws, JSON.stringify({ type: 'checkpoint_restore', checkpointId: 'cp-1' }));
  assert.equal(h.sent.some((m) => m.type === 'error' && m.code === 'busy'), false);
  assert.ok(h.sent.some((m) => m.type === 'restore_status'), 'the restore reached restoreCheckpoint');
});
