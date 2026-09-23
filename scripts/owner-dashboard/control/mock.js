// Development-only fake data. Loaded ONLY when the URL has ?mock=1 (see app.js).
// Extra switches: &fail=<page> makes that endpoint fail, &sentry=on shows a configured Sentry.
const q = new URLSearchParams(location.search);
const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();
const H = 3600e3; const D = 24 * H;
const sha = (i) => (`${(i * 2654435761 >>> 0).toString(16)}a7c3e9f1b2d4`).slice(0, 12).padEnd(40, '0');

const perDay = Array.from({ length: 21 }, (_, i) => ({ day: iso((20 - i) * D).slice(0, 10), ai: Math.round(6 + 10 * Math.abs(Math.sin(i * 0.7))), human: Math.round(1 + 3 * Math.abs(Math.cos(i))) }));
const perWeekLines = Array.from({ length: 10 }, (_, i) => ({ week: iso((9 - i) * 7 * D).slice(0, 10), ai: 2000 + i * 650 + (i % 3) * 400, human: 400 + (i % 4) * 120 }));

const tree = (() => {
  const n = (path, he, en, files, dirs = [], extra = {}) => ({ name: path.split('/').pop() || 'RbxAI', path, he, en, files, dirs, ...extra });
  return n('', 'שורש הפרויקט: כל מה שבונה את Apple.', 'Project root: everything that builds Apple.', 24, [
    n('apps', 'האפליקציות עצמן: השרת, הפלאגין והאתר.', 'The shipped apps: worker, plugin and site.', 1, [
      n('apps/worker', 'השרת שרץ ב-Cloudflare ועונה למשתמשים.', 'The Cloudflare Worker that serves users.', 12, [n('apps/worker/src', 'קוד המקור של השרת.', 'Worker source code.', 48, [n('apps/worker/src/do', 'אובייקטים עמידים: תקציב וזיכרון שיחה.', 'Durable Objects: budget and session memory.', 9)])], { readme: '# Apple worker\n\nCloudflare Worker that routes chat, budgets credits and streams answers.\n\n- `src/` entry and routes\n- `test/` vitest suites', docs: [{ label: 'SECURITY.md', url: 'https://github.com/example/rbxai/blob/main/docs/SECURITY.md' }] }),
      n('apps/plugin', 'הפלאגין ל-Roblox Studio שהמשתמשים מתקינים.', 'The Roblox Studio plugin users install.', 6, [n('apps/plugin/src', 'קוד Luau של הפלאגין.', 'Plugin Luau source.', 31)]),
      n('apps/site', 'אתר השיווק והתיעוד.', 'Marketing and docs site.', 18),
    ]),
    n('packages', 'ספריות משותפות.', 'Shared packages.', 0, [n('packages/sdk', 'ערכת פיתוח למפתחים חיצוניים.', 'SDK for external developers.', 14, [], { readme: '# @apple/sdk\n\nTiny client for the Apple API.' })]),
    n('infra', 'תשתית: מסד הנתונים, בדיקות עומס ופריסה.', 'Infra: database, load tests, deploy.', 9, [n('infra/supabase', 'הגדרות מסד הנתונים והמיגרציות.', 'Database config and migrations.', 3, [n('infra/supabase/migrations', 'שינויי מבנה במסד הנתונים, לפי סדר.', 'Ordered schema migrations.', 22)])]),
    n('docs', 'מסמכים: החלטות, מצב נוכחי ותוכניות.', 'Docs: decisions, state and plans.', 40, [n('docs/autonomy', 'ההוראות לסוכן האוטונומי.', 'Autonomous agent instructions.', 11)], { docs: [{ label: 'MISSION.md', url: 'https://github.com/example/rbxai/blob/main/docs/autonomy/MISSION.md' }] }),
    n('scripts', 'סקריפטים לבדיקות ולכלים.', 'Check and tooling scripts.', 72, [n('scripts/owner-dashboard', 'לוח הבקרה הזה.', 'This control center.', 6)]),
  ]);
})();

