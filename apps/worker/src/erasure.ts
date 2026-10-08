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
// WHAT THE WORKER DOES AGAINST POSTGRES. Everything it does there goes through the CALLER'S OWN JWT so
// RLS applies (see supa.ts). `projects` has a `for all` policy, so a person can delete their own
// projects and Postgres cascades messages, checkpoints, pairings, memberships and membership history
// with them. No other table has a delete policy for its owner, so a DELETE against `profiles`,
// `usage_events`, `feedback` or `waitlist` would not error; it would affect zero rows and return 200,
// which is the exact shape of a failure that renders as a success. They are not attempted that way.
//
// THE SIGN-IN IDENTITY (owner decision D-14, 2026-10-05). The worker now holds a Supabase secret key
// (roblox-oauth.ts, where every use of it lives), and the LAST step of a deletion uses it to delete
// the `auth.users` row with the Auth admin API. Postgres then cascades what hangs from it, read from
// the live schema on 2026-10-05 (planning/proof/M2/LEGAL-CLAIMS.md section 9): `profiles` (id
// references auth.users on delete cascade), and through it the projects and everything under them, the
// memberships and the pairings. `feedback` and `waitlist` are set to null by their own constraints, and
// `usage_events` is detached by migration 0015 so that deleting the user does NOT cascade the ledger
// away. What the deletion keeps is in `ACCOUNT_RESIDUE`.
//
// ORDER AND FAILURE, ONE ORDER, and the pages (privacy, the data page, Settings) say this one:
//   1. each project's Durable Object is purged, and everything the project left outside it is swept;
//   2. the stores addressed by the person: memory, notifications, automations, API keys, stored credentials, and the Roblox token (the grant is revoked at Roblox first);
//   3. Postgres: the projects (which cascade), and the profile is minimised;
//   4. Discord is unlinked (through the Discord Durable Object, as Settings does);
//   5. the Roblox link, which is what lets a Roblox-only account confirm it is the person asking;
//   6. the Supabase account, LAST, and ONLY WHEN NOTHING BEFORE IT FAILED.
// A person whose deletion half-ran must still be able to sign in and run it again, and the sign-in is the thing that lets them. A failed step anywhere, the unlink and the
// link sweep included, keeps the sign-in: the receipt is incomplete and the route answers 207; a re-run is safe at every point (see the route). If the sign-in is the step
// that fails, the Roblox link is PUT BACK (step 5 is undone), so that a Roblox-only account can still confirm it is them for the re-run. Nothing is done after the sign-in
// is removed, so an account that is gone is a deletion that finished.
import type { Env, AuthedUser } from './env';
import { supaRest } from './supa';
import { ensureApiKeyTables } from './api-keys';
import { eraseProjectMedia } from './media-store';
import { ensureAutomationTables } from './automation-store';
import { ensureCredentialTable } from './user-credentials';
import { deleteSignInIdentity, ensureRobloxOAuthTables, readRobloxLink, restoreRobloxLink, revokeStoredRobloxGrant, type RobloxLinkSnapshot } from './roblox-oauth';
import { ensureAiConnectionTable } from './ai-connections';
import { ensureMemoryTables } from './memory-store';
import { ensureNotificationTables } from './notification-store';
import { ensureProvenanceTables } from './provenance';
import { ensureWriteTable } from './creator-dashboard';
import { oncePerIsolate } from './schema-once';
import { shareGrantPrefix, shareLinkKey, shareLinkProjectPrefix } from './collab-links';
import { attachmentProjectPrefix } from './attachments';
import { eraseGeneratedImages } from './generated-images';
import { ensureBrandingTables } from './branding';

/** Typed by the person, in this exact form, before anything is deleted. */
export const ERASURE_CONFIRMATION = 'DELETE MY ACCOUNT';

export interface ErasureStep {
  store: 'd1' | 'do' | 'kv' | 'r2' | 'postgres';
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
  /** THE HONEST HEADLINE: true only when the Supabase account was removed (or Auth said it was already gone). */
  accountRemoved: boolean;
  summary: string;
}

