// WHAT THIS PRODUCT HOLDS ABOUT ONE PERSON, AND WHAT IT WILL NOT HAND BACK.
//
// f-624a203a. An export is two promises at once and they pull against each other: EVERYTHING about
// you, and NOTHING about anybody else — including nothing that is about you but is a secret whose
// disclosure would hurt you.
//
// So this file is a SPEC rather than a query. Each table names the exact columns that leave, and
// the columns that stay WITH THE REASON THEY STAY. A `select *` would satisfy "everything" and
// fail the other two the first time somebody adds a column, which is the failure this shape
// exists to prevent: the omission and the over-share both happen silently at schema-change time,
// and neither shows up in a test that only checks the rows it already knows about.
//
// The completeness check lives in infra/supabase/tests/export-completeness.mjs and runs against a
// REAL Postgres with the migrations applied, so "every column is accounted for" is measured against
// the schema rather than against this file's own idea of the schema. A spec checked against itself
// is a tautology — see the repository's notes on asserting against the runtime artefact.

export interface ExportTable {
  /** Where it lives. `postgres` is scoped by RLS; `d1` must be scoped by hand. */
  store: 'postgres' | 'd1';
  table: string;
  /**
   * WHO CAN ACTUALLY READ IT, which is not the same question as what it holds.
   *
   * `rls` — a select policy exists for the owner, so the export route reads it with the caller's
   *   own JWT and RLS decides. `worker` — D1, read directly and scoped by hand in the query.
   *   `service_role` — NOTHING THE WORKER HOLDS CAN READ IT. `studio_pairings` is managed through
   *   the service role and has no select policy at all, so a query with the user's token returns
   *   an empty array — which is indistinguishable from "you have no pairings" and would print in
   *   an export as exactly that. A failure to observe must not render as an observation, so the
   *   route reports this table as unread rather than as empty.
   *
   * tests/export-inventory.test.mjs derives this from the policies in infra/supabase/migrations,
   * so a migration that grants a select policy and leaves this at `service_role` (or takes one
   * away and leaves it at `rls`) fails rather than quietly changing what the export claims.
   */
  access: 'rls' | 'worker' | 'service_role';
  /** The column that ties a row to one person. */
  ownerColumn: string;
  /** EXACTLY what leaves. An allowlist, never a wildcard. */
  fields: readonly string[];
  /** What stays, and why. Every column of the table must appear here or in `fields`. */
  excluded: Readonly<Record<string, string>>;
}

