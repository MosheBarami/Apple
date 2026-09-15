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
    ownerColumn: 'id',
    fields: ['id', 'display_name', 'plan', 'training_opt_in', 'created_at'],
    excluded: {
      is_admin: 'an operational flag about our side of the relationship, not a fact about the person',
    },
  },
  {
    store: 'postgres',
    table: 'projects',
    ownerColumn: 'owner_id',
    fields: [
      'id', 'owner_id', 'name', 'description', 'place_name', 'place_id',
      'memory_summary', 'memory_facts', 'created_at', 'updated_at', 'last_activity_at', 'archived_at',
    ],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'messages',
    ownerColumn: 'owner_id',
    // `tool_trace` is INCLUDED deliberately: a transcript without the tool calls is not the
    // conversation that happened, it is a redacted version of it.
    fields: ['id', 'project_id', 'owner_id', 'role', 'mode', 'content', 'tool_trace', 'created_at'],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'checkpoints',
    ownerColumn: 'owner_id',
    fields: ['id', 'project_id', 'owner_id', 'label', 'kind', 'script_count', 'instance_count', 'size_bytes', 'created_at'],
    excluded: {
      r2_key: 'an internal object path; the SNAPSHOT is offered separately as a file, and the key would only let someone guess at neighbouring paths',
    },
  },
  {
    store: 'postgres',
    table: 'usage_events',
    ownerColumn: 'owner_id',
    // The token counts and model are INCLUDED: they are what a Spark figure was computed from, and
    // an export that gives the charge without the basis is a number the person cannot check.
    fields: ['id', 'owner_id', 'project_id', 'kind', 'sparks', 'input_tokens', 'output_tokens', 'model', 'created_at'],
    excluded: {},
  },
  {
    store: 'postgres',
    table: 'feedback',
    ownerColumn: 'owner_id',
    fields: ['id', 'owner_id', 'kind', 'content', 'page', 'created_at'],
    excluded: {
      status: 'our triage state for the report, not a fact about the person who filed it',
    },
  },
  {
    store: 'd1',
    table: 'api_keys',
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

/** Columns this product will never put in an export, whatever table they turn up in. */
export const NEVER_EXPORT: readonly string[] = ['key_hash', 'token_hash', 'secret', 'password', 'jwt'];

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
