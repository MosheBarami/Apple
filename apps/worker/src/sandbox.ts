// THE CODE-EXECUTION CONTRACT: what may run, where it may run, and what the ceiling actually is.
//
// Golem executes model-authored code in four runtimes, and until this file there was no single
// place that said so. `run_luau` sent `timeoutMs: 10_000` to a plugin that has never read the
// field; `run_spec` sent 20_000 to the same handler; the eval and training lanes shell out to
// `node`, `python3` and `luau` with no ceiling at all. Four call sites, four different ideas of
// what a limit was, and nothing anywhere that a reader could consult to learn which of them were
// enforced. This is that file.
//
// WHAT IT IS. Admission control plus a declared enforcement profile:
//
//   admitProgram({ runtime, backend, source, limits })
//       -> SandboxJob      the program may run, with the limits that will actually apply
//       -> SandboxRefusal  it may not, with a code and a sentence saying why
//
// The job it returns carries an `enforcement` block describing, per dimension, HOW the limit is
// kept: killed, killed after a poll, truncated, truncated only after the bytes already crossed the
// wire, or not enforced at all. That block is the point of the file. A ceiling that is merely
// declared is not a ceiling, and a caller that cannot tell the difference will build on the
// stronger reading every time. §FAILURES: a failure to observe must not render as an observation —
// so an unenforceable dimension says `unenforced` here rather than carrying a number that looks
// like a guarantee.
//
// TWO BACKENDS, ONE CONTRACT.
//   * `studio` — the Roblox Studio plugin's `run_code` op. This is the backend `run_luau` and
//     `run_spec` use. It CANNOT kill a running chunk: `pcall(require, module)` runs on Studio's
//     main thread with no instruction budget (see the note above `refuseNonYieldingLoop` in
//     Ops.luau), so a wall-clock number here stops the WORKER waiting, not the engine spinning.
//     Declared `unenforced`, and the plugin's own non-yielding-loop refusal is what stands in its
//     place.
//   * `local-process` — a real child process on a machine that has one, driven by
//     scripts/lib/sandbox-host.mjs. That backend can and does kill: wall clock by SIGKILL, memory
//     by an RSS poll plus the runtime's own knob where it has one, output by killing the moment the
//     stream passes the byte ceiling.
//
// WHAT THE SOURCE SCAN DOES NOT CLAIM. `scanSource` is a text scanner over a program the model
// wrote, in the same spirit and with the same limits as `scanLuauForAssetIngress` in tools.ts: it
// raises the cost of the direct path and makes the indirect ones look like what they are. It is
// not a parser and not a jail. On the `local-process` backend the process ceiling is the real
// guarantee; on `studio` the real guarantee is the plugin's asset policy. Nothing downstream may
// treat a clean scan as proof that a program is safe.
//
// The asset-ingress gate is NOT reimplemented here. `refuseLuauIngress` lives in tools.ts and is
// injected, because a second copy of that scanner would drift from the first and the drift would
// be invisible. It is required rather than optional for the `studio` backend: admitting Luau to
// Studio with no ingress scanner supplied is a refusal, not a pass. A gate you can forget to pass
// is a gate that fails open.

/* ------------------------------------------------------------------ runtimes -- */

export type SandboxRuntime = 'luau' | 'node' | 'python' | 'roblox-spec';

/**
 * The runtimes, as a VALUE.
 *
 * `Record<SandboxRuntime, T>` is a compile-time promise and keeps none of it at runtime: the
 * runtime name arrives from a model-authored tool argument or an argv string, so it is validated
 * against this list before it is ever used as a key. Reading `CEILINGS[raw]` directly is how
 * `undefined` becomes a ceiling.
 */
export const SANDBOX_RUNTIMES = ['luau', 'node', 'python', 'roblox-spec'] as const;

export type SandboxBackend = 'studio' | 'local-process';
export const SANDBOX_BACKENDS = ['studio', 'local-process'] as const;

/** A runtime name from outside, or null. Never throws; never trusts `in`. */
export function asRuntime(raw: unknown): SandboxRuntime | null {
  if (typeof raw !== 'string') return null;
  // `includes` over the array, not `raw in CEILINGS`: an object lookup answers yes for
  // `__proto__`, `constructor` and `toString`, none of which are runtimes.
  return (SANDBOX_RUNTIMES as readonly string[]).includes(raw) ? (raw as SandboxRuntime) : null;
}

