#!/usr/bin/env node
// Every column the client asks Postgres for exists in the migrations.
//
// THE OUTAGE THIS COMES FROM. The owner signed in and the dashboard said:
//
//     Could not reach Apple — column projects.archived_at does not exist
//
// Three migrations — archive, collaboration, membership lifecycle — were written, committed,
// reviewed and shipped, and NONE of them had ever been applied to the live database. The
// TypeScript compiled, 1,306 web tests passed, both front ends built, and every one of those
// checks was a statement about the code rather than about the database it talks to. `projects`
// had eleven columns and the code asked for a twelfth; `project_members` and `membership_events`
// did not exist at all.
//
// A migration file is not a migration. Committing one proves only that somebody wrote it down.
//
// WHAT THIS CHECKS, and what it deliberately does not. It is OFFLINE: it reads the SQL in
// infra/supabase/migrations and the column names the client code asks for, and fails when the
// second names something the first never creates. It cannot tell you whether a migration has been
// APPLIED — that needs the live database — so it catches the half of this failure that is
// reachable from a commit, and says plainly that it is only half.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATIONS = join(ROOT, 'infra', 'supabase', 'migrations');

/* ------------------------------------------------------- what the migrations create --- */

const sql = readdirSync(MIGRATIONS)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIGRATIONS, f), 'utf8'))
  .join('\n')
  // Comments first: every one of these files explains its columns in prose that names them, and a
  // checker reading its own documentation as schema is the defect this repository keeps finding.
  .replace(/--.*$/gm, ' ');

/** table -> Set(column). Built from `create table` bodies and every `add column`. */
const schema = new Map();
const add = (table, col) => {
  const t = table.replace(/^public\./, '');
  if (!schema.has(t)) schema.set(t, new Set());
  schema.get(t).add(col);
};

for (const m of sql.matchAll(/create table (?:if not exists )?([\w.]+)\s*\(([\s\S]*?)\n\s*\);/g)) {
  const [, table, body] = m;
  let depth = 0;
  for (const line of body.split('\n')) {
    const text = line.trim();
    // Only top-level lines declare a column; a line inside a nested paren is part of a check or a
    // reference, and `char_length(suspended_reason) <= 500` would otherwise invent a column.
    if (depth === 0) {
      const col = /^([a-z_][a-z0-9_]*)\s+(uuid|text|timestamptz|integer|bigint|boolean|jsonb|json|numeric|date|real|double)/i.exec(text);
      if (col && !/^(primary|foreign|unique|check|constraint)$/i.test(col[1])) add(table, col[1]);
    }
    depth += (line.match(/\(/g) ?? []).length - (line.match(/\)/g) ?? []).length;
  }
}
for (const m of sql.matchAll(/alter table ([\w.]+)([\s\S]*?);/g)) {
  const [, table, body] = m;
  for (const c of body.matchAll(/add column (?:if not exists )?([a-z_][a-z0-9_]*)/gi)) add(table, c[1]);
}

/* ----------------------------------------------------- what the client code asks for --- */

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist') continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(p);
  }
  return out;
}

//[[ COLUMN LISTS HELD IN A CONST ARE RESOLVED, and the falsification is why.
//
//   The first version only matched a string literal inside `.select(`. Adding a fabricated column
//   to the list and re-running left the check GREEN — because the file that caused the outage does
//   not inline its list: `apps/web/src/lib/archive.ts` exports PROJECT_COLUMNS and two routes pass
//   the identifier. The one place that mattered was the one place it could not see.
//
//   So a `const NAME = '…'` holding something that looks like a column list is collected first and
//   `.select(NAME)` resolves through it. Only simple string constants — anything built at runtime
//   is out of reach from here, and pretending otherwise would be the same blind spot in a new form.
const consts = new Map();
const files = walk(join(ROOT, 'apps', 'web', 'src'));
for (const file of files) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:export\s+)?const\s+([A-Z][A-Z0-9_]*)\s*(?::[^=]+)?=\s*(['"`])([^'"`]+)\2/g)) {
    if (/^[a-z_][a-z0-9_]*(\s*,\s*[a-z_][a-z0-9_]*)+$/.test(m[3].trim())) consts.set(m[1], m[3]);
  }
}

