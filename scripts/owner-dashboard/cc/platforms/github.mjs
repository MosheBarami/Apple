// GitHub through the `gh` CLI (execFile, no shell): the server never holds a GitHub token. The repo is
// read from `git remote get-url origin`; GitHub's answer gives the canonical name after a rename.
// One read feeds every tab of the repo page (overview, PRs, issues, Actions, security, insights,
// settings). Each section fails on its own with a Hebrew reason; upstream text is only ever used to
// classify (e.g. "disabled" vs "no permission"), never forwarded.
import { REPO, run, cached, uncache, ok, fail, section, redact, ghReason, reasonFor, UpstreamError } from '../http.mjs';

// `gh api` with the HTTP status recovered from stderr ("gh: <message> (HTTP 403)") and the error
// JSON's message kept as a private hint for classification. Arrays become repeated `-f key[]=v`.
// Strings always go through -f (raw: gh never reads an "@file" from them).
async function call(apiPath, { method, fields, what } = {}) {
  const args = ['api', apiPath];
  if (method) args.push('-X', method);
  for (const [k, v] of Object.entries(fields || {})) {
    if (Array.isArray(v)) for (const x of v) args.push('-f', `${k}[]=${x}`);
    else args.push(typeof v === 'string' ? '-f' : '-F', `${k}=${v}`);
  }
  try {
    const out = await run('gh', args);
    return out.trim() ? JSON.parse(out) : null;
  } catch (e) {
    const stderr = String(e?.stderr || '');
    const m = stderr.match(/HTTP (\d{3})/);
    const rate = /rate limit/i.test(stderr); // GitHub answers 403 for an exhausted quota; that is not a permission problem
    const err = new UpstreamError(m ? Number(m[1]) : e?.code || 'gh', e instanceof SyntaxError ? `GitHub החזיר תשובה לא קריאה${what ? ` (${what})` : ''}`
      : rate ? reasonFor('GitHub', 429) : ghReason(e, what));
    err.rate = rate;
    err.http = m ? Number(m[1]) : null;
    try { err.hint = String(JSON.parse(e?.stdout || '{}')?.message || ''); } catch { err.hint = ''; }
    err.offline = e?.code === 'ENOENT' || /auth login|not logged/i.test(stderr);
    throw err;
  }
}

async function remoteSlug() {
  const url = (await run('git', ['-C', REPO, 'remote', 'get-url', 'origin'])).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new UpstreamError('remote', 'ה-remote של הריפו לא מצביע על GitHub');
  return `${m[1]}/${m[2]}`;
}
const repoInfo = async () => call(`repos/${await remoteSlug()}`, { what: 'קריאת הריפו' }); // gh follows a rename

const REPO_Q = `query($owner:String!,$name:String!,$base:String!){repository(owner:$owner,name:$name){
  defaultBranchRef{name target{... on Commit{history{totalCount}}}}
  refs(refPrefix:"refs/heads/",first:100){totalCount nodes{name branchProtectionRule{id}
    target{... on Commit{oid committedDate messageHeadline}} compare(headRef:$base){aheadBy behindBy}}}
  pullRequests(first:30,orderBy:{field:UPDATED_AT,direction:DESC}){totalCount nodes{number title state isDraft url createdAt updatedAt closedAt mergedAt
    author{login} reviewDecision mergeable headRefName baseRefName additions deletions changedFiles
    labels(first:10){nodes{name color}} commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}
  open:pullRequests(states:OPEN){totalCount}
  issues(first:30,orderBy:{field:UPDATED_AT,direction:DESC}){totalCount nodes{number title state stateReason url createdAt updatedAt closedAt
    author{login} comments{totalCount} labels(first:10){nodes{name color}}}}
  openIssues:issues(states:OPEN){totalCount}
  releases(first:5,orderBy:{field:CREATED_AT,direction:DESC}){totalCount nodes{name tagName isLatest isPrerelease isDraft publishedAt url}}
  tags:refs(refPrefix:"refs/tags/",first:10,orderBy:{field:TAG_COMMIT_DATE,direction:DESC}){totalCount nodes{name
    target{oid ... on Commit{committedDate} ... on Tag{target{... on Commit{committedDate}}}}}}
  labels(first:100){nodes{name color description}}
  stargazerCount forkCount watchers{totalCount}}}`;

// A commit counts as AI-written when a Co-authored-by trailer names an AI tool.
const AI_TRAILER = /^co-authored-by:.*?(claude|anthropic\.com|copilot|codex|openai|gemini)/im;
const AI_NAME = { claude: 'Claude', 'anthropic.com': 'Claude', copilot: 'Copilot', codex: 'Codex', openai: 'Codex', gemini: 'Gemini' };
const FAILED = new Set(['failure', 'timed_out', 'startup_failure']);
const UNFINISHED = new Set(['cancelled', 'skipped', 'neutral', 'stale']);
// Minutes a month GitHub includes for private repos, by plan (github.com/pricing; not an API field).
const INCLUDED = { free: 2000, pro: 3000, team: 3000, enterprise: 50000 };
const BILLING_BLOCK = /spending limit|payments? (have|has) failed|billing/i;
const DAY = 86400e3;

