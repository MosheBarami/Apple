// GET /api/cc/models: everything the repository records about Apple's models, read at request time
// from the sources of truth. The registry and plan gating are the real exported values of
// packages/shared/src/models.ts (Node strips the types); the LoRA runs come from their yaml, adapter
// folders, datasets and training logs under packages/training; the before/after scores from the
// scored eval files; the RAG counts from packages/corpus. A fact no file records comes back null and
// the page says "לא מתועד".
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, cached } from '../http.mjs';

const R = (...p) => path.join(REPO, ...p);
const T = (...p) => R('packages/training', ...p);
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };
const lineCount = (p) => { const s = readText(p); return s == null ? null : s.split('\n').filter((l) => l.trim()).length; };

async function registry() {
  const file = R('packages/shared/src/models.ts');
  const m = await import(`${pathToFileURL(file).href}?v=${statOf(file)?.mtimeMs}`);
  const plans = Object.keys(m.TIER_FOR_PLAN);
  return {
    source: 'packages/shared/src/models.ts',
    models: m.MODEL_REGISTRY.map((x) => ({ ...x, lora: x.lora ?? null, plans: plans.filter((p) => m.canUseModel(x.id, p)), locked: m.lockedReason(x.id) })),
    tierForPlan: m.TIER_FOR_PLAN,
  };
}

