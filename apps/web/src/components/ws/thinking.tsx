// THE STATUS LINE: what Apple is doing right now, in one friendly sentence (owner decision D-THINK-1).
//
// While a run is live the turn shows ONE line: a soft animated orb and a few plain words —
// "Editing the shop", "Placing things around the map". When the next step starts, the old words
// blur and slide away and the new ones blur and slide in; nothing is appended, so the steps never
// pile up into a list. There is nothing to open: no tool names, arguments, paths, JSON, durations
// or traces, because the people using this are young creators, not engineers. What the line says
// is decided in lib/live-status.ts, where a test can reach it.
//
// A finished run keeps at most one quiet line ("Built and scripted your game"); a run that failed
// or stopped says so once, in the turn's outcome row (outcome-model.ts), not here.
//
// Motion: the morph and the orb are CSS animations, and both stop for a reader who asked for less
// motion (the media query and the app's own `.motion-reduced`), leaving a plain swap.
import { useEffect, useRef, useState } from 'react';
import type { AgentStatus } from '../../lib/use-project-socket';
import { doneSummary, livePhrase } from '../../lib/live-status';
import type { ActivityRun } from './activity-model';
import { Shimmer } from '../ai-elements/shimmer';
// The Shimmer's own styles live beside the vendored Reasoning, which this surface no longer mounts.
import '../ai-elements/reasoning.css';
import './thinking.css';

/** How long a phrase stays before the next may replace it, so fast steps read instead of flicker. */
const DWELL_MS = 900;

/** The newest phrase, but never sooner than DWELL_MS after the last change. Skips the ones between. */
function useSteadyPhrase(phrase: string): string {
  const [shown, setShown] = useState(phrase);
  const since = useRef(Date.now());
  useEffect(() => {
    if (phrase === shown) return;
    const wait = Math.max(0, since.current + DWELL_MS - Date.now());
    const id = window.setTimeout(() => {
      since.current = Date.now();
      setShown(phrase);
    }, wait);
    return () => window.clearTimeout(id);
  }, [phrase, shown]);
  return shown;
}

/** The words, morphing: the previous phrase leaves while the new one arrives in the same place. */
function MorphingWords({ phrase }: { phrase: string }) {
  const [state, setState] = useState({ current: phrase, leaving: null as string | null, n: 0 });
  if (state.current !== phrase) setState({ current: phrase, leaving: state.current, n: state.n + 1 });

  // The line's width follows the words smoothly instead of jumping.
  const wordsRef = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState<number | undefined>(undefined);
  useEffect(() => {
    const el = wordsRef.current?.querySelector<HTMLElement>('.apple-status__phrase.is-entering');
    if (el) setWidth(el.offsetWidth);
  }, [state.current]);

  return (
    <span ref={wordsRef} className="apple-status__words" style={width ? { width } : undefined}>
      {state.leaving && (
        <span
          key={`leave-${state.n}`}
          className="apple-status__phrase is-leaving"
          aria-hidden="true"
          onAnimationEnd={() => setState((s) => ({ ...s, leaving: null }))}
        >
          {state.leaving}
        </span>
      )}
      <Shimmer key={`enter-${state.n}`} as="span" className="apple-status__phrase is-entering" duration={1.6}>
        {state.current}
      </Shimmer>
    </span>
  );
}

export function Thinking({
  status,
  streaming,
  activity,
}: {
  status: AgentStatus | null;
  streaming: boolean;
  /** The ordered activity — see `activity-model.ts`. Only its running step is ever put into words. */
  activity: ActivityRun;
  /** Accepted from the run, but never shown as a second status line. */
  deniedTools?: string[];
}) {
  const isLive = streaming && !activity.terminal;
  const phrase = useSteadyPhrase(isLive ? livePhrase(activity, status?.phase) : '');

  if (isLive) {
    const credits = status?.creditsSpent;
    return (
      <div className="apple-status is-live">
        <p className="apple-status__line">
          <span className="apple-status__orb" aria-hidden="true"><span /></span>
          <MorphingWords phrase={phrase || livePhrase(activity, status?.phase)} />
          {credits !== undefined && credits > 0 && (
            <span className="apple-status__cost">
              {credits} {credits === 1 ? 'Credit' : 'Credits'}
              <span className="gx-sr"> settled for this run so far</span>
            </span>
          )}
        </p>
        {/* Read once per change, politely; the morph itself is decoration. */}
        <span className="gx-sr" role="status">{phrase}</span>
      </div>
    );
  }

  const summary = doneSummary(activity);
  if (!summary) return null;
  return (
    <div className="apple-status is-settled">
      {summary && (
        <p className="apple-status__line">
          <span className="apple-status__tick" aria-hidden="true">
            <svg viewBox="0 0 16 16" width="12" height="12"><path d="M3.5 8.5l3 3 6-7" /></svg>
          </span>
          <span className="apple-status__done">{summary}</span>
        </p>
      )}
    </div>
  );
}
