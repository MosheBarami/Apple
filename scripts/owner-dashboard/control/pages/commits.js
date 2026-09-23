// היסטוריית קומיטים: every commit in the repository's history, forty to a page (the server pages and
// filters, GET /api/cc/commits). A day × hour heatmap, area / agent / author / day filters, free-text
// search, and a side drawer with one commit's full message and per-file line counts (?sha=). Read-only.
import { html, num, ago } from '../ui.js';
import { icon } from '../logos.js';
import { stat } from './kit.js';
import { areaHe, nd, day, dayShort, stamp, sha7, path, pager } from './repo-kit.js';

const st = { q: '', area: '', author: '', agent: '', day: '', page: 1 };
const det = { sha: null, data: null, busy: false };
let typing = null;
let onKey = null;

const qs = () => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(st)) if (v && !(k === 'page' && v === 1)) p.set(k, v); return p.toString(); };
const filtered = () => !!(st.q || st.area || st.author || st.agent || st.day);

// Every calendar day from the first commit to the last, so quiet days show as gaps.
function calendar(first, last) {
  const out = []; const a = new Date(`${first.slice(0, 10)}T12:00:00`); const b = new Date(`${last.slice(0, 10)}T12:00:00`);
  for (let d = a; d <= b && out.length < 400; d = new Date(d.getTime() + 86400000)) out.push(d.toLocaleDateString('en-CA'));
  return out;
}

function heatmap(s) {
  const days = calendar(s.first, s.last);
  const cell = new Map(s.heat.map((x) => [`${x.day}|${x.h}`, x.n]));
  const perDay = new Map(s.days.map((x) => [x.day, x.n]));
  const max = Math.max(1, ...s.heat.map((x) => x.n));
  const lvl = (n) => (!n ? 0 : Math.min(4, 1 + Math.floor((n / max) * 4)));
  return html`<div class="cm-heat" role="group" aria-label="קומיטים לפי יום ושעה">
    <div class="cm-hrow cm-hhead" aria-hidden="true"><span class="cm-hd"></span>${Array.from({ length: 24 }, (_, h) => html`<span class="cm-hh">${h % 3 ? '' : h}</span>`)}<span class="cm-hn"></span></div>
    ${days.map((d, i) => { const n = perDay.get(d) || 0; return html`<div class="cm-hrow ${st.day === d ? 'on' : ''}" style="--r:${i}">
      <button class="cm-hd" data-act="day" data-day="${d}" ${n ? '' : 'disabled'} aria-pressed="${st.day === d}" aria-label="${day(d)}: ${num(n)} קומיטים">${dayShort(d)}</button>
      ${Array.from({ length: 24 }, (_, h) => { const c = cell.get(`${d}|${h}`) || 0; return html`<i class="cm-c l${lvl(c)}" title="${dayShort(d)} ${h}:00 · ${num(c)} קומיטים"></i>`; })}
      <span class="cm-hn">${n ? num(n) : ''}</span></div>`; })}
    <p class="cm-hleg" aria-hidden="true"><span>פחות</span>${[0, 1, 2, 3, 4].map((l) => html`<i class="cm-c l${l}"></i>`)}<span>יותר</span><span class="faint">· השעה היא שעון המחשב · לחיצה על תאריך מסננת את היום</span></p>
  </div>`;
}

function filters(d) {
  const s = d.summary;
  const opt = (list, cur, label) => html`<option value="">${label}</option>${list.map((x) => html`<option value="${x.name}" ${cur === x.name ? 'selected' : ''}>${x.name} (${num(x.n)})</option>`)}`;
  return html`<div class="card cm-filt">
    <label class="search cm-search"><span aria-hidden="true">${icon('search', 16)}</span><span class="sr">חיפוש בקומיטים</span>
      <input id="cm-q" type="search" data-input="q" value="${st.q}" placeholder="חיפוש בהודעה, במזהה, בשם הכותב…" autocomplete="off"></label>
    <div class="cm-sel">
      <select id="cm-agent" data-change="agent" aria-label="סינון לפי סוכן">${opt(s.agents, st.agent, 'כל הסוכנים')}</select>
      <select id="cm-author" data-change="author" aria-label="סינון לפי כותב">${opt(s.authors, st.author, 'כל הכותבים')}</select>
      ${filtered() ? html`<button class="btn btn-sm btn-ghost" data-act="clear">${icon('x', 14)}<span>ניקוי הסינון</span></button>` : ''}
    </div>
    <div class="cm-areas" role="group" aria-label="סינון לפי אזור בקוד">
      <button class="chip chip-btn ${st.area ? '' : 'on'}" data-act="area" data-area="" aria-pressed="${!st.area}">הכול <b>${num(s.total)}</b></button>
      ${s.areas.filter((a) => a.id !== 'pending').map((a) => html`<button class="chip chip-btn cm-a-${a.id} ${st.area === a.id ? 'on' : ''}" data-act="area" data-area="${a.id}" aria-pressed="${st.area === a.id}"><i class="cm-dot"></i>${areaHe(a.id)} <b>${num(a.n)}</b></button>`)}
    </div>
    ${st.day ? html`<p class="cm-daychip">מוצג רק <b>${day(st.day)}</b> <button class="chip chip-btn" data-act="day" data-day="">${icon('x', 12)} כל הימים</button></p>` : ''}
  </div>`;
}

