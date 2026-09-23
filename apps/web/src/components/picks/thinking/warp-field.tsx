// React Bits "Hyperspeed" — the feeling of it, without WebGL or three.js.
//
// The original is a shader road with light trails; what the owner picked it for is the rush of
// streaks toward you while you wait to arrive somewhere. That is re-drawn here as a 2D star-warp:
// points fly out of the centre, each drawn as a streak from where it was to where it is, brighter
// as it nears. No code is copied (React Bits adds the Commons Clause to MIT).
//
// Used behind the very first screen, "Waking the apple". That is an account screen, so the streaks
// are the ink colour only — no accent, no tint. Reduced motion draws nothing.
import { useRef } from 'react';
import { useCanvasLoop } from './canvas-loop';
import './backdrops.css';

interface Star { x: number; y: number; z: number; pz: number }
const COUNT = 140;
const DEPTH = 1000;

export function WarpField({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasLoop(ref, () => {
    const stars: Star[] = [];
    const seed = (star: Star, spread: number) => {
      star.x = (Math.random() - 0.5) * spread;
      star.y = (Math.random() - 0.5) * spread;
      star.z = DEPTH * (0.2 + Math.random() * 0.8);
      star.pz = star.z;
    };
    let spread = 1000;
    return {
      resize(width, height) {
        spread = Math.max(width, height) * 1.6;
        while (stars.length < COUNT) {
          const star = { x: 0, y: 0, z: 0, pz: 0 };
          seed(star, spread);
          stars.push(star);
        }
      },
      frame({ ctx, width, height, delta, color }) {
        ctx.clearRect(0, 0, width, height);
        ctx.strokeStyle = color;
        ctx.lineCap = 'round';
        const cx = width / 2;
        const cy = height / 2;
        const focal = Math.min(width, height) * 0.9;
        const speed = (delta || 16) * 0.55;
        for (const star of stars) {
          star.pz = star.z;
          star.z -= speed;
          if (star.z <= 1) { seed(star, spread); star.z = DEPTH; star.pz = DEPTH; continue; }
          const sx = cx + (star.x / star.z) * focal;
          const sy = cy + (star.y / star.z) * focal;
          const px = cx + (star.x / star.pz) * focal;
          const py = cy + (star.y / star.pz) * focal;
          if (sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) { seed(star, spread); continue; }
          const near = 1 - star.z / DEPTH;
          ctx.globalAlpha = 0.15 + near * 0.85;
          ctx.lineWidth = 0.6 + near * 1.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(sx, sy);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      },
    };
  }, { fps: 40 });
  return <canvas ref={ref} className={`picks-backdrop picks-backdrop--warp${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
