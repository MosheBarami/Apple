// הספריות: everything the builder can reach for, read live from the catalogues in the repo
// (/api/cc/library, which reads the files at request time, cached per file mtime). Tabs: a summary with
// the growth of each library over git history, the UI pairs (component × skin), every icon in a
// windowed grid, 3D models and kits, sound effects with play buttons, and VFX with their presets.
// Images and audio come through /api/cc/media (repo-relative paths only).
import { html, num, compact, arr, isNum, failCard, shortDay, ltr, bytes } from '../ui.js';
import { icon } from '../logos.js';
import { spark } from '../fx.js';
import { stat, sec, note, extBtn } from './kit.js';

const TABS = [['intake', 'קליטת נכסים'], ['summary', 'סקירה'], ['ui', 'רכיבי UI'], ['assets', 'אייקונים ותמונות'], ['models', 'מודלים וערכות'], ['sfx', 'צלילים'], ['vfx', 'אפקטים']];
const PER = { intake: 60, models: 60, sfx: 60, vfx: 60 };
const st = { tab: 'summary', f: {}, off: 0, q: '', tq: null };
const media = (p) => (p ? `/api/cc/media?p=${encodeURIComponent(p)}` : '');
const GENRE = { 'Shooter/Fighting': 'יריות וקרבות', 'City/Roleplay': 'עיר ומשחק תפקידים', Nature: 'טבע', 'Horror/Adventure': 'אימה והרפתקה', 'Simulator/Tycoon': 'סימולטור וטייקון', Obby: 'אובי', '(none)': 'ללא ז׳אנר' };
const KIND = { weapon: 'נשק', building: 'מבנה', nature: 'טבע', prop: 'חפץ', kit: 'ערכה', vehicle: 'רכב', pet: 'חיית מחמד', character: 'דמות', texture: 'טקסטורה', 'model-pack': 'חבילת מודלים', burst: 'פרץ', loop: 'לולאה' };
const GROUP = { window: 'חלונות', hud: 'תצוגה על המסך', button: 'כפתורים', list: 'רשימות', overlay: 'שכבות', input: 'קלט' };
const he = (map, k) => map[k] || k;

function query() {
  const p = new URLSearchParams({ tab: st.tab });
  for (const [k, v] of Object.entries(st.f[st.tab] || {})) if (v) p.set(k, v);
  if (st.q && st.tab !== 'ui') p.set('q', st.q);
  if (PER[st.tab]) { p.set('limit', String(PER[st.tab])); p.set('off', String(st.off)); }
  if (st.tab === 'assets') { p.set('limit', String(VG.page)); p.set('off', '0'); }
  return p;
}
const filt = (k) => (st.f[st.tab] || {})[k] || '';
const sel = (k, label, opts, all = 'הכול') => html`<label class="sel"><span>${label}</span><select data-change="filter" data-k="${k}" id="lib-f-${st.tab}-${k}">
  <option value="">${all}</option>${opts.map(([v, t, n]) => html`<option value="${v}" ${filt(k) === String(v) ? 'selected' : ''}>${t}${isNum(n) ? ` (${num(n)})` : ''}</option>`)}</select></label>`;
const search = (ph) => html`<label class="search"><span aria-hidden="true">${icon('search', 15)}</span><input id="lib-q-${st.tab}" type="search" placeholder="${ph}" value="${st.q}" data-input="q" autocomplete="off" aria-label="${ph}"></label>`;
function pager(pg) {
  if (!pg || pg.total <= pg.limit) return '';
  const last = Math.max(0, Math.ceil(pg.total / pg.limit) - 1); const at = Math.floor(pg.off / pg.limit);
  return html`<div class="ow-pager"><button class="btn btn-sm" data-act="pg" data-d="-1" ${at <= 0 ? 'disabled' : ''}>הקודם</button>
    <span class="ow-count">עמוד ${num(at + 1)} מתוך ${num(last + 1)} · ${num(pg.total)} פריטים</span>
    <button class="btn btn-sm" data-act="pg" data-d="1" ${at >= last ? 'disabled' : ''}>הבא</button></div>`;
}
const chip = (t, cls = '') => html`<span class="chip chip-sm ${cls}">${t}</span>`;
const imgBox = (src, alt, extra = '') => html`<div class="ow-img">${src ? html`<img src="${src}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer">` : html`<span class="ow-none">אין תמונה</span>`}${extra}</div>`;

