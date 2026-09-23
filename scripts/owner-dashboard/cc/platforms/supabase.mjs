// Supabase through the Management API (https://api.supabase.com/v1), for the Studio-shaped page.
// GET /api/cc/supabase: project, org plan, service health, one read-only catalog query (tables, auth
// figures, buckets, connections), advisors, edge functions, migrations, backups, API usage, 24 h of
// edge traffic, and the Hebrew insights derived from them. Each part fails on its own with a Hebrew
// reason. POST /api/cc/supabase/action: `sql` (the read-only console), `preview` (a table's first
// rows), `logs` (a fixed set of log queries) and `backup` (a logical backup to local disk). Every SQL
// statement is sent with read_only:true, so the database itself refuses a write; the guard below
// refuses it before it leaves the machine. Nothing here changes RLS, auth, security settings or data.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, run, fetchJson, cached, ok, fail, section, redact, UpstreamError } from '../http.mjs';

export const REF = 'npqvyijsvzkuwddyhtpm';
const API = 'https://api.supabase.com/v1';
const LABEL = 'Supabase';
const ROW_CAP = 50000; // backup: rows per table
const SQL_CAP = 200; // console: rows per answer
const PREVIEW_CAP = 50;
const TIMEOUT_SQL = "set statement_timeout = '8s';";
const NO_TOKEN = 'חסר SUPABASE_ACCESS_TOKEN בקובץ ‎.env';
const QUERY_URL = `${API}/projects/${REF}/database/query`;