export const USER_EXPORT: readonly ExportTable[] = [
  {
    store: 'postgres',
    table: 'profiles',
    access: 'rls',
    ownerColumn: 'id',
    fields: ['id', 'display_name', 'plan', 'training_opt_in', 'created_at'],
    excluded: {
      is_admin: 'an operational flag about our side of the relationship, not a fact about the person',
    },
  },
  {
    store: 'postgres',
    table: 'projects',
    access: 'rls',
    ownerColumn: 'owner_id',
    // `pinned_at` and `tags` arrived in migrations 0007 and 0008 and sat outside this list for two
    // migrations: a person's own labels for their own work, silently absent from "everything we
    // hold about you", with every suite green. That is the exact failure this file's header
    // describes, and it went unseen because the only check that could see it needs a docker daemon.
    // tests/export-inventory.test.mjs now runs the same audit off the migration files.
    fields: [
      'id', 'owner_id', 'name', 'description', 'place_name', 'place_id',
      'memory_summary', 'memory_facts', 'created_at', 'updated_at', 'last_activity_at', 'archived_at',
      'pinned_at', 'tags',
    ],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'messages',
    access: 'rls',
    ownerColumn: 'owner_id',
    // `tool_trace` is INCLUDED deliberately: a transcript without the tool calls is not the
    // conversation that happened, it is a redacted version of it.
    fields: ['id', 'project_id', 'owner_id', 'role', 'mode', 'content', 'tool_trace', 'created_at'],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'checkpoints',
    access: 'rls',
    ownerColumn: 'owner_id',
    fields: ['id', 'project_id', 'owner_id', 'label', 'kind', 'script_count', 'instance_count', 'size_bytes', 'created_at'],
    excluded: {
      r2_key: 'an internal object path; the SNAPSHOT is offered separately as a file, and the key would only let someone guess at neighbouring paths',
    },
  },
  {
    store: 'postgres',
    table: 'usage_events',
    access: 'rls',
    ownerColumn: 'owner_id',
    // The token counts and model are INCLUDED: they are what a Credit figure was computed from, and
    // an export that gives the charge without the basis is a number the person cannot check.
    fields: ['id', 'owner_id', 'project_id', 'kind', 'credits', 'input_tokens', 'output_tokens', 'model', 'created_at'],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'feedback',
    access: 'rls',
    ownerColumn: 'owner_id',
    /*
     * `status` MOVED FROM `excluded` TO HERE, AND THE REASON IT MOVED IS THE INTERESTING PART.
     *
     * It was excluded as "our triage state for the report, not a fact about the person who filed
     * it", and for as long as nothing in the product showed a status to anybody, that was true: it
     * really was a private note about our own queue.
     *
     * It stopped being true when GET /api/feedback began serving it to the account that filed the
     * row, and the support dialog began rendering it as "Waiting on us" / "Answered and closed". A
     * value this product STATES TO YOU is something you have been told, and an export that omits
     * what you were told is not a copy of what we say about you — it is that copy minus the one
     * field you would go looking for, which is whether anybody ever read it.
     *
     * The general shape, worth keeping in mind for the next column: an exclusion is a claim about
     * a field's audience, and shipping a surface that widens the audience invalidates the claim
     * without touching the line that makes it. apps/worker/tests/support-requests.test.mjs asserts
     * the two halves agree, so this one cannot go stale silently again.
     */
    fields: ['id', 'owner_id', 'kind', 'content', 'page', 'status', 'created_at'],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'studio_pairings',
    access: 'service_role',
    ownerColumn: 'owner_id',
    fields: ['owner_id', 'project_id', 'created_at', 'expires_at', 'claimed_at'],
    excluded: {
      code:
        'THE PAIRING SECRET. `/api/studio/claim` is unauthenticated and takes this code as its only ' +
        'proof, so an unclaimed one in a downloaded file is a live key to the project it names.',
    },
  },
  {
    store: 'postgres',
    table: 'waitlist',
    access: 'rls',
    ownerColumn: 'owner_id',
    fields: ['id', 'email', 'owner_id', 'created_at'],
    excluded: {},
  },
  {
    // The grants this person holds on OTHER PEOPLE'S projects. Their own project's roster is not
    // theirs to take away: `ownerColumn` is `user_id`, so this exports the rows that are about them.
    store: 'postgres',
    table: 'project_members',
    access: 'rls',
    ownerColumn: 'user_id',
    fields: [
      'project_id', 'user_id', 'role', 'display_name', 'created_at', 'expires_at', 'revoked_at',
      // A suspension and its stated reason are facts about this person, written about them by
      // somebody else. Withholding them would make the export disagree with what the product told
      // them when they were locked out.
      'suspended_at', 'suspended_reason',
    ],
    excluded: {
      invited_by: "another account's id — the invitation is about this person, the inviter is not",
      suspended_by: "another account's id, for the same reason as invited_by",
    },
  },
  {
    store: 'postgres',
    table: 'membership_events',
    access: 'rls',
    ownerColumn: 'subject_id',
    fields: ['id', 'project_id', 'subject_id', 'kind', 'from_role', 'to_role', 'reason', 'created_at'],
    excluded: {
      actor_id: "another account's id; what happened is this person's history, who did it is not theirs to take",
      via_token:
        'A LIVE SHARE LINK. This column holds the bearer token the grant was redeemed with (see ' +
        'collab-links.ts); in an exported file it is a working invitation to the project, redeemable ' +
        'by anyone the file reaches.',
    },
  },
  {
    // The latest access state may be stricter than the underlying Postgres/KV grant while a mirror
    // write or Durable Object delivery is being retried. It is therefore a fact about the person's
    // current project access, not merely queue bookkeeping, and belongs beside project_members in
    // their export.
    store: 'postgres',
    table: 'membership_access_state',
    access: 'rls',
    ownerColumn: 'user_id',
    fields: ['project_id', 'user_id', 'version', 'role', 'expires_at', 'access', 'updated_at'],
    excluded: {},
  },
  {
    store: 'd1',
    table: 'api_keys',
    access: 'worker',
    ownerColumn: 'user_id',
    fields: ['id', 'user_id', 'mode', 'name', 'scopes', 'projects', 'created_at', 'expires_at', 'last_used_at', 'revoked_at'],
    excluded: {
      key_hash:
        'THE SECRET. Exporting it hands anyone who reads the file — a support agent, a backup, an ' +
        'inbox — the material to attack the key offline. An export is a file that travels, and a ' +
        'credential is the one thing about a person that must not.',
    },
  },
];

