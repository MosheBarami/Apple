// Clerk: the site's users, drawn like Clerk's own dashboard (Mosaic). Overview (insights, growth,
// sign-ups per day, sign-in methods), Users (search, table, a drawer with the user's sessions and
// ban / lock), Organizations, Sessions and Configure. Every number comes from /api/cc/clerk; every
// write goes through app.act (confirm modal, dry-run plan, then the real call).
import { html, raw, num, ago, when, arr, isNum, failCard, shortDay } from '../ui.js';
import { rn } from '../fx.js';
import { aid } from '../actions.js';
import { ck } from '../actions/clerk.js';

const PER = 10;
const TABS = [['overview', 'סקירה'], ['users', 'משתמשים'], ['orgs', 'ארגונים'], ['sessions', 'חיבורים'], ['configure', 'הגדרות']];
const st = { tab: 'overview', q: '', res: null, busy: false, sort: 'joined', pg: 0, open: null, sess: {}, live: null, stop: null, key: null };

// Stroke icons in Clerk's 16px style.
const P = {
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8M15.5 5.3a3 3 0 0 1 0 5.6M17.5 14.6c1.6.6 2.7 2.1 3 4.4"/>',
  org: '<rect x="4" y="3.5" width="10" height="17" rx="1.5"/><path d="M14 9h5a1 1 0 0 1 1 1v10.5H14M7.5 7.5h3M7.5 11h3M7.5 14.5h3M9 20.5v-2.5"/>',
  device: '<rect x="3.5" y="5" width="17" height="11" rx="1.5"/><path d="M8.5 19.5h7M12 16v3.5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M4.2 7.5l2.1 1.2M17.7 15.3l2.1 1.2M4.2 16.5l2.1-1.2M17.7 8.7l2.1-1.2"/>',
  home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1Z"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.3-4.3"/>',
  x: '<path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/>',
  ban: '<circle cx="12" cy="12" r="8"/><path d="m6.4 6.4 11.2 11.2"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  unlock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.7-1.5"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5.5M12 7.8v.1"/>',
  warn: '<path d="M12 4 2.8 19.5h18.4Z M12 10v4.5M12 17.2v.1"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.4 3.5 5.2 3.5 8.5s-1.1 6.1-3.5 8.5c-2.4-2.4-3.5-5.2-3.5-8.5S9.6 5.9 12 3.5Z"/>',
  key: '<circle cx="8" cy="14" r="4"/><path d="m11 11 8.5-8.5M16.5 5.5 19 8M14 8l2 2"/>',
  hook: '<path d="M9 16.5a3.5 3.5 0 1 1-3-5.9M15 7.5a3.5 3.5 0 1 1 3.5 5.5M12 4.5l-3.5 6.5M15.5 17h-7"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="1.5"/><path d="m4 6.5 8 6 8-6"/>',
  ext: '<path d="M14 4.5h5.5V10M19.5 4.5 11 13M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>',
  chev: '<path d="m15 6-6 6 6 6"/>', chevR: '<path d="m9 6 6 6-6 6"/>', arrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  shield: '<path d="M12 3.5 5 6.5v5c0 4.4 3 7.9 7 9 4-1.1 7-4.6 7-9v-5Z"/>',
};
const ic = (n, s = 16) => raw(`<svg class="clx-ic" viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`);
const CLERK = raw('<svg viewBox="0 0 128 128" width="18" height="18" aria-hidden="true"><path fill="currentColor" d="m101.3 18.9-13.8 13.8a2.5 2.5 0 0 1-3 .4 38.7 38.7 0 0 0-56.7 34.3c0 7 1.9 13.6 5.2 19.3a2.5 2.5 0 0 1-.4 3L18.9 103.4a2.5 2.5 0 0 1-3.8-.3A63.7 63.7 0 0 1 101 15.1a2.5 2.5 0 0 1 .3 3.8Z"/><path fill="currentColor" opacity=".6" d="m101.3 109.1-13.8-13.8a2.5 2.5 0 0 0-3-.4 38.7 38.7 0 0 1-39 0 2.5 2.5 0 0 0-3 .4l-13.8 13.8a2.5 2.5 0 0 0 .3 3.8 63.7 63.7 0 0 0 72 0 2.5 2.5 0 0 0 .3-3.8Z"/><circle cx="64" cy="64" r="19" fill="currentColor"/></svg>');

