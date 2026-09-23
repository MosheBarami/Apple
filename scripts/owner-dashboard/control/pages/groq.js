// Groq: the key's models as the console lists them (context, output limit, price, modalities), the
// rate limits Groq reports, and a live latency meter. The meter sends one tiny paid request (~73
// tokens, ~$0.000006) per minute while this page is open and visible, at most CAP times per visit;
// the server module refuses a second probe inside 60 seconds however it is reached.
import { html, num, arr, meter, isNum, ago } from '../ui.js';
import { icon } from '../logos.js';
import { groqProbe } from '../actions/groq.js';
import { actBtn, extBtn, notConnected } from './kit.js';

const CONSOLE = 'https://console.groq.com';
const PATH = '/api/cc/groq/action';
const CAP = 20; // automatic probes per visit (20 of the key's 1,000 daily requests at most)
const TONE_IC = { good: 'check', info: 'bolt', warn: 'alert', bad: 'alert' };

// ---- client state (tabs, filters, the live meter) ----------------------------------------------
let tab = 'models'; // models | limits
let filt = 'all'; // all | chat | audio | vision | guard
const L = { history: [], probe: null, note: '', sent: 0, paused: false, nextAt: 0 };
let timer = null; let busy = false; let host = null; let cx = null;

const LAT = /([A-Za-z0-9$](?:[\w$.\/:=%+'-]*[\w$%])?(?: [A-Za-z0-9$](?:[\w$.\/:=%+'-]*[\w$%])?)*)/;
const bidi = (t) => String(t ?? '').split(LAT).map((p, i) => (i % 2 ? html`<bdi dir="ltr">${p}</bdi>` : p));
const money = (v) => (isNum(v) ? `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}` : '—');

/** Folds a server probe state ({probe, history, nextProbeInSec}) into the page's copy. */
function merge(g) {
  if (!g || typeof g !== 'object') return;
  const seen = new Set(L.history.map((h) => h.at));
  for (const h of arr(g.history)) if (h?.at && !seen.has(h.at)) L.history.push(h);
  L.history.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); if (L.history.length > 60) L.history.splice(0, L.history.length - 60);
  if (g.probe?.at && (!L.probe || Date.parse(g.probe.at) >= Date.parse(L.probe.at))) L.probe = g.probe;
  if (isNum(g.nextProbeInSec)) L.nextAt = Date.now() + g.nextProbeInSec * 1000;
}

const KIND = [['all', 'הכל'], ['chat', 'טקסט'], ['vision', 'תמונה'], ['audio', 'קול'], ['guard', 'בטיחות']];
const kindOf = (m) => {
  const k = [];
  if (/guard/i.test(m.id)) k.push('guard');
  else if (m.input.includes('text') && m.output.includes('text')) k.push('chat');
  if (m.input.includes('image')) k.push('vision');
  if (m.input.includes('audio') || m.output.includes('audio') || m.output.includes('speech') || m.output.includes('transcription')) k.push('audio');
  return k;
};
const MOD = { text: 'T', image: 'I', audio: 'A', speech: 'A', transcription: 'T' };
const MOD_HE = { text: 'טקסט', image: 'תמונה', audio: 'קול', speech: 'דיבור', transcription: 'תמליל' };
const mods = (list) => html`<span class="gq-mods">${list.map((x) => html`<span class="gq-mod" title="${MOD_HE[x] || x}">${MOD[x] || x[0]?.toUpperCase() || '?'}</span>`)}</span>`;

function concl(list) {
  if (!list.length) return '';
  return html`<section class="gq-concl" aria-label="מסקנות">${list.map((c, i) => html`<article class="gq-cc is-${c.tone}" data-k="cc-${i}">
    <span class="gq-cc-i" aria-hidden="true">${icon(TONE_IC[c.tone] || 'bolt', 16)}</span>
    <div><p>${bidi(c.text)}</p><small>על סמך: ${bidi(c.basis)}</small></div></article>`)}</section>`;
}

