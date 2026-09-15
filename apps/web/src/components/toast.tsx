// The toast stack — the RENDERER. Every decision it makes lives in ./toast-model.ts, and the
// reasons are there: repeats coalesce instead of stacking, a row carrying an Undo is never the one
// a cap discards, and a row whose deadline is unreadable leaves rather than becoming furniture.
//
// The provider that came before armed one `window.setTimeout` per toast at the moment the toast was
// created. That is why a repeat could not extend an existing row's life — the deadline had already
// been closed over. One sweep on an interval replaces them all, and it only runs while there is
// something on screen to sweep.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  admitToast,
  sweepToasts,
  toastLive,
  toastRole,
  type ToastAction,
  type ToastItem,
  type ToastKind,
} from './toast-model';

export type { ToastKind, ToastAction };

export interface ToastOptions {
  /**
   * One thing the user can do about it, right here.
   *
   * Reserved for offers that expire — an Undo, mostly. Anything still true a minute from now
   * belongs on the surface it concerns, not in a box that is about to disappear.
   */
  action?: ToastAction | null;
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
    setToasts((list) => admitToast(list, { id, kind, message, action: options?.action ?? null }, Date.now()));
  }, []);

  // One timer for the whole stack, and none at all while it is empty — an interval ticking four
  // times a second behind an idle app is a battery cost for nothing.
  const idle = toasts.length === 0;
  useEffect(() => {
    if (idle) return;
    const timer = window.setInterval(() => setToasts((list) => sweepToasts(list, Date.now())), SWEEP_MS);
    return () => window.clearInterval(timer);
  }, [idle]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" aria-atomic="false">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast-${t.kind}`}
            role={toastRole(t.kind)}
            aria-live={toastLive(t.kind)}
          >
            <span className="toast-dot" aria-hidden="true" />
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
            <button type="button" className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss notification">
              ×
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
