// DELETE IT — and say exactly what that did, and exactly what it could not do.
//
// Three published pages promised an account deletion that did not exist, and deleting a PROJECT
// stopped at its Durable Object: the conversation went, and the project's memory, its notifications,
// its automations, its asset-use history, its workspace files, its generated images and its live
// share links all stayed. A share link that outlives the project it opens is not leftover data, it
// is a working credential to something nobody can see any more.
//
// ---------------------------------------------------------------------------------------------
// THE RULE THIS FILE IS BUILT ON: a deletion may not claim more than it did.
// ---------------------------------------------------------------------------------------------
// Every sweep returns a COUNT from the store that performed it, never from the caller's idea of
// what was there, and the Postgres step re-reads afterwards to check that the rows are actually
// gone. What cannot be deleted with the credentials the worker holds is listed in `ACCOUNT_RESIDUE`
// and printed in the receipt — because the alternative is a green tick beside a row that is still
// there, and that is worse than no deletion at all: the person stops asking.
//
// WHAT THE WORKER CANNOT REACH, AND WHY. Everything this worker does against Postgres goes through
// the CALLER'S OWN JWT so RLS applies (see supa.ts). `projects` has a `for all` policy, so a person
// can delete their own projects and Postgres cascades messages, checkpoints, pairings, memberships
// and membership history with them. No other table has a delete policy for its owner, and there is
// no service-role credential in `Env` — so `profiles`, `usage_events`, `feedback`, `waitlist` and
// the `auth.users` identity itself are beyond this route. A DELETE against them would not error; it
// would affect zero rows and return 200, which is the exact shape of a failure that renders as a
// success. So they are not attempted. They are named.
import type { Env, AuthedUser } from './env';
import { supaRest } from './supa';
import { ensureApiKeyTables } from './api-keys';
import { ensureAutomationTables } from './automation-store';
import { ensureCredentialTable } from './user-credentials';
import { ensureMemoryTables } from './memory-store';
import { ensureNotificationTables } from './notification-store';
import { ensureProvenanceTables } from './provenance';
import { ensureWriteTable } from './creator-dashboard';
import { oncePerIsolate } from './schema-once';
import { shareGrantPrefix, shareLinkKey, shareLinkProjectPrefix } from './collab-links';

/** Typed by the person, in this exact form, before anything is deleted. */
export const ERASURE_CONFIRMATION = 'DELETE MY ACCOUNT';

export interface ErasureStep {
  store: 'd1' | 'do' | 'kv' | 'postgres';
  /** The table, key prefix or object this step swept. */
  target: string;
  status: 'erased' | 'failed';
  /** How many rows or keys the STORE said it removed. Null when the store cannot count. */
  rows: number | null;
  detail?: string;
}

export interface Residue {
  store: string;
  target: string;
  why: string;
}

export interface ErasureReceipt {
  subject: string;
  at: string;
  steps: ErasureStep[];
  residue: readonly Residue[];
  /** False whenever any step failed. Never inferred from the absence of an exception. */
  complete: boolean;
  /** THE HONEST HEADLINE: the sign-in identity is not removed by this route. */
  accountRemoved: boolean;
  summary: string;
}

/**
 * Everything a deletion leaves behind, with the reason it is left.
 *
 * Not a disclaimer — a worklist. Each line is either something the worker structurally cannot do
 * (no service-role credential) or something the business keeps on purpose (financial records).
 * Anything that is here for the FIRST reason stops being true the day a service-role credential
 * exists, and the line should move to the deletion rather than be quietly reworded.
 */
