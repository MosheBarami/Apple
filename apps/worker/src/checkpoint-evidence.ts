import type { CheckpointMeta } from '@golem/shared';

export const APPLE_SNAPSHOT_FORMAT = 'apple-studio-snapshot-v1';

type Admission =
  | { ok: true; coverage?: CheckpointMeta['coverage']; preservedObjects?: number }
  | { ok: false; error: string };

/** The plugin owns tree/source validation; this boundary binds its report to the stored checkpoint. */
export function checkpointEvidence(value: unknown, checkpointId: string): Admission {
  const refuse = (detail: string): Admission => ({ ok: false, error: `Checkpoint was not saved: ${detail}` });
  if (!value || typeof value !== 'object' || Array.isArray(value)) return refuse('Studio returned no snapshot.');
  const data = value as Record<string, unknown>;
  if (data.format === undefined) {
    // Existing plugin snapshots predate these flags. Preserve their wire format without inventing
    // a coverage verdict. A partially populated new-format response must not downgrade to legacy.
    if (['checkpointEligible', 'restorable', 'coverage', 'wholePlaceComplete', 'checkpointId'].some(key => key in data)) {
      return refuse('Studio omitted the format of its checkpoint report.');
    }
    return { ok: true };
  }
  if (data.format !== APPLE_SNAPSHOT_FORMAT) return refuse('Studio returned an unsupported snapshot format.');
  if (data.checkpointId !== checkpointId) return refuse('the snapshot identity does not match this checkpoint.');
  if (data.root !== 'game' || data.scope !== 'place') return refuse('Studio returned a different snapshot scope.');
  if (data.restorable !== true || data.checkpointEligible !== true || data.truncated !== false) {
    return refuse('Studio could not capture a restorable snapshot of the supported objects.');
  }
  if (data.includeScripts !== true || data.sourceHashAlgorithm !== 'fnv1a32') {
    return refuse('script source or its integrity report is missing.');
  }
  // HttpService JSON-encodes an empty Luau table as []; both representations mean no omissions.
  // Any member, in either representation, still refuses the checkpoint.
  if (!data.skipped || typeof data.skipped !== 'object'
      || Object.keys(data.skipped).length !== 0) return refuse('unsupported authored objects were omitted.');
  if (!Array.isArray(data.protected) || data.protected.length > 800) return refuse('protected-object coverage is invalid.');
  const preservedObjects = data.protected.length;
  const coverage = data.coverage;
  if (coverage !== 'exact' && coverage !== 'supported-subset') return refuse('the snapshot is incomplete.');
  const exact = coverage === 'exact';
  if (data.complete !== exact || data.wholePlaceComplete !== exact || (exact ? preservedObjects !== 0 : preservedObjects === 0)) {
    return refuse('the snapshot coverage report is inconsistent.');
  }
  for (const key of ['scriptCount', 'instanceCount', 'nodeCount', 'sourceChars']) {
    if (!Number.isSafeInteger(data[key]) || (data[key] as number) < 0) return refuse('snapshot counts are invalid.');
  }
  if (!data.node || typeof data.node !== 'object' || Array.isArray(data.node)) return refuse('snapshot tree is missing.');
  return { ok: true, coverage, preservedObjects };
}

export function checkpointCoverageNote(coverage: unknown, preservedObjects: unknown): string | undefined {
  if (coverage !== 'supported-subset') return undefined;
  const count = Number.isSafeInteger(preservedObjects) && (preservedObjects as number) > 0 ? preservedObjects : null;
  return `Restores the supported objects. ${count === null ? 'Protected engine objects are' : `${count} protected engine object${count === 1 ? ' is' : 's are'}`} preserved rather than rolled back.`;
}
