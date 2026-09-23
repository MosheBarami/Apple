// Where you are in a short sequence: numbered dots joined by lines that fill as you go.
//
// Pick: React Bits "Stepper" (MIT + Commons Clause — re-implemented, not copied): the current step
// is a filled dot, finished steps draw a check, the connector behind a finished step fills, and
// the step's content slides in from the side it came from. Used by the onboarding tour card.
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { reducedMotion } from './motion';
import './stepper.css';

export function StepDots({ count, current, label }: { count: number; current: number; label: string }) {
  return (
    <ol className="pk-steps" aria-label={label}>
      {Array.from({ length: count }, (_, i) => {
        const state = i < current ? 'done' : i === current ? 'now' : 'next';
        return (
          <li key={i} className={`pk-steps__item is-${state}`} aria-current={state === 'now' ? 'step' : undefined}>
            <span className="pk-steps__dot">
              {state === 'done' ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 13l4 4L19 7" pathLength={1} />
                </svg>
              ) : state === 'now' ? (
                <span className="pk-steps__core" aria-hidden="true" />
              ) : (
                <span className="pk-steps__num" aria-hidden="true">
                  {i + 1}
                </span>
              )}
              <span className="pk-steps__sr">
                Step {i + 1}
                {state === 'done' ? ', done' : state === 'now' ? ', current' : ''}
              </span>
            </span>
            {i < count - 1 && (
              <span className="pk-steps__line" aria-hidden="true">
                <span className="pk-steps__line-fill" />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Slides new content in from the direction of travel when `stepKey` changes. */
export function StepSlide({ stepKey, index, children }: { stepKey: string; index: number; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const last = useRef({ key: stepKey, index });
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = { key: stepKey, index };
    if (prev.key === stepKey || !box.current || reducedMotion() || typeof box.current.animate !== 'function') return;
    const dir = index >= prev.index ? 1 : -1;
    box.current.animate(
      [
        { transform: `translateX(${dir * 24}px)`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 360, easing: 'cubic-bezier(.23,1,.32,1)' },
    );
  }, [stepKey, index]);
  return (
    <div ref={box} className="pk-step-slide">
      {children}
    </div>
  );
}
