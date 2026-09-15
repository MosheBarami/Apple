// A SAVED INSTRUCTION YOU CAN RUN AGAIN — the client half of the worker's automations.
//
// The worker has had `normaliseAutomation` refusing fourteen named things, a store with a
// per-owner cap and a run history since before any of it was reachable; for the whole of that
// time `grep -rni automation apps/web/src` returned nothing. This file is the decisions the
// editor makes, kept out of the component so they can be run against the worker's own validator
// (see apps/web/tests/automations-model.test.mjs) rather than asserted about JSX.
//
// ---------------------------------------------------------------------------------------------
// WHAT THIS EDITOR DELIBERATELY DOES NOT OFFER, and why each absence is the honest answer
// ---------------------------------------------------------------------------------------------
//
// A SCHEDULE. `nextFireAfter` is built and tested to the daylight-saving fold, `dueAutomations`
// has its index, and NOTHING DISPATCHES. Every project-access lookup in the worker goes through
// PostgREST under the user's own JWT, and a scheduled handler has no user and no token — so a
// dispatcher would have to assert the owner still has access without asking, which is the one
// decision that keeps a standing actor from outliving its owner's access. Offering "every day at
// 09:00" while that is true sells a person a feature: they set it, nothing happens, and nothing
// tells them why. So the trigger this editor offers is the one that works, and an automation
// created through the API with another one is rendered as dormant rather than as a live schedule.
//
// A RETRY COUNT. `retryVerdict` has no caller. A 0–3 selector would configure nothing.
//
// A PER-RUN CREDIT CEILING. `maxCreditsPerRun` is stored, validated and never compared against a
// run's spend. A number in an editor that the layer below ignores is worse than no number, because
// the person believes they have set a limit.
//
// The daily cap IS offered, because `startVerdict` refuses `daily_cap` against `firesSince` and
// the live route test drives it. That is the difference between a setting and a control.
import {
  PRODUCT_MODES,
  PRODUCT_MODE_TO_SPECIALIST,
  SPECIALIST_TO_PRODUCT_MODE,
  PRODUCT_MODE_INFO,
  type GolemMode,
  type ProductMode,
} from '@golem/shared';

/**
 * The limits the counters are drawn against.
 *
 * The worker cannot be imported here — it is a different bundle — so these are declared, and a
 * test BINDS them to the worker's own constants, which is what search-filters.ts does for the
 * search contract. Without that binding a drift shows up not as a failure but as a form that
 * refuses a name the server would have accepted, or lets through one it will not.
 */
export const LIMITS = {
  name: 60,
  description: 280,
  prompt: 4000,
  runsPerDay: 48,
} as const;

/** The triggers a person may choose here. See the header for the two that are missing. */
export const EDITABLE_TRIGGERS = ['manual'] as const;

/** What to say about an automation this build cannot start on its own. */
export const DORMANT_NOTE =
  'Nothing starts this on its own in this version — use Run now.';

export interface AutomationDraft {
  name: string;
  description: string;
  prompt: string;
  /** The PRODUCT mode, which is what the person picks. Translated at the edge, like the composer. */
  mode: ProductMode;
  maxRunsPerDay: number;
}

/** A fresh editor. `agent` is the normal way to work, so it is what a new automation does. */
export function blankDraft(): AutomationDraft {
  return { name: '', description: '', prompt: '', mode: 'agent', maxRunsPerDay: 4 };
}

/** The product-mode choices, with the copy the composer uses, so two pickers cannot disagree. */
export const MODE_CHOICES: readonly { id: ProductMode; name: string; blurb: string }[] = PRODUCT_MODES.map((id) => ({
  id,
  name: PRODUCT_MODE_INFO[id].name,
  blurb: PRODUCT_MODE_INFO[id].blurb,
}));

/**
 * The request body.
 *
 * NOTHING IS TRIMMED OR SHORTENED HERE. The server refuses an over-long name; it does not cut one
 * down. A client that truncated first would store a name the person never typed and report it as
 * saved — so the whole value travels and the refusal comes back with the reason on the field.
 *
 * An empty description is OMITTED rather than sent as `''`: "no description" and "a description
 * somebody wrote that happens to be empty" are different states, and the column is nullable.
 */
export function draftToBody(draft: AutomationDraft): Record<string, unknown> {
  const description = draft.description.trim();
  return {
    name: draft.name,
    ...(description === '' ? {} : { description: draft.description }),
    prompt: draft.prompt,
    mode: PRODUCT_MODE_TO_SPECIALIST[draft.mode],
    trigger: 'manual',
    // Always sent, because the server refuses an unknown zone rather than defaulting, and a
    // manual automation's zone is still what its daily cap is counted in.
    timezone: localZone(),
    budget: { maxRunsPerDay: draft.maxRunsPerDay },
  };
}

