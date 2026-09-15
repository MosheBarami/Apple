// Starting points for a new project.
//
// A TEMPLATE HERE IS THE FIRST REQUEST, WRITTEN OUT. It is not content: no geometry ships with it,
// no scripts, no place. Choosing one fills the composer with a message the person then reads and
// sends, through the same handoff the suggestion chips and the roadmap's briefs already use.
//
// That definition is deliberate and it is load-bearing. apps/site/src/pages/index.astro carries a
// comment recording that this product once published "3,017 game templates" and had to take the
// claim down because nothing behind it was real. A card that says a template "comes with a working
// shop" is the same claim at a smaller size — so the blurbs say what the request ASKS FOR, and
// apps/web/tests/project-templates.test.mjs fails on the vocabulary of shipped content.
//
// Data rather than rows: a table would need a migration, a policy and CI fixtures to say five
// sentences that change when the copy changes. It lives in apps/web rather than packages/shared
// because the worker has no template concept — a seeded request is an ordinary user message by the
// time it reaches it, and giving the agent a notion of "templates" would be a second vocabulary for
// the same thing.
//
// No imports: this module is loaded directly by `node --test`.

export interface ProjectTemplate {
  id: string;
  label: string;
  /** What the first request asks for. Never what the project already contains. */
  blurb: string;
  /** The message that lands in the composer, or null for a project that starts empty. */
  prompt: string | null;
}

export const BLANK_TEMPLATE_ID = 'blank';

/**
 * Five starting points, blank first.
 *
 * Blank is an option a person can SEE and choose rather than the absence of a choice: "I want an
 * empty project" should not read as having failed to pick one.
 *
 * Each prompt names specific, buildable parts — a checkpoint pad, a collector, a wave spawner —
 * because a request the agent can act on is the only kind worth pre-writing. A vague one would
 * produce a vague first run and teach the user that the picker does nothing.
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: BLANK_TEMPLATE_ID,
    label: 'Start empty',
    blurb: 'An empty conversation. Say what you want in your own words.',
    prompt: null,
  },
  {
    id: 'obby',
    label: 'Obby',
    blurb: 'Asks for a spawn, moving platforms over a kill volume, and a checkpoint at each stage.',
    prompt:
      'Build the first two stages of a lava obby: a spawn platform, a run of moving platforms over a kill volume, ' +
      'and a checkpoint pad at the end of each stage that saves where the player respawns.',
  },
  {
    id: 'tycoon',
    label: 'Tycoon',
    blurb: 'Asks for a dropper, a collector that pays into leaderstats, and one upgrade button.',
    prompt:
      'Build a small dropper tycoon: a conveyor that spawns cash parts every two seconds, a collector pad that adds ' +
      'their value to a Cash leaderstat, and one upgrade button that doubles the drop rate when bought.',
  },
  {
    id: 'simulator',
    label: 'Simulator',
    blurb: 'Asks for a click pad, a Coins leaderstat, and a shop with three upgrades.',
    prompt:
      'Build a clicker simulator loop: a pad that awards Coins into leaderstats when a player touches it, ' +
      'a shop GUI listing three upgrades that raise the award, and a display of the current total.',
  },
  {
    id: 'tower-defence',
    label: 'Tower defence',
    blurb: 'Asks for a lane of waypoints, three waves, and a tower that fires at the nearest enemy.',
    prompt:
      'Build one round of tower defence: a lane marked out with waypoints, a spawner that sends three waves of ' +
      'enemies along it, and a placeable tower that damages the nearest enemy in range.',
  },
];

/**
 * The prompt for a chosen id, or null.
 *
 * Null for the blank start AND for anything unrecognised. The picker's value survives a reload and
 * can outlive the build that wrote it, and an unknown id must seed nothing rather than crash or
 * fall through to another template's request.
 */
export function templateSeed(id: string | null | undefined): string | null {
  if (!id) return null;
  return PROJECT_TEMPLATES.find((t) => t.id === id)?.prompt ?? null;
}

/**
 * The templates a composer may insert: everything that has a prompt.
 *
 * DERIVED, never a second list. The blank start is the one entry whose prompt is null, and
 * "Start empty" inserted into a message box would insert nothing and read as a control that does
 * not work — but filtering it out by NAME here would be a second place that knows which entry is
 * the empty one. The predicate is the same fact the type already carries.
 *
 * A function rather than a constant so the filter cannot be evaluated against a half-initialised
 * module by an import cycle, and so a caller that wants the list twice cannot mutate a shared one.
 */
export function insertableTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((t): t is ProjectTemplate & { prompt: string } => t.prompt !== null);
}