/**
 * Everything a deletion leaves behind, with the reason it is left.
 *
 * Not a disclaimer — a worklist. Each line is something this deletion does not reach or keeps on
 * purpose (financial records, correspondence, other people's projects). Two lines that were here
 * because the worker held no service-role credential (the sign-in identity, with the account row, and
 * the Discord link) moved into the deletion when it gained one, as this comment said they should.
 */
export const ACCOUNT_RESIDUE: readonly Residue[] = [
  {
    store: 'kv', target: 'in-flight temporary image previews',
    why: 'A preview already running can finish after the cache sweep and remain for up to one hour. The deleted-project fence prevents image retrieval through StudPilot.',
  },
  {
    store: 'd1',
    target: 'generated_image_tombstones — deleted project identifiers',
    why: 'Only deleted project IDs are retained, without images or account details, to prevent an in-flight generation from recreating deleted images.',
  },
  {
    store: 'postgres',
    target: 'public.usage_events — what your runs cost',
    why:
      'The credit ledger behind invoices already issued. It is kept as an accounting record, keyed by your account id, ' +
      'which after this deletion belongs to no account (a database migration stops the ledger being removed with the ' +
      'account). It has no delete policy for its owner, so this route does not pretend to have removed it.',
  },
  {
    store: 'postgres',
    target: 'public.feedback — bug reports and support messages you sent',
    why:
      'They are part of a conversation with support that may still be open. Deleting the account clears the link ' +
      'to it (the database sets it to null), so they no longer point at you; their text stays, and so does anything ' +
      'you wrote in it. The table has no owner delete policy.',
  },
  {
    store: 'postgres',
    target: 'public.waitlist — an email address left on the old waitlist, if you joined it',
    why:
      'The waitlist is closed and nothing reads or writes it now. If you ever joined it, the row holds the email ' +
      'address you gave. Deleting the account clears the link to your account (the database sets it to null) but ' +
      'not the address, which this route cannot delete with your own token. Ask support and it will be removed.',
  },
  {
    store: 'kv',
    target: 'share-link access you were given on projects other people own',
    why:
      'Your membership rows in the database go with the account. Access you were given by opening a share link is ' +
      'recorded in storage under that project, which this deletion cannot search by person, so it stays there until ' +
      'the project\'s owner removes it or the link\'s own expiry passes. It is of no use without a sign-in, and ' +
      'yours is what this deletion removes last.',
  },
  {
    store: 'postgres',
    target: 'public.membership_events — what you did on projects other people own',
    why:
      'History entries in which you added, changed or removed somebody on a project you do not own are part of that ' +
      'project\'s record. They stay, with your account cleared from them (the database sets it to null). The entries ' +
      'about you as the person affected go with the account.',
  },
  {
    store: 'do',
    target: 'QuotaDO — your credit ledger and Stripe subscription events',
    why:
      'Financial records tied to payments already taken. They are retained for accounting for as ' +
      'long as the law requires, which is a decision about money rather than about privacy.',
  },
  {
    store: 'cloudflare',
    target: 'AI Gateway — the log of model calls',
    why:
      'Every request to a Cloudflare-hosted model (voice recordings aside) is logged by Cloudflare AI Gateway with its prompt and reply, labelled with the kind ' +
      'of call and the model, not with an account id (a project identifier travels with the call as a routing hint). This ' +
      'route does not reach it. An entry is kept for 30 days and then deleted: a daily step of this worker removes ' +
      'the older ones.',
  },
  {
    store: 'do',
    target: 'AdminDO — the request log',
    why:
      'Request, error, audit, model-call and agent-run events can carry your account id for at most 30 days ' +
      '(run and model-call events carry the project id too, and so does the error event for a chat message ' +
      'that trips the abuse check; the analytics opt-out covers only the entry for each request and the ' +
      'error entry for a request that failed) and are then evicted by the log\'s own retention sweep. ' +
      'Deleting them selectively would break the audit trail they exist for.',
  },
  {
    store: 'd1',
    target: 'account_deletions — the record of this deletion',
    why:
      'The receipt you are reading is kept, with your account id, so it can be shown again and so a ' +
      'part-finished deletion can be completed. Nothing deletes it on a schedule.',
  },
  {
    store: 'do',
    target: 'SessionDO of projects other people own — what you wrote there',
    why:
      'Comments, reviews and conversation messages you added to a project someone else owns belong to ' +
      'that project and are administered by its owner. Deleting your account does not reach into it.',
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

  //[[ MEDIA IN R2, AND WHY IT IS THE FIRST STEP.
  //
  //   Generated images, audio and attachments moved out of KV, where a 3,600-second expiry was
  //   quietly doing half of this function's job for it. R2 has no expiry, so deletion is now
  //   entirely this sweep's responsibility — and a sweep nobody wrote would have turned "your
  //   account is deleted" into a statement that was false about every picture the product ever made
  //   for that person.
  //
  //   A deployment with no bucket reports `unavailable` rather than `erased`: "there was nothing to
  //   delete here" and "this store was not reachable" are different facts, and only one of them
  //   means the user's data is gone. A partial sweep is a FAILURE for the same reason — an
  //   incomplete erasure reported as complete is the worst answer available. ]]
  try {
    const media = await eraseProjectMedia(env, projectId);
    steps.push({
      store: 'r2',
      target: 'generated images, audio and attachments',
      status: media.status === 'erased' || media.status === 'unavailable' ? 'erased' : 'failed',
      rows: media.objects,
      ...(media.detail ? { detail: media.detail } : {}),
    });
  } catch {
    steps.push({
      store: 'r2',
      target: 'generated images, audio and attachments',
      status: 'failed',
      rows: null,
      detail: 'The media bucket could not be swept; retry is required before this deletion is complete.',
    });
  }
  try {
    steps.push({ store: 'd1', target: 'generated images', status: 'erased', rows: await eraseGeneratedImages(env, projectId) });
  } catch {
    steps.push({ store: 'd1', target: 'generated images', status: 'failed', rows: null, detail: 'Image storage could not be cleared; retry is required.' });
  }
  await Promise.all([
    ensureMemoryTables(env).catch(() => {}),
    ensureNotificationTables(env).catch(() => {}),
    ensureAutomationTables(env).catch(() => {}),
    ensureProvenanceTables(env).catch(() => {}),
    ensureBrandingTables(env).catch(() => {}),
  ]);

  steps.push(await d1Sweep(env, 'memory_entries (project)', `delete from memory_entries where scope = 'project' and scope_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'memory_audit (project)', `delete from memory_audit where scope = 'project' and scope_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'notifications (project)', `delete from notifications where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'automation_runs (project)', `delete from automation_runs where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'automations (project)', `delete from automations where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'project_asset_use', `delete from project_asset_use where project_id = ?`, projectId));
  steps.push(await d1Sweep(env, 'project_branding', `delete from project_branding where project_id = ?`, projectId));

  if (env.KV) {
    steps.push(await kvSweep(env, 'workspace files', `ws:${projectId}:`));
    steps.push(await kvSweep(env, 'workspace file history', `wsv:${projectId}:`));
    steps.push(await kvSweep(env, 'workspace trash', `wst:${projectId}:`));
    steps.push(await kvSweep(env, 'generated images', `image:${projectId}:`));
    steps.push(await kvSweep(env, 'generated audio', `audio:${projectId}:`));
    //[[ THE R2 STEP ABOVE HAS BEEN SAYING "AND ATTACHMENTS" OVER A PREFIX NOBODY WRITES TO.
    //
    //   `eraseProjectMedia` sweeps `attachment/<project>/` in R2 and this function reported that as
    //   "generated images, audio and attachments — erased". No attachment has ever been written
    //   there: `putAttachment` puts the bytes in KV, and attachments.ts records why. So a file the
    //   person uploaded survived the deletion they were shown a clean receipt for — the one thing
    //   the rule at the top of this file forbids. The seven-day KV expiry bounded how long, which
    //   makes it a false receipt rather than indefinite retention, and a false receipt is the
    //   failure this file exists to prevent. ]]
    steps.push(await kvSweep(env, 'chat attachments', attachmentProjectPrefix(projectId)));
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
    ensureAiConnectionTable(env).catch(() => {}),
    ensureWriteTable(env).catch(() => {}),
    ensureRobloxOAuthTables(env).catch(() => {}),
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
  steps.push(await d1Sweep(env, 'ai_connections', `delete from ai_connections where owner_id = ?`, user.userId));
  if (env.KV) steps.push(await kvSweep(env, 'AI inference preferences', `ai:selection:${user.userId}:`));
  steps.push(await d1Sweep(env, 'creator_write_log', `delete from creator_write_log where user_id = ?`, user.userId));
  //[[ THE ROBLOX SIGN-IN, and the grant is revoked at Roblox BEFORE our copy of the token is deleted: the
  //   sealed refresh token is the only handle there is to revoke it with. A failed revoke does not stop
  //   the deletion (the data this product holds must go either way), but the receipt says it happened. ]]
  const grant = await revokeStoredRobloxGrant(env, user.userId);
  const tokens = await d1Sweep(env, 'roblox_oauth_tokens', `delete from roblox_oauth_tokens where user_id = ?`, user.userId);
  if (tokens.status === 'erased' && grant !== 'none') {
    tokens.detail = grant === 'revoked'
      ? 'The Roblox authorization was revoked at Roblox.'
      : 'Roblox could not be asked to revoke the authorization. StudPilot no longer holds the token; you can remove StudPilot under Connections in your Roblox account settings.';
  }
  steps.push(tokens);
  // `roblox_identities` is NOT swept here: see step 5 below.

  // 3. Postgres: the projects, which cascade, and then a CHECK that they really went.
  steps.push(await erasePostgresProjects(env, user));
  steps.push(await minimiseProfile(env, user));

  // 4. DISCORD, through the Discord Durable Object, the way Settings' unlink does. Before the sign-in goes: a link to an account
  //    that has been deleted is a pass to spend nothing for nobody, but it is also the person's Discord id kept for no reason.
  steps.push(await eraseDiscordLink(env, user.userId));

  //[[ 5. THE ROBLOX LINK GOES WITH THE ACCOUNT, AND ONLY WHEN EVERYTHING ELSE WENT; AND THE SUPABASE ACCOUNT STILL GOES AFTER IT.
  //
  //   An account that signs in only with Roblox has no password, so the route lets it export or delete only inside ten minutes of a
  //   Roblox re-authentication, and that proof is a column of this very row (`reauth_at`); the re-authentication itself needs the
  //   row too (or, after a lost grant was wiped, the pointer in `roblox_wiped`). This sweep used to come before the Postgres steps. When one of them
  //   failed the route answered 207 "run it again", the row was already gone, and the retry answered 403 `reauth_required` that no
  //   re-authentication could ever satisfy: the part that failed could not be finished. So the row stays while any other step has
  //   failed, the receipt says so, and the run that completes the rest removes it.
  //
  //   THE SUPABASE ACCOUNT IS DELETED AFTER THIS ROW, so that nothing is left to do once the account is gone (an account that is gone cannot run a deletion again,
  //   and a sweep that failed after it would have been a part of the deletion that nobody could finish). The cost is that the sign-in can fail after this row went: then the row
  //   is PUT BACK, from what was read before it was swept, so the account is exactly as able to confirm itself and run the deletion again as it was. A row that cannot be
  //   read is not swept at all. A put-back that fails too is said, and is the one case a person needs support for. ]]
  const othersFailed = steps.some((s) => s.status === 'failed');
  let snapshot: RobloxLinkSnapshot | null = null;
  let linkStep: ErasureStep;
  if (othersFailed) {
    linkStep = (await robloxLinkHeld(env, user.userId))
      ? {
          store: 'd1',
          target: 'roblox_identities',
          status: 'failed',
          rows: null,
          detail: 'Not removed yet, on purpose: it is what lets this account confirm it is the person asking, and it goes in the run that finishes everything else. Run the deletion again.',
        }
      : { store: 'd1', target: 'roblox_identities', status: 'erased', rows: 0 };
  } else {
    snapshot = await readRobloxLink(env, user.userId);
    linkStep = snapshot === null
      ? {
          store: 'd1',
          target: 'roblox_identities',
          status: 'failed',
          rows: null,
          detail: 'Not removed yet, on purpose: it could not be looked at, and it is what lets this account confirm it is the person asking. Run the deletion again.',
        }
      : await sweepRobloxLink(env, user.userId);
  }
  steps.push(linkStep);

  // 6. THE SUPABASE ACCOUNT, LAST.
  const authTarget = 'auth.users — your sign-in identity (and your account row with it)';
  let accountRemoved = false;
  let linkNotPutBack = false;
  if (steps.some((s) => s.status === 'failed')) {
    // THE SIGN-IN STAYS WHEN ANYTHING BEFORE IT FAILED: it is how the person gets back in to run this again. Said as a failed step,
    // because the sign-in identity is still there and the receipt is not complete.
    steps.push({
      store: 'postgres',
      target: authTarget,
      status: 'failed',
      rows: null,
      detail: 'Not removed yet, on purpose: another step failed, and your sign-in is what lets you run the deletion again. It is removed in the run that finishes everything else.',
    });
  } else {
    const gone = await deleteSignInIdentity(env, user.userId);
    accountRemoved = gone.status !== 'failed';
    if (!accountRemoved && snapshot !== null && (snapshot.identity !== null || snapshot.wiped !== null)) {
      // The sign-in is still there, so the link goes back: it is what lets this account confirm itself for the next run.
      const back = await restoreRobloxLink(env, snapshot);
      linkNotPutBack = !back;
      linkStep.status = 'failed';
      linkStep.rows = null;
      linkStep.detail = back
        ? 'Put back on purpose: your sign-in could not be removed, so this account must still be able to confirm it is the person asking when you run the deletion again. It goes in the run that removes your sign-in.'
        : 'Removed, and it could not be put back after your sign-in failed to go. Contact support: this account cannot confirm itself until it is.';
    }
    steps.push({
      store: 'postgres',
      target: authTarget,
      status: accountRemoved ? 'erased' : 'failed',
      rows: gone.status === 'deleted' ? 1 : gone.status === 'already_gone' ? 0 : null,
      detail: gone.detail,
    });
  }

  const failed = steps.filter((s) => s.status === 'failed');
  const authStep = steps.find((s) => s.target.startsWith('auth.users'));
  return {
    subject: user.userId,
    at,
    steps,
    residue: ACCOUNT_RESIDUE,
    complete: failed.length === 0,
    accountRemoved,
    summary:
      failed.length === 0
        ? `Your data has been deleted from ${new Set(steps.map((s) => s.store)).size} stores and cannot be recovered. ` +
          (authStep?.rows === 0
            ? 'Your sign-in had already been removed. '
            : 'Your sign-in has been removed too, so this account cannot be used again. ') +
          `See what is left, below, and why.`
        : `${failed.length} of ${steps.length} stores could not be cleared: ${failed.map((s) => s.target).join(', ')}. ` +
          `Everything else listed as erased is gone for good. ` +
          // THE SIGN-IN IS ONLY REMOVED WHEN NOTHING ELSE FAILED, so a receipt with failed steps always has it still there.
          (linkNotPutBack
            ? 'Your sign-in is still there, but the Roblox link that lets this account confirm it is you could not be put back: contact support to finish the deletion.'
            : 'Your sign-in is still there so that you can run the deletion again; it is safe to repeat, and it finishes what is left.'),
  };
}

/**
 * Unlink Discord for this account, through the Discord Durable Object and the route Settings' unlink uses (`/unlink` with the
 * account id), then READ BACK that no link is left: an unlink that answered success while the link can still be read would be a
 * receipt that says something the object does not. `removed: false` with nothing left to read is "there was no link", and is done.
 * A missing binding, an object that errors, an answer that cannot be read and a link still there are each a failed step.
 */
async function eraseDiscordLink(env: Pick<Env, 'DISCORD_DO'>, userId: string): Promise<ErasureStep> {
  const target = 'DiscordDO — the link to a Discord account';
  const failed = (detail: string): ErasureStep => ({ store: 'do', target, status: 'failed', rows: null, detail });
  try {
    if (!env.DISCORD_DO) return failed('The Discord link store is not available on this deployment, so it could not be checked. Run the deletion again.');
    const stub = env.DISCORD_DO.get(env.DISCORD_DO.idFromName('singleton'));
    const res = await stub.fetch('https://do/unlink', { method: 'POST', body: JSON.stringify({ appleUserId: userId }) });
    if (!res.ok) return failed(`The Discord link could not be removed (unlink returned ${res.status}). Run the deletion again.`);
    const answer = (await res.json().catch(() => null)) as { removed?: unknown; codesRemoved?: unknown } | null;
    if (!answer || typeof answer.removed !== 'boolean') return failed('The Discord link store gave an answer that could not be read. Run the deletion again.');
    const check = await stub.fetch(`https://do/link-for-owner?appleUserId=${encodeURIComponent(userId)}`);
    const left = check.ok ? ((await check.json().catch(() => undefined)) as { link?: unknown } | undefined)?.link : undefined;
    if (left === undefined) return failed('The Discord link was removed, but a check afterwards could not be made. Run the deletion again.');
    if (left !== null) return failed('The Discord link is still there after the unlink. Run the deletion again.');
    const codes = typeof answer.codesRemoved === 'number' ? answer.codesRemoved : 0;
    return {
      store: 'do',
      target,
      status: 'erased',
      rows: (answer.removed ? 1 : 0) + codes,
      detail:
        (answer.removed ? 'The link to your Discord account was removed.' : 'No Discord account was linked.') +
        (codes > 0 ? ` ${codes} unused link code${codes === 1 ? ' was' : 's were'} withdrawn.` : ''),
    };
  } catch (err) {
    return failed(`The Discord link could not be removed (${String((err as Error)?.message ?? err)}). Run the deletion again.`);
  }
}

/** Is there a Roblox link to keep for this person (the link row, or the pointer a wipe left)? A lookup that throws is answered "yes": a link that could not be looked at is kept, not swept, and the receipt still goes out. */
async function robloxLinkHeld(env: Pick<Env, 'CORPUS'>, userId: string): Promise<boolean> {
  try {
    return (await env.CORPUS.prepare('select 1 as held from roblox_identities where user_id = ? union all select 1 from roblox_wiped where user_id = ?').bind(userId, userId).first()) !== null;
  } catch {
    return true;
  }
}

/** Sweep what lets a Roblox-only account confirm itself: the link row and the pointer a wipe left, in one batch (one transaction). Rows are what the store said it removed. */
async function sweepRobloxLink(env: Pick<Env, 'CORPUS'>, userId: string): Promise<ErasureStep> {
  try {
    const [link, wiped] = await env.CORPUS.batch([
      env.CORPUS.prepare('delete from roblox_identities where user_id = ?').bind(userId),
      env.CORPUS.prepare('delete from roblox_wiped where user_id = ?').bind(userId),
    ]);
    return { store: 'd1', target: 'roblox_identities', status: 'erased', rows: Number(link?.meta?.changes ?? 0) + Number(wiped?.meta?.changes ?? 0) };
  } catch (err) {
    return { store: 'd1', target: 'roblox_identities', status: 'failed', rows: null, detail: String((err as Error)?.message ?? err) };
  }
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
export async function minimiseProfile(env: Env, user: AuthedUser): Promise<ErasureStep> {
  const res = await supaRest<unknown[]>(env, user.jwt, `/profiles?id=eq.${encodeURIComponent(user.userId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ display_name: null, training_opt_in: false }),
    prefer: 'return=representation',
  });
  return res.ok
    ? { store: 'postgres', target: 'profiles — display name cleared, consent flag reset to off', status: 'erased', rows: Array.isArray(res.data) ? res.data.length : null }
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
