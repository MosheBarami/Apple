// Shell state shared between the rail and whatever route is mounted beside it.
//
// Two things genuinely cross that boundary:
//
//   1. the rail's own presentation — the mobile overlay and the desktop
//      collapse toggle, both owned by the shell;
//   2. Checkpoints, which the reference puts in BOTH the foot of the rail and
//      the conversation header. The drawer itself belongs to the workspace
//      route, because only the workspace knows which project's checkpoints are
//      being shown. So the workspace registers an opener here and the rail
//      calls it. When no workspace is mounted there is nothing to open, and the
//      rail card says so rather than pretending.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const COLLAPSE_KEY = 'apple.rail.collapsed';

export interface Shell {
  /** The rail as an overlay on narrow viewports. */
  railOpen: boolean;
  openRail: () => void;
  closeRail: () => void;
  /** The rail collapsed to an icon strip on wide viewports. */
  railCollapsed: boolean;
  toggleRailCollapsed: () => void;
  /** Null when no route has offered checkpoints — the control is then inert. */
  openCheckpoints: (() => void) | null;
  registerCheckpoints: (open: (() => void) | null) => void;
}

const ShellContext = createContext<Shell | null>(null);

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readCollapsed);
  const [openCheckpoints, setOpenCheckpoints] = useState<(() => void) | null>(null);

  // These have to keep a stable identity: consumers put them in effect
  // dependency arrays (closing the rail on navigation, for one), and a fresh
  // function on every state change would re-run those effects and slam the
  // rail shut the instant it opened.
  const openRail = useCallback(() => setRailOpen(true), []);
  const closeRail = useCallback(() => setRailOpen(false), []);

  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((v) => {
      const next = !v;
      try {
        window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* storage unavailable — the preference simply does not persist */
      }
      return next;
    });
  }, []);

  // Stored in state as a thunk, so a function value is not mistaken for a
  // lazy-initialiser by setState.
  const registerCheckpoints = useCallback((open: (() => void) | null) => {
    setOpenCheckpoints(() => open);
  }, []);

  const value = useMemo<Shell>(
    () => ({
      railOpen,
      openRail,
      closeRail,
      railCollapsed,
      toggleRailCollapsed,
      openCheckpoints,
      registerCheckpoints,
    }),
    [railOpen, openRail, closeRail, railCollapsed, toggleRailCollapsed, openCheckpoints, registerCheckpoints],
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): Shell {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside <ShellProvider>');
  return ctx;
}

/**
 * Lend the shell an opener for the Checkpoints drawer for as long as the
 * calling route is mounted.
 */
export function useProvideCheckpoints(open: (() => void) | null) {
  const { registerCheckpoints } = useShell();
  useEffect(() => {
    registerCheckpoints(open);
    return () => registerCheckpoints(null);
  }, [registerCheckpoints, open]);
}