/**
 * Columns this product will never put in an export, whatever table they turn up in.
 *
 * `token` is here because `membership_events.via_token` holds a LIVE share link. The pattern match
 * is `name === s || name.endsWith('_' + s)`, so this covers `via_token`, `refresh_token` and every
 * `_token` a later migration invents, before anybody has to remember to exclude it by hand.
 */
export const NEVER_EXPORT: readonly string[] = ['key_hash', 'token_hash', 'token', 'secret', 'password', 'jwt'];

/**
 * Postgres tables that hold data about a person and are deliberately NOT exported.
 *
 * Empty today, and kept because empty is a FINDING rather than an omission: every table in
 * infra/supabase/migrations that carries an owner column must appear either in `USER_EXPORT` above
 * or here with a reason, and tests/export-inventory.test.mjs fails on any table that is in neither.
 * Without this slot the only way to record "we looked at it and decided no" would be to say nothing,
 * which is indistinguishable from never having looked.
 */
export const NOT_EXPORTED_TABLES: Readonly<Record<string, string>> = {
  membership_access_outbox:
    'a transient per-worker delivery queue duplicating membership_access_state; attempts, retry timing and transport errors are service operations rather than an additional fact about the person',
};

export interface NonPostgresStore {
  /** Which kind of storage, and therefore which binding erases it. */
  store: 'd1' | 'do' | 'kv' | 'vectorize';
  /** A D1 or Durable Object SQLite table, a KV key prefix, or a named storage area. */
  name: string;
  binding: 'CORPUS' | 'KV' | 'VEC' | 'SESSION_DO' | 'QUOTA_DO' | 'ADMIN_DO' | 'BUDGET_DO' | 'PAIRING_DO' | 'DISCORD_DO';
  /** What it holds, in the words you would use to a person asking what you know about them. */
  holds: string;
  /** Whether a row in it can be tied to one identifiable person. */
  personal: boolean;
}

/**
 * EVERYTHING ELSE THIS PRODUCT STORES ABOUT A PERSON.
 *
 * `USER_EXPORT` is the Postgres half plus the one D1 table that is exported. It is not the
 * inventory — most of what this product knows about somebody never touches Postgres. A person's
 * conversation lives in a Durable Object, their memory and notifications in D1, the files the agent
 * wrote for them in KV, their credit ledger in another Durable Object. An inventory that stopped at
 * the relational database would answer a subject access request with the smallest part of the truth.
 *
 * So this names every non-Postgres table and key space, WHICHEVER BINDING it lives behind, and
 * tests/export-inventory.test.mjs walks apps/worker/src for `create table if not exists` and fails
 * if it finds one that is in neither list. A store that gets added and not declared is the exact
 * way an inventory rots, and it rots silently.
 *
 * `personal: false` is a claim, not a shrug: it says a row here cannot be tied to one person, which
 * is why the erasure path in erasure.ts does not visit it.
 */