const auth = () => ({ authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` });
const get = (p, what) => fetchJson(`${API}/projects/${REF}${p}`, { label: LABEL, what, headers: auth() });
const sql = (query, what) => fetchJson(QUERY_URL, { label: LABEL, what, method: 'POST', headers: auth(), body: { query, read_only: true } });
const odd = (what) => new UpstreamError('shape', `${LABEL} החזיר תשובה לא צפויה ל${what}`);
const need = (v, test, what) => { if (!test(v)) throw odd(what); return v; };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const n = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const s = (v) => (v == null ? null : redact(String(v)));
const iso = (us) => (n(us) == null ? null : new Date(Number(us) / 1000).toISOString()); // the logs API speaks microseconds

// Logs: GET /analytics/endpoints/logs.all over the last 24 h. It can answer 200 with {error}, which is a failure.
async function logs(query, what) {
  const end = new Date(); const start = new Date(end.getTime() - 864e5);
  const u = new URL(`${API}/projects/${REF}/analytics/endpoints/logs.all`);
  u.searchParams.set('iso_timestamp_start', start.toISOString()); u.searchParams.set('iso_timestamp_end', end.toISOString()); u.searchParams.set('sql', query);
  const v = await fetchJson(u.toString(), { label: LABEL, what, headers: auth() });
  if (!isObj(v) || v.error || !Array.isArray(v.result)) throw new UpstreamError('logs', `שאילתת הלוגים של ${LABEL} נכשלה (${what}) — ננסה שוב בסיבוב הבא`);
  return v.result;
}

// ---------------------------------------------------------------- masking
const SECRET_KEY = /(secret|passw|token|api_?key|apikey|private_?key|credential|authorization|cookie|signature|encrypted|decrypted)/i;
const SECRET_VAL = [/eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}/g, /\bsb_secret_[\w-]+/g, /\bsbp_[\w]{16,}/g, /\bsk_(?:live|test)_[\w]+/g];
const HIDDEN = '[מוסתר]';
function mask(v, key = '') {
  if (key && SECRET_KEY.test(key)) return HIDDEN;
  if (typeof v === 'string') { let t = redact(v); for (const re of SECRET_VAL) t = t.replace(re, HIDDEN); return t; }
  if (Array.isArray(v)) return v.map((x) => mask(x));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, mask(x, k)]));
  return v;
}
const stripQuery = (p) => (p == null ? null : mask(String(p).split('?')[0]));

// ---------------------------------------------------------------- the read-only SQL guard
// Tokenises the statement: comments go, string literals are blanked, quoted identifiers are unquoted
// and lowercased, so a keyword cannot hide in a comment, a string, a quote or a case change. What is
// left must be ONE select / with…select / explain (no analyze) that touches no admin function and no
// secret source. The query sent upstream keeps its strings and loses its comments.
const WRITE = ['insert', 'update', 'delete', 'merge', 'upsert', 'drop', 'alter', 'create', 'truncate', 'grant', 'revoke', 'copy', 'call', 'do', 'set', 'reset',
  'lock', 'vacuum', 'analyze', 'analyse', 'cluster', 'refresh', 'comment', 'security', 'listen', 'notify', 'unlisten', 'prepare', 'execute', 'deallocate',
  'discard', 'begin', 'commit', 'rollback', 'savepoint', 'release', 'import', 'into', 'share', 'reindex', 'load', 'checkpoint'];
const WRITE_RE = new RegExp(`\\b(${WRITE.join('|')})\\b`);
const PG_FN_OK = new Set(['size_pretty', 'database_size', 'total_relation_size', 'relation_size', 'table_size', 'indexes_size', 'column_size', 'typeof',
  'get_indexdef', 'get_constraintdef', 'get_viewdef', 'get_expr', 'get_userbyid', 'get_keywords', 'postmaster_start_time', 'is_in_recovery', 'size_bytes']);
const BAD_FN = /\b(lo_\w+|dblink\w*|set_config|current_setting|\w+_to_xml\w*|ts_stat|http\w*|nextval|setval|txid_\w+|pg_notify|brin_\w+|gin_clean_pending_list|pgp_\w+|crypt|gen_salt|\w*decrypt\w*)\s*\(/;
const BAD_SCHEMA_FN = /\b(net|cron|supabase_functions|graphql|graphql_public|realtime|extensions|storage|auth|vault|pgsodium)\.(\w+)\s*\(/g;
const BAD_SOURCE = /\b(vault|supabase_vault|pgsodium\w*|pg_authid|pg_shadow|pg_user_mappings?|pg_settings|pg_file_settings|pg_hba_file_rules|pg_ident_file_mappings|pg_db_role_setting|pg_stat_activity|pg_stat_statements\w*|pg_largeobject\w*|pg_stat_ssl)\b/;
const SECRET_WORD = /\b\w*(secret|passw|token|api_?key|apikey|private_?key|credential|decrypted|encrypted|raw_app_meta_data|raw_user_meta_data|identity_data)\w*\b/;
const AUTH_OK = new Set(['users', 'identities']);
const AUTH_FN_OK = new Set(['uid', 'role', 'email', 'jwt']);
const NOT_ALIAS = new Set(['where', 'join', 'left', 'right', 'inner', 'full', 'cross', 'on', 'group', 'order', 'limit', 'union', 'natural', 'using', 'lateral',
  'offset', 'having', 'window', 'fetch', 'except', 'intersect', 'and', 'or', 'tablesample', 'for', 'returning']);
const no = (reason) => ({ ok: false, reason });

function tokenize(q) {
  let scan = ''; let keep = ''; let i = 0;
  while (i < q.length) {
    const c = q[i]; const c2 = q.slice(i, i + 2);
    if (c2 === '--') { const e = q.indexOf('\n', i); i = e < 0 ? q.length : e; scan += ' '; keep += ' '; continue; }
    if (c2 === '/*') {
      let depth = 0; let j = i;
      while (j < q.length) { if (q.startsWith('/*', j)) { depth++; j += 2; } else if (q.startsWith('*/', j)) { depth--; j += 2; if (!depth) break; } else j++; }
      if (depth) return { error: 'הערה שנפתחה ב-/* ולא נסגרה' };
      i = j; scan += ' '; keep += ' '; continue;
    }
    if (/[uU]/.test(c) && q[i + 1] === '&' && /['"]/.test(q[i + 2] || '')) return { error: 'כתיב U& (תווים מקודדים) לא נתמך בקונסולה' };
    if (c === "'") {
      const escapes = /[eE]/.test(q[i - 1] || '') && !/\w/.test(q[i - 2] || '');
      let j = i + 1;
      for (;;) {
        if (j >= q.length) return { error: 'מחרוזת שנפתחה במירכאה ולא נסגרה' };
        if (escapes && q[j] === '\\') { j += 2; continue; }
        if (q[j] === "'") { if (q[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      scan += "''"; keep += q.slice(i, j + 1); i = j + 1; continue;
    }
    const dq = c === '$' ? /^\$([A-Za-z_]\w*)?\$/.exec(q.slice(i)) : null;
    if (dq && !/\w/.test(q[i - 1] || '')) {
      const tag = dq[0]; const e = q.indexOf(tag, i + tag.length);
      if (e < 0) return { error: `מחרוזת שנפתחה ב-${tag} ולא נסגרה` };
      scan += "''"; keep += q.slice(i, e + tag.length); i = e + tag.length; continue;
    }
    if (c === '"') {
      let j = i + 1; let id = '';
      for (;;) {
        if (j >= q.length) return { error: 'שם במירכאות כפולות שלא נסגר' };
        if (q[j] === '"') { if (q[j + 1] === '"') { id += '"'; j += 2; continue; } break; }
        id += q[j]; j++;
      }
      scan += id.toLowerCase(); keep += q.slice(i, j + 1); i = j + 1; continue;
    }
    scan += c.toLowerCase(); keep += c; i++;
  }
  return { scan, keep };
}

/** @returns {{ok:true, query:string, explain:boolean} | {ok:false, reason:string}} */
export function guardSql(input) {
  const q = typeof input === 'string' ? input : '';
  if (!q.trim()) return no('השאילתה ריקה');
  if (q.length > 20000) return no('השאילתה ארוכה מדי (עד 20,000 תווים)');
  if (q.includes('\0')) return no('השאילתה מכילה תו אסור');
  const t = tokenize(q);
  if (t.error) return no(t.error);
  let scan = t.scan.replace(/\s*\.\s*/g, '.').replace(/\s+/g, ' ').trim();
  const keep = t.keep.replace(/[\s;]+$/, '').trim();
  scan = scan.replace(/[\s;]+$/, '').trim();
  if (!scan) return no('השאילתה ריקה');
  if (scan.includes(';')) return no('רק פקודה אחת בכל הרצה (נמצא ; באמצע)');
  const first = /^\w+/.exec(scan)?.[0];
  if (!['select', 'with', 'explain'].includes(first)) return no(`הקונסולה מריצה רק SELECT, WITH…SELECT או EXPLAIN (התחלה: ${first || '?'})`);
  if (first === 'explain' && !/^explain(\s*\([^)]*\))?\s*(select|with)\b/.test(scan)) return no('EXPLAIN רק על SELECT');
  const w = WRITE_RE.exec(scan); if (w) return no(`המילה ${w[1].toUpperCase()} לא מותרת כאן — הקונסולה לקריאה בלבד`);
  for (const m of scan.matchAll(/\bpg_(\w+)\s*\(/g)) if (!PG_FN_OK.has(m[1])) return no(`הפונקציה pg_${m[1]} לא מותרת בקונסולה`);
  const f = BAD_FN.exec(scan); if (f) return no(`הפונקציה ${f[1]} לא מותרת בקונסולה`);
  for (const m of scan.matchAll(BAD_SCHEMA_FN)) if (!(m[1] === 'auth' && AUTH_FN_OK.has(m[2]))) return no(`הפונקציה ${m[1]}.${m[2]} לא מותרת בקונסולה`);
  const src = BAD_SOURCE.exec(scan); if (src) return no(`${src[1]} מכיל מידע רגיש ולא נקרא מכאן`);
  const sw = SECRET_WORD.exec(scan); if (sw) return no(`${sw[0]} נראה כמו סוד (סיסמה, טוקן או מפתח) ולא נקרא מכאן`);
  const aliases = [];
  for (const m of scan.matchAll(/\bauth\.(\w+)(\s*\()?/g)) {
    if (m[2]) continue; // auth.uid() and friends: checked above
    if (!AUTH_OK.has(m[1])) return no(`auth.${m[1]} לא נקרא מכאן — מותר רק auth.users ו-auth.identities, בעמודות לא רגישות`);
  }
  for (const m of scan.matchAll(/\bauth\.(users|identities)\b(?!\s*\()(?:\s+(?:as\s+)?(\w+))?/g)) aliases.push(m[2] && !NOT_ALIAS.has(m[2]) ? m[2] : m[1]);
  if (aliases.length) {
    if (scan.replace(/count\s*\(\s*\*\s*\)/g, '').includes('*')) return no('ב-auth.users וב-auth.identities צריך לבחור עמודות בשמן (בלי *)');
    for (const a of new Set(aliases)) {
      const bare = [...scan.matchAll(new RegExp(`(^|[^.\\w])${a}\\b(?!\\s*\\.)`, 'g'))].length;
      const defs = aliases.filter((x) => x === a).length * (AUTH_OK.has(a) ? 0 : 1);
      if (bare > defs) return no(`ב-auth צריך לבחור עמודות בשמן (${a}.email ולא ${a} כשורה שלמה)`);
    }
  }
  return { ok: true, query: keep, explain: first === 'explain' };
}
const wrapped = (g) => (g.explain ? `${TIMEOUT_SQL} ${g.query}` : `${TIMEOUT_SQL} select * from (\n${g.query}\n) as _q limit ${SQL_CAP}`);

// ---------------------------------------------------------------- GET
const CATALOG = `select json_build_object(
 'db_bytes', pg_database_size(current_database()),
 'tables', (select coalesce(json_agg(t order by t.bytes desc), '[]') from (
   select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as forced,
     greatest(coalesce(s.n_live_tup, 0), 0)::bigint as rows, pg_total_relation_size(c.oid)::bigint as bytes,
     (select count(*) from pg_policies p where p.schemaname = n.nspname and p.tablename = c.relname)::int as policies
   from pg_class c join pg_namespace n on n.oid = c.relnamespace left join pg_stat_all_tables s on s.relid = c.oid
   where c.relkind in ('r','p') and n.nspname not in ('pg_catalog','information_schema') and n.nspname not like 'pg\\_%') t),
 'users', (select json_build_object('total', count(*), 'confirmed', count(*) filter (where email_confirmed_at is not null or phone_confirmed_at is not null),
   'last7', count(*) filter (where created_at > now() - interval '7 days'), 'prev7', count(*) filter (where created_at <= now() - interval '7 days' and created_at > now() - interval '14 days'),
   'active7', count(*) filter (where last_sign_in_at > now() - interval '7 days'), 'anonymous', count(*) filter (where is_anonymous)) from auth.users),
 'providers', (select coalesce(json_agg(p order by p.users desc), '[]') from (select provider, count(distinct user_id)::int as users from auth.identities group by provider) p),
 'signups', (select json_agg(x order by x.day) from (select d::date as day, count(u.id)::int as n from generate_series(current_date - 29, current_date, interval '1 day') d
   left join auth.users u on u.created_at::date = d::date group by d) x),
 'recent', (select coalesce(json_agg(r), '[]') from (select u.id, u.email, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed, u.is_anonymous as anonymous,
   coalesce((select array_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '{}') as providers
   from auth.users u order by u.last_sign_in_at desc nulls last, u.created_at desc limit 20) r),
 'buckets', (select coalesce(json_agg(b order by b.name), '[]') from (select b.name, b.public, b.created_at, count(o.id)::int as objects, coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes
   from storage.buckets b left join storage.objects o on o.bucket_id = b.id group by b.id, b.name, b.public, b.created_at) b),
 'connections', (select count(*) from pg_stat_activity where datname = current_database()),
 'max_connections', current_setting('max_connections')::int,
 'cache_hit', (select round(sum(heap_blks_hit)::numeric / nullif(sum(heap_blks_hit) + sum(heap_blks_read), 0), 4) from pg_statio_user_tables),
 'extensions', (select coalesce(json_agg(e order by e.name), '[]') from (select extname as name, extversion as version from pg_extension) e)
) as d`;
const TRAFFIC = `select timestamp_trunc(timestamp, hour) as t, count(*) as n, countif(response.status_code >= 400) as errors
  from edge_logs cross join unnest(metadata) as m cross join unnest(m.response) as response group by t order by t`;

// Studio's lint names in Hebrew (splinter, supabase/splinter). Unknown ones keep the English title.
const LINT_HE = {
  rls_disabled_in_public: 'RLS כבוי בטבלה ציבורית', rls_enabled_no_policy: 'RLS דלוק בלי אף מדיניות', policy_exists_rls_disabled: 'יש מדיניות אבל RLS כבוי',
  security_definer_view: 'תצוגה שרצה בהרשאות של היוצר', function_search_path_mutable: 'פונקציה בלי search_path קבוע',
  anon_security_definer_function_executable: 'אורח אנונימי יכול להריץ פונקציה בהרשאות-על', authenticated_security_definer_function_executable: 'משתמש מחובר יכול להריץ פונקציה בהרשאות-על',
  auth_leaked_password_protection: 'ההגנה מסיסמאות שדלפו כבויה', auth_users_exposed: 'טבלת המשתמשים חשופה דרך ה-API', extension_in_public: 'הרחבה מותקנת בסכמה public',
  auth_otp_long_expiry: 'קוד חד-פעמי תקף זמן רב מדי', auth_otp_short_length: 'קוד חד-פעמי קצר מדי', auth_insufficient_mfa_options: 'מעט מדי אפשרויות לאימות דו-שלבי',
  rls_references_user_metadata: 'מדיניות RLS נשענת על מטא-דאטה שהמשתמש עורך', materialized_view_in_api: 'תצוגה ממומשת חשופה ב-API', foreign_table_in_api: 'טבלה זרה חשופה ב-API',
  unsupported_reg_types: 'סוג עמודה שלא נתמך בשדרוג', insecure_queue_exposed_in_api: 'תור הודעות חשוף ב-API', fkey_to_auth_unique: 'מפתח זר לאילוץ ייחודי ב-auth',
  unindexed_foreign_keys: 'מפתח זר בלי אינדקס', auth_rls_initplan: 'מדיניות RLS מחשבת את auth() מחדש לכל שורה', unused_index: 'אינדקס שלא בשימוש',
  multiple_permissive_policies: 'כמה מדיניות מתירות על אותה פעולה', no_primary_key: 'טבלה בלי מפתח ראשי', duplicate_index: 'אינדקס כפול', table_bloat: 'טבלה נפוחה',
};
const LEVELS = { ERROR: 0, WARN: 1, INFO: 2 };
const clean = (t) => (t == null ? null : redact(String(t).replace(/\\`/g, '`')));
function advisor(v, what) {
  need(v, (x) => isObj(x) && Array.isArray(x.lints), what);
  const by = new Map();
  for (const l of v.lints) {
    if (!isObj(l) || typeof l.name !== 'string') continue;
    const g = by.get(l.name) || { name: l.name, he: LINT_HE[l.name] || clean(l.title), title: clean(l.title), level: String(l.level || 'INFO').toUpperCase(),
      facing: l.facing ?? null, categories: Array.isArray(l.categories) ? l.categories.map(String) : [], description: clean(l.description), remediation: null, count: 0, items: [] };
    if ((LEVELS[String(l.level).toUpperCase()] ?? 3) < (LEVELS[g.level] ?? 3)) g.level = String(l.level).toUpperCase();
    if (typeof l.remediation === 'string' && l.remediation.startsWith('https://')) g.remediation = l.remediation;
    const md = isObj(l.metadata) ? l.metadata : {};
    g.count++; g.items.push({ object: s(md.schema && md.name ? `${md.schema}.${md.name}` : md.entity || md.name || ''), table: s(md.name ?? null), type: s(md.type ?? null), detail: clean(l.detail) });
    by.set(l.name, g);
  }
  const groups = [...by.values()].sort((a, b) => (LEVELS[a.level] ?? 3) - (LEVELS[b.level] ?? 3) || b.count - a.count);
  const c = (lv) => v.lints.filter((l) => String(l?.level).toUpperCase() === lv).length;
  return { error: c('ERROR'), warn: c('WARN'), info: c('INFO'), groups };
}

