// What the Studio agent can reach, held to the code: the tool list, the gate, the session route, the limits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const surfaceSrc = read('../../worker/src/studio-surface.ts');
const listOf = (name) => [...surfaceSrc.slice(surfaceSrc.indexOf(`export const ${name}`)).split('] as const')[0].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
const reads = listOf('STUDIO_READ_TOOLS');
const writes = listOf('STUDIO_WRITE_TOOLS');

const agent = read('../src/agent.ts');
const server = read('../src/server.ts');
const tools = read('../src/tools.ts');
const metering = read('../src/metering.ts');
const localTools = [...tools.slice(tools.indexOf('export function knowledgeTools')).matchAll(/^    ([a-z_]+): tool\(/gm)].map((m) => m[1]);

test('the lists were read (a scrape that finds nothing checks nothing)', () => {
  assert.ok(reads.length >= 5 && writes.length >= 5 && localTools.length >= 4, `reads ${reads}, writes ${writes}, local ${localTools}`);
});

// 25 was the old plan's M3/M4 cap. The owner's handoff of 2026-10-09 asks for capabilities the 25 lacked: seeing the
// work (section 9: render_view) and sound that reaches the game (section 8: generate_sound with upload). The cap still
// holds the surface small; raising it again needs a capability the handoff names.
test('the agent is offered 27 tools or fewer', () => {
  const total = reads.length + writes.length + localTools.length;
  assert.ok(total <= 27, `${total} tools`);
});

test('no premade content reaches the agent: no kits, blocks, verified modules, library or presets', () => {
  const banned = /^(build_blocks|build_studded_ui|insert_ui_component|get_genre_kit|get_ui_construction|find_mechanic|get_verified_module|install_module|set_mood|add_effect|add_behaviour|build_object|dress_object|.*library.*|find_sound|insert_sound|find_vfx|insert_vfx|find_ui_asset|find_verified_asset)$/;
  for (const name of [...reads, ...writes, ...localTools]) assert.doesNotMatch(name, banned, `${name} is premade content`);
});

test('one agent: no sub-agents, roles or delegation', () => {
  for (const src of [agent.replace(/\/\*\*[\s\S]*?\*\//g, ""), read("../src/prompt.ts")]) {
    assert.doesNotMatch(src, /useSubagent|planner|reviewer|tester|coordinator|delegate/i);
  }
});

test('the agent mounts exactly the generated tools, and generated.ts is current', () => {
  assert.match(tools, /for \(const spec of STUDIO_TOOL_SPECS\)/);
  const script = fileURLToPath(new URL('../scripts/gen-tools.mjs', import.meta.url));
  execFileSync('node', [script, '--check'], { stdio: 'pipe' }); // throws when stale
});

test('the gate serves only STUDIO_TOOLS, and only for a project the owner check granted', () => {
  const index = read('../../worker/src/index.ts');
  const gate = index.slice(index.indexOf('export class StudioGate'));
  const callTool = gate.slice(gate.indexOf('async callTool'), gate.indexOf('async callTool') + 700);
  assert.match(callTool, /if \(!STUDIO_TOOLS\.includes\(name\)\) return \{ ok: false/);
  assert.match(callTool, /await studioGrantedStub\(this\.env, projectId\);\s*if \(!stub\)/);
  assert.match(callTool, /'https:\/\/do\/studio-tool'/);
});

test('the session route checks the list again, and checkpoints before a write', () => {
  const session = read('../../worker/src/do/session.ts');
  const start = session.indexOf("path === '/studio-tool'");
  assert.ok(start > 0, 'the /studio-tool route is gone');
  const route = session.slice(start, session.indexOf('if (path === ', start + 1));
  assert.match(route, /!STUDIO_TOOLS\.includes\(tool\)\) \{\s*return json\(/);
  const write = route.indexOf('if (isStudioWriteTool(tool))');
  const approved = route.indexOf('buildApproved(this.env, bind.ownerId)');
  const checkpoint = route.indexOf('this.createCheckpoint(');
  const runs = route.indexOf('runTool(');
  assert.ok(write > 0 && write < approved && approved < checkpoint && checkpoint < runs, 'approval, then checkpoint, then the tool');
});

test('every agent request is checked against the project owner before the agent sees it', () => {
  const guard = server.indexOf('GATE.openProject(');
  const forward = server.indexOf('agent.fetch(');
  assert.ok(guard > 0 && forward > guard, 'openProject before the agent');
  assert.match(server, /if \(!open\.ok\) return/);
  assert.match(server, /getAgentByName\(env\.StudPilotAgent, projectId\)/);
  assert.match(server, /url\.searchParams\.delete\('token'\)/);
});

test('a message is admitted only for an owner who may build and has Credits left', () => {
  const run = agent.slice(agent.indexOf('execute: async'));
  const build = run.indexOf('project.canBuild');
  const spend = run.indexOf('GATE.canSpend(');
  const model = run.indexOf('streamText(');
  assert.ok(build > 0 && spend > build && model > spend, 'build gate, then Credits, then the model');
});

test('every model call is reserved against the shared budget first, and settled or released after', () => {
  const reserve = metering.indexOf('GATE.reserveModel(');
  const call = metering.indexOf('env.AI.run');
  assert.ok(reserve > 0 && call > reserve);
  assert.match(metering, /if \(!hold\.ok\) throw/);
  assert.match(metering, /GATE\.settleModel\(/);
  // A stream is settled at the step's real usage, never at its reservation.
  assert.match(agent, /await settleNext\(this\.env, holds,/);
  assert.match(agent, /releaseAll\(this\.env, holds\)/);
  assert.match(metering, /catch \(e\) \{\s*await env\.GATE\.releaseModel\(/);
  assert.match(agent, /binding: meteredAi\(this\.env, holds\)/);
});

test('Credits are charged from each step\'s real usage and streamed to the chat', () => {
  assert.match(agent, /onStepFinish: async \(\{ usage \}\) => \{\s*await charge\(usage\)/);
  assert.match(agent, /GATE\.chargeUsage\(projectId, model,/);
  assert.match(agent, /type: 'data-credits'/);
});