// What the last read learned, so a dry run can validate labels, ids and states without calling gh.
let known = null;

const lower = (s) => (s == null ? null : String(s).toLowerCase());
const nf = (n) => Number(n).toLocaleString('he-IL');
const heDate = (isoDay) => new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${isoDay}T00:00:00Z`));

function secState(v, e) {
  if (!e) {
    const list = Array.isArray(v) ? v : [];
    const sev = (a) => lower(a.security_advisory?.severity || a.security_vulnerability?.severity || a.rule?.security_severity_level || a.rule?.severity);
    return { state: 'ok', count: list.length, more: list.length >= 100, severe: list.filter((a) => ['critical', 'high', 'error'].includes(sev(a)) || a.secret_type).length };
  }
  if (e.rate) return { state: 'error', reason: e.reason };
  if ((e.http === 403 || e.http === 404) && /disabled|not enabled|no analysis/i.test(e.hint || '')) return { state: 'disabled' };
  if (e.http === 401 || e.http === 403) return { state: 'no-permission' };
  if (e.http === 404) return { state: 'unavailable' };
  return { state: 'error', reason: e.reason };
}
async function alerts(base, kind) {
  try { return secState(await call(`${base}/${kind}/alerts?state=open&per_page=100`, { what: 'התראות אבטחה' })); } catch (e) { return secState(null, e); }
}

const secs = (x) => (x.run_started_at && x.status === 'completed' ? Math.round((Date.parse(x.updated_at) - Date.parse(x.run_started_at)) / 1000) : null);

export function github() {
  return cached('github', async () => {
    let repo;
    try { repo = await repoInfo(); } catch (e) {
      return fail(e?.reason || 'לא הצלחתי לקרוא את הריפו מ-GitHub', { connected: !e?.offline });
    }
    const full = repo.full_name, [owner, name] = full.split('/'), base = `repos/${full}`, url = repo.html_url;
    const main = repo.default_branch;
    // The 5,000 calls/hour are shared with every other gh user on this machine: what moves (CI, PRs,
    // commits) is re-read each minute, what barely moves (billing, security, traffic, stats) every 5.
    const runsP = call(`${base}/actions/runs?per_page=100`, { what: 'ריצות CI' });
    const slowP = cached('github:slow', () => {
      const userP = call('user', { what: 'זיהוי החשבון' });
      return Promise.all([
        section(() => userP),
        section(async () => { const u = await userP; return call(`users/${u.login}/settings/billing/usage/summary`, { what: 'דקות Actions' }); }),
        section(() => call(`${base}/languages`, { what: 'שפות' })),
        section(() => call(`${base}/stats/participation`, { what: 'גרף קומיטים' })),
        alerts(base, 'dependabot'), alerts(base, 'secret-scanning'), alerts(base, 'code-scanning'),
        section(() => call(`${base}/contributors?per_page=30`, { what: 'תורמים' })),
        section(() => call(`${base}/traffic/views`, { what: 'צפיות' })),
        section(() => call(`${base}/traffic/clones`, { what: 'שכפולים' })),
        section(() => call(`${base}/traffic/popular/referrers`, { what: 'מקורות תנועה' })),
        section(() => call(`${base}/actions/cache/usage`, { what: 'מטמון Actions' })),
      ]);
    }, 300000);
    const [[user, bill, langs, part, dependabot, secretScanning, codeScanning, contrib, views, clones, refs, cacheUse], gql, commits, workflows, runs, hint] = await Promise.all([
      slowP,
      section(() => call('graphql', { fields: { query: REPO_Q, owner, name, base: main }, what: 'ענפים, PR ו-issues' })),
      section(() => call(`${base}/commits?sha=${encodeURIComponent(main)}&per_page=100`, { what: 'קומיטים' })),
      section(() => call(`${base}/actions/workflows?per_page=100`, { what: 'Workflows' })),
      section(() => runsP),
      section(() => blockHint(base, runsP, main)),
    ]);
    const errors = {};
    const named = { account: user, branches: gql, commits, languages: langs, activity: part, workflows, runs, billing: bill, contributors: contrib, views, clones, referrers: refs, cache: cacheUse };
    for (const [k, s] of Object.entries(named)) if (s.error) errors[k] = s.error;
    const r = gql.value?.data?.repository;
    if (gql.value?.errors?.length && !r) errors.branches = 'GitHub לא החזיר ענפים, PR ו-issues';

    const labelsOf = (n) => (n?.labels?.nodes || []).map((l) => l.name);
    const pulls = (r?.pullRequests?.nodes || []).map((p) => ({
      number: p.number, title: p.title, author: p.author?.login ?? null, state: lower(p.state), draft: p.isDraft, url: p.url,
      createdAt: p.createdAt, updatedAt: p.updatedAt, closedAt: p.closedAt, mergedAt: p.mergedAt,
      checks: lower(p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state), review: lower(p.reviewDecision), mergeable: lower(p.mergeable),
      head: p.headRefName, base: p.baseRefName, additions: p.additions, deletions: p.deletions, files: p.changedFiles, labels: labelsOf(p),
    }));
    const issues = (r?.issues?.nodes || []).map((i) => ({
      number: i.number, title: i.title, author: i.author?.login ?? null, state: lower(i.state), stateReason: lower(i.stateReason), url: i.url,
      createdAt: i.createdAt, updatedAt: i.updatedAt, closedAt: i.closedAt, comments: i.comments?.totalCount ?? 0, labels: labelsOf(i),
    }));
    const labels = (r?.labels?.nodes || []).map((l) => ({ name: l.name, color: l.color, description: l.description || '' }));

    const commitList = (Array.isArray(commits.value) ? commits.value : []).map((c) => {
      const msg = String(c.commit?.message || ''); const m = msg.match(AI_TRAILER);
      return { sha: c.sha, short: String(c.sha).slice(0, 7), title: msg.split('\n')[0], author: c.author?.login || c.commit?.author?.name || null,
        date: c.commit?.author?.date ?? null, url: c.html_url, ai: Boolean(m), aiTool: m ? AI_NAME[m[1].toLowerCase()] : null };
    });
    const tools = {}; for (const c of commitList) if (c.aiTool) tools[c.aiTool] = (tools[c.aiTool] || 0) + 1;
    const aiN = commitList.filter((c) => c.ai).length;

    const langTotal = Object.values(langs.value || {}).reduce((a, b) => a + (Number(b) || 0), 0);
    const languages = Object.entries(langs.value || {}).map(([n, b]) => ({ name: n, bytes: b, pct: langTotal ? (b / langTotal) * 100 : 0 })).sort((a, b) => b.bytes - a.bytes);

    const runList = (runs.value?.workflow_runs || []).map((x) => ({
      id: x.id, name: x.name, title: x.display_title ?? null, status: x.status, conclusion: x.conclusion, branch: x.head_branch, event: x.event,
      createdAt: x.created_at, url: x.html_url, workflowId: x.workflow_id, attempt: x.run_attempt ?? 1, sha: x.head_sha ?? null, durationSec: secs(x),
    }));
    const wfList = (workflows.value?.workflows || []).map((w) => {
      const done = runList.filter((x) => x.workflowId === w.id && x.status === 'completed' && !UNFINISHED.has(x.conclusion));
      return { id: w.id, name: w.name, state: w.state, url: w.html_url, path: w.path, runs: done.length,
        passRate: done.length ? done.filter((x) => x.conclusion === 'success').length / done.length : null,
        durations: done.filter((x) => x.durationSec != null).slice(0, 20).map((x) => x.durationSec).reverse(),
        lastConclusion: done[0]?.conclusion ?? null };
    });

    // CI streak on the default branch (newest first), and whether GitHub itself is refusing to start jobs
    const finished = runList.filter((x) => x.branch === main && x.status === 'completed' && !UNFINISHED.has(x.conclusion));
    let streak = 0; while (streak < finished.length && FAILED.has(finished[streak].conclusion)) streak++;
    const instant = streak && finished.slice(0, streak).filter((x) => x.durationSec != null && x.durationSec <= 60).length >= Math.ceil(streak * 0.75);

    const plan = lower(user.value?.plan?.name);
    const items = bill.value?.usageItems || [];
    const minutes = bill.value ? items.filter((i) => /minute/i.test(i.unitType) && /^actions/i.test(i.sku)).reduce((a, i) => a + (Number(i.grossQuantity) || 0), 0) : null;
    const tp = bill.value?.timePeriod; const nowD = new Date();
    const y = tp?.year ?? nowD.getUTCFullYear(), mo = tp?.month ?? nowD.getUTCMonth() + 1;
    const until = `${mo === 12 ? y + 1 : y}-${String(mo === 12 ? 1 : mo + 1).padStart(2, '0')}-01`;
    const included = INCLUDED[plan] ?? null;
    const byNote = hint.value === true;
    const byQuota = !byNote && included != null && minutes != null && minutes >= included && instant;
    const billing = {
      plan, period: `${y}-${String(mo).padStart(2, '0')}`, minutes, includedMinutes: included, includedInferred: true,
      pct: included && minutes != null ? minutes / included : null,
      amount: bill.value ? items.reduce((a, i) => a + (Number(i.netAmount) || 0), 0) : null,
      storageGbH: bill.value ? items.filter((i) => /storage/i.test(i.sku)).reduce((a, i) => a + (Number(i.grossQuantity) || 0), 0) : null,
      blocked: byNote || byQuota ? true : bill.value || hint.value === false ? false : null,
      evidence: byNote ? 'annotation' : byQuota ? 'quota' : null,
      since: byNote || byQuota ? finished[streak - 1]?.createdAt ?? null : null,
      until: byNote || byQuota ? until : null, untilInferred: true,
    };

    const now = Date.now();
    const branches = (r?.refs?.nodes || []).map((b) => ({
      name: b.name, sha: b.target?.oid ?? null, protected: Boolean(b.branchProtectionRule), lastCommitAt: b.target?.committedDate ?? null,
      title: b.target?.messageHeadline ?? null, url: `${url}/tree/${encodeURIComponent(b.name)}`, isDefault: b.name === main,
      ahead: b.compare?.behindBy ?? null, behind: b.compare?.aheadBy ?? null,
      stale: b.name !== main && b.target?.committedDate ? now - Date.parse(b.target.committedDate) > 30 * DAY : false,
    })).sort((a, b) => (b.isDefault - a.isDefault) || String(b.lastCommitAt).localeCompare(String(a.lastCommitAt)));

    const out = {
      repo: { fullName: full, owner, name, url, private: repo.private, visibility: repo.visibility ?? (repo.private ? 'private' : 'public'),
        description: repo.description ?? null, homepage: repo.homepage || null, defaultBranch: main, pushedAt: repo.pushed_at, createdAt: repo.created_at ?? null,
        sizeKb: repo.size ?? null, openIssues: repo.open_issues_count ?? null, language: repo.language ?? null, topics: repo.topics || [],
        license: repo.license?.spdx_id || repo.license?.name || null, stars: r?.stargazerCount ?? repo.stargazers_count ?? 0,
        forks: r?.forkCount ?? repo.forks_count ?? 0, watchers: r?.watchers?.totalCount ?? repo.subscribers_count ?? 0,
        commitCount: r?.defaultBranchRef?.target?.history?.totalCount ?? null, admin: Boolean(repo.permissions?.admin) },
      settings: Object.fromEntries(SETTINGS.map((k) => [k, typeof repo[k] === 'boolean' ? repo[k] : null])),
      account: user.value?.login ?? null,
      languages,
      activity: Array.isArray(part.value?.all) ? { computing: false, weeks: part.value.all, owner: part.value.owner || [] } : { computing: !part.error, weeks: [], owner: [] },
      commits: commitList,
      aiShare: { ai: aiN, total: commitList.length, pct: commitList.length ? aiN / commitList.length : null, tools },
      branches,
      branchCount: r?.refs?.totalCount ?? branches.length,
      tags: (r?.tags?.nodes || []).map((t) => ({ name: t.name, sha: t.target?.oid ?? null, date: t.target?.committedDate || t.target?.target?.committedDate || null,
        url: `${url}/releases/tag/${encodeURIComponent(t.name)}` })),
      tagCount: r?.tags?.totalCount ?? 0,
      releases: (r?.releases?.nodes || []).map((x) => ({ name: x.name || x.tagName, tag: x.tagName, latest: x.isLatest, prerelease: x.isPrerelease, draft: x.isDraft, publishedAt: x.publishedAt, url: x.url })),
      releaseCount: r?.releases?.totalCount ?? 0,
      labels, pulls, issues,
      counts: { openPulls: r?.open?.totalCount ?? pulls.filter((p) => p.state === 'open').length, openIssues: r?.openIssues?.totalCount ?? issues.filter((i) => i.state === 'open').length,
        pulls: r?.pullRequests?.totalCount ?? pulls.length, issues: r?.issues?.totalCount ?? issues.length },
      workflows: wfList, runs: runList, ci: { streak, instant: Boolean(instant), lastOk: finished.find((x) => x.conclusion === 'success')?.createdAt ?? null },
      billing,
      security: { dependabot, secretScanning, codeScanning },
      contributors: (Array.isArray(contrib.value) ? contrib.value : []).map((c) => ({ login: c.login, contributions: c.contributions, bot: c.type === 'Bot' })),
      traffic: {
        views: views.value ? { count: views.value.count, uniques: views.value.uniques, days: (views.value.views || []).map((v) => ({ date: v.timestamp, count: v.count, uniques: v.uniques })) } : null,
        clones: clones.value ? { count: clones.value.count, uniques: clones.value.uniques, days: (clones.value.clones || []).map((v) => ({ date: v.timestamp, count: v.count, uniques: v.uniques })) } : null,
        referrers: (Array.isArray(refs.value) ? refs.value : []).slice(0, 8).map((x) => ({ referrer: x.referrer, count: x.count, uniques: x.uniques })),
      },
      cache: cacheUse.value ? { bytes: cacheUse.value.active_caches_size_in_bytes ?? 0, count: cacheUse.value.active_caches_count ?? 0 } : null,
      errors,
    };
    out.insights = insightsFor(out);
    known = { full, defaultBranch: main, labels: new Set(labels.map((l) => l.name)), labelsKnown: !gql.error && Boolean(r),
      pulls: new Map(pulls.map((p) => [p.number, { state: p.state, draft: p.draft, mergeable: p.mergeable, labels: new Set(p.labels) }])),
      issues: new Map(issues.map((i) => [i.number, { state: i.state, labels: new Set(i.labels) }])) };
    return ok(JSON.parse(redact(JSON.stringify(out))));
  });
}

// true when the newest failed run on the default branch carries GitHub's billing annotation, false
// when it carries none, undefined when there is nothing to look at.
async function blockHint(base, runsP, main) {
  const list = (await runsP)?.workflow_runs || [];
  const last = list.find((x) => x.head_branch === main && x.status === 'completed' && !UNFINISHED.has(x.conclusion));
  if (!last || !FAILED.has(last.conclusion)) return undefined;
  return cached(`github:hint:${last.id}`, () => billingNote(base, last.id), 3600e3); // once per run
}
async function billingNote(base, runId) {
  const jobs = (await call(`${base}/actions/runs/${runId}/jobs?per_page=20`, { what: 'שלבי הריצה' }))?.jobs || [];
  const job = jobs.find((j) => FAILED.has(j.conclusion)) || jobs[0];
  if (!job) return false;
  const notes = await call(`${base}/check-runs/${job.id}/annotations`, { what: 'הערות הריצה' });
  return (Array.isArray(notes) ? notes : []).some((n) => BILLING_BLOCK.test(String(n.message || '')));
}

// Server-side conclusions in plain Hebrew, red first. {id, level, title, detail, href?}
const LEVELS = ['bad', 'warn', 'info', 'good'];
export function insightsFor(d) {
  const out = []; const add = (x) => out.push(x);
  const u = d.repo.url; const b = d.billing; const main = d.repo.defaultBranch;
  if (b.blocked) {
    const used = b.minutes != null && b.includedMinutes ? ` החודש נוצלו ${nf(Math.round(b.minutes))} דקות מתוך ${nf(b.includedMinutes)} שכלולות בתוכנית ${b.plan || ''}.` : '';
    add({ id: 'ci-billing', level: 'bad', title: `ה-CI חסום בגלל החיוב ב-GitHub (${nf(d.ci.streak)} ריצות לא התחילו)`,
      detail: `GitHub לא מתחיל את הריצות בכלל, כך שזה לא באג בקוד.${used} הערכה: הריצות יחזרו לעבוד ב-${heDate(b.until)}, כשהמכסה מתאפסת בתחילת החודש, או מוקדם יותר אם מעלים את מגבלת ההוצאה בהגדרות החיוב.`,
      href: 'https://github.com/settings/billing' });
  } else if (d.ci.streak) {
    add({ id: 'ci-failing', level: 'bad', title: `הבדיקות נכשלות ב-${main} (${nf(d.ci.streak)} ${d.ci.streak === 1 ? 'ריצה' : 'ריצות ברצף'})`,
      detail: d.ci.instant ? 'רוב הריצות נעצרו תוך פחות מדקה, עוד לפני שהקוד נבדק. כדאי לפתוח את הריצה האחרונה ולראות באיזה שלב זה נעצר.'
        : 'הקוד האחרון בענף הראשי לא עובר את הבדיקות האוטומטיות. כדאי לתקן לפני הפריסה הבאה.', href: `${u}/actions` });
  }
  if (!b.blocked && b.pct != null && b.pct >= 0.8) add({ id: 'minutes-high', level: 'warn', title: `נוצלו ${Math.round(b.pct * 100)}% מדקות ה-CI החודש`,
    detail: `${nf(Math.round(b.minutes))} מתוך ${nf(b.includedMinutes)} דקות (הערכה לפי תוכנית ${b.plan}). כשהמכסה נגמרת GitHub מפסיק להריץ בדיקות עד תחילת החודש הבא.`, href: 'https://github.com/settings/billing' });

  const limited = Object.values(d.errors).some((x) => x === reasonFor('GitHub', 429)) || Object.values(d.security).some((x) => x.reason === reasonFor('GitHub', 429));
  if (limited) add({ id: 'rate-limit', level: 'warn', title: 'GitHub הגביל את קצב הבקשות, חלק מהנתונים חסרים',
    detail: 'המכסה של 5,000 קריאות בשעה משותפת לכל מה שמשתמש ב-gh במחשב הזה. החלקים החסרים יחזרו לבד כשהמכסה מתאפסת (עד שעה).', href: 'https://github.com/settings/tokens' });
  const S = d.security; const NAME = { dependabot: 'Dependabot', secretScanning: 'סריקת סודות', codeScanning: 'סריקת קוד' };
  const open = Object.entries(S).filter(([, s]) => s.state === 'ok' && s.count > 0);
  if (open.length) add({ id: 'sec-alerts', level: 'bad', title: `${nf(open.reduce((a, [, s]) => a + s.count, 0))} התראות אבטחה פתוחות`,
    detail: open.map(([k, s]) => `${NAME[k]}: ${nf(s.count)}${s.severe ? ` (${nf(s.severe)} חמורות)` : ''}`).join(' · '), href: `${u}/security` });
  const off = Object.entries(S).filter(([, s]) => s.state === 'disabled');
  if (off.length) add({ id: 'sec-disabled', level: 'warn', title: `${off.map(([k]) => NAME[k]).join(', ')} ${off.length === 1 ? 'כבויה' : 'כבויות'} בריפו`,
    detail: 'GitHub לא בודק את הריפו בתחום הזה, אז "אין התראות" לא אומר שאין בעיות. מדליקים את זה בהגדרות האבטחה של הריפו (הלוח הזה לא משנה הגדרות אבטחה).', href: `${u}/settings/security_analysis` });
  const np = Object.entries(S).filter(([, s]) => s.state === 'no-permission');
  if (np.length) add({ id: 'sec-noperm', level: 'info', title: `אין הרשאה לקרוא: ${np.map(([k]) => NAME[k]).join(', ')}`,
    detail: 'החיבור של gh לא מורשה לקרוא את ההתראות האלה, ולכן לא ידוע כמה יש. אפשר לבדוק ישירות ב-GitHub.', href: `${u}/security` });

  const openPrs = d.pulls.filter((p) => p.state === 'open');
  const failing = openPrs.filter((p) => ['failure', 'error'].includes(p.checks));
  if (failing.length) add({ id: 'pr-failing', level: 'warn', title: `${nf(failing.length)} PR פתוחים עם בדיקות שנכשלו`,
    detail: failing.slice(0, 3).map((p) => `#${p.number} ${p.title}`).join(' · '), href: `${u}/pulls` });
  const conflict = openPrs.filter((p) => p.mergeable === 'conflicting');
  if (conflict.length) add({ id: 'pr-conflict', level: 'warn', title: `${nf(conflict.length)} PR עם התנגשות מול ${main}`,
    detail: 'אי אפשר למזג אותם עד שמישהו פותר את ההתנגשות בענף שלהם.', href: `${u}/pulls` });
  const waiting = openPrs.filter((p) => !p.draft && p.review === 'review_required');
  if (waiting.length) add({ id: 'pr-review', level: 'info', title: `${nf(waiting.length)} PR מחכים לסקירה`, detail: waiting.slice(0, 3).map((p) => `#${p.number} ${p.title}`).join(' · '), href: `${u}/pulls` });
  const wfOff = d.workflows.filter((w) => /^disabled/.test(w.state || ''));
  if (wfOff.length) add({ id: 'wf-disabled', level: 'warn', title: `${nf(wfOff.length)} workflows מושבתים`,
    detail: `${wfOff.map((w) => w.name).join(', ')} לא ירוצו אוטומטית עד שמפעילים אותם מחדש (אפשר מכאן, בלשונית Actions).`, href: `${u}/actions` });
  const stale = d.branches.filter((x) => x.stale);
  if (stale.length) add({ id: 'branches-stale', level: 'info', title: `${nf(stale.length)} ענפים בלי פעילות מעל 30 יום`,
    detail: `${stale.slice(0, 3).map((x) => x.name).join(', ')}${stale.length > 3 ? ' ועוד' : ''}. הלוח לא מוחק ענפים; אפשר לנקות ב-GitHub.`, href: `${u}/branches/stale` });
  if (d.activity.computing) add({ id: 'stats-computing', level: 'info', title: 'GitHub עוד מחשב את גרף הקומיטים',
    detail: 'הסטטיסטיקה של הריפו עוד לא מוכנה (GitHub ענה "202, מחשב"). היא תופיע באחד הרענונים הבאים, בדרך כלל תוך כמה דקות.', href: `${u}/graphs/commit-activity` });
  if (d.tagCount && !d.releaseCount) add({ id: 'no-release', level: 'info', title: `${nf(d.tagCount)} תגיות, אבל אף Release`,
    detail: 'יש נקודות מסומנות בהיסטוריה, אבל אף אחת לא פורסמה כגרסה עם הערות שינויים.', href: `${u}/releases` });
  if (d.aiShare.total) add({ id: 'ai-share', level: 'info', title: `${Math.round(d.aiShare.pct * 100)}% מ-${nf(d.aiShare.total)} הקומיטים האחרונים נכתבו עם AI`,
    detail: Object.entries(d.aiShare.tools).map(([k, v]) => `${k}: ${nf(v)}`).join(' · ') || 'אף קומיט לא נושא חתימת Co-authored-by של כלי AI.', href: `${u}/commits/${encodeURIComponent(main)}` });
  const lastMain = d.runs.find((x) => x.branch === main && x.status === 'completed' && !UNFINISHED.has(x.conclusion));
  if (lastMain?.conclusion === 'success') add({ id: 'ci-green', level: 'good', title: `הבדיקות האחרונות ב-${main} עברו`, detail: `${lastMain.name}, ${lastMain.title || ''}`.replace(/, $/, ''), href: lastMain.url });
  return out.map((x, i) => [x, i]).sort((a, c) => LEVELS.indexOf(a[0].level) - LEVELS.indexOf(c[0].level) || a[1] - c[1]).map(([x]) => x);
}

