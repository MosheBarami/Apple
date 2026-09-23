// A select that opens from the row you are on.
//
// Pick: Motion "Radix: Select" (Motion+ licence — behaviour re-implemented, nothing copied). Upstream
// the list opens "item-aligned": it grows out of the selected option rather than dropping from the
// top. Here the list sits under the trigger and is revealed with a clip-path that starts as the
// selected row's own box and springs open to the whole list, so the eye starts where the value is.
//
// The listbox pattern, in full: the trigger is a button with aria-haspopup/aria-expanded; the list
// takes focus and names the active row with aria-activedescendant; arrows, Home/End, typeahead,
// Enter/Space to choose, Escape to close and give focus back, Tab to leave. A hidden input carries
// `name`, so a form or a test that reads the field by name still finds it.
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { reducedMotion, spring } from './motion';
import './select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export function Select({
  value,
  options,
  onChange,
  name,
  id,
  disabled,
  label,
  className,
}: {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  /** The accessible name when no visible <label htmlFor> points at `id`. */
  label?: string;
  className?: string;
}) {
  const auto = useId();
  const triggerId = id ?? `pk-select-${auto}`;
  const listId = `${triggerId}-list`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(() => Math.max(0, options.findIndex((o) => o.value === value)));
  const wrap = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const typed = useRef({ text: '', at: 0 });

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = options[selectedIndex];

  const close = (refocus = true) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  const choose = (i: number) => {
    const o = options[i];
    if (!o) return;
    if (o.value !== value) onChange(o.value);
    close();
  };

  const openList = () => {
    if (disabled) return;
    setActive(Math.max(0, selectedIndex));
    setOpen(true);
  };

  // Reveal from the selected row, then focus the list so the keyboard lands inside it.
  useLayoutEffect(() => {
    if (!open) return;
    const ul = list.current;
    if (!ul) return;
    const row = ul.querySelector<HTMLElement>(`[data-index="${Math.max(0, selectedIndex)}"]`);
    if (row) ul.scrollTop = Math.max(0, row.offsetTop - ul.clientHeight / 2 + row.offsetHeight / 2);
    ul.focus({ preventScroll: true });
    if (!row || reducedMotion() || typeof ul.animate !== 'function') return;
    const top = row.offsetTop - ul.scrollTop;
    const bottom = ul.clientHeight - top - row.offsetHeight;
    const s = spring(380, 34);
    ul.animate(
      [
        { clipPath: `inset(${Math.max(0, top)}px 0 ${Math.max(0, bottom)}px 0 round 10px)`, opacity: 0.6 },
        { clipPath: 'inset(0px 0 0px 0 round 12px)', opacity: 1 },
      ],
      { duration: s.duration, easing: s.easing },
    );
    // Only the opening edge; `selectedIndex` is read at that instant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the active row in view while arrowing.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  // Outside press closes without stealing focus back.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) close(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openList();
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    const last = options.length - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(last, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setActive(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setActive(last);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      choose(active);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === 'Tab') {
      close(false);
    } else if (e.key.length === 1 && /\S/.test(e.key)) {
      const now = Date.now();
      typed.current.text = now - typed.current.at > 700 ? e.key : typed.current.text + e.key;
      typed.current.at = now;
      const q = typed.current.text.toLowerCase();
      const hit = options.findIndex((o) => o.label.toLowerCase().startsWith(q));
      if (hit >= 0) setActive(hit);
    }
  };

  const s = spring(380, 34);
  return (
    <div
      ref={wrap}
      className={`pk-select${open ? ' is-open' : ''}${className ? ` ${className}` : ''}`}
      style={{ '--pk-select-ease': s.easing } as CSSProperties}
    >
      {name && <input type="hidden" name={name} value={value} />}
      <button
        ref={trigger}
        type="button"
        id={triggerId}
        className="pk-select__trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={label ? `${label}: ${selected?.label ?? value}` : undefined}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={onTriggerKey}
      >
        <span className="pk-select__value">{selected?.label ?? value}</span>
        <svg className="pk-select__chev" viewBox="0 0 24 24" aria-hidden="true">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <ul
          ref={list}
          id={listId}
          className="pk-select__list"
          role="listbox"
          tabIndex={-1}
          aria-labelledby={label ? undefined : triggerId}
          aria-label={label}
          aria-activedescendant={`${listId}-${active}`}
          onKeyDown={onListKey}
          onClick={(e) => e.preventDefault()}
        >
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              className={`pk-select__option${i === active ? ' is-active' : ''}${o.value === value ? ' is-selected' : ''}`}
              onPointerEnter={() => setActive(i)}
              // preventDefault: inside a <label>, a click would otherwise be re-sent to the trigger.
              onClick={(e) => {
                e.preventDefault();
                choose(i);
              }}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <svg className="pk-select__tick" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
