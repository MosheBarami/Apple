#!/usr/bin/env node
// Run a test command and assert a FLOOR of passing tests as well as zero failures.
//
// WHY `fail 0` IS NOT AN ORACLE. `node --test` prints `fail 0` and exits 0 for a file with zero
// executable tests, for a file where every test is `.skip`, and for a file that was emptied. Every
// gate in this repository whose EXPECT is `fail 0` is therefore satisfiable by DELETING the test
// it gates — the cheapest possible way to turn a red gate green, and one that leaves the checkbox
// ticked and the ledger looking complete.
//
// A floor closes that — but only if it is DERIVED. `node --test` counts each FILE as one passing
// test, so an emptied file still reports `pass 1`: a floor of 1 proves nothing. The number has to
// come from the real subtest count with a little headroom, and then emptying the file drops the
// count to 1 and the gate goes red.
//
// The number is derived from what the suite actually contains, with headroom,
// and it is asserted alongside zero failures — so the gate goes red both when a test fails and
// when tests go missing. §5.5 calls the alternative out by name: a magic exact count breaks when
// work is ADDED, which trains people to edit the number instead of investigating.
//
//   node scripts/assert-tests.mjs --floor 40 --label G-ORACLE-1 -- node --test tests/x.test.mjs
//
// Prints `<label> OK <n> passed` on success and exits 0; prints `<label> FAIL …` and exits 1
// otherwise. The success token carries the label so one gate's EXPECT cannot be satisfied by
// another gate's output.
import { spawnSync } from 'node:child_process';

const argv = process.argv.slice(2);
const dashdash = argv.indexOf('--');
if (dashdash === -1) {
  console.error('assert-tests: usage — assert-tests.mjs --floor <n> --label <id> -- <command...>');
  process.exit(2);
}

const opts = argv.slice(0, dashdash);
const command = argv.slice(dashdash + 1);
if (!command.length) {
  console.error('assert-tests: no command after --');
  process.exit(2);
}

const valueOf = (name) => {
  const i = opts.indexOf(name);
  return i === -1 ? null : opts[i + 1] ?? null;
};

const floor = Number(valueOf('--floor'));
const label = valueOf('--label') ?? 'ASSERT-TESTS';
if (!Number.isInteger(floor) || floor < 1) {
  console.error('assert-tests: --floor must be a positive integer');
  process.exit(2);
}
for (const o of opts) {
  if (o.startsWith('--') && !['--floor', '--label'].includes(o)) {
    console.error(`assert-tests: unrecognised flag ${o}`);
    process.exit(2);
  }
}

const proc = spawnSync(command[0], command.slice(1), {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
  stdio: ['ignore', 'pipe', 'pipe'],
});
const out = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
process.stdout.write(out);

// `node --test` writes `ℹ pass N` / `ℹ fail N`; the TAP reporter writes `# pass N`. Both are
// matched, and the LAST occurrence wins so a per-file line cannot be mistaken for the total.
const last = (re) => {
  const all = [...out.matchAll(re)];
  return all.length ? Number(all[all.length - 1][1]) : null;
};
const passed = last(/^[ℹ#]\s*pass (\d+)$/gm);
const failed = last(/^[ℹ#]\s*fail (\d+)$/gm);

if (passed === null || failed === null) {
  console.log(`${label} FAIL — no pass/fail totals in the output; the runner did not report a summary`);
  process.exit(1);
}
if (proc.status !== 0) {
  console.log(`${label} FAIL — the runner exited ${proc.status}`);
  process.exit(1);
}
if (failed > 0) {
  console.log(`${label} FAIL — ${failed} failing test(s)`);
  process.exit(1);
}
if (passed < floor) {
  // The case a `fail 0` oracle cannot see: the tests did not fail, they stopped existing.
  console.log(`${label} FAIL — ${passed} passed, below the floor of ${floor}. Tests went missing, not red.`);
  process.exit(1);
}

console.log(`${label} OK ${passed} passed`);