// ---------------------------------------------------------------- summary
function summary(d) {
  const g = d.growth || {};
  return html`<div class="ow-panel">
    <div class="g g4" style="grid-template-columns:repeat(auto-fit,minmax(190px,1fr))">${arr(d.counts).map((c) => {
      const s = arr(g[c.id]); const first = s[0];
      return stat({ key: `lib-${c.id}`, label: c.label, value: c.n, sub: first && s.length > 1 ? html`${c.sub} · ${first.n === c.n ? 'ללא שינוי' : `${c.n > first.n ? '+' : ''}${num(c.n - first.n)}`} מאז ${shortDay(first.at)}` : c.sub,
        series: s.length > 1 ? s.map((p) => p.n) : null });
    })}</div>
    ${sec('איך הספריות גדלו', 'כל נקודה היא קומיט ששינה את קובץ הקטלוג; הנקודה האחרונה היא הקובץ כפי שהוא עכשיו, גם לפני קומיט')}
    <div class="g g3" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">${arr(d.counts).map((c) => {
      const s = arr(g[c.id]);
      return html`<div class="card" data-k="gr-${c.id}"><h2 class="card-h">${c.label} <span class="ow-count">${ltr(c.file)}</span></h2>
        ${s.length > 1 ? spark(s.map((p) => p.n), { w: 320, h: 56, label: `${c.label}: גדילה` }) : ''}
        <table class="ow-t"><thead><tr><th>מתי</th><th>קומיט</th><th class="n">פריטים</th></tr></thead><tbody>
        ${s.slice().reverse().slice(0, 6).map((p) => html`<tr><td>${shortDay(p.at)}</td><td>${p.sha ? ltr(p.sha, 'mono') : html`<span class="dim">עכשיו</span>`}</td><td class="n">${num(p.n)}</td></tr>`)}
        </tbody></table></div>`;
    })}</div>
    ${d.note ? note('info', 'מאיפה המספרים', d.note) : ''}</div>`;
}

// Owner-only, read-only intake ledger. Every label says what was measured; a catalogue entry is
// never presented as a downloaded byte or as a Roblox asset.
const INTAKE_STATE = { 'rights-review-pending': 'ממתין לבדיקת זכויות', 'rights-reviewed-no-backend': 'מותר במשחק · אסור להפיץ כחבילה', 'local-review-only': 'עותק לבדיקה בלבד', 'visual-rejected': 'נדחה בבדיקה חזותית',
  'out-of-scope-not-roblox': 'מחוץ לתחום — לא נוצר ל־Roblox', 'out-of-scope-not-cartoon': 'מחוץ לתחום — לא משחק קרטוני צבעוני',
  'roblox-inventory-only': 'במלאי Roblox בלבד — אין קובץ מקומי', 'external-experience-only': 'משחק לצפייה בלבד — אין קובץ להורדה',
  'source-unavailable': 'המקור אינו זמין כרגע', 'download-not-verified': 'ההורדה לא אומתה בדיסק', 'license-restricts-backend': 'הרישיון אוסר הפצה כחבילת נכסים',
  verified: 'קובץ וגיבוב אומתו', present: 'קובץ קיים, ללא גיבוב רשום',
  missing: 'אין קובץ מקומי', mismatch: 'אי התאמה בקובץ', stored: 'נמצא בשרת', 'not-stored': 'טרם הועלה לשרת',
  'not-checked': 'השרת לא נבדק', 'not-supported': 'אין מסלול העלאה מאומת' };
