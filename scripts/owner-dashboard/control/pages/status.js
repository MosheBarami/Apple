// Status: the public status pages of every vendor the product depends on, with live incidents.
import { html, arr, ago } from '../ui.js';
import { logo, icon, PLATFORMS } from '../logos.js';
import { stat } from './kit.js';

const IND = { none: ['ok', 'הכול תקין'], minor: ['warn', 'תקלה קלה'], major: ['bad', 'תקלה משמעותית'], critical: ['bad', 'השבתה'], maintenance: ['warn', 'תחזוקה'] };
const IMP = { none: 'קלה', minor: 'קלה', major: 'משמעותית', critical: 'קריטית', maintenance: 'תחזוקה' };
const ST = { investigating: 'בבדיקה', identified: 'זוהתה', monitoring: 'במעקב', resolved: 'נפתרה', scheduled: 'מתוכננת', in_progress: 'בביצוע', partial_outage: 'השבתה חלקית', major_outage: 'השבתה', degraded_performance: 'איטיות' };

export default {
  id: 'status', title: 'מצב הספקים', nav: 'מצב הספקים', glyph: 'status', needs: ['status'],
  sub: 'דפי הסטטוס הרשמיים של כל השירותים שהאתר נשען עליהם. אם משהו איטי אצלנו, בודקים כאן קודם',
  links: () => [],
  render(d) {
    const v = arr(d.status?.vendors);
    const bad = v.filter((x) => x.indicator && x.indicator !== 'none');
    const inc = v.reduce((a, x) => a + arr(x.incidents).length, 0);
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'st-n', label: 'ספקים במעקב', value: v.length })}
        ${stat({ key: 'st-ok', label: 'תקינים', value: v.length - bad.length, tone: 'good' })}
        ${stat({ key: 'st-bad', label: 'עם תקלה עכשיו', value: bad.length, tone: bad.length ? 'warn' : 'good', sub: bad.map((x) => PLATFORMS[x.id]?.name || x.id).join(', ') })}
        ${stat({ key: 'st-inc', label: 'אירועים אחרונים', value: inc })}
      </section>
      <div class="pgrid">${v.map((x) => { const [c, l] = IND[x.indicator] || ['off', x.description || 'לא ידוע']; return html`<article class="pc ${c === 'ok' ? '' : 'is-' + c}">
        <div class="pc-h">${logo(x.id, 'md')}<div><b>${PLATFORMS[x.id]?.name || x.id}</b><small>${PLATFORMS[x.id]?.he || ''}</small></div><span class="dot">${html`<span class="light light-${c}"><i></i></span>`}</span></div>
        <p class="pc-l">${l}${x.description && c !== 'ok' ? html` · <span dir="ltr">${x.description}</span>` : ''}</p>
        ${arr(x.incidents).slice(0, 3).map((i) => html`<a class="pc-l small st-i" href="${i.url}" target="_blank" rel="noopener noreferrer">${icon('alert', 12)}<span><span dir="auto">${i.name}</span> <span class="faint">${[IMP[i.impact], ST[i.status] || i.status].filter(Boolean).join(' · ')} · ${ago(i.updatedAt)}</span></span></a>`)}
        ${arr(x.degraded).length ? html`<p class="pc-l small faint">${arr(x.degraded).length} רכיבים מושפעים: <span dir="ltr">${arr(x.degraded).slice(0, 3).map((g) => g.name).join(', ')}${arr(x.degraded).length > 3 ? '…' : ''}</span></p>` : ''}
        <div class="pc-v"><a class="st-l" href="${x.url}" target="_blank" rel="noopener noreferrer">דף הסטטוס ${icon('ext', 12)}</a></div></article>`; })}</div>`;
  },
};
