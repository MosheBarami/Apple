// Vercel. Without VERCEL_TOKEN it sends nothing and says exactly what is missing; with it the same route
// reads the REST API (api.vercel.com): scope, projects, deployments, account and project domains with
// their DNS config, env var NAMES (never values), aliases and check runs, plus Hebrew conclusions.
// VERCEL_TEAM_ID (optional, team_…) scopes every read and write to a team instead of the personal account.
// Writes are four guarded kinds only (redeploy, promote, rollback, cancel): no deletes, no env changes,
// no domains bought or moved, no billing.
import { fetchJson, cached, uncache, section, redact, ok, fail } from '../http.mjs';

const API = 'https://api.vercel.com';
const LABEL = 'Vercel';
const NEED = ['VERCEL_TOKEN'];
const DOCS = 'https://vercel.com/account/tokens';
const HOW = 'ב-Vercel: https://vercel.com/account/tokens → Create Token (Scope: החשבון או הצוות) → העתיקו אותו והוסיפו לקובץ ‎.env '
  + 'שורה אחת: VERCEL_TOKEN=<הטוקן>. לצוות אפשר להוסיף גם VERCEL_TEAM_ID=<team_…>. אחר כך הפעילו מחדש את לוח הבקרה.';
const LIMIT = { deployments: 40, detail: 8, configs: 12, checks: 5 };
const H = 3600000;

const ID = { dpl: /^dpl_[A-Za-z0-9]{8,64}$/, prj: /^prj_[A-Za-z0-9]{8,64}$/, team: /^team_[A-Za-z0-9]{4,64}$/, name: /^[a-z0-9][a-z0-9._-]{0,99}$/ };
const team = () => (ID.team.test(process.env.VERCEL_TEAM_ID || '') ? process.env.VERCEL_TEAM_ID : '');
const scoped = (p) => (team() ? `${p}${p.includes('?') ? '&' : '?'}teamId=${team()}` : p);
const auth = () => ({ authorization: `Bearer ${process.env.VERCEL_TOKEN}` });
const get = (p, what, { scope = true } = {}) => fetchJson(`${API}${scope ? scoped(p) : p}`, { label: LABEL, what, headers: auth() });
const enc = encodeURIComponent;
const arr = (x) => (Array.isArray(x) ? x : []);
const str = (x, n = 200) => (x == null ? null : String(x).slice(0, n));
const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : null);
// Defence in depth: whatever Vercel sent back, no credential value leaves this module.
const clean = (o) => JSON.parse(redact(JSON.stringify(o)));

function agoHe(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  if (m < 1) return 'לפני פחות מדקה';
  if (m < 60) return m === 1 ? 'לפני דקה' : `לפני ${m} דקות`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : `לפני ${h} שעות`;
  const d = Math.floor(h / 24);
  return d === 1 ? 'לפני יום' : d === 2 ? 'לפני יומיים' : `לפני ${d} ימים`;
}
const list = (names, n = 3) => `${names.slice(0, n).join(', ')}${names.length > n ? ` ועוד ${names.length - n}` : ''}`;

// ---------------------------------------------------------------- mapping (explicit fields only)
const mapDeployment = (d, current) => {
  const m = d.meta || {};
  const createdAt = num(d.createdAt ?? d.created); const buildingAt = num(d.buildingAt); const readyAt = num(d.ready);
  return {
    id: d.uid, project: str(d.name, 100), projectId: str(d.projectId, 80), url: str(d.url), state: str(d.state || d.readyState, 20),
    substate: str(d.readySubstate, 20), target: str(d.target, 40), createdAt, buildingAt, readyAt,
    duration: buildingAt && readyAt && readyAt >= buildingAt ? readyAt - buildingAt : null,
    creator: str(d.creator?.username, 80), source: str(d.source, 30), inspectorUrl: str(d.inspectorUrl),
    commit: { sha: str(m.githubCommitSha || m.gitlabCommitSha || m.bitbucketCommitSha, 40), message: str(m.githubCommitMessage || m.gitlabCommitMessage || m.bitbucketCommitMessage),
      ref: str(m.githubCommitRef || m.gitlabCommitRef || m.bitbucketCommitRef, 120), author: str(m.githubCommitAuthorLogin || m.githubCommitAuthorName || m.gitlabCommitAuthorName || m.bitbucketCommitAuthorName, 80) },
    errorCode: str(d.errorCode, 60), errorMessage: str(d.errorMessage), checksState: str(d.checksState, 20), checksConclusion: str(d.checksConclusion, 20),
    rollbackCandidate: d.isRollbackCandidate === true, aliasAssigned: Boolean(d.aliasAssigned), aliasError: Boolean(d.aliasError),
    current: current.has(d.uid),
  };
};
const mapEnv = (e) => ({ key: str(e.key, 120), type: str(e.type, 20), target: arr(e.target).map((t) => str(t, 40)), gitBranch: str(e.gitBranch, 120), updatedAt: num(e.updatedAt) });

