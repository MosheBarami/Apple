import { html, num, compact, ago, arr, extLink, part } from '../ui.js';

const STAGE = { RUNNING: ['ok', 'רץ'], SLEEPING: ['off', 'ישן'], PAUSED: ['off', 'מושהה'], BUILDING: ['warn', 'נבנה'], RUNNING_BUILDING: ['warn', 'נבנה'], APP_STARTING: ['warn', 'עולה'], STOPPED: ['off', 'עצור'], BUILD_ERROR: ['bad', 'שגיאת בנייה'], RUNTIME_ERROR: ['bad', 'קרס'], CONFIG_ERROR: ['bad', 'שגיאת הגדרות'], NO_APP_FILE: ['bad', 'חסר קובץ'] };
const GRAD = ['from-yellow', 'from-blue', 'from-pink', 'from-green', 'from-purple', 'from-red'];
const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const nm = (id) => { const [o, ...r] = String(id || '').split('/'); return r.length ? [o, r.join('/')] : ['', o]; };

function repoCard(m, kind) {
  const [o, n] = nm(m.id);
  return html`<article class="hf-card">
    <div class="hf-card-t"><span class="hf-ic hf-ic-${kind}" aria-hidden="true">${kind === 'model' ? '◆' : '▦'}</span>${extLink(m.url || `https://huggingface.co/${kind === 'dataset' ? 'datasets/' : ''}${m.id}`, html`<bdi class="ltr"><span class="hf-o">${o ? `${o}/` : ''}</span><b>${n}</b></bdi>`, 'hf-link')}${m.private ? html`<span class="hf-tag">פרטי</span>` : ''}</div>
    <div class="hf-meta">${m.pipeline ? html`<bdi class="hf-pipe ltr">${m.pipeline}</bdi>` : ''}<span>עודכן ${ago(m.updatedAt)}</span>
      <span title="הורדות"><span aria-hidden="true">↓</span> ${compact(m.downloads ?? 0)}<span class="sr">הורדות</span></span>
      <span title="לייקים"><span aria-hidden="true">♥</span> ${num(m.likes ?? 0)}<span class="sr">לייקים</span></span></div>
  </article>`;
}
function spaceCard(s) {
  const [o, n] = nm(s.id); const [c, l] = STAGE[s.runtimeStage] || ['off', s.runtimeStage || 'לא ידוע'];
  return html`<article class="hf-space ${GRAD[hash(s.id) % GRAD.length]}">
    <div class="hf-space-top"><span class="hf-stage hf-stage-${c}"><i aria-hidden="true"></i>${l}</span>${s.sdk ? html`<span class="hf-tag ltr">${s.sdk}</span>` : ''}</div>
    <h3>${extLink(s.url || `https://huggingface.co/spaces/${s.id}`, html`<bdi class="ltr">${n}</bdi>`, 'hf-space-n')}</h3>
    <p class="hf-space-o"><bdi class="ltr">${o}</bdi></p></article>`;
}

export default {
  id: 'hf', title: 'Hugging Face', nav: 'Hugging Face', theme: 'hf', icon: html`<span class="hf-nav-emoji">🤗</span>`, mark: html`<span class="hf-mark" aria-hidden="true">🤗</span>`, endpoint: '/api/cc/hf',
  sub: 'המודלים, מאגרי הנתונים וההדגמות שלנו ב-Hugging Face',
  render(d) {
    const user = typeof d.user === 'string' ? d.user : d.user?.name || d.user?.login;
    const ms = d.models; const ds = d.datasets; const sp = d.spaces;
    return html`
      <div class="hf-head"><span class="hf-avatar" aria-hidden="true">${(user || '?').slice(0, 1).toUpperCase()}</span>
        <div><h2>${user ? extLink(`https://huggingface.co/${user}`, html`<bdi class="ltr">${user}</bdi>`, 'hf-link') : 'לא מחובר'}</h2>
        <p class="hf-meta"><span>◆ ${num(arr(ms).length)} מודלים</span><span>▦ ${num(arr(ds).length)} מאגרי נתונים</span><span>🚀 ${num(arr(sp).length)} Spaces</span></p></div></div>
      <section class="hf-sec"><h2 class="hf-h"><span class="hf-ic hf-ic-model" aria-hidden="true">◆</span> מודלים <span class="hf-count">${num(arr(ms).length)}</span></h2>
        <p class="explain">"המוח" שהאפליקציה משתמשת בו או שאימנו בעצמנו.</p>
        ${part(ms, (xs) => html`<div class="hf-grid">${xs.map((m) => repoCard(m, 'model'))}</div>`, { empty: 'אין מודלים בחשבון.' })}</section>
      <section class="hf-sec"><h2 class="hf-h"><span class="hf-ic hf-ic-dataset" aria-hidden="true">▦</span> מאגרי נתונים <span class="hf-count">${num(arr(ds).length)}</span></h2>
        <p class="explain">אוספי דוגמאות שמשמשים לאימון ולבדיקה.</p>
        ${part(ds, (xs) => html`<div class="hf-grid">${xs.map((m) => repoCard(m, 'dataset'))}</div>`, { empty: 'אין מאגרי נתונים בחשבון.' })}</section>
      <section class="hf-sec"><h2 class="hf-h"><span aria-hidden="true">🚀</span> Spaces <span class="hf-count">${num(arr(sp).length)}</span></h2>
        <p class="explain">אפליקציות הדגמה קטנות שרצות אצל Hugging Face.</p>
        ${part(sp, (xs) => html`<div class="hf-grid hf-grid-sp">${xs.map(spaceCard)}</div>`, { empty: 'אין Spaces בחשבון.' })}</section>`;
  },
};
