// The highlight that slides to whichever tab or section is current.
//
// MERGED FROM TWO PICKS that both answer "which one am I on" by moving one shape between items:
//   * UI Layouts "Liquid Glass Sidebar Menu" (MIT): a glass pill — blurred, lit on its edges —
//     behind the current row of a vertical menu. Used on the Settings rail.
//   * React Bits "Gooey Nav" (MIT + Commons Clause, re-implemented, not copied): on each change a
//     small burst of particles leaves the new item and the label pops. Used on the two-option tab
//     strips (Usage | Plan & billing, Active | Archived). Monochrome here — ink particles, no hue.
// One component, one measurement path, two looks. It measures the active element against its
// host and springs there; with reduced motion it jumps and bursts nothing.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { reducedMotion, spring } from './motion';
import './glide-indicator.css';

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function GlideIndicator({
  host,
  activeKey,
  selector,
  variant = 'glass',
  as = 'span',
}: {
  /** The positioned element the items live in. */
  host: RefObject<HTMLElement | null>;
  /** Changes whenever the active item does; the indicator re-measures on it. */
  activeKey: string | null;
  /** How to find the active item inside `host`. */
  selector: string;
  variant?: 'glass' | 'goo';
  /** 'li' when the host is a list, so the markup stays a valid list. */
  as?: 'span' | 'li';
}) {
  const [box, setBox] = useState<Box | null>(null);
  const [burst, setBurst] = useState(0);
  const first = useRef(true);

  // A PASSIVE effect, not a layout one: this component is usually a child of its own host, and a
  // child's layout effect runs before the parent element's ref is attached — `host.current` would
  // still be null on the first mount and the pill would never appear.
  useEffect(() => {
    const root = host.current;
    if (!root) return;
    root.classList.add('pk-glide-host');
    const measure = () => {
      const el = root.querySelector<HTMLElement>(selector);
      if (!el || el.offsetWidth === 0) {
        setBox(null);
        return;
      }
      // offset* is relative to the nearest positioned ancestor, which the host CSS guarantees
      // is the host; walking up covers an item nested one element deeper (the rail's <li>).
      let x = 0;
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        x += node.offsetLeft;
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      setBox({ x, y, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [host, selector, activeKey]);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (variant === 'goo' && !reducedMotion()) setBurst((b) => b + 1);
  }, [activeKey, variant]);

  if (!box) return null;
  const s = spring(260, 26);
  const style = {
    transform: `translate(${box.x}px, ${box.y}px)`,
    width: box.w,
    height: box.h,
    '--pk-glide-ease': s.easing,
    '--pk-glide-dur': `${s.duration}ms`,
  } as CSSProperties;

  const Tag = as;
  return (
    <Tag className={`pk-glide pk-glide--${variant}`} style={style} aria-hidden="true" role={as === 'li' ? 'presentation' : undefined}>
      {variant === 'goo' && burst > 0 && (
        <span key={burst} className="pk-glide__burst">
          {Array.from({ length: 10 }, (_, i) => {
            const a = (i / 10) * Math.PI * 2 + (burst % 3) * 0.3;
            const d = 26 + ((i * 7) % 11);
            return (
              <i
                key={i}
                style={{ '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d * 0.55}px`, '--dl': `${(i % 4) * 25}ms` } as CSSProperties}
              />
            );
          })}
        </span>
      )}
    </Tag>
  );
}
