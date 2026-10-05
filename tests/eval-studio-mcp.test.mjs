/**
 * scripts/eval/lib/studio-mcp.mjs: the minimal MCP stdio client. It must never hang (every request has a timeout, a dead
 * server rejects everything pending), must read a tool's answer into { ok, text, json, images }, and must tolerate a
 * server that prints a log line or sends its own request.
 *
 * Servers here are tiny node programs passed with `node -e`, so the client is exercised over a real pipe.
 *
 * Run with:  node --test tests/eval-studio-mcp.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { McpError, StudioMcpClient, listStudios, normaliseToolResult, studioTools } from '../scripts/eval/lib/studio-mcp.mjs';

const SERVER_PRELUDE = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
`;
const server = (body) => ({ command: process.execPath, args: ['-e', SERVER_PRELUDE + body] });

const WELL_BEHAVED = `
rl.on('line', (l) => {
  const m = JSON.parse(l);
  if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'T', version: '1' } } });
  if (m.method === 'tools/list') return send({ jsonrpc: '2.0', id: m.id, result: { tools: [{ name: 'echo' }] } });
  if (m.method === 'tools/call' && m.params.name === 'echo') return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ got: m.params.arguments }) }], isError: false } });
  if (m.method === 'tools/call' && m.params.name === 'boom') return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: 'Place is not open' }], isError: true } });
  if (m.method === 'tools/call' && m.params.name === 'shot') return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'image', data: 'QUJD', mimeType: 'image/png' }] } });
  if (m.method === 'tools/call' && m.params.name === 'rpcerror') return send({ jsonrpc: '2.0', id: m.id, error: { code: -32000, message: 'nope' } });
  if (m.method === 'tools/call' && m.params.name === 'hang') return;
  if (m.method === 'tools/call' && m.params.name === 'die') process.exit(3);
});`;

async function connect(body = WELL_BEHAVED, opts = {}) {
  return new StudioMcpClient({ ...server(body), ...opts }).start();
}

test('it initialises, lists tools and calls one, reading the answer into text and json', async () => {
  const c = await connect();
  try {
    assert.deepEqual(c.serverInfo, { name: 'T', version: '1' });
    assert.deepEqual((await c.listTools()).map((t) => t.name), ['echo']);
    const r = await c.callTool('echo', { a: 1 });
    assert.equal(r.ok, true);
    assert.deepEqual(r.json, { got: { a: 1 } });
  } finally {
    await c.close();
  }
});

test('a tool-level error is ok:false with its text, not an exception; an image item comes back as an image', async () => {
  const c = await connect();
  try {
    const e = await c.callTool('boom');
    assert.equal(e.ok, false);
    assert.equal(e.text, 'Place is not open');
    const s = await c.callTool('shot');
    assert.deepEqual(s.images, [{ mimeType: 'image/png', data: 'QUJD' }]);
    await assert.rejects(c.callTool('rpcerror'), (err) => err instanceof McpError && /nope/.test(err.message) && err.code === -32000);
  } finally {
    await c.close();
  }
});

test('EVERY REQUEST HAS A TIMEOUT: a tool that never answers rejects with timedOut, and the client is still usable', async () => {
  const c = await connect(WELL_BEHAVED, { callTimeoutMs: 5000 });
  try {
    const t0 = Date.now();
    await assert.rejects(c.callTool('hang', {}, { timeoutMs: 150 }), (err) => err instanceof McpError && err.timedOut === true && /timed out after 150 ms/.test(err.message));
    assert.ok(Date.now() - t0 < 2000);
    assert.equal((await c.callTool('echo', { still: 'works' })).ok, true, 'a timed-out request does not poison the connection');
  } finally {
    await c.close();
  }
});

test('A SERVER THAT DIES REJECTS WHAT IS PENDING instead of hanging, and later calls fail at once', async () => {
  const c = await connect();
  const pending = c.callTool('die', {}, { timeoutMs: 10_000 });
  await assert.rejects(pending, /MCP server exited \(code 3/);
  await assert.rejects(c.callTool('echo'), /not running/);
  await c.close();
});

test('a server that never answers initialize is given up on at the init timeout', async () => {
  const c = new StudioMcpClient({ ...server('rl.on("line", () => {});'), initTimeoutMs: 200 });
  await assert.rejects(c.start(), /initialize timed out after 200 ms/);
  await c.close();
});

test('a binary that does not exist is a McpError, not a crash', async () => {
  const c = new StudioMcpClient({ command: '/no/such/StudioMCP' });
  await assert.rejects(c.start(), (err) => err instanceof McpError && /could not start/.test(err.message));
});

test('log lines on stdout are skipped, and a request from the server (ping) is answered', async () => {
  const body = `
  send({ note: 'this is a log object, not a response' });
  process.stdout.write('plain log line\\n');
  let pinged = false;
  rl.on('line', (l) => {
    const m = JSON.parse(l);
    if (m.method === 'initialize') { send({ jsonrpc: '2.0', id: 77, method: 'ping' }); return send({ jsonrpc: '2.0', id: m.id, result: { serverInfo: { name: 'P' } } }); }
    if (m.id === 77) { pinged = true; return; }
    if (m.method === 'tools/call') return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ pinged }) }] } });
  });`;
  const c = await connect(body);
  try {
    await new Promise((r) => setTimeout(r, 100));
    assert.deepEqual((await c.callTool('x')).json, { pinged: true });
  } finally {
    await c.close();
  }
});

test('studioTools binds the Studio id and the argument names the MCP server expects; listStudios reads the ids', async () => {
  const seen = [];
  const body = `
  rl.on('line', (l) => {
    const m = JSON.parse(l);
    if (m.method === 'initialize') return send({ jsonrpc: '2.0', id: m.id, result: {} });
    if (m.method === 'tools/call') {
      if (m.params.name === 'list_roblox_studios') return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: '{"studios":[{"id":"S1","name":null}]}' }] } });
      return send({ jsonrpc: '2.0', id: m.id, result: { content: [{ type: 'text', text: JSON.stringify({ name: m.params.name, args: m.params.arguments }) }] } });
    }
  });`;
  const c = await connect(body);
  try {
    assert.deepEqual((await listStudios(c)).studios, [{ id: 'S1', name: null }]);
    const t = studioTools(c, 'S1');
    assert.deepEqual((await t.luau('return 1', 'Server')).json, { name: 'execute_luau', args: { code: 'return 1', datamodel_type: 'Server', studio_id: 'S1' } });
    assert.deepEqual((await t.capture('ScreenCapture_1', { position: [1, 2, 3], lookAt: [4, 5, 6] })).json.args, { capture_id: 'ScreenCapture_1', camera_position: [1, 2, 3], look_at_position: [4, 5, 6], studio_id: 'S1' });
    assert.deepEqual((await t.capture('ScreenCapture_2')).json.args, { capture_id: 'ScreenCapture_2', studio_id: 'S1' }, 'no camera means the Studio camera is left alone');
    assert.deepEqual((await t.play(true)).json.args, { is_start: true, studio_id: 'S1' });
    assert.equal((await t.state()).json.name, 'get_studio_state');
    assert.equal((await t.console()).json.name, 'get_console_output');
    seen.push(1);
  } finally {
    await c.close();
  }
  assert.equal(seen.length, 1);
});

test('normaliseToolResult copes with an empty or odd result', () => {
  assert.deepEqual(normaliseToolResult(undefined), { ok: true, text: '', json: undefined, images: [], raw: undefined });
  assert.equal(normaliseToolResult({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] }).text, 'a\nb');
  assert.equal(normaliseToolResult({ content: [{ type: 'text', text: 'x' }], isError: true }).ok, false);
});

test('closing is safe twice and never leaves the child running', async () => {
  const c = await connect();
  await c.close();
  await c.close();
  assert.ok(c.exited, 'the child exited');
});