const asks = [];
for (const file of files) {
  const src = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
  // `.from('t')` opens a chain; everything up to the next `.from(` or the end of the statement
  // belongs to it. Crude on purpose — a parser here would be a second Supabase client.
  const froms = [...src.matchAll(/\.from\(\s*'([a-z_]+)'\s*\)/g)];
  for (const [i, f] of froms.entries()) {
    const table = f[1];
    const chain = src.slice(f.index, froms[i + 1]?.index ?? Math.min(src.length, f.index + 900));
    for (const m of chain.matchAll(/\.(?:eq|neq|is|gt|gte|lt|lte|like|ilike|in|order|not)\(\s*'([a-z_][a-z0-9_]*)'/g)) {
      asks.push({ file, table, column: m[1] });
    }
    const lists = [
      ...[...chain.matchAll(/\.select\(\s*(['"`])([^'"`]*)\1/g)].map((m) => m[2]),
      ...[...chain.matchAll(/\.select\(\s*([A-Z][A-Z0-9_]*)\s*[),]/g)].map((m) => consts.get(m[1])).filter(Boolean),
    ];
    for (const list of lists) {
      for (const raw of list.split(',')) {
        const col = raw.trim().split(/[:(\s]/)[0];
        if (/^[a-z_][a-z0-9_]*$/.test(col) && col !== 'count') asks.push({ file, table, column: col });
      }
    }
  }
}

/* --------------------------------------------------------------------------- verdict --- */

// A WALK THAT FOUND NOTHING IS A BROKEN CHECK. Zero tables parsed out of the migrations, or zero
// column references found in the client, both produce a clean run that has verified nothing.
if (schema.size === 0) {
  console.error(`SCHEMA CHECK IS BLIND — parsed no tables out of ${MIGRATIONS.replace(ROOT + '/', '')}.`);
  process.exit(2);
}
if (asks.length === 0) {
  console.error('SCHEMA CHECK IS BLIND — found no column references in apps/web/src. Either the client\n'
    + 'stopped using supabase-js directly, or the matcher below stopped matching it.');
  process.exit(2);
}

const missing = [];
for (const a of asks) {
  const cols = schema.get(a.table);
  // A table the migrations never create is a separate and louder problem than a missing column.
  if (!cols) { missing.push({ ...a, why: `no migration creates table "${a.table}"` }); continue; }
  if (!cols.has(a.column)) missing.push({ ...a, why: `"${a.table}" has no column "${a.column}"` });
}

const tables = [...schema.keys()].sort();
if (!missing.length) {
  console.log(`SCHEMA OK — ${asks.length} column reference(s) across ${new Set(asks.map((a) => a.table)).size} table(s) `
    + `all exist in the migrations (${tables.length} tables defined).`);
  console.log('NOTE: this proves the migration was WRITTEN, not that it was APPLIED. The live column\n'
    + 'list is only knowable from the live database.');
  process.exit(0);
}

console.error(`SCHEMA DRIFT — ${missing.length} reference(s) to something the migrations never create:\n`);
const seen = new Set();
for (const m of missing) {
  const key = `${m.table}.${m.column}`;
  if (seen.has(key)) continue;
  seen.add(key);
  console.error(`    ${m.why}\n      asked for in ${relative(ROOT, m.file)}`);
}
console.error(`\nTables the migrations define: ${tables.join(', ')}`);
console.error('\nWrite the migration, or stop asking for the column. And remember that writing it is');
console.error('only half: three migrations sat committed and unapplied while the dashboard told the');
console.error('owner "column projects.archived_at does not exist".');
process.exit(1);