// ---- the live latency meter (data-keep: mount() redraws it, a refresh leaves it alone) ------------
function bars(hist) {
  const H = 64, W = 300, n = Math.max(hist.length, 12), bw = W / n;
  const max = Math.max(300, ...hist.map((h) => h.ms || 0));
  return html`<svg class="gq-bars" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${hist.length} מדידות זמן תגובה, מהישנה לחדשה">
    ${hist.map((h, i) => {
      const x = (i * bw + bw * 0.18).toFixed(1), w = (bw * 0.64).toFixed(1);
      if (!h.ok || !isNum(h.ms)) return html`<rect class="gq-b-x" x="${x}" y="${H - 6}" width="${w}" height="6" rx="1"/>`;
      const tot = (h.ms / max) * (H - 4); const srv = isNum(h.serverMs) ? Math.min(tot, (h.serverMs / max) * (H - 4)) : 0;
      return html`<rect class="gq-b-n" x="${x}" y="${(H - tot).toFixed(1)}" width="${w}" height="${(tot - srv).toFixed(1)}" rx="1"/><rect class="gq-b-s" x="${x}" y="${(H - srv).toFixed(1)}" width="${w}" height="${srv.toFixed(1)}" rx="1"/>`;
    })}</svg>`;
}
function latInner(g) {
  const p = L.probe; const okMs = L.history.filter((h) => h.ok && isNum(h.ms)).map((h) => h.ms).sort((a, b) => a - b);
  const med = okMs.length ? okMs[Math.floor(okMs.length / 2)] : null;
  const net = p?.ok && isNum(p.serverMs) ? Math.max(0, p.ms - Math.round(p.serverMs)) : null;
  const note = L.note === 'noroute' ? 'השרת עוד לא מכיר את נתיב הבדיקה (POST groq/action), אז אין מדידה חיה. זה תלוי בעדכון של השרת.'
    : L.note === 'dry' ? 'מצב ניסוי דלוק: הבדיקה האוטומטית לא נשלחת. "מדידה עכשיו" תראה רק את הבקשה שהייתה נשלחת.'
      : L.note === 'cap' ? `נשלחו ${CAP} בדיקות בביקור הזה והמדידה נעצרה כדי לשמור על המכסה היומית.`
        : L.paused ? 'המדידה האוטומטית עצורה.'
          : L.note ? `הבדיקה האחרונה נכשלה: ${L.note}` : null;
  const next = !L.paused && !L.note && L.nextAt > Date.now() ? new Date(L.nextAt).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : null;
  return html`<div class="gq-lat-h"><h2 class="gq-h2"><span class="gq-live ${timer && !L.paused ? 'is-on' : ''}" aria-hidden="true"></span>זמן תגובה חי</h2>
      <div class="gq-lat-a">
        <button class="btn btn-sm" data-act="lat" aria-pressed="${L.paused ? 'true' : 'false'}">${icon(L.paused ? 'play' : 'pause', 14)}<span>${L.paused ? 'המשך מדידה' : 'עצירה'}</span></button>
        ${g?.configured ? actBtn(groqProbe(), 'מדידה עכשיו', { ic: 'bolt', cls: 'btn-sm btn-brand' }) : ''}</div></div>
    <div class="gq-lat-b">
      <div class="gq-big">${p?.ok ? html`<b dir="ltr">${num(p.ms)}<small>ms</small></b>` : html`<b class="faint">—</b>`}
        <span>${p?.ok ? html`מקצה לקצה, ${ago(p.at)}` : p ? 'הבדיקה האחרונה נכשלה' : 'עוד לא נמדד'}</span></div>
      <dl class="gq-kv">
        <div><dt>אצל Groq</dt><dd dir="ltr">${p?.ok && isNum(p.serverMs) ? `${num(p.serverMs)}ms` : '—'}</dd></div>
        <div><dt>ברשת ובתור</dt><dd dir="ltr">${isNum(net) ? `${num(net)}ms` : '—'}</dd></div>
        <div><dt>חציון</dt><dd dir="ltr">${isNum(med) ? `${num(med)}ms` : '—'}</dd></div>
        <div><dt>מדידות</dt><dd>${num(L.history.length)}${L.sent ? html` <small>(${num(L.sent)} בביקור)</small>` : ''}</dd></div>
      </dl>
      <div class="gq-chart">${bars(L.history)}<p class="gq-leg"><span><i class="gq-b-s"></i>עבודה אצל Groq</span><span><i class="gq-b-n"></i>רשת ותור</span><span><i class="gq-b-x"></i>נכשל</span></p></div>
    </div>
    <p class="gq-small" role="status">${note || (next ? `הבדיקה הבאה בסביבות ${next}.` : 'בדיקה אחת בדקה כל עוד הדף פתוח ומוצג.')}
      בדיקה = בקשה של מילה אחת למודל <bdi class="mono" dir="ltr">${g?.probeModel || 'openai/gpt-oss-20b'}</bdi>, בערך 73 טוקנים (כ-0.000006 דולר).</p>`;
}
const latWidget = (g) => html`<section class="gq-card gq-lat" data-keep="gq-lat" aria-label="זמן תגובה חי">${latInner(g)}</section>`;
function draw() { const el = host?.querySelector('[data-keep="gq-lat"]'); if (el) el.innerHTML = latInner(cx?.data?.groq).s; }

