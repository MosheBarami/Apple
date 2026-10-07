// Master plan §4.4 step 8 (index, D1 part): library items (JSONL) to SQL upserts for `library_items` (schema.sql).
// The upsert never touches the grade; a graded item gets its own UPDATE, so only items two critics graded A or B
// reach the build model (L5).
//
//   node packages/library/src/to-sql.mjs planning/library/items/kenney-3d.jsonl > /tmp/kenney.sql
//   wrangler d1 execute studpilot-corpus --remote --file /tmp/kenney.sql
import { readFileSync } from 'node:fs';

const q = (v) => (v === undefined || v === null ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const json = (v) => (v === undefined || v === null ? 'NULL' : q(JSON.stringify(v)));

const COLUMNS = ['id', 'title', 'kind', 'family', 'themes', 'source_url', 'author', 'licence_words', 'licence_class', 'licence_url', 'attribution', 'fetched_at', 'file_sha256', 'roblox_asset_id', 'uploader', 'ai_check', 'sanitize', 'triangles', 'grade', 'package_name', 'deps', 'standalone', 'bundle_key', 'load_test', 'body', 'maturity', 'updated_at'];

/** One INSERT ... ON CONFLICT DO UPDATE statement for an item. Pure. */
export function itemSql(it, now) {
  const values = [
    q(it.id), q(it.title), q(it.kind), q(it.family), json(it.tags ?? []), q(it.source_url), q(it.author), q(it.licence_words),
    q(it.licence_class), q(it.licence_url), q(it.attribution), q(it.fetched_at), q(it.file_sha256), q(it.roblox_asset_id),
    q(it.uploader), json(it.ai_check), json(it.scan ? { scan: it.scan, audit: it.audit, audit_notes: it.audit_notes } : undefined), q(it.checks?.triangles), q(it.grade), q(it.package_name), json(it.deps), q(it.standalone === undefined ? undefined : it.standalone ? 1 : 0), q(it.bundle_key), json(it.load_test), q(it.text), q(it.maturity), q(now),
  ];
  const update = COLUMNS.filter((c) => c !== 'id' && c !== 'grade').map((c) => `${c} = excluded.${c}`).join(', ');
  return `INSERT INTO library_items (${COLUMNS.join(', ')}) VALUES (${values.join(', ')}) ON CONFLICT(id) DO UPDATE SET ${update};`;
}

/** The grade of a graded item (L5), written by itself so a re-ingest and a re-grade never overwrite each other. Pure. */
export function gradeSql(it, now) {
  return `UPDATE library_items SET grade = ${q(it.grade)}, grade_notes = ${json(it.grade_notes)}, updated_at = ${q(now)} WHERE id = ${q(it.id)};`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error('usage: to-sql.mjs <items.jsonl> [...]'); process.exit(2); }
  const now = new Date().toISOString();
  process.stdout.write(readFileSync(new URL('../schema.sql', import.meta.url), 'utf8') + '\n');
  for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const it = JSON.parse(line);
    process.stdout.write(itemSql(it, now) + '\n');
    if (it.grade) process.stdout.write(gradeSql(it, now) + '\n');
  }
}
