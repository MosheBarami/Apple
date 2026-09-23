// Shared pieces of the repository pages (commits, models, design-history, studio-shots, repo-health):
// Hebrew names for the commit areas, the "לא מתועד" placeholder for a fact the repository does not
// record, dates, a pager, and the image lightbox (a <dialog> of its own, outside the page, so the
// 20-second morph refresh never touches it). Styles: control/skins/repo-kit.css.
import { html, num } from '../ui.js';
import { icon } from '../logos.js';

export const AREA_HE = {
  dashboard: 'לוח הבקרה', worker: 'השרת (Worker)', web: 'אפליקציית הווב', site: 'האתר', plugin: 'הפלאגין', training: 'אימון מודלים',
  corpus: 'קורפוס הידע', library: 'ספריית הנכסים', packages: 'חבילות משותפות', infra: 'תשתית ו-CI', graph: 'גרף הידע', agents: 'סוכנים ותכנון',
  docs: 'מסמכים', tests: 'בדיקות', scripts: 'סקריפטים', config: 'הגדרות', other: 'אחר', pending: 'עוד נספר',
};
export const areaHe = (id) => AREA_HE[id] || id || 'לא מתועד';

/** A missing fact: said plainly, never shown as zero. */
export const nd = (why) => html`<span class="rk-nd" ${why ? html`title="${why}"` : ''}>לא מתועד</span>`;
/** v when it is a real value, else "לא מתועד". */
export const or = (v, fmt = (x) => x) => (v == null || v === '' || (typeof v === 'number' && !Number.isFinite(v)) ? nd() : fmt(v));

const D = (d) => { const t = d ? new Date(d) : null; return t && !Number.isNaN(t.getTime()) ? t : null; };
export const day = (d) => { const t = D(d); return t ? t.toLocaleDateString('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'; };
export const dayShort = (d) => { const t = D(d); return t ? t.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }) : '—'; };
export const stamp = (d) => { const t = D(d); return t ? t.toLocaleString('he-IL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; };
export const sha7 = (s) => html`<bdi class="rk-sha mono" dir="ltr">${String(s || '').slice(0, 7)}</bdi>`;
export const path = (p) => html`<bdi class="rk-path mono" dir="ltr">${p}</bdi>`;

/** Page buttons: ‹ 1 … 4 5 [6] 7 8 … 41 ›, each carrying data-page for the page's own action. */
export function pager(page, pages, act) {
  if (pages <= 1) return '';
  const want = new Set([1, pages, page - 2, page - 1, page, page + 1, page + 2].filter((n) => n >= 1 && n <= pages));
  const list = [...want].sort((a, b) => a - b); const out = []; let last = 0;
  for (const n of list) { if (n - last > 1) out.push(html`<span class="rk-gap" aria-hidden="true">…</span>`); out.push(n); last = n; }
  const b = (n, label, dis, cur) => html`<button class="rk-pg ${cur ? 'on' : ''}" data-act="${act}" data-page="${n}" ${dis ? 'disabled' : ''} ${cur ? html`aria-current="page"` : ''} aria-label="${label}">${typeof label === 'string' && /^\d/.test(label) ? num(n) : label}</button>`;
  return html`<nav class="rk-pager" aria-label="דפים">
    ${b(page - 1, 'הקודם', page <= 1)}${out.map((x) => (typeof x === 'number' ? b(x, String(x), false, x === page) : x))}${b(page + 1, 'הבא', page >= pages)}
    <span class="rk-pginfo">עמוד ${num(page)} מתוך ${num(pages)}</span></nav>`;
}

// ---------- lightbox ----------
let lb = null;
/** items: [{url, title, caption, meta}]; opens at index i. Arrows move (RTL: → is previous), Esc closes. */
export function lightbox(items, i = 0) {
  if (!items?.length) return;
  lb?.remove();
  const dlg = document.createElement('dialog');
  dlg.className = 'rk-lb'; dlg.setAttribute('aria-label', 'תצוגת תמונה');
  const opener = document.activeElement;
  let at = Math.max(0, Math.min(items.length - 1, i));
  const draw = () => {
    const x = items[at];
    dlg.innerHTML = html`<figure class="rk-lb-f">
      <div class="rk-lb-img"><img src="${x.url}" alt="${x.title || ''}" decoding="async"></div>
      <figcaption><b dir="auto">${x.title || ''}</b>${x.caption ? html`<p dir="auto">${x.caption}</p>` : ''}${x.meta ? html`<p class="rk-lb-m">${x.meta}</p>` : ''}
        <span class="rk-lb-n">${num(at + 1)} / ${num(items.length)}</span></figcaption></figure>
      <button class="rk-lb-x ib" data-lb="x" aria-label="סגירה">${icon('x', 18)}</button>
      ${items.length > 1 ? html`<button class="rk-lb-p ib" data-lb="p" aria-label="התמונה הקודמת">›</button><button class="rk-lb-nx ib" data-lb="n" aria-label="התמונה הבאה">‹</button>` : ''}`.s;
  };
  const move = (d) => { at = (at + d + items.length) % items.length; draw(); };
  const close = () => { dlg.close(); dlg.remove(); lb = null; if (opener?.isConnected) opener.focus(); };
  dlg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-lb]');
    if (b) { if (b.dataset.lb === 'x') close(); else move(b.dataset.lb === 'n' ? 1 : -1); return; }
    if (e.target === dlg) close();
  });
  dlg.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); move(1); } else if (e.key === 'ArrowRight') { e.preventDefault(); move(-1); }
  });
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });
  document.body.append(dlg); lb = dlg; draw(); dlg.showModal(); dlg.querySelector('.rk-lb-x').focus();
}

/** A clickable thumbnail; the page's action reads data-set/data-i to open the lightbox. */
export const thumb = (x, set, i, act = 'lb') => html`<button class="rk-th" data-act="${act}" data-set="${set}" data-i="${i}" aria-label="${x.title || 'תמונה'}: הגדלה">
  <img src="${x.url}" alt="" loading="lazy" decoding="async">${x.badge ? html`<span class="rk-th-b">${x.badge}</span>` : ''}</button>`;
