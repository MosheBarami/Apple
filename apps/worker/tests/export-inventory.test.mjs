/**
 * THE INVENTORY, CHECKED AGAINST THE TREE — WITHOUT DOCKER.
 *
 * infra/supabase/tests/export-completeness.mjs already audits `user-export.ts` against a REAL
 * Postgres, and it is the better check: it reads the catalogue of a database that actually ran the
 * migrations. It also needs a docker daemon, so it is not part of `node --test tests/` and does not
 * run in CI. The consequence was measurable rather than theoretical: migrations 0007 and 0008 added
 * `projects.pinned_at` and `projects.tags`, the spec was never updated, and nothing in any suite
 * that anybody runs could see it. Two columns of a person's data stopped being in the export and
 * the tree stayed green for two migrations.
 *
 * So this is the same audit driven from the FILES rather than from a live catalogue: the column
 * lists are parsed out of infra/supabase/migrations (create table, then every add/drop column in
 * order), and the D1 tables are parsed out of their own `create table if not exists` in
 * apps/worker/src. Weaker than the docker check — it trusts the migrations to describe the
 * database — and strictly stronger than nothing, which is what ran before.
 *
 * THREE PROPERTIES, and the third is the one the audit's title actually claims:
 *
 *   1. every column of every EXPORTED table is either sent or withheld with a reason;
 *   2. no exported field looks like a credential;
 *   3. every table that holds data about a person is ACCOUNTED FOR — in the export, or named in
 *      the "not exported, and why" list. A new table nobody thought about is the failure this
 *      product would otherwise discover from a subject access request.
 *
 * IT FALSIFIES ITSELF twice: the parser is required to find a known column it would miss if the
 * regex drifted, and the auditor is handed a column nobody declared and required to report it. A
 * walk that finds nothing must never render as a clean tree — so every denominator here is
 * asserted to be non-zero before anything is concluded from it.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');
const ROOT = join(WORKER, '..', '..');
const MIGRATIONS = join(ROOT, 'infra', 'supabase', 'migrations');

const out = join(tmpdir(), `apple-inventory-${process.pid}.mjs`);
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
  join(WORKER, 'src', 'user-export.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${out}`,
], { cwd: WORKER, stdio: 'pipe' });
const SPEC = await import(pathToFileURL(out).href);
process.on('exit', () => rmSync(out, { force: true }));

// ------------------------------------------------------------------ the parser ---

const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');

/** The body of a parenthesised clause starting at `open`, respecting nesting and 'quoted' text. */
function balanced(sql, open) {
  let depth = 0;
  let quoted = false;
  for (let i = open; i < sql.length; i += 1) {
    const ch = sql[i];
    if (quoted) {
      if (ch === "'") quoted = false;
      continue;
    }
    if (ch === "'") quoted = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

/** Split a table body on commas that are not inside parentheses or quotes. */
function topLevelParts(body) {
  const parts = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quoted) {
      if (ch === "'") quoted = false;
      continue;
    }
    if (ch === "'") quoted = true;
    else if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter(Boolean);
}

const CONSTRAINT_WORDS = new Set(['primary', 'foreign', 'unique', 'check', 'constraint', 'exclude', 'like']);

/** table name -> ordered column names, built by replaying every migration in file order. */
function schemaFromMigrations() {
  const tables = new Map();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'));

    const create = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_]+)\s*\(/gi;
    for (let m = create.exec(sql); m; m = create.exec(sql)) {
      const body = balanced(sql, create.lastIndex - 1);
      if (body === null) continue;
      const cols = [];
      for (const part of topLevelParts(body)) {
        const first = part.split(/\s+/)[0].toLowerCase().replace(/"/g, '');
        if (CONSTRAINT_WORDS.has(first)) continue;
        cols.push(first);
      }
      if (!tables.has(m[1])) tables.set(m[1], cols);
    }

    const alter = /alter\s+table\s+(?:only\s+)?public\.([a-z_]+)([^;]*);/gi;
    for (let m = alter.exec(sql); m; m = alter.exec(sql)) {
      const cols = tables.get(m[1]);
      if (!cols) continue;
      const clause = m[2];
      const add = /add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z_]+)/gi;
      for (let a = add.exec(clause); a; a = add.exec(clause)) if (!cols.includes(a[1])) cols.push(a[1]);
      const drop = /drop\s+column\s+(?:if\s+exists\s+)?([a-z_]+)/gi;
      for (let d = drop.exec(clause); d; d = drop.exec(clause)) {
        const at = cols.indexOf(d[1]);
        if (at >= 0) cols.splice(at, 1);
      }
    }
  }
  return tables;
}

