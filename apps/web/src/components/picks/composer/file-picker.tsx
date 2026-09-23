// POINT AT THE PROJECT'S OWN FILES, WITHOUT KNOWING ABOUT "@".
//
// Typing `@` and a few letters already names a file in the message (lib/mentions.ts). Nobody finds
// that by accident, and the people this product is for do not know it is there. This is the same
// act with a mouse or a finger: open, tick the files the message is about, Add — and each one goes
// into the box at the caret exactly as a mention would, as its path in backticks.
//
// UI Layouts' "Multi Selector" (MIT), rebuilt on this product's tokens: a searchable list where
// several rows can be ticked, the choices shown as chips (at most three, then "+N more") that can
// be removed one at a time or cleared together.
//
// A real multi-select listbox: the search field keeps focus and names the highlighted row through
// aria-activedescendant; ↑/↓ move, Enter ticks, Escape closes. The file list is fetched
// once per opening of a project, when the picker is first opened — never on mount.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { fetchProjectFiles } from '../../../lib/api';
import { XIcon } from '../../ai-elements/icons';
import './file-picker.css';

const SHOW_CHIPS = 3;
const MAX_ROWS = 60;

export function FilePicker({
  projectId,
  onAdd,
  disabled,
}: {
  projectId: string;
  onAdd: (paths: string[]) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [paths, setPaths] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [allChips, setAllChips] = useState(false);
  const asked = useRef('');
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);

  // A different project is a different list, and nothing chosen in the last one carries over.
  useEffect(() => {
    asked.current = '';
    setPaths(null);
    setChosen([]);
    setOpen(false);
  }, [projectId]);

  useEffect(() => {
    if (!open || asked.current === projectId) return;
    asked.current = projectId;
    setFailed(false);
    const wanted = projectId;
    fetchProjectFiles(wanted)
      .then((res) => { if (asked.current === wanted) setPaths(res.files.map((f) => f.path)); })
      .catch(() => { if (asked.current === wanted) { asked.current = ''; setFailed(true); } });
  }, [open, projectId]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => search.current?.focus());
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (panel.current?.contains(t) || trigger.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (paths ?? []).filter((p) => !q || p.toLowerCase().includes(q)).slice(0, MAX_ROWS);
  }, [paths, query]);

  useEffect(() => setActive(0), [query]);

  const toggle = (path: string) =>
    setChosen((cur) => (cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path]));

  const close = () => {
    setOpen(false);
    setQuery('');
    requestAnimationFrame(() => trigger.current?.focus());
  };

  const add = () => {
    if (!chosen.length) return;
    onAdd(chosen);
    setChosen([]);
    setOpen(false);
    setQuery('');
  };

  const keys = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + rows.length) % rows.length);
    } else if (e.key === 'Enter') {
      // Enter ticks the highlighted row (Space stays a space: file names can have them), and
      // Ctrl/⌘+Enter adds what is ticked.
      e.preventDefault();
      if (e.metaKey || e.ctrlKey) { add(); return; }
      const row = rows[active];
      if (row) toggle(row);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const name = (path: string) => path.split('/').pop() || path;
  const shownChips = allChips ? chosen : chosen.slice(0, SHOW_CHIPS);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="gx-chip gx-chip--files"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={chosen.length ? `Files: ${chosen.length} chosen` : 'Files'}
        data-tip="Point Apple at files in this project"
        data-fx="press ripple"
        disabled={disabled}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z M14 3v5h5 M9 13h6 M9 17h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="gx-chip__label">Files</span>
        {chosen.length > 0 && <span className="pk-files__count" aria-hidden="true">{chosen.length}</span>}
      </button>
      {open && (
        <div ref={panel} className="pk-files" role="dialog" aria-label="Point at project files">
          {chosen.length > 0 && (
            <div className="pk-files__chips" aria-label="Chosen files">
              {shownChips.map((p) => (
                <span key={p} className="pk-files__chip">
                  <span className="pk-files__chip-name" title={p}>{name(p)}</span>
                  <button type="button" className="pk-files__chip-x" aria-label={`Remove ${p}`} onClick={() => toggle(p)}>
                    <XIcon size={12} />
                  </button>
                </span>
              ))}
              {!allChips && chosen.length > SHOW_CHIPS && (
                <button type="button" className="pk-files__more" onClick={() => setAllChips(true)}>
                  +{chosen.length - SHOW_CHIPS} more
                </button>
              )}
            </div>
          )}
          <input
            ref={search}
            className="pk-files__search"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="pk-files-list"
            aria-activedescendant={rows[active] ? `pk-file-${active}` : undefined}
            aria-label="Search files"
            placeholder="Search files"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={keys}
          />
          <ul className="pk-files__list" id="pk-files-list" role="listbox" aria-multiselectable="true" aria-label="Project files">
            {rows.map((p, i) => {
              const on = chosen.includes(p);
              return (
                <li
                  key={p}
                  id={`pk-file-${i}`}
                  role="option"
                  aria-selected={on}
                  className={`pk-files__row${i === active ? ' is-active' : ''}${on ? ' is-on' : ''}`}
                  onMouseDown={(e) => { e.preventDefault(); toggle(p); setActive(i); }}
                  onMouseEnter={() => setActive(i)}
                >
                  <span className="pk-files__tick" aria-hidden="true" />
                  <span className="pk-files__path">{p}</span>
                </li>
              );
            })}
          </ul>
          {paths === null && !failed && <p className="pk-files__note">Loading files…</p>}
          {failed && <p className="pk-files__note">The file list did not load. Close this and try again.</p>}
          {paths !== null && rows.length === 0 && (
            <p className="pk-files__note">{query ? 'No file matches that.' : 'This project has no files yet.'}</p>
          )}
          <div className="pk-files__foot">
            <button type="button" className="pk-files__btn" disabled={!chosen.length} onClick={() => { setChosen([]); setAllChips(false); }}>
              Clear
            </button>
            <button type="button" className="pk-files__btn is-primary" disabled={!chosen.length} onClick={add}>
              {chosen.length ? `Add ${chosen.length}` : 'Add'}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
