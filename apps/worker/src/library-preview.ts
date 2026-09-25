/** Roblox's thumbnail service may return a URL; only its image CDN may reach the browser. */
export function robloxThumbnailUrl(payload: unknown, requestedId: number): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return null;
  const row = data.find((item) => item && typeof item === 'object' && item.targetId === requestedId && item.state === 'Completed');
  if (!row || typeof row.imageUrl !== 'string') return null;
  try {
    const url = new URL(row.imageUrl);
    return url.protocol === 'https:' && url.hostname === 'tr.rbxcdn.com' ? url.href : null;
  } catch {
    return null;
  }
}
