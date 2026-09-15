/**
 * THE PLACE GUARD, EXERCISED THROUGH THE REAL SessionDO.
 *
 * studio-place.test.mjs proves the DECISION. It cannot prove that the poll asks, that a refusal
 * actually withholds ops, or that the queue survives one — and a guard nothing consults is the
 * most expensive kind of dead code, because it reads like protection in every review it survives.
 * This repository has shipped exactly that before.
 *
 * So this bundles the real `do/session.ts`, stands a minimal Durable Object context behind it, and
 * drives `/plugin/poll` with real tokens and real bodies.
 *
 * WHAT THE STUB IS ALLOWED TO BE. Storage and the websocket set are simulated; the SQL surface is
 * stubbed because none of the paths below read a row, and the stub RECORDS statements so a test can
 * assert what was asked. Nothing about the poll, the token check, the place comparison or the
 * revoke is stubbed — those are the real implementations, which is the entire point.
 *
 * Run with:  node --test tests/studio-place-poll.test.mjs      (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORKER = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(mkdtempSync(join(tmpdir(), 'golem-session-do-')), 'session.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'session.ts'), '--bundle', '--format=esm', '--target=es2022',
   '--alias:cloudflare:workers=' + join(WORKER, 'tests', 'stubs', 'cloudflare-workers.mjs'),
   '--outfile=' + OUT], { cwd: WORKER, stdio: 'pipe' });
const { SessionDO } = await import(`file://${OUT}`);

const TOKEN = 'proj.' + 'a'.repeat(48);
const hex = async (s) =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))]
    .map((b) => b.toString(16).padStart(2, '0')).join('');

const BOUND = { placeId: 111, gameId: 900, placeName: 'Tower Defence', boundAt: 1_699_000_000_000 };
const state = (over = {}) => ({
  kind: 'state', placeName: 'Tower Defence', placeId: 111, gameId: 900,
  isRunMode: false, selectionCount: 0, pluginVersion: '0.2.0', ...over,
});

/** A SessionDO over an in-memory context. `seed` pre-populates durable storage. */
async function session(seed = {}, { sqlThrowsOnAlter = false } = {}) {
  const m = new Map(Object.entries(seed));
  const statements = [];
  const sent = [];
  const sockets = [{ send: (s) => sent.push(JSON.parse(s)), readyState: 1, deserializeAttachment: () => null }];
  const storage = {
    sql: {
      exec(q) {
        statements.push(q);
        if (sqlThrowsOnAlter && /alter table/i.test(q)) throw new Error('duplicate column name: failure');
        return { one: () => ({ c: 0 }), toArray: () => [] };
      },
    },
    async get(k) { const v = m.get(k); return v === undefined ? undefined : structuredClone(v); },
    async put(k, v) {
      if (typeof k === 'object' && k !== null) for (const [kk, vv] of Object.entries(k)) m.set(kk, structuredClone(vv));
      else m.set(k, structuredClone(v));
    },
    async delete(k) { for (const key of Array.isArray(k) ? k : [k]) m.delete(key); return true; },
    async list({ prefix } = {}) {
      return new Map([...m.entries()].filter(([k]) => !prefix || k.startsWith(prefix)).map(([k, v]) => [k, structuredClone(v)]));
    },
    async setAlarm() {}, async getAlarm() { return null; }, async deleteAlarm() {},
  };
  const ctx = {
    storage,
    blockConcurrencyWhile: (fn) => fn(),
    getWebSockets: () => sockets,
    acceptWebSocket: () => {},
  };
  const o = new SessionDO(ctx, { ENVIRONMENT: 'test' });
  // The constructor's work runs inside blockConcurrencyWhile, which the stub calls synchronously
  // but which is itself async; one microtask turn is enough to let it settle.
  await new Promise((r) => setTimeout(r, 0));
  const call = async (path, { method = 'POST', body, token } = {}) => {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    if (token) headers.set('X-Golem-Token', token);
    const res = await o.fetch(new Request('https://do' + path, {
      method,
      headers,
      ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
    }));
    let parsed = null;
    try { parsed = await res.json(); } catch { /* not json */ }
    return { status: res.status, json: parsed };
  };
  return { o, map: m, call, statements, broadcasts: sent };
}

const pending = (id) => ({ id, seq: 1, studioOp: { op: 'get_tree' }, runId: undefined });

async function paired(extra = {}) {
  return session({
    bind: { projectId: 'proj', projectName: 'Tower Defence', ownerId: 'owner-1' },
    pluginTokenHash: await hex(TOKEN),
    pluginTokenIssuedAt: Date.now(),
    pluginPlace: BOUND,
    opQueue: [pending('op_1'), pending('op_2')],
    ...extra,
  });
}

// ------------------------------------------------------------------------------- the control

test('CONTROL: a poll from the bound place is served its queued ops', async () => {
  // Without this every refusal below could pass because the poll is simply broken.
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state() } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.json.ops.map((o) => o.id), ['op_1', 'op_2']);
  assert.equal(r.json.placeMismatch, undefined, 'a matching place says nothing about mismatches');
});