// ------------------------------------------------------------------------------------------ actions
// Repo settings are limited to workflow conveniences; visibility, protection and security are not
// offered. Nothing here deletes a branch, a release or the repo. Merge is the one irreversible write
// (undo = revert commit) and is squash only.
export const SETTINGS = ['delete_branch_on_merge', 'allow_auto_merge', 'allow_update_branch', 'has_issues', 'has_wiki', 'has_projects', 'has_discussions'];

const PR_KINDS = new Set(['approve-pr', 'close-pr', 'merge-pr', 'reopen-pr']);
const ISSUE_KINDS = new Set(['close-issue', 'reopen-issue']);
const LABEL_KINDS = new Set(['add-label', 'remove-label']);
const REASONS = new Set(['completed', 'not_planned']);
const PLANS = {
  rerun: (id) => ['POST', `actions/runs/${id}/rerun`, null, 'הרצה מחדש'],
  'rerun-failed': (id) => ['POST', `actions/runs/${id}/rerun-failed-jobs`, null, 'הרצה מחדש של מה שנכשל'],
  cancel: (id) => ['POST', `actions/runs/${id}/cancel`, null, 'ביטול ריצה'],
  dispatch: (id, b, k) => ['POST', `actions/workflows/${id}/dispatches`, { ref: k.defaultBranch }, 'הפעלת workflow'],
  'wf-enable': (id) => ['PUT', `actions/workflows/${id}/enable`, null, 'הפעלת workflow'],
  'wf-disable': (id) => ['PUT', `actions/workflows/${id}/disable`, null, 'השבתת workflow'],
  'approve-pr': (id) => ['POST', `pulls/${id}/reviews`, { event: 'APPROVE' }, 'אישור PR'],
  'close-pr': (id) => ['PATCH', `pulls/${id}`, { state: 'closed' }, 'סגירת PR'],
  'reopen-pr': (id) => ['PATCH', `pulls/${id}`, { state: 'open' }, 'פתיחה מחדש של PR'],
  'merge-pr': (id) => ['PUT', `pulls/${id}/merge`, { merge_method: 'squash' }, 'מיזוג PR'],
  'close-issue': (id, b) => ['PATCH', `issues/${id}`, { state: 'closed', state_reason: b.reason }, 'סגירת issue'],
  'reopen-issue': (id) => ['PATCH', `issues/${id}`, { state: 'open', state_reason: 'reopened' }, 'פתיחה מחדש של issue'],
  'add-label': (id, b) => ['POST', `issues/${id}/labels`, { labels: [b.label] }, 'הוספת תווית'],
  'remove-label': (id, b) => ['DELETE', `issues/${id}/labels/${encodeURIComponent(b.label)}`, null, 'הסרת תווית'],
  setting: (id, b) => ['PATCH', '', { [b.key]: b.value }, 'שינוי הגדרת הריפו'],
};

