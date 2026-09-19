// The command palette.
//
// Opened with ⌘K / Ctrl+K and usable without ever touching the mouse, which is the whole point:
// the actions in this product are spread across a rail, a topbar, a card menu and two drawers, and
// a palette is the one surface that makes all of them reachable in the same two seconds.
//
// Three details carry most of the feel, and each is easy to get wrong invisibly:
//
//   * the selected row must be scrolled into view as you arrow through it, or the list appears to
//     stop responding the moment the selection leaves the visible area;
//   * selection resets to the top when the query changes, because otherwise arrowing down and then
//     typing leaves the highlight on a row that no longer means what it did;
//   * focus returns to whatever had it when the palette closes, so ⌘K-Escape does not dump the
//     user at the top of the document.
//
// The chord itself is NOT defined here. It comes from SHORTCUTS.palette through the same matcher
// every other binding uses, because this file used to hand-match `(metaKey || ctrlKey) && key ===
// 'k'` — which fires on Ctrl+K on a Mac, where Ctrl+K is delete-to-end-of-line in every text
// field. An external-keyboard user trimming a prompt in the composer got the palette instead of
// the edit. `matchesShortcut` rejects the non-platform modifier, which is the whole reason it
// takes a platform at all.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { groupBySection, rankCommands } from '../lib/command-match';
import { useCommandRegistry } from '../lib/commands';
import { SHORTCUTS, matchesShortcut } from '../lib/shortcuts';
import { useOverlayScrollLock } from './modal';
// The palette is a dialog, and it was the one dialog drawn as if it were not: no shadow token, no
// entrance, a backdrop two shades and a whole z-index away from every other overlay. ./modal.css is
// the sheet that decides how an overlay arrives and where it sits, and this imports it for the same
// reason ./modal.tsx does. Imported FIRST so the palette's own rules below it win any tie.
import './modal.css';
import './command-palette.css';

