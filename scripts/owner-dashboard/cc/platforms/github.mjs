// GitHub through the `gh` CLI (execFile, no shell): the server never holds a GitHub token. The repo is
// read from `git remote get-url origin`; GitHub's answer gives the canonical name after a rename.
import { REPO, run, ghApi, cached, uncache, ok, fail, section, UpstreamError } from '../http.mjs';

async function repoSlug() {
  const url = (await run('git', ['-C', REPO, 'remote', 'get-url', 'origin'])).trim();
  const m = url.match(/github\.com[:/]([^/]+)\/([^/]+?)(?:\.git)?$/);
  if (!m) throw new UpstreamError('remote', 'ה-remote של הריפו לא מצביע על GitHub');
  const r = await ghApi(`repos/${m[1]}/${m[2]}`, { what: 'קריאת הריפו' }); // gh follows the rename redirect
  return r;
}

const BRANCHES_Q = `query($owner:String!,$name:String!){repository(owner:$owner,name:$name){
  refs(refPrefix:"refs/heads/",first:100){nodes{name branchProtectionRule{id}
    target{... on Commit{oid committedDate}}}}
  pullRequests(states:OPEN,first:30,orderBy:{field:CREATED_AT,direction:DESC}){nodes{number title state isDraft url createdAt
    author{login} commits(last:1){nodes{commit{statusCheckRollup{state}}}}}}}}`;

const AI_TRAILER = /^co-authored-by:\s*claude\b/im;

export function github() {
  return cached('github', async () => {
    let repo;
    try { repo = await repoSlug(); } catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את הריפו מ-GitHub'); }
    const full = repo.full_name, [owner, name] = full.split('/'), base = `repos/${full}`;
    const [account, gql, commits, workflows, runs] = await Promise.all([
      section(() => ghApi('user', { what: 'זיהוי החשבון' })),
      section(() => ghApi('graphql', { fields: { query: BRANCHES_Q, owner, name }, what: 'ענפים ו-PR' })),
      section(() => ghApi(`${base}/commits?sha=${encodeURIComponent(repo.default_branch)}&per_page=30`, { what: 'קומיטים' })),
      section(() => ghApi(`${base}/actions/workflows?per_page=100`, { what: 'Workflows' })),
      section(() => ghApi(`${base}/actions/runs?per_page=20`, { what: 'ריצות CI' })),
    ]);
    const errors = {};
    for (const [k, s] of Object.entries({ account, gql, commits, workflows, runs })) if (s.error) errors[k === 'gql' ? 'branches' : k] = s.error;
    const r = gql.value?.data?.repository;
    return ok({
      repo: { fullName: full, url: repo.html_url, private: repo.private, defaultBranch: repo.default_branch, pushedAt: repo.pushed_at,
        sizeKb: repo.size ?? null, openIssues: repo.open_issues_count ?? null, language: repo.language ?? null },
      settings: Object.fromEntries(SETTINGS.map((k) => [k, typeof repo[k] === 'boolean' ? repo[k] : null])),
      account: account.value?.login ?? null,
      branches: (r?.refs?.nodes || []).map((b) => ({
        name: b.name, sha: b.target?.oid ?? null, protected: Boolean(b.branchProtectionRule),
        lastCommitAt: b.target?.committedDate ?? null, url: `${repo.html_url}/tree/${encodeURIComponent(b.name)}`,
      })).sort((a, b) => String(b.lastCommitAt).localeCompare(String(a.lastCommitAt))),
      commits: (commits.value || []).map((c) => ({
        sha: c.sha, title: String(c.commit?.message || '').split('\n')[0], author: c.author?.login || c.commit?.author?.name || null,
        date: c.commit?.author?.date ?? null, url: c.html_url, ai: AI_TRAILER.test(c.commit?.message || ''),
      })),
      pulls: (r?.pullRequests?.nodes || []).map((p) => ({
        number: p.number, title: p.title, author: p.author?.login ?? null, state: String(p.state).toLowerCase(), draft: p.isDraft,
        url: p.url, createdAt: p.createdAt, checks: p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state?.toLowerCase() ?? null,
      })),
      workflows: (workflows.value?.workflows || []).map((w) => ({ id: w.id, name: w.name, state: w.state, url: w.html_url, path: w.path })),
      runs: (runs.value?.workflow_runs || []).map((x) => ({
        id: x.id, name: x.name, status: x.status, conclusion: x.conclusion, branch: x.head_branch, event: x.event,
        createdAt: x.created_at, url: x.html_url, workflowId: x.workflow_id,
        durationSec: x.run_started_at && x.status === 'completed' ? Math.round((Date.parse(x.updated_at) - Date.parse(x.run_started_at)) / 1000) : null,
      })),
      errors,
    });
  });
}

// Reversible or non-destructive actions only: no merge, no force push, no branch deletion. Repo
// settings are limited to workflow conveniences; visibility, protection and security are not offered.
export const SETTINGS = ['delete_branch_on_merge', 'allow_auto_merge', 'allow_update_branch', 'has_issues', 'has_wiki', 'has_projects', 'has_discussions'];

export async function githubAction({ kind, id, key, value, dryRun }) {
  if (kind === 'setting') {
    if (!SETTINGS.includes(key) || typeof value !== 'boolean') return fail('הגדרה לא מוכרת');
  } else {
    const idOk = kind === 'dispatch' ? /^[\w.-]{1,100}$/.test(String(id)) : /^\d{1,20}$/.test(String(id));
    if (!idOk) return fail('מזהה לא תקין');
  }
  const plans = {
    rerun: ['POST', `actions/runs/${id}/rerun`, null, 'הרצה מחדש'],
    'rerun-failed': ['POST', `actions/runs/${id}/rerun-failed-jobs`, null, 'הרצה מחדש של מה שנכשל'],
    cancel: ['POST', `actions/runs/${id}/cancel`, null, 'ביטול ריצה'],
    dispatch: ['POST', `actions/workflows/${id}/dispatches`, { ref: '<default branch>' }, 'הפעלת workflow'],
    'wf-enable': ['PUT', `actions/workflows/${id}/enable`, null, 'הפעלת workflow'],
    'wf-disable': ['PUT', `actions/workflows/${id}/disable`, null, 'השבתת workflow'],
    'approve-pr': ['POST', `pulls/${id}/reviews`, { event: 'APPROVE' }, 'אישור PR'],
    'close-pr': ['PATCH', `pulls/${id}`, { state: 'closed' }, 'סגירת PR'],
    setting: ['PATCH', '', { [key]: value }, 'שינוי הגדרת הריפו'],
  };
  if (!plans[kind]) return fail('פעולה לא מוכרת');
  const [method, sub, fields, what] = plans[kind];
  let repo;
  try { repo = await repoSlug(); } catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את הריפו מ-GitHub'); }
  const apiPath = `repos/${repo.full_name}${sub ? `/${sub}` : ''}`;
  const body = kind === 'dispatch' ? { ref: repo.default_branch } : fields;
  if (dryRun === true) return ok({ dryRun: true, plan: { method, url: `https://api.github.com/${apiPath}`, body } });
  try { await ghApi(apiPath, { method, fields: body || undefined, what }); } catch (e) { return fail(e?.reason || 'הפעולה נכשלה'); }
  uncache('github');
  return ok({ kind, id: id == null ? undefined : String(id), key, value });
}
