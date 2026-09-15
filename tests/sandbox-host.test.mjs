/**
 * THE LOCAL SANDBOX HOST — the ceilings, proven by running programs that break them.
 *
 * apps/worker/tests/sandbox-contract.test.mjs proves ADMISSION: what is refused before anything
 * runs. This file proves ENFORCEMENT, which is a different claim and cannot be checked by reading
 * a table. Every ceiling here is exercised by an actual over-limit program — an endless loop, an
 * allocator that never stops, a print in a `while true` — and the assertion is that the run was
 * KILLED and says so. A guard that only walks the healthy path exercises nothing; these all walk
 * the violating one.
 *
 * WHY THAT MATTERS HERE PARTICULARLY. Three places in this repository already shell out to `luau`
 * and `python3` with `execFileSync` and no timeout, so a runaway program hangs the suite until a
 * person notices. The host exists to make that impossible, and the only evidence that it does is a
 * test that starts a runaway program and watches the clock.
 *
 * WHAT IS NOT CLAIMED. The host is not a jail — no namespaces, no seccomp, no network isolation —
 * and `enforcement.network` says `unenforced` for exactly that reason. What is proven below is
 * that a program cannot run forever, cannot grow without bound, cannot flood the output, and
 * cannot read this machine's secrets out of the environment.
 *
 * Run with:  node --test tests/sandbox-host.test.mjs        (from the repository root)
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  execute,
  runSandbox,
  runSpecLocally,
  runtimeAvailable,
  sandboxEnv,
  admitProgram,
  isRefusal,
  MEMORY_POLL_MS,
} from '../scripts/lib/sandbox-host.mjs';
import { SANDBOX_CEILINGS, BACKEND_ENFORCEMENT } from '../apps/worker/src/sandbox.ts';

/** Absent toolchains SKIP with a reason. A green run that tested nothing is the thing to avoid. */
const HAVE = {
  node: runtimeAvailable('node'),
  python: runtimeAvailable('python'),
  luau: runtimeAvailable('luau'),
};
const need = (rt) => (HAVE[rt] ? false : `${rt} is not installed on this machine, so its ceilings were NOT measured here`);

/** The runtimes present, so a loop over them cannot silently become a loop over nothing. */
const PRESENT = Object.keys(HAVE).filter((rt) => HAVE[rt]);

/** A program that never finishes, per runtime. */
const FOREVER = {
  node: 'for (;;) {}',
  python: 'while True:\n    pass\n',
  luau: 'while true do end',
};

/** A program that allocates until something stops it. Each grows fast enough to cross a 64MiB
 *  ceiling in well under a second — measured; a slow grower would prove the wall clock instead. */
const GREEDY = {
  node: 'const held = [];\nfor (;;) { held.push(new Array(50000).fill(7)); }',
  python: 'held = []\nwhile True:\n    held.append(bytearray(4 * 1024 * 1024))\n',
  luau: 'local held = {} local base = string.rep("x", 2 * 1024 * 1024) local i = 0\nwhile true do i += 1 held[i] = base .. tostring(i) end',
};

/** A program that prints until something stops it. */
const FLOOD = {
  node: 'const line = "x".repeat(1000);\nfor (;;) { console.log(line); }',
  python: 'line = "x" * 1000\nwhile True:\n    print(line)\n',
  luau: 'local line = string.rep("x", 1000) while true do print(line) end',
};

/** A program that fails the ordinary way: it runs, it errors, it exits non-zero. */
const FAILS = {
  node: 'throw new Error("deliberate")',
  python: 'raise ValueError("deliberate")',
  luau: 'error("deliberate")',
};

/** A program that prints something a test can recognise. */
const HELLO = {
  node: 'console.log(6 * 7)',
  python: 'print(6 * 7)',
  luau: 'print(6 * 7)',
};

test('the runtimes this file measures are actually present, or it says which are not', () => {
  // The denominator, stated. If this ever prints an empty list, every loop below is vacuous and
  // the file is reporting the absence of a toolchain as the absence of a defect.
  assert.ok(PRESENT.includes('node'), 'node runs this test, so it must be available to the host');
  for (const rt of ['python', 'luau']) {
    if (!HAVE[rt]) console.log(`  (skipping ${rt}: not installed — its ceilings were not measured on this machine)`);
  }
});

