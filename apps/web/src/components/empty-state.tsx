import type { ReactNode } from 'react';
import { EMPTY_STATES, type EmptyStateName, type EmptyStateSpec, type EmptyTone } from './empty-state-model';

/**
 * The renderer for the canonical empty, waiting and failed states.
 *
 * Deliberately thin, and holds no state vocabulary of its own: everything it can say
 * lives in `empty-state-model.ts`, which is where the tests are. A surface picks a
 * state; it cannot invent one here.
 */

const TONE_CLASS: Record<EmptyTone, string> = {
  creation: 'es--creation',
  studio: 'es--studio',
  proven: 'es--proven',
  future: 'es--future',
  failure: 'es--failure',
};

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
  return (
    <div
      className={`es ${TONE_CLASS[spec.tone]}`}
      data-canonical={spec.canonical}
      // A failure is announced; an empty shelf is not. Reading "Summon your first
      // project" to a screen-reader user as an alert would be noise.
      role={isFailure ? 'alert' : undefined}
    >
      {illustration ? <div className="es__art" aria-hidden="true">{illustration}</div> : null}
      <h2 className="es__title">{spec.title}</h2>
      {detail ?? (spec.body ? <p className="es__body">{spec.body}</p> : null)}
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
