// Supabase, laid out like Supabase Studio: breadcrumb bar (org / project / branch), the product menu
// (Project overview · Table Editor · SQL Editor · Database · Authentication · Storage · Edge Functions ·
// Advisors · Logs · Reports) and the section itself. Everything is read-only except the local backup,
// which goes through the shell's confirm modal. The SQL runner, the row preview and the log explorer
// are reads guarded on the server (cc/platforms/supabase.mjs: guardSql, read_only, row cap, redact).
import { html, raw, num, compact, bytes, ago, ltr, arr, isNum, failCard, bars, pct, shortDay, hourOf, when } from '../ui.js';
import { logo, icon } from '../logos.js';
import { rn } from '../fx.js';
import { sb } from '../actions.js';
import { actBtn } from './kit.js';

const PATH = '/api/cc/supabase/action';
const FREE_DB = 500 * 1024 * 1024; // the free plan's database size limit

// Studio's product icons (supabase/supabase apps/studio, Apache-2.0) and Lucide lightbulb / git-branch (ISC).
const P = {
  home: '<path d="M9.43414 20.803V13.0557C9.43414 12.5034 9.88186 12.0557 10.4341 12.0557H14.7679C15.3202 12.0557 15.7679 12.5034 15.7679 13.0557V20.803M12.0181 3.48798L5.53031 7.9984C5.26145 8.18532 5.10114 8.49202 5.10114 8.81948L5.10117 18.803C5.10117 19.9075 5.9966 20.803 7.10117 20.803H18.1012C19.2057 20.803 20.1012 19.9075 20.1012 18.803L20.1011 8.88554C20.1011 8.55988 19.9426 8.25462 19.6761 8.06737L13.1639 3.49088C12.8204 3.24951 12.3627 3.24836 12.0181 3.48798Z"/>',
  table: '<path d="M2.9707 15.3494L20.9707 15.355M20.9405 9.61588H2.99699M8.77661 9.61588V21.1367M20.9405 5.85547V19.1367C20.9405 20.2413 20.0451 21.1367 18.9405 21.1367H4.99699C3.89242 21.1367 2.99699 20.2413 2.99699 19.1367V5.85547C2.99699 4.7509 3.89242 3.85547 4.99699 3.85547H18.9405C20.0451 3.85547 20.9405 4.7509 20.9405 5.85547Z"/>',
  sql: '<path d="M7.89844 8.4342L11.5004 12.0356L7.89844 15.6375M12 15.3292H16.5M5 21.1055H19C20.1046 21.1055 21 20.21 21 19.1055V5.10547C21 4.0009 20.1046 3.10547 19 3.10547H5C3.89543 3.10547 3 4.0009 3 5.10547V19.1055C3 20.21 3.89543 21.1055 5 21.1055Z"/>',
  database: '<path d="M5.56774 9.70642H18.4547V15.7064H5.56774V9.70642Z"/><path d="M4.5 16.7094C4.5 16.1571 4.94772 15.7094 5.5 15.7094H18.5C19.0523 15.7094 19.5 16.1571 19.5 16.7094V20.7094C19.5 21.2616 19.0523 21.7094 18.5 21.7094H5.5C4.94772 21.7094 4.5 21.2616 4.5 20.7094V16.7094Z"/><path d="M4.5 4.70679C4.5 4.1545 4.94772 3.70679 5.5 3.70679H18.5C19.0523 3.70679 19.5 4.1545 19.5 4.70679V8.70679C19.5 9.25907 19.0523 9.70679 18.5 9.70679H5.5C4.94772 9.70679 4.5 9.25907 4.5 8.70679V4.70679Z"/>',
  auth: '<path d="M5.24121 15.0674H12.7412M5.24121 15.0674V18.0674H12.7412V15.0674M5.24121 15.0674V12.0674H12.7412V15.0674M15 7.60547V4.60547C15 2.94861 13.6569 1.60547 12 1.60547C10.3431 1.60547 9 2.94861 9 4.60547V7.60547M5.20898 9.60547L5.20898 19.1055C5.20898 20.21 6.10441 21.1055 7.20898 21.1055H16.709C17.8136 21.1055 18.709 20.21 18.709 19.1055V9.60547C18.709 8.5009 17.8136 7.60547 16.709 7.60547L7.20899 7.60547C6.10442 7.60547 5.20898 8.5009 5.20898 9.60547Z"/>',
  storage: '<path d="M19.4995 11.3685V8.50725L14.0723 3.10584H5.49951C4.94722 3.10584 4.49951 3.55355 4.49951 4.10584V9.1051M19.4468 8.48218L14.0701 3.10547L14.0701 7.48218C14.0701 8.03446 14.5178 8.48218 15.0701 8.48218L19.4468 8.48218ZM6.86675 9.1051H3.96045C3.40816 9.1051 2.96045 9.55282 2.96045 10.1051V19.1051C2.96045 20.2097 3.85588 21.1051 4.96045 21.1051H18.9604C20.065 21.1051 20.9604 20.2097 20.9604 19.1051V12.3685C20.9604 11.8162 20.5127 11.3685 19.9605 11.3685H9.98622C9.72382 11.3685 9.47194 11.2654 9.28489 11.0813L7.56808 9.39226C7.38103 9.20824 7.12915 9.1051 6.86675 9.1051Z"/>',
  fn: '<path d="M18 12.1055C18 15.4192 15.3137 18.1055 12 18.1055C8.6863 18.1055 6.00001 15.4192 6.00001 12.1055C6.00001 8.79176 8.6863 6.10547 12 6.10547C15.3137 6.10547 18 8.79176 18 12.1055Z"/><path d="M21.3999 5.70154C21.3999 7.35839 20.0568 8.70154 18.3999 8.70154C16.7431 8.70154 15.3999 7.35839 15.3999 5.70154C15.3999 4.04468 16.7431 2.70154 18.3999 2.70154C20.0568 2.70154 21.3999 4.04468 21.3999 5.70154Z"/><path d="M8.62216 18.4363C8.62216 20.0932 7.27902 21.4363 5.62216 21.4363C3.96531 21.4363 2.62216 20.0932 2.62216 18.4363C2.62216 16.7795 3.96531 15.4363 5.62216 15.4363C7.27902 15.4363 8.62216 16.7795 8.62216 18.4363Z"/><path d="M3.18121 16.2691C2.58401 15.0065 2.25 13.595 2.25 12.1055C2.25 6.72069 6.61522 2.35547 12 2.35547C13.4893 2.35547 14.9005 2.68937 16.163 3.28638M7.68679 20.852C8.98715 21.4944 10.4514 21.8555 12 21.8555C17.3848 21.8555 21.75 17.4902 21.75 12.1055C21.75 10.6162 21.4161 9.20493 20.8191 7.94242"/>',
  bulb: '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  logs: '<path d="M4.5 5.20679H4.53713M7.46241 5.21707H19.5M4.5 9.65839H4.53713M7.46241 9.66868H19.5M4.52692 14.164H4.53713M7.46241 14.1742H19.5M4.52692 18.7068L4.53713 18.6965M7.46241 18.7068H19.5"/>',
  reports: '<path d="M3.03479 9.0849L8.07241 4.0575C8.46296 3.66774 9.0954 3.66796 9.48568 4.05799L14.0295 8.59881C14.42 8.98912 15.053 8.98901 15.4435 8.59857L20.5877 3.45418M16.4996 3.01526H19.9996C20.5519 3.01526 20.9996 3.46297 20.9996 4.01526V7.51526M2.99963 12.0153L2.99963 20.1958C2.99963 20.7481 3.44735 21.1958 3.99963 21.1958L20.0004 21.1958C20.5527 21.1958 21.0004 20.7481 21.0004 20.1958V9.88574M8.82532 9.87183L8.82531 21.1958M15.1754 15.0746V21.1949"/>',
  branch: '<line x1="6" x2="6" y1="3" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
const si = (k, s = 18) => raw(`<svg class="sbx-i" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k]}</svg>`);

// Studio's product menu, grouped the way Studio groups it.
const TABS = [
  [['overview', 'Project overview', 'סקירת הפרויקט', 'home']],
  [['tables', 'Table Editor', 'עורך הטבלאות', 'table'], ['sql', 'SQL Editor', 'עורך SQL', 'sql']],
  [['database', 'Database', 'מסד הנתונים', 'database'], ['auth', 'Authentication', 'משתמשים', 'auth'], ['storage', 'Storage', 'אחסון קבצים', 'storage'], ['functions', 'Edge Functions', 'פונקציות', 'fn']],
  [['advisors', 'Advisors', 'יועצים', 'bulb'], ['logs', 'Logs', 'לוגים', 'logs'], ['reports', 'Reports', 'דוחות', 'reports']],
];
const TAB_IDS = TABS.flat().map((t) => t[0]);

const PRESETS = [
  ['גודל כל טבלה', "select table_schema, table_name, pg_size_pretty(pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass)) as size\nfrom information_schema.tables\nwhere table_schema = 'public' and table_type = 'BASE TABLE'\norder by pg_total_relation_size(format('%I.%I', table_schema, table_name)::regclass) desc;"],
  ['שורות לכל טבלה', 'select relname as table, n_live_tup as rows\nfrom pg_stat_user_tables\norder by n_live_tup desc;'],
  ['הרשמות לפי יום', "select date_trunc('day', created_at)::date as day, count(*) as users\nfrom auth.users\ngroup by 1 order by 1 desc\nlimit 30;"],
  ['מדיניות RLS', 'select schemaname, tablename, policyname, cmd, roles\nfrom pg_policies\norder by schemaname, tablename;'],
  ['אינדקסים שלא בשימוש', 'select relname as table, indexrelname as index, idx_scan as scans\nfrom pg_stat_user_indexes\nwhere idx_scan = 0\norder by relname;'],
];
const LOGQ = [['edge-errors', 'שגיאות API (‏4xx/5xx)'], ['postgres-errors', 'שגיאות Postgres'], ['auth', 'התחברויות (Auth)']];

// UI state lives here so a quiet refresh (morph) keeps it.
const st = {
  tab: 'overview', schema: 'public', table: null, prev: {}, sql: PRESETS[1][1], sqlRes: null, sqlBusy: false,
  logQ: 'edge-errors', logs: {}, adv: 'security', usersQ: '',
};

// ---------- small Studio components ----------
const badge = (text, v = 'default', extra = '') => html`<span class="sbx-badge sbx-badge-${v}" ${extra ? raw(extra) : ''}>${text}</span>`;
const LEVEL = { ERROR: ['destructive', 'שגיאה'], WARN: ['warning', 'אזהרה'], INFO: ['default', 'מידע'] };
const lvl = (l) => badge(LEVEL[l]?.[1] || l, LEVEL[l]?.[0] || 'default');
const ADM = { bad: 'destructive', warn: 'warning', info: 'default', good: 'brand' };
const ADM_IC = { bad: 'alert', warn: 'alert', info: 'bolt', good: 'check' };
function admonition(level, title, detail, extra = '') {
  return html`<div class="sbx-adm sbx-adm-${ADM[level] || 'default'}" role="${level === 'bad' ? 'alert' : 'status'}">
    <span class="sbx-adm-ic">${icon(ADM_IC[level] || 'bolt', 15)}</span>
    <div class="sbx-adm-b"><h5>${title}</h5>${detail ? html`<p dir="auto">${detail}</p>` : ''}${extra}</div></div>`;
}
const panel = (title, body, { k, sub, right = '', cls = '' } = {}) => html`<section class="sbx-card ${cls}" ${k ? raw(`data-k="${k}"`) : ''}>
  <header class="sbx-card-h"><div><h3>${title}</h3>${sub ? html`<p>${sub}</p>` : ''}</div>${right}</header><div class="sbx-card-b">${body}</div></section>`;
const empty = (ic, title, text, extra = '') => html`<div class="sbx-empty"><span class="sbx-empty-ic">${si(ic, 22)}</span><h4>${title}</h4><p>${text}</p>${extra}</div>`;
const why = (s, key, title) => (s.errors?.[key] ? failCard(s.errors[key], { title, level: 'warn' }) : null);
const tabBtn = (id, label, cls = 'sbx-link') => html`<button class="${cls}" data-act="tab" data-tab="${id}">${label}</button>`;
const metric = (key, label, value, text, sub = '') => html`<div class="sbx-metric"><p class="sbx-metric-k">${label}</p>
  <p class="sbx-metric-v">${isNum(value) ? rn(key, value, text ?? num(value)) : (text ?? '—')}</p>${sub ? html`<p class="sbx-metric-s">${sub}</p>` : ''}</div>`;
const bar = (frac, tone = '') => html`<span class="sbx-meter ${tone}" aria-hidden="true"><i style="--w:${Math.max(0, Math.min(1, frac || 0)) * 100}%"></i></span>`;

/** Studio's data grid: raw rows, NULL shown as NULL, objects as JSON, everything LTR. */
function grid(res, k) {
  if (!res) return '';
  if (res.loading) return html`<div class="sbx-grid-sk" aria-busy="true" aria-label="טוען">${[0, 1, 2, 3, 4, 5].map(() => html`<i class="sk"></i>`)}</div>`;
  if (res.ok === false) return failCard(res.reason, { title: 'השאילתה לא רצה', level: 'warn' });
  if (res.dryRun) return html`<div class="sbx-plan"><p>${badge('מצב ניסוי', 'warning')} שום דבר לא נשלח. זו הבקשה שהייתה יוצאת:</p><pre class="ltr">${JSON.stringify(res.plan, null, 2)}</pre></div>`;
  const cols = arr(res.columns); const rows = arr(res.rows);
  if (!rows.length) return html`<p class="sbx-muted sbx-pad">השאילתה רצה ולא החזירה שורות.</p>`;
  const cell = (v) => (v == null ? html`<span class="sbx-null">NULL</span>` : typeof v === 'object' ? JSON.stringify(v).slice(0, 160) : String(v).length > 160 ? `${String(v).slice(0, 160)}…` : String(v));
  return html`<div class="sbx-grid-w" dir="ltr" data-k="${k}"><table class="sbx-grid"><thead><tr><th class="sbx-rn">#</th>${cols.map((c) => html`<th>${c}</th>`)}</tr></thead>
    <tbody>${rows.map((r, i) => html`<tr><td class="sbx-rn">${i + 1}</td>${cols.map((c) => html`<td>${cell(r[c])}</td>`)}</tr>`)}</tbody></table></div>
    <p class="sbx-grid-f"><span>${num(res.rowCount)} שורות${res.capped ? ' (נחתך בתקרה)' : ''}</span>${isNum(res.ms) ? html`<span class="mono">${num(res.ms)} ms</span>` : ''}</p>`;
}

// ---------- sections ----------
function overview(s) {
  const p = s.project || {}; const u = s.usage?.totals; const days = arr(s.usage?.days);
  const ins = arr(s.insights);
  const svc = { auth: 'Auth', db: 'Database', rest: 'PostgREST', realtime: 'Realtime', storage: 'Storage' };
  const uCard = (key, label, color) => html`<div class="sbx-card sbx-use" data-k="use-${key}"><p class="sbx-metric-k">${label}</p>
    <p class="sbx-metric-v">${u ? rn(`sb-u-${key}`, u[key] ?? 0, num(u[key] ?? 0)) : '—'}</p>
    ${days.length ? bars(days, [{ key, label, color }], { h: 110, x: (r) => r.day, xfmt: shortDay }) : ''}</div>`;
  const tables = arr(s.tables).filter((t) => t.schema === 'public');
  return html`
    <div class="sbx-hero sbx-rv" style="--i:0">
      <div><h2>${p.name || 'Supabase'}</h2>
        <p class="sbx-muted">${ltr(p.region || '')} · Postgres ${ltr(p.dbVersion || '—')} · נוצר ${when(p.createdAt)}</p></div>
      <div class="sbx-hero-n">
        <div><p class="sbx-metric-k">טבלאות ב-public</p><p class="sbx-hero-v">${rn('sb-tables', tables.length, num(tables.length))}</p></div>
        <div><p class="sbx-metric-k">פונקציות Edge</p><p class="sbx-hero-v">${isNum(s.functions?.length) ? rn('sb-fns', s.functions.length, num(s.functions.length)) : '—'}</p></div>
        <div><p class="sbx-metric-k">משתמשים</p><p class="sbx-hero-v">${isNum(s.authUsers) ? rn('sb-users', s.authUsers, num(s.authUsers)) : '—'}</p></div>
      </div>
    </div>
    ${ins.length ? html`<div class="sbx-ins sbx-rv" style="--i:1">${ins.map((x, i) => html`<div data-k="ins-${i}">${admonition(x.level, x.title, x.detail, html`<p class="sbx-adm-a">${x.tab && x.tab !== 'overview' ? tabBtn(x.tab, 'לפרטים כאן') : ''}${x.href ? html`<a class="sbx-link" href="${x.href}" target="_blank" rel="noopener noreferrer">פתיחה ב-Studio ${icon('ext', 12)}</a>` : ''}</p>`)}</div>`)}</div>` : ''}
    <div class="sbx-sec sbx-rv" style="--i:2"><h3>שימוש ב-7 הימים האחרונים</h3><p class="sbx-muted">מספר הבקשות לכל שירות, לפי יום</p></div>
    ${why(s, 'usage', 'נתוני השימוש לא זמינים כרגע') || html`<div class="sbx-g4 sbx-rv" style="--i:3">
      ${uCard('rest', 'בקשות למסד (REST)', 'var(--sb-brand)')}${uCard('auth', 'בקשות Auth', 'var(--sb-brand)')}
      ${uCard('storage', 'בקשות Storage', 'var(--sb-brand)')}${uCard('realtime', 'בקשות Realtime', 'var(--sb-brand)')}</div>`}
    <div class="sbx-g2 sbx-rv" style="--i:4">
      ${panel('מצב השירותים', why(s, 'health', 'בדיקת השירותים לא זמינה כרגע') || html`<ul class="sbx-svc">${arr(s.health).map((h) => html`<li data-k="svc-${h.name}">
        <span class="sbx-dot ${h.healthy ? 'ok' : 'bad'}" aria-hidden="true"></span><b>${svc[h.name] || h.name}</b>
        ${h.version ? html`<span class="mono sbx-muted">${ltr(h.version)}</span>` : ''}<span class="sbx-grow"></span>${badge(h.healthy ? 'תקין' : h.status || 'לא תקין', h.healthy ? 'brand' : 'destructive')}</li>`)}</ul>`, { k: 'health', sub: 'כפי ש-Supabase מדווח עכשיו' })}
      ${panel('תעבורה ב-24 השעות האחרונות', why(s, 'traffic', 'לוג התעבורה לא זמין כרגע') || trafficChart(s), { k: 'traffic', sub: 'בקשות לשעה, מתוכן שגיאות (4xx/5xx)', right: tabBtn('logs', 'ללוגים', 'btn btn-sm') })}
    </div>`;
}
function trafficChart(s) {
  const t = arr(s.traffic); const tot = t.reduce((a, r) => a + (r.n || 0), 0); const err = t.reduce((a, r) => a + (r.errors || 0), 0);
  return html`<p class="sbx-big">${rn('sb-traffic', tot, num(tot))}<small>בקשות · ${num(err)} שגיאות (${tot ? pct(err / tot, 1) : '0%'})</small></p>
    ${bars(t.map((r) => ({ ...r, ok: Math.max(0, r.n - r.errors) })), [{ key: 'ok', label: 'תקינות', color: 'var(--sb-brand)' }, { key: 'errors', label: 'שגיאות', color: 'var(--sb-destructive)' }], { h: 150, x: (r) => r.at, xfmt: hourOf })}`;
}

function tables(s) {
  const gone = why(s, 'catalog', 'רשימת הטבלאות לא זמינה כרגע'); if (gone) return gone;
  const all = arr(s.tables); const schemas = [...new Set(all.map((t) => t.schema))].sort((a, b) => (a === 'public' ? -1 : b === 'public' ? 1 : a.localeCompare(b)));
  if (!schemas.includes(st.schema)) st.schema = schemas[0] || 'public';
  const list = all.filter((t) => t.schema === st.schema).sort((a, b) => a.name.localeCompare(b.name));
  const cur = st.table && all.find((t) => `${t.schema}.${t.name}` === st.table);
  const res = cur ? st.prev[st.table] : null;
  return html`<div class="sbx-split">
    <aside class="sbx-sub" aria-label="טבלאות">
      <label class="sbx-label" for="sbx-schema">סכמה</label>
      <select id="sbx-schema" class="sbx-select" data-change="schema">${schemas.map((x) => html`<option value="${x}" ${x === st.schema ? 'selected' : ''}>${x}</option>`)}</select>
      <p class="sbx-sub-t">טבלאות (${num(list.length)})</p>
      <ul class="sbx-tlist">${list.map((t) => html`<li data-k="t-${t.schema}.${t.name}"><button class="sbx-tl ${st.table === `${t.schema}.${t.name}` ? 'on' : ''}" data-act="pick" data-s="${t.schema}" data-t="${t.name}">
        ${si('table', 15)}<bdi class="ltr">${t.name}</bdi>${t.rls ? '' : html`<span class="sbx-tl-w" data-tip="RLS כבוי">${si('lock', 13)}</span>`}</button></li>`)}</ul>
    </aside>
    <div class="sbx-subm">
      ${cur ? html`<div class="sbx-tbar"><h3>${ltr(`${cur.schema}.${cur.name}`)}</h3>
          ${badge(cur.rls ? 'RLS פעיל' : 'RLS כבוי', cur.rls ? 'brand' : 'destructive')}${badge(`${num(cur.policies)} מדיניות`, 'default')}
          <span class="sbx-muted">${num(cur.rows)} שורות · ${bytes(cur.sizeBytes)}</span><span class="sbx-grow"></span>
          <span class="sbx-muted small">תצוגה בלבד, עד 50 שורות</span></div>${grid(res, `pv-${st.table}`)}`
        : html`<div class="sbx-card sbx-flush">${tableGrid(list)}</div>`}
    </div></div>`;
}
function tableGrid(list) {
  const max = Math.max(1, ...list.map((t) => t.sizeBytes || 0));
  return html`<div class="tbl-wrap"><table class="sbx-tbl"><thead><tr><th>טבלה</th><th>שורות</th><th>גודל</th><th>RLS</th><th>מדיניות</th></tr></thead><tbody>
    ${list.map((t) => html`<tr data-k="tr-${t.schema}.${t.name}"><td data-l="טבלה"><button class="sbx-link" data-act="pick" data-s="${t.schema}" data-t="${t.name}">${ltr(t.name)}</button></td>
      <td data-l="שורות" class="mono">${num(t.rows)}</td><td data-l="גודל"><span class="sbx-cellbar">${bar((t.sizeBytes || 0) / max)}<span class="mono">${bytes(t.sizeBytes)}</span></span></td>
      <td data-l="RLS">${badge(t.rls ? 'פעיל' : 'כבוי', t.rls ? 'brand' : 'destructive')}</td><td data-l="מדיניות" class="mono">${num(t.policies)}</td></tr>`)}</tbody></table></div>`;
}

function sqlEditor(ctx) {
  const dry = ctx?.store?.dry;
  return html`<div class="sbx-split">
    <aside class="sbx-sub" aria-label="שאילתות מוכנות"><p class="sbx-sub-t">שאילתות מוכנות</p>
      <ul class="sbx-tlist">${PRESETS.map(([l], i) => html`<li><button class="sbx-tl" data-act="preset" data-i="${i}">${si('sql', 15)}<span>${l}</span></button></li>`)}</ul>
      <div class="sbx-sub-n">${admonition('info', 'קריאה בלבד', 'השרת מסרב לכל כתיבה, לפקודה שנייה, לעמודות סודיות (סיסמאות, טוקנים, מפתחות) ולסכמות vault/auth הפנימיות. כל שאילתה רצה בטרנזקציה לקריאה בלבד, עם הגבלת זמן של 8 שניות ועד 200 שורות.')}</div>
    </aside>
    <div class="sbx-subm">
      <div class="sbx-editor">
        <div class="sbx-editor-h"><span class="mono">SQL</span>${badge('read-only', 'brand')}${dry ? badge('מצב ניסוי', 'warning') : ''}<span class="sbx-grow"></span>
          <kbd>⌘</kbd><kbd>↵</kbd><button class="sbx-btn sbx-btn-primary" data-act="runSql" ${st.sqlBusy ? 'disabled' : ''}>${si('play', 13)}<span>${st.sqlBusy ? 'רץ…' : 'הרצה'}</span></button></div>
        <textarea id="sbx-sql" class="sbx-code" dir="ltr" spellcheck="false" autocomplete="off" aria-label="שאילתת SQL" rows="9" data-keep="sql" data-input="sqlIn" data-key="sqlKey">${st.sql}</textarea>
      </div>
      <div class="sbx-card sbx-flush sbx-res"><header class="sbx-card-h"><div><h3>תוצאות</h3></div></header>${st.sqlRes ? grid(st.sqlRes, 'sqlres') : html`<p class="sbx-muted sbx-pad">עוד לא הורצה שאילתה. כותבים SELECT ולוחצים "הרצה" (או ⌘↵).</p>`}</div>
    </div></div>`;
}

function database(s) {
  const db = s.db || {}; const size = s.dbSizeBytes; const free = (s.org?.plan || '').toLowerCase() === 'free';
  const b = s.backups || {}; const loc = arr(s.localBackups);
  const conn = isNum(db.connections) && isNum(db.maxConnections) ? db.connections / db.maxConnections : null;
  return html`
    ${why(s, 'catalog', 'נתוני מסד הנתונים לא זמינים כרגע') || html`<div class="sbx-g3 sbx-rv" style="--i:0">
      <div class="sbx-card">${metric('sb-size', 'גודל מסד הנתונים', size, bytes(size), free ? `מתוך 500 MB בתוכנית החינמית (${pct(size / FREE_DB, 1)})` : '')}${free && isNum(size) ? bar(size / FREE_DB, size / FREE_DB > 0.9 ? 'bad' : size / FREE_DB > 0.7 ? 'warn' : '') : ''}</div>
      <div class="sbx-card">${metric('sb-conn', 'חיבורים פתוחים', db.connections, null, isNum(db.maxConnections) ? `מתוך ${num(db.maxConnections)} מותרים` : '')}${conn != null ? bar(conn, conn > 0.8 ? 'warn' : '') : ''}</div>
      <div class="sbx-card">${metric('sb-cache', 'פגיעות במטמון', isNum(db.cacheHit) ? Math.round(db.cacheHit * 1000) / 10 : null, isNum(db.cacheHit) ? pct(db.cacheHit, 1) : '—', 'כמה מהקריאות נענו מהזיכרון ולא מהדיסק')}${isNum(db.cacheHit) ? bar(db.cacheHit) : ''}</div>
    </div>`}
    <div class="sbx-g2 sbx-rv" style="--i:1">
      ${panel('גיבויים', why(s, 'backups', 'מצב הגיבויים לא זמין כרגע') || html`<ul class="sbx-kv">
          <li><span>גיבוי לנקודת זמן (PITR)</span>${badge(b.pitr ? 'פעיל' : 'לא פעיל', b.pitr ? 'brand' : 'default')}</li>
          <li><span>גיבויים יומיים ב-Supabase</span><span class="mono">${num(arr(b.list).length)}</span></li>
          <li><span>גיבוי מקומי אחרון</span>${loc[0] ? html`<span>${ago(loc[0].at)} · ${num(loc[0].files)} קבצים</span>` : html`<span class="sbx-muted">אין</span>`}</li></ul>
        ${arr(b.list).length ? '' : admonition('warn', 'אין גיבוי אוטומטי בתוכנית הזו', 'הכפתור למטה מייצא את כל טבלאות public לתיקייה ‎.backups במחשב (קריאה בלבד מ-Supabase).')}
        <p class="sbx-actions">${actBtn(sb.backup(), 'לגבות עכשיו למחשב', { cls: 'sbx-btn sbx-btn-primary', ic: 'check' })}</p>`, { k: 'backups', sub: 'מה קיים היום ומה נשמר במחשב' })}
      ${panel('מיגרציות', why(s, 'migrations', 'רשימת המיגרציות לא זמינה כרגע') || (arr(s.migrations).length ? html`<ol class="sbx-mig">${arr(s.migrations).slice().reverse().map((m) => html`<li data-k="m-${m.version}"><span class="mono sbx-muted">${ltr(m.version)}</span><bdi class="ltr">${m.name}</bdi></li>`)}</ol>` : empty('database', 'אין מיגרציות', 'לא נרשמו מיגרציות בפרויקט.')), { k: 'mig', sub: `${num(arr(s.migrations).length)} מיגרציות, החדשה למעלה` })}
    </div>
    ${panel('הרחבות מותקנות', why(s, 'catalog', 'רשימת ההרחבות לא זמינה כרגע') || html`<div class="sbx-chips">${arr(db.extensions).map((e) => html`<span class="sbx-ext" data-k="x-${e.name}"><bdi class="ltr">${e.name}</bdi><span class="mono sbx-muted">${e.version}</span></span>`)}</div>`, { k: 'ext', cls: 'sbx-rv', sub: 'Postgres extensions' })}`;
}

function auth(s) {
  const gone = why(s, 'catalog', 'נתוני המשתמשים לא זמינים כרגע'); if (gone) return gone;
  const a = s.auth || {}; const u = a.users || {}; const q = st.usersQ.trim().toLowerCase();
  const recent = arr(a.recent).filter((r) => !q || String(r.email || '').toLowerCase().includes(q) || String(r.id).includes(q));
  return html`
    <div class="sbx-g4 sbx-rv" style="--i:0">
      <div class="sbx-card">${metric('sb-au', 'משתמשים', u.total)}</div>
      <div class="sbx-card">${metric('sb-ac', 'אימתו מייל', u.confirmed, null, isNum(u.total) && u.total ? pct(u.confirmed / u.total) : '')}</div>
      <div class="sbx-card">${metric('sb-aa', 'פעילים השבוע', u.active7, null, 'התחברו ב-7 הימים האחרונים')}</div>
      <div class="sbx-card">${metric('sb-an', 'הרשמות השבוע', u.last7, null, `שבוע קודם: ${num(u.prev7 ?? 0)}`)}</div>
    </div>
    <div class="sbx-g21 sbx-rv" style="--i:1">
      ${panel('הרשמות ב-30 הימים האחרונים', bars(arr(a.signups), [{ key: 'n', label: 'הרשמות', color: 'var(--sb-brand)' }], { h: 150, x: (r) => r.day, xfmt: shortDay }), { k: 'signups' })}
      ${panel('ספקי התחברות', html`<ul class="sbx-kv">${arr(a.providers).map((p) => html`<li data-k="p-${p.provider}"><bdi class="ltr">${p.provider}</bdi><span class="mono">${num(p.users)}</span></li>`)}</ul>`, { k: 'prov', sub: 'לפי auth.identities' })}
    </div>
    <div class="sbx-card sbx-flush sbx-rv" style="--i:2"><header class="sbx-card-h"><div><h3>משתמשים אחרונים</h3><p>20 שהתחברו לאחרונה. בלי סיסמאות, טוקנים או מטא-דאטה.</p></div>
      <input id="sbx-users-q" class="sbx-input" type="search" placeholder="חיפוש לפי מייל או מזהה" value="${st.usersQ}" data-input="usersQ" aria-label="חיפוש משתמשים"></header>
      <div class="tbl-wrap"><table class="sbx-tbl"><thead><tr><th>מייל</th><th>ספק</th><th>נרשם</th><th>התחבר לאחרונה</th><th>מצב</th></tr></thead><tbody>
      ${recent.map((r) => html`<tr data-k="u-${r.id}"><td data-l="מייל"><bdi class="ltr">${r.email || '—'}</bdi><div class="mono sbx-muted small"><bdi class="ltr">${String(r.id).slice(0, 8)}</bdi></div></td>
        <td data-l="ספק">${arr(r.providers).map((p) => badge(p, 'default'))}</td><td data-l="נרשם">${ago(r.createdAt)}</td><td data-l="התחבר לאחרונה">${r.lastSignInAt ? ago(r.lastSignInAt) : html`<span class="sbx-muted">אף פעם</span>`}</td>
        <td data-l="מצב">${r.anonymous ? badge('אנונימי', 'default') : r.confirmed ? badge('מאומת', 'brand') : badge('ממתין לאימות', 'warning')}</td></tr>`)}
      </tbody></table></div>${recent.length ? '' : html`<p class="sbx-muted sbx-pad">אין התאמות.</p>`}</div>`;
}

function storage(s) {
  const gone = why(s, 'catalog', 'רשימת ה-buckets לא זמינה כרגע'); if (gone) return gone;
  const b = arr(s.storage?.buckets);
  if (!b.length) return html`<div class="sbx-card">${empty('storage', 'אין עדיין buckets', 'הפרויקט לא שומר קבצים ב-Supabase Storage. כשייווצר bucket הוא יופיע כאן עם מספר הקבצים והגודל.', s.project?.dashboardUrl ? html`<a class="sbx-btn" href="${s.project.dashboardUrl}/storage/buckets" target="_blank" rel="noopener noreferrer">פתיחה ב-Studio ${icon('ext', 12)}</a>` : '')}</div>`;
  return html`<div class="sbx-card sbx-flush"><div class="tbl-wrap"><table class="sbx-tbl"><thead><tr><th>Bucket</th><th>גישה</th><th>קבצים</th><th>גודל</th><th>נוצר</th></tr></thead><tbody>
    ${b.map((x) => html`<tr data-k="b-${x.name}"><td data-l="Bucket">${ltr(x.name)}</td><td data-l="גישה">${badge(x.public ? 'ציבורי' : 'פרטי', x.public ? 'warning' : 'default')}</td>
      <td data-l="קבצים" class="mono">${num(x.objects)}</td><td data-l="גודל" class="mono">${bytes(x.sizeBytes)}</td><td data-l="נוצר">${ago(x.createdAt)}</td></tr>`)}</tbody></table></div></div>`;
}

function functions(s) {
  const gone = why(s, 'functions', 'רשימת הפונקציות לא זמינה כרגע'); if (gone) return gone;
  const f = arr(s.functions);
  if (!f.length) return html`<div class="sbx-card">${empty('fn', 'אין Edge Functions', 'לא נפרסו פונקציות לפרויקט הזה. האתר רץ על Vercel ו-Cloudflare, כך ש-Supabase משמש כמסד נתונים ואימות בלבד.')}</div>`;
  return html`<div class="sbx-card sbx-flush"><div class="tbl-wrap"><table class="sbx-tbl"><thead><tr><th>שם</th><th>מצב</th><th>גרסה</th><th>JWT</th><th>עודכן</th></tr></thead><tbody>
    ${f.map((x) => html`<tr data-k="f-${x.slug}"><td data-l="שם">${ltr(x.name || x.slug)}</td><td data-l="מצב">${badge(x.status || '—', x.status === 'ACTIVE' ? 'brand' : 'default')}</td>
      <td data-l="גרסה" class="mono">${num(x.version)}</td><td data-l="JWT">${badge(x.verifyJwt ? 'נדרש' : 'לא נדרש', x.verifyJwt ? 'brand' : 'warning')}</td><td data-l="עודכן">${ago(x.updatedAt)}</td></tr>`)}</tbody></table></div></div>`;
}

function advisors(s) {
  const kinds = [['security', 'אבטחה'], ['performance', 'ביצועים']];
  const a = s.advisors?.[st.adv]; const gone = why(s, st.adv, `יועץ ה${st.adv === 'security' ? 'אבטחה' : 'ביצועים'} לא זמין כרגע`);
  const dash = s.project?.dashboardUrl;
  return html`<div class="sbx-tabs" role="tablist">${kinds.map(([k, l]) => {
    const x = s.advisors?.[k]; const n = x ? (x.error || 0) + (x.warn || 0) : null;
    return html`<button class="sbx-tab ${st.adv === k ? 'on' : ''}" role="tab" aria-selected="${st.adv === k ? 'true' : 'false'}" data-act="adv" data-k2="${k}">${l}${isNum(n) ? html`<span class="sbx-count">${num(n)}</span>` : ''}</button>`;
  })}</div>
    ${gone || (!a ? '' : html`
      <p class="sbx-muted sbx-adv-sum">${num(a.error)} שגיאות · ${num(a.warn)} אזהרות · ${num(a.info)} הערות. ${st.adv === 'security' ? 'הגדרות אבטחה לא משתנות מכאן בכוונה: כל תיקון נעשה ב-Studio.' : ''}</p>
      ${arr(a.groups).length ? html`<div class="sbx-adv">${arr(a.groups).map((g) => html`<details class="sbx-lint" data-k="g-${st.adv}-${g.name}">
        <summary>${lvl(g.level)}<span class="sbx-lint-t"><b>${g.he}</b><bdi class="ltr sbx-muted">${g.title}</bdi></span><span class="sbx-count">${num(g.count)}</span>${icon('arrow', 14)}</summary>
        <div class="sbx-lint-b"><p class="ltr-block sbx-muted" dir="ltr">${g.description}</p>
          <ul>${arr(g.items).slice(0, 12).map((it) => html`<li><bdi class="ltr mono">${it.object || it.table || '—'}</bdi>${it.detail ? html`<span class="sbx-muted" dir="ltr">${String(it.detail).slice(0, 180)}</span>` : ''}</li>`)}
          ${g.items?.length > 12 ? html`<li class="sbx-muted">ועוד ${num(g.items.length - 12)}…</li>` : ''}</ul>
          <p class="sbx-actions">${g.remediation ? html`<a class="sbx-btn" href="${g.remediation}" target="_blank" rel="noopener noreferrer">איך מתקנים ${icon('ext', 12)}</a>` : ''}
          ${dash ? html`<a class="sbx-btn sbx-btn-text" href="${dash}/advisors/${st.adv}" target="_blank" rel="noopener noreferrer">פתיחה ב-Studio ${icon('ext', 12)}</a>` : ''}</p></div></details>`)}</div>`
        : html`<div class="sbx-card">${empty('bulb', 'אין ממצאים', 'היועץ לא מצא בעיות בקטגוריה הזו.')}</div>`}`)}`;
}

function logsView(s) {
  const r = st.logs[st.logQ];
  const cols = { 'edge-errors': [['at', 'זמן'], ['method', 'Method'], ['path', 'נתיב'], ['status', 'סטטוס']],
    'postgres-errors': [['at', 'זמן'], ['severity', 'חומרה'], ['message', 'הודעה']],
    auth: [['at', 'זמן'], ['level', 'רמה'], ['status', 'סטטוס'], ['path', 'נתיב'], ['msg', 'הודעה']] }[st.logQ];
  const cell = (row, k) => (k === 'at' ? html`<span class="mono">${hourOf(row.at)}</span> <span class="sbx-muted small">${shortDay(row.at)}</span>`
    : k === 'status' ? (isNum(row.status) ? badge(String(row.status), row.status >= 500 ? 'destructive' : row.status >= 400 ? 'warning' : 'default') : '—')
      : k === 'severity' || k === 'level' ? badge(row[k] || '—', /error|fatal|panic/i.test(row[k] || '') ? 'destructive' : /warn/i.test(row[k] || '') ? 'warning' : 'default')
        : html`<bdi class="ltr">${row[k] ?? '—'}</bdi>`);
  return html`<div class="sbx-logbar">${LOGQ.map(([k, l]) => html`<button class="sbx-pill ${st.logQ === k ? 'on' : ''}" data-act="logq" data-q="${k}" aria-pressed="${st.logQ === k ? 'true' : 'false'}">${l}</button>`)}
      <span class="sbx-grow"></span><span class="sbx-muted small">24 השעות האחרונות · עד 100 שורות · שאילתות קבועות בלבד</span>
      <button class="sbx-btn" data-act="logq" data-q="${st.logQ}" data-again="1">${icon('refresh', 13)}<span>רענון</span></button></div>
    <div class="sbx-card sbx-flush">
      ${!r || r.loading ? html`<div class="sbx-grid-sk" aria-busy="true" aria-label="טוען">${[0, 1, 2, 3, 4].map(() => html`<i class="sk"></i>`)}</div>`
        : r.ok === false ? html`<div class="sbx-pad">${failCard(r.reason, { title: 'הלוג לא נטען', level: 'warn' })}</div>`
          : !arr(r.rows).length ? empty('logs', 'אין רשומות', 'לא היו אירועים מהסוג הזה ב-24 השעות האחרונות.')
            : html`<div class="tbl-wrap"><table class="sbx-tbl sbx-log"><thead><tr>${cols.map(([, l]) => html`<th>${l}</th>`)}</tr></thead><tbody>
              ${arr(r.rows).map((row, i) => html`<tr data-k="l-${st.logQ}-${row.at}-${i}">${cols.map(([k, l]) => html`<td data-l="${l}">${cell(row, k)}</td>`)}</tr>`)}</tbody></table></div>`}
    </div>
    ${panel('תעבורה לפי שעה', why(s, 'traffic', 'לוג התעבורה לא זמין כרגע') || trafficChart(s), { k: 'lt', sub: 'edge_logs, 24 שעות' })}`;
}

function reports(s) {
  const days = arr(s.usage?.days); const tbl = arr(s.tables).slice().sort((a, b) => (b.sizeBytes || 0) - (a.sizeBytes || 0)).slice(0, 10);
  const max = Math.max(1, ...tbl.map((t) => t.sizeBytes || 0));
  return html`<div class="sbx-g2 sbx-rv" style="--i:0">
      ${panel('בקשות לפי שירות', why(s, 'usage', 'נתוני השימוש לא זמינים כרגע') || html`${bars(days, [{ key: 'rest', label: 'REST', color: 'var(--sb-brand)' }, { key: 'auth', label: 'Auth', color: 'var(--sb-info)' }, { key: 'storage', label: 'Storage', color: 'var(--sb-warning)' }, { key: 'realtime', label: 'Realtime', color: 'var(--sb-destructive)' }], { h: 200, x: (r) => r.day, xfmt: shortDay })}
        <div class="legend"><span><i style="background:var(--sb-brand)"></i>REST</span><span><i style="background:var(--sb-info)"></i>Auth</span><span><i style="background:var(--sb-warning)"></i>Storage</span><span><i style="background:var(--sb-destructive)"></i>Realtime</span></div>`, { k: 'rq', sub: '7 ימים' })}
      ${panel('תעבורה ושגיאות', why(s, 'traffic', 'לוג התעבורה לא זמין כרגע') || trafficChart(s), { k: 'rt', sub: '24 שעות' })}
    </div>
    ${panel('הטבלאות הגדולות', why(s, 'catalog', 'רשימת הטבלאות לא זמינה כרגע') || html`<ul class="sbx-rank">${tbl.map((t, i) => html`<li data-k="rk-${t.schema}.${t.name}" style="--i:${i}"><bdi class="ltr">${t.schema}.${t.name}</bdi>${bar((t.sizeBytes || 0) / max)}<span class="mono">${bytes(t.sizeBytes)}</span></li>`)}</ul>`, { k: 'big', cls: 'sbx-rv', sub: `גודל כולל אינדקסים · מסד הנתונים כולו ${bytes(s.dbSizeBytes)}` })}`;
}

// ---------- reads (all through the guarded POST endpoint; nothing here writes) ----------
async function preview(ctx, schema, table) {
  const key = `${schema}.${table}`; st.table = key;
  if (!st.prev[key] || st.prev[key].ok === false) { st.prev[key] = { loading: true }; ctx.rerender(); st.prev[key] = await ctx.api.post(PATH, { kind: 'preview', schema, table }); }
  ctx.rerender();
}
async function runSql(ctx) {
  const el = document.getElementById('sbx-sql'); if (el) st.sql = el.value;
  if (st.sqlBusy) return;
  st.sqlBusy = true; st.sqlRes = { loading: true }; ctx.rerender();
  const res = await ctx.api.post(PATH, { kind: 'sql', query: st.sql, ...(ctx.store?.dry ? { dryRun: true } : {}) });
  st.sqlBusy = false; st.sqlRes = res; ctx.rerender();
  if (res?.ok === false) ctx.toast(res.reason, 'bad', 'השאילתה לא רצה');
}
async function loadLog(ctx, q, again) {
  if (!again && st.logs[q] && st.logs[q].ok !== false) return;
  st.logs[q] = { loading: true }; ctx.rerender();
  st.logs[q] = await ctx.api.post(PATH, { kind: 'logs', q }); ctx.rerender();
}

// ---------- page ----------
function crumb(s, ctx) {
  const p = s.project || {}; const o = s.org || {}; const up = p.status === 'ACTIVE_HEALTHY';
  return html`<nav class="sbx-bar" aria-label="פרויקט">
    <span class="sbx-crumb">${logo('supabase', 'sm')}<bdi class="ltr sbx-org">${o.name || 'Organization'}</bdi>${o.plan ? badge(o.plan, 'default') : ''}</span><span class="sbx-slash" aria-hidden="true">/</span>
    <span class="sbx-crumb"><b>${p.name || 'Project'}</b><span class="sbx-dot ${up ? 'ok' : 'warn'}" data-tip="${p.status || ''}"></span></span><span class="sbx-slash" aria-hidden="true">/</span>
    <span class="sbx-crumb">${si('branch', 14)}<span class="ltr">main</span>${badge('Production', 'warning')}</span>
    <span class="sbx-grow"></span>
    <button class="sbx-search" data-act="palette" aria-label="חיפוש ופעולות">${icon('search', 14)}<span>חיפוש…</span><kbd>⌘K</kbd></button>
    ${ctx?.store?.dry ? badge('מצב ניסוי', 'warning') : ''}
  </nav>`;
}
function menu() {
  return html`<nav class="sbx-menu" aria-label="Supabase Studio">${TABS.map((g, gi) => html`<div class="sbx-menu-g" data-k="mg-${gi}">${g.map(([id, en, he, ic]) => html`<button class="sbx-mi ${st.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" ${st.tab === id ? raw('aria-current="page"') : ''} title="${en}">
    ${si(ic, 18)}<span class="sbx-mi-t">${he}</span><bdi class="ltr sbx-mi-en">${en}</bdi></button>`)}</div>`)}</nav>`;
}
const SECTION = { overview, tables, sql: (s, ctx) => sqlEditor(ctx), database, auth, storage, functions, advisors, logs: logsView, reports };

export default {
  id: 'supabase', title: 'Supabase', nav: 'Supabase', brand: 'supabase', needs: ['supabase'],
  sub: 'מסד הנתונים והמשתמשים של האתר, כמו ב-Supabase Studio: טבלאות, SQL לקריאה בלבד, יועצים, לוגים וגיבוי מקומי',
  links: (d) => [{ label: 'פתיחה ב-Supabase Studio', url: d.supabase?.project?.dashboardUrl }].filter((l) => l.url),
  render(d, ctx) {
    const s = d.supabase || {};
    const t = TABS.flat().find((x) => x[0] === st.tab) || TABS[0][0];
    return html`<div class="sbx" data-k="sbx">
      ${crumb(s, ctx)}
      <div class="sbx-shell">${menu()}
        <section class="sbx-main" data-k="tab-${st.tab}" aria-labelledby="sbx-h">
          <header class="sbx-ph"><h2 id="sbx-h">${t[2]}</h2><bdi class="ltr sbx-muted">${t[1]}</bdi></header>
          ${SECTION[st.tab](s, ctx)}
        </section></div></div>`;
  },
  after(root, ctx) {
    if (st.tab === 'logs' && !st.logs[st.logQ]) loadLog(ctx, st.logQ);
    if (st.tab === 'tables' && !st.table) {
      const first = arr(ctx.data?.supabase?.tables).filter((t) => t.schema === st.schema).sort((a, b) => a.name.localeCompare(b.name))[0];
      if (first) preview(ctx, first.schema, first.name);
    }
  },
  actions: {
    tab(el, ctx) { const id = el.dataset.tab; if (!TAB_IDS.includes(id)) return; st.tab = id; ctx.rerender(); document.querySelector('.sbx-main')?.scrollIntoView?.({ block: 'nearest' }); },
    schema(el, ctx) { st.schema = el.value; st.table = null; ctx.rerender(); },
    pick(el, ctx) { if (st.tab !== 'tables') st.tab = 'tables'; preview(ctx, el.dataset.s, el.dataset.t); },
    preset(el, ctx) { st.sql = PRESETS[+el.dataset.i]?.[1] || st.sql; const ta = document.getElementById('sbx-sql'); if (ta) { ta.value = st.sql; ta.focus(); } ctx.rerender(); },
    sqlIn(el) { st.sql = el.value; },
    sqlKey(el, ctx, e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runSql(ctx); } },
    runSql(el, ctx) { runSql(ctx); },
    adv(el, ctx) { st.adv = el.dataset.k2 === 'performance' ? 'performance' : 'security'; ctx.rerender(); },
    logq(el, ctx) { st.logQ = LOGQ.some(([k]) => k === el.dataset.q) ? el.dataset.q : 'edge-errors'; ctx.rerender(); loadLog(ctx, st.logQ, !!el.dataset.again); },
    usersQ(el, ctx) { st.usersQ = el.value; ctx.rerender(); },
    palette() { document.getElementById('pal-btn')?.click(); },
  },
};
