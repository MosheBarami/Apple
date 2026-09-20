// EVERYTHING WE HOLD ABOUT YOU, AS ONE FILE — driven by the spec in user-export.ts.
//
// `user-export.ts` has been a column-by-column inventory of one person's data since f-624a203a, and
// until now NOTHING IMPORTED IT. The product shipped a per-project transcript export and a memory
// export, and the account-wide one the privacy page promises did not exist. A spec with no caller
// is a document; this is the caller.
//
// THREE RULES, and each is the answer to a way this file could be worse than not existing:
//
//   1. THE SPEC DRIVES THE QUERY. Every select names `spec.fields` — never `*` — so a column added
//      by a migration cannot arrive in an export nobody decided about. The reverse (a column that
//      should be here and is not) is caught by tests/export-inventory.test.mjs against the
//      migrations, and by infra/supabase/tests/export-completeness.mjs against a real database.
//
//   2. AN EMPTY ARRAY IS NOT AN EMPTY TABLE, and there are three doors to that same `[]`.
//      `studio_pairings` has no select policy, so PostgREST answers a user's token with `[]`
//      whatever it holds. A query that errors gives back nothing at all. And `messages`,
//      `checkpoints` and `usage_events` have a select policy and NO WRITER — the transcript is in
//      SESSION_DO and the ledger in QUOTA_DO — so they answer `[]` to a person with thousands of
//      messages. Printed as rows, each of the three reads as "you have none of these", which is an
//      observation nothing made. They report `unreadable`, `failed` and `not_recorded_here`
//      respectively, NONE of them carries a rows array or a count anybody could quote back, and the
//      document's own `complete` flag is false whenever any of them happens.
//
//   3. WHAT IS NOT IN THE FILE IS NAMED IN THE FILE. Most of what this product knows about a person
//      is not in Postgres — the conversation is in a Durable Object, the workspace in KV, the
//      credit ledger in another Durable Object. `NON_POSTGRES_STORES` names them all; this module
//      prints the personal ones with the route that does serve them. An export that silently
//      stopped at the relational database would be the smallest true part of the answer.
import type { Env, AuthedUser } from './env';
import { supaRest } from './supa';
import { NON_POSTGRES_STORES, USER_EXPORT, type ExportTable, type NonPostgresStore } from './user-export';

/*
 * THE STAMP ON THE FILE A PERSON DOWNLOADS, and the reason it needs no legacy spelling.
 *
 * `golem.memory.v1` kept its old form in a LEGACY_EXPORT_FORMATS list because `parseImport` reads
 * it back: a bundle already on somebody's disk must not become "unknown format". This one is
 * write-only. Nothing in this repository parses an account export — it is a download and never an
 * upload — so there is no reader to keep compatible and an accepted alias would be dead weight
 * pretending to be caution.
 *
 * If an import path is ever built, it accepts both, and this comment is where that is decided.
 */
export const ACCOUNT_EXPORT_FORMAT = 'apple.account-export.v1';

/**
 * The most rows one table contributes.
 *
 * A single request per table keeps the whole export inside a handful of subrequests, and the cap is
 * REPORTED rather than applied quietly: `truncated` means "the cap was reached and there may be
 * more", which is a different sentence from "this is all of it". The conversation — the one store
 * that routinely runs to thousands of rows — has its own paged export per project, named in
 * `elsewhere`.
 */
export const EXPORT_ROW_CAP = 5000;

export type TableResult =
  | { status: 'ok'; rows: unknown[]; count: number; truncated: boolean; withheld: Readonly<Record<string, string>> }
  | { status: 'unreadable'; reason: string; withheld: Readonly<Record<string, string>> }
  | { status: 'failed'; reason: string; httpStatus: number | null; withheld: Readonly<Record<string, string>> }
  /**
   * The table was read, it was empty, and nothing has ever written to it — so the emptiness is a
   * property of this product's architecture and not a fact about the person. No `rows` and no
   * `count`, for the reason `unreadable` carries neither: a zero somebody can quote back is the
   * whole defect. `storedIn`, `holds` and `where` come from the same inventory as `elsewhere`.
   */
  | {
    status: 'not_recorded_here';
    reason: string;
    storedIn: string;
    holds: string;
    where: string;
    withheld: Readonly<Record<string, string>>;
  };

export interface AccountExport {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  exportedAt: string;
  user: { id: string; email: string | null };
  /** True only when every declared table was read AND this file carries what that table is for. */
  complete: boolean;
  /**
   * The declared tables whose contents are NOT in this file, by name, so `complete: false` is never
   * a mystery — and so a person scanning one line can see that their conversations are not here.
   *
   * Three causes and the entry in `tables` says which: the query failed, the caller may not select
   * from it at all, or this product records that data in another store entirely. They are listed
   * together because the question this list answers is "what did I not get", which has one answer
   * whichever of the three happened, and the reason for the distinction is one lookup away.
   */
  incomplete: string[];
  tables: Record<string, TableResult>;
  elsewhere: { store: string; binding: string; name: string; holds: string; where: string }[];
  sha256?: string;
}