const dash = 'https://dashboard.clerk.com/';
const ltr = (s, cls = '') => html`<bdi class="clx-ltr ${cls}" dir="ltr">${s}</bdi>`;
const who = (u) => u.name || u.username || u.email || u.id;
const initials = (u) => (who(u) || '?').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
const avatar = (u, cls = '') => (u.image ? html`<img class="clx-av ${cls}" src="${u.image}" alt="" loading="lazy" referrerpolicy="no-referrer">`
  : html`<span class="clx-av ${cls}" aria-hidden="true" style="--h:${[...String(u.id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7)}">${initials(u)}</span>`);
const badge = (tone, text, icn) => html`<span class="clx-badge clx-${tone}">${icn ? ic(icn, 12) : ''}${text}</span>`;
const METHOD = { password: 'סיסמה', email: 'מייל', phone: 'SMS', passkey: 'Passkey', web3: 'Web3', sso: 'SSO' };
const PROV = { google: 'Google', github: 'GitHub', apple: 'Apple', microsoft: 'Microsoft', discord: 'Discord', facebook: 'Facebook', gitlab: 'GitLab', linkedin_oidc: 'LinkedIn', x: 'X' };
const status = (u) => (u.banned ? badge('bad', 'חסום', 'ban') : u.locked ? badge('warn', 'נעול', 'lock') : badge('ok', 'פעיל'));
const errBox = (x, title = 'החלק הזה לא נקרא') => (x && x.error ? html`<div class="clx-callout clx-callout-bad">${ic('warn')}<div><b>${title}</b><p>${x.error}</p></div></div>` : null);
const isErr = (x) => x && typeof x === 'object' && !Array.isArray(x) && 'error' in x;
const count = (x, k) => (isErr(x) ? html`<span class="clx-muted" title="${x.error}">לא נקרא</span>` : isNum(x) ? rn(`ck-c-${k}`, x, num(x)) : '—');

function data(d) {
  const c = d?.clerk || {};
  return st.live && st.live.configured && String(st.live.fetchedAt) > String(c.fetchedAt || '') ? st.live : c;
}

// ---------------------------------------------------------------- shell of the page
function topbar(c) {
  const env = c.instance?.env; const prod = env === 'production';
  return html`<div class="clx-bar">
    <div class="clx-crumb"><span class="clx-app-logo">${CLERK}</span><b>Apple</b><span class="clx-slash" aria-hidden="true">/</span>
      <span class="clx-env ${prod ? 'is-prod' : 'is-dev'}"><i aria-hidden="true"></i>${prod ? 'Production' : env === 'development' ? 'Development' : 'לא ידוע'}</span>
      ${c.instance?.fapi ? ltr(c.instance.fapi, 'clx-mono clx-host') : ''}</div></div>`;
}
function tabs() {
  return html`<div class="clx-tabs" role="tablist" aria-label="חלקי הדף">${TABS.map(([k, l]) => html`<button class="clx-tab ${st.tab === k ? 'on' : ''}" role="tab" id="clx-t-${k}"
    aria-selected="${st.tab === k}" aria-controls="clx-panel" tabindex="${st.tab === k ? '0' : '-1'}" data-act="tab" data-key="tabkey" data-t="${k}">${l}</button>`)}</div>`;
}
const head = (title, sub, extra = '') => html`<div class="clx-h"><div><h2>${title}</h2>${sub ? html`<p>${sub}</p>` : ''}</div>${extra}</div>`;

