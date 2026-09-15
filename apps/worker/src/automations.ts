// WORK THAT HAPPENS WITHOUT SOMEBODY SITTING THERE - as decisions, not as storage or dispatch.
//
// A run could only ever be started by a `chat` frame arriving on a project's WebSocket. That is one
// trigger, it requires a person and an open socket, and it is the only one there was: nothing in
// this product could do anything on a schedule, and nothing could react to anything.
//
// This file decides. `automation-store.ts` stores, and the dispatcher in index.ts fires. The split
// is the one collab-threads.ts made: every refusal below is reachable from a test with a plain
// object, because the hostile inputs here - a schedule in a zone that does not exist, a catch-up
// after an outage, two dispatchers waking at once - are the entire substance of the feature.
//
// ---------------------------------------------------------------------------------------------
// FOUR DECISIONS THAT COST MONEY, MADE HERE AND STATED OUT LOUD
// ---------------------------------------------------------------------------------------------
//
// 1. A MISSED RUN IS SKIPPED BY DEFAULT, AND THERE IS NO "RUN THEM ALL".
//    A daily automation whose dispatcher was down for a week has seven missed fires. Running all
//    seven is seven builds' worth of Credits spent at once, for an outage the person did not cause
//    and cannot have budgeted for, producing seven near-identical results. `catch_up` runs ONE,
//    immediately, and that is the most generous option offered on purpose.
//
// 2. TWO OVERLAPPING RUNS ARE NOT OFFERED EITHER.
//    `single-flight.ts` and the staleness check in do/session.ts already refuse a second run on a
//    project that is busy, with code `busy`. An `allow` policy here would be a setting that says
//    something the layer below will refuse - a switch that does nothing, which is the thing this
//    repository is built around not shipping. So the choice is `skip` or `queue`, and both are
//    honest about what the session below will do.
//
// 3. A FAILED RUN IS NOT RETRIED BY DEFAULT, AND SOME FAILURES ARE NEVER RETRIED.
//    gateway.ts already argues this for inference: a failed call is not retried because a retry is
//    a second bill for the same answer. The same reasoning applies one level up, with one
//    addition - a run refused for QUOTA or for BUSY will be refused identically on the next
//    attempt, so retrying it is spending nothing and achieving nothing, and it is refused by name
//    rather than by exhausting the retry count.
//
// 4. EVERY FIRE IS RE-AUTHORISED.
//    An automation is a standing actor, and the thing that makes a standing actor dangerous is
//    that the access it was created with outlives the access its owner has. `authorizeFire` takes
//    the access the CALLER has just established and refuses when it is gone, so removing somebody
//    from a project stops their automations against it at the next tick rather than never.
import { instantForWall, isTimeZone, wallPartsAt, type DstFold } from './zoned-time';

// ---------------------------------------------------------------------------------------------
// the vocabulary
// ---------------------------------------------------------------------------------------------

/** How an automation starts. Runtime allowlist; the type is derived from it. */
export const AUTOMATION_TRIGGERS = ['manual', 'schedule', 'event'] as const;
export type AutomationTrigger = (typeof AUTOMATION_TRIGGERS)[number];

/**
 * The internal events an automation may react to.
 *
 * DELIBERATELY SHORT, and every entry corresponds to a place in this tree that already knows the
 * thing happened. `build_failed` and `build_succeeded` are the two terminal states `finishRun`
 * distinguishes; `checkpoint_created` is the snapshot path. A longer list would be a list of
 * events nothing emits, which reads in a settings page as a capability and is not one.
 */
export const AUTOMATION_EVENTS = ['build_failed', 'build_succeeded', 'checkpoint_created'] as const;
export type AutomationEvent = (typeof AUTOMATION_EVENTS)[number];

/**
 * Schedule shapes.
 *
 * NOT A CRON STRING. `0 9 * * 1` is an interface for people who already know cron, it has five
 * fields of which four are usually `*`, and the only way to validate it is to implement cron. A
 * small vocabulary with named fields can be checked, can be rendered back as a sentence, and
 * cannot express the schedule that fires every minute of every day by a typo.
 */
export const SCHEDULE_EVERY = ['hour', 'day', 'week'] as const;
export type ScheduleEvery = (typeof SCHEDULE_EVERY)[number];

/** How a run that arrives while one is in flight is handled. See decision 2 in the header. */
export const OVERLAP_POLICIES = ['skip', 'queue'] as const;
export type OverlapPolicy = (typeof OVERLAP_POLICIES)[number];