export const ACCOUNT_RESIDUE: readonly Residue[] = [
  {
    store: 'postgres',
    target: 'auth.users — your sign-in identity',
    why:
      'Removing a login takes a Supabase service-role credential, and this worker holds none by ' +
      'design: it acts only with your own token so row-level security applies to every query it ' +
      'makes. Your data is gone; the empty account can still sign in until an operator removes it.',
  },
  {
    store: 'postgres',
    target: 'public.profiles — the account row itself',
    why:
      'Its display name has been cleared and training consent withdrawn, which is everything in the ' +
      'row that describes you. The row is anchored to the sign-in identity above and goes when that does.',
  },
  {
    store: 'postgres',
    target: 'public.usage_events — what your runs cost',
    why:
      'The credit ledger behind invoices already issued. It is kept as an accounting record and has ' +
      'no delete policy for its owner, so this route does not pretend to have removed it.',
  },
  {
    store: 'postgres',
    target: 'public.feedback — bug reports and support messages you sent',
    why:
      'They are part of a conversation with support that may still be open, and the table has no ' +
      'owner delete policy. They stop pointing at you when the account row goes.',
  },
  {
    store: 'postgres',
    target: 'public.project_members and public.membership_events on OTHER people\'s projects',
    why:
      'Your grants on projects you do not own are administered by those projects\' owners, and ' +
      'removing them is their write, not yours. Ask the owner, or let the account removal cascade them.',
  },
  {
    store: 'do',
    target: 'QuotaDO — your credit ledger and Stripe subscription events',
    why:
      'Financial records tied to payments already taken. They are retained for accounting for as ' +
      'long as the law requires, which is a decision about money rather than about privacy.',
  },
  {
    store: 'do',
    target: 'AdminDO — the request log',
    why:
      'Request and audit events carry an actor id for at most 30 days and are then evicted by the ' +
      'log\'s own retention sweep. Deleting them selectively would break the audit trail they exist for.',
  },
];

// ---------------------------------------------------------------------------------------------
// the sweeps
// ---------------------------------------------------------------------------------------------

/** The most KV keys one prefix sweep will remove. Reported when reached, never silently applied. */
export const KV_SWEEP_MAX = 10_000;
/** How many listings one sweep will make. Exhausting it is a FAILURE, not a finished sweep. */
export const KV_SWEEP_ROUNDS = 200;

/**
 * Delete every key under a prefix.
 *
 * IT RE-LISTS FROM THE START EACH ROUND, AND CARRYING THE CURSOR IS THE BUG IT IS AVOIDING.
 *
 * The obvious loop is list-with-cursor, delete the page, follow the cursor. Under a cursor that is
 * a POSITION IN THE LISTING — which is what the KV fixture models, and what no documentation
 * promises against — deleting the page you just listed shifts every later key down by the size of
 * that page, and the cursor then lands past the ones that moved. Measured here: a three-key prefix
 * with a two-key page lost the middle key on every run, and the sweep reported success.
 *
 * Re-listing costs one extra request per round and cannot skip: a key that still exists is still
 * under the prefix, so the loop ends only when a listing comes back empty. Both bounds are
 * reported rather than silently applied, because a sweep that stopped early and said `erased` is
 * the same defect wearing a different hat.
 */
export async function deleteByPrefix(
  kv: KVNamespace,
  prefix: string,
  opts: { max?: number; rounds?: number } = {},
): Promise<{ deleted: number; truncated: boolean }> {
  const max = opts.max ?? KV_SWEEP_MAX;
  const rounds = opts.rounds ?? KV_SWEEP_ROUNDS;
  let deleted = 0;
  for (let round = 0; round < rounds; round += 1) {
    const listed = (await kv.list({ prefix })) as { keys: { name: string }[] };
    if (listed.keys.length === 0) return { deleted, truncated: false };
    for (const k of listed.keys) {
      if (deleted >= max) return { deleted, truncated: true };
      await kv.delete(k.name);
      deleted += 1;
    }
  }
  return { deleted, truncated: true };
}

async function d1Sweep(env: Pick<Env, 'CORPUS'>, target: string, sql: string, ...bind: unknown[]): Promise<ErasureStep> {
  try {
    const res = await env.CORPUS.prepare(sql).bind(...bind).run();
    return { store: 'd1', target, status: 'erased', rows: Number(res.meta?.changes ?? 0) };
  } catch (err) {
    return { store: 'd1', target, status: 'failed', rows: null, detail: String((err as Error)?.message ?? err) };
  }
}

async function kvSweep(env: Pick<Env, 'KV'>, target: string, prefix: string): Promise<ErasureStep> {
  try {
    const { deleted, truncated } = await deleteByPrefix(env.KV, prefix);
    return {
      store: 'kv',
      target,
      // A sweep that stopped at the cap has NOT finished, and must not be reported as if it had.
      status: truncated ? 'failed' : 'erased',
      rows: deleted,
      ...(truncated ? { detail: `stopped at ${KV_SWEEP_MAX} keys — run it again` } : {}),
    };
  } catch (err) {
    return { store: 'kv', target, status: 'failed', rows: null, detail: String((err as Error)?.message ?? err) };
  }
}