// ------------------------------------------------------------------- the refusal, end to end

test('A POLL FROM A DIFFERENT PLACE IS SERVED NOTHING', async () => {
  // The defect: the plugin session is a plugin-wide Studio setting, so opening another place kept
  // the session and applied this project's ops there.
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222, placeName: 'Scratch Pad' }) } });
  assert.equal(r.status, 200, 'the link stays alive — the user may simply switch back');
  assert.deepEqual(r.json.ops, [], 'AND NOT ONE OP WAS HANDED OVER');
  assert.equal(r.json.placeMismatch.openPlaceId, 222);
  assert.ok(r.json.placeMismatch.message.includes('Tower Defence'), 'it names the place it wants');
});

test('THE QUEUE SURVIVES A REFUSAL — the work is withheld, not destroyed', async () => {
  // Draining it into the wrong place is the bug; dropping it on the floor would be a second bug,
  // and the user would have no way to tell the difference from the outside.
  const s = await paired();
  await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222 }) } });
  assert.equal(s.map.get('opQueue').length, 2, 'the ops are still queued');
  // switching back to the right place delivers them
  const back = await s.call('/plugin/poll', { token: TOKEN, body: { state: state() } });
  assert.deepEqual(back.json.ops.map((o) => o.id), ['op_1', 'op_2']);
});

test('the refusal also travels on `client`, so a plugin build that predates it still shows the reason', async () => {
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222 }) } });
  assert.equal(r.json.client.compatible, true, 'this is not a version problem and must not be reported as one');
  assert.equal(r.json.client.message, r.json.placeMismatch.message);
});

test('the browser is told WHY the build is not starting', async () => {
  // Otherwise the web app shows a healthy green pill above a run that never begins.
  const s = await paired();
  await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222, placeName: 'Scratch Pad' }) } });
  const status = s.broadcasts.filter((b) => b.type === 'studio_status').pop();
  assert.equal(status.connected, true, 'the link IS alive; saying otherwise would send them to re-pair');
  assert.equal(status.placeMismatch.openPlaceName, 'Scratch Pad');
  assert.equal(status.placeMismatch.expectedPlaceName, 'Tower Defence');
});

// --------------------------------------------------------- what must NOT be refused, end to end

test('AN UNSAVED PLACE IS STILL SERVED', async () => {
  // placeId 0 is "cannot tell", not "a different place". Refusing here breaks a legitimate user
  // intermittently, which is the worst way to break anything.
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 0, gameId: 0, placeName: 'Place1' }) } });
  assert.equal(r.json.ops.length, 2);
  assert.equal(r.json.placeMismatch, undefined);
  assert.deepEqual(s.map.get('pluginPlace'), BOUND, 'and the binding is left exactly as it was');
});

test('the eleven polls in twelve that carry no state are served', async () => {
  // The plugin sends `state` only every twelfth poll. Refusing the rest would refuse almost
  // everything, and the tell would be ops that arrive in bursts.
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: TOKEN, body: {} });
  assert.equal(r.json.ops.length, 2);
});

test('an unbound project BINDS on the first identifiable place and is served', async () => {
  const s = await paired({ pluginPlace: undefined });
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 555, placeName: 'New Place' }) } });
  assert.equal(r.json.ops.length, 2, 'a first sighting must not refuse');
  assert.equal(s.map.get('pluginPlace').placeId, 555, 'and it is now the binding');
});

test('A REVIVED OBJECT JUDGES AGAINST STORAGE, not against whatever is open when it wakes', async () => {
  // If the binding were read lazily, an evicted-and-revived instance would see null on the poll
  // that revived it and rebind — turning the guard into a rubber stamp at exactly the moment it
  // matters, since a long-evicted project is one the user has been away from.
  const s = await paired(); // fresh instance, binding read in the constructor
  const r = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 999 }) } });
  assert.equal(r.json.ops.length, 0);
  assert.ok(r.json.placeMismatch, 'the stored binding was consulted, not re-derived');
});

test('rebinding clears the refusal without a re-pair', async () => {
  // The escape hatch that makes the refusal safe to ship: a user who really did move their project
  // into a new place must not be stuck in a permanent refusal.
  const s = await paired();
  assert.equal((await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222 }) } })).json.ops.length, 0);
  assert.equal((await s.call('/studio/place/rebind')).json.ok, true);
  const after = await s.call('/plugin/poll', { token: TOKEN, body: { state: state({ placeId: 222, placeName: 'Scratch Pad' }) } });
  assert.equal(after.json.ops.length, 2, 'the new place is now the project place');
  assert.equal(s.map.get('pluginPlace').placeId, 222);
});

// ------------------------------------------------------------------------ pairing and revoking

