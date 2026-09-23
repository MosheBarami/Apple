// AN IMAGE APPLE MADE OPENS LARGER, FROM WHERE IT SITS.
//
// Two picks:
//   * AI Elements "image" — generated images and Studio renders shown as images in the reply;
//   * GSAP "Flip (reparent + expand)" — click the thumbnail and it grows into a full preview, then
//     shrinks back into its place. Re-implemented as FLIP with the Web Animations API: GSAP is not
//     installed and its licence is not one this repository vendors code under.
//
// The images themselves are drawn by the component registry (lib/generative-ui), which this file
// does not own and does not change. It wraps them: any <img> inside becomes a keyboard-reachable
// button named for what it shows, and opening it animates a copy from the thumbnail's rectangle to
// the middle of the window. The thumbnail is never moved out of the reply, so a failed animation or
// an unmounted reply can never lose it.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { canAnimate, SETTLE } from './motion';
import './expandable-images.css';

interface Opened {
  src: string;
  alt: string;
  from: DOMRect;
  thumb: HTMLImageElement;
}

function markImages(root: HTMLElement) {
  for (const img of root.querySelectorAll<HTMLImageElement>('img:not([data-pk-expand])')) {
    img.dataset.pkExpand = '';
    img.tabIndex = 0;
    img.setAttribute('role', 'button');
    img.setAttribute('aria-label', `Open larger: ${img.alt || 'image'}`);
  }
}

export function ExpandableImages({ className, children }: { className?: string; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [opened, setOpened] = useState<Opened | null>(null);

  // The registry mounts its images lazily (Suspense, and object URLs that arrive later), so new
  // ones are marked as they appear rather than once.
  useEffect(() => {
    const el = root.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    markImages(el);
    const observer = new MutationObserver(() => markImages(el));
    observer.observe(el, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const open = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLImageElement) || !target.hasAttribute('data-pk-expand')) return false;
    setOpened({ src: target.currentSrc || target.src, alt: target.alt, from: target.getBoundingClientRect(), thumb: target });
    return true;
  }, []);

  return (
    <div
      ref={root}
      className={className}
      onClick={(e) => {
        if (open(e.target)) e.preventDefault();
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && open(e.target)) e.preventDefault();
      }}
    >
      {children}
      {opened && <Lightbox opened={opened} onClosed={() => setOpened(null)} />}
    </div>
  );
}

function Lightbox({ opened, onClosed }: { opened: Opened; onClosed: () => void }) {
  const img = useRef<HTMLImageElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const closeBtn = useRef<HTMLButtonElement>(null);
  const closing = useRef(false);

  // FLIP in: the large image starts at the thumbnail's rectangle and plays to its own.
  const play = useCallback((reverse: boolean): Promise<void> => {
    const el = img.current;
    if (!el || !canAnimate(el)) return Promise.resolve();
    const to = el.getBoundingClientRect();
    const from = opened.thumb.isConnected ? opened.thumb.getBoundingClientRect() : opened.from;
    const start = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
    const frames = [{ transform: start }, { transform: 'none' }];
    const anim = el.animate(reverse ? frames.reverse() : frames, { duration: 380, easing: SETTLE, fill: 'forwards' });
    scrim.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, direction: reverse ? 'reverse' : 'normal', fill: 'forwards' });
    return anim.finished.then(() => undefined, () => undefined);
  }, [opened]);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    void play(true).then(() => {
      onClosed();
      opened.thumb.focus({ preventScroll: true });
    });
  }, [onClosed, opened.thumb, play]);

  useEffect(() => {
    closeBtn.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close();
      }
      // One control in the dialog, so Tab stays on it.
      if (e.key === 'Tab') {
        e.preventDefault();
        closeBtn.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="pk-lightbox" role="dialog" aria-modal="true" aria-label={opened.alt || 'Image'}>
      <div ref={scrim} className="pk-lightbox__scrim" onClick={close} />
      <img
        ref={img}
        className="pk-lightbox__img"
        src={opened.src}
        alt={opened.alt}
        onClick={close}
        onLoad={() => void play(false)}
      />
      <button ref={closeBtn} type="button" className="pk-lightbox__close" onClick={close} aria-label="Close the larger image">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>,
    document.body,
  );
}
