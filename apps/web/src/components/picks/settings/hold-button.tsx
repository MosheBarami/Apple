// Press and hold to do something that cannot be undone.
//
// MERGED FROM TWO PICKS that are the same control: Motion "Hold to confirm" (Motion+ licence) and
// React Bits "Hold Button" (MIT + Commons Clause). Neither was copied; the behaviour is rebuilt:
//   * a fill sweeps across while held, carrying an inverted copy of the label (React Bits' crest),
//   * letting go early springs the fill back and nothing happens,
//   * the button dips while pressed and pops when it completes (Motion),
//   * Space or Enter held down works exactly like a held pointer; Escape cancels,
//   * dragging off the button cancels, so a slip is not a confirmation.
// Reduced motion keeps the hold — it is the safety, not decoration — and drops the pop.
import { useEffect, useId, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { reducedMotion, spring } from './motion';
import './hold-button.css';

type Phase = 'idle' | 'holding' | 'done';

export function HoldButton({
  label,
  doneLabel,
  onConfirm,
  holdMs = 1200,
  tone = 'danger',
  disabled,
  busy,
  busyLabel,
  className,
  hint = 'Press and hold',
}: {
  label: string;
  doneLabel?: string;
  onConfirm: () => void;
  holdMs?: number;
  tone?: 'danger' | 'primary';
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  className?: string;
  hint?: string;
}) {
  const hintId = useId();
  const btn = useRef<HTMLButtonElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const progress = useRef(0);
  const raf = useRef(0);
  const pointer = useRef<number | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;

  const paint = (p: number) => {
    progress.current = p;
    btn.current?.style.setProperty('--pk-hold-p', p.toFixed(4));
  };

  const drive = (to: number, duration: number, ease: (t: number) => number, done?: () => void) => {
    cancelAnimationFrame(raf.current);
    const from = progress.current;
    const start = performance.now();
    const step = (now: number) => {
      const t = duration > 0 ? Math.min(1, (now - start) / duration) : 1;
      paint(from + (to - from) * ease(t));
      if (t < 1) raf.current = requestAnimationFrame(step);
      else done?.();
    };
    raf.current = requestAnimationFrame(step);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const complete = () => {
    if (phaseRef.current !== 'holding') return;
    setPhase('done');
    if (!reducedMotion() && btn.current?.animate) {
      const s = spring(400, 12);
      btn.current.animate([{ transform: 'scale(1.05)' }, { transform: 'scale(1)' }], { duration: s.duration, easing: s.easing });
    }
    onConfirm();
  };

  const begin = () => {
    if (disabled || busy || phaseRef.current !== 'idle') return false;
    setPhase('holding');
    phaseRef.current = 'holding';
    // Linear while held: the fill IS the clock, so it has to move at the clock's rate.
    drive(1, holdMs * (1 - progress.current), (t) => t, complete);
    return true;
  };

  const release = () => {
    if (phaseRef.current !== 'holding') return;
    setPhase('idle');
    phaseRef.current = 'idle';
    drive(0, reducedMotion() ? 0 : 320, (t) => 1 - Math.pow(1 - t, 3));
  };

  // A completed hold resets once the caller has had time to react (or the dialog has closed).
  useEffect(() => {
    if (phase !== 'done') return;
    const t = window.setTimeout(() => {
      setPhase('idle');
      paint(0);
    }, 1600);
    return () => window.clearTimeout(t);
  }, [phase]);

  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0 || pointer.current !== null) return;
    if (!begin()) return;
    pointer.current = e.pointerId;
    rect.current = e.currentTarget.getBoundingClientRect();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
  };
  const endPointer = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.pointerId !== pointer.current) return;
    pointer.current = null;
    release();
  };
  const onPointerMove = (e: PointerEvent<HTMLButtonElement>) => {
    const r = rect.current;
    if (e.pointerId !== pointer.current || !r) return;
    if (e.clientX < r.left - 10 || e.clientX > r.right + 10 || e.clientY < r.top - 10 || e.clientY > r.bottom + 10) endPointer(e);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) begin();
    } else if (e.key === 'Escape' && phaseRef.current === 'holding') {
      e.stopPropagation();
      release();
    }
  };
  const onKeyUp = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      release();
    }
  };

  const shown = busy ? (busyLabel ?? label) : phase === 'done' && doneLabel ? doneLabel : label;
  const s = spring(260, 22);
  return (
    <button
      ref={btn}
      type="button"
      className={`pk-hold pk-hold--${tone}${className ? ` ${className}` : ''}`}
      data-phase={phase}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      aria-describedby={hintId}
      title={busy ? undefined : hint}
      style={{ '--pk-hold-ease': s.easing } as CSSProperties}
      onPointerDown={onPointerDown}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      onLostPointerCapture={endPointer}
      onPointerMove={onPointerMove}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onContextMenu={(e) => e.preventDefault()}
      // A click is not a hold. Swallowed so that a form around this cannot be submitted by it.
      onClick={(e) => e.preventDefault()}
    >
      <span className="pk-hold__label">{shown}</span>
      <span className="pk-hold__fill" aria-hidden="true">
        <span className="pk-hold__label pk-hold__label--fill">{shown}</span>
      </span>
      <span id={hintId} className="pk-hold__hint">
        {hint}
      </span>
    </button>
  );
}
