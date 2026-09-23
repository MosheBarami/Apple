// Tags typed straight into one box: chips on the left, the caret on the right.
//
// Pick: UI Layouts "UTube Tags Input" (MIT — adapted to React). Enter or a comma turns the text into
// a chip, × removes one, Backspace in an empty box removes the last, and clicking a chip turns it
// back into text so it can be fixed in place. Every write still goes through lib/tags.ts, so one
// tag keeps one spelling whatever the person types.
import { useRef, useState, type KeyboardEvent } from 'react';
import { addTag, normaliseTag, removeTag } from '../../../lib/tags';
import './tags-input.css';

export function TagsInput({
  tags,
  onChange,
  id,
  name,
  maxLength,
  max,
  disabled,
  placeholder,
  autoFocus,
  describedBy,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  name?: string;
  maxLength?: number;
  max: number;
  disabled?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  describedBy?: string;
}) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const full = tags.length >= max;

  const commit = () => {
    const next = addTag(tags, draft);
    setDraft('');
    if (next !== tags) onChange(next);
  };

  const finishEdit = (i: number) => {
    const old = tags[i];
    setEditing(null);
    if (old === undefined) return;
    const n = normaliseTag(editText);
    if (!n) {
      // Emptied means removed; an unusable spelling leaves the tag as it was.
      if (editText.trim() === '') onChange(removeTag(tags, old));
      return;
    }
    if (n === normaliseTag(old)) return;
    if (tags.some((t, j) => j !== i && normaliseTag(t) === n)) {
      onChange(removeTag(tags, old));
      return;
    }
    onChange(tags.map((t, j) => (j === i ? n : t)));
    input.current?.focus();
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'Enter' || e.key === ',') && draft.trim()) {
      e.preventDefault();
      commit();
    } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
      e.preventDefault();
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className={`pk-tags${disabled ? ' is-disabled' : ''}`} onClick={() => input.current?.focus()}>
      <ul className="pk-tags__list" aria-label="Tags on this project">
        {tags.map((t, i) =>
          editing === i ? (
            <li key={`edit-${t}`}>
              <input
                className="pk-tags__edit"
                value={editText}
                aria-label={`Edit tag ${t}`}
                maxLength={maxLength}
                autoFocus
                style={{ width: `${Math.max(3, editText.length + 2)}ch` }}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    finishEdit(i);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                onBlur={() => finishEdit(i)}
              />
            </li>
          ) : (
            <li key={t} className="pk-tags__chip">
              <button
                type="button"
                className="pk-tags__text"
                disabled={disabled}
                title="Click to change"
                onClick={(e) => {
                  e.stopPropagation();
                  setEditText(t);
                  setEditing(i);
                }}
              >
                {t}
              </button>
              <button
                type="button"
                className="pk-tags__x"
                disabled={disabled}
                aria-label={`Remove tag ${t}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(removeTag(tags, t));
                }}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </li>
          ),
        )}
      </ul>
      <input
        ref={input}
        id={id}
        name={name}
        className="pk-tags__input"
        value={draft}
        maxLength={maxLength}
        placeholder={full ? '' : placeholder}
        disabled={disabled || full}
        autoFocus={autoFocus}
        aria-describedby={describedBy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKey}
      />
    </div>
  );
}
