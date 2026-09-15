/**
 * THE CODE-EXECUTION CONTRACT — admission, ceilings, and the wiring that uses them.
 *
 * apps/worker/src/sandbox.ts is the one place that says what may run, where, and under which
 * ceiling. Everything in it is a pure function of its arguments, which is the point: the
 * over-limit program, the NaN ceiling, the runtime nobody defined and the Luau that reaches for
 * `game:GetObjects` all come from THIS FILE rather than from the tree, so every rule is exercised
 * against a real violating input instead of being walked down its healthy path.
 *
 * WHAT IS BEING GUARDED, in the order the file is organised:
 *
 *   1. A runtime name is validated against a LIST, not by indexing a Record. `Record<Union, T>` is
 *      a compile-time promise; `CEILINGS["__proto__"]` finds Object.prototype at runtime.
 *   2. A requested limit that is not a finite number is REFUSED, never defaulted. `??` defends
 *      undefined and null and nothing else, so `NaN ?? 10_000` is NaN and every later `>` against
 *      it is false — a ceiling that fails open.
 *   3. The static policy refuses programs that actually reach for the filesystem, the network, a
 *      subprocess or runtime code generation, in all three source languages.
 *   4. Luau bound for Studio cannot be admitted without the asset-ingress gate. A gate you can
 *      forget to pass is a gate that fails open, so forgetting is itself the refusal.
 *   5. Output is capped with the truncation ANNOUNCED. A shortened log that looks whole is the
 *      failure this repository is named after.
 *   6. The two tools that execute model-authored Luau — run_luau and run_spec — actually route
 *      through admission. That half is exercised through the real TOOLS table with a fake Studio,
 *      so it is a behaviour, not a grep.
 *
 * Run with:  node --test           (from apps/worker)
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  SANDBOX_RUNTIMES,
  SANDBOX_BACKENDS,
  SANDBOX_CEILINGS,
  SANDBOX_FLOORS,
  LIMIT_NAMES,
  RUNTIME_BACKENDS,
  BACKEND_ENFORCEMENT,
  asRuntime,
  asBackend,
  resolveLimits,
  scanSource,
  admitProgram,
  isRefusal,
  capOutput,
  capPrints,
  byteLength,
  describeResult,
} from '../src/sandbox.ts';
import { SPEC_LIMITS } from '../src/spec-runner.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const WORKER = join(HERE, '..');

// tools.ts imports across the worker with extensionless specifiers, which Node's type stripping
// cannot resolve, so it is bundled — the same way luau-ingress.test.mjs does it.
const bundle = join(mkdtempSync(join(tmpdir(), 'sandbox-')), 'tools.mjs');
execFileSync(join(WORKER, 'node_modules', '.bin', 'esbuild'),
  [join(WORKER, 'src', 'tools.ts'), '--bundle', '--format=esm', '--target=es2022', '--outfile=' + bundle],
  { stdio: 'pipe' });
const { TOOLS, refuseLuauIngress } = await import(bundle);

/** Admit, and assert it was refused with this code. Returns the refusal so the message can be read. */
function refusal(req, code) {
  const r = admitProgram(req);
  assert.ok(isRefusal(r), `expected a refusal, got an admitted job: ${JSON.stringify(r).slice(0, 200)}`);
  assert.equal(r.code, code, `refused with ${r.code} (${r.error.slice(0, 120)}) rather than ${code}`);
  return r;
}

/** Admit, and assert it went through. Returns the job. */
function admitted(req) {
  const r = admitProgram(req);
  assert.ok(!isRefusal(r), `expected admission, was refused: ${isRefusal(r) ? r.error : ''}`);
  return r;
}

/* ================================================================== runtimes == */

test('a runtime name is checked against a list, so the prototype chain is not a runtime', () => {
  for (const name of SANDBOX_RUNTIMES) assert.equal(asRuntime(name), name);
  // `raw in CEILINGS` and `CEILINGS[raw]` both answer for these. `includes` does not.
  for (const hostile of ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(asRuntime(hostile), null, `${hostile} was accepted as a runtime`);
  }
  for (const wrong of ['ruby', '', 'LUAU', ' node', 1, null, undefined, {}, ['node']]) {
    assert.equal(asRuntime(wrong), null, `${JSON.stringify(wrong)} was accepted as a runtime`);
  }
  for (const b of SANDBOX_BACKENDS) assert.equal(asBackend(b), b);
  assert.equal(asBackend('__proto__'), null);
  assert.equal(asBackend('docker'), null);
});

