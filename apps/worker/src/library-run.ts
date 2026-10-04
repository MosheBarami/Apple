// What this run has done with the model library, as plain facts the tools can read.
//
// The owner's asset order (2026-10-02) is: library, then Creator Store, then adapt or combine what was
// found, then build from Parts. Whether a run has TRIED the library is a fact about the run, not about a
// request's subject, so the order gate (model-rule.ts) reads it from here and never from a list of words.
//
// Kept on the run (AgentState.libraryRun) and handed to every tool call by reference, so a search in one
// step and a build in the next see the same record. Pure: no env, no Studio.

export type LibraryOutcome =
  /** find_library_model returned candidates; none has been inserted yet. */
  | 'hits'
  /** find_library_model returned nothing usable. */
  | 'no_hit'
  /** insert_library_model reached Studio or Roblox and failed. */
  | 'insert_failed'
  /** insert_library_model put a model in the place. */
  | 'inserted';

export interface LibraryRun {
  /** The result of the latest library step. Absent: the run has not tried the library. */
  outcome?: LibraryOutcome;
  /** Refusals the order gate has made this run (bounded by ORDER_GATE_LIMIT in model-rule.ts). */
  gated?: number;
  /** Ids returned by the latest search and not yet tried, in rank order (library ids, unchanged). */
  candidates?: string[];
  /** Roblox asset ids this run saw fail to load or scan, so the same id is not tried twice. */
  failedIds?: number[];
  /** Library inserts started this run: names each run-unique holder Folder (tools.ts insertAndProveClean). */
  inserts?: number;
  /** Where each model this run inserted stands (bottom-centre) and its footprint radius, newest last: a new insert is kept off them. */
  placed?: { path: string; at: [number, number, number]; r: number }[];
}

/** Most models remembered; older ones are forgotten first. */
export const PLACED_KEPT = 24;

export function notePlaced(run: LibraryRun, path: string, at: [number, number, number], r: number): void {
  run.placed = [...(run.placed ?? []).filter((p) => p.path !== path), { path, at, r }].slice(-PLACED_KEPT);
}

/** A step that ended the library question: the model may go on to the next step in the order. */
export function libraryAttemptEnded(run: LibraryRun | undefined): boolean {
  return run?.outcome === 'no_hit' || run?.outcome === 'insert_failed' || run?.outcome === 'inserted';
}

export function noteSearch(run: LibraryRun, ids: readonly string[]): void {
  run.candidates = ids.slice(0, 20);
  // A later search that finds nothing must not undo an insert that worked.
  run.outcome = ids.length ? (run.outcome === 'inserted' ? 'inserted' : 'hits') : run.outcome === 'inserted' ? 'inserted' : 'no_hit';
}

export function noteInsert(run: LibraryRun, id: string, assetId: number | undefined, ok: boolean, opts: { remember?: boolean } = {}): void {
  run.candidates = (run.candidates ?? []).filter((c) => c !== id);
  if (ok) {
    run.outcome = 'inserted';
    return;
  }
  run.outcome = run.outcome === 'inserted' ? 'inserted' : 'insert_failed';
  if (opts.remember !== false && assetId !== undefined && !(run.failedIds ?? []).includes(assetId)) run.failedIds = [...(run.failedIds ?? []), assetId].slice(-50);
}
