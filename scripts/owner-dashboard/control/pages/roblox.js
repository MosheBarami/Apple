// Roblox: our plugins the way the Creator Dashboard and the Creator Store show them. Read-only: the
// catalogue record, the store listing (published, votes, scripts), favourites, what the store lists
// under each creator, and which Open Cloud reads ROBLOX_CREATOR_TOKEN unlocks (each with the status it
// answered). Analytics exist in Open Cloud only per experience, so a plugin has none; said plainly.
// Object icons only: asset thumbnails and neutral glyphs, never the Roblox logo as decoration.
import { html, raw, num, ago, arr, isNum, isFail, light, when } from '../ui.js';
import { logo } from '../logos.js';
import { rn } from '../fx.js';
import { extBtn, note } from './kit.js';

const ok2xx = (c) => isNum(c) && c >= 200 && c < 300;

// The Creator Store listing of the Studio plugin. A 404 with a recorded refusal (packages/shared) is a
// known removal, not "waiting for approval"; control assets tell our fault apart from Roblox's.
function storeCard(r) {
  if (!r || isFail(r)) return note('warn', 'בדיקת החנות של Roblox לא זמינה', r?.reason || 'השרת לא שלח תוצאה.');
  const ctl = arr(r.controls); const ctlOk = ctl.some((c) => ok2xx(c.httpStatus));
  const ours = r.httpStatus; const rf = r.refusal;
  const [state, head, meaning] = ok2xx(ours) ? ['ok', 'הפלאגין מופיע בחנות', 'אפשר למצוא ולהתקין את הפלאגין ב-Creator Store.']
    : ctlOk && rf ? ['warn', 'Roblox הסירה את הפלאגין מהחנות (ידוע)', `הסיבה של Roblox: "${rf.reason}" (${String(rf.decidedAt).slice(0, 10)}). האתר כבר לא מציג קישור התקנה שלא עובד. אפשר לערער עד ${String(rf.appealableUntil).slice(0, 10)}${rf.appealId ? ' — ערעור נשלח.' : ' — ערעור עוד לא נשלח.'}`]
    : ctlOk ? ['bad', 'הפלאגין עדיין לא מופיע בחנות', 'הבדיקה עצמה עובדת (נכס הביקורת כן נמצא), אז הבעיה היא שהפלאגין שלנו לא מפורסם או ממתין לאישור של Roblox.']
      : ctl.length ? ['warn', 'אי אפשר לדעת כרגע', 'גם נכסי הביקורת לא ענו, כלומר כנראה יש תקלה זמנית אצל Roblox ולא אצלנו.'] : ['off', 'אין נתון', 'השרת לא שלח תוצאה.'];
  return html`<article class="card">
    <div class="nc-h">${logo('roblox', 'md')}<div class="grow"><b>הפלאגין של Apple ב-Creator Store</b><small>${light(state, head)}</small></div>${r.url ? extBtn(r.url, 'בחנות', 'btn-sm btn-ghost') : ''}</div>
    <p class="explain">${meaning}</p>
    <dl class="kv kv-row"><div><dt>מספר הנכס שלנו</dt><dd><bdi class="mono">${r.assetId ?? '—'}</bdi></dd></div><div><dt>תשובת החנות</dt><dd class="mono">${ours ?? '—'}</dd></div>
      ${ctl.map((c) => html`<div><dt>נכס ביקורת <bdi class="mono">${c.assetId ?? c.id}</bdi></dt><dd>${light(ok2xx(c.httpStatus) ? 'ok' : 'bad', ok2xx(c.httpStatus) ? `נמצא (${c.httpStatus})` : `לא נמצא (${c.httpStatus ?? '—'})`)}</dd></div>`)}</dl>
    ${ctl.length ? html`<p class="explain">נכסי ביקורת הם נכסים ציבוריים ידועים שנבדקים באותה דרך: אם הם נמצאים והנכס שלנו לא, הבעיה אצלנו. אם גם הם לא, הבעיה אצל Roblox.</p>` : ''}</article>`;
}