/**
 * WHERE THE REST OF IT LIVES.
 *
 * Keyed by the store name in `NON_POSTGRES_STORES`, so a store that is added to the inventory and
 * not given an answer here is caught by the test rather than silently printed without one. "Not
 * offered as a download" is a real answer and is written as such; an empty string is not.
 */
const WHERE_ELSE: Readonly<Record<string, string>> = {
  generated_images: 'GET /api/projects/{projectId}/images/{imageId} — the index of your private saved images, linked from each conversation result',
  // The same route answers for both halves, because a person asking for their images wants the
  // files and not the rows that point at them. Naming the bucket separately is what keeps the
  // inventory honest about where the bytes are; naming the same route twice is what keeps the
  // answer useful.
  'image/<project>/': 'GET /api/projects/{projectId}/images/{imageId} — the image files themselves, served from the same authenticated route',
  generated_image_tombstones: 'not offered as a download — only deleted project IDs remain to prevent late writes from recreating erased images',
  messages: 'GET /api/projects/{projectId}/export — the full transcript, one file per project',
  message_models: 'GET /api/projects/{projectId}/export — model identity travels with the transcript',
  message_revisions: 'GET /api/projects/{projectId}/export — earlier versions travel with the transcript',
  checkpoints: 'GET /api/projects/{projectId}/checkpoints, and the snapshot itself through a restore',
  checkpoint_chunks: 'the bytes behind GET /api/projects/{projectId}/checkpoints',
  oplog: 'GET /api/projects/{projectId}/attribution',
  memory_entries: 'GET /api/memory/user/{userId}/export, and /api/memory/project/{projectId}/export per project',
  memory_audit: 'GET /api/memory/{scope}/{scopeId}/audit',
  memory_org_members: 'GET /api/orgs — the organisations you belong to, and at what role',
  notifications: 'GET /api/notifications — your whole inbox, read and unread',
  automations: 'GET /api/projects/{projectId}/automations',
  automation_runs: 'GET /api/automations/{id}/runs',
  user_credentials: 'GET /api/me/roblox-key — the fingerprint and last four only; the key itself is never returned to anyone',
  creator_write_log: 'GET /api/me/roblox/writes',
  project_asset_use: 'GET /api/projects/{projectId}/attribution',
  account_deletions: 'GET /api/me/delete — the record of your own deletion request and what it left behind',
  recovery_requests: 'not offered as a download — the row holds a hash of the address rather than the address, so this product cannot tell which account it belongs to; an operator finds it by being GIVEN the address through another channel',
  ledger: 'GET /api/me/usage',
  month_totals: 'GET /api/me/usage',
  billing_events: 'GET /api/billing/history',
  applied_events: 'not offered as a download — it holds only which Stripe events were already applied',
  applied_refunds:
    'not offered as a separate download — it holds only which runs have already had their Credits returned, so a retried refund cannot pay you twice. The refund itself appears as a negative row in your usage at GET /api/me/usage',
  billing_authority_replays:
    'not offered as a separate download — this is bounded service-internal replay state for recent normalized billing decisions. Your current subscription and billing change history are available at GET /api/billing/history; this cache does not contain raw Stripe payloads or credentials',
  events: 'not offered as a download — the request log is operational, and it carries no actor id at all once analytics are switched off',
  collab_comments: 'GET /api/shared/{projectId}/comments',
  collab_mentions: 'GET /api/notifications — a mention reaches you as an inbox row',
  collab_reactions: 'GET /api/shared/{projectId}/comments — reactions travel with the comment',
  collab_reviews: 'GET /api/shared/{projectId}/reviews',
  collab_review_reviewers: 'GET /api/shared/{projectId}/reviews',
  collab_approvals: 'GET /api/shared/{projectId}/reviews',
  collab_versions: 'GET /api/shared/{projectId}/versions',
  'PairingDO storage': 'not offered as a download — a pairing code lives for minutes and is a credential while it does',
  'DiscordDO storage': 'GET /api/discord/link',
  'ws:<project>:': 'GET /api/projects/{projectId}/files/archive — every workspace file as a zip',
  'wsv:<project>:': 'GET /api/projects/{projectId}/files/history',
  'wst:<project>:': 'GET /api/projects/{projectId}/files — the trash is listed with the files',
  'image:<project>:': 'GET /api/projects/{projectId}/images/{imageId}, while the hour lasts',
  'audio/<project>/': 'GET /api/projects/{projectId}/audio/{audioId} — add ?download=1 to save the file rather than play it',
  'audio:<project>:': 'GET /api/projects/{projectId}/audio/{audioId}, while the hour lasts — this is the older store and its objects are the ones that expire',
  'share:link:': 'GET /api/shared/{projectId}/links',
  'share:grant:<project>:': 'GET /api/shared/{projectId}/members',
  'idem:<keyId>:': 'not offered as a download — it holds the response to a call your own key already made',
};

