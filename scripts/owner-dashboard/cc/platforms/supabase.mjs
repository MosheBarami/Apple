// Supabase through the Management API. SQL goes to the query endpoint with read_only:true (the
// database itself refuses any write in that transaction), and only catalog figures are selected — no
// user row's columns reach the browser. The only action is a logical backup to local disk.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, run, fetchJson, cached, ok, fail, section, UpstreamError } from '../http.mjs';

export const REF = 'npqvyijsvzkuwddyhtpm';
const API = 'https://api.supabase.com/v1';
const LABEL = 'Supabase';
const ROW_CAP = 50000;

const auth = () => ({ authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` });
const get = (p, what) => fetchJson(`${API}/projects/${REF}${p}`, { label: LABEL, what, headers: auth() });
const sql = (query, what) => fetchJson(`${API}/projects/${REF}/database/query`,
  { label: LABEL, what, method: 'POST', headers: auth(), body: { query, read_only: true } });

const Q = {
  size: 'select pg_database_size(current_database())::bigint as bytes',
  tables: `select schemaname as schema, relname as name, n_live_tup::bigint as rows,
    pg_total_relation_size(relid)::bigint as "sizeBytes" from pg_stat_user_tables
    where schemaname = 'public' order by pg_total_relation_size(relid) desc limit 25`,
  buckets: `select b.name, b.public, count(o.id)::bigint as objects,
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as "sizeBytes"
    from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.id, b.name, b.public order by b.name`,
  authUsers: 'select count(*)::bigint as n from auth.users',
};

const count = (lints, level) => (lints || []).filter((l) => l.level === level).length;
const advisor = (v) => v && { warn: count(v.lints, 'WARN'), info: count(v.lints, 'INFO'), error: count(v.lints, 'ERROR') };

export function supabase() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) return Promise.resolve(fail('חסר SUPABASE_ACCESS_TOKEN בקובץ ‎.env'));
  return cached('supabase', async () => {
    const [project, size, tables, buckets, users, sec, perf, backups] = await Promise.all([
      section(() => get('', 'פרטי הפרויקט')),
      section(() => sql(Q.size, 'גודל מסד הנתונים')),
      section(() => sql(Q.tables, 'רשימת הטבלאות')),
      section(() => sql(Q.buckets, 'Storage')),
      section(() => sql(Q.authUsers, 'ספירת משתמשים')),
      section(() => get('/advisors/security', 'יועץ האבטחה')),
      section(() => get('/advisors/performance', 'יועץ הביצועים')),
      section(() => get('/database/backups', 'גיבויים')),
    ]);
    const all = { project, size, tables, buckets, users, sec, perf, backups };
    const errors = Object.fromEntries(Object.entries(all).filter(([, s]) => s.error).map(([k, s]) => [k, s.error]));
    if (Object.keys(errors).length === Object.keys(all).length) return fail(project.error, { errors });
    const p = project.value;
    return ok({
      project: p ? { name: p.name, ref: p.ref, region: p.region, status: p.status, dbVersion: p.database?.version ?? null,
        createdAt: p.created_at, dashboardUrl: `https://supabase.com/dashboard/project/${REF}` } : null,
      dbSizeBytes: size.value?.[0] ? Number(size.value[0].bytes) : null,
      tables: (tables.value || []).map((t) => ({ schema: t.schema, name: t.name, rows: Number(t.rows), sizeBytes: Number(t.sizeBytes) })),
      storage: { buckets: (buckets.value || []).map((b) => ({ name: b.name, public: b.public, objects: Number(b.objects), sizeBytes: Number(b.sizeBytes) })) },
      advisors: { security: advisor(sec.value), performance: advisor(perf.value) },
      backups: backups.value ? { pitr: Boolean(backups.value.pitr_enabled),
        list: (backups.value.backups || []).map((b) => ({ at: b.inserted_at, status: b.status })) } : null,
      authUsers: users.value?.[0] ? Number(users.value[0].n) : null,
      errors,
    });
  });
}

// The backup directory must never reach git: ignored already, or `.backups/` is appended once.
async function ensureIgnored() {
  try { await run('git', ['-C', REPO, 'check-ignore', '-q', '.backups/probe']); return; } catch { /* exit 1 = not ignored */ }
  const gi = path.join(REPO, '.gitignore');
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  fs.appendFileSync(gi, `${cur && !cur.endsWith('\n') ? '\n' : ''}.backups/\n`);
}

// A LOGICAL backup: each public table's rows (at most 50k) as JSON under .backups/supabase-<ISO>/.
// Every query is read-only; nothing is reset, deleted or truncated.
export async function supabaseAction({ kind, dryRun }) {
  if (kind === 'reset' || kind === 'reset-test-data') return fail('מחיקת נתונים בפרודקשן חסומה בכוונה — אפשר לבקש ממני בצ׳אט');
  if (kind !== 'backup') return fail('פעולה לא מוכרת');
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url: `${API}/projects/${REF}/database/query`,
    body: { query: `select * from public.<table> limit ${ROW_CAP}`, read_only: true }, writes: '.backups/supabase-<time>/<table>.json' } });
  if (!process.env.SUPABASE_ACCESS_TOKEN) return fail('חסר SUPABASE_ACCESS_TOKEN בקובץ ‎.env');
  try {
    const list = await sql(`select table_name as name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`, 'רשימת הטבלאות');
    await ensureIgnored();
    const dir = path.join(REPO, '.backups', `supabase-${new Date().toISOString().replace(/[:.]/g, '-')}`);
    fs.mkdirSync(dir, { recursive: true });
    const tables = []; let rows = 0;
    for (const { name } of list) {
      const ident = `"${String(name).replace(/"/g, '""')}"`;
      const data = await sql(`select * from public.${ident} limit ${ROW_CAP}`, `ייצוא הטבלה ${name}`);
      fs.writeFileSync(path.join(dir, `${String(name).replace(/[^\w.-]/g, '_')}.json`), JSON.stringify(data));
      tables.push({ name, rows: data.length, capped: data.length >= ROW_CAP });
      rows += data.length;
    }
    return ok({ dir, tables, rows });
  } catch (e) {
    if (e instanceof UpstreamError) return fail(e.reason);
    return fail('הגיבוי נכשל בכתיבה לדיסק');
  }
}
