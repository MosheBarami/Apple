// The command registry.
//
// Commands are CONTRIBUTED by whatever is on screen rather than listed centrally, because half of
// them only mean something in context: "Stop the run" needs the workspace's socket, "New
// checkpoint" needs a project. A central list would have to reach into every route to find out
// whether each command is currently possible, and would be wrong the moment a route changed.
//
// So a route calls `useCommands([...])` and its commands exist while it is mounted. The palette
// shows the union, in registration order, with global commands first because they were registered
// first — by the shell, which is always mounted.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { dedupeByTitle, type Command } from './command-match';

interface Registry {
  commands: Command[];
  register: (key: string, commands: Command[]) => void;
  unregister: (key: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}

const CommandContext = createContext<Registry | null>(null);

export function CommandProvider({ children }: { children: ReactNode }) {
  // A Map keyed by contributor: routes mount and unmount freely, and an array would need every
  // contributor to remove exactly what it added.
  const [groups, setGroups] = useState<Map<string, Command[]>>(() => new Map());
  const [open, setOpen] = useState(false);

  /**
   * BUILT ONCE, DELIBERATELY — and this is not a micro-optimisation, it is the difference between
   * the app idling and the app spinning.
   *
   * Both of these used to be rebuilt inside the `useMemo` below, whose deps include `groups`.
   * `useCommands` lists them in its effect's dependency array, so the cycle was: register →
   * `groups` changes → their identity changes → the effect re-runs → unregister, register →
   * `groups` changes → … For every contributor, forever, from the moment the shell mounted. React
   * caps it with "Maximum update depth exceeded" a few hundred times a second, which is why the
   * screen looked fine and the fan did not.
   *
   * An empty dependency list is safe because `setGroups` takes an UPDATER: neither of these reads
   * anything from the render that created it.
   */
  const register = useCallback((key: string, commands: Command[]) => {
    setGroups((prev) => {
      const next = new Map(prev);
      next.set(key, commands);
      return next;
    });
  }, []);

  const unregister = useCallback((key: string) => {
    setGroups((prev) => {
      if (!prev.has(key)) return prev; // no state change, no re-render
      const next = new Map(prev);
      next.delete(key);
      return next;
    });
  }, []);

  const value = useMemo<Registry>(
    () => ({
      // Insertion order is Map order, which is what keeps the palette's default list stable.
      commands: dedupeByTitle([...groups.values()].flat()),
      register,
      unregister,
      open,
      setOpen,
    }),
    [groups, open, register, unregister],
  );

  return <CommandContext.Provider value={value}>{children}</CommandContext.Provider>;
}


export function useCommandRegistry(): Registry {
  const ctx = useContext(CommandContext);
  if (!ctx) throw new Error('useCommandRegistry outside CommandProvider');
  return ctx;
}

/**
 * Contribute commands for as long as this component is mounted.
 *
 * `commands` is read on every render but only written to the registry when it CHANGES in a way
 * that matters — see below. Callers therefore do not need to memoise, which is the difference
 * between a hook people use correctly and one that quietly re-renders the app on every keystroke.
 */
export function useCommands(commands: Command[]): void {
  const { register, unregister } = useCommandRegistry();
  const key = useId();

  // Re-registering on every render would loop: register -> provider state changes -> re-render ->
  // register. The identity of `run` changes constantly (it closes over fresh props), and that is
  // fine — what matters for the LIST is which commands exist and how they present. So the effect
  // is keyed on the presentational shape, and the latest `run` is always reachable through a ref.
  const latest = useRef(commands);
  latest.current = commands;

  const shape = commands
    .map((c) => `${c.id}\0${c.title}\0${c.section}\0${c.enabled === false ? '0' : '1'}\0${c.why ?? ''}\0${c.hint ?? ''}\0${(c.keywords ?? []).join(',')}`)
    .join('\x01');

  useEffect(() => {
    register(
      key,
      latest.current.map((c) => ({
        ...c,
        // Dereferenced at call time, so a command registered three renders ago still runs against
        // today's state rather than a stale closure.
        run: () => latest.current.find((x) => x.id === c.id)?.run(),
      })),
    );
    return () => unregister(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `shape` is the meaningful identity
  }, [shape, key, register, unregister]);
}

/** Open and close the palette from anywhere. */
export function useCommandPalette() {
  const { open, setOpen } = useCommandRegistry();
  return { open, setOpen };
}

export type { Command };