// What the target looks like right now. Dry run: the last read (no gh). Real write: a fresh GET.
async function factsFor(kind, n, dry, base) {
  if (dry) {
    if (!known) return { pr: null, issue: null, labels: null };
    return { pr: known.pulls.get(n) || null, issue: known.issues.get(n) || (known.pulls.has(n) ? { isPr: true, ...known.pulls.get(n) } : null), labels: known.labelsKnown ? known.labels : null };
  }
  const f = { pr: null, issue: null, labels: null };
  if (PR_KINDS.has(kind)) {
    const p = await call(`${base}/pulls/${n}`, { what: 'קריאת ה-PR' });
    f.pr = { state: p.merged ? 'merged' : lower(p.state), draft: Boolean(p.draft), mergeable: p.mergeable === false ? 'conflicting' : null };
  }
  if (ISSUE_KINDS.has(kind) || LABEL_KINDS.has(kind)) {
    const i = await call(`${base}/issues/${n}`, { what: 'קריאת ה-issue' });
    f.issue = { state: lower(i.state), isPr: Boolean(i.pull_request), labels: new Set((i.labels || []).map((l) => l.name)) };
  }
  if (LABEL_KINDS.has(kind)) f.labels = new Set(((await call(`${base}/labels?per_page=100`, { what: 'תוויות' })) || []).map((l) => l.name));
  return f;
}