const lines = (c) => (c.added == null ? html`<span class="cm-pend" title="ספירת השורות ממשיכה ברקע">נספר…</span>`
  : html`<span class="cm-add">+${num(c.added)}</span> <span class="cm-del">−${num(c.deleted)}</span>`);

function row(c) {
  const who = c.agents?.length ? c.agents : [];
  return html`<li data-k="${c.sha}"><button class="cm-row ${det.sha === c.sha ? 'on' : ''}" data-act="open" data-sha="${c.sha}" aria-label="פתיחת הקומיט ${c.sha.slice(0, 7)}">
    <span class="cm-when"><b>${stamp(c.at)}</b>${ago(c.at)}</span>
    <span class="cm-main"><span class="cm-subj" dir="auto">${c.subject}</span>
      <span class="cm-meta">${sha7(c.sha)}<span>${c.author}</span>${who.map((a) => html`<span class="chip chip-sm chip-ai">${a}</span>`)}${c.hasBody ? html`<span class="faint" title="יש הודעה מלאה">¶</span>` : ''}</span></span>
    <span class="cm-area">${c.area ? html`<span class="chip chip-sm cm-a-${c.area}"><i class="cm-dot"></i>${areaHe(c.area)}</span>` : html`<span class="cm-pend">נספר…</span>`}</span>
    <span class="cm-num">${c.files == null ? html`<span class="cm-pend" title="ספירת הקבצים והשורות ממשיכה ברקע">נספר…</span>` : html`<span>${num(c.files)} קבצים</span><span>${lines(c)}</span>`}</span>
  </button></li>`;
}

function drawer() {
  if (!det.sha) return '';
  const r = det.data; const c = r?.commit;
  let body;
  if (det.busy) body = html`<div class="skel"><div class="sk h120"></div><div class="sk h200"></div></div><p class="faint small">קורא את הקומיט מ-git…</p>`;
  else if (!r || r.ok === false) body = html`<p class="note note-bad">${r?.reason || 'לא הצלחתי לקרוא את הקומיט.'}</p>`;
  else {
    const max = Math.max(1, ...c.fileList.map((f) => f.added + f.deleted));
    const msg = String(c.body || '').trim();
    body = html`<h2 class="cm-dt" dir="auto">${c.subject}</h2>
      <dl class="kv kv-row cm-dkv">
        <div><dt>מזהה</dt><dd>${sha7(c.sha)}</dd></div>
        <div><dt>מתי</dt><dd>${stamp(c.at)}</dd></div>
        <div><dt>כותב</dt><dd>${c.author}</dd></div>
        <div><dt>סוכנים</dt><dd>${c.agents?.length ? c.agents.join(', ') : nd('בהודעה אין שורת Co-Authored-By')}</dd></div>
        <div><dt>קבצים</dt><dd>${c.fileCount == null ? nd() : num(c.fileCount)}</dd></div>
        <div><dt>שורות</dt><dd>${c.added == null ? nd() : html`<span class="cm-add">+${num(c.added)}</span> <span class="cm-del">−${num(c.deleted)}</span>`}</dd></div>
        <div><dt>אזור עיקרי</dt><dd>${c.area ? areaHe(c.area) : nd()}</dd></div>
        <div><dt>הורים</dt><dd>${c.parents?.length ? c.parents.map((p) => sha7(p)) : nd()}</dd></div>
      </dl>
      <h3 class="cm-h3">ההודעה המלאה</h3>
      ${msg ? html`<pre class="cm-msg" dir="auto">${msg}</pre>` : html`<p class="faint">לקומיט הזה יש רק שורת כותרת.</p>`}
      <h3 class="cm-h3">מה השתנה (diff stat)${c.fileList.length < (c.fileCount || 0) ? html` <small>· ${num(c.fileList.length)} הגדולים מתוך ${num(c.fileCount)}</small>` : ''}</h3>
      ${c.slow ? html`<p class="note note-warn">git לא ענה בזמן על רשימת הקבצים (הדיסק עמוס). המספרים למעלה מהספירה ברקע.</p>` : ''}
      <ol class="cm-files">${c.fileList.map((f, i) => html`<li style="--i:${Math.min(i, 30)}">${path(f.path)}<span class="cm-fbar" aria-hidden="true"><i class="a" style="width:${(f.added / max) * 100}%"></i><i class="d" style="width:${(f.deleted / max) * 100}%"></i></span>
        <span class="cm-fn">${f.added == null ? 'בינארי' : html`<span class="cm-add">+${num(f.added)}</span> <span class="cm-del">−${num(f.deleted)}</span>`}</span></li>`)}</ol>`;
  }
  return html`<aside class="cm-drawer" data-k="dr-${det.sha}" aria-label="פרטי הקומיט" role="dialog">
    <div class="cm-dh"><p class="eyebrow">קומיט ${sha7(det.sha)}</p><button id="cm-close" class="ib" data-act="close" aria-label="סגירת הפרטים">${icon('x', 16)}</button></div>
    <div class="cm-db">${body}</div></aside>`;
}

