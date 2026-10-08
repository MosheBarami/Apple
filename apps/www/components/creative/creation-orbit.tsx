"use client";
import { useEffect, useRef } from "react";

/** A small, live material study for the workspace. Decorative, never build progress. */
export function CreationOrbit({
  className = "",
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }
    const reduce = matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0,
      height = 0,
      frame = 0,
      previous = 0,
      phase = 0;
    let visible = true,
      targetX = 0,
      targetY = 0,
      pointerX = 0,
      pointerY = 0;
    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const radius = Math.min(width, height) * 0.25;
      const cx = width / 2,
        cy = height / 2;
      const dark = document.documentElement.classList.contains("dark");
      const halo = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius * 2.2);
      halo.addColorStop(0, dark ? "#8b70ff20" : "#b2a5ff32");
      halo.addColorStop(1, "#b2a5ff00");
      ctx.fillStyle = halo;
      ctx.fillRect(0, 0, width, height);
      const tiltX = 0.72 + pointerY * 0.18,
        tiltY = phase * 0.14 + pointerX * 0.24;
      const project = (x: number, y: number, z: number) => {
        const xx = x * Math.cos(tiltY) - z * Math.sin(tiltY);
        const zz = x * Math.sin(tiltY) + z * Math.cos(tiltY);
        const yy = y * Math.cos(tiltX) - zz * Math.sin(tiltX);
        const depth = y * Math.sin(tiltX) + zz * Math.cos(tiltX);
        const scale = 3.6 / (3.6 + depth);
        return {
          scale,
          x: cx + xx * radius * scale,
          y: cy + yy * radius * scale,
          z: depth,
        };
      };
      // Three elliptical paths are the construction lines around the sculptural core.
      for (let ring = 0; ring < 3; ring++) {
        ctx.beginPath();
        for (let i = 0; i <= 100; i++) {
          const t = (i / 100) * Math.PI * 2;
          const p = project(
            Math.cos(t) * 1.45,
            Math.sin(t) * 0.4 + (ring - 1) * 0.19,
            Math.sin(t) * 1.45
          );
          if (i) {
            ctx.lineTo(p.x, p.y);
          } else {
            ctx.moveTo(p.x, p.y);
          }
        }
        ctx.strokeStyle = dark ? "#c1b8ff22" : "#7566b925";
        ctx.lineWidth = 0.7;
        ctx.stroke();
      }
      // Individually shaded beads form a continuous twisted sculpture in real 3D projection.
      const beads = Array.from({ length: compact ? 54 : 82 }, (_, i) => {
        const t = (i / (compact ? 54 : 82)) * Math.PI * 2;
        const r = 0.74 + Math.cos(t * 3 + phase * 0.35) * 0.16;
        const p = project(
          Math.cos(t) * r,
          Math.sin(t * 3 + phase * 0.35) * 0.38,
          Math.sin(t) * r
        );
        return {
          ...p,
          hue: 244 + Math.sin(t) * 22,
          size: radius * 0.135 * p.scale,
        };
      }).sort((a, b) => b.z - a.z);
      for (const p of beads) {
        const g = ctx.createRadialGradient(
          p.x - p.size * 0.4,
          p.y - p.size * 0.5,
          p.size * 0.08,
          p.x,
          p.y,
          p.size
        );
        g.addColorStop(0, `hsl(${p.hue} 90% 94%)`);
        g.addColorStop(0.3, `hsl(${p.hue} 85% 77%)`);
        g.addColorStop(0.72, `hsl(${p.hue} 66% 59%)`);
        g.addColorStop(1, `hsl(${p.hue} 62% 34%)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let i = 0; i < 5; i++) {
        const t = phase * 0.3 + (i * Math.PI * 2) / 5;
        const p = project(
          Math.cos(t) * 1.4,
          Math.sin(t * 2) * 0.45,
          Math.sin(t) * 1.4
        );
        ctx.fillStyle = i % 2 ? "#bba5fd" : "#85b9ec";
        ctx.beginPath();
        ctx.arc(p.x, p.y, (i % 2 ? 3.5 : 2.2) * p.scale, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const tick = (now: number) => {
      frame = 0;
      if (!visible || document.hidden || reduce.matches) {
        return;
      }
      if (now - previous >= 32) {
        phase += Math.min((now - previous) / 1000, 0.05);
        previous = now;
        pointerX += (targetX - pointerX) * 0.06;
        pointerY += (targetY - pointerY) * 0.06;
        render();
      }
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!frame && visible && !document.hidden && !reduce.matches) {
        previous = performance.now();
        frame = requestAnimationFrame(tick);
      } else if (reduce.matches) {
        cancelAnimationFrame(frame);
        frame = 0;
        render();
      }
    };
    const resize = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
      start();
    });
    resize.observe(canvas);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        start();
      } else {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    });
    observer.observe(canvas);
    const move = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      targetX = (e.clientX - r.left) / r.width - 0.5;
      targetY = (e.clientY - r.top) / r.height - 0.5;
    };
    const leave = () => {
      targetX = 0;
      targetY = 0;
    };
    const theme = new MutationObserver(render);
    theme.observe(document.documentElement, {
      attributeFilter: ["class"],
      attributes: true,
    });
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerleave", leave);
    reduce.addEventListener("change", start);
    document.addEventListener("visibilitychange", start);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
      theme.disconnect();
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerleave", leave);
      reduce.removeEventListener("change", start);
      document.removeEventListener("visibilitychange", start);
    };
  }, [compact]);
  return (
    <canvas
      aria-hidden="true"
      className={`creation-orbit ${className}`}
      ref={canvasRef}
    />
  );
}
