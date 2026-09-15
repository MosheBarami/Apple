/**
 * What a migration run is allowed to do, as functions of their inputs.
 *
 * WHAT THIS REPOSITORY HAD. Five SQL files in infra/supabase/migrations and no runner. They were
 * applied by hand, in a dashboard, by whoever was there: WORKLIST w18 is the row where
 * `0004_project_archive.sql` sat unapplied because the session that wrote it had no credentials,
 * and GATES.md records the gap in one sentence — "nothing compares the deployed schema against
 * the migrations". `infra/supabase/tests/rls-isolation.mjs` applies them all to a throwaway
 * Postgres to prove the POLICIES, and says so explicitly: it cannot prove the deployed database
 * matches them.
 *
 * So there are two different claims here and they need different machinery:
 *
 *   1. WHICH migrations have run, and whether the set on disk is still the set that ran.
 *      `planMigrations` answers that against a ledger table, and its interesting output is the
 *      refusals: a file edited after it was applied, a file inserted BEHIND the head, a file the
 *      database has run that this tree no longer contains. Every one of those is a state where
 *      "just run the pending ones" produces a schema nobody has ever described.
 *   2. WHETHER the schema the migrations describe is the schema that is actually there.
 *      `schemaFromSql` reads the first claim out of the SQL and `diffSchema` compares it with a
 *      snapshot taken from the live catalogue — which is the only way a change made in a
 *      dashboard, outside every migration, can be seen from here.
 *
 * Pure, so the broken inputs can come from a test: a ledger claiming a checksum that does not
 * match, a numbering with a hole in it, a snapshot with row level security quietly off.
 */

/* ------------------------------------------------------------- the file set --- */

const NAME = /^(\d{4})_([a-z0-9][a-z0-9_-]*)\.sql$/;

/** `'0004_project_archive.sql'` → `{ index: 4, slug: 'project_archive' }`, or null. */
export function parseMigrationName(name) {
  if (typeof name !== 'string') return null;
  const m = NAME.exec(name);
  if (m === null) return null;
  return { index: Number(m[1]), slug: m[2], name };
}

const isSha = (s) => typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);

/**
 * What still has to run, and every reason the run must not start.
 *
 * `files` is what is on disk — `[{ name, sha256 }]`. `applied` is the ledger table — the same
 * shape, plus whatever the database recorded. Both are supplied; this reads neither.
 */
export function planMigrations(files, applied) {
  const problems = [];
  if (!Array.isArray(files)) return { pending: [], problems: ['the migration directory produced no list of files'] };
  if (!Array.isArray(applied)) return { pending: [], problems: ['the ledger produced no list of applied migrations — a missing ledger is not an empty one'] };

  const parsed = [];
  const byIndex = new Map();
  for (const f of files) {
    const p = parseMigrationName(f?.name);
    if (p === null) {
      // A file the runner cannot order is not skipped. Skipping it is how a migration sits in the
      // directory for weeks looking applied.
      problems.push(`${JSON.stringify(f?.name)} is not a migration name — expected NNNN_slug.sql`);
      continue;
    }
    if (!isSha(f.sha256)) { problems.push(`${p.name} has no usable checksum: ${JSON.stringify(f.sha256)}`); continue; }
    if (byIndex.has(p.index)) {
      problems.push(`${p.name} and ${byIndex.get(p.index).name} share the number ${p.index} — two migrations cannot both be ${String(p.index).padStart(4, '0')}`);
      continue;
    }
    byIndex.set(p.index, { ...p, sha256: f.sha256 });
    parsed.push({ ...p, sha256: f.sha256 });
  }
  parsed.sort((a, b) => a.index - b.index);

  // A HOLE IN THE NUMBERING IS A MISSING FILE, not a style problem. It means a migration was
  // deleted, never committed, or is sitting unstaged in someone's tree — and the schema that
  // results from running what is left has never existed anywhere.
  for (let i = 0; i < parsed.length; i += 1) {
    const expected = i + 1;
    if (parsed[i].index !== expected) {
      problems.push(`the numbering jumps: ${String(expected).padStart(4, '0')} is missing, and ${parsed[i].name} sits where it should be`);
      break;
    }
  }

  const appliedByName = new Map();
  for (const a of applied) {
    if (typeof a?.name !== 'string') { problems.push('the ledger holds a row with no migration name'); continue; }
    if (appliedByName.has(a.name)) { problems.push(`the ledger records ${a.name} as applied twice`); continue; }
    appliedByName.set(a.name, a);
  }

  let highestApplied = 0;
  for (const [name, row] of appliedByName) {
    const onDisk = parsed.find((p) => p.name === name);
    if (onDisk === undefined) {
      // The database has run something this tree does not contain. Every later migration was
      // written against a schema nobody here can reproduce.
      problems.push(`the database has applied ${name}, which is not in this tree — this tree cannot reproduce the schema that is deployed`);
      continue;
    }
    if (!isSha(row.sha256)) {
      problems.push(`the ledger's checksum for ${name} is unreadable: ${JSON.stringify(row.sha256)} — nothing can say whether the file has changed`);
    } else if (row.sha256 !== onDisk.sha256) {
      // THE CLASSIC. A migration edited after it ran: the file describes one schema and the
      // database holds another, and nothing will ever run the difference.
      problems.push(`${name} has been edited since it was applied — the database ran ${row.sha256.slice(0, 12)} and this tree holds ${onDisk.sha256.slice(0, 12)}`);
    }
    const p = parseMigrationName(name);
    if (p !== null && p.index > highestApplied) highestApplied = p.index;
  }

  const pending = parsed.filter((p) => !appliedByName.has(p.name));
  for (const p of pending) {
    if (p.index < highestApplied) {
      // Inserted behind the head. Applying it now runs the set in an order that has never been
      // tested, and the resulting schema depends on WHEN each database happened to be migrated.
      problems.push(`${p.name} is unapplied and numbered below ${String(highestApplied).padStart(4, '0')}, which has already run — a migration inserted behind the head applies out of order`);
    }
  }

  return { pending, problems, applied: appliedByName.size, onDisk: parsed.length, highestApplied };
}

