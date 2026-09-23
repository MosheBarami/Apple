// A slow, breathing orb behind the Apple mark on the sign-in screens.
//
// Pick: React Bits "Orb" (MIT + Commons Clause — re-implemented, not copied). Upstream is a WebGL
// shader of a hue-shifting, noise-warped sphere that brightens under the pointer. The account
// screens are monochrome, so this is the same idea in ink only, drawn with a plain 2D canvas: a few
// soft light pools orbit inside a circle at different speeds, a rim catches the light, and the
// pointer pulls the brightest pool toward it.
//
// It costs nothing when unseen: it stops when scrolled away or when the tab is hidden, and under
// reduced motion it paints one still frame.
import { useEffect, useRef } from 'react';
import { reducedMotion } from './motion';
import './orb.css';

export function Orb({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext('2d');
    if (!cv || !ctx) return;
    let raf = 0;
    let visible = true;
    let size = 0;
    const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5 };
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const resize = () => {
      const r = cv.getBoundingClientRect();
      size = Math.max(1, Math.min(r.width, r.height));
      cv.width = Math.round(size * dpr);
      cv.height = Math.round(size * dpr);
    };

    const rgb = () => {
      const m = getComputedStyle(cv).color.match(/\d+(\.\d+)?/g);
      return m ? `${m[0]},${m[1]},${m[2]}` : '250,250,250';
    };

    let inkNow = rgb();
    const themeWatch = new MutationObserver(() => {
      inkNow = rgb();
      if (reducedMotion()) draw(4000);
    });
    themeWatch.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

    const draw = (t: number) => {
      const w = cv.width;
      const c = w / 2;
      const R = w * 0.42;
      const ink = inkNow;
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      ctx.clearRect(0, 0, w, w);
      ctx.save();
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.clip();
      const pools = [
        { speed: 0.00021, orbit: 0.34, r: 0.9, a: 0.28 },
        { speed: -0.00033, orbit: 0.42, r: 0.7, a: 0.2 },
        { speed: 0.00047, orbit: 0.22, r: 0.55, a: 0.24 },
      ];
      pools.forEach((p, i) => {
        const ang = t * p.speed + i * 2.1;
        const pullX = i === 0 ? (pointer.x - 0.5) * R * 0.8 : 0;
        const pullY = i === 0 ? (pointer.y - 0.5) * R * 0.8 : 0;
        const x = c + Math.cos(ang) * R * p.orbit + pullX;
        const y = c + Math.sin(ang * 1.3) * R * p.orbit + pullY;
        const g = ctx.createRadialGradient(x, y, 0, x, y, R * p.r);
        g.addColorStop(0, `rgba(${ink},${p.a})`);
        g.addColorStop(1, `rgba(${ink},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, w);
      });
      ctx.restore();
      // The rim: a thin lit edge, brighter where the light pools sit.
      const rim = ctx.createLinearGradient(0, 0, w, w);
      rim.addColorStop(0, `rgba(${ink},.35)`);
      rim.addColorStop(0.5, `rgba(${ink},.06)`);
      rim.addColorStop(1, `rgba(${ink},.22)`);
      ctx.strokeStyle = rim;
      ctx.lineWidth = Math.max(1, w * 0.006);
      ctx.beginPath();
      ctx.arc(c, c, R, 0, Math.PI * 2);
      ctx.stroke();
    };

    const loop = (t: number) => {
      draw(t);
      if (visible && !document.hidden) raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      if (reducedMotion()) draw(4000);
      else raf = requestAnimationFrame(loop);
    };

    resize();
    start();
    const ro = new ResizeObserver(() => {
      resize();
      if (reducedMotion()) draw(4000);
    });
    ro.observe(cv);
    const io = new IntersectionObserver(([e]) => {
      visible = Boolean(e?.isIntersecting);
      if (visible) start();
    });
    io.observe(cv);
    const onVis = () => !document.hidden && visible && start();
    document.addEventListener('visibilitychange', onVis);
    const onMove = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      pointer.tx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
      pointer.ty = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      themeWatch.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);

  return <canvas ref={canvas} className={`pk-orb${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
