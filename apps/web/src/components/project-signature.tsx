/**
 * A PROJECT'S OWN MARK.
 *
 * THE PROBLEM THIS SOLVES, stated the way the owner stated it: a shelf of six projects was six
 * identical rectangles in a dark field, and nothing on any of them said which project it was except
 * the name. Two of his were both called "Laundry Simulator". A shelf you have to READ rather than
 * RECOGNISE is a list with extra padding, and it is the reason the page looked unfinished even
 * though every card on it was correct.
 *
 * So each project gets a mark derived from its id. Three properties make it honest:
 *
 *   DETERMINISTIC — the same id draws the same mark forever, on every device, with no storage and
 *   no request. `Math.random()` is never called. A mark that changed between visits would be
 *   decoration; one that does not is identity, and identity is the entire point.
 *
 *   IT CLAIMS NOTHING. It is not a screenshot, not a preview, not a render of the place. It is a
 *   signature computed from an id, and it cannot drift out of date because it never described the
 *   contents in the first place. A thumbnail that silently goes stale is worse than no thumbnail.
 *
 *   IT IS THE SAME LANGUAGE AS THE REST OF THE PRODUCT. Flowing contour lines, because the landing
 *   page's hero is a flow field; the shelf and the front door should look like one company made
 *   both. Colour is spent the way this repository spends it — the surface is the card, the lines
 *   are ink, and exactly ONE line per mark is the accent.
 *
 * It is decorative and carries aria-hidden. The project's name is the accessible label and always
 * was; nothing here is content, and a screen reader is told nothing about it.
 */
import type { CSSProperties } from 'react';

/** FNV-1a. Chosen because it is short, stable across platforms, and has no dependencies. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32 — a small deterministic generator, seeded from the id and nothing else. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const W = 400;
const H = 104;

/** One flowing line across the band, sampled rather than hand-placed so every mark is smooth. */
function contour(rand: () => number, index: number, count: number): string {
  // Lines are distributed down the band with a little jitter, so they never read as a ruled page.
  const base = H * (0.18 + (0.7 * index) / Math.max(1, count - 1)) + (rand() - 0.5) * 9;
  const amp = 5 + rand() * 15;
  const phase = rand() * Math.PI * 2;
  const freq = 1.1 + rand() * 1.5;
  const tilt = (rand() - 0.5) * 16;

  const steps = 18;
  let d = '';
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * W;
    const y = base + tilt * t + Math.sin(phase + t * Math.PI * freq * 2) * amp * (0.45 + 0.55 * Math.sin(Math.PI * t));
    d += i === 0 ? `M${x.toFixed(1)} ${y.toFixed(1)}` : `L${x.toFixed(1)} ${y.toFixed(1)}`;
  }
  return d;
}

export interface ProjectSignatureProps {
  /** The project's id. The ONLY input — same id, same mark, always. */
  id: string;
  className?: string;
}

export function ProjectSignature({ id, className }: ProjectSignatureProps) {
  const rand = seeded(hash(id));
  const count = 5 + Math.floor(rand() * 4); // 5–8 lines: enough to differ, few enough to stay quiet
  const accentAt = Math.floor(rand() * count);

  const lines = [];
  for (let i = 0; i < count; i++) {
    const d = contour(rand, i, count);
    const isAccent = i === accentAt;
    lines.push(
      <path
        key={i}
        d={d}
        className={isAccent ? 'project-sig__line is-accent' : 'project-sig__line'}
        style={{ '--sig-o': (isAccent ? 0.72 : 0.1 + rand() * 0.22).toFixed(2) } as CSSProperties}
      />,
    );
  }

  // The one spot of light. Its position is seeded too, so the band's centre of gravity differs
  // between projects rather than every card glowing in the same place.
  const gx = (18 + rand() * 64).toFixed(1);
  const gy = (20 + rand() * 60).toFixed(1);

  return (
    <svg
      className={className ? `project-sig ${className}` : 'project-sig'}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <radialGradient id={`sigglow-${id}`} cx={`${gx}%`} cy={`${gy}%`} r="72%">
          <stop offset="0%" className="project-sig__glow-in" />
          <stop offset="100%" className="project-sig__glow-out" />
        </radialGradient>
      </defs>
      <rect width={W} height={H} fill={`url(#sigglow-${id})`} />
      <g className="project-sig__lines">{lines}</g>
    </svg>
  );
}
