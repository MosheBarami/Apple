/**
 * A recipe-shaped instance spec (compose.ts InstanceSpecLite: plain JSON values) as the plugin's typed InstanceSpec.
 *
 * This is the one piece of the removed whole-game runner (compose-run.ts, deleted in M4) that the single-object tools still
 * need: dress-object, library-object, object-tool and studded-ui-tool write their specs through it. The runner itself is gone;
 * M5's recipe interpreter will write its own.
 */
import type { InstanceSpec, PropValue } from '@studpilot/shared';
import type { InstanceSpecLite } from './compose';

const ENUMS: Record<string, string> = { Material: 'Material', TopSurface: 'SurfaceType', BottomSurface: 'SurfaceType', Shape: 'PartType' };

/** A composer value as the plugin's typed PropValue. */
export function propValue(key: string, v: unknown): PropValue | undefined {
  // Already typed (stud-ui.ts writes UDim2, UDim, Vector2, ColorSequence and enums this way): passed through unchanged.
  if (v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { t?: unknown }).t === 'string') return v as PropValue;
  if (typeof v === 'boolean') return { t: 'bool', v };
  if (typeof v === 'number') return { t: 'number', v };
  if (Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number')) return { t: 'Vector3', v: v as [number, number, number] };
  if (typeof v === 'string') {
    if (ENUMS[key]) return { t: 'EnumItem', v: `Enum.${ENUMS[key]}.${v}` };
    const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(v);
    if (hex) return { t: 'Color3', v: [parseInt(hex[1]!, 16) / 255, parseInt(hex[2]!, 16) / 255, parseInt(hex[3]!, 16) / 255] };
    return { t: 'string', v };
  }
  return undefined;
}

export function typed(spec: InstanceSpecLite): Omit<InstanceSpec, 'parent'> {
  const props: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(spec.props ?? {})) { const p = propValue(k, v); if (p) props[k] = p; }
  const attributes: Record<string, PropValue> = {};
  for (const [k, v] of Object.entries(spec.attributes ?? {})) { const p = propValue('', v); if (p) attributes[k] = p; }
  return {
    className: spec.className, name: spec.name,
    ...(Object.keys(props).length ? { props } : {}),
    ...(Object.keys(attributes).length ? { attributes } : {}),
    ...(spec.children?.length ? { children: spec.children.map(typed) } : {}),
  };
}