/**
 * Every `create table if not exists <name>` in one directory, from the worker's own source.
 *
 * The split by directory is the split by BINDING and it is exact: nothing under src/do touches
 * CORPUS and nothing above it touches `this.sql`, so src/*.ts is D1 and src/do/*.ts is Durable
 * Object storage. Asserted below rather than assumed.
 */
function tablesIn(dir) {
  const found = new Map();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
    const path = join(dir, entry.name);
    const src = readFileSync(path, 'utf8');
    const re = /create\s+table\s+if\s+not\s+exists\s+([a-z_]+)\s*\(/gi;
    for (let m = re.exec(src); m; m = re.exec(src)) {
      if (!found.has(m[1])) found.set(m[1], path.slice(WORKER.length + 1));
    }
  }
  return found;
}

/**
 * Which tables a logged-in user can SELECT from, according to the policies in the migrations.
 *
 * A table with no select policy answers a user's query with an empty array, not an error — which is
 * why this has to be derived rather than discovered at runtime. `for` is optional in `create
 * policy`; PostgreSQL defaults it to ALL, so a policy without one is a select policy.
 */
function selectableTables() {
  const selectable = new Set();
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = stripComments(readFileSync(join(MIGRATIONS, file), 'utf8'));
    const re = /create\s+policy\s+"[^"]+"\s+on\s+public\.([a-z_]+)([\s\S]*?);/gi;
    for (let m = re.exec(sql); m; m = re.exec(sql)) {
      const forClause = /\bfor\s+(select|insert|update|delete|all)\b/i.exec(m[2]);
      const cmd = forClause ? forClause[1].toLowerCase() : 'all';
      if (cmd === 'select' || cmd === 'all') selectable.add(m[1]);
    }
  }
  return selectable;
}

const SCHEMA = schemaFromMigrations();
const D1 = tablesIn(join(WORKER, 'src'));
const DO_TABLES = tablesIn(join(WORKER, 'src', 'do'));
const SELECTABLE = selectableTables();

// ------------------------------------------------------------- the parser works ---

test('the migration parser finds the tables and the columns that were added later', () => {
  // A walk that finds zero files is a broken walk. Assert the denominator before concluding
  // anything from an empty finding list.
  assert.ok(SCHEMA.size >= 10, `only ${SCHEMA.size} tables parsed out of the migrations`);
  const projects = SCHEMA.get('projects');
  assert.ok(projects, 'public.projects was not parsed at all');
  // From 0001, and from 0004/0007/0008 respectively — the `alter table … add column` replay.
  for (const col of ['owner_id', 'memory_facts', 'archived_at', 'pinned_at', 'tags']) {
    assert.ok(projects.includes(col), `projects.${col} was not parsed`);
  }
  // A constraint line is not a column.
  assert.equal(projects.includes('primary'), false);
  assert.ok(SCHEMA.get('project_members')?.includes('suspended_reason'), 'the 0006 alter was not replayed');
});

