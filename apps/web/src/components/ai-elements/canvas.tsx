// AI Elements `canvas`, re-implemented for this app.
//
// Upstream (vercel/ai-elements, Apache-2.0, see ./NOTICE) is a React Flow surface: a dotted
// background you drag to pan and pinch or scroll to zoom, with nodes, edges, panels and controls
// laid on it. Export names follow upstream; the code is written here. This app installs no React
// Flow, so the pan and zoom are a CSS transform driven by pointer events, ctrl/⌘ + wheel (which is
// also what a trackpad pinch sends), and the keyboard.
//
// Keyboard, when the canvas has focus: arrows pan, + and - zoom, 0 fits everything in view. The
// things on the canvas are ordinary buttons in the tab order, so nothing is reachable only by mouse.
//
// Where it is used: the roadmap's Map view (components/roadmap/dependency-map.tsx).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react';
import { cn } from './lib/utils';
import './canvas.css';

const MIN = 0.4;
const MAX = 1.6;
/** The smallest zoom the map opens at, so its words stay readable. */
const OPEN_FLOOR = 0.9;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

interface View { x: number; y: number; k: number }

interface CanvasCtx {
  zoomIn: () => void;
  zoomOut: () => void;
  fit: () => void;
  /** Bring a point of the content into view without changing the zoom. */
  reveal: (x: number, y: number, w: number, h: number) => void;
  scale: number;
  min: number;
  max: number;
}
const CanvasContext = createContext<CanvasCtx | null>(null);

export function useCanvas(): CanvasCtx {
  const ctx = useContext(CanvasContext);
  if (!ctx) throw new Error('useCanvas must be used inside <Canvas>');
  return ctx;
}

export interface CanvasProps {
  /** The content's own size, in its own pixels. */
  width: number;
  height: number;
  /** The canvas's accessible name. */
  label: string;
  /** What pans and zooms: edges, nodes. */
  layer: ReactNode;
  /** What stays put over it: panels, controls. */
  children?: ReactNode;
  className?: string;
  /** A part of the content the first view keeps on screen when it all does not fit. */
  focus?: { x: number; y: number; w: number; h: number } | null;
}