// ---------------------------------------------------------------- insights (pure)
/** d: the mapped payload (deployments, projects, domains, checks, errors, scope). */
export function insights(d = {}, now = Date.now()) {
  const out = []; const err = d.errors || {};
  const slug = d.scope?.slug || '';
  const deps = Array.isArray(d.deployments) ? d.deployments : null;

  if (!deps) out.push({ level: 'warn', title: 'לא הצלחנו לקרוא את הפריסות', detail: `אין כאן מידע על הבניות עד שזה יסתדר. הסיבה: ${err.deployments || 'לא ידועה'}.` });
  else {
    const prod = deps.filter((x) => x.target === 'production').sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!prod) out.push({ level: 'info', title: 'אין עדיין פריסה ל-production', detail: `בין ${deps.length} הפריסות האחרונות אין אף אחת ל-production.` });
    else {
      const age = agoHe(now - (prod.createdAt || now)); const who = `${prod.project || 'הפרויקט'}${prod.commit?.message ? ` · "${prod.commit.message.split('\n')[0].slice(0, 60)}"` : ''}`;
      const href = prod.inspectorUrl || undefined;
      if (prod.state === 'READY') out.push({ level: 'good', title: 'הגרסה ב-production תקינה', detail: `הפריסה האחרונה ל-production (${who}) מוכנה ומשרתת, נבנתה ${age}.`, href });
      else if (prod.state === 'ERROR') out.push({ level: 'bad', title: 'הפריסה האחרונה ל-production נכשלה', detail: `${who} נכשלה ${age}${prod.errorCode ? ` (${prod.errorCode})` : ''}. הדומיינים נשארים על הפריסה המוכנה הקודמת.`, href });
      else if (prod.state === 'CANCELED') out.push({ level: 'warn', title: 'הפריסה האחרונה ל-production בוטלה', detail: `${who} בוטלה ${age}, כך שהגרסה הקודמת עדיין באוויר.`, href });
      else out.push({ level: 'info', title: 'פריסה ל-production בבנייה עכשיו', detail: `${who} התחילה ${age} ועדיין במצב ${prod.state}.`, href });
    }
    const day = deps.filter((x) => (x.createdAt || 0) >= now - 24 * H);
    const failed = day.filter((x) => x.state === 'ERROR');
    const partial = deps.length >= LIMIT.deployments && day.length === deps.length ? ` (מתוך ${deps.length} האחרונות בלבד)` : '';
    if (failed.length) {
      const inProd = failed.some((x) => x.target === 'production');
      const codes = [...new Set(failed.map((x) => x.errorCode).filter(Boolean))];
      out.push({ level: inProd ? 'bad' : 'warn', title: failed.length === 1 ? 'בנייה 1 נכשלה ב-24 השעות האחרונות' : `${failed.length} בניות נכשלו ב-24 השעות האחרונות`,
        detail: `${list([...new Set(failed.map((x) => x.project || '?'))])}${codes.length ? ` · ${codes.join(', ')}` : ''}${inProd ? ' · כולל production' : ' · כולן preview, האתר באוויר לא הושפע'}${partial}.`,
        href: failed[0].inspectorUrl || undefined });
    } else if (day.length) {
      out.push({ level: 'good', title: 'אף בנייה לא נכשלה ב-24 השעות האחרונות', detail: `${day.length} פריסות ביממה האחרונה, ${day.filter((x) => x.state === 'READY').length} מוכנות${partial}.` });
    }
  }

  // Domains: DNS not pointing at Vercel (config.misconfigured) or a project domain still unverified.
  const projects = Array.isArray(d.projects) ? d.projects : null;
  if (projects) {
    const seen = projects.flatMap((p) => arr(p.domains).map((x) => ({ ...x, project: p.name })));
    const bad = seen.filter((x) => x.misconfigured === true || x.verified === false);
    const checked = seen.filter((x) => typeof x.misconfigured === 'boolean' || typeof x.verified === 'boolean');
    if (bad.length) {
      const p = bad[0].project;
      out.push({ level: 'warn', title: bad.length === 1 ? `דומיין 1 לא מוגדר נכון: ${bad[0].name}` : `${bad.length} דומיינים לא מוגדרים נכון`,
        detail: `${list(bad.map((x) => x.name))}: ה-DNS לא מצביע ל-Vercel או שהבעלות עוד לא אומתה, אז הכתובת לא מגיעה לאתר.`,
        href: slug && p ? `https://vercel.com/${enc(slug)}/${enc(p)}/settings/domains` : undefined });
    } else if (checked.length) {
      out.push({ level: 'good', title: `כל ${checked.length} הדומיינים מוגדרים נכון`, detail: 'ה-DNS של כל דומיין בפרויקטים מצביע ל-Vercel.' });
    }
  }
  const expiring = arr(d.domains).filter((x) => x.expiresAt && x.renew === false && x.expiresAt - now < 30 * 24 * H);
  if (expiring.length) out.push({ level: 'warn', title: `${expiring.length} דומיינים יפוגו בקרוב בלי חידוש`, detail: `${list(expiring.map((x) => x.name))}: חידוש אוטומטי כבוי ותוקף הרישום נגמר תוך 30 יום.` });
  const failedChecks = Object.entries(d.checks || {}).filter(([, runs]) => arr(runs).some((r) => r.conclusion === 'failed'));
  const byId = new Map(arr(d.deployments).map((x) => [x.id, x]));
  const named = ([id, runs]) => `${byId.get(id)?.project || id} (${arr(runs).filter((r) => r.conclusion === 'failed').map((r) => r.name).filter(Boolean).join(', ') || 'Checks'})`;
  if (failedChecks.length) out.push({ level: 'warn', title: failedChecks.length === 1 ? 'בדיקה (Check) נכשלה בפריסה אחרונה' : `בדיקות (Checks) נכשלו ב-${failedChecks.length} פריסות אחרונות`, detail: `${list(failedChecks.map(named))}.` });

  const rank = { bad: 0, warn: 1, info: 2, good: 3 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]).slice(0, 4);
}

