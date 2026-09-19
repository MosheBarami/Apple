/**
 * Personal settings that belong to a DEVICE, and what each one resolves to.
 *
 * Four of these already existed as separate ad-hoc reads of `localStorage` — the theme, the reading
 * direction, the rail collapse, the tour progress — each with its own key, its own parse and its own
 * idea of what a bad value means. This is the vocabulary for the rest, and it is one object with one
 * key so that "reset my settings" is a thing that can be implemented at all.
 *
 * Three rules, each of which has a failure behind it:
 *
 *   * A STORED PREFERENCE IS PARSED STATE. Everything here arrives as `unknown` — from a blob
 *     written by an older build, from a private window that returns null, from someone editing
 *     devtools. Every field is validated against an allowlist and falls back PER FIELD, so one bad
 *     value cannot discard the other five.
 *
 *   * A TIME ZONE IS VALIDATED BEFORE IT IS STORED, NOT WHEN IT IS RENDERED. `Intl.DateTimeFormat`
 *     THROWS a RangeError on an unknown zone. A zone read straight out of storage into a formatter
 *     is an exception thrown inside render, on every screen that shows a timestamp, for a user who
 *     cannot get back to the settings page to undo it — the whole app, bricked by one string.
 *
 *   * 'system' IS RESOLVED IN JAVASCRIPT, NOT LEFT TO CSS. The obvious implementation of "follow the
 *     OS" is to remove the `data-theme` attribute and let the stylesheets' `prefers-color-scheme`
 *     blocks decide. That works for `styles.css`, which is written light-first with dark under a
 *     media query — and it does NOT work for `styles/workspace.css`, whose `.gx` block is dark by
 *     default with light only under `:root[data-theme='light']` and no media query at all. Removing
 *     the attribute on a light-mode machine would produce a light shell around a dark workspace.
 *     So the attribute is ALWAYS present and always explicit; what 'system' changes is who decides
 *     its value.
 */

/* ---------------------------------------------------------------- vocabulary --- */

export const APPEARANCES = ['system', 'dark', 'light'] as const;
export type Appearance = (typeof APPEARANCES)[number];

export const MOTIONS = ['system', 'reduced', 'full'] as const;
export type MotionPref = (typeof MOTIONS)[number];

export const HOUR_CYCLES = ['system', 'h12', 'h23'] as const;
export type HourCycle = (typeof HOUR_CYCLES)[number];

/**
 * Regional formatting, as an allowlist of locales rather than a free-text BCP-47 field.
 *
 * Same reasoning as the worker's `LANGUAGES`: an arbitrary tag reaches `Intl` and a handful of them
 * reach a formatter that does not behave the way the settings screen promised. These are the
 * regions this product has users in, and each one is a real, distinct set of conventions —
 * en-US and en-GB differ on date order, de-DE and en-US differ on decimal separators.
 */
export const REGIONS = [
  'system',
  'en-US',
  'en-GB',
  'en-AU',
  'de-DE',
  'fr-FR',
  'es-ES',
  'pt-BR',
  'ru-RU',
  'ja-JP',
  'ko-KR',
  'zh-CN',
  'he-IL',
] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_NAMES: Readonly<Record<Region, string>> = {
  system: 'Match my device',
  'en-US': 'English (United States)',
  'en-GB': 'English (United Kingdom)',
  'en-AU': 'English (Australia)',
  'de-DE': 'German (Germany)',
  'fr-FR': 'French (France)',
  'es-ES': 'Spanish (Spain)',
  'pt-BR': 'Portuguese (Brazil)',
  'ru-RU': 'Russian (Russia)',
  'ja-JP': 'Japanese (Japan)',
  'ko-KR': 'Korean (Korea)',
  'zh-CN': 'Chinese (China)',
  'he-IL': 'Hebrew (Israel)',
};

// A "default project view" preference was drafted here and REMOVED before it shipped, which is
// worth a note so the next person does not re-add it. `routes/workspace.tsx` opens with the words
// "One lane, not three": the work surface and the context rail were deliberately taken out as
// permanent columns, and what the agent produces now appears inline in the conversation. There is
// no second view to land on, so the setting would have stored a value nothing reads — a control
// that moves. It needs a product decision (bring a second surface back) before it can be a
// preference.

/**
 * Which key sends the message.
 *
 * 'enter' is what shipped: Enter sends, Shift+Enter makes a new line. 'mod-enter' is the editor
 * convention: Enter makes a new line and ⌘/Ctrl+Enter sends. People are genuinely split on this,
 * and prompts here are long enough that the split is not academic.
 *
 * The DEFECT this setting closes is not the missing choice. `SHORTCUTS.send` declared ⌘Enter and
 * the shortcuts dialog rendered ⌘↵, while the composer hand-matched a bare Enter and nothing
 * anywhere called `matchesShortcut` with that record — the help advertised a chord that did
 * nothing. Both halves now read one binding derived from this field.
 */
