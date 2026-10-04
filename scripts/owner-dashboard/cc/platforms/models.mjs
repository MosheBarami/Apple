// GET /api/cc/models: everything the repository records about StudPilot's models, read at request time
// from the sources of truth. The registry is the real exported value of packages/shared/src/models.ts
// (Node strips the types); the RAG counts come from packages/corpus. A fact no file records comes back
// null and the page says "לא מתועד". Training and LoRA were cancelled (V3 §2): the LoRA runs, adapter
// evals and the StudPilot MAX frontier lanes this page used to read from packages/training are retired;
// that directory is kept only as a historical archive.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { REPO, cached } from '../http.mjs';

const R = (...p) => path.join(REPO, ...p);
const readText = (p) => { try { return fs.readFileSync(p, 'utf8'); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
const statOf = (p) => { try { return fs.statSync(p); } catch { return null; } };
const ls = (p) => { try { return fs.readdirSync(p); } catch { return []; } };

async function registry() {
  const file = R('packages/shared/src/models.ts');
  const m = await import(`${pathToFileURL(file).href}?v=${statOf(file)?.mtimeMs}`);
  // One engine on every plan (V3 gate G01): there is no tier table and nothing is locked.
  const plans = ['free', 'builder', 'studio', 'enterprise'];
  return {
    source: 'packages/shared/src/models.ts',
    models: m.MODEL_REGISTRY.map((x) => ({ ...x, plans, locked: '' })),
    tierForPlan: null,
  };
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
  const wr = readText(R('apps/worker/wrangler.studpilot.jsonc')) || '';
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
  const re = /(studpilot-max|studpilot-model|studpilot-v\d|local-model|lora|model-seed|MODEL-ROUTING|studpilot-roblox-research-dataset|huggingface-luau)/i;
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
    return { registry: reg, rag: rag(), skills: skillCards(), docs: modelDocs() };
  }, 60000);
}
