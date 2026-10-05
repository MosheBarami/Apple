// The Studio agent may only call tools the main worker serves on its read-only MCP surface (StudioGate).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const tools = read('../src/tools/studio.ts');
const mcp = read('../../worker/src/mcp.ts');

const surface = new Set([...mcp.slice(mcp.indexOf('export const MCP_TOOLS')).split('];')[0].matchAll(/tool: '([a-z_]+)'/g)].map((m) => m[1]));
const called = [...tools.matchAll(/call\(projectId, '([a-z_]+)'/g)].map((m) => m[1]);

test('the read-only MCP surface was found', () => {
  assert.ok(surface.has('read_script') && surface.size >= 10, `found ${[...surface]}`);
});

test('every tool the Studio agent calls is on the read-only MCP surface', () => {
  assert.ok(called.length >= 6, `found ${called}`);
  for (const name of called) assert.ok(surface.has(name), `${name} is not on the MCP surface`);
});

test('the gate refuses anything that is not on that surface', () => {
  const index = read('../../worker/src/index.ts');
  const gate = index.slice(index.indexOf('export class StudioGate'));
  const callTool = gate.slice(gate.indexOf('async callTool'), gate.indexOf('async callTool') + 600);
  assert.match(callTool, /const entry = mcpTool\(name\);\s*if \(!entry/);
});

test('every agent route checks the caller owns the project before Flue sees it', () => {
  const app = read('../src/app.ts');
  const guard = app.indexOf('GATE.openProject(');
  assert.ok(guard > 0 && guard < app.indexOf('createAgentRouter(StudPilot)'));
});