const repoNames = [['cloudflare', 'workers-sdk', 'ok', 3200], ['supabase', 'supabase-js', 'ok', 3900], ['Roblox', 'roact', 'archived', 590], ['rojo-rbx', 'rojo', 'ok', 1100], ['evaera', 'promise', 'stale', 290], ['Sleitnick', 'Knit', 'stale', 1200], ['old-org', 'gone-lib', 'missing', null], ['honojs', 'hono', 'ok', 21000], ['vitest-dev', 'vitest', 'ok', 13500], ['JohnnyMorganz', 'StyLua', 'ok', 1700], ['UpliftGames', 'wally', 'ok', 780], ['Quenty', 'NevermoreEngine', 'ok', 1000]];
const repos = repoNames.map(([o, n, status, stars], i) => ({ owner: o, name: n, url: `https://github.com/${o}/${n}`, sources: [i % 3 ? 'npm' : 'wally', ...(i % 4 ? [] : ['docs'])], usedBy: i % 2 ? ['apps/worker'] : ['apps/plugin', 'packages/sdk'], npm: i % 3 ? n : null, version: i % 3 ? `${1 + (i % 4)}.${i}.0` : null, stars, archived: status === 'archived', pushedAt: status === 'missing' ? null : iso((status === 'stale' ? 500 : i * 3 + 1) * D), license: status === 'missing' ? null : i % 5 ? 'MIT' : 'Apache-2.0', description: status === 'missing' ? null : `${n} — library used by the project`, status }));
const cnt = (s) => repos.filter((r) => r.status === s).length;