/** What to do about fires that should have happened while nothing was dispatching. */
export const MISSED_RUN_POLICIES = ['skip', 'catch_up'] as const;
export type MissedRunPolicy = (typeof MISSED_RUN_POLICIES)[number];

/** Build modes an automation may ask for, as the wire spells them. */
export const AUTOMATION_MODES = ['clay', 'stone', 'rune'] as const;
export type AutomationMode = (typeof AUTOMATION_MODES)[number];

const inList = <T extends readonly string[]>(list: T, v: unknown): v is T[number] =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

export const isAutomationTrigger = (v: unknown): v is AutomationTrigger => inList(AUTOMATION_TRIGGERS, v);
export const isAutomationEvent = (v: unknown): v is AutomationEvent => inList(AUTOMATION_EVENTS, v);
export const isScheduleEvery = (v: unknown): v is ScheduleEvery => inList(SCHEDULE_EVERY, v);
export const isOverlapPolicy = (v: unknown): v is OverlapPolicy => inList(OVERLAP_POLICIES, v);
export const isMissedRunPolicy = (v: unknown): v is MissedRunPolicy => inList(MISSED_RUN_POLICIES, v);
export const isAutomationMode = (v: unknown): v is AutomationMode => inList(AUTOMATION_MODES, v);

// ---------------------------------------------------------------------------------------------
// limits
// ---------------------------------------------------------------------------------------------

export const NAME_MAX = 60;
export const DESCRIPTION_MAX = 280;
export const PROMPT_MAX = 4000;
/** Retries beyond this are a way to spend a day's allowance on one broken instruction. */
export const MAX_RETRIES = 3;
/** The floor on a per-run Credit cap. A cap of zero is an automation that cannot do anything. */
export const MIN_CREDITS_PER_RUN = 1;
export const MAX_CREDITS_PER_RUN = 2_000;
export const MAX_RUNS_PER_DAY = 48;

export interface Schedule {
  every: ScheduleEvery;
  /** Minute past the hour, 0-59. Used by every shape. */
  minute: number;
  /** Local hour, 0-23. Ignored when `every` is 'hour'. */
  hour: number;
  /** 0 = Sunday. Used only when `every` is 'week'. */
  weekday: number;
}

export interface AutomationBudget {
  /** Hard ceiling on what one fire may spend. */
  maxCreditsPerRun: number;
  /** How many times a day this automation may fire at all. */
  maxRunsPerDay: number;
}

export interface Automation {
  id: string;
  ownerId: string;
  projectId: string;
  name: string;
  description: string | null;
  prompt: string;
  mode: AutomationMode;
  trigger: AutomationTrigger;
  /** Set only when `trigger` is 'schedule'. */
  schedule: Schedule | null;
  /** IANA zone the schedule is read in. Always present, because "no zone" means the server's. */
  timezone: string;
  /** Set only when `trigger` is 'event'. */
  event: AutomationEvent | null;
  enabled: boolean;
  overlap: OverlapPolicy;
  missedRuns: MissedRunPolicy;
  maxRetries: number;
  budget: AutomationBudget;
  createdAt: number;
  updatedAt: number;
}

export type AutomationReject =
  | 'bad_name'
  | 'bad_description'
  | 'bad_prompt'
  | 'bad_mode'
  | 'bad_trigger'
  | 'bad_schedule'
  | 'unknown_timezone'
  | 'bad_event'
  | 'bad_overlap'
  | 'bad_missed_runs'
  | 'bad_retries'
  | 'bad_budget'
  | 'bad_project'
  | 'bad_owner';

export interface AutomationInput {
  name?: unknown;
  description?: unknown;
  prompt?: unknown;
  mode?: unknown;
  trigger?: unknown;
  schedule?: unknown;
  timezone?: unknown;
  event?: unknown;
  enabled?: unknown;
  overlap?: unknown;
  missedRuns?: unknown;
  maxRetries?: unknown;
  budget?: unknown;
}

/** A name, trimmed and collapsed, or null. The same shape a project name and a key name get. */
function cleanName(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().replace(/\s+/g, ' ');
  // REFUSED, NEVER TRUNCATED. A silently shortened name is a different name attributed to the
  // person who did not choose it - the same rule memory-store.ts applies to a value.
  if (s.length === 0 || s.length > max) return null;
  return s;
}

