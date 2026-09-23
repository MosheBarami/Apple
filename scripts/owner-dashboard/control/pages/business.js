// לקוחות ועסק: the owner console. Who signed up and on which plan, what the worker grants them, the
// sign-up funnel, the top errors, the flags and kill switches (read-only here), the worker's audit log
// and the open alerts. From /api/cc/business; emails arrive masked. Revenue and subscriptions have no
// readable source yet, and the page says so instead of showing a number.
import { html, num, arr, isNum, failCard, ltr, ago, shortDay, bars, pct } from '../ui.js';
import { stat, sec, note, extBtn } from './kit.js';

const TABS = [['customers', 'לקוחות ותוכניות'], ['funnel', 'משפך הרשמה'], ['errors', 'תקלות והתראות'], ['flags', 'מתגים והגדרות'], ['audit', 'יומן ביקורת']];
const st = { tab: 'customers', hideTest: true };
const PLAN = { free: 'חינם', pro: 'Pro', builder: 'Builder', studio: 'Studio', enterprise: 'Enterprise' };
const plan = (k) => PLAN[k] || k || '—';
const tone = { bad: 'bad', warn: 'warn', ok: 'ok', info: 'info' };

function noSource(list) {
  return arr(list).length ? html`<div class="ow-nos">${arr(list).map((x) => html`<div class="ow-no" data-k="ns-${x.k}"><span class="chip chip-sm chip-off">אין מקור נתונים</span><b>${x.name}</b><p dir="auto">${x.why}</p>
    ${x.missing ? html`<p>חסר: <code dir="ltr">${x.missing}</code></p>` : ''}</div>`)}</div>` : '';
}