/* ============================================================== it still works == */

for (const rt of ['node', 'python', 'luau']) {
  test(`${rt}: an ordinary program runs and its output comes back`, { skip: need(rt) }, async () => {
    // A sandbox that refuses everything passes every safety test and is worth nothing.
    const r = await execute({ runtime: rt, source: HELLO[rt] });
    assert.ok(!isRefusal(r), `admission refused a harmless program: ${isRefusal(r) ? r.error : ''}`);
    assert.equal(r.reason, 'exit', `stderr was: ${r.stderr.slice(0, 200)}`);
    assert.equal(r.ok, true);
    assert.equal(r.exitCode, 0);
    assert.match(r.stdout, /42/);
    assert.equal(r.outputTruncated, false);
    assert.equal(r.enforcement.wall, 'kill', 'a local run must carry the local profile');
  });
}

/* ============================================================== the wall clock == */

for (const rt of ['node', 'python', 'luau']) {
  test(`${rt}: a program that never finishes is KILLED at the wall-clock ceiling`, { skip: need(rt) }, async () => {
    const wallMs = 700;
    const started = Date.now();
    const r = await execute({ runtime: rt, source: FOREVER[rt], limits: { wallMs } });
    const elapsed = Date.now() - started;

    assert.equal(r.reason, 'wall_clock', `the run ended as ${r.reason}, not at the ceiling`);
    assert.equal(r.ok, false, 'an endless loop must never report success');
    // THE RELATIONSHIP IS THE CLAIM: it ran at least as long as its ceiling and nothing like
    // forever. A hardcoded duration would pass on a fast machine and fail on a loaded one.
    assert.ok(elapsed >= wallMs, `returned after ${elapsed}ms, before its own ${wallMs}ms ceiling — did it run at all?`);
    assert.ok(elapsed < wallMs * 8, `took ${elapsed}ms to stop a ${wallMs}ms program`);
    assert.equal(r.signal, 'SIGKILL', 'the process was asked nicely rather than killed');
  });
}

test('a longer ceiling really does run longer — the wall number is read, not decorative', { skip: need('node') }, async () => {
  // One program, two ceilings. If the timer ignored `limits.wallMs` and used a constant, both runs
  // would take the same time and this comparison is what notices.
  const quick = await execute({ runtime: 'node', source: FOREVER.node, limits: { wallMs: 300 } });
  const slower = await execute({ runtime: 'node', source: FOREVER.node, limits: { wallMs: 1200 } });
  assert.equal(quick.reason, 'wall_clock');
  assert.equal(slower.reason, 'wall_clock');
  assert.ok(slower.durationMs > quick.durationMs + 400,
    `300ms ceiling took ${quick.durationMs}ms, 1200ms ceiling took ${slower.durationMs}ms`);
});

/* =================================================================== memory === */

for (const rt of ['node', 'python', 'luau']) {
  test(`${rt}: a program that allocates without bound is stopped at the memory ceiling`, { skip: need(rt) }, async () => {
    // The wall is set far above what the allocator needs, so a `wall_clock` here would mean the
    // memory ceiling did nothing and the timer covered for it.
    const r = await execute({ runtime: rt, source: GREEDY[rt], limits: { memoryMb: 64, wallMs: 9000 } });
    assert.equal(r.ok, false, 'an unbounded allocation reported success');
    assert.equal(r.reason, 'memory',
      `ended as ${r.reason} after ${r.durationMs}ms, peak ${r.peakMemoryMb}MiB against a ${r.memoryCeilingRssMb}MiB resident ceiling`);
    // The ceiling actually applied is the program's allowance PLUS the interpreter's own
    // footprint, and the result says so rather than implying 64MiB of resident set was enforced.
    assert.ok(r.memoryCeilingRssMb > r.limits.memoryMb,
      'the resident ceiling does not account for the interpreter, so a hello-world would be killed');
    assert.equal(r.limits.memoryMb, 64);
  });
}

test('memory is declared kill-POLLED, because a sampled ceiling can be exceeded before it fires', () => {
  // Honesty about the mechanism, pinned. A program may cross the line and be killed a poll later,
  // so `peakMemoryMb` can exceed the ceiling — which is a fact about sampling, not a failure, and
  // is exactly why this dimension is not called `kill`.
  assert.equal(BACKEND_ENFORCEMENT['local-process'].memory, 'kill-polled');
  assert.ok(MEMORY_POLL_MS > 0 && MEMORY_POLL_MS <= 250, `a ${MEMORY_POLL_MS}ms poll is not a ceiling`);
});