export const NON_POSTGRES_STORES: readonly NonPostgresStore[] = [
  // ------------------------------------------------------------------ D1 (CORPUS)
  { store: 'd1', binding: 'CORPUS', name: 'memory_entries', personal: true, holds: 'what Apple was told to remember — per person, per project and per organisation' },
  { store: 'd1', binding: 'CORPUS', name: 'memory_audit', personal: true, holds: 'who changed a remembered fact, when, and what it said before' },
  { store: 'd1', binding: 'CORPUS', name: 'memory_org_members', personal: true, holds: 'which organisations a person belongs to, and at what role' },
  { store: 'd1', binding: 'CORPUS', name: 'memory_orgs', personal: false, holds: 'organisation names and who created them' },
  { store: 'd1', binding: 'CORPUS', name: 'notifications', personal: true, holds: 'one person\'s inbox: mentions, security events, run outcomes' },
  { store: 'd1', binding: 'CORPUS', name: 'automations', personal: true, holds: 'standing instructions a person set up, including the prompt they wrote' },
  { store: 'd1', binding: 'CORPUS', name: 'automation_runs', personal: true, holds: 'every time one of those ran, what it cost and whether it failed' },
  { store: 'd1', binding: 'CORPUS', name: 'user_credentials', personal: true, holds: 'the sealed Roblox Open Cloud key, its fingerprint and when it was last used' },
  { store: 'd1', binding: 'CORPUS', name: 'creator_write_log', personal: true, holds: 'every write this product made to a person\'s own Roblox account on their behalf' },
  { store: 'd1', binding: 'CORPUS', name: 'project_asset_use', personal: true, holds: 'which library assets a project placed — tied to a person through the project' },
  { store: 'd1', binding: 'CORPUS', name: 'account_deletions', personal: true, holds: 'that this account asked to be deleted, when, and what the erasure could not reach' },
  // A row here is ABOUT a person and cannot be tied to one BY THIS PRODUCT: recovery-requests.ts
  // stores the SHA-256 of the normalised address and never the address, precisely so the queue is
  // not a curated list of people currently locked out. That is why it is `personal: true` with an
  // answer saying no download exists — an export is keyed on a user id, and there is no user id in
  // the row to key on. Marking it `personal: false` would have satisfied the guard and been a lie
  // about what the table is for.
  { store: 'd1', binding: 'CORPUS', name: 'recovery_requests', personal: true, holds: 'that somebody who could not sign in asked for help, as a hash of the address and the note they wrote' },
  { store: 'd1', binding: 'CORPUS', name: 'asset_library', personal: false, holds: 'the shared asset catalogue; nothing in a row is about a customer' },
  { store: 'd1', binding: 'CORPUS', name: 'asset_verification_log', personal: false, holds: 'catalogue verification history' },
  { store: 'd1', binding: 'CORPUS', name: 'chunks', personal: false, holds: 'the documentation corpus the agent retrieves from' },
  { store: 'd1', binding: 'CORPUS', name: 'static_assets', personal: false, holds: 'the deployed web bundle' },
  { store: 'd1', binding: 'CORPUS', name: 'static_chunks', personal: false, holds: 'the bytes of the deployed web bundle' },

  // ---------------------------------------------------------- Durable Object storage
  { store: 'do', binding: 'SESSION_DO', name: 'messages', personal: true, holds: 'THE CONVERSATION — every message, in full, with its tool trace' },
  { store: 'do', binding: 'SESSION_DO', name: 'message_models', personal: true, holds: 'which Apple product model each conversation message selected' },
  { store: 'do', binding: 'SESSION_DO', name: 'message_revisions', personal: true, holds: 'earlier versions of a message the person edited and re-sent' },
  { store: 'do', binding: 'SESSION_DO', name: 'checkpoints', personal: true, holds: 'snapshots of the place, with who took them' },
  { store: 'do', binding: 'SESSION_DO', name: 'checkpoint_chunks', personal: true, holds: 'the bytes of those snapshots' },
  { store: 'do', binding: 'SESSION_DO', name: 'oplog', personal: true, holds: 'every operation the agent applied to the place, and who asked for it' },
  { store: 'do', binding: 'QUOTA_DO', name: 'ledger', personal: true, holds: 'one person\'s credit spend, day by day' },
  { store: 'do', binding: 'QUOTA_DO', name: 'month_totals', personal: true, holds: 'the monthly rollup of that spend' },
  { store: 'do', binding: 'QUOTA_DO', name: 'billing_events', personal: true, holds: 'the Stripe events that set this account\'s plan' },
  { store: 'do', binding: 'QUOTA_DO', name: 'applied_events', personal: true, holds: 'which of those were already applied, so a redelivery cannot double-charge' },
  {
    store: 'do',
    binding: 'QUOTA_DO',
    name: 'billing_authority_replays',
    personal: true,
    holds:
      'one account\'s bounded replay cache of normalized billing mutations, kept so a webhook retry returns the same subscription or credit decision; it does not store the raw Stripe payload or credentials',
  },
  { store: 'do', binding: 'ADMIN_DO', name: 'events', personal: true, holds: 'the request and audit log; an event carries the actor id unless the person opted out' },
  { store: 'do', binding: 'ADMIN_DO', name: 'counters', personal: false, holds: 'service-wide operational counters, no actor' },
  { store: 'do', binding: 'BUDGET_DO', name: 'spend', personal: false, holds: 'service-wide inference spend per day, no actor' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_comments', personal: true, holds: 'comments on a project, with their authors' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_mentions', personal: true, holds: 'who was mentioned in one' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_reactions', personal: true, holds: 'who reacted to what' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_reviews', personal: true, holds: 'review requests and who raised them' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_review_reviewers', personal: true, holds: 'who was asked to review' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_approvals', personal: true, holds: 'who approved a change' },
  { store: 'do', binding: 'SESSION_DO', name: 'collab_versions', personal: true, holds: 'named versions of a project and who saved them' },
  { store: 'do', binding: 'PAIRING_DO', name: 'PairingDO storage', personal: true, holds: 'a short-lived pairing code tying a Studio session to a person\'s project' },
  { store: 'do', binding: 'DISCORD_DO', name: 'DiscordDO storage', personal: true, holds: 'the link between a Discord account and this product\'s account' },

  // -------------------------------------------------------------------------- KV
  { store: 'kv', binding: 'KV', name: 'ws:<project>:', personal: true, holds: 'the files the agent wrote in a project workspace' },
  { store: 'kv', binding: 'KV', name: 'wsv:<project>:', personal: true, holds: 'earlier versions of those files' },
  { store: 'kv', binding: 'KV', name: 'wst:<project>:', personal: true, holds: 'deleted workspace files, until the trash window expires' },
  { store: 'd1', binding: 'CORPUS', name: 'generated_images', personal: true, holds: 'generated image files until project deletion; download from the authenticated image result' },
  { store: 'd1', binding: 'CORPUS', name: 'generated_image_tombstones', personal: true, holds: 'deleted project IDs retained to fence late image writes; no pixels or account details' },
  { store: 'kv', binding: 'KV', name: 'image:<project>:', personal: true, holds: 'temporary previews and older generated images, for an hour' },
  { store: 'kv', binding: 'KV', name: 'audio:<project>:', personal: true, holds: 'generated audio, for an hour' },
  { store: 'kv', binding: 'KV', name: 'share:link:', personal: true, holds: 'share links, keyed by the bearer token, with who created them' },
  { store: 'kv', binding: 'KV', name: 'share:grant:<project>:', personal: true, holds: 'grants redeemed from a share link' },
  { store: 'kv', binding: 'KV', name: 'idem:<keyId>:', personal: true, holds: 'public-API idempotency records, keyed by the API key that made the call' },
  { store: 'kv', binding: 'KV', name: 'config:models', personal: false, holds: 'the model routing table' },

  // ------------------------------------------------------------------- Vectorize
  { store: 'vectorize', binding: 'VEC', name: 'golem-docs', personal: false, holds: 'embeddings of the public documentation corpus' },
];

