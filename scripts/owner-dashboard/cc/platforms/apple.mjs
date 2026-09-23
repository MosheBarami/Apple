// The product itself: the Apple worker's own admin API (read-only GET routes, X-Admin-Key). Spend,
// model usage and mix, builds and errors from the event log, distinct actors, pairing counters, the
// billing wiring, the corpus, and the deployed build compared with git HEAD. No write route is called
// or offered: the kill switch, credit grants, plan changes and quota or spend resets exist upstream and
// are deliberately absent. Figures no route exposes are listed in `notExposed`, never shown as zero.
// Per-user fields (actorId, projectId, emails, messages) are counted or dropped, never forwarded.
import fs from 'node:fs';
import path from 'node:path';
import { fetchJson, cached, uncache, ok, fail, section, run as exec, REPO } from '../http.mjs';
import { WORKER_URL, workerHealth } from './cloudflare.mjs';

const LABEL = 'Apple';
const base = () => (process.env.API_BASE || WORKER_URL).replace(/\/+$/, '');
const get = (p, what) => fetchJson(`${base()}${p}`, { label: LABEL, what, headers: { 'x-admin-key': process.env.GOLEM_ADMIN_KEY } });
const arr = (x) => (Array.isArray(x) ? x : []);
const num = (x) => (Number.isFinite(Number(x)) && x !== null && x !== '' && typeof x !== 'boolean' ? Number(x) : null);

// The analytics Metric objects carry {known, value}; an unknown figure stays null, never zero.
const v = (m) => (m && m.known !== false && Number.isFinite(Number(m.value)) ? Number(m.value) : null);
const rows = (list) => arr(list).slice(0, 12).map((r) => ({ key: r.key, calls: r.calls ?? null, usd: v(r.usd), neurons: v(r.neurons) }));
// A route path can carry an id: keep the shape, drop the value.
const scopeOf = (s) => (typeof s === 'string' ? s.replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ':id').replace(/\/\d{3,}/g, '/:n').slice(0, 80) : null);
const SHA = /^[0-9a-f]{7,40}$/;

// The deployed build (/api/health buildSha, "-dirty" = deployed from an uncommitted tree) against HEAD.
async function deployed(health) {
  const raw = typeof health?.buildSha === 'string' ? health.buildSha : null;
  const sha = raw ? raw.replace(/-dirty$/, '') : null;
  const out = { buildSha: raw, sha: sha && SHA.test(sha) ? sha : null, dirty: raw ? raw.endsWith('-dirty') : null, head: null,
    known: false, behind: null, workerBehind: null, deployedAt: null, isHead: null };
  try { out.head = String(await exec('git', ['rev-parse', '--short', 'HEAD'])).trim() || null; } catch { return out; }
  if (!out.sha) return out;
  try {
    await exec('git', ['cat-file', '-e', `${out.sha}^{commit}`]);
    out.known = true;
    const [all, worker, at] = await Promise.all([
      exec('git', ['rev-list', '--count', `${out.sha}..HEAD`]),
      exec('git', ['rev-list', '--count', `${out.sha}..HEAD`, '--', 'apps/worker']),
      exec('git', ['show', '-s', '--format=%cI', out.sha])]);
    out.behind = num(String(all).trim()); out.workerBehind = num(String(worker).trim()); out.deployedAt = String(at).trim() || null;
    out.isHead = out.behind === 0;
  } catch { /* a sha this clone does not have: known stays false */ }
  return out;
}

// Gauntlet rounds live in the repo (docs/gauntlet/visual/rounds/round-N-*), not behind any route.
function gauntlet() {
  const dir = path.join(REPO, 'docs', 'gauntlet', 'visual', 'rounds');
  try {
    const n = new Set(fs.readdirSync(dir).map((f) => /^round-(\d+)/.exec(f)?.[1]).filter(Boolean).map(Number));
    return { rounds: n.size, last: n.size ? Math.max(...n) : null, source: 'docs/gauntlet/visual/rounds' };
  } catch { return null; }
}

// The static asset table: counts only (the list is ~6k rows of paths; no bytes are exposed).
function staticList() {
  return cached('apple:static', async () => {
    const s = await section(() => get('/api/admin/static-list', 'רשימת הקבצים הסטטיים'));
    if (s.error) return { error: s.error };
    const list = arr(s.value);
    const at = list.map((x) => num(x?.updated_at)).filter((x) => x != null);
    const types = {};
    for (const x of list) { const t = String(x?.content_type || 'אחר').split(';')[0]; types[t] = (types[t] || 0) + 1; }
    return { files: list.length, chunks: list.reduce((a, x) => a + (num(x?.n_chunks) || 0), 0), immutable: list.filter((x) => x?.immutable).length,
      lastAt: at.length ? Math.max(...at) : null, types: Object.entries(types).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([key, count]) => ({ key, count })) };
  }, 600000);
}