// The comment block at the top of a yaml, and its scalar top-level keys (plus lora_parameters).
function yamlOf(text) {
  const header = [];
  for (const line of text.split('\n')) { if (/^#/.test(line)) header.push(line.replace(/^#\s?/, '')); else if (line.trim()) break; }
  const keys = {};
  for (const m of text.matchAll(/^([a-z_]+):[ \t]*("?)([^"#\n]*)\2[ \t]*(?:#[ \t]*([^\n]*))?$/gm)) if (m[3].trim()) keys[m[1]] = { v: m[3].trim(), note: m[4]?.trim() || null };
  const lp = /^lora_parameters:\n((?:[ \t][^\n]*\n)+)/m.exec(text)?.[1] || '';
  for (const m of lp.matchAll(/^[ \t]+([a-z_]+):[ \t]*([^\n]+)$/gm)) keys[`lora.${m[1]}`] = { v: m[2].trim(), note: null };
  return { header: header.join('\n').trim(), keys };
}

// mlx_lm.lora log lines: "Iter 25: Val loss 1.204" and "Iter 10: Train loss 1.937, ...".
function logOf(file) {
  const s = readText(file);
  if (s == null) return null;
  const val = [], train = [];
  for (const m of s.matchAll(/^Iter (\d+): Val loss ([\d.]+)/gm)) val.push([Number(m[1]), Number(m[2])]);
  for (const m of s.matchAll(/^Iter (\d+): Train loss ([\d.]+).*?Peak mem ([\d.]+) GB/gm)) train.push([Number(m[1]), Number(m[2]), Number(m[3])]);
  const saved = [...s.matchAll(/^Iter (\d+): Saved adapter weights/gm)].map((m) => Number(m[1]));
  const err = /^(\w*Error: .{0,160})/m.exec(s)?.[1] || null;
  const trainable = /Trainable parameters: ([\d.]+)% \(([\d.]+[MK]?)\/([\d.]+[MKB]?)\)/.exec(s);
  return { file: path.relative(REPO, file), val, train, lastSaved: saved.at(-1) ?? null, error: err, trainable: trainable ? { pct: Number(trainable[1]), params: trainable[2], of: trainable[3] } : null, peakGb: train.length ? Math.max(...train.map((t) => t[2])) : null };
}

function adapterOf(name) {
  const d = T('adapters', name);
  const fl = ls(d); if (!fl.length) return null;
  const cfg = readJson(path.join(d, 'adapter_config.json')) || {};
  const ckpts = fl.map((f) => /^(\d+)_adapters\.safetensors$/.exec(f)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const main = statOf(path.join(d, 'adapters.safetensors'));
  const start = statOf(path.join(d, 'adapter_config.json'))?.mtime ?? null;
  return { name, path: `packages/training/adapters/${name}`, base: cfg.model ?? null, data: cfg.data ?? null, rank: cfg.lora_parameters?.rank ?? null,
    scale: cfg.lora_parameters?.scale ?? null, layers: cfg.num_layers ?? null, iters: cfg.iters ?? null, checkpoints: ckpts,
    sizeMb: main ? Math.round(main.size / 1e5) / 10 : null, startedAt: start, endedAt: main?.mtime ?? null };
}

function datasetOf(dir) {
  if (!dir) return null;
  const d = T(dir);
  if (!statOf(d)) return null;
  const card = readJson(path.join(d, 'dataset-card.json'));
  return { dir: `packages/training/${dir}`, train: lineCount(path.join(d, 'train.jsonl')), valid: lineCount(path.join(d, 'valid.jsonl')), test: lineCount(path.join(d, 'test.jsonl')),
    card: card ? { schema: card.schema ?? null, builtFrom: card.builtFrom ?? null, rows: card.rows ?? null, families: card.families ?? null, trackRows: card.trackRows ?? null,
      source: card.source ?? null, harvestedRows: card.harvestedRows ?? null, customerData: card.customerData ?? null, limitations: card.limitations ?? null, productionTrainingReady: card.productionTrainingReady ?? null } : null };
}

function loraRuns() {
  const runs = ls(T('.')).map((n) => /^lora-apple-v(\d+)\.yaml$/.exec(n)).filter(Boolean).map((m) => Number(m[1])).sort((a, b) => a - b);
  const adapters = ls(T('adapters'));
  return runs.map((v) => {
    const y = yamlOf(readText(T(`lora-apple-v${v}.yaml`)) || '');
    const k = (key) => y.keys[key]?.v ?? null;
    const ap = k('adapter_path'); const main = ap ? path.basename(ap) : null;
    const related = adapters.filter((a) => a === main || a.startsWith(`${main}-`) || a === `apple-v${v}` || a.startsWith(`apple-v${v}-`));
    return {
      version: v, config: `packages/training/lora-apple-v${v}.yaml`, header: y.header, base: k('model'), data: k('data'),
      params: Object.fromEntries(Object.entries(y.keys).filter(([key]) => !['model', 'data', 'adapter_path', 'train'].includes(key)).map(([key, x]) => [key, x])),
      adapters: [...new Set(related)].map(adapterOf).filter(Boolean),
      dataset: datasetOf(k('data')),
      log: logOf(T('runs', `apple-v${v}.log`)),
    };
  });
}

// Every "<name>-scored.json": base vs adapter per track, same rows, same harness.
function scoredEvals() {
  return ls(T('runs')).filter((n) => n.endsWith('-scored.json')).map((n) => {
    const j = readJson(T('runs', n)); if (!j?.tally) return null;
    const tracks = [...new Set(Object.values(j.tally).flatMap((s) => Object.keys(s || {})))];
    return { file: `packages/training/runs/${n}`, name: n.replace(/-scored\.json$/, ''), rows: Array.isArray(j.perRow) ? j.perRow.length : null,
      sides: Object.keys(j.tally), tracks: tracks.map((t) => ({ track: t, ...Object.fromEntries(Object.entries(j.tally).map(([side, s]) => [side, s?.[t] ? { ok: s[t].ok, n: s[t].n, reasons: s[t].reasons || {} } : null])) })),
      style: j.style ?? null, mtime: statOf(T('runs', n))?.mtime ?? null };
  }).filter(Boolean).sort((a, b) => (a.mtime < b.mtime ? -1 : 1));
}

function production() {
  const j = readJson(T('runs', 'eval-production-SUMMARY.json'));
  if (!j) return null;
  return { file: 'packages/training/runs/eval-production-SUMMARY.json', measuredAt: j.measuredAt ?? null, what: j.what ?? null, modelUnderTest: j.modelUnderTest ?? null,
    headline: j.headline ?? null, caveats: Array.isArray(j.caveats) ? j.caveats : [], runs: Array.isArray(j.runs) ? j.runs.length : null };
}

// roblox-frontier-*.json: each arm's pass rate across its runs.
function frontier() {
  const arms = new Map();
  for (const n of ls(T('runs')).filter((f) => /^roblox-frontier-.*\.json$/.test(f) && !/probe/.test(f))) {
    const j = readJson(T('runs', n)); if (!j || typeof j.passed !== 'number') continue;
    const id = j.arm?.id || n.replace(/^roblox-frontier-|\.json$/g, '');
    const a = arms.get(id) || { id, what: j.arm?.what ?? null, runs: 0, passed: 0, measured: 0, last: null };
    a.runs++; a.passed += j.passed; a.measured += j.measured || 0; if (j.measuredAt && (!a.last || j.measuredAt > a.last)) a.last = j.measuredAt;
    arms.set(id, a);
  }
  return [...arms.values()].map((a) => ({ ...a, pct: a.measured ? a.passed / a.measured : null })).sort((x, y) => (y.pct ?? 0) - (x.pct ?? 0));
}

function rag() {
  const C = (p) => R('packages/corpus/data', p);
  const kinds = {}; let chunks = 0; const docs = new Set();
  const s = readText(C('chunks.jsonl'));
  if (s) for (const line of s.split('\n')) {
    if (!line.trim()) continue;
    try { const j = JSON.parse(line); chunks++; kinds[j.kind || 'other'] = (kinds[j.kind || 'other'] || 0) + 1; if (j.docSlug) docs.add(j.docSlug); } catch { /* a torn line is skipped */ }
  }
  const witness = readJson(C('chunks-witness.json'));
  const up = readJson(C('upload-progress.json'));
  const wr = readText(R('apps/worker/wrangler.apple.jsonc')) || '';
  const index = /"vectorize"\s*:\s*\[\s*\{[^\]]*?"index_name"\s*:\s*"([^"]+)"/.exec(wr)?.[1] ?? null;
  const gw = readText(R('apps/worker/src/gateway.ts')) || '';
  const embed = /const model = '(@cf\/[^']*bge[^']*)'/.exec(gw)?.[1] ?? null;
  const sources = readJson(C('sources.json'));
  return {
    chunks: s ? chunks : null, documents: docs.size || witness?.documentCount || null, kinds, witnessAt: witness?.generatedAt ?? null,
    index, embedModel: embed, embedSource: embed ? 'apps/worker/src/gateway.ts' : null,
    upload: up ? { ranAt: up.ranAt ?? null, desired: up.plan?.desired ?? null, indexed: up.plan?.indexed ?? null, added: up.plan?.add ?? null, updated: up.plan?.update ?? null, removed: up.plan?.remove ?? null } : null,
    sources: Array.isArray(sources?.records) ? sources.records.length : null,
    sizeMb: statOf(C('chunks.jsonl')) ? Math.round(statOf(C('chunks.jsonl')).size / 1e5) / 10 : null,
  };
}

function skillCards() {
  const j = readJson(R('packages/corpus/data/skill-cards.json'));
  if (!j) return null;
  const ts = readText(R('apps/worker/src/skill-cards.ts')) || '';
  const lim = (k) => Number(new RegExp(`export const ${k} = (\\d+)`).exec(ts)?.[1]) || null;
  return { schema: j.schema ?? null, what: j.what ?? null, source: 'packages/corpus/data/skill-cards.json',
    limits: { perPrompt: lim('MAX_PROMPT_CARDS'), perRun: lim('MAX_CARDS_PER_RUN'), chars: lim('MAX_CARD_CHARS') },
    cards: (j.cards || []).map((c) => ({ id: c.id, title: c.title, domain: c.domain, tools: c.tools || [], triggers: (c.triggers || []).length, recipe: c.recipe || [], avoid: c.avoid || [], check: c.check || null, docs: (c.docs || []).map((d) => ({ title: d.title, url: d.url })) })) };
}

// The written record of how each model decision was made.
function modelDocs() {
  const re = /(apple-max|apple-model|apple-v\d|local-model|lora|model-seed|MODEL-ROUTING|apple-roblox-research-dataset|huggingface-luau)/i;
  return ls(R('docs/evidence')).filter((n) => n.endsWith('.md') && re.test(n)).map((n) => {
    const s = readText(R('docs/evidence', n)) || '';
    const title = /^#\s+(.+)$/m.exec(s)?.[1]?.trim() || n;
    const para = s.split('\n\n').map((p) => p.trim()).find((p) => p && !p.startsWith('#') && !p.startsWith('|') && !p.startsWith('```')) || '';
    return { path: `docs/evidence/${n}`, title, date: /(\d{4}-\d{2}-\d{2})/.exec(n)?.[1] ?? null, lead: para.replace(/\s+/g, ' ').slice(0, 420) };
  }).sort((a, b) => ((a.date || '') < (b.date || '') ? -1 : 1));
}

export async function models() {
  return cached('repo:models', async () => {
    const [reg] = await Promise.all([registry().catch(() => null)]);
    return { registry: reg, lora: loraRuns(), evals: scoredEvals(), production: production(), frontier: frontier(), rag: rag(), skills: skillCards(), docs: modelDocs() };
  }, 60000);
}
