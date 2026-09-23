// The costs page (טוקנים, עלויות ושימוש): tokens in and out per model, per day and per run, cost
// per provider, requests, cache hits, the costliest runs, a month projection and free-tier headroom.
// Sources, all read-only:
//   Cloudflare GraphQL  aiInferenceAdaptiveGroups (Workers AI neurons + tokens by day and model) and
//                       aiGatewayRequestsAdaptiveGroups (AI Gateway requests, cache, errors, cost).
//   apple()             the worker's admin API (spend ledger, ceilings, prompt-cache rate, prices).
//   worker logs         /api/admin/logs?kind=model_call, grouped by runId for the per-run table.
//   cloudflare(), groq probeState(), supabase(): request counts, Groq quota headers, DB size.
// A provider with no readable source is listed in `noSource` with the missing source named, never 0.
// Every admin GET is itself logged by the worker as an audit event, so this reads at most every 5 min.
import { fetchJson, cached, ok, fail, section } from '../http.mjs';
import { apple } from './apple.mjs';
import { cloudflare, WORKER_URL } from './cloudflare.mjs';
import * as groq from './groq.mjs'; // probeState is newer than some checkouts of groq.mjs
import { supabase, FREE_DB_BYTES } from './supabase.mjs';

const DAYS = 30;
const FREE_NEURONS_PER_DAY = 10000; // Workers AI free allocation (the worker's own FREE_NEURONS_PER_DAY)
const USD_PER_NEURON = 0.011 / 1000; // apps/worker/src/pricing.ts
const PAID_REQUESTS_PER_MONTH = 10_000_000; // Workers Paid included requests
const D1_FREE_BYTES = 5 * 1024 ** 3;
const arr = (x) => (Array.isArray(x) ? x : []);
const n = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' ? Number(x) : 0);
const billable = (neurons) => Math.max(0, neurons - FREE_NEURONS_PER_DAY) * USD_PER_NEURON;

const Q = `query($a:String!,$from:Time!,$to:Time!){viewer{accounts(filter:{accountTag:$a}){
  ai: aiInferenceAdaptiveGroups(limit:2000, filter:{datetime_geq:$from, datetime_leq:$to}){
    count sum{totalNeurons totalInputTokens totalOutputTokens} dimensions{date modelId}}
  gw: aiGatewayRequestsAdaptiveGroups(limit:2000, filter:{datetimeHour_geq:$from, datetimeHour_leq:$to}){
    count sum{cachedRequests erroredRequests cost uncachedTokensIn uncachedTokensOut cachedTokensIn cachedTokensOut} dimensions{date gateway provider model}}}}}`;

async function cfUsage(now) {
  const from = new Date(now - DAYS * 864e5);
  const j = await fetchJson('https://api.cloudflare.com/client/v4/graphql', { label: 'Cloudflare', what: 'נתוני השימוש ב-AI (Analytics)', method: 'POST',
    headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
    body: { query: Q, variables: { a: process.env.CLOUDFLARE_ACCOUNT_ID, from: from.toISOString(), to: new Date(now).toISOString() } } });
  if (j?.errors?.length) throw Object.assign(new Error(), { reason: /auth|permission|access/i.test(j.errors[0]?.message || '') ? 'לטוקן של Cloudflare אין הרשאה ל-Analytics' : 'Cloudflare Analytics החזיר שגיאה' });
  const a = j?.data?.viewer?.accounts?.[0] || {};
  return { ai: arr(a.ai), gw: arr(a.gw) };
}

const base = () => (process.env.API_BASE || WORKER_URL).replace(/\/+$/, '');
const modelCalls = () => fetchJson(`${base()}/api/admin/logs?kind=model_call&days=${DAYS}&limit=2000`,
  { label: 'Apple', what: 'יומן הקריאות למודל', headers: { 'x-admin-key': process.env.GOLEM_ADMIN_KEY } });