test('the D1 walk and the Durable Object walk each find their own tables, and do not overlap', () => {
  assert.ok(D1.size >= 12, `only ${D1.size} D1 tables found in apps/worker/src`);
  assert.ok(DO_TABLES.size >= 15, `only ${DO_TABLES.size} Durable Object tables found in apps/worker/src/do`);
  for (const t of ['api_keys', 'memory_entries', 'notifications', 'automations', 'user_credentials']) {
    assert.ok(D1.has(t), `${t} was not found in the D1 walk`);
  }
  for (const t of ['messages', 'checkpoints', 'oplog', 'ledger', 'events']) {
    assert.ok(DO_TABLES.has(t), `${t} was not found in the Durable Object walk`);
  }
  // The split is by directory and it is only meaningful because the bindings do not cross it.
  for (const name of readdirSync(join(WORKER, 'src', 'do'))) {
    if (!name.endsWith('.ts')) continue;
    const src = readFileSync(join(WORKER, 'src', 'do', name), 'utf8');
    assert.equal(/CORPUS/.test(src), false, `src/do/${name} touches CORPUS — the D1/DO split by directory is no longer true`);
  }
  for (const [t] of DO_TABLES) assert.equal(D1.has(t), false, `${t} is counted in both walks`);
});

// ------------------------------------------------------- every column is decided ---

test('every column of every exported Postgres table is sent or withheld with a reason', () => {
  const postgres = SPEC.USER_EXPORT.filter((t) => t.store === 'postgres');
  assert.ok(postgres.length >= 7, `the export covers only ${postgres.length} Postgres tables`);
  for (const spec of postgres) {
    const cols = SCHEMA.get(spec.table);
    assert.ok(cols && cols.length > 0, `${spec.table} is exported but no such table is in the migrations`);
    const issues = SPEC.auditExportSpec(spec.table, cols);
    assert.deepEqual(issues, [], `${spec.table}: ${issues.map((i) => i.why).join('; ')}`);
  }
});

test('every column of the exported D1 table is sent or withheld with a reason', () => {
  for (const spec of SPEC.USER_EXPORT.filter((t) => t.store === 'd1')) {
    const src = readFileSync(join(WORKER, 'src', 'api-keys.ts'), 'utf8');
    const m = new RegExp(`create table if not exists ${spec.table}\\(([^)]*)\\)`, 'i').exec(src);
    assert.ok(m, `${spec.table}: could not read its CREATE TABLE`);
    const cols = m[1].split(',').map((c) => c.trim().split(/\s+/)[0]).filter(Boolean);
    assert.ok(cols.length > 5, `${spec.table}: only ${cols.length} columns parsed`);
    assert.deepEqual(SPEC.auditExportSpec(spec.table, cols), []);
  }
});

test('no exported field anywhere looks like a credential', () => {
  let fields = 0;
  for (const spec of SPEC.USER_EXPORT) {
    for (const f of spec.fields) {
      fields += 1;
      const looksSecret = SPEC.NEVER_EXPORT.some((s) => f === s || f.endsWith(`_${s}`));
      assert.equal(looksSecret, false, `${spec.table}.${f} is exported and matches the never-export list`);
    }
  }
  assert.ok(fields > 40, `only ${fields} exported fields were examined`);
});

test('a table the caller cannot select from is marked unreadable, not treated as empty', () => {
  // The whole point: `studio_pairings` has no select policy, so a query with the user's own token
  // returns `[]`. Rendered as rows, that is "you have no pairings" — an observation made by
  // something that never observed anything. The spec has to know which tables those are.
  assert.ok(SELECTABLE.size >= 8, `only ${SELECTABLE.size} tables were found to have a select policy`);
  let checked = 0;
  for (const spec of SPEC.USER_EXPORT.filter((t) => t.store === 'postgres')) {
    checked += 1;
    const expected = SELECTABLE.has(spec.table) ? 'rls' : 'service_role';
    assert.equal(spec.access, expected, `${spec.table}: the migrations say it is ${expected}-readable and the spec says ${spec.access}`);
  }
  assert.ok(checked >= 10, `only ${checked} Postgres tables were examined`);
  // The positive control: at least one of each, or the rule above is vacuous.
  const modes = new Set(SPEC.USER_EXPORT.map((t) => t.access));
  assert.ok(modes.has('rls') && modes.has('service_role') && modes.has('worker'), `only ${[...modes]} are represented`);
});

