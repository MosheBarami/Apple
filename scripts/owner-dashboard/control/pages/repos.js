import { html, num, ago, arr, light, extLink, isNum } from '../ui.js';

const st = { q: '', source: '', status: '', sort: 'pushed', limit: 100 };
const PAGE = 100;
const STATUS = {
  ok: ['ok', 'תקין'], stale: ['warn', 'לא עודכן מזמן'], archived: ['off', 'בארכיון'], missing: ['bad', 'לא נמצא'],
};
const statusLight = (s) => { const [c, l] = STATUS[s] || ['off', s || 'לא ידוע']; return light(c, l); };

function filtered(repos) {
  const q = st.q.trim().toLowerCase();
  const out = repos.filter((r) => (!st.source || arr(r.sources).includes(st.source)) && (!st.status || r.status === st.status)
    && (!q || `${r.owner}/${r.name} ${r.description || ''} ${arr(r.usedBy).join(' ')} ${r.npm || ''}`.toLowerCase().includes(q)));
  const t = (d) => (d ? new Date(d).getTime() || 0 : 0);
  const by = { pushed: (a, b) => t(b.pushedAt) - t(a.pushedAt), stars: (a, b) => (b.stars || 0) - (a.stars || 0), name: (a, b) => `${a.owner}/${a.name}`.localeCompare(`${b.owner}/${b.name}`) }[st.sort];
  return out.sort(by);
}

function rows(repos) {
  const list = filtered(repos);
  if (!list.length) return html`<p class="empty">אין מאגרים שמתאימים לסינון.</p>`;
  const shown = list.slice(0, st.limit);
  return html`<p class="faint small" aria-live="polite">מוצגים ${num(shown.length)} מתוך ${num(list.length)}${list.length < repos.length ? ` (מסוננים מתוך ${num(repos.length)})` : ''}</p>
  <div class="tbl-wrap"><table class="tbl repos">
    <thead><tr><th scope="col">מצב</th><th scope="col">מאגר</th><th scope="col">כוכבים</th><th scope="col">עדכון אחרון</th><th scope="col">רישיון</th><th scope="col">משמש את</th></tr></thead>
    <tbody>${shown.map((r) => html`<tr>
      <td data-l="מצב">${statusLight(r.status)}</td>
      <td data-l="מאגר" class="rp-name">${extLink(r.url || `https://github.com/${r.owner}/${r.name}`, html`<bdi class="ltr"><span class="faint">${r.owner}/</span><b>${r.name}</b></bdi>`)}
        ${r.version ? html` <span class="chip chip-sm ltr">${r.version}</span>` : ''}${r.archived ? html` <span class="chip chip-sm chip-off">archived</span>` : ''}
        ${r.description ? html`<p class="rp-desc" dir="auto">${r.description}</p>` : ''}
        ${arr(r.sources).length ? html`<div class="rp-src">${arr(r.sources).map((s) => html`<span class="chip chip-sm">${s}</span>`)}</div>` : ''}</td>
      <td data-l="כוכבים" class="mono">${isNum(r.stars) ? html`★ ${num(r.stars)}` : '—'}</td>
      <td data-l="עדכון אחרון">${ago(r.pushedAt)}</td>
      <td data-l="רישיון"><bdi class="ltr small">${r.license || '—'}</bdi></td>
      <td data-l="משמש את">${arr(r.usedBy).length ? html`<div class="rp-src">${arr(r.usedBy).slice(0, 6).map((u) => html`<bdi class="chip chip-sm ltr">${u}</bdi>`)}${arr(r.usedBy).length > 6 ? html`<span class="faint small">+${num(arr(r.usedBy).length - 6)}</span>` : ''}</div>` : html`<span class="faint">—</span>`}</td>
    </tr>`)}</tbody></table></div>
  ${list.length > shown.length ? html`<p class="more-row"><button id="rp-more" class="btn" data-act="more">הצג עוד ${num(Math.min(PAGE, list.length - shown.length))}</button></p>` : ''}`;
}