/**
 * The browser's own zone, which is the only one this client can honestly claim.
 *
 * The daily cap counts fires "today in the automation's own zone", so a Sydney user whose cap
 * reset in the middle of their working afternoon would be a cap that behaves differently for them
 * than the copy says. `Intl` is universally available; the fallback exists because a locked-down
 * environment can make `resolvedOptions()` throw, and UTC is then a stated guess rather than a
 * silent one — the server refuses anything it does not recognise either way.
 */
export function localZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** Fill the draft from a stored row, for editing. The specialist spelling comes back as a product mode. */
export function draftFrom(a: {
  name: string;
  description: string | null;
  prompt: string;
  mode: string;
  budget: { maxRunsPerDay: number };
}): AutomationDraft {
  return {
    name: a.name,
    description: a.description ?? '',
    prompt: a.prompt,
    mode: SPECIALIST_TO_PRODUCT_MODE[a.mode as GolemMode] ?? 'agent',
    maxRunsPerDay: a.budget.maxRunsPerDay,
  };
}

/** How far past a limit a value is. Zero when inside it. The value itself is never changed. */
export function overBy(value: string, limit: number): number {
  return Math.max(0, [...value].length - limit);
}

// ---------------------------------------------------------------------------------------------
// refusals
// ---------------------------------------------------------------------------------------------

export type RefusalField = 'name' | 'description' | 'prompt' | 'mode' | 'maxRunsPerDay' | null;

export interface Refusal {
  /** The field to put the message on, or null when no field caused it. */
  field: RefusalField;
  message: string;
  /** False when this build has never heard of the reason. See below for why that is not a detail. */
  known: boolean;
}

/**
 * Every refusal the worker can answer a save with, as a sentence and a field.
 *
 * The list is checked against the worker's own `AUTOMATION_REJECTS` by a test, so a reason added
 * to the server without a sentence here is red rather than a generic failure the person cannot act
 * on. The entries for triggers, schedules and events are reachable only from an automation created
 * through the API — this editor cannot produce one — and they are written anyway, because the list
 * they come back on is the server's, not this editor's.
 */
const SAVE_REFUSALS: Record<string, { field: RefusalField; message: string }> = {
  bad_name: { field: 'name', message: `A name is required, and must be ${LIMITS.name} characters or fewer.` },
  bad_description: { field: 'description', message: `The description must be ${LIMITS.description} characters or fewer.` },
  bad_prompt: { field: 'prompt', message: `Say what to do, in ${LIMITS.prompt} characters or fewer.` },
  bad_mode: { field: 'mode', message: 'That is not a mode this project can run.' },
  bad_trigger: { field: null, message: 'That is not a way an automation can start.' },
  bad_schedule: { field: null, message: 'That schedule is not one the server can read.' },
  unknown_timezone: {
    field: null,
    message: `Your browser reports its time zone as "${'%zone%'}", which the server does not recognise.`,
  },
  bad_event: { field: null, message: 'That is not an event this project emits.' },
  bad_overlap: { field: null, message: 'That is not a way to handle a run that is already going.' },
  bad_missed_runs: { field: null, message: 'That is not a way to handle a fire that was missed.' },
  bad_retries: { field: null, message: 'That is more retries than an automation may have.' },
  bad_budget: { field: 'maxRunsPerDay', message: `Runs a day must be between 1 and ${LIMITS.runsPerDay}.` },
  bad_project: { field: null, message: 'That project is not one this automation can point at.' },
  bad_owner: { field: null, message: 'The sign-in behind this request was not accepted.' },
  // Not a validation reason: the store's per-owner ceiling. Nobody's field, because retyping the
  // name will not help — the next step is deleting one, and the message has to say so.
  too_many: { field: null, message: 'You already have 25 automations, which is the most one account may keep. Delete one to add another.' },
};

export function refusalFor(reason: string): Refusal {
  const hit = SAVE_REFUSALS[reason];
  if (hit) return { ...hit, message: hit.message.replace('%zone%', localZone()), known: true };
  //[[ AN UNRECOGNISED REASON IS SHOWN, NOT SWALLOWED.
  //
  //   A newer worker refusing something this build has never heard of must not render as a blank
  //   form, and must not render as a sentence invented for it either — that would be this client
  //   claiming to understand a refusal it does not. The raw reason is what the person can quote. ]]
  return { field: null, message: `The server refused this, and gave a reason this version does not recognise: ${reason}`, known: false };
}

