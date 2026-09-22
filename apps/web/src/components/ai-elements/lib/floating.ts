// Where a tooltip or listbox goes, relative to the control it belongs to.
//
// A small stand-in for the floating-ui positioning inside Radix Tooltip/Select: place the panel on
// the requested side, flip to the opposite side when it would leave the viewport, and keep it
// inside the viewport horizontally. Coordinates are for `position: fixed`, which is why the panels
// are portalled to <body>: a code block's header clips its overflow, and a panel drawn inside it
// would be cut in half.
export type Side = 'top' | 'right' | 'bottom' | 'left';
export type Align = 'start' | 'center' | 'end';

export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface Placement {
  top: number;
  left: number;
  side: Side;
}

const GUTTER = 8;

function opposite(side: Side): Side {
  return side === 'top' ? 'bottom' : side === 'bottom' ? 'top' : side === 'left' ? 'right' : 'left';
}

function fits(side: Side, anchor: Rect, size: { width: number; height: number }, offset: number, view: { width: number; height: number }): boolean {
  if (side === 'top') return anchor.top - offset - size.height >= GUTTER;
  if (side === 'bottom') return anchor.top + anchor.height + offset + size.height <= view.height - GUTTER;
  if (side === 'left') return anchor.left - offset - size.width >= GUTTER;
  return anchor.left + anchor.width + offset + size.width <= view.width - GUTTER;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

export function place(
  anchor: Rect,
  size: { width: number; height: number },
  options: { side?: Side; align?: Align; sideOffset?: number },
  view: { width: number; height: number },
): Placement {
  const offset = options.sideOffset ?? 0;
  const align = options.align ?? 'center';
  let side = options.side ?? 'top';
  if (!fits(side, anchor, size, offset, view) && fits(opposite(side), anchor, size, offset, view)) {
    side = opposite(side);
  }

  const along = (start: number, length: number, extent: number) =>
    align === 'start' ? start : align === 'end' ? start + length - extent : start + length / 2 - extent / 2;

  let top: number;
  let left: number;
  if (side === 'top' || side === 'bottom') {
    top = side === 'top' ? anchor.top - offset - size.height : anchor.top + anchor.height + offset;
    left = clamp(along(anchor.left, anchor.width, size.width), GUTTER, view.width - size.width - GUTTER);
  } else {
    left = side === 'left' ? anchor.left - offset - size.width : anchor.left + anchor.width + offset;
    top = clamp(along(anchor.top, anchor.height, size.height), GUTTER, view.height - size.height - GUTTER);
  }
  return { top: Math.round(top), left: Math.round(left), side };
}
