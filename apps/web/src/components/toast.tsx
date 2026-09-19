// The toast stack — the RENDERER. Every decision it makes lives in ./toast-model.ts, and the
// reasons are there: repeats coalesce instead of stacking, a row carrying an Undo is never the one
// a cap discards, and a row whose deadline is unreadable leaves rather than becoming furniture.
//
// The provider that came before armed one `window.setTimeout` per toast at the moment the toast was
// created. That is why a repeat could not extend an existing row's life — the deadline had already
// been closed over. One sweep on an interval replaces them all, and it only runs while there is
// something on screen to sweep.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ICONS, NavIcon } from './glyphs';
import {
  admitToast,
  sweepToasts,
  toastLive,
  toastRole,
  type ToastAction,
  type ToastItem,
  type ToastKind,
} from './toast-model';
import './toast.css';

export type { ToastKind, ToastAction };

export interface ToastOptions {
  /**
   * One thing the user can do about it, right here.
   *
   * Reserved for offers that expire — an Undo, mostly. Anything still true a minute from now
   * belongs on the surface it concerns, not in a box that is about to disappear.
   */
  action?: ToastAction | null;
  /**
   * The identity of an ongoing event, so its row updates in place instead of stacking.
   *
   * For the one thing this stack could not previously do: progress. See toast-model's ToastInput.
   */
  key?: string | null;
}

const ToastContext = createContext<{ toast: (message: string, kind?: ToastKind, options?: ToastOptions) => void }>({
  toast: () => {},
});

/** How often the stack is checked for expiry. Fine enough that nothing overstays visibly. */
const SWEEP_MS = 250;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: ToastKind = 'info', options?: ToastOptions) => {
    const id = nextId.current++;
    setToasts((list) => admitToast(list, { id, kind, message, action: options?.action ?? null, key: options?.key ?? null }, Date.now()));
  }, []);

  //[[ REACHING FOR UNDO USED TO BE A RACE AGAINST THE SWEEP.
  //
  //   `ACTION_LIFETIME_MS` buys 9.5 seconds, which is generous until somebody moves the pointer
  //   onto the row, reads it, and has the button leave under their hand. The offer is gone and
  //   there is nothing on any other surface that can bring it back — that is what a toast action
  //   IS, per ToastOptions above.
  //
  //   So the clock holds while a pointer is over the stack or focus is inside it, and the time it
  //   was held is GIVEN BACK to every row when it is released. Skipping the sweep alone would not
  //   do: the deadlines would pass while paused and the whole stack would vanish the instant the
  //   pointer left, which is the same disappearing act with an extra step.
  //
  //   Arithmetic on `expiresAt` only, which toast-model documents as epoch ms. A non-finite
  //   deadline stays non-finite through the addition and is still swept, exactly as before.
  const [held, setHeld] = useState(false);
  const heldSince = useRef(0);

  const hold = useCallback(() => {
    if (!heldSince.current) heldSince.current = Date.now();
    setHeld(true);
  }, []);

  const release = useCallback(() => {
    const since = heldSince.current;
    heldSince.current = 0;
    setHeld(false);
    const paused = since ? Date.now() - since : 0;
    if (!(paused > 0)) return;
    setToasts((list) => list.map((t) => ({ ...t, expiresAt: t.expiresAt + paused })));
  }, []);

  // One timer for the whole stack, and none at all while it is empty — an interval ticking four
  // times a second behind an idle app is a battery cost for nothing.
  const idle = toasts.length === 0;
  useEffect(() => {
    if (idle || held) return;
    const timer = window.setInterval(() => setToasts((list) => sweepToasts(list, Date.now())), SWEEP_MS);
    return () => window.clearInterval(timer);
  }, [idle, held]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* onFocus/onBlur as well as the pointer pair: a keyboard user tabbing to Undo is holding
          the row just as deliberately as a pointer resting on it, and React's focus events bubble
          from the buttons inside. */}
      <div
        className="toast-stack"
        aria-live="polite"
        aria-atomic="false"
        onMouseEnter={hold}
        onMouseLeave={release}
        onFocus={hold}
        onBlur={release}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={toastRole(t.kind)}
            aria-live={toastLive(t.kind)}
          >
            <span className="toast-dot" aria-hidden="true" />
            {/* The message and its action share a wrapper so they wrap against each other rather
                than against the close button: at 375px an Undo drops under its own sentence and
                the dismiss target stays where it has always been, in the corner. */}
            <div className="toast-body">
              <span className="toast-msg">
                {t.message}
                {/* A row standing for four events must not look like one. */}
                {t.count > 1 && <span className="toast-count"> ×{t.count}</span>}
              </span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    t.action?.run();
                    // The offer is spent the moment it is taken; leaving the row up invites a second
                    // click on a button that can no longer do anything.
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </button>
              )}
            </div>
            {/* A stroked mark rather than the `×` character it used to be: at 13px the glyph sat
                off the optical centre of its own button and picked up the message's letter-spacing,
                so the one control on every toast was the least finished thing on it. */}
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              <NavIcon d={ICONS.close} size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
