/**
 * The canonical empty, waiting and failed states — the DATA half.
 *
 * Split from the renderer for the reason every other model here is (`thinking-model`,
 * `activity-model`, `evidence-model`): the decisions are what is worth testing, and a
 * module that imports React cannot be loaded by `node --test`.
 *
 * WHY ONE COMPONENT. There were fourteen of these, hand-written across two
 * incompatible CSS layers (`empty-state` in styles.css, `gx-empty` in
 * workspace.css). Most were good — the roadmap's "Golem needs your place open"
 * explains why it refuses to invent a plan, which is the right answer — and some
 * were a bare `<p>Loading…</p>`. A user meets these on their worst days, and
 * "sometimes considered, sometimes a bare paragraph" is not a design system.
 *
 * The master mission's §16.1 names the vocabulary (M01–M10) and §16.3 forbids
 * falling back to generic SaaS empty states when a canonical Golem one exists. This
 * is that vocabulary, in one place, so a new surface picks a state rather than
 * inventing prose.
 *
 * ONE OF THE TEN IS DELIBERATELY NOT A STATE HERE, and that is not an omission.
 * §16.1 lists "M06 Plugin not installed". The browser has no signal for whether a
 * Studio plugin is installed and cannot acquire one — `lib/studio-connection.ts`
 * already refuses to model it for exactly that reason. Adding it here would mean
 * inventing a fact and then rendering it confidently. Installation is offered as an
 * ACTION (see `ws/connect-studio.tsx`), never reported as a status, and the id below
 * is reserved with that explanation rather than quietly dropped.
 *
 * TONE follows §16.2's colour grammar rather than decoration: amber is creation and
 * Golem's own identity, blue is Studio and transport, green is proven and safe
 * completion, violet is future or in-progress intelligence, red is failure. A state
 * whose tone contradicts its meaning is the drift §16.3 names, so tone is a property
 * of the state id here and not a prop a caller can pass.
 */

/** §16.2's semantic axes. Not a palette — a meaning. */
export type EmptyTone = 'creation' | 'studio' | 'proven' | 'future' | 'failure';

export interface EmptyStateSpec {
  /** The canonical id from §16.1, for traceability back to the reference board. */
  canonical: string;
  title: string;
  /** What the user can do next. Absent only when there is genuinely nothing to do. */
  body?: string;
  tone: EmptyTone;
}

/**
 * The states this product can honestly derive from what it observes.
 *
 * Keyed by a name a developer would reach for, with the canonical id carried
 * alongside so the mapping to the reference board stays checkable.
 */
export const EMPTY_STATES = {
  noProjects: {
    canonical: 'M01',
    title: 'Summon your first project',
    body: 'A project is one Roblox experience. Golem opens it, reads it, and builds with you.',
    tone: 'creation',
  },
  noConversation: {
    canonical: 'M02',
    title: 'Nothing said yet',
    body: 'Describe what you want and Golem will inspect the project before it changes anything.',
    tone: 'creation',
  },
  noRoadmap: {
    canonical: 'M03',
    title: 'Nothing to plan yet',
    body: 'Build something first — the roadmap is read out of your place, not generated from a template.',
    tone: 'future',
  },
  waitingForStudio: {
    canonical: 'M04',
    title: 'Waiting for Studio',
    body: 'Open your place in Roblox Studio and pair it. Golem reads the project itself rather than guessing at it.',
    tone: 'studio',
  },
  studioDisconnected: {
    canonical: 'M05',
    // Action, not status. "Studio disconnected" was the first draft and it is a worse
    // title: it names the condition and leaves the user to work out the remedy. This
    // phrasing came from the roadmap's own hand-written state, which had been through
    // review, and it reads correctly in every surface that shows M05.
    title: 'Golem needs your place open',
    body: 'The roadmap and the build both read the project itself. Reopen your place in Studio — everything Golem has already done is saved.',
    tone: 'studio',
  },
  connectionFailed: {
    canonical: 'M07',
    title: 'Could not reach Golem',
    body: 'Check your connection and try again. Nothing in your project was changed.',
    tone: 'failure',
  },
  playtestUnavailable: {
    canonical: 'M08',
    title: 'No playtest to show',
    body: 'Golem captures frames while it runs your game. There is no run in flight.',
    tone: 'studio',
  },
  generationFailed: {
    canonical: 'M09',
    title: 'That run did not finish',
    body: 'Golem stopped before it was done. Your project is at its last checkpoint.',
    tone: 'failure',
  },
  projectComplete: {
    canonical: 'M10',
    title: 'Everything on the roadmap is done',
    body: 'Every milestone Golem read out of your place is built and verified.',
    tone: 'proven',
  },
} as const satisfies Record<string, EmptyStateSpec>;

export type EmptyStateName = keyof typeof EMPTY_STATES;

/**
 * §16.1's M06, and why it is here as a constant rather than as a state.
 *
 * Kept exported so the mapping to the reference board is complete and a reader can
 * see the decision instead of wondering whether it was forgotten.
 */
export const M06_NOT_MODELLED = {
  canonical: 'M06',
  reason:
    'The browser cannot observe whether a Studio plugin is installed. Installation is '
    + 'offered as an action in ws/connect-studio.tsx, never reported as a detected status.',
} as const;