async function tick() {
  timer = null; if (!host || L.paused) return;
  const g = cx?.data?.groq;
  if (!g?.configured) return;
  if (document.visibilityState !== 'visible') { schedule(60000); return; }
  if (cx.store.dry) { L.note = 'dry'; draw(); schedule(60000); return; }
  if (L.sent >= CAP) { L.note = 'cap'; L.paused = true; draw(); return; }
  if (busy) return; busy = true;
  let r; try { r = await cx.api.post(PATH, { kind: 'probe' }); } finally { busy = false; }
  if (!host) return;
  if (r?.status === 404) { L.note = 'noroute'; draw(); return; }
  if (r?.throttled === false) L.sent += 1;
  merge(r);
  L.note = r?.ok === false ? (r.reason || 'לא ידוע') : '';
  draw(); schedule(Math.max(5000, ((isNum(r?.nextProbeInSec) ? r.nextProbeInSec : 60) * 1000) + 800));
}
function schedule(ms) { clearTimeout(timer); if (host && !L.paused) { timer = setTimeout(tick, ms); L.nextAt = Date.now() + ms; } }

// ---- console-style sections -------------------------------------------------------------------
function modelsTab(g) {
  const all = arr(g.models); const list = filt === 'all' ? all : all.filter((m) => kindOf(m).includes(filt));
  const maxC = Math.max(1, ...all.map((m) => m.context || 0));
  return html`<div class="gq-sec" data-k="t-models">
    <div class="gq-sec-h"><h2 class="gq-h2">המודלים שהמפתח יכול לקרוא</h2>
      <div class="gq-seg" role="group" aria-label="סינון לפי סוג">${KIND.map(([id, label]) => {
        const n = id === 'all' ? all.length : all.filter((m) => kindOf(m).includes(id)).length;
        return html`<button class="gq-seg-b ${filt === id ? 'on' : ''}" aria-pressed="${filt === id ? 'true' : 'false'}" data-act="filt" data-f="${id}">${label}<small>${num(n)}</small></button>`;
      })}</div></div>
    <div class="gq-tw"><table class="gq-t"><thead><tr><th>מודל</th><th>קלט ← פלט</th><th>חלון הקשר</th><th>פלט מקסימלי</th><th>מחיר למיליון טוקנים</th><th>יכולות</th></tr></thead><tbody>
      ${list.map((m) => html`<tr data-k="m-${m.id}">
        <td data-l="מודל"><span class="gq-mn"><bdi dir="ltr">${m.name || m.id}</bdi></span><bdi class="mono gq-mid" dir="ltr">${m.id}</bdi>
          <span class="gq-own">${m.owner ? html`<bdi dir="ltr">${m.owner}</bdi>` : ''}${m.active ? '' : html` <span class="gq-st"><i></i>כבוי</span>`}</span></td>
        <td data-l="קלט ← פלט"><span class="gq-io" dir="ltr">${mods(m.input)}<span class="gq-arr" aria-hidden="true">→</span>${mods(m.output)}</span></td>
        <td data-l="חלון הקשר"><span class="gq-ctx">${meter((m.context || 0) / maxC, 'var(--gq-orange)')}<span class="mono" dir="ltr">${isNum(m.context) ? num(m.context) : '—'}</span></span></td>
        <td data-l="פלט מקסימלי"><span class="mono" dir="ltr">${isNum(m.maxOut) ? num(m.maxOut) : '—'}</span></td>
        <td data-l="מחיר למיליון">${m.pricing && (isNum(m.pricing.in) || isNum(m.pricing.out))
          ? html`<span class="gq-price" dir="ltr"><b>${money(m.pricing.in)}</b> <small>input</small><br><b>${money(m.pricing.out)}</b> <small>output</small></span>`
          : html`<span class="faint">לא פורסם ב-API</span>`}</td>
        <td data-l="יכולות"><span class="gq-feat">${arr(m.features).map((f) => html`<span class="gq-chip"><bdi dir="ltr">${f.replace(/_/g, ' ')}</bdi></span>`)}${!arr(m.features).length ? html`<span class="faint">—</span>` : ''}</span></td>
</tr>`)}
    </tbody></table></div>
    ${!list.length ? html`<p class="empty">אין מודלים מהסוג הזה.</p>` : ''}
    <p class="gq-small">חלון הקשר = כמה טוקנים המודל קורא בבת אחת (אלף טוקנים הם בערך 750 מילים באנגלית). המחירים באים מרשימת המודלים של ה-API, בדולר למיליון טוקנים.</p>
  </div>`;
}

