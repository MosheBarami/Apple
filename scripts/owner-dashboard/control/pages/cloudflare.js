import { html, num, compact, bytes, ago, arr, brand, extLink, bars, legend, part, light, isNum, isFail, failCard, hourOf, short, pct } from '../ui.js';

function health(h) {
  if (isFail(h)) return failCard(h.reason, { level: 'warn', title: 'בדיקת הבריאות לא זמינה' });
  const code = h?.httpStatus; const ms = h?.ms;
  const state = code == null ? 'off' : code >= 200 && code < 300 ? (ms > 1500 ? 'warn' : 'ok') : 'bad';
  const lbl = { ok: 'השרת עונה ותקין', warn: 'השרת עונה, אבל לאט', bad: 'השרת לא עונה כמו שצריך', off: 'אין נתון' }[state];
  return html`<section class="cf-card cf-health cf-${state}">
    <div class="cf-health-l"><span class="cf-dot" aria-hidden="true"></span><div><h3>בריאות השרת (Worker)</h3>${light(state, lbl)}</div></div>
    <dl class="cf-kv">
      <div><dt>קוד תשובה</dt><dd class="mono">${code ?? '—'}</dd></div>
      <div><dt>זמן תגובה</dt><dd class="mono">${isNum(ms) ? `${num(ms)}ms` : '—'}</dd></div>
      <div><dt>גרסה (build)</dt><dd class="mono"><bdi>${short(h?.buildSha) || '—'}</bdi></dd></div>
    </dl>
    ${h?.url ? html`<p class="faint small"><bdi class="ltr mono">${h.url}</bdi></p>` : ''}</section>`;
}

function inv(title, icon, x, row, explain) {
  const n = Array.isArray(x) ? x.length : null;
  return html`<section class="cf-card cf-inv"><h3><span aria-hidden="true">${icon}</span> ${title} ${n != null ? html`<span class="cf-count">${num(n)}</span>` : ''}</h3>
    <p class="explain">${explain}</p>
    ${part(x, (xs) => html`<ul class="cf-list">${xs.slice(0, 8).map((i) => html`<li>${row(i)}</li>`)}${xs.length > 8 ? html`<li class="faint">ועוד ${num(xs.length - 8)}…</li>` : ''}</ul>`, { title: 'לא זמין', empty: 'אין כאלה בחשבון.' })}</section>`;
}

function zones(d) {
  const z = d.zones;
  if (isFail(z)) return failCard(z.reason, { level: 'warn', title: 'אין גישה לדומיינים' });
  if (!arr(z).length) return html`<p class="empty">${d.zonesReason || z?.reason || 'אין דומיינים (zones) בחשבון Cloudflare הזה, אז אין מטמון לנקות.'}</p>`;
  return html`<ul class="cf-zones">${arr(z).map((x) => html`<li>
    <div><bdi class="ltr cf-zone">${x.name}</bdi> ${light(x.status === 'active' ? 'ok' : 'warn', x.status === 'active' ? 'פעיל' : x.status || 'לא ידוע')} <span class="cf-tag">${x.plan || ''}</span></div>
    <button class="cf-btn" data-act="purge" data-z="${x.id}">ניקוי מטמון מיידי</button></li>`)}</ul>`;
}

