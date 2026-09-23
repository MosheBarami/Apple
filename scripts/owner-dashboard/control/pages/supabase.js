import { html, num, bytes, ago, when, arr, brand, extLink, gauge, meter, part, light, isNum, isFail, failCard } from '../ui.js';

const FREE_DB = 500 * 1024 * 1024; // free-plan database quota, used only when the server sends no limit

function statusPill(s) {
  const up = String(s || '').toUpperCase();
  const [c, l] = up.includes('HEALTHY') || up === 'ACTIVE' ? ['ok', 'פעיל ותקין'] : up.includes('PAUSE') || up.includes('INACTIVE') ? ['warn', 'מושהה'] : up.includes('RESTOR') || up.includes('COMING') || up.includes('INIT') ? ['warn', 'מתעדכן'] : up ? ['bad', s] : ['off', 'לא ידוע'];
  return html`<span class="sb-pill sb-pill-${c}"><i aria-hidden="true"></i>${l}</span>`;
}
function adv(name, a) {
  if (isFail(a)) return html`<div class="sb-adv"><b>${name}</b><span class="faint small">${a.reason}</span></div>`;
  const w = a?.warn ?? 0; const i = a?.info ?? 0;
  return html`<div class="sb-adv"><b>${name}</b>${light(w > 0 ? 'warn' : 'ok', w > 0 ? `${num(w)} אזהרות` : 'אין אזהרות')}<span class="faint small">${num(i)} הערות מידע</span></div>`;
}