const intakeLabel = (s) => INTAKE_STATE[s] || s || 'לא ידוע';
function intake(d) {
  const view = filt('view') || 'sources'; const rows = arr(d.page?.rows);
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'in-sources', label: 'מקורות ברשימה שלך', value: d.sources?.total, sub: `${num(d.sources?.excluded)} אתרי מודלים כלליים הוצאו מהתוכנית` })}
      ${stat({ key: 'in-owner', label: 'נכסים מהרשימה שלך זמינים לבונה', value: d.files?.fromOwner, sub: `${num(d.files?.reviewOnly)} קבצים נוספים אומתו לבדיקה בלבד` })}
      ${stat({ key: 'in-local', label: 'קבצים שנמצאו בדיסק', value: d.files?.local, sub: 'כולל עותקי בדיקה; בלי מודלים כלליים שהוצאו' })}
      ${stat({ key: 'in-hashes', label: 'קבצים עם גיבוב צפוי', value: d.files?.hashRecorded, sub: 'ההתאמה נבדקת בכל עמוד שנפתח' })}</div>
    ${note('info', 'מה באמת הושלם', d.note)}
    <div class="ow-bar"><div class="seg" role="group" aria-label="תצוגת קליטה">
      <button class="seg-b ${view === 'sources' ? 'on' : ''}" data-act="intakeview" data-v="sources">${num(d.sources?.total)} המקורות שביקשת</button>
      <button class="seg-b ${view === 'files' ? 'on' : ''}" data-act="intakeview" data-v="files">כל קובץ בנפרד</button></div>
      ${search(view === 'sources' ? 'חיפוש מקור או חבילה' : 'חיפוש נכס, מקור או קובץ')}
      ${sel('category', 'סוג', arr(d.categories).map((c) => [c.k, c.k, c.n]))}
      ${view === 'files' ? sel('owner', 'המקורות שלך', [['1', 'רק מהרשימה שלך']]) : ''}</div>
    ${view === 'sources' ? html`<div class="card" style="padding:0"><div class="tbl-wrap"><table class="ow-t"><thead><tr><th>עדיפות</th><th>המקור שביקשת</th><th>סוג</th><th>מצב אמיתי</th><th>נכסים זמינים לבונה</th></tr></thead><tbody>
      ${rows.map((r) => html`<tr data-k="src-${r.priority}"><td>${num(r.priority)}</td><td dir="auto"><a href="${r.url}" target="_blank" rel="noopener noreferrer">${r.url}</a>
        ${r.rights ? html`<br><small class="dim">${r.rights}</small>` : ''}</td><td>${r.category}</td>
        <td>${intakeLabel(r.state)}${r.studioVerification?.method === 'local-file-import' ? html`<br><small>אומת ייבוא מקומי ב־Studio · ${num(r.studioVerification.meshParts)} MeshParts · ${num(r.studioVerification.scripts)} סקריפטים · הכנסה דרך סוכן Apple טרם אומתה</small>` : ''}${arr(r.assetPages || (r.assetPage ? [r.assetPage] : [])).concat(arr(r.inventoryAssetIds).map((id) => `https://create.roblox.com/store/asset/${id}`)).map((url, i) => html`<br><a href="${url}" target="_blank" rel="noopener noreferrer">מודל ${i + 1} במלאי Roblox ↗</a>`)}${arr(r.reviewFiles).map((f) => html`<br><small>${ltr(f.file.split('/').at(-1))} · ${intakeLabel(f.local.state)}${f.local.bytes ? ` (${bytes(f.local.bytes)})` : ''}</small>`)}</td>
        <td class="n">${num(r.acquired || 0)}</td></tr>`)}</tbody></table></div></div>`
      : html`<div class="card" style="padding:0"><div class="tbl-wrap"><table class="ow-t"><thead><tr><th>נכס</th><th>סוג / מקור / רישיון</th><th>הורדה</th><th>קובץ בדיסק</th><th>שרת Apple</th></tr></thead><tbody>
      ${rows.map((r) => html`<tr data-k="file-${r.k}"><td dir="auto"><b>${r.name}</b><br><small class="dim">${ltr(r.file)}</small></td>
        <td>${r.category} · ${r.source || '—'}<br><small>${ltr(r.license || 'רישיון לא נרשם')}</small>${r.sourceUrl ? html`<br><a href="${r.sourceUrl}" target="_blank" rel="noopener noreferrer">עמוד המקור ↗</a>` : ''}</td>
        <td>${r.download?.method || 'לא נרשם'}${r.download?.url ? html`<br><a href="${r.download.url}" target="_blank" rel="noopener noreferrer">כתובת ההורדה ↗</a>` : ''}</td>
        <td>${intakeLabel(r.local?.state)}${isNum(r.local?.bytes) ? html`<br><small>${bytes(r.local.bytes)}</small>` : ''}${r.local?.sha256 ? html`<br><small class="mono" title="SHA-256">${r.local.sha256.slice(0, 16)}…</small>` : ''}</td>
        <td>${intakeLabel(r.backend?.state)}</td></tr>`)}</tbody></table></div></div>`}
    ${rows.length ? '' : html`<p class="empty">לא נמצאו פריטים בסינון הזה.</p>`}
    ${pager(d.page)}<p class="ow-count">העמוד מתרענן כל 15 שניות. מצב השרת: ${d.backendChecked ? 'נבדק כעת' : 'לא נבדק'}.</p></div>`;
}

// ---------------------------------------------------------------- UI pairs
function uiTab(d) {
  const skins = arr(d.skins); const skin = filt('skin'); const grp = filt('group'); const q = st.q.trim().toLowerCase();
  const rows = arr(d.pairs).filter((p) => (!skin || p.skin === skin) && (!grp || p.group === grp) && (!q || `${p.title} ${p.id}`.toLowerCase().includes(q)));
  const genres = Object.fromEntries(skins.map((s) => [s.id, arr(s.genres)]));
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'ui-pairs', label: 'זוגות רכיב × סגנון', value: arr(d.pairs).length })}${stat({ key: 'ui-comp', label: 'רכיבים', value: d.components })}
      ${stat({ key: 'ui-skins', label: 'סגנונות', value: skins.length, sub: skins.map((s) => s.title).join(' · ') })}${stat({ key: 'ui-up', label: 'הועלו ל-Roblox', value: d.uploaded, sub: d.uploaded ? '' : 'עוד לא הועלה אף רכיב (אין מזהה Roblox בקטלוג)', tone: d.uploaded ? '' : 'warn' })}</div>
    <div class="ow-bar">${search('חיפוש רכיב (למשל shop, timer)')}
      ${sel('skin', 'סגנון', skins.map((s) => [s.id, s.title]))}${sel('group', 'סוג', arr(d.groups).map((g) => [g.k, he(GROUP, g.k), g.n]))}
      <span class="ow-count">${num(rows.length)} מוצגים</span></div>
    ${rows.length ? html`<div class="ow-grid">${rows.map((p, i) => html`<article class="ow-card" style="--n:${i}" data-k="${p.k}">
      ${imgBox(media(p.image), p.title, p.icon ? html`<img class="ow-ico" src="${media(p.icon)}" alt="" loading="lazy">` : '')}
      <div class="ow-b"><b>${p.title}</b><p>${he(GROUP, p.group)} · ${p.skinTitle}${p.colour ? html` · <span class="ow-sw" style="background:${p.colour}"></span> ${p.colour}` : ''}</p>
        <p>ז׳אנרים: ${arr(genres[p.skin]).join(', ') || '—'}</p>
        <div class="ow-chips">${p.robloxId ? chip(html`Roblox ${ltr(p.robloxId, 'mono')}`, 'chip-ok') : chip('לא הועלה ל-Roblox', 'chip-off')}
          ${p.built ? chip(`נבנה: ${p.built}`) : ''}${p.board ? html`<a class="chip chip-sm chip-btn" href="${media(p.board)}" target="_blank" rel="noopener">הלוח החזותי ${icon('ext', 11)}</a>` : ''}</div></div></article>`)}</div>`
      : html`<p class="empty">אין רכיב שמתאים לסינון.</p>`}
    <p class="ow-count">מקור: ${ltr(d.source)}</p></div>`;
}