/**
 * Did the run actually run?
 *
 * The same shape as the rollback's verdict, for the same reason: a migration runner that applied
 * nothing and printed success is the F-62 defect wearing different clothes, and `0 === 0` is the
 * cheapest green in the file.
 */
export function judgeApply(plan, results) {
  const problems = [];
  if (plan === null || typeof plan !== 'object' || !Array.isArray(plan.pending)) {
    return { ok: false, problems: ['there is no plan to judge'], applied: 0, planned: 0 };
  }
  for (const p of plan.problems ?? []) problems.push(p);
  if (results === null || typeof results !== 'object') {
    return { ok: false, problems: [...problems, 'the runner reported nothing at all'], applied: 0, planned: plan.pending.length };
  }
  const planned = plan.pending.length;
  const n = results.applied;
  // Type-checked rather than defaulted: `results.applied ?? 0` lets NaN and `'2'` through, and a
  // count that is not a number can satisfy either side of the comparison below.
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 0) {
    problems.push(`the runner did not report how many migrations it applied: ${JSON.stringify(results.applied)}`);
  } else if (planned > 0 && n === 0) {
    problems.push(`0 of ${planned} pending migration(s) were applied — the run changed nothing, which may not read as success`);
  } else if (n !== planned) {
    problems.push(`${n} of ${planned} pending migration(s) were applied — the database is part-way through a set`);
  }
  const failures = Array.isArray(results.failures) ? results.failures : null;
  if (failures === null) problems.push('the runner did not report a list of failures — a missing list is not an empty one');
  else for (const f of failures) problems.push(`${f?.name ?? '(unnamed migration)'} — ${f?.why ?? 'failed for an unstated reason'}`);

  return { ok: problems.length === 0, problems, applied: typeof n === 'number' && Number.isInteger(n) ? n : 0, planned };
}

/* ------------------------------------------------------------- the schema --- */

/** `--` and `/* *\/` removed, so a commented-out CREATE TABLE is not part of the schema. */
export function stripSqlComments(sql) {
  return String(sql).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, '');
}

/** Split on commas at paren depth 0 — `check (plan in ('free','pro'))` is one column, not three. */
function splitTopLevel(body) {
  const out = [];
  let depth = 0;
  let cur = '';
  let quote = null;
  for (const ch of body) {
    if (quote !== null) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '') out.push(cur);
  return out;
}

const TABLE_CONSTRAINT = /^(primary|foreign|unique|check|constraint|exclude|like)\b/i;

/**
 * The schema a set of migration files DESCRIBES: tables, their columns, and which of them turn on
 * row level security.
 *
 * DELIBERATELY NARROW. This reads the statement forms these migrations actually use — `create
 * table [if not exists] public.x (...)`, `alter table public.x add column [if not exists] c t`,
 * `alter table public.x enable row level security`, `create policy "n" on public.x`, and the drop
 * forms — and it reports what it could not read rather than absorbing it silently, because a
 * parser that quietly ignores a statement produces an "expected schema" that is missing exactly
 * the thing nobody thought about.
 */