function limitsTab(g) {
  const p = L.probe; const l = p?.limits;
  const pm = arr(g.models).find((m) => m.id === p?.model || m.id === g.probeModel);
  const cost = p?.ok && pm?.pricing && isNum(p.tokens?.prompt) ? ((p.tokens.prompt * (pm.pricing.in || 0)) + ((p.tokens.completion || 0) * (pm.pricing.out || 0))) / 1e6 : null;
  const reset = (s) => (isNum(s) ? (s >= 3600 ? `${num(Math.round(s / 360) / 10)} שעות` : s >= 60 ? `${num(Math.round(s / 6) / 10)} דקות` : `${num(Math.round(s * 10) / 10)} שניות`) : '—');
  const row = (label, left, lim, rs, key) => html`<div class="gq-lim" data-k="${key}">
    <p class="gq-lab">${label}</p>
    ${isNum(left) && isNum(lim) ? html`<p class="gq-lim-v"><b dir="ltr">${num(left)}</b> נשארו מתוך <span dir="ltr">${num(lim)}</span></p>${meter(left / lim, left / lim < 0.2 ? 'var(--bad)' : 'var(--gq-orange)')}
      <p class="gq-small">חוזר למלוא המכסה בעוד ${reset(rs)}</p>` : html`<p class="gq-small">אין עדיין מספר: הוא מגיע רק עם בדיקה.</p>`}</div>`;
  return html`<div class="gq-sec" data-k="t-limits">
    <div class="gq-sec-h"><h2 class="gq-h2">מגבלות וצריכה</h2>${p?.at ? html`<span class="gq-small">נמדד ${ago(p.at)} מהכותרות של הבדיקה האחרונה</span>` : ''}</div>
    <div class="gq-lims">
      ${row('בקשות ליום', l?.requestsLeft, l?.requestsPerDay, l?.requestsResetSec, 'lim-r')}
      ${row('טוקנים לדקה', l?.tokensLeft, l?.tokensPerMin, l?.tokensResetSec, 'lim-t')}
    </div>
    <dl class="gq-facts">
      <div><dt>אזור שענה</dt><dd>${p?.region ? html`<bdi class="mono" dir="ltr">${p.region}</bdi>` : '—'}</dd></div>
      <div><dt>רמת שירות</dt><dd>${p?.tier ? html`<bdi class="mono" dir="ltr">${p.tier}</bdi>` : '—'}</dd></div>
      <div><dt>טוקנים בבדיקה</dt><dd dir="ltr">${isNum(p?.tokens?.total) ? `${num(p.tokens.prompt)} + ${num(p.tokens.completion)} = ${num(p.tokens.total)}` : '—'}</dd></div>
      <div><dt>עלות הבדיקה</dt><dd dir="ltr">${isNum(cost) ? `$${cost.toFixed(7)}` : '—'}</dd></div>
    </dl>
    <div class="gq-note" role="note"><p class="gq-lab">צריכה חודשית</p>
      <p>הלוח לא קורא את הצריכה החודשית או את החיוב של Groq. המספרים כאן הם רק מה ש-Groq מחזיר בכותרות של בקשה: המכסה שנשארה עכשיו, לא כמה הוצאת החודש. את הצריכה המלאה רואים בקונסולה.</p>
      <div class="row">${extBtn(`${CONSOLE}/dashboard/usage`, 'צריכה בקונסולה', 'btn-sm btn-ghost')}${extBtn(`${CONSOLE}/settings/limits`, 'המגבלות של החשבון', 'btn-sm btn-ghost')}</div></div>
  </div>`;
}

const KEY = { valid: ['is-ok', 'המפתח תקין'], invalid: ['is-bad', 'המפתח נדחה (401)'], unknown: ['is-warn', 'מצב המפתח לא ידוע'] };

