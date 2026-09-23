// Langflow: the local instance (http://localhost:7860, or LANGFLOW_URL) and the product flows checked
// in at packages/langflow/*.json. Each repo flow is matched to the instance by id, then by name. The
// canvas (nodes, edges, field names) always comes from the repo file, so it shows even when Langflow is
// down; the instance adds its copy's updated_at, whether its code still matches the file, and the runs
// (monitor traces). Versions are the git history of each flow file: Langflow has no flow-version API.
// Down, missing folder or refused auth all come back as a calm state, never an error.
// Auth: LANGFLOW_API_KEY when set; otherwise the local AUTO_LOGIN token, held in memory only.
// The one write is `run`, behind a confirm modal and a dryRun plan; it never forwards the run's key.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, cached, uncache, ok, fail, run as exec } from '../http.mjs';

export const FLOW_DIR = path.join(REPO, 'packages', 'langflow');
const base = () => (process.env.LANGFLOW_URL || 'http://localhost:7860').replace(/\/+$/, '');
const arr = (x) => (Array.isArray(x) ? x : []);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_INPUT = 4000;
// sync.mjs's example input per flow id (the module only runs main() when executed), prefilled in the
// page's run box. Missing or broken sync.mjs: no examples, the box starts empty.
const EXAMPLES = await import(pathToFileURL(path.join(FLOW_DIR, 'sync.mjs')).href)
  .then((m) => Object.fromEntries(arr(m.FLOWS).map((f) => [f.id, JSON.stringify(f.example ?? null)]).filter(([, v]) => v.length <= MAX_INPUT)), () => ({}));

async function call(p, headers = {}, { method = 'GET', body, timeout = 4000 } = {}) {
  const r = await fetch(`${base()}${p}`, { method, headers: { accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(timeout) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j, type: r.headers?.get?.('content-type') || '' };
}

let token = null;
async function authHeaders() {
  if (process.env.LANGFLOW_API_KEY) return { 'x-api-key': process.env.LANGFLOW_API_KEY };
  if (!token) { const a = await call('/api/v1/auto_login'); token = a.status === 200 ? a.json?.access_token || null : null; }
  return token ? { authorization: `Bearer ${token}` } : {};
}

// ---------------------------------------------------------------- canvas from the flow JSON
// A field value is shown only when it is plainly not a secret: numbers and booleans, or a short string
// in a field that is neither marked password nor named like a credential. Everything else is its name.
const SECRETISH = /token|key|secret|password|credential|auth/i;
function fieldOf(name, f) {
  const out = { name, label: f.display_name || name, type: f.type || null };
  const v = f.value;
  if (f.password || SECRETISH.test(name) || SECRETISH.test(out.label)) return out;
  if (typeof v === 'number' || typeof v === 'boolean') out.value = v;
  else if (typeof v === 'string' && v && v.length <= 48 && !v.includes('\n')) out.value = v;
  return out;
}
export function canvasOf(data) {
  const nodes = arr(data?.nodes).map((n) => {
    const c = n?.data?.node || {};
    const tpl = c.template && typeof c.template === 'object' ? c.template : {};
    const order = arr(c.field_order).length ? arr(c.field_order) : Object.keys(tpl);
    const fields = order.filter((k) => tpl[k] && !k.startsWith('_') && tpl[k].type !== 'code' && tpl[k].show !== false && !tpl[k].advanced)
      .slice(0, 4).map((k) => fieldOf(k, tpl[k]));
    return { id: String(n?.id ?? ''), type: String(n?.data?.type ?? n?.type ?? ''), label: c.display_name || n?.data?.type || n?.id,
      icon: c.icon || null, desc: typeof c.description === 'string' ? c.description.slice(0, 160) : null,
      x: Number(n?.position?.x) || 0, y: Number(n?.position?.y) || 0,
      usesModel: Boolean(tpl.model && tpl.model.type !== 'code'),
      fields, outputs: arr(c.outputs).map((o) => ({ name: o.name, label: o.display_name || o.name, types: arr(o.types) })) };
  });
  const edges = arr(data?.edges).map((e) => ({ id: String(e?.id ?? `${e?.source}->${e?.target}`), source: String(e?.source ?? ''), target: String(e?.target ?? ''),
    output: e?.data?.sourceHandle?.name ?? null, field: e?.data?.targetHandle?.fieldName ?? null,
    type: arr(e?.data?.sourceHandle?.output_types)[0] ?? null }));
  return { nodes, edges };
}
const codes = (data) => arr(data?.nodes).map((n) => n?.data?.node?.template?.code?.value ?? n?.data?.type).join('\n');

// Repo flows: Langflow's export format ({ id?, name, description, endpoint_name?, data:{nodes,edges} }),
// at packages/langflow/*.json or packages/langflow/flows/*.json. A file that does not parse is listed
// with its name and `invalid: true` so the owner sees it rather than nothing.
function readRepo() {
  if (!fs.existsSync(FLOW_DIR)) return null;
  const files = [];
  for (const dir of [FLOW_DIR, path.join(FLOW_DIR, 'flows')]) {
    try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) files.push(path.join(dir, f)); } catch {}
  }
  return files.map((full) => {
    const file = path.relative(FLOW_DIR, full), base = path.basename(full, '.json');
    try {
      const j = JSON.parse(fs.readFileSync(full, 'utf8'));
      // Other JSON beside the flows (package.json) is not an export: an export carries `data`.
      if (!j || typeof j.data !== 'object') return null;
      return { file, id: j.id ?? null, name: j.name || base, description: j.description || null, endpoint: j.endpoint_name || null,
        nodes: Array.isArray(j.data?.nodes) ? j.data.nodes.length : null, updatedAt: fs.statSync(full).mtime.toISOString(), data: j.data };
    } catch { return { file, id: null, name: base, description: null, endpoint: null, nodes: null, invalid: true }; }
  }).filter(Boolean);
}
export function repoFlows() {
  const r = readRepo();
  return r && r.map(({ data, ...f }) => f);
}