test('the share-link token is on the never-export list, because a link is a working credential', () => {
  // `membership_events.via_token` holds the live bearer token from collab-links.ts. Exported, the
  // file a person downloads is an invitation anybody who reads it can redeem.
  assert.ok(SPEC.NEVER_EXPORT.includes('token'), 'a bearer token must never be exportable');
  assert.deepEqual(SPEC.auditExportSpec('membership_events', ['via_token']).filter((i) => i.code === 'secret_exported'), []);
});

// -------------------------------------------------------- nothing is unaccounted ---

test('every Postgres table that holds data about a person is exported or explicitly not', () => {
  const OWNERISH = ['owner_id', 'user_id', 'subject_id', 'recipient_id', 'actor_id', 'created_by', 'invited_by'];
  const exported = new Set(SPEC.USER_EXPORT.map((t) => t.table));
  const declared = new Set(Object.keys(SPEC.NOT_EXPORTED_TABLES ?? {}));
  let personal = 0;
  for (const [table, cols] of SCHEMA) {
    const holdsPeople = table === 'profiles' || cols.some((c) => OWNERISH.includes(c));
    if (!holdsPeople) continue;
    personal += 1;
    assert.ok(
      exported.has(table) || declared.has(table),
      `public.${table} holds data about a person and is neither exported nor listed in NOT_EXPORTED_TABLES`,
    );
  }
  assert.ok(personal >= 10, `only ${personal} personal-data tables were examined`);
});

test('every table the worker creates outside Postgres is exported or named as a store that is not', () => {
  const exported = new Set(SPEC.USER_EXPORT.filter((t) => t.store === 'd1').map((t) => t.table));
  const named = new Map(SPEC.NON_POSTGRES_STORES.map((s) => [s.name, s]));
  let checked = 0;
  for (const [table, where] of D1) {
    checked += 1;
    const entry = named.get(table);
    assert.ok(exported.has(table) || entry, `D1 table ${table} (${where}) is in no inventory`);
    if (entry) assert.equal(entry.store, 'd1', `${table} is a D1 table but the inventory calls it ${entry.store}`);
  }
  for (const [table, where] of DO_TABLES) {
    checked += 1;
    const entry = named.get(table);
    assert.ok(entry, `Durable Object table ${table} (${where}) is in no inventory`);
    assert.equal(entry.store, 'do', `${table} lives in a Durable Object but the inventory calls it ${entry.store}`);
  }
  assert.ok(checked >= 28, `only ${checked} non-Postgres tables were examined`);
});

test('the non-Postgres inventory names real stores, and says what each holds', () => {
  assert.ok(SPEC.NON_POSTGRES_STORES.length >= 30, 'the non-Postgres inventory is too short to be an inventory');
  const kinds = new Set(SPEC.NON_POSTGRES_STORES.map((s) => s.store));
  for (const kind of ['d1', 'do', 'kv', 'vectorize']) {
    assert.ok(kinds.has(kind), `no ${kind} store is named in the inventory`);
  }
  let personal = 0;
  for (const s of SPEC.NON_POSTGRES_STORES) {
    assert.ok(s.holds.length > 10, `${s.name}: "${s.holds}" does not say what it holds`);
    assert.equal(typeof s.personal, 'boolean', `${s.name}: whether it is personal must be decided, not left out`);
    if (s.personal) personal += 1;
    // An entry that claims a table must name one the worker actually creates. An inventory of
    // imaginary tables is the same failure as no inventory.
    if (s.store === 'd1') assert.ok(D1.has(s.name), `${s.name} is listed as a D1 table and nothing creates it`);
    // A Durable Object entry is either one of its SQLite tables or a named key-value area.
    if (s.store === 'do' && /^[a-z_]+$/.test(s.name)) {
      assert.ok(DO_TABLES.has(s.name), `${s.name} is listed as a Durable Object table and nothing creates it`);
    }
  }
  assert.ok(personal >= 20, `only ${personal} stores are marked as holding data about a person`);
});

