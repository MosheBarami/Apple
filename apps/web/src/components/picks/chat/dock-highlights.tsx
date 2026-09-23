// THE RAIL'S TWO BEDS: WHERE YOU ARE, AND WHERE THE POINTER IS.
//
// Two picks, re-implemented without Motion (not installed; the Motion example is Motion+ licensed):
//   * Motion "Shared layout animation" — one marker for the current destination, which SLIDES to the
//     new row when the route changes, instead of one row's marker vanishing while another's grows;
//   * Animate UI "Sidebar" (MIT + Commons Clause) — the hover bed follows the pointer from row to row
//     with a spring, so moving down the rail reads as one movement rather than five blinks.
//
// Both beds are drawn in the rail's own box behind the rows; the rows keep their `aria-current`,
// their names and their focus rings, so nothing a screen reader or a keyboard relies on moved. The
// beds are measured from the rows on every route change, resize and scroll of the rail's list.
import { useEffect, useRef, useState, type RefObject } from 'react';
import './dock-highlights.css';

type Bed = { top: number; left: number; width: number; height: number } | null;

const ROWS = '.studio-dock__row, .studio-navigation';

function measure(dock: HTMLElement, row: Element | null): Bed {
  if (!row) return null;
  const d = dock.getBoundingClientRect();
  const r = row.getBoundingClientRect();
  if (!r.width || !r.height) return null;
  return { top: r.top - d.top, left: r.left - d.left, width: r.width, height: r.height };
}

const style = (bed: Bed) =>
  bed ? { transform: `translate(${bed.left}px, ${bed.top}px)`, width: bed.width, height: bed.height } : undefined;

export function DockHighlights({ dock, route }: { dock: RefObject<HTMLElement>; route: string }) {
  const [current, setCurrent] = useState<Bed>(null);
  const [hover, setHover] = useState<Bed>(null);
  const hoverRow = useRef<Element | null>(null);

  useEffect(() => {
    const el = dock.current;
    if (!el) return;
    el.classList.add('has-pk-beds');
    const update = () => {
      setCurrent(measure(el, el.querySelector('.studio-dock__row[aria-current="page"]')));
      if (hoverRow.current) setHover(measure(el, hoverRow.current));
    };
    // After the router has moved `aria-current` to the new row.
    const id = requestAnimationFrame(update);
    const onOver = (e: PointerEvent | FocusEvent) => {
      const row = (e.target as Element | null)?.closest?.(ROWS) ?? null;
      if (e.type === 'focusin' && !(e.target as Element).matches?.(':focus-visible')) return;
      hoverRow.current = row;
      setHover(measure(el, row));
    };
    const onLeave = () => {
      hoverRow.current = null;
      setHover(null);
    };
    const nav = el.querySelector('.studio-dock__nav');
    el.addEventListener('pointerover', onOver);
    el.addEventListener('focusin', onOver);
    el.addEventListener('pointerleave', onLeave);
    el.addEventListener('focusout', onLeave);
    nav?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(id);
      el.removeEventListener('pointerover', onOver);
      el.removeEventListener('focusin', onOver);
      el.removeEventListener('pointerleave', onLeave);
      el.removeEventListener('focusout', onLeave);
      nav?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [dock, route]);

  return (
    <>
      <span className="pk-bed pk-bed--hover" aria-hidden="true" data-on={hover ? '' : undefined} style={style(hover)} />
      <span className="pk-bed pk-bed--current" aria-hidden="true" data-on={current ? '' : undefined} style={style(current)} />
    </>
  );
}
