// Runs the agent's model on a UI request with the real build_ui schema and ui-design skill; build_ui is answered by the
// worker's real compiler (no Studio), and each compiled screen is written to <out>/<name>.json for rendering.
// Usage: node scripts/ui-probe.mjs "<request>" <outDir> [model]
import { streamText, isStepCount, jsonSchema, tool } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { finishImage, planImage } from '../../worker/src/image-gen.ts';
import { STUDIO_TOOL_SPECS } from '../src/tools/generated.ts';
import { systemPrompt } from '../src/prompt.ts';
import { SKILLS } from '../src/skills.generated.ts';
import { unwrapQuotedToolInput } from '../src/token-saver.ts';
import { compileScreen } from '../../worker/src/ui-engine.ts';

const [request, out, model = '@cf/moonshotai/kimi-k2.7-code'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const workersai = createWorkersAI({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiKey: process.env.CLOUDFLARE_API_TOKEN_MASTER });
import { formatCreatorStoreResult, searchCreatorStore } from '../src/knowledge/creator-store.ts';
let lastAsset = 0;
// make_image runs for real (Lucid Origin over REST, then the worker's own cut/crop/fit); each picture is saved as a PNG
// and given a stand-in asset id, listed in <out>/assets.json for ui-render.
const assets = {};
let nextAsset = 900000001;
function png({ width: w, height: h, data }) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) Buffer.from(data.buffer, data.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  const crc = (buf) => { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
async function makeImage(a) {
  const plan = planImage({ prompt: a.prompt, kind: a.kind, style: a.style, size: a.size });
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/@cf/leonardo/lucid-origin`, {
    method: 'POST', headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN_MASTER}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: plan.prompt, width: plan.genW, height: plan.genH, steps: plan.steps, ...(a.seed ? { seed: a.seed } : {}) }),
  }).then((r) => r.json());
  const b64 = res.result?.image;
  if (!b64) return { error: `The image model failed: ${JSON.stringify(res.errors ?? res).slice(0, 200)}` };
  const img = finishImage(b64, plan);
  if (img.error) return img;
  const id = nextAsset++;
  const file = `${out}/asset-${id}.png`;
  writeFileSync(file, png(img));
  assets[id] = file;
  writeFileSync(`${out}/assets.json`, JSON.stringify(assets));
  return { image: `rbxassetid://${id}`, width: img.width, height: img.height, kind: plan.kind, use: plan.kind === 'button' || plan.kind === 'panel' ? `skin {image, size: [${img.width}, ${img.height}], slice}` : 'image node, pattern or skin' };
}
const canned = { get_project_tree: 'game\n  Workspace (Baseplate, SpawnLocation)\n  StarterGui (empty)\n  ServerScriptService (empty)\n  ReplicatedStorage (empty)', list_scripts: '[]' };
const tools = Object.fromEntries(STUDIO_TOOL_SPECS.map((s) => [s.name, tool({ description: s.description, inputSchema: jsonSchema(s.parameters), execute: async (a) => {
  if (s.name === 'build_ui') {
    writeFileSync(`${out}/input-${Date.now()}.json`, JSON.stringify(a, null, 1));
    const c = compileScreen(a);
    if ('error' in c) return c;
    writeFileSync(`${out}/${c.name}.json`, JSON.stringify(c.item, null, 1));
    return { ok: true, screen: c.name, instances: c.count, warnings: c.warnings, defects: [], note: 'measured in Studio: none reported (probe)' };
  }
  if (s.name === 'make_image') return makeImage(a);
  // The store path answers as Studio would: an inserted decal reads back with its image as Texture.
  if (s.name === 'insert_from_store') { lastAsset = a.assetId; return JSON.stringify({ inserted: [`game.Workspace.StoreAsset_${a.assetId}`], children: [`game.Workspace.StoreAsset_${a.assetId}.Decal`] }); }
  if (s.name === 'get_instance' && lastAsset) return JSON.stringify({ path: a.path, class: 'Decal', props: { Texture: `rbxassetid://${lastAsset}` } });
  return canned[s.name] ?? '{"ok":true}';
} })]));
tools.search_creator_store = tool({ description: 'Search the Roblox Creator Store for models, meshes, images (decals), audio or animations.', inputSchema: jsonSchema({ type: 'object', properties: { query: { type: 'string' }, category: { type: 'string', enum: ['model', 'mesh', 'decal', 'audio', 'animation', 'video'] } }, required: ['query'] }), execute: async ({ query, category }) => formatCreatorStoreResult(await searchCreatorStore({ query, category: category ?? 'model', limit: 8 })) });
tools.load_skill = tool({ description: 'Load one of your skills before specialised work', inputSchema: jsonSchema({ type: 'object', properties: { name: { type: 'string' }, file: { type: 'string' } }, required: ['name'] }), execute: async ({ name }) => SKILLS.find((s) => s.name === name)?.body ?? 'no such skill' });
const t0 = Date.now();
const r = streamText({ model: workersai(model, { reasoning_effort: 'low' }), system: systemPrompt({ projectName: 'My Game', studio: { connected: true, placeName: 'Place1', placeId: 1 } }), prompt: request, tools, stopWhen: isStepCount(Number(process.env.STEPS ?? 8)), experimental_repairToolCall: unwrapQuotedToolInput, maxOutputTokens: 16000 });
let text = '';
const written = {};
for await (const p of r.fullStream) {
  if (p.type === 'tool-call') written[p.toolName] = (written[p.toolName] ?? 0) + JSON.stringify(p.input).length;
  if (p.type === 'tool-call') console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${p.toolName} ${JSON.stringify(p.input).slice(0, 100)}`);
  if (p.type === 'tool-result' && p.toolName === 'build_ui') console.log('   ->', JSON.stringify(p.output).slice(0, 300));
  if (p.type === 'text-delta') text += p.text;
  if (p.type === 'error') console.log('ERROR', p.error);
  if (p.type === 'tool-error') { console.log('   TOOL-ERROR', String(p.error?.message ?? p.error).slice(0, 400)); writeFileSync(`${out}/bad-${Date.now()}.txt`, typeof p.input === 'string' ? p.input : JSON.stringify(p.input)); }
}
const u = await r.totalUsage;
console.log(`total ${((Date.now() - t0) / 1000).toFixed(1)}s, in ${u.inputTokens} (cached ${u.inputTokenDetails?.cacheReadTokens ?? 0}) out ${u.outputTokens} (reasoning ${u.outputTokenDetails?.reasoningTokens ?? '?'})`);
const cost = ((u.inputTokens - (u.inputTokenDetails?.cacheReadTokens ?? 0)) * 0.95 + (u.inputTokenDetails?.cacheReadTokens ?? 0) * 0.19 + u.outputTokens * 4) / 1e6;
console.log(`cost $${cost.toFixed(4)}; tool-call chars ${JSON.stringify(written)}; reply chars ${text.length}\n${text}`);