/** Pure: everything the page shows from the raw sources. Exported for the tests. */
export function derive({ ai = [], gw = [], calls = [], a = {}, cf = {}, groqProbe = null, sb = null, now = Date.now() } = {}) {
  // ---- per model: Workers AI analytics (neurons, tokens) joined with the gateway (requests, cache, cost)
  const models = {};
  const m = (id) => (models[id] ||= { model: id, provider: null, requests: 0, tokensIn: 0, tokensOut: 0, neurons: 0, usd: 0, cached: 0, errors: 0, gwRequests: 0 });
  for (const r of ai) { const x = m(r.dimensions?.modelId || '—'); x.provider = 'workers-ai'; x.requests += n(r.count); x.tokensIn += n(r.sum?.totalInputTokens); x.tokensOut += n(r.sum?.totalOutputTokens); x.neurons += n(r.sum?.totalNeurons); }
  for (const r of gw) {
    const x = m(r.dimensions?.model || '—'); x.provider ||= r.dimensions?.provider || null;
    x.gwRequests += n(r.count); x.cached += n(r.sum?.cachedRequests); x.errors += n(r.sum?.erroredRequests); x.usd += n(r.sum?.cost);
    if (x.provider !== 'workers-ai') { x.requests += n(r.count); x.tokensIn += n(r.sum?.uncachedTokensIn) + n(r.sum?.cachedTokensIn); x.tokensOut += n(r.sum?.uncachedTokensOut) + n(r.sum?.cachedTokensOut); }
  }
  const byModel = Object.values(models).sort((p, q) => q.tokensIn + q.tokensOut - (p.tokensIn + p.tokensOut) || q.requests - p.requests);

  // ---- per day
  const days = {};
  const d = (k) => (days[k] ||= { day: k, tokensIn: 0, tokensOut: 0, neurons: 0, requests: 0, gwUsd: 0, models: {} });
  for (let i = DAYS - 1; i >= 0; i--) d(new Date(now - i * 864e5).toISOString().slice(0, 10));
  for (const r of ai) {
    const x = d(r.dimensions?.date); const tok = n(r.sum?.totalInputTokens) + n(r.sum?.totalOutputTokens);
    x.tokensIn += n(r.sum?.totalInputTokens); x.tokensOut += n(r.sum?.totalOutputTokens); x.neurons += n(r.sum?.totalNeurons); x.requests += n(r.count);
    x.models[r.dimensions?.modelId] = (x.models[r.dimensions?.modelId] || 0) + tok;
  }
  for (const r of gw) d(r.dimensions?.date).gwUsd += n(r.sum?.cost);
  const top = byModel.filter((x) => x.provider === 'workers-ai').slice(0, 4).map((x) => x.model);
  const byDay = Object.values(days).filter((x) => x.day).sort((p, q) => p.day.localeCompare(q.day)).map((x) => {
    const row = { day: x.day, tokensIn: x.tokensIn, tokensOut: x.tokensOut, neurons: x.neurons, requests: x.requests, usd: billable(x.neurons), gwUsd: x.gwUsd };
    let other = 0; for (const [k, v] of Object.entries(x.models)) { const i = top.indexOf(k); if (i >= 0) row[`m${i}`] = v; else other += v; }
    row.other = other; return row;
  });

  // ---- per run (the worker's model_call log: only the retained window)
  const runs = {};
  for (const e of calls) {
    if (!e || typeof e !== 'object') continue;
    const k = typeof e.runId === 'string' && e.runId ? e.runId : null; if (!k) continue;
    const r = (runs[k] ||= { run: k.slice(0, 8), calls: 0, tokensIn: 0, tokensOut: 0, cachedIn: 0, neurons: 0, failed: 0, models: new Set(), features: new Set(), from: Infinity, to: 0 });
    r.calls++; r.tokensIn += n(e.inputTokens); r.tokensOut += n(e.outputTokens); r.cachedIn += n(e.cachedInputTokens); r.neurons += n(e.neurons);
    if (e.outcome && e.outcome !== 'ok') r.failed++;
    if (e.model) r.models.add(e.model); if (e.feature) r.features.add(String(e.feature).split(':')[0]);
    r.from = Math.min(r.from, n(e.at)); r.to = Math.max(r.to, n(e.at));
  }
  const runList = Object.values(runs).map((r) => ({ ...r, models: [...r.models], features: [...r.features], usd: r.neurons * USD_PER_NEURON, from: r.from === Infinity ? null : r.from }))
    .sort((p, q) => q.neurons - p.neurons);

  // ---- totals, cache, providers
  const sum = (k) => byModel.reduce((t, x) => t + x[k], 0);
  const gwReq = gw.reduce((t, r) => t + n(r.count), 0); const gwCached = gw.reduce((t, r) => t + n(r.sum?.cachedRequests), 0);
  const aiNeurons = ai.reduce((t, r) => t + n(r.sum?.totalNeurons), 0);
  const totals = { requests: sum('requests'), tokensIn: sum('tokensIn'), tokensOut: sum('tokensOut'), neurons: aiNeurons,
    usd: byDay.reduce((t, x) => t + x.usd, 0), gwUsd: sum('usd'), errors: sum('errors') };
  const cache = { gateway: gwReq ? { rate: gwCached / gwReq, cached: gwCached, requests: gwReq } : null, prompt: a.tokens?.cacheHit ?? null,
    promptTokens: a.tokens ? { input: a.tokens.input, cached: a.tokens.cached } : null };
  const providers = {};
  for (const r of gw) { const p = (providers[r.dimensions?.provider || 'unknown'] ||= { id: r.dimensions?.provider || 'unknown', requests: 0, errors: 0, cached: 0, usd: 0 }); p.requests += n(r.count); p.errors += n(r.sum?.erroredRequests); p.cached += n(r.sum?.cachedRequests); p.usd += n(r.sum?.cost); }

  // ---- month projection (this calendar month, UTC)
  const t = new Date(now); const month = t.toISOString().slice(0, 7);
  const dom = t.getUTCDate(); const dim = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  const mtdDays = byDay.filter((x) => x.day.startsWith(month));
  const mtd = mtdDays.reduce((s, x) => s + x.usd, 0);
  const sp = a.spend || null;
  const projection = { month, dayOfMonth: dom, daysInMonth: dim, mtdUsd: mtd, projectedUsd: dom ? (mtd / dom) * dim : null, daysCovered: mtdDays.length,
    workerMonthUsd: sp?.monthUsd ?? null, ceilingUsd: sp?.maxMonthlyUsd ?? null, thirdPartyMonthUsd: sp?.thirdParty?.monthUsd ?? null };

  // ---- free-tier headroom
  const today = byDay.at(-1);
  const req24 = cf.traffic?.last24h?.requests;
  const headroom = [
    { k: 'neurons-day', label: 'Workers AI היום, מתוך המכסה החינמית', used: sp?.dayNeurons ?? today?.neurons ?? null, limit: FREE_NEURONS_PER_DAY, unit: 'נוירונים',
      note: 'מעל 10,000 ביום כל 1,000 נוירונים עולים $0.011.', source: sp ? 'ספר ההוצאות של העובד (/api/admin/spend)' : 'Cloudflare Analytics' },
    sp?.limits?.billablePerMonth ? { k: 'neurons-month', label: 'נוירונים בתשלום החודש, מתוך תקרת הגיבוי של העובד', used: sp.monthNeurons, limit: sp.limits.billablePerMonth, unit: 'נוירונים',
      note: sp.maxMonthlyUsd ? `התקרה שווה ל-$${sp.maxMonthlyUsd} בחודש. בהגעה אליה העובד מפסיק לקרוא למודלים.` : null, source: '/api/admin/spend' } : null,
    sp?.thirdParty?.monthCeilingUsd ? { k: 'third-party', label: 'ספקים חיצוניים החודש, מתוך התקרה', used: sp.thirdParty.monthUsd, limit: sp.thirdParty.monthCeilingUsd, unit: '$',
      note: `תקרה יומית $${sp.thirdParty.dayCeilingUsd}, היום $${n(sp.thirdParty.dayUsd).toFixed(2)}.`, source: '/api/admin/spend (thirdParty)' } : null,
    Number.isFinite(req24) ? { k: 'requests', label: 'בקשות ל-Worker (קצב חודשי לפי 24 השעות האחרונות)', used: req24 * 30, limit: PAID_REQUESTS_PER_MONTH, unit: 'בקשות',
      note: `${req24.toLocaleString('he-IL')} בקשות ב-24 שעות. החשבון עובר 10,000 נוירונים ביום, וזה אפשרי רק ב-Workers Paid, שכולל 10 מיליון בקשות בחודש.`, source: 'Cloudflare Analytics (workersInvocationsAdaptive)' } : null,
    arr(cf.d1)[0]?.sizeBytes ? { k: 'd1', label: `מסד D1 (${cf.d1[0].name})`, used: cf.d1[0].sizeBytes, limit: D1_FREE_BYTES, unit: 'bytes', note: '5GB אחסון כלולים בחינם.', source: 'Cloudflare D1 API' } : null,
    sb?.dbSizeBytes ? { k: 'supabase-db', label: 'מסד Supabase', used: sb.dbSizeBytes, limit: FREE_DB_BYTES, unit: 'bytes', note: `תוכנית ${sb.org?.plan || 'לא ידועה'}: 500MB למסד.`, source: 'Supabase Management API' } : null,
    groqProbe?.limits?.requestsPerDay ? { k: 'groq', label: 'Groq היום (מהבדיקה האחרונה בדף Groq)', used: groqProbe.limits.requestsPerDay - n(groqProbe.limits.requestsLeft), limit: groqProbe.limits.requestsPerDay, unit: 'בקשות',
      note: `נמדד ${groqProbe.at}.`, source: 'כותרות x-ratelimit של Groq' } : null,
  ].filter(Boolean).map((h) => ({ ...h, frac: h.limit ? n(h.used) / h.limit : null }));

  return { days: DAYS, totals, byModel, topModels: top, byDay, runs: runList.slice(0, 15), runsSeen: runList.length, callsSeen: calls.length, cache,
    providers: Object.values(providers).sort((p, q) => q.requests - p.requests), projection, headroom };
}

