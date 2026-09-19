import { toIngestRecord } from './asset-ingest-record.mjs';

// Metadata repair, not ingest: never create a row, change provenance, or replace an imported ID.
// The WHERE guard is evaluated at write time, not just in a preflight snapshot.
export const DOWNLOAD_BACKFILL_SQL = `UPDATE asset_library SET download_url = ?
WHERE id = ? AND source = 'opengameart' AND source_url = ?
AND licence = ? AND licence_url = ? AND author = ?
AND commercial_use = ? AND attribution_required = ? AND name = ? AND kind = ?
AND status = 'pending_ingest' AND roblox_asset_id IS NULL AND imported_at IS NULL
AND sha256 IS NULL AND download_url IS NULL RETURNING id`;

export function planDownloadBackfill(rawRows, validateProvenance) {
  if (!Array.isArray(rawRows) || !rawRows.length) throw new Error('Expanded catalogue is empty');
  if (typeof validateProvenance !== 'function') throw new Error('Canonical validator is required');
  const counts = new Map(), queries = [], rejected = [];
  for (const row of rawRows) counts.set(row?.id, (counts.get(row?.id) ?? 0) + 1);
  // Colliding IDs may name different files. Do not pick the first (or last) by harvest order.
  const ambiguous = [...counts].filter(([, count]) => count > 1).map(([id, count]) => ({ id, count }));
  for (const raw of rawRows) {
    if (counts.get(raw?.id) > 1) continue;
    const row = toIngestRecord(raw, { expandedOpenGameArt: true });
    const validation = validateProvenance(row, { seed: true, cc0Only: false });
    if (!validation.ok || row.source !== 'opengameart' || !row.id.startsWith('opengameart/')
      || typeof raw._download !== 'string' || !row.downloadUrl
      || row.robloxAssetId !== null || row.importedAt !== null || row.sha256 !== null) {
      rejected.push({ id: raw?.id, errors: validation.errors?.length
        ? validation.errors : ['Not a pending expanded image'] });
      continue;
    }
    queries.push({ sql: DOWNLOAD_BACKFILL_SQL, params: [row.downloadUrl, row.id, row.sourceUrl,
      row.licence, row.licenceUrl, row.author, String(Number(row.commercialUse)),
      String(Number(row.attributionRequired)), row.name, row.kind] });
  }
  return { queries, rejected, ambiguous };
}

// Verify every column of every existing source row, not merely the number of successful writes.
export function verifyDownloadBackfill(before, after, queries) {
  const previous = new Map(before.map(row => [row.id, row]));
  const planned = new Map(queries.map(query => [query.params[1], query.params[0]]));
  if (before.length !== after.length) throw new Error('Source row count changed during repair');
  let changed = 0;
  for (const row of after) {
    const old = previous.get(row.id);
    if (!old) throw new Error(`Unexpected source row: ${row.id}`);
    const { download_url: oldUrl, ...oldRest } = old;
    const { download_url: newUrl, ...newRest } = row;
    if (JSON.stringify(oldRest) !== JSON.stringify(newRest)) {
      throw new Error(`Non-download metadata changed: ${row.id}`);
    }
    if (oldUrl !== newUrl) {
      if (oldUrl !== null || !planned.has(row.id) || newUrl !== planned.get(row.id)) {
        throw new Error(`Unexpected download change: ${row.id}`);
      }
      changed++;
    }
    previous.delete(row.id);
  }
  if (previous.size) throw new Error('Source IDs changed during repair');
  return { changed, preserved: after.length - changed };
}
