import { html, num, ago, arr, brand, extLink, part } from '../ui.js';

const LEVEL = { fatal: ['קריטי', 'lv-fatal'], error: ['שגיאה', 'lv-error'], warning: ['אזהרה', 'lv-warning'], info: ['מידע', 'lv-info'], debug: ['דיבאג', 'lv-debug'] };

export default {
  id: 'sentry', title: 'Sentry', theme: 'sentry', icon: brand('sentry'), mark: brand('sentry', 'bm-lg'), endpoint: '/api/cc/sentry',
  sub: 'שגיאות שקרו למשתמשים אמיתיים',
  render(d) {
    if (d.configured === false) {
      return html`<section class="st-off">
        <div class="st-off-art" aria-hidden="true">${brand('sentry', 'bm-xl')}</div>
        <div><h2>נדלק ברגע שמוסיפים מפתח</h2>
          <p>Sentry עוד לא מחובר ללוח. אחרי שמוסיפים את המפתח, יופיעו כאן כל השגיאות שהמשתמשים נתקלים בהן: מה קרה, כמה פעמים ולכמה אנשים.</p>
          ${d.how ? html`<div class="st-how"><b>איך מחברים:</b><pre dir="auto">${d.how}</pre></div>` : ''}</div>
      </section>`;
    }
    const issues = arr(d.issues);
    return html`<section class="st-panel">
      <header class="st-panel-h"><h2>בעיות פתוחות <span class="st-count">${num(issues.length)}</span></h2>
        <span class="faint small">ממוינות לפי מתי נראו לאחרונה</span></header>
      ${part(d.issues, (is) => html`<ul class="st-issues">${[...is].sort((a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)).map((i) => { const [lv, cls] = LEVEL[i.level] || [i.level || '—', 'lv-debug']; return html`<li class="st-issue ${cls}">
        <div class="st-i-m">
          <div class="st-i-t">${extLink(i.permalink, i.title, 'st-link')}</div>
          <div class="st-i-s"><span class="st-lv">${lv}</span>${i.culprit ? html`<bdi class="ltr mono">${i.culprit}</bdi>` : ''}${i.project ? html`<span class="st-proj">${i.project}</span>` : ''}</div>
        </div>
        <dl class="st-i-n"><div><dt>אירועים</dt><dd>${num(+i.count || 0)}</dd></div><div><dt>משתמשים</dt><dd>${num(+i.userCount || 0)}</dd></div><div><dt>נראה לאחרונה</dt><dd>${ago(i.lastSeen)}</dd></div></dl>
        <button class="st-btn" data-act="resolve" data-id="${i.id}">✓ סמן כנפתר</button>
      </li>`; })}</ul>`, { empty: 'אין שגיאות פתוחות. הכל שקט.' })}
    </section>`;
  },
  actions: {
    resolve(el, ctx) {
      const id = el.dataset.id; const i = arr(ctx.data.issues).find((x) => String(x.id) === id) || {};
      ctx.act({ title: 'לסמן את הבעיה כנפתרה?', what: `הבעיה "${i.title || id}" תסומן ב-Sentry כנפתרה ותרד מהרשימה.`, undo: 'כן. אפשר לפתוח אותה מחדש ב-Sentry, ואם השגיאה תחזור היא תיפתח שוב לבד.', confirmLabel: '✓ כן, נפתר', path: '/api/cc/sentry/action', body: { kind: 'resolve', id }, okMsg: 'סומן כנפתר.' });
    },
  },
};