const KEYS_URL = 'https://create.roblox.com/dashboard/credentials';
const t = (x) => (x ? Date.parse(x) : NaN);
const sum = (xs) => (xs.every(isNum) ? xs.reduce((a, b) => a + b, 0) : null);

/**
 * The opening conclusions, from the payload alone (pure; the tests call it directly). Takes the whole
 * page data ({ roblox, extras }). Each: { k, tone: ok|warn|bad|info, title, text }, 2 to 4 of them.
 * A section that failed to load yields "could not check", never a conclusion about its contents.
 */
export function infer(d) {
  const r = d?.roblox; const st = d?.extras?.robloxStore;
  if (!r || r.ok === false) {
    return [{ k: 'down', tone: 'bad', title: 'אין תשובה מ-Roblox', text: r?.reason || 'השרת של הלוח לא החזיר נתונים.' },
      { k: 'blind', tone: 'warn', title: 'לכן אין כאן מסקנות על הפלאגינים', text: 'בלי תשובה אי אפשר לדעת מה מצב הפלאגין בחנות. זה לא אומר שמשהו השתנה.' }];
  }
  const out = []; const A = arr(r.assets); const good = A.filter((a) => !a.error);
  const main = good.find((a) => String(a.id) === String(st?.assetId)) || null;
  const rf = st && !isFail(st) ? st.refusal : null;
  const L = main?.store;
  if (main && isFail(L)) out.push({ k: 'sfail', tone: 'warn', title: 'לא הצלחנו לקרוא את רישום החנות', text: `${L.reason}. לכן אין כאן מסקנה אם ${main.name || 'הפלאגין'} מפורסם.` });
  else if (L?.listed && L.published) {
    const after = rf && t(L.updated) > t(rf.decidedAt);
    if (after) out.push({ k: 'back', tone: 'ok', title: `${main.name} מופיע שוב בחנות כמפורסם`, text: `ה-API של החנות מחזיר אותו כמפורסם${L.purchasable ? ' וניתן להתקנה' : ''}, עם עדכון ב-${when(L.updated)}, אחרי ההסרה שנרשמה ב-${String(rf.decidedAt).slice(0, 10)}. מסקנה: כנראה ההסרה בוטלה. כדאי לוודא ב-Creator Dashboard${st.siteSaysLive === false ? ', והאתר שלנו עדיין מציג אותו כלא זמין' : ''}.` });
    else if (rf) out.push({ k: 'listed-rf', tone: 'warn', title: `${main.name} מופיע בחנות, אבל יש הסרה רשומה`, text: `ה-API מחזיר אותו כמפורסם, והרישום לא עודכן מאז ההסרה (${String(rf.decidedAt).slice(0, 10)}). ייתכן שהחנות עוד לא עדכנה את מצבה. כדאי לבדוק ב-Creator Dashboard.` });
    else out.push({ k: 'listed', tone: 'ok', title: `${main.name} מפורסם בחנות`, text: `ה-API של החנות מחזיר אותו כמפורסם${L.free ? ' וחינמי' : ''}.` });
  } else if (main && L && !L.listed) {
    out.push(rf ? { k: 'removed', tone: 'warn', title: `${main.name} לא מופיע בחנות: הסרה ידועה`, text: `Roblox הסירה אותו ב-${String(rf.decidedAt).slice(0, 10)} ("${rf.reason}"). אפשר לערער עד ${String(rf.appealableUntil).slice(0, 10)}.` }
      : { k: 'unlisted', tone: 'bad', title: `${main.name} לא מופיע בחנות`, text: 'החנות לא מחזירה עליו רישום, ואין הסרה רשומה שמסבירה את זה.' });
  } else if (!main && st && !isFail(st) && rf && !ok2xx(st.httpStatus)) {
    out.push({ k: 'removed', tone: 'warn', title: 'הפלאגין לא מופיע בחנות: הסרה ידועה', text: `Roblox הסירה אותו ב-${String(rf.decidedAt).slice(0, 10)} ("${rf.reason}").` });
  }
  const c = r.cloud;
  if (c?.configured && c.valid === false) out.push({ k: 'key', tone: 'bad', title: 'המפתח ROBLOX_CREATOR_TOKEN לא עובד', text: `כל ${num(arr(c.probes).length)} הבדיקות של Open Cloud ענו 401: Roblox לא מזהה את המפתח. הצעד הבא: ליצור מפתח חדש ב-Creator Dashboard ← Credentials עם asset:read ו-creator-store-product:read, ולהחליף אותו ב-‎.env.` });
  else if (c?.configured && c.valid === null && arr(c.probes).length) out.push({ k: 'keyq', tone: 'warn', title: 'המפתח של Open Cloud לא עבר את הבדיקות', text: 'אף בדיקה לא הצליחה, אבל לא כולן ענו 401, אז אי אפשר לקבוע שהמפתח לא תקף. הפרטים בטבלה למטה.' });
  else if (c && !c.configured) out.push({ k: 'nokey', tone: 'info', title: 'אין מפתח Open Cloud', text: 'הנתונים כאן ציבוריים. מפתח עם asset:read יוסיף את מכסות ההעלאה.' });
  const listed = good.filter((a) => a.store?.listed);
  const s = sum(good.map((a) => a.sales)); const f = sum(good.map((a) => a.favorites));
  const v = listed.every((a) => isNum(a.store.votes?.up) && isNum(a.store.votes?.down)) ? listed.reduce((x, a) => x + a.store.votes.up + a.store.votes.down, 0) : null;
  if (good.length && s === 0 && f === 0 && (v === 0 || !listed.length)) out.push({ k: 'zero', tone: 'info', title: 'עוד אין סימני שימוש', text: `0 מכירות, 0 מועדפים${listed.length ? ' ו-0 הצבעות' : ''} על ${num(good.length)} הפלאגינים. בחנות אין מספר התקנות, אז זה כל מה שאפשר לדעת.` });
  const off = good.filter((a) => a !== main && a.store && !isFail(a.store) && !a.store.listed);
  if (off.length && out.length < 4) out.push({ k: 'old', tone: 'info', title: `${off.map((a) => a.name).join(', ')} לא ${off.length > 1 ? 'מופיעים' : 'מופיע'} בחנות`, text: 'הנכס קיים בקטלוג אבל לא רשום ב-Creator Store, אז אי אפשר למצוא אותו בחיפוש.' });
  if (out.length < 2) out.push({ k: 'analytics', tone: 'info', title: 'אין אנליטיקה לפלאגין ב-API', text: r.analytics?.why || 'ב-Open Cloud יש אנליטיקה רק לחוויות.' });
  if (out.length < 2) out.push({ k: 'readonly', tone: 'info', title: 'הדף הזה רק מציג', text: 'שום דבר כאן לא מעלה, מעדכן או מפרסם נכס. שינויים עושים ב-Creator Dashboard.' });
  return out.slice(0, 4);
}

