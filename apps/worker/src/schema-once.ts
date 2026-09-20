// Schema DDL, run once per isolate instead of once per request.
//
// THE OUTAGE THIS COMES FROM. Seven `ensure…Tables` functions each ran their whole `create table
// if not exists` / `create index if not exists` list on EVERY request that touched their store.
// Between them that is dozens of sequential round trips to a single-threaded D1, before any
// request does the thing it was sent to do — to assert a schema that has not changed since the
// deployment booted.
//
// On a quiet database it is invisible. Under a bulk asset ingest it is not: D1 answers
//
//   D1_EXEC_ERROR: Error in line 1: create table if not exists static_assets(...):
//   D1 DB exceeded its CPU time limit and was reset.
//
// and the whole request 500s with an empty `text/plain` body. It took down the asset ingest at
// `ensureAssetTables` and then the site deploy at `ensureStaticTables` — two unrelated features,
// one shared cause, and in both cases the statement that reported the reset had no work to do. It
// was merely the first thing to touch a database something else had exhausted.
//
// WHAT THIS IS NOT. It is not a claim that the tables exist. It is a memory that THIS ISOLATE has
// already run the DDL. Whether a table exists is a different question with a different answer —
// sqlite_master has to be read — and conflating the two would let a cache decide a table is there.
//
// THREE PROPERTIES, EACH WRITTEN BECAUSE THE OBVIOUS IMPLEMENTATION LACKS IT:
//
//   A FAILURE IS NOT REMEMBERED. A run that threw halfway leaves the entry cleared, so the next
//   request tries again. Caching a rejection would make a half-built schema permanent for the
//   isolate\'s whole life — and the failure above is transient by nature, so that would turn a
//   momentary reset into an outage lasting until the isolate is recycled.
//
//   CONCURRENT CALLERS SHARE ONE RUN. Two requests arriving together in one isolate would
//   otherwise both see "not done" and both issue the DDL, which is the doubling this exists to
//   prevent, at exactly the moment of load when it costs most. The in-flight promise is stored,
//   not just the finished flag.
//
//   THE KEY IS THE CALLER\'S OWN. Seven stores share one isolate; one flag between them would let
//   the first store to run silence the other six.

//[[ THE MEMO IS KEYED ON THE DATABASE, NOT ONLY ON THE STORE'S NAME.
//
//   The first version keyed on the string alone, on the reasoning that one isolate serves one
//   worker with one binding set — true in production, and false the moment anything fabricates a
//   second database. The test suite does exactly that: each test builds a fresh in-memory D1 stub
//   and calls ensureMemoryTables on it. The second stub was told the schema was already made,
//   never got its tables, and 52 tests failed with `no such table: memory_orgs`.
//
//   The comment claiming "there is nothing for a second key to distinguish" was the defect: it
//   asserted an invariant instead of enforcing one. A WeakMap on the binding OBJECT enforces it —
//   in a Worker there is one CORPUS object per isolate, so the behaviour is identical and free; in
//   a test each stub is a different object and gets its own run, with no test-only seam to
//   remember to call. The assumption is now true by construction rather than by comment.
//
//   WeakMap, so a discarded database does not pin its entry for the life of the isolate.
const perDb = new WeakMap<object, Map<string, Promise<void>>>();

/** Fallback for a caller that has no object to key on. Same semantics, isolate-wide. */
const anonymous = new Map<string, Promise<void>>();

function tableFor(db: unknown): Map<string, Promise<void>> {
  if (db === null || (typeof db !== 'object' && typeof db !== 'function')) return anonymous;
  let m = perDb.get(db as object);
  if (!m) { m = new Map(); perDb.set(db as object, m); }
  return m;
}

/**
 * Run `fn` at most once per isolate for this `key` against this `db`.
 *
 * Returns the same promise to every caller while it is in flight, and thereafter returns
 * immediately. If `fn` rejects, the entry is removed and the rejection propagates to every caller
 * that was waiting — so a failed schema run is reported, not swallowed, and is retried next time.
 *
 * `db` is the binding the schema belongs to. Pass it. Omitting it falls back to an isolate-wide
 * table, which is right for a caller that genuinely has no database to point at and wrong for one
 * that does.
 */
export function oncePerIsolate(key: string, fn: () => Promise<void>, db?: unknown): Promise<void> {
  const running = tableFor(db);
  const existing = running.get(key);
  if (existing) return existing;
  const p = fn().catch((e) => {
    running.delete(key);
    throw e;
  });
  running.set(key, p);
  return p;
}

/** Test seam: clears the isolate-wide table. Per-database entries die with their database. */
export function resetSchemaOnce(key?: string): void {
  if (key === undefined) anonymous.clear();
  else anonymous.delete(key);
}

/**
 * Do the work; make the schema only if the work says it is missing.
 *
 * WHY THE MEMO ABOVE IS NOT ENOUGH ON ITS OWN. `oncePerIsolate` remembers within ONE isolate, and
 * a burst of small requests is spread across many fresh ones — a site deploy is one POST per file,
 * so almost every one landed on an isolate that had never run the DDL and ran it again. The memo
 * removes the repetition inside a warm isolate and does nothing for the case that matters most.
 *
 * So the happy path issues no DDL at all. SQLite says `no such table: X` and says it precisely,
 * which makes "the schema is missing" a fact the database reports rather than one we check for in
 * advance on every call. The creation still goes through `oncePerIsolate`, so a cold isolate
 * handling several concurrent requests builds it once.
 *
 * ONLY that error triggers a rebuild. "D1 DB is overloaded" and "exceeded its CPU time limit" are
 * NOT missing-table errors, and answering them by issuing DDL is how a loaded database gets more
 * work at the moment it has least room — which is the outage this whole file is about, arrived at
 * from the other direction.
 */
export async function withSchema<T>(run: () => Promise<T>, create: () => Promise<void>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    if (!isMissingTable(e)) throw e;
    await create();
    return await run();
  }
}

/** SQLite's own words for it, through D1's wrapper. Nothing else counts. */
export function isMissingTable(e: unknown): boolean {
  return /no such table|no such column|no such index/i.test(String((e as Error)?.message ?? e));
}
