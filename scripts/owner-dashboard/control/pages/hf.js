// Hugging Face: the owner's Hub account as the Hub itself shows it. Profile, the LoRA model and its
// training corpus with their commit history, and the Spaces with status and hardware. Power switches
// (restart, pause, rebuild) go through the confirm modal. Hardware and billing are only displayed.
import { html, num, ago, arr, bytes, short, meter, isNum } from '../ui.js';
import { icon } from '../logos.js';
import { hfx } from '../actions.js';
import { hfRebuild, canRebuild } from '../actions/hf.js';
import { actBtn, extBtn } from './kit.js';

let tab = 'all'; // client state: all | models | datasets | spaces

const STAGE = { RUNNING: ['ok', 'רץ'], RUNNING_BUILDING: ['warn', 'רץ ונבנה'], BUILDING: ['warn', 'נבנה'], APP_STARTING: ['warn', 'עולה'],
  PAUSED: ['off', 'מושהה'], SLEEPING: ['off', 'ישן'], STOPPED: ['off', 'עצור'], NO_APP_FILE: ['warn', 'אין קובץ אפליקציה'],
  RUNTIME_ERROR: ['bad', 'קרס'], BUILD_ERROR: ['bad', 'הבנייה נכשלה'], CONFIG_ERROR: ['bad', 'שגיאת הגדרות'] };
// The Hub's Space-card colours (cardData colorFrom / colorTo are Tailwind colour names).
const SWATCH = { gray: '#6b7280', red: '#ef4444', yellow: '#eab308', green: '#22c55e', blue: '#3b82f6', indigo: '#6366f1', purple: '#a855f7', pink: '#ec4899' };
const HW = { 'cpu-basic': 'CPU בסיסי · חינמי' };
const TONE_IC = { good: 'check', info: 'bolt', warn: 'alert', bad: 'alert' };

