// AdminDO - singleton. Cheap operational counters (no PII) for the admin dashboard, and the one
// durable home for the analytics event log (see ../analytics.ts).
//
// The event table lives here rather than in a new Durable Object because a new DO class needs a
// wrangler migration, and because every producer — the worker isolate and SessionDO alike — already
// has this binding. Events arrive from another isolate over `fetch` with a JSON body, so `kind` and
// `at` are whatever the sender wrote; `normalizeEvent` is the boundary and the insert below runs
// only on what it returns.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import { normalizeEvent, windowTruncated, type RejectReason } from '../analytics';

/** Rows retained. Beyond this the OLDEST are evicted and the eviction is recorded, not hidden. */
export const EVENT_TABLE_LIMIT = 5000;
/** Age beyond which an event is dropped regardless of the row count. */
export const EVENT_RETENTION_DAYS = 30;

export class AdminDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`create table if not exists counters(
        day text not null, key text not null, value integer not null default 0,
        primary key (day, key));`);
      this.sql.exec(`create table if not exists events(
        id integer primary key autoincrement,
        at integer not null, kind text not null, day text not null,
        payload text not null);`);
      this.sql.exec(`create index if not exists events_at on events(at);`);
    });
  }

  /**
   * Evict by age and by row count, and REMEMBER that eviction happened.
   *
   * The counter is the point. A reader asking for the last 30 days over a table whose oldest row is
   * three days old cannot tell "nothing happened before Tuesday" from "Monday was thrown away" —
   * and those two render identically as a flat line at zero. `/events` uses this to answer
   * `truncated` honestly.
   */
  private async prune(): Promise<void> {
    const cutoff = Date.now() - EVENT_RETENTION_DAYS * 864e5;
    this.sql.exec(`delete from events where at < ?`, cutoff);
    const total = (this.sql.exec(`select count(*) as n from events`).toArray() as { n: number }[])[0]?.n ?? 0;
    const overflow = Math.max(0, total - EVENT_TABLE_LIMIT);
    if (overflow > 0) {
      this.sql.exec(`delete from events where id in (select id from events order by at asc, id asc limit ?)`, overflow);
      const prior = (await this.ctx.storage.get<number>('eventsEvicted')) ?? 0;
      await this.ctx.storage.put('eventsEvicted', prior + overflow);
    }
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/incr' && req.method === 'POST') {
      const { key, n } = (await req.json()) as { key: string; n?: number };
      const day = new Date().toISOString().slice(0, 10);
      this.sql.exec(
        `insert into counters(day, key, value) values(?,?,?) on conflict(day, key) do update set value = value + excluded.value`,
        day,
        key.slice(0, 60),
        n ?? 1,
      );
      return Response.json({ ok: true });
    }
    if (url.pathname === '/stats') {
      const rows = this.sql
        .exec(`select day, key, value from counters where day >= ? order by day desc, key`, new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10))
        .toArray();
      return Response.json({ counters: rows });
    }

    if (url.pathname === '/events' && req.method === 'POST') {
      const body = (await req.json().catch(() => null)) as { events?: unknown[] } | null;
      const incoming = Array.isArray(body?.events) ? body.events : [];
      const rejected: Record<RejectReason, number> = {
        not_an_object: 0,
        unknown_kind: 0,
        unreadable_timestamp: 0,
        missing_required_field: 0,
      };
      let stored = 0;
      for (const raw of incoming.slice(0, 512)) {
        const n = normalizeEvent(raw);
        if (!n.ok) {
          rejected[n.reason] += 1;
          continue;
        }
        const e = n.event;
        this.sql.exec(
          `insert into events(at, kind, day, payload) values(?,?,?,?)`,
          e.at,
          e.kind,
          new Date(e.at).toISOString().slice(0, 10),
          JSON.stringify(e),
        );
        stored += 1;
      }
      await this.prune();
      return Response.json({ ok: true, stored, rejected });
    }

    if (url.pathname === '/events') {
      const since = Number(url.searchParams.get('since') ?? NaN);
      // An unreadable `since` is not "from the beginning of time": it is a caller whose window
      // nobody could read, and answering it with every row would be a confident wrong answer.
      if (!Number.isFinite(since)) return Response.json({ error: 'unreadable_since' }, { status: 400 });
      const askedLimit = Number(url.searchParams.get('limit') ?? NaN);
      const limit = Number.isFinite(askedLimit) ? Math.max(1, Math.min(EVENT_TABLE_LIMIT, Math.floor(askedLimit))) : 1000;
      const kind = url.searchParams.get('kind');

      const matching = kind
        ? (this.sql.exec(`select count(*) as n from events where at >= ? and kind = ?`, since, kind).toArray() as { n: number }[])
        : (this.sql.exec(`select count(*) as n from events where at >= ?`, since).toArray() as { n: number }[]);
      const available = matching[0]?.n ?? 0;

      const rows = (
        kind
          ? this.sql.exec(`select payload from events where at >= ? and kind = ? order by at desc limit ?`, since, kind, limit)
          : this.sql.exec(`select payload from events where at >= ? order by at desc limit ?`, since, limit)
      ).toArray() as { payload: string }[];

      const oldest = (this.sql.exec(`select min(at) as m from events`).toArray() as { m: number | null }[])[0]?.m ?? null;
      const evicted = (await this.ctx.storage.get<number>('eventsEvicted')) ?? 0;
      // Truncated for either reason: the page cut it, or the start of the asked-for window was
      // evicted before anyone asked. Both mean the totals computed from this are floors.
      const truncated = windowTruncated({ available, returned: rows.length, evictedAllTime: evicted, oldestAt: oldest, sinceMs: since });

      const events: unknown[] = [];
      let unparsable = 0;
      for (const r of rows) {
        try {
          events.push(JSON.parse(r.payload));
        } catch {
          unparsable += 1;
        }
      }
      return Response.json({
        events: events.reverse(),
        retained: available,
        truncated: truncated || unparsable > 0,
        unparsable,
        evictedAllTime: evicted,
        oldestAt: oldest,
      });
    }

    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
