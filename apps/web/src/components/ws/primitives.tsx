// Shared workspace primitives: popover, drawer, and the small icon set.
//
// Deliberately few. Every surface in the workspace that needs a floating menu
// uses Popover, and everything that needs a side panel uses Drawer — so
// keyboard handling, focus return and dismissal are written once and behave
// identically everywhere.
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/* -------------------------------------------------------------- icons ---- */

export function Icon({ d, size = 16 }: { d: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d={d} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Re-exported so every existing call site keeps working, and imported because this
// module draws with it too.
import { ICON_PATH } from '../icons';

export const PATH = ICON_PATH;

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onCloseRef.current();
    };
    document.addEventListener('keydown', onKey);
    // `capture` so a click on the trigger itself does not reopen after closing.
    document.addEventListener('mousedown', onDown, true);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown, true);
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [open]);

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
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current();
      if (e.key !== 'Tab' || !panel.current) return;
      // Keep Tab inside the panel while it is modal.
      const focusable = Array.from(panel.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter(node => {
        // A selector union can re-admit a disabled button through [tabindex]. :disabled also
        // covers fieldset descendants; a layout box alone does not establish visibility.
        if (node.tabIndex < 0 || node.matches(':disabled,[aria-disabled="true"]')
          || node.closest('[inert],[hidden]') || node.getClientRects().length === 0) return false;
        const visibility = getComputedStyle(node).visibility;
        return visibility !== 'hidden' && visibility !== 'collapse';
      });
      if (!focusable.length) {
        e.preventDefault();
        panel.current.focus();
        return;
      }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      // Recover from initial panel focus, a removed/disabled target, or focus already outside.
      if (!focusable.includes(document.activeElement as HTMLElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
      } else if (e.shiftKey && document.activeElement === first) {
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
  }, [open]);

  if (!open) return null;
  //[[ PORTALLED TO THE BODY, BECAUSE A MODAL TRAPPED IN A STACKING CONTEXT IS NOT MODAL.
  //
  //   Every Drawer is rendered from routes/workspace.tsx, inside `.gx-ws` — and `.gx-ws` is
  //   `position:relative; z-index:1`, which is a stacking context. So the scrim's z-index of 70 and
  //   the panel's 80 were never compared with anything outside the workspace: they competed as
  //   `.gx-ws`'s 1 against the navigation rail's 55, and lost.
  //
  //   MEASURED in Chromium with "Credits and clearance" open, `document.elementFromPoint`:
  //
  //     1440px  the nav rail is undimmed and fully clickable while an aria-modal dialog is open —
  //             the point at the centre of a rail row returns `span.studio-dock__label`
  //      375px  the rail has collapsed to a 44px button at x=12..56 and the drawer is full-bleed,
  //             so the button sits ON the drawer's own title: the point 4px into
  //             "Credits and clearance" returns `button.studio-navigation`, and the title reads
  //             "edits and clearance" because the first 27px of it are behind the button
  //
  //   `aria-modal="true"` and the focus trap above were already telling a screen reader and a
  //   keyboard that the rest of the page was inert while a pointer could still reach it. The panel
  //   is the same element with the same ref, so the trap, the Escape handler and the focus return
  //   are untouched; only where it paints changes. Modal does not need this because it is rendered
  //   from the shell, outside `.gx-ws` — which is exactly why nobody found this here. ]]
  return createPortal(
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
    </>,
    document.body,
  );
}
