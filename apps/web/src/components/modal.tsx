// The dialog every other dialog in this product is built from: one focus trap, one Escape, one
// backdrop, one entrance, one close. Twelve surfaces render through it — delete a project, change a
// plan, pair Studio, get help, read the shortcuts — and the whole point of there being one is that
// none of them can arrive differently from the others. The chrome is in ./modal.css, which the
// command palette imports too, because the palette is a dialog and was drawn as if it were not.
import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon, PATH } from './ws/primitives';
import { reducedMotion, spring } from './picks/settings/motion';
import './modal.css';
import './picks/settings/dialog-motion.css';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
  /** When true the overlay/Escape do not close (e.g. mid-mutation). */
  locked?: boolean;
  /**
   * A dialog that interrupts to warn — a delete, a sign-out everywhere. It is announced as an
   * `alertdialog` and tilts in (picks: Animate UI "Alert Dialog") instead of rising.
   */
  alert?: boolean;
}

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/**
 * The elements inside `panel` a Tab can actually land on.
 *
 * The bare selector is not enough and each exclusion below is a way the trap breaks in practice.
 * A union containing `[tabindex]` re-admits a disabled button that also carries one, so Tab lands
 * on a control that cannot be pressed. `aria-disabled` is the same refusal written for assistive
 * technology and has to be honoured the same way. An element inside a collapsed <details> or a
 * closed branch still matches the selector and still has no box, so `getClientRects()` is what
 * distinguishes "present" from "reachable" — `offsetParent`, which this used to test, is null for
 * anything `position:fixed` and would exclude a control that is plainly on screen.
 */
function focusableIn(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((node) => {
    if (node.tabIndex < 0 || node.matches(':disabled,[aria-disabled="true"]')) return false;
    if (node.closest('[inert],[hidden]') || node.getClientRects().length === 0) return false;
    const { visibility } = getComputedStyle(node);
    return visibility !== 'hidden' && visibility !== 'collapse';
  });
}

/* --------------------------------------------------------------- holding the page --- */

// One counter for every overlay on screen, because two of them can be: ⌘K opens over an open
// dialog, and whichever closed first would otherwise hand the page back while the other is still
// up. The page is released only when the last overlay goes.
let lockDepth = 0;
let lockRestore: { overflow: string; pad: string } | null = null;

/**
 * Stop the page scrolling behind an overlay.
 *
 * A dialog that lets the document move under it is the clearest way to make a modal feel like a
 * box drawn on the page rather than something in front of it — and on a phone, where the scroll
 * chains straight through the backdrop, it is how a reader loses the dialog entirely.
 *
 * The padding is not decoration. Hiding a classic scrollbar widens the viewport by its width, and
 * every fixed thing on screen jumps that far sideways at the moment the dialog opens. Platforms
 * with overlay scrollbars measure zero here and pay nothing.
 */
export function useOverlayScrollLock(active = true): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    lockDepth += 1;
    if (lockDepth === 1) {
      const root = document.documentElement;
      const gap = window.innerWidth - root.clientWidth;
      lockRestore = { overflow: root.style.overflow, pad: document.body.style.paddingInlineEnd };
      root.style.overflow = 'hidden';
      if (gap > 0) document.body.style.paddingInlineEnd = `${gap}px`;
    }
    return () => {
      lockDepth -= 1;
      if (lockDepth === 0 && lockRestore) {
        document.documentElement.style.overflow = lockRestore.overflow;
        document.body.style.paddingInlineEnd = lockRestore.pad;
        lockRestore = null;
      }
    };
  }, [active]);
}

