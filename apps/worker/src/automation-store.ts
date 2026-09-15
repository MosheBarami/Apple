// Automations and their execution history, stored. The policy is in `automations.ts` and nothing
// here re-decides it.
//
// WHY D1 AND NOT A DURABLE OBJECT, which is the same question notification-store.ts answers and
// with a second reason on top:
//
//   1. The dispatcher's question is "what is due ANYWHERE", across every project of every user.
//      A Durable Object is one project. Answering it by fanning out to one DO per project is a
//      query that gets slower every time anybody makes a project, run on a cron, forever.
//   2. An execution history keyed to the automation has to survive the project's session being
//      evicted, purged or restored - and `/purge` on a project deliberately destroys the session's
//      storage. A run history that vanished when somebody cleared a transcript would be a record
//      of spending that the spender can erase.
//
// THE PROPERTY THIS FILE KEEPS: every automation read and write binds `owner_id`, and the owner id
// comes from the verified JWT. There is no function here that lists automations by project alone,
// because "what runs against this project" is a question a collaborator could ask about somebody
// else's standing actor - including its prompt, which is the person's own words.
//
// THE ONE EXCEPTION IS THE DISPATCHER, and it is explicit: `dueAutomations` reads across owners
// because that is its entire job. It is never reachable from a request - only from the scheduled
// handler - and everything it returns is re-authorised against the owner before it fires.
import type { Env } from './env';
import { oncePerIsolate } from './schema-once';
import {
  isAutomationEvent,
  isAutomationMode,
  isAutomationTrigger,
  isMissedRunPolicy,
  isOverlapPolicy,
  type Automation,
  type AutomationEvent,
  type FireOutcome,
  type Schedule,
} from './automations';

type Corpus = Pick<Env, 'CORPUS'>;

/** How long an execution record is kept. Long enough to answer "what did this cost me last month". */
export const RETAIN_RUNS_MS = 90 * 86_400_000;

/** A per-owner ceiling, so one account cannot fill the dispatcher's working set. */
export const AUTOMATIONS_PER_OWNER_MAX = 25;

/**
 * The schema, asserted once per isolate rather than once per request.
 *
 * Every call used to issue this whole DDL list before the request could do anything — a
 * sequential round trip per statement to a single-threaded D1, for a schema unchanged since
 * the deployment booted. Under load D1 answers "exceeded its CPU time limit and was reset"
 * and the request 500s with an empty body, having written nothing. See schema-once.ts for
 * the two outages that came from exactly this.
 *
 * The key ignores `env` deliberately: one isolate serves one worker with one binding set, so
 * there is nothing for a second key to distinguish.
 */
export function ensureAutomationTables(env: Corpus): Promise<void> {
  return oncePerIsolate('automation', () => createAutomationTables(env), env.CORPUS);
}

async function createAutomationTables(env: Corpus): Promise<void> {
  await env.CORPUS.exec(
    `create table if not exists automations(id text primary key, owner_id text not null, project_id text not null, name text not null, description text, prompt text not null, mode text not null, trigger_kind text not null, schedule_json text, timezone text not null, event text, enabled integer not null, overlap text not null, missed_runs text not null, max_retries integer not null, max_credits_per_run integer not null, max_runs_per_day integer not null, created_at integer not null, updated_at integer not null, next_fire_at integer, last_fire_at integer)`,
  );
  // The dispatcher's index. Both columns, because the query is "enabled AND due" and an index on
  // `next_fire_at` alone would make a disabled automation's row just as expensive to skip.
  await env.CORPUS.exec(`create index if not exists idx_automations_due on automations(enabled, next_fire_at)`);
  await env.CORPUS.exec(`create index if not exists idx_automations_owner on automations(owner_id)`);
  // The event dispatcher's index: "what reacts to this, in this project".
  await env.CORPUS.exec(`create index if not exists idx_automations_event on automations(project_id, event)`);

  //[[ `fire_key` IS UNIQUE, AND THAT IS THE DUPLICATE-TRIGGER PROTECTION.
  //
  //   Not a check-then-insert. Two dispatchers waking in the same minute both read "no row for
  //   this key" and both insert, and the gap between the read and the write is exactly where the
  //   second build comes from. A unique index makes the database arbitrate: the second insert
  //   changes no rows, and `claimFire` reports that rather than an exception, so the loser of the
  //   race takes an ordinary branch instead of an error path.
  //
  //   The key is built from the automation and the instant the fire was DUE (see `fireKey`), never
  //   from the instant a dispatcher woke - two wake times, one due time, one key. ]]
  await env.CORPUS.exec(
    `create table if not exists automation_runs(id text primary key, automation_id text not null, owner_id text not null, project_id text not null, fire_key text not null unique, trigger_kind text not null, due_at integer, started_at integer not null, finished_at integer, outcome text, attempt integer not null, run_id text, credits integer, error text, fold text)`,
  );
  await env.CORPUS.exec(`create index if not exists idx_automation_runs_history on automation_runs(automation_id, started_at desc)`);
  await env.CORPUS.exec(`create index if not exists idx_automation_runs_owner on automation_runs(owner_id, started_at desc)`);
}