export default {
  id: 'groq', title: 'Groq', nav: 'Groq', brand: 'groq', needs: ['groq'],
  sub: 'המודלים המהירים שהאתר יכול לקרוא, כמה הם עולים, כמה מהמכסה נשאר ומה זמן התגובה עכשיו',
  links: () => [{ label: 'Groq Console', url: `${CONSOLE}/keys` }],
  render(d) {
    const g = d.groq || {};
    if (!g.configured) {
      return html`${concl(arr(g.conclusions))}${notConnected('groq', arr(g.need).length ? g.need : ['GROQ_API_KEY'], { how: 'יוצרים מפתח ב-Groq Console תחת API Keys ומוסיפים אותו לקובץ ‎.env של הריפו.', docs: `${CONSOLE}/keys` })}`;
    }
    merge(g);
    const [kc, kl] = KEY[g.key] || KEY.unknown;
    const TABS = [['models', 'מודלים', arr(g.models).length], ['limits', 'מגבלות וצריכה', null]];
    return html`
      ${concl(arr(g.conclusions))}
      <div class="gq-console">
        <header class="gq-top" data-k="top">
          <span class="gq-word" dir="ltr" aria-label="Groq">groq</span>
          <nav class="gq-topnav" aria-label="Groq Console">
            <a href="${CONSOLE}/playground" target="_blank" rel="noopener noreferrer">Playground</a>
            <a href="${CONSOLE}/keys" target="_blank" rel="noopener noreferrer">API Keys</a>
            <a href="${CONSOLE}/dashboard/usage" target="_blank" rel="noopener noreferrer">Dashboard</a>
            <a href="${CONSOLE}/docs/models" target="_blank" rel="noopener noreferrer">Docs</a></nav>
          <span class="gq-st ${kc}" data-k="key"><i></i>${kl}</span>
        </header>
        <div class="gq-body">
          <aside class="gq-side" aria-label="מדורים">
            <p class="gq-side-l">הלוח</p>
            <div role="tablist" aria-label="מדורים">${TABS.map(([id, label, n]) => html`<button class="gq-side-a ${tab === id ? 'on' : ''}" role="tab" aria-selected="${tab === id ? 'true' : 'false'}" data-act="tab" data-tab="${id}">${label}${n != null ? html`<small>${num(n)}</small>` : ''}</button>`)}</div>
            <p class="gq-side-l">בקונסולה</p>
            <a class="gq-side-a" href="${CONSOLE}/docs/rate-limits" target="_blank" rel="noopener noreferrer">Rate Limits${icon('ext', 12)}</a>
            <a class="gq-side-a" href="${CONSOLE}/settings/billing" target="_blank" rel="noopener noreferrer">Billing${icon('ext', 12)}</a>
          </aside>
          <main class="gq-panel">
            ${latWidget(g)}
            ${tab === 'limits' ? limitsTab(g) : modelsTab(g)}
          </main>
        </div>
      </div>
      <p class="explain">רשימת המודלים נקראת מ-Groq פעם בחמש דקות, בחינם. זמן התגובה והמכסה נמדדים בבקשה קטנה אחת בדקה בזמן שהדף פתוח ומוצג (עד ${CAP} בביקור), כי רק בקשה אמיתית מחזירה אותם. השרת עצמו לא ישלח יותר מבדיקה אחת בדקה.</p>`;
  },
  mount(root, ctx) {
    host = root; cx = ctx; L.sent = 0; L.note = ''; L.paused = false;
    if (ctx.data?.groq?.configured) schedule(400);
  },
  after() { draw(); }, // the kept widget skips the morph, so a refresh (e.g. after "measure now") redraws it here
  unmount() { clearTimeout(timer); timer = null; host = null; cx = null; },
  actions: {
    tab(el, ctx) { const t = el.dataset.tab; if (['models', 'limits'].includes(t) && t !== tab) { tab = t; ctx.rerender(); } },
    filt(el, ctx) { const f = el.dataset.f; if (KIND.some(([id]) => id === f) && f !== filt) { filt = f; ctx.rerender(); } },
    lat() {
      L.paused = !L.paused;
      if (L.paused) { clearTimeout(timer); timer = null; } else { if (L.note === 'cap') L.sent = 0; L.note = ''; schedule(400); }
      draw();
    },
  },
};
