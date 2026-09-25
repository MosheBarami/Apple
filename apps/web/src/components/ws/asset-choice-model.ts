import type { ToolEvent } from '../../lib/use-project-socket';

export interface VisualOption { name: string; assetId: number }

/** A model-supplied tool detail is untrusted. Accept only Apple's own search row shape. */
export function visualOptions(tools: ToolEvent[]): VisualOption[] {
  const search = [...tools].reverse().find((tool) => tool.tool === 'find_library_model' && tool.ok === true);
  const detail = search?.detail;
  if (!detail || typeof detail !== 'object' || (detail as { kind?: unknown }).kind !== 'asset_choices') return [];
  const raw = (detail as { options?: unknown }).options;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 3).filter((item): item is VisualOption =>
    item && typeof item === 'object' &&
    Number.isSafeInteger(item.assetId) && item.assetId > 0 &&
    typeof item.name === 'string' && item.name.trim().length > 0 && item.name.length <= 120);
}
