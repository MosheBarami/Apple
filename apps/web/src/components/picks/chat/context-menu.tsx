// A MENU THAT OPENS WHERE YOU RIGHT-CLICKED.
//
// Two Motion picks, merged and re-implemented (both are Motion+ licensed, so none of their code is
// used — only what they do):
//   * "Context Menu" — the menu opens at the pointer, growing out of that corner, and never off the
//     edge of the window;
//   * "Radix: Context Menu" — one highlight slides between the items as the pointer or the arrow
//     keys move, rather than each row lighting up on its own.
// Radix itself is not installed, so the menu semantics are written here: role="menu", roving focus
// with the arrow keys, Home/End, Enter/Space to choose, Escape or Tab to close, focus handed back to
// whatever opened it. The same menu opens from a visible "More" button, because a right-click is
// invisible to a keyboard, a screen reader and most phones.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react';
import { useIsomorphicLayoutEffect } from '../../ai-elements/lib/use-isomorphic-layout-effect';
import { createPortal } from 'react-dom';
import './context-menu.css';

export interface MenuItem {
  id: string;
  label: string;
  /** A keyboard hint or a short fact drawn at the end of the row. */
  hint?: string;
  onSelect: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

export interface MenuAnchor {
  x: number;
  y: number;
}

/** Open state for one menu, and the two ways to open it. */
export function useContextMenu() {
  const [at, setAt] = useState<MenuAnchor | null>(null);
  const onContextMenu = useCallback((event: MouseEvent) => {
    // A right-click inside a text selection is someone about to copy with the browser's own menu.
    const selection = typeof window !== 'undefined' ? window.getSelection()?.toString() : '';
    if (selection) return;
    event.preventDefault();
    setAt({ x: event.clientX, y: event.clientY });
  }, []);
  const openFrom = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setAt({ x: r.left, y: r.bottom + 4 });
  }, []);
  const close = useCallback(() => setAt(null), []);
  return { at, onContextMenu, openFrom, close };
}

export function ContextMenu({
  at,
  items,
  label,
  onClose,
}: {
  at: MenuAnchor | null;
  items: readonly MenuItem[];
  label: string;
  onClose: () => void;
}) {
  if (!at || items.length === 0 || typeof document === 'undefined') return null;
  return createPortal(<MenuPanel at={at} items={items} label={label} onClose={onClose} />, document.body);
}

function MenuPanel({ at, items, label, onClose }: { at: MenuAnchor; items: readonly MenuItem[]; label: string; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const [active, setActive] = useState(0);
  const [pos, setPos] = useState<{ left: number; top: number; origin: string } | null>(null);
  const [bed, setBed] = useState<{ top: number; height: number } | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // Placed after measuring, flipped to the other side of the pointer where it would leave the
  // window. The transform origin is the corner nearest the pointer, so it grows out of the click.
  useIsomorphicLayoutEffect(() => {
    const el = panel.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const flipX = at.x + w > window.innerWidth - 8;
    const flipY = at.y + h > window.innerHeight - 8;
    setPos({
      left: Math.max(8, flipX ? at.x - w : at.x),
      top: Math.max(8, flipY ? at.y - h : at.y),
      origin: `${flipY ? 'bottom' : 'top'} ${flipX ? 'right' : 'left'}`,
    });
  }, [at.x, at.y]);

  const rows = () => Array.from(panel.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);

  // The one highlight follows the active row.
  useIsomorphicLayoutEffect(() => {
    const row = rows()[active];
    if (!row) return;
    setBed({ top: row.offsetTop, height: row.offsetHeight });
    if (pos) row.focus({ preventScroll: true });
  }, [active, pos]);

  useEffect(() => {
    const onDown = (event: globalThis.MouseEvent) => {
      if (panel.current && !panel.current.contains(event.target as Node)) closeRef.current();
    };
    const onBlur = () => closeRef.current();
    document.addEventListener('mousedown', onDown, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onBlur);
    const back = opener.current;
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onBlur);
      if (back instanceof HTMLElement && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (event: KeyboardEvent) => {
    const n = items.length;
    if (event.key === 'ArrowDown') setActive((i) => (i + 1) % n);
    else if (event.key === 'ArrowUp') setActive((i) => (i - 1 + n) % n);
    else if (event.key === 'Home') setActive(0);
    else if (event.key === 'End') setActive(n - 1);
    else if (event.key === 'Escape' || event.key === 'Tab') onClose();
    else return;
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    <div
      ref={panel}
      className="pk-menu"
      role="menu"
      aria-label={label}
      onKeyDown={onKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      style={{
        left: pos?.left ?? at.x,
        top: pos?.top ?? at.y,
        transformOrigin: pos?.origin,
        visibility: pos ? undefined : 'hidden',
      }}
    >
      {bed && <span className="pk-menu__bed" aria-hidden="true" style={{ transform: `translateY(${bed.top}px)`, height: bed.height }} />}
      {items.map((item, i) => (
        <div key={item.id} className="pk-menu__group">
          {item.separatorBefore && <div className="pk-menu__sep" role="separator" />}
          <button
            type="button"
            role="menuitem"
            tabIndex={i === active ? 0 : -1}
            className={`pk-menu__item${item.danger ? ' is-danger' : ''}`}
            onPointerMove={() => setActive(i)}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
          >
            <span className="pk-menu__label">{item.label}</span>
            {item.hint && <span className="pk-menu__hint">{item.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}