// null when allowed, else the Hebrew reason. Unknown facts (not in the last read) are not guessed.
function refuse(kind, body, f) {
  const pr = f.pr; const is = f.issue;
  if (kind === 'approve-pr' || kind === 'close-pr') { if (pr && pr.state !== 'open') return 'ה-PR כבר לא פתוח'; }
  if (kind === 'merge-pr' && pr) {
    if (pr.state !== 'open') return 'אפשר למזג רק PR פתוח';
    if (pr.draft) return 'ה-PR עדיין טיוטה (Draft)';
    if (pr.mergeable === 'conflicting') return 'יש התנגשות מול הענף הראשי, אי אפשר למזג';
  }
  if (kind === 'reopen-pr' && pr) { if (pr.state === 'merged') return 'PR שמוזג אי אפשר לפתוח מחדש'; if (pr.state !== 'closed') return 'ה-PR כבר פתוח'; }
  if (ISSUE_KINDS.has(kind)) {
    if (kind === 'close-issue' && !REASONS.has(body.reason)) return 'סיבת סגירה לא מוכרת (completed או not_planned)';
    if (is?.isPr) return 'המספר הזה הוא PR, לא issue';
    if (kind === 'close-issue' && is && is.state !== 'open') return 'ה-issue כבר סגור';
    if (kind === 'reopen-issue' && is && is.state !== 'closed') return 'ה-issue כבר פתוח';
  }
  if (LABEL_KINDS.has(kind)) {
    const l = body.label;
    if (typeof l !== 'string' || !l.trim() || l.length > 50 || /[\u0000-\u001f]/.test(l)) return 'שם תווית לא תקין';
    if (!f.labels) return 'רשימת התוויות של הריפו עוד לא נטענה. פתחו את דף GitHub ונסו שוב';
    if (!f.labels.has(l)) return 'אין תווית כזו בריפו';
    const on = is?.labels || pr?.labels;
    if (kind === 'add-label' && on?.has(l)) return 'התווית כבר מוצמדת';
    if (kind === 'remove-label' && on && !on.has(l)) return 'התווית לא מוצמדת לפריט הזה';
  }
  return null;
}

