// Sentry. Without SENTRY_AUTH_TOKEN it says how to connect it; the moment the token (and optionally
// SENTRY_ORG) lands in .env and the server restarts, the same route reads the org for real:
// unresolved issues (with the latest event's stack trace for the top few), releases and their health,
// daily event volume by outcome (stats_v2), alert workflows + detectors (the legacy alert-rule APIs
// answer 410), cron monitors and the projects. Each part fails on its own; the issues are the core.
// SENTRY_BASE is the org's region host (e.g. https://us.sentry.io); sentry.io serves when it is unset.
import { fetchJson, cached, uncache, ok, fail, section, redact } from '../http.mjs';

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

const NUM_ID = /^\d{1,20}$/;
const EVENTS_FOR = 5; // latest event (stack trace) prefetched for this many top issues: the endpoint allows 15 calls a window
const list = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const n = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);
const str = (x, max = 300) => (x == null ? null : String(x).slice(0, max));
// Event text is written by the monitored app, not by us: drop anything shaped like a credential.
const scrub = (s) => (s == null ? s : String(s)
  .replace(/\b(Bearer|Basic|Token)\s+[\w.~+/=-]{8,}/gi, '$1 [redacted]')
  .replace(/\b(?:sk|pk|rk|re|ghp|gho|ghs|github_pat|hf|gsk|xox[abprs])[_-][\w-]{8,}/g, '[redacted]')
  .replace(/([?&](?:token|key|secret|password|auth|sig|signature|code)=)[^&\s]+/gi, '$1[redacted]'));
const fail_ = (e) => ({ ok: false, reason: e });
const part = (s, fn) => (s.error ? fail_(s.error) : fn(s.value));

// ---------- normalisers (tolerant: the fake upstream answers [item] everywhere) ----------
const issueOf = (i) => ({ id: String(i.id), shortId: i.shortId ?? null, title: i.title ?? '', culprit: i.culprit ?? null, level: i.level ?? null,
  count: n(i.count), users: n(i.userCount), firstSeen: i.firstSeen ?? null, lastSeen: i.lastSeen ?? null, project: i.project?.slug ?? null,
  url: i.permalink ?? null, status: i.status ?? null, substatus: i.substatus ?? null, priority: i.priority ?? null,
  bookmarked: Boolean(i.isBookmarked), seen: Boolean(i.hasSeen), unhandled: Boolean(i.isUnhandled),
  assignee: i.assignedTo?.name ?? null, trend: list(i.stats?.['14d'] || i.stats?.['24h']).map((p) => n(p?.[1])) });

const projectOf = (p) => ({ id: str(p.id, 24), slug: p.slug ?? null, name: p.name ?? null, platform: p.platform ?? null,
  firstEvent: p.firstEvent ?? null, transactions: Boolean(p.firstTransactionEvent), sessions: Boolean(p.hasSessions),
  replays: Boolean(p.hasReplays), logs: Boolean(p.hasLogs), monitors: Boolean(p.hasMonitors), minified: Boolean(p.hasMinifiedStackTrace),
  release: str(p.latestRelease?.version, 80), environments: list(p.environments).slice(0, 8).map((e) => str(e, 40)) });

const releaseOf = (r) => ({ version: str(r.version, 120), short: str(r.shortVersion ?? r.version, 40), created: r.dateCreated ?? null,
  firstEvent: r.firstEvent ?? null, lastEvent: r.lastEvent ?? null, newGroups: n(r.newGroups), commits: n(r.commitCount), deploys: n(r.deployCount),
  projects: list(r.projects).map((p) => ({ slug: p.slug ?? null, health: Boolean(p.hasHealthData),
    crashFreeSessions: p.healthData?.crashFreeSessions ?? null, crashFreeUsers: p.healthData?.crashFreeUsers ?? null,
    adoption: p.healthData?.adoption ?? null })) });

// stats_v2 grouped by outcome × category → daily rows for errors and totals per category/outcome.
function volumeOf(raw) {
  const j = obj(raw); const days = list(j.intervals).map(String);
  const total = {}; const err = days.map((day) => ({ day }));
  for (const g of list(j.groups)) {
    const cat = String(g?.by?.category ?? 'other'), out = String(g?.by?.outcome ?? 'other');
    (total[cat] ||= {})[out] = n(g?.totals?.['sum(quantity)']);
    if (cat === 'error') list(g?.series?.['sum(quantity)']).forEach((v, i) => { if (err[i]) err[i][out] = n(v); });
  }
  return { days, errors: err.map((r) => ({ day: r.day, accepted: n(r.accepted), rate_limited: n(r.rate_limited), filtered: n(r.filtered),
    invalid: n(r.invalid), client_discard: n(r.client_discard) })), total };
}