function intInRange(v: unknown, lo: number, hi: number): number | null {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) return null;
  return v;
}

function normaliseSchedule(v: unknown): Schedule | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  if (!isScheduleEvery(raw.every)) return null;
  const minute = intInRange(raw.minute, 0, 59);
  if (minute === null) return null;
  // `hour` and `weekday` are only meaningful for some shapes, and an ABSENT one defaults rather
  // than refusing - "every hour at :05" genuinely has no hour. A PRESENT but invalid one is
  // refused, because a caller who sent `hour: 25` meant something and did not get it.
  const hour = raw.hour === undefined ? 0 : intInRange(raw.hour, 0, 23);
  if (hour === null) return null;
  const weekday = raw.weekday === undefined ? 1 : intInRange(raw.weekday, 0, 6);
  if (weekday === null) return null;
  return { every: raw.every, minute, hour, weekday };
}

export const DEFAULT_BUDGET: AutomationBudget = { maxCreditsPerRun: 120, maxRunsPerDay: 4 };

function normaliseBudget(v: unknown): AutomationBudget | null {
  if (v === undefined || v === null) return { ...DEFAULT_BUDGET };
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const raw = v as Record<string, unknown>;
  const perRun = raw.maxCreditsPerRun === undefined ? DEFAULT_BUDGET.maxCreditsPerRun : intInRange(raw.maxCreditsPerRun, MIN_CREDITS_PER_RUN, MAX_CREDITS_PER_RUN);
  if (perRun === null) return null;
  const perDay = raw.maxRunsPerDay === undefined ? DEFAULT_BUDGET.maxRunsPerDay : intInRange(raw.maxRunsPerDay, 1, MAX_RUNS_PER_DAY);
  if (perDay === null) return null;
  return { maxCreditsPerRun: perRun, maxRunsPerDay: perDay };
}

export type NormaliseResult = { ok: true; automation: Automation } | { ok: false; reason: AutomationReject };

/**
 * Validate an automation arriving from outside.
 *
 * THE TRIGGER DECIDES WHICH OTHER FIELDS ARE REQUIRED, and a field that does not belong to the
 * chosen trigger is CLEARED rather than kept. An automation with `trigger: 'manual'` that still
 * carries a schedule is a row whose next-fire column the dispatcher would read: it would run on a
 * schedule the settings page does not show, because the page renders by trigger. Storing a field
 * nothing acts on is how a stored field becomes a field something acts on.
 */
export function normaliseAutomation(
  input: AutomationInput,
  ctx: { ownerId: string; projectId: string; now: number; id?: string; createdAt?: number },
): NormaliseResult {
  if (typeof ctx.ownerId !== 'string' || ctx.ownerId.trim() === '') return { ok: false, reason: 'bad_owner' };
  if (typeof ctx.projectId !== 'string' || ctx.projectId.trim() === '') return { ok: false, reason: 'bad_project' };

  const name = cleanName(input.name, NAME_MAX);
  if (name === null) return { ok: false, reason: 'bad_name' };

  let description: string | null = null;
  if (input.description !== undefined && input.description !== null && input.description !== '') {
    description = cleanName(input.description, DESCRIPTION_MAX);
    if (description === null) return { ok: false, reason: 'bad_description' };
  }

  const prompt = typeof input.prompt === 'string' ? input.prompt.trim() : '';
  if (prompt.length === 0 || prompt.length > PROMPT_MAX) return { ok: false, reason: 'bad_prompt' };

  const mode = input.mode === undefined ? 'stone' : input.mode;
  if (!isAutomationMode(mode)) return { ok: false, reason: 'bad_mode' };

  const trigger = input.trigger === undefined ? 'manual' : input.trigger;
  if (!isAutomationTrigger(trigger)) return { ok: false, reason: 'bad_trigger' };

  // A zone is required for a SCHEDULE and harmless otherwise, so it is always stored and always
  // validated. `Intl` reads an absent timeZone as the system zone, which would make "no zone" mean
  // "whichever region this isolate happened to run in" - a different answer on two requests.
  const timezone = input.timezone === undefined ? 'UTC' : input.timezone;
  if (!isTimeZone(timezone)) return { ok: false, reason: 'unknown_timezone' };

  let schedule: Schedule | null = null;
  if (trigger === 'schedule') {
    schedule = normaliseSchedule(input.schedule);
    if (schedule === null) return { ok: false, reason: 'bad_schedule' };
  }

  let event: AutomationEvent | null = null;
  if (trigger === 'event') {
    if (!isAutomationEvent(input.event)) return { ok: false, reason: 'bad_event' };
    event = input.event;
  }

  const overlap = input.overlap === undefined ? 'skip' : input.overlap;
  if (!isOverlapPolicy(overlap)) return { ok: false, reason: 'bad_overlap' };

  const missedRuns = input.missedRuns === undefined ? 'skip' : input.missedRuns;
  if (!isMissedRunPolicy(missedRuns)) return { ok: false, reason: 'bad_missed_runs' };

  const maxRetries = input.maxRetries === undefined ? 0 : intInRange(input.maxRetries, 0, MAX_RETRIES);
  if (maxRetries === null) return { ok: false, reason: 'bad_retries' };

  const budget = normaliseBudget(input.budget);
  if (budget === null) return { ok: false, reason: 'bad_budget' };

  return {
    ok: true,
    automation: {
      id: ctx.id ?? crypto.randomUUID(),
      ownerId: ctx.ownerId,
      projectId: ctx.projectId,
      name,
      description,
      prompt,
      mode,
      trigger,
      schedule,
      timezone,
      event,
      // Default ON. An automation somebody just created and has to then go and switch on is a
      // two-step creation dressed as a safety feature.
      enabled: input.enabled === undefined ? true : input.enabled === true,
      overlap,
      missedRuns,
      maxRetries,
      budget,
      createdAt: ctx.createdAt ?? ctx.now,
      updatedAt: ctx.now,
    },
  };
}