test('admission refuses a runtime nobody defined rather than running it with no ceiling', () => {
  const r = refusal({ runtime: '__proto__', source: 'print(1)' }, 'unknown_runtime');
  // The message must name the real ones, or the caller cannot correct itself.
  for (const name of SANDBOX_RUNTIMES) assert.ok(r.error.includes(name), `the refusal does not mention ${name}`);
  refusal({ runtime: 'ruby', source: 'puts 1' }, 'unknown_runtime');
  refusal({ runtime: undefined, source: 'x' }, 'unknown_runtime');
  refusal({ runtime: 'node', backend: 'docker', source: 'x' }, 'unknown_backend');
});

test('a runtime is refused on a backend that cannot run it', () => {
  // There is no `node` in Roblox Studio. Admitting it would produce a run_code op carrying
  // JavaScript, which fails inside a user's place — the furthest point from the mistake.
  refusal({ runtime: 'node', backend: 'studio', source: 'console.log(1)' }, 'runtime_not_on_backend');
  refusal({ runtime: 'python', backend: 'studio', source: 'print(1)' }, 'runtime_not_on_backend');
  // And the table itself must stay non-vacuous.
  for (const rt of SANDBOX_RUNTIMES) {
    assert.ok(RUNTIME_BACKENDS[rt].length > 0, `${rt} can run nowhere`);
    for (const b of RUNTIME_BACKENDS[rt]) assert.ok(SANDBOX_BACKENDS.includes(b), `${rt} names backend ${b}`);
  }
});

test('an empty program is refused before anything else looks at it', () => {
  for (const source of ['', '   ', '\n\t', undefined, null, 42, {}]) {
    refusal({ runtime: 'node', source }, 'empty_source');
  }
});

/* ==================================================================== limits == */

test('no requested limits means the ceiling, for every runtime and every dimension', () => {
  for (const rt of SANDBOX_RUNTIMES) {
    const r = resolveLimits(rt);
    assert.ok(!isRefusal(r));
    assert.deepEqual(r.limits, SANDBOX_CEILINGS[rt]);
    assert.deepEqual(r.clamped, []);
  }
});

test('a limit that is not a finite number is REFUSED, not quietly defaulted', () => {
  // THE `??` TRAP, fed the values `??` does not defend against. If any of these fell through to
  // the ceiling, a caller would believe it had asked for something and been given it.
  const hostile = [NaN, Infinity, -Infinity, '10000', '', true, false, [], {}, () => 1];
  for (const name of LIMIT_NAMES) {
    for (const value of hostile) {
      const r = resolveLimits('node', { [name]: value });
      assert.ok(isRefusal(r), `${name}=${String(value)} was accepted`);
      assert.equal(r.code, 'bad_limit');
      assert.ok(r.error.includes(name), `the refusal for ${name} does not name it`);
    }
  }
});

test('a limit below the floor is refused rather than silently raised to something usable', () => {
  for (const name of LIMIT_NAMES) {
    const r = resolveLimits('node', { [name]: SANDBOX_FLOORS[name] - 1 });
    assert.ok(isRefusal(r), `${name} below the floor was accepted`);
    assert.equal(r.code, 'bad_limit');
  }
  for (const name of LIMIT_NAMES) {
    const r = resolveLimits('node', { [name]: 0 });
    assert.ok(isRefusal(r), `${name}=0 was accepted`);
  }
});

test('a limit above the ceiling is cut to the ceiling and SAID to have been cut', () => {
  const r = resolveLimits('node', { wallMs: 9_999_999, memoryMb: 100_000 });
  assert.ok(!isRefusal(r));
  // The claim is the RELATIONSHIP: what applies is the ceiling, which is less than what was asked.
  assert.equal(r.limits.wallMs, SANDBOX_CEILINGS.node.wallMs);
  assert.ok(r.limits.wallMs < 9_999_999);
  assert.equal(r.limits.memoryMb, SANDBOX_CEILINGS.node.memoryMb);
  assert.deepEqual(r.clamped.sort(), ['memoryMb', 'wallMs']);
  // A dimension that was not asked about is not reported as clamped.
  assert.ok(!r.clamped.includes('outputBytes'));
});

