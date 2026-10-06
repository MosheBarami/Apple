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
const mcp = read('../../worker/src/mcp.ts');
const mcpSurface = new Set([...mcp.slice(mcp.indexOf('export const MCP_TOOLS')).split('];')[0].matchAll(/tool: '([a-z_]+)'/g)].map((m) => m[1]));

test('the lists were read (a scrape that finds nothing checks nothing)', () => {
  assert.ok(reads.length >= 6 && writes.length >= 5, `reads ${reads}, writes ${writes}`);
});

test('every read tool is one the read-only MCP surface already serves', () => {
  for (const name of reads) assert.ok(mcpSurface.has(name), `${name} is not a read-only MCP tool`);
});

test('no Studio tool executes code, uploads, generates, spends credits or touches memory', () => {
  const forbidden = /^(run_luau|run_spec|insert_asset|insert_library_model|upload_|generate_|install_module|remember|create_checkpoint|more_tools)/;
  for (const name of [...reads, ...writes]) assert.doesNotMatch(name, forbidden, `${name} is not a Studio tool`);
});

test('M4 acceptance, on the new agent: 25 tools or fewer, instructions of 10,000 characters or fewer', () => {
  assert.ok(reads.length + writes.length <= 25, `${reads.length + writes.length} tools`);
  const agent = read('../src/agents/studpilot.ts');
  const instructions = /export const INSTRUCTIONS = `([^`]*)`/.exec(agent);
  assert.ok(instructions, 'the instructions are no longer one template literal this test can measure');
  assert.ok(instructions[1].length <= 10_000, `${instructions[1].length} characters`);
  assert.match(agent, /return INSTRUCTIONS;/);
});

test('the agent mounts exactly the generated tools, and generated.ts is current', () => {
  assert.match(read('../src/tools/studio.ts'), /STUDIO_TOOL_SPECS\.map\(/);
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

test('every agent route checks the caller owns the project before Flue sees it', () => {
  const app = read('../src/app.ts');
  const guard = app.indexOf('GATE.openProject(');
  assert.ok(guard > 0 && guard < app.indexOf('createAgentRouter(StudPilot)'));
});

test('the team: the coordinator only reads, only the builder edits, the tester may only add a play check', () => {
  const agent = read('../src/agents/studpilot.ts');
  assert.match(agent, /for \(const tool of pick\(READS\)\) useTool\(tool\);/, 'the coordinator mounts the read tools and nothing else');
  assert.match(agent, /const READS = STUDIO_TOOL_SPECS\.filter\(\(t\) => !t\.writes\)/);
  assert.match(agent, /const TEST = \[\.\.\.READS, 'play_check'\];/);
  const roles = agent.slice(agent.indexOf('const ROLES = {'), agent.indexOf('} as const;'));
  const toolsOf = (role) => new RegExp(`${role}: \\{[^}]*?tools: ([A-Z]+),`, 's').exec(roles)?.[1];
  assert.deepEqual(['planner', 'builder', 'reviewer', 'tester'].map(toolsOf), ['READS', 'BUILD', 'READS', 'TEST']);
});

test('the undo the agent promises exists: the app restores the checkpoint the session labels', () => {
  const api = read('../src/ui/api.ts');
  const label = /STUDIO_CHECKPOINT_LABEL = '([^']+)'/.exec(api)?.[1];
  assert.ok(label, 'the app no longer names the checkpoint it restores');
  const session = read('../../worker/src/do/session.ts');
  assert.ok(session.includes(`this.createCheckpoint('${label}'`), `the session no longer takes a checkpoint labelled "${label}"`);
  assert.match(read('../src/ui/app.tsx'), /<UndoChanges projectId=\{projectId\} busy=\{busy\} \/>/);
  assert.match(read('../src/agents/studpilot.ts'), /put back to a checkpoint/);
});

test('only an owner who may build can send to the Studio agent (its model time is not metered against Credits yet)', () => {
  const app = read('../src/app.ts');
  assert.match(app, /if \(c\.req\.method === 'POST' && !open\.canBuild\) \{\s*return c\.json\(/);
  const index = read('../../worker/src/index.ts');
  const open = index.slice(index.indexOf('async openProject('), index.indexOf('async callTool('));
  assert.match(open, /canBuild: buildApproved\(this\.env, ctx\.project\.owner_id\)/);
});
