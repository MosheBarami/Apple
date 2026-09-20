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
// 'he' and 'iw' were removed on 2026-09-20 when the product stopped offering Hebrew. The set keeps
// every OTHER right-to-left language, because mirroring the interface for Arabic or Persian was
// never a Hebrew feature and taking it out would break languages the removal has nothing to do with.
const RTL_LANGS = new Set(['ar', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ku', 'ckb']);

/**
 * The languages the interface is actually WRITTEN IN. Today: English, and only English.
 *
 * THIS LIST IS THE WHOLE FIX. Direction used to be inferred from `navigator.languages` alone — what
 * the READER prefers — with no reference to what the interface can actually say. A reader whose
 * browser asks for a right-to-left language got a sign-in page that mirrored itself, right-aligned
 * its English sentences, moved every full stop to the left-hand end, and set that language on a
 * document written entirely in English: a screen reader was being told to read English words in
 * the wrong voice.
 *
 * Mirroring is correct for an interface written in an RTL language and wrong for an English one,
 * and the browser's language list cannot tell those apart because it is not a fact about this
 * interface. So the question is asked of both: mirror when the reader wants an RTL language AND
 * the interface has that language to give them.
 *
 * NOTHING ELSE IN THIS FILE CHANGES, and none of the logical-property work in the stylesheets is
 * wasted: add a tag here on the day its strings are translated and every mirror turns on at once.
 * An explicit choice still wins over this — somebody who deliberately picks RTL is telling us
 * something about themselves, not asking us to guess.
 */
export const UI_LANGUAGES: readonly string[] = ['en'];

const STORAGE_KEY = 'apple.dir';

export type Direction = 'ltr' | 'rtl';

/** `he-IL`, `he_IL` and `HE` all name the same language. */
function primarySubtag(tag: string): string {
  return tag.toLowerCase().split(/[-_]/)[0] ?? '';
}

/** Is this BCP-47 tag written right-to-left? `he-IL` and `he` must both count. */
export function isRtlLanguage(tag: string): boolean {
  return RTL_LANGS.has(primarySubtag(tag));
}

function storedDirection(): Direction | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'rtl' || v === 'ltr' ? v : null;
  } catch {
    return null;
  }
}

/**
 * The direction this browser should start in, before any user choice.
 *
 * `ui` is a parameter rather than a constant read inside so the RULE stays testable: the day the
 * interface is translated, the behaviour is proved by passing the new list, not by editing the
 * function and hoping.
 */
export function detectDirection(
  languages: readonly string[] = navigator.languages ?? [],
  ui: readonly string[] = UI_LANGUAGES,
): Direction {
  const list = languages.length ? languages : [navigator.language ?? 'en'];
  const uiRtl = new Set(ui.filter(isRtlLanguage).map(primarySubtag));
  if (uiRtl.size === 0) return 'ltr';
  return list.some((tag) => uiRtl.has(primarySubtag(tag))) ? 'rtl' : 'ltr';
}

/** The language this interface should declare itself to be in for a reader with these preferences. */
export function detectLanguage(
  languages: readonly string[] = navigator.languages ?? [],
  ui: readonly string[] = UI_LANGUAGES,
): string {
  const list = languages.length ? languages : [navigator.language ?? 'en'];
  const offered = new Map(ui.map((t) => [primarySubtag(t), t]));
  for (const tag of list) {
    const hit = offered.get(primarySubtag(tag));
    if (hit) return hit;
  }
  // Not a language we speak. Declare the one we DO speak rather than the one they asked for:
  // `lang` is a claim about the bytes on the page, not a preference.
  return ui[0] ?? 'en';
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
  // `lang` used to be derived from `dir` — rtl meant "he". That made it a restatement of the
  // layout rather than a claim about the words, and it labelled an all-English document Hebrew.
  el.setAttribute('lang', lang ?? detectLanguage());
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