// Hub glyphs (drawn here: the shell's icon set has no repo / heart / download marks).
const g = (d, s = 14) => html`<svg class="hf-g" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const G = {
  model: html`<path d="M12 2 3 7v10l9 5 9-5V7z"/><path d="m3 7 9 5 9-5M12 12v10"/>`,
  dataset: html`<ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v13c0 1.7 3.6 3 8 3s8-1.3 8-3v-13M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>`,
  space: html`<rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/>`,
  lock: html`<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>`,
  heart: html`<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>`,
  down: html`<path d="M12 4v12m-5-5 5 5 5-5M5 20h14"/>`,
  commit: html`<circle cx="12" cy="12" r="3.5"/><path d="M3 12h5.5m7 0H21"/>`,
};
const dot = html`<span class="hf-sep" aria-hidden="true">•</span>`;
const repoName = (id) => String(id).split('/')[1] || id;
// Server-written Hebrew sentences carry Latin ids and numbers: each Latin run is isolated in a <bdi>.
const LAT = /([A-Za-z0-9$](?:[\w$.\/:=%+'-]*[\w$%])?(?: [A-Za-z0-9$](?:[\w$.\/:=%+'-]*[\w$%])?)*)/;
export const bidi = (t) => String(t ?? '').split(LAT).map((p, i) => (i % 2 ? html`<bdi dir="ltr">${p}</bdi>` : p));

function concl(list) {
  if (!list.length) return '';
  return html`<section class="hf-concl" aria-label="מסקנות">${list.map((c, i) => html`<article class="hf-cc is-${c.tone}" data-k="cc-${i}">
    <span class="hf-cc-i" aria-hidden="true">${icon(TONE_IC[c.tone] || 'bolt', 16)}</span>
    <div><p>${bidi(c.text)}</p><small>על סמך: ${bidi(c.basis)}</small></div></article>`)}</section>`;
}

function profile(h) {
  const r = h.rate; const c = h.counts || {};
  const tags = [
    h.isPro === true ? ['PRO', 'is-pro'] : h.isPro === false ? ['חשבון חינמי', ''] : null,
    h.canPay === false ? ['אין אמצעי תשלום', ''] : h.canPay === true ? ['יש אמצעי תשלום', ''] : null,
    h.token ? [html`טוקן <bdi class="mono" dir="ltr">${h.token.role || ''}</bdi> · ${h.token.write ? 'קריאה וכתיבה' : 'קריאה בלבד'}`, ''] : null,
    [h.orgs?.length ? `ארגונים: ${h.orgs.join(', ')}` : 'בלי ארגונים', ''],
  ].filter(Boolean);
  return html`<section class="card hf-prof" data-k="prof" aria-labelledby="hf-pn">
    <div class="hf-prof-h">
      ${h.avatar ? html`<img class="hf-av" src="${h.avatar}" alt="" width="72" height="72" loading="lazy" referrerpolicy="no-referrer">` : html`<span class="hf-av hf-av-x" aria-hidden="true">🤗</span>`}
      <div class="hf-pn"><h2 id="hf-pn">${h.fullname || h.user}</h2><bdi class="mono hf-handle" dir="ltr">${h.user}</bdi>
        <p class="hf-joined">${h.type === 'user' ? 'משתמש' : h.type || ''}${h.joinedAt ? html` · נפתח ${ago(h.joinedAt)}` : ''}</p></div>
    </div>
    <div class="hf-tags">${tags.map(([t, cls]) => html`<span class="tag ${cls}">${t}</span>`)}</div>
    <dl class="hf-kv">
      <div><dt>${g(G.model)}מודלים</dt><dd>${isNum(c.models) ? num(c.models) : arr(h.models).length}</dd></div>
      <div><dt>${g(G.dataset)}מאגרי נתונים</dt><dd>${isNum(c.datasets) ? num(c.datasets) : arr(h.datasets).length}</dd></div>
      <div><dt>${g(G.space)}Spaces</dt><dd>${isNum(c.spaces) ? num(c.spaces) : arr(h.spaces).length}</dd></div>
      <div><dt>${g(G.heart)}עוקבים</dt><dd>${isNum(c.followers) ? num(c.followers) : '—'}</dd></div>
    </dl>
    <div class="hf-rate">
      <p class="hf-lab">מכסת בקשות ל-Hub</p>
      ${r && isNum(r.limit) && isNum(r.remaining)
        ? html`<p class="hf-rate-v"><b>${num(r.remaining)}</b> נשארו מתוך ${num(r.limit)} בחלון של ${num(Math.round((r.windowSec || 0) / 60))} דקות</p>
          ${meter(r.remaining / r.limit, 'var(--hf-yellow)')}<p class="hf-small">מתאפס בעוד ${num(r.resetSec)} שניות · נמדד מהכותרת <bdi class="mono">ratelimit</bdi></p>`
        : html`<p class="hf-small">ה-Hub לא החזיר כותרות מכסה בקריאה הזו, אז אין כאן מספר.</p>`}
    </div>
    <div class="hf-inf" role="note">
      <p class="hf-lab">צריכת Inference מול הקרדיט החינמי</p>
      <p><b>לא מדיד דרך ה-API.</b> Hugging Face לא חושף את הנתון הזה לטוקן (נקודות החיוב מחזירות 404 או 400), אז הלוח לא ממציא מספר. רואים אותו רק בדף החיוב.</p>
      ${extBtn('https://huggingface.co/settings/billing', 'דף החיוב ב-Hugging Face', 'btn-sm btn-ghost')}
    </div>
  </section>`;
}

function tabs(h) {
  const T = [['all', 'הכל', null, null], ['models', 'Models', G.model, arr(h.models).length], ['datasets', 'Datasets', G.dataset, arr(h.datasets).length], ['spaces', 'Spaces', G.space, arr(h.spaces).length]];
  return html`<nav class="hf-tabs" role="tablist" aria-label="סוגי מאגרים">${T.map(([id, label, gl, n]) => html`<button class="hf-tab hf-tab-${id} ${tab === id ? 'on' : ''}" role="tab" aria-selected="${tab === id ? 'true' : 'false'}" data-act="tab" data-tab="${id}">
    ${gl ? g(gl, 15) : ''}<span dir="ltr">${label}</span>${n != null ? html`<small>${num(n)}</small>` : ''}</button>`)}</nav>`;
}

function repoCard(r) {
  const kind = r.kind === 'dataset' ? 'dataset' : 'model';
  const meta = [
    r.library ? html`<bdi class="mono">${r.library}</bdi>` : null,
    r.baseModel ? html`<span>על בסיס <bdi class="mono">${r.baseModel.split('/').pop()}</bdi></span>` : null,
    isNum(r.storage) ? html`<span>${bytes(r.storage)}</span>` : null,
    r.updatedAt ? html`<span>עודכן ${ago(r.updatedAt)}</span>` : null,
    html`<span class="hf-n">${g(G.down, 13)}${num(r.downloads)}</span>`,
    html`<span class="hf-n">${g(G.heart, 13)}${num(r.likes)}</span>`,
  ].filter(Boolean);
  return html`<article class="hf-card hf-card-${kind}" data-k="r-${r.id}">
    <header class="hf-card-h"><span class="hf-ic hf-ic-${kind}">${g(G[kind], 16)}</span>
      <a class="hf-id" href="${r.url}" target="_blank" rel="noopener noreferrer"><bdi class="mono" dir="ltr">${r.id}</bdi></a>
      ${r.private ? html`<span class="tag tag-sm" title="רק החשבון שלך רואה אותו">${g(G.lock, 12)}פרטי</span>` : html`<span class="tag tag-sm is-pub">ציבורי</span>`}</header>
    ${r.title && r.title !== r.id ? html`<p class="hf-title"><bdi>${r.title}</bdi></p>` : ''}
    <p class="hf-meta">${meta.map((m, i) => html`${i ? dot : ''}${m}`)}</p>
    ${r.summary ? html`<p class="hf-sum" dir="auto">${r.summary}${r.summary.length >= 220 ? '…' : ''}</p>` : ''}
    <div class="hf-tags">${arr(r.tags).map((t) => html`<span class="tag"><bdi dir="ltr">${t}</bdi></span>`)}${r.license ? html`<span class="tag is-lic"><bdi dir="ltr">license: ${r.license}</bdi></span>` : ''}</div>
    ${arr(r.files).length ? html`<details class="hf-files"><summary>${num(r.fileCount)} קבצים${isNum(r.storage) ? html` · ${bytes(r.storage)}` : ''}</summary>
      <ul>${r.files.map((f) => html`<li><bdi class="mono" dir="ltr">${f}</bdi></li>`)}${r.fileCount > r.files.length ? html`<li class="hf-small">ועוד ${num(r.fileCount - r.files.length)}</li>` : ''}</ul></details>` : ''}
  </article>`;
}

function commits(h) {
  const repos = [...arr(h.models), ...arr(h.datasets)];
  const rows = repos.flatMap((r) => arr(r.commits).map((c) => ({ ...c, repo: r }))).sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0)).slice(0, 12);
  const failed = repos.filter((r) => r.commitsError);
  return html`<section class="card hf-log" data-k="log" aria-labelledby="hf-log-h">
    <h2 class="hf-sec-h" id="hf-log-h">${g(G.commit, 16)}LoRA ואימון: מה עלה לאחרונה<small>היסטוריית ה-commits של ${repos.map((r, i) => html`${i ? ' ו-' : ''}<bdi class="mono" dir="ltr">${repoName(r.id)}</bdi>`)}</small></h2>
    ${failed.length ? html`<p class="hf-small is-bad" role="status">לא הצלחנו לקרוא את ההיסטוריה של ${failed.map((r) => repoName(r.id)).join(', ')}: ${failed[0].commitsError}.</p>` : ''}
    ${rows.length ? html`<ol class="hf-tl">${rows.map((c) => html`<li class="hf-tl-i is-${c.repo.kind}" data-k="cm-${c.id}">
      <span class="hf-tl-d" aria-hidden="true"></span>
      <div class="hf-tl-m"><p class="hf-tl-t">${c.title ? html`<bdi>${c.title}</bdi>` : '(בלי כותרת)'}</p>
        <p class="hf-meta"><span class="tag tag-sm hf-k-${c.repo.kind}">${g(G[c.repo.kind === 'dataset' ? 'dataset' : 'model'], 12)}<bdi dir="ltr">${repoName(c.repo.id)}</bdi></span>
          ${dot}<a href="${c.repo.url}/commit/${c.id}" target="_blank" rel="noopener noreferrer"><bdi class="mono" dir="ltr">${short(c.id)}</bdi></a>
          ${c.author ? html`${dot}<bdi class="mono" dir="ltr">${c.author}</bdi>` : ''}${dot}${ago(c.date)}</p></div></li>`)}</ol>`
      : html`<p class="empty">${repos.length ? 'אין commits להציג.' : 'אין מודלים או מאגרי נתונים בחשבון.'}</p>`}
    ${repos.map((r) => (isNum(r.commitCount) ? html`<span class="hf-small hf-cnt">${num(r.commitCount)} commits ב-<bdi class="mono" dir="ltr">${repoName(r.id)}</bdi></span>` : ''))}
  </section>`;
}

function spaceCard(s) {
  const [tone, label] = STAGE[s.runtimeStage] || ['off', s.runtimeStage || 'לא ידוע'];
  const from = SWATCH[s.colorFrom] || SWATCH.gray; const to = SWATCH[s.colorTo] || SWATCH.indigo;
  const running = /RUNNING/.test(s.runtimeStage || '');
  return html`<article class="hf-space" data-k="s-${s.id}">
    <a class="hf-face" href="${s.url}" target="_blank" rel="noopener noreferrer" style="--sf:${from};--st:${to}" aria-label="${s.title || s.id} ב-Hugging Face">
      <span class="hf-face-top"><span class="hf-pill is-${tone}"><i aria-hidden="true"></i>${label}</span><span class="hf-pill">${g(G.heart, 12)}${num(s.likes)}</span></span>
      <span class="hf-face-t" dir="auto">${s.title || repoName(s.id)} ${s.emoji || ''}</span>
      <span class="hf-face-b"><bdi class="mono" dir="ltr">${s.id.split('/')[0]}</bdi><span>${ago(s.updatedAt)}</span></span>
    </a>
    <dl class="hf-sp-kv">
      <div><dt>סביבה</dt><dd><bdi class="mono" dir="ltr">${s.sdk || '—'}</bdi></dd></div>
      <div><dt>חומרה עכשיו</dt><dd>${s.hardware ? html`<bdi class="mono" dir="ltr">${s.hardware}</bdi>` : 'אין (לא רץ)'}</dd></div>
      <div><dt>חומרה מבוקשת</dt><dd>${s.requestedHardware ? html`<bdi class="mono" dir="ltr">${s.requestedHardware}</bdi>${HW[s.requestedHardware] ? html` <small>${HW[s.requestedHardware]}</small>` : ''}` : '—'}</dd></div>
      <div><dt>נרדם אחרי</dt><dd>${isNum(s.sleepAfterSec) ? `${num(Math.round(s.sleepAfterSec / 3600))} שעות בלי ביקור` : '—'}</dd></div>
      <div><dt>כתובת</dt><dd>${s.domainStage === 'READY' ? 'מוכנה' : s.domainStage || '—'} · ${s.private ? 'פרטי' : 'ציבורי'}</dd></div>
    </dl>
    ${s.errorMessage ? html`<p class="hf-err" dir="ltr"><bdi class="mono">${s.errorMessage}</bdi></p>` : ''}
    ${s.runtimeStage === 'NO_APP_FILE' ? html`<p class="hf-small">אין במאגר של ה-Space קובץ אפליקציה (Dockerfile או app.py), ולכן הוא לא עולה. הפעלה מחדש לא מזיקה, אבל גם לא תעזור עד שיועלה קוד.</p>` : ''}
    <div class="hf-sp-a">${actBtn(hfx.restart(s), 'הפעלה מחדש', { ic: 'refresh', cls: 'btn-sm btn-brand' })}
      ${running ? actBtn(hfx.pause(s), 'השהיה', { ic: 'pause', cls: 'btn-sm' }) : ''}
      ${canRebuild(s) ? actBtn(hfRebuild(s), 'בנייה מאפס', { ic: 'bolt', cls: 'btn-sm' }) : ''}
      ${extBtn(`${s.url}/settings`, 'הגדרות', 'btn-sm btn-ghost')}</div>
  </article>`;
}

export default {
  id: 'hf', title: 'Hugging Face', nav: 'Hugging Face', brand: 'huggingface', needs: ['hf'],
  sub: 'החשבון ב-Hub: מודל ה-LoRA, מאגר הנתונים שהוא לומד ממנו וה-Spaces',
  links: (d) => [{ label: 'הפרופיל ב-Hub', url: d.hf?.user && `https://huggingface.co/${d.hf.user}` }],
  render(d) {
    const h = d.hf || {}; const e = h.errors || {};
    const show = (k) => tab === 'all' || tab === k;
    const part = (k, label) => (e[k] ? html`<p class="hf-small is-bad" role="status" data-k="err-${k}">לא הצלחנו לקרוא את ${label}: ${e[k]}.</p>` : '');
    return html`
      ${concl(arr(h.conclusions))}
      <div class="hf-wrap">
        ${profile(h)}
        <div class="hf-main">
          ${tabs(h)}
          ${show('models') ? html`<section class="hf-grp" data-k="g-models" aria-label="מודלים">${part('models', 'המודלים')}${arr(h.models).map(repoCard)}${!e.models && !arr(h.models).length ? html`<p class="empty">אין מודלים בחשבון.</p>` : ''}</section>` : ''}
          ${show('datasets') ? html`<section class="hf-grp" data-k="g-datasets" aria-label="מאגרי נתונים">${part('datasets', 'מאגרי הנתונים')}${arr(h.datasets).map(repoCard)}${!e.datasets && !arr(h.datasets).length ? html`<p class="empty">אין מאגרי נתונים בחשבון.</p>` : ''}</section>` : ''}
          ${show('models') || show('datasets') ? commits(h) : ''}
          ${show('spaces') ? html`<section class="hf-grp hf-spaces" data-k="g-spaces" aria-label="Spaces">${part('spaces', 'ה-Spaces')}${arr(h.spaces).map(spaceCard)}${!e.spaces && !arr(h.spaces).length ? html`<p class="empty">אין Spaces בחשבון.</p>` : ''}</section>` : ''}
        </div>
      </div>
      <p class="explain">הכל נקרא בזמן אמת מה-API של Hugging Face עם הטוקן שבשרת. הלוח מפעיל מחדש, משהה ובונה מחדש Spaces (אחרי אישור), ולעולם לא משנה חומרה, תוכנית או חיוב.</p>`;
  },
  actions: {
    tab(el, ctx) { const t = el.dataset.tab; if (['all', 'models', 'datasets', 'spaces'].includes(t) && t !== tab) { tab = t; ctx.rerender(); } },
  },
};
