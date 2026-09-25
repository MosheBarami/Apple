/** Explicit per-run limit on Creator Store lookups requested by the project owner. */
export function explicitAssetSearchLimit(request: string): number | null {
  const number = '(?:\\d{1,2}|zero|one|two|three|four|five|six|seven|eight|nine|ten)';
  const search = '(?:asset |library |model )?(?:search(?:es)?|quer(?:y|ies))';
  const patterns = [
    new RegExp(`\\b(?:at most|no more than|limit(?: yourself)? to)\\s+(${number})\\b[^.;\\n]{0,60}?\\b${search}\\b`, 'gi'),
    new RegExp(`\\b${search}\\s+(?:at most|no more than)\\s+(${number})\\b`, 'gi'),
  ];
  const words: Record<string, number> = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
    six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  };
  const limits: number[] = [];
  for (const pattern of patterns) {
    for (const match of request.matchAll(pattern)) {
      if (!match[1]) continue;
      const token = match[1].toLowerCase();
      const limit = words[token] ?? Number(token);
      if (Number.isInteger(limit) && limit >= 0) limits.push(limit);
    }
  }
  return limits.length ? Math.min(...limits) : null;
}

export function assetSearchLimitReached(
  request: string,
  trace: readonly { tool: string }[],
  nextTool: string,
): boolean {
  const tools = new Set(['find_library_model', 'find_verified_asset']);
  if (!tools.has(nextTool)) return false;
  const limit = explicitAssetSearchLimit(request);
  return limit !== null && trace.filter((entry) => tools.has(entry.tool)).length >= limit;
}
