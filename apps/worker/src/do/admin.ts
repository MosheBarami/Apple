// AdminDO - singleton. Cheap operational counters (no PII) for the admin dashboard.
import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';

export class AdminDO extends DurableObject<Env> {
  private sql = this.ctx.storage.sql;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`create table if not exists counters(
        day text not null, key text not null, value integer not null default 0,
        primary key (day, key));`);
    });
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
    return Response.json({ error: 'not found' }, { status: 404 });
  }
}
