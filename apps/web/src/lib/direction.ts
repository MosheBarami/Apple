/**
 * Reading direction.
 *
 * The stylesheets were written with physical properties throughout — `padding-left`,
 * `border-right`, `text-align: left`, single-sided `left:` insets — and nothing ever set `dir`.
 * In that state a Hebrew interface does not merely look wrong, it reads wrong: labels sit on the
 * far side of their controls, and every icon that was placed "before" its text lands after it.
 *
 * The text-flow properties are now logical (`padding-inline-start` and friends), so the layout
 * mirrors correctly the moment `dir` is set. Symmetric insets (`left: 16%; right: 16%`) and
 * centring (`left: 50%` with a translate) were deliberately left physical: they are already
 * direction-neutral, and converting them would be churn that reads as progress.
 *
 * RESOLUTION ORDER, most specific first:
 *   1. an explicit user choice, persisted
 *   2. the browser's language list
 *   3. LTR
 *
 * `localStorage` is wrapped because it throws outright in a private window and in some embedded
 * webviews — a preference lookup must never be able to stop the app from rendering.
 */

/** Scripts written right-to-left, by ISO 639 primary subtag. */
const RTL_LANGS = new Set(['he', 'iw', 'ar', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku', 'ckb']);

const STORAGE_KEY = 'apple.dir';

export type Direction = 'ltr' | 'rtl';

/** Is this BCP-47 tag written right-to-left? `he-IL` and `he` must both count. */
export function isRtlLanguage(tag: string): boolean {
  const primary = tag.toLowerCase().split(/[-_]/)[0] ?? '';
  return RTL_LANGS.has(primary);
}

function storedDirection(): Direction | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'rtl' || v === 'ltr' ? v : null;
  } catch {
    return null;
  }
}

/** The direction this browser should start in, before any user choice. */
export function detectDirection(languages: readonly string[] = navigator.languages ?? []): Direction {
  const list = languages.length ? languages : [navigator.language ?? 'en'];
  return list.some(isRtlLanguage) ? 'rtl' : 'ltr';
}

export function resolveDirection(): Direction {
  return storedDirection() ?? detectDirection();
}

/**
 * Apply a direction to the document.
 *
 * Sets `lang` alongside `dir` because they answer different questions and both matter: `dir`
 * drives layout mirroring, while `lang` is what a screen reader uses to choose a voice and what
 * the browser uses for hyphenation. Setting one without the other gives a mirrored page read
 * aloud in the wrong language.
 */
export function applyDirection(dir: Direction, lang?: string): void {
  const el = document.documentElement;
  el.setAttribute('dir', dir);
  el.setAttribute('lang', lang ?? (dir === 'rtl' ? 'he' : 'en'));
}

export function setDirection(dir: Direction, lang?: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, dir);
  } catch {
    /* a preference that cannot be saved is still applied for this session */
  }
  applyDirection(dir, lang);
}

/** Wire direction at boot. Safe to call before React mounts. */
export function initDirection(): Direction {
  const dir = resolveDirection();
  applyDirection(dir);
  return dir;
}