// ---------- glyphs (object icons, drawn here) ----------
const svg = (d, size = 18) => raw(`<svg class="rb-gl" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`);
const GL = {
  plug: '<path d="M9 7V3M15 7V3M6 7h12v4a6 6 0 0 1-12 0V7Z"/><path d="M12 17v4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  up: '<path d="M7 11v9H4v-9h3ZM7 11l4-8a2 2 0 0 1 3 2l-1 4h5a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 16.8 20H7"/>',
  cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M3 4h2l2.4 11h11L21 8H6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M16 7l3 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  script: '<path d="M8 3h9a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  store: '<path d="M4 9h16l-1-5H5L4 9Z"/><path d="M5 9v11h14V9M9 20v-6h6v6"/>',
};

const chip = (tone, text) => html`<span class="rb-chip is-${tone}">${text}</span>`;
function status(a) {
  const L = a.store;
  if (isFail(L)) return chip('warn', 'לא נבדק');
  if (!L?.listed) return chip('off', 'לא בחנות');
  if (L.published && L.purchasable) return chip('ok', 'ציבורי');
  if (L.published) return chip('warn', 'מפורסם, לא להתקנה');
  return chip('warn', 'טיוטה');
}
const cat = (x) => (x ? String(x).replace(/__/g, ' / ').replace(/-/g, ' ') : '—');
const thumb = (a, size) => (a.thumb ? html`<img class="rb-th" src="${a.thumb}" alt="" width="${size}" height="${size}" loading="lazy" referrerpolicy="no-referrer">`
  : html`<span class="rb-th rb-th-i" style="width:${size}px;height:${size}px">${svg(GL.plug, Math.round(size / 3))}</span>`);

