import type { ToolEvent } from '../../lib/use-project-socket';

/**
 * One option on the "Which one looks right?" card. A Creator Store row carries its assetId (its Roblox thumbnail);
 * a ready-made model standing in the place carries the number it stands under (library-object.ts, owner 2026-10-02:
 * the user picks from three), and where it comes from.
 */
export interface VisualOption { name: string; assetId?: number; index?: number; where?: string }

const IMAGE_PATH = /^\/api\/projects\/[A-Za-z0-9-]{1,64}\/images\/[A-Za-z0-9-]{1,64}$/;

function searchDetail(tools: ToolEvent[]): Record<string, unknown> | null {
  const search = [...tools].reverse().find((tool) => tool.tool === 'find_library_model' && tool.ok === true);
  const detail = search?.detail;
  return detail && typeof detail === 'object' && (detail as { kind?: unknown }).kind === 'asset_choices' ? detail as Record<string, unknown> : null;
}

/** A model-supplied tool detail is untrusted. Accept only StudPilot's own search row shape. */
export function visualOptions(tools: ToolEvent[]): VisualOption[] {
  const raw = searchDetail(tools)?.options;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).filter((item): item is VisualOption =>
    item && typeof item === 'object' &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120 &&
    ((Number.isSafeInteger(item.assetId) && item.assetId > 0) || (Number.isSafeInteger(item.index) && item.index >= 1 && item.index <= 3)) &&
    (item.where === undefined || (typeof item.where === 'string' && item.where.length <= 120)));
}

/** The snapshot of the numbered models in the place, when the search took one: a same-origin project image only. */
export function visualSnapshot(tools: ToolEvent[]): string | null {
  const image = searchDetail(tools)?.image;
  return typeof image === 'string' && IMAGE_PATH.test(image) ? image : null;
}
