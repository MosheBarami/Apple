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
      repo: { fullName: full, url: repo.html_url, private: repo.private, defaultBranch: repo.default_branch, pushedAt: repo.pushed_at },
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

// Reversible or non-destructive actions only: no merge, no force push, no branch deletion.
export async function githubAction({ kind, id }) {
  const idOk = kind === 'dispatch' ? /^[\w.-]{1,100}$/.test(String(id)) : /^\d{1,20}$/.test(String(id));
  if (!idOk) return fail('מזהה לא תקין');
  let repo;
  try { repo = await repoSlug(); } catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את הריפו מ-GitHub'); }
  const base = `repos/${repo.full_name}`;
  const calls = {
    rerun: () => ghApi(`${base}/actions/runs/${id}/rerun`, { method: 'POST', what: 'הרצה מחדש' }),
    'rerun-failed': () => ghApi(`${base}/actions/runs/${id}/rerun-failed-jobs`, { method: 'POST', what: 'הרצה מחדש של מה שנכשל' }),
    cancel: () => ghApi(`${base}/actions/runs/${id}/cancel`, { method: 'POST', what: 'ביטול ריצה' }),
    dispatch: () => ghApi(`${base}/actions/workflows/${id}/dispatches`, { method: 'POST', fields: { ref: repo.default_branch }, what: 'הפעלת workflow' }),
    'approve-pr': () => ghApi(`${base}/pulls/${id}/reviews`, { method: 'POST', fields: { event: 'APPROVE' }, what: 'אישור PR' }),
    'close-pr': () => ghApi(`${base}/pulls/${id}`, { method: 'PATCH', fields: { state: 'closed' }, what: 'סגירת PR' }),
  };
  if (!calls[kind]) return fail('פעולה לא מוכרת');
  try { await calls[kind](); } catch (e) { return fail(e?.reason || 'הפעולה נכשלה'); }
  uncache('github');
  return ok({ kind, id: String(id) });
}