const ALERTING = /first_seen|regression|reappeared|escalat|priority|event_frequency|event_unique_user|percent_sessions|every_event|new_high/;
const workflowOf = (w) => {
  const triggers = list(w.triggers?.conditions).map((c) => str(c?.type, 60)).filter(Boolean);
  return { id: str(w.id, 24), name: str(w.name, 160), enabled: Boolean(w.enabled), triggers,
    actions: list(w.actionFilters).flatMap((f) => list(f?.actions)).map((a) => str(a?.type, 40)).filter(Boolean),
    detectors: list(w.detectorIds).length, lastTriggered: w.lastTriggered ?? null, alertsOnErrors: triggers.some((t) => ALERTING.test(t)) };
};
const detectorOf = (d, bySlug) => ({ id: str(d.id, 24), name: str(d.name, 160), type: str(d.type, 40), enabled: Boolean(d.enabled),
  project: d.projectId ? bySlug[String(d.projectId)] ?? null : null, workflows: list(d.workflowIds).length,
  latest: d.latestGroup ? { shortId: str(d.latestGroup.shortId, 40), title: str(d.latestGroup.title, 200), lastSeen: d.latestGroup.lastSeen ?? null } : null });
const monitorOf = (m) => ({ slug: str(m.slug, 80), name: str(m.name, 160), status: str(m.status, 30) });

// Latest event → exceptions with in-app frames and a short code context. Never vars, request data,
// breadcrumbs or user; tags from an allowlist, URLs without their query string.
const TAGS = new Set(['environment', 'level', 'release', 'route', 'runtime', 'status', 'transaction', 'method', 'handled', 'mechanism',
  'browser', 'browser.name', 'os', 'os.name', 'capture', 'logger', 'url', 'server_name']);
