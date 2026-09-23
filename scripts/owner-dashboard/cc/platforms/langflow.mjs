// Langflow: the local instance (http://localhost:7860, or LANGFLOW_URL) and the product flows checked
// in at packages/langflow/*.json. Each repo flow is matched to the instance by id, then by name, with
// its last build. Down, missing folder or refused auth all come back as a calm state, never an error.
// Auth: LANGFLOW_API_KEY when set; otherwise the local AUTO_LOGIN token, held in memory only.
import fs from 'node:fs';
import path from 'node:path';
import { REPO, cached, ok } from '../http.mjs';

export const FLOW_DIR = path.join(REPO, 'packages', 'langflow');
const base = () => (process.env.LANGFLOW_URL || 'http://localhost:7860').replace(/\/+$/, '');

async function call(p, headers = {}) {
  const r = await fetch(`${base()}${p}`, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(4000) });
  let j = null; try { j = await r.json(); } catch {}
  return { status: r.status, json: j };
}

let token = null;
async function authHeaders() {
  if (process.env.LANGFLOW_API_KEY) return { 'x-api-key': process.env.LANGFLOW_API_KEY };
  if (!token) { const a = await call('/api/v1/auto_login'); token = a.status === 200 ? a.json?.access_token || null : null; }
  return token ? { authorization: `Bearer ${token}` } : {};
}

// Repo flows: Langflow's export format ({ id?, name, description, endpoint_name?, data:{nodes,edges} }),
// at packages/langflow/*.json or packages/langflow/flows/*.json. A file that does not parse is listed
// with its name and `invalid: true` so the owner sees it rather than nothing.
function repoFlows() {
  if (!fs.existsSync(FLOW_DIR)) return null;
  const files = [];
  for (const dir of [FLOW_DIR, path.join(FLOW_DIR, 'flows')]) {
    try { for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) files.push(path.join(dir, f)); } catch {}
  }
  return files.map((full) => {
    const file = path.relative(FLOW_DIR, full), base = path.basename(full, '.json');
    try {
      const j = JSON.parse(fs.readFileSync(full, 'utf8'));
      return { file, id: j.id ?? null, name: j.name || base, description: j.description || null, endpoint: j.endpoint_name || null,
        nodes: Array.isArray(j.data?.nodes) ? j.data.nodes.length : null, updatedAt: fs.statSync(full).mtime.toISOString() };
    } catch { return { file, id: null, name: base, description: null, endpoint: null, nodes: null, invalid: true }; }
  });
}

// The newest vertex build of a flow: when it ran and whether every vertex came back valid.
async function lastRun(id, headers) {
  try {
    const b = await call(`/api/v1/monitor/builds?flow_id=${encodeURIComponent(id)}`, headers);
    const all = Object.values(b.json?.vertex_builds || {}).flat().filter((x) => x?.timestamp);
    if (!all.length) return null;
    const at = all.map((x) => x.timestamp).sort().pop();
    const latest = all.filter((x) => x.timestamp >= at.slice(0, 19));
    return { at, ok: latest.every((x) => x.valid !== false) };
  } catch { return null; }
}

export function langflow() {
  return cached('langflow', async () => {
    const repo = repoFlows();
    const out = { url: base(), running: false, version: null, auth: null, repoFolder: repo !== null, flows: [], extraInstanceFlows: 0 };
    let health;
    try { health = await call('/health'); } catch { health = null; }
    out.running = health?.status === 200;
    if (out.running) {
      try { out.version = (await call('/api/v1/version')).json?.version ?? null; } catch {}
    }
    let live = [];
    if (out.running) {
      const headers = await authHeaders().catch(() => ({}));
      try {
        const f = await call('/api/v1/flows/?remove_example_flows=true&header_flows=true', headers);
        if (f.status === 401 || f.status === 403) { token = null; out.auth = 'refused'; }
        else if (Array.isArray(f.json)) { live = f.json.filter((x) => !x.is_component); out.auth = 'ok'; }
      } catch {}
      const used = new Set();
      out.flows = await Promise.all((repo || []).map(async (r) => {
        const m = live.find((x) => r.id && x.id === r.id) || live.find((x) => x.name === r.name);
        if (m) used.add(m.id);
        return { ...r, imported: Boolean(m), flowId: m?.id ?? null, openUrl: m ? `${base()}/flow/${m.id}` : null,
          lastRun: m ? await lastRun(m.id, headers) : null };
      }));
      out.extraInstanceFlows = live.filter((x) => !used.has(x.id)).length;
    } else {
      out.flows = (repo || []).map((r) => ({ ...r, imported: null, flowId: null, openUrl: null, lastRun: null }));
    }
    return ok(out);
  }, 20000);
}
