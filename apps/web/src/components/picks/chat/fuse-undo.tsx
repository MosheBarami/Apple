// DONE NOW, UNDO FOR A FEW SECONDS.
//
// React Bits "Fuse Button" (MIT + Commons Clause, re-implemented): the action happens at once, and
// the control that did it turns into an Undo with a fuse burning along its edge. Pointer or keyboard
// focus on it pauses the fuse, so nobody loses the undo while they are reaching for it. When the
// fuse runs out the offer is gone — and it is gone for real, because the caller's undo is a
// lib/undo.ts Undoable, which refuses after its own window closes.
import { useEffect, useRef } from 'react';
import './fuse-undo.css';

export function FuseUndo({
  text,
  ms = 4000,
  onUndo,
  onDone,
}: {
  text: string;
  ms?: number;
  onUndo: () => void;
  onDone: () => void;
}) {
  const fuse = useRef<HTMLSpanElement>(null);
  const anim = useRef<Animation | null>(null);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  // The fuse IS the timer: a Web Animation can pause and resume, which a setTimeout cannot. Under
  // reduced motion the line is not drawn, but the same animation still keeps the time.
  useEffect(() => {
    const el = fuse.current;
    if (!el || typeof el.animate !== 'function') {
      const id = window.setTimeout(() => doneRef.current(), ms);
      return () => window.clearTimeout(id);
    }
    const a = el.animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: ms, easing: 'linear', fill: 'forwards' });
    anim.current = a;
    a.finished.then(() => doneRef.current(), () => undefined);
    return () => a.cancel();
  }, [ms]);

  const pause = () => anim.current?.pause();
  const resume = () => anim.current?.play();

  return (
    <div className="pk-fuse" role="status" onPointerEnter={pause} onPointerLeave={resume} onFocus={pause} onBlur={resume}>
      <span className="pk-fuse__text">{text}</span>
      <button type="button" className="pk-fuse__undo" onClick={onUndo}>
        Undo
      </button>
      <span ref={fuse} className="pk-fuse__line" aria-hidden="true" />
    </div>
  );
}