// ---------------------------------------------------------------- overview
function insights(c) {
  const list = arr(c.insights); if (!list.length) return '';
  const tone = { bad: 'bad', warn: 'warn', ok: 'ok', info: 'info' };
  return html`<section class="clx-setup" aria-labelledby="clx-ins-h"><div class="clx-setup-h"><h3 id="clx-ins-h">מה חשוב לדעת עכשיו</h3><p>מסקנות שהשרת חישב מהנתונים של Clerk, לא הערכה.</p></div>
    <div class="clx-setup-g">${list.map((x) => html`<article class="clx-step clx-step-${tone[x.level] || 'info'}" data-k="ins-${x.id}">
      <p class="clx-step-t">${ic(x.level === 'ok' ? 'check' : x.level === 'info' ? 'info' : 'warn', 15)}<b>${x.title}</b></p><p class="clx-step-d">${x.detail}</p></article>`)}</div></section>`;
}
function growth(c) {
  const u = arr(c.users?.list); const now = Date.now(); const W = 7 * 86400000;
  const days = arr(c.signups?.days); const week = days.slice(-7).reduce((a, x) => a + x.n, 0);
  const active = u.filter((x) => x.lastActive && now - x.lastActive < W).length;
  const blocked = u.filter((x) => x.banned || x.locked).length;
  const tiles = [['ck-total', 'סך המשתמשים', c.users?.total, 'במופע כולו'], ['ck-week', 'נרשמו השבוע', c.signups?.error ? null : week, '7 הימים האחרונים'],
    ['ck-active', 'פעילים השבוע', active, u.length < (c.users?.total || 0) ? `מתוך ${num(u.length)} האחרונים` : 'היו באתר ב-7 ימים'],
    ['ck-block', 'חסומים או נעולים', blocked, blocked ? 'אפשר לשחרר בלשונית משתמשים' : 'אין']];
  return html`<div class="clx-tray" role="group" aria-label="צמיחה">${tiles.map(([k, l, v, s], i) => html`<div class="clx-tile ${i === 0 ? 'on' : ''}">
    <p class="clx-tile-k">${l}</p><p class="clx-tile-v">${isNum(v) ? rn(k, v, num(v)) : '—'}</p><p class="clx-tile-s">${s}</p></div>`)}</div>`;
}
function chart(c) {
  const s = c.signups || {};
  if (s.error) return errBox(s, 'ההרשמות לא נקראו');
  const days = arr(s.days); const max = Math.max(1, ...days.map((x) => x.n)); const top = Math.max(2, Math.ceil(max / 2) * 2);
  const total = days.reduce((a, x) => a + x.n, 0);
  return html`<div class="clx-panel"><div class="clx-legend"><span><i class="clx-dot"></i>הרשמות חדשות ליום</span><span class="clx-muted">${num(total)} ב-30 יום</span>
      ${s.capped ? badge('warn', `לפי ${num(s.scanned)} המשתמשים האחרונים בלבד`, 'info') : ''}</div>
    <div class="clx-chart" role="img" aria-label="הרשמות ב-30 הימים האחרונים: ${num(total)} בסך הכול">
      <div class="clx-y" aria-hidden="true"><span>${num(top)}</span><span>${num(top / 2)}</span><span>0</span></div>
      <div class="clx-plot">${days.map((x, i) => html`<div class="clx-col" title="${shortDay(x.d)}: ${num(x.n)}"><i style="--v:${(x.n / top).toFixed(3)};--i:${i}"></i></div>`)}</div>
      <div class="clx-x" aria-hidden="true">${days.filter((_, i) => i % 5 === 0 || i === days.length - 1).map((x) => html`<span>${shortDay(x.d)}</span>`)}</div></div>
    ${total ? '' : html`<p class="clx-empty-line">עוד אין הרשמות בחודש האחרון. הגרף יתמלא מעצמו.</p>`}</div>`;
}
function methods(c) {
  const u = arr(c.users?.list); if (!u.length) return '';
  const t = {}; for (const x of u) { for (const p of x.providers) t[PROV[p] || p] = (t[PROV[p] || p] || 0) + 1; for (const m of x.methods) t[METHOD[m] || m] = (t[METHOD[m] || m] || 0) + 1; }
  const rows = Object.entries(t).sort((a, b) => b[1] - a[1]);
  return html`<div class="clx-card"><div class="clx-card-h"><h3>שיטות כניסה</h3><span class="clx-muted">${num(u.length)} משתמשים אחרונים</span></div>
    <ul class="clx-meter-l">${rows.map(([k, n]) => html`<li data-k="m-${k}"><span>${k}</span><span class="clx-meter"><i style="width:${((n / u.length) * 100).toFixed(1)}%"></i></span><b>${num(n)}</b></li>`)}</ul></div>`;
}
function recent(c) {
  const u = arr(c.users?.list).slice(0, 5);
  return html`<div class="clx-card"><div class="clx-card-h"><h3>נרשמו לאחרונה</h3></div>
    ${u.length ? html`<ul class="clx-rows">${u.map((x) => html`<li data-k="r-${x.id}"><button class="clx-row-b" data-act="open" data-id="${x.id}">${avatar(x)}<span class="clx-who"><b>${who(x)}</b>${x.email && x.name ? ltr(x.email, 'clx-muted') : ''}</span><span class="clx-muted">${ago(x.created)}</span></button></li>`)}</ul>`
      : html`<div class="clx-empty">${ic('users', 22)}<b>עוד אין משתמשים</b><p>ברגע שמישהו יירשם דרך האתר הוא יופיע כאן.</p></div>`}
    <div class="clx-card-f"><span class="clx-muted">עודכן ${ago(c.fetchedAt)}</span><button class="clx-link" data-act="tab" data-t="users">לכל המשתמשים ${ic('arrow', 13)}</button></div></div>`;
}
function overview(c) {
  return html`${insights(c)}<section aria-labelledby="clx-g-h"><h3 class="clx-sec" id="clx-g-h">צמיחת משתמשים</h3>${growth(c)}${chart(c)}</section>
    <div class="clx-g2">${recent(c)}${methods(c) || html`<div class="clx-card"><div class="clx-card-h"><h3>שיטות כניסה</h3></div><div class="clx-empty">${ic('key', 22)}<b>אין עדיין נתונים</b><p>יופיעו אחרי ההרשמה הראשונה.</p></div></div>`}</div>`;
}

