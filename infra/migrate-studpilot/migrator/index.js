// A throwaway Worker for the one-time StudPilot data move (handoff 1.3). It is bound to the old and
// new D1 databases and R2 buckets and copies between them with ordinary reads, because
// `wrangler d1 export` refuses databases with virtual tables (the three FTS5 tables) and a running
// export blocks every other request to the live database. Deployed for the move, deleted after.
//
// Every route needs `Authorization: Bearer <MIGRATOR_TOKEN>` (a secret set at deploy time).
//   GET  /tables                         the old database's tables, their schema and row counts on both sides
//   POST /schema                         creates every missing table and index in the new database (virtual tables included)
//   POST /copy?table=T&after=R&limit=N   copies rows with rowid > R from old to new (INSERT OR REPLACE, rowid kept)
//   POST /r2                             copies every old R2 object missing in the new bucket, with its metadata
//   GET  /r2/counts                      object counts on both sides
const SKIP = /^(sqlite_|_cf_|d1_)/;
const FTS_SHADOW = /_(data|idx|content|docsize|config)$/;

function unauthorized() { return new Response('unauthorized', { status: 401 }); }
const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

async function tables(db) {
  const { results } = await db.prepare("select name, type, sql from sqlite_master where type in ('table','index') and sql is not null order by type desc, name").all();
  const virtual = new Set(results.filter((r) => /^create virtual table/i.test(r.sql)).map((r) => r.name));
  return results.filter((r) => !SKIP.test(r.name) && !(r.type === 'table' && [...virtual].some((v) => r.name.startsWith(v + '_') && FTS_SHADOW.test(r.name))));
}

async function count(db, t) {
  try { return (await db.prepare(`select count(*) as n from ${q(t)}`).first()).n; } catch (e) { return `error: ${String(e.message).slice(0, 120)}`; }
}

export default {
  async fetch(req, env) {
    if (req.headers.get('authorization') !== `Bearer ${env.MIGRATOR_TOKEN}` || !env.MIGRATOR_TOKEN) return unauthorized();
    const u = new URL(req.url);
    if (u.pathname === '/tables') {
      const out = [];
      for (const t of (await tables(env.OLD_DB)).filter((r) => r.type === 'table')) out.push({ name: t.name, virtual: /virtual/i.test(t.sql), old: await count(env.OLD_DB, t.name), new: await count(env.NEW_DB, t.name) });
      return Response.json(out);
    }
    if (u.pathname === '/schema' && req.method === 'POST') {
      const have = new Set((await env.NEW_DB.prepare("select name from sqlite_master").all()).results.map((r) => r.name));
      const made = [];
      for (const t of await tables(env.OLD_DB)) {
        if (have.has(t.name)) continue;
        await env.NEW_DB.prepare(t.sql).run();
        made.push(t.name);
      }
      return Response.json({ made });
    }
    if (u.pathname === '/copy' && req.method === 'POST') {
      const table = u.searchParams.get('table');
      const known = (await tables(env.OLD_DB)).find((r) => r.type === 'table' && r.name === table);
      if (!known) return Response.json({ error: `unknown table ${table}` }, { status: 400 });
      const after = Number(u.searchParams.get('after') ?? '-1');
      const limit = Math.min(Number(u.searchParams.get('limit') ?? '500'), 2000);
      const cols = (await env.OLD_DB.prepare(`select name from pragma_table_info(${"'" + table.replace(/'/g, "''") + "'"})`).all()).results.map((r) => r.name);
      const { results } = await env.OLD_DB.prepare(`select rowid as __rowid, ${cols.map(q).join(', ')} from ${q(table)} where rowid > ? order by rowid limit ?`).bind(after, limit).all();
      if (!results.length) return Response.json({ copied: 0, last: after, done: true });
      const ins = `insert or replace into ${q(table)} (rowid, ${cols.map(q).join(', ')}) values (${['?', ...cols.map(() => '?')].join(', ')})`;
      const stmts = results.map((r) => env.NEW_DB.prepare(ins).bind(r.__rowid, ...cols.map((c) => r[c] ?? null)));
      for (let i = 0; i < stmts.length; i += 100) await env.NEW_DB.batch(stmts.slice(i, i + 100));
      return Response.json({ copied: results.length, last: results[results.length - 1].__rowid, done: results.length < limit });
    }
    if (u.pathname === '/r2' && req.method === 'POST') {
      let cursor; const copied = []; let skipped = 0;
      do {
        const page = await env.OLD_R2.list({ cursor, include: ['httpMetadata', 'customMetadata'] });
        for (const o of page.objects) {
          if (await env.NEW_R2.head(o.key)) { skipped++; continue; }
          const body = await env.OLD_R2.get(o.key);
          await env.NEW_R2.put(o.key, body.body, { httpMetadata: o.httpMetadata, customMetadata: o.customMetadata });
          copied.push(o.key);
        }
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return Response.json({ copied: copied.length, skipped });
    }
    if (u.pathname === '/r2/counts') {
      const n = async (b) => { let c, k = 0, bytes = 0; do { const p = await b.list({ cursor: c }); k += p.objects.length; bytes += p.objects.reduce((a, o) => a + o.size, 0); c = p.truncated ? p.cursor : undefined; } while (c); return { objects: k, bytes }; };
      return Response.json({ old: await n(env.OLD_R2), new: await n(env.NEW_R2) });
    }
    return new Response('not found', { status: 404 });
  },
};