function localBackups() {
  try {
    const dir = path.join(REPO, '.backups');
    return fs.readdirSync(dir).filter((x) => /^supabase-/.test(x)).map((name) => {
      const st = fs.statSync(path.join(dir, name));
      let files = null; try { files = fs.readdirSync(path.join(dir, name)).filter((f) => f.endsWith('.json')).length; } catch { /* unreadable */ }
      return { name, at: st.mtime.toISOString(), files };
    }).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 6);
  } catch { return []; }
}

const fast = () => Promise.all([
  section(async () => need(await get('', 'פרטי הפרויקט'), (v) => isObj(v) && typeof v.ref === 'string', 'פרטי הפרויקט')),
  section(async () => need(await get('/health?services=auth,db,rest,realtime,storage', 'בדיקת התקינות'), Array.isArray, 'בדיקת התקינות')),
  section(async () => need((await sql(CATALOG, 'קטלוג מסד הנתונים'))?.[0]?.d, isObj, 'קטלוג מסד הנתונים')),
  section(() => logs(TRAFFIC, 'תעבורת ה-API')),
]);
// Slow-moving parts are read every 5 minutes, not every minute, to stay far below the API's rate limit.
const slow = () => cached('supabase:slow', async () => {
  const parts = await Promise.all([
    section(async () => advisor(await get('/advisors/security', 'יועץ האבטחה'), 'יועץ האבטחה')),
    section(async () => advisor(await get('/advisors/performance', 'יועץ הביצועים'), 'יועץ הביצועים')),
    section(async () => need(await get('/functions', 'Edge Functions'), Array.isArray, 'Edge Functions')),
    section(async () => need(await get('/database/migrations', 'המיגרציות'), Array.isArray, 'המיגרציות')),
    section(async () => need(await get('/database/backups', 'הגיבויים'), isObj, 'הגיבויים')),
    section(async () => need(await get('/analytics/endpoints/usage.api-counts?interval=7day', 'נתוני השימוש'), (v) => isObj(v) && Array.isArray(v.result) && !v.error, 'נתוני השימוש')),
  ]);
  return { ok: parts.every((p) => !p.error), parts };
}, 300000);
const org = (slug) => cached('supabase:org', async () => {
  const r = await section(async () => need(await fetchJson(`${API}/organizations/${encodeURIComponent(slug)}`, { label: LABEL, what: 'הארגון', headers: auth() }), isObj, 'הארגון'));
  return { ok: !r.error, r };
}, 600000);

