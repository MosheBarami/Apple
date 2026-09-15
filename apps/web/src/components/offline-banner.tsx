// The one place the app says "this is not reaching us".
//
// It renders NOTHING unless something was actually observed — see lib/connectivity.ts for why
// `navigator.onLine` being true is not an observation. A banner that appears because a number was
// unreadable is the failure this repo is built around, dressed as helpfulness.
//
// The wording is the taxonomy's own: whatever `explainFailure` decides "did I lose anything" sounds
// like, this says the same thing, and tests/connectivity.test.mjs pins the two together. Two
// surfaces describing one condition differently is how a person ends up believing they lost work
// they did not lose.
import { useEffect, useState } from 'react';
import { observedFacts, reachNotice, reachability, subscribeReach, type Reach } from '../lib/connectivity';

function currentReach(): Reach {
  const onLine = typeof navigator === 'undefined' ? undefined : navigator.onLine;
  return reachability(observedFacts(onLine));
}

export function OfflineBanner() {
  const [reach, setReach] = useState<Reach>(currentReach);

  useEffect(() => {
    const update = () => setReach(currentReach());
    // The browser tells us when the radio goes down and when it comes back. Both are worth having
    // even though neither is sufficient: `online` firing is not evidence that Apple is reachable,
    // it is only a reason to look again.
    window.addEventListener('offline', update);
    window.addEventListener('online', update);
    // And every request the app makes reports its own outcome, which is where the other half — a
    // request that never left, or one that finally got through — comes from.
    const unsubscribe = subscribeReach(update);
    update();
    return () => {
      window.removeEventListener('offline', update);
      window.removeEventListener('online', update);
      unsubscribe();
    };
  }, []);

  const notice = reachNotice(reach);
  if (!notice) return null;

  return (
    <div className={`net-banner is-${notice.reach}`} role="status" aria-live="polite">
      <span className="net-banner__dot" aria-hidden="true" />
      <span className="net-banner__text">
        <strong className="net-banner__title">{notice.title}</strong>
        {/* Did I lose anything — answered before anything else, because it is what they want to know. */}
        <span className="net-banner__body">{notice.body}</span>
      </span>
      {notice.next && <span className="net-banner__next">{notice.next}</span>}
    </div>
  );
}
