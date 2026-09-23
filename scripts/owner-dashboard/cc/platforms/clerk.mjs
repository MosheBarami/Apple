// Clerk (Backend API, api.clerk.com/v1). Without CLERK_SECRET_KEY it says how to connect and sends
// nothing. With it: the instance, the users (whitelisted fields only), 30 days of sign-ups, the
// organisations, sessions, the Configure counts, and Hebrew insights derived from those numbers.
// Writes are ban / unban / lock / unlock a user and revoke a session: each reversible, each with a
// dry-run plan that sends nothing. Never a delete, an impersonation, a sign-in token or a setting.
// The secret key is never returned: the environment is read from its sk_test_ / sk_live_ prefix.
import { fetchJson, cached, uncache, section, redact, ok, fail } from '../http.mjs';

const BASE = 'https://api.clerk.com/v1';
const LABEL = 'Clerk';
const HOW = 'ב-Clerk Dashboard: Configure → API keys → העתיקו את ה-Secret key והוסיפו לקובץ ‎.env שורה CLERK_SECRET_KEY=<המפתח>, '
  + 'ואז הפעילו מחדש את הדשבורד.';
const DAY = 86400000;
const PAGE = 500; const CAP = 2000; // the sign-up scan: up to four pages of users, newest first
const SHOWN = 50; const SESS_USERS = 10;
const USER = /^user_[A-Za-z0-9]{10,40}$/;
const SESS = /^sess_[A-Za-z0-9]{10,40}$/;