test('a limit under the ceiling is honoured exactly, and a fraction is floored', () => {
  const r = resolveLimits('python', { wallMs: 1500, outputBytes: 4096 });
  assert.ok(!isRefusal(r));
  assert.equal(r.limits.wallMs, 1500);
  assert.equal(r.limits.outputBytes, 4096);
  assert.deepEqual(r.clamped, []);
  const f = resolveLimits('python', { wallMs: 1500.9 });
  assert.ok(!isRefusal(f));
  assert.equal(f.limits.wallMs, 1500);
});

test('limits that are not an object at all are refused', () => {
  for (const bad of ['10s', 5, [1, 2], true]) {
    const r = resolveLimits('node', bad);
    assert.ok(isRefusal(r), `${JSON.stringify(bad)} was accepted as a limits object`);
  }
  // null/undefined mean "no request", which is the ceiling — that is the ONE defaulting case.
  for (const none of [null, undefined]) {
    const r = resolveLimits('node', none);
    assert.ok(!isRefusal(r));
    assert.deepEqual(r.limits, SANDBOX_CEILINGS.node);
  }
});

test('every ceiling is above its floor, or the runtime could never be admitted at all', () => {
  for (const rt of SANDBOX_RUNTIMES) {
    for (const name of LIMIT_NAMES) {
      assert.ok(SANDBOX_CEILINGS[rt][name] >= SANDBOX_FLOORS[name],
        `${rt}.${name} ceiling ${SANDBOX_CEILINGS[rt][name]} is below the floor ${SANDBOX_FLOORS[name]}`);
    }
  }
});

test('a program over the source ceiling is refused before it runs', () => {
  const huge = 'x'.repeat(SANDBOX_CEILINGS.node.sourceBytes + 1);
  const r = refusal({ runtime: 'node', source: `// ${huge}` }, 'source_too_large');
  assert.match(r.error, /\d+ bytes/);
  // And the ceiling is counted in BYTES: a multibyte program that fits in characters may not fit
  // in bytes, and a byte ceiling that counts UTF-16 units is not a byte ceiling.
  const multibyte = '"' + '😀'.repeat(200) + '"';
  assert.ok(byteLength(multibyte) > multibyte.length);
  const ok = admitted({ runtime: 'node', source: `const s = ${multibyte};`, limits: { sourceBytes: byteLength(multibyte) + 20 } });
  assert.ok(ok.limits.sourceBytes >= byteLength(multibyte));
  refusal({ runtime: 'node', source: `const s = ${multibyte};`, limits: { sourceBytes: multibyte.length } }, 'source_too_large');
});

/* ============================================================ source policy == */

test('PYTHON: the programs that leave the sandbox are refused, one code each', () => {
  const cases = [
    ['import os', 'py_import_denied'],
    ['import socket, math', 'py_import_denied'],
    ['from subprocess import run', 'py_import_denied'],
    ['from . import helper', 'py_import_denied'],
    ['import urllib.request', 'py_import_denied'],
    ["open('/etc/passwd').read()", 'py_filesystem'],
    ["__import__('os').system('ls')", 'py_dynamic_import'],
    ["eval('1+1')", 'py_dynamic_code'],
    ["exec('x = 1')", 'py_dynamic_code'],
    ['().__class__.__subclasses__()', 'py_dunder_escape'],
    ["os.system('ls')", 'py_process'],
  ];
  for (const [source, code] of cases) {
    const findings = scanSource('python', 'local-process', source).map((f) => f.code);
    assert.ok(findings.includes(code), `${source}  ->  ${findings.join(',') || 'nothing'} (wanted ${code})`);
    const r = refusal({ runtime: 'python', source }, 'policy');
    assert.ok(r.blocked.includes(code), `the refusal for ${source} does not carry ${code}`);
  }
});

test('PYTHON: the work the sandbox exists for is admitted', () => {
  // A policy that refuses ordinary computation gets routed around, so this is a safety property
  // too, not a convenience one.
  for (const source of [
    'import math\nprint(math.sqrt(2))',
    'import json, statistics\nprint(json.dumps({"m": statistics.mean([1,2,3])}))',
    'from collections import Counter\nprint(Counter("aab").most_common())',
    'print(sum(i*i for i in range(100)))',
    'import re\nprint(bool(re.match(r"^a+$", "aaa")))',
  ]) {
    admitted({ runtime: 'python', source });
  }
});