/** The personal stores this file does not contain, each with the route that does serve it. */
export function elsewhereFor(stores: readonly NonPostgresStore[] = NON_POSTGRES_STORES) {
  return stores
    .filter((s) => s.personal)
    .map((s) => ({
      store: s.store,
      binding: s.binding,
      name: s.name,
      holds: s.holds,
      where: WHERE_ELSE[s.name] ?? 'not offered as a download',
    }));
}

/** Exposed so a test can assert every personal store has an answer, rather than a fallback. */
export function storesWithoutAnAnswer(stores: readonly NonPostgresStore[] = NON_POSTGRES_STORES): string[] {
  return stores.filter((s) => s.personal && !(s.name in WHERE_ELSE)).map((s) => s.name);
}

/**
 * The store that actually holds what a `recordedElsewhere` table only looks like it holds.
 *
 * Resolved from `NON_POSTGRES_STORES` and `WHERE_ELSE` rather than written out beside the spec, so
 * the route in the empty `messages` entry and the route in the `elsewhere` list are the same string
 * and cannot come to disagree. Null when the name matches no store, which the caller treats as "say
 * nothing extra" — inventing a destination for a person's transcript would be worse than the count
 * this replaces. tests/account-export-stores.test.mjs asserts every pointer in the spec resolves.
 */
export function recordedElsewhereAnswer(
  name: string,
  stores: readonly NonPostgresStore[] = NON_POSTGRES_STORES,
): { storedIn: string; holds: string; where: string } | null {
  const store = stores.find((s) => s.name === name);
  if (!store) return null;
  return { storedIn: store.binding, holds: store.holds, where: WHERE_ELSE[name] ?? 'not offered as a download' };
}

