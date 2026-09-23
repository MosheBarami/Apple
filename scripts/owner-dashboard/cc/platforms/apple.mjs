// The product itself: the Apple worker's own admin API (read-only GET routes, X-Admin-Key). Spend,
// model usage, pairing counters and the billing wiring. The kill switch exists upstream but is not
// offered here: one click must never be able to take production down.
import { fetchJson, cached, ok, fail, section } from '../http.mjs';
import { WORKER_URL, workerHealth } from './cloudflare.mjs';

const LABEL = 'Apple';
const base = () => (process.env.API_BASE || WORKER_URL).replace(/\/+$/, '');
const get = (p, what) => fetchJson(`${base()}${p}`, { label: LABEL, what, headers: { 'x-admin-key': process.env.GOLEM_ADMIN_KEY } });

// The analytics Metric objects carry {known, value}; an unknown figure stays null, never zero.
const v = (m) => (m && m.known !== false && Number.isFinite(Number(m.value)) ? Number(m.value) : null);
const rows = (list) => (Array.isArray(list) ? list : []).slice(0, 12).map((r) => ({ key: r.key, calls: r.calls ?? null, usd: v(r.usd), neurons: v(r.neurons) }));

export function apple() {
  if (!process.env.GOLEM_ADMIN_KEY) return Promise.resolve(fail('חסר GOLEM_ADMIN_KEY בקובץ ‎.env'));
  return cached('apple', async () => {
    const [analytics, spend, wiring, stats, health] = await Promise.all([
      section(() => get('/api/admin/analytics?days=7', 'האנליטיקה')),
      section(() => get('/api/admin/spend', 'דו״ח העלויות')),
      section(() => get('/api/admin/billing-wiring', 'חיבור החיובים')),
      section(() => get('/api/admin/stats', 'המונים')),
      workerHealth(),
    ]);
    const errors = Object.fromEntries(Object.entries({ analytics, spend, wiring, stats }).filter(([, s]) => s.error).map(([k, s]) => [k, s.error]));
    if (Object.keys(errors).length === 4) return fail(analytics.error, { errors, health });
    const a = analytics.value || {}, s = spend.value || {}, w = wiring.value || {};
    const counters = {};
    for (const c of stats.value?.counters || []) (counters[c.key] ||= {})[c.day] = Number(c.value) || 0;
    return ok({
      health,
      window: a.window ? { events: a.window.events ?? null, fromMs: a.window.fromMs ?? null, toMs: a.window.toMs ?? null, complete: Boolean(a.window.complete) } : null,
      counts: a.counts || null,
      cost: a.cost ? { calls: a.cost.calls ?? null, usd: v(a.cost.usd), neurons: v(a.cost.neurons), byModel: rows(a.cost.byModel), byFeature: rows(a.cost.byFeature) } : null,
      tokens: a.tokens ? { input: v(a.tokens.input), output: v(a.tokens.output), cached: v(a.tokens.cachedInput), total: v(a.tokens.total), cacheHit: v(a.tokens.cacheHitRate) } : null,
      latency: a.latency ? Object.fromEntries(['model', 'request', 'build'].map((k) => [k, a.latency[k]
        ? { p50: v(a.latency[k].p50), p95: v(a.latency[k].p95), samples: a.latency[k].samples ?? 0 } : null])) : null,
      success: a.success ? Object.fromEntries(Object.entries(a.success).map(([k, x]) => [k, { total: x.total ?? 0, failed: x.failed ?? 0, rate: v(x.rate) }])) : null,
      errorsByKind: (a.errors?.byKind || []).map((e) => ({ key: e.key, count: e.count })),
      features: (a.features?.rows || []).slice(0, 10).map((f) => ({ feature: f.feature, events: f.events, lastAt: f.lastAt ?? null })),
      spend: s.state ? {
        day: s.state.day, dayNeurons: s.state.dayNeurons ?? null, monthNeurons: s.state.monthBillableNeurons ?? null, killed: Boolean(s.state.killed),
        dayRemaining: s.state.dayRemainingFraction ?? null, monthUsd: s.state.estimatedMonthUsd ?? null, maxMonthlyUsd: s.maxMonthlyUsd ?? null,
        thirdParty: s.state.thirdParty ? { dayUsd: s.state.thirdParty.dayUsd, monthUsd: s.state.thirdParty.monthUsd, dayCeilingUsd: s.state.thirdParty.dayCeilingUsd, monthCeilingUsd: s.state.thirdParty.monthCeilingUsd } : null,
        limits: s.limits ? { billablePerDay: s.limits.billableNeuronsPerDay, freePerDay: s.limits.freeNeuronsPerDay, billablePerMonth: s.limits.billableNeuronsPerMonth } : null,
        days: (s.days || []).map((d) => ({ day: d.day, neurons: d.neurons ?? 0, calls: d.calls ?? 0, usd: d.billableUsd ?? 0 })).reverse(),
      } : null,
      billing: spend.value || wiring.value ? { authority: Boolean(w.isAuthority), webhook: Boolean(w.webhookSecret), keyMode: w.stripeApiKey ?? null,
        production: Boolean(w.production), prices: w.priceIds || null, why: w.why ?? null } : null,
      counters,
      errors,
    });
  });
}