// ---------------------------------------------------------------- read
function notConnected() {
  return fail('Vercel עדיין לא מחובר: חסר VERCEL_TOKEN בקובץ ‎.env', { configured: false, need: NEED, how: HOW, docs: DOCS,
    insights: [{ level: 'info', title: 'Vercel עדיין לא מחובר', detail: 'חסר רק VERCEL_TOKEN בקובץ ‎.env. יוצרים אותו ב-vercel.com/account/tokens, מוסיפים שורה VERCEL_TOKEN=… ומפעילים מחדש את לוח הבקרה.', href: DOCS }] });
}

async function read() {
  const t = team();
  const [user, tm, projects, deployments, domains, aliases] = await Promise.all([
    section(() => get('/v2/user', 'פרטי החשבון', { scope: false })),
    t ? section(() => get(`/v2/teams/${enc(t)}`, 'פרטי הצוות', { scope: false })) : Promise.resolve({ value: null }),
    section(() => get('/v9/projects?limit=50', 'רשימת הפרויקטים')),
    section(() => get(`/v6/deployments?limit=${LIMIT.deployments}`, 'רשימת הפריסות')),
    section(() => get('/v5/domains?limit=50', 'רשימת הדומיינים')),
    section(() => get('/v4/aliases?limit=40', 'רשימת ה-aliases')),
  ]);
  if (user.error && projects.error && deployments.error) return fail(user.error, { configured: true });
  const errors = {};
  for (const [k, s] of Object.entries({ user, team: tm, projects, deployments, domains, aliases })) if (s.error) errors[k] = s.error;

  const u = user.value?.user || null;
  const scope = t ? { type: 'team', id: t, slug: str(tm.value?.slug, 100), name: str(tm.value?.name, 100) }
    : { type: 'personal', id: str(u?.id, 80), slug: str(u?.username, 100), name: str(u?.name || u?.username, 100) };

  const rawProjects = projects.value ? arr(projects.value.projects).filter((p) => ID.prj.test(p?.id || '')) : null;
  const current = new Set((rawProjects || []).map((p) => p.targets?.production?.id).filter(Boolean));
  const deps = deployments.value ? arr(deployments.value.deployments).filter((x) => ID.dpl.test(x?.uid || '')).map((x) => mapDeployment(x, current)) : null;

  // Per-project detail for the most recently updated projects only (request budget).
  const top = (rawProjects || []).slice().sort((a, b) => (num(b.updatedAt) || 0) - (num(a.updatedAt) || 0));
  const detail = await Promise.all(top.slice(0, LIMIT.detail).map(async (p) => {
    const [dom, env] = await Promise.all([
      section(() => get(`/v9/projects/${enc(p.id)}/domains?limit=20`, 'הדומיינים של הפרויקט')),
      section(() => get(`/v10/projects/${enc(p.id)}/env?decrypt=false`, 'שמות משתני הסביבה')),
    ]);
    return { id: p.id, dom, env };
  }));
  const byId = new Map(detail.map((x) => [x.id, x]));
  const names = [...new Set(detail.flatMap((x) => arr(x.dom.value?.domains).map((z) => z?.name)).filter((n) => typeof n === 'string' && n.length < 254))];
  const configs = new Map(await Promise.all(names.slice(0, LIMIT.configs).map(async (n) => [n, await section(() => get(`/v6/domains/${enc(n)}/config`, 'הגדרות ה-DNS של הדומיין'))])));
  const checkIds = (deps || []).slice(0, LIMIT.checks).map((x) => x.id);
  const checkRuns = await Promise.all(checkIds.map(async (id) => [id, await section(() => get(`/v2/deployments/${enc(id)}/check-runs`, 'בדיקות הפריסה'))]));
  const checks = {};
  for (const [id, s] of checkRuns) if (s.value) checks[id] = arr(s.value.runs).map((r) => ({ id: str(r.id, 80), name: str(r.name, 120), status: str(r.status, 20), conclusion: str(r.conclusion, 20), blocks: str(r.blocks, 30), completedAt: num(r.completedAt) }));

  const projectsOut = rawProjects && top.map((p) => {
    const x = byId.get(p.id); const prod = p.targets?.production;
    return {
      id: p.id, name: str(p.name, 100), framework: str(p.framework, 40), nodeVersion: str(p.nodeVersion, 20), createdAt: num(p.createdAt), updatedAt: num(p.updatedAt),
      repo: p.link?.org && p.link?.repo ? `${str(p.link.org, 100)}/${str(p.link.repo, 100)}` : str(p.link?.repo, 100), gitProvider: str(p.link?.type, 20),
      productionBranch: str(p.link?.productionBranch, 120), paused: p.paused === true, live: p.live === true,
      production: prod && ID.dpl.test(prod.id || '') ? { id: prod.id, url: str(prod.url), state: str(prod.readyState, 20), createdAt: num(prod.createdAt), aliases: arr(prod.alias).slice(0, 6).map((a) => str(a, 253)) } : null,
      domains: x ? (x.dom.value ? arr(x.dom.value.domains).map((z) => {
        const c = configs.get(z?.name)?.value;
        return { name: str(z?.name, 253), verified: typeof z?.verified === 'boolean' ? z.verified : null, redirect: str(z?.redirect, 253), gitBranch: str(z?.gitBranch, 120),
          misconfigured: typeof c?.misconfigured === 'boolean' ? c.misconfigured : null, configuredBy: str(c?.configuredBy, 20) };
      }) : null) : null,
      domainsError: x?.dom.error || null,
      env: x ? (x.env.value ? arr(x.env.value.envs).map(mapEnv) : null) : null,
      envError: x?.env.error || null,
    };
  });

  const out = {
    configured: true, scope, user: u ? { username: str(u.username, 100), name: str(u.name, 100) } : null,
    projects: projectsOut, deployments: deps,
    domains: domains.value ? arr(domains.value.domains).map((z) => ({ name: str(z.name, 253), verified: typeof z.verified === 'boolean' ? z.verified : null,
      serviceType: str(z.serviceType, 20), createdAt: num(z.createdAt), expiresAt: num(z.expiresAt), renew: typeof z.renew === 'boolean' ? z.renew : null })) : null,
    aliases: aliases.value ? arr(aliases.value.aliases).map((a) => ({ alias: str(a.alias, 253), deploymentId: str(a.deploymentId, 80), projectId: str(a.projectId, 80), createdAt: num(a.createdAt) })) : null,
    checks, errors,
  };
  out.insights = insights(out);
  return ok(clean(out));
}