export default {
  id: 'cloudflare', title: 'Cloudflare', theme: 'cloudflare', icon: brand('cloudflare'), mark: brand('cloudflare', 'bm-lg'), endpoint: '/api/cc/cloudflare',
  sub: 'השרת שמריץ את Apple, התנועה אליו והמשאבים שלו',
  render(d) {
    const t = d.traffic || {}; const l = t.last24h || {};
    const keys = [{ key: 'requests', label: 'בקשות', color: 'var(--p-accent)' }, { key: 'errors', label: 'שגיאות', color: 'var(--bad)' }];
    const errRate = l.requests > 0 && isNum(l.errors) ? l.errors / l.requests : null;
    const workers = d.workers;
    return html`
      <div class="cf-top">
        ${health(d.health)}
        <section class="cf-card cf-acct"><h3>חשבון</h3><p class="cf-acct-n"><bdi class="ltr">${d.account?.name || '—'}</bdi></p>
          ${d.account?.id ? html`<p class="faint small mono"><bdi>${d.account.id}</bdi></p>` : ''}${isFail(d.account) ? html`<p class="faint small">${d.account.reason}</p>` : ''}</section>
      </div>
      <section class="cf-card"><h3>תנועה ב-24 השעות האחרונות</h3>
        ${isFail(d.traffic) ? failCard(d.traffic.reason, { level: 'warn', title: 'נתוני התנועה לא זמינים' }) : html`
        <dl class="cf-stats">
          <div><dt>בקשות</dt><dd>${compact(l.requests)}</dd></div>
          <div><dt>שגיאות</dt><dd class="${l.errors > 0 ? 'cf-bad' : ''}">${compact(l.errors)} <small class="faint">${errRate != null ? `(${pct(errRate, 2)})` : ''}</small></dd></div>
          <div><dt>תת-בקשות</dt><dd>${compact(l.subrequests)}</dd></div>
          <div><dt>זמן מעבד חציוני</dt><dd>${isNum(l.cpuP50Ms) ? `${num(l.cpuP50Ms, 1)}ms` : '—'}</dd></div>
          <div><dt>זמן מעבד באיטיים (1%)</dt><dd>${isNum(l.cpuP99Ms) ? `${num(l.cpuP99Ms, 1)}ms` : '—'}</dd></div>
        </dl>
        ${part(t.perHour, (rows) => html`${bars(rows, keys, { x: (r) => r.hour, xfmt: hourOf, overlay: true, tip: (r) => `${hourOf(r.hour)} · בקשות: ${num(r.requests)} · שגיאות: ${num(r.errors)}` })}${legend(keys)}`, { empty: 'אין נתונים לפי שעה.' })}
        <p class="explain">"זמן מעבד" = כמה זמן השרת חושב על כל בקשה. החציוני הוא בקשה רגילה, והאיטיים הם ה-1% הכבדים ביותר.</p>`}
      </section>
      <section class="cf-card"><h3>שרתים (Workers) ופריסות אחרונות</h3>
        ${part(workers, (ws) => html`<div class="cf-workers">${ws.map((w) => html`<article class="cf-worker">
          <header><bdi class="ltr mono cf-wn">${extLink(w.url, w.name)}</bdi><span class="faint small">עודכן ${ago(w.modifiedAt)}</span></header>
          ${arr(w.deployments).length ? html`<ol class="cf-deps">${arr(w.deployments).slice(0, 5).map((x, i) => html`<li>
            <span class="cf-tag ${i === 0 ? 'cf-tag-live' : ''}">${i === 0 ? 'פעיל' : 'קודם'}</span>
            <span dir="auto" class="cf-dm">${x.message || 'ללא תיאור'}</span>
            <span class="faint small">${ago(x.createdAt)}${x.author ? ` · ${x.author}` : ''}</span></li>`)}</ol>` : html`<p class="empty">אין רשימת פריסות.</p>`}
        </article>`)}</div>`, { empty: 'אין Workers בחשבון.' })}</section>
      <h2 class="cf-sec">המשאבים בחשבון</h2>
      <div class="cf-invs">
        ${inv('D1 מסדי נתונים', '🗄', d.d1, (x) => html`<bdi class="ltr mono">${x.name}</bdi> <span class="faint small">${bytes(x.sizeBytes)}${isNum(x.tables) ? ` · ${num(x.tables)} טבלאות` : ''}</span>`, 'מסדי נתונים קטנים שיושבים ליד השרת.')}
        ${inv('KV', '🔑', d.kv, (x) => html`<bdi class="ltr mono">${x.title || x.id}</bdi>`, 'מחסן מהיר של מפתח-ערך (הגדרות ומטמון).')}
        ${inv('R2 אחסון', '🪣', d.r2, (x) => html`<bdi class="ltr mono">${x.name}</bdi> <span class="faint small">${ago(x.createdAt)}</span>`, 'אחסון קבצים גדולים.')}
        ${inv('Vectorize', '🧭', d.vectorize, (x) => html`<bdi class="ltr mono">${x.name}</bdi> <span class="faint small ltr">${x.dimensions ?? ''}d ${x.metric || ''}</span>`, 'אינדקס חיפוש לפי משמעות (לחיפוש חכם).')}
        ${inv('Queues', '📬', d.queues, (x) => html`<bdi class="ltr mono">${x.name || x.queue_name || x.id || ''}</bdi>`, 'תורי משימות שרצות ברקע.')}
        ${inv('AI Gateway', '🤖', d.aiGateway, (x) => html`<bdi class="ltr mono">${x.id || x.name}</bdi>`, 'השער שדרכו עוברות קריאות למודלי AI.')}
      </div>
      <section class="cf-card"><h3>דומיינים ומטמון</h3>
        <p class="explain">"ניקוי מטמון" גורם ל-Cloudflare לשכוח עותקים שמורים של האתר, כדי שכולם יקבלו מיד את הגרסה החדשה.</p>
        ${zones(d)}</section>`;
  },
  actions: {
    purge(el, ctx) {
      const id = el.dataset.z; const z = arr(ctx.data.zones).find((x) => x.id === id) || {};
      ctx.act({
        title: `לנקות את המטמון של ${z.name || 'הדומיין'}?`, danger: true, reversible: false, confirmLabel: 'כן, לנקות מטמון',
        what: `Cloudflare ימחק את כל העותקים השמורים של ${z.name || 'האתר'}. האתר עצמו והנתונים לא נמחקים, אבל בדקות הקרובות הטעינה עלולה להיות קצת איטית יותר.`,
        undo: 'אי אפשר להחזיר את המטמון, אבל אין צורך: הוא נבנה מחדש לבד תוך כמה דקות.',
        path: '/api/cc/cloudflare/action', body: { kind: 'purge', zoneId: id }, okMsg: 'המטמון נוקה.',
      });
    },
  },
};
