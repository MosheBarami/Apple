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
//   2. A TABLE THAT WAS NOT READ IS NOT AN EMPTY TABLE. `studio_pairings` has no select policy, so
//      PostgREST answers a user's token with `[]` whatever it holds. Printed as rows, that reads as
//      "you have no pairings" — an observation nothing made. Such a table reports `unreadable` and
//      carries NO rows array, and the same is true of a query that errors: `failed`, with the
//      status, and no rows. The document's own `complete` flag is false whenever either happens.
//
//   3. WHAT IS NOT IN THE FILE IS NAMED IN THE FILE. Most of what this product knows about a person
//      is not in Postgres — the conversation is in a Durable Object, the workspace in KV, the
//      credit ledger in another Durable Object. `NON_POSTGRES_STORES` names them all; this module
//      prints the personal ones with the route that does serve them. An export that silently
//      stopped at the relational database would be the smallest true part of the answer.
import type { Env, AuthedUser } from './env';
import { supaRest } from './supa';
import { NON_POSTGRES_STORES, USER_EXPORT, type ExportTable, type NonPostgresStore } from './user-export';

export const ACCOUNT_EXPORT_FORMAT = 'golem.account-export.v1';

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
  | { status: 'failed'; reason: string; httpStatus: number | null; withheld: Readonly<Record<string, string>> };

export interface AccountExport {
  format: typeof ACCOUNT_EXPORT_FORMAT;
  exportedAt: string;
  user: { id: string; email: string | null };
  /** True only when every declared table was actually read. */
  complete: boolean;
  /** The tables that were not read, by name, so `complete: false` is never a mystery. */
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
  messages: 'GET /api/projects/{projectId}/export — the full transcript, one file per project',
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
  ledger: 'GET /api/me/usage',
  month_totals: 'GET /api/me/usage',
  billing_events: 'GET /api/billing/history',
  applied_events: 'not offered as a download — it holds only which Stripe events were already applied',
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
  'audio:<project>:': 'GET /api/projects/{projectId}/audio/{audioId}, while the hour lasts',
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
  const path =
    `/${spec.table}?${spec.ownerColumn}=eq.${encodeURIComponent(user.userId)}` +
    `&select=${encodeURIComponent(spec.fields.join(','))}&limit=${EXPORT_ROW_CAP}`;
  const { ok, status, data } = await supaRest<Record<string, unknown>[]>(env, user.jwt, path);
  if (!ok || !Array.isArray(data)) {
    return {
      status: 'failed',
      httpStatus: typeof status === 'number' ? status : null,
      withheld: spec.excluded,
      reason: `the query for ${spec.table} did not succeed, so this file cannot say what it holds`,
    };
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