export function asBackend(raw: unknown): SandboxBackend | null {
  if (typeof raw !== 'string') return null;
  return (SANDBOX_BACKENDS as readonly string[]).includes(raw) ? (raw as SandboxBackend) : null;
}

/** Where each runtime can actually be executed. A pairing outside this table is refused. */
export const RUNTIME_BACKENDS: Record<SandboxRuntime, readonly SandboxBackend[]> = {
  // Luau runs in Studio (against a real place) and under the standalone `luau` CLI (against
  // nothing — no `game`, no engine, which is why the asset-ingress gate is a studio-only concern).
  luau: ['studio', 'local-process'],
  // The spec harness is assembled from model-authored case bodies and normally runs in Studio.
  // It is also runnable under the CLI, which is how the harness's own ceilings are proven without
  // a copy of Studio in the loop.
  'roblox-spec': ['studio', 'local-process'],
  node: ['local-process'],
  python: ['local-process'],
};

/* -------------------------------------------------------------------- limits -- */

export interface SandboxLimits {
  /** Wall-clock ceiling for one program. */
  wallMs: number;
  /** Address-space / heap ceiling, in MiB. */
  memoryMb: number;
  /** Combined stdout+stderr ceiling, in bytes. */
  outputBytes: number;
  /** Ceiling on the program text itself, in bytes. Checked before anything runs. */
  sourceBytes: number;
}

export type LimitName = keyof SandboxLimits;
export const LIMIT_NAMES = ['wallMs', 'memoryMb', 'outputBytes', 'sourceBytes'] as const;

/**
 * The hard ceilings. A caller may ask for less; asking for more is clamped, never honoured.
 *
 * `luau`/`roblox-spec` wall numbers are deliberately close to the timeouts tools.ts already used
 * (10s for run_luau, 20s for run_spec) so that wiring this in changes admission, not behaviour.
 * On the studio backend they bound how long the WORKER waits — see the enforcement table.
 */
export const SANDBOX_CEILINGS: Record<SandboxRuntime, SandboxLimits> = {
  luau: { wallMs: 10_000, memoryMb: 512, outputBytes: 64_000, sourceBytes: 40_000 },
  'roblox-spec': { wallMs: 20_000, memoryMb: 512, outputBytes: 96_000, sourceBytes: 120_000 },
  node: { wallMs: 10_000, memoryMb: 256, outputBytes: 256_000, sourceBytes: 200_000 },
  python: { wallMs: 10_000, memoryMb: 256, outputBytes: 256_000, sourceBytes: 200_000 },
};

/**
 * Floors. Below these a run cannot produce a result that means anything, and a caller asking for
 * `wallMs: 1` is far more likely to be confused than to be economising — so it is refused rather
 * than clamped up, which would silently give it a hundred times what it asked for.
 */
export const SANDBOX_FLOORS: SandboxLimits = {
  wallMs: 50,
  memoryMb: 8,
  outputBytes: 256,
  sourceBytes: 1,
};

/* --------------------------------------------------------------- enforcement -- */

/**
 * HOW a limit is kept. The vocabulary is small on purpose; every value is a different promise.
 *
 *   kill                    the program is stopped by force when it crosses the line
 *   kill-polled             the same, detected by sampling, so it may briefly exceed first
 *   truncate                the excess is dropped before it reaches anyone
 *   truncate-after-transfer the excess is dropped at the worker, having already crossed the wire
 *   unenforced              nothing stops it; the number is a request and the caller must know it
 */
export type Enforcement = 'kill' | 'kill-polled' | 'truncate' | 'truncate-after-transfer' | 'unenforced';

export interface EnforcementProfile {
  wall: Enforcement;
  memory: Enforcement;
  output: Enforcement;
  /** Network egress. No backend here jails a socket; the scan is all there is. */
  network: Enforcement;
}