/**
 * Why a fire did not start.
 *
 * `requeue` is carried separately because "it was dropped" and "it will be retried" are different
 * facts, and the automation's own overlap policy decides which one is true.
 */
export function fireRefusal(reason: string, requeue: boolean): string {
  switch (reason) {
    case 'disabled':
      return 'This automation is paused. Resume it to run it.';
    case 'overlapping':
      return requeue
        ? 'Something is already running on this project, so this fire is waiting for it.'
        : 'Something is already running on this project, so this fire was dropped.';
    case 'daily_cap':
      return 'This automation has used all the runs it is allowed today.';
    case 'no_access':
    case 'owner_lost_access':
      return 'This automation can no longer reach the project it points at.';
    case 'wrong_project':
      return 'This automation points at a different project.';
    case 'killed':
      return 'Building is switched off across the service right now. This fire will not be lost.';
    case 'already_fired':
      return 'That fire has already been claimed.';
    //[[ A FAILURE TO OBSERVE MUST NOT RENDER AS AN OBSERVATION.
    //
    //   The route refuses out loud rather than guessing when it cannot read whether the project is
    //   busy or whether spending is switched off. Drawing either as "the project is busy" would
    //   turn "we could not look" into "we looked and here is what we saw". ]]
    case 'run_state_unreadable':
      return 'Apple could not read whether this project is already building, so it did not start a second run.';
    case 'kill_switch_unreadable':
      return 'Apple could not read whether building is switched on, so it did not start the run.';
    default:
      return `The run was refused, for a reason this version does not recognise: ${reason}`;
  }
}

// ---------------------------------------------------------------------------------------------
// the run history
// ---------------------------------------------------------------------------------------------

export interface ExecutionView {
  id: string;
  trigger: string;
  startedAt: number;
  finishedAt: number | null;
  outcome: string | null;
  attempt: number;
  runId: string | null;
  credits: number | null;
  error: string | null;
  fold: string | null;
}

export type OutcomeTone = 'good' | 'bad' | 'muted';

/**
 * What a recorded outcome is called, and how it reads.
 *
 * `null` is NOT an outcome. A fire whose row has not been closed is still going, and drawing it as
 * anything else is a run history that says what happened before it knows.
 */
export function outcomeLabel(outcome: string | null): { label: string; tone: OutcomeTone } {
  switch (outcome) {
    case 'ok':
      return { label: 'Ran', tone: 'good' };
    case 'failed':
      return { label: 'Did not finish', tone: 'bad' };
    case 'error':
      return { label: 'Could not be started', tone: 'bad' };
    case 'quota':
      return { label: 'Stopped — out of allowance', tone: 'bad' };
    case 'busy':
      return { label: 'Skipped — project was building', tone: 'muted' };
    case 'refused':
      return { label: 'Refused', tone: 'muted' };
    case null:
      return { label: 'Running…', tone: 'muted' };
    default:
      return { label: `Recorded as "${outcome}"`, tone: 'muted' };
  }
}

/**
 * What a fire cost.
 *
 * A null cost is `unreadable`, never `0` — the same distinction `automationSpend` makes. The run is
 * billed inside the session after the fire returns, so this layer genuinely does not know, and
 * printing a zero is how a spending report understates by the whole cost of every automated build.
 */
export function creditLabel(credits: number | null): string {
  return credits === null ? 'cost not recorded' : `${credits} Credits`;
}

/** How long a fire took, or null while it is still going. Never guessed from `Date.now()`. */
export function durationLabel(row: { startedAt: number; finishedAt: number | null }): string | null {
  if (row.finishedAt === null) return null;
  const ms = row.finishedAt - row.startedAt;
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 60_000)}m`;
}

/**
 * Why a fire landed at a wall time nobody asked for.
 *
 * Twice a year a wall time either does not exist or happens twice, and `zoned-time.ts` makes a
 * deliberate choice about both. A choice the person cannot see is indistinguishable from a bug, and
 * "why did this run at 03:30" is the question it produces.
 */
export function foldNote(fold: string | null): string | null {
  if (fold === 'skipped') return 'The clock went forward: this wall time did not exist, so the run was moved rather than skipped.';
  if (fold === 'repeated') return 'The clock went back: this wall time happened twice, and the run was taken once.';
  return null;
}

/** Can this automation start without somebody pressing a button in this build? See the header. */
export function willFireOnItsOwn(a: { trigger: string }): boolean {
  return a.trigger === 'manual';
}
