// A D1 binding that actually runs the SQL.
//
// The alternative — a hand-written fake that records the strings it was handed — cannot observe the
// one property `memory-store.ts` exists to keep: that a read of project A does not return project
// B's rows. That property lives in the WHERE clause. A fake that never executes a WHERE clause
// would pass whether the clause bound one column or none, which is a test that measures nothing.
//
// node:sqlite is the same engine family D1 is built on, so `insert … on conflict … do update`,
// string comparison of ISO stamps, and `changes` all behave the way they will in production.
import { DatabaseSync } from 'node:sqlite';

/** @returns {{ CORPUS: object, raw: DatabaseSync, close: () => void }} */
export function d1() {
  const db = new DatabaseSync(':memory:');
  const CORPUS = {
    async exec(sql) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    },
    prepare(sql) {
      const make = (params) => ({
        bind: (...next) => make(next),
        async all() {
          return { results: db.prepare(sql).all(...params), success: true, meta: {} };
        },
        async first() {
          const row = db.prepare(sql).get(...params);
          return row === undefined ? null : row;
        },
        async run() {
          const r = db.prepare(sql).run(...params);
          return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
        },
      });
      return make([]);
    },
  };
  return { CORPUS, raw: db, close: () => db.close() };
}

/** Count rows matching a raw query — used to distinguish "filtered out" from "never there". */
export function countRows(raw, sql, ...params) {
  const row = raw.prepare(sql).get(...params);
  return Number(Object.values(row)[0]);
}
