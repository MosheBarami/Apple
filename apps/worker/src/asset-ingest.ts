// The caller the curated asset library never had.
//
// `asset-library.ts` has carried `ensureAssetTables` and `upsertAssets` since it was written, and
// until now nothing in the repository called either. A test asserted that absence on purpose, so
// the blocker could not quietly go stale while the code contradicted it. This file is the ingest
// that closes it, and that test now asserts the new truth instead.
//
// WHY AN ADMIN ROUTE RATHER THAN A SQL DUMP. The column list, the FTS mirror, the licence gate and
// the 100-bound-parameter chunking all live in `upsertAssets`. A script that wrote SQL directly
// would be a second copy of every one of those rules, and the two would drift. The ingest runs the
// real write path inside the real runtime, so what lands in D1 is what the product's own code puts
// there — including the rejections.
//
// REJECTS ARE THE OUTPUT. A batch where 200 rows wrote and 50 were refused must report both
// numbers. "written: 200" alone is a success message covering a failure, which is the shape this
// codebase keeps finding and keeps refusing to ship.
import type { Env } from './env';
import type { AssetProvenance, AssetStatus } from './asset-library';
import { ensureAssetTables, upsertAssets } from './asset-library';

/**
 * Bounded so one request stays inside the Workers subrequest budget.
 *
 * It was 50, chosen when every statement was its own awaited round trip: 50 rows cost ~115 of
 * them. `upsertAssets` now sends the whole chunk through `env.CORPUS.batch()`, which is ONE
 * subrequest however many statements it carries, so the old number was budgeting for a cost that
 * no longer exists — and at 50 a 450,000-row harvest is five and a half hours of HTTP overhead.
 *
 * MEASURED against the live remote D1, same rows, same worker:
 *     50 rows -> 22 rows/sec   (the old constant: ~5.5 hours for the 447,000-row harvest)
 *    200 rows -> 41 rows/sec
 *    500 rows -> 53 rows/sec   (~2.3 hours)
 *
 * The curve flattens because the bottleneck stops being HTTP round trips and becomes D1's own
 * single-threaded write throughput, which is a reason to stop raising it rather than a reason to
 * keep going. 500 rows is 125 chunked inserts plus 1,000 FTS statements in one batch; the ceiling
 * that matters is now D1's statement limit per batch, and a caller who sends more gets `truncated`
 * back rather than a silently short ingest.
 */
export const INGEST_MAX_BATCH = 500;

export interface IngestRequest {
  assets: unknown[];
  /** Seed rows have no Roblox asset id yet; that is legitimate and must be declared, not inferred. */
  seed?: boolean;
  status?: AssetStatus;
}

export interface IngestResult {
  received: number;
  written: number;
  rejected: { id: string; errors: string[] }[];
  /** True when the caller sent more than one batch's worth and the excess was NOT written. */
  truncated: boolean;
}

/**
 * Ingest one batch. Returns what happened to every record handed in — `received` and
 * `written + rejected.length` are equal by construction unless `truncated`, which is exactly why
 * `truncated` is a field and not a silent slice.
 */
export async function ingestAssets(env: Pick<Env, 'CORPUS'>, req: IngestRequest): Promise<IngestResult> {
  const all = Array.isArray(req.assets) ? req.assets : [];
  const batch = all.slice(0, INGEST_MAX_BATCH) as AssetProvenance[];
  await ensureAssetTables(env);
  const { written, rejected } = await upsertAssets(env, batch, {
    seed: req.seed ?? true,
    //[[ THE CC0-ONLY POLICY IS RETIRED, AND THIS IS THE EVIDENCE IT RESTED ON.
    //
    //   It refused any licence owing a credit line, for one stated reason: "nothing emits credit
    //   lines yet". That sentence stopped being true. The chain exists and every link was read
    //   before this line changed:
    //
    //     `insert_asset` records the use against the project (provenance-wiring.test.mjs proves
    //     the refusal guard precedes the record, so only a proven-clean asset is recorded);
    //     `attributionReport` puts anything whose licence or record demands a credit into
    //     `report.required`, separately from the courtesy list;
    //     `renderAttribution` prints each one as name, AUTHOR, licence and source url, and prints
    //     a loud INCOMPLETE block for anything it could not account for;
    //     `GET /api/projects/:id/attribution` serves it, owner-scoped through withOwnedProject.
    //
    //   So the obligation is dischargeable, which is the only question the policy was ever
    //   asking. What is refused has not changed and is not a matter of convenience: share-alike
    //   and non-commercial stay out, because those obligations cannot be discharged inside a
    //   customer's Roblox place at all — `allowedInLibrary` in LICENCES still decides that.
    //
    //   What this admits: 336,364 icons under MIT, Apache-2.0, ISC and BSD-3-Clause, plus the
    //   CC-BY families. Three quarters of the library, held out by a sentence about a feature
    //   that had since been built.
    //
    //   asset-qc.test.mjs asserts the link directly: an attribution-required asset may enter the
    //   library only while renderAttribution still credits it by author. If that ever stops being
    //   true, this decision goes red rather than quietly becoming wrong. ]]
    cc0Only: false,
    requireImportDate: false,
    status: req.status,
  });
  return { received: all.length, written, rejected, truncated: all.length > batch.length };
}
