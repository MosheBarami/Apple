#!/usr/bin/env node
// THE LOCAL SANDBOX HOST — the half of the code-execution contract that can actually kill something.
//
// apps/worker/src/sandbox.ts decides what may run and under which ceilings. It cannot enforce any
// of them: a Cloudflare Worker has no processes, and the Studio backend's ceilings are honestly
// declared `unenforced` there because a Luau chunk holds Studio's main thread and no watchdog gets
// a turn. This file is the `local-process` backend, and on this backend the ceilings are real:
//
//   wall clock   SIGKILL to the whole process group when the timer fires
//   memory       the runtime's own knob where it has one (node's --max-old-space-size), plus an
//                RSS poll that SIGKILLs any runtime, so the ceiling does not depend on the
//                interpreter having a flag
//   output       the stream is counted as it arrives and the process is SIGKILLed the moment it
//                passes the byte ceiling — not buffered and trimmed afterwards, which would let a
//                program fill a machine's memory with output the sandbox intended to refuse
//
// WHY IT LIVES HERE AND NOT IN apps/worker. The repository already shells out to `luau` in three
// places (apps/plugin/tests/run.mjs, apps/benchmark/crystal-canyon/tests/run.mjs) and to `python3`
// in packages/training, every one of them with `execFileSync` and no timeout — so a runaway spec
// hangs the suite until somebody notices. This is the same mechanism those files use, with the
// ceilings they lack, in the one place in the tree where processes exist.
//
// WHAT THIS IS NOT. It is not a jail. There is no seccomp, no namespace, no network namespace, and
// a program admitted here runs as the user who started it, with a scrubbed environment and a
// scratch cwd but a real filesystem underneath. The static policy in sandbox.ts refuses the
// obvious reaches for the filesystem, a socket and a subprocess; `enforcement.network` says
// `unenforced` because that is true. Do not run untrusted third-party code through this and call
// it contained — its job is to bound COST (a runaway loop, a memory hog, an output flood) for code
// this repository's own agents and harnesses produce.
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  admitProgram,
  isRefusal,
  capOutput,
  byteLength,
  BACKEND_ENFORCEMENT,
} from '../../apps/worker/src/sandbox.ts';
import { specLuau, parseSpecRun, refuseSpecCases } from '../../apps/worker/src/spec-runner.ts';

export { admitProgram, isRefusal };

/**
 * What the interpreter occupies before the program has run a line, in MiB.
 *
 * MEASURED on darwin/arm64 at 500ms idle: node 37.2, python3 10.2, luau 2.7. The values below sit
 * above those with headroom, because the cost of being slightly generous is a program that gets a
 * little more memory than it asked for, and the cost of being tight is a sandbox that kills
 * `print(1)` and reports it as an over-limit program — a false observation, which is worse.
 */
const RSS_BASELINE_MB = { node: 64, python: 32, luau: 16, 'roblox-spec': 16 };

/** How often the resident set is sampled. The reason `memory` is `kill-polled` and not `kill`. */
export const MEMORY_POLL_MS = 40;

/** Grace after SIGKILL before the host stops waiting for the streams to close. */
const REAP_MS = 500;

const RUNTIME_FILE = {
  luau: 'program.luau',
  'roblox-spec': 'spec.luau',
  node: 'program.mjs',
  python: 'program.py',
};

/**
 * The Python launcher.
 *
 * It exists because two of the three ceilings are cheaper to apply inside the process than outside
 * it, and because the result must say which of them ACTUALLY applied. RLIMIT_CPU works everywhere
 * POSIX; RLIMIT_AS is refused outright by darwin (measured: `ValueError: current limit exceeds
 * maximum limit`, on a box whose RLIMIT_AS is already RLIM_INFINITY). So it tries, records what
 * succeeded in a status file the host reads back, and the host's RSS poll is what makes the memory
 * ceiling real on the platforms where the rlimit is not available.
 *
 * `runpy` rather than `exec(open(...).read())`: a traceback then names the program's own file and
 * line, which is the difference between a usable error and a mystery.
 */
