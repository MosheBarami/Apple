// The sign-in card changes shape instead of being replaced.
//
// Pick: Motion "Clerk: Sign-in-or-up" (MIT; Motion itself is not installed, so the behaviour is
// rebuilt with the Web Animations API). Upstream one card walks through email → code → done: its
// height springs from the old step's to the new one's, and the new step slides in from the side of
// travel with a short blur. Here the same card carries sign in, the six-digit step, sign up, the
// reset and the "check your email" states — so moving between them reads as one conversation.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { reducedMotion, spring } from './motion';
import './morph-card.css';

export function MorphCard({ stage, order, children }: { stage: string; order: number; children: ReactNode }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const last = useRef({ stage, order, height: 0 });

  useLayoutEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;
    const prev = last.current;
    const height = i.offsetHeight;
    last.current = { stage, order, height };
    if (prev.stage === stage || prev.height === 0 || reducedMotion() || typeof o.animate !== 'function') return;
    const dir = order >= prev.order ? 1 : -1;
    const s = spring(300, 32);
    // A little room each side so the card's own shadow is not cut off while the box is clipped.
    o.style.overflow = 'clip';
    o.style.setProperty('overflow-clip-margin', '40px');
    const grow = o.animate([{ height: `${prev.height}px` }, { height: `${height}px` }], { duration: s.duration, easing: s.easing });
    grow.onfinish = grow.oncancel = () => {
      o.style.overflow = '';
      o.style.removeProperty('overflow-clip-margin');
    };
    i.animate(
      [
        { transform: `translateX(${dir * 40}px)`, opacity: 0, filter: 'blur(4px)' },
        { transform: 'none', opacity: 1, filter: 'blur(0px)' },
      ],
      { duration: s.duration, easing: s.easing },
    );
  }, [stage, order]);

  // Height changes inside one stage (an error line appearing) are measured too, so the next
  // stage change starts from the height that was really on screen.
  useLayoutEffect(() => {
    const i = inner.current;
    if (!i) return;
    const ro = new ResizeObserver(() => {
      last.current.height = i.offsetHeight;
    });
    ro.observe(i);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={outer} className="pk-morph">
      <div ref={inner} className="pk-morph__inner">
        {children}
      </div>
    </div>
  );
}