/**
 * Everything one project leaves outside its own Durable Object.
 *
 * The caller purges the Durable Object — that part already worked and is where the conversation,
 * checkpoints, op log and collaboration rows live. This is the fan-out that was missing.
 */
export async function eraseProjectData(env: Env, projectId: string): Promise<ErasureStep[]> {
  const steps: ErasureStep[] = [];
  await Promise.all([
    ensureMemoryTables(env).catch(() => {}),
    ensureNotificationTables(env).catch(() => {}),
    ensureAutomationTables(env).catch(() => {}),
    ensureProvenanceTables(env).catch(() => {}),
  ]);

  steps.push(await d1Sweep(env, 'memory_entries (project)', `delete from memory_entries where scope = 'project' and scope_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'memory_audit (project)', `delete from memory_audit where scope = 'project' and scope_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'notifications (project)', `delete from notifications where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'automation_runs (project)', `delete from automation_runs where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'automations (project)', `delete from automations where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'project_asset_use', `delete from project_asset_use where project_id = ?`, projectId));

  if (env.KV) {
    steps.push(await kvSweep(env, 'workspace files', `ws:${projectId}:`));
    steps.push(await kvSweep(env, 'workspace file history', `wsv:${projectId}:`));
    steps.push(await kvSweep(env, 'workspace trash', `wst:${projectId}:`));
    steps.push(await kvSweep(env, 'generated images', `image:${projectId}:`));
    steps.push(await kvSweep(env, 'generated audio', `audio:${projectId}:`));
    steps.push(await kvSweep(env, 'redeemed share grants', shareGrantPrefix(projectId)));
    steps.push(await eraseShareLinks(env, projectId));
  }
  return steps;
}

/**
 * A share link is stored TWICE and only one of the two is findable from the project.
 *
 * `share:link:<token>` is keyed by the secret itself — that is what makes redemption a single KV
 * read — and `share:link:by-project:<project>:<token>` is the index that makes a link listable at
 * all. Sweeping only the index would leave every issued link redeemable forever, pointing at a
 * project that no longer exists, with nothing left that could ever list it to revoke it.
 */
async function eraseShareLinks(env: Pick<Env, 'KV'>, projectId: string): Promise<ErasureStep> {
  const prefix = shareLinkProjectPrefix(projectId);
  try {
    let deleted = 0;
    for (let round = 0; round < KV_SWEEP_ROUNDS; round += 1) {
      // Re-listed from the start each round, for the reason `deleteByPrefix` records at length.
      const listed = (await env.KV.list({ prefix })) as { keys: { name: string }[] };
      if (listed.keys.length === 0) {
        return { store: 'kv', target: 'share links (and the tokens they are keyed by)', status: 'erased', rows: deleted };
      }
      for (const k of listed.keys) {
        if (deleted >= KV_SWEEP_MAX) break;
        const token = k.name.slice(prefix.length);
        if (token) await env.KV.delete(shareLinkKey(token));
        await env.KV.delete(k.name);
        deleted += 1;
      }
      if (deleted >= KV_SWEEP_MAX) break;
    }
    return { store: 'kv', target: 'share links', status: 'failed', rows: deleted, detail: 'the sweep did not run out of links — run it again' };
  } catch (err) {
    return { store: 'kv', target: 'share links', status: 'failed', rows: null, detail: String((err as Error)?.message ?? err) };
  }
}

/** The projects this person owns, or null when the question could not be answered at all. */
export async function ownedProjectIds(env: Env, user: AuthedUser): Promise<string[] | null> {
  const { ok, data } = await supaRest<{ id: string }[]>(
    env,
    user.jwt,
    `/projects?owner_id=eq.${encodeURIComponent(user.userId)}&select=id&limit=1000`,
  );
  if (!ok || !Array.isArray(data)) return null;
  return data.map((r) => r.id).filter((id): id is string => typeof id === 'string' && id.length > 0);
}

/**
 * Erase one account across every store this worker can reach.
 *
 * ORDER MATTERS. The project list is read FIRST and the whole operation refuses if it cannot be
 * read (see the route): a deletion that could not enumerate the projects would sweep the
 * user-scoped stores, skip every project-scoped one, and hand back a receipt that looks finished.
 */
export async function eraseAccountData(
  env: Env,
  user: AuthedUser,
  projectIds: readonly string[],
  opts: { now?: number } = {},
): Promise<ErasureReceipt> {
  const steps: ErasureStep[] = [];
  const at = new Date(opts.now ?? Date.now()).toISOString();

  // 1. The conversation objects, then everything each project leaves outside them.
  for (const id of projectIds) {
    try {
      const res = await env.SESSION_DO.get(env.SESSION_DO.idFromName(id)).fetch('https://do/purge', { method: 'POST' });
      steps.push({ store: 'do', target: `SessionDO ${id}`, status: res.ok ? 'erased' : 'failed', rows: null, ...(res.ok ? {} : { detail: `purge returned ${res.status}` }) });
    } catch (err) {
      steps.push({ store: 'do', target: `SessionDO ${id}`, status: 'failed', rows: null, detail: String((err as Error)?.message ?? err) });
    }
    steps.push(...(await eraseProjectData(env, id)));
  }

  // 2. The stores addressed by the PERSON rather than by a project.
  await Promise.all([
    ensureMemoryTables(env).catch(() => {}),
    ensureNotificationTables(env).catch(() => {}),
    ensureAutomationTables(env).catch(() => {}),
    ensureApiKeyTables(env).catch(() => {}),
    ensureCredentialTable(env).catch(() => {}),
    ensureWriteTable(env).catch(() => {}),
  ]);
  steps.push(await d1Sweep(env, 'memory_entries (user)', `delete from memory_entries where scope = 'user' and scope_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'memory_audit (user)', `delete from memory_audit where scope = 'user' and scope_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'memory_audit (acted by you)', `delete from memory_audit where actor = ?`, user.userId));
  steps.push(await d1Sweep(env, 'memory_org_members', `delete from memory_org_members where user_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'notifications', `delete from notifications where recipient_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'automation_runs', `delete from automation_runs where owner_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'automations', `delete from automations where owner_id = ?`, user.userId));
  // THE API KEYS GO FIRST AMONG THE CREDENTIALS, and they go whatever else fails: a live key
  // outliving the account is a credential to a thing that is supposed to be gone.
  steps.push(await d1Sweep(env, 'api_keys', `delete from api_keys where user_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'user_credentials', `delete from user_credentials where user_id = ?`, user.userId));
  steps.push(await d1Sweep(env, 'creator_write_log', `delete from creator_write_log where user_id = ?`, user.userId));

  // 3. Postgres: the projects, which cascade, and then a CHECK that they really went.
  steps.push(await erasePostgresProjects(env, user));
  steps.push(await minimiseProfile(env, user));

  const failed = steps.filter((s) => s.status === 'failed');
  return {
    subject: user.userId,
    at,
    steps,
    residue: ACCOUNT_RESIDUE,
    complete: failed.length === 0,
    accountRemoved: false,
    summary:
      failed.length === 0
        ? `Your data has been deleted from ${new Set(steps.map((s) => s.store)).size} stores and cannot be recovered. ` +
          `Your sign-in still exists and is empty — see what is left, below, and why.`
        : `${failed.length} of ${steps.length} stores could not be cleared: ${failed.map((s) => s.target).join(', ')}. ` +
          `Everything else listed as erased is gone for good. Ask support to finish the rest; nothing here will retry on its own.`,
  };
}

async function erasePostgresProjects(env: Env, user: AuthedUser): Promise<ErasureStep> {
  const filter = `/projects?owner_id=eq.${encodeURIComponent(user.userId)}`;
  const del = await supaRest<unknown[]>(env, user.jwt, filter, { method: 'DELETE', prefer: 'return=representation' });
  if (!del.ok) {
    return { store: 'postgres', target: 'projects (and everything that cascades from them)', status: 'failed', rows: null, detail: `delete returned ${del.status}` };
  }
  const removed = Array.isArray(del.data) ? del.data.length : null;
  // THE POST-CONDITION. PostgREST answers 200 for a delete that matched nothing, and row-level
  // security is exactly the thing that could turn this into a no-op without saying so. Ask again.
  const after = await supaRest<{ id: string }[]>(env, user.jwt, `${filter}&select=id&limit=1`);
  if (after.ok && Array.isArray(after.data) && after.data.length > 0) {
    return { store: 'postgres', target: 'projects', status: 'failed', rows: removed, detail: 'rows are still there after the delete — row-level security refused it' };
  }
  return { store: 'postgres', target: 'projects (and everything that cascades from them)', status: 'erased', rows: removed };
}

/**
 * The profile row cannot be deleted with the caller's own token. What it says about them can.
 *
 * This is minimisation, not deletion, and the receipt says so in `ACCOUNT_RESIDUE` rather than
 * counting it as the row having gone.
 */
async function minimiseProfile(env: Env, user: AuthedUser): Promise<ErasureStep> {
  const res = await supaRest<unknown[]>(env, user.jwt, `/profiles?id=eq.${encodeURIComponent(user.userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ display_name: null, training_opt_in: false }),
    prefer: 'return=representation',
  });
  return res.ok
    ? { store: 'postgres', target: 'profiles — display name cleared, training consent withdrawn', status: 'erased', rows: Array.isArray(res.data) ? res.data.length : null }
    : { store: 'postgres', target: 'profiles — display name', status: 'failed', rows: null, detail: `patch returned ${res.status}` };
}

