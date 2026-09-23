// Platforms whose keys are not in .env yet. Each card reports itself unconfigured with a Hebrew how-to;
// the moment its key lands in .env and the dashboard restarts, the same card reads the official REST
// API for real. Only non-personal figures leave the server (counts, names, statuses, times, amounts):
// never an email, never key material. The only write is a PostHog feature-flag toggle.
import { fetchJson, cached, uncache, ok, fail, section, UpstreamError } from '../http.mjs';

const RESTART = 'ואז הפעילו מחדש את הדשבורד.';
export const CONNECTORS = [
  { id: 'stripe', name: 'Stripe', color: '#635BFF', env: ['STRIPE_SECRET_KEY'], optional: [],
    how: 'ב-Stripe Dashboard ודאו שהמתג Test mode דלוק → Developers → API keys → Create restricted key, תנו הרשאת Read בלבד '
      + 'ל-Balance, Charges, Customers ו-Products ו-None לכל השאר → העתיקו את המפתח (מתחיל ב-rk_test_) והוסיפו לקובץ ‎.env שורה '
      + `STRIPE_SECRET_KEY=<המפתח>, ${RESTART} מפתח חי (live) נחסם בכוונה.`,
    docs: 'https://docs.stripe.com/keys', blurb: 'יתרה, 10 החיובים האחרונים, לקוחות ומוצרים — במצב בדיקה (test) בלבד' },
  { id: 'posthog', name: 'PostHog', color: '#F54E00', env: ['POSTHOG_PERSONAL_API_KEY', 'POSTHOG_PROJECT_ID'], optional: ['POSTHOG_HOST'],
    how: 'ב-PostHog: לחצו על האווטאר → Account settings → Personal API keys → Create personal API key, הגבילו לפרויקט אחד ובחרו '
      + 'Read ל-Project ול-Feature flags (Write ל-Feature flags רק אם רוצים להדליק/לכבות דגלים מהדשבורד) → הוסיפו לקובץ ‎.env '
      + 'שורות POSTHOG_PERSONAL_API_KEY=<המפתח> ו-POSTHOG_PROJECT_ID=<מספר הפרויקט, מופיע בכתובת או ב-Project settings>; '
      + `בחשבון אירופי הוסיפו גם POSTHOG_HOST=https://eu.posthog.com, ${RESTART}`,
    docs: 'https://posthog.com/docs/api', blurb: 'שם הפרויקט ודגלי הפיצ׳רים (feature flags) — פעיל/כבוי ואחוז החשיפה' },
  { id: 'resend', name: 'Resend', color: '#000000', env: ['RESEND_API_KEY'], optional: [],
    how: 'ב-Resend: API Keys → Create API Key. מפתח Sending access לא יכול לקרוא את רשימת הדומיינים, לכן צרו מפתח Full access '
      + `ייעודי לדשבורד (הוא רק קורא) → הוסיפו לקובץ ‎.env שורה RESEND_API_KEY=<המפתח>, ${RESTART}`,
    docs: 'https://resend.com/docs/api-reference/domains/list-domains', blurb: 'הדומיינים לשליחת מייל ומצב האימות שלהם' },
  { id: 'vercel', name: 'Vercel', color: '#000000', env: ['VERCEL_TOKEN'], optional: ['VERCEL_TEAM_ID'],
    how: 'ב-Vercel: Account Settings → Tokens → Create Token, בחרו Scope של הצוות הרלוונטי בלבד ותאריך תפוגה → הוסיפו לקובץ ‎.env '
      + 'שורה VERCEL_TOKEN=<הטוקן>; אם הפרויקטים שייכים ל-Team הוסיפו גם VERCEL_TEAM_ID=<ה-Team ID מ-Team Settings → General>, '
      + RESTART,
    docs: 'https://vercel.com/docs/rest-api', blurb: 'הפרויקטים וה-deployments האחרונים ומצבם' },
  { id: 'netlify', name: 'Netlify', color: '#00C7B7', env: ['NETLIFY_AUTH_TOKEN'], optional: [],
    how: 'ב-Netlify: User settings → Applications → Personal access tokens → New access token, עם תאריך תפוגה (ל-Netlify אין '
      + `טוקן לקריאה בלבד; הדשבורד רק קורא) → הוסיפו לקובץ ‎.env שורה NETLIFY_AUTH_TOKEN=<הטוקן>, ${RESTART}`,
    docs: 'https://docs.netlify.com/api/get-started/', blurb: 'האתרים, הכתובת שלהם ומצב הפרסום האחרון' },
  { id: 'openrouter', name: 'OpenRouter', color: '#6467F2', env: ['OPENROUTER_API_KEY'], optional: [],
    how: 'ב-OpenRouter: Settings → API Keys → Create Key, עם Credit limit נמוך (למשל 1$) כדי שמפתח שדלף לא יעלה כסף → הוסיפו '
      + `לקובץ ‎.env שורה OPENROUTER_API_KEY=<המפתח>, ${RESTART}`,
    docs: 'https://openrouter.ai/docs/api-reference/limits', blurb: 'כמה קרדיט נוצל, מה המגבלה וכמה נשאר' },
  { id: 'assemblyai', name: 'AssemblyAI', color: '#2545D3', env: ['ASSEMBLYAI_API_KEY'], optional: [],
    how: 'ב-AssemblyAI Dashboard: API Keys → Create new API key (עדיף בפרויקט נפרד לדשבורד; הדשבורד רק קורא) → הוסיפו לקובץ '
      + `‎.env שורה ASSEMBLYAI_API_KEY=<המפתח>, ${RESTART}`,
    docs: 'https://www.assemblyai.com/docs/api-reference/transcripts/list', blurb: '10 התמלולים האחרונים, מצבם ואורך האודיו' },
  { id: 'clerk', name: 'Clerk', color: '#6C47FF', env: ['CLERK_SECRET_KEY'], optional: [],
    how: 'ב-Clerk Dashboard: בחרו את האפליקציה ואת הסביבה (Development) → Configure → API keys → Secret keys → Add new key → '
      + `הוסיפו לקובץ ‎.env שורה CLERK_SECRET_KEY=<המפתח>, ${RESTART} הדשבורד מציג רק מספרים ותאריכים, בלי פרטי משתמשים.`,
    docs: 'https://clerk.com/docs/reference/backend-api', blurb: 'מספר המשתמשים ומתי נרשמו/התחברו האחרונים' },
  { id: 'langflow', name: 'Langflow', color: '#7528FC', env: ['LANGFLOW_API_KEY', 'LANGFLOW_URL'], optional: [],
    how: 'בשרת ה-Langflow שלכם: Settings → Langflow API Keys → Add New → הוסיפו לקובץ ‎.env שורות LANGFLOW_API_KEY=<המפתח> '
      + `ו-LANGFLOW_URL=<כתובת השרת, למשל http://localhost:7860>, ${RESTART}`,
    docs: 'https://docs.langflow.org/api-reference-api-examples', blurb: 'ה-flows בשרת ומתי עודכנו' },
];

