// Groq: which models the key can call (GET /openai/v1/models is free and has no side effects), and a
// live latency probe. The probe is a one-token chat completion (~73 tokens, about $0.000006) and is
// the only Groq call that returns the rate-limit headers and a usage block. It is a guarded action
// (POST groq/action {kind:'probe'}), not part of the GET, because pulse polls the GET in the background
// all day; the module itself refuses to send more than one probe per 60 seconds.
import { fetchJson, cached, ok, fail, UpstreamError, reasonFor } from '../http.mjs';

const API = 'https://api.groq.com/openai/v1';
const LABEL = 'Groq';
export const PROBE_MODEL = 'openai/gpt-oss-20b'; // measured 2026-09-23: in the key's list, cheapest general text model
export const PROBE_EVERY_MS = 60000;
const PROBE_BODY = { model: PROBE_MODEL, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }] };
const HISTORY = 60;

const auth = () => ({ authorization: `Bearer ${process.env.GROQ_API_KEY}` });
const num = (v) => { const n = Number(v); return v != null && v !== '' && Number.isFinite(n) ? n : null; };
const perM = (v) => { const n = num(v); return n == null ? null : Math.round(n * 1e6 * 1000) / 1000; };

// Groq reset durations: "1m26.4s", "547ms", "2h3m1s", "7.66s" → seconds.
export function durSec(s) {
  const t = String(s ?? '').trim(); if (!t) return null;
  let total = 0, any = false;
  for (const [, v, u] of t.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) { any = true; total += Number(v) * { h: 3600, m: 60, s: 1, ms: 0.001 }[u]; }
  return any ? Math.round(total * 1000) / 1000 : null;
}
// Per Groq's docs, the *-requests pair counts requests per day and the *-tokens pair tokens per minute.
export function parseLimits(h) {
  const g = (k) => h?.get?.(`x-ratelimit-${k}`);
  const out = { requestsPerDay: num(g('limit-requests')), requestsLeft: num(g('remaining-requests')), requestsResetSec: durSec(g('reset-requests')),
    tokensPerMin: num(g('limit-tokens')), tokensLeft: num(g('remaining-tokens')), tokensResetSec: durSec(g('reset-tokens')) };
  return Object.values(out).some((v) => v != null) ? out : null;
}

// ---- probe state (module-level, so the throttle holds however the probe is reached) -------------
let lastAt = 0; let last = null; const history = [];
export const probeState = () => ({ probe: last, history: history.slice(), nextProbeInSec: lastAt ? Math.max(0, Math.ceil((lastAt + PROBE_EVERY_MS - Date.now()) / 1000)) : 0 });
export function resetProbe() { lastAt = 0; last = null; history.length = 0; } // tests only

async function probe() {
  const t0 = performance.now(); const at = new Date().toISOString();
  try {
    const r = await fetchJson(`${API}/chat/completions`, { label: LABEL, what: 'בדיקת זמן תגובה', method: 'POST', headers: auth(), body: PROBE_BODY, raw: true });
    const ms = Math.round(performance.now() - t0);
    const text = await r.text(); let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    const limits = parseLimits(r.headers);
    if (!r.ok) throw Object.assign(new UpstreamError(r.status, reasonFor(LABEL, r.status, 'בדיקת זמן תגובה')), { limits });
    const u = j?.usage || {};
    const sec = (v) => { const n = num(v); return n == null ? null : Math.round(n * 1000 * 10) / 10; };
    return { ok: true, at, model: typeof j?.model === 'string' ? j.model.slice(0, 80) : PROBE_MODEL, ms,
      serverMs: sec(u.total_time), queueMs: sec(u.queue_time), promptMs: sec(u.prompt_time),
      tokens: { prompt: num(u.prompt_tokens), completion: num(u.completion_tokens), total: num(u.total_tokens) },
      region: String(r.headers.get('x-groq-region') || '').slice(0, 40) || null,
      tier: typeof j?.service_tier === 'string' ? j.service_tier.slice(0, 20) : null, limits };
  } catch (e) {
    return { ok: false, at, model: PROBE_MODEL, ms: null, status: typeof e?.status === 'number' ? e.status : null, reason: e?.reason || 'הבדיקה נכשלה', limits: e?.limits ?? null };
  }
}

export async function groqAction({ kind, dryRun } = {}) {
  if (kind !== 'probe') return fail('פעולה לא מוכרת');
  if (dryRun === true) return ok({ dryRun: true, plan: { method: 'POST', url: `${API}/chat/completions`, body: PROBE_BODY } });
  if (!process.env.GROQ_API_KEY) return fail('חסר GROQ_API_KEY בקובץ ‎.env', { configured: false, need: ['GROQ_API_KEY'] });
  if (Date.now() - lastAt < PROBE_EVERY_MS) return ok({ throttled: true, ...probeState() });
  lastAt = Date.now(); // claimed before the await so two concurrent calls cannot both send
  last = await probe();
  history.push({ at: last.at, ms: last.ms, serverMs: last.serverMs ?? null, ok: last.ok });
  if (history.length > HISTORY) history.shift();
  return last.ok ? ok({ throttled: false, ...probeState() }) : fail(last.reason, { throttled: false, ...probeState() });
}

