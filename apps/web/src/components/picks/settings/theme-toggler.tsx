// Changing theme wipes the new one in across the page instead of snapping.
//
// Pick: Animate UI "Theme Toggler Button" (MIT + Commons Clause — re-implemented, not copied). The
// upstream button cycles light / dark / system and reveals the new theme with a clip-path wipe. Here
// the wipe is the View Transitions API: the old page is a snapshot, the new theme is painted under
// it, and `::view-transition-new(root)` is uncovered left to right (see ./theme-toggler.css).
// Browsers without the API, and anyone asking for reduced motion, get the plain switch.
import { flushSync } from 'react-dom';
import type { Appearance } from '../../../lib/prefs';
import { usePrefs } from '../../../lib/theme';
import { reducedMotion } from './motion';
import './theme-toggler.css';

type StartViewTransition = (cb: () => void) => { finished: Promise<void> };

/** Run a theme change inside a wipe, when the browser can draw one. */
export function withThemeWipe(change: () => void): void {
  const start = (document as Document & { startViewTransition?: StartViewTransition }).startViewTransition;
  if (!start || reducedMotion()) {
    change();
    return;
  }
  const root = document.documentElement;
  root.classList.add('pk-theme-wipe');
  const t = start.call(document, () => {
    flushSync(change);
  });
  void t.finished.finally(() => root.classList.remove('pk-theme-wipe'));
}

const ORDER: Appearance[] = ['light', 'dark', 'system'];
const WORD: Record<Appearance, string> = { light: 'Light', dark: 'Dark', system: 'Auto' };

function Glyph({ mode }: { mode: Appearance }) {
  if (mode === 'light') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </svg>
    );
  }
  if (mode === 'dark') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="20" height="14" x="2" y="3" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </svg>
  );
}

/** A single button that cycles light → dark → match my device. */
export function ThemeToggler({ className }: { className?: string }) {
  const { prefs, setPref } = usePrefs();
  const current = prefs.appearance;
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length] ?? 'dark';
  return (
    <button
      type="button"
      className={`pk-theme-toggle${className ? ` ${className}` : ''}`}
      onClick={() => withThemeWipe(() => setPref('appearance', next))}
      aria-label={`Theme: ${WORD[current]}. Switch to ${next === 'system' ? 'match my device' : WORD[next].toLowerCase()}`}
      title={`Theme: ${WORD[current]}`}
    >
      <span key={current} className="pk-theme-toggle__icon">
        <Glyph mode={current} />
      </span>
      <span className="pk-theme-toggle__word">{WORD[current]}</span>
    </button>
  );
}