export function supabase() {
  if (!process.env.SUPABASE_ACCESS_TOKEN) return Promise.resolve(fail(NO_TOKEN));
  return cached('supabase', async () => {
    const [[project, health, catalog, traffic], sl] = await Promise.all([fast(), slow()]);
    const [security, performance, functions, migrations, backups, usage] = sl.parts;
    const slug = project.value?.organization_slug || project.value?.organization_id;
    const organization = slug ? (await org(slug)).r : { error: project.error || 'לא ידוע לאיזה ארגון הפרויקט שייך' };
    const all = { project, org: organization, health, catalog, traffic, security, performance, functions, migrations, backups, usage };
    const errors = Object.fromEntries(Object.entries(all).filter(([, x]) => x.error).map(([k, x]) => [k, x.error]));
    if (Object.keys(errors).length === Object.keys(all).length) return fail(project.error, { errors });
    const p = project.value; const c = catalog.value;
    const tables = c ? (Array.isArray(c.tables) ? c.tables : []).map((t) => ({ schema: s(t.schema), name: s(t.name), rls: !!t.rls, forced: !!t.forced,
      rows: n(t.rows), bytes: n(t.bytes), sizeBytes: n(t.bytes), policies: n(t.policies) })) : null;
    const days = usage.value ? usage.value.result.map((r) => ({ day: s(r.timestamp), rest: n(r.total_rest_requests) ?? 0, auth: n(r.total_auth_requests) ?? 0,
      storage: n(r.total_storage_requests) ?? 0, realtime: n(r.total_realtime_requests) ?? 0 })) : null;
    const sum = (k) => days.reduce((a, r) => a + r[k], 0);
    const out = {
      project: p ? { name: s(p.name), ref: s(p.ref), region: s(p.region), status: s(p.status), dbVersion: s(p.database?.version), engine: s(p.database?.postgres_engine),
        channel: s(p.database?.release_channel), createdAt: s(p.created_at), dashboardUrl: `https://supabase.com/dashboard/project/${REF}` } : null,
      org: organization.value ? { name: s(organization.value.name), plan: s(organization.value.plan), slug: s(slug) } : null,
      health: health.value ? health.value.filter(isObj).map((x) => ({ name: s(x.name), healthy: x.healthy === true, status: s(x.status), version: s(x.info?.version) })) : null,
      dbSizeBytes: c ? n(c.db_bytes) : null,
      tables,
      authUsers: c ? n(c.users?.total) : null,
      auth: c ? {
        users: Object.fromEntries(['total', 'confirmed', 'last7', 'prev7', 'active7', 'anonymous'].map((k) => [k, n(c.users?.[k])])),
        providers: (Array.isArray(c.providers) ? c.providers : []).map((x) => ({ provider: s(x.provider), users: n(x.users) })),
        signups: (Array.isArray(c.signups) ? c.signups : []).map((x) => ({ day: s(x.day), n: n(x.n) ?? 0 })),
        recent: (Array.isArray(c.recent) ? c.recent : []).map((u) => ({ id: s(u.id), email: s(u.email), createdAt: s(u.created_at), lastSignInAt: s(u.last_sign_in_at),
          confirmed: !!u.confirmed, anonymous: !!u.anonymous, providers: Array.isArray(u.providers) ? u.providers.map(String) : [] })),
      } : null,
      storage: c ? { buckets: (Array.isArray(c.buckets) ? c.buckets : []).map((b) => ({ name: s(b.name), public: !!b.public, createdAt: s(b.created_at), objects: n(b.objects), sizeBytes: n(b.bytes) })) } : null,
      db: c ? { connections: n(c.connections), maxConnections: n(c.max_connections), cacheHit: n(c.cache_hit),
        extensions: (Array.isArray(c.extensions) ? c.extensions : []).map((e) => ({ name: s(e.name), version: s(e.version) })) } : null,
      advisors: { security: security.value || null, performance: performance.value || null },
      functions: functions.value ? functions.value.filter(isObj).map((f) => ({ slug: s(f.slug), name: s(f.name), status: s(f.status), version: n(f.version),
        verifyJwt: f.verify_jwt ?? null, createdAt: f.created_at ? new Date(f.created_at).toISOString() : null, updatedAt: f.updated_at ? new Date(f.updated_at).toISOString() : null })) : null,
      migrations: migrations.value ? migrations.value.filter(isObj).map((m) => ({ version: s(m.version), name: s(m.name) })) : null,
      backups: backups.value ? { pitr: !!backups.value.pitr_enabled, walg: !!backups.value.walg_enabled,
        list: (Array.isArray(backups.value.backups) ? backups.value.backups : []).filter(isObj).map((b) => ({ at: s(b.inserted_at), status: s(b.status), physical: !!b.is_physical_backup })) } : null,
      localBackups: localBackups(),
      usage: days ? { days, totals: { rest: sum('rest'), auth: sum('auth'), storage: sum('storage'), realtime: sum('realtime') } } : null,
      traffic: traffic.value ? traffic.value.filter(isObj).map((r) => ({ at: iso(r.t), n: n(r.n) ?? 0, errors: n(r.errors) ?? 0 })) : null,
      errors,
    };
    out.insights = insightsOf(out);
    return ok(mask(out));
  });
}