const PYTHON_LAUNCHER = `import json, resource, runpy, sys

program, status_path, mem_mb, cpu_s = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
applied = {"rlimit_as": False, "rlimit_cpu": False}
try:
    resource.setrlimit(resource.RLIMIT_AS, (mem_mb * 1024 * 1024, mem_mb * 1024 * 1024))
    applied["rlimit_as"] = True
except (ValueError, OSError):
    pass
try:
    resource.setrlimit(resource.RLIMIT_CPU, (cpu_s, cpu_s))
    applied["rlimit_cpu"] = True
except (ValueError, OSError):
    pass
with open(status_path, "w") as fh:
    json.dump(applied, fh)
sys.argv = [program]
runpy.run_path(program, run_name="__main__")
`;

/**
 * The environment a sandboxed program gets: four variables, none of them this machine's.
 *
 * `process.env` on a developer's box carries CLOUDFLARE_API_TOKEN, GOLEM_ADMIN_KEY and whatever
 * else `.env` put there — infra/deploy-static.mjs requires one of those to exist — and handing
 * that to a model-authored program would make every other ceiling in this file beside the point.
 * An allowlist, not a denylist: the set of secret-shaped names is open-ended and the set a
 * sandboxed computation needs is four.
 *
 * HOME and TMPDIR point at the scratch directory so a program that writes anyway writes there,
 * and the directory is removed when the run ends.
 */
export function sandboxEnv(dir) {
  return { PATH: process.env.PATH ?? '/usr/bin:/bin', HOME: dir, TMPDIR: dir, LANG: 'C' };
}

/** Resident set of one pid in MiB, or null when the process is gone or ps is unavailable. */
function rssMb(pid) {
  const ps = spawnSync('ps', ['-o', 'rss=', '-p', String(pid)], { encoding: 'utf8' });
  if (ps.status !== 0) return null;
  const kb = Number.parseInt(ps.stdout.trim(), 10);
  return Number.isFinite(kb) ? kb / 1024 : null;
}

/** Whether a runtime can run on this machine at all. */
export function runtimeAvailable(runtime) {
  if (runtime === 'node') return true;
  const probe = runtime === 'python' ? ['python3', ['-c', 'pass']] : ['luau', ['--help']];
  const r = spawnSync(probe[0], probe[1], { stdio: 'ignore' });
  return r.status === 0;
}

/**
 * Kill a whole process group, not one pid.
 *
 * A program that forks leaves children holding the streams open, and killing only the leader gives
 * a host that reports a clean kill while the work carries on. The child is spawned `detached`, so
 * its pid is its group id and the negative-pid signal reaches everything it started.
 */
function killGroup(child) {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
}

/**
 * Run an admitted job, and return a SandboxResult.
 *
 * `job` must have come from `admitProgram` — this does not re-derive the limits, because a host
 * that computes its own would be a second opinion about the ceiling, and two opinions is how a
 * ceiling stops meaning anything. Pass a refusal in and it throws, loudly, rather than running
 * something admission said no to.
 */
