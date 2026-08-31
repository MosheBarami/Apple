// Shared workspace primitives: popover, drawer, and the small icon set.
//
// Deliberately few. Every surface in the workspace that needs a floating menu
// uses Popover, and everything that needs a side panel uses Drawer — so
// keyboard handling, focus return and dismissal are written once and behave
// identically everywhere.
import { useEffect, useRef, type ReactNode } from 'react';

/* -------------------------------------------------------------- icons ---- */

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const PATH = {
  plus: 'M12 5v14M5 12h14',
  chevronRight: 'M9 6l6 6-6 6',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-1 5.8V16a3 3 0 0 0 4 2.8M15 4a3 3 0 0 1 3 3 3 3 0 0 1 1 5.8V16a3 3 0 0 1-4 2.8M12 4v15',
  close: 'M6 6l12 12M18 6L6 18',
  send: 'M12 19V5M5 12l7-7 7 7',
  stop: 'M8 8h8v8H8z',
  menu: 'M4 7h16M4 12h16M4 17h16',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-3-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-3l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 3 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  gauge: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 3v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1',
  docs: 'M7 3h7l5 5v13H7zM14 3v5h5',
  shield: 'M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  camera: 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
};

/* ------------------------------------------------------------ popover ---- */

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  /** `up` opens above the trigger (composer), `down-right` below it (topbar). */
  placement?: 'up' | 'down-right';
  label: string;
  children: ReactNode;
}

/**
 * A floating menu that closes on Escape, on outside click, and when focus
 * leaves it. Focus returns to whatever opened it.
 */
export function Popover({ open, onClose, placement = 'up', label, children }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    // `capture` so a click on the trigger itself does not reopen after closing.
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      ref={ref}
      className={`gx-pop gx-pop--${placement}`}
      role="menu"
      aria-label={label}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- drawer ---- */

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * A right-hand side panel for things that used to occupy a permanent column:
 * checkpoints and project memory. Modal, so the conversation behind it is
 * inert while it is open.
 */
export function Drawer({ open, onClose, title, children }: DrawerProps) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the panel while it is modal.
      const focusable = panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <>
      <button type="button" className="gx-scrim" onClick={onClose} tabIndex={-1} aria-hidden="true" />
      <div
        ref={panel}
        className="gx-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="gx-drawer__head">
          <span className="gx-drawer__title">{title}</span>
          <button
            type="button"
            className="gx-icon-btn"
            onClick={onClose}
            aria-label={`Close ${title.toLowerCase()}`}
            style={{ marginLeft: 'auto' }}
          >
            <Icon d={PATH.close} />
          </button>
        </div>
        <div className="gx-drawer__body">{children}</div>
      </div>
    </>
  );
}
