// Cloudflare: traffic of the last 24 hours, the Worker's observability switches (logs, traces),
// deployments, and every storage resource the account runs (D1, KV, R2, Vectorize, Queues, AI Gateway).
import { html, num, compact, bytes, ago, arr, bars, legend, hourOf } from '../ui.js';
import { icon } from '../logos.js';
import { cf } from '../actions.js';
import { stat, swBtn, note } from './kit.js';

const res = (label, items, fmt) => html`<div class="card stat"><p class="stat-k">${label}</p><p class="stat-v">${num(items.length)}</p>
  <ul class="list">${items.map((x) => html`<li class="li" style="padding:6px 0"><div class="li-m"><bdi class="li-t mono">${fmt(x)[0]}</bdi><span class="li-s">${fmt(x)[1]}</span></div></li>`)}</ul></div>`;

export default {
  id: 'cloudflare', title: 'Cloudflare', nav: 'Cloudflare', brand: 'cloudflare', needs: ['cloudflare'],
  sub: 'השרת שמריץ את האתר: כמה תנועה יש, כמה שגיאות, ומה שמור בו',
  links: (d) => [{ label: 'לוח הבקרה של Cloudflare', url: d.cloudflare?.account?.id && `https://dash.cloudflare.com/${d.cloudflare.account.id}/workers-and-pages` }],
  render(d) {
    const c = d.cloudflare || {}; const t = c.traffic?.last24h || {}; const ph = arr(c.traffic?.perHour); const s = c.settings || {};
    const keys = [{ key: 'requests', label: 'בקשות', color: 'var(--b-use)' }, { key: 'errors', label: 'שגיאות', color: 'var(--bad)' }];
    return html`
      <section class="g g4" aria-label="מדדים">
        ${stat({ key: 'cf-req', label: 'בקשות ב-24 שעות', value: t.requests, series: ph.map((x) => x.requests), sub: `${compact(t.subrequests)} בקשות-משנה` })}
        ${stat({ key: 'cf-err', label: 'שגיאות', value: t.errors, tone: t.errors ? 'bad' : 'good', series: ph.map((x) => x.errors), sparkCls: 'bad', sub: t.requests ? `${num((t.errors / t.requests) * 100, 2)}% מהבקשות` : '' })}
        ${stat({ key: 'cf-cpu', label: 'זמן מעבד (חציון)', value: t.cpuP50Ms, text: num(t.cpuP50Ms, 1), unit: 'ms', sub: `99% מהבקשות מתחת ל-${num(t.cpuP99Ms, 1)} ms` })}
        ${stat({ key: 'cf-ms', label: 'זמן תגובה עכשיו', value: c.health?.ms, unit: 'ms', tone: c.health?.httpStatus === 200 ? 'good' : 'bad', sub: `HTTP ${c.health?.httpStatus ?? '—'}` })}
      </section>
      <div class="g g21">
        <section class="card" aria-labelledby="h-ph"><h2 id="h-ph">תנועה לפי שעה<small>24 השעות האחרונות</small></h2>
          ${bars(ph, keys, { h: 170, overlay: true, x: (r) => r.hour, xfmt: hourOf })}${legend(keys)}</section>
        <section class="card flush" aria-labelledby="h-obs"><h2 class="card-h" id="h-obs">${icon('status', 15)}מעקב ב-Worker<small>מתג = חלון אישור, ואז שינוי ב-Worker החי</small></h2>
          <div class="sw-row"><div class="li-m"><b>יומני הרצה (Logs)</b><span>כל שורה שה-Worker כותב נשמרת לחיפוש</span></div>${swBtn(cf.toggle('logs', !!s.logs), !!s.logs, 'Logs')}</div>
          <div class="sw-row"><div class="li-m"><b>מעקב בקשות (Traces)</b><span>כמה זמן לקח כל שלב בכל בקשה</span></div>${swBtn(cf.toggle('traces', !!s.traces), !!s.traces, 'Traces')}</div>
          <div class="sw-row"><div class="li-m"><b>דגימה</b><span>איזה חלק מהבקשות נשמר</span></div><b class="mono">${num((s.sampling ?? 0) * 100)}%</b></div>
          <div class="sw-row"><div class="li-m"><b>Logpush</b><span>שליחת יומנים לשירות חיצוני</span></div><span class="chip ${s.logpush ? 'chip-ok' : 'chip-off'}">${s.logpush ? 'דלוק' : 'כבוי'}</span></div>
          <p class="explain" style="padding:0 20px 16px">שינוי כאן מגיע רק ל-Worker החי. בפריסה הבאה ההגדרות שבקוד (wrangler.toml) קובעות שוב.</p></section>
      </div>
      <section class="card flush" aria-labelledby="h-wk"><h2 class="card-h" id="h-wk">Workers<small>${num(arr(c.workers).length)} בחשבון</small></h2>
        <ul class="list">${arr(c.workers).map((w) => html`<li class="li"><div class="li-m"><span class="li-t mono" dir="ltr" style="text-align:right">${w.name}</span>
          <span class="li-s">עודכן ${ago(w.modifiedAt)}${arr(w.deployments).length ? html`<span>${num(arr(w.deployments).length)} פריסות אחרונות · האחרונה ${ago(w.deployments[0].createdAt)} דרך ${w.deployments[0].source || '—'}</span>` : ''}</span></div>
          ${w.url ? html`<a class="btn btn-sm btn-ghost" href="${w.url}" target="_blank" rel="noopener noreferrer">${icon('ext', 13)}</a>` : ''}</li>`)}</ul></section>
      <div class="g g3">
        ${res('D1 · מסדי נתונים', arr(c.d1), (x) => [x.name, `${bytes(x.sizeBytes)} · ${num(x.tables)} טבלאות`])}
        ${res('Vectorize · חיפוש לפי משמעות', arr(c.vectorize), (x) => [x.name, `${num(x.dimensions)} ממדים · ${x.metric}`])}
        ${res('R2 · קבצים', arr(c.r2), (x) => [x.name, `נוצר ${new Date(x.createdAt).toLocaleDateString('he-IL')}`])}
        ${res('KV · מפתח-ערך', arr(c.kv), (x) => [x.title, ''])}
        ${res('Queues · תורים', arr(c.queues), (x) => [x.name, `${num(x.producers)} שולחים · ${num(x.consumers)} צורכים`])}
        ${res('AI Gateway', arr(c.aiGateway), (x) => [x.id, ''])}
      </div>
      <div class="g g2">
        <section class="card" aria-labelledby="h-cron"><h2 id="h-cron">משימות לפי שעון</h2>
          ${arr(c.crons).length ? arr(c.crons).map((x) => html`<p class="row"><code class="code">${x.cron}</code><span class="faint small">${x.cron === '* * * * *' ? 'כל דקה' : ''} · עודכן ${ago(x.modifiedAt)}</span></p>`) : html`<p class="empty">אין.</p>`}
          <p class="explain">כתובת workers.dev: ${c.subdomain?.enabled ? 'פעילה' : 'כבויה'} · תצוגות מקדימות: ${c.subdomain?.previews ? 'פעילות' : 'כבויות'}</p></section>
        ${arr(c.zones).length ? '' : note('info', 'אין דומיינים בחשבון הזה', 'האתר רץ על כתובת workers.dev, ולכן אין כאן כפתור "ניקוי מטמון": ניקוי מטמון שייך לדומיין (zone). כשיהיה דומיין, ניקוי מטמון נעשה מהמסך שלו ב-Cloudflare.')}
      </div>`;
  },
};
