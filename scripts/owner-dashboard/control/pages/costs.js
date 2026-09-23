// טוקנים, עלויות ושימוש: what the AI costs and how close each free tier is. Numbers come from
// /api/cc/costs (Cloudflare GraphQL for Workers AI and AI Gateway, the worker's model_call log for runs,
// its spend ledger, Supabase, Groq's last probe). A provider with no readable usage gets an
// "אין מקור נתונים" card that names the missing source, never a guessed number.
import { html, num, compact, arr, isNum, failCard, shortDay, ltr, pct, legend, bars, meter, when, bytes } from '../ui.js';
import { stat, sec, note } from './kit.js';

const COLORS = ['#5b7cfa', '#7cc49a', '#e6a95a', '#c792ea', '#8a8d96'];
const usd = (v, d = 2) => (isNum(v) ? `$${num(v, v < 0.01 && v > 0 ? 4 : d)}` : '—');
const short = (m) => String(m || '').replace(/^@cf\//, '').replace(/^[^/]+\//, '');
const st = { chart: 'tokens' };
// he-IL compact numbers end in an RLM mark, which scrambles "a / b" inside an LTR span
const plain = (v) => compact(v).replace(/[\u200e\u200f]/g, '');

function noSource(list) {
  if (!arr(list).length) return '';
  return html`${sec('אין מקור נתונים', 'ספקים שאי אפשר לקרוא מהם שימוש או עלות. לא מוצג כאן מספר מוערך')}
    <div class="ow-nos">${arr(list).map((x) => html`<div class="ow-no" data-k="ns-${x.k}"><span class="chip chip-sm chip-off">אין מקור נתונים</span><b>${x.name}</b><p dir="auto">${x.why}</p>
      ${x.missing ? html`<p>חסר: <code dir="ltr">${x.missing}</code></p>` : ''}</div>`)}</div>`;
}

export default {
  id: 'costs', title: 'טוקנים, עלויות ושימוש', nav: 'עלויות ושימוש', glyph: 'coins', needs: ['costs'],
  sub: 'כמה טוקנים ובקשות המערכת צורכת, כמה זה עולה, וכמה נשאר עד סוף המכסות החינמיות. 30 הימים האחרונים',
  render(d) {
    const c = d?.costs || {};
    if (c.ok === false) return failCard(c.reason, { retry: true, title: 'לא הצלחנו לקרוא את העלויות' });
    const t = c.totals || {}; const pr = c.projection || {}; const top = arr(c.topModels);
    const days = arr(c.byDay); const cache = c.cache || {};
    const keys = st.chart === 'usd'
      ? [{ key: 'usd', label: 'עלות משוערת (אחרי המכסה החינמית)', color: COLORS[0] }]
      : [...top.map((m, i) => ({ key: `m${i}`, label: short(m), color: COLORS[i] })), { key: 'other', label: 'שאר המודלים', color: COLORS[4] }];
    const run = arr(c.runs);
    const errs = Object.entries(c.errors || {}).filter(([, v]) => v);
    return html`
    ${errs.length ? note('warn', 'חלק מהמקורות לא נקראו', errs.map(([k, v]) => `${k}: ${v}`).join(' · ')) : ''}
    <div class="g g4" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
      ${stat({ key: 'c-req', label: 'בקשות למודלים', value: t.requests, sub: isNum(t.errors) ? `${num(t.errors)} נכשלו` : '', series: days.map((x) => x.requests) })}
      ${stat({ key: 'c-in', label: 'טוקנים נכנסים', value: t.tokensIn, text: compact(t.tokensIn), series: days.map((x) => x.tokensIn) })}
      ${stat({ key: 'c-out', label: 'טוקנים יוצאים', value: t.tokensOut, text: compact(t.tokensOut), series: days.map((x) => x.tokensOut) })}
      ${stat({ key: 'c-usd', label: 'עלות משוערת', text: usd(t.usd), sub: `מחירון השער: ${usd(t.gwUsd)} · ${compact(t.neurons)} נוירונים`, series: days.map((x) => x.usd) })}
      ${stat({ key: 'c-cache', label: 'פגיעות מטמון', text: pct(cache.prompt, 1), sub: html`במטמון הפרומפט · בשער: ${pct(cache.gateway?.rate, 1)} (${num(cache.gateway?.cached)} מתוך ${num(cache.gateway?.requests)})` })}
      ${stat({ key: 'c-proj', label: `צפי לחודש ${pr.month || ''}`, text: usd(pr.projectedUsd), sub: html`עד היום ${usd(pr.mtdUsd)} · הספר של העובד ${usd(pr.workerMonthUsd)} · תקרה ${usd(pr.ceilingUsd)}`, tone: pr.ceilingUsd && pr.projectedUsd > pr.ceilingUsd ? 'bad' : '' })}
    </div>

    <div class="card" data-k="c-days"><div class="row" style="justify-content:space-between;margin-bottom:10px"><h2 class="card-h" style="margin:0">לפי יום</h2>
      <div class="seg" role="group" aria-label="מה להציג"><button class="seg-b ${st.chart === 'tokens' ? 'on' : ''}" data-act="chart" data-v="tokens">טוקנים לפי מודל</button><button class="seg-b ${st.chart === 'usd' ? 'on' : ''}" data-act="chart" data-v="usd">עלות</button></div></div>
      ${bars(days, keys, { x: (r) => r.day, xfmt: shortDay, h: 240, tip: (r) => `${shortDay(r.day)} · ${num(r.requests)} בקשות · ${compact(r.tokensIn)} נכנסים · ${compact(r.tokensOut)} יוצאים · ${usd(r.usd)}` })}
      ${legend(keys)}</div>

    <div class="g g21">
      <div class="card" style="padding:0" data-k="c-models"><h2 class="card-h" style="padding:16px 20px 0">לפי מודל</h2><div class="tbl-wrap"><table class="ow-t">
        <thead><tr><th>מודל</th><th class="n">בקשות</th><th class="n">נכנסים</th><th class="n">יוצאים</th><th class="n">עלות</th><th class="n">שגיאות</th></tr></thead><tbody>
        ${arr(c.byModel).slice(0, 14).map((m) => html`<tr data-k="bm-${m.model}"><td>${ltr(short(m.model), 'mono')}<br><small class="dim">${m.provider}</small></td><td class="n">${num(m.requests)}</td>
          <td class="n">${compact(m.tokensIn)}</td><td class="n">${compact(m.tokensOut)}</td><td class="n">${usd(m.usd)}</td><td class="n">${m.errors ? html`<span style="color:var(--bad)">${num(m.errors)}</span>` : '0'}</td></tr>`)}
        </tbody></table></div>${arr(c.byModel).length > 14 ? html`<p class="ow-count" style="padding:8px 20px 14px">ועוד ${num(arr(c.byModel).length - 14)} מודלים עם שימוש קטן</p>` : ''}</div>
      <div class="card" data-k="c-head"><h2 class="card-h">כמה נשאר במכסות</h2>
        ${arr(c.headroom).map((h) => html`<div class="ow-meter ${h.frac > 1 ? 'over' : ''}" data-k="hr-${h.k}"><div class="row"><b style="font-size:13px">${h.label}</b><span class="ow-count">${ltr(h.unit === 'bytes' ? `${bytes(h.used)} / ${bytes(h.limit)}` : `${plain(h.used)} / ${plain(h.limit)}`)} ${h.unit === 'bytes' ? '' : h.unit} (${isNum(h.frac) ? `${num(Math.round(h.frac * 100))}%` : '—'})</span></div>
          ${meter(Math.min(1, h.frac || 0), h.frac > 1 ? 'var(--warn)' : h.frac > 0.8 ? 'var(--warn)' : 'var(--good)')}<p class="ow-count">${h.note} · ${ltr(h.source)}</p></div>`)}
        ${arr(c.headroom).length ? '' : html`<p class="empty">אין מכסה שאפשר לקרוא.</p>`}</div>
    </div>

    <div class="g g2">
      <div class="card" style="padding:0" data-k="c-runs"><h2 class="card-h" style="padding:16px 20px 0">ההרצות היקרות</h2>
        <p class="ow-count" style="padding:0 20px">מיומן הקריאות של העובד: ${num(c.callsSeen)} קריאות ב-${num(c.runsSeen)} הרצות${c.window?.hours ? `, ב-${num(c.window.hours, 1)} השעות האחרונות שהיומן שומר` : ''}</p>
        ${run.length ? html`<div class="tbl-wrap"><table class="ow-t"><thead><tr><th>הרצה</th><th class="n">קריאות</th><th class="n">נכנסים (במטמון)</th><th class="n">יוצאים</th><th class="n">עלות</th></tr></thead><tbody>
          ${run.map((r) => html`<tr data-k="run-${r.run}"><td>${ltr(r.run, 'mono')}<br><small class="dim">${arr(r.features).join(', ')} · ${when(r.from)}</small></td><td class="n">${num(r.calls)}${r.failed ? html` <small style="color:var(--bad)">(${num(r.failed)} נכשלו)</small>` : ''}</td>
            <td class="n">${compact(r.tokensIn)} <small class="dim">(${pct(r.tokensIn ? r.cachedIn / r.tokensIn : null)})</small></td><td class="n">${compact(r.tokensOut)}</td><td class="n">${usd(r.usd, 3)}</td></tr>`)}</tbody></table></div>`
          : html`<p class="empty" style="padding:14px 20px">אין הרצות ביומן כרגע.</p>`}</div>
      <div class="card" style="padding:0" data-k="c-prov"><h2 class="card-h" style="padding:16px 20px 0">לפי ספק (AI Gateway)</h2><div class="tbl-wrap"><table class="ow-t">
        <thead><tr><th>ספק</th><th class="n">בקשות</th><th class="n">מהמטמון</th><th class="n">שגיאות</th><th class="n">מחירון</th></tr></thead><tbody>
        ${arr(c.providers).map((p) => html`<tr data-k="pv-${p.id}"><td>${ltr(p.id)}</td><td class="n">${num(p.requests)}</td><td class="n">${num(p.cached)}</td><td class="n">${num(p.errors)}</td><td class="n">${usd(p.usd)}</td></tr>`)}
        </tbody></table></div><p class="ow-count" style="padding:8px 20px 14px">"מחירון" הוא המחיר שהשער מחשב לפני המכסה החינמית, לא חשבון.</p></div>
    </div>
    ${noSource(c.noSource)}
    <p class="ow-count">מקורות: ${arr(c.sources).join(' · ')}</p>`;
  },
  actions: { chart(el, ctx) { st.chart = el.dataset.v; ctx.rerender(); } },
};