export function schemaFromSql(sources) {
  const tables = new Map();
  const policies = [];
  const unreadable = [];
  const list = Array.isArray(sources) ? sources : [sources];

  for (const src of list) {
    const name = typeof src === 'object' && src !== null ? src.name : '(sql)';
    const sql = stripSqlComments(typeof src === 'object' && src !== null ? src.sql : src);

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s*\(/gi)) {
      const table = m[1];
      // Walk to the matching close paren so a nested `check (...)` cannot end the definition early.
      let depth = 0;
      let end = -1;
      for (let i = m.index + m[0].length - 1; i < sql.length; i += 1) {
        if (sql[i] === '(') depth += 1;
        else if (sql[i] === ')') { depth -= 1; if (depth === 0) { end = i; break; } }
      }
      if (end === -1) { unreadable.push(`${name}: create table ${table} has no closing paren`); continue; }
      const columns = splitTopLevel(sql.slice(m.index + m[0].length, end))
        .map((c) => c.trim())
        .filter((c) => c !== '' && !TABLE_CONSTRAINT.test(c))
        .map((c) => (/^"([^"]+)"/.exec(c) ?? /^([a-z0-9_]+)/i.exec(c) ?? [])[1])
        .filter((c) => typeof c === 'string');
      tables.set(table, { name: table, columns, rls: tables.get(table)?.rls === true });
    }

    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/gi)) {
      const t = tables.get(m[1]);
      if (t === undefined) { unreadable.push(`${name}: add column on ${m[1]}, which no migration creates`); continue; }
      if (!t.columns.includes(m[2])) t.columns.push(m[2]);
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+drop\s+column\s+(?:if\s+exists\s+)?"?([a-z0-9_]+)"?/gi)) {
      const t = tables.get(m[1]);
      if (t !== undefined) t.columns = t.columns.filter((c) => c !== m[2]);
    }
    for (const m of sql.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)) {
      const t = tables.get(m[1]);
      if (t === undefined) { unreadable.push(`${name}: row level security enabled on ${m[1]}, which no migration creates`); continue; }
      t.rls = true;
    }
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi)) tables.delete(m[1]);
    for (const m of sql.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:public\.)?([a-z0-9_]+)/gi)) {
      policies.push({ name: m[1], table: m[2] });
    }
  }

  return { tables: [...tables.values()].sort((a, b) => a.name.localeCompare(b.name)), policies, unreadable };
}

/**
 * The schema the migrations describe against the schema that is actually deployed.
 *
 * `actual` is a snapshot in the same shape, taken from the live catalogue by
 * `infra/supabase/migrate.mjs --verify`.
 *
 * ROW LEVEL SECURITY IS THE ONE THAT MATTERS MOST, so it is reported first and separately. A
 * table whose RLS is off in production while every migration says it is on is not drift, it is
 * every tenant's data readable by every other — and it is invisible to everything in this
 * repository today, because the only RLS proof runs against a throwaway database built from the
 * files rather than against the deployed one.
 */
export function diffSchema(expected, actual) {
  const problems = [];
  const exp = Array.isArray(expected?.tables) ? expected.tables : null;
  const act = Array.isArray(actual?.tables) ? actual.tables : null;
  if (exp === null) return ['the migrations produced no table list — there is nothing to compare'];
  if (act === null) return ['the database produced no table list — a snapshot that is absent is not a snapshot that is empty'];
  if (exp.length === 0) return ['the migrations describe no tables at all — this is a parse that failed, not a schema'];

  const actualByName = new Map(act.map((t) => [t.name, t]));
  for (const want of exp) {
    const got = actualByName.get(want.name);
    if (got === undefined) { problems.push(`${want.name} is created by a migration and does not exist in the database`); continue; }
    if (want.rls === true && got.rls !== true) {
      problems.push(`SECURITY: ${want.name} has row level security in the migrations and NOT in the database — every policy on it is inert`);
    }
    const cols = Array.isArray(got.columns) ? got.columns : [];
    for (const c of want.columns) {
      if (!cols.includes(c)) problems.push(`${want.name}.${c} is in the migrations and not in the database`);
    }
  }
  const expectedNames = new Set(exp.map((t) => t.name));
  for (const got of act) {
    if (!expectedNames.has(got.name)) {
      // Not a migration's doing. Something created this outside the files, which means the schema
      // has a part nobody can rebuild.
      problems.push(`${got.name} exists in the database and no migration creates it — it was made outside this tree`);
    }
  }
  return problems;
}