/* =================================================================== output === */

for (const rt of ['node', 'python', 'luau']) {
  test(`${rt}: an output flood is cut at the ceiling and the run is stopped`, { skip: need(rt) }, async () => {
    const outputBytes = 4_000;
    const r = await execute({ runtime: rt, source: FLOOD[rt], limits: { outputBytes, wallMs: 9000 } });
    assert.equal(r.reason, 'output_limit', `ended as ${r.reason} after ${r.durationMs}ms`);
    assert.equal(r.ok, false);
    const kept = Buffer.byteLength(r.stdout + r.stderr, 'utf8');
    assert.ok(kept <= outputBytes, `kept ${kept} bytes against a ${outputBytes}-byte ceiling`);
    // TRUNCATION IS ANNOUNCED. A caller reading this output must be able to tell it is a fragment;
    // output that looks whole is how a killed run gets read as a finished one.
    assert.equal(r.outputTruncated, true);
    assert.ok(r.outputDropped > 0, 'bytes were dropped without being counted');
  });
}

/* ================================================= an ordinary failure is not a ceiling == */

for (const rt of ['node', 'python', 'luau']) {
  test(`${rt}: a program that simply errors is reported as an exit, not as a ceiling`, { skip: need(rt) }, async () => {
    // The mirror of every test above. A host that reported `wall_clock` for an ordinary crash
    // would make the ceiling reports meaningless, because they would no longer distinguish
    // anything. This is the case that keeps them meaning something.
    const r = await execute({ runtime: rt, source: FAILS[rt] });
    assert.equal(r.reason, 'exit', `an ordinary error was attributed to ${r.reason}`);
    assert.equal(r.ok, false, 'a program that threw reported success');
    assert.notEqual(r.exitCode, 0);
    assert.match(r.stderr, /deliberate/);
  });
}

/* =============================================================== environment === */

test('the environment handed to a program is four variables, none of them this machine\'s', () => {
  process.env.GOLEM_SANDBOX_SENTINEL = 'a-secret-that-must-not-travel';
  try {
    const env = sandboxEnv('/tmp/scratch');
    assert.deepEqual(Object.keys(env).sort(), ['HOME', 'LANG', 'PATH', 'TMPDIR']);
    assert.equal(env.GOLEM_SANDBOX_SENTINEL, undefined);
    assert.equal(env.HOME, '/tmp/scratch', 'HOME must point at the scratch dir, not the real one');
    assert.ok(env.PATH, 'without PATH nothing can be spawned at all');
  } finally {
    delete process.env.GOLEM_SANDBOX_SENTINEL;
  }
});