export const NOT_EXPOSED = [
  { k: 'credits', title: 'סך הקרדיטים של כל המשתמשים', why: 'יש רק /api/admin/account/:userId, קרדיטים של משתמש אחד בכל פעם.' },
  { k: 'users', title: 'משתמשים פעילים לאורך זמן', why: 'אין נתיב של משתמשים פעילים. המספר כאן נספר מהלוג, שמכיל רק את 5,000 האירועים האחרונים.' },
  { k: 'd1', title: 'גודל מסד D1', why: 'אף נתיב אדמין לא מחזיר אותו. הגודל מופיע בדף Cloudflare, מה-API של Cloudflare.' },
  { k: 'r2', title: 'גודל R2', why: 'אף נתיב אדמין לא מחזיר את נפח הקבצים. static-list נותן רק מספר קבצים ו-chunks.' },
  { k: 'gauntlet', title: 'סבבי ה-gauntlet', why: 'לא נשמרים בעובד. המספר כאן נספר מהתיקייה docs/gauntlet/visual/rounds בריפו.' },
];

export function apple() {
  if (!process.env.GOLEM_ADMIN_KEY) return Promise.resolve(ok({ configured: false, need: ['GOLEM_ADMIN_KEY'], notExposed: NOT_EXPOSED }));
  return cached('apple', async () => {
    const [analytics, spend, wiring, stats, builds, errLog, calls, models, routing, census, product, health, st] = await Promise.all([
      section(() => get('/api/admin/analytics?days=7', 'האנליטיקה')),
      section(() => get('/api/admin/spend', 'דו״ח העלויות')),
      section(() => get('/api/admin/billing-wiring', 'חיבור החיובים')),
      section(() => get('/api/admin/stats', 'המונים')),
      section(() => get('/api/admin/logs?kind=build&days=30&limit=200', 'יומן הבניות')),
      section(() => get('/api/admin/logs?kind=error&days=7&limit=100', 'יומן השגיאות')),
      section(() => get('/api/admin/logs?kind=model_call&days=7&limit=1000', 'יומן הקריאות למודל')),
      section(() => get('/api/admin/models', 'הגדרות המודלים')),
      section(() => get('/api/admin/model-routing', 'ניתוב המודלים')),
      section(() => get('/api/admin/corpus-census', 'מפקד הקורפוס')),
      section(() => get('/api/admin/product-analytics', 'אנליטיקת המוצר')),
      workerHealth(),
      staticList(),
    ]);
    const main = { analytics, spend, wiring, stats };
    const errors = Object.fromEntries(Object.entries({ ...main, builds, errLog, calls, models, routing, census }).filter(([, s]) => s.error).map(([k, s]) => [k, s.error]));
    if (st?.error) errors.static = st.error;
    if (Object.values(main).every((s) => s.error)) return fail(analytics.error, { errors, health });
    const a = analytics.value || {}, s = spend.value || {}, w = wiring.value || {};
    const counters = {};
    for (const c of arr(stats.value?.counters)) if (c && typeof c.key === 'string') (counters[c.key] ||= {})[c.day] = Number(c.value) || 0;

    const buildEv = arr(builds.value?.events).filter((e) => e && typeof e === 'object');
    const callEv = arr(calls.value?.events).filter((e) => e && typeof e === 'object');
    const actorIds = new Set([...buildEv, ...callEv].map((e) => e.actorId).filter((x) => typeof x === 'string' && x));
    const day = (at) => (num(at) != null ? new Date(num(at)).toISOString().slice(0, 10) : null);
    const byDay = {};
    for (const e of [...buildEv, ...callEv]) if (typeof e.actorId === 'string') { const d = day(e.at); if (d) (byDay[d] ||= new Set()).add(e.actorId); }

    // Model mix: the spend ledger (by day, model and kind) is the longest record; the log window is short.
    const mix = {}, kinds = {};
    for (const b of arr(s.breakdown)) {
      if (!b || typeof b.model !== 'string') continue;
      const m = (mix[b.model] ||= { model: b.model, neurons: 0, calls: 0, usd: 0 });
      m.neurons += num(b.neurons) || 0; m.calls += num(b.calls) || 0; m.usd += num(b.usd) || 0;
      const k = (kinds[b.kind] ||= { key: String(b.kind ?? 'אחר'), neurons: 0, calls: 0, usd: 0 });
      k.neurons += num(b.neurons) || 0; k.calls += num(b.calls) || 0; k.usd += num(b.usd) || 0;
    }
    const mixList = Object.values(mix).sort((x, y) => y.neurons - x.neurons);
    const totalN = mixList.reduce((t, m) => t + m.neurons, 0);
    const spendDays = arr(s.days).map((d) => d?.day).filter(Boolean).sort();

    const version = await deployed(health);
    const aud = a.audit || {};
    const out = ok({
      configured: true,
      health,
      version,
      window: a.window ? { events: a.window.events ?? null, fromMs: a.window.fromMs ?? null, toMs: a.window.toMs ?? null, complete: Boolean(a.window.complete),
        hours: num(a.window.toMs) != null && num(a.window.fromMs) != null ? (a.window.toMs - a.window.fromMs) / 3600e3 : null } : null,
      counts: a.counts || null,
      cost: a.cost ? { calls: a.cost.calls ?? null, usd: v(a.cost.usd), neurons: v(a.cost.neurons), byModel: rows(a.cost.byModel), byFeature: rows(a.cost.byFeature) } : null,
      tokens: a.tokens ? { input: v(a.tokens.input), output: v(a.tokens.output), cached: v(a.tokens.cachedInput), total: v(a.tokens.total), cacheHit: v(a.tokens.cacheHitRate) } : null,
      latency: a.latency ? Object.fromEntries(['model', 'request', 'build'].map((k) => [k, a.latency[k]
        ? { p50: v(a.latency[k].p50), p95: v(a.latency[k].p95), samples: a.latency[k].samples ?? 0 } : null])) : null,
      success: a.success ? Object.fromEntries(Object.entries(a.success).map(([k, x]) => [k, { total: x?.total ?? 0, failed: x?.failed ?? 0, rate: v(x?.rate) }])) : null,
      errorsByKind: arr(a.errors?.byKind).map((e) => ({ key: e.key, count: e.count })),
      errorsByScope: arr(a.errors?.byScope).slice(0, 8).map((e) => ({ key: scopeOf(e.key), count: e.count })),
      features: arr(a.features?.rows).slice(0, 10).map((f) => ({ feature: scopeOf(f.feature), events: f.events, lastAt: f.lastAt ?? null })),
      audit: a.audit ? { total: num(aud.total), refused: num(aud.refused), byAction: arr(aud.byAction).slice(0, 6).map((x) => ({ key: scopeOf(x.key), count: num(x.count) })) } : null,
      spend: s.state ? {
        day: s.state.day, dayNeurons: s.state.dayNeurons ?? null, monthNeurons: s.state.monthBillableNeurons ?? null, killed: Boolean(s.state.killed),
        dayRemaining: s.state.dayRemainingFraction ?? null, monthUsd: s.state.estimatedMonthUsd ?? null, maxMonthlyUsd: s.maxMonthlyUsd ?? null,
        thirdParty: s.state.thirdParty ? { dayUsd: s.state.thirdParty.dayUsd, monthUsd: s.state.thirdParty.monthUsd, dayCeilingUsd: s.state.thirdParty.dayCeilingUsd, monthCeilingUsd: s.state.thirdParty.monthCeilingUsd } : null,
        limits: s.limits ? { billablePerDay: s.limits.billableNeuronsPerDay, freePerDay: s.limits.freeNeuronsPerDay, billablePerMonth: s.limits.billableNeuronsPerMonth } : null,
        days: arr(s.days).map((d) => ({ day: d.day, neurons: d.neurons ?? 0, calls: d.calls ?? 0, usd: d.billableUsd ?? 0 })).reverse(),
      } : null,
      modelMix: mixList.length ? { from: spendDays[0] ?? null, to: spendDays.at(-1) ?? null, totalNeurons: totalN,
        models: mixList.map((m) => ({ ...m, share: totalN ? m.neurons / totalN : null })),
        kinds: Object.values(kinds).sort((x, y) => y.neurons - x.neurons).slice(0, 8) } : null,
      builds: builds.value ? { retained: num(builds.value.retained) ?? buildEv.length,
        recent: buildEv.slice().sort((x, y) => (num(y.at) || 0) - (num(x.at) || 0)).slice(0, 10).map((e) => ({
          k: typeof e.runId === 'string' ? e.runId.slice(0, 8) : String(num(e.at) ?? ''), at: num(e.at), outcome: typeof e.outcome === 'string' ? e.outcome : null,
          steps: num(e.steps), opsApplied: num(e.opsApplied), opsFailed: num(e.opsFailed), durationMs: num(e.durationMs), neurons: num(e.neurons),
          finishReason: typeof e.finishReason === 'string' ? e.finishReason : null })) } : null,
      errorLog: errLog.value ? { retained: num(errLog.value.retained) ?? 0,
        recent: arr(errLog.value.events).filter((e) => e && typeof e === 'object').sort((x, y) => (num(y.at) || 0) - (num(x.at) || 0)).slice(0, 10)
          .map((e, i) => ({ k: `${num(e.at) ?? i}-${i}`, at: num(e.at), scope: scopeOf(e.scope), kind: typeof e.errorKind === 'string' ? e.errorKind : null, fatal: Boolean(e.fatal) })) } : null,
      actors: builds.value || calls.value ? { distinct: actorIds.size, days: Object.entries(byDay).sort().map(([d, set]) => ({ day: d, actors: set.size })),
        source: 'build + model_call', truncated: Boolean(calls.value?.truncated) && num(calls.value?.retained) > callEv.length } : null,
      models: models.value && typeof models.value === 'object' && !Array.isArray(models.value)
        ? Object.entries(models.value).filter(([, m]) => m && typeof m.id === 'string').map(([role, m]) => ({ role, id: m.id, maxTokens: num(m.maxTokens), tools: Boolean(m.nativeTools) })) : null,
      routing: routing.value ? arr(routing.value.models).map((m) => ({ id: m.id, label: m.label ?? m.id, provider: m.provider ?? null, available: m.available !== false,
        tools: Boolean(m.supportsTools), vision: Boolean(m.supportsVision), inPer1M: num(m.inputCostPer1M), outPer1M: num(m.outputCostPer1M) })) : null,
      corpus: census.value && census.value.known !== false ? { chunks: num(census.value.chunks), embedded: num(census.value.embedded) } : null,
      static: st && !st.error ? st : null,
      product: product.value ? { configured: product.value.configured !== false, why: typeof product.value.why === 'string' ? product.value.why.slice(0, 160) : null } : null,
      gauntlet: gauntlet(),
      // Only the worker's enums pass: a changed upstream shape can never forward a key or a price id.
      billing: spend.value || wiring.value ? { authority: Boolean(w.isAuthority), webhook: Boolean(w.webhookSecret),
        keyMode: ['absent', 'test', 'live'].includes(w.stripeApiKey) ? w.stripeApiKey : null, production: Boolean(w.production),
        prices: w.priceIds && typeof w.priceIds === 'object' ? Object.fromEntries(Object.entries(w.priceIds).slice(0, 6).map(([k, x]) => [String(k).slice(0, 24), Boolean(x)])) : null,
        why: typeof w.why === 'string' && /^[a-z_]{1,64}$/.test(w.why) ? w.why : null } : null,
      counters,
      errors,
      notExposed: NOT_EXPOSED,
    });
    out.conclusions = appleConclusions(out);
    return out;
  }, 60000);
}

