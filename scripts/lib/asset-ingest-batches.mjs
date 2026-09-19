/** Preserve queue order and keep each request within one validation lifecycle. */
export function* assetIngestBatches(queue, size = 500) {
  if (!Number.isInteger(size) || size < 1) throw new RangeError('Batch size must be a positive integer');
  for (let from = 0; from < queue.length;) {
    const { seed, status } = queue[from];
    let end = from + 1;
    while (end < queue.length && end - from < size
      && queue[end].seed === seed && queue[end].status === status) end++;
    yield { from, seed, status, assets: queue.slice(from, end).map((row) => row.a) };
    from = end;
  }
}