// ---------------------------------------------------------------- insights (Hebrew, server-side)
export const FREE_DB_BYTES = 500 * 1024 * 1024;
const SVC = { auth: 'האימות (Auth)', db: 'מסד הנתונים', rest: 'ה-API (PostgREST)', realtime: 'Realtime', storage: 'Storage' };
const RANK = { bad: 0, warn: 1, info: 2, good: 3 };
const nf = (x) => new Intl.NumberFormat('he-IL').format(x);
const mb = (b) => `${nf(Math.round((b / 1024 / 1024) * 10) / 10)} MB`;
const daysAgo = (t) => Math.floor((Date.now() - new Date(t).getTime()) / 864e5);
function worstPhrase(g) {
  const it = g.items?.[0] || {};
  if (g.name === 'rls_disabled_in_public') return `RLS כבוי בטבלה ${it.table || it.object || ''}`.trim();
  if (g.name === 'rls_enabled_no_policy' && g.count === 1) return `RLS בלי מדיניות בטבלה ${it.table || it.object || ''}`.trim();
  return g.he || g.title || g.name;
}
/** @returns {Array<{level:'bad'|'warn'|'good'|'info', title:string, detail:string, href?:string, tab?:string}>} 2–4, worst first */
export function insightsOf(d) {
  const out = []; const E = d.errors || {}; const dash = `https://supabase.com/dashboard/project/${REF}`;
  if (d.project?.status && d.project.status !== 'ACTIVE_HEALTHY') out.push({ level: 'bad', title: `הפרויקט לא פעיל (${d.project.status})`, detail: 'Supabase מדווח שהפרויקט לא במצב ACTIVE_HEALTHY. בזמן הזה האתר לא יכול לקרוא או לכתוב נתונים.', href: dash });

  const sec = d.advisors?.security;
  if (sec && Array.isArray(sec.groups)) {
    const total = (sec.error || 0) + (sec.warn || 0);
    const worst = sec.groups[0];
    if (total && worst) {
      out.push({ level: sec.error ? 'bad' : 'warn', title: `${nf(total)} אזהרות אבטחה, הכי חמורה: ${worstPhrase(worst)}`,
        detail: `${worst.he} (${worst.name}), ${nf(worst.count)} מקרים. הגדרות אבטחה לא משתנות מכאן בכוונה: פותחים את יועץ האבטחה ב-Supabase ומתקנים שם.`, href: `${dash}/advisors/security`, tab: 'advisors' });
    } else out.push({ level: 'good', title: 'אין אזהרות אבטחה פתוחות', detail: `יועץ האבטחה של Supabase לא מצא בעיות ברמת ERROR או WARN${sec.info ? ` (יש ${nf(sec.info)} הערות מידע)` : ''}.`, tab: 'advisors' });
  } else if (E.security) out.push({ level: 'info', title: 'לא הצלחנו לקרוא את יועץ האבטחה', detail: E.security, tab: 'advisors' });
  else if (!sec && Array.isArray(d.tables)) {
    const off = d.tables.filter((t) => t.schema === 'public' && !t.rls);
    if (off.length) out.push({ level: 'bad', title: `RLS כבוי בטבלה ${off[0].name}${off.length > 1 ? ` ועוד ${nf(off.length - 1)}` : ''}`, detail: 'בטבלה ציבורית בלי RLS כל מי שיש לו את המפתח הציבורי יכול לקרוא ולכתוב.', tab: 'tables' });
  }

  if (Array.isArray(d.health)) {
    const down = d.health.filter((x) => !x.healthy);
    for (const x of down) {
      const unused = x.name === 'realtime' && d.usage?.totals && d.usage.totals.realtime === 0;
      out.push({ level: unused ? 'warn' : 'bad', title: `השירות ${SVC[x.name] || x.name} לא תקין`,
        detail: unused ? `Supabase מדווח ש-Realtime במצב ${x.status}, אבל היו 0 בקשות Realtime ב-7 הימים האחרונים, כך שכרגע זה לא פוגע במשתמשים.`
          : `Supabase מדווח מצב ${x.status}. כל מה שנשען על ${SVC[x.name] || x.name} עלול להיכשל עד שזה יחזור.`, tab: 'overview' });
    }
    if (!down.length && d.health.length) out.push({ level: 'good', title: `כל ${nf(d.health.length)} השירותים תקינים`, detail: d.health.map((x) => SVC[x.name] || x.name).join(', '), tab: 'overview' });
  } else if (E.health) out.push({ level: 'info', title: 'לא הצלחנו לבדוק את תקינות השירותים', detail: E.health, tab: 'overview' });

  if (n(d.dbSizeBytes) != null) {
    if (d.org?.plan === 'free') {
      const f = d.dbSizeBytes / FREE_DB_BYTES;
      out.push({ level: f >= 0.9 ? 'bad' : f >= 0.7 ? 'warn' : 'good', title: `מסד הנתונים: ${mb(d.dbSizeBytes)} מתוך 500 MB`,
        detail: `${nf(Math.round(f * 1000) / 10)}% מהמכסה של התוכנית החינמית.${f >= 0.7 ? ' כשמגיעים ל-500 MB המסד עובר למצב קריאה בלבד.' : ' יש עוד הרבה מקום.'}`, tab: 'database' });
    } else out.push({ level: 'info', title: `מסד הנתונים: ${mb(d.dbSizeBytes)}`, detail: d.org?.plan ? `תוכנית ${d.org.plan}.` : 'לא הצלחנו לדעת באיזו תוכנית הארגון, אז אין השוואה למכסה.', tab: 'database' });
  } else if (E.catalog) out.push({ level: 'info', title: 'לא הצלחנו למדוד את מסד הנתונים', detail: E.catalog, tab: 'database' });

  if (d.backups) {
    const last = (d.localBackups || [])[0];
    const ageHe = (n) => (n < 1 ? 'היום' : n < 2 ? 'אתמול' : `לפני ${nf(n)} ימים`);
    const local = last ? `הגיבוי המקומי האחרון נעשה ${ageHe(daysAgo(last.at))}.` : 'עוד לא נעשה גיבוי מקומי: הכפתור "לגבות עכשיו" במסך Database שומר עותק במחשב.';
    if (d.backups.pitr) out.push({ level: 'good', title: 'שחזור לנקודת זמן (PITR) פעיל', detail: local, tab: 'database' });
    else if (d.backups.list?.length) out.push({ level: 'info', title: `${nf(d.backups.list.length)} גיבויים יומיים של Supabase`, detail: `PITR כבוי. ${local}`, tab: 'database' });
    else out.push({ level: last && daysAgo(last.at) < 7 ? 'info' : 'warn', title: 'אין גיבוי אוטומטי ב-Supabase', detail: `בתוכנית הזו אין גיבויים יומיים ואין PITR. ${local}`, tab: 'database' });
  }

  if (Array.isArray(d.traffic) && d.traffic.length) {
    const all = d.traffic.reduce((a, r) => a + r.n, 0); const bad = d.traffic.reduce((a, r) => a + r.errors, 0);
    if (all >= 50 && bad / all > 0.05) out.push({ level: 'warn', title: `${nf(Math.round((bad / all) * 100))}% מהבקשות נכשלו ב-24 השעות האחרונות`, detail: `${nf(bad)} שגיאות מתוך ${nf(all)} בקשות. הלוגים המלאים במסך Logs.`, tab: 'logs' });
  }

  const u = d.auth?.users;
  if (u && n(u.last7) != null) {
    const a = u.last7; const b = u.prev7 ?? 0;
    out.push(a || b ? { level: 'info', title: `${nf(a)} הרשמות חדשות השבוע`, detail: `לעומת ${nf(b)} בשבוע שלפני${a > b ? ' — עלייה' : a < b ? ' — ירידה' : ' — ללא שינוי'}.`, tab: 'auth' }
      : { level: 'info', title: 'אין הרשמות חדשות בשבועיים האחרונים', detail: `${nf(u.total ?? 0)} משתמשים רשומים בסך הכול.`, tab: 'auth' });
  }
  return out.map((x, i) => ({ x, i })).sort((a, b) => RANK[a.x.level] - RANK[b.x.level] || a.i - b.i).slice(0, 4).map(({ x }) => x);
}

