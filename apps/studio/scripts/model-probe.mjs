// Time-to-first-token and first tool call for candidate models, through Workers AI's REST API, with the agent's real
// system prompt and tool schemas (tools answer with canned results). Usage: node scripts/model-probe.mjs "<request>" [model...]
import { streamText, isStepCount, jsonSchema, tool } from 'ai';
import { createWorkersAI } from 'workers-ai-provider';
import { STUDIO_TOOL_SPECS } from '../src/tools/generated.ts';
import { systemPrompt } from '../src/prompt.ts';

const request = process.argv[2] ?? 'make me a nice, cool admin panel';
const models = process.argv.slice(3).length ? process.argv.slice(3) : ['@cf/deepseek-ai/deepseek-v4-pro-0813', '@cf/moonshotai/kimi-k2.7-code', '@cf/deepseek-ai/deepseek-v4-flash-0731', '@cf/zai-org/glm-5.3-flash'];
const workersai = createWorkersAI({ accountId: process.env.CLOUDFLARE_ACCOUNT_ID, apiKey: process.env.CLOUDFLARE_API_TOKEN_MASTER });
const canned = { get_project_tree: 'game\n  Workspace (Baseplate, SpawnLocation)\n  StarterGui (empty)\n  ServerScriptService (empty)\n  ReplicatedStorage (empty)', list_scripts: '[]' };
const tools = Object.fromEntries(STUDIO_TOOL_SPECS.map((s) => [s.name, tool({ description: s.description, inputSchema: jsonSchema(s.parameters), execute: async () => canned[s.name] ?? '{"ok":true}' })]));
tools.load_skill = tool({ description: 'Load a skill', inputSchema: jsonSchema({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] }), execute: async () => 'skill body' });
for (const id of models) {
  const t0 = Date.now();
  let first = null, firstTool = null, text = '', reasoning = 0;
  const calls = [];
  try {
    const r = streamText({ model: workersai(id, { reasoning_effort: 'low' }), system: systemPrompt({ projectName: 'My Game', studio: { connected: true, placeName: 'Place1', placeId: 1 } }), prompt: request, tools, stopWhen: isStepCount(3), maxOutputTokens: 4000 });
    for await (const p of r.fullStream) {
      if (!first && (p.type === 'text-delta' || p.type === 'reasoning-delta')) first = Date.now() - t0;
      if (p.type === 'reasoning-delta') reasoning += p.text.length;
      if (p.type === 'text-delta') text += p.text;
      if (p.type === 'tool-call') { calls.push(p.toolName + ' ' + JSON.stringify(p.input).slice(0, 120)); if (!firstTool) firstTool = Date.now() - t0; }
      if (p.type === 'error') throw p.error;
    }
    const u = await r.totalUsage;
    console.log(`\n## ${id}\nfirst token ${first}ms, first tool ${firstTool}ms, total ${Date.now() - t0}ms, reasoning chars ${reasoning}, usage in ${u.inputTokens} (cached ${u.inputTokenDetails?.cacheReadTokens ?? 0}) out ${u.outputTokens}\ncalls: ${calls.join(' | ')}\ntext: ${text.slice(0, 400)}`);
  } catch (e) { console.log(`\n## ${id}\nERROR ${e?.message ?? e}`); }
}
