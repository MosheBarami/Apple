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
//   3. New project, for the same reason in reverse. The create dialog belongs to
//      the dashboard, but ⌘⇧N and the palette's "New project" have to work from
//      inside a conversation. They used to navigate to `/` and stop there, which
//      left the user staring at the shelf with the dialog still unopened — a
//      command that does not do what its own title says. The dashboard lends the
//      shell an opener; off the dashboard the shell navigates there first and
//      the opener fires when it mounts.
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
  /**
   * Start a new project from anywhere. On the dashboard this opens the create
   * dialog directly; elsewhere it navigates to the dashboard and arms the
   * request, which the dashboard consumes as it mounts.
   */
  newProject: () => void;
  /** Null until the dashboard is mounted. */
  openNewProject: (() => void) | null;
  registerNewProject: (open: (() => void) | null) => void;
  /** True when a route asked for the dialog before one existed to open. */
  newProjectPending: boolean;
  clearNewProjectPending: () => void;
}

const ShellContext = createContext<Shell | null>(null);

function readCollapsed(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [railOpen, setRailOpen] = useState(false);
  const [railCollapsed, setRailCollapsed] = useState(readCollapsed);
  const [openCheckpoints, setOpenCheckpoints] = useState<(() => void) | null>(null);
  const [openNewProject, setOpenNewProject] = useState<(() => void) | null>(null);
  const [newProjectPending, setNewProjectPending] = useState(false);

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

  const registerNewProject = useCallback((open: (() => void) | null) => {
    setOpenNewProject(() => open);
  }, []);

  const clearNewProjectPending = useCallback(() => setNewProjectPending(false), []);

  // Reads `openNewProject` out of state rather than closing over it, so a caller
  // that captured this function before the dashboard mounted still reaches the
  // opener that exists by the time it fires.
  const newProject = useCallback(() => {
    setOpenNewProject((open) => {
      if (open) open();
      else setNewProjectPending(true);
      return open;
    });
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
      newProject,
      openNewProject,
      registerNewProject,
      newProjectPending,
      clearNewProjectPending,
    }),
    [
      railOpen,
      openRail,
      closeRail,
      railCollapsed,
      toggleRailCollapsed,
      openCheckpoints,
      registerCheckpoints,
      newProject,
      openNewProject,
      registerNewProject,
      newProjectPending,
      clearNewProjectPending,
    ],
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

/**
 * Lend the shell an opener for the create-project dialog, and honour a request
 * that arrived before this route existed.
 *
 * The pending flag is cleared as it is consumed rather than left set, or every
 * later visit to the dashboard would pop the dialog again on arrival.
 */
export function useProvideNewProject(open: (() => void) | null) {
  const { registerNewProject, newProjectPending, clearNewProjectPending } = useShell();

  useEffect(() => {
    registerNewProject(open);
    return () => registerNewProject(null);
  }, [registerNewProject, open]);

  useEffect(() => {
    if (!newProjectPending || !open) return;
    clearNewProjectPending();
    open();
  }, [newProjectPending, open, clearNewProjectPending]);
}
