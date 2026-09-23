// The owner console (לקוחות ועסק): users and plans, subscriptions and revenue, the sign-up funnel,
// the top errors, flags and kill switches, the audit log and the open alerts. Read-only: nothing
// here changes a plan, a flag or a subscription, sends a message or charges anyone.
// Sources: Supabase (auth.users + public.profiles through a read_only SQL query), the worker's admin
// API (apple(), /api/admin/logs for builds and audit, /api/admin/account/:id for the active users),
// clerk(), sentry() and insights(). Emails leave this module masked (a***@domain).
// /api/admin/billing-reconcile is deliberately not called: with billing unconfigured it answers 503,
// and every 503 becomes a Sentry event.
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, cached, ok, fail, section, REPO } from '../http.mjs';
import { apple } from './apple.mjs';
import { WORKER_URL } from './cloudflare.mjs';
import { REF } from './supabase.mjs';
import { sentry } from './sentry.mjs';
import { insights } from '../insights.mjs';

const maskEmail = (e) => { const m = String(e ?? '').match(/^([^@]{0,64})@(.+)$/); return m ? `${m[1].slice(0, 1)}***@${m[2]}` : null; }; // same as resend.mjs
const arr = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : null);
const iso = (x) => { const t = x == null ? NaN : new Date(typeof x === 'number' ? x : String(x)).getTime(); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const scopeOf = (s) => (typeof s === 'string' ? s.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d{3,}/g, '/:n').slice(0, 80) : null);
const MAX_ACCOUNTS = 5; // each /api/admin/account read is one more audit row in the worker's log

const USERS_SQL = `select u.id, u.email, u.created_at, u.last_sign_in_at, (u.email_confirmed_at is not null) as confirmed,
  coalesce(p.plan, 'free') as plan, coalesce(p.is_admin, false) as is_admin,
  (select count(*) from public.projects pr where pr.owner_id = u.id)::int as projects
  from auth.users u left join public.profiles p on p.id = u.id order by u.created_at desc limit 500`;
