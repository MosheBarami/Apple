// Sentry. Without SENTRY_AUTH_TOKEN it says how to connect it; the moment the token (and optionally
// SENTRY_ORG) lands in .env and the server restarts, the same route lists unresolved issues for real.
// SENTRY_BASE is the org's region host (e.g. https://us.sentry.io); sentry.io serves when it is unset.
import { fetchJson, cached, uncache, ok, fail } from '../http.mjs';

const api = () => `${(process.env.SENTRY_BASE || 'https://sentry.io').replace(/\/+$/, '')}/api/0`;
const LABEL = 'Sentry';
const HOW = 'ב-Sentry: Settings → Developer Settings → Custom Integrations → Create New Integration (Internal) עם ההרשאות '
  + 'event:read, event:write, project:read → העתיקו את ה-Token והוסיפו לקובץ ‎.env שתי שורות: SENTRY_AUTH_TOKEN=<הטוקן> '
  + 'ו-SENTRY_ORG=<ה-slug של הארגון>, ואז הפעילו מחדש את הדשבורד.';

const auth = () => ({ authorization: `Bearer ${process.env.SENTRY_AUTH_TOKEN}` });
const get = (p, what) => fetchJson(`${api()}${p}`, { label: LABEL, what, headers: auth() });

async function org() {
  if (process.env.SENTRY_ORG) return process.env.SENTRY_ORG;
  const orgs = await get('/organizations/', 'רשימת הארגונים');
  return orgs?.[0]?.slug ?? null;
}

export function sentry() {
  if (!process.env.SENTRY_AUTH_TOKEN) return Promise.resolve(ok({ configured: false, how: HOW }));
  return cached('sentry', async () => {
    try {
      const slug = await org();
      if (!slug) return fail('לטוקן של Sentry אין גישה לאף ארגון', { configured: true });
      const [projects, issues] = await Promise.all([
        get(`/organizations/${encodeURIComponent(slug)}/projects/`, 'רשימת הפרויקטים'),
        get(`/organizations/${encodeURIComponent(slug)}/issues/?query=${encodeURIComponent('is:unresolved')}&limit=50&statsPeriod=14d`, 'רשימת התקלות'),
      ]);
      return ok({
        configured: true, org: slug,
        projects: (projects || []).map((p) => ({ slug: p.slug, name: p.name, platform: p.platform ?? null })),
        issues: (issues || []).map((i) => ({ id: i.id, shortId: i.shortId, title: i.title, culprit: i.culprit ?? null, level: i.level,
          count: Number(i.count), users: i.userCount, firstSeen: i.firstSeen, lastSeen: i.lastSeen, project: i.project?.slug ?? null,
          url: i.permalink })),
      });
    } catch (e) { return fail(e?.reason || 'Sentry לא זמין', { configured: true }); }
  });
}

export async function sentryAction({ kind, id }) {
  if (kind !== 'resolve') return fail('פעולה לא מוכרת');
  if (!process.env.SENTRY_AUTH_TOKEN) return fail('Sentry עדיין לא מחובר', { configured: false, how: HOW });
  if (!/^\d{1,20}$/.test(String(id))) return fail('מזהה לא תקין');
  try {
    const slug = await org();
    await fetchJson(`${api()}/organizations/${encodeURIComponent(slug)}/issues/?id=${id}`, { label: LABEL, what: 'סגירת תקלה',
      method: 'PUT', headers: auth(), body: { status: 'resolved' } });
  } catch (e) { return fail(e?.reason || 'סגירת התקלה נכשלה'); }
  uncache('sentry');
  return ok({ kind, id: String(id) });
}