test('END TO END: a program that reads the environment finds none of this machine\'s secrets', { skip: need('node') }, async () => {
  // THIS PROGRAM DELIBERATELY EVADES THE POLICY SCAN, and that is the point of the test.
  // `scanSource` refuses the literal `process.env`; assembling the name defeats a text scanner,
  // which sandbox.ts says plainly it is. So this asserts the layer BELOW the scanner: even when a
  // program gets to read the environment, there is nothing in it. If the scan were the only thing
  // standing between a model-authored program and CLOUDFLARE_API_TOKEN, this test would fail.
  process.env.GOLEM_SANDBOX_SENTINEL = 'a-secret-that-must-not-travel';
  try {
    const evade = 'const e = globalThis["pro" + "cess"].env;\nconsole.log(Object.keys(e).sort().join(","));';
    const job = admitProgram({ runtime: 'node', backend: 'local-process', source: evade });
    assert.ok(!isRefusal(job), 'the evasion was refused, so this test no longer measures the layer below the scanner');
    const r = await runSandbox(job);
    assert.equal(r.reason, 'exit');
    assert.ok(!r.stdout.includes('GOLEM_SANDBOX_SENTINEL'), `the environment leaked: ${r.stdout.slice(0, 200)}`);

    const keys = r.stdout.trim().split(',').filter(Boolean);
    // The denominator: the parent has far more than four, so "the child saw four" is a real cut.
    assert.ok(Object.keys(process.env).length > 10,
      `the parent process has ${Object.keys(process.env).length} variables; this comparison would prove nothing`);

    // The four the host passes, plus what the PLATFORM adds to every process it starts whatever
    // environment is supplied. Named individually rather than loosening the assertion to "contains
    // the four", so a genuinely new variable — a leak — still fails.
    //
    //   __CF_USER_TEXT_ENCODING   CoreFoundation injects it on darwin.
    //   NODE_V8_COVERAGE          node propagates it into every child when the parent is running
    //                             under coverage, so that subprocess coverage is collected. The
    //                             host cannot suppress it by supplying an env: the injection
    //                             happens after. ONLY tolerated when the parent has it — on an
    //                             ordinary run the expected set is still exactly five, and a child
    //                             that produced this name out of nowhere would still fail.
    //
    // THIS IS WHY IT MATTERS RATHER THAN BEING TIDINESS. scripts/gate-check.mjs runs every CHECK
    // under NODE_V8_COVERAGE. So this test passed standalone and failed only when run by the gate
    // that asserts the suite is green — which is the shape of failure the comment at the head of
    // tests/check-escape-hatches.test.mjs describes, hit a second time in a different file.
    const expected = new Set(['HOME', 'LANG', 'PATH', 'TMPDIR', '__CF_USER_TEXT_ENCODING']);
    if (process.env.NODE_V8_COVERAGE) expected.add('NODE_V8_COVERAGE');
    for (const k of ['HOME', 'LANG', 'PATH', 'TMPDIR']) {
      assert.ok(keys.includes(k), `the program did not receive ${k}`);
    }
    assert.deepEqual(keys.filter((k) => !expected.has(k)), [], `the program saw ${keys.join(',')}`);
  } finally {
    delete process.env.GOLEM_SANDBOX_SENTINEL;
  }
});

/* ================================================== admission is not optional === */

test('a refused program is never run, and the refusal is what comes back', async () => {
  const r = await execute({ runtime: 'node', source: "require('child_process').execSync('echo pwned')" });
  assert.ok(isRefusal(r), 'a program reaching for child_process was executed');
  assert.equal(r.code, 'policy');
  assert.ok(r.blocked.includes('node_module_denied'));
  // A refusal carries no run: nothing to mistake for a result.
  assert.equal(r.stdout, undefined);
  assert.equal(r.reason, undefined);
});

test('the host refuses to execute anything admission did not admit', async () => {
  const refusal = admitProgram({ runtime: 'ruby', source: 'puts 1' });
  assert.ok(isRefusal(refusal));
  await assert.rejects(() => runSandbox(refusal), /refusal/i,
    'the host ran a refusal, which makes admission advisory');

  // And it will not pretend to be the other backend. A studio job here would silently lose every
  // ceiling this file proves, because nothing in this process is executing it.
  const studioJob = { runtime: 'luau', backend: 'studio', source: 'print(1)', limits: SANDBOX_CEILINGS.luau, clamped: [], enforcement: BACKEND_ENFORCEMENT.studio };
  await assert.rejects(() => runSandbox(studioJob), /local-process/,
    'the host accepted a job destined for Studio');
});

/* ========================================================= the Roblox harness === */

test('ROBLOX SPEC: the harness runs under the CLI and reports each case on its own', { skip: need('luau') }, async () => {
  // The same assembler `run_spec` sends to Studio, run where its ceilings can be enforced. The
  // claim is per-case isolation: one failing case must not hide the ones after it.
  const r = await runSpecLocally([
    { name: 'arithmetic holds', code: 'assert(1 + 1 == 2, "maths")' },
    { name: 'a deliberate failure', code: 'assert(false, "deliberate")' },
    { name: 'and the run continues', code: 'local t = {} t[1] = 1 assert(#t == 1)' },
  ]);
  assert.ok(!isRefusal(r), `the spec was refused: ${isRefusal(r) ? r.error : ''}`);
  assert.equal(r.reason, 'exit', `stderr: ${r.stderr.slice(0, 200)}`);
  assert.ok(r.run, `the harness report could not be read back from: ${r.stdout.slice(0, 200)}`);
  assert.equal(r.run.passed, 2);
  assert.equal(r.run.failed, 1);
  assert.equal(r.run.cases.length, 3, 'a failing case swallowed the ones after it');
  const failed = r.run.cases.find((c) => c.status === 'fail');
  assert.match(failed.message, /deliberate/);
  assert.equal(failed.name, 'a deliberate failure');
});