function customers(b) {
  const u = b.users; if (!u) return note('bad', 'לא הצלחנו לקרוא את המשתמשים', b.errorsRead?.supabase || 'אין תשובה מ-Supabase');
  const list = arr(u.list).filter((x) => !st.hideTest || !x.test);
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'b-u', label: 'משתמשים רשומים', value: u.total, sub: `${num(u.test)} מהם חשבונות בדיקה`, series: arr(u.signups).map((x) => x.n) })}
      ${stat({ key: 'b-a', label: 'התחברו בשבוע האחרון', value: u.active7 })}
      ${stat({ key: 'b-p', label: 'לפי תוכנית', text: arr(u.plans)[0] ? `${num(u.plans[0].n)} ${plan(u.plans[0].k)}` : '—', sub: arr(u.plans).slice(1).map((p) => `${num(p.n)} ${plan(p.k)}`).join(' · ') })}
      ${stat({ key: 'b-c', label: 'Clerk', value: b.clerk?.total, sub: b.clerk ? `מופע ${b.clerk.env === 'development' ? 'פיתוח' : b.clerk.env}: האתר עוד לא מחבר משתמשים דרכו` : 'לא נקרא' })}</div>
    <div class="card" data-k="b-sign"><h2 class="card-h">הרשמות ב-30 הימים האחרונים</h2>${bars(u.signups, [{ key: 'n', label: 'נרשמו', color: 'var(--accent)' }], { x: (r) => r.day, xfmt: shortDay, h: 160 })}</div>
    ${arr(b.workerPlans).length ? html`<div class="card" style="padding:0" data-k="b-wp"><h2 class="card-h" style="padding:16px 20px 0">מה העובד נותן למשתמשים הפעילים</h2>
      <div class="tbl-wrap"><table class="ow-t"><thead><tr><th>משתמש</th><th>תוכנית בעובד</th><th>מנוי</th><th class="n">קרדיטים היום</th><th class="n">קרדיטים החודש</th><th>שינוי תוכנית אחרון</th></tr></thead><tbody>
      ${arr(b.workerPlans).map((w) => html`<tr data-k="wp-${w.k}"><td>${ltr(w.email || w.k)}</td>${w.error ? html`<td colspan="5" class="dim">${w.error}</td>` : html`<td>${plan(w.plan)}</td>
        <td>${w.subscription ? w.subscription.status : html`<span class="dim">אין (${w.customer ? 'יש לקוח ב-Stripe' : 'אין לקוח ב-Stripe'})</span>`}</td>
        <td class="n">${num(w.creditsUsedToday)} / ${num(w.creditsDaily)}</td><td class="n">${num(w.creditsUsedThisMonth)} / ${num(w.creditsMonthly)}</td>
        <td>${w.lastPlanChange ? html`${plan(w.lastPlanChange.from)} ← ${plan(w.lastPlanChange.to)} · ${ago(w.lastPlanChange.at)}` : '—'}</td>`}</tr>`)}
      </tbody></table></div><p class="ow-count" style="padding:8px 20px 14px">משתמשים שהריצו בנייה ב-30 הימים האחרונים (עד 5), מ-/api/admin/account.</p></div>` : ''}
    <div class="card" style="padding:0" data-k="b-users"><div class="row" style="justify-content:space-between;padding:16px 20px 0"><h2 class="card-h" style="margin:0">המשתמשים</h2>
      <label class="sel"><input type="checkbox" data-change="hideTest" ${st.hideTest ? 'checked' : ''}> להסתיר חשבונות בדיקה</label></div>
      <div class="tbl-wrap"><table class="ow-t"><thead><tr><th>מייל</th><th>תוכנית</th><th class="n">פרויקטים</th><th>נרשם</th><th>התחבר לאחרונה</th><th></th></tr></thead><tbody>
      ${list.map((x) => html`<tr data-k="u-${x.k}"><td>${ltr(x.email || x.k)}</td><td>${plan(x.plan)}${x.admin ? html` <span class="chip chip-sm">מנהל</span>` : ''}</td><td class="n">${num(x.projects)}</td>
        <td>${ago(x.created)}</td><td>${ago(x.lastSignIn)}</td><td>${x.test ? html`<span class="chip chip-sm chip-off">בדיקה</span>` : ''}${x.confirmed ? '' : html`<span class="chip chip-sm chip-warn">לא אישר מייל</span>`}</td></tr>`)}
      </tbody></table></div>${list.length ? '' : html`<p class="empty" style="padding:14px 20px">כל המשתמשים הם חשבונות בדיקה. אפשר לבטל את ההסתרה למעלה.</p>`}
      <p class="ow-count" style="padding:8px 20px 14px">מקור: ${u.source}. המיילים מוצגים חלקית.</p></div>
    ${sec('הכנסות ומנויים', 'Stripe (מצב test)')}
    <div class="g g2">${stat({ key: 'b-bm', label: 'מפתח Stripe בעובד', text: b.billing?.keyMode ? `מצב ${b.billing.keyMode}` : 'אין', sub: b.billing?.prices ? `מחירים מוגדרים: ${Object.entries(b.billing.prices).filter(([, v]) => v).map(([k]) => plan(k)).join(', ') || 'אין'}` : '', tone: b.billing?.keyMode === 'live' ? '' : 'warn' })}
      ${stat({ key: 'b-wh', label: 'Webhook של Stripe', text: b.billing?.webhook ? 'מוגדר' : 'לא מוגדר' })}</div>
    ${noSource(arr(b.noSource).filter((x) => x.k === 'revenue'))}</div>`;
}

function funnel(b) {
  const f = arr(b.funnel); if (!f.length) return note('bad', 'אין נתונים למשפך', b.errorsRead?.supabase || '');
  const top = f[0].n || 1;
  return html`<div class="ow-panel"><div class="card" data-k="fun"><h2 class="card-h">מהרשמה ועד תשלום</h2><div class="ow-funnel">
    ${f.map((s, i) => html`<div class="ow-fs" data-k="fs-${s.k}"><span><b>${s.label}</b></span><div class="ow-fbar"><i style="width:${Math.max(s.n ? 1.5 : 0, (100 * s.n) / top).toFixed(1)}%;animation-delay:${i * 90}ms"></i></div>
      <span class="ow-count"><b style="color:var(--ink);font-size:15px">${num(s.n)}</b> ${i ? pct(s.n / top) : ''}</span><small>${s.source}</small></div>`)}</div></div>
    ${isNum(b.paired) ? note('info', `חיבורי Studio: ${num(b.paired)}`, 'ספירת אירועי החיבור של התוסף מהמונים של העובד, לא מספר משתמשים שונים, ולכן היא לא שלב במשפך.') : ''}
    ${note('info', 'מה חשוב לדעת על המספרים', 'כמעט כל החשבונות הם חשבונות בדיקה (עומס ו-e2e), והמשתמש בתוכנית שאינה חינם הוא הבעלים. שלב הבנייה נספר רק מיומן העובד, שנשמר לחלון קצר.')}
    ${noSource(arr(b.noSource).filter((x) => x.k === 'funnel-visits'))}</div>`;
}

function errors(b) {
  const e = b.errors || {};
  return html`<div class="ow-panel">
    <div class="card" style="padding:0" data-k="al"><h2 class="card-h" style="padding:16px 20px 0">התראות פתוחות</h2>
      ${b.alerts ? html`<ul class="list">${arr(b.alerts).map((a) => html`<li class="li" data-k="al-${a.k}"><span class="ow-sev ${tone[a.sev] || ''}" aria-label="${a.sev}"></span><div style="min-width:0"><b dir="auto">${a.title}</b><p class="dim small" dir="auto">${a.why}</p></div><span class="chip chip-sm" style="margin-inline-start:auto">${a.platform}</span></li>`)}</ul>
        ${arr(b.alerts).length ? '' : html`<p class="empty good" style="padding:14px 20px">אין התראות פתוחות.</p>`}` : html`<p class="empty" style="padding:14px 20px">לא הצלחנו לקרוא את ההתראות.</p>`}</div>
    <div class="card" style="padding:0" data-k="se"><h2 class="card-h" style="padding:16px 20px 0">התקלות הגדולות ב-Sentry</h2>
      ${e.sentry ? html`<div class="tbl-wrap"><table class="ow-t"><thead><tr><th>תקלה</th><th>איפה</th><th class="n">אירועים</th><th>לאחרונה</th><th></th></tr></thead><tbody>
        ${arr(e.sentry).map((i) => html`<tr data-k="se-${i.k}"><td dir="auto"><b>${i.title}</b><br><small class="dim">${i.project}</small></td><td>${ltr(i.culprit || '—', 'mono')}</td><td class="n">${num(i.count)}</td><td>${ago(i.lastSeen)}</td>
          <td>${extBtn(i.url, 'פתיחה', 'btn-sm btn-ghost')}</td></tr>`)}</tbody></table></div>` : html`<p class="empty" style="padding:14px 20px">Sentry לא נקרא.</p>`}
      ${arr(e.sentry).some((i) => /billing-reconcile/.test(i.culprit || '')) ? html`<div style="padding:0 20px 16px">${note('warn', 'התקלה הגדולה היא רעש', 'הנתיב /api/admin/billing-reconcile עונה 503 כל עוד החיובים לא מוגדרים, וכל קריאה אליו נרשמת כתקלה. הלוח הזה לא קורא לו, וגם אף סקריפט בתיקיית scripts לא קורא לו.')}</div>` : ''}</div>
    <div class="g g2">
      <div class="card" data-k="ek"><h2 class="card-h">שגיאות בעובד לפי סוג</h2>${arr(e.byKind).length ? html`<table class="ow-t"><tbody>${arr(e.byKind).map((k) => html`<tr><td>${ltr(k.key)}</td><td class="n">${num(k.count)}</td></tr>`)}</tbody></table>` : html`<p class="empty good">אין שגיאות בחלון.</p>`}</div>
      <div class="card" data-k="es"><h2 class="card-h">לפי נתיב</h2>${arr(e.byScope).length ? html`<table class="ow-t"><tbody>${arr(e.byScope).map((k) => html`<tr><td>${ltr(k.key, 'mono')}</td><td class="n">${num(k.count)}</td></tr>`)}</tbody></table>` : html`<p class="empty good">אין שגיאות בחלון.</p>`}</div>
    </div></div>`;
}

function flags(b) {
  return html`<div class="ow-panel">
    ${note('info', 'לקריאה בלבד', 'הדף הזה מראה את המצב. שינוי של מתג נעשה בדף Apple, עם אישור ותוכנית יבשה לפני כל שינוי.')}
    <div class="ow-flags">${arr(b.flags).map((f) => html`<div class="ow-flag is-${f.tone}" data-k="fl-${f.k}"><div class="row" style="justify-content:space-between"><b>${f.label}</b><span class="ow-sev ${tone[f.tone] || ''}"></span></div><p dir="auto">${f.text}</p><small>${f.source}</small></div>`)}</div>
    <div class="g g2">
      <div class="card" style="padding:0" data-k="rt"><h2 class="card-h" style="padding:16px 20px 0">המודלים שהעובד יכול לנתב אליהם</h2><div class="tbl-wrap"><table class="ow-t"><tbody>
        ${arr(b.routing).map((r) => html`<tr data-k="rt-${r.k}"><td>${r.label || ltr(r.k)}<br><small class="dim">${ltr(r.k, 'mono')}</small></td><td>${r.provider}</td><td>${r.available ? html`<span class="chip chip-sm chip-ok">זמין</span>` : html`<span class="chip chip-sm chip-off">לא זמין</span>`}</td></tr>`)}
        </tbody></table></div></div>
      <div class="card" data-k="vars"><h2 class="card-h">משתני הפריסה של העובד</h2><p class="ow-count">מ-apps/worker/wrangler.jsonc (לא סודות)</p>
        <table class="ow-t"><tbody>${arr(b.vars).map((v) => html`<tr><td>${ltr(v.k, 'mono')}</td><td>${ltr(v.v, 'mono')}</td></tr>`)}</tbody></table></div>
    </div></div>`;
}

function audit(b) {
  const a = b.audit || {};
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'au-n', label: 'פעולות ביומן (7 ימים, עד 500)', value: a.total })}${stat({ key: 'au-r', label: 'נדחו', value: a.refused, tone: a.refused ? 'warn' : '' })}</div>
    <div class="g g12">
      <div class="card" data-k="au-by"><h2 class="card-h">הפעולות הנפוצות</h2><table class="ow-t"><tbody>${arr(a.byAction).map((x) => html`<tr><td>${ltr(x.k, 'mono')}</td><td class="n">${num(x.n)}</td></tr>`)}</tbody></table></div>
      <div class="card" style="padding:0" data-k="au-rec"><h2 class="card-h" style="padding:16px 20px 0">האחרונות</h2><div class="tbl-wrap"><table class="ow-t"><thead><tr><th>מתי</th><th>פעולה</th><th>מי</th><th></th></tr></thead><tbody>
        ${arr(a.recent).map((x) => html`<tr data-k="au-${x.k}"><td>${ago(x.at)}</td><td>${ltr(x.action, 'mono')}${x.subject ? html`<br><small class="dim">${ltr(x.subject, 'mono')}</small>` : ''}</td><td>${x.actor || '—'}</td><td>${x.allowed ? '' : html`<span class="chip chip-sm chip-bad">נדחתה</span>`}</td></tr>`)}
        </tbody></table></div></div>
    </div>
    ${note('info', 'למה היומן מלא בקריאות GET', 'כל קריאה לנתיב אדמין נרשמת, כולל הקריאות של לוחות הבקרה עצמם. לכן הדף הזה שומר את התשובה 5 דקות לפני שהוא שואל שוב.')}
    ${noSource(arr(b.noSource).filter((x) => x.k === 'dash-audit'))}</div>`;
}