test('every personal store has a deliberate answer to "where do I get this"', async () => {
  // The export names the stores it does NOT contain. An entry that fell through to a default would
  // print a sentence nobody wrote, next to the one store the person actually wanted.
  const bundled = join(tmpdir(), `apple-inventory-ax-${process.pid}.mjs`);
  execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'), [
    join(WORKER, 'src', 'account-export.ts'), '--bundle', '--format=esm', '--target=es2022', `--outfile=${bundled}`,
  ], { cwd: WORKER, stdio: 'pipe' });
  const { elsewhereFor, storesWithoutAnAnswer } = await import(pathToFileURL(bundled).href);
  rmSync(bundled, { force: true });

  assert.deepEqual(storesWithoutAnAnswer(), [], 'these personal stores are in the inventory with no answer beside them');
  const listed = elsewhereFor();
  assert.ok(listed.length >= 20, `only ${listed.length} personal stores were listed`);
  for (const e of listed) assert.ok(e.where.length > 15, `${e.name}: "${e.where}" is not an answer`);

  const replayStore = SPEC.NON_POSTGRES_STORES.find((s) => s.name === 'billing_authority_replays');
  assert.ok(replayStore, 'the billing authority replay table is retained per-user state and must be inventoried');
  assert.deepEqual(
    { store: replayStore.store, binding: replayStore.binding, personal: replayStore.personal },
    { store: 'do', binding: 'QUOTA_DO', personal: true },
    'the replay cache must stay inside the per-user QuotaDO boundary',
  );
  assert.match(replayStore.holds, /normalized billing mutations/i);
  assert.match(replayStore.holds, /does not store the raw Stripe payload or credentials/i);

  const replayAnswer = listed.find((e) => e.name === 'billing_authority_replays');
  assert.ok(replayAnswer, 'the account export must say where the replay cache fits into data availability');
  assert.match(replayAnswer.where, /not offered as a separate download/i);
  assert.match(replayAnswer.where, /\/api\/billing\/history/);

  const quota = readFileSync(join(WORKER, 'src', 'do', 'quota.ts'), 'utf8');
  const replayStart = quota.indexOf('private storeAuthorityReplay(');
  const replayEnd = quota.indexOf('private async applyLocalBillingMutation(', replayStart);
  assert.ok(replayStart >= 0 && replayEnd > replayStart, 'could not locate the replay persistence boundary');
  const replayPersistence = quota.slice(replayStart, replayEnd);
  assert.match(replayPersistence, /JSON\.stringify\(mutation\)/, 'the cache must persist the normalized mutation');
  assert.doesNotMatch(replayPersistence, /JSON\.stringify\(event\)/, 'the raw provider event must never become replay storage');
  assert.match(replayPersistence, /RETENTION\.quotaLedgerDays/, 'the replay cache must remain bounded by the QuotaDO retention horizon');
});

// ------------------------------------------------------------------ falsification ---

test('FALSIFICATION: the auditor reports a column nobody declared', () => {
  const cols = [...(SCHEMA.get('profiles') ?? []), 'secret_diary'];
  const caught = SPEC.auditExportSpec('profiles', cols).some((i) => i.code === 'undeclared_column' && i.column === 'secret_diary');
  assert.ok(caught, 'an undeclared column was NOT reported — this auditor cannot see a violation');
});

test('FALSIFICATION: the auditor reports an exported field that does not exist', () => {
  const cols = (SCHEMA.get('profiles') ?? []).filter((c) => c !== 'display_name');
  const caught = SPEC.auditExportSpec('profiles', cols).some((i) => i.code === 'phantom_column' && i.column === 'display_name');
  assert.ok(caught, 'an exported column missing from the schema was NOT reported');
});