// ---------------------------------------------------------------------------------------------
// the record
// ---------------------------------------------------------------------------------------------

/**
 * A deletion that leaves a residue has to be TRACKABLE, or the residue is just data nobody owns.
 *
 * The row lives in D1 rather than Postgres for one decisive reason: the Postgres tables this would
 * belong beside cannot be written by the person's own token either, so a `deletion_requests` table
 * there would need the same service-role credential that is missing in the first place — and a
 * migration whose applied state nothing in this repository can currently verify. D1's schema is
 * created by the worker, so this table exists wherever the worker runs.
 */
export function ensureDeletionTable(env: Pick<Env, 'CORPUS'>): Promise<void> {
  return oncePerIsolate('account-deletions', async () => {
    await env.CORPUS.prepare(
      `create table if not exists account_deletions(user_id text primary key, requested_at text not null, completed_at text, steps_done integer not null, steps_failed integer not null, account_removed integer not null, receipt text not null)`,
    ).run();
  }, env.CORPUS);
}

export async function recordDeletion(env: Pick<Env, 'CORPUS'>, receipt: ErasureReceipt): Promise<void> {
  await ensureDeletionTable(env);
  const done = receipt.steps.filter((s) => s.status === 'erased').length;
  const failed = receipt.steps.filter((s) => s.status === 'failed').length;
  await env.CORPUS.prepare(
    `insert into account_deletions(user_id, requested_at, completed_at, steps_done, steps_failed, account_removed, receipt)
     values (?, ?, ?, ?, ?, ?, ?)
     on conflict(user_id) do update set completed_at = excluded.completed_at, steps_done = excluded.steps_done,
       steps_failed = excluded.steps_failed, account_removed = excluded.account_removed, receipt = excluded.receipt`,
  )
    .bind(receipt.subject, receipt.at, receipt.complete ? receipt.at : null, done, failed, receipt.accountRemoved ? 1 : 0, JSON.stringify(receipt))
    .run();
}

export interface DeletionStatus {
  requested: boolean;
  requestedAt: string | null;
  completedAt: string | null;
  stepsDone: number;
  stepsFailed: number;
  accountRemoved: boolean;
  residue: readonly Residue[];
}

export async function readDeletionStatus(env: Pick<Env, 'CORPUS'>, userId: string): Promise<DeletionStatus> {
  await ensureDeletionTable(env);
  const row = await env.CORPUS.prepare(
    `select requested_at, completed_at, steps_done, steps_failed, account_removed from account_deletions where user_id = ?`,
  )
    .bind(userId)
    .first<{ requested_at: string; completed_at: string | null; steps_done: number; steps_failed: number; account_removed: number }>();
  if (!row) {
    return { requested: false, requestedAt: null, completedAt: null, stepsDone: 0, stepsFailed: 0, accountRemoved: false, residue: ACCOUNT_RESIDUE };
  }
  return {
    requested: true,
    requestedAt: row.requested_at,
    completedAt: row.completed_at,
    stepsDone: Number(row.steps_done ?? 0),
    stepsFailed: Number(row.steps_failed ?? 0),
    accountRemoved: Number(row.account_removed ?? 0) === 1,
    residue: ACCOUNT_RESIDUE,
  };
}