test('registering a pairing binds the place the plugin reported, and hands it back', async () => {
  const s = await session({ bind: { projectId: 'proj', projectName: 'P', ownerId: 'owner-1' } });
  const r = await s.call('/plugin/register', {
    body: { tokenHash: await hex(TOKEN), place: { placeId: 111, gameId: 900, placeName: 'Tower Defence' } },
  });
  assert.equal(r.json.place.placeId, 111, 'the claim response can confirm the binding');
  assert.equal(s.map.get('pluginPlace').placeId, 111);
});

test('REVOKING A PAIRING STOPS THE PLUGIN DEAD', async () => {
  // docs/troubleshooting and docs/plugin both told users to "disconnect from the web workspace".
  // There was no such thing: only deleting the whole project revoked a plugin's access.
  const s = await paired();
  assert.equal((await s.call('/plugin/poll', { token: TOKEN, body: {} })).status, 200, 'CONTROL: it works first');
  const rev = await s.call('/studio/revoke');
  assert.equal(rev.json.revoked, true);
  const after = await s.call('/plugin/poll', { token: TOKEN, body: {} });
  assert.equal(after.status, 401, 'the next poll is refused, which is what the plugin already acts on');
  assert.equal(s.map.has('pluginTokenHash'), false, 'and the credential is genuinely gone');
  assert.equal(s.map.has('pluginPlace'), false, 'along with the binding that described it');
});

test('a revoked link reports itself disconnected immediately, not after one more poll interval', async () => {
  const s = await paired({ pluginLastSeen: Date.now() });
  await s.call('/plugin/poll', { token: TOKEN, body: {} }); // make it live
  await s.call('/studio/revoke');
  const link = await s.call('/studio/link', { method: 'GET' });
  assert.equal(link.json.paired, false);
  assert.equal(link.json.connected, false);
  assert.equal(link.json.lastSeenAt, null);
  const status = s.broadcasts.filter((b) => b.type === 'studio_status').pop();
  assert.equal(status.connected, false, 'and every open tab was told');
});

test('A SUPERSEDED PLUGIN IS TOLD IT WAS SUPERSEDED, not that its token is invalid', async () => {
  // Pairing again replaces the token. The Studio that loses it used to get a bare "invalid token"
  // — the same sentence this server gives a forged one — leaving the user to guess.
  const s = await paired();
  const NEW = 'proj.' + 'b'.repeat(48);
  await s.call('/plugin/register', { body: { tokenHash: await hex(NEW) } });
  const old = await s.call('/plugin/poll', { token: TOKEN, body: {} });
  assert.equal(old.status, 401);
  assert.equal(old.json.error, 'superseded');
  assert.match(old.json.message, /another Studio window/i);
  // and the new one works
  assert.equal((await s.call('/plugin/poll', { token: NEW, body: {} })).status, 200);
});

test('an unknown token is still just an unknown token', async () => {
  // The superseded branch must not become a catch-all that tells a forger anything.
  const s = await paired();
  const r = await s.call('/plugin/poll', { token: 'proj.' + 'c'.repeat(48), body: {} });
  assert.equal(r.status, 401);
  assert.equal(r.json.error, 'invalid token');
  assert.equal(r.json.message, undefined);
});

// --------------------------------------------------------------- what the owner can now see

test('diagnostics carry the heartbeat, the queue depth and the place — none of which crossed the wire before', async () => {
  const s = await paired();
  await s.call('/plugin/poll', { token: TOKEN, body: { state: state() } });
  const d = await s.call('/studio/diagnostics', { method: 'GET' });
  assert.equal(d.json.link.paired, true);
  assert.equal(typeof d.json.link.lastSeenAt, 'number', 'when Studio last polled');
  assert.equal(d.json.link.place.placeId, 111);
  assert.equal(d.json.openPlace.placeName, 'Tower Defence');
  assert.equal(typeof d.json.pairingExpiresAt, 'number', 'and when the 30-day pairing lapses');
});

test('the queue depth reported is the real one', async () => {
  // A depth that is always zero reads exactly like a healthy queue.
  const s = await paired();
  assert.equal((await s.call('/studio/link', { method: 'GET' })).json.queuedOps, 2);
  await s.call('/plugin/poll', { token: TOKEN, body: { state: state() } }); // drains them
  assert.equal((await s.call('/studio/link', { method: 'GET' })).json.queuedOps, 0);
});

// ------------------------------------------------------------------------------- the migration

test('the oplog gains its failure column, and a second boot survives the duplicate', async () => {
  // `create table if not exists` does nothing to an object that already has the table, so the
  // column is added explicitly — and SQLite has no `add column if not exists`, so the error on
  // every later boot is the success case. Letting it escape would take the object down.
  const first = await session({ bind: { projectId: 'p', projectName: 'P', ownerId: 'o' } });
  assert.ok(first.statements.some((q) => /alter table oplog add column failure/.test(q)), 'the column is added');
  const second = await session({ bind: { projectId: 'p', projectName: 'P', ownerId: 'o' } }, { sqlThrowsOnAlter: true });
  const r = await second.call('/studio/link', { method: 'GET' });
  assert.equal(r.status, 200, 'the object still works on its second boot');
});
