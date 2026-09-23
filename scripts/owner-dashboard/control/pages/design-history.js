// היסטוריית עיצוב: how the product looked and why, since the day it was called Golem. Every row is
// real (GET /api/cc/design-history): commits that touched style, layout, brand or design-doc files,
// screenshots placed on the day git (or their file name) dates them, and the design decisions from
// docs/DECISIONS.md and docs/autonomy/DECISIONS.md. Oldest first, so it reads as the story it is.
import { html, num } from '../ui.js';
import { stat } from './kit.js';
import { nd, day, stamp, sha7, path, thumb, lightbox } from './repo-kit.js';

const KIND_HE = { style: 'עיצוב (CSS)', layout: 'מבנה עמוד', brand: 'מותג', doc: 'מסמך עיצוב', shot: 'צילום מסך' };
const APP_HE = { web: 'אפליקציית הווב', site: 'האתר', docs: 'מסמכים', both: 'שתיהן' };
const FROM_HE = { git: 'תאריך הקומיט שהוסיף את הקובץ', name: 'תאריך משם הקובץ', mtime: 'תאריך שינוי הקובץ בדיסק' };
const FOLD = 6; const FOLD_SHOTS = 8;
const st = { era: '', app: '', kind: '', open: new Set() };
let sets = {};

const demd = (s) => String(s || '').replace(/\*\*|`/g, '');
const dkey = (at) => (at ? String(at).slice(0, 10) : '');
const appOk = (a) => !st.app || a === st.app || (a === 'both' && (st.app === 'web' || st.app === 'site'));
const cOk = (c) => (!st.era || c.era === st.era) && (!st.app || c.apps.includes(st.app)) && (!st.kind || c.kinds[st.kind]);
const sOk = (s) => (!st.era || s.era === st.era) && appOk(s.app) && (!st.kind || st.kind === 'shot');
const shotItem = (s) => ({
  url: s.url, title: s.name, badge: APP_HE[s.app] || s.app,
  caption: `${s.group} · ${s.folder}${s.commit ? ` · נוסף בקומיט: ${s.commit.subject}` : ''}`,
  meta: `${stamp(s.at)} · ${FROM_HE[s.dateFrom] || 'לא מתועד'} · ${num(s.kb)} ק״ב`,
});

function eraBanner(d) {
  const g = d.era?.golem; const a = d.era?.apple;
  if (!g || !a) return html`<section class="card">${nd('לא נמצא קומיט שינוי השם')}</section>`;
  const now = new Date(d.fetchedAt);
  const gd = Math.max(1, (new Date(g.to) - new Date(g.from)) / 864e5); const ad = Math.max(1, (now - new Date(a.from)) / 864e5);
  const n = (era) => ({ c: d.timeline.filter((x) => x.era === era).length, s: d.shots.filter((x) => x.era === era).length });
  const gn = n('golem'); const an = n('apple');
  return html`<section class="card dh-era">
    <div class="dh-era-bar">
      <div class="dh-e golem" style="flex:${gd.toFixed(1)}"><b>Golem</b><span>${day(g.from)} עד ${day(g.to)}</span><small>${num(gn.c)} שינויי עיצוב · ${num(gn.s)} צילומים</small></div>
      <div class="dh-e apple" style="flex:${ad.toFixed(1)}"><b>Apple</b><span>מ-${day(a.from)} ועד היום</span><small>${num(an.c)} שינויי עיצוב · ${num(an.s)} צילומים</small></div>
    </div>
    <dl class="dh-era-kv">
      <div><dt>הקומיט הראשון</dt><dd>${sha7(g.firstCommit?.sha)} <span dir="auto">${g.firstCommit?.subject}</span></dd></div>
      <div><dt>שינוי השם ל-Apple</dt><dd>${sha7(a.commit?.sha)} <span dir="auto">${a.commit?.subject}</span></dd></div>
    </dl></section>`;
}

function chips(label, key, opts) {
  return html`<div class="dh-chips" role="group" aria-label="${label}"><span class="dh-cl">${label}</span>
    ${opts.map(([v, t, n]) => html`<button class="chip chip-btn ${st[key] === v ? 'on' : ''}" data-act="f" data-f="${key}" data-v="${v}" aria-pressed="${st[key] === v}">${t}${n != null ? html` <small>${num(n)}</small>` : ''}</button>`)}</div>`;
}

function filters(d) {
  const cnt = (f) => d.timeline.filter(f).length;
  return html`<section class="card dh-filters">
    ${chips('תקופה', 'era', [['', 'הכול'], ['golem', 'Golem', cnt((c) => c.era === 'golem')], ['apple', 'Apple', cnt((c) => c.era === 'apple')]])}
    ${chips('איפה', 'app', [['', 'הכול'], ...['web', 'site', 'docs'].map((a) => [a, APP_HE[a], cnt((c) => c.apps.includes(a))])])}
    ${chips('סוג השינוי', 'kind', [['', 'הכול'], ...Object.keys(KIND_HE).map((k) => [k, KIND_HE[k], k === 'shot' ? d.shots.length : cnt((c) => c.kinds[k])])])}
  </section>`;
}

const cRow = (c, i) => {
  const files = c.files.length + (c.more || 0);
  return html`<li class="dh-c" style="--i:${i}">
    <p class="dh-c-t">${sha7(c.sha)}<span dir="auto">${c.subject}</span></p>
    <div class="dh-c-m">${Object.keys(c.kinds).map((k) => html`<span class="chip chip-sm dh-k-${k}">${KIND_HE[k] || k}</span>`)}
      ${c.apps.map((a) => html`<span class="dh-app">${APP_HE[a] || a}</span>`)}
      <span class="faint">${stamp(c.at)}${c.agents.length ? ` · ${c.agents.join(', ')}` : ''}</span>
      <details class="dh-f"><summary>${num(files)} קבצים</summary><ul>${c.files.map((f) => html`<li>${path(f)}</li>`)}${c.more ? html`<li class="faint">ועוד ${num(c.more)}</li>` : ''}</ul></details></div></li>`;
};

function timeline(d) {
  const days = new Map();
  const slot = (k) => days.get(k) || days.set(k, { c: [], s: [] }).get(k);
  d.timeline.filter(cOk).forEach((c) => slot(dkey(c.at)).c.push(c));
  d.shots.filter(sOk).forEach((s) => slot(dkey(s.at)).s.push(s));
  const keys = [...days.keys()].filter(Boolean).sort();
  if (!keys.length) return html`<p class="empty">אין שינויים שמתאימים לסינון.</p>`;
  const rename = dkey(d.era?.apple?.from);
  sets = {};
  let passed = false;
  return html`<ol class="dh-tl">${keys.map((k, di) => {
    const x = days.get(k); x.c.sort((a, b) => a.at.localeCompare(b.at)); x.s.sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const open = st.open.has(k); const era = k < rename ? 'golem' : 'apple';
    const cs = open ? x.c : x.c.slice(0, FOLD); const ss = open ? x.s : x.s.slice(0, FOLD_SHOTS);
    sets[k] = x.s.map(shotItem);
    const hidden = (x.c.length - cs.length) + (x.s.length - ss.length);
    const divider = !passed && k >= rename ? ((passed = true), html`<li class="dh-rename" data-k="rename"><span>כאן Golem הפך ל-Apple</span>${sha7(d.era.apple.commit?.sha)}</li>`) : '';
    return html`${divider}<li class="dh-day ${era}" data-k="d-${k}" style="--i:${Math.min(di, 12)}">
      <header class="dh-dh"><h3>${day(k)}</h3><span>${x.c.length ? `${num(x.c.length)} שינויים` : ''}${x.c.length && x.s.length ? ' · ' : ''}${x.s.length ? `${num(x.s.length)} צילומים` : ''}</span></header>
      ${cs.length ? html`<ol class="dh-cs">${cs.map(cRow)}</ol>` : ''}
      ${ss.length ? html`<div class="dh-shots">${ss.map((s, i) => thumb(sets[k][i], k, i))}</div>` : ''}
      ${hidden || open ? html`<button class="btn btn-sm btn-ghost dh-more" data-act="more" data-day="${k}" aria-expanded="${open}">${open ? 'לקפל את היום' : `להציג עוד ${num(hidden)} מהיום הזה`}</button>` : ''}
    </li>`;
  })}</ol>`;
}

function decisions(d) {
  if (!d.decisions?.length) return html`<div class="card">${nd('לא נמצאו החלטות עיצוב במסמכי ההחלטות')}</div>`;
  return html`<div class="dh-decs">${d.decisions.map((x, i) => html`<article class="card dh-dec" style="--i:${i}">
    <p class="dh-dec-h"><span class="chip chip-sm chip-ai">${x.id}</span><span class="faint small">${x.date ? day(x.date) : 'בלי תאריך במסמך'}</span></p>
    <h3 dir="auto">${demd(x.title.replace(/^[A-Z]+-[\w-]+\s+—\s+/, ''))}</h3>
    ${x.long ? html`<p class="dh-dec-t" dir="auto">${demd(x.text).slice(0, 420)}…</p><details class="dh-f"><summary>הנוסח המלא</summary><pre dir="auto">${demd(x.text)}</pre></details>` : html`<p class="dh-dec-t" dir="auto">${demd(x.text)}</p>`}
    <p class="dh-src">${path(x.file)}</p></article>`)}</div>`;
}

export default {
  id: 'design-history',
  title: 'היסטוריית עיצוב',
  nav: 'היסטוריית עיצוב',
  glyph: 'palette',
  eyebrow: 'ריפו וידע · מ-Golem ועד Apple',
  sub: 'כל שינוי בקבצי העיצוב והמבנה, כל צילום מסך במקום שלו בזמן, וההחלטות שהובילו לשם. מהיום הראשון ועד היום.',
  endpoint: '/api/cc/design-history',
  render(d) {
    const c = d.counts || {};
    return html`
    <section class="g g4">
      ${stat({ key: 'dh-c', label: 'שינויי עיצוב', value: c.commits, sub: d.progress && !d.progress.complete ? `נסרקו ${num(d.progress.scanned)} מתוך ${num(d.progress.total)} קומיטים` : `מתוך ${num(d.progress?.total)} קומיטים בריפו` })}
      ${stat({ key: 'dh-s', label: 'צילומי מסך', value: c.shots, sub: `${num(c.shotsDatedByGit)} מתוארכים לפי git` })}
      ${stat({ key: 'dh-d', label: 'החלטות עיצוב', value: d.decisions.length, sub: 'מתוך שני מסמכי ההחלטות' })}
      ${stat({ key: 'dh-doc', label: 'מסמכי עיצוב', value: d.docs.length, sub: 'מפרטים, נעילות והנחיות' })}
    </section>
    <div class="rk-sec"><h2>שתי תקופות</h2><p>הרוחב של כל תקופה הוא לפי מספר הימים שלה.</p></div>
    ${eraBanner(d)}
    <div class="rk-sec"><h2>ציר הזמן</h2><p>מהישן לחדש. לחיצה על צילום מגדילה אותו; החצים עוברים בין הצילומים של אותו יום.</p></div>
    ${filters(d)}
    ${timeline(d)}
    <div class="rk-sec"><h2>החלטות העיצוב</h2><p>כפי שנרשמו, עם התאריך מהמסמך.</p></div>
    ${decisions(d)}
    <div class="rk-sec"><h2>מסמכי העיצוב</h2></div>
    <section class="card flush"><ul class="dh-docs">${d.docs.map((x, i) => html`<li style="--i:${i}"><b dir="auto">${demd(x.title)}</b>${x.lead ? html`<p dir="auto">${demd(x.lead)}</p>` : ''}${path(x.path)}</li>`)}</ul></section>`;
  },
  actions: {
    f(el, ctx) { const k = el.dataset.f; st[k] = st[k] === el.dataset.v ? '' : el.dataset.v; ctx.rerender(); },
    more(el, ctx) { const k = el.dataset.day; if (st.open.has(k)) st.open.delete(k); else st.open.add(k); ctx.rerender(); },
    lb(el) { lightbox(sets[el.dataset.set], Number(el.dataset.i)); },
  },
};