const sbUsers = () => fetchJson(`https://api.supabase.com/v1/projects/${REF}/database/query`, { label: 'Supabase', what: 'רשימת המשתמשים', method: 'POST',
  headers: { authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}` }, body: { query: USERS_SQL, read_only: true } });

const base = () => (process.env.API_BASE || WORKER_URL).replace(/\/+$/, '');
const admin = (p, what) => fetchJson(`${base()}${p}`, { label: 'Apple', what, headers: { 'x-admin-key': process.env.GOLEM_ADMIN_KEY } });

// The worker's deployed flags that are plain config (wrangler.jsonc "vars"), not secrets.
function workerVars() {
  try {
    const t = fs.readFileSync(path.join(REPO, 'apps/worker/wrangler.jsonc'), 'utf8').replace(/^\s*\/\/.*$/gm, '').replace(/,(\s*[}\]])/g, '$1');
    const v = JSON.parse(t).vars || {};
    return ['ENVIRONMENT', 'AI_GATEWAY_ID', 'BILLING_WORKER_NAME', 'MEMBERSHIP_OUTBOX_CONSUMER'].filter((k) => v[k] != null).map((k) => ({ k, v: String(v[k]) }));
  } catch { return []; }
}

/** Pure: the page from the raw reads. Exported for the tests. */
export function derive({ users = null, clerk = null, a = {}, builds = [], audit = [], accounts = {}, st = null, ins = null, now = Date.now() } = {}) {
  const list = arr(users);
  const DAY = 864e5;
  const signups = [];
  for (let i = 29; i >= 0; i--) signups.push({ day: new Date(now - i * DAY).toISOString().slice(0, 10), n: 0 });
  const idx = Object.fromEntries(signups.map((d, i) => [d.day, i]));
  for (const u of list) { const d = iso(u.created_at)?.slice(0, 10); if (d in idx) signups[idx[d]].n++; }
  const plans = {}; for (const u of list) plans[u.plan || 'free'] = (plans[u.plan || 'free'] || 0) + 1;

  const builders = new Set(builds.map((e) => e?.actorId).filter((x) => typeof x === 'string' && x));
  const active7 = list.filter((u) => u.last_sign_in_at && now - new Date(u.last_sign_in_at).getTime() < 7 * DAY).length;
  const paired = n(a.counters && Object.values(a.counters.studio_paired || {}).reduce((t, x) => t + x, 0));
  const funnel = users ? [
    { k: 'signup', label: 'נרשמו', n: list.length, source: 'Supabase auth.users' },
    { k: 'confirmed', label: 'אישרו מייל', n: list.filter((u) => u.confirmed).length, source: 'Supabase auth.users' },
    { k: 'project', label: 'יצרו פרויקט', n: list.filter((u) => n(u.projects) > 0).length, source: 'Supabase public.projects' },
    { k: 'built', label: 'הריצו בנייה (30 יום)', n: builders.size, source: 'יומן הבניות של העובד (חלון הלוג בלבד)' },
    { k: 'paid', label: 'בתוכנית שאינה חינם', n: list.filter((u) => u.plan && u.plan !== 'free').length, source: 'Supabase public.profiles.plan' },
  ] : null;

  const byId = Object.fromEntries(list.map((u) => [u.id, u]));
  const userRows = list.slice(0, 100).map((u) => ({ k: u.id.slice(0, 8), email: maskEmail(u.email), created: iso(u.created_at), lastSignIn: iso(u.last_sign_in_at),
    confirmed: Boolean(u.confirmed), plan: u.plan || 'free', admin: Boolean(u.is_admin), projects: n(u.projects) ?? 0, test: /@golem\.internal$|^e2e|load-?test/i.test(u.email || ''),
    worker: accounts[u.id] || null }));
  const workerPlans = Object.entries(accounts).map(([id, x]) => ({ k: id.slice(0, 8), email: maskEmail(byId[id]?.email) || null, ...x }));

  const errors = {
    byKind: arr(a.errorsByKind).slice(0, 8), byScope: arr(a.errorsByScope).slice(0, 8), recent: arr(a.errorLog?.recent).slice(0, 8),
    sentry: st?.ok ? arr(st.issues).filter((i) => i.status !== 'resolved').sort((p, q) => (q.count || 0) - (p.count || 0)).slice(0, 8)
      .map((i) => ({ k: i.id, title: i.title, culprit: i.culprit, count: i.count, lastSeen: i.lastSeen, project: i.project, level: i.level, url: i.url })) : null,
  };

  const w = a.billing || {}; const sp = a.spend || {};
  const flags = [
    { k: 'kill', label: 'מתג החירום של ההוצאה', on: Boolean(sp.killed), tone: sp.killed ? 'bad' : 'ok', text: sp.killed ? 'פעיל: העובד מסרב לקריאות מודל' : 'כבוי: העובד קורא למודלים כרגיל', source: '/api/admin/spend' },
    { k: 'production', label: 'העובד רץ כסביבת פרודקשן', on: Boolean(w.production), tone: 'info', text: w.production ? 'כן' : 'לא', source: '/api/admin/billing-wiring' },
    { k: 'keymode', label: 'מפתח Stripe בעובד', on: w.keyMode === 'live', tone: w.keyMode === 'live' ? 'ok' : 'warn',
      text: w.keyMode === 'test' && w.production ? 'מצב test בפרודקשן: תשלומים אמיתיים לא ייגבו' : w.keyMode ? `מצב ${w.keyMode}` : 'אין מפתח', source: '/api/admin/billing-wiring' },
    { k: 'webhook', label: 'סוד webhook של Stripe', on: Boolean(w.webhook), tone: w.webhook ? 'ok' : 'warn', text: w.webhook ? 'מוגדר' : 'לא מוגדר', source: '/api/admin/billing-wiring' },
    { k: 'authority', label: 'העובד הזה הוא מקור החיובים', on: Boolean(w.authority), tone: 'info', text: w.authority ? 'כן' : 'לא', source: '/api/admin/billing-wiring' },
    a.product ? { k: 'analytics', label: 'אנליטיקת מוצר', on: a.product.configured, tone: a.product.configured ? 'ok' : 'info', text: a.product.configured ? 'מחוברת' : 'לא מחוברת: חסרים CF_ACCOUNT_ID ו-CF_ANALYTICS_TOKEN בעובד', source: '/api/admin/product-analytics' } : null,
  ].filter(Boolean);
  const routing = arr(a.routing).map((r) => ({ k: r.id, label: r.label, provider: r.provider, available: r.available }));

  const auditRows = audit.filter((e) => e && typeof e === 'object').sort((p, q) => (n(q.at) || 0) - (n(p.at) || 0));
  const byAction = {}; for (const e of auditRows) { const k = scopeOf(e.action) || '—'; byAction[k] = (byAction[k] || 0) + 1; }
  const auditOut = { total: auditRows.length, refused: auditRows.filter((e) => e.allowed === false).length,
    byAction: Object.entries(byAction).sort((p, q) => q[1] - p[1]).slice(0, 10).map(([k, c]) => ({ k, n: c })),
    recent: auditRows.slice(0, 40).map((e, i) => ({ k: `${n(e.at)}-${i}`, at: n(e.at), action: scopeOf(e.action), actor: e.actorKind || null, allowed: e.allowed !== false, subject: scopeOf(e.subject) })) };

  return {
    users: users ? { total: list.length, confirmed: list.filter((u) => u.confirmed).length, active7, test: userRows.filter((u) => u.test).length, plans: Object.entries(plans).map(([k, c]) => ({ k, n: c })),
      signups, list: userRows, source: 'Supabase auth.users + public.profiles' } : null,
    clerk: clerk?.ok ? { total: clerk.users?.total ?? null, env: clerk.instance?.env ?? null } : null,
    workerPlans, funnel, errors, flags, routing, audit: auditOut,
    alerts: ins?.ok ? arr(ins.insights).slice(0, 12).map((x) => ({ k: x.id, sev: x.sev, platform: x.platform, title: x.title, why: x.why })) : null,
    billing: { keyMode: w.keyMode ?? null, production: Boolean(w.production), webhook: Boolean(w.webhook), prices: w.prices || null, why: w.why ?? null },
    paired,
  };
}

export function business() {
  return cached('business', async () => {
    const haveAdmin = Boolean(process.env.GOLEM_ADMIN_KEY);
    const [users, ap, bl, au, st, ins, ck] = await Promise.all([
      process.env.SUPABASE_ACCESS_TOKEN ? section(sbUsers) : { error: 'חסר SUPABASE_ACCESS_TOKEN' },
      apple().catch(() => null),
      haveAdmin ? section(() => admin('/api/admin/logs?kind=build&days=30&limit=500', 'יומן הבניות')) : { error: 'חסר GOLEM_ADMIN_KEY' },
      haveAdmin ? section(() => admin('/api/admin/logs?kind=audit&days=7&limit=500', 'יומן הביקורת')) : { error: 'חסר GOLEM_ADMIN_KEY' },
      sentry().catch(() => null), insights().catch(() => null),
      import('./clerk.mjs').then((m) => m.clerk()).catch(() => null)]);
    if (users.error && !ap?.ok) return fail(users.error, { errors: { supabase: users.error, apple: ap?.reason ?? null } });
    // The worker's own plan and credits for the users who built something lately (a handful at most).
    const builds = arr(bl.value?.events);
    const active = [...new Set(builds.map((e) => e?.actorId).filter((x) => /^[0-9a-f-]{36}$/i.test(x || '')))].slice(0, MAX_ACCOUNTS);
    const accounts = {};
    await Promise.all(active.map(async (id) => {
      const r = await section(() => admin(`/api/admin/account/${id}`, 'חשבון משתמש'));
      const q = r.value?.quota || {}; const b = r.value?.billing || {};
      accounts[id] = r.error ? { error: r.error } : { plan: b.plan ?? q.plan ?? null, subscription: b.subscription ? { status: b.subscription.status ?? null } : null,
        customer: Boolean(b.customerId), creditsUsedToday: n(q.creditsUsedToday), creditsDaily: n(q.creditsDaily), creditsUsedThisMonth: n(q.creditsUsedThisMonth),
        creditsMonthly: n(q.creditsMonthly), lastPlanChange: arr(b.events).filter((e) => e?.kind === 'plan').map((e) => ({ at: n(e.at), from: e.fromPlan, to: e.toPlan }))[0] || null };
    }));
    const out = derive({ users: users.value ? arr(users.value) : null, clerk: ck, a: ap?.ok ? ap : {}, builds, audit: arr(au.value?.events), accounts, st, ins });
    return ok({
      ...out, vars: workerVars(),
      noSource: [
        { k: 'revenue', name: 'הכנסות ומנויים ב-Stripe (test)', why: 'ל-.env המקומי אין STRIPE_SECRET_KEY (לעובד יש מפתח test, אבל אין לו נתיב קריאה לתשלומים), והעובד עונה על /api/admin/billing-reconcile ב-503 ("billing is not configured"). אין מקור שממנו אפשר לקרוא תשלומים או מנויים.', missing: 'STRIPE_SECRET_KEY' },
        { k: 'dash-audit', name: 'פעולות שנעשו מהלוח הזה', why: 'לוח הבקרה לא שומר יומן של הפעולות שלו. ביומן הביקורת של העובד מופיעות רק קריאות לנתיבי האדמין.', missing: 'יומן פעולות מקומי' },
        { k: 'funnel-visits', name: 'ביקורים לפני ההרשמה', why: 'אנליטיקת המוצר של העובד לא מחוברת (/api/admin/product-analytics מחזיר configured:false), ולכן המשפך מתחיל בהרשמה.', missing: 'CF_ANALYTICS_TOKEN בעובד' },
      ],
      errorsRead: Object.fromEntries(Object.entries({ supabase: users.error, builds: bl.error, audit: au.error, apple: ap?.ok === false ? ap.reason : null, sentry: st?.ok === false ? st.reason : null }).filter(([, v]) => v)),
    });
  }, 5 * 60000);
}
