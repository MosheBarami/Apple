/**
 * WHAT SOMEBODY'S FACE SAYS THEY ARE DOING, and when that stops being true.
 *
 * `touch(ws, 'building')` is set when a chat starts. Nothing cleared it: the only other calls to
 * `touch` are the ping — which re-uses whatever activity is already on the socket — and the
 * `presence` frame that no code in apps/web had ever sent. So after a member's first message their
 * face read "is building" for the entire life of the socket, hours after the run ended. That is
 * not a missing feature; it is an indicator asserting a fact that has stopped being true, which
 * everyone else on the project then plans around.
 *
 * Two halves close it, and this file drives both as far as each can honestly be driven:
 *
 *   THE CLIENT now sends `presence` frames (the composer does; apps/web/tests/presence-signal.
 *   test.mjs drives the throttle). The server's handling of that frame is exercised here against
 *   the real Durable Object — before this change the frame was handled and unreachable, so the
 *   handler had never been executed by anything.
 *
 *   THE SERVER withdraws the claim itself in `finishRun`, for every other tab and for a browser
 *   too old to send the frame. That call is asserted by READING THE SOURCE and the test says so:
 *   reaching finishRun needs a completed agent run, which needs the gateway, the model and the
 *   plugin — measured here, a chat in this fixture leaves the run `running` forever — and a test
 *   that claimed to drive it while standing up none of that would be worth less than one that
 *   admits what it checks.
 *
 * Run with:  node --test tests/presence-activity.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(mkdtempSync(join(tmpdir(), 'presence-activity-')), 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [
    join(WORKER, 'src', 'do', 'session.ts'),
    '--bundle',
    '--format=esm',
    '--target=es2022',
    '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
    '--outfile=' + out,
  ],
  { cwd: WORKER, stdio: 'pipe' },
);
const { SessionDO } = await import(`file://${out}`);

const OWNER = 'u-owner';
const MEMBER = 'u-member';

function socket(userId, role) {
  let attachment = { userId, role, connectionId: `c-${userId}`, activity: 'viewing', lastSeenMs: Date.now() };
  const sent = [];
  return {
    sent,
    get activity() {
      return attachment?.activity ?? null;
    },
    /** What the room was last told about this person, off the broadcast rather than the attachment. */
    lastPresenceFor(id) {
      const frames = sent.filter((m) => m.type === 'presence');
      const last = frames.at(-1);
      return last?.present?.find((p) => p.userId === id)?.activity ?? null;
    },
    ws: {
      readyState: 1,
      send: (d) => sent.push(JSON.parse(d)),
      close: () => {},
      deserializeAttachment: () => attachment,
      serializeAttachment: (v) => {
        attachment = v;
      },
    },
  };
}

function session(sockets) {
  const store = new Map([['bind', { projectId: 'p1', projectName: 'Proj', ownerId: OWNER }]]);
  const ctx = {
    storage: {
      async get(k) {
        return store.get(k);
      },
      async put(a, b) {
        if (typeof a === 'object' && a !== null) for (const [k, v] of Object.entries(a)) store.set(k, v);
        else store.set(a, b);
      },
      async delete(k) {
        store.delete(k);
      },
      async list() {
        return new Map();
      },
      setAlarm() {},
      getAlarm() {
        return null;
      },
      sql: { exec: () => ({ toArray: () => [], one: () => null }) },
    },
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets.map((s) => s.ws),
    acceptWebSocket() {},
  };
  const doStub = (body) => ({ idFromName: () => 'id', get: () => ({ fetch: async () => Response.json(body) }) });
  const env = {
    AI: { run: async () => ({ response: 'ok' }) },
    QUOTA_DO: doStub({ ok: true, allowed: true, remaining: 100, credits: 100, plan: 'free' }),
    BUDGET_DO: doStub({ ok: true, reserved: 10, state: { killed: false } }),
    ADMIN_DO: doStub({ ok: true }),
  };
  const s = new SessionDO(ctx, env);
  const say = async (from, msg) => {
    try {
      await s.webSocketMessage(from.ws, JSON.stringify(msg));
    } catch {
      /* downstream stubs */
    }
  };
  return { store, say };
}

// =============================================================================================