// ---------------------------------------------------------------- actions
// The backup directory must never reach git: ignored already, or `.backups/` is appended once.
async function ensureIgnored() {
  try { await run('git', ['-C', REPO, 'check-ignore', '-q', '.backups/probe']); return; } catch { /* exit 1 = not ignored */ }
  const gi = path.join(REPO, '.gitignore');
  const cur = fs.existsSync(gi) ? fs.readFileSync(gi, 'utf8') : '';
  fs.appendFileSync(gi, `${cur && !cur.endsWith('\n') ? '\n' : ''}.backups/\n`);
}

const LOGS = {
  'edge-errors': { what: 'שגיאות ה-API', sql: `select timestamp, request.method, request.path, response.status_code as status from edge_logs
    cross join unnest(metadata) as m cross join unnest(m.request) as request cross join unnest(m.response) as response
    where response.status_code >= 400 order by timestamp desc limit 100`,
  row: (r) => ({ at: iso(r.timestamp), method: s(r.method), path: stripQuery(r.path), status: n(r.status) }) },
  'postgres-errors': { what: 'שגיאות Postgres', sql: `select postgres_logs.timestamp, event_message, parsed.error_severity from postgres_logs
    cross join unnest(metadata) as metadata cross join unnest(metadata.parsed) as parsed
    where parsed.error_severity in ('ERROR', 'FATAL', 'PANIC') order by timestamp desc limit 100`,
  row: (r) => ({ at: iso(r.timestamp), severity: s(r.error_severity), message: mask(String(r.event_message ?? '')) }) },
  auth: { what: 'לוג ההתחברויות', sql: 'select timestamp, event_message from auth_logs order by timestamp desc limit 100',
    row: (r) => { let m = {}; try { m = JSON.parse(r.event_message); } catch { m = { msg: r.event_message }; }
      return { at: iso(r.timestamp), level: s(m.level), status: n(m.status), method: s(m.method), path: stripQuery(m.path), msg: mask(String(m.msg ?? m.error ?? '')), error: m.error ? mask(String(m.error)) : null }; } },
};