export async function runSandbox(job) {
  if (isRefusal(job)) {
    throw new Error(`runSandbox was handed a refusal (${job.code}); admission decides, not the host`);
  }
  if (job.backend !== 'local-process') {
    throw new Error(`this host only runs the local-process backend; the job names ${job.backend}`);
  }

  const dir = mkdtempSync(join(tmpdir(), 'apple-sandbox-'));
  const file = join(dir, RUNTIME_FILE[job.runtime]);
  writeFileSync(file, job.source);

  const statusPath = join(dir, 'limits.json');
  const { command, args } = commandFor(job, file, statusPath);

  const env = sandboxEnv(dir);

  const started = Date.now();
  let child;
  try {
    child = spawn(command, args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  } catch (e) {
    rmSync(dir, { recursive: true, force: true });
    return result(job, {
      reason: 'spawn_failed', stderr: String(e && e.message ? e.message : e), durationMs: Date.now() - started,
    });
  }

  const rssCeiling = (RSS_BASELINE_MB[job.runtime] ?? 32) + job.limits.memoryMb;
  let stdout = '';
  let stderr = '';
  let bytes = 0;
  let dropped = 0;
  let peakRss = null;
  /** The FIRST ceiling to fire wins, and nothing overwrites it. A program killed for memory that
   *  then trips the wall timer on its way out must not be reported as a timeout. */
  let stopReason = null;
  const stop = (reason) => {
    if (stopReason) return;
    stopReason = reason;
    killGroup(child);
  };

  const collect = (which) => (chunk) => {
    const room = job.limits.outputBytes - bytes;
    const text = chunk.toString('utf8');
    const size = byteLength(text);
    if (size <= room) {
      bytes += size;
      if (which === 'out') stdout += text; else stderr += text;
      return;
    }
    // Keep the part that fits so the caller sees what the program was saying when it was stopped,
    // then kill. Counting as it arrives is the point: buffering everything and trimming afterwards
    // would let a program flood this host's memory with output the ceiling exists to refuse.
    const kept = capOutput(text, Math.max(0, room));
    if (which === 'out') stdout += kept.text; else stderr += kept.text;
    bytes += kept.bytes;
    dropped += size - kept.bytes;
    stop('output_limit');
  };
  child.stdout.on('data', collect('out'));
  child.stderr.on('data', collect('err'));

  const wallTimer = setTimeout(() => stop('wall_clock'), job.limits.wallMs);
  const memTimer = setInterval(() => {
    const mb = rssMb(child.pid);
    if (mb === null) return;
    if (peakRss === null || mb > peakRss) peakRss = mb;
    if (mb > rssCeiling) stop('memory');
  }, MEMORY_POLL_MS);

  const exit = await new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    child.on('error', (e) => done({ code: null, signal: null, spawnError: String(e.message ?? e) }));
    child.on('close', (code, signal) => done({ code, signal }));
    // A SIGKILLed process whose streams somehow stay open must not hang this host forever.
    child.on('exit', () => setTimeout(() => done({ code: null, signal: 'SIGKILL' }), REAP_MS).unref?.());
  });

  clearTimeout(wallTimer);
  clearInterval(memTimer);
  const durationMs = Date.now() - started;

  const applied = readStatus(statusPath);
  rmSync(dir, { recursive: true, force: true });

  if (exit.spawnError) {
    return result(job, { reason: 'spawn_failed', stderr: exit.spawnError, durationMs });
  }

  // CLASSIFY WHAT KILLED IT, AND NEVER GUESS UPWARDS.
  //
  // A ceiling that fired is authoritative — the host did it and knows. Otherwise the program ended
  // on its own, with two exceptions worth naming because they are the runtimes' own ceilings
  // rather than this host's: node aborts with a V8 heap message when --max-old-space-size is hit,
  // and python raises MemoryError or is SIGXCPU'd by RLIMIT_CPU. Anything else that exited
  // non-zero is a program that failed, which is `exit` with ok:false — not a ceiling, and not
  // `unknown`, which is reserved for a stop this host genuinely could not attribute.
  let reason = stopReason;
  if (!reason) {
    if (exit.signal === 'SIGXCPU') reason = 'wall_clock';
    else if (isRuntimeMemoryFailure(job.runtime, stderr)) reason = 'memory';
    else if (exit.code === null && exit.signal) reason = 'unknown';
    else reason = 'exit';
  }

  return result(job, {
    reason,
    ok: reason === 'exit' && exit.code === 0,
    exitCode: exit.code,
    signal: exit.signal ?? null,
    stdout,
    stderr,
    outputDropped: dropped,
    outputTruncated: dropped > 0,
    durationMs,
    peakMemoryMb: peakRss === null ? null : Math.round(peakRss * 10) / 10,
    memoryCeilingRssMb: rssCeiling,
    limitsApplied: applied,
  });
}

/** The interpreter's own out-of-memory signature, as text. Conservative: no match means no claim. */
function isRuntimeMemoryFailure(runtime, stderr) {
  if (runtime === 'node') return /JavaScript heap out of memory|Allocation failed/.test(stderr);
  if (runtime === 'python') return /MemoryError/.test(stderr);
  if (runtime === 'luau' || runtime === 'roblox-spec') return /not enough memory/i.test(stderr);
  return false;
}