/** 2–4 conclusions, each with the measurement it rests on. */
export function groqInsights(p) {
  const out = []; const add = (tone, text, basis) => out.push({ tone, text, basis });
  if (!p?.configured) { add('warn', 'אין מפתח Groq בשרת, אז אין כאן שום מדידה.', 'GROQ_API_KEY לא מוגדר'); return out; }
  if (p.error) add('bad', `המפתח לא עובד כרגע: ${p.error}.`, 'GET /openai/v1/models נכשל');
  else {
    const act = (p.models || []).filter((m) => m.active);
    const chat = act.filter((m) => m.input?.includes('text') && m.output?.includes('text') && m.pricing?.in != null && m.context >= 8192);
    const cheap = chat.slice().sort((a, b) => a.pricing.in - b.pricing.in)[0];
    const big = act.slice().sort((a, b) => (b.context || 0) - (a.context || 0))[0];
    add('good', `המפתח עובד: ${act.length} מודלים פעילים.${cheap ? ` הזול ביותר לצ'אט הוא ${cheap.name || cheap.id} ($${cheap.pricing.in} למיליון טוקנים נכנסים)` : ''}${big ? `, ההקשר הגדול ביותר ${Math.round(big.context / 1024)}K טוקנים.` : '.'}`, 'רשימת המודלים והמחירים מה-API');
  }
  const pr = p.probe;
  if (!pr) add('info', 'זמן התגובה עוד לא נמדד: הבדיקה רצה פעם בדקה כל עוד הדף פתוח.', 'אין עדיין בדיקה');
  else if (!pr.ok) add('bad', `בדיקת זמן התגובה האחרונה נכשלה: ${pr.reason}.`, `ניסיון ב-${pr.at}`);
  else {
    const ok_ = (p.history || []).filter((h) => h.ok && h.ms != null).map((h) => h.ms).sort((a, b) => a - b);
    const med = ok_.length ? ok_[Math.floor(ok_.length / 2)] : pr.ms;
    const net = pr.serverMs != null ? pr.ms - Math.round(pr.serverMs) : null;
    add(pr.ms < 1500 ? 'good' : 'warn', `תשובה ב-${pr.ms}ms${pr.serverMs != null ? `, מתוכם ${pr.serverMs}ms עבודה אצל Groq` : ''}${net != null && net > pr.ms / 2 ? ': רוב הזמן הוא הדרך ברשת, לא המודל' : ''}.${ok_.length > 1 ? ` חציון ${ok_.length} בדיקות: ${med}ms.` : ''}`, `בדיקה אחרונה ${pr.at}, מודל ${pr.model}`);
  }
  const l = pr?.limits;
  if (l?.requestsPerDay && l.requestsLeft != null) {
    const used = l.requestsPerDay - l.requestsLeft; const pct = Math.round((l.requestsLeft / l.requestsPerDay) * 100);
    add(pct < 20 ? 'warn' : 'good', `נשארו ${l.requestsLeft} מתוך ${l.requestsPerDay} בקשות ליום (${pct}%) ו-${l.tokensLeft ?? '—'} מתוך ${l.tokensPerMin ?? '—'} טוקנים לדקה${used > 1 ? `; ${used} בקשות כבר נוצלו בחלון הנוכחי` : ''}.`, 'כותרות x-ratelimit מהבדיקה האחרונה');
  }
  return out.slice(0, 4);
}

function catalog() {
  if (!process.env.GROQ_API_KEY) return Promise.resolve(ok({ configured: false, need: ['GROQ_API_KEY'] }));
  return cached('groq', async () => {
    try {
      const j = await fetchJson(`${API}/models`, { label: LABEL, what: 'רשימת המודלים', headers: auth() });
      const models = (Array.isArray(j?.data) ? j.data : []).map((m) => ({ id: String(m.id), name: typeof m.name === 'string' ? m.name.slice(0, 80) : null,
        owner: m.owned_by ?? null, active: m.active !== false, context: m.context_window ?? null, maxOut: m.max_completion_tokens ?? null, created: m.created ?? null,
        input: Array.isArray(m.input_modalities) ? m.input_modalities.map(String) : [], output: Array.isArray(m.output_modalities) ? m.output_modalities.map(String) : [],
        features: Array.isArray(m.supported_features) ? m.supported_features.map(String) : [],
        pricing: m.pricing ? { in: perM(m.pricing.prompt), out: perM(m.pricing.completion), cached: perM(m.pricing.input_cache_read) } : null }))
        .sort((a, b) => (b.context || 0) - (a.context || 0));
      return ok({ configured: true, key: 'valid', models });
    } catch (e) { return fail(e?.reason || 'Groq לא זמין', { configured: true, key: e?.status === 401 ? 'invalid' : 'unknown' }); }
  }, 300000);
}

// The model list is cached for 5 minutes; the probe fields are read fresh on every call.
export async function groq() {
  const base = await catalog();
  const body = { ...base, ...probeState(), probeModel: PROBE_MODEL, probeEveryMs: PROBE_EVERY_MS };
  return { ...body, conclusions: groqInsights({ ...body, error: base.ok ? null : base.reason }) };
}