async function runSql(g, what) {
  const t0 = Date.now();
  const v = await sql(wrapped(g), what);
  if (!Array.isArray(v)) throw odd(what);
  const rows = v.slice(0, SQL_CAP).filter(isObj);
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return ok({ columns, rows: mask(rows), rowCount: rows.length, capped: rows.length >= SQL_CAP, ms: Date.now() - t0 });
}
const upstream = (e) => (e instanceof UpstreamError ? fail(e.reason) : fail('שגיאה לא צפויה בדרך ל-Supabase'));

export async function supabaseAction({ kind, dryRun, query, q, schema, table } = {}) {
  if (kind === 'reset' || kind === 'reset-test-data') return fail('מחיקת נתונים בפרודקשן חסומה בכוונה — אפשר לבקש ממני בצ׳אט');
  if (kind === 'sql' || kind === 'preview') {
    let g;
    if (kind === 'preview') {
      if (!/^[\w$]{1,63}$/.test(String(schema ?? '')) || !/^[\w$]{1,63}$/.test(String(table ?? ''))) return fail('שם הטבלה לא תקין');
      g = guardSql(`select * from "${schema}"."${table}" limit ${PREVIEW_CAP}`);
      if (!g.ok) return fail(`את הטבלה הזו לא מציגים מכאן: ${g.reason}`);
    } else {
      g = guardSql(query);
      if (!g.ok) return fail(g.reason);
    }
    if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url: QUERY_URL, body: { query: wrapped(g), read_only: true } } });
    if (!process.env.SUPABASE_ACCESS_TOKEN) return fail(NO_TOKEN);
    try { return await runSql(g, kind === 'preview' ? `תצוגת הטבלה ${table}` : 'השאילתה'); } catch (e) { return upstream(e); }
  }
  if (kind === 'logs') {
    const L = Object.hasOwn(LOGS, String(q)) ? LOGS[q] : null;
    if (!L) return fail('שאילתת לוגים לא מוכרת — יש רק את השאילתות הקבועות');
    if (!process.env.SUPABASE_ACCESS_TOKEN) return fail(NO_TOKEN);
    try {
      const rows = await cached(`supabase:logs:${q}`, async () => { try { return { ok: true, rows: (await logs(L.sql, L.what)).filter(isObj).map(L.row) }; } catch (e) { return { ok: false, e }; } }, 30000);
      if (!rows.ok) return upstream(rows.e);
      return ok({ q, rows: rows.rows, rowCount: rows.rows.length });
    } catch (e) { return upstream(e); }
  }
  if (kind !== 'backup') return fail('פעולה לא מוכרת');
  // A LOGICAL backup: each public table's rows (at most 50k) as JSON under .backups/supabase-<ISO>/.
  // Every query is read-only; nothing is reset, deleted or truncated.
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url: QUERY_URL,
    body: { query: `select * from public.<table> limit ${ROW_CAP}`, read_only: true }, writes: '.backups/supabase-<time>/<table>.json' } });
  if (!process.env.SUPABASE_ACCESS_TOKEN) return fail(NO_TOKEN);
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
