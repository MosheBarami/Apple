// Cloudflare through the v4 API. The token's scopes are not known in advance, so every section is
// fetched on its own and a refusal becomes a plain reason in `errors`, never a thrown request.
// Every upstream object is reduced to a whitelist of fields (never a binding value, a secret, an
// AI Gateway prompt/response or a KV value), and the whole answer passes through redact().
import { fetchJson, cached, uncache, ok, fail, section, redact } from '../http.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const LABEL = 'Cloudflare';
export const WORKER = 'apple';
export const WORKER_URL = 'https://apple.moshe-barami111.workers.dev';
const MISSING = 'חסרים CLOUDFLARE_API_TOKEN או CLOUDFLARE_ACCOUNT_ID בקובץ ‎.env';

const auth = () => ({ authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` });
const acct = () => `${API}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
const connected = () => Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
const get = async (url, what) => (await fetchJson(url, { label: LABEL, what, headers: auth() }))?.result;
const scrub = (x) => JSON.parse(redact(JSON.stringify(x)));

const arr = (x) => (Array.isArray(x) ? x : []);
const obj = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const str = (x) => (typeof x === 'string' ? x : null);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : typeof x === 'string' && x.trim() && Number.isFinite(+x) ? +x : null);
const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null; };
const byNewest = (a, b) => (ms(b.createdAt) ?? 0) - (ms(a.createdAt) ?? 0);
const sum = (xs, f) => xs.reduce((s, x) => s + (num(f(x)) ?? 0), 0);
const ID = /^[\w-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The worker's own health route, timed. Shared with the extras card.
export async function workerHealth() {
  const t0 = Date.now();
  try {
    const r = await fetch(`${WORKER_URL}/api/health`, { signal: AbortSignal.timeout(10000) });
    const ms = Date.now() - t0;
    let j = null; try { j = await r.json(); } catch {}
    return { url: WORKER_URL, httpStatus: r.status, buildSha: j?.buildSha ?? null, version: j?.version ?? null, ms };
  } catch (e) {
    return { url: WORKER_URL, httpStatus: null, buildSha: null, ms: Date.now() - t0,
      reason: e?.name === 'TimeoutError' ? 'ה-worker לא ענה תוך 10 שניות' : 'אין חיבור ל-worker' };
  }
}

// ---------------------------------------------------------------- analytics (one GraphQL call)
// $from..$to is the last 24 h, $pfrom..$from the 24 h before it, $mid is today's UTC midnight (the
// Workers AI free allowance resets there). CPU times come in microseconds.
const ANALYTICS_Q = `query($a:String!,$from:Time!,$to:Time!,$pfrom:Time!,$mid:Time!){viewer{accounts(filter:{accountTag:$a}){
 w: workersInvocationsAdaptive(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99} dimensions{scriptName} }
 wp: workersInvocationsAdaptive(limit:50, filter:{datetime_geq:$pfrom, datetime_leq:$from}){ sum{requests errors} dimensions{scriptName} }
 wh: workersInvocationsAdaptive(limit:1000, filter:{datetime_geq:$from, datetime_leq:$to}, orderBy:[datetimeHour_ASC]){ sum{requests errors} dimensions{datetimeHour scriptName} }
 d1: d1AnalyticsAdaptiveGroups(limit:50, filter:{datetimeHour_geq:$from, datetimeHour_leq:$to}){ sum{readQueries writeQueries rowsRead rowsWritten} dimensions{databaseId} }
 r2: r2OperationsAdaptiveGroups(limit:100, filter:{datetime_geq:$from, datetime_leq:$to}){ sum{requests} dimensions{bucketName actionType} }
 r2s: r2StorageAdaptiveGroups(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ max{objectCount payloadSize metadataSize} dimensions{bucketName} }
 ai: aiInferenceAdaptiveGroups(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ count sum{totalNeurons totalInputTokens totalOutputTokens} dimensions{modelId} }
 aid: aiInferenceAdaptiveGroups(limit:1, filter:{datetime_geq:$mid, datetime_leq:$to}){ count sum{totalNeurons} }
 gw: aiGatewayRequestsAdaptiveGroups(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ count sum{cost uncachedTokensIn uncachedTokensOut cachedRequests erroredRequests} dimensions{gateway} }
 ts: turnstileAdaptiveGroups(limit:100, filter:{datetime_geq:$from, datetime_leq:$to}){ count dimensions{siteKey eventType} }
 kv: kvOperationsAdaptiveGroups(limit:100, filter:{datetime_geq:$from, datetime_leq:$to}){ sum{requests} dimensions{namespaceId actionType} }
 do: durableObjectsInvocationsAdaptiveGroups(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ sum{requests errors} dimensions{namespaceId} }
 qu: queueMessageOperationsAdaptiveGroups(limit:50, filter:{datetime_geq:$from, datetime_leq:$to}){ count sum{billableOperations} dimensions{queueId actionType} }
}}}`;

async function analytics() {
  const to = new Date(); const from = new Date(to.getTime() - 86400000); const pfrom = new Date(to.getTime() - 2 * 86400000);
  const mid = new Date(to); mid.setUTCHours(0, 0, 0, 0);
  const j = await fetchJson(`${API}/graphql`, { label: LABEL, what: 'נתוני התנועה (Analytics)', method: 'POST', headers: auth(),
    body: { query: ANALYTICS_Q, variables: { a: process.env.CLOUDFLARE_ACCOUNT_ID, from: from.toISOString(), to: to.toISOString(), pfrom: pfrom.toISOString(), mid: mid.toISOString() } } });
  const a = obj(arr(j?.data?.viewer?.accounts)[0]);
  if (arr(j?.errors).length && !Object.keys(a).length) {
    const denied = arr(j.errors).some((e) => /auth|permission|access/i.test(e?.message || ''));
    throw Object.assign(new Error(), { reason: denied ? 'לטוקן של Cloudflare אין הרשאה ל-Analytics' : 'Cloudflare Analytics החזיר שגיאה' });
  }
  const g = (k) => arr(a[k]).map(obj);
  const dim = (x) => obj(x.dimensions);
  return { w: g('w'), wp: g('wp'), wh: g('wh'), d1: g('d1'), r2: g('r2'), r2s: g('r2s'), ai: g('ai'), aid: g('aid'), gw: g('gw'), ts: g('ts'), kv: g('kv'), do: g('do'), qu: g('qu'), dim };
}

// ---------------------------------------------------------------- workers
// A binding is reduced to what it points at. `text` (plain_text values) never leaves this function;
// only BUILD_SHA, when it is a git sha, is read to compare the deployed build with the served one.
const TARGET = ['class_name', 'bucket_name', 'database_id', 'namespace_id', 'queue_name', 'index_name', 'workflow_name', 'dataset', 'service', 'script_name'];
function binding(b) {
  const x = obj(b); const key = TARGET.find((k) => typeof x[k] === 'string');
  const out = { type: str(x.type), name: str(x.name), target: key ? x[key] : null };
  if (x.type === 'durable_object_namespace' && typeof x.script_name === 'string') out.script = x.script_name;
  return out;
}
const deployment = (x) => {
  const an = obj(x.annotations);
  return { id: str(x.id), createdAt: str(x.created_on), author: str(x.author_email), source: str(x.source), trigger: str(an['workers/triggered_by']),
    message: str(an['workers/message']), versions: arr(x.versions).map(obj).map((v) => ({ id: str(v.version_id), pct: num(v.percentage) })) };
};
const version = (x) => {
  const md = obj(x.metadata); const an = obj(x.annotations);
  return { id: str(x.id), number: num(x.number), createdAt: str(md.created_on), source: str(md.source), author: str(md.author_email),
    trigger: str(an['workers/triggered_by']), message: str(an['workers/message']) };
};

async function workers() {
  const [scripts, sub] = await Promise.all([get(`${acct()}/workers/scripts`, 'רשימת ה-Workers'),
    get(`${acct()}/workers/subdomain`, 'תת-הדומיין workers.dev').catch(() => null)]);
  const subdomain = str(obj(sub).subdomain);
  return Promise.all(arr(scripts).map(obj).filter((s) => typeof s.id === 'string').map(async (s) => {
    const base = `${acct()}/workers/scripts/${encodeURIComponent(s.id)}`;
    const [set, dep, ver, sch] = await Promise.all([
      get(`${base}/settings`, 'הגדרות ה-Worker').catch(() => null),
      get(`${base}/deployments`, 'היסטוריית הפריסות').catch(() => null),
      get(`${base}/versions?per_page=20`, 'רשימת הגרסאות').catch(() => null),
      get(`${base}/schedules`, 'תזמונים (Cron)').catch(() => null)]);
    const bindings = arr(obj(set).bindings).map(binding);
    const sha = str(arr(obj(set).bindings).map(obj).find((b) => b.name === 'BUILD_SHA' && b.type === 'plain_text')?.text);
    const deployments = arr(obj(dep).deployments).map(obj).map(deployment).sort(byNewest).slice(0, 10);
    const versions = arr(obj(ver).items).map(obj).map(version).sort((a, b) => (b.number ?? 0) - (a.number ?? 0));
    const numOf = new Map(versions.map((v) => [v.id, v.number]));
    const o = obj(obj(set).observability);
    return {
      name: s.id, createdAt: str(s.created_on), modifiedAt: str(s.modified_on), usageModel: str(s.usage_model),
      compatDate: str(obj(set).compatibility_date) ?? str(s.compatibility_date), handlers: arr(s.handlers).filter((h) => typeof h === 'string'),
      lastDeployedFrom: str(s.last_deployed_from),
      url: subdomain ? `https://${s.id}.${subdomain}.workers.dev` : null,
      observability: { logs: Boolean(obj(o.logs).enabled), traces: Boolean(obj(o.traces).enabled) },
      buildSha: sha && /^[0-9a-f]{7,40}(-dirty)?$/i.test(sha) ? sha : null,
      bindings, deployments, versions,
      serving: (deployments[0]?.versions || []).map((v) => ({ ...v, number: numOf.get(v.id) ?? null })),
      crons: arr(obj(sch).schedules).map((c) => str(obj(c).cron)).filter(Boolean),
    };
  }));
}

// ---------------------------------------------------------------- the page payload
const MB = 1024 ** 2, GB = 1024 ** 3;
const D1_FREE = 500 * MB, D1_PAID = 10 * GB;

export function cloudflare() {
  if (!connected()) return Promise.resolve(fail(MISSING));
  return cached('cloudflare', async () => {
    const id = process.env.CLOUDFLARE_ACCOUNT_ID;
    const list = (path, what) => () => get(`${acct()}${path}`, what);
    const s = {
      account: section(() => get(acct(), 'פרטי החשבון')),
      workers: section(workers),
      analytics: section(analytics),
      // The list's num_tables reads 0; the per-database record carries the real count.
      d1: section(async () => Promise.all(arr(await get(`${acct()}/d1/database?per_page=100`, 'D1')).map(obj).map(async (d) => {
        const one = typeof d.uuid === 'string' ? await get(`${acct()}/d1/database/${encodeURIComponent(d.uuid)}`, 'D1').catch(() => null) : null;
        return { ...d, ...obj(one) };
      }))),
      kv: section(list('/storage/kv/namespaces?per_page=100', 'KV')),
      r2: section(list('/r2/buckets', 'R2')),
      vectorize: section(list('/vectorize/v2/indexes', 'Vectorize')),
      queues: section(list('/queues', 'Queues')),
      aiGateway: section(list('/ai-gateway/gateways', 'AI Gateway')),
      zones: section(() => get(`${API}/zones?account.id=${encodeURIComponent(id)}&per_page=50`, 'Zones')),
      settings: section(() => get(SETTINGS_URL(), 'הגדרות ה-Worker')),
      subdomain: section(() => get(`${acct()}/workers/scripts/${WORKER}/subdomain`, 'כתובת workers.dev')),
      turnstile: section(list('/challenges/widgets', 'Turnstile')),
      pages: section(list('/pages/projects', 'Pages')),
      durableObjects: section(list('/workers/durable_objects/namespaces', 'Durable Objects')),
      workflows: section(list('/workflows', 'Workflows')),
    };
    const [health, ...vals] = await Promise.all([workerHealth(), ...Object.values(s)]);
    const r = Object.fromEntries(Object.keys(s).map((k, i) => [k, vals[i]]));
    const errors = Object.fromEntries(Object.entries(r).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));
    if (Object.keys(errors).length === Object.keys(r).length) return scrub(fail(r.account.error, { errors, health }));
    const g = r.analytics.value || { w: [], wp: [], wh: [], d1: [], r2: [], r2s: [], ai: [], aid: [], gw: [], ts: [], kv: [], do: [], qu: [], dim: obj };
    const dim = g.dim;
    const by = (rows, key, v) => rows.filter((x) => dim(x)[key] === v);

    const wk = arr(r.workers.value).map((w) => {
      const t = by(g.w, 'scriptName', w.name)[0]; const p = by(g.wp, 'scriptName', w.name)[0];
      const q = obj(t?.quantiles);
      return { ...w, requests24h: num(t?.sum?.requests) ?? (r.analytics.value ? 0 : null), errors24h: num(t?.sum?.errors) ?? (r.analytics.value ? 0 : null),
        subrequests24h: num(t?.sum?.subrequests), cpuP50Ms: num(q.cpuTimeP50) != null ? q.cpuTimeP50 / 1000 : null,
        cpuP99Ms: num(q.cpuTimeP99) != null ? q.cpuTimeP99 / 1000 : null,
        prev24h: p ? { requests: num(p.sum?.requests) ?? 0, errors: num(p.sum?.errors) ?? 0 } : null };
    });
    const main = wk.find((w) => w.name === WORKER);
    const traffic = r.analytics.value ? {
      last24h: { requests: main?.requests24h ?? 0, errors: main?.errors24h ?? 0, subrequests: main?.subrequests24h ?? 0, cpuP50Ms: main?.cpuP50Ms ?? null, cpuP99Ms: main?.cpuP99Ms ?? null },
      prev24h: main?.prev24h ?? { requests: 0, errors: 0 },
      perHour: by(g.wh, 'scriptName', WORKER).map((h) => ({ hour: dim(h).datetimeHour, requests: num(h.sum?.requests) ?? 0, errors: num(h.sum?.errors) ?? 0 }))
        .sort((a, b) => String(a.hour).localeCompare(String(b.hour))),
      perHourAll: g.wh.map((h) => ({ hour: dim(h).datetimeHour, script: dim(h).scriptName, requests: num(h.sum?.requests) ?? 0, errors: num(h.sum?.errors) ?? 0 })),
    } : null;

    const d1 = arr(r.d1.value).map((d) => {
      const a = obj(by(g.d1, 'databaseId', d.uuid)[0]?.sum);
      return { name: str(d.name), uuid: str(d.uuid), sizeBytes: num(d.file_size), tables: num(d.num_tables), region: str(d.running_in_region), createdAt: str(d.created_at),
        reads24h: num(a.readQueries), writes24h: num(a.writeQueries), rowsRead24h: num(a.rowsRead), rowsWritten24h: num(a.rowsWritten) };
    });
    const R2_WRITE = /^(Put|Copy|CreateMultipart|CompleteMultipart|UploadPart|DeleteObject|AbortMultipart)/;
    const r2 = arr(obj(r.r2.value).buckets).map(obj).map((b) => {
      const ops = by(g.r2, 'bucketName', b.name); const st = obj(by(g.r2s, 'bucketName', b.name)[0]?.max);
      return { name: str(b.name), createdAt: str(b.creation_date), location: str(b.location), objects: num(st.objectCount), bytes: num(st.payloadSize),
        ops24h: sum(ops, (x) => x.sum?.requests), writes24h: sum(ops.filter((x) => R2_WRITE.test(dim(x).actionType || '')), (x) => x.sum?.requests) };
    });
    const ai = {
      neurons24h: sum(g.ai, (x) => x.sum?.totalNeurons), neuronsToday: sum(g.aid, (x) => x.sum?.totalNeurons), requests24h: sum(g.ai, (x) => x.count),
      models: g.ai.map((x) => ({ model: str(dim(x).modelId), requests: num(x.count), neurons: num(x.sum?.totalNeurons), tokensIn: num(x.sum?.totalInputTokens),
        tokensOut: num(x.sum?.totalOutputTokens) })).sort((a, b) => (b.neurons ?? 0) - (a.neurons ?? 0)),
    };
    const set = r.settings.value ? obj(r.settings.value) : null; const so = obj(set?.observability);
    const payload = {
      account: r.account.value ? { id: str(obj(r.account.value).id) ?? id, name: str(obj(r.account.value).name) } : { id, name: null },
      workers: wk,
      traffic,
      d1,
      kv: arr(r.kv.value).map(obj).map((k) => ({ title: str(k.title), id: str(k.id), ops24h: r.analytics.value ? sum(by(g.kv, 'namespaceId', k.id), (x) => x.sum?.requests) : null })),
      r2,
      vectorize: arr(r.vectorize.value).map(obj).map((v) => ({ name: str(v.name), dimensions: num(obj(v.config).dimensions), metric: str(obj(v.config).metric), createdAt: str(v.created_on) })),
      queues: arr(r.queues.value).map(obj).map((q) => ({ name: str(q.queue_name), id: str(q.queue_id), producers: num(q.producers_total_count), consumers: num(q.consumers_total_count),
        producerScripts: arr(q.producers).map((p) => str(obj(p).script)).filter(Boolean), consumerScripts: arr(q.consumers).map((c) => str(obj(c).script)).filter(Boolean),
        ops24h: r.analytics.value ? sum(by(g.qu, 'queueId', q.queue_id), (x) => x.sum?.billableOperations) : null })),
      aiGateway: arr(r.aiGateway.value).map(obj).map((x) => {
        const m = by(g.gw, 'gateway', x.id)[0]; const s2 = obj(m?.sum);
        return { id: str(x.id), createdAt: str(x.created_at), collectLogs: typeof x.collect_logs === 'boolean' ? x.collect_logs : null, cacheTtl: num(x.cache_ttl),
          rateLimit: num(x.rate_limiting_limit), authentication: typeof x.authentication === 'boolean' ? x.authentication : null,
          requests24h: num(m?.count) ?? 0, cost24h: num(s2.cost) ?? 0, errors24h: num(s2.erroredRequests) ?? 0, cached24h: num(s2.cachedRequests) ?? 0,
          tokensIn24h: num(s2.uncachedTokensIn) ?? 0, tokensOut24h: num(s2.uncachedTokensOut) ?? 0 };
      }),
      ai,
      zones: arr(r.zones.value).map(obj).map((z) => ({ id: str(z.id), name: str(z.name), status: str(z.status), plan: str(obj(z.plan).name) })),
      turnstile: arr(r.turnstile.value).map(obj).map((w) => ({ sitekey: str(w.sitekey), name: str(w.name), mode: str(w.mode),
        domains: arr(w.domains).filter((d) => typeof d === 'string'), createdAt: str(w.created_on),
        events24h: Object.fromEntries(by(g.ts, 'siteKey', w.sitekey).map((x) => [dim(x).eventType, num(x.count) ?? 0])) })),
      pages: arr(r.pages.value).map(obj).map((p) => {
        const l = obj(p.latest_deployment);
        return { name: str(p.name), subdomain: str(p.subdomain), createdAt: str(p.created_on), branch: str(p.production_branch),
          latest: l.id ? { id: str(l.id), createdAt: str(l.created_on), url: str(l.url), env: str(l.environment), status: str(obj(l.latest_stage).status),
            commit: str(obj(obj(l.deployment_trigger).metadata).commit_hash) } : null };
      }),
      durableObjects: arr(r.durableObjects.value).map(obj).map((n) => {
        const m = obj(by(g.do, 'namespaceId', n.id)[0]?.sum);
        return { id: str(n.id), name: str(n.name), script: str(n.script), className: str(n.class), sqlite: Boolean(n.use_sqlite),
          requests24h: num(m.requests), errors24h: num(m.errors) };
      }),
      workflows: arr(r.workflows.value).map(obj).map((w) => ({ name: str(w.name), id: str(w.id), script: str(w.script_name), className: str(w.class_name), createdAt: str(w.created_on),
        instances: Object.fromEntries(Object.entries(obj(w.instances)).filter(([, v]) => num(v) != null)) })),
      settings: set ? { observability: Boolean(so.enabled), logs: Boolean(obj(so.logs).enabled), traces: Boolean(obj(so.traces).enabled),
        sampling: num(so.head_sampling_rate), logpush: Boolean(set.logpush) } : null,
      crons: (main?.crons || []).map((cron) => ({ cron })),
      subdomain: r.subdomain.value ? { enabled: Boolean(obj(r.subdomain.value).enabled), previews: Boolean(obj(r.subdomain.value).previews_enabled) } : null,
      // The plan is not readable with this token (/subscriptions answers 403); a D1 database above the
      // free 500 MB cap can only exist on Workers Paid.
      plan: d1.some((d) => d.sizeBytes > D1_FREE) ? { paid: true, why: 'מסד D1 גדול מ-500 MB קיים רק ב-Workers Paid' } : { paid: null, why: 'התוכנית לא קריאה עם הטוקן' },
      health,
      errors,
    };
    payload.insights = insightsFor(payload, Date.now());
    return scrub(ok(payload));
  });
}