export function vercel() {
  if (!process.env.VERCEL_TOKEN) return Promise.resolve(notConnected());
  return cached('vercel', async () => {
    try { return await read(); } catch (e) { return fail(e?.reason || 'Vercel לא זמין', { configured: true }); }
  });
}

// ---------------------------------------------------------------- write
// Each kind validates its own ids and builds one request. Nothing here deletes, touches env vars,
// buys/transfers a domain or changes billing, and there is no generic passthrough.
const is = (re, v) => typeof v === 'string' && re.test(v);
const KINDS = {
  redeploy: (b) => {
    if (!is(ID.name, b.name)) return 'שם פרויקט לא תקין';
    if (b.target !== undefined && b.target !== 'production' && b.target !== 'preview') return 'יעד לא תקין';
    return { method: 'POST', path: '/v13/deployments', what: 'הפריסה מחדש',
      body: { name: b.name, deploymentId: b.deploymentId, ...(b.target === 'production' ? { target: 'production' } : {}) } };
  },
  promote: (b) => (is(ID.prj, b.projectId) ? { method: 'POST', path: `/v10/projects/${b.projectId}/promote/${b.deploymentId}`, body: null, what: 'קידום הפריסה ל-production' } : 'מזהה פרויקט לא תקין'),
  rollback: (b) => (is(ID.prj, b.projectId) ? { method: 'POST', path: `/v1/projects/${b.projectId}/rollback/${b.deploymentId}`, body: null, what: 'החזרת production לפריסה קודמת' } : 'מזהה פרויקט לא תקין'),
  cancel: (b) => ({ method: 'PATCH', path: `/v12/deployments/${b.deploymentId}/cancel`, body: null, what: 'ביטול הבנייה' }),
};