// ---------------------------------------------------------------- icons (windowed grid)
// Only the cells in view exist in the DOM; pages of VG.page rows are fetched as the grid scrolls.
const VG = { page: 400, cell: 104, key: null, host: null, rows: [], total: 0, want: new Set(), raf: 0, base: null };
function vgInit(host, d) {
  VG.host = host; VG.key = host.dataset.keep; VG.base = query(); VG.total = d.page?.total || 0; VG.rows = new Array(VG.total); VG.want.clear();
  arr(d.page?.rows).forEach((r, i) => { VG.rows[i] = r; });
  host.innerHTML = '<div class="ow-vgrid-in"></div>';
  host.onscroll = () => { cancelAnimationFrame(VG.raf); VG.raf = requestAnimationFrame(vgDraw); };
  vgDraw();
}
function vgDraw() {
  const host = VG.host; if (!host?.isConnected) return;
  const inner = host.firstElementChild; const w = host.clientWidth - 16; const cols = Math.max(1, Math.floor(w / VG.cell)); const cw = w / cols;
  const rowsN = Math.ceil(VG.total / cols); inner.style.height = `${rowsN * VG.cell + 16}px`;
  const r0 = Math.max(0, Math.floor(host.scrollTop / VG.cell) - 2); const r1 = Math.min(rowsN, Math.ceil((host.scrollTop + host.clientHeight) / VG.cell) + 2);
  let out = ''; const miss = new Set();
  for (let r = r0; r < r1; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c; if (i >= VG.total) break;
    const x = VG.rows[i]; const pos = `top:${8 + r * VG.cell}px;right:${8 + c * cw}px;width:${cw - 8}px;height:${VG.cell - 8}px`;
    if (!x) { miss.add(Math.floor(i / VG.page)); out += `<div class="ow-cell sk" style="${pos}"></div>`; continue; }
    const t = html`<a class="ow-cell" style="${pos}" href="${media(x.src)}" target="_blank" rel="noopener" title="${x.name} · ${x.pack}/${x.folder} · ${x.license}"><img src="${media(x.src)}" alt="${x.name}" loading="lazy" decoding="async"><span>${x.name}</span></a>`;
    out += t.s;
  }
  inner.innerHTML = out;
  for (const p of miss) vgFetch(p);
}
async function vgFetch(p) {
  if (VG.want.has(p)) return; VG.want.add(p);
  const key = VG.key; const q = new URLSearchParams(VG.base); q.set('off', String(p * VG.page)); q.set('limit', String(VG.page));
  const r = await fetch(`/api/cc/library?${q}`).then((x) => x.json()).catch(() => null);
  if (key !== VG.key || !r?.page) { VG.want.delete(p); return; }
  arr(r.page.rows).forEach((row, i) => { VG.rows[p * VG.page + i] = row; });
  vgDraw();
}
function assets(d) {
  const packs = arr(d.packs); const pack = packs.find((p) => p.id === filt('pack'));
  const key = `assets|${query()}`;
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'as-n', label: 'תמונות בספרייה', value: d.total })}${stat({ key: 'as-p', label: 'חבילות', value: packs.length })}
      ${stat({ key: 'as-shown', label: 'מתאימות לסינון', value: d.page?.total })}${stat({ key: 'as-lic', label: 'רישיונות', text: [...new Set(packs.map((p) => p.license))].join(' · ') || '—' })}</div>
    <div class="ow-bar">${search('חיפוש לפי שם קובץ (למשל coin, arrow)')}
      ${sel('pack', 'חבילה', packs.map((p) => [p.id, p.nameHe || p.name, p.n]))}
      ${pack && arr(pack.folders).length > 1 ? sel('folder', 'תיקייה', arr(pack.folders).map((f) => [f.k, f.k || '(ראשית)', f.n])) : ''}</div>
    ${pack ? html`<p class="ow-count">${pack.name} · ${pack.author || ''} · רישיון ${ltr(pack.license)} ${pack.source ? extBtn(pack.source, 'המקור', 'btn-sm btn-ghost') : ''}</p>` : ''}
    <div class="ow-vgrid" data-keep="${key}" role="list" aria-label="האייקונים"></div>
    <p class="ow-count">מקור: ${ltr(d.source)} · רק מה שנראה על המסך נטען, השאר נטען בגלילה</p></div>`;
}

// ---------------------------------------------------------------- models
function models(d) {
  const t = d.totals || {}; const gh = filt('source') === 'github'; const rows = arr(d.page?.rows);
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'md-n', label: 'מודלים בקטלוג', value: t.rows })}${stat({ key: 'md-cs', label: 'עם מזהה Creator Store', value: t.creatorStoreIds })}
      ${stat({ key: 'md-f', label: 'קובצי מודלים ייעודיים ל־Roblox', value: t.files, sub: 'חבילה חייבת הוכחת מקור ייעודי ל־Roblox' })}${stat({ key: 'md-gh', label: 'קטלוג GitHub / ערכות', text: `${compact(d.github)} / ${compact(d.kits)}`, sub: 'מאגרי קוד וערכות רשמיות, לעיון' })}</div>
    <div class="ow-bar">${search('חיפוש מודל (למשל car, sword)')}
      <div class="seg" role="group" aria-label="מקור"><button class="seg-b ${gh ? '' : 'on'}" data-act="src" data-v="">הקטלוג הראשי</button><button class="seg-b ${gh ? 'on' : ''}" data-act="src" data-v="github">קטלוג GitHub</button></div>
      ${gh ? '' : html`${sel('kind', 'סוג', Object.entries(t.byKind || {}).map(([k, n]) => [k, he(KIND, k), n]))}${sel('genre', 'ז׳אנר', Object.entries(t.byGenre || {}).filter(([k]) => k !== '(none)').map(([k, n]) => [k, he(GENRE, k), n]))}`}</div>
    ${rows.length ? html`<div class="ow-grid">${rows.map((m, i) => html`<article class="ow-card" style="--n:${i}" data-k="${m.k}">
      ${imgBox(m.thumb || (m.preview ? media(m.preview) : ''), m.name)}
      <div class="ow-b"><b dir="auto">${m.name}</b><p>${[he(KIND, m.kind), arr(m.genres).map((g) => he(GENRE, g)).join(', ')].filter(Boolean).join(' · ') || '—'}</p>
        <p>${m.creator ? html`יוצר: ${ltr(m.creator)} · ` : ''}רישיון ${ltr(m.licence || m.license || '—')}${isNum(m.stars) ? html` · ★ ${num(m.stars)}` : ''}</p>
        <div class="ow-chips">${m.source ? chip(m.source) : ''}${m.assetId ? chip(html`ID ${ltr(m.assetId, 'mono')}`, 'chip-ok') : ''}
          ${m.file ? chip(intakeLabel(m.local?.state), m.local?.state === 'verified' ? 'chip-ok' : 'chip-warn') : ''}
          ${m.scripts ? chip(`${num(m.scripts)} סקריפטים`, 'chip-warn') : m.clean ? chip('נקי מסקריפטים', 'chip-ok') : ''}
          ${m.page ? html`<a class="chip chip-sm chip-btn" href="${m.page}" target="_blank" rel="noopener noreferrer">פתיחה ${icon('ext', 11)}</a>` : ''}</div></div></article>`)}</div>`
      : html`<p class="empty">אין מודל שמתאים לסינון.</p>`}
    ${pager(d.page)}<p class="ow-count">מקור: ${ltr(d.source)}${d.generated ? html` · נבנה ב-${ltr(d.generated, 'mono')}` : ''}</p></div>`;
}