const env = (k) => process.env[k] || '';
const bearer = (k) => ({ authorization: `Bearer ${env(k)}` });
// A configured base URL must be plain http(s); anything else is refused before a request is built.
function baseUrl(raw, label, name) {
  let u; try { u = new URL(raw); } catch {}
  if (!u || !/^https?:$/.test(u.protocol)) throw new UpstreamError('config', `${name} ב-‎.env אינו כתובת http(s) תקינה (${label})`);
  return `${u.origin}${u.pathname}`.replace(/\/+$/, '');
}
const phHost = () => baseUrl(env('POSTHOG_HOST') || 'https://us.posthog.com', 'PostHog', 'POSTHOG_HOST');
const phProject = () => `${phHost()}/api/projects/${encodeURIComponent(env('POSTHOG_PROJECT_ID'))}`;

// Each reader returns the card's `data`, or throws an UpstreamError whose Hebrew reason becomes `error`.
const READ = {
  async stripe() {
    // Test mode only: a live key never reaches Stripe from this dashboard.
    if (!/^(sk|rk)_test_/.test(env('STRIPE_SECRET_KEY')))
      throw new UpstreamError('live', 'המפתח של Stripe הוא מפתח חי (live) — הדשבורד עובד רק עם מפתח בדיקה (test)');
    const get = (p, what) => fetchJson(`https://api.stripe.com/v1${p}`, { label: 'Stripe', what, headers: bearer('STRIPE_SECRET_KEY') });
    const [bal, ch, cu, pr] = await Promise.all([get('/balance', 'היתרה'), get('/charges?limit=10', 'רשימת החיובים'),
      get('/customers?limit=10', 'רשימת הלקוחות'), get('/products?limit=10', 'רשימת המוצרים')]);
    const money = (xs) => (xs || []).map((b) => ({ amount: b.amount, currency: b.currency }));
    return {
      livemode: [bal, ch, cu, pr].some((r) => r?.livemode === true) || (ch?.data || []).some((c) => c.livemode === true),
      balance: { available: money(bal?.available), pending: money(bal?.pending) },
      charges: (ch?.data || []).map((c) => ({ amount: c.amount, currency: c.currency, status: c.status, created: c.created, paid: c.paid })),
      customers: { count: (cu?.data || []).length, has_more: Boolean(cu?.has_more) },
      products: (pr?.data || []).map((p) => ({ name: p.name, active: p.active })),
    };
  },
  async posthog() {
    const get = (p, what) => fetchJson(`${phProject()}${p}`, { label: 'PostHog', what, headers: bearer('POSTHOG_PERSONAL_API_KEY') });
    const [proj, flags] = await Promise.all([get('/', 'פרטי הפרויקט'), get('/feature_flags/?limit=50', 'רשימת הדגלים')]);
    // A rollout figure only when the flag is one condition-free group; anything richer shows as null.
    const rollout = (f) => { const g = f.filters?.groups;
      return g?.length === 1 && !(g[0].properties?.length) ? (g[0].rollout_percentage ?? 100) : null; };
    return {
      project: proj?.name ?? null, count: flags?.count ?? (flags?.results || []).length,
      flags: (flags?.results || []).map((f) => ({ id: f.id, key: f.key, name: f.name ?? '', active: Boolean(f.active), rollout_percentage: rollout(f) })),
    };
  },
  async resend() {
    const r = await fetchJson('https://api.resend.com/domains', { label: 'Resend', what: 'רשימת הדומיינים', headers: bearer('RESEND_API_KEY') });
    return { domains: (r?.data || []).map((d) => ({ name: d.name, status: d.status, region: d.region ?? null, created_at: d.created_at })) };
  },
  async vercel() {
    const team = env('VERCEL_TEAM_ID') ? `&teamId=${encodeURIComponent(env('VERCEL_TEAM_ID'))}` : '';
    const get = (p, what) => fetchJson(`https://api.vercel.com${p}${team}`, { label: 'Vercel', what, headers: bearer('VERCEL_TOKEN') });
    const [pj, dp] = await Promise.all([get('/v9/projects?limit=20', 'רשימת הפרויקטים'), get('/v6/deployments?limit=10', 'רשימת ה-deployments')]);
    return {
      projects: (pj?.projects || []).map((p) => ({ name: p.name, framework: p.framework ?? null, updatedAt: p.updatedAt })),
      deployments: (dp?.deployments || []).map((d) => ({ name: d.name, state: d.state ?? d.readyState ?? null, target: d.target ?? null,
        created: d.created ?? d.createdAt, url: d.url ? `https://${d.url}` : null })),
    };
  },
  async netlify() {
    const r = await fetchJson('https://api.netlify.com/api/v1/sites?per_page=20', { label: 'Netlify', what: 'רשימת האתרים', headers: bearer('NETLIFY_AUTH_TOKEN') });
    return { sites: (r || []).map((s) => ({ name: s.name, url: s.ssl_url || s.url, state: s.state ?? null, updated_at: s.updated_at,
      deploy_state: s.published_deploy?.state ?? null })) };
  },
  async openrouter() {
    const r = await fetchJson('https://openrouter.ai/api/v1/key', { label: 'OpenRouter', what: 'נתוני המפתח', headers: bearer('OPENROUTER_API_KEY') });
    const d = r?.data || {}; // data.label is a fragment of the key itself: never forwarded
    return { usage: d.usage ?? null, limit: d.limit ?? null, is_free_tier: d.is_free_tier ?? null, limit_remaining: d.limit_remaining ?? null };
  },
  async assemblyai() {
    const r = await fetchJson('https://api.assemblyai.com/v2/transcript?limit=10', { label: 'AssemblyAI', what: 'רשימת התמלולים',
      headers: { authorization: env('ASSEMBLYAI_API_KEY') } });
    return { transcripts: (r?.transcripts || []).map((t) => ({ id: t.id, status: t.status, created: t.created, audio_duration: t.audio_duration ?? null })) };
  },
  async clerk() {
    const get = (p, what) => fetchJson(`https://api.clerk.com/v1${p}`, { label: 'Clerk', what, headers: bearer('CLERK_SECRET_KEY') });
    const [count, users] = await Promise.all([get('/users/count', 'מספר המשתמשים'), get('/users?limit=10&order_by=-created_at', 'רשימת המשתמשים')]);
    return { total: count?.total_count ?? null,
      users: (Array.isArray(users) ? users : users?.data || []).map((u) => ({ created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null })) };
  },
  async langflow() {
    const base = baseUrl(env('LANGFLOW_URL'), 'Langflow', 'LANGFLOW_URL');
    const r = await fetchJson(`${base}/api/v1/flows/?remove_example_flows=true`, { label: 'Langflow', what: 'רשימת ה-flows',
      headers: { 'x-api-key': env('LANGFLOW_API_KEY') } });
    return { flows: (Array.isArray(r) ? r : r?.items || []).map((f) => ({ id: f.id, name: f.name, updated_at: f.updated_at ?? null,
      is_component: Boolean(f.is_component) })) };
  },
};

