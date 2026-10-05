// A minimal MCP client for Roblox's Studio MCP server (a stdio server that ships inside
// RobloxStudio.app). It speaks line-delimited JSON-RPC 2.0: initialize, notifications/initialized,
// tools/list, tools/call. Every request has its own timeout, a dead server rejects everything
// pending instead of hanging, and a tool's answer is normalised to { ok, text, json, images }.
//
// It runs ALONGSIDE Claude Code's own connection to the same server (Studio accepts several
// clients); it never starts or stops Studio and it publishes nothing.
//
// Used by scripts/eval/run-piece.mjs. Tests drive it against a fake server (tests/eval-studio-mcp.test.mjs).
import { spawn } from 'node:child_process';

export const DEFAULT_STUDIO_MCP_BIN = '/Applications/RobloxStudio.app/Contents/MacOS/StudioMCP';
export const PROTOCOL_VERSION = '2025-06-18';

export class McpError extends Error {
  constructor(message, { method, timedOut = false, code } = {}) {
    super(message);
    this.name = 'McpError';
    this.method = method;
    this.timedOut = timedOut;
    this.code = code;
  }
}

/** Turn a tools/call result into { ok, text, json, images, raw }. `ok` is false when the server set isError. */
export function normaliseToolResult(result) {
  const content = Array.isArray(result?.content) ? result.content : [];
  const text = content.filter((c) => c?.type === 'text').map((c) => String(c.text ?? '')).join('\n');
  const images = content
    .filter((c) => c?.type === 'image' && typeof c.data === 'string')
    .map((c) => ({ mimeType: c.mimeType ?? 'image/png', data: c.data }));
  let json;
  try {
    json = text ? JSON.parse(text) : undefined;
  } catch {
    json = undefined;
  }
  return { ok: result?.isError !== true, text, json, images, raw: result };
}

export class StudioMcpClient {
  /**
   * @param {object} [o]
   * @param {string} [o.command]       the server binary (default: Studio's own, or $STUDIO_MCP_BIN)
   * @param {string[]} [o.args]
   * @param {number} [o.initTimeoutMs]
   * @param {number} [o.callTimeoutMs] the default per-request timeout
   * @param {Function} [o.spawnImpl]   child_process.spawn, replaceable in tests
   */
  constructor({ command, args = [], initTimeoutMs = 20_000, callTimeoutMs = 60_000, spawnImpl = spawn } = {}) {
    this.command = command ?? process.env.STUDIO_MCP_BIN ?? DEFAULT_STUDIO_MCP_BIN;
    this.args = args;
    this.initTimeoutMs = initTimeoutMs;
    this.callTimeoutMs = callTimeoutMs;
    this.spawnImpl = spawnImpl;
    this.child = null;
    this.nextId = 0;
    this.pending = new Map();
    this.buffer = '';
    this.stderrTail = '';
    this.exited = null;
    this.serverInfo = null;
  }

  async start() {
    if (this.child) throw new McpError('client already started');
    const child = this.spawnImpl(this.command, this.args, { stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stdout.on('data', (d) => this.#onData(String(d)));
    child.stderr.on('data', (d) => {
      this.stderrTail = (this.stderrTail + String(d)).slice(-2000);
    });
    child.on('error', (e) => this.#fail(new McpError(`could not start ${this.command}: ${e.message}`)));
    child.on('exit', (code, signal) => {
      this.exited = { code, signal };
      this.#fail(new McpError(`MCP server exited (code ${code}, signal ${signal}) ${this.stderrTail.trim().slice(-200)}`.trim()));
    });
    const init = await this.request(
      'initialize',
      { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'studpilot-eval', version: '1' } },
      { timeoutMs: this.initTimeoutMs },
    );
    this.serverInfo = init?.serverInfo ?? null;
    this.notify('notifications/initialized');
    return this;
  }

  #onData(chunk) {
    this.buffer += chunk;
    let i;
    while ((i = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, i).trim();
      this.buffer = this.buffer.slice(i + 1);
      if (!line) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue; // a server may print a log line on stdout; JSON-RPC frames are the only lines that parse
      }
      if (msg.id !== undefined && this.pending.has(msg.id) && (msg.result !== undefined || msg.error !== undefined)) {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.error) p.reject(new McpError(`${p.method}: ${msg.error.message ?? 'error'}`, { method: p.method, code: msg.error.code }));
        else p.resolve(msg.result);
      } else if (msg.method && msg.id !== undefined) {
        // a request from the server (ping, roots/list...): answer politely so it never waits on us
        const reply = msg.method === 'ping' ? { jsonrpc: '2.0', id: msg.id, result: {} } : { jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'not supported' } };
        this.child?.stdin?.write(JSON.stringify(reply) + '\n');
      }
    }
  }

  #fail(err) {
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
      this.pending.delete(id);
    }
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}) }) + '\n');
  }

  request(method, params, { timeoutMs = this.callTimeoutMs } = {}) {
    if (!this.child || this.exited) return Promise.reject(new McpError(`MCP server is not running (${method})`, { method }));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpError(`${method} timed out after ${timeoutMs} ms`, { method, timedOut: true }));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new McpError(`${method}: ${e.message}`, { method }));
      }
    });
  }

  async listTools(opts) {
    const r = await this.request('tools/list', {}, opts);
    return r?.tools ?? [];
  }

  /** Call a tool and normalise the answer. Throws McpError on a protocol failure or a timeout; a tool-level error is `ok: false`. */
  async callTool(name, args = {}, opts) {
    const r = await this.request('tools/call', { name, arguments: args }, opts);
    return normaliseToolResult(r);
  }

  async close() {
    const child = this.child;
    if (!child || this.exited) return;
    this.#fail(new McpError('client closed'));
    child.stdin.end();
    await new Promise((resolve) => {
      const t = setTimeout(() => {
        child.kill('SIGKILL');
        resolve();
      }, 2000);
      child.once('exit', () => {
        clearTimeout(t);
        resolve();
      });
      child.kill();
    });
  }
}

/** Bind the tools the harness uses to one Studio instance, so call sites read as intent. */
export function studioTools(client, studioId) {
  const call = (name, args, opts) => client.callTool(name, { ...args, studio_id: studioId }, opts);
  return {
    studioId,
    state: (opts) => call('get_studio_state', {}, opts),
    luau: (code, datamodel = 'Edit', opts) => call('execute_luau', { code, datamodel_type: datamodel }, opts),
    capture: (captureId, camera, opts) =>
      call('screen_capture', { capture_id: captureId, ...(camera ? { camera_position: camera.position, look_at_position: camera.lookAt } : {}) }, opts),
    play: (isStart, opts) => call('start_stop_play', { is_start: isStart }, opts),
    console: (opts) => call('get_console_output', {}, opts),
  };
}

/** The ids of the Studio instances the MCP server can reach (list_roblox_studios). */
export async function listStudios(client, opts) {
  const r = await client.callTool('list_roblox_studios', {}, opts);
  return { ok: r.ok, studios: Array.isArray(r.json?.studios) ? r.json.studios : [], text: r.text };
}