// ---------------------------------------------------------------------------------------------
// when it fires
// ---------------------------------------------------------------------------------------------

export interface NextFire {
  /** The UTC instant. Null for an automation that has no schedule to compute one from. */
  at: number | null;
  /** How the wall time sat against the zone's offset changes. See zoned-time.ts. */
  fold: DstFold;
}

const DAY_MS = 86_400_000;

/**
 * The first fire strictly after `after`.
 *
 * STRICTLY AFTER, always. A "next" that can equal the instant it was computed from is a dispatcher
 * that fires the same schedule forever: it claims a fire, writes back a next-fire equal to the one
 * it just ran, and wakes to find it due again. That is the single most expensive bug this file can
 * have, because every iteration of it starts a build.
 *
 * Resolution goes through `instantForWall`, so the two mornings a year when a wall time is not one
 * instant are handled by the one piece of code in this tree that knows what to do about them - and
 * the fold it reports is carried out to the caller so the run history can say which morning it was.
 */
export function nextFireAfter(a: Pick<Automation, 'trigger' | 'schedule' | 'timezone'>, after: number): NextFire {
  if (a.trigger !== 'schedule' || !a.schedule) return { at: null, fold: 'normal' };
  const s = a.schedule;
  if (!isTimeZone(a.timezone)) return { at: null, fold: 'normal' };

  if (s.every === 'hour') {
    // Hourly needs no zone arithmetic for the HOUR - every zone's minute-of-hour boundary is a
    // fixed offset from UTC's - but it still must not land on `after` itself.
    const period = 3_600_000;
    const offsetIntoHour = s.minute * 60_000;
    const base = Math.floor((after - offsetIntoHour) / period) * period + offsetIntoHour;
    return { at: base > after ? base : base + period, fold: 'normal' };
  }

  // Daily and weekly are wall-clock: "09:00 every day" means 09:00 on the person's clock whatever
  // the offset is doing, which is the whole reason a zone is stored.
  //
  // Candidates are generated from the LOCAL date, walking forward one local day at a time. The
  // walk is bounded: eight days covers a week plus the slack a transition can introduce, and an
  // unbounded loop here is an unbounded loop inside a cron handler.
  const start = wallPartsAt(a.timezone, after);
  for (let i = 0; i <= 8; i += 1) {
    const probe = wallPartsAt(a.timezone, Date.UTC(start.year, start.month - 1, start.day, 12, 0, 0) + i * DAY_MS);
    if (s.every === 'week' && probe.weekday !== s.weekday) continue;
    const resolved = instantForWall(a.timezone, { year: probe.year, month: probe.month, day: probe.day, hour: s.hour, minute: s.minute });
    if (resolved.instant > after) return { at: resolved.instant, fold: resolved.fold };
  }
  // Unreachable for any schedule this file can produce. Returning null rather than throwing keeps
  // one malformed row from stopping the dispatcher for every other automation.
  return { at: null, fold: 'normal' };
}