export function CommandPalette() {
  const { commands, open, setOpen } = useCommandRegistry();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  useOverlayScrollLock(open);

  const ranked = useMemo(() => rankCommands(commands, query), [commands, query]);
  const groups = useMemo(() => groupBySection(ranked), [ranked]);

  // Global chord. Registered once, at the document, so it works from inside any input except one
  // that has already handled it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!matchesShortcut(e, SHORTCUTS.palette)) return;
      e.preventDefault();
      setOpen(!open);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Opening resets the query: a palette that remembers the last search makes the commonest action
  // — open, type, enter — start from a filtered list nobody asked for.
  useEffect(() => {
    if (open) {
      restoreTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setQuery('');
      setSelected(0);
      inputRef.current?.focus();
    } else {
      restoreTo.current?.focus();
      restoreTo.current = null;
    }
  }, [open]);

  useEffect(() => setSelected(0), [query]);

  // ESCAPE FROM ANYWHERE THE PALETTE CAN BE, not only from the field.
  //
  // The handler below is on the input, which is the only focusable thing in here — so on the day
  // focus was anywhere else (the browser restoring it after a tab switch, an extension, a stray
  // programmatic focus) Escape did nothing and a keyboard-only user had no way out of a surface
  // built for keyboard-only users. Guarded on where the focus actually is, so a dialog stacked
  // underneath the palette keeps its own Escape rather than losing it to this listener.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const focused = document.activeElement;
      if (focused && focused !== document.body && !panelRef.current?.contains(focused)) return;
      e.preventDefault();
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, setOpen]);

  // Clamp rather than let the selection dangle past the end when the list shrinks under it.
  const index = Math.min(selected, Math.max(0, ranked.length - 1));

  // Layout effect so the scroll happens in the same frame as the highlight; in a passive effect
  // the row visibly jumps.
  useLayoutEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: 'nearest' });
  }, [index, open, ranked.length]);

  if (!open) return null;

  const runAt = (i: number) => {
    const hit = ranked[i];
    if (!hit || hit.command.enabled === false) return;
    setOpen(false);
    hit.command.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => (ranked.length ? (Math.min(i, ranked.length - 1) + 1) % ranked.length : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => (ranked.length ? (Math.min(i, ranked.length - 1) + ranked.length - 1) % ranked.length : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      runAt(index);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Home') {
      e.preventDefault();
      setSelected(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setSelected(Math.max(0, ranked.length - 1));
    } else if (e.key === 'Tab') {
      // The trap, and it is one line because there is one focusable element in here. The rows are
      // <div role="option">s addressed through aria-activedescendant, so the only place Tab could
      // go is out — past a dialog that claims aria-modal="true", into the page it is covering.
      e.preventDefault();
    }
  };

  // A flat counter across groups, so arrow keys move through the list as the eye reads it rather
  // than restarting at each section heading.
  let flat = -1;

  return (
    <div
      className="cmdk-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div ref={panelRef} className="cmdk" role="dialog" aria-modal="true" aria-label="Command palette">
        <input
          ref={inputRef}
          className="cmdk__input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a command…"
          aria-label="Search commands"
          aria-controls="cmdk-list"
          aria-activedescendant={ranked[index] ? `cmdk-${ranked[index].command.id}` : undefined}
          role="combobox"
          aria-expanded="true"
          autoComplete="off"
          spellCheck={false}
        />

        <div className="cmdk__list" id="cmdk-list" role="listbox" ref={listRef}>
          {/* An empty state says what to do next or it is not one. "No commands here yet." named
              the condition and stopped; "Nothing matches “xyz”." left the reader to guess whether
              the action exists at all. Both now end in the move that gets them out of it. */}
          {ranked.length === 0 && (
            <p className="cmdk__empty">
              {commands.length === 0
                ? 'No commands here yet — they come from the screen you are on.'
                : `Nothing matches “${query.trim()}”. Try fewer letters, or the action’s first word.`}
            </p>
          )}

          {groups.map((group) => (
            <div key={group.section} className="cmdk__group">
              <div className="cmdk__section" aria-hidden="true">
                {group.section}
              </div>
              {group.items.map((hit) => {
                flat += 1;
                const i = flat;
                const off = hit.command.enabled === false;
                return (
                  <div
                    key={hit.command.id}
                    id={`cmdk-${hit.command.id}`}
                    role="option"
                    aria-selected={i === index}
                    aria-disabled={off || undefined}
                    data-selected={i === index ? 'true' : 'false'}
                    className={`cmdk__item${i === index ? ' is-selected' : ''}${off ? ' is-off' : ''}`}
                    // mousedown, not click: click fires after blur, and blur would have already
                    // closed the palette out from under the pointer.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      runAt(i);
                    }}
                    onMouseMove={() => setSelected(i)}
                  >
                    <span className="cmdk__title">
                      <Highlighted text={hit.command.title} hits={hit.hits} />
                    </span>
                    {off && hit.command.why && <span className="cmdk__why">{hit.command.why}</span>}
                    {!off && hit.command.hint && <kbd className="cmdk__hint" dir="ltr">{hit.command.hint}</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        {/* dir="ltr" on the legend: ⌘/↑/↵ are direction-neutral symbols, so inside an RTL page
            bidi reorders them and the chord renders backwards. */}
        <div className="cmdk__foot" dir="ltr">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> move
          </span>
          <span>
            <kbd>↵</kbd> run
          </span>
          <span>
            <kbd>esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

/** Marks the matched characters. Indices, not a substring, because initials matches are scattered. */
function Highlighted({ text, hits }: { text: string; hits: number[] }) {
  if (!hits.length) return <>{text}</>;
  const set = new Set(hits);
  const out: React.ReactNode[] = [];
  let run = '';
  let runMarked = set.has(0);
  for (let i = 0; i < text.length; i += 1) {
    const marked = set.has(i);
    if (marked !== runMarked) {
      out.push(runMarked ? <mark key={i}>{run}</mark> : run);
      run = '';
      runMarked = marked;
    }
    run += text[i];
  }
  out.push(runMarked ? <mark key="last">{run}</mark> : run);
  return <>{out}</>;
}