const BODY = { customers, funnel, errors, flags, audit };
export default {
  id: 'business', title: 'לקוחות ועסק', nav: 'לקוחות ועסק', glyph: 'briefcase', needs: ['business'],
  sub: 'מי משתמש במוצר ובאיזו תוכנית, איפה אנשים נעצרים בדרך, מה נשבר, ומה מצב המתגים. לקריאה בלבד',
  render(d) {
    const b = d?.business || {};
    if (b.ok === false) return failCard(b.reason, { retry: true, title: 'לא הצלחנו לקרוא את נתוני העסק' });
    const errs = Object.entries(b.errorsRead || {});
    return html`${errs.length ? note('warn', 'חלק מהמקורות לא נקראו', errs.map(([k, v]) => `${k}: ${v}`).join(' · ')) : ''}
      <div class="ow-tabs" role="tablist" aria-label="חלקי הדף">${TABS.map(([k, l]) => html`<button class="ow-tab ${st.tab === k ? 'on' : ''}" role="tab" id="biz-t-${k}"
        aria-selected="${st.tab === k}" aria-controls="biz-panel" tabindex="${st.tab === k ? '0' : '-1'}" data-act="tab" data-key="tabkey" data-t="${k}">${l}</button>`)}</div>
      <div id="biz-panel" role="tabpanel" aria-labelledby="biz-t-${st.tab}" data-k="biz-${st.tab}">${BODY[st.tab](b)}</div>`;
  },
  actions: {
    tab(el, ctx) { st.tab = el.dataset.t; ctx.rerender(); },
    tabkey(el, ctx, e) {
      const i = TABS.findIndex(([k]) => k === el.dataset.t); const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL: left is next
      if (!step) return; e.preventDefault(); st.tab = TABS[(i + step + TABS.length) % TABS.length][0]; ctx.rerender(); document.getElementById(`biz-t-${st.tab}`)?.focus();
    },
    hideTest(el, ctx) { st.hideTest = el.checked; ctx.rerender(); },
  },
};