// ---------------------------------------------------------------- users
function usersTab(c) {
  if (c.users?.error) return errBox(c.users, 'המשתמשים לא נקראו');
  const src = st.res ? st.res.users : arr(c.users?.list);
  const total = st.res ? st.res.total : c.users?.total;
  const key = st.sort === 'active' ? 'lastActive' : st.sort === 'signin' ? 'lastSignIn' : 'created';
  const list = [...src].sort((a, b) => (b[key] || 0) - (a[key] || 0));
  const pages = Math.max(1, Math.ceil(list.length / PER)); st.pg = Math.min(st.pg, pages - 1);
  const shown = list.slice(st.pg * PER, st.pg * PER + PER);
  return html`${head('משתמשים', 'כל מי שנרשם לאתר. לחיצה על שורה פותחת את הפרטים, החיבורים והפעולות.')}
    <div class="clx-toolbar">
      <label class="clx-search">${ic('search', 15)}<input id="clx-q" type="search" placeholder="חיפוש לפי שם, מייל, טלפון או מזהה" value="${st.q}" data-input="q" data-key="qkey" autocomplete="off" aria-label="חיפוש משתמשים"></label>
      <button class="clx-btn clx-btn-s" data-act="search" ${st.busy ? 'disabled aria-busy="true"' : ''}>${st.busy ? 'מחפש…' : 'חיפוש'}</button>
      ${st.res ? html`<button class="clx-btn clx-btn-ghost clx-btn-s" data-act="clear">${ic('x', 13)}ניקוי</button>` : ''}
      <span class="clx-grow"></span>
      <label class="clx-sort"><span>מיון:</span><select id="clx-sort" data-change="sort" aria-label="מיון">${[['joined', 'תאריך הצטרפות'], ['signin', 'כניסה אחרונה'], ['active', 'פעילות אחרונה']].map(([k, l]) => html`<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`)}</select></label></div>
    ${st.res?.error ? html`<div class="clx-callout clx-callout-bad">${ic('warn')}<div><b>החיפוש נכשל</b><p>${st.res.error}</p></div></div>` : ''}
    <div class="clx-table-w"><table class="clx-table"><thead><tr><th scope="col">משתמש</th><th scope="col">שיטות כניסה</th><th scope="col">כניסה אחרונה</th><th scope="col">פעילות אחרונה</th><th scope="col">הצטרף</th><th scope="col">מצב</th></tr></thead>
      <tbody>${shown.length ? shown.map((u) => html`<tr data-k="u-${u.id}" class="${st.open === u.id ? 'on' : ''}" data-act="open" data-id="${u.id}" tabindex="0" data-key="rowkey">
        <td><span class="clx-user">${avatar(u)}<span class="clx-who"><b>${who(u)}</b>${u.email ? ltr(u.email, 'clx-muted') : ltr(u.id, 'clx-muted clx-mono')}</span></span></td>
        <td><span class="clx-chips">${u.providers.map((p) => badge('neutral', PROV[p] || p))}${u.methods.filter((m) => m !== 'email' || !u.providers.length).map((m) => badge('neutral', METHOD[m] || m))}${u.twoFactor ? badge('ok', '2FA', 'shield') : ''}</span></td>
        <td class="clx-muted">${ago(u.lastSignIn)}</td><td class="clx-muted">${ago(u.lastActive)}</td><td class="clx-muted">${when(u.created)}</td><td>${status(u)}</td></tr>`)
      : html`<tr><td colspan="6"><div class="clx-empty">${ic('users', 22)}<b>${st.res ? 'אין תוצאות לחיפוש הזה' : 'עוד אין משתמשים'}</b><p>${st.res ? 'נסו חלק מהמייל או מהשם.' : 'ברגע שמישהו יירשם דרך האתר הוא יופיע כאן.'}</p></div></td></tr>`}</tbody></table>
      <div class="clx-pager"><span>${list.length ? `${num(st.pg * PER + 1)}–${num(st.pg * PER + shown.length)} מתוך ${num(total ?? list.length)}` : `0 מתוך ${num(total ?? 0)}`}</span>
        ${(total ?? 0) > list.length ? html`<span class="clx-muted">מוצגים ${num(list.length)} האחרונים. לחיפוש בכולם, השתמשו בתיבת החיפוש.</span>` : ''}<span class="clx-grow"></span>
        <button class="clx-ib" data-act="pg" data-d="-1" ${st.pg <= 0 ? 'disabled' : ''} aria-label="הדף הקודם">${ic('chevR', 15)}</button><span>${num(st.pg + 1)}/${num(pages)}</span>
        <button class="clx-ib" data-act="pg" data-d="1" ${st.pg >= pages - 1 ? 'disabled' : ''} aria-label="הדף הבא">${ic('chev', 15)}</button></div></div>`;
}

