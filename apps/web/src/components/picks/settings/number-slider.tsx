// A slider whose value rides above the thumb and rolls as it changes.
//
// Pick: UI Layouts "Motion Number Slider" (MIT — adapted to React, one thumb, and the shared
// ./rolling-number for the figure). The thumb is a real role="slider" with the full keyboard:
// arrows step, Page Up/Down jump, Home/End go to the ends; `aria-valuetext` carries the formatted
// value so a screen reader hears "9 am", not "9".
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { RollingNumber } from './rolling-number';
import './number-slider.css';

export function NumberSlider({
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
  label,
  disabled,
  id,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  label: string;
  disabled?: boolean;
  id?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const fromPointer = (clientX: number) => {
    const r = track.current?.getBoundingClientRect();
    if (!r || r.width === 0) return;
    const rtl = getComputedStyle(track.current!).direction === 'rtl';
    const f = rtl ? (r.right - clientX) / r.width : (clientX - r.left) / r.width;
    const next = clamp(min + f * (max - min));
    if (next !== value) onChange(next);
  };

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || e.button !== 0) return;
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    (e.currentTarget.querySelector('[role="slider"]') as HTMLElement | null)?.focus();
    fromPointer(e.clientX);
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const big = Math.max(step, Math.round((max - min) / 10));
    const map: Record<string, number> = {
      ArrowRight: value + step,
      ArrowUp: value + step,
      ArrowLeft: value - step,
      ArrowDown: value - step,
      PageUp: value + big,
      PageDown: value - big,
      Home: min,
      End: max,
    };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const v = clamp(next);
    if (v !== value) onChange(v);
  };

  return (
    <div
      ref={track}
      className={`pk-slider${disabled ? ' is-disabled' : ''}`}
      onPointerDown={onDown}
      onPointerMove={(e) => dragging.current && fromPointer(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
    >
      <div className="pk-slider__rail" aria-hidden="true">
        <div className="pk-slider__fill" style={{ width: `${pct}%` }} />
      </div>
      <div
        id={id}
        className="pk-slider__thumb"
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={format(value)}
        aria-disabled={disabled || undefined}
        style={{ insetInlineStart: `calc(${pct}% - ${(pct / 100) * 18}px)` }}
        onKeyDown={onKey}
      >
        <span className="pk-slider__tag" aria-hidden="true">
          <RollingNumber value={format(value)} />
        </span>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="9" cy="12" r="1" />
          <circle cx="9" cy="5" r="1" />
          <circle cx="9" cy="19" r="1" />
          <circle cx="15" cy="12" r="1" />
          <circle cx="15" cy="5" r="1" />
          <circle cx="15" cy="19" r="1" />
        </svg>
      </div>
    </div>
  );
}
