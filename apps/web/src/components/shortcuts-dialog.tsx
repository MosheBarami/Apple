// The keyboard shortcuts list, and the global bindings that are not the palette's own.
//
// A shortcut nobody can see is a shortcut nobody uses, so this list is reachable from the palette
// ("Keyboard shortcuts") and from ⌘/ — the chord most apps already use for exactly this. It reads
// from SHORTCUTS rather than restating the bindings, so a rebinding cannot leave the help lying.
import { useEffect } from 'react';
import { Modal } from './modal';
import { SHORTCUTS, isTypingTarget, matchesShortcut, shortcutLabel, type Shortcut } from '../lib/shortcuts';

/** Grouped the way someone looks for them: by when they would reach for one. */
const GROUPS: { title: string; keys: Shortcut[] }[] = [
  { title: 'Anywhere', keys: [SHORTCUTS.palette, SHORTCUTS.newProject, SHORTCUTS.help] },
  { title: 'In a conversation', keys: [SHORTCUTS.send, SHORTCUTS.stop, SHORTCUTS.search, SHORTCUTS.checkpoints] },
];

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
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