function drawer(c) {
  if (!st.open) return '';
  const u = [...arr(st.res?.users), ...arr(c.users?.list)].find((x) => x.id === st.open);
  if (!u) return '';
  const s = st.sess[u.id];
  const rows = [['מזהה', ltr(u.id, 'clx-mono')], ['מייל ראשי', u.email ? html`${ltr(u.email)} ${u.emailVerified ? badge('ok', 'מאומת') : badge('warn', 'לא מאומת')}` : '—'],
    ['טלפון', u.phone ? ltr(u.phone) : '—'], ['שם משתמש', u.username ? ltr(u.username) : '—'],
    ['שיטות כניסה', html`<span class="clx-chips">${u.providers.map((p) => badge('neutral', PROV[p] || p))}${u.methods.map((m) => badge('neutral', METHOD[m] || m))}</span>`],
    ['אימות דו-שלבי', u.twoFactor ? badge('ok', 'דלוק', 'shield') : 'כבוי'], ['Passkeys', num(u.passkeys)],
    ['הצטרף', when(u.created)], ['כניסה אחרונה', html`${when(u.lastSignIn)} · ${ago(u.lastSignIn)}`], ['פעילות אחרונה', ago(u.lastActive)]];
  return html`<div class="clx-scrim" data-act="close" data-keep="scrim"></div>
    <aside class="clx-drawer" role="dialog" aria-modal="false" aria-labelledby="clx-dr-h" data-k="drawer-${u.id}">
      <header class="clx-dr-h">${avatar(u, 'clx-av-l')}<div><h2 id="clx-dr-h">${who(u)}</h2><p>${status(u)} ${u.locked && u.lockoutSecs ? html`<span class="clx-muted">משתחרר לבד בעוד ${num(Math.ceil(u.lockoutSecs / 60))} דק׳</span>` : ''}</p></div>
        <button class="clx-ib" id="clx-dr-x" data-act="close" aria-label="סגירה">${ic('x', 16)}</button></header>
      <div class="clx-dr-b">
        <dl class="clx-kv">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>
        <h3 class="clx-sec">חיבורים</h3>
        ${!s || s.loading ? html`<div class="clx-sk" aria-busy="true" aria-label="טוען חיבורים"></div>` : s.error ? html`<div class="clx-callout clx-callout-bad">${ic('warn')}<div><b>החיבורים לא נקראו</b><p>${s.error}</p></div></div>`
          : s.list.length ? html`<ul class="clx-rows">${s.list.map((x) => sessRow(x, u))}</ul>` : html`<p class="clx-muted">אין חיבורים לחשבון הזה.</p>`}
        <p class="clx-hint">${ic('info', 14)}ניתוק חיבור לא חוסם אף אחד: המשתמש פשוט יתחבר שוב בפעם הבאה שייכנס.</p>
        <h3 class="clx-sec">פעולות</h3>
        <div class="clx-acts">${u.banned ? btn(ck.unban(u), 'שחרור חסימה', 'check') : btn(ck.ban(u), 'חסימה', 'ban', 'clx-btn-danger')}
          ${u.locked ? btn(ck.unlock(u), 'שחרור נעילה', 'unlock') : btn(ck.lock(u), 'נעילה', 'lock')}</div>
        <p class="clx-hint">${ic('shield', 14)}מכאן אי אפשר למחוק משתמש, להתחזות אליו או לשנות הגדרות. הכול הפיך.</p>
      </div></aside>`;
}
const btn = (spec, label, icn, cls = '') => html`<button class="clx-btn clx-btn-s ${cls}" data-act="app:act" data-aid="${aid(spec)}">${ic(icn, 14)}<span>${label}</span></button>`;
const place = (x) => [x.city, x.country].filter(Boolean).join(', ');
const sessRow = (x, u) => html`<li class="clx-sess" data-k="s-${x.id}"><span class="clx-sess-ic">${ic('device', 16)}</span>
  <span class="clx-who"><b>${[x.browser, x.device].filter(Boolean).join(' · ') || 'מכשיר לא ידוע'}${x.mobile ? ' · נייד' : ''}</b>
    <span class="clx-muted">${place(x) || 'מיקום לא ידוע'} · פעיל ${ago(x.lastActive)}${u ? '' : html` · ${x.userName || x.userEmail || ''}`}</span></span>
  ${x.status === 'active' ? html`${badge('ok', 'פעיל')}${btn(ck.revoke(x, u || { name: x.userName, email: x.userEmail }), 'ניתוק', 'x', 'clx-btn-ghost')}` : badge('neutral', x.status || '—')}</li>`;