// Git history of the flow files: one `git log` for all of them, plus which ones have uncommitted edits.
async function versions() {
  const rel = path.relative(REPO, FLOW_DIR);
  const out = {};
  try {
    const log = await exec('git', ['log', '-n', '60', '--format=@@%h%x09%cI%x09%s', '--name-only', '--', rel]);
    let cur = null;
    for (const line of String(log).split('\n')) {
      if (line.startsWith('@@')) { const [sha, at, ...s] = line.slice(2).split('\t'); cur = { sha, at, subject: s.join('\t').slice(0, 140) }; continue; }
      if (!cur || !line.trim()) continue;
      const f = path.relative(FLOW_DIR, path.join(REPO, line.trim()));
      (out[f] ||= { history: [], dirty: false }).history.length < 5 && out[f].history.push(cur);
    }
    const st = await exec('git', ['status', '--porcelain', '--', rel]);
    for (const line of String(st).split('\n')) {
      const p = line.slice(3).trim(); if (!p) continue;
      (out[path.relative(FLOW_DIR, path.join(REPO, p))] ||= { history: [], dirty: false }).dirty = true;
    }
    return out;
  } catch { return null; }
}

// Langflow stores naive UTC timestamps ("2026-09-23T18:53:45.97"): read them as UTC.
const utc = (s) => (typeof s === 'string' && s ? (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`) : null);
const runOf = (t) => ({ id: String(t.id ?? '').slice(0, 8), at: utc(t.startTime), ok: t.status === 'ok' || t.status === 'success',
  status: typeof t.status === 'string' ? t.status : null, ms: Number.isFinite(Number(t.totalLatencyMs)) ? Number(t.totalLatencyMs) : null,
  tokens: Number.isFinite(Number(t.totalTokens)) ? Number(t.totalTokens) : null, flowId: t.flowId ?? null });

export function langflow() {
  return cached('langflow', async () => {
    const repo = readRepo();
    const out = { url: base(), running: false, version: null, auth: null, ui: null, repoFolder: repo !== null, flows: [], extraInstanceFlows: 0,
      project: null, queue: null, runsKnown: false, runsTotal: null, recentRuns: [], versionsKnown: false };
    const ver = await versions();
    out.versionsKnown = ver !== null;
    let health;
    try { health = await call('/health'); } catch { health = null; }
    out.running = health?.status === 200;
    let live = [], traces = [], projects = [], full = {};
    if (out.running) {
      try { out.version = (await call('/api/v1/version')).json?.version ?? null; } catch {}
      // The desktop app runs `langflow run --backend-only`: no web UI, so an /flow/<id> link would 404.
      try { const r = await call('/'); out.ui = r.status === 200 && /html/i.test(r.type); } catch { out.ui = false; }
      const headers = await authHeaders().catch(() => ({}));
      try {
        const f = await call('/api/v1/flows/?remove_example_flows=true&header_flows=true', headers);
        if (f.status === 401 || f.status === 403) { token = null; out.auth = 'refused'; }
        else if (Array.isArray(f.json)) { live = f.json.filter((x) => x && !x.is_component); out.auth = 'ok'; }
      } catch {}
      if (out.auth === 'ok') {
        const [t, p, q] = await Promise.all([
          call('/api/v1/monitor/traces?page=1&size=100', headers).catch(() => null),
          call('/api/v1/projects/', headers).catch(() => null),
          call('/api/v1/monitor/job_queue', headers).catch(() => null)]);
        if (t?.status === 200 && Array.isArray(t.json?.traces)) { traces = t.json.traces.map(runOf); out.runsKnown = true; out.runsTotal = Number(t.json.total) || traces.length; }
        projects = arr(p?.json);
        if (q?.status === 200 && q.json && typeof q.json === 'object') out.queue = { backend: q.json.backend ?? null, active: Number(q.json.active_jobs) || 0 };
      }
      const used = new Set();
      const matched = (repo || []).map((r) => live.find((x) => r.id && x.id === r.id) || live.find((x) => x.name === r.name) || null);
      await Promise.all(matched.map(async (m) => {
        if (!m) return; used.add(m.id);
        try { const g = await call(`/api/v1/flows/${encodeURIComponent(m.id)}`, headers); if (g.status === 200 && g.json) full[m.id] = g.json; } catch {}
      }));
      const folder = matched.find(Boolean)?.folder_id;
      const pr = projects.find((x) => x?.id === folder);
      if (pr) out.project = { id: pr.id, name: pr.name ?? null };
      out.extraInstanceFlows = live.filter((x) => !used.has(x.id)).length;
      out.flows = (repo || []).map((r, i) => {
        const m = matched[i]; const inst = m ? full[m.id] : null;
        const runs = m ? traces.filter((t) => t.flowId === m.id) : [];
        return { ...shape(r, ver), imported: Boolean(m), flowId: m?.id ?? null,
          openUrl: m && out.ui ? `${base()}/flow/${m.id}` : null,
          instanceUpdatedAt: utc(inst?.updated_at) ?? null,
          current: inst && r.data ? codes(inst.data) === codes(r.data) : null,
          lastRun: out.runsKnown && runs[0] ? { at: runs[0].at, ok: runs[0].ok } : null,
          runs: runs.slice(0, 8).map(({ flowId, ...x }) => x), runCount: out.runsKnown ? runs.length : null };
      });
      const names = Object.fromEntries(out.flows.filter((f) => f.flowId).map((f) => [f.flowId, f.name]));
      out.recentRuns = traces.slice(0, 12).map((t) => ({ ...t, flowName: names[t.flowId] ?? null }));
    } else {
      out.flows = (repo || []).map((r) => ({ ...shape(r, ver), imported: null, flowId: null, openUrl: null, instanceUpdatedAt: null, current: null,
        lastRun: null, runs: [], runCount: null }));
    }
    out.conclusions = langflowConclusions(out);
    return ok(out);
  }, 20000);
}
function shape({ data, ...r }, ver) {
  const canvas = data ? canvasOf(data) : { nodes: [], edges: [] };
  const v = ver ? ver[r.file] || { history: [], dirty: false } : null;
  return { ...r, canvas, usesModel: canvas.nodes.some((n) => n.usesModel), example: EXAMPLES[r.id] ?? null, versions: v ? v.history : null, dirty: v ? v.dirty : null };
}

// ---------------------------------------------------------------- conclusions (pure)
const ago = (iso, now) => {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (!Number.isFinite(s)) return null;
  if (s < 90) return 'לפני פחות מ-2 דקות';
  if (s < 5400) return `לפני ${Math.round(s / 60)} דקות`;
  if (s < 129600) return `לפני ${Math.round(s / 3600)} שעות`;
  return `לפני ${Math.round(s / 86400)} ימים`;
};
/**
 * 2 to 4 Hebrew conclusions about the Langflow state, most important first.
 * @returns {{k:string, tone:'ok'|'warn'|'bad'|'info', title:string, text:string}[]}
 */
export function langflowConclusions(d, now = Date.now()) {
  const flows = arr(d?.flows); const n = flows.length;
  const out = [];
  if (!d?.repoFolder) out.push({ k: 'no-repo', tone: 'warn', title: 'אין תיקיית זרימות בריפו', text: 'packages/langflow לא נמצא, אז אין מה להשוות או להריץ.' });
  if (!d?.running) {
    out.push({ k: 'down', tone: 'info', title: 'Langflow כבוי כרגע', text: `${n} זרימות מוצגות מהקבצים בריפו. ריצות, סנכרון וקישורים יופיעו כשהאפליקציה תעלה.` });
  } else if (d.auth === 'refused') {
    out.push({ k: 'auth', tone: 'bad', title: 'Langflow רץ אבל סירב להתחברות', text: 'ה-auto-login נכשל ואין LANGFLOW_API_KEY תקף, אז אי אפשר לראות זרימות וריצות.' });
  } else {
    const imp = flows.filter((f) => f.imported).length;
    out.push({ k: 'up', tone: imp === n ? 'ok' : 'warn', title: `Langflow${d.version ? ` ${d.version}` : ''} רץ, ${imp} מתוך ${n} זרימות מיובאות`,
      text: imp === n ? `כל הזרימות מהריפו נמצאות בפרויקט ${d.project?.name || 'Apple'}.` : 'חלק מהזרימות לא יובאו. להריץ node packages/langflow/sync.mjs sync.' });
  }
  const drift = flows.filter((f) => f.current === false);
  const dirty = flows.filter((f) => f.dirty);
  if (drift.length) out.push({ k: 'drift', tone: 'warn', title: `${drift.length} זרימות ב-Langflow שונות מהקוד בריפו`, text: `${drift.map((f) => f.name).join(', ')}. הרצת sync תדרוס את העותק ב-Langflow בקבצים מהריפו.` });
  else if (dirty.length) out.push({ k: 'dirty', tone: 'warn', title: `${dirty.length} קבצי זרימה שונו ולא נשמרו בקומיט`, text: dirty.map((f) => f.file).join(', ') });
  if (d?.running && d.runsKnown) {
    const failed = flows.filter((f) => f.lastRun && !f.lastRun.ok);
    const last = arr(d.recentRuns)[0];
    if (failed.length) out.push({ k: 'failed', tone: 'bad', title: `הריצה האחרונה נכשלה ב-${failed.length} זרימות`, text: failed.map((f) => f.name).join(', ') });
    else if (last) out.push({ k: 'last', tone: 'ok', title: `הריצה האחרונה הצליחה ${ago(last.at, now) || ''}`.trim(), text: `${last.flowName || 'זרימה'}, ${d.runsTotal ?? arr(d.recentRuns).length} ריצות רשומות בסך הכול.` });
    else out.push({ k: 'no-runs', tone: 'info', title: 'עוד לא הורצה אף זרימה', text: 'אין אף ריצה ביומן של Langflow.' });
  }
  const paid = flows.filter((f) => f.usesModel);
  if (out.length < 4 && n) out.push({ k: 'cost', tone: 'info', title: `${paid.length} מתוך ${n} זרימות קוראות למודל`,
    text: paid.length ? `${paid.map((f) => f.name).join(', ')} קוראות ל-Workers AI ומנצלות נוירונים. השאר רצות מקומית בלי מודל.` : 'כל הזרימות רצות מקומית בלי מודל.' });
  if (out.length < 4 && d?.running && d.ui === false) out.push({ k: 'no-ui', tone: 'info', title: 'Langflow רץ בלי ממשק ווב', text: 'האפליקציה רצה במצב backend-only, לכן אין קישור לפתיחה בדפדפן. פותחים את הזרימה ב-Langflow Desktop.' });
  return out.slice(0, 4);
}

// ---------------------------------------------------------------- the one write: run a flow
// Validates before anything else, and dryRun returns the exact call with no network at all. A real
// run uses LANGFLOW_API_KEY, or (as packages/langflow/sync.mjs does) a short-lived key minted through
// the auto-login session and deleted right after, even when the run fails. The key never leaves here.
export async function langflowAction(body = {}) {
  const { kind, id, input, dryRun } = body || {};
  if (kind !== 'run') return fail('פעולה לא מוכרת. בדף הזה אפשר רק להריץ זרימה.');
  if (typeof id !== 'string' || !UUID.test(id)) return fail('מזהה הזרימה לא תקין.');
  if (typeof input !== 'string' || !input.trim()) return fail('צריך קלט להרצה.');
  if (input.length > MAX_INPUT) return fail(`הקלט ארוך מדי (עד ${MAX_INPUT} תווים).`);
  const flow = arr(repoFlows()).find((f) => f.id === id);
  if (!flow) return fail('אפשר להריץ רק זרימה ששמורה בריפו (packages/langflow/flows).');
  const url = `${base()}/api/v1/run/${id}?stream=false`;
  const payload = { input_value: input, input_type: 'chat', output_type: 'chat' };
  if (dryRun) {
    return ok({ dryRun: true, plan: { method: 'POST', url, body: payload, flow: flow.name,
      auth: process.env.LANGFLOW_API_KEY ? 'x-api-key מ-LANGFLOW_API_KEY' : 'מפתח API זמני דרך auto-login, נמחק מיד אחרי הריצה' } });
  }
  let health; try { health = await call('/health'); } catch { health = null; }
  if (health?.status !== 200) return fail('Langflow לא רץ כרגע. צריך לפתוח את Langflow Desktop ולנסות שוב.');
  let key = process.env.LANGFLOW_API_KEY || null; let temp = null; let h = null;
  try {
    if (!key) {
      h = await authHeaders().catch(() => ({}));
      const k = await call('/api/v1/api_key/', h, { method: 'POST', body: { name: 'owner-dashboard run (ephemeral, deleted after the run)' } });
      if (k.status !== 200 && k.status !== 201) return fail('Langflow לא אישר מפתח הרצה זמני. אפשר להגדיר LANGFLOW_API_KEY ב-.env.');
      key = k.json?.api_key || null; temp = k.json?.id ?? null;
      if (!key) return fail('Langflow לא החזיר מפתח הרצה.');
    }
    const r = await call(`/api/v1/run/${id}?stream=false`, { 'x-api-key': key }, { method: 'POST', body: payload, timeout: 240000 });
    uncache('langflow');
    if (r.status !== 200) return fail(`Langflow החזיר שגיאה בהרצה (${r.status}).`);
    const o = r.json?.outputs?.[0]?.outputs?.[0];
    const msg = o?.results?.message ?? o?.outputs?.message?.message ?? o?.messages?.[0]?.message;
    const text = typeof msg === 'string' ? msg : (msg?.text ?? msg?.data?.text ?? null);
    return ok({ note: `הזרימה "${flow.name}" רצה.`, output: typeof text === 'string' ? text.slice(0, 1200) : null });
  } catch (e) {
    return fail(e?.name === 'TimeoutError' ? 'הריצה לא הסתיימה תוך 4 דקות.' : 'אין חיבור ל-Langflow.');
  } finally {
    if (temp != null) await call(`/api/v1/api_key/${encodeURIComponent(temp)}`, h || {}, { method: 'DELETE' }).catch(() => {});
  }
}
