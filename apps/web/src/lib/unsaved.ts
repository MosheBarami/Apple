// The guard for work that exists nowhere but in a component's state.
//
// WHAT IS ALREADY SAFE, AND IS NOT THIS FILE'S BUSINESS. The composer draft is persisted by
// lib/draft.ts: it survives a reload and a route change and is cleared only once the message has
// actually left. Anything that round-trips to the server is likewise recoverable.
//
// WHAT WAS NOT. The memory panel and the instructions panel hold a rewritten text in a `dirty`
// textarea and nothing else. Closing the tab on one took it with no warning and no way back.
//
// ARMED ONLY WHILE THERE IS SOMETHING TO LOSE. A beforeunload listener that is always attached
// asks the browser to interrupt every reload; people learn within days to dismiss the dialog
// without reading it, and it then fails on the one occasion it was for. So the listener goes on
// when `dirty` turns true and comes off the moment it turns false.
//
// WHAT THIS DOES NOT DO, said here rather than left to be assumed. It does not intercept in-app
// navigation. react-router's useBlocker requires a data router and this app mounts
// <BrowserRouter> (app.tsx); converting the router for this would be a large change with a lot
// of surface. Separately, the memory and instructions drawers DO abandon their edits when closed,
// deliberately — see the comment on that Drawer in routes/workspace.tsx. The gap this closes is
// the one with no recourse at all: the tab going away.
import { useEffect } from 'react';

/** The event a beforeunload listener is handed, as far as this needs it. */
export interface BeforeUnloadLike {
  preventDefault(): void;
  returnValue: unknown;
}

/**
 * The slice of `window` this uses.
 *
 * Declared as a parameter rather than reached for globally so the mechanism can be driven
 * directly — a guard whose only proof is "the source contains addEventListener" is not observed.
 */
export interface UnloadTarget {
  addEventListener(type: 'beforeunload', fn: (e: BeforeUnloadLike) => void): void;
  removeEventListener(type: 'beforeunload', fn: (e: BeforeUnloadLike) => void): void;
}

/** Attach the warning. Returns the disarm, which removes the very listener it added. */
export function armUnloadWarning(target: UnloadTarget): () => void {
  const warn = (e: BeforeUnloadLike) => {
    // BOTH halves, because browsers do not agree. Chrome and Firefox act on preventDefault;
    // older engines act only on a non-null returnValue. Doing one of the two produces a guard
    // that quietly does nothing in half the browsers, which is worse than none at all, because
    // it was tested once somewhere it worked. The string is never shown — every browser
    // substitutes its own wording — so there is none to write.
    e.preventDefault();
    e.returnValue = '';
  };
  target.addEventListener('beforeunload', warn);
  return () => target.removeEventListener('beforeunload', warn);
}

/**
 * Warn before the tab closes while `dirty` is true.
 *
 * Call it unconditionally with the panel's own dirty flag; it arms and disarms itself.
 */
export function useUnsavedGuard(dirty: boolean): void {
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;
    return armUnloadWarning(window as unknown as UnloadTarget);
  }, [dirty]);
}