export interface MissedVerdict {
  /** How many fires were due and not taken. */
  missed: number;
  /** Fire now? */
  run: boolean;
  reason: 'on_time' | 'caught_up' | 'skipped' | 'no_schedule';
}

/**
 * What to do about fires that should have happened while nothing was dispatching.
 *
 * `catch_up` RUNS EXACTLY ONE, however many were missed. See decision 1 in the header: the option
 * that runs all of them does not exist, and its absence is the feature. A person whose daily
 * automation missed a week wants today's build, not seven of them and a bill.
 */
export function missedRunVerdict(
  a: Pick<Automation, 'trigger' | 'schedule' | 'timezone' | 'missedRuns'>,
  dueAt: number,
  now: number,
): MissedVerdict {
  if (a.trigger !== 'schedule' || !a.schedule) return { missed: 0, run: false, reason: 'no_schedule' };
  // Count the fires strictly between the one that was due and now. Bounded, because an automation
  // dormant for a year would otherwise walk a year of hourly fires inside a cron handler.
  let missed = 0;
  let cursor = dueAt;
  for (let i = 0; i < 64; i += 1) {
    const next = nextFireAfter(a, cursor);
    if (next.at === null || next.at > now) break;
    missed += 1;
    cursor = next.at;
  }
  if (missed === 0) return { missed: 0, run: true, reason: 'on_time' };
  if (a.missedRuns === 'catch_up') return { missed, run: true, reason: 'caught_up' };
  return { missed, run: false, reason: 'skipped' };
}

// ---------------------------------------------------------------------------------------------
// whether it may start
// ---------------------------------------------------------------------------------------------

export type StartRefusal =
  | 'disabled'
  | 'overlapping'
  | 'daily_cap'
  | 'no_access'
  | 'killed';

export interface StartVerdict {
  start: boolean;
  /** For an overlap policy of 'queue', the fire is retried at the next tick rather than dropped. */
  requeue: boolean;
  reason: StartRefusal | 'ok';
}

export interface FireContext {
  /** Is a run already in flight on this project? */
  inFlight: boolean;
  /** Fires already taken by THIS automation today, in its own zone. */
  runsToday: number;
  /** Does the owner still have the access this automation needs? See decision 4. */
  authorized: boolean;
  /** The service-wide stop. An automation must honour it exactly like a person's run does. */
  killed?: boolean;
}

/**
 * May this fire start?
 *
 * ORDER IS THE ORDER THE ANSWERS MATTER IN. Access first: an automation belonging to somebody who
 * was removed from the project must be refused on those grounds, not on the grounds that the
 * project happens to be busy - which would leave it looking temporarily blocked forever. Then the
 * enabled flag, then the service kill switch, then the caps.
 */
export function startVerdict(
  a: Pick<Automation, 'enabled' | 'overlap' | 'budget'>,
  ctx: FireContext,
): StartVerdict {
  if (!ctx.authorized) return { start: false, requeue: false, reason: 'no_access' };
  if (!a.enabled) return { start: false, requeue: false, reason: 'disabled' };
  // The service-wide kill switch stops every generation for everyone (do/budget.ts). An automation
  // that ignored it would be the one caller in the product that could spend while spending is off.
  if (ctx.killed) return { start: false, requeue: true, reason: 'killed' };
  if (ctx.runsToday >= a.budget.maxRunsPerDay) return { start: false, requeue: false, reason: 'daily_cap' };
  if (ctx.inFlight) {
    return { start: false, requeue: a.overlap === 'queue', reason: 'overlapping' };
  }
  return { start: true, requeue: false, reason: 'ok' };
}

// ---------------------------------------------------------------------------------------------
// retries
// ---------------------------------------------------------------------------------------------

/**
 * Outcomes a fire can have. These mirror the session's own stop reasons plus the refusals a fire
 * can hit before a run ever starts.
 */
export const FIRE_OUTCOMES = ['ok', 'failed', 'quota', 'busy', 'refused', 'error'] as const;
export type FireOutcome = (typeof FIRE_OUTCOMES)[number];

/**
 * Outcomes a retry cannot fix, named rather than counted down.
 *
 * `quota` and `busy` will be refused identically on the next attempt - the allowance has not
 * returned and the project is still working - so a retry spends a dispatch and achieves nothing.
 * `refused` is a policy refusal (no access, disabled), which a retry cannot argue with either.
 * Retrying them would also burn the retry budget that the one genuinely transient case needs.
 */
