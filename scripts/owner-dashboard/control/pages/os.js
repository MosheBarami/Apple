import { html, num } from '../ui.js';

const state = (v) => v === 'ready' ? 'פעיל' : 'בתכנון';
const sources = { 'exact-local-command': 'פקודה מקומית מדויקת', 'conservative-local-rule': 'כלל ניתוב מקומי', jev: 'Jev' };
const topics = { security: 'אבטחה', training: 'אימון', studio: 'Studio', visual: 'עיצוב וחזות', owner: 'ניהול', release: 'שחרור' };
const work = { query: '', busy: false, result: null, kind: null };
async function ask(kind, ctx) {
  const query = document.getElementById('os-query')?.value?.trim() || '';
  work.query = query;
  if (!query) { work.result = { ok: false, reason: 'כתבו בקשה או מילות חיפוש.' }; work.kind = kind; ctx.rerender(); return; }
  work.busy = true; work.kind = kind; ctx.rerender();
  work.result = await ctx.api.post('/api/cc/os/action', kind === 'route' ? { kind, text: query, executeExact: true } : { kind, query });
  work.busy = false; ctx.rerender();
}
function result() {
  if (!work.result) return '';
  const r = work.result;
  if (r.ok === false) return html`<p role="alert">${r.reason || 'הפעולה נכשלה'}</p>`;
  if (work.kind === 'search') return html`<div role="status"><h3>נמצאו ${num(r.hits?.length)} שורות</h3>${r.hits?.length ? html`<ul class="flist">${r.hits.map((h) => html`<li><bdi dir="ltr">${h.path}:${h.line}</bdi><span dir="auto">${h.text}</span></li>`)}</ul>` : html`<p>אין התאמה במאגר המקומי.</p>`}</div>`;
  const d = r.decision || {};
  const x = r.execution;
  return html`<div role="status"><p><b>נתיב ${d.tier || '—'}</b> · ${d.tier === 1 ? 'פעולה מקומית ללא מודל' : d.tier === 2 ? 'שאלה לסוכן עונה' : 'עבודה לסוכן Codex'} · מקור: ${sources[d.source] || d.source || 'לא ידוע'}${d.fallback ? ` · סיבה לגיבוי: ${d.fallback}` : ''}.${d.tier !== 1 ? ' הסיווג מוצג; עבודת הסוכן עדיין לא מופעלת מהדף.' : ''}</p>
    ${x?.kind === 'brief' ? html`<p class="os-path" dir="ltr">${x.path || x.message}</p>${x.text ? html`<pre class="os-brief" dir="auto">${x.text}</pre>` : ''}` : ''}
    ${x?.kind === 'training' ? html`<p>הטוב המאומת: ${x.training?.best ? `v${x.training.best.version} · ${x.training.best.passed}/${x.training.best.total}` : 'אין נתון'}. אחרון: ${x.training?.latest?.label || 'אין נתון'}.</p>` : ''}</div>`;
}