test('THE `presence` FRAME IS HANDLED — before this it was handled and unreachable', async () => {
  // Nothing in apps/web had ever sent one, so this branch of webSocketMessage had never executed.
  const me = socket(MEMBER, 'editor');
  const other = socket(OWNER, 'owner');
  const s = session([me, other]);

  await s.say(me, { type: 'presence', activity: 'typing' });
  assert.equal(me.activity, 'typing', 'the socket now carries what its holder is doing');
  assert.equal(other.lastPresenceFor(MEMBER), 'typing', 'and the ROOM is told, which is the whole point');

  await s.say(me, { type: 'presence', activity: 'viewing' });
  assert.equal(me.activity, 'viewing', 'and the claim can be withdrawn');
  assert.equal(other.lastPresenceFor(MEMBER), 'viewing');
});

test('the client says what it is DOING; it does not get to say who it is', async () => {
  const me = socket(MEMBER, 'editor');
  const s = session([me]);
  // A frame carrying somebody else's identity, or a role. The handler takes the activity and
  // nothing else — identity comes from the socket attachment, which the browser never wrote.
  await s.say(me, { type: 'presence', activity: 'typing', userId: OWNER, role: 'owner' });
  assert.equal(me.activity, 'typing');
  assert.equal(JSON.parse(JSON.stringify({ a: me.ws.deserializeAttachment() })).a.userId, MEMBER);
  assert.equal(me.ws.deserializeAttachment().role, 'editor');
});

test('an activity nobody defined reads as `viewing`, never as the strongest one', async () => {
  const me = socket(MEMBER, 'editor');
  const s = session([me]);
  await s.say(me, { type: 'presence', activity: 'building' });
  assert.equal(me.activity, 'building');
  for (const hostile of ['BUILDING', 'deploying', '', null, 7, {}]) {
    await s.say(me, { type: 'presence', activity: hostile });
    assert.equal(me.activity, 'viewing', `activity ${JSON.stringify(hostile)} must not be kept and must not be promoted`);
    await s.say(me, { type: 'presence', activity: 'building' });
  }
});

test('STARTING A RUN SETS `building` — the claim this is all about', async () => {
  const me = socket(MEMBER, 'editor');
  const s = session([me]);
  await s.say(me, { type: 'chat', text: 'build a lobby', mode: 'clay' });
  assert.equal(me.activity, 'building', 'the run must actually set it, or the withdrawal below is about nothing');
  assert.ok(s.store.get('agent'), 'and a run is genuinely in flight');

  // THE COMPOSER'S OWN CORRECTION. On submit the browser now sends `viewing`, so the person who
  // started the run stops being shown as typing and the server's `building` is the only claim
  // standing. This is the round trip the web half performs, executed end to end.
  await s.say(me, { type: 'presence', activity: 'viewing' });
  assert.equal(me.activity, 'viewing');
});

test('THE SERVER WITHDRAWS `building` WHEN THE RUN ENDS — asserted on the source, and here is why', () => {
  //[[ A SOURCE ASSERTION, SAID OUT LOUD.
  //
  //   Reaching finishRun means completing an agent run: the gateway, a model, the plugin, the
  //   budget object and the alarm that drives the loop. MEASURED in this fixture — a chat leaves
  //   the run `running` and it stays that way — so a test that drove `chat` and then asserted the
  //   beat had been cleared would be asserting something that never happened for a reason
  //   unrelated to the mechanism.
  //
  //   So this checks the call is there, at the head of the method, where an isolate that goes away
  //   mid-tidy cannot skip it. It goes red if the call is deleted, which is the failure worth
  //   catching; it cannot catch a `clearBuildingBeats` that has been broken from the inside, and
  //   it does not claim to. ]]
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(src, /private clearBuildingBeats\(\)/, 'the withdrawal must exist');
  const finish = src.slice(src.indexOf('private async finishRun('));
  assert.ok(finish.length > 0, 'finishRun must still exist');
  assert.match(finish.slice(0, 1200), /this\.clearBuildingBeats\(\);/, 'finishRun must call it, before the awaits');
  // It downgrades to `viewing` and to nothing else: `typing` would be a second false claim.
  const body = src.slice(src.indexOf('private clearBuildingBeats()'), src.indexOf('private broadcastPresence()'));
  assert.match(body, /activity: 'viewing'/);
  assert.equal(/activity: 'typing'/.test(body), false);
});
