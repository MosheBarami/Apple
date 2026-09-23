// Sentry: the open issues with their 24-hour trend, and per-issue one-click triage that is always
// reversible (bookmark, mark seen, priority, silence until it gets worse, resolve / reopen).
import { html, num, ago, arr } from '../ui.js';
import { icon } from '../logos.js';
import { spark } from '../fx.js';
import { sx } from '../actions.js';
import { stat, actBtn } from './kit.js';

const st = { f: '' };
const LEVEL = { fatal: ['bad', 'קריטית'], error: ['bad', 'שגיאה'], warning: ['warn', 'אזהרה'], info: ['mid', 'מידע'] };
const PRI = { high: ['bad', 'עדיפות גבוהה'], medium: ['warn', 'בינונית'], low: ['off', 'נמוכה'] };
const SUB = { regressed: 'חזרה אחרי תיקון', escalating: 'מחמירה', new: 'חדשה', ongoing: 'נמשכת' };

export default {
  id: 'sentry', title: 'Sentry', nav: 'Sentry', brand: 'sentry', needs: ['sentry'],
  sub: 'התקלות שהאתר והשרת דיווחו עליהן, מהחמורה ביותר, עם סימון ומיון בלחיצה',
  links: (d) => [{ label: 'כל התקלות ב-Sentry', url: d.sentry?.org && `https://${d.sentry.org}.sentry.io/issues/` }],
  render(d) {
    const s = d.sentry || {}; const iss = arr(s.issues);
    const total = iss.reduce((a, i) => a + (+i.count || 0), 0);
    const trend = iss.reduce((acc, i) => arr(i.trend).map((v, k) => (acc[k] || 0) + v), []);
    const shown = iss.filter((i) => !st.f || (st.f === 'high' ? i.priority === 'high' : st.f === 'new' ? !i.seen : i.bookmarked));
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'se-open', label: 'תקלות פתוחות', value: iss.length, tone: iss.length ? 'warn' : 'good', series: trend, sparkCls: 'bad', sub: 'אירועים לפי שעה, 24 שעות' })}
        ${stat({ key: 'se-ev', label: 'פעמים שקרו בסך הכול', value: total, sub: `${num(iss.filter((i) => i.unhandled).length)} לא נתפסו בקוד` })}
        ${stat({ key: 'se-hi', label: 'בעדיפות גבוהה', value: iss.filter((i) => i.priority === 'high').length, tone: iss.some((i) => i.priority === 'high') ? 'bad' : 'good' })}
        ${stat({ key: 'se-new', label: 'עוד לא נקראו', value: iss.filter((i) => !i.seen).length, sub: `${num(arr(s.projects).length)} פרויקטים: ${arr(s.projects).map((p) => p.slug).join(', ')}` })}
      </section>
      <section class="card flush" aria-labelledby="h-iss"><h2 class="card-h" id="h-iss">${icon('alert', 15)}תקלות<span class="grow"></span>
        ${[['', 'הכול'], ['high', 'גבוהה'], ['new', 'לא נקראו'], ['star', 'מועדפים']].map(([k, l]) => html`<button class="chip chip-btn ${st.f === k ? 'on' : ''}" data-act="f" data-k="${k}" aria-pressed="${st.f === k}">${l}</button>`)}</h2>
        <ul class="list">${shown.length ? shown.map((i) => {
          const [lc, ll] = LEVEL[i.level] || ['off', i.level]; const [pc, pl] = PRI[i.priority] || ['off', i.priority || '—'];
          return html`<li class="li"><div class="li-m">
            <a class="li-t" dir="ltr" style="text-align:right" href="${i.url}" target="_blank" rel="noopener noreferrer" title="${i.title}">${i.title}</a>
            <span class="li-s"><span class="chip chip-sm chip-${lc}">${ll}</span><span class="chip chip-sm chip-${pc}">${pl}</span>${SUB[i.substatus] ? html`<span>${SUB[i.substatus]}</span>` : ''}
              <bdi class="mono">${i.shortId}</bdi><bdi class="mono">${i.culprit || ''}</bdi><span>${num(i.count)} פעמים</span><span>נראתה ${ago(i.lastSeen)}</span>${i.bookmarked ? html`<span class="chip chip-sm chip-b">★ מועדף</span>` : ''}</span></div>
            ${spark(i.trend, { w: 96, h: 26, cls: 'bad', label: `${i.shortId}: אירועים לפי שעה` })}
            <div class="li-a">${actBtn(sx.bookmark(i), i.bookmarked ? 'הסרה ממועדפים' : 'מועדף', { ic: 'check', cls: 'btn-sm btn-ghost' })}
              ${!i.seen ? actBtn(sx.seen(i), 'נקרא', { ic: 'check', cls: 'btn-sm btn-ghost' }) : ''}
              ${i.priority !== 'high' ? actBtn(sx.priority(i, 'high'), 'עדיפות גבוהה', { ic: 'alert', cls: 'btn-sm btn-ghost' }) : actBtn(sx.priority(i, 'medium'), 'להוריד עדיפות', { ic: 'arrow', cls: 'btn-sm btn-ghost' })}
              ${actBtn(sx.ignore(i), 'השתקה', { ic: 'pause', cls: 'btn-sm' })}
              ${actBtn(sx.resolve(i), 'תוקן', { ic: 'check', cls: 'btn-sm btn-ok' })}</div></li>`;
        }) : html`<li class="empty good" style="padding:14px 20px">אין תקלות בסינון הזה.</li>`}</ul></section>
      <p class="explain">"השתקה" מסתירה תקלה עד שהיא מתחילה לקרות יותר. "תוקן" אומר ל-Sentry שהבעיה נפתרה, ואם היא תחזור היא תיפתח לבד. הכול הפיך מתוך Sentry.</p>`;
  },
  actions: { f(el, ctx) { st.f = el.dataset.k; ctx.rerender(); } },
};
