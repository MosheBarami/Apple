// Folded detail: one row per question, as many open at once as the reader wants.
//
// Pick: UI Layouts "Multi Layout Accordion" (MIT — adapted to React). A panel grows to its own
// height while its content is uncovered top-down with a clip-path, and closes the same way in
// reverse; the chevron turns. Each header is a real button with aria-expanded/aria-controls and
// each panel a labelled region, so the whole thing reads as a list of disclosures.
//
// This is where the account screens keep the long, technical sentences — they stay one click
// away instead of being the first thing a young builder has to read.
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { reducedMotion } from './motion';
import './accordion.css';

export interface AccordionItem {
  id: string;
  title: ReactNode;
  children: ReactNode;
}

function Panel({ item, open, onToggle, base }: { item: AccordionItem; open: boolean; onToggle: () => void; base: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(open);
  const first = useRef(true);

  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (open) setShown(true);
    const p = panel.current;
    const a = inner.current;
    if (!p || !a || reducedMotion() || typeof p.animate !== 'function') {
      if (!open) setShown(false);
      return;
    }
    const ease = 'cubic-bezier(.2,0,0,1)';
    if (open) {
      p.hidden = false;
      const h = p.scrollHeight;
      p.animate([{ height: '0px' }, { height: `${h}px` }], { duration: 300, easing: ease });
      a.animate(
        [{ clipPath: 'polygon(0 0,100% 0,100% 0,0 0)' }, { clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }],
        { duration: 400, easing: ease },
      );
    } else {
      const h = p.scrollHeight;
      const run = p.animate([{ height: `${h}px` }, { height: '0px' }], { duration: 260, easing: ease });
      a.animate(
        [{ clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%)' }, { clipPath: 'polygon(0 0,100% 0,100% 0,0 0)' }],
        { duration: 260 },
      );
      run.onfinish = () => setShown(false);
    }
  }, [open]);

  return (
    <div className={`pk-acc__item${open ? ' is-open' : ''}`}>
      <h4 className="pk-acc__heading">
        <button
          type="button"
          className="pk-acc__head"
          id={`${base}-${item.id}-h`}
          aria-expanded={open}
          aria-controls={`${base}-${item.id}-p`}
          onClick={onToggle}
        >
          <span>{item.title}</span>
          <svg className="pk-acc__chev" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </h4>
      <div
        ref={panel}
        id={`${base}-${item.id}-p`}
        role="region"
        aria-labelledby={`${base}-${item.id}-h`}
        className="pk-acc__panel"
        hidden={!shown && !open}
      >
        <div ref={inner} className="pk-acc__inner">
          {item.children}
        </div>
      </div>
    </div>
  );
}

export function Accordion({ items, defaultOpen = [], className }: { items: AccordionItem[]; defaultOpen?: string[]; className?: string }) {
  const base = useId();
  const [open, setOpen] = useState<string[]>(defaultOpen);
  const toggle = (id: string) => setOpen((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  return (
    <div className={`pk-acc${className ? ` ${className}` : ''}`}>
      {items.map((item) => (
        <Panel key={item.id} item={item} base={base} open={open.includes(item.id)} onToggle={() => toggle(item.id)} />
      ))}
    </div>
  );
}