// ---------------------------------------------------------------- sound effects
const player = { audio: null, key: null };
function sfx(d) {
  const src = filt('source') || 'local'; const rows = arr(d.page?.rows);
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'sx-n', label: 'צלילים בקטלוג', value: d.total })}${stat({ key: 'sx-l', label: 'עם קובץ בריפו (אפשר לנגן)', value: d.local })}
      ${stat({ key: 'sx-s', label: 'מקורות', value: arr(d.bySource).length, sub: arr(d.bySource).map((s) => `${s.k} ${compact(s.n)}`).join(' · ') })}${stat({ key: 'sx-c', label: 'קטגוריות', value: arr(d.categories).length })}</div>
    <div class="ow-bar">${search('חיפוש צליל (למשל coin, jump, click)')}
      <label class="sel"><span>מקור</span><select data-change="filter" data-k="source" id="lib-f-sfx-source"><option value="local" ${src === 'local' ? 'selected' : ''}>יש קובץ לנגן (${num(d.local)})</option>
        ${arr(d.bySource).map((s) => html`<option value="${s.k}" ${src === s.k ? 'selected' : ''}>${s.k} (${num(s.n)})</option>`)}</select></label>
      ${sel('category', 'קטגוריה', arr(d.categories).map((c) => [c.k, c.k, c.n]))}</div>
    <div class="card" style="padding:0"><div class="tbl-wrap"><table class="ow-t"><thead><tr><th></th><th>שם</th><th>קטגוריה</th><th class="n">משך</th><th>מקור ורישיון</th><th></th></tr></thead><tbody>
    ${rows.map((r) => html`<tr data-k="${r.k}"><td><button class="ow-play ${player.key === r.k ? 'on' : ''}" data-act="play" data-src="${r.file || ''}" data-id="${r.k}" ${['present', 'verified'].includes(r.local?.state) ? '' : 'disabled'} aria-label="${r.file ? `ניגון ${r.name}` : 'אין קובץ מקומי לנגן'}" title="${r.file ? 'ניגון' : 'אין קובץ בריפו: רק מזהה'}">${icon(player.key === r.k ? 'pause' : 'play', 14)}</button></td>
      <td dir="auto"><b>${r.name}</b>${r.pack ? html`<br><small class="dim">${r.pack}</small>` : ''}</td><td>${r.category || '—'}</td><td class="n">${isNum(r.dur) ? `${num(r.dur, 1)} ש׳` : '—'}</td>
      <td><small>${r.source} · ${ltr(r.license || '—')}${r.author ? html` · ${r.author}` : ''}</small></td>
      <td>${r.assetId ? html`<a class="chip chip-sm chip-btn" href="https://create.roblox.com/store/asset/${r.assetId}" target="_blank" rel="noopener noreferrer">${ltr(r.assetId, 'mono')} ${icon('ext', 11)}</a>` : r.sourceUrl ? extBtn(r.sourceUrl, 'המקור', 'btn-sm btn-ghost') : ''}</td></tr>`)}
    </tbody></table></div>${rows.length ? '' : html`<p class="empty" style="padding:14px 20px">אין צליל שמתאים לסינון.</p>`}</div>
    ${pager(d.page)}<p class="ow-count">מקור: ${ltr(d.source)}</p></div>`;
}

// ---------------------------------------------------------------- VFX
function vfx(d) {
  const t = d.totals || {}; const rows = arr(d.page?.rows);
  return html`<div class="ow-panel">
    <div class="g g4">${stat({ key: 'vx-n', label: 'פריטי VFX', value: d.total })}${stat({ key: 'vx-p', label: 'פריסטים מוכנים', value: arr(d.presets).length })}
      ${stat({ key: 'vx-c', label: 'קטגוריות', value: arr(d.categories).length })}${stat({ key: 'vx-b', label: 'חבילות בריפו', text: isNum(t.committedPackBytes) ? bytes(t.committedPackBytes) : '—', sub: isNum(t.scanned) ? `${num(t.scanned)} נסרקו לסקריפטים` : '' })}</div>
    ${sec('פריסטים', 'אפקטים מוכנים שהבונה מרכיב מחלקים של Roblox; אלה הפרמטרים שלהם')}
    <div class="ow-grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${arr(d.presets).map((p, i) => html`<article class="ow-card ow-preset" style="--n:${i}" data-k="pr-${p.k}">
      <div class="ow-b"><b>${ltr(p.name)}</b><p>${p.category} · ${he(KIND, p.kind)}</p><p dir="auto">${p.summary}</p>
      <details><summary class="ow-count">${num(arr(p.parts).length)} חלקים: הפרמטרים</summary>${arr(p.parts).map((x) => html`<pre>${x.className} "${x.name}"\n${arr(x.props).map(([k, v]) => `  ${k} = ${v}`).join('\n')}</pre>`)}</details></div></article>`)}</div>
    ${sec('כל הפריטים', 'תמונות תצוגה, טקסטורות וחבילות מודלים')}
    <div class="ow-bar">${search('חיפוש אפקט (למשל fire, sparkle)')}${sel('kind', 'סוג', arr(d.kinds).map((k) => [k.k, he(KIND, k.k), k.n]))}
      ${sel('category', 'קטגוריה', arr(d.categories).map((c) => [c.k, c.k, c.n]))}${sel('source', 'מקור', arr(d.sources).map((s) => [s.k, s.k, s.n]))}</div>
    ${rows.length ? html`<div class="ow-grid">${rows.map((r, i) => html`<article class="ow-card" style="--n:${i}" data-k="${r.k}">
      ${imgBox(r.preview ? media(r.preview) : r.thumb || '', r.name)}
      <div class="ow-b"><b dir="auto">${r.name}</b><p>${he(KIND, r.kind)} · ${r.category} · ${r.source}</p>
        <div class="ow-chips">${chip(ltr(r.license || '—'))}${r.assetId ? chip(html`ID ${ltr(r.assetId, 'mono')}`, 'chip-ok') : ''}${r.sourceUrl ? html`<a class="chip chip-sm chip-btn" href="${r.sourceUrl}" target="_blank" rel="noopener noreferrer">המקור ${icon('ext', 11)}</a>` : ''}</div></div></article>`)}</div>`
      : html`<p class="empty">אין אפקט שמתאים לסינון.</p>`}
    ${pager(d.page)}<p class="ow-count">מקור: ${ltr(d.source || 'packages/asset-library/vfx/manifest.json')}</p></div>`;
}