const NEVER_RETRIED: ReadonlySet<FireOutcome> = new Set<FireOutcome>(['quota', 'busy', 'refused', 'ok']);

/** Fixed, not exponential: the dispatcher ticks on a fixed interval, so a delay finer than it is a lie. */
export const RETRY_DELAY_MS = 5 * 60_000;

export interface RetryVerdict {
  retry: boolean;
  /** When to try again. Null when not retrying. */
  at: number | null;
  reason: 'retrying' | 'not_retriable' | 'no_retries_left';
}

export function retryVerdict(outcome: FireOutcome, attempt: number, maxRetries: number, now: number): RetryVerdict {
  if (NEVER_RETRIED.has(outcome)) return { retry: false, at: null, reason: 'not_retriable' };
  if (attempt >= maxRetries) return { retry: false, at: null, reason: 'no_retries_left' };
  return { retry: true, at: now + RETRY_DELAY_MS, reason: 'retrying' };
}

// ---------------------------------------------------------------------------------------------
// duplicate triggers
// ---------------------------------------------------------------------------------------------

/**
 * The key that makes one scheduled fire happen once.
 *
 * Built from the automation and the instant it was DUE, never from the instant the dispatcher woke
 * up. Two dispatchers waking in the same minute compute the same due instant and therefore the
 * same key; two that computed it from `Date.now()` would compute two keys and start two builds.
 *
 * This is the same idea the public API's idempotency key expresses for a client request, applied
 * to a trigger that has no client to supply one.
 */
export function fireKey(automationId: string, dueAt: number): string {
  return `${automationId}@${dueAt}`;
}

/**
 * The key for an EVENT-triggered fire.
 *
 * The event's own subject is in it - a run id, a checkpoint id - so the same build finishing does
 * not start the same automation twice when the emitter is retried, and two DIFFERENT builds
 * finishing genuinely do start it twice.
 */
export function eventFireKey(automationId: string, event: AutomationEvent, subject: string): string {
  return `${automationId}!${event}!${subject}`;
}

// ---------------------------------------------------------------------------------------------
// what an automation is allowed to do
// ---------------------------------------------------------------------------------------------

/**
 * Re-authorise a standing actor against the project it acts on.
 *
 * `hasAccess` is supplied by the caller, which has just asked the same question the interactive
 * path asks - the automation is never trusted to carry its own answer forward from the day it was
 * created. That is the difference between a credential and a claim, and it is why removing
 * somebody from a project stops their automations against it.
 *
 * The OWNER of the automation is the actor, not whoever happens to trigger it: a manual "run now"
 * pressed by a collaborator must not silently execute with the collaborator's authority, and must
 * not execute with more than the owner's either.
 */
export interface FireAuthorization {
  ok: boolean;
  reason: 'ok' | 'owner_lost_access' | 'wrong_project';
}

export function authorizeFire(
  a: Pick<Automation, 'ownerId' | 'projectId'>,
  ctx: { projectId: string; ownerHasAccess: boolean },
): FireAuthorization {
  if (a.projectId !== ctx.projectId) return { ok: false, reason: 'wrong_project' };
  if (!ctx.ownerHasAccess) return { ok: false, reason: 'owner_lost_access' };
  return { ok: true, reason: 'ok' };
}

/**
 * A human sentence for a schedule, in the automation's own zone.
 *
 * Rendered next to the editor, with the DST disclosure beside it. A schedule a person cannot read
 * back is a schedule they cannot check, and the commonest automation bug is the one where it is
 * set for the right time in the wrong zone.
 */
export function describeSchedule(a: Pick<Automation, 'trigger' | 'schedule' | 'timezone' | 'event'>): string {
  if (a.trigger === 'manual') return 'Only when you run it.';
  if (a.trigger === 'event') return a.event ? `Whenever ${a.event.replace(/_/g, ' ')} in this project.` : 'On an event.';
  if (!a.schedule) return 'On a schedule.';
  const s = a.schedule;
  const mm = String(s.minute).padStart(2, '0');
  const hh = String(s.hour).padStart(2, '0');
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  if (s.every === 'hour') return `Every hour at :${mm} (${a.timezone}).`;
  if (s.every === 'day') return `Every day at ${hh}:${mm} (${a.timezone}).`;
  return `Every ${days[s.weekday] ?? 'Monday'} at ${hh}:${mm} (${a.timezone}).`;
}
