// The roadmap's small vocabulary: a weight mark for complexity, a node mark
// per readiness state, and the empty-state mark.
//
// Two rules from DESIGN-SPEC hold here. Everything is stroked geometry in the
// product's own hexagon family — no characters, nothing that blinks. And status
// is never carried by colour alone: each readiness state has its own node
// shape, its own stroke treatment and its own written label, so the plan reads
// the same in greyscale as it does in colour.
//
// Colour means one thing on this page and it is not decoration: the warm end of
// the palette is effort. A small milestone is green, a medium one amber, a
// large one ember. The scan reports complexity for every milestone, so this is
// a real property of the data rather than a category invented to have something
// to colour.
import type { MilestoneComplexity, Readiness } from './model';

/* ------------------------------------------------------------ complexity -- */

export const COMPLEXITY: Record<MilestoneComplexity, { label: string; accent: string; weight: 1 | 2 | 3 }> = {
  small: { label: 'Small', accent: 'var(--good)', weight: 1 },
  medium: { label: 'Medium', accent: 'var(--warn)', weight: 2 },
  large: { label: 'Large', accent: 'var(--acc-ember)', weight: 3 },
};

const SMALL_HEX = 'M5 0.9l3.55 2.05v4.1L5 9.1 1.45 7.05v-4.1z';

/**
 * Three slots, filled to the milestone's weight. A glance gives the size
 * without reading, and the written label beside it gives it without colour.
 */
export function ComplexityMark({ complexity, size = 9 }: { complexity: MilestoneComplexity; size?: number }) {
  const weight = COMPLEXITY[complexity].weight;
  return (
    <span className="rm-weight" aria-hidden="true">
      {[1, 2, 3].map((slot) => (
        <svg key={slot} width={size} height={size} viewBox="0 0 10 10" fill="none" focusable="false">
          <path
            d={SMALL_HEX}
            stroke="currentColor"
            strokeWidth="1.1"
            strokeLinejoin="round"
            fill={slot <= weight ? 'currentColor' : 'none'}
            fillOpacity={slot <= weight ? 0.9 : 0}
            opacity={slot <= weight ? 1 : 0.35}
          />
        </svg>
      ))}
    </span>
  );
}

/* -------------------------------------------------------------- readiness -- */

export const READINESS_LABEL: Record<Readiness, string> = {
  landed: 'Landed',
  'in-progress': 'In progress',
  ready: 'Ready to build',
  waiting: 'Waiting',
};

const HEX = 'M10 1.6l7.3 4.2v8.4L10 18.4 2.7 14.2V5.8z';

/**
 * The node on the spine. Shape carries the state before colour does: a filled
 * hexagon with a tick has landed, a hexagon with a solid core is running now,
 * an outline with a hollow core is ready, and a dashed outline is waiting on
 * something else.
 */
export function ReadinessNode({ readiness, size = 20 }: { readiness: Readiness; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      className={`rm-node rm-node--${readiness}`}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={HEX}
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeDasharray={readiness === 'waiting' ? '2.6 2.4' : undefined}
        fill={readiness === 'landed' ? 'currentColor' : 'none'}
        fillOpacity={readiness === 'landed' ? 0.16 : 0}
      />
      {readiness === 'landed' && (
        <path d="M6.6 10.1l2.3 2.3 4.5-4.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      )}
      {readiness === 'in-progress' && <circle cx="10" cy="10" r="2.7" fill="currentColor" />}
      {readiness === 'ready' && <circle cx="10" cy="10" r="2.4" stroke="currentColor" strokeWidth="1.5" fill="none" />}
    </svg>
  );
}

/* ------------------------------------------------------------ empty state -- */

/**
 * Nothing planned yet: one carved hexagon on the spine and two blanks below it.
 * The same idea as the project shelf's `SummonIllustration`, drawn vertically
 * because this page reads downwards.
 */
export function EmptyRoadmapMark() {
  return (
    <svg width="132" height="150" viewBox="0 0 132 150" fill="none" aria-hidden="true" focusable="false">
      <path d="M66 30 V126" stroke="var(--line)" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M66 8 L84.2 18.5 V39.5 L66 50 L47.8 39.5 V18.5 Z"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
        strokeLinejoin="round"
        fill="none"
      />
      <path
        d="M66 8 V29 M66 29 L47.8 39.5 M66 29 L84.2 39.5"
        stroke="var(--line-strong)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M66 56 L82 65.2 V83.8 L66 93 L50 83.8 V65.2 Z"
        stroke="var(--line)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeDasharray="3 6"
        fill="none"
      />
      <path
        d="M66 100 L82 109.2 V127.8 L66 137 L50 127.8 V109.2 Z"
        stroke="var(--line)"
        strokeWidth="1.4"
        strokeLinejoin="round"
        strokeDasharray="3 6"
        fill="none"
      />
    </svg>
  );
}
