// The one render loop the three canvas picks share (Hacker Background, Hyperspeed, ASCII Effect).
//
// It owns what each of them would otherwise get wrong on its own: sizing the backing store to the
// element at the device pixel ratio, running only while the canvas is on screen and the tab is
// visible, holding a frame rate cap (a background does not need 120fps on a laptop fan), and
// drawing ONE still frame instead of a loop for a reader who asked for less motion.
import { useEffect, type RefObject } from 'react';
import { lessMotion } from './motion';

export interface CanvasFrame {
  ctx: CanvasRenderingContext2D;
  /** CSS pixels. */
  width: number;
  height: number;
  /** Milliseconds since the loop started. */
  time: number;
  /** Milliseconds since the previous frame (0 on the first). */
  delta: number;
  /** The canvas element's computed `color`, so a picture can be drawn in a theme token. */
  color: string;
}

export interface CanvasPainter {
  /** Called when the size changes, before the next frame. */
  resize?: (width: number, height: number) => void;
  frame: (f: CanvasFrame) => void;
}

export function useCanvasLoop(
  ref: RefObject<HTMLCanvasElement>,
  make: () => CanvasPainter,
  { fps = 30, still = false }: { fps?: number; still?: boolean } = {},
) {
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const painter = make();
    const reduced = still || lessMotion();
    let width = 0;
    let height = 0;
    let raf = 0;
    let started = 0;
    let last = 0;
    let onScreen = true;

    const size = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      painter.resize?.(width, height);
    };

    const paint = (now: number) => {
      if (!started) started = now;
      painter.frame({ ctx, width, height, time: now - started, delta: last ? now - last : 0, color: getComputedStyle(canvas).color });
      last = now;
    };

    const tick = (now: number) => {
      raf = 0;
      if (!onScreen || document.hidden) return;
      if (!last || now - last >= 1000 / fps - 1) paint(now);
      raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (reduced) return;
      if (!raf) { last = 0; raf = requestAnimationFrame(tick); }
    };

    size();
    if (reduced) paint(performance.now());
    else start();

    const resize = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { size(); if (reduced) paint(performance.now()); })
      : null;
    resize?.observe(canvas);
    const seen = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        if (onScreen) start();
      })
      : null;
    seen?.observe(canvas);
    const onVisibility = () => { if (!document.hidden) start(); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      resize?.disconnect();
      seen?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
    };
    // `make` is a fresh closure every render by design; the loop is built once per mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, fps, still]);
}
