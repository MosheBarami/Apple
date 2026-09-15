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
// already run the DDL. Whether a table exists is a different question with a different answer
// (`assetLibraryAvailable` reads sqlite_master and is what search consults), and conflating the
// two would let a cache decide a table is there.
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

/** In-flight or completed DDL runs, by store key. A rejected entry is deleted, never kept. */
const running = new Map<string, Promise<void>>();

/**
 * Run `fn` at most once per isolate for this `key`.
 *
 * Returns the same promise to every caller while it is in flight, and thereafter returns
 * immediately. If `fn` rejects, the entry is removed and the rejection propagates to every caller
 * that was waiting — so a failed schema run is reported, not swallowed, and is retried next time.
 */
export function oncePerIsolate(key: string, fn: () => Promise<void>): Promise<void> {
  const existing = running.get(key);
  if (existing) return existing;
  const p = fn().catch((e) => {
    running.delete(key);
    throw e;
  });
  running.set(key, p);
  return p;
}

/** Test seam: the map is per-isolate and otherwise unreachable. */
export function resetSchemaOnce(key?: string): void {
  if (key === undefined) running.clear();
  else running.delete(key);
}