const BODY = { intake, summary, ui: uiTab, assets, models, sfx, vfx };
function tabs() {
  return html`<div class="ow-tabs" role="tablist" aria-label="הספריות">${TABS.map(([k, l]) => html`<button class="ow-tab ${st.tab === k ? 'on' : ''}" role="tab" id="lib-t-${k}"
    aria-selected="${st.tab === k}" aria-controls="lib-panel" tabindex="${st.tab === k ? '0' : '-1'}" data-act="tab" data-key="tabkey" data-t="${k}">${l}</button>`)}</div>`;
}
const setTab = (t, ctx) => { st.tab = t; st.off = 0; st.q = ''; ctx.refresh(); };

export default {
  id: 'library', title: 'הספריות', nav: 'הספריות', glyph: 'library',
  sub: 'קטלוגים לצד קליטת קבצים בפועל: מקור, רישיון, הורדה, אימות והימצאות בשרת. לא כל רשומה זמינה לבונה.',
  load: (ctx) => ctx.api.get(`/api/cc/library?${query()}`),
  render(d) {
    if (d?.ok === false) return failCard(d.reason, { retry: true, title: 'לא הצלחנו לקרוא את הספריות' });
    const body = d.tab === st.tab ? BODY[st.tab](d) : html`<div class="skel" style="height:320px"></div>`;
    return html`${tabs()}<div id="lib-panel" role="tabpanel" aria-labelledby="lib-t-${st.tab}" data-k="lib-${st.tab}">${body}</div>`;
  },
  after(root, ctx) {
    if (st.tab === 'intake' && !st.intakeTimer) st.intakeTimer = setInterval(() => ctx.refresh(), 15000);
    if (st.tab !== 'intake' && st.intakeTimer) { clearInterval(st.intakeTimer); st.intakeTimer = null; }
    const host = root.querySelector('.ow-vgrid');
    if (host && (host !== VG.host || host.dataset.keep !== VG.key)) vgInit(host, ctx.data || {});
    else if (host) vgDraw();
  },
  unmount() { player.audio?.pause(); player.key = null; VG.host = null; clearTimeout(st.tq); clearInterval(st.intakeTimer); st.intakeTimer = null; },
  actions: {
    tab(el, ctx) { setTab(el.dataset.t, ctx); },
    intakeview(el, ctx) { (st.f.intake ||= {}).view = el.dataset.v; st.off = 0; ctx.refresh(); },
    tabkey(el, ctx, e) {
      const i = TABS.findIndex(([k]) => k === el.dataset.t); const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL: left is next
      if (!step) return; e.preventDefault(); setTab(TABS[(i + step + TABS.length) % TABS.length][0], ctx);
      setTimeout(() => document.getElementById(`lib-t-${st.tab}`)?.focus(), 50);
    },
    filter(el, ctx) {
      const f = (st.f[st.tab] ||= {}); f[el.dataset.k] = el.value; if (el.dataset.k === 'pack') f.folder = '';
      st.off = 0; if (st.tab === 'ui') ctx.rerender(); else ctx.refresh();
    },
    src(el, ctx) { st.f.models = { source: el.dataset.v }; st.off = 0; ctx.refresh(); },
    q(el, ctx) {
      st.q = el.value; clearTimeout(st.tq);
      if (st.tab === 'ui') { ctx.rerender(); return; }
      st.tq = setTimeout(() => { st.off = 0; ctx.refresh(); }, 300);
    },
    pg(el, ctx) { st.off = Math.max(0, st.off + Number(el.dataset.d) * (PER[st.tab] || 60)); ctx.refresh(); document.getElementById('lib-panel')?.scrollIntoView({ block: 'start' }); },
    play(el, ctx) {
      const id = el.dataset.id; const src = el.dataset.src; if (!src) return;
      if (!player.audio) { player.audio = new Audio(); player.audio.onended = () => { player.key = null; ctx.rerender(); }; }
      if (player.key === id) { player.audio.pause(); player.key = null; ctx.rerender(); return; }
      player.audio.src = media(src); player.key = id;
      player.audio.play().catch(() => { player.key = null; ctx.toast('הדפדפן לא הצליח לנגן את הקובץ הזה.', 'bad'); ctx.rerender(); });
      ctx.rerender();
    },
  },
};
