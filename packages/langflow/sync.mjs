#!/usr/bin/env node
/**
 * Apple's Langflow flows: build them from components/*.py, put them into the local Langflow, run them.
 *
 *   node packages/langflow/sync.mjs status              is Langflow up, which Apple flows it holds, are they current
 *   node packages/langflow/sync.mjs build               regenerate flows/*.json from components/*.py (needs Langflow)
 *   node packages/langflow/sync.mjs sync                upsert the Apple project, the two Cloudflare credentials, every flow
 *   node packages/langflow/sync.mjs run <slug> --example | --input "<text>" | --input-file <path>
 *
 * Langflow is the desktop app on http://localhost:7860 (LANGFLOW_URL overrides). Auth is the app's own
 * auto-login; LANGFLOW_API_KEY is the fallback if auto-login is ever switched off. Tokens stay in memory:
 * nothing here prints, logs or writes a token, and every error string passes through redact().
 * The Cloudflare account id and token are read from the environment or parsed in-process from the repo
 * .env, and stored only as Langflow Credential variables (encrypted in Langflow's own database).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const PROJECT = 'Apple';
export const SECRETS = ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'];

const r = (p) => path.join(REPO, p);
export const FLOWS = [
  {
    slug: 'apple-visual-critique',
    id: 'eeb4dd2a-e8a4-465b-bf9a-4d19585a27a5',
    name: 'Apple: visual critique (gauntlet)',
    description: 'Blind A/B critique of a Studio shot against a reference image; returns the winner and structured map/models/ui gaps for scripts/gauntlet-verdict.mjs.',
    steps: ['critique_request', 'workers_ai', 'critique_verdict'],
    example: {
      ours: r('docs/gauntlet/visual/rounds/round-4-edit.png'),
      reference: r('docs/gauntlet/visual/refs/simulator/map/1-hub-overview.png'),
      test: 'map', piece: 'simulator-map', seed: 4,
    },
  },
  {
    slug: 'apple-training-data',
    id: '8ef26fd8-ed60-42a3-b9c1-9e03b4b531ee',
    name: 'Apple: gap to training data',
    description: 'Turns one visual gap (or a critique verdict) into a genre-agnostic skill card draft, a chunks.jsonl line and chat-format Luau examples.',
    steps: ['training_request', 'workers_ai', 'training_records'],
    example: { gap: 'building plots are flat 0.2-stud plates with no raised border, lip or base', area: 'map', fix: 'volume and trim', examples: 2 },
  },
  {
    slug: 'apple-rag-ingest',
    id: 'dc487ec2-c2ca-4d83-a848-65eb5bca0be4',
    name: 'Apple: RAG chunker',
    description: "Chunks docs and skill cards into the worker's index format (packages/corpus/data/chunks.jsonl lines). No model.",
    steps: ['rag_chunker'],
    example: { prefix: 'gauntlet', docs: [{ path: r('docs/gauntlet/README.md') }] },
  },
  {
    slug: 'apple-asset-curation',
    id: '149d4669-c030-45b1-82b1-8c70889c093b',
    name: 'Apple: asset curation',
    description: 'Dedupes asset-hunt records and sorts them into import-ok / review / reference-only by licence. No model.',
    steps: ['asset_curator'],
    example: { paths: ['ui', 'models', 'icons'].map((k) => r(`packages/asset-library/sources/${k}.jsonl`)), limit: 20 },
  },
];

export const redact = (s) =>
  String(s)
    .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]*/g, '<jwt>')
    .replace(/\bsk-[\w-]{8,}/g, '<api-key>')
    .replace(/Bearer\s+[\w.-]+/gi, 'Bearer <redacted>');

/** Only the keys this tool needs, parsed in-process; values are never printed. */
export function loadEnv(file = r('.env'), base = process.env) {
  const env = {};
  const wanted = [...SECRETS, 'LANGFLOW_API_KEY'];
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
      if (m && wanted.includes(m[1])) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  for (const k of wanted) if (base[k]) env[k] = base[k];
  return env;
}

