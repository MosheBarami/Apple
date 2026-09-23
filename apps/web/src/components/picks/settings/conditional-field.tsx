// Fields that appear only when the answer above them makes them mean something.
//
// Pick: Motion "Clerk: Conditional Field" (MIT; its behaviour is rebuilt natively, since Motion is
// not installed): the extra fields grow open with a spring on height and opacity, and each one
// drops 6px into place on a short stagger. Closing shrinks the block and then unmounts it, so a
// hidden field cannot be focused, read or submitted.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion, spring } from './motion';
import './conditional-field.css';

export function ConditionalField({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  const [mounted, setMounted] = useState(open);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const openNow = useRef(open);
  openNow.current = open;

  useEffect(() => {
    if (open) setMounted(true);
  }, [open]);

  useLayoutEffect(() => {
    const el = box.current;
    const initial = first.current;
    first.current = false;
    if (initial || !el) return;
    if (reducedMotion() || typeof el.animate !== 'function') {
      if (!open) setMounted(false);
      return;
    }
    const s = spring(320, 32);
    const h = el.scrollHeight;
    if (open) {
      el.animate([{ height: '0px', opacity: 0 }, { height: `${h}px`, opacity: 1 }], { duration: s.duration, easing: s.easing });
      Array.from(el.querySelectorAll<HTMLElement>('label, input, .field, p, button')).slice(0, 8).forEach((child, i) => {
        child.animate([{ transform: 'translateY(-6px)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
          duration: 260,
          delay: 30 * i,
          easing: 'cubic-bezier(.23,1,.32,1)',
          fill: 'backwards',
        });
      });
    } else {
      const a = el.animate([{ height: `${h}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 200, easing: 'ease-in' });
      a.onfinish = () => {
        if (!openNow.current) setMounted(false);
      };
    }
  }, [open, mounted]);

  if (!mounted) return null;
  return (
    <div ref={box} className={`pk-cond${className ? ` ${className}` : ''}`} data-open={open ? 'true' : 'false'}>
      {children}
    </div>
  );
}