const DATA = {
  overview: {
    ok: true, fetchedAt: iso(12e3),
    ai: { share: 0.874, aiCommits: 412, totalCommits: 471, aiLinesAdded: 58210, totalLinesAdded: 64020, perDay, perWeekLines },
    quality: { findings: { open: { critical: 0, high: 2, medium: 5, low: 9 }, closed: 64, list: [{ id: 'F-101', severity: 'high', status: 'open', title: 'Budget DO can double-charge on retry' }, { id: 'F-097', severity: 'high', status: 'open', title: 'Plugin release binary lags source VERSION' }, { id: 'F-090', severity: 'medium', status: 'open', title: 'Landing page image without alt text' }] }, fastFix: { share: 0.13, count: 54, of: 412 }, reverts: 3 },
    review: {
      pending: [
        { sha: sha(1), short: sha(1).slice(0, 7), title: 'fix(worker): retry-safe credit debit in budget DO', date: iso(40 * 60e3), author: 'Claude', ai: true, files: 4, additions: 128, deletions: 37, url: 'https://github.com/example/rbxai/commit/1' },
        { sha: sha(2), short: sha(2).slice(0, 7), title: 'feat(plugin): show generation progress bar in Studio', date: iso(3 * H), author: 'Claude', ai: true, files: ['apps/plugin/src/ui/Progress.luau', 'apps/plugin/src/init.server.luau'], additions: 212, deletions: 18, url: 'https://github.com/example/rbxai/commit/2' },
        { sha: sha(3), short: sha(3).slice(0, 7), title: 'chore(infra): tighten RLS on credit_ledger', date: iso(26 * H), author: 'Claude', ai: true, files: 2, additions: 41, deletions: 9, url: 'https://github.com/example/rbxai/commit/3' },
      ],
      decided: [{ sha: sha(4), short: sha(4).slice(0, 7), title: 'docs: refresh CURRENT_STATE', date: iso(2 * D), author: 'Claude', ai: true, files: 1, additions: 20, deletions: 12, url: '#', verdict: 'approve' }, { sha: sha(5), short: sha(5).slice(0, 7), title: 'feat(site): experimental pricing table', date: iso(3 * D), author: 'Claude', ai: true, files: 3, additions: 300, deletions: 2, url: '#', verdict: 'reject', note: 'בוטל בקומיט a1b2c3d' }],
    },
  },
  tree: { ok: true, fetchedAt: iso(30e3), root: tree },
  repos: { ok: true, fetchedAt: iso(50e3), repos, counts: { total: repos.length, ok: cnt('ok'), stale: cnt('stale'), archived: cnt('archived'), missing: cnt('missing'), bySource: { npm: repos.filter((r) => r.sources.includes('npm')).length, wally: repos.filter((r) => r.sources.includes('wally')).length, docs: repos.filter((r) => r.sources.includes('docs')).length } } },
  github: {
    ok: true, fetchedAt: iso(8e3),
    repo: { fullName: 'moshebarami/RbxAI', url: 'https://github.com/moshebarami/RbxAI', private: true, defaultBranch: 'main', pushedAt: iso(20 * 60e3) }, account: 'moshebarami',
    branches: [{ name: 'main', sha: sha(1), protected: true, lastCommitAt: iso(20 * 60e3), url: '#' }, { name: 'feat/progress-bar', sha: sha(2), protected: false, lastCommitAt: iso(3 * H), url: '#' }, { name: 'fix/budget-retry', sha: sha(3), protected: false, lastCommitAt: iso(5 * H), url: '#' }],
    commits: Array.from({ length: 8 }, (_, i) => ({ sha: sha(10 + i), title: ['fix(worker): retry-safe credit debit', 'feat(plugin): progress bar', 'test: e2e for streaming', 'docs: owner queue update', 'chore: bump wrangler', 'fix(site): mobile nav overlap', 'feat(sdk): python client retries', 'refactor: split router'][i], author: i === 4 ? 'moshe' : 'Claude', date: iso((i + 1) * 2.3 * H), url: '#', ai: i !== 4 })),
    pulls: [{ number: 142, title: 'feat(plugin): generation progress bar', author: 'claude-bot', state: 'open', draft: false, url: '#', createdAt: iso(4 * H), checks: 'success' }, { number: 139, title: 'WIP: new onboarding flow', author: 'claude-bot', state: 'open', draft: true, url: '#', createdAt: iso(2 * D), checks: 'failure' }],
    workflows: [{ id: 1, name: 'CI', state: 'active', url: '#' }, { id: 2, name: 'Deploy worker', state: 'active', url: '#' }, { id: 3, name: 'Nightly e2e', state: 'disabled_manually', url: '#' }],
    runs: [{ id: 9001, name: 'CI', status: 'in_progress', conclusion: null, branch: 'feat/progress-bar', event: 'push', createdAt: iso(3 * 60e3), durationSec: 95, url: '#', workflowId: 1 }, { id: 9000, name: 'CI', status: 'completed', conclusion: 'success', branch: 'main', event: 'push', createdAt: iso(25 * 60e3), durationSec: 312, url: '#', workflowId: 1 }, { id: 8999, name: 'Deploy worker', status: 'completed', conclusion: 'failure', branch: 'main', event: 'workflow_dispatch', createdAt: iso(2 * H), durationSec: 48, url: '#', workflowId: 2 }, { id: 8998, name: 'CI', status: 'completed', conclusion: 'cancelled', branch: 'fix/budget-retry', event: 'pull_request', createdAt: iso(6 * H), durationSec: 20, url: '#', workflowId: 1 }],
  },
  supabase: {
    ok: true, fetchedAt: iso(15e3),
    project: { name: 'apple-prod', ref: 'abcdwxyzprodref', region: 'eu-central-1', status: 'ACTIVE_HEALTHY', dbVersion: '15.8.1', createdAt: iso(120 * D), dashboardUrl: 'https://supabase.com/dashboard/project/abcdwxyzprodref' },
    dbSizeBytes: 38.4 * 1024 * 1024,
    tables: [{ schema: 'public', name: 'credit_ledger', rows: 18420, sizeBytes: 9.1 * 1024 * 1024 }, { schema: 'public', name: 'profiles', rows: 1204, sizeBytes: 640 * 1024 }, { schema: 'public', name: 'generations', rows: 7310, sizeBytes: 21.5 * 1024 * 1024 }, { schema: 'public', name: 'api_keys', rows: 312, sizeBytes: 96 * 1024 }, { schema: 'auth', name: 'users', rows: 1204, sizeBytes: 1.2 * 1024 * 1024 }],
    storage: { buckets: [{ name: 'avatars', public: true, objects: 820, sizeBytes: 44 * 1024 * 1024 }, { name: 'exports', public: false, objects: 96, sizeBytes: 310 * 1024 * 1024 }] },
    advisors: { security: { warn: 1, info: 3 }, performance: { warn: 0, info: 5 } },
    backups: { pitr: false, list: [{ at: iso(8 * H), status: 'COMPLETED' }, { at: iso(32 * H), status: 'COMPLETED' }] }, authUsers: 1204,
  },
  cloudflare: {
    ok: true, fetchedAt: iso(20e3),
    account: { id: '4f1c0e0d9a8b7c6d5e4f3a2b1c0d9e8f', name: "Moshe's Account" },
    workers: [{ name: 'apple-worker', modifiedAt: iso(5 * H), url: 'https://apple-worker.example.workers.dev', deployments: [{ id: 'd3', createdAt: iso(5 * H), author: 'wrangler', message: 'deploy 3f2a9c1 — retry-safe debit' }, { id: 'd2', createdAt: iso(2 * D), author: 'wrangler', message: 'deploy 81b7d20' }, { id: 'd1', createdAt: iso(4 * D), author: 'dashboard', message: '' }] }],
    traffic: { last24h: { requests: 184230, errors: 312, subrequests: 402110, cpuP50Ms: 3.4, cpuP99Ms: 41.7 }, perHour: Array.from({ length: 24 }, (_, i) => ({ hour: iso((23 - i) * H), requests: Math.round(4000 + 6000 * Math.abs(Math.sin((i + 3) / 4))), errors: Math.round(4 + 20 * Math.abs(Math.sin(i * 1.7))) })) },
    d1: [{ name: 'apple-cache', uuid: 'u1', sizeBytes: 2.1 * 1024 * 1024, tables: 4 }],
    kv: [{ title: 'APPLE_CONFIG', id: 'k1' }, { title: 'RATE_LIMIT', id: 'k2' }],
    r2: [{ name: 'apple-assets', createdAt: iso(90 * D) }],
    vectorize: [{ name: 'roblox-docs', dimensions: 768, metric: 'cosine' }],
    queues: [],
    aiGateway: { ok: false, reason: 'למפתח של Cloudflare אין הרשאת קריאה ל-AI Gateway.' },
    zones: [],
    zonesReason: 'אין דומיין משלנו ב-Cloudflare: האתר רץ על כתובת workers.dev, ולכן אין מטמון דומיין לנקות.',
    health: { url: 'https://apple-worker.example.workers.dev/api/health', httpStatus: 200, buildSha: '3f2a9c1d7e', ms: 184 },
  },
  sentry: q.get('sentry') === 'on'
    ? { ok: true, fetchedAt: iso(5e3), configured: true, issues: [{ id: '4501', title: "TypeError: Cannot read properties of undefined (reading 'credits')", culprit: 'src/routes/chat.ts in debit', level: 'error', count: '142', userCount: 37, lastSeen: iso(12 * 60e3), permalink: '#', project: 'apple-worker' }, { id: '4499', title: 'Plugin HTTP 429 from generation endpoint', culprit: 'Plugin/Net.luau', level: 'warning', count: '58', userCount: 12, lastSeen: iso(3 * H), permalink: '#', project: 'apple-plugin' }, { id: '4470', title: 'Unhandled rejection: stream closed', culprit: 'src/stream.ts', level: 'fatal', count: '4', userCount: 2, lastSeen: iso(2 * D), permalink: '#', project: 'apple-worker' }] }
    : { ok: true, fetchedAt: iso(5e3), configured: false, how: 'מוסיפים SENTRY_AUTH_TOKEN (הרשאות project:read, event:read, event:write) לקובץ ~/.config/apple/cc.env, ואת SENTRY_ORG. אחרי הפעלה מחדש של הלוח השגיאות יופיעו כאן.' },
  hf: {
    ok: true, fetchedAt: iso(40e3), user: 'moshebarami',
    models: [{ id: 'moshebarami/roblox-luau-embed', private: false, downloads: 1830, likes: 12, updatedAt: iso(6 * D), url: 'https://huggingface.co/moshebarami/roblox-luau-embed', pipeline: 'feature-extraction' }, { id: 'moshebarami/apple-router-small', private: true, downloads: 0, likes: 0, updatedAt: iso(20 * D), url: '#', pipeline: 'text-classification' }],
    datasets: [{ id: 'moshebarami/roblox-api-docs', private: false, downloads: 420, likes: 5, updatedAt: iso(3 * D), url: '#' }, { id: 'moshebarami/luau-eval-set', private: true, downloads: 12, likes: 0, updatedAt: iso(11 * D), url: '#' }],
    spaces: [{ id: 'moshebarami/apple-demo', sdk: 'gradio', runtimeStage: 'RUNNING', url: '#' }, { id: 'moshebarami/embed-playground', sdk: 'streamlit', runtimeStage: 'SLEEPING', url: '#' }, { id: 'moshebarami/old-test', sdk: 'docker', runtimeStage: 'RUNTIME_ERROR', url: '#' }],
  },
  extras: {
    ok: true, fetchedAt: iso(25e3),
    apple: { httpStatus: 200, buildSha: '3f2a9c1d7e', ms: 210 },
    robloxStore: { assetId: 123456789, httpStatus: 404, controls: [{ id: 987654321, httpStatus: 200 }] },
    stripe: { configured: false, how: 'מחכה למפתחות Stripe (live). נמצא ברשימת המשימות של הבעלים.' },
    posthog: { configured: false },
  },
};