export function Canvas({ width, height, label, layer, children, className, focus }: CanvasProps) {
  const port = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  // Button and keyboard moves glide; a drag follows the finger with no lag.
  const [glide, setGlide] = useState(false);
  const drag = useRef<{ id: number; x: number; y: number; vx: number; vy: number } | null>(null);

  /**
   * Fit the content in view. `floor` stops the first view shrinking text past reading size: a wide
   * plan opens readable at its left edge and is dragged, and the Fit button (no floor) shows all.
   */
  const focusRef = useRef(focus);
  focusRef.current = focus;
  const fitTo = useCallback((floor = MIN, keep: CanvasProps['focus'] = null) => {
    const el = port.current;
    if (!el || width === 0 || height === 0) return;
    const w = el.clientWidth;
    const k = clamp(Math.max(floor, Math.min(1, (w - 16) / width, (el.clientHeight - 16) / height)));
    let x = (w - width * k) / 2;
    if (width * k > w) {
      // Too wide to show whole: open at the left edge, or centred on the part that matters.
      x = keep ? w / 2 - (keep.x + keep.w / 2) * k : 8;
      x = Math.min(8, Math.max(w - 8 - width * k, x));
    }
    setView({ k, x, y: Math.max(8, (el.clientHeight - height * k) / 2) });
  }, [width, height]);
  const fitAll = useCallback(() => fitTo(), [fitTo]);
  const firstView = useCallback(() => fitTo(OPEN_FLOOR, focusRef.current), [fitTo]);
  const seen = useRef('');

  // The first view is set once per plan. A later selection does not yank the map around.
  useLayoutEffect(() => {
    const key = `${width}x${height}`;
    if (seen.current === key) return;
    seen.current = key;
    firstView();
  }, [firstView, width, height]);
  // Refit when the viewport itself changes width (a phone turned, a window resized) — and only
  // then: the observer's first report is the size just fitted to.
  const lastW = useRef(0);
  useEffect(() => {
    const el = port.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    lastW.current = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === lastW.current) return;
      lastW.current = el.clientWidth;
      firstView();
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [firstView]);

  /** Zoom by `f` around a point of the viewport (its centre by default). */
  const zoomBy = useCallback((f: number, cx?: number, cy?: number) => {
    const el = port.current;
    if (!el) return;
    const px = cx ?? el.clientWidth / 2;
    const py = cy ?? el.clientHeight / 2;
    setView((v) => {
      const k = clamp(v.k * f);
      return { k, x: px - ((px - v.x) * k) / v.k, y: py - ((py - v.y) * k) / v.k };
    });
  }, []);

  const moveGlide = (fn: () => void) => { setGlide(true); fn(); };

  // A wheel listener has to be non-passive to keep ctrl + wheel from zooming the whole page, and
  // React attaches wheel handlers as passive. A plain wheel is left alone: it scrolls the page.
  useEffect(() => {
    const el = port.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      setGlide(false);
      zoomBy(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomBy]);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    // Dragging starts on the background only; a press on a node is that node's click.
    if (e.button !== 0 || (e.target as HTMLElement).closest('button, a, input, [data-canvas-still]')) return;
    drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    setGlide(false);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    setView((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (drag.current?.id === e.pointerId) drag.current = null;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    const step = 48;
    const pan = (dx: number, dy: number) => moveGlide(() => setView((v) => ({ ...v, x: v.x + dx, y: v.y + dy })));
    if (e.key === 'ArrowLeft') pan(step, 0);
    else if (e.key === 'ArrowRight') pan(-step, 0);
    else if (e.key === 'ArrowUp') pan(0, step);
    else if (e.key === 'ArrowDown') pan(0, -step);
    else if (e.key === '+' || e.key === '=') moveGlide(() => zoomBy(1.2));
    else if (e.key === '-' || e.key === '_') moveGlide(() => zoomBy(1 / 1.2));
    else if (e.key === '0') moveGlide(fitAll);
    else return;
    e.preventDefault();
  };

  const reveal = useCallback((x: number, y: number, w: number, h: number) => {
    const el = port.current;
    if (!el) return;
    setView((v) => {
      const left = v.x + x * v.k;
      const top = v.y + y * v.k;
      const right = left + w * v.k;
      const bottom = top + h * v.k;
      let dx = 0;
      let dy = 0;
      if (left < 8) dx = 8 - left;
      else if (right > el.clientWidth - 8) dx = el.clientWidth - 8 - right;
      if (top < 8) dy = 8 - top;
      else if (bottom > el.clientHeight - 8) dy = el.clientHeight - 8 - bottom;
      return dx === 0 && dy === 0 ? v : { ...v, x: v.x + dx, y: v.y + dy };
    });
  }, []);

  // TABBING TO SOMETHING OFF-SCREEN BRINGS IT INTO VIEW. The browser's own answer would be to
  // scroll the clipped viewport, which moves the picture out from under the transform; that scroll
  // is undone and the view pans to the element instead.
  const onFocusInside = (e: FocusEvent<HTMLDivElement>) => {
    const el = e.target as HTMLElement;
    const host = port.current;
    if (!host || el === host || !(el.offsetParent instanceof HTMLElement) || !el.offsetParent.classList.contains('ai-canvas__layer')) return;
    host.scrollLeft = 0;
    host.scrollTop = 0;
    moveGlide(() => reveal(el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight));
  };

  const ctx: CanvasCtx = {
    zoomIn: () => moveGlide(() => zoomBy(1.2)),
    zoomOut: () => moveGlide(() => zoomBy(1 / 1.2)),
    fit: () => moveGlide(fitAll),
    reveal: (x, y, w, h) => moveGlide(() => reveal(x, y, w, h)),
    scale: view.k,
    min: MIN,
    max: MAX,
  };

  return (
    <CanvasContext.Provider value={ctx}>
      <div className={cn('ai-canvas', className)}>
        <div
          ref={port}
          className="ai-canvas__port"
          role="group"
          aria-label={`${label}. Drag or use the arrow keys to move around; plus and minus zoom, 0 fits it in view.`}
          aria-roledescription="map"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          onFocus={onFocusInside}
        >
          <div
            className={cn('ai-canvas__layer', glide && 'is-gliding')}
            style={{ width, height, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
            onTransitionEnd={(e) => { if (e.target === e.currentTarget) setGlide(false); }}
          >
            {layer}
          </div>
        </div>
        {children}
      </div>
    </CanvasContext.Provider>
  );
}