async function openSha(sha, ctx) {
  det.sha = sha; det.data = null; det.busy = true; ctx.rerender();
  const r = await ctx.api.get(`/api/cc/commits?sha=${encodeURIComponent(sha)}`);
  if (det.sha !== sha) return;
  det.data = r; det.busy = false; ctx.rerender();
}

export default {
  id: 'commits',
  title: 'היסטוריית קומיטים',
  nav: 'היסטוריית קומיטים',
  glyph: 'commits',
  eyebrow: 'ריפו וידע · git, קריאה בלבד',
  sub: 'כל קומיט מאז היום הראשון: מי כתב, מתי, מה נגע ובכמה שורות. לחיצה על קומיט פותחת את ההודעה המלאה ואת רשימת הקבצים.',
  load: (ctx) => ctx.api.get(`/api/cc/commits${qs() ? `?${qs()}` : ''}`),
  render(d) {
    const s = d.summary;
    const agents = s.agents.filter((a) => !a.name.startsWith('('));
    const span = Math.max(1, Math.round((new Date(s.last) - new Date(s.first)) / 86400000) + 1);
    return html`
    <section class="g g4 cm-stats">
      ${stat({ key: 'cm-total', label: 'קומיטים בהיסטוריה', value: s.total, sub: html`מ-${day(s.first)} עד ${day(s.last)} · ${num(span)} ימים` })}
      ${stat({ key: 'cm-add', label: 'שורות שנוספו', value: s.lines.added, sub: s.lines.pending ? `נספרו ${num(s.lines.counted)} מתוך ${num(s.total)} קומיטים, השאר ברקע` : `ו-${num(s.lines.deleted)} שורות נמחקו` })}
      ${stat({ key: 'cm-agents', label: 'סוכנים שכתבו קוד', value: agents.length, sub: agents.slice(0, 3).map((a) => `${a.name}: ${num(a.n)}`).join(' · ') })}
      ${stat({ key: 'cm-busy', label: 'היום העמוס ביותר', text: s.busiest ? day(s.busiest.day) : '—', sub: s.busiest ? `${num(s.busiest.n)} קומיטים ביום אחד` : '' })}
    </section>
    <section class="card cm-heatcard"><h2>מתי עובדים: יום × שעה <small>כל ריבוע הוא שעה; ככל שהוא בהיר יותר, היו בה יותר קומיטים</small></h2>${heatmap(s)}</section>
    ${filters(d)}
    <section class="card flush cm-list">
      <h2 class="card-h">${filtered() ? html`נמצאו ${num(d.matched)} קומיטים` : html`כל ${num(d.matched)} הקומיטים`}<span class="grow"></span><small>מהחדש לישן · ${num(d.items.length)} בעמוד</small></h2>
      ${d.items.length ? html`<ol class="cm-rows">${d.items.map(row)}</ol>` : html`<p class="empty">אין קומיטים שמתאימים לסינון.</p>`}
      <div class="cm-pgwrap">${pager(d.page, d.pages, 'page')}</div>
    </section>
    ${drawer()}`;
  },
  actions: {
    q(el, ctx) { clearTimeout(typing); typing = setTimeout(() => { st.q = el.value.trim(); st.page = 1; ctx.refresh(); }, 320); },
    agent(el, ctx) { st.agent = el.value; st.page = 1; ctx.refresh(); },
    author(el, ctx) { st.author = el.value; st.page = 1; ctx.refresh(); },
    area(el, ctx) { st.area = el.dataset.area; st.page = 1; ctx.refresh(); },
    day(el, ctx) { st.day = st.day === el.dataset.day ? '' : el.dataset.day; st.page = 1; ctx.refresh(); },
    clear(el, ctx) { Object.assign(st, { q: '', area: '', author: '', agent: '', day: '', page: 1 }); ctx.refresh(); },
    page(el, ctx) { st.page = Number(el.dataset.page) || 1; ctx.refresh().then?.(() => document.querySelector('.cm-list')?.scrollIntoView({ block: 'start', behavior: 'smooth' })); },
    open(el, ctx) { openSha(el.dataset.sha, ctx); },
    close(el, ctx) { det.sha = null; det.data = null; ctx.rerender(); },
  },
  mount(root, ctx) {
    onKey = (e) => { if (e.key === 'Escape' && det.sha && !document.querySelector('dialog[open]')) { det.sha = null; ctx.rerender(); } };
    document.addEventListener('keydown', onKey);
  },
  unmount() { document.removeEventListener('keydown', onKey); det.sha = null; },
};