interface Row {
  id: string;
  owner_id: string;
  project_id: string;
  name: string;
  description: string | null;
  prompt: string;
  mode: string;
  trigger_kind: string;
  schedule_json: string | null;
  timezone: string;
  event: string | null;
  enabled: number;
  overlap: string;
  missed_runs: string;
  max_retries: number;
  max_credits_per_run: number;
  max_runs_per_day: number;
  created_at: number;
  updated_at: number;
  next_fire_at: number | null;
  last_fire_at: number | null;
}

const COLS =
  'id, owner_id, project_id, name, description, prompt, mode, trigger_kind, schedule_json, timezone, event, enabled, overlap, missed_runs, max_retries, max_credits_per_run, max_runs_per_day, created_at, updated_at, next_fire_at, last_fire_at';

export interface StoredAutomation extends Automation {
  /** When the dispatcher should next look at it. Null for manual and event triggers. */
  nextFireAt: number | null;
  lastFireAt: number | null;
}

/**
 * A stored row back into the typed shape, or null.
 *
 * Every enumerated column is re-validated on the way OUT. They are `text`, and a row written by a
 * migration, by an earlier version of this file, or by a hand-edited restore can hold anything -
 * and `row.overlap as OverlapPolicy` would hand the dispatcher a policy `startVerdict` has no
 * branch for, which is a fire that takes whichever branch happens to be last. One unreadable row
 * is dropped rather than taking the dispatcher down for everybody.
 */
export function fromRow(r: Row): StoredAutomation | null {
  if (!isAutomationMode(r.mode) || !isAutomationTrigger(r.trigger_kind)) return null;
  if (!isOverlapPolicy(r.overlap) || !isMissedRunPolicy(r.missed_runs)) return null;
  let schedule: Schedule | null = null;
  if (r.schedule_json) {
    try {
      const parsed = JSON.parse(r.schedule_json) as Schedule;
      // The shape, not just the parse: a row holding `{}` would otherwise become a schedule whose
      // hour and minute are undefined, and `Date.UTC(y, m, d, undefined)` is NaN.
      if (
        typeof parsed?.minute === 'number' &&
        typeof parsed?.hour === 'number' &&
        typeof parsed?.weekday === 'number' &&
        typeof parsed?.every === 'string'
      ) {
        schedule = parsed;
      }
    } catch {
      return null;
    }
  }
  const event = r.event !== null && isAutomationEvent(r.event) ? r.event : null;
  // A trigger whose required field did not survive the round trip is not an automation that fires
  // on a default - it is a row nothing can act on, and it is dropped.
  if (r.trigger_kind === 'schedule' && schedule === null) return null;
  if (r.trigger_kind === 'event' && event === null) return null;
  return {
    id: r.id,
    ownerId: r.owner_id,
    projectId: r.project_id,
    name: r.name,
    description: r.description,
    prompt: r.prompt,
    mode: r.mode,
    trigger: r.trigger_kind,
    schedule,
    timezone: r.timezone,
    event,
    enabled: r.enabled === 1,
    overlap: r.overlap,
    missedRuns: r.missed_runs,
    maxRetries: r.max_retries,
    budget: { maxCreditsPerRun: r.max_credits_per_run, maxRunsPerDay: r.max_runs_per_day },
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    nextFireAt: r.next_fire_at,
    lastFireAt: r.last_fire_at,
  };
}

