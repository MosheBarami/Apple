// Componentry "ASCII Effect" (MIT, componentry.fun), its "glitch" variant, as the crash card's mark.
//
// An apple is drawn into an offscreen canvas and read back cell by cell; each cell's brightness
// picks a character from a ramp (" .:-=+*#%@"), and the characters are drawn in the ink colour.
// Every couple of seconds a few horizontal bands slip sideways and scramble for a moment — the
// apple, stumbling. That is the joke the card's title makes ("The apple stumbled"), drawn.
//
// Re-drawn from the original's approach (sample, map to a ramp, band-shift glitch); its image
// pipeline (dithering, flow fields, pointer response) is not needed for a 120px mark. Reduced
// motion draws the apple once, still, with no glitch. aria-hidden: the title says what happened.
import { useRef } from 'react';
import { useCanvasLoop } from './canvas-loop';
import './ascii-mark.css';

const RAMP = ' .:-=+*#%@';
const CELL = 6;

/** The apple, drawn once into an offscreen canvas at the grid's own resolution. */
function sampleApple(columns: number, rows: number): number[] {
  const source = document.createElement('canvas');
  source.width = columns;
  source.height = rows;
  const c = source.getContext('2d', { willReadFrequently: true });
  if (!c) return [];
  const w = columns;
  const h = rows;
  const light = c.createRadialGradient(w * 0.36, h * 0.42, 1, w * 0.5, h * 0.58, w * 0.62);
  light.addColorStop(0, '#fff');
  light.addColorStop(0.55, '#8a8a8a');
  light.addColorStop(1, '#101010');
  c.fillStyle = light;
  // Two overlapping lobes make the body; the notch at the top is where they meet.
  c.beginPath();
  c.ellipse(w * 0.36, h * 0.6, w * 0.27, h * 0.32, 0, 0, Math.PI * 2);
  c.ellipse(w * 0.64, h * 0.6, w * 0.27, h * 0.32, 0, 0, Math.PI * 2);
  c.fill();
  // Stem and leaf.
  c.fillStyle = '#9a9a9a';
  c.fillRect(w * 0.48, h * 0.12, Math.max(1, w * 0.05), h * 0.2);
  c.beginPath();
  c.ellipse(w * 0.64, h * 0.17, w * 0.13, h * 0.06, -0.5, 0, Math.PI * 2);
  c.fill();
  const data = c.getImageData(0, 0, w, h).data;
  const out: number[] = [];
  for (let i = 0; i < w * h; i++) out.push((data[i * 4] ?? 0) / 255);
  return out;
}

export function AsciiMark({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useCanvasLoop(ref, () => {
    let columns = 0;
    let rows = 0;
    let lum: number[] = [];
    let nextGlitch = 1800;
    let glitchUntil = 0;
    let bands = new Map<number, number>();
    return {
      resize(width, height) {
        columns = Math.floor(width / CELL);
        rows = Math.floor(height / CELL);
        lum = sampleApple(columns, rows);
      },
      frame({ ctx, width, height, time, color }) {
        if (time >= nextGlitch) {
          glitchUntil = time + 140;
          nextGlitch = time + 1800 + Math.random() * 1600;
          bands = new Map();
          const count = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < count; i++) bands.set(Math.floor(Math.random() * rows), Math.round((Math.random() - 0.5) * 6));
        }
        const glitching = time < glitchUntil;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = color;
        ctx.font = `${CELL + 1}px ui-monospace, SFMono-Regular, Menlo, monospace`;
        ctx.textBaseline = 'top';
        for (let y = 0; y < rows; y++) {
          const shift = glitching ? bands.get(y) ?? 0 : 0;
          for (let x = 0; x < columns; x++) {
            const v = lum[y * columns + x] ?? 0;
            if (v < 0.06) continue;
            const scrambled = glitching && shift !== 0 && Math.random() > 0.5;
            const char = scrambled ? RAMP.charAt(1 + Math.floor(Math.random() * (RAMP.length - 1))) : RAMP.charAt(Math.min(RAMP.length - 1, Math.floor(v * RAMP.length)));
            ctx.globalAlpha = 0.35 + v * 0.65;
            ctx.fillText(char, (x + shift) * CELL, y * CELL);
          }
        }
        ctx.globalAlpha = 1;
      },
    };
  }, { fps: 24 });
  return <canvas ref={ref} className={`picks-ascii${className ? ` ${className}` : ''}`} aria-hidden="true" />;
}
