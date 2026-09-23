"use client";

// Local stand-in for `use-stick-to-bottom` (the package AI Elements' Conversation is built on),
// exposing the parts Conversation and the workspace use under the library's own names:
//
//   <StickToBottom>            the root; props are a div's, plus `initial`, `resize`, `contextRef`
//   <StickToBottom.Content>    the scroll element (`scrollClassName`) around the content (`className`)
//   useStickToBottomContext()  { isAtBottom, escapedFromLock, scrollToBottom, stopScroll, scrollRef, contentRef }
//
// WHAT "AT THE BOTTOM" MEANS IS NOT DECIDED HERE. It is `isNearBottom` from lib/follow-latest.ts —
// the same 90px slack the transcript has always used, with its reasons written down there — so the
// conversation cannot drift into a second, subtly different definition of the live edge.
//
// FOLLOWING IS A LOCK, and only the reader releases it. While locked, any growth of the content
// (a streamed delta, an image loading, a disclosure opening) is followed. The lock releases when
// the reader moves UP and is no longer near the end — never merely because the content grew under
// a smooth scroll that had not caught up yet, which is the race that makes naive followers let go
// of a streaming reply halfway down. It re-arms when the reader comes back within the slack, or
// when something calls `scrollToBottom()` (the jump control, and sending a message).
//
// MOTION. `"smooth"` is honoured only when the reader has not asked for reduced motion, and a jump
// longer than one screen is always instant: gliding through a whole history to reach its end is
// travel, not continuity.
import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type MutableRefObject,
  type ReactNode,
  type Ref,
} from 'react';
import { isNearBottom, type ScrollMetrics } from '../../lib/follow-latest';
import { cn } from './lib/utils';
import { useIsomorphicLayoutEffect } from './lib/use-isomorphic-layout-effect';
import './stick-to-bottom.css';

export type Animation = 'smooth' | 'instant';
export type ScrollToBottomOptions = Animation | { animation?: Animation };
export type ScrollToBottom = (options?: ScrollToBottomOptions) => Promise<boolean>;
export type StopScroll = () => void;

export interface StickToBottomContext {
  scrollRef: MutableRefObject<HTMLDivElement | null>;
  contentRef: MutableRefObject<HTMLDivElement | null>;
  scrollToBottom: ScrollToBottom;
  stopScroll: StopScroll;
  /** Following the live edge — the lock, not merely the current scroll position. */
  isAtBottom: boolean;
  /** The reader scrolled away from the edge on purpose. */
  escapedFromLock: boolean;
}

const Context = createContext<StickToBottomContext | null>(null);

export function useStickToBottomContext(): StickToBottomContext {
  const context = useContext(Context);
  if (!context) throw new Error('useStickToBottomContext must be used within <StickToBottom>');
  return context;
}

/**
 * The lock after one scroll event. Pure, so the rule above is testable without a browser.
 *
 * Near the end re-arms it. Leaving the end releases it only when the reader moved UP: a scroll
 * event that moved down (a smooth follow still travelling towards content that grew again) keeps
 * whatever the lock already was.
 */
export function lockAfterScroll(locked: boolean, previousTop: number, metrics: ScrollMetrics): boolean {
  if (isNearBottom(metrics)) return true;
  if (metrics.scrollTop < previousTop - 1) return false;
  return locked;
}

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function behaviourFor(requested: Animation, el: HTMLElement): ScrollBehavior {
  if (requested === 'instant' || prefersReducedMotion()) return 'auto';
  const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
  return distance > el.clientHeight ? 'auto' : 'smooth';
}

function animationOf(options: ScrollToBottomOptions | undefined, fallback: Animation): Animation {
  if (!options) return fallback;
  return typeof options === 'string' ? options : (options.animation ?? fallback);
}

export type StickToBottomProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** How the first scroll to the end moves; `false` leaves the reader at the top. */
  initial?: Animation | boolean;
  /** How following a growing transcript moves. */
  resize?: Animation;
  contextRef?: Ref<StickToBottomContext>;
  children?: ReactNode | ((context: StickToBottomContext) => ReactNode);
};

