/**
 * A REAL SessionDO OVER A REAL SQL DATABASE.
 *
 * Every existing test of the session Durable Object is either a source-text assertion or drives it
 * over `sql.exec: () => ({ toArray: () => [] })` — a database that accepts every write and answers
 * every read with nothing. That fake cannot tell a column that exists from one that does not, so
 * the whole class of defect this file was written for — a value inserted into a column nobody
 * added, a select that never names the column it is supposed to return — is invisible to it.
 *
 * `node:sqlite` is a real SQLite. The shim below gives it the shape `ctx.storage.sql` has in
 * workerd: `exec(query, ...bindings)` returning a cursor with `toArray()` and `one()`. It is
 * deliberately thin — the point is that the production schema, the production inserts and the
 * production selects all run unmodified against a database that will refuse a wrong one.
 *
 * NOT A TEST FILE: the name does not match node --test's discovery patterns on purpose.
 */
import { DatabaseSync } from 'node:sqlite';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const TMP = mkdtempSync(join(tmpdir(), 'golem-session-sql-'));
const CF_SHIM = join(TMP, 'cf.mjs');
writeFileSync(CF_SHIM, 'export class DurableObject { constructor(ctx, env) { this.ctx = ctx; this.env = env; } }\n');
const OUT = join(TMP, 'session.mjs');
execFileSync(
  join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'do', 'session.ts'), '--bundle', '--format=esm', '--target=es2022', `--alias:cloudflare:workers=${CF_SHIM}`, `--outfile=${OUT}`],
  { stdio: 'pipe', cwd: WORKER },
);

export const { SessionDO } = await import(`file://${OUT}`);

/** The workerd `SqlStorage` surface, over a real in-memory SQLite. */
export function makeSql(db = new DatabaseSync(':memory:')) {
  return {
    db,
    exec(query, ...args) {
      const sql = query.trim();
      // A multi-statement schema block takes no bindings, and `prepare` accepts only one
      // statement. This is the same split workerd makes internally.
      if (args.length === 0 && /;[\s\S]*\S/.test(sql.replace(/;\s*$/, ''))) {
        db.exec(sql);
        return cursor([]);
      }
      const stmt = db.prepare(sql);
      return cursor(stmt.all(...args));
    },
  };
}

function cursor(rows) {
  return {
    toArray: () => rows,
    one: () => {
      if (rows.length !== 1) throw new Error(`expected exactly one row, got ${rows.length}`);
      return rows[0];
    },
    [Symbol.iterator]: () => rows[Symbol.iterator](),
  };
}

/**
 * A SessionDO whose SQL is real and whose storage is a Map.
 *
 * `pluginLastSeen` is seeded so `pluginConnected()` answers true — every op path refuses before it
 * reaches the database otherwise, which would make a green test say nothing at all.
 */
export function sessionHarness(opts = {}) {
  const store = new Map(opts.store ?? []);
  const sent = [];
  const sql = opts.sql ?? makeSql();
  let attachment = opts.attachment ?? {
    userId: 'u-owner', role: 'owner', connectionId: 'c1', activity: 'viewing', lastSeenMs: Date.now(),
  };
  const ws = {
    send: (d) => sent.push(JSON.parse(d)),
    deserializeAttachment: () => attachment,
    serializeAttachment: (v) => { attachment = v; },
  };
  if (!store.has('bind')) store.set('bind', { projectId: 'p1', projectName: 'Harness Place', ownerId: 'u-owner' });
  if (!store.has('pluginLastSeen')) store.set('pluginLastSeen', Date.now());
  /** The object's single alarm, as workerd holds it: null when none is scheduled. */
  let alarmAt = opts.alarmAt ?? null;
  const ctx = {
    storage: {
      sql,
      get: async (k) => store.get(k),
      put: async (k, v) => {
        if (typeof k === 'object') for (const [a, b] of Object.entries(k)) store.set(a, b);
        else store.set(k, v);
      },
      delete: async (k) => {
        if (Array.isArray(k)) { for (const key of k) store.delete(key); return; }
        store.delete(k);
      },
      // A REAL STORAGE ALWAYS HAS THESE THREE, and the fake had only two. Code that reads the
      // alarm before setting it — the studio watchdog does, so it can move the deadline earlier
      // without stamping on the run loop's — threw `getAlarm is not a function` here and nowhere
      // in production. The shim keeps the single-alarm semantics workerd has: one value, last
      // write wins, cleared when it fires.
      getAlarm: async () => alarmAt,
      setAlarm: async (at) => { alarmAt = at; },
      deleteAlarm: async () => { alarmAt = null; },
      deleteAll: async () => store.clear(),
    },
    blockConcurrencyWhile: async (fn) => await fn(),
    getWebSockets: () => [ws],
    acceptWebSocket: () => {},
  };
  const env = {
    AI: { run: async () => { throw new Error('the harness must never call a model'); } },
    QUOTA_DO: {
      idFromName: () => ({}),
      get: () => ({ fetch: async () => new Response(JSON.stringify({ ok: true, state: {} })) }),
    },
  };
  const session = new SessionDO(ctx, env);
  // Which ops a test has already answered, so a helper can find the NEXT one without being told
  // how many came before it. A method that issues two ops in a row (create then restore) has no
  // stable queue length to measure against.
  const answered = new Set();
  return { session, sql, store, sent, ws, ctx, env, answered };
}

/**
 * Run one Studio op and answer it, so the oplog row is written by the production insert.
 *
 * `runId` is taken from `currentMsgId` exactly as a real run sets it — that is the value under
 * test, so the harness must not supply it by another route.
 */
export async function runStudioOp(h, studioOp, result = { ok: true }) {
  // Nothing polls in the harness, so answered ops stay in the queue. Waiting for the queue to GROW
  // is what stops the second call in a test answering the first call's op and then sitting through
  // the real timeout — a green test bought with five seconds of nothing happening.
  const pending = h.session.execStudioOp(studioOp, 5_000);
  const queued = await answerNextOp(h, result);
  return { op: queued, result: await pending };
}

/**
 * Answer whatever op the session queues next, whoever queued it.
 *
 * This is the half of the plugin a test needs when the op is issued from INSIDE a session method
 * — `createCheckpoint` and `restoreCheckpoint` both do — because there is no execStudioOp promise
 * for the test to hold. `answered` rather than a queue length: answered ops are never removed in
 * the harness (nothing polls), so counting is only correct until the second op.
 */
export async function answerNextOp(h, result = { ok: true }) {
  // `execStudioOp` awaits storage before it registers the waiter, so there is no fixed number of
  // microtask turns to wait — poll for the waiter the way the plugin's poll would find the op.
  const queued = await waitFor(() => h.session.opQueue.find((o) => !h.answered.has(o.id)) ?? null);
  const waiter = await waitFor(() => h.session.opWaiters.get(queued.id));
  h.answered.add(queued.id);
  waiter({ id: queued.id, ...result });
  return queued;
}

async function waitFor(get, tries = 200) {
  for (let i = 0; i < tries; i++) {
    const v = get();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1));
  }
  throw new Error('the op never reached the queue — the harness cannot answer it');
}

export function rows(h, query, ...args) {
  return h.sql.exec(query, ...args).toArray();
}