export const SEND_KEYS = ['enter', 'mod-enter'] as const;
export type SendKey = (typeof SEND_KEYS)[number];

export const SYSTEM = 'system';

export interface Prefs {
  appearance: Appearance;
  motion: MotionPref;
  region: Region;
  hourCycle: HourCycle;
  /** An IANA zone name, or 'system' for whatever the browser is set to. */
  timeZone: string;
  sendKey: SendKey;
}

export const DEFAULT_PREFS: Readonly<Prefs> = Object.freeze({
  appearance: 'dark',
  motion: 'system',
  region: 'system',
  hourCycle: 'system',
  timeZone: 'system',
  // What the composer has always done. Changing the default would rewrite the muscle memory of
  // everyone already using the product, which is a worse failure than the inconsistency fixed here.
  sendKey: 'enter',
});

const inList = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export const isAppearance = (v: unknown): v is Appearance => inList(APPEARANCES, v);
export const isMotionPref = (v: unknown): v is MotionPref => inList(MOTIONS, v);
export const isHourCycle = (v: unknown): v is HourCycle => inList(HOUR_CYCLES, v);
export const isRegion = (v: unknown): v is Region => inList(REGIONS, v);
export const isSendKey = (v: unknown): v is SendKey => inList(SEND_KEYS, v);

/**
 * Is this a zone the runtime can actually format in?
 *
 * Asked by CONSTRUCTING a formatter, not by matching a pattern: the set of valid zones is the
 * runtime's, it changes with the ICU data, and `Australia/Eucla` is as real as `Europe/London`
 * while `Europe/Nowhere` matches every regex anyone would write for this.
 */
export function isTimeZone(v: unknown): boolean {
  if (typeof v !== 'string' || v === '') return false;
  if (v === SYSTEM) return true;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: v });
    return true;
  } catch {
    return false;
  }
}

/**
 * A short list of zones for the picker, plus whatever the device is actually set to.
 *
 * Not the full 400-entry IANA list: a select with 400 options is a worse experience than the
 * browser default it replaces. Anything outside this list that is already stored still WORKS —
 * `isTimeZone` accepts it — it simply is not offered here.
 */
export const COMMON_TIME_ZONES: readonly string[] = [
  'Pacific/Auckland',
  'Australia/Sydney',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Jerusalem',
  'Europe/Moscow',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/London',
  'America/Sao_Paulo',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'Pacific/Honolulu',
  'UTC',
];

/* ------------------------------------------------------------- normalisation --- */

/**
 * Turn anything at all into a usable Prefs.
 *
 * PER-FIELD FALLBACK, deliberately. The tempting implementation — validate the whole object, and
 * return the defaults if anything is wrong — means that one stale field written by a previous build
 * silently resets the five settings the user actually configured. They would never find out why.
 */
export function normalisePrefs(raw: unknown): Prefs {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    appearance: isAppearance(o.appearance) ? o.appearance : DEFAULT_PREFS.appearance,
    motion: isMotionPref(o.motion) ? o.motion : DEFAULT_PREFS.motion,
    region: isRegion(o.region) ? o.region : DEFAULT_PREFS.region,
    hourCycle: isHourCycle(o.hourCycle) ? o.hourCycle : DEFAULT_PREFS.hourCycle,
    timeZone: isTimeZone(o.timeZone) ? (o.timeZone as string) : DEFAULT_PREFS.timeZone,
    sendKey: isSendKey(o.sendKey) ? o.sendKey : DEFAULT_PREFS.sendKey,
  };
}

/** Is this the untouched default, field for field? What the reset button greys itself out on. */
export function isDefaultPrefs(p: Prefs): boolean {
  return (Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]).every((k) => p[k] === DEFAULT_PREFS[k]);
}

/** Which settings this person has actually changed — named, so the reset dialog can list them. */
export function changedPrefs(p: Prefs): (keyof Prefs)[] {
  return (Object.keys(DEFAULT_PREFS) as (keyof Prefs)[]).filter((k) => p[k] !== DEFAULT_PREFS[k]);
}

export const PREF_LABELS: Readonly<Record<keyof Prefs, string>> = {
  appearance: 'Appearance',
  motion: 'Motion',
  region: 'Regional formatting',
  hourCycle: 'Clock',
  timeZone: 'Time zone',
  sendKey: 'Send with',
};

/* ----------------------------------------------------------------- storage --- */

export const PREFS_KEY = 'apple.prefs.v1';

/**
 * Interface sound belongs to the same device-level preference family as the
 * settings blob, but is kept in its own key. The sound control lives on the
 * run card rather than in Settings, and adding an invisible field to `Prefs`
 * would make the Settings search promise a control it cannot render.
 *
 * The default is deliberately on: the browser still cannot make a sound
 * until `interface-sound.ts` receives a user gesture and unlocks its audio
 * context. This records the user's choice without treating an autoplay
 * restriction as if the preference were muted.
 */
