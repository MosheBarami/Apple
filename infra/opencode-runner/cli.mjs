import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, isAbsolute } from 'node:path';

export const OPENCODE_VERSION = '1.18.23';
export const MAX_INPUT_BYTES = 512 * 1024;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

export class RunnerError extends Error {
  constructor(code, message) { super(message); this.name = 'RunnerError'; this.code = code; }
}

/** No host env spreading. HOME, XDG roots and cwd are new per invocation; no personal config. */
export async function isolatedEnvironment(root, { apiKey, model, modelInfo, maxTokens = 6500 } = {}) {
  const paths = { home: join(root, 'home'), config: join(root, 'config'), data: join(root, 'data'),
    cache: join(root, 'cache'), state: join(root, 'state'), work: join(root, 'work') };
  await Promise.all(Object.values(paths).map((path) => mkdir(path, { recursive: true, mode: 0o700 })));
  const config = {
    enabled_providers: ['opencode'], model, small_model: model, share: 'disabled', autoupdate: false,
    plugin: [], mcp: {}, instructions: [], permission: { '*': 'deny' },
    default_agent: 'studpilot-inference',
    agent: {
      // Retain OpenCode's own provider system prompt and identity. Never spoof its identity
      // with a hand-written prompt or headers to defeat a free-tier access restriction.
      'studpilot-inference': { mode: 'primary', permission: { '*': 'deny' }, steps: 1,
        options: { maxTokens } },
      title: { disable: true }, summary: { disable: true }, compaction: { disable: true },
    },
    provider: { opencode: {
      ...(modelInfo ? { whitelist: [modelInfo.id], models: { [modelInfo.id]: {
        id: modelInfo.api.id, name: modelInfo.name, provider: { npm: modelInfo.api.npm, api: modelInfo.api.url },
        limit: { ...modelInfo.limit, output: Math.min(modelInfo.limit.output, maxTokens) },
        cost: { input: modelInfo.cost.input, output: modelInfo.cost.output,
          cache_read: modelInfo.cost.cache?.read ?? 0, cache_write: modelInfo.cost.cache?.write ?? 0 },
        temperature: modelInfo.capabilities.temperature, reasoning: modelInfo.capabilities.reasoning,
        tool_call: modelInfo.capabilities.toolcall, attachment: false,
        modalities: { input: ['text'], output: ['text'] }, interleaved: modelInfo.capabilities.interleaved,
      } } } : {}),
      options: { ...(apiKey ? { apiKey: '{env:OPENCODE_API_KEY}' } : {}) },
    } },
  };
  const configFile = join(paths.config, 'opencode.json');
  await writeFile(configFile, JSON.stringify(config), { mode: 0o600 });
  return {
    cwd: paths.work,
    env: {
      PATH: '/usr/local/bin:/usr/bin:/bin', HOME: paths.home, PWD: paths.work,
      XDG_CONFIG_HOME: paths.config, XDG_DATA_HOME: paths.data, XDG_CACHE_HOME: paths.cache,
      XDG_STATE_HOME: paths.state, TMPDIR: root, LANG: 'en_US.UTF-8',
      OPENCODE_CONFIG: configFile, OPENCODE_CONFIG_DIR: paths.config,
      OPENCODE_DISABLE_AUTOUPDATE: 'true', OPENCODE_DISABLE_DEFAULT_PLUGINS: 'true',
      OPENCODE_DISABLE_CLAUDE_CODE: 'true', OPENCODE_DISABLE_CLAUDE_CODE_PROMPT: 'true',
      OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: 'true', OPENCODE_DISABLE_LSP_DOWNLOAD: 'true',
      ...(apiKey ? { OPENCODE_API_KEY: apiKey } : {}),
    },
  };
}

