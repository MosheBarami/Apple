// Resend, in Resend's own monochrome look: sending domains with their DNS records and status (re-check,
// open/click tracking), the latest emails with their delivery status, API keys (names and dates only),
// audiences, segments, contacts, broadcasts and webhooks, and one test email that can only go to
// OWNER_EMAIL from .env. The opening conclusions are computed by the server.
import { html, num, ago, arr, isFail, part } from '../ui.js';
import { icon } from '../logos.js';
import { stat, actBtn, swBtn, extBtn, notConnected } from './kit.js';
import { rs } from '../actions/resend.js';

const st = { tab: 'emails' };
const DASH = 'https://resend.com';
const TABS = [['emails', 'מיילים'], ['domains', 'דומיינים'], ['keys', 'מפתחות API'], ['audience', 'קהל'], ['broadcasts', 'Broadcasts'], ['webhooks', 'Webhooks']];
const EMAIL = { delivered: ['ok', 'נמסר'], opened: ['ok', 'נפתח'], clicked: ['ok', 'נלחץ'], sent: ['mid', 'נשלח'], queued: ['off', 'בתור'], scheduled: ['off', 'מתוזמן'],
  delivery_delayed: ['warn', 'מתעכב'], bounced: ['bad', 'חזר'], complained: ['bad', 'סומן כספאם'], failed: ['bad', 'נכשל'], canceled: ['off', 'בוטל'] };
const DOMAIN = { verified: ['ok', 'מאומת'], pending: ['warn', 'ממתין ל-DNS'], not_started: ['off', 'לא התחיל'], failed: ['bad', 'נכשל'], temporary_failure: ['warn', 'תקלה זמנית'] };
const RECORD = { verified: ['ok', 'Verified'], pending: ['warn', 'Pending'], not_started: ['off', 'Not started'], failed: ['bad', 'Failed'], temporary_failure: ['warn', 'Temporary failure'] };
const mono = (s) => html`<bdi class="mono">${s}</bdi>`;
const badge = (map, s) => { const [tone, label] = map[s] || ['off', s || '—']; return html`<span class="rs-badge is-${tone}"><i aria-hidden="true"></i>${label}</span>`; };
const pageOf = (x) => (isFail(x) ? x : x?.items ?? null);
const more = (x) => (x?.more ? html`<p class="rs-more">מוצגים הראשונים בלבד; יש עוד ב-Resend.</p>` : '');
const table = (k, head, rows) => html`<section class="card flush rs-card" data-k="${k}"><div class="tbl-wrap"><table><thead><tr>${head.map((h) =>
  (Array.isArray(h) ? html`<th class="${h[1]}">${h[0]}</th>` : html`<th>${h}</th>`))}</tr></thead><tbody>${rows}</tbody></table></div></section>`;

function testCard(t) {
  return html`<section class="card rs-test" data-k="test"><div class="rs-test-t"><h2 class="card-h">מייל ניסיון</h2>
    ${t?.available ? html`<p>מייל קצר אחד מ-${mono(t.from)} אל ${mono(t.to)} בלבד (הכתובת ב-OWNER_EMAIL). כך בודקים ש-Resend באמת מוסר מיילים.</p>`
      : html`<p>לא זמין: חסר ${html`<code>${arr(t?.missing)[0] || 'OWNER_EMAIL'}</code>`} בקובץ <code>.env</code>. מייל ניסיון נשלח רק לכתובת הזו, והלוח לא ממציא כתובת.</p>`}</div>
    ${t?.available ? actBtn(rs.test(t), 'שליחת מייל ניסיון', { ic: 'arrow', cls: 'btn-sm btn-primary' }) : html`<span class="rs-badge is-off"><i aria-hidden="true"></i>לא זמין</span>`}</section>`;
}

function emailsTab(r) {
  return html`<div class="rs-tab" data-k="tab-emails">${part(pageOf(r.emails), (em) => html`${table('em-t', ['נמען', 'נושא', 'סטטוס', ['מאת', 'rs-hide-s'], 'נשלח'],
    em.map((e) => html`<tr data-k="em-${e.id}"><td>${e.to.map((x) => mono(x))}</td><td class="rs-subj" dir="auto">${e.subject || html`<span class="faint">(בלי נושא)</span>`}</td>
      <td>${badge(EMAIL, e.status)}</td><td class="rs-hide-s">${mono(e.from)}</td><td>${e.scheduled ? html`מתוזמן ${ago(e.scheduled)}` : ago(e.created)}</td></tr>`))}${more(r.emails)}`,
  { title: 'רשימת המיילים לא נקראה', empty: 'עוד לא נשלח אף מייל דרך Resend (מהאתר, מה-Worker או מכאן).' })}</div>`;
}

