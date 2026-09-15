/**
 * The tour — the DATA half.
 *
 * A coach mark is a pointer at a thing, which makes it the one piece of UI whose correctness
 * depends on something outside itself. Every rule here is about the pointer outliving the thing:
 *
 *   * IT MUST NOT POINT AT NOTHING. A step names an anchor; if that anchor is not in the document
 *     the step is WITHHELD, not shown beside empty space and not consumed. It waits until the user
 *     is on a screen where the thing exists. tests/onboarding.test.mjs checks every anchor against
 *     the `data-tour` attributes actually present in the JSX, so a renamed element fails a test
 *     rather than producing a card floating beside the wrong button.
 *   * IT MUST NOT TEACH WHAT IS ALREADY DONE. "Start a project" shown to someone with eleven of
 *     them reads as a product that does not know them. A step can name a fact that makes it moot.
 *   * A FACT MUST BE LITERALLY TRUE TO COUNT. Facts arrive as `unknown` — from a query, from JSON,
 *     from storage — and `'false'` is truthy. A truthy read here skips the step the user needs.
 *   * IT MUST NOT COME BACK. Progress is persisted, and persisted state is PARSED state: one bad
 *     blob and the tour restarts on every load, forever, for the user least able to explain why.
 *
 * Nothing is imported; `window.localStorage` is reached through guards, because it throws on access
 * in a private window and an exception thrown while deciding whether to show a tour would take the
 * whole shell down with it.
 */

export interface TourStep {
  id: string;
  title: string;
  /** What this thing is FOR — never a description of where it is on screen. */
  body: string;
  /** The `data-tour` attribute of the element this points at. */
  anchor: string;
  /** A fact that makes this step moot. Only a literal `true` counts. */
  satisfiedBy?: string;
}

/**
 * Five things, in the order a new builder meets them.
 *
 * Deliberately not a tour of the interface. Each step answers "why does this exist", because the
 * things this product does that no one expects — that it reads your actual place, that a build is
 * checkpointed, that a run costs Credits — are not discoverable by looking at a button.
 */
export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'new-chat',
    title: 'Every build starts as a chat',
    body: 'Describe the experience you want. Apple opens your place, reads what is already there, and builds with you from inside it.',
    anchor: 'new-chat',
    satisfiedBy: 'hasProject',
  },
  {
    id: 'composer',
    title: 'Say what you want, not how to build it',
    body: 'Apple inspects the project before it changes anything, so "make the lobby feel colder" is a sentence it can act on.',
    anchor: 'composer',
  },
  {
    id: 'connect-studio',
    title: 'Apple works on your real place',
    body: 'Pairing Roblox Studio is what lets it read and edit the actual project rather than guessing at one.',
    anchor: 'connect-studio',
  },
  {
    id: 'checkpoints',
    title: 'Nothing is a one-way door',
    body: 'Every build is checkpointed. You can compare two states of the project and rewind to either.',
    anchor: 'checkpoints',
  },
  {
    id: 'credits',
    title: 'Credits are what a build costs',
    body: 'Reading your place is free. Building spends Credits, and this meter always shows what is left and when it renews.',
    anchor: 'usage-meter',
  },
];

export interface TourProgress {
  seen: string[];
  dismissed: boolean;
}

export const EMPTY_PROGRESS: TourProgress = Object.freeze({ seen: [], dismissed: false }) as TourProgress;

export interface TourFacts {
  /** The `data-tour` anchors currently in the document. */
  anchors: unknown;
  /** Things the user has already done, by the name a step's `satisfiedBy` uses. */
  done?: Readonly<Record<string, unknown>>;
}

/** The next card to show, or null when there is nothing honest to show right now. */
export function nextTourStep(progress: TourProgress, facts: TourFacts): TourStep | null {
  if (progress?.dismissed === true) return null;

  // An anchors list that is not a list means we could not find out what is on screen, and pointing
  // at an element we have not seen is exactly the mistake this model exists to prevent.
  const anchors = Array.isArray(facts?.anchors) ? facts.anchors.filter((a) => typeof a === 'string') : [];
  if (anchors.length === 0) return null;

  // Matched, not counted: a stale id left over from a renamed step must not eat a real one.
  const seen = new Set(Array.isArray(progress?.seen) ? progress.seen.filter((s) => typeof s === 'string') : []);
  const done = facts?.done ?? {};

  for (const step of TOUR_STEPS) {
    if (seen.has(step.id)) continue;
    if (step.satisfiedBy !== undefined && done[step.satisfiedBy] === true) continue;
    if (!anchors.includes(step.anchor)) continue;
    return step;
  }
  return null;
}

export function markSeen(progress: TourProgress, id: string): TourProgress {
  const seen = Array.isArray(progress?.seen) ? progress.seen.filter((s) => typeof s === 'string') : [];
  if (seen.includes(id)) return { seen, dismissed: progress?.dismissed === true };
  return { seen: [...seen, id], dismissed: progress?.dismissed === true };
}

export function dismissTour(progress: TourProgress): TourProgress {
  const seen = Array.isArray(progress?.seen) ? progress.seen.filter((s) => typeof s === 'string') : [];
  return { seen, dismissed: true };
}

/** Asked for from the palette. Forgetting what they have seen is the point. */
export function restartTour(): TourProgress {
  return { seen: [], dismissed: false };
}

export const TOUR_KEY = 'apple.tour.v1';

/**
 * Read the saved progress.
 *
 * Every branch here has been a real value in a real localStorage: a truncated write, an older
 * shape, something set by hand. The only shape that survives is the one this module writes, and
 * anything else is a fresh start rather than a spread into state.
 */
export function readProgress(): TourProgress {
  try {
    const raw = window.localStorage.getItem(TOUR_KEY);
    if (!raw) return { seen: [], dismissed: false };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { seen: [], dismissed: false };
    }
    const blob = parsed as { seen?: unknown; dismissed?: unknown };
    return {
      seen: Array.isArray(blob.seen) ? blob.seen.filter((s): s is string => typeof s === 'string') : [],
      // `'false'` and `'yes'` are both truthy, and both have been written here by hand.
      dismissed: blob.dismissed === true,
    };
  } catch {
    // A private window, blocked storage, or a blob that is not JSON. The tour simply starts fresh.
    return { seen: [], dismissed: false };
  }
}

export function writeProgress(progress: TourProgress): void {
  try {
    window.localStorage.setItem(TOUR_KEY, JSON.stringify({ seen: progress.seen, dismissed: progress.dismissed }));
  } catch {
    /* storage unavailable — the tour just does not remember across reloads */
  }
}
