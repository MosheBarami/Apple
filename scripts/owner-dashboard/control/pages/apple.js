// Apple itself: the live Worker's health, what the AI did (calls, tokens, cost, latency), the
// spend against its ceilings, billing mode and Studio pairing — all read-only.
import { html, num, compact, pct, ago, arr, isNum, bars, legend, gauge, shortDay, duration } from '../ui.js';
import { logo } from '../logos.js';
import { stat, note, extBtn } from './kit.js';

const ms = (v) => (!isNum(v) ? '—' : v >= 60_000 ? duration(v / 1000) : v >= 1000 ? `${num(v / 1000, 1)} שנ׳` : `${num(Math.round(v))} ms`);
const FEAT = (k) => String(k).replace(/^audit:/, 'יומן · ');

function counters(c = {}) {
  const days = [...new Set(Object.values(c).flatMap((o) => Object.keys(o || {})))].sort();
  const rows = days.map((day) => ({ day, pair: c.pairing_create?.[day] || 0, paired: c.studio_paired?.[day] || 0, ws: c.ws_connect?.[day] || 0 }));
  const keys = [{ key: 'ws', label: 'חיבורי Studio', color: 'var(--accent)' }, { key: 'pair', label: 'בקשות צימוד', color: 'var(--good)' }, { key: 'paired', label: 'צימודים שהצליחו', color: 'var(--warn)' }];
  return html`${bars(rows, keys, { h: 180, overlay: true, xfmt: shortDay })}${legend(keys)}`;
}