function StickToBottomRoot(
  { initial = 'smooth', resize = 'smooth', contextRef, children, ...props }: StickToBottomProps,
  forwardedRef: Ref<HTMLDivElement>,
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const locked = useRef(initial !== false);
  const lastTop = useRef(0);
  const lastHeight = useRef<number | null>(null);
  const [isAtBottom, setIsAtBottom] = useState(initial !== false);
  const [escapedFromLock, setEscapedFromLock] = useState(false);

  const setLock = useCallback((next: boolean) => {
    locked.current = next;
    setIsAtBottom(next);
    setEscapedFromLock(!next);
  }, []);

  const jump = useCallback((animation: Animation) => {
    const el = scrollRef.current;
    if (!el) return;
    const behavior = behaviourFor(animation, el);
    if (behavior === 'auto') el.scrollTop = el.scrollHeight;
    else el.scrollTo({ top: el.scrollHeight, behavior });
  }, []);

  const scrollToBottom = useCallback<ScrollToBottom>(
    (options) => {
      setLock(true);
      jump(animationOf(options, resize));
      return Promise.resolve(true);
    },
    [jump, resize, setLock],
  );

  const stopScroll = useCallback<StopScroll>(() => setLock(false), [setLock]);

  // The reader's scrolling is the only thing that can release the lock.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    lastTop.current = el.scrollTop;
    const onScroll = () => {
      const next = lockAfterScroll(locked.current, lastTop.current, el);
      lastTop.current = el.scrollTop;
      if (next !== locked.current) setLock(next);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [setLock]);

  // NO RUBBER BAND AT EITHER END (GSAP's stopOverscroll() helper, re-implemented; no GSAP code).
  // `overscroll-behavior:contain` (stick-to-bottom.css) is enough everywhere except iOS Safari,
  // which ignores it: a flick that starts exactly at the top or the bottom of the transcript drags
  // the whole page — composer and all — instead. Starting every touch one pixel inside the ends
  // means there is always room to scroll, so the gesture stays in the transcript. One pixel off the
  // bottom is well inside the lock's slack, so following is not released by it.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onTouchStart = () => {
      const max = el.scrollHeight - el.clientHeight;
      if (max < 2) return;
      if (el.scrollTop <= 0) el.scrollTop = 1;
      else if (el.scrollTop >= max) el.scrollTop = max - 1;
    };
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    return () => el.removeEventListener('touchstart', onTouchStart);
  }, []);

  // Growth is followed while locked. The first measurement is the initial scroll. The scroll
  // element is watched too: when the composer below it grows a line, the viewport shrinks and the
  // newest line would slide under it without any content having changed.
  useIsomorphicLayoutEffect(() => {
    const content = contentRef.current;
    const viewport = scrollRef.current;
    if (!content || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      const first = lastHeight.current === null;
      lastHeight.current = content.offsetHeight;
      if (first) {
        if (initial !== false) jump(initial === true ? 'instant' : initial);
        return;
      }
      if (locked.current) jump(resize);
    });
    observer.observe(content);
    if (viewport) observer.observe(viewport);
    return () => observer.disconnect();
  }, [initial, jump, resize]);

  const context = useMemo<StickToBottomContext>(
    () => ({ contentRef, escapedFromLock, isAtBottom, scrollRef, scrollToBottom, stopScroll }),
    [escapedFromLock, isAtBottom, scrollToBottom, stopScroll],
  );

  useImperativeHandle(contextRef, () => context, [context]);

  return (
    <Context.Provider value={context}>
      <div ref={forwardedRef} {...props}>
        {typeof children === 'function' ? children(context) : children}
      </div>
    </Context.Provider>
  );
}

export type StickToBottomContentProps = Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  /** Classes for the element that scrolls. `className` goes on the content inside it. */
  scrollClassName?: string;
  children?: ReactNode | ((context: StickToBottomContext) => ReactNode);
};

function Content({ children, scrollClassName, ...props }: StickToBottomContentProps) {
  const context = useStickToBottomContext();
  return (
    <div ref={context.scrollRef} className={cn('ai-stick-to-bottom__scroll', scrollClassName)}>
      <div ref={context.contentRef} {...props}>
        {typeof children === 'function' ? children(context) : children}
      </div>
    </div>
  );
}

export const StickToBottom = Object.assign(forwardRef(StickToBottomRoot), { Content });