export async function vercelAction(b = {}) {
  const kind = typeof b.kind === 'string' && Object.hasOwn(KINDS, b.kind) ? b.kind : null;
  if (!kind) return fail('פעולה לא מוכרת');
  if (!is(ID.dpl, b.deploymentId)) return fail('מזהה פריסה לא תקין');
  const p = KINDS[kind](b);
  if (typeof p === 'string') return fail(p);
  const url = `${API}${scoped(p.path)}`;
  const plan = { method: p.method, url, body: p.body };
  if (b.dryRun === true) return ok({ dryRun: true, kind, plan });
  if (!process.env.VERCEL_TOKEN) return fail('Vercel עדיין לא מחובר', { configured: false, need: NEED, how: HOW, docs: DOCS });
  let res;
  try {
    res = await fetchJson(url, { label: LABEL, what: p.what, method: p.method, headers: auth(), ...(p.body ? { body: p.body } : {}) });
  } catch (e) { return fail(e?.reason || `${p.what} נכשלה`); }
  uncache('vercel');
  const nid = typeof res?.id === 'string' && ID.dpl.test(res.id) ? res.id : null;
  return ok(clean({ kind, deploymentId: b.deploymentId, ...(kind === 'redeploy' ? { deployment: { id: nid, url: nid ? str(res.url) : null } } : {}) }));
}