test('ROBLOX SPEC: a case that needs the engine FAILS here rather than passing against a fake', { skip: need('luau') }, async () => {
  // Stated as a boundary. There is no `game` under the CLI, so this run is evidence about the
  // harness, never about a project's modules — and the way you can tell is that the case fails
  // loudly instead of quietly succeeding.
  const r = await runSpecLocally([{ name: 'reaches for the place', code: 'local m = game.ServerScriptService.Shop' }]);
  assert.equal(r.run.failed, 1);
  assert.equal(r.run.passed, 0);
  assert.match(r.run.cases[0].message, /nil/i);
});

test('ROBLOX SPEC: a runaway case is killed, and the run reports NO cases at all', { skip: need('luau') }, async () => {
  // The most important assertion in this file. The harness pcalls each case, so a case that never
  // returns takes the whole run with it — the report is never printed. Reporting the cases that
  // "would have" passed, or parsing a truncated stdout, would be a failure to observe rendered as
  // an observation. `run` must be null.
  const r = await runSpecLocally(
    [
      { name: 'finishes', code: 'assert(true)' },
      { name: 'never finishes', code: 'while true do end' },
    ],
    { wallMs: 700 },
  );
  assert.equal(r.reason, 'wall_clock');
  assert.equal(r.ok, false);
  assert.equal(r.run, null, 'a killed harness reported case results it never printed');
});

test('ROBLOX SPEC: a case that PRINTS a report and then hangs does not get it believed', { skip: need('luau') }, async () => {
  // THE FIXTURE THAT MAKES THE GUARD ABOVE REAL. The previous test could not falsify it: a
  // harness killed mid-run prints nothing at all, so parsing its stdout returns null whether the
  // guard is there or not — a test that passes because it measured nothing.
  //
  // This is the case where it matters. Case bodies are model-authored Luau, so a case can print
  // ANYTHING, including something shaped exactly like the harness's own report, and then never
  // return. Without the "only a finished run carries a report" guard, that decoy is parsed and a
  // killed run reports two passing cases that never happened.
  // The flood after the decoy is not decoration: stdout is block-buffered when it is not a
  // terminal, so a program that prints once and then hangs is SIGKILLed with its decoy still in
  // the buffer and nothing arrives. The flood forces the flush, and the output ceiling — set to
  // exactly the decoy's length — then stops the run with precisely the decoy on stdout. That is
  // the only arrangement in which a killed run CAN hand a parseable report to the caller, which
  // is why the fixture is built this way.
  // Padded past the 256-byte output FLOOR: the ceiling has to be set to the decoy's exact length
  // for the fixture to work, and a limit below the floor is refused before anything runs.
  const decoy = JSON.stringify({
    cases: [{ name: `invented ${'x'.repeat(240)}`, status: 'pass', durationMs: 1 }],
  });
  assert.ok(Buffer.byteLength(decoy, 'utf8') > 256, 'the decoy is below the output floor and would be refused');
  const r = await runSpecLocally(
    [{ name: 'prints a report then floods', code: `print('${decoy}')\nwhile true do print(string.rep("x", 400)) end` }],
    { outputBytes: Buffer.byteLength(decoy, 'utf8'), wallMs: 9000 },
  );
  assert.equal(r.reason, 'output_limit', `ended as ${r.reason}; stdout was ${JSON.stringify(r.stdout.slice(0, 120))}`);
  assert.equal(r.stdout, decoy, 'the fixture did not deliver a parseable decoy, so this proves nothing');
  assert.equal(r.run, null, 'a killed run reported cases that came from the program, not from the harness');
});

test('ROBLOX SPEC: the case ceiling is applied before anything is assembled', async () => {
  const many = Array.from({ length: 200 }, (_, i) => ({ name: `case ${i}`, code: 'assert(true)' }));
  const r = await runSpecLocally(many);
  assert.ok(isRefusal(r), '200 cases were assembled into one chunk');
  assert.equal(r.code, 'policy');
  assert.match(r.error, /cases/);
  const empty = await runSpecLocally([]);
  assert.ok(isRefusal(empty));
});
