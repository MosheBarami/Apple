// Eldora UI "Hacker Background" (MIT, eldoraui.site) — columns of characters falling behind a
// wait, re-drawn on a 2D canvas without the original's code.
//
// Used behind "Creating a pairing code": the characters are the pairing-code alphabet, so what
// rains is what the code is made of. The original's #0F0 is the app's accent, and the whole layer
// sits at low opacity (loading.css) — it is texture behind the sentence, never louder than it.
// Reduced motion draws nothing at all: a frozen rain is noise, not information.
import { useRef } from 'react';
import { useCanvasLoop } from './canvas-loop';
import './backdrops.css';

const ALPHABET = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const CELL = 14;

export function CodeRain({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasLoop(ref, () => {
    let drops: number[] = [];
    return {
      resize(width) {
        const columns = Math.ceil(width / CELL);
        drops = Array.from({ length: columns }, (_, i) => drops[i] ?? -Math.floor(Math.random() * 30));
      },
      frame({ ctx, width, height, color }) {
        // Fade what is there toward transparent rather than painting a background colour, so the
        // rain sits on whatever surface the box already has, in either theme.
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(0, 0, width, height);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = color;
        ctx.font = `${CELL - 3}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textBaseline = 'top';
        for (let i = 0; i < drops.length; i++) {
          const drop = drops[i] ?? 0;
          const y = drop * CELL;
          if (y >= 0) ctx.fillText(ALPHABET.charAt(Math.floor(Math.random() * ALPHABET.length)), i * CELL + 2, y);
          drops[i] = y > height && Math.random() > 0.96 ? 0 : drop + 1;
        }
      },
    };
  }, { fps: 16 });
  return <canvas ref={ref} className={`picks-backdrop picks-backdrop--rain${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
