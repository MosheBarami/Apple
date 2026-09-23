// Motion "Physical stagger" (motion.dev/examples/js-staggered-grid), re-implemented: the example
// is licensed LicenseRef-Motion-Plus, so none of its code is used. A small baseplate of tiles; a
// wave radiates out from one tile — each tile dips (scale 1 -> .4 -> 1) and flashes the accent,
// delayed by its distance from the origin (60ms per tile, 0.7s each).
//
// It is the art of the "nothing here yet" states that invite making something (empty-state.tsx):
// a plate of blocks waiting to be built on. The wave runs once when the state appears, and again
// from any tile somebody clicks — a small thing to poke at on an empty screen. It is decoration
// (the whole art box is aria-hidden), so the tiles are not buttons and take no focus.
//
// Each wave remounts the plate (a new key), which restarts every tile's CSS animation from its own
// delay; nothing is animated by script. Reduced motion: a still plate.
import { useState, type CSSProperties, type MouseEvent } from 'react';
import './tile-burst.css';

const N = 7;
const CENTRE = Math.floor((N * N) / 2);

export function TileBurst({ className }: { className?: string }) {
  const [wave, setWave] = useState({ origin: CENTRE, n: 0 });
  const ox = wave.origin % N;
  const oy = Math.floor(wave.origin / N);

  const poke = (event: MouseEvent<HTMLSpanElement>) => {
    const index = Number((event.target as HTMLElement).dataset.tile);
    if (Number.isInteger(index)) setWave((w) => ({ origin: index, n: w.n + 1 }));
  };

  return (
    <span key={wave.n} className={`picks-tiles${className ? ` ${className}` : ''}`} onClick={poke}>
      {Array.from({ length: N * N }, (_, i) => {
        const distance = Math.hypot((i % N) - ox, Math.floor(i / N) - oy);
        return (
          <span
            key={i}
            data-tile={i}
            className="picks-tiles__tile"
            style={{ animationDelay: `${Math.round(distance * 60)}ms` } as CSSProperties}
          />
        );
      })}
    </span>
  );
}