export function client({ base = process.env.LANGFLOW_URL || 'http://localhost:7860', env = {}, fetchImpl = fetch } = {}) {
  let auth = null;
  async function headers() {
    if (!auth) {
      const res = await fetchImpl(`${base}/api/v1/auto_login`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
      const j = res?.ok ? await res.json().catch(() => ({})) : {};
      if (j.access_token) auth = { authorization: `Bearer ${j.access_token}` };
      else if (env.LANGFLOW_API_KEY) auth = { 'x-api-key': env.LANGFLOW_API_KEY };
      else throw new Error('Langflow refused auto-login and LANGFLOW_API_KEY is not set');
    }
    return { ...auth, 'content-type': 'application/json' };
  }
  async function api(method, p, body, { ok = [200, 201], timeout = 30000, apiKey } = {}) {
    const h = await headers();
    if (apiKey) { delete h.authorization; h['x-api-key'] = apiKey; }
    const res = await fetchImpl(base + p, {
      method, headers: h, signal: AbortSignal.timeout(timeout),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!ok.includes(res.status)) {
      const err = new Error(`${method} ${p} -> ${res.status}: ${redact(text).slice(0, 400)}`);
      err.status = res.status;
      throw err;
    }
    return text ? JSON.parse(text) : null;
  }
  async function open(p) {
    try {
      const res = await fetchImpl(base + p, { signal: AbortSignal.timeout(3000) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }
  /**
   * /api/v1/run wants an API key even under auto-login (Langflow >= 1.5). With a configured key, use it;
   * otherwise mint one through the auto-login session, use it for this call only, and delete it.
   */
  async function withApiKey(fn) {
    if (env.LANGFLOW_API_KEY) return fn(env.LANGFLOW_API_KEY);
    const key = await api('POST', '/api/v1/api_key/', { name: 'apple-sync (ephemeral, deleted after the run)' });
    try {
      return await fn(key.api_key);
    } finally {
      await api('DELETE', `/api/v1/api_key/${key.id}`).catch(() => {});
    }
  }
  return { base, api, open, withApiKey };
}

export const componentCode = (step) => readFileSync(path.join(HERE, 'components', `${step}.py`), 'utf8');
export const flowFile = (slug) => path.join(HERE, 'flows', `${slug}.json`);
export const readFlow = (slug) => JSON.parse(readFileSync(flowFile(slug), 'utf8'));
const short = (s) => createHash('sha1').update(s).digest('hex').slice(0, 5);
const handle = (o) => JSON.stringify(o).replace(/"/g, 'œ');

/** Pure: lay out ChatInput -> steps -> ChatOutput left to right and wire each output to the next input. */
export function assemble(flow, parts) {
  const nodes = parts.map(({ type, node }, i) => {
    const id = `${type}-${short(`${flow.slug}:${i}`)}`;
    return { id, type: 'genericNode', position: { x: 60 + i * 460, y: 160 + (i % 2) * 90 }, data: { id, type, node, showNode: true } };
  });
  const edges = [];
  for (let i = 0; i + 1 < nodes.length; i++) {
    const src = nodes[i], dst = nodes[i + 1];
    const out = src.data.node.outputs[0];
    const field = dst.data.type === 'ChatOutput' ? 'input_value' : dst.data.node.field_order.find((f) => dst.data.node.template[f]?.input_types?.includes('Message'));
    const t = dst.data.node.template[field];
    const sourceHandle = { dataType: src.data.type, id: src.id, name: out.name, output_types: out.types };
    const targetHandle = { fieldName: field, id: dst.id, inputTypes: t.input_types, type: t.type };
    edges.push({
      id: `reactflow__edge-${src.id}${handle(sourceHandle)}-${dst.id}${handle(targetHandle)}`,
      source: src.id, target: dst.id, sourceHandle: handle(sourceHandle), targetHandle: handle(targetHandle),
      data: { sourceHandle, targetHandle }, className: '', animated: false,
    });
  }
  return {
    id: flow.id, name: flow.name, description: flow.description, endpoint_name: flow.slug, is_component: false,
    data: { nodes, edges, viewport: { x: 40, y: 60, zoom: 0.75 } },
  };
}

export async function build(c) {
  const all = await c.api('GET', '/api/v1/all', undefined, { timeout: 60000 });
  const io = all.input_output;
  const compiled = {};
  for (const flow of FLOWS) {
    const parts = [{ type: 'ChatInput', node: structuredClone(io.ChatInput) }];
    for (const step of flow.steps) {
      compiled[step] ??= await c.api('POST', '/api/v1/custom_component', { code: componentCode(step) });
      parts.push({ type: compiled[step].type, node: structuredClone(compiled[step].data) });
    }
    parts.push({ type: 'ChatOutput', node: structuredClone(io.ChatOutput) });
    writeFileSync(flowFile(flow.slug), JSON.stringify(assemble(flow, parts), null, 1) + '\n');
  }
  return FLOWS.map((f) => f.slug);
}

export async function sync(c, env) {
  const projects = await c.api('GET', '/api/v1/projects/');
  const project = projects.find((p) => p.name === PROJECT) ??
    (await c.api('POST', '/api/v1/projects/', { name: PROJECT, description: 'Apple (RbxAI) product flows, managed by packages/langflow/sync.mjs', components_list: [], flows_list: [] }));
  const vars = await c.api('GET', '/api/v1/variables/');
  const secrets = {};
  for (const name of SECRETS) {
    const have = vars.find((v) => v.name === name);
    if (!env[name]) secrets[name] = have?.has_value ? 'kept (not in env)' : 'MISSING';
    else if (have) { await c.api('PATCH', `/api/v1/variables/${have.id}`, { id: have.id, name, value: env[name] }); secrets[name] = 'updated'; }
    else { await c.api('POST', '/api/v1/variables/', { name, value: env[name], type: 'Credential', default_fields: [] }); secrets[name] = 'created'; }
  }
  const flows = [];
  for (const f of FLOWS) {
    const { id, name, description, data, endpoint_name } = readFlow(f.slug);
    await c.api('PUT', `/api/v1/flows/${id}`, { name, description, data, endpoint_name, folder_id: project.id });
    flows.push({ slug: f.slug, id, nodes: data.nodes.length });
  }
  return { project: project.id, secrets, flows };
}

/** The first chat message the run produced, whatever shape this Langflow version nests it in. */
export function outputText(res) {
  const o = res?.outputs?.[0]?.outputs?.[0];
  const msg = o?.results?.message ?? o?.outputs?.message?.message ?? o?.messages?.[0]?.message;
  return typeof msg === 'string' ? msg : (msg?.text ?? msg?.data?.text ?? null);
}

export async function run(c, slug, input) {
  const flow = FLOWS.find((f) => f.slug === slug);
  if (!flow) throw new Error(`unknown flow ${slug}; one of ${FLOWS.map((f) => f.slug).join(', ')}`);
  const res = await c.withApiKey((apiKey) =>
    c.api('POST', `/api/v1/run/${flow.id}?stream=false`, { input_value: input, input_type: 'chat', output_type: 'chat' }, { timeout: 240000, apiKey }));
  const text = outputText(res);
  if (text == null) throw new Error(`the ${slug} run returned no chat output`);
  return text;
}

export async function status(c) {
  const health = await c.open('/health');
  const version = (await c.open('/api/v1/version'))?.version ?? null;
  const out = { url: c.base, running: health?.status === 'ok', version, flows: [] };
  if (!out.running) return out;
  for (const f of FLOWS) {
    const repo = readFlow(f.slug);
    let live = null;
    try { live = await c.api('GET', `/api/v1/flows/${f.id}`); } catch (e) { if (e.status !== 404) throw e; }
    const codes = (fl) => fl.data.nodes.map((n) => n.data.node.template.code?.value ?? n.data.type).join('\n');
    out.flows.push({ slug: f.slug, id: f.id, name: f.name, inLangflow: !!live, current: !!live && codes(live) === codes(repo), models: f.steps.includes('workers_ai') });
  }
  return out;
}

async function main(argv) {
  const [cmd, slug] = argv;
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : undefined; };
  const env = loadEnv();
  const c = client({ env });
  const print = (v) => console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  if (cmd === 'status') return print(await status(c));
  if (cmd === 'build') return print({ built: await build(c) });
  if (cmd === 'sync') return print(await sync(c, env));
  if (cmd === 'run') {
    const flow = FLOWS.find((f) => f.slug === slug);
    const input = argv.includes('--example') ? JSON.stringify(flow?.example)
      : opt('input-file') ? readFileSync(opt('input-file'), 'utf8') : opt('input');
    if (!input) throw new Error('run needs --example, --input "<text>" or --input-file <path>');
    const text = await run(c, slug, input);
    try { return print(JSON.parse(text)); } catch { return print(text); }
  }
  console.error('usage: node packages/langflow/sync.mjs status | build | sync | run <slug> (--example | --input <text> | --input-file <path>)');
  process.exitCode = 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((e) => { console.error(redact(e.message)); process.exitCode = 1; });
}
