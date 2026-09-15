/**
 * Whether the browser can reach Apple — and, more importantly, when we do not know.
 *
 * `navigator.onLine` is the most over-trusted signal on the web. It is TRUE behind a captive
 * portal, TRUE on wifi with no uplink, TRUE while the worker itself is down. It is reliable in
 * exactly one direction: `false` really does mean nothing will be sent. So it is read in that
 * direction only, and the other direction comes from something we actually observed — a request
 * that never left, which lib/api.ts raises as status 0 and error-taxonomy classifies as 'offline'.
 *
 * Everything else is silence, and silence renders as NOTHING. Not a green light, not a warning.
 * This is the repo's central discipline applied to a banner: a failure to observe must not render
 * as an observation, and "we cannot place this failure in time" is a failure to observe.
 *
 * NOTHING IS IMPORTED. The wording below deliberately mirrors error-taxonomy's answer to "did I
 * lose anything", and tests/connectivity.test.mjs asserts the two are the same string rather than
 * letting one surface drift into reassuring the user differently from the other.
 */

export type Reach =
  /** The browser says it will not send. The only thing it is trustworthy about. */
  | 'offline'
  /** We watched a request fail to leave, and nothing has succeeded since. */
  | 'unreachable'
  /** No bad news. NOT a claim that anything works. */
  | 'online';

export interface ReachFacts {
  /** `navigator.onLine`, as an unknown: some embedded webviews do not implement it. */
  navigatorOnLine?: unknown;
  /** The `FailureKind` of the last failure, from error-taxonomy. Only 'offline' counts here. */
  lastFailureKind?: unknown;
  lastFailureAt?: unknown;
  lastSuccessAt?: unknown;
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function reachability(facts: ReachFacts): Reach {
  // One direction only. `undefined`, `'false'` and `0` are not the browser telling us anything.
  if (facts.navigatorOnLine === false) return 'offline';

  // A 500 is a failure, and telling someone to check their wifi about it is both wrong and
  // insulting. Only a request that never reached a server is evidence about the connection.
  if (facts.lastFailureKind !== 'offline') return 'online';

  const failedAt = facts.lastFailureAt;
  const succeededAt = facts.lastSuccessAt;

  // Nothing has ever succeeded (or we cannot read when it did), so the last thing we know for
  // certain is the failure.
  if (!finite(succeededAt)) return 'unreachable';

  // A failure we cannot place in time cannot be weighed against a success we CAN place. Both
  // `900 > NaN` and `NaN > 100` are false, so a bare `>` silently picks an answer here; the
  // observed success is the only thing left that we actually watched happen.
  if (!finite(failedAt)) return 'online';

  return failedAt > succeededAt ? 'unreachable' : 'online';
}

export interface ReachNotice {
  title: string;
  /** Whether their work survived — the question people actually have, answered first. */
  body: string;
  /** One action, or none. */
  next: string | null;
  reach: Exclude<Reach, 'online'>;
}

/** Kept identical to error-taxonomy's answer for a status-0 failure. Asserted, not hoped. */
const NOTHING_SENT = 'Nothing was sent, so nothing in your project changed.';

export function reachNotice(reach: Reach): ReachNotice | null {
  if (reach === 'offline') {
    return { title: 'No connection', body: NOTHING_SENT, next: 'Check your connection first.', reach };
  }
  if (reach === 'unreachable') {
    return {
      // Deliberately different words from 'offline': this one is probably not their wifi, and
      // sending someone to restart a router that is working fine is its own small insult.
      title: 'Apple is not answering',
      body: NOTHING_SENT,
      next: 'Check your connection first.',
      reach,
    };
  }
  return null;
}

/* ------------------------------------------------------------------------- */
/* What the app observed. A recorder, not a decision — the decision is above.  */
/* ------------------------------------------------------------------------- */

let lastFailureKind: string | null = null;
let lastFailureAt: number | null = null;
let lastSuccessAt: number | null = null;

type Listener = () => void;
const listeners = new Set<Listener>();

/**
 * Called by lib/api.ts on every request.
 *
 * `reached` means a server answered — ANY status. A 500 is the worker telling us it is there, and
 * for this purpose that is good news.
 */
export function noteReachability(reached: boolean, now: number = Date.now()): void {
  const at = finite(now) ? now : Date.now();
  if (reached) {
    lastSuccessAt = at;
  } else {
    lastFailureKind = 'offline';
    lastFailureAt = at;
  }
  for (const fn of listeners) fn();
}

export function observedFacts(navigatorOnLine?: unknown): ReachFacts {
  return { navigatorOnLine, lastFailureKind, lastFailureAt, lastSuccessAt };
}

export function subscribeReach(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