// ---------------------------------------------------------------- insights (Hebrew, server-side)
const nf = (n, d = 0) => new Intl.NumberFormat('en-US', { maximumFractionDigits: d }).format(n);
const pc = (f) => `${nf(f * 100, f < 0.1 ? 1 : 0)}%`;
const size = (b) => (b >= GB ? `${nf(b / GB, 1)} GB` : `${nf(b / MB)} MB`);
function agoHe(t, now) {
  const m = Math.max(0, Math.round((now - t) / 60000));
  if (m < 60) return m === 1 ? 'דקה' : `${m} דקות`;
  const h = Math.round(m / 60); if (h < 48) return h === 1 ? 'שעה' : `${h} שעות`;
  return `${Math.round(h / 24)} ימים`;
}
const AI_FREE = 10000, AI_PRICE = 0.011; // neurons a day included; $ per 1,000 neurons above it
const RANK = { bad: 0, warn: 1, info: 2, good: 3 };

/** Conclusions from a payload: [{ level, title, detail, href }], worst first. Pure (tested). */
export function insightsFor(p, now = Date.now()) {
  const out = []; const add = (level, title, detail, tab = 'home') => out.push({ level, title, detail, href: `#/cloudflare/${tab}` });
  const x = obj(p); const paid = obj(x.plan).paid === true;
  const t = obj(obj(x.traffic).last24h); const y = obj(obj(x.traffic).prev24h);
  const req = num(t.requests) ?? 0, err = num(t.errors) ?? 0, yreq = num(y.requests) ?? 0, yerr = num(y.errors) ?? 0;

  // error rate vs yesterday
  if (req >= 100) {
    const rate = err / req; const yrate = yreq ? yerr / yreq : null;
    if (err >= 10 && rate >= 0.01 && (yrate == null || rate > yrate * 2)) {
      add(rate >= 0.05 ? 'bad' : 'warn', `שיעור השגיאות של ${WORKER} עלה ל-${pc(rate)}`,
        `ב-24 השעות האחרונות ${nf(err)} שגיאות מתוך ${nf(req)} בקשות (${pc(rate)}). ביממה שלפני: ${yrate == null ? 'אין נתון' : pc(yrate)}.`, 'analytics');
    }
  }
  // traffic vs yesterday
  if (req >= 100 && yreq >= 100) {
    const k = req / yreq;
    if (k >= 1.5) add('info', `התנועה ל-${WORKER} גדלה פי ${nf(k, 1)} לעומת אתמול`, `${nf(req)} בקשות ב-24 השעות האחרונות, ${nf(yreq)} ביממה שלפני.`, 'analytics');
    else if (k <= 0.5) add('info', `התנועה ל-${WORKER} ירדה ב-${pc(1 - k)} לעומת אתמול`, `${nf(req)} בקשות ב-24 השעות האחרונות, ${nf(yreq)} ביממה שלפני.`, 'analytics');
  }
  const ws = arr(x.workers).map(obj);
  // CPU p99 vs the limit (Workers Paid: 30 s by default; free: 10 ms)
  const limit = paid ? 30000 : 10;
  for (const w of ws) {
    const p99 = num(w.cpuP99Ms); if (p99 == null || !w.name) continue;
    const f = p99 / limit; if (f < 0.7) continue;
    add(f >= 1 ? 'bad' : 'warn', `CPU p99 של ${w.name} ${f >= 1 ? 'מעל' : 'קרוב ל'}מגבלה`,
      `p99 הוא ${nf(p99, 1)} ms מתוך ${nf(limit)} ms (${paid ? 'ברירת המחדל ב-Workers Paid' : 'המגבלה בתוכנית החינמית'}). בקשה שעוברת את המגבלה נכשלת.`, 'workers');
  }
  // the last deploy, its trigger, and what is serving
  const w = ws.find((v) => v.name === WORKER) || ws[0];
  if (w) {
    const deps = arr(w.deployments).map(obj).filter((d) => ms(d.createdAt)).sort(byNewest);
    const last = deps[0];
    if (last) {
      const code = deps.find((d) => d.trigger !== 'secret');
      if (last.trigger === 'secret') {
        add('info', `הפריסה האחרונה של ${w.name} הייתה עדכון סוד, לפני ${agoHe(ms(last.createdAt), now)}`,
          `עדכון סוד יוצר גרסה חדשה בלי לשנות קוד. ${code ? `פריסת הקוד האחרונה: לפני ${agoHe(ms(code.createdAt), now)}.` : 'אין פריסת קוד בעשר האחרונות.'}`, 'workers');
      } else {
        add('info', `הפריסה האחרונה של ${w.name}: לפני ${agoHe(ms(last.createdAt), now)}`,
          `${last.trigger === 'deployment' || last.trigger === 'upload' ? 'פריסת קוד' : 'פריסה'}${last.message ? `: "${last.message}"` : ''}${last.author ? `, ${last.author}` : ''}.`, 'workers');
      }
    }
    const serving = arr(w.serving).map(obj);
    const newest = arr(w.versions).map(obj).filter((v) => num(v.number) != null).sort((a, b) => b.number - a.number)[0];
    if (serving.length > 1) {
      add('warn', `פריסה הדרגתית: ${serving.length} גרסאות מגישות תנועה`, `${serving.map((s) => `#${s.number ?? '?'} ‏${nf(num(s.pct) ?? 0)}%`).join(', ')}. כדאי לסיים את הפריסה או לחזור לגרסה אחת.`, 'workers');
    } else if (serving.length === 1 && newest && num(serving[0].number) != null && serving[0].number < newest.number) {
      add('warn', `הגרסה המגישה (#${serving[0].number}) אינה החדשה ביותר`, `קיימת גרסה #${newest.number} שעוד לא נפרסה, או שבוצעה חזרה לגרסה קודמת.`, 'workers');
    }
  }
  // D1 size vs the per-database limit
  for (const d of arr(x.d1).map(obj)) {
    const b = num(d.sizeBytes); if (b == null) continue;
    const cap = paid ? D1_PAID : D1_FREE; const f = b / cap;
    const title = `מסד D1 ${d.name}: ${size(b)} מתוך ${size(cap)}`;
    if (f >= 0.7) add(f >= 0.9 ? 'bad' : 'warn', title, `המסד מתקרב למגבלה של ${size(cap)} למסד ${paid ? 'ב-Workers Paid' : 'בתוכנית החינמית'}. כשהמסד מתמלא, כתיבות נכשלות.`, 'storage');
    else if (paid && b > D1_FREE) add('info', title, `${pc(f)} מהמגבלה של 10 GB למסד. המסד גדול מ-500 MB, המגבלה של התוכנית החינמית, ולכן החשבון ב-Workers Paid (הסקה).`, 'storage');
  }
  // Workers AI neurons vs the free daily allowance (resets at 00:00 UTC)
  const n = num(obj(x.ai).neuronsToday);
  if (n != null && n > AI_FREE) {
    add('warn', `Workers AI: פי ${nf(n / AI_FREE)} מהמכסה החינמית של נוירונים היום`,
      `${nf(n)} נוירונים מאז חצות UTC, מול ${nf(AI_FREE)} בחינם ביום. החריגה עולה כ-$${((n - AI_FREE) / 1000 * AI_PRICE).toFixed(2)} עד עכשיו (0.011$ לכל 1,000 נוירונים).`, 'ai');
  } else if (n != null && n >= AI_FREE * 0.7) {
    add('info', `Workers AI: ${nf(n)} נוירונים היום, ${pc(n / AI_FREE)} מהמכסה החינמית`, `המכסה (${nf(AI_FREE)} ביום) מתאפסת בחצות UTC. מעבר לה: 0.011$ לכל 1,000 נוירונים.`, 'ai');
  }
  // Durable Object errors
  for (const d of arr(x.durableObjects).map(obj)) {
    const e = num(d.errors24h) ?? 0, r = num(d.requests24h) ?? 0; if (e < 10 || !r) continue;
    add(e / r >= 0.005 ? 'warn' : 'info', `Durable Object ${d.className || d.name}: ${nf(e)} שגיאות ביממה`, `${pc(e / r)} מתוך ${nf(r)} קריאות.`, 'workers');
  }
  // AI Gateway
  for (const gw of arr(x.aiGateway).map(obj)) {
    const r = num(gw.requests24h) ?? 0; if (!r) continue;
    const e = num(gw.errors24h) ?? 0; const c = num(gw.cached24h) ?? 0;
    add(e / r >= 0.05 ? 'warn' : 'info', `AI Gateway ${gw.id}: ${nf(r)} בקשות ביממה`,
      `עלות $${(num(gw.cost24h) ?? 0).toFixed(2)}, ${nf(e)} שגיאות (${pc(e / r)})${c ? `, ${nf(c)} מהמטמון` : ''}.`, 'ai');
  }
  // Turnstile verifications that failed
  for (const ts of arr(x.turnstile).map(obj)) {
    const failed = Object.entries(obj(ts.events24h)).filter(([k]) => /fail/i.test(k)).reduce((s, [, v]) => s + (num(v) ?? 0), 0);
    if (failed) add('info', `Turnstile ${ts.name}: ${nf(failed)} אימותים שנכשלו ביממה`, 'אימות שנכשל הוא בדרך כלל טוקן פג תוקף או ניסיון אוטומטי.', 'security');
  }
  if (!out.some((i) => i.level === 'bad' || i.level === 'warn')) {
    add('good', 'הכול תקין ב-Cloudflare', `ה-Worker ${WORKER} ענה ל-${nf(req)} בקשות ביממה, בלי חריגה מהמגבלות.`);
  }
  return out.sort((a, b) => RANK[a.level] - RANK[b.level]);
}

// ---------------------------------------------------------------- D1 read-only guard
const SECRET_ID = /secret|token|passw|hash|api_?key|private|salt|credential|^_cf_/i;
const MASK = /secret|token|password|passwd|hash|api_?key|private|salt|credential/i;
const DENY = new Set(['insert', 'update', 'delete', 'drop', 'create', 'alter', 'attach', 'detach', 'vacuum', 'reindex', 'analyze', 'begin', 'commit',
  'rollback', 'savepoint', 'release', 'returning', 'pragma', 'upsert', 'load_extension', 'transaction', 'truncate', 'grant', 'revoke']);
const no = (reason) => ({ ok: false, reason });

/** Accepts one read statement (SELECT, WITH…SELECT, EXPLAIN, three schema PRAGMAs) or says why not. */
export function sqlGuard(input) {
  if (typeof input !== 'string' || !input.trim()) return no('השאילתה ריקה');
  const sql = input.trim();
  if (sql.length > 4000) return no('השאילתה ארוכה מדי (עד 4,000 תווים)');
  // One pass: comments and string literals go, quoted identifiers are unwrapped so their names are scanned too.
  let s = '';
  for (let i = 0; i < sql.length;) {
    const c = sql[i], n = sql[i + 1];
    if (c === '-' && n === '-') { const e = sql.indexOf('\n', i); i = e < 0 ? sql.length : e; s += ' '; continue; }
    if (c === '/' && n === '*') { const e = sql.indexOf('*/', i + 2); if (e < 0) return no('הערה שלא נסגרה'); i = e + 2; s += ' '; continue; }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const close = c === '[' ? ']' : c; let j = i + 1;
      for (;;) {
        if (j >= sql.length) return no(c === "'" ? 'מחרוזת שלא נסגרה' : 'שם שלא נסגר');
        if (sql[j] === close) { if (close !== ']' && sql[j + 1] === close) { j += 2; continue; } break; }
        j++;
      }
      s += c === "'" ? " '' " : ` ${sql.slice(i + 1, j)} `; i = j + 1; continue;
    }
    s += c; i++;
  }
  s = s.trim().replace(/;\s*$/, '');
  if (s.includes(';')) return no('רק שאילתה אחת בכל פעם');
  const words = s.toLowerCase().match(/[a-z_][a-z0-9_$]*/g) || [];
  const [w0, w1, w2, w3] = words;
  if (w0 === 'pragma') {
    return /^pragma\s+(?:main\s*\.\s*)?(table_info|table_list|index_list)\s*(?:\(\s*[a-z_][\w$]*\s*\))?\s*$/i.test(s)
      ? { ok: true, sql } : no('מותרים רק PRAGMA table_info, table_list ו-index_list');
  }
  const read = (w) => w === 'select' || w === 'with';
  if (!(read(w0) || (w0 === 'explain' && (read(w1) || (w1 === 'query' && w2 === 'plan' && read(w3)))))) return no('מותרות רק שאילתות קריאה: SELECT, WITH או EXPLAIN');
  if (!/^\w+\s+\S/.test(s)) return no('השאילתה לא שלמה');
  const bad = words.find((w) => DENY.has(w)) || (/\breplace\b(?!\s*\()/i.test(s) ? 'replace' : null);
  if (bad) return no(`המילה ${bad.toUpperCase()} חסומה: הקונסולה קוראת בלבד`);
  const secret = words.find((w) => SECRET_ID.test(w));
  if (secret) return no(`השאילתה נוגעת ב-${secret}, שם שמחזיק סודות או מידע רגיש. חסום.`);
  return { ok: true, sql };
}

// A cell that looks like a key, a hash or a JWT is masked even when its column name is innocent.
const looksSecret = (v) => /^[A-Za-z0-9+/=_.-]{40,}$/.test(v) || /\beyJ[\w-]{8,}\.[\w-]{8,}/.test(v) || /\b(sk|rk|pk)_(live|test)_\w{8,}/.test(v);
function cell(v) {
  if (v == null) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  const s2 = typeof v === 'string' ? v : JSON.stringify(v);
  if (looksSecret(s2)) return '•••';
  return redact(s2.length > 500 ? `${s2.slice(0, 500)}…` : s2);
}
const MAX_ROWS = 200;

async function d1Query({ db, sql }) {
  if (typeof db !== 'string' || !ID.test(db)) return fail('מזהה מסד לא תקין');
  const g = sqlGuard(sql); if (!g.ok) return fail(g.reason);
  const dbs = arr(await get(`${acct()}/d1/database?per_page=100`, 'D1'));
  if (!dbs.some((d) => obj(d).uuid === db)) return fail('המסד הזה לא שייך לחשבון');
  const j = await fetchJson(`${acct()}/d1/database/${encodeURIComponent(db)}/query`, { label: LABEL, what: 'שאילתת D1', method: 'POST', headers: auth(), body: { sql: g.sql } });
  const first = obj(arr(j?.result)[0]); const rows = arr(first.results).map(obj);
  const columns = []; for (const row of rows.slice(0, MAX_ROWS)) for (const k of Object.keys(row)) if (!columns.includes(k)) columns.push(k);
  const masked = columns.filter((c) => MASK.test(c));
  return ok({ db, columns, masked, truncated: rows.length > MAX_ROWS, rowsRead: num(obj(first.meta).rows_read), durationMs: num(obj(first.meta).duration),
    rows: rows.slice(0, MAX_ROWS).map((row) => columns.map((c) => (masked.includes(c) ? '•••' : cell(row[c])))) });
}

// KV: key NAMES and expiration only. A long opaque segment of a key name (a session id, a token) is cut.
// A segment is cut when it is long and opaque (32+ token characters), or 16+ characters that mix upper
// case, lower case and digits, the shape of a random token (share links contain dashes, so they never
// reach 32 in one run). UUIDs and hex ids are lower case, so they stay readable.
const opaque = (seg) => /[A-Za-z0-9+/=_]{32,}/.test(seg) || (/^[\w+/=.-]{16,}$/.test(seg) && /[A-Z]/.test(seg) && /[a-z]/.test(seg) && /\d/.test(seg));
const keyName = (n) => (str(n) || '').split(':').map((seg) => (opaque(seg) ? '…' : seg)).join(':');
async function kvKeys({ ns, prefix, cursor }) {
  if (typeof ns !== 'string' || !ID.test(ns)) return fail('מזהה KV לא תקין');
  if (prefix != null && (typeof prefix !== 'string' || prefix.length > 256)) return fail('קידומת לא תקינה');
  if (cursor != null && (typeof cursor !== 'string' || !/^[\w\-+/=.]{0,1024}$/.test(cursor))) return fail('סמן עמוד לא תקין');
  const all = arr(await get(`${acct()}/storage/kv/namespaces?per_page=100`, 'KV'));
  if (!all.some((k) => obj(k).id === ns)) return fail('ה-namespace הזה לא שייך לחשבון');
  const q = new URLSearchParams({ limit: '100' }); if (prefix) q.set('prefix', prefix); if (cursor) q.set('cursor', cursor);
  const j = await fetchJson(`${acct()}/storage/kv/namespaces/${encodeURIComponent(ns)}/keys?${q}`, { label: LABEL, what: 'מפתחות KV', headers: auth() });
  return ok({ ns, keys: arr(j?.result).map(obj).map((k) => ({ name: redact(keyName(k.name)), expiration: num(k.expiration) })),
    cursor: str(obj(j?.result_info).cursor) || null });
}

// R2: object listing only (names, sizes, dates, content types). Never an object body, never a write.
async function r2List({ bucket, prefix, cursor }) {
  if (typeof bucket !== 'string' || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(bucket)) return fail('שם דלי לא תקין');
  if (prefix != null && (typeof prefix !== 'string' || prefix.length > 512)) return fail('קידומת לא תקינה');
  if (cursor != null && (typeof cursor !== 'string' || !/^[\w\-+/=.]{0,1024}$/.test(cursor))) return fail('סמן עמוד לא תקין');
  const all = arr(obj(await get(`${acct()}/r2/buckets`, 'R2')).buckets);
  if (!all.some((b) => obj(b).name === bucket)) return fail('הדלי הזה לא שייך לחשבון');
  const q = new URLSearchParams({ delimiter: '/', per_page: '100' }); if (prefix) q.set('prefix', prefix); if (cursor) q.set('cursor', cursor);
  const j = await fetchJson(`${acct()}/r2/buckets/${encodeURIComponent(bucket)}/objects?${q}`, { label: LABEL, what: 'רשימת הקבצים ב-R2', headers: auth() });
  const info = obj(j?.result_info);
  return ok({ bucket, prefix: prefix || '', objects: arr(j?.result).map(obj).map((o) => ({ key: str(o.key), size: num(o.size), uploaded: str(o.last_modified),
    contentType: str(obj(o.http_metadata).contentType) })), prefixes: arr(info.delimited).filter((p) => typeof p === 'string'),
    cursor: str(info.cursor) || null, truncated: Boolean(info.is_truncated) });
}

// AI Gateway logs: the metadata of each call. Prompts, requests, responses and metadata never leave.
async function gwLogs({ gateway }) {
  if (typeof gateway !== 'string' || !ID.test(gateway)) return fail('מזהה Gateway לא תקין');
  const all = arr(await get(`${acct()}/ai-gateway/gateways`, 'AI Gateway'));
  if (!all.some((g) => obj(g).id === gateway)) return fail('ה-Gateway הזה לא שייך לחשבון');
  const logs = arr(await get(`${acct()}/ai-gateway/gateways/${encodeURIComponent(gateway)}/logs?per_page=50&order_by=created_at&order_by_direction=desc`, 'יומן AI Gateway'));
  return ok({ gateway, logs: logs.map(obj).map((l) => ({ id: str(l.id), createdAt: str(l.created_at), provider: str(l.provider), model: str(l.model),
    status: num(l.status_code), success: typeof l.success === 'boolean' ? l.success : null, cached: typeof l.cached === 'boolean' ? l.cached : null,
    tokensIn: num(l.tokens_in), tokensOut: num(l.tokens_out), cost: num(l.cost), durationMs: num(l.duration), neurons: num(obj(l.usage_metadata).neurons) })) });
}

// ---------------------------------------------------------------- writes
const SETTINGS_URL = () => `${acct()}/workers/scripts/${WORKER}/script-settings`;
const ROLLBACK_MSG = 'Rollback from owner dashboard';
const rollbackBody = (versionId) => ({ strategy: 'percentage', versions: [{ version_id: versionId, percentage: 100 }], annotations: { 'workers/message': ROLLBACK_MSG } });

// Rollback = a new deployment that puts one earlier version of the script at 100%. Reversible: rolling
// forward is the same action with the newer version. Cloudflare only accepts the 100 newest versions,
// and refuses (without force, which is never sent) when bindings or secrets changed in between.
async function rollback({ script, versionId, dryRun }) {
  if (typeof script !== 'string' || !ID.test(script)) return fail('שם Worker לא תקין');
  if (typeof versionId !== 'string' || !UUID.test(versionId)) return fail('מזהה גרסה לא תקין');
  if (!connected()) return fail(MISSING);
  const base = `${acct()}/workers/scripts/${encodeURIComponent(script)}`;
  try {
    const scripts = arr(await get(`${acct()}/workers/scripts`, 'רשימת ה-Workers'));
    if (!scripts.some((s) => obj(s).id === script)) return fail('ה-Worker הזה לא נמצא בחשבון');
    const items = arr(obj(await get(`${base}/versions?per_page=100`, 'רשימת הגרסאות')).items);
    if (!items.some((v) => obj(v).id === versionId)) return fail(`הגרסה הזו לא שייכת ל-${script}, או שאינה בין 100 הגרסאות האחרונות`);
    const cur = arr(obj(await get(`${base}/deployments`, 'היסטוריית הפריסות')).deployments).map(obj).map(deployment).sort(byNewest)[0];
    if (cur && cur.versions.length === 1 && cur.versions[0].id === versionId && cur.versions[0].pct === 100) return fail('הגרסה הזו כבר מגישה 100% מהתנועה');
  } catch (e) { return fail(e?.reason || 'לא הצלחתי לאמת את הגרסה'); }
  // The preview runs after the checks (reads only), so it never shows a plan the real call would refuse.
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url: `${API}/accounts/<account>/workers/scripts/${script}/deployments`, body: rollbackBody(versionId) } });
  try {
    await fetchJson(`${base}/deployments`, { label: LABEL, what: 'חזרה לגרסה קודמת', method: 'POST', headers: auth(), body: rollbackBody(versionId) });
  } catch (e) {
    const msg = arr(e?.json?.errors).map((x) => String(obj(x).message || '')).join(' ');
    if (/secret|binding/i.test(msg)) return fail('Cloudflare חוסם את החזרה: מאז הגרסה הזו השתנו סודות או חיבורים (bindings). צריך לפרוס מחדש מהקוד.');
    return fail(e?.reason || 'החזרה לגרסה נכשלה');
  }
  uncache('cloudflare');
  return ok({ kind: 'rollback', script, versionId });
}

