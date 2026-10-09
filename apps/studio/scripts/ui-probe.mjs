// Runs the agent's model on a UI request with the real build_ui schema and ui-design skill; build_ui is answered by the
// worker's real compiler (no Studio), and each compiled screen is written to <out>/<name>.json for rendering.
// Usage: node scripts/ui-probe.mjs "<request>" <outDir> [model]
import { streamText, isStepCount, jsonSchema, tool } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { mkdirSync, writeFileSync } from 'node:fs';
import { STUDIO_TOOL_SPECS } from '../src/tools/generated.ts';
import { systemPrompt } from '../src/prompt.ts';
import { SKILLS } from '../src/skills.generated.ts';
import { unwrapQuotedToolInput } from '../src/token-saver.ts';
import { compileScreen } from '../../worker/src/ui-engine.ts';

const [request, out, model = '@cf/moonshotai/kimi-k2.7-code'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const workersai = createWorkersAI({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiKey: process.env.CLOUDFLARE_API_TOKEN_MASTER });
const canned = { get_project_tree: 'game\n  Workspace (Baseplate, SpawnLocation)\n  StarterGui (empty)\n  ServerScriptService (empty)\n  ReplicatedStorage (empty)', list_scripts: '[]' };
const tools = Object.fromEntries(STUDIO_TOOL_SPECS.map((s) => [s.name, tool({ description: s.description, inputSchema: jsonSchema(s.parameters), execute: async (a) => {
  if (s.name === 'build_ui') {
    writeFileSync(`${out}/input-${Date.now()}.json`, JSON.stringify(a, null, 1));
    const c = compileScreen(a);
    if ('error' in c) return c;
    writeFileSync(`${out}/${c.name}.json`, JSON.stringify(c.item, null, 1));
    return { ok: true, screen: c.name, instances: c.count, warnings: c.warnings, defects: [], note: 'measured in Studio: none reported (probe)' };
  }
  return canned[s.name] ?? '{"ok":true}';
} })]));
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