const noQuery = (u) => String(u).split(/[?#]/)[0];
const frameOf = (f) => ({ file: scrub(str(f?.filename || f?.absPath, 200)), fn: str(f?.function, 120), line: Number.isInteger(f?.lineNo) ? f.lineNo : null,
  col: Number.isInteger(f?.colNo) ? f.colNo : null, inApp: Boolean(f?.inApp),
  ctx: f?.inApp ? list(f?.context).slice(0, 7).filter((c) => Array.isArray(c)).map(([ln, code]) => [n(ln), scrub(str(code, 160))]) : [] });
export function eventOf(e) {
  const ev = obj(e);
  const exceptions = list(ev.entries).filter((x) => x?.type === 'exception').flatMap((x) => list(x?.data?.values)).slice(-3)
    .map((v) => ({ type: str(v?.type, 120), value: scrub(str(v?.value, 400)), frames: list(v?.stacktrace?.frames).slice(-14).map(frameOf) }));
  const tags = list(ev.tags).filter((t) => TAGS.has(t?.key)).map((t) => ({ k: t.key, v: scrub(t.key === 'url' ? noQuery(str(t.value, 300)) : str(t.value, 160)) }));
  return { ok: true, id: str(ev.eventID || ev.id, 40), date: ev.dateCreated ?? null, release: str(ev.release?.version, 120),
    exceptions, tags, errors: list(ev.errors).slice(0, 6).map((x) => ({ type: str(x?.type, 60), msg: scrub(str(x?.message, 200)) })) };
}

// ---------- conclusions: 2–4 Hebrew sentences computed from the payload (pure, tested) ----------
const fmt = (x) => new Intl.NumberFormat('he-IL').format(x);
export function sentryConclusions(d) {
  const out = []; const iss = list(d?.issues);
  const hi = iss.filter((i) => i.priority === 'high'); const back = iss.filter((i) => i.substatus === 'regressed' || i.substatus === 'escalating');
  const top = [...iss].sort((a, b) => b.count - a.count)[0];
  if (!iss.length) out.push({ k: 'issues', tone: 'good', title: 'אין תקלות פתוחות', text: 'Sentry לא מחזיק כרגע אף תקלה שלא טופלה.' });
  else out.push({ k: 'issues', tone: hi.length || back.length ? 'bad' : 'warn',
    title: `${fmt(iss.length)} תקלות פתוחות${hi.length ? `, ${fmt(hi.length)} בעדיפות גבוהה` : ''}${back.length === 1 ? ', אחת חזרה או מחמירה' : back.length ? `, ${fmt(back.length)} חזרו או מחמירות` : ''}`,
    text: `הכי רועשת: ${top.shortId || top.id} (${fmt(top.count)} אירועים) — ${String(top.title).slice(0, 90)}` });
  const v = d?.volume;
  if (v?.ok === false) out.push({ k: 'volume', tone: 'info', title: 'נפח האירועים לא נקרא', text: v.reason });
  else if (v) {
    const e = v.total?.error || {}; const lost = n(e.rate_limited) + n(e.filtered) + n(e.invalid);
    const peak = list(v.errors).reduce((m, r) => (r.rate_limited > (m?.rate_limited || 0) ? r : m), null);
    out.push(lost ? { k: 'volume', tone: 'warn', title: `${fmt(lost)} אירועי שגיאה לא נשמרו ב-14 הימים האחרונים`,
      text: `${fmt(n(e.rate_limited))} נחסמו במגבלת קצב${peak?.rate_limited ? ` (רובם ב-${+peak.day.slice(8, 10)}/${+peak.day.slice(5, 7)})` : ''}, ${fmt(n(e.filtered))} סוננו. ${fmt(n(e.accepted))} התקבלו.` }
      : { k: 'volume', tone: 'good', title: `כל ${fmt(n(e.accepted))} אירועי השגיאה התקבלו`, text: 'אף אירוע לא נחסם במגבלת קצב ולא סונן ב-14 הימים האחרונים.' });
  }
  const w = d?.workflows, det = d?.detectors;
  if (w?.ok === false || det?.ok === false) out.push({ k: 'alerts', tone: 'info', title: 'מצב ההתראות לא נקרא', text: (w?.ok === false ? w : det).reason });
  else if (w || det) {
    const alerting = list(w).filter((x) => x.enabled && x.alertsOnErrors && x.actions.length);
    const lonely = list(det).filter((x) => x.type === 'error' && x.enabled && !x.workflows);
    out.push(alerting.length ? { k: 'alerts', tone: 'good', title: `${fmt(alerting.length)} תהליכי התראה שולחים הודעה על תקלות`, text: alerting.map((x) => x.name).join(', ') }
      : { k: 'alerts', tone: 'bad', title: 'אף אחד לא מקבל התראה כשמופיעה תקלה חדשה',
        text: `${list(w).length === 1 ? 'תהליך התראה אחד, והוא לא מופעל' : `${fmt(list(w).length)} תהליכי התראה, אף אחד לא מופעל`} על שגיאה${lonely.length ? `; ${fmt(lonely.length)} מוניטורי שגיאות לא מחוברים לשום תהליך` : ''}. אפשר להוסיף Alert ב-Sentry.` });
  }
  const pr = d?.projects, rel = d?.releases;
  if (Array.isArray(pr) && pr.length) {
    const tx = pr.some((p) => p.transactions) || n(v?.total?.transaction?.accepted) > 0 || n(v?.total?.span?.accepted) > 0;
    const health = Array.isArray(rel) && rel.some((r) => r.projects.some((p) => p.health));
    if (!tx || !health) out.push({ k: 'health', tone: 'info', title: `${!tx ? 'אין נתוני ביצועים' : ''}${!tx && !health ? ' ו' : ''}${!health ? 'אין מדד crash-free לגרסאות' : ''}`,
      text: `${!tx ? 'ה-SDK לא שולח transactions או spans, ולכן אין זמני תגובה. ' : ''}${!health ? 'אין sessions, ולכן Sentry לא יודע כמה מהמשתמשים לא נתקלו בקריסה.' : ''}`.trim() });
  }
  return out.slice(0, 4);
}

export function sentry() {
  if (!process.env.SENTRY_AUTH_TOKEN) return Promise.resolve(ok({ configured: false, how: HOW }));
  return cached('sentry', async () => {
    try {
      const slug = await org();
      if (!slug) return fail('לטוקן של Sentry אין גישה לאף ארגון', { configured: true });
      const o = `/organizations/${encodeURIComponent(slug)}`;
      const [projects, issues] = await Promise.all([
        get(`${o}/projects/`, 'רשימת הפרויקטים'),
        get(`${o}/issues/?query=${encodeURIComponent('is:unresolved')}&limit=50&statsPeriod=14d&groupStatsPeriod=14d`, 'רשימת התקלות'),
      ]);
      const [rel, vol, wf, det, mon] = await Promise.all([
        section(() => get(`${o}/releases/?per_page=10&health=1&summaryStatsPeriod=14d`, 'רשימת הגרסאות')),
        section(() => get(`${o}/stats_v2/?field=sum(quantity)&groupBy=outcome&groupBy=category&interval=1d&statsPeriod=14d`, 'נפח האירועים')),
        section(() => get(`${o}/workflows/`, 'תהליכי ההתראה')),
        section(() => get(`${o}/detectors/`, 'המוניטורים')),
        section(() => get(`${o}/monitors/`, 'מוניטורי ה-Cron')),
      ]);
      const iss = list(issues).map(issueOf);
      const top = iss.filter((i) => NUM_ID.test(i.id)).slice(0, EVENTS_FOR);
      const evs = await Promise.all(top.map((i) => section(() => get(`${o}/issues/${i.id}/events/latest/`, 'האירוע האחרון'))));
      const prj = list(projects).map(projectOf);
      const bySlug = Object.fromEntries(prj.filter((p) => p.id).map((p) => [p.id, p.slug]));
      const data = {
        configured: true, org: slug, orgUrl: `https://${encodeURIComponent(slug)}.sentry.io`,
        projects: prj, issues: iss,
        events: Object.fromEntries(top.map((i, k) => [i.id, part(evs[k], eventOf)])),
        releases: part(rel, (x) => list(x).map(releaseOf)),
        volume: part(vol, volumeOf),
        workflows: part(wf, (x) => list(x).map(workflowOf)),
        detectors: part(det, (x) => list(x).map((d) => detectorOf(d, bySlug))),
        monitors: part(mon, (x) => list(x).map(monitorOf)),
        legacyAlerts: 'ה-API הישן של Alert Rules מחזיר 410 (הוסר); ההתראות נקראות מ-workflows ו-detectors.',
      };
      data.conclusions = sentryConclusions(data);
      return ok(JSON.parse(redact(JSON.stringify(data))));
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
  if (!NUM_ID.test(String(id))) return fail('מזהה לא תקין');
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
