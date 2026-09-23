// Cloudflare through the v4 API. The token's scopes are not known in advance, so every section is
// fetched on its own and a refusal becomes a plain reason in `errors`, never a thrown request.
import { fetchJson, cached, uncache, ok, fail, section } from '../http.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const LABEL = 'Cloudflare';
export const WORKER = 'apple';
export const WORKER_URL = 'https://apple.moshe-barami111.workers.dev';

const auth = () => ({ authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` });
const acct = () => `${API}/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}`;
const get = async (url, what) => (await fetchJson(url, { label: LABEL, what, headers: auth() }))?.result;

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

const TRAFFIC_Q = `query($a:String!,$s:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$a}){
  total: workersInvocationsAdaptive(limit:1, filter:{scriptName:$s, datetime_geq:$from, datetime_leq:$to}){
    sum{requests errors subrequests} quantiles{cpuTimeP50 cpuTimeP99}}
  hourly: workersInvocationsAdaptive(limit:100, filter:{scriptName:$s, datetime_geq:$from, datetime_leq:$to}, orderBy:[datetimeHour_ASC]){
    sum{requests errors} dimensions{datetimeHour}}}}}`;

async function traffic() {
  const to = new Date(), from = new Date(to.getTime() - 86400000);
  const j = await fetchJson(`${API}/graphql`, { label: LABEL, what: 'נתוני התנועה (Analytics)', method: 'POST', headers: auth(),
    body: { query: TRAFFIC_Q, variables: { a: process.env.CLOUDFLARE_ACCOUNT_ID, s: WORKER, from: from.toISOString(), to: to.toISOString() } } });
  if (j?.errors?.length) {
    const denied = j.errors.some((e) => /auth|permission|access/i.test(e?.message || ''));
    throw Object.assign(new Error(), { reason: denied ? 'לטוקן של Cloudflare אין הרשאה ל-Analytics' : 'Cloudflare Analytics החזיר שגיאה' });
  }
  const a = j?.data?.viewer?.accounts?.[0] || {};
  const t = a.total?.[0];
  const perHour = new Map();
  for (const h of a.hourly || []) {
    const k = h.dimensions.datetimeHour, cur = perHour.get(k) || { hour: k, requests: 0, errors: 0 };
    cur.requests += h.sum.requests; cur.errors += h.sum.errors; perHour.set(k, cur);
  }
  return {
    last24h: { requests: t?.sum?.requests ?? 0, errors: t?.sum?.errors ?? 0, subrequests: t?.sum?.subrequests ?? 0,
      cpuP50Ms: t ? t.quantiles.cpuTimeP50 / 1000 : null, cpuP99Ms: t ? t.quantiles.cpuTimeP99 / 1000 : null },
    perHour: [...perHour.values()],
  };
}

async function workers() {
  const [scripts, sub] = await Promise.all([get(`${acct()}/workers/scripts`, 'רשימת ה-Workers'),
    get(`${acct()}/workers/subdomain`, 'תת-הדומיין workers.dev').catch(() => null)]);
  return Promise.all((scripts || []).map(async (s) => {
    const d = await get(`${acct()}/workers/scripts/${encodeURIComponent(s.id)}/deployments`, 'היסטוריית הפריסות').catch(() => null);
    return {
      name: s.id, modifiedAt: s.modified_on,
      url: sub?.subdomain ? `https://${s.id}.${sub.subdomain}.workers.dev` : null,
      deployments: (d?.deployments || []).slice(0, 5).map((x) => ({ id: x.id, createdAt: x.created_on, author: x.author_email ?? null,
        message: x.annotations?.['workers/message'] ?? null, source: x.source ?? null })),
    };
  }));
}

