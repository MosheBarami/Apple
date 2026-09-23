import type { ReactNode } from 'react';
import { EMPTY_STATES, type EmptyStateName, type EmptyStateSpec, type EmptyTone } from './empty-state-model';
import { RippleField } from './picks/thinking/ripple-field';
import { TileBurst } from './picks/thinking/tile-burst';
import './empty-state.css';

/**
 * The renderer for the canonical empty, waiting and failed states.
 *
 * Deliberately thin, and holds no state vocabulary of its own: everything it can say
 * lives in `empty-state-model.ts`, which is where the tests are. A surface picks a
 * state; it cannot invent one here.
 */

/**
 * THE MARK A STATE GETS WHEN ITS SURFACE BRINGS NONE (the owner's picks, 2026-09-23).
 *
 *   creation  Motion "Physical stagger": a plate of tiles a wave runs across — somewhere to build,
 *             and something to poke while it is empty.
 *   studio    Eldora "SVG Ripple Effect": rings reaching outward — Apple reaching for Studio.
 *
 * A failure, a finished roadmap and a future plan get no default mark: an alarm is not decorated,
 * and the surfaces that show the other two (the roadmap) bring their own. A surface's own
 * illustration always wins.
 */
function defaultArt(tone: EmptyTone): ReactNode {
  if (tone === 'creation') return <TileBurst />;
  if (tone === 'studio') return <RippleField size={96} rings={7} className="es__ripple" />;
  return null;
}

const TONE_CLASS: Record<EmptyTone, string> = {
  creation: 'es--creation',
  studio: 'es--studio',
  proven: 'es--proven',
  future: 'es--future',
  failure: 'es--failure',
};

/**
 * THE OVERRIDE ARRIVES AS A BARE STRING ABOUT AS OFTEN AS IT ARRIVES AS A NODE, and a bare string
 * dropped into this grid is a text node with no rule on it: `workspace.tsx` passes
 * `project.error.message` straight in, and it rendered at the inherited 16px in full `--ink`,
 * directly under a title, while every canonical body on every other screen is 14px `--muted`. The
 * most alarming sentence in the product was the one nobody had styled.
 *
 * An EMPTY string is treated as absent rather than wrapped, because a server that failed without
 * saying anything should fall back to the canonical sentence instead of drawing an empty paragraph
 * where the explanation was meant to be.
 */
function detailBody(detail: ReactNode): ReactNode {
  if (detail === undefined || detail === null) return null;
  if (typeof detail === 'string') return detail.trim() ? <p className="es__body">{detail}</p> : null;
  if (typeof detail === 'number') return <p className="es__body">{detail}</p>;
  return detail;
}

export interface EmptyStateProps {
  state: EmptyStateName;
  /** Overrides the canonical body when a surface knows something more specific —
   *  an API error, a place name. The TITLE is never overridable: it is the thing
   *  that keeps these states recognisable across the product. */
  detail?: ReactNode;
  /** One action, at most. Two competing calls to action on an empty screen is how
   *  these turn back into bespoke layouts. */
  action?: ReactNode;
  illustration?: ReactNode;
}

export function EmptyState({ state, detail, action, illustration }: EmptyStateProps) {
  // Widened to the interface rather than left as the const literal: `help` is present on some
  // states and not others, and reading an optional field off a union of literal object types is
  // an error TypeScript is right to raise.
  const spec: EmptyStateSpec = EMPTY_STATES[state];
  const isFailure = spec.tone === 'failure';
  const art = illustration ?? defaultArt(spec.tone);
  return (
    <div
      className={`es ${TONE_CLASS[spec.tone]}`}
      data-canonical={spec.canonical}
      // A failure is announced; an empty shelf is not. Reading "Summon your first
      // project" to a screen-reader user as an alert would be noise.
      role={isFailure ? 'alert' : undefined}
    >
      {art ? <div className="es__art" aria-hidden="true">{art}</div> : null}
      <h2 className="es__title">{spec.title}</h2>
      {detailBody(detail) ?? (spec.body ? <p className="es__body">{spec.body}</p> : null)}
      {action ? <div className="es__action">{action}</div> : null}
      {/* A real anchor in a new tab, for the reason failure.tsx gives: /docs belongs to the Astro
          site, and a router Link to it lands on not-found. */}
      {spec.help ? (
        <p className="es__help">
          <a href={spec.help.href} target="_blank" rel="noopener noreferrer">
            {spec.help.label}
          </a>
          <span className="gx-sr"> (opens in a new tab)</span>
        </p>
      ) : null}
    </div>
  );
}