const card = (c) => {
  const need = c.env.filter((k) => !env(k));
  return { id: c.id, name: c.name, color: c.color, configured: !need.length, need, how: c.how, docs: c.docs, blurb: c.blurb };
};

export async function connectors() {
  const list = await Promise.all(CONNECTORS.map(async (c) => {
    const out = card(c);
    if (!out.configured) return out;
    const s = await section(() => cached(`conn:${c.id}`, READ[c.id]));
    return s.error ? { ...out, error: s.error } : { ...out, data: s.value };
  }));
  return ok({ list });
}

// The single write: turn one PostHog feature flag on or off. Everything is validated before any key,
// URL or request is touched; dryRun only shows the request it would send.
export async function connectorAction({ id, kind, target, value, dryRun } = {}) {
  if (id !== 'posthog' || kind !== 'flag') return fail('פעולה לא מוכרת');
  if (!(typeof target === 'string' || Number.isInteger(target)) || !/^\d{1,20}$/.test(String(target))) return fail('מזהה הדגל לא תקין');
  if (typeof value !== 'boolean') return fail('הערך חייב להיות true או false');
  const body = { active: value };
  if (dryRun === true) {
    let host; try { host = phHost(); } catch (e) { return fail(e.reason); }
    const project = env('POSTHOG_PROJECT_ID') ? encodeURIComponent(env('POSTHOG_PROJECT_ID')) : '{POSTHOG_PROJECT_ID}';
    return ok({ dryRun: true, plan: { method: 'PATCH', url: `${host}/api/projects/${project}/feature_flags/${target}/`, body } });
  }
  const c = card(CONNECTORS.find((x) => x.id === 'posthog'));
  if (!c.configured) return fail('PostHog עדיין לא מחובר', { configured: false, need: c.need, how: c.how });
  try {
    await fetchJson(`${phProject()}/feature_flags/${target}/`, { label: 'PostHog', what: 'שינוי הדגל', method: 'PATCH',
      headers: bearer('POSTHOG_PERSONAL_API_KEY'), body });
  } catch (e) { return fail(e?.reason || 'שינוי הדגל נכשל'); }
  uncache('conn:posthog');
  return ok({ id, kind, target: String(target), value });
}