test('PYTHON: a comment about an import is not an import, and a string is not a comment', () => {
  admitted({ runtime: 'python', source: '# import os is not allowed here\nprint(1)' });
  // The stripper is string-aware: cutting from `#` to end of line blindly would lose the half of
  // this line that matters and admit the import.
  const findings = scanSource('python', 'local-process', 'label = "# not a comment"\nimport os\n').map((f) => f.code);
  assert.ok(findings.includes('py_import_denied'), 'an import after a string containing # was not seen');
});

test('NODE: the programs that leave the sandbox are refused, one code each', () => {
  const cases = [
    ["const fs = require('fs')", 'node_module_denied'],
    ["require('child_process').execSync('ls')", 'node_module_denied'],
    ["import http from 'node:http'", 'node_module_denied'],
    ["import { readFile } from 'fs/promises'", 'node_module_denied'],
    ["import('./secret.js')", 'node_dynamic_import'],
    ['process.env.CLOUDFLARE_API_TOKEN', 'node_process_escape'],
    ['process.binding("fs")', 'node_process_escape'],
    ["eval('1+1')", 'node_dynamic_code'],
    ["const f = new Function('return 1')", 'node_dynamic_code'],
    ["const { Worker } = require('worker_threads')", 'node_worker'],
  ];
  for (const [source, code] of cases) {
    const findings = scanSource('node', 'local-process', source).map((f) => f.code);
    assert.ok(findings.includes(code), `${source}  ->  ${findings.join(',') || 'nothing'} (wanted ${code})`);
    const r = refusal({ runtime: 'node', source }, 'policy');
    assert.ok(r.blocked.includes(code), `the refusal for ${source} does not carry ${code}`);
  }
});

test('NODE: the work the sandbox exists for is admitted', () => {
  for (const source of [
    'console.log(1 + 1)',
    "import assert from 'node:assert';\nassert.equal(1, 1);\nconsole.log('ok')",
    'const xs = Array.from({length: 10}, (_, i) => i * i);\nconsole.log(xs.join(","))',
    "import { createHash } from 'node:crypto';\nconsole.log(createHash('sha256').update('x').digest('hex'))",
  ]) {
    admitted({ runtime: 'node', source });
  }
  // A comment naming a denied module is not a use of it.
  admitted({ runtime: 'node', source: "// never require('child_process') here\nconsole.log(1)" });
  admitted({ runtime: 'node', source: "/* require('fs') is refused */\nconsole.log(1)" });
});

test('LUAU on the CLI: the escape surface of the standalone interpreter is refused', () => {
  // MEASURED: the standalone `luau` binary has no `io`, but `loadstring` and `require` both exist
  // there. The policy is written against what the interpreter actually exposes.
  const cases = [
    ['loadstring("return 1")()', 'luau_dynamic_code'],
    ['getfenv(1).x = 2', 'luau_dynamic_code'],
    ['local m = require("./other.luau")', 'luau_require'],
    ['os.execute("ls")', 'luau_process'],
    ['os.getenv("CLOUDFLARE_API_TOKEN")', 'luau_process'],
    ['local f = io.open("/etc/passwd")', 'luau_process'],
  ];
  for (const [source, code] of cases) {
    const findings = scanSource('luau', 'local-process', source).map((f) => f.code);
    assert.ok(findings.includes(code), `${source}  ->  ${findings.join(',') || 'nothing'} (wanted ${code})`);
    refusal({ runtime: 'luau', backend: 'local-process', source }, 'policy');
  }
  for (const source of [
    'local t = {} for i = 1, 100 do t[i] = i * i end print(#t)',
    'local s = 0 for i = 1, 10 do s += i end print(s)',
    'print(string.format("%0.2f", 1/3))',
  ]) {
    admitted({ runtime: 'luau', backend: 'local-process', source });
  }
});

test('the CLI rules do NOT follow Luau into Studio, where require-by-path is the whole point', () => {
  // The claim is the DIFFERENCE between the two backends for one program. `require(script.Parent.X)`
  // is the normal thing in a place and has no meaning under the CLI, so a single shared denylist
  // would have made run_spec — whose entire purpose is requiring project modules — unusable.
  const source = 'local Shop = require(game.ServerScriptService.Shop) print(Shop.price)';
  refusal({ runtime: 'luau', backend: 'local-process', source }, 'policy');
  admitted({ runtime: 'luau', backend: 'studio', source, ingress: refuseLuauIngress });
});

/* ====================================================== the fail-closed gate == */