function conclusions(list) {
  return html`<section class="rb-concl" data-k="concl" aria-label="מסקנות">${list.map((c) => html`<article class="rb-cc is-${c.tone}" data-k="cc-${c.k}"><b>${c.title}</b><p dir="auto">${c.text}</p></article>`)}</section>`;
}

function stats(good) {
  const listed = good.filter((a) => a.store?.listed && a.store.published).length;
  const tile = (k, ic, label, v, sub) => html`<div class="rb-stat" data-k="${k}"><p class="rb-stat-k">${svg(ic, 16)}<span>${label}</span></p>
    <p class="rb-stat-v">${isNum(v) ? rn(`rb-${k}`, v, num(v)) : '—'}</p>${sub ? html`<p class="rb-stat-s">${sub}</p>` : ''}</div>`;
  const s = sum(good.map((a) => a.sales)); const f = sum(good.map((a) => a.favorites));
  const L = good.filter((a) => a.store?.listed);
  const up = L.every((a) => isNum(a.store.votes?.up)) ? L.reduce((x, a) => x + a.store.votes.up, 0) : null;
  return html`<section class="rb-stats" data-k="stats" aria-label="מדדים">
    ${tile('st-l', GL.store, 'מפורסמים בחנות', listed, `מתוך ${num(good.length)} פלאגינים`)}
    ${tile('st-s', GL.cart, 'מכירות', s, 'לפי הקטלוג (Sales)')}
    ${tile('st-f', GL.heart, 'מועדפים', f, 'סך הכל')}
    ${tile('st-v', GL.up, 'הצבעות חיוביות', up, L.length ? 'בחנות' : 'אין פריט בחנות')}
  </section>`;
}