export async function githubAction(body = {}) {
  const { kind, id, key, value } = body; const dry = body.dryRun === true;
  if (!Object.hasOwn(PLANS, String(kind))) return fail('פעולה לא מוכרת');
  if (kind === 'setting') {
    if (!SETTINGS.includes(key) || typeof value !== 'boolean') return fail('הגדרה לא מוכרת');
  } else {
    const idOk = kind === 'dispatch' ? /^[\w.-]{1,100}$/.test(String(id)) && !/^\.+$/.test(String(id)) : /^[1-9]\d{0,19}$/.test(String(id));
    if (!idOk) return fail('מזהה לא תקין');
  }
  const n = Number(id);
  let full, defaultBranch;
  try {
    if (dry) {
      if (known) ({ full, defaultBranch } = known);
      else { full = await remoteSlug(); if (kind === 'dispatch') return fail('הענף הראשי עוד לא ידוע. פתחו את דף GitHub ונסו שוב'); }
    } else { const r = await repoInfo(); full = r.full_name; defaultBranch = r.default_branch; }
  } catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את הריפו מ-GitHub'); }
  const base = `repos/${full}`;
  if (PR_KINDS.has(kind) || ISSUE_KINDS.has(kind) || LABEL_KINDS.has(kind)) {
    let f;
    try { f = await factsFor(kind, n, dry, base); } catch (e) { return fail(e?.reason || 'לא הצלחתי לבדוק את המצב הנוכחי'); }
    const why = refuse(kind, body, f);
    if (why) return fail(why);
  }
  const [method, sub, fields, what] = PLANS[kind](id, body, { defaultBranch });
  const apiPath = `${base}${sub ? `/${sub}` : ''}`;
  if (dry) return ok(JSON.parse(redact(JSON.stringify({ dryRun: true, plan: { method, url: `https://api.github.com/${apiPath}`, body: fields } }))));
  try { await call(apiPath, { method, fields: fields || undefined, what }); } catch (e) { return fail(e?.reason || 'הפעולה נכשלה'); }
  uncache('github');
  return ok({ kind, id: id == null ? undefined : String(id), key, value,
    ...(kind === 'merge-pr' ? { note: 'ה-PR מוזג (squash). אין ביטול למיזוג; הדרך לחזור היא Revert לקומיט המיזוג.' } : {}) });
}