export default {
  id: 'supabase', title: 'Supabase', theme: 'supabase', icon: brand('supabase'), mark: brand('supabase', 'bm-lg'), endpoint: '/api/cc/supabase',
  sub: 'מסד הנתונים: המשתמשים, הקרדיטים וכל מה שנשמר',
  render(d) {
    const p = d.project || {};
    const limit = isNum(d.dbLimitBytes) ? d.dbLimitBytes : FREE_DB;
    const tables = arr(d.tables); const maxT = Math.max(1, ...tables.map((t) => t.sizeBytes || 0));
    const b = d.backups || {}; const bl = arr(b.list);
    return html`
      ${isFail(d.project) ? failCard(d.project.reason, { level: 'warn', title: 'פרטי הפרויקט לא זמינים' }) : html`<div class="sb-head">
        <div><div class="sb-crumb">${brand('supabase', 'bm-sm')}<span>פרויקט</span></div>
          <h2 class="sb-name"><bdi class="ltr">${p.name || '—'}</bdi> ${statusPill(p.status)}</h2>
          <p class="sb-meta">אזור <bdi class="ltr">${p.region || '—'}</bdi> · Postgres <bdi class="ltr">${p.dbVersion || '—'}</bdi> · נוצר ${when(p.createdAt)} · <bdi class="mono">${p.ref || ''}</bdi></p></div>
        ${p.dashboardUrl ? extLink(p.dashboardUrl, 'פתיחה ב-Supabase ↗', 'sb-btn') : ''}
      </div>`}
      <div class="sb-grid">
        <section class="sb-card"><h3>גודל מסד הנתונים</h3>
          ${isNum(d.dbSizeBytes) ? gauge(d.dbSizeBytes / limit, { label: bytes(d.dbSizeBytes), sub: `מתוך ${bytes(limit)}`, color: 'var(--p-accent)' }) : html`<p class="empty">אין נתון.</p>`}
          <p class="explain">${isNum(d.dbLimitBytes) ? 'ביחס למכסה של המסלול.' : 'ביחס ל-500MB, המכסה של המסלול החינמי (הערכה, אם המסלול שונה המכסה גדולה יותר).'}</p></section>
        <section class="sb-card"><h3>משתמשים רשומים</h3><div class="sb-big">${num(isNum(d.authUsers) ? d.authUsers : d.authUsers?.count)}</div><p class="explain">חשבונות שנרשמו לאפליקציה.</p></section>
        <section class="sb-card"><h3>בדיקות אבטחה וביצועים</h3>
          ${part(d.advisors, (a) => html`${adv('אבטחה', a.security)}${adv('ביצועים', a.performance)}`, { empty: 'אין נתונים.' })}
          <p class="explain">הבדיקות האוטומטיות של Supabase. "אזהרה" = משהו שכדאי לתקן.</p></section>
        <section class="sb-card"><h3>גיבויים</h3>
          ${part(d.backups, () => html`
            <p>${light(b.pitr ? 'ok' : 'off', b.pitr ? 'שחזור לכל רגע (PITR) פעיל' : 'שחזור לכל רגע (PITR) כבוי')}</p>
            ${bl.length ? html`<ul class="sb-list">${bl.slice(0, 5).map((x) => html`<li><span>${when(x.at)}</span><span class="faint">${ago(x.at)}</span><span class="sb-tag ${/complete|ok|success/i.test(x.status || '') ? 'ok' : ''}">${/complete|ok|success/i.test(x.status || '') ? 'הושלם' : x.status || ''}</span></li>`)}</ul>` : html`<p class="empty">עוד אין גיבויים ברשימה.</p>`}`)}
          <div class="sb-actions">
            <button class="sb-btn sb-btn-primary" data-act="backup">גיבוי עכשיו</button>
            <button class="sb-btn" disabled aria-describedby="reset-why">איפוס נתוני בדיקה</button>
          </div>
          <p class="explain" id="reset-why">🔒 האיפוס חסום בכוונה: הלוח לא מוחק נתונים במסד האמיתי (production), כדי שלחיצה בטעות לא תמחק משתמשים אמיתיים.</p>
        </section>
      </div>
      <section class="sb-card"><h3>טבלאות <span class="sb-count">${num(tables.length)}</span></h3>
        ${part(d.tables, (ts) => html`<div class="tbl-wrap"><table class="sb-tbl"><thead><tr><th scope="col">טבלה</th><th scope="col">שורות</th><th scope="col">גודל</th></tr></thead><tbody>
          ${[...ts].sort((x, y) => (y.sizeBytes || 0) - (x.sizeBytes || 0)).map((t) => html`<tr>
            <td data-l="טבלה"><bdi class="ltr mono"><span class="faint">${t.schema ? `${t.schema}.` : ''}</span>${t.name}</bdi></td>
            <td data-l="שורות" class="mono">${num(t.rows)}</td>
            <td data-l="גודל" class="sb-size">${meter((t.sizeBytes || 0) / maxT, 'var(--p-accent)')}<span class="mono">${bytes(t.sizeBytes)}</span></td></tr>`)}
        </tbody></table></div>`, { empty: 'אין טבלאות.' })}</section>
      <section class="sb-card"><h3>אחסון קבצים</h3>
        ${part(d.storage?.buckets ?? d.storage, (bs) => html`<div class="sb-buckets">${arr(bs).map((x) => html`<div class="sb-bucket">
          <div class="sb-b-h"><span aria-hidden="true">🗂</span><bdi class="ltr mono">${x.name}</bdi><span class="sb-tag ${x.public ? 'warn' : ''}">${x.public ? 'ציבורי' : 'פרטי'}</span></div>
          <div class="faint small">${num(x.objects)} קבצים · ${bytes(x.sizeBytes)}</div></div>`)}</div>`, { empty: 'אין תיקיות אחסון (buckets).' })}</section>`;
  },
  actions: {
    backup(el, ctx) {
      ctx.act({ title: 'ליצור גיבוי עכשיו?', what: 'ייווצר עותק גיבוי חדש של כל מסד הנתונים. שום נתון לא נמחק ולא משתנה.', undo: 'לא צריך. גיבוי רק מוסיף עותק, הוא לא נוגע בנתונים.', confirmLabel: 'כן, לגבות', path: '/api/cc/supabase/action', body: { kind: 'backup' }, okMsg: 'הגיבוי התחיל.' });
    },
  },
};
