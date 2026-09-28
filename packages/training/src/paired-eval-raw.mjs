/** Turn one paired generation into the best adapter's view for the unchanged scorer. */
export function splitPairedRaw(raw) {
  if (!raw?.best_adapter || !raw?.rows || !Object.keys(raw.rows).length) {
    throw new Error('paired raw answers need a best adapter and rows');
  }
  const rows = {};
  for (const [id, row] of Object.entries(raw.rows)) {
    if (typeof row?.base !== 'string' || typeof row?.adapter !== 'string' || typeof row?.best !== 'string') {
      throw new Error(`paired row ${id} lacks a base, candidate or best answer`);
    }
    rows[id] = { ...row, adapter: row.best };
  }
  return { ...raw, adapter: raw.best_adapter, adapterSide: 'best', rows };
}