function creation(a) {
  if (a.error) {
    return html`<article class="rb-item is-err" data-k="a-${a.id}"><div class="rb-item-h">${thumb({}, 72)}<div class="rb-grow"><b>נכס <bdi class="mono">${a.id}</bdi></b>
      <p class="rb-sub" dir="auto">לא הצלחנו לקרוא אותו: ${a.error}</p></div>${chip('warn', 'לא נבדק')}</div></article>`;
  }
  const L = a.store; const on = L?.listed;
  return html`<article class="rb-item" data-k="a-${a.id}">
    <div class="rb-item-h">${thumb(a, 72)}<div class="rb-grow"><b dir="auto">${a.name || '—'}</b>
      <p class="rb-sub">${a.type || 'נכס'} · <bdi>${a.creator?.name || '—'}</bdi>${on && L.creatorVerified ? html` <span class="rb-ver" title="יוצר מאומת בחנות">${svg('<path d="m5 12 4 4 10-10"/>', 12)}</span>` : ''}</p>
      <p class="rb-sub">עודכן ${ago(a.updated)} · <bdi class="mono">${a.id}</bdi></p></div>${status(a)}</div>
    ${a.description ? html`<p class="rb-desc" dir="auto">${a.description}</p>` : ''}
    <dl class="rb-kv">
      <div><dt>${svg(GL.cart, 14)}מכירות</dt><dd>${isNum(a.sales) ? rn(`rb-s-${a.id}`, a.sales, num(a.sales)) : '—'}</dd></div>
      <div><dt>${svg(GL.heart, 14)}מועדפים</dt><dd>${isNum(a.favorites) ? rn(`rb-f-${a.id}`, a.favorites, num(a.favorites)) : '—'}</dd></div>
      ${on ? html`<div><dt>${svg(GL.up, 14)}הצבעות</dt><dd>${isNum(L.votes?.up) ? html`${rn(`rb-u-${a.id}`, L.votes.up, num(L.votes.up))} בעד · ${num(L.votes.down)} נגד` : '—'}</dd></div>
        <div><dt>${svg(GL.script, 14)}סקריפטים</dt><dd>${isNum(L.scriptCount) ? num(L.scriptCount) : '—'}</dd></div>
        <div><dt>קטגוריה</dt><dd><bdi class="mono">${cat(L.category)}</bdi></dd></div>
        <div><dt>מחיר</dt><dd>${L.free ? 'חינם' : isNum(a.price) ? `${num(a.price)} R$` : '—'}</dd></div>
        <div><dt>סריקת הקוד</dt><dd>${L.hashApproved ? chip('ok', 'אושרה') : chip('warn', 'לא אושרה')}</dd></div>
        <div><dt>פורסם</dt><dd>${when(L.created)}</dd></div>`
    : isFail(L) ? html`<div class="rb-wide"><dt>החנות</dt><dd dir="auto">${L.reason}</dd></div>`
      : html`<div class="rb-wide"><dt>החנות</dt><dd>אין רישום ב-Creator Store: הנכס קיים בקטלוג אבל לא מופיע בחיפוש.</dd></div>`}
    </dl>
    <p class="rb-row">${on ? extBtn(a.url, 'בחנות', 'btn-sm rb-btn-p') : ''}${extBtn(`https://create.roblox.com/dashboard/creations/store/${a.id}/configure`, 'הגדרות הפריט', 'btn-sm rb-btn')}</p>
  </article>`;
}

function creators(list) {
  if (!list.length) return '';
  return html`<section class="rb-panel" data-k="creators" aria-labelledby="rb-cr-h"><h3 id="rb-cr-h">${svg(GL.user)}מה החנות מציגה תחת כל יוצר</h3>
    <p class="rb-note">חיפוש ציבורי ב-Creator Store (פלאגינים בלבד) לפי היוצר של כל אחד מהנכסים שלנו.</p>
    <div class="rb-tw"><table class="rb-t"><thead><tr><th scope="col">יוצר</th><th scope="col">פריט</th><th scope="col">מצב</th><th scope="col">הצבעות</th><th scope="col">עודכן</th></tr></thead><tbody>
    ${list.map((c) => {
      const who = html`<bdi>${c.name || '—'}</bdi> <bdi class="mono rb-dim">${c.id}</bdi>`;
      if (isFail(c.items)) return html`<tr data-k="cr-${c.id}"><td>${who}</td><td colspan="4" dir="auto">לא הצלחנו לחפש: ${c.items.reason}</td></tr>`;
      if (!c.items.length) return html`<tr data-k="cr-${c.id}"><td>${who}</td><td colspan="4" class="rb-dim">אין אף פלאגין בחנות תחת היוצר הזה</td></tr>`;
      return c.items.map((x, i) => html`<tr data-k="cr-${c.id}-${x.id}"><td>${i ? '' : who}</td>
        <td><a href="${x.url}" target="_blank" rel="noopener noreferrer" dir="auto">${x.name || html`<bdi class="mono">${x.id}</bdi>`}</a></td>
        <td>${x.published === undefined ? '—' : status({ store: x })}</td><td>${isNum(x.votes?.up) ? `${num(x.votes.up)} / ${num(x.votes.down)}` : '—'}</td><td>${x.updated ? ago(x.updated) : '—'}</td></tr>`);
    })}</tbody></table></div></section>`;
}

function cloud(c, an) {
  const P = arr(c?.probes);
  return html`<section class="rb-panel" data-k="cloud" aria-labelledby="rb-oc-h"><h3 id="rb-oc-h">${svg(GL.key)}Open Cloud: מה המפתח פותח</h3>
    ${!c ? html`<p class="rb-note">השרת לא שלח את בדיקת המפתח.</p>`
    : !c.configured ? html`<p class="rb-note">אין <code>ROBLOX_CREATOR_TOKEN</code> ב-‎.env, אז לא נבדק שום endpoint. מפתח נוצר ב-${extBtn(KEYS_URL, 'Creator Dashboard ← Credentials', 'btn-sm rb-btn')}</p>`
      : html`<p class="rb-note">${c.valid === true ? 'לפחות קריאה אחת הצליחה: המפתח תקף.' : c.valid === false ? 'כל הקריאות ענו 401: Roblox לא מזהה את המפתח, אז אף אחד מה-endpoints למטה לא זמין כרגע.' : 'אף קריאה לא הצליחה, אבל לא כולן 401, אז אי אפשר לקבוע שהמפתח לא תקף.'}</p>
        <div class="rb-tw"><table class="rb-t"><thead><tr><th scope="col">Endpoint</th><th scope="col">הרשאה</th><th scope="col">תשובה</th><th scope="col">מה זה אומר</th></tr></thead><tbody>
        ${P.map((p) => html`<tr data-k="oc-${p.key}"><td><bdi class="mono">GET ${p.endpoint}</bdi></td><td><bdi class="mono">${p.scope}</bdi></td>
          <td>${p.ok ? chip('ok', '200') : chip(p.status === 401 || p.status === 403 ? 'bad' : 'warn', p.status ?? 'אין תשובה')}</td><td dir="auto">${p.ok ? 'זמין' : p.reason}</td></tr>`)}
        </tbody></table></div>
        ${c.valid === false ? html`<p class="rb-row">${extBtn(KEYS_URL, 'יצירת מפתח חדש', 'btn-sm rb-btn-p')}</p>` : ''}`}
    <div class="rb-sep"></div>
    <p class="rb-note"><b>${svg(GL.chart, 16)}אנליטיקה:</b> ${an?.why || 'לא זמינה.'} <span class="rb-dim">(<bdi class="mono">${an?.scope || 'universe.analytics:read'}</bdi>)</span></p>
    <p class="rb-note rb-dim">העלאה ופרסום של נכסים (Assets API) לא נקראים מהלוח בכלל, גם לא לבדיקה.</p>
  </section>`;
}

export default {
  id: 'roblox', title: 'Roblox', nav: 'Roblox', brand: 'roblox', needs: ['roblox', 'extras'],
  sub: 'הפלאגינים שלנו כמו שהם נראים ב-Creator Dashboard ובחנות: מצב הפרסום, הצבעות, מועדפים ומה המפתח פותח',
  links: () => [{ label: 'Creator Dashboard', url: 'https://create.roblox.com/dashboard/creations' }],
  render(d) {
    const r = d.roblox || {}; const assets = arr(r.assets); const good = assets.filter((a) => !a.error);
    const list = infer(d);
    return html`${conclusions(list)}
      ${r.ok === false ? '' : stats(good)}
      ${storeCard(d.extras?.robloxStore)}
      ${assets.length ? html`<section class="rb-grid" data-k="items" aria-label="היצירות שלנו">${[...assets].sort((x, y) => (String(y.id) === String(d.extras?.robloxStore?.assetId)) - (String(x.id) === String(d.extras?.robloxStore?.assetId))).map(creation)}</section>` : ''}
      ${r.ok === false ? '' : html`${creators(arr(r.creators))}${cloud(r.cloud, r.analytics)}`}
      ${note('info', 'שינויים בחנות נעשים ב-Roblox', 'מחיר, תיאור ופרסום של פלאגין משתנים מתוך Creator Dashboard. לוח הבקרה רק מציג אותם.')}`;
  },
  actions: {},
};