/** Validate semantic completion, not just exit status. Unexpected CLI tool execution fails closed. */
export function createEventParser({ onText = () => {} } = {}) {
  let pending = '', bytes = 0, text = '', finish = null, started = false;
  const decoder = new TextDecoder();
  const seenParts = new Set();
  const accept = (line) => {
    if (!line.trim()) return;
    let event;
    try { event = JSON.parse(line); } catch { throw new RunnerError('invalid_events', 'Runner returned invalid JSON events.'); }
    if (event.type === 'error') {
      const error = new RunnerError('inference_error', 'OpenCode rejected inference. Check model access and quota.');
      // Diagnostics are closed vocabulary, never the provider's message/body (which can echo input).
      const name = event.error?.name;
      error.category = ['APIError', 'ProviderAuthError', 'UnknownError', 'MessageOutputLengthError'].includes(name) ? name : 'unknown';
      const status = event.error?.data?.statusCode;
      error.status = Number.isInteger(status) && status >= 400 && status <= 599 ? status : null;
      const detail = JSON.stringify(event.error ?? {});
      error.access = /FreeTierError|free tier.*only|only.*opencode/i.test(detail) ? 'free_tier_restriction'
        : /unauthorized|invalid.*key|authentication/i.test(detail) ? 'credentials'
        : /rate.limit|quota|capacity/i.test(detail) ? 'capacity' : 'unknown';
      error.diagnosticTerms = [...new Set(detail.match(/\b(?:agent|title|undefined|null|provider|model|config|permission|summary|token|not found|TypeError|SyntaxError|ReferenceError|invalid|URL|ENOENT|EACCES|ENOTFOUND|fetch|certificate|SSL|TLS|socket|connection|network|ECONNREFUSED|ECONNRESET)\b/gi) ?? [])];
      Object.defineProperty(error, 'localDiagnostic', { value: typeof event.error?.data?.message === 'string'
        ? event.error.data.message : 'No diagnostic message supplied.' });
      throw error;
    }
    if (event.type === 'tool_use' || event.part?.type === 'tool') {
      throw new RunnerError('isolation_violation', 'An internal OpenCode tool was requested.');
    }
    if (event.type === 'step_start') started = true;
    if (event.type === 'text') {
      if (typeof event.part?.text !== 'string') throw new RunnerError('invalid_events', 'Missing text event content.');
      if (event.part.id && seenParts.has(event.part.id)) return;
      if (event.part.id) seenParts.add(event.part.id);
      text += event.part.text; onText(event.part.text);
    }
    if (event.type === 'step_finish') {
      if (finish) throw new RunnerError('unexpected_steps', 'Inference exceeded its single-step contract.');
      finish = event.part;
    }
  };
  return {
    push(chunk) {
      bytes += Buffer.byteLength(chunk);
      if (bytes > MAX_OUTPUT_BYTES) throw new RunnerError('output_limit', 'Runner output exceeded its limit.');
      pending += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true });
      let pos;
      while ((pos = pending.indexOf('\n')) >= 0) { accept(pending.slice(0, pos)); pending = pending.slice(pos + 1); }
    },
    end(exitCode) {
      pending += decoder.decode(); if (pending.trim()) accept(pending);
      if (exitCode !== 0) throw new RunnerError('process_failed', 'OpenCode inference process failed.');
      if (!started || !finish || !text.trim()) throw new RunnerError('incomplete', 'OpenCode did not produce a complete result.');
      if (finish.reason !== 'stop') throw new RunnerError('incomplete', 'OpenCode did not finish normally.');
      if (typeof finish.cost !== 'number' || finish.cost !== 0) {
        throw new RunnerError('not_free', 'The selected route did not report zero inference cost.');
      }
      const count = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : null;
      return { text, finishReason: 'stop', cost: 0, usage: { inputTokens: count(finish.tokens?.input),
        outputTokens: count(finish.tokens?.output), cachedInputTokens: count(finish.tokens?.cache?.read),
        reasoningTokens: count(finish.tokens?.reasoning) } };
    },
  };
}

export async function runProcess({ executable, args, input = '', signal, timeoutMs = 120_000,
  environment, onStdout = () => {}, onDiagnostic }) {
  if (!isAbsolute(executable)) throw new RunnerError('config', 'The runner executable must be an absolute path.');
  if (Buffer.byteLength(input) > MAX_INPUT_BYTES) throw new RunnerError('input_limit', 'Inference input exceeded its limit.');
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { ...environment, shell: false, detached: process.platform !== 'win32',
      stdio: ['pipe', 'pipe', 'pipe'] });
    let failure, settled = false, bytes = 0, killTimer;
    const kill = () => {
      if (!child.pid) return;
      try { if (process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL'); else child.kill('SIGKILL'); } catch { /* exited */ }
    };
    const stop = (error) => {
      if (failure) return; failure = error;
      // Kill the entire process group, including an in-process server's helper children.
      try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, 'SIGTERM'); else child.kill('SIGTERM'); } catch { /* exited */ }
      killTimer = setTimeout(kill, 1000); killTimer.unref();
    };
    const abort = () => stop(new RunnerError('cancelled', 'Inference was cancelled.'));
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop(new RunnerError('timeout', 'OpenCode inference timed out.')), timeoutMs);
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > MAX_OUTPUT_BYTES) return stop(new RunnerError('output_limit', 'Runner output exceeded its limit.'));
      try { onStdout(chunk); } catch (error) { stop(error); }
    });
    // Drain stderr, never log it or return it: CLI errors can contain credentials and prompts.
    child.stderr.on('data', (chunk) => { onDiagnostic?.(chunk); });
    child.stdin.on('error', () => {});
    const finish = (error, code) => {
      if (settled) return; settled = true; clearTimeout(timer); clearTimeout(killTimer);
      signal?.removeEventListener('abort', abort);
      kill();
      if (failure || error) reject(failure ?? new RunnerError('process_failed', 'Runner could not start OpenCode.'));
      else resolve(code);
    };
    child.on('error', (error) => finish(error));
    child.on('close', (code) => finish(null, code));
    child.stdin.end(input);
  });
}

export async function invokeCli({ executable, modelId, allowedModels, apiKey, input, prompt, signal,
  timeoutMs, maxTokens, modelInfo, onText, onDiagnostic }) {
  if (!allowedModels.has(modelId)) throw new RunnerError('model_unavailable', 'This model is not in the verified free allowlist.');
  if (modelInfo?.id !== modelId || modelInfo.cost?.input !== 0 || modelInfo.cost?.output !== 0
    || modelInfo.api?.url !== 'https://opencode.ai/zen/v1') {
    throw new RunnerError('catalog_invalid', 'A pinned free catalog record is required for inference.');
  }
  const root = await mkdtemp(join(tmpdir(), 'studpilot-inference-'));
  try {
    const environment = await isolatedEnvironment(root, { apiKey, model: `opencode/${modelId}`, modelInfo, maxTokens });
    const parser = createEventParser({ onText });
    const code = await runProcess({ executable, args: ['run', '--pure', '--model', `opencode/${modelId}`,
      '--agent', 'studpilot-inference', '--format', 'json', ...(onDiagnostic ? ['--print-logs'] : [])],
      input: prompt ? JSON.stringify({ instructions: prompt, request: input }) : input,
      environment, signal, timeoutMs, onDiagnostic,
      onStdout: (chunk) => parser.push(chunk) });
    return { ...parser.end(code), model: modelId, provider: 'opencode', cliVersion: OPENCODE_VERSION };
  } finally { await rm(root, { recursive: true, force: true }); }
}
