// A chain-of-thought step's mark, by status.
//
//   pending   a hollow ring — nothing has happened yet, so nothing is filled.
//   active    React Bits "Thought Line"'s pulse: a dot that breathes while the step runs.
//   complete  Motion "To-do list"'s check: the ring settles in with a small overshoot and the tick
//             draws itself in. Re-implemented from the behaviour (Motion's example is licensed
//             LicenseRef-Motion-Plus, so none of its code is used): CSS keyframes on
//             stroke-dashoffset and scale. The resting state is the finished drawing, so with the
//             animation removed (reduced motion) the mark is simply complete.
//
// A step's row is keyed by its status (ws/thinking.tsx), so a step turning complete remounts and
// the tick draws once, at the moment it actually finished.
import './step-mark.css';

export function StepMark({ status = 'complete', className }: { status?: 'complete' | 'active' | 'pending'; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`picks-step picks-step--${status}${className ? ` ${className}` : ''}`}
    >
      {status === 'pending' && <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.2" />}
      {status === 'active' && (
        <>
          <circle className="picks-step__halo" cx="8" cy="8" r="3" fill="currentColor" />
          <circle className="picks-step__dot" cx="8" cy="8" r="3" fill="currentColor" />
        </>
      )}
      {status === 'complete' && (
        <g className="picks-step__done">
          <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2" className="picks-step__ring" />
          <path d="M5.3 8.3l1.8 1.8 3.6-4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="picks-step__tick" />
        </g>
      )}
    </svg>
  );
}