test('Luau bound for Studio cannot be admitted without the asset-ingress gate', () => {
  // A gate that is optional is a gate that fails open. Forgetting to pass it IS the refusal.
  for (const runtime of ['luau', 'roblox-spec']) {
    const r = refusal({ runtime, backend: 'studio', source: 'print(1)' }, 'ingress_scanner_missing');
    assert.match(r.error, /ingress/i);
    // And nothing else in the request can substitute for it.
    refusal({ runtime, backend: 'studio', source: 'print(1)', ingress: 'yes' }, 'ingress_scanner_missing');
    refusal({ runtime, backend: 'studio', source: 'print(1)', ingress: null }, 'ingress_scanner_missing');
  }
});

test('the injected gate is the REAL one, and its refusal reaches the caller intact', () => {
  // Not a stub gate: this is tools.ts's own refuseLuauIngress, so the wiring is proven against the
  // scanner the product actually ships rather than against a convenient fake.
  const r = refusal(
    { runtime: 'luau', backend: 'studio', source: 'local m = game:GetObjects("rbxassetid://1")', ingress: refuseLuauIngress },
    'policy',
  );
  assert.ok(r.blocked.includes('get_objects'), `blocked codes were ${r.blocked.join(',')}`);
  assert.match(r.error, /insert_asset/);
  // A spec harness is a fine place to hide the same thing.
  const spec = refusal(
    { runtime: 'roblox-spec', backend: 'studio', source: '__case("x", function() require(12345) end)', ingress: refuseLuauIngress },
    'policy',
  );
  assert.ok(spec.blocked.includes('require_asset_id'));
});

test('the local Luau backend does not require the ingress gate, because there is no place to reach', () => {
  // Stated as a boundary rather than left implicit: under the CLI there is no `game`, so asset
  // ingress is not reachable and demanding the gate there would be theatre.
  const job = admitted({ runtime: 'luau', backend: 'local-process', source: 'print(1)' });
  assert.equal(job.backend, 'local-process');
});

/* =============================================================== enforcement == */

test('the enforcement profile tells the truth about the Studio backend', () => {
  // THE DECLARATION IS THE FEATURE. The plugin has never read `timeoutMs`, and a Luau loop with no
  // yield holds Studio's main thread — so a wall number here bounds the worker's WAIT and nothing
  // else. If this ever becomes enforceable, this assertion is what makes somebody update the
  // profile rather than leaving a stale promise in place.
  const studio = BACKEND_ENFORCEMENT.studio;
  assert.equal(studio.wall, 'unenforced');
  assert.equal(studio.memory, 'unenforced');
  assert.equal(studio.output, 'truncate-after-transfer');

  const local = BACKEND_ENFORCEMENT['local-process'];
  assert.equal(local.wall, 'kill');
  assert.equal(local.output, 'kill');
  assert.equal(local.memory, 'kill-polled');
  // Neither backend jails a socket, and neither claims to.
  assert.equal(studio.network, 'unenforced');
  assert.equal(local.network, 'unenforced');
});

test('an admitted job carries the profile of the backend it is going to', () => {
  const s = admitted({ runtime: 'luau', backend: 'studio', source: 'print(1)', ingress: refuseLuauIngress });
  const l = admitted({ runtime: 'luau', backend: 'local-process', source: 'print(1)' });
  assert.equal(s.enforcement.wall, 'unenforced');
  assert.equal(l.enforcement.wall, 'kill');
  assert.notDeepEqual(s.enforcement, l.enforcement, 'one program, two backends, the same promise');
});

/* ==================================================================== output == */

test('capOutput cuts to the BYTE ceiling and reports what it dropped', () => {
  const under = capOutput('hello', 100);
  assert.equal(under.truncated, false);
  assert.equal(under.dropped, 0);
  assert.equal(under.text, 'hello');

  const over = capOutput('x'.repeat(1000), 100);
  assert.equal(over.truncated, true);
  assert.equal(over.bytes, 100);
  assert.equal(over.dropped, 900);
  assert.ok(over.text.length <= 100);

  // Multibyte: the cut must not leave half a character behind, and the byte count must be real.
  const emoji = '😀'.repeat(50); // 4 bytes each
  const cut = capOutput(emoji, 10);
  assert.ok(byteLength(cut.text) <= 10, `kept ${byteLength(cut.text)} bytes for a 10-byte ceiling`);
  assert.ok(!cut.text.includes('�'), 'a partial character survived the cut');
  assert.equal(cut.truncated, true);
});