function changesOf(res: unknown): number {
  const changes = (res as { meta?: { changes?: number } })?.meta?.changes;
  return typeof changes === 'number' && Number.isFinite(changes) ? changes : 0;
}

// ---------------------------------------------------------------------------------------------
// CRUD, always bound to an owner
// ---------------------------------------------------------------------------------------------

export type SaveResult = { ok: true; automation: StoredAutomation } | { ok: false; reason: 'too_many' | 'not_found' };

/**
 * Write one automation, new or edited.
 *
 * The per-owner cap is checked on CREATE only, and by counting rows rather than by trusting a
 * stored counter. An edit that would be refused because the account is at its limit is an edit
 * refused for a reason that has nothing to do with it - and would strand somebody at the cap with
 * no way to fix the automations they already have.
 */
export async function saveAutomation(env: Corpus, a: Automation, nextFireAt: number | null): Promise<SaveResult> {
  const existing = await env.CORPUS.prepare(`select id from automations where id = ? and owner_id = ?`).bind(a.id, a.ownerId).first<{ id: string }>();
  if (!existing) {
    const row = await env.CORPUS.prepare(`select count(*) as n from automations where owner_id = ?`).bind(a.ownerId).first<{ n: number }>();
    if (Number(row?.n ?? 0) >= AUTOMATIONS_PER_OWNER_MAX) return { ok: false, reason: 'too_many' };
  }
  await env.CORPUS.prepare(
    `insert into automations(${COLS}) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) on conflict(id) do update set name=excluded.name, description=excluded.description, prompt=excluded.prompt, mode=excluded.mode, trigger_kind=excluded.trigger_kind, schedule_json=excluded.schedule_json, timezone=excluded.timezone, event=excluded.event, enabled=excluded.enabled, overlap=excluded.overlap, missed_runs=excluded.missed_runs, max_retries=excluded.max_retries, max_credits_per_run=excluded.max_credits_per_run, max_runs_per_day=excluded.max_runs_per_day, updated_at=excluded.updated_at, next_fire_at=excluded.next_fire_at`,
  )
    .bind(
      a.id,
      a.ownerId,
      a.projectId,
      a.name,
      a.description,
      a.prompt,
      a.mode,
      a.trigger,
      a.schedule ? JSON.stringify(a.schedule) : null,
      a.timezone,
      a.event,
      a.enabled ? 1 : 0,
      a.overlap,
      a.missedRuns,
      a.maxRetries,
      a.budget.maxCreditsPerRun,
      a.budget.maxRunsPerDay,
      a.createdAt,
      a.updatedAt,
      nextFireAt,
      null,
    )
    .run();
  const saved = await getAutomation(env, a.ownerId, a.id);
  return saved ? { ok: true, automation: saved } : { ok: false, reason: 'not_found' };
}

export async function getAutomation(env: Corpus, ownerId: string, id: string): Promise<StoredAutomation | null> {
  if (!ownerId || !id) return null;
  const r = await env.CORPUS.prepare(`select ${COLS} from automations where id = ? and owner_id = ?`).bind(id, ownerId).first<Row>();
  return r ? fromRow(r) : null;
}

export async function listAutomations(env: Corpus, ownerId: string, opts: { projectId?: string } = {}): Promise<StoredAutomation[]> {
  if (!ownerId) return [];
  const res = opts.projectId
    ? await env.CORPUS.prepare(`select ${COLS} from automations where owner_id = ? and project_id = ? order by created_at desc`)
        .bind(ownerId, opts.projectId)
        .all<Row>()
    : await env.CORPUS.prepare(`select ${COLS} from automations where owner_id = ? order by created_at desc`).bind(ownerId).all<Row>();
  const out: StoredAutomation[] = [];
  for (const r of res.results ?? []) {
    const a = fromRow(r);
    if (a) out.push(a);
  }
  return out;
}