/**
 * What each backend actually does. Read this before you believe a limit.
 *
 * The `studio` row is the uncomfortable one and it is stated rather than papered over. The plugin
 * has never read `timeoutMs`, and could not honour it if it did — a Luau loop with no yield holds
 * Studio's main thread and no watchdog gets a turn. `execStudioOp`'s timeout ends the worker's
 * WAIT. So wall is `unenforced` here, memory likewise, and output is capped only once the bytes
 * have already crossed the wire into the worker.
 */
export const BACKEND_ENFORCEMENT: Record<SandboxBackend, EnforcementProfile> = {
  studio: {
    wall: 'unenforced',
    memory: 'unenforced',
    output: 'truncate-after-transfer',
    network: 'unenforced',
  },
  'local-process': {
    wall: 'kill',
    memory: 'kill-polled',
    output: 'kill',
    network: 'unenforced',
  },
};

/* ------------------------------------------------------------------ refusals -- */

export interface SandboxRefusal {
  /** Stable machine code for the audit trail. */
  code:
    | 'unknown_runtime'
    | 'unknown_backend'
    | 'runtime_not_on_backend'
    | 'empty_source'
    | 'source_too_large'
    | 'bad_limit'
    | 'ingress_scanner_missing'
    | 'policy';
  /** The sentence the caller (and the model) is shown. */
  error: string;
  /** Policy finding codes, when the refusal came from the source scan or the ingress gate. */
  blocked?: string[];
}

export function isRefusal(x: unknown): x is SandboxRefusal {
  return !!x && typeof x === 'object' && typeof (x as SandboxRefusal).code === 'string'
    && typeof (x as SandboxRefusal).error === 'string';
}

/* ----------------------------------------------------------- limit resolution -- */

export interface ResolvedLimits {
  limits: SandboxLimits;
  /** Names of the limits that were asked for above the ceiling and cut down to it. */
  clamped: LimitName[];
}

/**
 * Turn a caller's requested limits into the limits that will actually apply.
 *
 * EVERY NUMBER HERE CROSSES A TRUST BOUNDARY. The request is a model-authored tool argument or a
 * CLI string, so this does not use `??` to fill a default: `??` defends `undefined` and `null` and
 * nothing else, and `NaN ?? 10_000` is `NaN`, after which every `>` comparison against it is false
 * and the ceiling fails open. Absent means default; present-and-not-a-finite-number is a REFUSAL,
 * because a caller that sent `"10s"` or `Infinity` asked for something and must be told it did not
 * get it rather than quietly receiving the ceiling.
 */
export function resolveLimits(runtime: SandboxRuntime, requested?: unknown): ResolvedLimits | SandboxRefusal {
  const ceiling = SANDBOX_CEILINGS[runtime];
  const limits: SandboxLimits = { ...ceiling };
  const clamped: LimitName[] = [];

  if (requested === undefined || requested === null) return { limits, clamped };
  if (typeof requested !== 'object' || Array.isArray(requested)) {
    return { code: 'bad_limit', error: 'limits must be an object of { wallMs, memoryMb, outputBytes, sourceBytes }' };
  }

  const req = requested as Record<string, unknown>;
  for (const name of LIMIT_NAMES) {
    const raw = req[name];
    if (raw === undefined || raw === null) continue;
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      return {
        code: 'bad_limit',
        error: `${name} must be a finite number of ${unitOf(name)}; received ${describe(raw)}. `
          + `Leave it out to get the ceiling (${ceiling[name]}).`,
      };
    }
    if (raw < SANDBOX_FLOORS[name]) {
      return {
        code: 'bad_limit',
        error: `${name} of ${raw} is below the floor of ${SANDBOX_FLOORS[name]} ${unitOf(name)}; `
          + 'a ceiling that low cannot produce a result worth reading.',
      };
    }
    if (raw > ceiling[name]) {
      limits[name] = ceiling[name];
      clamped.push(name);
      continue;
    }
    limits[name] = Math.floor(raw);
  }
  return { limits, clamped };
}

function unitOf(name: LimitName): string {
  return name === 'wallMs' ? 'milliseconds' : name === 'memoryMb' ? 'MiB' : 'bytes';
}

/** What a rejected value WAS, without letting a huge string into the message. */
function describe(v: unknown): string {
  if (typeof v === 'number') return Number.isNaN(v) ? 'NaN' : String(v);
  if (typeof v === 'string') return `the string ${JSON.stringify(v.slice(0, 24))}`;
  if (Array.isArray(v)) return 'an array';
  return typeof v;
}