const NO_SOURCE = [
  { k: 'hf', name: 'Hugging Face Inference', why: 'ה-API של Hugging Face לא חושף צריכת קרדיטים של Inference. אין מקור לקרוא ממנו.', missing: 'API לשימוש ב-Inference' },
  { k: 'assemblyai', name: 'AssemblyAI', why: 'אין מפתח AssemblyAI ב-.env, ולכן אין דרך לקרוא את השימוש. הוצאה על ספקים חיצוניים שהעובד רושם מופיעה למעלה.', missing: 'ASSEMBLYAI_API_KEY' },
  { k: 'stripe', name: 'Stripe (test)', why: 'אין STRIPE_SECRET_KEY ב-.env, והעובד עונה על billing-reconcile ב-503 ("billing is not configured").', missing: 'STRIPE_SECRET_KEY' },
  { k: 'groq', name: 'Groq', why: 'ל-Groq אין API של שימוש או חיוב. אפשר לראות רק את המכסה, מהכותרות של בדיקה ידנית בדף Groq.', missing: 'API לשימוש של Groq' },
];

export function costs() {
  return cached('costs', async () => {
    const now = Date.now();
    const haveCf = Boolean(process.env.CLOUDFLARE_API_TOKEN && process.env.CLOUDFLARE_ACCOUNT_ID);
    const haveAdmin = Boolean(process.env.GOLEM_ADMIN_KEY);
    const [usage, logs, ap, cf, sb] = await Promise.all([
      haveCf ? section(() => cfUsage(now)) : { error: 'חסרים CLOUDFLARE_API_TOKEN או CLOUDFLARE_ACCOUNT_ID' },
      haveAdmin ? section(modelCalls) : { error: 'חסר GOLEM_ADMIN_KEY' },
      apple().catch(() => null), cloudflare().catch(() => null), supabase().catch(() => null)]);
    if (usage.error && logs.error) return fail(usage.error, { errors: { cloudflare: usage.error, worker: logs.error } });
    const a = ap?.ok ? ap : {};
    const out = derive({ ai: usage.value?.ai, gw: usage.value?.gw, calls: arr(logs.value?.events), a, cf: cf?.ok ? cf : {}, groqProbe: groq.probeState?.().probe ?? null,
      sb: sb?.ok ? sb : null, now });
    const noSource = [...NO_SOURCE];
    if (usage.error) noSource.unshift({ k: 'cloudflare', name: 'Workers AI ו-AI Gateway', why: usage.error, missing: 'Cloudflare Analytics' });
    if (logs.error) noSource.push({ k: 'runs', name: 'עלות לפי הרצה', why: logs.error, missing: '/api/admin/logs' });
    return ok({
      ...out, noSource,
      spend: a.spend || null, routing: arr(a.routing).filter((r) => r.inPer1M != null || r.outPer1M != null),
      window: a.window || null, logRetained: logs.value ? { retained: logs.value.retained ?? null, truncated: Boolean(logs.value.truncated) } : null,
      errors: Object.fromEntries(Object.entries({ cloudflare: usage.error, worker: logs.error, apple: ap?.ok === false ? ap.reason : null }).filter(([, v]) => v)),
      sources: ['Cloudflare GraphQL: aiInferenceAdaptiveGroups, aiGatewayRequestsAdaptiveGroups', '/api/admin/spend, /api/admin/analytics (דרך דף Apple)', `/api/admin/logs?kind=model_call&days=${DAYS}`],
    });
  }, 5 * 60000);
}
