/**
 * Convert harvest bookkeeping into the library's wire shape.
 *
 * `_download` is used by several harvesters as an internal fetch hint. Only the expanded
 * OpenGameArt catalogue has one row per loose file, so only that artefact may promote the hint to
 * `downloadUrl`. Carrying another source's hint would bypass its resolver; carrying the ordinary
 * OpenGameArt pack hint would make a pack silently mean whichever file happened to be listed first.
 */
export function toIngestRecord(raw, { expandedOpenGameArt = false } = {}) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const { _download, ...record } = raw;
  if (expandedOpenGameArt && record.source === 'opengameart' && _download !== undefined) {
    return { ...record, downloadUrl: _download };
  }
  return record;
}