export default {
  id: 'apple', title: 'Apple', nav: 'Apple', brand: 'apple', needs: ['apple'],
  sub: 'האתר החי, כמה עבודה ה-AI עשה, כמה זה עלה, ומה עוד נשאר בתקציב',
  links: (d) => [{ label: 'לאתר', url: d.apple?.health?.url }],
  render(d) {
    const a = d.apple || {}; const h = a.health || {}; const s = a.spend || {}; const t = a.tokens || {}; const lat = a.latency || {}; const suc = a.success || {};
    const w = a.window || {}; const mins = isNum(w.fromMs) && isNum(w.toMs) ? Math.round((w.toMs - w.fromMs) / 60000) : null;
    const b = a.billing || {};
    const dayCap = s.limits?.billablePerDay; const dayF = dayCap ? s.dayNeurons / dayCap : null;
    const spendRows = arr(s.days).map((x) => ({ ...x, usdc: Math.round((x.usd || 0) * 100) }));
    return html`
      ${s.killed ? note('bad', 'מפסק ההוצאות נדלק', 'ה-AI עצר לעבוד כי ההוצאה של היום הגיעה לתקרה. הוא יחזור לבד מחר.') : ''}
      ${b.production && b.keyMode === 'test' ? note('warn', 'התשלומים באתר במצב בדיקה', 'האתר בפרודקשן אבל מפתח Stripe הוא מפתח test: אף לקוח לא מחויב באמת. המעבר ל-live נעשה ב-Stripe, לא מכאן.') : ''}
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'ap-ms', label: 'זמן תגובה עכשיו', value: h.ms, text: num(h.ms), unit: 'ms', sub: `HTTP ${h.httpStatus ?? '—'} · ${h.buildSha || ''}`, tone: h.httpStatus === 200 ? 'good' : 'bad' })}
        ${stat({ key: 'ap-req', label: 'בקשות', value: a.counts?.request, sub: `${pct(suc.requests?.rate, 1)} הצליחו · ${num(a.counts?.error)} שגיאות` })}
        ${stat({ key: 'ap-calls', label: 'קריאות למודלים', value: a.counts?.model_call, sub: `${pct(suc.modelCalls?.rate)} הצליחו · ${num(suc.modelCalls?.failed)} נכשלו` })}
        ${stat({ key: 'ap-usd', label: 'עלות בחלון הזה', value: a.cost?.usd, text: `$${num(a.cost?.usd, 3)}`, sub: `${compact(a.cost?.neurons)} neurons` })}
      </section>
      <p class="explain mb">המספרים למעלה מחושבים מ-${num(w.events)} האירועים האחרונים ביומן של האתר${mins != null ? `, כלומר בערך ${num(mins)} הדקות האחרונות` : ''}. ההוצאה למטה היא לכל החודש.</p>
      <div class="g g21">
        <section class="card" aria-labelledby="h-spend"><h2 id="h-spend">הוצאה לפי יום<small>דולר, לפי מה שה-Worker רשם</small></h2>
          ${bars(spendRows, [{ key: 'usdc', label: 'סנט', color: 'var(--accent)' }], { h: 200, xfmt: shortDay, tip: (r) => `${shortDay(r.day)} · $${num(r.usd, 3)} · ${num(r.calls)} קריאות · ${compact(r.neurons)} neurons` })}
          <p class="explain">הגובה של כל עמודה בסנטים. מעבר עם העכבר מראה גם כמה קריאות היו.</p></section>
        <section class="card" aria-labelledby="h-cap"><h2 id="h-cap">תקציב החודש</h2>
          ${gauge(s.maxMonthlyUsd ? s.monthUsd / s.maxMonthlyUsd : 0, { label: `$${num(s.monthUsd, 2)}`, sub: `מתוך $${num(s.maxMonthlyUsd, 2)}`, color: 'var(--accent)' })}
          <dl class="kv kv-row">
            <div><dt>היום</dt><dd>${compact(s.dayNeurons)}<small class="faint"> / ${compact(dayCap)}</small></dd></div>
            <div><dt>ניצול יומי</dt><dd>${pct(dayF)}</dd></div>
            <div><dt>ספקים חיצוניים</dt><dd>$${num(s.thirdParty?.monthUsd, 2)}<small class="faint"> / $${num(s.thirdParty?.monthCeilingUsd)}</small></dd></div>
            <div><dt>מפסק</dt><dd>${s.killed ? 'נדלק' : 'לא נדלק'}</dd></div>
          </dl></section>
      </div>
      <div class="g g3">
        <section class="card" aria-labelledby="h-tok"><h2 id="h-tok">טוקנים</h2>
          <div class="row" style="gap:18px;align-items:center">${gauge(t.cacheHit, { label: pct(t.cacheHit), sub: 'הגיעו מהמטמון', color: 'var(--good)' })}</div>
          <dl class="kv kv-row"><div><dt>נכנסו</dt><dd>${compact(t.input)}</dd></div><div><dt>יצאו</dt><dd>${compact(t.output)}</dd></div><div><dt>מהמטמון</dt><dd>${compact(t.cached)}</dd></div></dl></section>
        <section class="card" aria-labelledby="h-lat"><h2 id="h-lat">כמה זמן לוקח</h2>
          <table><thead><tr><th>מה</th><th>חציון</th><th>95% מהמקרים</th></tr></thead><tbody>
            ${[['request', 'בקשה לאתר'], ['model', 'תשובה ממודל'], ['build', 'בנייה מלאה']].map(([k, l]) => html`<tr><td data-l="מה">${l}</td><td data-l="חציון" class="mono">${ms(lat[k]?.p50)}</td><td data-l="95%" class="mono">${ms(lat[k]?.p95)}</td></tr>`)}
          </tbody></table></section>
        <section class="card" aria-labelledby="h-bill"><h2 id="h-bill">תשלומים</h2>
          <dl class="kv kv-row">
            <div><dt>מצב המפתח</dt><dd>${b.keyMode === 'live' ? 'אמיתי (live)' : b.keyMode === 'test' ? 'בדיקה (test)' : '—'}</dd></div>
            <div><dt>Webhook</dt><dd>${b.webhook ? 'מחובר' : 'חסר'}</dd></div>
            <div><dt>מחירים</dt><dd>${b.prices?.builder && b.prices?.studio ? 'מוגדרים' : 'חסרים'}</dd></div>
            <div><dt>סביבה</dt><dd>${b.production ? 'פרודקשן' : 'פיתוח'}</dd></div>
          </dl><p class="explain">${logo('stripe', 'sm')} התשלומים עצמם נשארים ב-Stripe. מכאן לא מבצעים שום חיוב.</p></section>
      </div>
      <div class="g g2">
        <section class="card flush" aria-labelledby="h-feat"><h2 class="card-h" id="h-feat">מה הכי עסוק<small>לפי מספר אירועים</small></h2>
          <ul class="list">${arr(a.features).map((f) => html`<li class="li"><div class="li-m"><bdi class="li-t mono">${FEAT(f.feature)}</bdi><span class="li-s">פעם אחרונה ${ago(f.lastAt)}</span></div><b class="mono">${num(f.events)}</b></li>`)}</ul></section>
        <section class="card" aria-labelledby="h-studio"><h2 id="h-studio">Roblox Studio<small>חיבורים וצימודים לפי יום</small></h2>${counters(a.counters)}
          <h3 class="dt-s">המודלים שעבדו</h3>
          <ul class="list">${arr(a.cost?.byModel).map((m) => html`<li class="li" style="padding-inline:0"><div class="li-m"><bdi class="li-t mono">${m.key}</bdi><span class="li-s">${num(m.calls)} קריאות · ${compact(m.neurons)} neurons</span></div><b class="mono">$${num(m.usd, 3)}</b></li>`)}</ul>
          ${arr(a.errorsByKind).length ? html`<h3 class="dt-s">שגיאות לפי סוג</h3><div class="row">${arr(a.errorsByKind).map((e) => html`<span class="chip chip-bad">${e.key} · ${num(e.count)}</span>`)}</div>` : ''}
        </section>
      </div>
      <p>${extBtn(h.url ? `${h.url}/api/health` : null, 'בדיקת הבריאות הגולמית של ה-Worker', 'btn-sm btn-ghost')}</p>`;
  },
};
