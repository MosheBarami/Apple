// The keyboard shortcuts list, and the global bindings that are not the palette's own.
//
// A shortcut nobody can see is a shortcut nobody uses, so this list is reachable from the palette
// ("Keyboard shortcuts") and from ⌘/ — the chord most apps already use for exactly this. It reads
// from SHORTCUTS rather than restating the bindings, so a rebinding cannot leave the help lying.
import { useEffect } from 'react';
import { Modal } from './modal';
import { SHORTCUTS, isTypingTarget, matchesShortcut, shortcutLabel, type Shortcut } from '../lib/shortcuts';
import { SEND_KEY_LABELS, newlineBinding, sendBinding } from '../lib/send-key';
import { usePrefs } from '../lib/theme';
import { SEND_KEYS, type SendKey } from '../lib/prefs';
import './shortcuts-dialog.css';

/**
 * Grouped the way someone looks for them: by when they would reach for one.
 *
 * SEND IS COMPUTED, NOT LISTED. It was a constant here — `SHORTCUTS.send`, rendered as ⌘↵ — while
 * the composer sent on a bare Enter, so this dialog taught every reader a chord that did nothing.
 * It now reads the same binding the composer's handler matches against — the one the user picks in
 * the chooser below — so the two cannot drift apart again.
 */
function groups(pref: SendKey): { title: string; keys: Shortcut[] }[] {
  return [
    { title: 'Anywhere', keys: [SHORTCUTS.palette, SHORTCUTS.newProject, SHORTCUTS.help] },
    {
      title: 'In a conversation',
      keys: [sendBinding(pref), newlineBinding(pref), SHORTCUTS.stop, SHORTCUTS.search, SHORTCUTS.checkpoints],
    },
  ];
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const { prefs, setPref } = usePrefs();
  const GROUPS = groups(prefs.sendKey);
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose}>
      <div className="shortcuts">
        {GROUPS.map((group) => (
          <section key={group.title} className="shortcuts__group">
            <h3 className="shortcuts__heading">{group.title}</h3>
            <dl className="shortcuts__list">
              {group.keys.map((s) => (
                <div key={s.label} className="shortcuts__row">
                  <dt>{s.label}</dt>
                  <dd>
                    <kbd className="gx-kbd" dir="ltr">{shortcutLabel(s)}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
      {/* THE ONE BINDING THAT IS A CHOICE, OFFERED WHERE IT IS READ.
          It belongs here rather than on the settings page for the same reason the list does: this
          is the screen someone opens when they want to know what a key does, and the answer to
          "why does Enter send?" should be reachable from the sentence that says it does. The rows
          above re-render from the same `prefs.sendKey`, so picking one changes the list in place. */}
      <fieldset className="shortcuts__choice">
        <legend className="shortcuts__heading">Send a message with</legend>
        <div role="radiogroup" aria-label="Send a message with">
          {SEND_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={prefs.sendKey === key}
              className={`shortcuts__opt${prefs.sendKey === key ? ' is-on' : ''}`}
              onClick={() => setPref('sendKey', key)}
            >
              <kbd className="gx-kbd" dir="ltr">{shortcutLabel(sendBinding(key))}</kbd>
              <span className="shortcuts__choice-sub">{SEND_KEY_LABELS[key]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <p className="field-hint">
        Everything here is also in the command palette — {shortcutLabel(SHORTCUTS.palette)} — along with
        the actions that have no shortcut of their own.
      </p>
    </Modal>
  );
}

/**
 * Bind one shortcut globally.
 *
 * Single-key shortcuts are suppressed while the user is typing, because a bare key that fires mid-
 * prompt reads as data loss. Chords carrying the command modifier are exempt: that is what the
 * modifier is for, and a palette you cannot open from the composer is a palette you cannot open
 * when you most want it.
 */
export function useGlobalShortcut(shortcut: Shortcut, run: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, shortcut)) return;
      if (!shortcut.mod && shortcut.key !== 'Escape' && isTypingTarget(e.target)) return;
      e.preventDefault();
      run();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut, run, enabled]);
}