const READS = { 'd1-query': d1Query, 'kv-keys': kvKeys, 'r2-list': r2List, 'gw-logs': gwLogs };

// Two reversible worker switches (Workers Logs and traces of the `apple` worker), the zone cache
// purge and the rollback; plus four read consoles. The switch sends back the worker's whole current
// observability block with one flag changed.
export async function cloudflareAction(body = {}) {
  const { kind, zoneId, value, dryRun } = obj(body);
  if (READS[kind]) {
    if (!connected()) return fail(MISSING);
    try { return scrub(await READS[kind](obj(body))); } catch (e) { return scrub(fail(e?.reason || 'הקריאה מ-Cloudflare נכשלה')); }
  }
  if (kind === 'rollback') return scrub(await rollback(obj(body)));
  if (!['purge', 'logs', 'traces'].includes(kind)) return fail('פעולה לא מוכרת');
  if (kind !== 'purge' && typeof value !== 'boolean') return fail('ערך לא תקין');
  if (kind === 'purge' && !/^[\w-]{1,64}$/.test(String(zoneId))) return fail('מזהה דומיין לא תקין');
  if (dryRun === true) {
    return ok({ dryRun: true, plan: kind === 'purge'
      ? { method: 'POST', url: `${API}/zones/${zoneId}/purge_cache`, body: { purge_everything: true } }
      : { method: 'PATCH', url: `${API}/accounts/<account>/workers/scripts/${WORKER}/script-settings`, body: { observability: { [kind]: { enabled: value } } } } });
  }
  if (!connected()) return fail(MISSING);
  if (kind !== 'purge') {
    try {
      const cur = await get(SETTINGS_URL(), 'הגדרות ה-Worker');
      const obs = { ...(obj(cur).observability || { enabled: true }) };
      obs[kind] = { ...(obs[kind] || {}), enabled: value };
      if (value) obs.enabled = true;
      await fetchJson(SETTINGS_URL(), { label: LABEL, what: 'שינוי הגדרות ה-Worker', method: 'PATCH', headers: auth(), body: { observability: obs } });
    } catch (e) { return fail(e?.reason || 'שינוי ההגדרה נכשל'); }
    uncache('cloudflare');
    return ok({ kind, value });
  }
  let zones;
  try { zones = arr(await get(`${API}/zones?account.id=${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}&per_page=50`, 'Zones')); }
  catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את רשימת הדומיינים'); }
  if (!zones.length) return fail('אין עדיין דומיין — ב-workers.dev אין מטמון שצריך לנקות. הכפתור יידלק כשיתווסף דומיין');
  if (!zones.some((z) => obj(z).id === zoneId)) return fail('הדומיין הזה לא שייך לחשבון');
  try {
    await fetchJson(`${API}/zones/${encodeURIComponent(zoneId)}/purge_cache`, { label: LABEL, what: 'ניקוי המטמון', method: 'POST',
      headers: auth(), body: { purge_everything: true } });
  } catch (e) { return fail(e?.reason || 'ניקוי המטמון נכשל'); }
  uncache('cloudflare');
  return ok({ kind, zoneId });
}