export function Modal({ title, onClose, children, wide, locked, alert }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);

  useOverlayScrollLock();

  /*
   * THE ENTRANCE AND THE EXIT (picks: Motion "Modal dialog" and Animate UI "Alert Dialog", both
   * re-implemented natively — Motion is not installed). The panel arrives on a spring: a little
   * larger-from-smaller, a few pixels of rise and a blur that clears; an alert tilts forward from
   * a slight backward lean instead. Both are the Web Animations API with a spring sampled into a
   * CSS linear() easing (./picks/settings/motion). Reduced motion keeps the CSS fade only.
   */
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel || reducedMotion() || typeof panel.animate !== 'function') return;
    panel.classList.add('pk-dialog--sprung');
    const s = alert ? spring(260, 20) : spring(340, 28);
    panel.animate(
      alert
        ? [
            { opacity: 0, transform: 'perspective(900px) rotateX(-14deg) translate3d(0,18px,0) scale(.96)', filter: 'blur(4px)' },
            { opacity: 1, transform: 'none', filter: 'none' },
          ]
        : [
            { opacity: 0, transform: 'translate3d(0,14px,0) scale(.94)', filter: 'blur(6px)' },
            { opacity: 1, transform: 'none', filter: 'none' },
          ],
      { duration: s.duration, easing: s.easing },
    );
    // The entrance plays once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Close from the dialog's own paths (Escape, the backdrop, ×) — it leaves before it goes. */
  const requestClose = () => {
    if (closingRef.current) return;
    const panel = panelRef.current;
    const overlay = overlayRef.current;
    if (!panel || !overlay || reducedMotion() || typeof panel.animate !== 'function') {
      onClose();
      return;
    }
    closingRef.current = true;
    const veil = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 170, easing: 'ease-in', fill: 'forwards' });
    const out = panel.animate(
      [
        { opacity: 1, transform: 'none', filter: 'none' },
        alert
          ? { opacity: 0, transform: 'perspective(900px) rotateX(10deg) translate3d(0,10px,0) scale(.97)', filter: 'blur(3px)' }
          : { opacity: 0, transform: 'translate3d(0,8px,0) scale(.96)', filter: 'blur(4px)' },
      ],
      { duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards' },
    );
    const done = () => {
      onClose();
      // A caller may decline to close (a parent that keeps the dialog while something finishes).
      // Then the dialog must come BACK, not stay mounted at opacity 0 holding the focus trap.
      requestAnimationFrame(() => {
        if (!panel.isConnected) return;
        out.cancel();
        veil.cancel();
        closingRef.current = false;
      });
    };
    out.onfinish = done;
  };

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    // A CHILD THAT ASKED FOR FOCUS KEEPS IT. `autoFocus` on the typed-confirm field is applied when
    // that input mounts, and a parent's effect runs after its children's — so this used to reach in
    // and take the focus back to the close button, leaving the caret nowhere and the one field the
    // dialog exists for unfocused. Otherwise the panel itself takes it, which is what makes a
    // screen reader announce the dialog and its title before anything inside it.
    if (panel && !panel.contains(document.activeElement)) panel.focus();
    return () => {
      restoreRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !locked) {
        e.stopPropagation();
        requestClose();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = focusableIn(panelRef.current);
        if (nodes.length === 0) {
          // Nothing to move to, so Tab must not leave: a dialog with no controls is still modal.
          e.preventDefault();
          panelRef.current.focus();
          return;
        }
        const first = nodes[0]!;
        const last = nodes[nodes.length - 1]!;
        // Focus already outside the panel — it starts on the panel itself, and a control can be
        // removed or disabled while it holds focus. Without this the trap has no way back in and
        // the next Tab walks into the page behind the dialog.
        if (!nodes.includes(document.activeElement as HTMLElement)) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, locked]);

  return (
    <div
      ref={overlayRef}
      className="modal-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !locked) requestClose();
      }}
    >
      <div
        ref={panelRef}
        className={`modal-panel${wide ? ' modal-wide' : ''}${alert ? ' pk-dialog--alert' : ''}`}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
      >
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          {/* The same glyph and the same 38px box as the rail's close, so the gesture is learned
              once. `title` carries the reason it refuses while the dialog is locked — a control
              that greys out without saying why is read as a bug rather than as a wait. */}
          <button
            type="button"
            className="gx-icon-btn modal-close"
            onClick={requestClose}
            aria-label="Close dialog"
            title={locked ? 'Finishing — this closes when the change is done' : 'Close'}
            disabled={locked}
          >
            <Icon d={PATH.close} size={17} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