function readStatus(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

function commandFor(job, file, statusPath) {
  switch (job.runtime) {
    case 'node':
      return {
        command: process.execPath,
        args: [
          // The real V8 heap ceiling. The RSS poll is the backstop for everything V8 does not
          // count (array buffers, the interpreter itself) and for the runtimes with no such flag.
          `--max-old-space-size=${job.limits.memoryMb}`,
          // Defence in depth behind the policy scan, which refuses eval textually: this refuses it
          // in the engine, so a spelling the scanner missed still cannot compile a string.
          '--disallow-code-generation-from-strings',
          file,
        ],
      };
    case 'python':
      return {
        command: 'python3',
        args: [
          '-I', // isolated: no user site-packages, no PYTHONPATH, no cwd on sys.path
          '-B', // no .pyc litter in the scratch dir
          '-c', PYTHON_LAUNCHER,
          file,
          statusPath,
          String(job.limits.memoryMb),
          String(Math.max(1, Math.ceil(job.limits.wallMs / 1000))),
        ],
      };
    default:
      return { command: 'luau', args: [file] };
  }
}

/** Assemble a SandboxResult, with the fields a caller must never find missing. */
function result(job, over) {
  return {
    runtime: job.runtime,
    backend: job.backend,
    ok: false,
    reason: 'unknown',
    exitCode: null,
    signal: null,
    stdout: '',
    stderr: '',
    outputDropped: 0,
    outputTruncated: false,
    durationMs: 0,
    peakMemoryMb: null,
    memoryCeilingRssMb: null,
    limits: job.limits,
    enforcement: BACKEND_ENFORCEMENT[job.backend],
    limitsApplied: null,
    ...over,
  };
}

/**
 * Admit and run in one call, for the common case.
 *
 * Returns the refusal unchanged when admission says no, so a caller cannot accidentally run
 * something that was refused by ignoring a boolean.
 */
export async function execute(req) {
  const job = admitProgram({ ...req, backend: 'local-process' });
  if (isRefusal(job)) return job;
  return runSandbox(job);
}

/* ------------------------------------------------- the Roblox spec harness, locally -- */

/**
 * The chunk the CLI runs to get the harness's report back.
 *
 * `specLuau` ends in `return '{"cases":[…]}'`, because in Studio the plugin's `run_code` wraps the
 * source in a function and hands the returned value back over the wire. The standalone interpreter
 * does not print a chunk's return value, so the same source is wrapped in a function here and its
 * result printed. The HARNESS ITSELF IS NOT EDITED — one assembler, one report format, whichever
 * backend runs it, which is the only way a local run can be evidence about the real one.
 */
function cliCapture(source) {
  return `local __report = (function()\n${source}\nend)()\nprint(__report)`;
}

/**
 * Run spec cases under the local Luau CLI and read the report back.
 *
 * WHY THIS EXISTS. `run_spec`'s harness could only ever be exercised inside Studio, which means
 * its ceilings — a runaway case, a case that floods the output — were claims nobody could test.
 * Here they are enforced by the same process ceilings as any other local program, and the report
 * is parsed by the same `parseSpecRun` the worker uses.
 *
 * WHAT A LOCAL RUN IS NOT. There is no engine under the CLI: no `game`, no `workspace`, no
 * project modules. A case that requires one FAILS here with the interpreter's own error, exactly
 * as it would in Studio if the module were missing, and that failure is reported as a failure
 * rather than smoothed away. Use this to prove the harness, not to prove a project.
 *
 * A RUN THAT WAS KILLED REPORTS NO CASES. If a ceiling fired, the process died before the report
 * was printed, so there is nothing to parse and `run` is null. It must never be reported as "the
 * cases that finished passed" — the harness's per-case results only exist if the harness finished.
 */
export async function runSpecLocally(cases, limits) {
  const refusedCases = refuseSpecCases(cases);
  if (refusedCases) return { code: 'policy', error: refusedCases, blocked: ['spec_cases'] };

  const job = admitProgram({
    runtime: 'roblox-spec',
    backend: 'local-process',
    source: cliCapture(specLuau(cases.map((c) => ({ name: String(c.name), code: String(c.code) })))),
    limits,
  });
  if (isRefusal(job)) return job;

  const result = await runSandbox(job);
  // Only a run that FINISHED can carry a report. Parsing the partial stdout of a killed process
  // would turn a failure to observe into an observation.
  const run = result.reason === 'exit' && result.exitCode === 0 ? parseSpecRun(result.stdout.trim()) : null;
  return { ...result, run };
}
