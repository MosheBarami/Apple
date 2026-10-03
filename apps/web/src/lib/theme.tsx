// Appearance, motion and regional formatting — the React half of lib/prefs.ts.
//
// This file used to be the theme toggle and nothing else: two values, one localStorage key, and an
// effect that ALWAYS wrote an explicit `data-theme`. That last part is what made "follow my
// system" impossible rather than merely missing — the stylesheets carry
// `@media (prefers-color-scheme: dark)` blocks guarded as `:root:not([data-theme='light'])`, and an
// attribute that is always present means that guard can never be the thing that decides.
//
// The fix is NOT to stop writing the attribute. `styles/workspace.css` is dark-by-default with light
// only under `:root[data-theme='light']` and no media query at all, so removing the attribute on a
// light-mode machine would paint a light shell around a dark workspace. Instead 'system' is
// resolved here, from `matchMedia`, and the attribute is always explicit — which means the OS
// decides while the stylesheets keep the contract they were written against.
//
// `useTheme` keeps its old shape (`theme`, `setTheme`) so the account menu and the auth pages did
// not have to change; `theme` is now the RESOLVED value, which is what those call sites were
// already treating it as when they chose which icon to show.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DEFAULT_PREFS,
  readPrefs,
  resetPrefs as clearStoredPrefs,
  resolveAppearance,
  resolveReducedMotion,
  writePrefs,
  type Appearance,
  type Prefs,
} from './prefs.ts';
import { formatSettingsFrom, setFormatSettings } from './format.ts';

export type Theme = 'dark' | 'light';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/**
 * Subscribe to a media query.
 *
 * Guarded at every step because this runs before anything else on the page: `matchMedia` is absent
 * in a test renderer, `addEventListener` on a MediaQueryList is absent in older Safari, and an
 * exception thrown here takes the whole app down before the error boundary is mounted.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => {
    try {
      return window.matchMedia(query).matches === true;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(mq.matches === true);
    onChange();
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
    return;
  }, [query]);
  return matches;
}

interface PrefsState {
  prefs: Prefs;
  /** Change one setting. Persisted immediately — a settings screen with a Save button lies. */
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void;
  resetPrefs: () => void;
  /** What is actually painted right now: 'system' already resolved against the OS. */
  theme: Theme;
  /** Whether motion should be suppressed right now, preference and OS already combined. */
  reducedMotion: boolean;
  systemTheme: Theme;
}

const PrefsContext = createContext<PrefsState>({
  prefs: { ...DEFAULT_PREFS },
  setPref: () => {},
  resetPrefs: () => {},
  theme: 'dark',
  reducedMotion: false,
  systemTheme: 'dark',
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const systemPrefersDark = useMediaQuery(DARK_QUERY);
  const systemPrefersReduced = useMediaQuery(REDUCE_QUERY);

  const theme = resolveAppearance(prefs.appearance, systemPrefersDark);
  const reducedMotion = resolveReducedMotion(prefs.motion, systemPrefersReduced);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // A class rather than an attribute, so a stylesheet can say `.motion-reduced .thing` without
  // duplicating the whole `@media (prefers-reduced-motion)` block it already has. The OS branches
  // stay exactly as they are; this only adds the override.
  useEffect(() => {
    document.documentElement.classList.toggle('motion-reduced', reducedMotion);
  }, [reducedMotion]);

  // The formatters are called from far too many places to thread a context through, so the
  // resolved settings are pushed into that module whenever they change. Done in an effect rather
  // than during render because it is a write to module state.
  useEffect(() => {
    setFormatSettings(formatSettingsFrom(prefs));
  }, [prefs]);

  const setPref = useCallback(<K extends keyof Prefs>(key: K, value: Prefs[K]) => {
    setPrefs((current) => {
      const next = { ...current, [key]: value };
      writePrefs(next);
      return next;
    });
  }, []);

  const resetPrefs = useCallback(() => {
    setPrefs(clearStoredPrefs());
  }, []);

  const value = useMemo<PrefsState>(
    () => ({
      prefs,
      setPref,
      resetPrefs,
      theme,
      reducedMotion,
      systemTheme: systemPrefersDark ? 'dark' : 'light',
    }),
    [prefs, setPref, resetPrefs, theme, reducedMotion, systemPrefersDark],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

/**
 * The old two-value theme hook, kept.
 *
 * `setTheme` writes an EXPLICIT appearance, which is right: every caller of it is a toggle the user
 * just clicked, and clicking a toggle is choosing. 'system' is chosen on the settings page, where
 * there are three buttons and the third one says what it does.
 */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const { theme, setPref } = useContext(PrefsContext);
  return { theme, setTheme: (t: Theme) => setPref('appearance', t as Appearance) };
}

export function usePrefs(): PrefsState {
  return useContext(PrefsContext);
}

/** Whether to suppress motion, as the preference and the OS jointly decide. */
export function useReducedMotion(): boolean {
  return useContext(PrefsContext).reducedMotion;
}
