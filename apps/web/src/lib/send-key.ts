// Which key sends the message — the BINDING half of the `sendKey` preference.
//
// THE DEFECT THIS CLOSES. `SHORTCUTS.send` declared `{ key: 'Enter', mod: true }` and the shortcuts
// dialog rendered it as ⌘↵, while the composer's own `onKeyDown` hand-matched
// `e.key === 'Enter' && !e.shiftKey` and sent on a BARE Enter. Nothing anywhere called
// `matchesShortcut` with `SHORTCUTS.send`. So the help taught every reader a chord that did
// nothing, and the chord that actually sent their message was documented nowhere — the exact
// scattered-hand-matching failure lib/shortcuts.ts exists to prevent, surviving inside the one
// component nobody had moved onto the shared matcher.
//
// The preference itself lives in lib/prefs.ts with every other device setting, because "reset my
// settings" has to be implementable and a seventh ad-hoc localStorage key is how that stops being
// true. This file is the pure mapping from that value to a `Shortcut` the shared matcher accepts,
// so the composer's handler, the hint under the box and the shortcuts dialog all resolve the same
// binding from the same field.
import { SHORTCUTS, shortcutLabel, type Shortcut } from './shortcuts.ts';
import type { SendKey } from './prefs.ts';

export type { SendKey };

/**
 * Bare Enter, as a Shortcut record.
 *
 * Deliberately NOT added to `SHORTCUTS`. That map is the GLOBAL keyboard map, and `useGlobalShortcut`
 * suppresses every non-modifier binding in it while the user is typing (`isTypingTarget`) — which
 * is the only place this binding is ever meant to fire. It would also collide with `SHORTCUTS.send`
 * for the collision test's purposes in a way that says nothing true: these are two spellings of one
 * command, chosen between, not two commands fighting over a chord.
 */
export const ENTER_SEND: Shortcut = { key: 'Enter', label: 'Send' };

/** The binding that sends, for a given preference. `mod-enter` reuses the shared ⌘↵ record. */
export function sendBinding(pref: SendKey): Shortcut {
  return pref === 'mod-enter' ? SHORTCUTS.send : ENTER_SEND;
}

/**
 * The binding that makes a new line instead of sending — the other half of the same choice.
 *
 * Stated rather than derived at the call site as "the one that isn't send": the hint under the
 * composer and the shortcuts dialog both name it, and two derivations are two things to get out of
 * step. Note that these are NOT simply swapped — with ⌘↵ sending, a plain Enter makes the newline,
 * and Shift+Enter does too; the one worth printing is the plain one.
 */
export function newlineBinding(pref: SendKey): Shortcut {
  return pref === 'mod-enter'
    ? { key: 'Enter', label: 'New line' }
    : { key: 'Enter', shift: true, label: 'New line' };
}

/** "↵ to send · ⇧↵ for a new line" — the whole choice in one line, in the platform's own symbols. */
export function sendHint(pref: SendKey, apple?: boolean): string {
  return `${shortcutLabel(sendBinding(pref), apple)} to send · ${shortcutLabel(newlineBinding(pref), apple)} for a new line`;
}

/** What the setting's two options are called where a person chooses between them. */
export const SEND_KEY_LABELS: Readonly<Record<SendKey, string>> = {
  enter: 'Enter',
  'mod-enter': 'Enter makes a new line',
};