const key = () => process.env.CLERK_SECRET_KEY || '';
const get = (p, what) => fetchJson(`${BASE}${p}`, { label: LABEL, what, headers: { authorization: `Bearer ${key()}` } });
const arr = (x) => (Array.isArray(x) ? x : []);
const listOf = (x) => (Array.isArray(x) ? x : arr(x?.data));
const totalOf = (x) => (typeof x?.total_count === 'number' ? x.total_count : listOf(x).length);
const ms = (x) => (typeof x === 'number' && x > 0 ? x : null);
const str = (x) => (typeof x === 'string' && x ? x : null);
const url = (x) => (typeof x === 'string' && /^https:\/\//.test(x) ? x : null);
// Everything this module answers goes through the same scrub the server applies, so a value an
// upstream echoed back can never carry a credential out even before sendJson.
const clean = (o) => JSON.parse(redact(JSON.stringify(o)));

export const keyMode = (k) => (/^sk_live_/.test(k || '') ? 'production' : /^sk_test_/.test(k || '') ? 'development' : 'unknown');

/** The publishable key is base64 of the Frontend API host with a trailing `$`. */
export function fapiHost(pk) {
  const m = /^pk_(?:test|live)_([A-Za-z0-9+/=]+)$/.exec(pk || '');
  if (!m) return null;
  const host = Buffer.from(m[1], 'base64').toString('utf8').replace(/\$$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(host) ? host : null;
}

// ---------------------------------------------------------------- whitelists
const PROVIDER = (p) => String(p || '').replace(/^oauth_(custom_)?/, '');

/** An admin-table row. Counts and booleans only for credentials; no metadata of any kind. */
export function pickUser(u = {}) {
  const emails = arr(u.email_addresses); const phones = arr(u.phone_numbers);
  const email = emails.find((e) => e?.id === u.primary_email_address_id) || emails[0];
  const phone = phones.find((p) => p?.id === u.primary_phone_number_id) || phones[0];
  const providers = [...new Set(arr(u.external_accounts).map((a) => PROVIDER(a?.provider)).filter((p) => /^[a-z0-9_-]{1,40}$/.test(p)))];
  const methods = [];
  if (u.password_enabled === true) methods.push('password');
  if (emails.length) methods.push('email');
  if (phones.length) methods.push('phone');
  if (arr(u.passkeys).length) methods.push('passkey');
  if (arr(u.web3_wallets).length) methods.push('web3');
  if (arr(u.saml_accounts).length || arr(u.enterprise_accounts).length) methods.push('sso');
  const name = [str(u.first_name), str(u.last_name)].filter(Boolean).join(' ') || null;
  return {
    id: String(u.id || ''), name, username: str(u.username), image: u.has_image ? url(u.image_url) : null,
    email: str(email?.email_address), emailVerified: email?.verification?.status === 'verified', emails: emails.length,
    phone: str(phone?.phone_number), methods, providers,
    twoFactor: u.two_factor_enabled === true, passkeys: arr(u.passkeys).length, wallets: arr(u.web3_wallets).length,
    banned: u.banned === true, locked: u.locked === true, lockoutSecs: typeof u.lockout_expires_in_seconds === 'number' ? u.lockout_expires_in_seconds : null,
    created: ms(u.created_at), lastSignIn: ms(u.last_sign_in_at), lastActive: ms(u.last_active_at),
  };
}

/** A session row. The IP address is left out on purpose. */
export function pickSession(s = {}) {
  const a = s.latest_activity || {};
  return { id: String(s.id || ''), userId: str(s.user_id), status: str(s.status), created: ms(s.created_at), lastActive: ms(s.last_active_at),
    expire: ms(s.expire_at), browser: str(a.browser_name), device: str(a.device_type), mobile: a.is_mobile === true, city: str(a.city), country: str(a.country) };
}

const pickOrg = (o = {}) => ({ id: String(o.id || ''), name: str(o.name), slug: str(o.slug), members: typeof o.members_count === 'number' ? o.members_count : null,
  created: ms(o.created_at), image: o.has_image ? url(o.image_url) : null });

// ---------------------------------------------------------------- insights
const nf = (n) => new Intl.NumberFormat('en-US').format(n);
const METHOD = { password: 'סיסמה', email: 'קוד או קישור במייל', phone: 'SMS', passkey: 'Passkey', web3: 'ארנק Web3', sso: 'SSO ארגוני',
  google: 'Google', github: 'GitHub', apple: 'Apple', microsoft: 'Microsoft', discord: 'Discord', facebook: 'Facebook', gitlab: 'GitLab', linkedin_oidc: 'LinkedIn', x: 'X' };
const methodName = (m) => METHOD[m] || m;
// The way a user signs in: a social provider first, then a password, then an email code, then SMS.
const mainMethod = (u) => u.providers[0] || (u.methods.includes('password') ? 'password' : u.methods.includes('passkey') ? 'passkey'
  : u.methods.includes('email') ? 'email' : u.methods.includes('phone') ? 'phone' : u.methods[0] || null);
const neverBack = (u, now) => u.created && now - u.created > DAY && ((u.lastActive ?? u.lastSignIn ?? u.created) - u.created) < DAY;

/** 30 daily buckets (UTC), oldest first, from created_at. */
export function signupDays(users, now = Date.now()) {
  const day = (t) => new Date(t).toISOString().slice(0, 10);
  const days = Array.from({ length: 30 }, (_, i) => ({ d: day(now - (29 - i) * DAY), n: 0 }));
  const at = new Map(days.map((x) => [x.d, x]));
  for (const u of users) { const b = u.created && at.get(day(u.created)); if (b) b.n++; }
  return days;
}

/**
 * Pure: Hebrew conclusions from the numbers this module read.
 * @param x { env, users: raw or picked users (newest first), total, capped, orgs: {enabled}, webhooks: {localSecret} }
 * @returns [{ id, level: 'bad'|'warn'|'info'|'ok', title, detail }]
 */
export function derive({ env, users = [], total = 0, capped = false, orgs, webhooks } = {}, now = Date.now()) {
  const us = users.map((u) => ('email_addresses' in u || 'created_at' in u ? pickUser(u) : u));
  const scope = capped ? ` (מתוך ${nf(us.length)} המשתמשים האחרונים שנסרקו, מכלל ${nf(total)})` : '';
  const out = [];
  if (env === 'development') out.push({ id: 'env', level: 'warn', title: 'מופע פיתוח: הייצור עוד לא באוויר',
    detail: 'המפתח הוא sk_test_, כלומר מופע Development. לפני השקה יוצרים ב-Clerk מופע Production עם דומיין משלכם ומחליפים את המפתחות.' });
  if (!total) out.push({ id: 'no-users', level: 'info', title: 'עוד אין משתמשים במופע', detail: 'ברגע שמישהו יירשם דרך האתר, הוא יופיע כאן תוך דקה.' });
  if (us.length) {
    const inWin = (a, b) => us.filter((u) => u.created && now - u.created < b && now - u.created >= a).length;
    const tw = inWin(0, 7 * DAY); const lw = inWin(7 * DAY, 14 * DAY);
    const trend = tw > lw ? 'עלייה' : tw < lw ? 'ירידה' : 'בלי שינוי';
    out.push({ id: 'signups-week', level: tw < lw ? 'warn' : 'info', title: `השבוע נרשמו ${nf(tw)}, לעומת ${nf(lw)} בשבוע שעבר`,
      detail: `${trend} בהרשמות, לפי תאריך היצירה של כל משתמש${scope}.` });
    const nb = us.filter((u) => neverBack(u, now)).length;
    out.push({ id: 'never-back', level: nb ? 'warn' : 'ok', title: nb ? `${nf(nb)} משתמשים לא חזרו אחרי היום הראשון` : 'כל מי שנרשם חזר לפחות פעם אחת',
      detail: `משתמש שהפעילות האחרונה שלו הייתה בתוך 24 השעות שאחרי ההרשמה, ונרשם לפני יותר מיום${scope}.` });
    const blocked = us.filter((u) => u.banned || u.locked).length;
    out.push({ id: 'blocked', level: blocked ? 'bad' : 'ok', title: blocked ? `${nf(blocked)} משתמשים חסומים או נעולים` : 'אין משתמשים חסומים או נעולים',
      detail: blocked ? `${nf(us.filter((u) => u.banned).length)} חסומים ע"י מנהל, ${nf(us.filter((u) => u.locked).length)} נעולים אחרי ניסיונות כניסה כושלים. אפשר לשחרר מכאן.` : `נבדקו ${nf(us.length)} משתמשים${scope}.` });
    const tally = {}; for (const u of us) { const m = mainMethod(u); if (m) tally[m] = (tally[m] || 0) + 1; }
    const [top, n] = Object.entries(tally).sort((a, b) => b[1] - a[1])[0] || [];
    if (top) out.push({ id: 'top-method', level: 'info', title: `שיטת הכניסה הנפוצה: ${methodName(top)}`,
      detail: `${nf(n)} מתוך ${nf(us.length)} משתמשים (${Math.round((n / us.length) * 100)}%)${scope}. ${Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(1, 4).map(([k, v]) => `${methodName(k)}: ${nf(v)}`).join(' · ')}`.trim() });
  }
  if (orgs && orgs.enabled === false) out.push({ id: 'orgs-off', level: 'info', title: 'Organizations כבוי במופע',
    detail: 'אם צריך צוותים או חשבונות משותפים, מדליקים ב-Clerk Dashboard → Configure → Organizations.' });
  if (webhooks && !webhooks.localSecret) out.push({ id: 'webhook', level: 'info', title: 'אין סוד Webhook ב-‎.env',
    detail: 'CLERK_WEBHOOK_SECRET לא מוגדר, כך שהשרת לא יכול לאמת אירועים מ-Clerk (הרשמה, מחיקה). Clerk לא חושף webhooks דרך ה-API, הם מנוהלים ב-Dashboard.' });
  return out;
}

// ---------------------------------------------------------------- reads
async function scan() {
  const all = [];
  while (all.length < CAP) {
    const page = arr(await get(`/users?limit=${PAGE}&offset=${all.length}&order_by=-created_at`, 'רשימת המשתמשים'));
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

async function orgsRead() {
  try {
    const r = await get('/organizations?limit=50&include_members_count=true&order_by=-created_at', 'רשימת הארגונים');
    return { enabled: true, total: totalOf(r), list: listOf(r).map(pickOrg) };
  } catch (e) {
    if (e?.status === 403 && arr(e.json?.errors).some((x) => x?.code === 'organization_not_enabled_in_instance'))
      return { enabled: false, reason: 'Organizations כבוי במופע הזה, ולכן אין ארגונים להציג. מדליקים אותו ב-Clerk Dashboard → Configure → Organizations.' };
    throw e;
  }
}

// Sessions can only be listed per user (the API refuses a list without user_id), so the Sessions tab
// shows the active sessions of the most recently active users.
async function sessionsRead(users) {
  const who = users.filter((u) => u.lastActive).sort((a, b) => b.lastActive - a.lastActive).slice(0, SESS_USERS);
  const per = await Promise.all(who.map(async (u) => arr(await get(`/sessions?user_id=${u.id}&status=active&limit=20`, 'רשימת החיבורים'))
    .map((s) => ({ ...pickSession(s), userName: u.name, userEmail: u.email }))));
  return { list: per.flat().sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0)), users: who.length,
    capped: users.filter((u) => u.lastActive).length > who.length };
}

const val = (s, fn) => (s.error ? { error: s.error } : fn(s.value));

export function clerk() {
  if (!key()) return Promise.resolve(ok({ configured: false, how: HOW }));
  return cached('clerk', async () => {
    try {
      const env = keyMode(key());
      const pk = process.env.CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || '';
      const [inst, count, all, orgs, jwt, allow, block, domains, redirects, invites, waitlist, saml, oauth, emails] = await Promise.all([
        section(() => get('/instance', 'פרטי המופע')), section(() => get('/users/count', 'מספר המשתמשים')), section(scan), section(orgsRead),
        section(() => get('/jwt_templates', 'תבניות ה-JWT')), section(() => get('/allowlist_identifiers', 'רשימת ההיתר')),
        section(() => get('/blocklist_identifiers', 'רשימת החסימה')), section(() => get('/domains', 'הדומיינים')),
        section(() => get('/redirect_urls', 'כתובות ההפניה')), section(() => get('/invitations?status=pending&limit=100', 'ההזמנות')),
        section(() => get('/waitlist_entries?limit=1', 'רשימת ההמתנה')), section(() => get('/saml_connections?limit=1', 'חיבורי SAML')),
        section(() => get('/oauth_applications?limit=1', 'אפליקציות OAuth')), section(() => get('/templates/email', 'תבניות המייל')),
      ]);
      if (inst.error && count.error && all.error) return clean(fail(inst.error, { configured: true }));
      const raw = all.value || [];
      const users = raw.map(pickUser);
      const total = count.value?.total_count ?? users.length;
      const capped = !all.error && total > raw.length && raw.length >= CAP;
      const sessions = users.length ? await section(() => sessionsRead(users)) : { value: { list: [], users: 0, capped: false } };
      const webhooks = { readable: false, localSecret: Boolean(process.env.CLERK_WEBHOOK_SECRET),
        why: 'Clerk לא חושף רשימת webhooks דרך ה-Backend API. מנהלים אותם ב-Clerk Dashboard → Configure → Webhooks.' };
      const orgsV = val(orgs, (v) => v);
      return clean(ok({
        configured: true,
        instance: { id: str(inst.value?.id), env, envApi: str(inst.value?.environment_type), fapi: fapiHost(pk), error: inst.error,
          origins: arr(inst.value?.allowed_origins).length, subdomainAllowlist: inst.value?.subdomain_allowlist_enabled === true },
        users: all.error ? { error: all.error, total: count.value?.total_count ?? null } : { total, list: users.slice(0, SHOWN), scanned: users.length },
        signups: all.error ? { error: all.error } : { days: signupDays(users), scanned: users.length, capped },
        orgs: orgsV,
        sessions: val(sessions, (v) => v),
        config: {
          jwt: val(jwt, (v) => arr(v).map((t) => str(t?.name)).filter(Boolean)),
          allowlist: val(allow, totalOf), blocklist: val(block, totalOf),
          domains: val(domains, (v) => listOf(v).map((d) => ({ name: str(d?.name), satellite: d?.is_satellite === true, fapi: url(d?.frontend_api_url), accounts: url(d?.accounts_portal_url) }))),
          redirects: val(redirects, (v) => listOf(v).map((r) => url(r?.url) || str(r?.url)).filter(Boolean)),
          invitations: val(invites, totalOf), waitlist: val(waitlist, totalOf), saml: val(saml, totalOf), oauthApps: val(oauth, totalOf),
          emailTemplates: val(emails, (v) => ({ total: listOf(v).length, enabled: listOf(v).filter((t) => t?.enabled === true).length })),
        },
        webhooks,
        insights: all.error ? [] : derive({ env, users, total, capped, orgs: orgsV.error ? null : orgsV, webhooks }),
      }));
    } catch (e) { return clean(fail(e?.reason || 'Clerk לא זמין', { configured: true })); }
  });
}

// ---------------------------------------------------------------- actions
const WRITES = {
  ban: { re: USER, path: (id) => `/users/${id}/ban`, what: 'חסימת המשתמש' },
  unban: { re: USER, path: (id) => `/users/${id}/unban`, what: 'שחרור החסימה' },
  lock: { re: USER, path: (id) => `/users/${id}/lock`, what: 'נעילת המשתמש' },
  unlock: { re: USER, path: (id) => `/users/${id}/unlock`, what: 'שחרור הנעילה' },
  'revoke-session': { re: SESS, path: (id) => `/sessions/${id}/revoke`, what: 'ניתוק החיבור' },
};
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

export async function clerkAction(body = {}) {
  const { kind, id, q, dryRun } = body || {};
  if (kind === 'search') return search(q);
  if (kind === 'sessions') return userSessions(id);
  if (!has(WRITES, kind)) return fail('פעולה לא מוכרת');
  const w = WRITES[kind];
  if (typeof id !== 'string' || !w.re.test(id)) return fail('מזהה לא תקין');
  const plan = { method: 'POST', url: `${BASE}${w.path(id)}`, body: null };
  if (dryRun === true) return ok({ dryRun: true, plan });
  if (!key()) return fail('Clerk עדיין לא מחובר', { configured: false, how: HOW });
  let res;
  try { res = await fetchJson(plan.url, { label: LABEL, what: w.what, method: 'POST', headers: { authorization: `Bearer ${key()}` } }); } catch (e) { return clean(fail(e?.reason || `${w.what} נכשלה`)); }
  uncache('clerk');
  if (kind === 'revoke-session') return clean(ok({ kind, id, session: pickSession(res || {}), note: 'החיבור נותק. אם המשתמש ירצה, הוא פשוט יתחבר שוב בפעם הבאה.' }));
  return clean(ok({ kind, id, user: pickUser(res || {}) }));
}

async function search(q = '') {
  if (typeof q !== 'string' || q.length > 200 || /[\u0000-\u001f\u007f]/.test(q)) return fail('חיפוש לא תקין');
  if (!key()) return fail('Clerk עדיין לא מחובר', { configured: false, how: HOW });
  const qs = q.trim() ? `&query=${encodeURIComponent(q.trim())}` : '';
  try {
    const [list, count] = await Promise.all([get(`/users?limit=${SHOWN}&order_by=-created_at${qs}`, 'חיפוש המשתמשים'), get(`/users/count?${qs.slice(1)}`, 'מספר המשתמשים')]);
    return clean(ok({ q: q.trim(), users: arr(list).map(pickUser), total: count?.total_count ?? null }));
  } catch (e) { return clean(fail(e?.reason || 'החיפוש נכשל')); }
}

async function userSessions(id) {
  if (typeof id !== 'string' || !USER.test(id)) return fail('מזהה לא תקין');
  if (!key()) return fail('Clerk עדיין לא מחובר', { configured: false, how: HOW });
  try {
    const list = arr(await get(`/sessions?user_id=${id}&limit=50`, 'רשימת החיבורים'));
    return clean(ok({ id, sessions: list.map(pickSession) }));
  } catch (e) { return clean(fail(e?.reason || 'לא הצלחנו להביא את החיבורים')); }
}
