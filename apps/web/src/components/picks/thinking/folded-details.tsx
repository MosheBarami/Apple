// "Details", folded — the one way technical text (a server message, an error's own words) is kept
// out of a young creator's way and one click from whoever wants it.
//
// A native <details>/<summary>, so the keyboard, the disclosure role and find-in-page all work as
// the platform does them. What it adds is Animate UI "Collapsible"'s motion (height 0 <-> measured,
// opacity, y), with Thought Line's settle curve: the summary's click is taken over only to run the
// animation around the native open/close (./motion.ts). With reduced motion it opens and closes at
// once, exactly as a plain <details> does.
import { useRef, type MouseEvent, type ReactNode } from 'react';
import { collapse, expand } from './motion';
import './folded-details.css';

export function FoldedDetails({
  className,
  summary = 'Details',
  children,
}: {
  className?: string;
  summary?: ReactNode;
  children: ReactNode;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const ticket = useRef(0);

  const onToggleClick = (event: MouseEvent<HTMLElement>) => {
    const details = detailsRef.current;
    if (!details) return;
    event.preventDefault();
    const mine = ++ticket.current;
    if (details.open && details.dataset.closing !== 'true') {
      details.dataset.closing = 'true';
      void collapse(bodyRef.current).then(() => {
        if (ticket.current !== mine) return;
        delete details.dataset.closing;
        details.open = false;
      });
      return;
    }
    delete details.dataset.closing;
    details.open = true;
    expand(bodyRef.current);
  };

  return (
    <details ref={detailsRef} className={`picks-fold${className ? ` ${className}` : ''}`}>
      <summary className="picks-fold__summary" onClick={onToggleClick}>
        <span>{summary}</span>
        <svg className="picks-fold__chevron" viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true" focusable="false">
          <path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div ref={bodyRef} className="picks-fold__body">{children}</div>
    </details>
  );
}
