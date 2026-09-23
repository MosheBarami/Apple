import { html, num, count, arr, esc, raw } from '../ui.js';

// UI state survives the 60 s refresh
const st = { open: new Set(['']), sel: null, q: '', lang: 'he' };
let index = new Map(); // path -> node
let parent = new Map(); // path -> parent path
let seeded = false;

const kids = (n) => arr(n?.dirs);
const pathOf = (n) => n?.path ?? '';
function reindex(root) {
  index = new Map(); parent = new Map();
  const walk = (n, up) => { index.set(pathOf(n), n); if (up != null) parent.set(pathOf(n), up); kids(n).forEach((k) => walk(k, pathOf(n))); };
  walk(root, null);
  if (!seeded) { st.open.add(pathOf(root)); seeded = true; }
}
function toggle(p, ctx) { if (st.open.has(p)) st.open.delete(p); else st.open.add(p); repaintTree(ctx); ctx.root.querySelector(`.tn-n[data-p="${CSS.escape(p)}"]`)?.focus(); }
const hay = (n) => `${n.name || ''} ${pathOf(n)} ${n.he || ''} ${n.en || ''}`.toLowerCase();
function totalFiles(n) { return (count(n.files) || 0) + kids(n).reduce((s, k) => s + totalFiles(k), 0); }

/** Nodes matching the query plus their ancestors (so matches stay reachable). */
function visibleSet(root, q) {
  if (!q) return null;
  const keep = new Set();
  const walk = (n, trail) => {
    let hit = hay(n).includes(q);
    for (const k of kids(n)) if (walk(k, [...trail, n])) hit = true;
    if (hit) { keep.add(pathOf(n)); trail.forEach((a) => keep.add(pathOf(a))); }
    return hit;
  };
  walk(root, []);
  return keep;
}
function mark(text, q) {
  const s = String(text ?? ''); if (!q) return esc(s);
  const i = s.toLowerCase().indexOf(q); if (i < 0) return esc(s);
  return `${esc(s.slice(0, i))}<mark>${esc(s.slice(i, i + q.length))}</mark>${esc(s.slice(i + q.length))}`;
}

function nodeHtml(n, depth, vis, q) {
  const p = pathOf(n); if (vis && !vis.has(p)) return '';
  const ks = kids(n); const open = vis ? true : st.open.has(p); const sel = st.sel === p;
  return html`<li role="treeitem" aria-level="${depth + 1}" ${ks.length ? raw(`aria-expanded="${open}"`) : ''} aria-selected="${sel}">
    <div class="tn ${sel ? 'on' : ''}" style="--d:${depth}">
      ${ks.length ? html`<button class="tn-c" data-act="toggle" data-p="${p}" aria-label="${open ? 'סגירת' : 'פתיחת'} ${n.name}" tabindex="-1">${open ? '▼' : '◀'}</button>` : html`<span class="tn-c" aria-hidden="true"></span>`}
      <button class="tn-n" data-act="select" data-key="treekey" data-p="${p}"><span class="tn-ic" aria-hidden="true">${open && ks.length ? '📂' : '📁'}</span><bdi class="ltr">${raw(mark(n.name || '/', q))}</bdi><span class="tn-k">${num(count(n.files) ?? 0)}</span></button>
    </div>
    ${ks.length && open ? html`<ul role="group">${ks.map((k) => nodeHtml(k, depth + 1, vis, q))}</ul>` : ''}
  </li>`;
}

