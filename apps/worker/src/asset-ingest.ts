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

/** Bounded so one request cannot exceed the Workers subrequest budget: each row costs 2 FTS
 *  writes plus a share of one chunked insert, so 50 rows is ~115 D1 queries. */
export const INGEST_MAX_BATCH = 50;

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
    // v1 library policy is CC0 only. Stated here rather than defaulted, so a future decision to
    // admit CC-BY is a visible edit in the ingest rather than an omission somewhere.
    cc0Only: true,
    requireImportDate: false,
    status: req.status,
  });
  return { received: all.length, written, rejected, truncated: all.length > batch.length };
}