function records(d) {
  if (!d.records) return html`<p class="rs-more">רשומות ה-DNS לא נטענו לדומיין הזה (נטענות לשלושה הראשונים בלבד, בגלל מגבלת הקצב).</p>`;
  return html`<details class="rs-dns"><summary>רשומות DNS (${num(d.records.length)})</summary><div class="tbl-wrap"><table dir="ltr"><thead><tr><th>Record</th><th>Type</th><th>Name</th><th>TTL</th><th>Status</th></tr></thead>
    <tbody>${d.records.map((x, k) => html`<tr data-k="dns-${d.id}-${k}"><td>${x.record}</td><td>${mono(x.type)}</td><td>${mono(x.name)}${x.priority != null ? html` <span class="faint">(priority ${x.priority})</span>` : ''}</td><td>${mono(x.ttl)}</td><td>${badge(RECORD, x.status)}</td></tr>`)}</tbody></table></div></details>`;
}

function domainsTab(r) {
  return html`<div class="rs-tab" data-k="tab-domains">${part(pageOf(r.domains), (ds) => html`<div class="rs-domains">${ds.map((d) => html`<article class="card rs-domain" data-k="dm-${d.id}">
      <header class="rs-dh"><div><h2 class="card-h">${mono(d.name)}</h2><p class="rs-sub">${badge(DOMAIN, d.status)}${d.region ? mono(d.region) : ''}<span>נוסף ${ago(d.created)}</span></p></div>
        <div class="rs-acts">${d.status !== 'verified' ? actBtn(rs.verify(d), 'בדיקת DNS מחדש', { ic: 'refresh', cls: 'btn-sm' }) : ''}${extBtn(`${DASH}/domains/${encodeURIComponent(d.id)}`, 'ב-Resend', 'btn-sm btn-ghost')}</div></header>
      <div class="rs-sw">${typeof d.openTracking === 'boolean' ? html`<label>מעקב פתיחות ${swBtn(rs.tracking(d, 'open', d.openTracking), d.openTracking, `מעקב פתיחות ב-${d.name}`)}</label>` : ''}
        ${typeof d.clickTracking === 'boolean' ? html`<label>מעקב קליקים ${swBtn(rs.tracking(d, 'click', d.clickTracking), d.clickTracking, `מעקב קליקים ב-${d.name}`)}</label>` : ''}</div>
      ${records(d)}</article>`)}</div>${more(r.domains)}`,
  { title: 'רשימת הדומיינים לא נקראה', empty: 'אין אף דומיין. בלי דומיין מאומת Resend שולח רק מ-onboarding@resend.dev ורק לבעל החשבון. מוסיפים דומיין ב-Resend ומגדירים את רשומות ה-DNS שהוא נותן.' })}
    ${isFail(r.domains) || arr(r.domains?.items).length ? '' : html`<p data-k="dm-add">${extBtn(`${DASH}/domains`, 'הוספת דומיין ב-Resend', 'btn-sm')}</p>`}</div>`;
}

function keysTab(r) {
  return html`<div class="rs-tab" data-k="tab-keys">${part(pageOf(r.keys), (ks) => html`${table('key-t', ['שם', 'נוצר', 'שימוש אחרון'],
    ks.map((k) => html`<tr data-k="key-${k.name}-${k.created}"><td>${icon('key', 14)} ${k.name}</td><td>${ago(k.created)}</td><td>${k.lastUsed ? ago(k.lastUsed) : html`<span class="faint">אף פעם</span>`}</td></tr>`))}
    <p class="rs-more">מוצגים שמות ותאריכים בלבד. הטוקן עצמו לא יוצא מהשרת, והלוח לא יוצר, מחליף או מוחק מפתחות. הקריאות של הלוח עצמו נספרות כשימוש.</p>`,
  { title: 'רשימת המפתחות לא נקראה' })}</div>`;
}

function audienceTab(r) {
  const c = r.contacts;
  return html`<div class="rs-tab" data-k="tab-audience"><section class="g g3" data-k="aud-tiles">
      ${stat({ key: 'rs-con', label: 'אנשי קשר', value: isFail(c) ? null : c?.count, text: isFail(c) ? 'לא נקרא' : c?.more ? `${num(c.count)}+` : undefined })}
      ${stat({ key: 'rs-aud', label: 'Audiences', value: isFail(r.audiences) ? null : arr(r.audiences?.items).length, text: isFail(r.audiences) ? 'לא נקרא' : undefined })}
      ${stat({ key: 'rs-seg', label: 'Segments', value: isFail(r.segments) ? null : arr(r.segments?.items).length, text: isFail(r.segments) ? 'לא נקרא' : undefined })}</section>
    ${isFail(c) ? part(c, () => '', { title: 'אנשי הקשר לא נקראו' }) : ''}
    <div class="g g2" data-k="aud-lists">${[['aud', 'Audiences', r.audiences], ['seg', 'Segments', r.segments]].map(([k, t, x]) => html`<section class="card rs-card" data-k="${k}-l"><h2 class="card-h">${t}</h2>
      ${part(pageOf(x), (it) => html`<ul class="list">${it.map((a) => html`<li class="li" data-k="${k}-${a.name}-${a.created}"><span class="li-m">${a.name}</span><span class="faint">${ago(a.created)}</span></li>`)}</ul>`,
        { title: `${t} לא נקראו`, empty: 'אין.' })}</section>`)}</div></div>`;
}