export default {
  id: 'os', title: 'Apple OS', nav: 'Apple OS', endpoint: '/api/cc/os',
  sub: 'מיומנויות, ידע, דוחות וניתוב שמבוססים על מצב Apple האמיתי',
  render(d) {
    const f = d.facts || {}, a = f.acceptance || {}, t = f.training || {};
    return html`
      <div class="g g3">
        <article class="card tile"><h2>קבלת מוצר</h2><p class="tile-v"><b>${num(a.reviews)}/${num(a.requiredReviews)}</b><span>ביקורות עצמאיות</span></p><p class="explain">${num(a.high)} ממצאים גבוהים פתוחים · מדידה מקומית ${f.measuredAt || 'לא זמינה'}</p></article>
        <article class="card tile"><h2>מודל מקומי</h2><p class="tile-v"><b>${t.best ? `v${t.best.version} · ${t.best.passed}/${t.best.total}` : '—'}</b><span>הטוב המאומת</span></p><p class="explain">${t.latest ? `גרסה אחרונה v${t.latest.version}: ${t.latest.label}` : 'אין מצב אימון זמין'} · ציון קוד בלבד</p></article>
        <article class="card tile"><h2>חיבורים</h2><p>Whisper: ${d.voice?.whisper ? 'מקומי וזמין' : 'לא זמין'}</p><p>קול יוצא: ${d.voice?.kokoro ? 'Kokoro לאנגלית; קול המחשב לעברית' : d.voice?.speechOutput ? 'קול המחשב המקומי' : 'לא זמין'}</p><p>Kokoro: ${d.voice?.kokoro ? 'זמין' : 'טרם חובר'} · Jev: ${d.jevConfigured ? 'מפתח מוגדר' : 'טרם חובר'}</p></article>
      </div>
      <section class="card"><h2>בקשה או חיפוש</h2><p class="explain">כתבו מה צריך. בקשה מדויקת להצגת הדוח או מצב האימון מתבצעת מיד מהמחשב הזה; בקשות אחרות מקבלות סיווג בלבד. ״חפש״ קורא את מאגר הידע המקומי. אין כאן בנייה או פריסה.</p>
        <div class="g g21"><input class="os-query" id="os-query" aria-label="בקשה ל־Apple OS" maxlength="4000" value="${work.query}" placeholder="למשל: הצג את דוח הבעלים האחרון" dir="auto">
          <div class="os-actions"><button class="btn btn-ok" data-act="route" ${work.busy ? 'disabled' : ''}>נתב בקשה</button> <button class="btn" data-act="search" ${work.busy ? 'disabled' : ''}>חפש בידע</button></div></div>
        ${work.busy ? html`<p role="status">בודק…</p>` : result()}
      </section>
      <section class="card"><h2>דוח בעלים</h2><p class="explain">נוצר מחוזה הקבלה, פעולת ההמשך ומצב האימון בזמן ההרצה. נשמר במאגר הפרטי.</p>
        <button class="btn btn-ok" data-act="brief">הכן דוח עכשיו</button>
        ${d.brief ? html`<p class="explain os-path" dir="ltr">${d.brief.path}</p><pre class="os-brief" dir="auto">${d.brief.text}</pre>` : html`<p class="empty">עדיין אין דוח. לחצו על הכפתור כדי להכין ראשון.</p>`}
      </section>
      <section class="card"><h2>מיומנויות ותהליכים</h2><p class="explain">פעיל פירושו שהפעולה קיימת ונבדקה. בתכנון פירושו שאין עדיין כפתור שמבצע אותה.</p>
        <ul class="flist">${(d.skills || []).map((s) => html`<li><span class="chip chip-${s.state === 'ready' ? 'ok' : 'off'}">${state(s.state)}</span><b>${s.title}</b><span>${s.input} → ${s.output}</span></li>`)}</ul>
      </section>
      <section class="card"><h2>דפוסי עבודה מהשיחות</h2><p class="explain">ניתוח מקומי של שיחות Codex על Apple ב־30 הימים האחרונים. נשמרו רק ספירות נושאים לפי שיחה, בלי תוכן ההודעות.</p>
        ${d.discovery ? html`<p>${num(d.discovery.sessions)} שיחות רלוונטיות · ${num(d.discovery.requests)} קטעי בקשה נסרקו · נבדק ${d.discovery.analysedAt}</p>
          <ul class="flist">${Object.entries(d.discovery.counts || {}).sort((a,b) => b[1] - a[1]).map(([k,v]) => html`<li><b>${topics[k] || k}</b><span>${num(v)} שיחות</span></li>`)}</ul>` : html`<p class="empty">עדיין לא נותח. הריצו פעם אחת מהמסוף: node scripts/apple-os/cli.mjs discover</p>`}
      </section>
      <section class="card"><h2>זיכרון פרטי</h2><p>מאגר Markdown: <bdi dir="ltr">${d.vault?.path || '—'}</bdi></p><p>תיקיות raw / wiki / outputs: ${d.vault?.exists ? 'קיימות' : 'לא אותחלו'}</p><p class="explain">אפשר לפתוח את התיקייה ב־Obsidian כשהאפליקציה מותקנת. התוכן נשמר מקומית.</p></section>`;
  },
  actions: {
    route: (_el, ctx) => ask('route', ctx),
    search: (_el, ctx) => ask('search', ctx),
    brief: (_el, ctx) => ctx.act({ title: 'להכין דוח Apple OS?', what: 'הדוח יכתוב קובץ Markdown חדש במאגר הפרטי, מנתונים מקומיים שנמדדים כעת.',
      undo: 'כן. אפשר למחוק את הקובץ המקומי.', path: '/api/cc/os/action', body: { kind: 'brief' }, okMsg: 'הדוח נוצר ומופיע בדף.' }),
  },
};
