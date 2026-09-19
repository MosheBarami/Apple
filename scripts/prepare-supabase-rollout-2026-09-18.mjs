// Prepare the reviewed migration bytes for the owner's existing SQL Editor session. No network.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEDGER_DDL, LEDGER_TABLE } from './lib/migration-runner.mjs';
import { planMigrations } from './lib/migration-rules.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, 'infra/supabase/migrations');
const destination = join(root, 'docs/evidence/supabase-rollout-2026-09-18');
const digest = value => createHash('sha256').update(value).digest('hex');
const quote = value => `'${value.replaceAll("'", "''")}'`;
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort().map(name => {
  const sql = readFileSync(join(directory, name), 'utf8');
  return { name, sql, sha256: digest(sql) };
});
if (files.length !== 10 || !files[7].name.startsWith('0008_')) throw new Error('Migration set changed; review before preparation');
const expected = {
  '0009_membership_access_outbox.sql': 'cf7d6e8e199e642fef47a9f394ab166f7b6e108f297860674e69db91daf4a6aa',
  '0010_schema_hardening.sql': 'cf033d4df2b0c4b5d70f1fda6faa8a2d20060f35f7aa594cc13c62ed30cedb43',
};
for (const [name, hash] of Object.entries(expected)) {
  if (files.find(file => file.name === name)?.sha256 !== hash) throw new Error(`${name} changed after review`);
}
const baseline = files.slice(0, 8);
const planned = planMigrations(files, baseline.map(file => ({ name: file.name, sha256: file.sha256 })));
if (planned.problems.length || planned.pending.length !== 2) throw new Error(`Invalid rollout: ${JSON.stringify(planned.problems)}`);

mkdirSync(destination, { recursive: true });
const manifest = {
  projectRef: 'npqvyijsvzkuwddyhtpm', generatedAt: new Date().toISOString(),
  prerequisite: 'Confirm live baseline columns/indexes/functions and the recorded sparks/credits drift before adoption.',
  migrations: files.map(({ name, sha256 }) => ({ name, sha256 })),
  batches: [],
};
function batch(name, purpose, sql) {
  const marker = `APPLE_SQL_${name.replaceAll(/[^A-Za-z0-9]/g, '_')}`;
  const body = `-- ${marker}_BEGIN\n${sql.trim()}\n-- ${marker}_END\n`;
  writeFileSync(join(destination, name), body, { flag: 'wx' });
  manifest.batches.push({ name, purpose, marker, bytes: Buffer.byteLength(body), sha256: digest(body) });
}

batch('00-secure-ledger.sql', 'Create or repair only the private operational migration ledger', LEDGER_DDL + `
select c.relrowsecurity as ledger_rls,
  not has_table_privilege('anon', '${LEDGER_TABLE}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as anon_denied,
  not has_table_privilege('authenticated', '${LEDGER_TABLE}', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') as authenticated_denied
from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='schema_migrations';`);

batch('01-adopt-existing-baseline.sql', 'Record the inspected 0001–0008 baseline; does not replay their DDL', `
begin;
do $adoption_guard$ begin
  if exists (select 1 from ${LEDGER_TABLE}) then
    raise exception 'Expected empty newly-adopted ledger; inspect current state instead of overwriting it';
  end if;
end $adoption_guard$;
insert into ${LEDGER_TABLE}(name,sha256,applied_by) values
${baseline.map(file => `(${quote(file.name)},${quote(file.sha256)},'adopted inspected baseline; legacy accounting repaired by 0010')`).join(',\n')};
commit;
select name,sha256 from ${LEDGER_TABLE} order by name;`);

for (const file of files.slice(8)) {
  batch(`${file.name.slice(0, 4)}-apply.sql`, `Apply exact reviewed ${file.name} and record its checksum atomically`, `
begin;
do $migration_guard$ begin
  if exists (select 1 from ${LEDGER_TABLE} where name=${quote(file.name)}) then
    raise exception 'Migration already recorded; inspect rather than replay';
  end if;
end $migration_guard$;
${file.sql}
insert into ${LEDGER_TABLE}(name,sha256,applied_by) values (${quote(file.name)},${quote(file.sha256)},'reviewed Apple rollout 2026-09-18');
commit;
select name,sha256 from ${LEDGER_TABLE} where name=${quote(file.name)};`);
}

writeFileSync(join(destination, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ projectRef: manifest.projectRef, destination, batches: manifest.batches }, null, 2));