/* --------------------------------------------------------------- source scan -- */

export interface SandboxFinding {
  code: string;
  why: string;
}

interface SourceRule {
  code: string;
  pattern: RegExp;
  why: string;
}

/**
 * Strip line and block comments so a WARNING ABOUT a primitive is not a use of it, and so a
 * comment cannot hide one either.
 *
 * String-aware, for the reason stripLuauComments in tools.ts is: cutting from `#` to end of line
 * without knowing you are inside a string turns `s = "# not a comment"; import os` into a line
 * that lost the half that mattered.
 */
function stripComments(src: string, style: 'hash' | 'slash' | 'luau'): string {
  let out = '';
  let i = 0;
  const isLineStart = (at: number): boolean =>
    style === 'hash' ? src[at] === '#'
      : style === 'slash' ? src[at] === '/' && src[at + 1] === '/'
        : src[at] === '-' && src[at + 1] === '-';
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === '"' || ch === "'" || (style === 'slash' && ch === '`')) {
      out += ch;
      i += 1;
      while (i < src.length) {
        const c = src[i] as string;
        out += c;
        i += 1;
        if (c === '\\') {
          if (i < src.length) { out += src[i]; i += 1; }
          continue;
        }
        if (c === ch) break;
      }
      continue;
    }
    if (style === 'slash' && ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end < 0 ? src.length : end + 2;
      out += ' ';
      continue;
    }
    if (isLineStart(i)) {
      while (i < src.length && src[i] !== '\n') i += 1;
      out += ' ';
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/**
 * Python. The import rule is an ALLOWLIST, not a denylist, because the set of modules that reach
 * the filesystem, the network or a subprocess is open-ended and the set of modules a sandboxed
 * computation needs is small. A denylist here would be a list of the escapes somebody had already
 * thought of.
 */
const PYTHON_ALLOWED_IMPORTS = new Set([
  'math', 'cmath', 'json', 'random', 'statistics', 're', 'itertools', 'functools', 'collections',
  'decimal', 'fractions', 'heapq', 'bisect', 'string', 'textwrap', 'datetime', 'time', 'typing',
  'dataclasses', 'enum', 'copy', 'operator', 'unicodedata', 'array', 'hashlib', 'base64', 'uuid',
  'abc', 'numbers', 'pprint', 'difflib', 'csv',
]);

const PYTHON_RULES: readonly SourceRule[] = [
  {
    code: 'py_dynamic_import',
    pattern: /\b__import__\s*\(|\bimportlib\b/,
    why: '__import__/importlib loads a module the source does not name, so the import allowlist above it decides nothing',
  },
  {
    code: 'py_dynamic_code',
    pattern: /\beval\s*\(|\bexec\s*\(|\bcompile\s*\(/,
    why: 'eval/exec/compile decide at runtime what code runs, so nothing in the source above them can be checked',
  },
  {
    code: 'py_filesystem',
    pattern: /\bopen\s*\(/,
    why: 'open() reaches the filesystem; a sandboxed computation takes its input from its source and returns it on stdout',
  },
  {
    code: 'py_dunder_escape',
    pattern: /__subclasses__|__globals__|__builtins__|__bases__|__mro__|__code__/,
    why: 'the object-graph dunders are the standard route out of a restricted Python environment',
  },
  {
    code: 'py_process',
    pattern: /\bos\s*\.\s*system\b|\bsubprocess\b|\bpty\b|\bfork\b/,
    why: 'starting a process leaves the sandbox: the ceilings apply to this program, not to what it spawns',
  },
];

const NODE_ALLOWED_MODULES = new Set([
  'node:assert', 'assert', 'node:util', 'util', 'node:buffer', 'buffer', 'node:string_decoder',
  'node:events', 'events', 'node:url', 'url', 'node:querystring', 'querystring', 'node:punycode',
  'node:crypto', 'crypto', 'node:path', 'path',
]);

const NODE_RULES: readonly SourceRule[] = [
  {
    code: 'node_dynamic_code',
    pattern: /\beval\s*\(|\bnew\s+Function\s*\(|\bFunction\s*\(\s*['"`]/,
    why: 'eval / new Function decide at runtime what code runs, so nothing in the source above them can be checked',
  },
  {
    code: 'node_process_escape',
    pattern: /\bprocess\s*\.\s*(?:binding|dlopen|env|_linkedBinding)\b/,
    why: 'process.binding/dlopen reach native code and process.env carries this machine\'s secrets; neither belongs to a sandboxed computation',
  },
  {
    code: 'node_dynamic_import',
    pattern: /\bimport\s*\(|\bcreateRequire\s*\(|\brequire\s*\.\s*resolve\b/,
    why: 'a dynamic import resolves to something the source does not name, so the module allowlist decides nothing',
  },
  {
    code: 'node_worker',
    pattern: /\bworker_threads\b|\bchild_process\b|\bcluster\b/,
    why: 'starting a worker or a process leaves the sandbox: the ceilings apply to this program, not to what it spawns',
  },
];

/**
 * Luau, on the LOCAL backend only.
 *
 * There is no `game` under the standalone CLI, so asset ingress is not reachable and this list does
 * not duplicate the ingress gate — see the header. What it refuses is the CLI's own escape surface:
 * `loadstring` and `require` both exist there (measured), and `os.execute` would leave the process.
 */
const LUAU_LOCAL_RULES: readonly SourceRule[] = [
  {
    code: 'luau_dynamic_code',
    pattern: /\bloadstring\s*\(|\bgetfenv\s*\(|\bsetfenv\s*\(/,
    why: 'loadstring/getfenv decide at runtime what code runs, so nothing in the source above them can be checked',
  },
  {
    code: 'luau_require',
    pattern: /\brequire\s*\(/,
    why: 'require pulls in a file this sandbox has not scanned; a sandboxed chunk is self-contained',
  },
  {
    code: 'luau_process',
    pattern: /\bos\s*\.\s*(?:execute|exit|remove|rename|getenv|tmpname)\b|\bio\s*\./,
    why: 'os.execute/os.remove/io.* reach the machine the CLI is running on',
  },
];

/**
 * Luau, in STUDIO.
 *
 * NETWORK EGRESS, and it is the door net-policy.ts did not cover. Every tool-driven fetch in this
 * product goes through an allowlist of hosts that refuses `http:`, refuses IP literals, refuses
 * credentials in the URL and re-checks every redirect hop by hand. None of that applies to a model
 * that asks for the fetch in Luau instead: measured before this rule existed,
 * `game:GetService("HttpService"):GetAsync(url)` was ADMITTED, and the plugin does not refuse it
 * either. An allowlist with a second door is not an allowlist.
 *
 * The rule fires on the network METHODS rather than on HttpService, because JSONEncode/JSONDecode
 * are the ordinary non-network use and refusing the service outright would block them.
 * `RequestAsync` needs no context — only HttpService has one. `GetAsync`/`PostAsync` require
 * HttpService to appear as well, because DataStore has its own `GetAsync` and refusing ordinary
 * persistence would be a false positive an agent cannot work around.
 *
 * THIS DOES NOT MAKE STUDIO'S `network` ENFORCED, and BACKEND_ENFORCEMENT still says `unenforced`.
 * This is a STATIC scan of the source: it refuses what it can read, and a call assembled at runtime
 * from pieces it cannot follow would still reach the engine. Declaring it enforced on the strength
 * of a source scan is exactly the "a ceiling that is merely declared is not a ceiling" failure this
 * file was written to prevent.
 */
const LUAU_STUDIO_RULES: readonly SourceRule[] = [
  {
    code: 'luau_network_egress',
    pattern:
      /\bRequestAsync\s*[({]|HttpService[\s\S]*?\b(?:GetAsync|PostAsync)\s*\(|\b(?:GetAsync|PostAsync)\s*\([\s\S]*?HttpService/,
    why:
      'HttpService:GetAsync/PostAsync/RequestAsync reaches any host on the internet from inside the place, ' +
      'which is what the tool-side host allowlist exists to prevent — use web_fetch, which checks the host and ' +
      're-checks every redirect hop',
  },
];

function rulesFor(runtime: SandboxRuntime, backend: SandboxBackend): readonly SourceRule[] {
  if (runtime === 'python') return PYTHON_RULES;
  if (runtime === 'node') return NODE_RULES;
  // The two Luau lists are disjoint on purpose. LUAU_LOCAL_RULES is about the CLI's stdlib and
  // would be wrong in Studio, where `require(script.Parent.X)` is the normal thing; LUAU_STUDIO_RULES
  // is about reaching the network from inside a place, which the CLI cannot do because there is no
  // HttpService there. Studio is ALSO governed by the injected ingress gate — that gate and this
  // list answer different questions and neither replaces the other.
  return backend === 'local-process' ? LUAU_LOCAL_RULES : LUAU_STUDIO_RULES;
}

/** Every `import x` / `from x import` module name in a Python source. */
function pythonImports(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/^[ \t]*import[ \t]+([^\n#]+)/gm)) {
    for (const part of (m[1] as string).split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0]?.trim() ?? '';
      if (name) out.push(name);
    }
  }
  for (const m of src.matchAll(/^[ \t]*from[ \t]+([^\s]+)[ \t]+import\b/gm)) {
    out.push((m[1] as string).trim());
  }
  return out;
}

/** Every string literal handed to `require(...)` or `import ... from '...'` in a Node source. */
function nodeModuleRefs(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/\brequire\s*\(\s*(['"])([^'"]*)\1\s*\)/g)) out.push(m[2] as string);
  for (const m of src.matchAll(/\bfrom\s+(['"])([^'"]*)\1/g)) out.push(m[2] as string);
  for (const m of src.matchAll(/\bimport\s+(['"])([^'"]*)\1/g)) out.push(m[2] as string);
  return out;
}

/**
 * The static policy for one program, as findings rather than a boolean, so a refusal can say WHICH
 * primitive was reached for. An agent that cannot tell what it did wrong retries the same thing.
 */
export function scanSource(runtime: SandboxRuntime, backend: SandboxBackend, source: string): SandboxFinding[] {
  const style = runtime === 'python' ? 'hash' : runtime === 'node' ? 'slash' : 'luau';
  const stripped = stripComments(source, style);
  const found = new Map<string, string>();

  for (const rule of rulesFor(runtime, backend)) {
    if (rule.pattern.test(stripped)) found.set(rule.code, rule.why);
  }

  if (runtime === 'python') {
    for (const mod of pythonImports(stripped)) {
      const root = mod.split('.')[0] ?? '';
      // A relative import (`from . import x`) has an empty root and names a file beside the
      // program — which in a sandbox is a file the program was not given.
      if (!root || !PYTHON_ALLOWED_IMPORTS.has(root)) {
        found.set('py_import_denied', `import ${mod.slice(0, 40)} is not on the sandbox's import allowlist `
          + `(${[...PYTHON_ALLOWED_IMPORTS].slice(0, 8).join(', ')}, …); a sandboxed computation cannot reach the filesystem, the network or a process`);
      }
    }
  }

  if (runtime === 'node') {
    for (const mod of nodeModuleRefs(stripped)) {
      if (!NODE_ALLOWED_MODULES.has(mod)) {
        found.set('node_module_denied', `require/import of ${mod.slice(0, 40)} is not on the sandbox's module allowlist `
          + '(assert, util, buffer, events, url, crypto, path); a sandboxed computation cannot reach the filesystem, the network or a process');
      }
    }
  }

  return [...found].map(([code, why]) => ({ code, why }));
}

/* ------------------------------------------------------------------ admission -- */

/** The gate tools.ts already owns, passed in rather than copied. Returns null when the code is clean. */
export type IngressGate = (code: string) => { error: string; blocked: string[] } | null;

export interface AdmitRequest {
  runtime: unknown;
  backend?: unknown;
  source: unknown;
  limits?: unknown;
  /** REQUIRED for Luau reaching the `studio` backend. See the header: an optional gate fails open. */
  ingress?: IngressGate;
}

export interface SandboxJob {
  runtime: SandboxRuntime;
  backend: SandboxBackend;
  source: string;
  limits: SandboxLimits;
  /** Limits the caller asked for above the ceiling, which were cut down to it. */
  clamped: LimitName[];
  enforcement: EnforcementProfile;
}

const UTF8 = new TextEncoder();

/** Byte length, not character length. A ceiling in bytes that counts UTF-16 units is not one. */
export function byteLength(s: string): number {
  return UTF8.encode(s).length;
}

/**
 * Admit a program, or refuse it.
 *
 * Order matters and is deliberate: identity (runtime, backend, pairing) before shape (source),
 * shape before limits, limits before policy. A caller that sent a nonsense runtime is told that,
 * rather than being told its Python is too long when the runtime it named does not exist.
 */
export function admitProgram(req: AdmitRequest): SandboxJob | SandboxRefusal {
  const runtime = asRuntime(req.runtime);
  if (!runtime) {
    return {
      code: 'unknown_runtime',
      error: `${describe(req.runtime)} is not a sandbox runtime; known runtimes are ${SANDBOX_RUNTIMES.join(', ')}`,
    };
  }

  const backendRaw = req.backend ?? defaultBackend(runtime);
  const backend = asBackend(backendRaw);
  if (!backend) {
    return {
      code: 'unknown_backend',
      error: `${describe(backendRaw)} is not a sandbox backend; known backends are ${SANDBOX_BACKENDS.join(', ')}`,
    };
  }
  if (!RUNTIME_BACKENDS[runtime].includes(backend)) {
    return {
      code: 'runtime_not_on_backend',
      error: `${runtime} cannot run on the ${backend} backend; it runs on ${RUNTIME_BACKENDS[runtime].join(' or ')}`,
    };
  }

  if (typeof req.source !== 'string' || !req.source.trim()) {
    return { code: 'empty_source', error: 'there is no program to run: source must be a non-empty string' };
  }
  const source = req.source;

  const resolved = resolveLimits(runtime, req.limits);
  if (isRefusal(resolved)) return resolved;
  const { limits, clamped } = resolved;

  const size = byteLength(source);
  if (size > limits.sourceBytes) {
    return {
      code: 'source_too_large',
      error: `the program is ${size} bytes; the ceiling for ${runtime} is ${limits.sourceBytes}. Split it or trim it.`,
    };
  }

  // FAIL CLOSED. Luau reaching a real place must pass the asset-ingress gate, and the only way to
  // be sure it ran is to refuse when it was not supplied. A caller that forgets is a caller whose
  // code would otherwise reach `game:GetObjects` with nothing in the way.
  if (backend === 'studio' && (runtime === 'luau' || runtime === 'roblox-spec')) {
    if (typeof req.ingress !== 'function') {
      return {
        code: 'ingress_scanner_missing',
        error: 'Luau bound for Studio must be admitted with the asset-ingress gate supplied; '
          + 'admitting it without one would let this path reach an asset primitive with nothing in the way',
      };
    }
    const blocked = req.ingress(source);
    if (blocked) return { code: 'policy', error: blocked.error, blocked: blocked.blocked };
  }

  const findings = scanSource(runtime, backend, source);
  if (findings.length) {
    return {
      code: 'policy',
      error: `this ${runtime} program was refused by the sandbox policy: ${findings.map((f) => f.why).join('; ')}.`,
      blocked: findings.map((f) => f.code),
    };
  }

  return { runtime, backend, source, limits, clamped, enforcement: BACKEND_ENFORCEMENT[backend] };
}

/** Where a runtime goes when the caller does not say. */
function defaultBackend(runtime: SandboxRuntime): SandboxBackend {
  return RUNTIME_BACKENDS[runtime][0] as SandboxBackend;
}

/* --------------------------------------------------------------------- output -- */

export interface CappedOutput {
  text: string;
  /** Bytes kept. */
  bytes: number;
  /** Bytes dropped. Zero when nothing was dropped. */
  dropped: number;
  truncated: boolean;
}

/**
 * Cut output to the ceiling, and SAY SO.
 *
 * The returned record carries `truncated` and a byte count rather than only a shortened string,
 * because a truncated result that looks whole is the failure this repository is named after: a
 * caller reading "0 errors" off a log that was cut before the errors has observed nothing and
 * believes it has observed something.
 */
export function capOutput(text: string, outputBytes: number): CappedOutput {
  const total = byteLength(text);
  if (total <= outputBytes) return { text, bytes: total, dropped: 0, truncated: false };
  // Slice by bytes, then decode without the partial trailing character.
  const cut = new TextDecoder().decode(UTF8.encode(text).slice(0, outputBytes)).replace(/�+$/, '');
  return { text: cut, bytes: byteLength(cut), dropped: total - byteLength(cut), truncated: true };
}

/**
 * Cap a list of printed lines, the shape the Studio backend returns.
 *
 * Applied at the worker because that is the only place that can: the plugin's `run_code` collects
 * `__prints` with no bound at all, so the bytes have already crossed the wire by the time this
 * runs. The enforcement table says exactly that — `truncate-after-transfer` — so nobody reads this
 * as a ceiling on what Studio will produce.
 */
export function capPrints(prints: unknown, outputBytes: number): { prints: string[]; truncated: boolean; dropped: number } {
  if (!Array.isArray(prints)) return { prints: [], truncated: false, dropped: 0 };
  const kept: string[] = [];
  let used = 0;
  let dropped = 0;
  for (const line of prints) {
    const s = typeof line === 'string' ? line : String(line);
    const n = byteLength(s) + 1; // the newline a reader will put back
    if (used + n > outputBytes) {
      dropped += 1;
      continue;
    }
    used += n;
    kept.push(s);
  }
  return { prints: kept, truncated: dropped > 0, dropped };
}

/* ------------------------------------------------------------------- results -- */

/**
 * Why a run ended. `exit` means the program finished on its own — nothing else here does.
 *
 * `unknown` exists so a host that could not tell has somewhere honest to put that. It must never
 * be reported as `exit`.
 */
export type SandboxStopReason = 'exit' | 'wall_clock' | 'memory' | 'output_limit' | 'spawn_failed' | 'unknown';

export interface SandboxResult {
  runtime: SandboxRuntime;
  backend: SandboxBackend;
  /** True only when the program ran to completion AND reported success. */
  ok: boolean;
  reason: SandboxStopReason;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** Bytes dropped from stdout+stderr by the output ceiling. */
  outputDropped: number;
  outputTruncated: boolean;
  durationMs: number;
  /** Peak resident set observed, in MiB, or null when nothing measured it. */
  peakMemoryMb: number | null;
  /**
   * The resident-set figure the host actually killed at, or null when nothing was watching.
   *
   * It is NOT `limits.memoryMb`, and the difference is stated rather than hidden: an interpreter
   * occupies tens of MiB before it has run a line of the program (node ~37MiB, python ~10MiB,
   * luau ~3MiB, measured), so a ceiling compared against raw RSS would refuse `print(1)`.
   * `limits.memoryMb` is what the PROGRAM may add; this is that plus the interpreter's own
   * footprint, which is the number a reader needs to interpret `peakMemoryMb`.
   */
  memoryCeilingRssMb: number | null;
  limits: SandboxLimits;
  enforcement: EnforcementProfile;
}

/**
 * A one-line verdict for a person or a model.
 *
 * A run stopped by a ceiling NEVER renders as a result. `reason` leads the sentence, so a killed
 * program cannot be mistaken for one that printed nothing.
 */
export function describeResult(r: SandboxResult): string {
  const ms = `${r.durationMs}ms`;
  switch (r.reason) {
    case 'exit':
      return r.ok
        ? `${r.runtime}: finished in ${ms}`
        : `${r.runtime}: exited ${r.exitCode ?? '?'} after ${ms}`;
    case 'wall_clock':
      return `${r.runtime}: KILLED at the ${r.limits.wallMs}ms wall-clock ceiling — no result was produced`;
    case 'memory':
      return `${r.runtime}: KILLED at the ${r.limits.memoryMb}MiB memory ceiling — no result was produced`;
    case 'output_limit':
      return `${r.runtime}: KILLED at the ${r.limits.outputBytes}-byte output ceiling after ${ms} — the output below is the part that fit`;
    case 'spawn_failed':
      return `${r.runtime}: could not start — ${r.stderr.slice(0, 120)}`;
    default:
      return `${r.runtime}: stopped for a reason this host could not determine after ${ms}`;
  }
}
