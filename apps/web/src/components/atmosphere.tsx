// Atmosphere: film grain and a custom cursor.
//
// Both are deliberately restrained — this is a tool, not a showreel. The grain
// is a fixed, non-interactive overlay; the cursor is a thin ring that changes
// shape over links and text, and it never replaces the native caret in a field
// you are typing in. Both switch off entirely for coarse pointers and for
// `prefers-reduced-motion`.
import { useEffect, useRef } from 'react';
// The OS query is still honoured — it is one of the two inputs to this hook — but someone who has
// turned motion off in settings has to be able to turn off the cursor too, and a local copy of the
// media query could only ever disagree with the one the rest of the app uses.
import { useReducedMotion } from '../lib/theme';

function isFinePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;
}

export function Grain() {
  return <div className="grain" aria-hidden="true" />;
}

export function Cursor() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!isFinePointer() || reduced) return;
    const el = ref.current;
    if (!el) return;

    document.documentElement.classList.add('has-cursor');
    let raf = 0;
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    let awake = false;

    const frame = () => {
      // A small amount of lag reads as weight; more than this reads as broken.
      x += (tx - x) * 0.32;
      y += (ty - y) * 0.32;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(frame);
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!awake) {
        awake = true;
        x = tx;
        y = ty;
        el.classList.add('is-awake');
      }
      const target = e.target as Element | null;
      const interactive = target?.closest?.('a, button, [role="button"], summary, label, .surface-tab, .nav-item');
      const editable = target?.closest?.('input, textarea, [contenteditable="true"]');
      if (editable) el.dataset['state'] = 'text';
      else if (interactive) el.dataset['state'] = 'link';
      else delete el.dataset['state'];
    };

    const onLeave = () => {
      awake = false;
      el.classList.remove('is-awake');
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      document.documentElement.classList.remove('has-cursor');
    };
    // Re-runs when the preference changes, so turning motion off takes the custom cursor away
    // immediately rather than at the next reload — and the cleanup above removes `has-cursor`,
    // which is what gives the native cursor back.
  }, [reduced]);

  return (
    <div className="cursor" ref={ref} aria-hidden="true">
      <span className="cursor__ring" />
      <span className="cursor__dot" />
    </div>
  );
}
