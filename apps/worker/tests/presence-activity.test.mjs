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
  return { store, say, runtime: s };
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
  await s.say(me, { type: 'chat', text: 'build a lobby', mode: 'plan' });
  assert.equal(me.activity, 'building', 'the run must actually set it, or the withdrawal below is about nothing');
  assert.ok(s.store.get('agent'), 'and a run is genuinely in flight');

  // THE COMPOSER'S OWN CORRECTION. On submit the browser now sends `viewing`, so the person who
  // started the run stops being shown as typing and the server's `building` is the only claim
  // standing. This is the round trip the web half performs, executed end to end.
  await s.say(me, { type: 'presence', activity: 'viewing' });
  assert.equal(me.activity, 'viewing');
});

test('THE SERVER WITHDRAWS `building` WHEN THE RUN ENDS — helper behavior plus exact finishRun wiring', async () => {
  // First execute the real helper. TypeScript `private` is erased in this bundle, so this is the
  // production method, not a copy of its loop in the test.
  const me = socket(MEMBER, 'editor');
  const other = socket(OWNER, 'owner');
  const s = session([me, other]);
  await s.say(me, { type: 'presence', activity: 'building' });
  await s.say(other, { type: 'presence', activity: 'building' });
  assert.equal(me.activity, 'building');
  assert.equal(other.activity, 'building');
  s.runtime.clearBuildingBeats();
  assert.equal(me.activity, 'viewing');
  assert.equal(other.activity, 'viewing');
  assert.equal(me.lastPresenceFor(OWNER), 'viewing', 'the room must hear the withdrawal too');

  // Reaching finishRun end-to-end still requires the gateway/plugin/budget stack this fixture does
  // not stand up. Bound the source assertion to the finishRun method itself instead of a magic
  // character window: comments may grow without moving the property out of view.
  const src = readFileSync(join(WORKER, 'src', 'do', 'session.ts'), 'utf8');
  assert.match(src, /private clearBuildingBeats\(\)/, 'the withdrawal must exist');
  const assertFinishWithdraws = (source) => {
    const start = source.indexOf('private async finishRun(');
    const end = source.indexOf('\n  private memoryModeOn(', start);
    assert.ok(start >= 0 && end > start, 'finishRun must still have a bounded method body');
    const finish = source.slice(start, end);
    const clear = finish.indexOf('this.clearBuildingBeats();');
    const firstAwait = finish.indexOf('await ');
    assert.ok(clear >= 0, 'finishRun must call clearBuildingBeats');
    assert.ok(firstAwait < 0 || clear < firstAwait, 'the withdrawal must happen before finishRun awaits');
  };
  assertFinishWithdraws(src);
  assert.throws(
    () => assertFinishWithdraws(src.replace('this.clearBuildingBeats();', '')),
    /must call clearBuildingBeats/,
  );
  // It downgrades to `viewing` and to nothing else: `typing` would be a second false claim.
  const body = src.slice(src.indexOf('private clearBuildingBeats()'), src.indexOf('private broadcastPresence()'));
  assert.match(body, /activity: 'viewing'/);
  assert.equal(/activity: 'typing'/.test(body), false);
});

test('F-037: A SOCKET THAT CLOSED IS NOT LISTED AS PRESENT in the frame its close sends', async () => {
  // Measured 2026-09-24 in local workerd (compat 2026-08-01): inside webSocketClose the closing
  // socket reads readyState 2 and getWebSockets() STILL returns it, even after the reciprocal
  // close. So the one broadcast whose whole job is "somebody left" listed the leaver as present,
  // and the room kept showing them until the 45 s presence TTL.
  for (const readyState of [2, 1]) {
    // 1 as well: which state a runtime reports at entry is not a contract, and the frame must not
    // depend on it.
    const leaving = socket(MEMBER, 'editor');
    const staying = socket(OWNER, 'owner');
    const closes = [];
    leaving.ws.readyState = readyState;
    leaving.ws.close = (code) => closes.push(code);
    const s = session([leaving, staying]);
    await s.runtime.webSocketClose(leaving.ws, 1005, '');
    const frame = staying.sent.filter((m) => m.type === 'presence').at(-1);
    assert.ok(frame, 'the room was told that the room changed');
    assert.ok(frame.present.some((p) => p.userId === OWNER), 'CONTROL: the frame lists who is still here');
    assert.equal(frame.present.some((p) => p.userId === MEMBER), false, `the leaver is not present (readyState ${readyState})`);
    assert.equal(closes.length, 1, 'the close handshake is still reciprocated');
    assert.ok(closes[0] >= 1000 && closes[0] !== 1005 && closes[0] !== 1006, 'with a code a peer may legally send');
  }
});

test('F-037: a socket already CLOSING or CLOSED drops out of every presence frame, not only the close one', async () => {
  const gone = socket(MEMBER, 'editor');
  const here = socket(OWNER, 'owner');
  const s = session([gone, here]);
  for (const readyState of [2, 3]) {
    gone.ws.readyState = readyState;
    await s.say(here, { type: 'presence', activity: 'typing' });
    const frame = here.sent.filter((m) => m.type === 'presence').at(-1);
    assert.equal(frame.present.some((p) => p.userId === MEMBER), false, `readyState ${readyState} is not present`);
    assert.ok(frame.present.some((p) => p.userId === OWNER), 'CONTROL: the sender still is');
  }
});
