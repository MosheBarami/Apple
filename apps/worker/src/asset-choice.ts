/** One project-scoped visual choice. The browser sends only the ordinal, never an asset id. */
export interface PendingAssetChoice {
  request: string;
  mode: 'plan' | 'agent';
  productModel?: string;
  autonomous: boolean;
  options: { id: string; assetId: number; name: string }[];
  /** Choices rejected earlier in this same visual search, across multiple previews. */
  rejectedAssetIds?: number[];
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
