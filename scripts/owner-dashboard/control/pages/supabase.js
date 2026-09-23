// Supabase: project health, database size and tables, the advisors (security settings are only
// linked, never changed from here), storage, backups, and a read-only local backup.
import { html, num, bytes, ago, arr, meter, gauge } from '../ui.js';
import { icon } from '../logos.js';
import { sb } from '../actions.js';
import { stat, actBtn, extBtn, note } from './kit.js';

const FREE_DB = 500 * 1024 * 1024;

export default {
  id: 'supabase', title: 'Supabase', nav: 'Supabase', brand: 'supabase', needs: ['supabase'],
  sub: 'מסד הנתונים של האתר: המשתמשים, הפרויקטים, הגודל, והמלצות הבודק האוטומטי',
  links: (d) => [{ label: 'לוח הבקרה של Supabase', url: d.supabase?.project?.dashboardUrl }],
  render(d) {
    const s = d.supabase || {}; const p = s.project || {}; const adv = s.advisors || {}; const tables = arr(s.tables);
    const maxT = Math.max(1, ...tables.map((t) => t.sizeBytes || 0));
    const url = p.dashboardUrl;
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'sb-users', label: 'משתמשים רשומים', value: s.authUsers, sub: 'חשבונות שנרשמו לאתר' })}
        ${stat({ key: 'sb-size', label: 'גודל המסד', value: s.dbSizeBytes, text: bytes(s.dbSizeBytes), sub: `${num((s.dbSizeBytes / FREE_DB) * 100, 1)}% ממגבלת 500MB של התוכנית החינמית` })}
        ${stat({ key: 'sb-sec', label: 'אזהרות אבטחה', value: adv.security?.warn, tone: adv.security?.warn ? 'warn' : 'good', sub: `${num(adv.security?.error)} חמורות · ${num(adv.security?.info)} לידיעה` })}
        ${stat({ key: 'sb-perf', label: 'המלצות ביצועים', value: adv.performance?.warn, sub: `${num(adv.performance?.info)} נוספות לידיעה` })}
      </section>
      ${adv.security?.warn ? note('warn', `${num(adv.security.warn)} אזהרות אבטחה מחכות לבדיקה`, 'הגדרות אבטחה, הרשאות ו-RLS לא משתנות מלוח הבקרה הזה בכוונה: טעות שם יכולה לחשוף נתונים. פותחים את הבודק ב-Supabase ומטפלים שם.',
        html`<p style="margin-top:8px">${extBtn(url && `${url}/advisors/security`, 'לבודק האבטחה')} ${extBtn(url && `${url}/advisors/performance`, 'לבודק הביצועים', 'btn-sm btn-ghost')}</p>`) : ''}
      <div class="g g21">
        <section class="card flush" aria-labelledby="h-tb"><h2 class="card-h" id="h-tb">טבלאות<small>${num(tables.length)} ב-public, מהגדולה לקטנה</small></h2>
          <table><thead><tr><th>טבלה</th><th>שורות</th><th>גודל</th><th></th></tr></thead><tbody>
            ${tables.map((t) => html`<tr><td data-l="טבלה"><bdi class="mono">${t.name}</bdi></td><td data-l="שורות" class="mono">${num(t.rows)}</td><td data-l="גודל" class="mono">${bytes(t.sizeBytes)}</td><td>${meter(t.sizeBytes / maxT, 'var(--b-use)')}</td></tr>`)}
          </tbody></table></section>
        <div class="col">
          <section class="card" aria-labelledby="h-pj"><h2 id="h-pj">הפרויקט</h2>
            ${gauge(s.dbSizeBytes / FREE_DB, { label: bytes(s.dbSizeBytes), sub: 'מתוך 500MB', color: 'var(--b-use)' })}
            <dl class="kv kv-row">
              <div><dt>מצב</dt><dd>${p.status === 'ACTIVE_HEALTHY' ? 'בריא' : p.status || '—'}</dd></div>
              <div><dt>אזור</dt><dd><bdi class="mono">${p.region || '—'}</bdi></dd></div>
              <div><dt>Postgres</dt><dd><bdi class="mono">${p.dbVersion || '—'}</bdi></dd></div>
              <div><dt>נוצר</dt><dd>${ago(p.createdAt)}</dd></div>
            </dl></section>
          <section class="card" aria-labelledby="h-bk"><h2 id="h-bk">${icon('check', 15)}גיבויים</h2>
            <p class="explain" style="margin-top:0">${s.backups?.pitr ? 'שחזור לכל נקודת זמן (PITR) פעיל.' : 'אין שחזור לנקודת זמן (PITR). בתוכנית החינמית Supabase לא שומרת גיבויים יומיים שאפשר להוריד.'} ${arr(s.backups?.list).length ? `${num(arr(s.backups.list).length)} גיבויים שמורים.` : ''}</p>
            <p style="margin-top:12px">${actBtn(sb.backup(), 'לגבות עכשיו למחשב (קריאה בלבד)', { ic: 'check', cls: 'btn-sm btn-brand' })}</p>
            <p class="explain">כל הטבלאות נקראות ונשמרות כקבצי JSON בתיקייה ‎.backups שבמחשב. שום דבר במסד לא משתנה.</p></section>
          <section class="card" aria-labelledby="h-st"><h2 id="h-st">אחסון קבצים</h2>
            ${arr(s.storage?.buckets).length ? html`<div class="row">${arr(s.storage.buckets).map((b) => html`<span class="chip">${b.name || b.id}${b.public ? ' · ציבורי' : ''}</span>`)}</div>` : html`<p class="empty">אין דליים (buckets). הקבצים של האתר שמורים ב-Cloudflare R2.</p>`}</section>
        </div>
      </div>`;
  },
};