// ---------------------------------------------------------------- orgs, sessions, configure
function orgsTab(c) {
  const o = c.orgs || {};
  if (o.error) return html`${head('ארגונים')}${errBox(o, 'הארגונים לא נקראו')}`;
  if (o.enabled === false) return html`${head('ארגונים', 'צוותים וחשבונות משותפים.')}<div class="clx-card"><div class="clx-empty clx-empty-l">${ic('org', 26)}<b>Organizations כבוי במופע</b><p>${o.reason}</p>
    <a class="clx-btn clx-btn-s" href="${dash}" target="_blank" rel="noopener noreferrer">פתיחת Clerk Dashboard ${ic('ext', 13)}</a></div></div>`;
  const l = arr(o.list);
  return html`${head('ארגונים', `${num(o.total)} ארגונים במופע`)}<div class="clx-table-w"><table class="clx-table"><thead><tr><th scope="col">ארגון</th><th scope="col">Slug</th><th scope="col">חברים</th><th scope="col">נוצר</th></tr></thead>
    <tbody>${l.length ? l.map((x) => html`<tr data-k="o-${x.id}"><td><span class="clx-user">${avatar({ ...x, id: x.id, name: x.name })}<b>${x.name || x.id}</b></span></td><td>${ltr(x.slug || '—', 'clx-mono')}</td><td>${num(x.members)}</td><td class="clx-muted">${when(x.created)}</td></tr>`)
      : html`<tr><td colspan="4"><div class="clx-empty">${ic('org', 22)}<b>אין ארגונים עדיין</b></div></td></tr>`}</tbody></table></div>`;
}
function sessionsTab(c) {
  const s = c.sessions || {};
  if (s.error) return html`${head('חיבורים')}${errBox(s, 'החיבורים לא נקראו')}`;
  const l = arr(s.list);
  return html`${head('חיבורים פעילים', `Clerk נותן לקרוא חיבורים רק לפי משתמש, אז כאן מוצגים החיבורים של ${num(s.users)} המשתמשים שהיו פעילים לאחרונה${s.capped ? ' (לא של כולם)' : ''}.`)}
    <div class="clx-card">${l.length ? html`<ul class="clx-rows">${l.map((x) => sessRow(x, null))}</ul>` : html`<div class="clx-empty">${ic('device', 22)}<b>אין חיבורים פעילים</b><p>כשמשתמשים יתחברו לאתר, המכשירים שלהם יופיעו כאן.</p></div>`}</div>
    <p class="clx-hint">${ic('info', 14)}ניתוק חיבור מוציא את המשתמש מהמכשיר הזה בלבד. הוא פשוט יתחבר שוב בפעם הבאה.</p>`;
}
const kv = (rows) => html`<dl class="clx-kv">${rows.map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;
const cfgCard = (icn, title, body, sub) => html`<div class="clx-card"><div class="clx-card-h"><h3>${ic(icn, 15)}${title}</h3>${sub ? html`<span class="clx-muted">${sub}</span>` : ''}</div><div class="clx-card-b">${body}</div></div>`;
const listOr = (x, fn, empty) => (isErr(x) ? html`<p class="clx-muted" title="${x.error}">לא נקרא: ${x.error}</p>` : arr(x).length ? fn(arr(x)) : html`<p class="clx-muted">${empty}</p>`);
function configure(c) {
  const g = c.config || {}; const i = c.instance || {}; const w = c.webhooks || {};
  return html`${head('הגדרות המופע', 'קריאה בלבד. משנים הגדרות רק ב-Clerk Dashboard.')}
    <div class="clx-g2">
      ${cfgCard('home', 'המופע', kv([['סביבה', i.env === 'production' ? badge('ok', 'Production') : badge('warn', 'Development')], ['מזהה', i.id ? ltr(i.id, 'clx-mono') : '—'],
        ['Frontend API', i.fapi ? ltr(i.fapi, 'clx-mono') : '—'], ['Allowed origins', num(i.origins)], ['Subdomain allowlist', i.subdomainAllowlist ? 'דלוק' : 'כבוי']]))}
      ${cfgCard('globe', 'דומיינים', listOr(g.domains, (l) => html`<ul class="clx-plain">${l.map((d) => html`<li>${ltr(d.name, 'clx-mono')}${d.satellite ? badge('neutral', 'Satellite') : badge('neutral', 'Primary')}${d.accounts ? html`<a class="clx-link" href="${d.accounts}" target="_blank" rel="noopener noreferrer">Account Portal ${ic('ext', 12)}</a>` : ''}</li>`)}</ul>`, 'אין דומיינים.'))}
      ${cfgCard('key', 'תבניות JWT', listOr(g.jwt, (l) => html`<span class="clx-chips">${l.map((n) => badge('neutral', n))}</span>`, 'אין תבניות JWT.'), 'שמות בלבד')}
      ${cfgCard('shield', 'הגבלות גישה', kv([['Allowlist', count(g.allowlist, 'allow')], ['Blocklist', count(g.blocklist, 'block')], ['הזמנות ממתינות', count(g.invitations, 'inv')], ['רשימת המתנה', count(g.waitlist, 'wait')]]))}
      ${cfgCard('arrow', 'כתובות הפניה', listOr(g.redirects, (l) => html`<ul class="clx-plain">${l.map((r) => html`<li>${ltr(r, 'clx-mono')}</li>`)}</ul>`, 'אין כתובות הפניה מותאמות.'))}
      ${cfgCard('hook', 'Webhooks', html`<p>${w.why || ''}</p>${kv([['CLERK_WEBHOOK_SECRET ב-.env', w.localSecret ? badge('ok', 'קיים') : badge('warn', 'חסר')]])}`)}
      ${cfgCard('mail', 'תבניות מייל', isErr(g.emailTemplates) ? html`<p class="clx-muted">לא נקרא: ${g.emailTemplates.error}</p>` : kv([['תבניות', num(g.emailTemplates?.total)], ['פעילות', num(g.emailTemplates?.enabled)]]))}
      ${cfgCard('org', 'SSO ואפליקציות', kv([['חיבורי SAML', count(g.saml, 'saml')], ['אפליקציות OAuth', count(g.oauthApps, 'oauth')]]))}
    </div>`;
}

// ---------------------------------------------------------------- page
async function loadSessions(id, ctx) {
  st.sess[id] = { loading: true }; ctx.rerender();
  const r = await ctx.api.post('/api/cc/clerk/action', { kind: 'sessions', id });
  st.sess[id] = r?.ok === false ? { error: r.reason || 'לא הצלחנו להביא את החיבורים' } : { list: arr(r?.sessions) };
  if (st.open === id) ctx.rerender();
}
async function runSearch(ctx) {
  const q = (document.getElementById('clx-q')?.value ?? st.q).trim(); st.q = q;
  if (!q) { st.res = null; st.pg = 0; ctx.rerender(); return; }
  st.busy = true; ctx.rerender();
  const r = await ctx.api.post('/api/cc/clerk/action', { kind: 'search', q });
  st.busy = false; st.pg = 0;
  st.res = r?.ok === false ? { users: [], total: 0, error: r.reason || 'החיפוש נכשל' } : { users: arr(r?.users), total: r?.total ?? null, q };
  ctx.rerender();
}

function openUser(el, ctx, e) {
  if (e?.target?.closest?.('[data-aid]')) return;
  const id = el.dataset.id; if (!id) return;
  st.open = id; ctx.rerender(); document.getElementById('clx-dr-x')?.focus({ preventScroll: true });
  loadSessions(id, ctx);
}

export default {
  id: 'clerk', title: 'Clerk', nav: 'Clerk', brand: 'clerk', needs: ['clerk'],
  sub: 'המשתמשים של האתר: מי נרשם, איך הם מתחברים, מי חסום, והגדרות המופע',
  links: () => [{ label: 'Clerk Dashboard', url: dash }],
  render(d) {
    const c = data(d);
    if (c.ok === false) return failCard(c.reason, { retry: true, title: 'לא הצלחנו לקרוא את Clerk' });
    if (c.configured === false) return html`<div class="clx"><div class="clx-card"><div class="clx-empty clx-empty-l">${CLERK}<b>Clerk עוד לא מחובר</b><p dir="auto">${c.how}</p></div></div></div>`;
    const body = { overview, users: usersTab, orgs: orgsTab, sessions: sessionsTab, configure }[st.tab] || overview;
    return html`<div class="clx">${topbar(c)}${tabs()}<div class="clx-panelw" id="clx-panel" role="tabpanel" aria-labelledby="clx-t-${st.tab}" data-k="tab-${st.tab}">${body(c)}</div>${drawer(c)}</div>`;
  },
  mount(root, ctx) {
    st.stop = ctx.live('clerk', 30000, (v) => { if (v?.ok !== false && v?.configured) { st.live = v; ctx.rerender(); } });
    st.key = (e) => { if (e.key === 'Escape' && st.open && !document.querySelector('dialog[open]')) { st.open = null; ctx.rerender(); } };
    document.addEventListener('keydown', st.key);
  },
  unmount() { st.stop?.(); st.stop = null; if (st.key) document.removeEventListener('keydown', st.key); st.key = null; st.open = null; st.live = null; },
  actions: {
    tab(el, ctx) { st.tab = el.dataset.t; st.open = null; ctx.rerender(); document.getElementById(`clx-t-${st.tab}`)?.focus({ preventScroll: true }); },
    tabkey(el, ctx, e) {
      const i = TABS.findIndex(([k]) => k === el.dataset.t); const step = e.key === 'ArrowLeft' ? 1 : e.key === 'ArrowRight' ? -1 : 0; // RTL: left is next
      if (!step) return; e.preventDefault();
      st.tab = TABS[(i + step + TABS.length) % TABS.length][0]; st.open = null; ctx.rerender(); document.getElementById(`clx-t-${st.tab}`)?.focus();
    },
    q(el) { st.q = el.value; },
    qkey(el, ctx, e) { if (e.key === 'Enter') { e.preventDefault(); runSearch(ctx); } },
    search(el, ctx) { runSearch(ctx); },
    clear(el, ctx) { st.q = ''; st.res = null; st.pg = 0; ctx.rerender(); },
    sort(el, ctx) { st.sort = el.value; st.pg = 0; ctx.rerender(); },
    pg(el, ctx) { st.pg = Math.max(0, st.pg + Number(el.dataset.d)); ctx.rerender(); },
    open: openUser,
    rowkey(el, ctx, e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openUser(el, ctx, e); } },
    close(el, ctx) { const id = st.open; st.open = null; ctx.rerender(); document.querySelector(`tr[data-id="${id}"]`)?.focus({ preventScroll: true }); },
  },
};