test('capPrints drops whole lines at the ceiling and says how many', () => {
  const lines = Array.from({ length: 200 }, (_, i) => `line ${i} ` + 'x'.repeat(100));
  const capped = capPrints(lines, 1000);
  assert.ok(capped.truncated);
  assert.ok(capped.prints.length < lines.length);
  assert.equal(capped.dropped, lines.length - capped.prints.length);
  const bytes = capped.prints.reduce((n, l) => n + byteLength(l) + 1, 0);
  assert.ok(bytes <= 1000, `kept ${bytes} bytes against a 1000-byte ceiling`);

  const small = capPrints(['a', 'b'], 1000);
  assert.equal(small.truncated, false);
  assert.deepEqual(small.prints, ['a', 'b']);
  // Anything that is not a list of prints yields nothing rather than throwing into a tool result.
  assert.deepEqual(capPrints(undefined, 100).prints, []);
  assert.deepEqual(capPrints('not a list', 100).prints, []);
});

test('a run stopped by a ceiling never renders as a result', () => {
  const base = {
    runtime: 'node', backend: 'local-process', ok: false, exitCode: null, signal: 'SIGKILL',
    stdout: '', stderr: '', outputDropped: 0, outputTruncated: false, durationMs: 400,
    peakMemoryMb: null, memoryCeilingRssMb: null,
    limits: SANDBOX_CEILINGS.node, enforcement: BACKEND_ENFORCEMENT['local-process'],
  };
  for (const reason of ['wall_clock', 'memory', 'output_limit']) {
    const line = describeResult({ ...base, reason });
    assert.match(line, /KILLED/, `${reason} renders as "${line}"`);
  }
  // `unknown` is a stop this host could not attribute; it must not borrow `exit`'s wording.
  const unknown = describeResult({ ...base, reason: 'unknown' });
  assert.doesNotMatch(unknown, /finished/);
  const finished = describeResult({ ...base, reason: 'exit', ok: true, exitCode: 0, signal: null });
  assert.match(finished, /finished/);
});

/* =================================================================== wiring === */

/** A fake Studio that records what it was asked to do and answers with what the test supplies. */
function fakeCtx(answer = { ok: true, data: { result: 1, prints: [] } }) {
  const calls = [];
  return {
    calls,
    ctx: {
      env: {},
      studioConnected: () => true,
      execStudioOp: async (op, timeoutMs) => {
        calls.push({ op, timeoutMs });
        return typeof answer === 'function' ? answer(op) : answer;
      },
      createCheckpoint: async () => ({ id: 'c1' }),
      addMemoryFact: async () => {},
    },
  };
}

test('run_luau refuses an over-ceiling program WITHOUT queueing a Studio op', () => {
  // The ceiling has to bite before the op is queued, or it is not a ceiling on anything — the
  // code would already be running in the user's place by the time anyone measured it.
  const { ctx, calls } = fakeCtx();
  const huge = `-- ${'x'.repeat(SANDBOX_CEILINGS.luau.sourceBytes)}\nprint(1)`;
  return TOOLS.run_luau.run(ctx, { code: huge }).then((res) => {
    assert.ok(res.error, 'an over-ceiling program was not refused');
    assert.match(res.error, /bytes/);
    assert.equal(calls.length, 0, 'the op was queued anyway');
  });
});

test('run_luau still refuses asset ingress, now through admission', () => {
  const { ctx, calls } = fakeCtx();
  return TOOLS.run_luau.run(ctx, { code: 'game:GetObjects("rbxassetid://1")' }).then((res) => {
    assert.ok(res.error);
    assert.match(res.error, /insert_asset/);
    assert.deepEqual(res.blocked.sort(), ['asset_uri', 'get_objects']);
    assert.equal(calls.length, 0, 'refused code was sent to Studio anyway');
  });
});