export async function deleteAutomation(env: Corpus, ownerId: string, id: string): Promise<boolean> {
  if (!ownerId || !id) return false;
  const res = await env.CORPUS.prepare(`delete from automations where id = ? and owner_id = ?`).bind(id, ownerId).run();
  // The HISTORY is deliberately kept. It is a record of what was spent, and a spender who can
  // erase it by deleting the automation is a spender who can erase the evidence.
  return changesOf(res) > 0;
}

/**
 * Pause or resume one automation.
 *
 * A dedicated write rather than a full save, because pausing has to work on a row this version of
 * the code may not be able to parse: an automation with a schedule shape a later release wrote is
 * exactly the one somebody urgently wants to stop, and `fromRow` returning null must not make it
 * unstoppable. The `next_fire_at` is left alone so resuming does not lose its place.
 */
export async function setAutomationEnabled(env: Corpus, ownerId: string, id: string, enabled: boolean, now: number): Promise<boolean> {
  if (!ownerId || !id) return false;
  const res = await env.CORPUS.prepare(`update automations set enabled = ?, updated_at = ? where id = ? and owner_id = ?`)
    .bind(enabled ? 1 : 0, now, id, ownerId)
    .run();
  return changesOf(res) > 0;
}

export type TransferResult = { ok: true } | { ok: false; reason: 'not_found' | 'no_access' | 'same_owner' };

/**
 * Hand an automation to somebody else.
 *
 * WHAT MAKES THIS SAFE IS THAT AN AUTOMATION CARRIES NO CREDENTIAL. It is a name, a prompt and a
 * schedule; the authority it runs with is looked up fresh on every fire, against its CURRENT
 * owner's access to the project (`authorizeFire`). So a transfer does not move a key, and the new
 * owner cannot inherit reach the old owner had and they do not - the first fire after the transfer
 * asks the question again about the new owner.
 *
 * `newOwnerHasAccess` is the caller's proof, established the same way every other project
 * authorisation in this tree is. Transferring to somebody who cannot open the project would create
 * an automation that can never fire, which is a worse outcome than refusing.
 */