function detail(n) {
  if (!n) return html`<p class="empty">בחרו תיקייה מהעץ כדי לראות מה יש בה.</p>`;
  const txt = st.lang === 'he' ? n.he || n.en : n.en || n.he;
  const docs = arr(n.docs); const ks = kids(n);
  return html`<div class="dt-h">
      <div><h2 class="dt-name"><bdi class="ltr">${n.name || '/'}</bdi></h2><p class="mono faint ltr-block">${pathOf(n) || '/'}</p></div>
      <div class="seg" role="group" aria-label="שפת ההסבר">
        <button class="seg-b ${st.lang === 'he' ? 'on' : ''}" aria-pressed="${st.lang === 'he'}" data-act="lang" data-l="he">עברית</button>
        <button class="seg-b ${st.lang === 'en' ? 'on' : ''}" aria-pressed="${st.lang === 'en'}" data-act="lang" data-l="en">English</button>
      </div></div>
    <p class="dt-x" dir="${st.lang === 'en' ? 'ltr' : 'rtl'}" lang="${st.lang}">${txt || (st.lang === 'he' ? 'עוד אין הסבר לתיקייה הזו.' : 'No explanation yet.')}</p>
    <dl class="kv kv-row">
      <div><dt>קבצים כאן</dt><dd>${num(count(n.files) ?? 0)}</dd></div>
      <div><dt>תתי-תיקיות</dt><dd>${num(ks.length)}</dd></div>
      <div><dt>קבצים כולל הכל</dt><dd>${num(totalFiles(n))}</dd></div>
    </dl>
    ${docs.length ? html`<h3 class="dt-s">מסמכים</h3><ul class="docs">${docs.map((d) => html`<li><a href="${d.url}" target="_blank" rel="noopener noreferrer">📄 <bdi>${d.label || d.url}</bdi> <span class="faint" aria-hidden="true">↗</span><span class="sr">(נפתח בלשונית חדשה)</span></a></li>`)}</ul>` : ''}
    ${n.readme ? html`<h3 class="dt-s">מתוך ה-README</h3><pre class="readme" dir="auto">${String(n.readme).slice(0, 1600)}</pre>` : ''}
    ${ks.length ? html`<h3 class="dt-s">תתי-תיקיות</h3><div class="subs">${ks.map((k) => html`<button class="chip chip-btn" data-act="select" data-p="${pathOf(k)}"><bdi class="ltr">${k.name}</bdi> <span class="faint">${num(count(k.files) ?? 0)}</span></button>`)}</div>` : ''}`;
}

function treeHtml(root) {
  const q = st.q.trim().toLowerCase(); const vis = visibleSet(root, q);
  if (vis && !vis.size) return html`<p class="empty">לא נמצאה תיקייה עם "${st.q}".</p>`;
  return html`<ul role="tree" aria-label="תיקיות הריפו" class="tree">${nodeHtml(root, 0, vis, q)}</ul>`;
}
function repaintTree(ctx) { const t = ctx.root.querySelector('#tree'); if (t) t.innerHTML = treeHtml(ctx.data.root).s; }
function repaintDetail(ctx) { const t = ctx.root.querySelector('#detail'); if (t) t.innerHTML = detail(index.get(st.sel)).s; }

export default {
  id: 'explorer', title: 'מפת הריפו', icon: '▤', endpoint: '/api/cc/tree',
  sub: 'כל תיקייה בפרויקט, ומה היא עושה, בשפה פשוטה',
  render(d) {
    if (!d.root) return html`<p class="empty">השרת לא החזיר עץ תיקיות.</p>`;
    reindex(d.root);
    if (st.sel == null || !index.has(st.sel)) st.sel = pathOf(d.root);
    return html`<div class="explorer">
      <aside class="card tree-card" aria-label="עץ תיקיות">
        <label class="search"><span class="sr">חיפוש תיקייה</span><span aria-hidden="true">⌕</span>
          <input id="tree-q" type="search" placeholder="חיפוש תיקייה…" value="${st.q}" data-input="search" autocomplete="off"></label>
        <div id="tree" class="tree-scroll">${treeHtml(d.root)}</div>
      </aside>
      <section class="card detail" id="detail" aria-live="polite">${detail(index.get(st.sel))}</section>
    </div>`;
  },
  actions: {
    toggle: (el, ctx) => toggle(el.dataset.p, ctx),
    select(el, ctx) {
      const p = el.dataset.p; st.sel = p;
      // open the path down to the selection
      for (let a = p; a != null; a = parent.get(a)) st.open.add(a);
      repaintTree(ctx); repaintDetail(ctx);
      const b = ctx.root.querySelector(`.tn-n[data-p="${CSS.escape(p)}"]`); if (el.closest('#tree')) b?.focus(); else b?.scrollIntoView({ block: 'nearest' });
    },
    lang(el, ctx) { st.lang = el.dataset.l; repaintDetail(ctx); ctx.root.querySelector(`[data-act="lang"][data-l="${st.lang}"]`)?.focus(); },
    search(el, ctx) { st.q = el.value; repaintTree(ctx); },
    treekey(el, ctx, e) {
      // arrow keys: up/down move, left/right open/close (RTL: ← opens, → closes)
      const all = [...ctx.root.querySelectorAll('#tree .tn-n')]; const i = all.indexOf(el); const p = el.dataset.p; const n = index.get(p);
      if (e.key === 'ArrowDown') { e.preventDefault(); all[i + 1]?.focus(); } else if (e.key === 'ArrowUp') { e.preventDefault(); all[i - 1]?.focus(); } else if ((e.key === 'ArrowLeft' && !st.open.has(p)) || (e.key === 'ArrowRight' && st.open.has(p))) {
        if (kids(n).length) { e.preventDefault(); toggle(p, ctx); }
      }
    },
  },
};
