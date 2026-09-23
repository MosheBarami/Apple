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
          url: i.permalink, status: i.status ?? null, substatus: i.substatus ?? null, priority: i.priority ?? null,
          bookmarked: Boolean(i.isBookmarked), seen: Boolean(i.hasSeen), unhandled: Boolean(i.isUnhandled),
          assignee: i.assignedTo?.name ?? null, trend: (i.stats?.['14d'] || i.stats?.['24h'] || []).map((p) => Number(p?.[1]) || 0) })),
      });
    } catch (e) { return fail(e?.reason || 'Sentry לא זמין', { configured: true }); }
  });
}

// Every kind is a single, reversible issue update. `resolve` stays for the owner; tests never send it
// to the real Sentry (the dashboard's dry-run shows the call instead).
const UPDATES = {
  resolve: { status: 'resolved' },
  unresolve: { status: 'unresolved' },
  ignore: { status: 'ignored', statusDetails: { ignoreUntilEscalating: true } },
  bookmark: { isBookmarked: true },
  unbookmark: { isBookmarked: false },
  seen: { hasSeen: true },
  'priority-high': { priority: 'high' },
  'priority-medium': { priority: 'medium' },
  'priority-low': { priority: 'low' },
};

export async function sentryAction({ kind, id, dryRun }) {
  const body = UPDATES[kind];
  if (!body) return fail('פעולה לא מוכרת');
  if (!/^\d{1,20}$/.test(String(id))) return fail('מזהה לא תקין');
  const url = (slug) => `${api()}/organizations/${encodeURIComponent(slug)}/issues/?id=${id}`;
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'PUT', url: url(process.env.SENTRY_ORG || '<org>'), body } });
  if (!process.env.SENTRY_AUTH_TOKEN) return fail('Sentry עדיין לא מחובר', { configured: false, how: HOW });
  try {
    const slug = await org();
    await fetchJson(url(slug), { label: LABEL, what: 'עדכון התקלה', method: 'PUT', headers: auth(), body });
  } catch (e) { return fail(e?.reason || 'עדכון התקלה נכשל'); }
  uncache('sentry');
  return ok({ kind, id: String(id) });
}
