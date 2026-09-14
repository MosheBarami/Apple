// The keyboard map.
//
// One place, because the failure mode of scattered `if (e.metaKey && e.key === 'k')` checks is not
// that any single one is wrong — it is that two of them are right and they fight. That already
// happened here: ⌘K opened New chat, and ⌘K is also what every user in the world presses expecting
// a command palette.
//
// Two rules decided the bindings below, and both are about not fighting the browser:
//
//   * Never bind a plain ⌘/Ctrl + letter that the browser owns and users rely on. ⌘W, ⌘T, ⌘N, ⌘L,
//     ⌘R, ⌘F, ⌘P, ⌘S, ⌘Q. Some CAN be intercepted; intercepting them is how a web app becomes the
//     one that loses your tab.
//   * Prefer chords the platform has already taught people. ⌘K is a palette. ⌘/ is help. ⌘Enter
//     submits. Inventing a better mapping is a cost paid by every user, forever, to save one
//     decision now.
//
// No imports: the matcher is a predicate over a key event, and that is worth testing on its own.

export interface Shortcut {
  /** The `KeyboardEvent.key` this responds to, lowercased for letters. */
  key: string;
  /** Requires the platform's command modifier — ⌘ on Apple, Ctrl elsewhere. */
  mod?: boolean;
  shift?: boolean;
  alt?: boolean;
  /** What it does, in the user's words. Shown in the shortcuts list. */
  label: string;
}

export const SHORTCUTS = {
  palette: { key: 'k', mod: true, label: 'Open the command palette' },
  newProject: { key: 'n', mod: true, shift: true, label: 'New project' },
  // ⌘⇧N rather than ⌘N: ⌘N opens a browser window and cannot be taken without taking something
  // the user needed more.
  search: { key: 'f', mod: true, shift: true, label: 'Search this conversation' },
  // ⌘⇧F, because ⌘F is find-in-page and people use it on this very screen.
  send: { key: 'Enter', mod: true, label: 'Send' },
  stop: { key: 'Escape', label: 'Stop the run' },
  checkpoints: { key: 'b', mod: true, shift: true, label: 'Checkpoints' },
  help: { key: '/', mod: true, label: 'Keyboard shortcuts' },
  close: { key: 'Escape', label: 'Close' },
} as const satisfies Record<string, Shortcut>;

export type ShortcutName = keyof typeof SHORTCUTS;

/**
 * Is this the platform's command modifier?
 *
 * On Apple platforms that is ⌘ (`metaKey`); elsewhere it is Ctrl. Accepting EITHER everywhere would
 * mean Ctrl+K also fires on a Mac, where Ctrl+K is "delete to end of line" in every text field —
 * so an external-keyboard user editing a prompt would open the palette instead.
 */
export function isApplePlatform(hint: string = platformHint()): boolean {
  return /Mac|iPhone|iPad|iPod/i.test(hint);
}

/**
 * `navigator.platform` is deprecated and `userAgentData` is not in every browser, so both are
 * tried and the user agent is the last resort. Getting this wrong is not fatal — it costs the user
 * one wrong modifier — but it is wrong on every keystroke until they give up.
 */
function platformHint(): string {
  if (typeof navigator === 'undefined') return '';
  const uaData = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData;
  return uaData?.platform || navigator.userAgent || '';
}

export interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

export function matchesShortcut(e: KeyLike, s: Shortcut, apple: boolean = isApplePlatform()): boolean {
  // Compared case-insensitively: with Shift held, `key` is the uppercase letter.
  if (e.key.toLowerCase() !== s.key.toLowerCase()) return false;

  const mod = apple ? e.metaKey : e.ctrlKey;
  const otherMod = apple ? e.ctrlKey : e.metaKey;
  if (Boolean(s.mod) !== mod) return false;
  // The modifier that ISN'T this platform's command key must be absent, or ⌃⌘K would match ⌘K.
  if (otherMod) return false;
  if (Boolean(s.shift) !== e.shiftKey) return false;
  if (Boolean(s.alt) !== e.altKey) return false;
  return true;
}

const KEY_SYMBOL: Record<string, string> = {
  enter: '↵',
  escape: 'esc',
  arrowup: '↑',
  arrowdown: '↓',
  ' ': 'space',
};

/** How the chord is written on screen. ⌘⇧N on Apple, Ctrl+Shift+N elsewhere. */
export function shortcutLabel(s: Shortcut, apple: boolean = isApplePlatform()): string {
  const key = KEY_SYMBOL[s.key.toLowerCase()] ?? (s.key.length === 1 ? s.key.toUpperCase() : s.key);
  if (apple) {
    return `${s.mod ? '⌘' : ''}${s.shift ? '⇧' : ''}${s.alt ? '⌥' : ''}${key}`;
  }
  return [s.mod && 'Ctrl', s.shift && 'Shift', s.alt && 'Alt', key].filter(Boolean).join('+');
}

/**
 * Should this key event be ignored because the user is typing?
 *
 * A single-key shortcut fired while someone is composing a prompt is a bug that looks like data
 * loss. Chords with a command modifier are exempt — that is the point of the modifier — as is
 * Escape, which means "get me out of here" in a text field too.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