/** The spec for one table, or null if the table is not exported at all. */
export function exportSpecFor(table: string): ExportTable | null {
  return USER_EXPORT.find((t) => t.table === table) ?? null;
}

/**
 * Check a spec against the columns a table ACTUALLY has.
 *
 * Returns findings rather than a boolean: a column nobody decided about is a different problem from
 * a secret that leaked, and an export that quietly drops a new column is the one nobody notices.
 */
export function auditExportSpec(
  table: string,
  actualColumns: readonly string[],
): { code: 'undeclared_column' | 'secret_exported' | 'phantom_column'; column: string; why: string }[] {
  const spec = exportSpecFor(table);
  if (!spec) return [];
  const out: { code: 'undeclared_column' | 'secret_exported' | 'phantom_column'; column: string; why: string }[] = [];
  const declared = new Set<string>([...spec.fields, ...Object.keys(spec.excluded)]);

  for (const col of actualColumns) {
    if (!declared.has(col)) {
      out.push({
        code: 'undeclared_column',
        column: col,
        why: `${table}.${col} exists but the export spec neither sends it nor says why it stays`,
      });
    }
  }
  for (const col of spec.fields) {
    if (!actualColumns.includes(col)) {
      out.push({ code: 'phantom_column', column: col, why: `${table}.${col} is exported but does not exist` });
    }
    if (NEVER_EXPORT.some((s) => col === s || col.endsWith(`_${s}`))) {
      out.push({ code: 'secret_exported', column: col, why: `${table}.${col} looks like a secret and is in the export` });
    }
  }
  return out;
}
