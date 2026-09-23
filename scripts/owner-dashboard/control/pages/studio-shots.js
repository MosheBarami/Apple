// צילומי Roblox Studio: every picture the repository keeps of what Apple built (GET /api/cc/studio-shots),
// grouped by the round, test or folder it belongs to. Each group says plainly what kind of picture it
// is (a real Studio capture, a geometry render made without Studio, or someone else's game used as a
// reference), with the note beside it; each caption comes from the file name or the log/README next
// to it. Click a picture to open it large; the arrows walk through its group.
import { html, num } from '../ui.js';
import { stat } from './kit.js';
import { nd, day, stamp, path, thumb, lightbox } from './repo-kit.js';

const FOLD = 12;
const st = { kind: '', open: new Set() };
let sets = {};

const range = (g) => {
  if (!g.from) return nd('לא נמצא תאריך לקבצים');
  const a = day(g.from); const b = day(g.to);
  return a === b ? a : `${a} עד ${b}`;
};
const item = (g, s) => ({
  url: s.url, title: s.caption || s.name,
  caption: [s.captionFrom ? `הכיתוב מתוך ${s.captionFrom}` : 'הכיתוב משם הקובץ', s.commit ? `נוסף בקומיט: ${s.commit.subject}` : ''].filter(Boolean).join(' · '),
  meta: `${g.title} · ${stamp(s.at)} · ${s.path}`,
});

function group(g, gi, kinds) {
  const shots = g.shots; const open = st.open.has(g.id);
  const shown = open ? shots : shots.slice(0, FOLD);
  sets[g.id] = shots.map((s) => item(g, s));
  let lastSub = null;
  const m = g.meta;
  return html`<section class="card ss-g ss-${g.kind}" data-k="g-${g.id}" style="--i:${Math.min(gi, 8)}" id="ss-${g.id}">
    <header class="ss-gh">
      <div class="ss-gt"><h2 dir="auto">${g.title}</h2><p><span class="ss-kind">${g.kindHe || kinds[g.kind] || g.kind}</span><span>${num(g.count)} תמונות</span><span>${range(g)}</span></p></div>
      ${path(g.dir)}
    </header>
    ${g.about?.text ? html`<blockquote class="ss-about"><p dir="auto">${g.about.text}</p><footer>${path(g.about.from)}</footer></blockquote>` : ''}
    ${m ? html`<dl class="ss-meta">${m.lane ? html`<div><dt>מסלול</dt><dd>${m.lane}</dd></div>` : ''}${m.model ? html`<div><dt>מודל</dt><dd class="mono">${m.model}</dd></div>` : ''}${m.generatedAt ? html`<div><dt>נוצר</dt><dd>${stamp(m.generatedAt)}</dd></div>` : ''}${m.renderer && !g.about?.text?.includes(m.renderer) ? html`<div class="w"><dt>איך צויר</dt><dd dir="auto">${m.renderer}</dd></div>` : ''}</dl>` : ''}
    <div class="ss-grid">${shown.map((s, i) => {
      const head = s.sub !== lastSub && s.sub ? html`<p class="ss-sub">${path(s.sub)}</p>` : '';
      lastSub = s.sub;
      return html`${head}<figure class="ss-f" style="--j:${Math.min(i, 16)}">${thumb({ url: s.url, title: s.caption || s.name }, g.id, i)}<figcaption dir="auto" title="${s.caption || s.name}">${s.caption || s.name}</figcaption></figure>`;
    })}</div>
    ${shots.length > FOLD ? html`<button class="btn btn-sm btn-ghost ss-more" data-act="more" data-g="${g.id}" aria-expanded="${open}">${open ? 'להציג פחות' : `להציג את כל ${num(shots.length)} התמונות`}</button>` : ''}
  </section>`;
}

export default {
  id: 'studio-shots',
  title: 'צילומי Roblox Studio',
  nav: 'צילומי Studio',
  glyph: 'camera',
  eyebrow: 'ריפו וידע · מה Apple בנה, בתמונות',
  sub: 'כל התמונות שנשמרו בריפו, לפי סבב, מבחן ותיקייה. לכל קבוצה כתוב אם זה צילום אמיתי מ-Studio, רינדור שנבנה בלי Studio, או תמונת ייחוס ממשחק אחר.',
  endpoint: '/api/cc/studio-shots',
  render(d) {
    const c = d.counts; const k = c.byKind || {};
    const groups = d.groups.filter((g) => !st.kind || g.kind === st.kind);
    sets = {};
    return html`
    <section class="g g4">
      ${stat({ key: 'ss-n', label: 'תמונות בריפו', value: c.total, sub: `ב-${num(c.groups)} קבוצות · ${num(c.datedByGit)} מתוארכות לפי git` })}
      ${stat({ key: 'ss-st', label: 'צילומים מתוך Studio', value: k.studio || 0, sub: d.kinds.studio })}
      ${stat({ key: 'ss-r', label: 'רינדורים בלי Studio', value: k.render || 0, sub: d.kinds.render })}
      ${stat({ key: 'ss-c', label: 'עם כיתוב מהמסמכים', value: c.captioned, sub: 'השאר: כיתוב משם הקובץ' })}
    </section>
    <section class="card ss-bar">
      <div class="ss-chips" role="group" aria-label="סוג התמונה">
        <button class="chip chip-btn ${st.kind ? '' : 'on'}" data-act="kind" data-v="" aria-pressed="${!st.kind}">הכול <small>${num(c.total)}</small></button>
        ${Object.keys(d.kinds).map((x) => html`<button class="chip chip-btn ss-c-${x} ${st.kind === x ? 'on' : ''}" data-act="kind" data-v="${x}" aria-pressed="${st.kind === x}"><i class="ss-dot"></i>${d.kinds[x]} <small>${num(k[x] || 0)}</small></button>`)}
      </div>
      <nav class="ss-jump" aria-label="מעבר לקבוצה">${groups.map((g) => html`<button class="ss-j" data-act="jump" data-g="${g.id}">${g.title}<small>${num(g.count)}</small></button>`)}</nav>
    </section>
    ${groups.length ? groups.map((g, i) => group(g, i, d.kinds)) : html`<p class="empty">אין תמונות מהסוג הזה.</p>`}`;
  },
  actions: {
    kind(el, ctx) { st.kind = el.dataset.v; ctx.rerender(); },
    more(el, ctx) { const g = el.dataset.g; if (st.open.has(g)) st.open.delete(g); else st.open.add(g); ctx.rerender(); },
    jump(el) { document.getElementById(`ss-${el.dataset.g}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }); },
    lb(el) { lightbox(sets[el.dataset.set], Number(el.dataset.i)); },
  },
};
