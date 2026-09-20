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
  // THREE CAUSES USED TO SHARE ONE SENTENCE. "Studio could not capture a restorable snapshot of the
  // supported objects" was what the owner saw on 2026-09-20, and it was returned for a place larger
  // than the plugin's bounded walk, for a place holding objects this version cannot serialise, and
  // for a snapshot the plugin never stamped with this checkpoint's id. Three causes, three different
  // remedies: shrink/accept Studio undo, look at the named classes, update the plugin. Neither the
  // owner nor support could tell which had happened. Each names itself now, and quotes only numbers
  // the plugin actually sent — a count it did not send is not reported as zero.
  //
  // Order is the causal order on the wire, not preference: `truncated` forces `restorable` false in
  // apps/apple-plugin/src/Commands.luau:2927, and `checkpointEligible` is `restorable` AND identity,
  // so testing the narrowest cause last is what makes the named cause the actual one.
  if (data.truncated !== false) {
    return refuse(`this project is too large for one checkpoint — Studio stopped early${snapshotReach(data)}. Apple still edits it normally; Studio's own undo is the rollback for a place this size.`);
  }
  if (data.restorable !== true) {
    return refuse(`Studio read the project but could not capture ${omittedObjects(data.skipped)}, so a restore would not put it back as it is.`);
  }
  if (data.checkpointEligible !== true) {
    return refuse('Studio did not stamp its snapshot with this checkpoint, so a restore could not be matched to it. Update the Studio plugin.');
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

/** How far the bounded walk actually got, from the plugin's own counters. Silent about any it omitted. */
function snapshotReach(data: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [key, unit] of [['nodeCount', 'objects'], ['sourceChars', 'characters of script']] as const) {
    const value = data[key];
    if (Number.isSafeInteger(value) && (value as number) > 0) parts.push(`${value} ${unit}`);
  }
  return parts.length ? ` (it reached ${parts.join(' and ')})` : '';
}

/** Names the classes Studio itself listed. When it listed none, says that rather than guessing a cause. */
function omittedObjects(skipped: unknown): string {
  if (!skipped || typeof skipped !== 'object') return 'every object exactly (it named none of them)';
  const entries = (Object.entries(skipped as Record<string, unknown>) as [string, unknown][])
    .filter(([, n]) => Number.isSafeInteger(n) && (n as number) > 0)
    .sort((a, b) => (b[1] as number) - (a[1] as number));
  if (!entries.length) return 'every object exactly (it named none of them)';
  const named = entries.slice(0, 3).map(([className, n]) => `${className} x${n}`).join(', ');
  return `these objects exactly: ${named}${entries.length > 3 ? ` and ${entries.length - 3} more` : ''}`;
}

export function checkpointCoverageNote(coverage: unknown, preservedObjects: unknown): string | undefined {
  if (coverage !== 'supported-subset') return undefined;
  const count = Number.isSafeInteger(preservedObjects) && (preservedObjects as number) > 0 ? preservedObjects : null;
  return `Restores the supported objects. ${count === null ? 'Protected engine objects are' : `${count} protected engine object${count === 1 ? ' is' : 's are'}`} preserved rather than rolled back.`;
}
