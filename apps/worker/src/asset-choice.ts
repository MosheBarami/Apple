/** One project-scoped visual choice. The browser sends only the ordinal, never an asset id. */
export interface PendingAssetChoice {
  request: string;
  mode: 'plan' | 'agent';
  productModel?: string;
  autonomous: boolean;
  options: { id: string; assetId: number; name: string }[];
  /** Choices rejected earlier in this same visual search, across multiple previews. */
  rejectedAssetIds?: number[];
  /** Main object named by the first search, so rejection cannot drift to another category. */
  anchor?: string;
}

export const ASSET_CHOICE_MESSAGE = /^Use visual option ([123]) and continue\.$/;

export function selectedLibraryAsset(
  text: string,
  pending: PendingAssetChoice | null,
  actorId: string | undefined,
  ownerId: string,
): { id: string; assetId: number; name: string } | null {
  const index = ASSET_CHOICE_MESSAGE.exec(text)?.[1];
  if (!index || actorId !== ownerId || !pending) return null;
  const choice = pending.options[Number(index) - 1];
  return choice && Number.isSafeInteger(choice.assetId) && choice.assetId > 0
    ? choice
    : null;
}

export function rejectedLibraryAssets(pending: PendingAssetChoice): number[] {
  return [...new Set([
    ...(pending.rejectedAssetIds ?? []),
    ...pending.options.map((option) => option.assetId),
  ].filter((id) => Number.isSafeInteger(id) && id > 0))];
}

const GENERIC = new Set(['a', 'the', 'free', 'roblox', 'model', 'asset', 'cartoon', 'stylized', 'low', 'poly', 'small', 'medium', 'large']);
const words = (text: string) => text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const stem = (word: string) => word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;

export function visualAssetAnchor(query: string, options: PendingAssetChoice['options']): string | null {
  // Anchor the requested object, not an accidentally retrieved adjective. A search for
  // "wooden arch gate" must stay a gate search even if the index returns wooden plates.
  const candidate = words(query).map(stem).filter((word) => !GENERIC.has(word));
  return candidate.at(-1) ?? words(options[0]?.name ?? '').map(stem).filter((word) => !GENERIC.has(word)).at(-1) ?? null;
}

export function matchesVisualAnchor(name: string, anchor: string | undefined): boolean {
  return !anchor || words(name).some((word) => stem(word) === anchor);
}
