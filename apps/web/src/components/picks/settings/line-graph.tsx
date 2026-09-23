// Credits spent per day, as a line you can run your finger along.
//
// Pick: Motion "Line graph" (Motion+ licence — re-implemented, nothing copied): the line draws itself
// in when it scrolls into view, the area under it is lightly filled, and moving the pointer across
// snaps a dot and a guide line to the nearest day while the big figure above rolls to that day's
// number (and back to the total when the pointer leaves).
//
// Keyboard too: the chart is one focusable control; Left/Right walk the days, Home/End jump to the
// ends, and the day's figure is the slider's value text, so a screen reader reads it on each step.
import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { formatNumber } from '../../../lib/format';
import { reducedMotion } from './motion';
import { RollingNumber } from './rolling-number';
import './line-graph.css';

export interface LinePoint {
  day: string; // YYYY-MM-DD
  credits: number;
}

const W = 600;
const H = 150;

const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function LineGraph({ series, totalLabel }: { series: LinePoint[]; totalLabel: string }) {
  const [at, setAt] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const max = Math.max(10, ...series.map((s) => s.credits));
  const total = series.reduce((n, s) => n + s.credits, 0);
  const n = series.length;
  const pt = (i: number) => [n > 1 ? (i / (n - 1)) * W : W / 2, H - ((series[i]?.credits ?? 0) / max) * (H - 8) - 4] as const;
  const d = series.map((_, i) => `${i === 0 ? 'M' : 'L'}${pt(i)[0].toFixed(1)} ${pt(i)[1].toFixed(1)}`).join(' ');
  const area = `${d} L${W} ${H} L0 ${H} Z`;

  // Draw the line in once, when it is first seen.
  useEffect(() => {
    const p = svg.current;
    const b = box.current;
    if (!p || !b || reducedMotion() || typeof p.animate !== 'function') return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        io.disconnect();
        p.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 1200, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'backwards' });
      },
      { threshold: 0.6 },
    );
    io.observe(b);
    return () => io.disconnect();
  }, []);

  const fromPointer = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    if (r.width === 0 || n === 0) return;
    const f = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    setAt(Math.round(f * (n - 1)));
  };

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const cur = at ?? n - 1;
    const next =
      e.key === 'ArrowLeft' ? Math.max(0, cur - 1)
      : e.key === 'ArrowRight' ? Math.min(n - 1, cur + 1)
      : e.key === 'Home' ? 0
      : e.key === 'End' ? n - 1
      : e.key === 'Escape' ? null
      : undefined;
    if (next === undefined) return;
    e.preventDefault();
    setAt(next);
  };

  const hovered = at !== null ? series[at] : undefined;
  const [hx, hy] = at !== null ? pt(at) : [0, 0];

  return (
    <div className="pk-line">
      <div className="pk-line__readout">
        <span className="pk-line__label">{hovered ? dayLabel(hovered.day) : totalLabel}</span>
        <span className="pk-line__figure">
          <RollingNumber value={formatNumber(hovered ? hovered.credits : total)} />
          <span className="pk-line__unit">Credits</span>
        </span>
      </div>
      <div
        ref={box}
        className="pk-line__chart"
        role="slider"
        tabIndex={0}
        aria-label="Credits spent per day. Use the arrow keys to move between days."
        aria-valuemin={0}
        aria-valuemax={Math.max(0, n - 1)}
        aria-valuenow={at ?? n - 1}
        aria-valuetext={hovered ? `${dayLabel(hovered.day)}: ${hovered.credits} Credits` : `${totalLabel}: ${total} Credits`}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={() => setAt(null)}
        onKeyDown={onKey}
        onBlur={() => setAt(null)}
      >
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
          <line x1={0} x2={W} y1={H - 0.5} y2={H - 0.5} className="pk-line__base" />
          <path d={area} className="pk-line__area" />
          <path d={d} className="pk-line__path" />
        </svg>
        {hovered && (
          <>
            <span className="pk-line__guide" style={{ left: `${(hx / W) * 100}%` }} aria-hidden="true" />
            <span className="pk-line__dot" style={{ left: `${(hx / W) * 100}%`, top: `${(hy / H) * 100}%` }} aria-hidden="true" />
          </>
        )}
      </div>
      <div className="pk-line__axis" aria-hidden="true">
        <span>{series[0] ? dayLabel(series[0].day) : ''}</span>
        <span>{series[n - 1] ? dayLabel(series[n - 1]!.day) : ''}</span>
      </div>
    </div>
  );
}