export default {
  id: 'repos', title: 'מאגרי GitHub', icon: '⎇', endpoint: '/api/cc/repos',
  sub: 'כל הקוד החיצוני שהפרויקט נשען עליו, ומה המצב של כל אחד',
  render(d) {
    const repos = arr(d.repos); const c = d.counts || {};
    const sources = [...new Set([...Object.keys(c.bySource || {}), ...repos.flatMap((r) => arr(r.sources))])].sort();
    const n = (k) => (isNum(c[k]) ? c[k] : k === 'total' ? repos.length : repos.filter((r) => r.status === k).length);
    const chip = (k, label, cls) => html`<button id="sum-${k}" class="sum ${cls} ${st.status === (k === 'total' ? '' : k) ? 'on' : ''}" data-act="status" data-s="${k === 'total' ? '' : k}" aria-pressed="${st.status === (k === 'total' ? '' : k)}"><b>${num(n(k))}</b><span>${label}</span></button>`;
    return html`
      <div class="sums" role="group" aria-label="סיכום לפי מצב">
        ${chip('total', 'סה״כ', '')}${chip('ok', 'תקינים', 'sum-ok')}${chip('stale', 'לא עודכנו מזמן', 'sum-warn')}${chip('archived', 'בארכיון', 'sum-off')}${chip('missing', 'לא נמצאו', 'sum-bad')}
      </div>
      <p class="explain mb">"לא עודכן מזמן" = אף אחד לא נגע בקוד שם הרבה זמן, אז כדאי לחפש חלופה בהמשך. "לא נמצא" = הקישור שבור או שהמאגר נמחק.</p>
      <section class="card">
        <div class="filters">
          <label class="search grow"><span class="sr">חיפוש מאגר</span><span aria-hidden="true">⌕</span><input id="rp-q" type="search" placeholder="חיפוש לפי שם, תיאור או מי משתמש…" value="${st.q}" data-input="q" autocomplete="off"></label>
          <label class="sel"><span>מקור</span><select id="rp-src" data-change="source"><option value="">הכל</option>${sources.map((s) => html`<option value="${s}" ${st.source === s ? 'selected' : ''}>${s}${c.bySource?.[s] != null ? ` (${c.bySource[s]})` : ''}</option>`)}</select></label>
          <label class="sel"><span>מצב</span><select id="rp-st" data-change="statusSel"><option value="">הכל</option>${Object.entries(STATUS).map(([k, [, l]]) => html`<option value="${k}" ${st.status === k ? 'selected' : ''}>${l}</option>`)}</select></label>
          <label class="sel"><span>מיון</span><select id="rp-sort" data-change="sort"><option value="pushed" ${st.sort === 'pushed' ? 'selected' : ''}>עדכון אחרון</option><option value="stars" ${st.sort === 'stars' ? 'selected' : ''}>כוכבים</option><option value="name" ${st.sort === 'name' ? 'selected' : ''}>שם</option></select></label>
        </div>
        <div id="rp-rows">${rows(repos)}</div>
      </section>`;
  },
  actions: {
    more(el, ctx) { st.limit += PAGE; ctx.root.querySelector('#rp-rows').innerHTML = rows(arr(ctx.data.repos)).s; ctx.root.querySelector('#rp-more')?.focus(); },
    q(el, ctx) { st.q = el.value; st.limit = PAGE; ctx.root.querySelector('#rp-rows').innerHTML = rows(arr(ctx.data.repos)).s; },
    source(el, ctx) { st.source = el.value; st.limit = PAGE; ctx.rerender(); },
    statusSel(el, ctx) { st.status = el.value; st.limit = PAGE; ctx.rerender(); },
    sort(el, ctx) { st.sort = el.value; ctx.rerender(); },
    status(el, ctx) { st.status = el.dataset.s; st.limit = PAGE; ctx.rerender(); },
  },
};