export async function transferAutomation(
  env: Corpus,
  fromOwnerId: string,
  id: string,
  toOwnerId: string,
  ctx: { newOwnerHasAccess: boolean; now: number },
): Promise<TransferResult> {
  if (!fromOwnerId || !id || !toOwnerId) return { ok: false, reason: 'not_found' };
  if (fromOwnerId === toOwnerId) return { ok: false, reason: 'same_owner' };
  if (!ctx.newOwnerHasAccess) return { ok: false, reason: 'no_access' };
  const res = await env.CORPUS.prepare(`update automations set owner_id = ?, updated_at = ? where id = ? and owner_id = ?`)
    .bind(toOwnerId, ctx.now, id, fromOwnerId)
    .run();
  if (changesOf(res) === 0) return { ok: false, reason: 'not_found' };
  // The history keeps the owner it was run under. Rewriting it would make last month's spending
  // look like it belonged to somebody who did not authorise it.
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// the dispatcher's reads
// ---------------------------------------------------------------------------------------------

/**
 * Everything due, across owners.
 *
 * THE ONE CROSS-TENANT READ IN THIS FILE, and it is reachable only from the scheduled handler.
 * Bounded, because a cron invocation has a wall-clock limit and an unbounded batch is an
 * invocation that dies halfway with some automations fired and no record of which.
 */
export async function dueAutomations(env: Corpus, now: number, limit = 25): Promise<StoredAutomation[]> {
  const capped = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 25;
  const res = await env.CORPUS.prepare(
    `select ${COLS} from automations where enabled = 1 and next_fire_at is not null and next_fire_at <= ? order by next_fire_at asc limit ?`,
  )
    .bind(now, capped)
    .all<Row>();
  const out: StoredAutomation[] = [];
  for (const r of res.results ?? []) {
    const a = fromRow(r);
    if (a) out.push(a);
  }
  return out;
}

/** Automations in one project that react to one event. Cross-owner for the same reason. */
export async function automationsForEvent(env: Corpus, projectId: string, event: AutomationEvent, limit = 10): Promise<StoredAutomation[]> {
  if (!projectId) return [];
  const capped = Math.min(50, Math.max(1, Math.trunc(limit)));
  const res = await env.CORPUS.prepare(
    `select ${COLS} from automations where project_id = ? and event = ? and enabled = 1 and trigger_kind = 'event' order by created_at asc limit ?`,
  )
    .bind(projectId, event, capped)
    .all<Row>();
  const out: StoredAutomation[] = [];
  for (const r of res.results ?? []) {
    const a = fromRow(r);
    if (a) out.push(a);
  }
  return out;
}

/** Move the next-fire pointer. Separate from `saveAutomation` so the dispatcher never rewrites a definition. */
export async function scheduleNext(env: Corpus, id: string, nextFireAt: number | null, lastFireAt: number | null): Promise<void> {
  await env.CORPUS.prepare(`update automations set next_fire_at = ?, last_fire_at = coalesce(?, last_fire_at) where id = ?`)
    .bind(nextFireAt, lastFireAt, id)
    .run();
}

// ---------------------------------------------------------------------------------------------
// execution history
// ---------------------------------------------------------------------------------------------

export interface ExecutionRow {
  id: string;
  automationId: string;
  projectId: string;
  trigger: string;
  dueAt: number | null;
  startedAt: number;
  finishedAt: number | null;
  outcome: FireOutcome | null;
  attempt: number;
  runId: string | null;
  credits: number | null;
  error: string | null;
  /** The DST fold this fire's wall time sat in, so "why did this run at 03:30" is answerable. */
  fold: string | null;
}

export type ClaimResult = { claimed: true; executionId: string } | { claimed: false; reason: 'already_fired' };

/**
 * Claim one fire, exactly once.
 *
 * `insert or ignore` against a unique `fire_key`, and the VERDICT IS READ FROM THE WRITE. Two
 * dispatchers race here by design: one inserts a row, the other changes nothing and is told so. A
 * check-then-insert would have both of them read "not fired yet" and both start a build, and the
 * window is exactly as wide as the round trip between them.
 *
 * Not an exception path either. A unique-violation raised as an error would have to be recognised
 * by message, which differs between D1 and the engine the tests run on, and a catch broad enough
 * to cover both is a catch that swallows the failures worth seeing.
 */
export async function claimFire(
  env: Corpus,
  a: Pick<StoredAutomation, 'id' | 'ownerId' | 'projectId' | 'trigger'>,
  fireKeyValue: string,
  opts: { dueAt: number | null; now: number; attempt?: number },
): Promise<ClaimResult> {
  const id = crypto.randomUUID();
  const res = await env.CORPUS.prepare(
    `insert or ignore into automation_runs(id, automation_id, owner_id, project_id, fire_key, trigger_kind, due_at, started_at, finished_at, outcome, attempt, run_id, credits, error, fold) values(?,?,?,?,?,?,?,?,null,null,?,null,null,null,null)`,
  )
    .bind(id, a.id, a.ownerId, a.projectId, fireKeyValue, a.trigger, opts.dueAt, opts.now, opts.attempt ?? 0)
    .run();
  if (changesOf(res) === 0) return { claimed: false, reason: 'already_fired' };
  return { claimed: true, executionId: id };
}

/** Close an execution record with what actually happened. */
export async function finishFire(
  env: Corpus,
  executionId: string,
  result: { outcome: FireOutcome; now: number; runId?: string | null; credits?: number | null; error?: string | null; fold?: string | null },
): Promise<void> {
  await env.CORPUS.prepare(`update automation_runs set finished_at = ?, outcome = ?, run_id = ?, credits = ?, error = ?, fold = ? where id = ?`)
    .bind(
      result.now,
      result.outcome,
      result.runId ?? null,
      typeof result.credits === 'number' && Number.isFinite(result.credits) ? result.credits : null,
      result.error ? String(result.error).slice(0, 500) : null,
      result.fold ?? null,
      executionId,
    )
    .run();
}

/** How many times this automation has fired since `since`. The daily cap is checked against it. */
export async function firesSince(env: Corpus, automationId: string, since: number): Promise<number> {
  const row = await env.CORPUS.prepare(`select count(*) as n from automation_runs where automation_id = ? and started_at >= ?`)
    .bind(automationId, since)
    .first<{ n: number }>();
  return Number(row?.n ?? 0);
}

/**
 * One automation's history, bound to its owner.
 *
 * The owner is bound even though the automation id is already specific, for the reason the header
 * gives: a prompt is the person's own words, and a history row carries what it cost them.
 */
export async function listExecutions(env: Corpus, ownerId: string, automationId: string, limit = 25): Promise<ExecutionRow[]> {
  if (!ownerId || !automationId) return [];
  const capped = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 25;
  const res = await env.CORPUS.prepare(
    `select id, automation_id, project_id, trigger_kind, due_at, started_at, finished_at, outcome, attempt, run_id, credits, error, fold from automation_runs where automation_id = ? and owner_id = ? order by started_at desc limit ?`,
  )
    .bind(automationId, ownerId, capped)
    .all<{
      id: string;
      automation_id: string;
      project_id: string;
      trigger_kind: string;
      due_at: number | null;
      started_at: number;
      finished_at: number | null;
      outcome: string | null;
      attempt: number;
      run_id: string | null;
      credits: number | null;
      error: string | null;
      fold: string | null;
    }>();
  return (res.results ?? []).map((r) => ({
    id: r.id,
    automationId: r.automation_id,
    projectId: r.project_id,
    trigger: r.trigger_kind,
    dueAt: r.due_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
    outcome: (r.outcome as FireOutcome | null) ?? null,
    attempt: r.attempt,
    runId: r.run_id,
    credits: r.credits,
    error: r.error,
    fold: r.fold,
  }));
}

/**
 * What this automation has cost, over a window.
 *
 * SPEND ATTRIBUTED TO THE AUTOMATION, which nothing else in the product does: BudgetDO attributes
 * by (day, model, kind) and QuotaDO by day, so before this there was no way to answer "which of my
 * automations is spending my allowance". A run whose cost was never recorded is counted as
 * `unreadable` rather than as zero - adding a zero to a total is how a cost report understates.
 */
export interface AutomationSpend {
  runs: number;
  credits: number;
  unreadable: number;
  failures: number;
}

export async function automationSpend(env: Corpus, ownerId: string, automationId: string, since: number): Promise<AutomationSpend> {
  if (!ownerId || !automationId) return { runs: 0, credits: 0, unreadable: 0, failures: 0 };
  const row = await env.CORPUS.prepare(
    `select count(*) as runs, coalesce(sum(credits),0) as credits, sum(case when credits is null then 1 else 0 end) as unreadable, sum(case when outcome is not null and outcome != 'ok' then 1 else 0 end) as failures from automation_runs where automation_id = ? and owner_id = ? and started_at >= ?`,
  )
    .bind(automationId, ownerId, since)
    .first<{ runs: number; credits: number; unreadable: number; failures: number }>();
  return {
    runs: Number(row?.runs ?? 0),
    credits: Number(row?.credits ?? 0),
    unreadable: Number(row?.unreadable ?? 0),
    failures: Number(row?.failures ?? 0),
  };
}

/** The sweeper. History is a spending record, so it is kept for a quarter rather than a month. */
export async function pruneExecutions(env: Corpus, now: number): Promise<number> {
  const res = await env.CORPUS.prepare(`delete from automation_runs where started_at < ?`).bind(now - RETAIN_RUNS_MS).run();
  return changesOf(res);
}
