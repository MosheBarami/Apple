// A tiny D1Database look-alike over node:sqlite (FTS5 included), for tests.
import { DatabaseSync } from 'node:sqlite';

export function d1FromSqlite(db) {
  return {
    prepare(sql) {
      const stmt = db.prepare(sql);
      const make = (args) => ({
        bind: (...a) => make(a),
        all: async () => ({ results: stmt.all(...args).map((r) => ({ ...r })) }),
        first: async () => {
          const r = stmt.get(...args);
          return r ? { ...r } : null;
        },
      });
      return make([]);
    },
  };
}

export function openMemoryDb(sqlBatches = []) {
  const db = new DatabaseSync(':memory:');
  for (const b of sqlBatches) db.exec(b);
  return db;
}