function broadcastsTab(r) {
  return html`<div class="rs-tab" data-k="tab-broadcasts">${part(pageOf(r.broadcasts), (bs) => table('bc-t', ['שם', 'סטטוס', 'נוצר', 'נשלח'],
    bs.map((b) => html`<tr data-k="bc-${b.name}-${b.created}"><td dir="auto">${b.name}</td><td>${badge({ sent: ['ok', 'נשלח'], draft: ['off', 'טיוטה'], queued: ['mid', 'בתור'] }, b.status)}</td><td>${ago(b.created)}</td><td>${b.sent ? ago(b.sent) : '—'}</td></tr>`)),
  { title: 'ה-Broadcasts לא נקראו', empty: 'אין Broadcasts (מיילים שיווקיים לקהל).' })}</div>`;
}

function webhooksTab(r) {
  return html`<div class="rs-tab" data-k="tab-webhooks">${part(pageOf(r.webhooks), (ws) => table('wh-t', ['יעד', 'סטטוס', 'אירועים', 'נוצר'],
    ws.map((w, k) => html`<tr data-k="wh-${w.host}-${k}"><td>${mono(w.host || '?')}</td><td>${badge({ enabled: ['ok', 'פעיל'], disabled: ['off', 'כבוי'] }, w.status)}</td><td class="mono">${num(w.events)}</td><td>${ago(w.created)}</td></tr>`)),
  { title: 'ה-Webhooks לא נקראו', empty: 'אין Webhooks: האתר לא מקבל הודעה כשמייל נמסר, חוזר או מסומן כספאם.' })}</div>`;
}

const count = (x) => (isFail(x) ? null : arr(x?.items).length);
export default {
  id: 'resend', title: 'Resend', nav: 'Resend', brand: 'resend', needs: ['resend'],
  sub: 'שליחת המיילים של האתר: דומיינים ו-DNS, המיילים האחרונים והסטטוס שלהם, מפתחות, קהל ומייל ניסיון לבעלים',
  links: () => [{ label: 'Resend', url: `${DASH}/emails` }],
  render(d) {
    const r = d.resend || {};
    if (!r.configured) return notConnected('resend', arr(r.missing).length ? r.missing : ['RESEND_API_KEY'], { how: r.how, docs: 'https://resend.com/docs/api-reference/introduction' });
    const tab = TABS.some(([k]) => k === st.tab) ? st.tab : 'emails';
    const doms = pageOf(r.domains); const verified = Array.isArray(doms) ? doms.filter((x) => x.status === 'verified').length : null;
    const ems = pageOf(r.emails); const bad = Array.isArray(ems) ? ems.filter((e) => ['bounced', 'complained', 'failed'].includes(e.status)).length : null;
    const body = { emails: emailsTab, domains: domainsTab, keys: keysTab, audience: audienceTab, broadcasts: broadcastsTab, webhooks: webhooksTab }[tab](r);
    return html`
      <section class="rs-concl" data-k="concl" aria-label="מסקנות">${arr(r.conclusions).map((c) => html`<article class="rs-cc is-${c.tone}" data-k="c-${c.k}"><b>${c.title}</b><p dir="auto">${c.text}</p></article>`)}</section>
      <section class="g g4" data-k="tiles" aria-label="מדדים">
        ${stat({ key: 'rs-dom', label: 'דומיינים מאומתים', value: verified, text: verified == null ? 'לא נקרא' : `${num(verified)} / ${num(count(r.domains))}`, tone: verified ? 'good' : 'bad' })}
        ${stat({ key: 'rs-em', label: 'מיילים אחרונים', value: count(r.emails), text: count(r.emails) == null ? 'לא נקרא' : undefined, sub: bad ? `${num(bad)} חזרו או נכשלו` : 'עד 20 האחרונים' })}
        ${stat({ key: 'rs-key', label: 'מפתחות API', value: count(r.keys), text: count(r.keys) == null ? 'לא נקרא' : undefined })}
        ${stat({ key: 'rs-ct', label: 'אנשי קשר', value: isFail(r.contacts) ? null : r.contacts?.count, text: isFail(r.contacts) ? 'לא נקרא' : undefined, sub: `קהלים: ${num(count(r.audiences) ?? 0)} · סגמנטים: ${num(count(r.segments) ?? 0)}` })}</section>
      ${testCard(r.testEmail)}
      <nav class="rs-tabs" role="tablist" aria-label="חלקי Resend" data-k="tabs">${TABS.map(([k, l]) => html`<button role="tab" class="rs-tb ${tab === k ? 'on' : ''}" aria-selected="${String(tab === k)}" data-act="tab" data-f="${k}">${l}</button>`)}</nav>
      ${body}`;
  },
  actions: {
    tab(el, ctx) { st.tab = el.dataset.f; ctx.rerender(); },
  },
};