export const SOUND_PREF_KEY = 'apple.interface-sound.v1';
export const DEFAULT_SOUND_ENABLED = true;

export function isSoundEnabled(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/** Read the card's sound choice, failing open to the product default. */
export function readSoundEnabled(): boolean {
  if (typeof window === 'undefined') return DEFAULT_SOUND_ENABLED;
  try {
    const raw = window.localStorage.getItem(SOUND_PREF_KEY);
    if (raw === null) return DEFAULT_SOUND_ENABLED;
    const value: unknown = JSON.parse(raw);
    return isSoundEnabled(value) ? value : DEFAULT_SOUND_ENABLED;
  } catch {
    /* private window, blocked storage, or a malformed value */
    return DEFAULT_SOUND_ENABLED;
  }
}

/** Persist only a real boolean; callers cannot accidentally store a truthy string. */
export function writeSoundEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, JSON.stringify(enabled === true));
  } catch {
    /* storage unavailable — the choice still holds for this render */
  }
}

/**
 * The key the theme used before this module existed.
 *
 * Read once, on the first load after this ships, so that someone who chose light six months ago
 * does not get dropped back to whatever their OS says. A migration that silently discards a
 * preference is indistinguishable, from the user's chair, from the product forgetting them.
 */
export const LEGACY_THEME_KEY = 'apple-theme';

export function readPrefs(): Prefs {
  let stored: unknown = null;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (raw) stored = JSON.parse(raw);
  } catch {
    /* private window, blocked storage, or a blob that is not JSON */
  }
  const prefs = normalisePrefs(stored);
  if (stored === null || typeof stored !== 'object') {
    try {
      const legacy = window.localStorage.getItem(LEGACY_THEME_KEY);
      if (legacy === 'light' || legacy === 'dark') prefs.appearance = legacy;
    } catch {
      /* same */
    }
  }
  return prefs;
}

export function writePrefs(prefs: Prefs): void {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(normalisePrefs(prefs)));
  } catch {
    /* storage unavailable — the choice holds for this session and no longer */
  }
}

/**
 * Put every setting back to its default.
 *
 * REMOVES the legacy key too. Leaving it behind would mean the next `readPrefs` on a fresh blob
 * resurrects the old theme — a reset that does not reset, discovered only by the person who asked
 * for one.
 */
export function resetPrefs(): Prefs {
  try {
    window.localStorage.removeItem(PREFS_KEY);
    window.localStorage.removeItem(LEGACY_THEME_KEY);
    window.localStorage.removeItem(SOUND_PREF_KEY);
  } catch {
    /* nothing to remove if we could not have written it */
  }
  return { ...DEFAULT_PREFS };
}

/* --------------------------------------------------------------- resolution --- */

/**
 * What appearance to actually paint.
 *
 * `systemPrefersDark` is passed in rather than read here so this stays a pure function — the
 * `matchMedia` call belongs to the provider, and this is the part worth testing.
 */
export function resolveAppearance(appearance: unknown, systemPrefersDark: unknown): 'dark' | 'light' {
  if (appearance === 'dark' || appearance === 'light') return appearance;
  // Only a literal `true` is a yes; `matchMedia` on an engine that does not support the query
  // returns `{ matches: false }`, and an undefined read must not be truthy either way.
  return systemPrefersDark === true ? 'dark' : 'light';
}

/**
 * Should motion be suppressed?
 *
 * 'system' defers to the OS, which is what the product already did everywhere. The other two are an
 * OVERRIDE, and the 'full' direction matters as much as the 'reduced' one: a machine that reports
 * reduced-motion for a reason that has nothing to do with this user — a locked-down corporate
 * image, a remote session — currently leaves them with no way to turn the interface's motion back
 * on.
 */
export function resolveReducedMotion(motion: unknown, systemPrefersReduced: unknown): boolean {
  if (motion === 'reduced') return true;
  if (motion === 'full') return false;
  return systemPrefersReduced === true;
}

/** The locale to format in, or undefined to mean "whatever the browser is set to". */
export function resolveLocale(region: unknown): string | undefined {
  return isRegion(region) && region !== SYSTEM ? region : undefined;
}

/** The zone to format in, or undefined for the browser's own. Never an unvalidated string. */
export function resolveTimeZone(timeZone: unknown): string | undefined {
  if (typeof timeZone !== 'string' || timeZone === SYSTEM) return undefined;
  return isTimeZone(timeZone) ? timeZone : undefined;
}

/**
 * true for a 12-hour clock, false for 24, undefined to let the locale decide.
 *
 * `undefined` is a real third answer and not a missing one: `Intl` treats an explicit `hour12:
 * false` differently from an absent one in some locales, and more importantly "whatever my region
 * does" is what most people want and what 'system' means.
 */
export function resolveHour12(hourCycle: unknown): boolean | undefined {
  if (hourCycle === 'h12') return true;
  if (hourCycle === 'h23') return false;
  return undefined;
}
