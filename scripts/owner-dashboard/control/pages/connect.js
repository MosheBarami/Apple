// Connect: every other platform the product can plug into. Missing keys show a card that names the
// exact .env key and how to get it; connected ones show their data (PostHog flags are switches).
import { html, num, arr, isNum } from '../ui.js';
import { logo, PLATFORMS } from '../logos.js';
import { ph } from '../actions.js';
import { stat, swBtn, extBtn, notConnected } from './kit.js';

// Generic view of a connected platform's data: scalars as key/value, arrays as a short list.
function dataView(data = {}) {
  const scal = Object.entries(data).filter(([, v]) => v == null || typeof v !== 'object');
  const lists = Object.entries(data).filter(([k, v]) => Array.isArray(v) && k !== 'flags');
  return html`${scal.length ? html`<dl class="kv kv-row">${scal.map(([k, v]) => html`<div><dt>${k}</dt><dd>${isNum(v) ? num(v) : v == null ? '—' : String(v)}</dd></div>`)}</dl>` : ''}
    ${lists.map(([k, v]) => html`<p class="stat-s" style="margin-top:10px">${k}: ${num(v.length)}</p><ul class="list">${v.slice(0, 5).map((x) => html`<li class="li" style="padding:6px 0"><span class="li-t mono" dir="auto">${x.name || x.id || x.key || JSON.stringify(x).slice(0, 60)}</span><span class="chip chip-sm">${x.status || x.state || ''}</span></li>`)}</ul>`)}`;
}

export default {
  id: 'connect', title: 'חיבורים', nav: 'חיבורים', glyph: 'connect', needs: ['connectors'],
  sub: 'שירותים נוספים שאפשר לחבר ללוח הבקרה. כל חיבור דורש רק מפתח אחד בקובץ ‎.env',
  links: () => [],
  render(d) {
    const list = arr(d.connectors?.list).filter((c) => c.id !== 'langflow');
    const on = list.filter((c) => c.configured);
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'cn-all', label: 'שירותים', value: list.length })}
        ${stat({ key: 'cn-on', label: 'מחוברים', value: on.length, tone: on.length ? 'good' : '' })}
        ${stat({ key: 'cn-off', label: 'מחכים למפתח', value: list.length - on.length })}
        ${stat({ key: 'cn-keys', label: 'מפתחות חסרים', value: list.reduce((a, c) => a + arr(c.need).length, 0), sub: 'שמות בלבד, בלי ערכים' })}
      </section>
      <div class="g g3">${list.map((c) => (!c.configured ? notConnected(c.id, arr(c.need), c) : html`<article class="card nc">
        <div class="nc-h">${logo(c.id, 'md')}<div><b>${c.name}</b><small>${c.blurb || PLATFORMS[c.id]?.he || ''}</small></div><span class="chip chip-ok" style="margin-inline-start:auto">מחובר</span></div>
        ${c.error ? html`<p class="nc-how" style="color:var(--bad)">${c.error}</p>` : dataView(c.data)}
        ${arr(c.data?.flags).map((f) => html`<div class="sw-row" style="padding:10px 0"><div class="li-m"><b class="mono">${f.key}</b><span>${f.name}${f.rollout_percentage != null ? ` · ${num(f.rollout_percentage)}% מהמשתמשים` : ''}</span></div>${swBtn(ph.flag(f), f.active, f.key)}</div>`)}
        ${c.docs ? html`<p>${extBtn(c.docs, 'התיעוד', 'btn-sm btn-ghost')}</p>` : ''}</article>`))}</div>
      <p class="explain">מפתחות נכנסים רק לקובץ ‎.env שבמחשב. לוח הבקרה לא מציג, לא שומר ולא שולח את הערכים שלהם, ולא יוצר או מחליף מפתחות.</p>`;
  },
};