export function cloudflare() {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
    return Promise.resolve(fail('חסרים CLOUDFLARE_API_TOKEN או CLOUDFLARE_ACCOUNT_ID בקובץ ‎.env'));
  }
  return cached('cloudflare', async () => {
    const id = process.env.CLOUDFLARE_ACCOUNT_ID;
    const s = {
      account: section(() => get(acct(), 'פרטי החשבון')),
      workers: section(workers),
      traffic: section(traffic),
      // The list's num_tables reads 0; the per-database record carries the real count.
      d1: section(async () => Promise.all(((await get(`${acct()}/d1/database`, 'D1')) || []).map((d) =>
        get(`${acct()}/d1/database/${encodeURIComponent(d.uuid)}`, 'D1').catch(() => d)))),
      kv: section(() => get(`${acct()}/storage/kv/namespaces?per_page=100`, 'KV')),
      r2: section(() => get(`${acct()}/r2/buckets`, 'R2')),
      vectorize: section(() => get(`${acct()}/vectorize/v2/indexes`, 'Vectorize')),
      queues: section(() => get(`${acct()}/queues`, 'Queues')),
      aiGateway: section(() => get(`${acct()}/ai-gateway/gateways`, 'AI Gateway')),
      zones: section(() => get(`${API}/zones?account.id=${encodeURIComponent(id)}&per_page=50`, 'Zones')),
      settings: section(() => get(SETTINGS_URL(), 'הגדרות ה-Worker')),
      schedules: section(() => get(`${acct()}/workers/scripts/${WORKER}/schedules`, 'תזמונים (Cron)')),
      subdomain: section(() => get(`${acct()}/workers/scripts/${WORKER}/subdomain`, 'כתובת workers.dev')),
    };
    const [health, ...vals] = await Promise.all([workerHealth(), ...Object.values(s)]);
    const r = Object.fromEntries(Object.keys(s).map((k, i) => [k, vals[i]]));
    const errors = Object.fromEntries(Object.entries(r).filter(([, v]) => v.error).map(([k, v]) => [k, v.error]));
    if (Object.keys(errors).length === Object.keys(r).length) return fail(r.account.error, { errors, health });
    return ok({
      account: r.account.value ? { id: r.account.value.id, name: r.account.value.name } : { id, name: null },
      workers: r.workers.value || [],
      traffic: r.traffic.value || null,
      d1: (r.d1.value || []).map((d) => ({ name: d.name, uuid: d.uuid, sizeBytes: d.file_size ?? null, tables: d.num_tables ?? null })),
      kv: (r.kv.value || []).map((k) => ({ title: k.title, id: k.id })),
      r2: (r.r2.value?.buckets || []).map((b) => ({ name: b.name, createdAt: b.creation_date })),
      vectorize: (r.vectorize.value || []).map((v) => ({ name: v.name, dimensions: v.config?.dimensions ?? null, metric: v.config?.metric ?? null })),
      queues: (r.queues.value || []).map((q) => ({ name: q.queue_name, id: q.queue_id, producers: q.producers_total_count ?? null,
        consumers: q.consumers_total_count ?? null })),
      aiGateway: (r.aiGateway.value || []).map((g) => ({ id: g.id, createdAt: g.created_at ?? null })),
      zones: (r.zones.value || []).map((z) => ({ id: z.id, name: z.name, status: z.status, plan: z.plan?.name ?? null })),
      settings: r.settings.value ? { observability: Boolean(r.settings.value.observability?.enabled),
        logs: Boolean(r.settings.value.observability?.logs?.enabled), traces: Boolean(r.settings.value.observability?.traces?.enabled),
        sampling: r.settings.value.observability?.head_sampling_rate ?? null, logpush: Boolean(r.settings.value.logpush) } : null,
      crons: (r.schedules.value?.schedules || []).map((c) => ({ cron: c.cron, modifiedAt: c.modified_on ?? null })),
      subdomain: r.subdomain.value ? { enabled: Boolean(r.subdomain.value.enabled), previews: Boolean(r.subdomain.value.previews_enabled) } : null,
      health,
      errors,
    });
  });
}

const SETTINGS_URL = () => `${acct()}/workers/scripts/${WORKER}/script-settings`;

// Two reversible worker switches (Workers Logs and traces of the `apple` worker) and the zone cache
// purge. The switch sends back the worker's whole current observability block with one flag changed.
export async function cloudflareAction({ kind, zoneId, value, dryRun }) {
  if (!['purge', 'logs', 'traces'].includes(kind)) return fail('פעולה לא מוכרת');
  if (kind !== 'purge' && typeof value !== 'boolean') return fail('ערך לא תקין');
  if (kind === 'purge' && !/^[\w-]{1,64}$/.test(String(zoneId))) return fail('מזהה דומיין לא תקין');
  if (dryRun === true) {
    return ok({ dryRun: true, plan: kind === 'purge'
      ? { method: 'POST', url: `${API}/zones/${zoneId}/purge_cache`, body: { purge_everything: true } }
      : { method: 'PATCH', url: `${API}/accounts/<account>/workers/scripts/${WORKER}/script-settings`, body: { observability: { [kind]: { enabled: value } } } } });
  }
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) return fail('חסרים CLOUDFLARE_API_TOKEN או CLOUDFLARE_ACCOUNT_ID בקובץ ‎.env');
  if (kind !== 'purge') {
    try {
      const cur = await get(SETTINGS_URL(), 'הגדרות ה-Worker');
      const obs = { ...(cur?.observability || { enabled: true }) };
      obs[kind] = { ...(obs[kind] || {}), enabled: value };
      if (value) obs.enabled = true;
      await fetchJson(SETTINGS_URL(), { label: LABEL, what: 'שינוי הגדרות ה-Worker', method: 'PATCH', headers: auth(), body: { observability: obs } });
    } catch (e) { return fail(e?.reason || 'שינוי ההגדרה נכשל'); }
    uncache('cloudflare');
    return ok({ kind, value });
  }
  let zones;
  try { zones = await get(`${API}/zones?account.id=${encodeURIComponent(process.env.CLOUDFLARE_ACCOUNT_ID)}&per_page=50`, 'Zones'); }
  catch (e) { return fail(e?.reason || 'לא הצלחתי לקרוא את רשימת הדומיינים'); }
  if (!zones?.length) return fail('אין עדיין דומיין — ב-workers.dev אין מטמון שצריך לנקות. הכפתור יידלק כשיתווסף דומיין');
  if (!zones.some((z) => z.id === zoneId)) return fail('הדומיין הזה לא שייך לחשבון');
  try {
    await fetchJson(`${API}/zones/${encodeURIComponent(zoneId)}/purge_cache`, { label: LABEL, what: 'ניקוי המטמון', method: 'POST',
      headers: auth(), body: { purge_everything: true } });
  } catch (e) { return fail(e?.reason || 'ניקוי המטמון נכשל'); }
  uncache('cloudflare');
  return ok({ kind, zoneId });
}