// ---------------------------------------------------------------- conclusions (pure)
const usd = (x) => `$${Number(x).toFixed(2)}`;
const pct = (x) => `${Math.round(x * 100)}%`;
/**
 * 2 to 4 Hebrew conclusions about the product's live state, most urgent first.
 * @returns {{k:string, tone:'ok'|'warn'|'bad'|'info', title:string, text:string}[]}
 */
export function appleConclusions(d) {
  const out = [];
  const h = d?.health; const sp = d?.spend; const ver = d?.version;
  if (h && h.httpStatus != null && h.httpStatus !== 200) out.push({ k: 'down', tone: 'bad', title: 'האתר לא עונה כמו שצריך', text: `/api/health החזיר ${h.httpStatus}.` });
  else if (h && h.httpStatus == null) out.push({ k: 'down', tone: 'bad', title: 'האתר לא עונה', text: 'אין תשובה מ-/api/health.' });
  if (sp?.killed) out.push({ k: 'killed', tone: 'bad', title: 'מתג החירום של ההוצאה פעיל', text: 'העובד מסרב לקריאות מודל עד שהמתג יכובה. הדף הזה לא מכבה אותו.' });
  else if (sp && Number.isFinite(sp.monthUsd) && sp.maxMonthlyUsd > 0) {
    const f = sp.monthUsd / sp.maxMonthlyUsd;
    out.push({ k: 'spend', tone: f >= 0.8 ? 'warn' : 'ok', title: `הוצאה החודש ${usd(sp.monthUsd)} מתוך תקרה של ${usd(sp.maxMonthlyUsd)} (${pct(f)})`,
      text: Number.isFinite(sp.dayRemaining) ? `נשאר ${pct(Math.max(0, sp.dayRemaining))} מהתקציב היומי.` : 'התקציב היומי לא ידוע.' });
  }
  if (ver?.known && (ver.workerBehind > 0 || ver.dirty)) {
    const bits = [];
    if (ver.workerBehind > 0) bits.push(`${ver.workerBehind} קומיטים ב-apps/worker עוד לא נפרסו`);
    if (ver.dirty) bits.push('הפריסה נעשתה מעץ עם שינויים שלא נשמרו בקומיט');
    out.push({ k: 'version', tone: 'warn', title: `בפרודקשן רץ ${ver.sha}, ה-HEAD הוא ${ver.head}`, text: `${bits.join(', ')}.` });
  } else if (ver?.known) out.push({ k: 'version', tone: 'ok', title: `בפרודקשן רץ ${ver.sha}, כמו הקוד של העובד ב-HEAD`, text: ver.behind ? `${ver.behind} קומיטים מאז, אף אחד מהם לא נוגע ב-apps/worker.` : 'אין קומיטים חדשים מאז הפריסה.' });
  else if (ver?.buildSha) out.push({ k: 'version', tone: 'info', title: `הגרסה שרצה (${ver.buildSha}) לא נמצאת בריפו המקומי`, text: 'אי אפשר לדעת כמה היא מאחורי HEAD.' });
  const req = d?.success?.requests; const mc = d?.success?.modelCalls;
  const errs = d?.errorLog?.retained ?? arr(d?.errorsByKind).reduce((t, e) => t + (e.count || 0), 0);
  if (req?.total) {
    const rate = req.rate ?? (req.total - req.failed) / req.total;
    out.push({ k: 'health', tone: rate < 0.98 || (mc?.failed || 0) > 0 ? 'warn' : 'ok', title: `${rate < 1 && rate >= 0.995 ? (rate * 100).toFixed(1) + '%' : pct(rate)} מהבקשות הצליחו בחלון הלוג`,
      text: `${req.failed} בקשות נכשלו מתוך ${req.total}, ${errs} שגיאות רשומות${mc?.total ? `, ${mc.failed} מתוך ${mc.total} קריאות מודל נכשלו` : ''}.` });
  }
  const win = d?.window;
  if (win && !win.complete && Number.isFinite(win.hours)) {
    const top = arr(d?.audit?.byAction)[0];
    const share = top && win.events ? top.count / win.events : null;
    out.push({ k: 'window', tone: 'info', title: `חלון הלוג מכסה רק ${win.hours < 1 ? `${Math.round(win.hours * 60)} דקות` : `${win.hours.toFixed(1)} שעות`}`,
      text: `העובד שומר את ${win.events} האירועים האחרונים${share != null && share > 0.3 ? `, ו-${pct(share)} מהם הם ${top.key}` : ''}. מספרים מהלוג (בניות, משתמשים, שגיאות) מתייחסים רק לחלון הזה.` });
  }
  if (d?.billing?.production && d.billing.keyMode === 'test') out.push({ k: 'billing', tone: 'warn', title: 'Stripe מחובר במפתח test בפרודקשן', text: 'תשלומים אמיתיים לא ייגבו עד שיוחלף למפתח live.' });
  const rank = { bad: 0, warn: 1, ok: 2, info: 3 };
  return out.map((x, i) => ({ x, i })).sort((p, q) => rank[p.x.tone] - rank[q.x.tone] || p.i - q.i).slice(0, 4).map((p) => p.x);
}

// ---------------------------------------------------------------- actions: read-refresh only
// The only action is dropping this dashboard's own cache so the next read goes to the worker again.
// Every write kind (kill switch, credits, plan, quota, spend) is refused before anything else happens.
export async function appleAction(body = {}) {
  const { kind, dryRun } = body || {};
  if (kind !== 'refresh') return fail('הדף של Apple קורא בלבד. אין בו פעולות כתיבה לעובד.');
  if (dryRun) return ok({ dryRun: true, plan: { method: 'GET', url: `${base()}/api/admin/analytics?days=7`, body: null,
    also: ['/api/admin/spend', '/api/admin/billing-wiring', '/api/admin/stats', '/api/admin/logs', '/api/admin/models', '/api/admin/model-routing',
      '/api/admin/corpus-census', '/api/admin/product-analytics', '/api/admin/static-list', '/api/health'], note: 'קריאה בלבד, בלי שינוי בעובד' } });
  uncache('apple');
  return ok({ note: 'המטמון נוקה. הנתונים ייקראו שוב מהעובד.' });
}