function wordPattern(value: string): RegExp {
  return new RegExp(`\\b${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
}

/**
 * Whether PostgREST specifically rejected one selected column as missing.
 *
 * This is deliberately narrower than "a 4xx". A JWT failure, an RLS refusal, a malformed query,
 * or an unavailable database must stay a failed export; retrying any of those with a different
 * projection would turn an auth/outage signal into a guessed success. The two accepted codes are
 * PostgreSQL's undefined-column error and PostgREST's schema-cache equivalent, and both must name
 * the table and column that this compatibility path is allowed to replace.
 */
export function isMissingPostgrestColumn(error: unknown, table: string, column: string): boolean {
  if (!error || typeof error !== 'object' || Array.isArray(error)) return false;
  const body = error as { code?: unknown; message?: unknown; details?: unknown };
  const code = typeof body.code === 'string' ? body.code : '';
  if (code !== '42703' && code !== 'PGRST204') return false;
  const message = [body.message, body.details]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
  if (!wordPattern(table).test(message) || !wordPattern(column).test(message)) return false;
  if (code === '42703') return /\bdoes not exist\b/i.test(message);
  return /\bcould not find\b[\s\S]*\bcolumn\b[\s\S]*\bschema cache\b/i.test(message);
}

function postgresPath(spec: ExportTable, userId: string, fields: readonly string[]): string {
  return `/${spec.table}?${spec.ownerColumn}=eq.${encodeURIComponent(userId)}`
    + `&select=${encodeURIComponent(fields.join(','))}&limit=${EXPORT_ROW_CAP}`;
}

async function readPostgresTable(env: Env, user: AuthedUser, spec: ExportTable): Promise<TableResult> {
  if (spec.access === 'service_role') {
    return {
      status: 'unreadable',
      withheld: spec.excluded,
      reason:
        `${spec.table} has no row-level select policy for the person it is about, so a query made with ` +
        'your own credentials returns nothing whether or not there are rows. Reporting that as "no rows" ' +
        'would be a claim nothing measured, so this export declines to make it.',
    };
  }
  const path = postgresPath(spec, user.userId, spec.fields);
  const first = await supaRest<Record<string, unknown>[]>(env, user.jwt, path);
  let { ok, status, data } = first;

  // The live catalogue has an older usage_events shape (`sparks`) while the current migration
  // and public contract call that value `credits`. Retry exactly that one missing-column failure,
  // with the same user JWT and owner filter, then translate the legacy key at the export boundary.
  // No other table, error code, or error message is eligible for a compatibility retry.
  if (
    spec.table === 'usage_events'
    && spec.fields.includes('credits')
    && !ok
    && status === 400
    && isMissingPostgrestColumn(data, spec.table, 'credits')
  ) {
    const legacyFields = spec.fields.map((field) => field === 'credits' ? 'credits:sparks' : field);
    const legacy = await supaRest<Record<string, unknown>[]>(env, user.jwt, postgresPath(spec, user.userId, legacyFields));
    ok = legacy.ok;
    status = legacy.status;
    data = legacy.data;
  }
  if (!ok || !Array.isArray(data)) {
    return {
      status: 'failed',
      httpStatus: typeof status === 'number' ? status : null,
      withheld: spec.excluded,
      reason: `the query for ${spec.table} did not succeed, so this file cannot say what it holds`,
    };
  }
  // AN EMPTY READ OF A TABLE NOTHING WRITES IS NOT "YOU HAVE NONE OF THESE". `recordedElsewhere` in
  // user-export.ts names the three: they carry a select policy and no writer, so `[]` is what they
  // return for a person with thousands of messages. Printed as `count: 0` beside the word
  // `messages`, that is the observation nothing made — the same defect `unreadable` exists for,
  // arriving through a reader that worked rather than one that could not run.
  //
  // Rows that DO come back are still handed over as `ok`. The live catalogue is older than the
  // migrations (see the `sparks` retry above), so a row left by a previous version of this product
  // is possible, and it is this person's; dropping it to make the point would be the worse lie.
  if (data.length === 0 && spec.recordedElsewhere) {
    const answer = recordedElsewhereAnswer(spec.recordedElsewhere);
    if (answer) {
      return {
        status: 'not_recorded_here',
        withheld: spec.excluded,
        storedIn: answer.storedIn,
        holds: answer.holds,
        where: answer.where,
        reason:
          `public.${spec.table} can be read and is never written: no code path in this product puts a row `
          + 'in it, so an empty result is not a count of yours and this file will not print one. What you '
          + 'are looking for is in the store named in `storedIn`, and this file does not contain it — '
          + 'fetch it from the route in `where` before you delete anything.',
      };
    }
  }
  return { status: 'ok', rows: data, count: data.length, truncated: data.length >= EXPORT_ROW_CAP, withheld: spec.excluded };
}

async function readD1Table(env: Env, user: AuthedUser, spec: ExportTable): Promise<TableResult> {
  try {
    // The field list is the spec's, interpolated because D1 cannot bind an identifier — and it is
    // safe to interpolate for exactly one reason: these strings are in this repository, not in a
    // request. The OWNER, which does come from outside, is bound.
    const cols = spec.fields.join(', ');
    const res = await env.CORPUS.prepare(`select ${cols} from ${spec.table} where ${spec.ownerColumn} = ?`)
      .bind(user.userId)
      .all<Record<string, unknown>>();
    const rows = res.results ?? [];
    return { status: 'ok', rows, count: rows.length, truncated: false, withheld: spec.excluded };
  } catch (err) {
    return {
      status: 'failed',
      httpStatus: null,
      withheld: spec.excluded,
      reason: `${spec.table} could not be read: ${String((err as Error)?.message ?? err)}`,
    };
  }
}

/**
 * Build the bundle. Never throws: a store that cannot be read becomes a stated failure inside the
 * document, because a 500 tells the person nothing about which half of their data exists.
 */
export async function collectAccountExport(
  env: Env,
  user: AuthedUser,
  opts: { now?: number; specs?: readonly ExportTable[] } = {},
): Promise<AccountExport> {
  const specs = opts.specs ?? USER_EXPORT;
  const tables: Record<string, TableResult> = {};
  for (const spec of specs) {
    tables[spec.table] = spec.store === 'postgres' ? await readPostgresTable(env, user, spec) : await readD1Table(env, user, spec);
  }
  const incomplete = Object.entries(tables)
    .filter(([, r]) => r.status !== 'ok')
    .map(([name]) => name);
  return {
    format: ACCOUNT_EXPORT_FORMAT,
    exportedAt: new Date(opts.now ?? Date.now()).toISOString(),
    user: { id: user.userId, email: user.email ?? null },
    complete: incomplete.length === 0,
    incomplete,
    tables,
    elsewhere: elsewhereFor(),
  };
}

/** `apple-data-2026-09-15.json`. Dated, because a person keeps more than one of these. */
export function accountExportFilename(exportedAt: string): string {
  const day = /^\d{4}-\d{2}-\d{2}/.exec(exportedAt)?.[0] ?? 'export';
  return `apple-data-${day}.json`;
}