const NOTES = { review: (b) => (b.verdict === 'reject' ? 'נרשם. הסוכן יבטל את השינוי בקומיט חדש בדקות הקרובות.' : 'נרשם כמאושר.'), 'github/action': () => 'הבקשה נשלחה ל-GitHub.', 'supabase/action': () => 'הגיבוי התחיל. זה לוקח כמה דקות.', 'cloudflare/action': () => 'המטמון נוקה.', 'sentry/action': () => 'סומן כנפתר ב-Sentry.' };

export async function mockFetch(path, opts = {}) {
  await new Promise((r) => setTimeout(r, 150));
  const key = path.replace(/^\/api\/cc\//, '');
  if (key === 'session') return { ok: true, token: 'mock-token' };
  if (opts.method === 'POST') {
    const body = JSON.parse(opts.body || '{}');
    if (!body.confirm || !opts.headers?.['x-cc-token']) return { ok: false, reason: 'חסר אישור (confirm/token).' };
    if (key === 'review') {
      const p = DATA.overview.review.pending; const i = p.findIndex((c) => c.sha === body.sha);
      if (i >= 0) DATA.overview.review.decided.unshift({ ...p.splice(i, 1)[0], verdict: body.verdict });
    }
    return { ok: true, note: (NOTES[key] || (() => 'בוצע (נתוני דמו).'))(body) };
  }
  if (q.get('fail') === key) return { ok: false, reason: 'דמו של כשל: השרת לא הצליח להגיע לשירות (נתוני בדיקה).' };
  const d = DATA[key];
  return d ? structuredClone({ ...d, fetchedAt: new Date(Date.now() - 3000).toISOString() }) : { ok: false, reason: `אין נתוני דמו עבור ${path}` };
}
