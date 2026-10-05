#!/usr/bin/env node
// A stand-in for Roblox's StudioMCP server, speaking the same line-delimited JSON-RPC over stdio, for the harness
// tests. It models a tiny place just enough for scripts/eval/run-piece.mjs to run end to end: whether a place is open,
// whether it is playing, what the world-state script's four modes answer, a PNG for screen_capture, a console.
//
// The scenario arrives as JSON in $FAKE_STUDIO:
//   noPlace            get_studio_state says "Place is not open"
//   second             list a second Studio instance (also without a place) to exercise the choice
//   world / ui         what the `measure` mode reports (a built world, a built screen UI, or nothing)
//   stuckDirty         `verify` always reports an extra instance (the reset cannot clean the place)
//   size               [w, h] of the pictures screen_capture returns
//   captureFailsInPlay screen_capture errors while the place is playing
//   playConsole        lines the play session adds to the console
//   serverErrors       errors the typed LogService reading finds
//   hang               a tool name that never answers (to exercise timeouts)
// It records every call to $FAKE_STUDIO_LOG (one JSON line each) so a test can see what was asked.
import { appendFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { createInterface } from 'node:readline';

const scenario = JSON.parse(process.env.FAKE_STUDIO ?? '{}');
const log = (o) => process.env.FAKE_STUDIO_LOG && appendFileSync(process.env.FAKE_STUDIO_LOG, JSON.stringify(o) + '\n');

let playing = false;
let captures = 0;
let consoleText = '-- Studio output --\nplugin loaded\n';

function crc32(buf) {
  let c;
  let crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(width, height, shade) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2; // 8-bit RGB
  const row = Buffer.alloc(1 + width * 3, shade);
  row[0] = 0;
  const raw = Buffer.alloc(row.length * height);
  for (let y = 0; y < height; y++) row.copy(raw, y * row.length);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const text = (t, isError = false) => ({ content: [{ type: 'text', text: t }], isError });
const baseline = {
  inventory: { Workspace: ['Workspace/Baseplate#Part', 'Workspace/SpawnLocation#SpawnLocation'], Lighting: [], ServerScriptService: [] },
  props: { Lighting: { ClockTime: 14 } },
  parts: { 'Workspace/Baseplate#Part': { class: 'Part', Size: [512, 20, 512], cframe: [0, -10, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] }, 'Workspace/SpawnLocation#SpawnLocation': { class: 'SpawnLocation', Size: [12, 1, 12], cframe: [0, 0.5, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1] } },
  terrainCells: 0,
};
const measureNothing = { addedInstances: 0, addedParts: 0, addedScripts: 0, addedByService: [], screenGuis: [], spawn: { position: [0, 0.5, 0], size: [12, 1, 12] }, viewport: [1280, 720], terrainCells: 0 };

function luau(code, dm) {
  if (/RunService"\):IsRunning/.test(code)) return playing && dm === 'Server' ? text('true') : text('not available in this mode', true);
  if (dm === 'Edit' && playing) return text('the Edit datamodel is not available while playing', true);
  if (/GetLogHistory/.test(code)) {
    if (!playing) return text('no play session', true);
    if (dm === 'Client') return text(JSON.stringify({ errors: scenario.clientErrors ?? 0, warnings: 0, first: [] }));
    return text(JSON.stringify({ errors: scenario.serverErrors ?? 0, warnings: scenario.serverWarnings ?? 0, first: [] }));
  }
  const mode = /local MODE = "(\w+)"/.exec(code)?.[1];
  if (mode === 'capture') return text(JSON.stringify(baseline));
  if (mode === 'reset') return text(JSON.stringify({ removedInstances: scenario.removed ?? 0, removedByService: scenario.removed ? { Workspace: scenario.removed } : [], restored: [], rebuilt: [], terrainCleared: false }));
  if (mode === 'verify') return text(JSON.stringify(scenario.stuckDirty ? { extra: ['Workspace/Junk#Part'], missing: [], propDiffs: [] } : { extra: [], missing: [], propDiffs: [] }));
  if (mode === 'measure') {
    const m = { ...measureNothing };
    if (scenario.world) Object.assign(m, { addedInstances: 9, addedParts: 8, bounds: scenario.world });
    if (scenario.ui) Object.assign(m, { addedInstances: m.addedInstances + 6, screenGuis: [{ name: 'ShopGui', enabled: true, guiObjects: 5, texts: 3 }] });
    if (scenario.emptyGui) m.screenGuis = [...m.screenGuis, { name: 'EmptyGui', enabled: true, guiObjects: 0, texts: 0 }];
    return text(JSON.stringify(m));
  }
  return text('"edit"');
}

function call(name, args) {
  if (scenario.hang === name) return null; // never answers
  log({ tool: name, args: { ...args, code: typeof args.code === 'string' ? args.code.slice(0, 60) : undefined } });
  if (name === 'list_roblox_studios') return text(JSON.stringify({ studios: [{ id: 'fake-1', name: null }, ...(scenario.second ? [{ id: 'fake-2', name: null }] : [])] }));
  if (name === 'get_studio_state') {
    if (scenario.noPlace || args.studio_id === 'fake-2') return text('Place is not open', true);
    return text(playing ? 'Place: EvalBaseplate | mode: Play' : 'Place: EvalBaseplate | mode: Edit');
  }
  if (name === 'execute_luau') return luau(args.code, args.datamodel_type);
  if (name === 'screen_capture') {
    if (playing && scenario.captureFailsInPlay) return text('screen_capture only works at edit time', true);
    captures++;
    const [w, h] = scenario.size ?? [64, 36];
    return { content: [{ type: 'image', data: png(w, h, (captures * 37) % 256).toString('base64'), mimeType: 'image/png' }], isError: false };
  }
  if (name === 'start_stop_play') {
    playing = args.is_start === true;
    if (playing) consoleText += (scenario.playConsole ?? ['Server started']).join('\n') + '\n';
    return text(playing ? 'play started' : 'play stopped');
  }
  if (name === 'get_console_output') return text(consoleText);
  return text(`unknown tool ${name}`, true);
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  const reply = (result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result }) + '\n');
  if (msg.method === 'initialize') return reply({ protocolVersion: '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'FakeStudio', version: '0' } });
  if (msg.method === 'tools/list') return reply({ tools: ['list_roblox_studios', 'get_studio_state', 'execute_luau', 'screen_capture', 'start_stop_play', 'get_console_output'].map((n) => ({ name: n, inputSchema: { type: 'object' } })) });
  if (msg.method === 'tools/call') {
    const r = call(msg.params.name, msg.params.arguments ?? {});
    if (r) reply(r);
    return;
  }
  if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } }) + '\n');
});