test('run_luau sends the admitted ceiling to the plugin, and waits longer than it', () => {
  const { ctx, calls } = fakeCtx();
  return TOOLS.run_luau.run(ctx, { code: 'print(1)' }).then(() => {
    assert.equal(calls.length, 1);
    const [call] = calls;
    assert.equal(call.op.op, 'run_code');
    // WHAT THIS CATCHES, STATED, because the number is currently a coincidence: the constant this
    // call site used to carry (10_000) happens to equal the ceiling, so reverting to a hardcoded
    // timeout would NOT turn this red today — the two tests above it are what notice a bypass.
    // This one is the drift guard: change the ceiling in sandbox.ts and a hardcoded call site
    // stops agreeing with it here.
    assert.equal(call.op.timeoutMs, SANDBOX_CEILINGS.luau.wallMs,
      'the op carries a timeout the contract did not set');
    // The WAIT must exceed the wall the plugin was asked for: giving up first would turn
    // slow-but-finished work into a phantom timeout. The relationship is the claim, not the number.
    assert.ok(call.timeoutMs > call.op.timeoutMs,
      `worker waits ${call.timeoutMs}ms for a ${call.op.timeoutMs}ms ceiling`);
  });
});

test('run_luau caps a flood of prints and ANNOUNCES the truncation', () => {
  // The plugin collects __prints with no bound, so this is the first point that can cut it. A
  // shortened log that reads as a complete one is exactly the failure the discipline names.
  const prints = Array.from({ length: 4000 }, (_, i) => `row ${i} ` + 'y'.repeat(100));
  const { ctx } = fakeCtx({ ok: true, data: { result: 'done', prints } });
  return TOOLS.run_luau.run(ctx, { code: 'print("x")' }).then((res) => {
    assert.ok(res.prints.length < prints.length, 'nothing was dropped');
    assert.equal(res.outputTruncated, true);
    assert.match(res.outputNote, /dropped/);
    assert.equal(res.result, 'done', 'the returned value was lost along with the output');
    const bytes = res.prints.reduce((n, l) => n + byteLength(l) + 1, 0);
    assert.ok(bytes <= SANDBOX_CEILINGS.luau.outputBytes,
      `kept ${bytes} bytes against a ${SANDBOX_CEILINGS.luau.outputBytes}-byte ceiling`);
  });
});

test('run_luau leaves a small result alone — no note, nothing dropped', () => {
  const { ctx } = fakeCtx({ ok: true, data: { result: 7, prints: ['a', 'b'] } });
  return TOOLS.run_luau.run(ctx, { code: 'print("a") print("b") return 7' }).then((res) => {
    assert.deepEqual(res.prints, ['a', 'b']);
    assert.equal(res.outputTruncated, undefined);
    assert.equal(res.outputNote, undefined);
    assert.equal(res.result, 7);
  });
});

test('run_spec admits through the same contract: ingress refusal, no op, spec ceiling on the op', () => {
  const backdoor = fakeCtx();
  return TOOLS.run_spec.run(backdoor.ctx, { cases: [{ name: 'sneaky', code: 'require(12345)' }] })
    .then((res) => {
      assert.ok(res.error, 'a spec case hiding require(<asset id>) was not refused');
      assert.ok(res.blocked.includes('require_asset_id'));
      assert.equal(backdoor.calls.length, 0, 'the harness was sent to Studio anyway');

      const clean = fakeCtx({ ok: true, data: { result: '{"cases":[{"name":"n","status":"pass","durationMs":1}]}' } });
      return TOOLS.run_spec.run(clean.ctx, { cases: [{ name: 'n', code: 'assert(1 == 1)' }] }).then((ok) => {
        assert.equal(ok.passed, 1, `the harness result was not read back: ${JSON.stringify(ok).slice(0, 160)}`);
        assert.equal(clean.calls.length, 1);
        assert.equal(clean.calls[0].op.timeoutMs, SANDBOX_CEILINGS['roblox-spec'].wallMs);
        // A spec gets longer than a snippet, because it is many cases in one op.
        assert.ok(SANDBOX_CEILINGS['roblox-spec'].wallMs > SANDBOX_CEILINGS.luau.wallMs);
      });
    });
});

test('the spec source ceiling cannot refuse a spec that the case ceiling already admitted', () => {
  // Two gates in series over one payload. If the second were tighter than the first, a spec of the
  // maximum legal size would be accepted by refuseSpecCases and then refused here — a dead end the
  // model could not diagnose, because neither message would mention the other limit.
  const worstCase = SPEC_LIMITS.maxCases * SPEC_LIMITS.maxCodeChars
    + SPEC_LIMITS.maxCases * (SPEC_LIMITS.maxNameChars + 64);
  assert.ok(SANDBOX_CEILINGS['roblox-spec'].sourceBytes > worstCase,
    `a maximal spec assembles to about ${worstCase} bytes, over the ${SANDBOX_CEILINGS['roblox-spec'].sourceBytes}-byte source ceiling`);
});
