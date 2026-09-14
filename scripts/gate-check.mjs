#!/usr/bin/env node
// The gate checker.
//
// GATES.md says a gate counts as met only when its CHECK: exits zero and its EXPECT: matches, and
// its evidence block says the values were "recorded by the checker rather than claimed". This is
// that checker. It did not exist when that sentence was written — `git log --all -- '*gate-check*'`
// was empty — so every EVIDENCE line in the ledger was, at the time, a claim about a measurement
// no program had made. That is precisely the failure the ledger exists to prevent, in the ledger
// itself, which is why this file is small and does exactly one thing:
//
//   IT RUNS THE COMMAND. It does not read a summary, it does not trust a previous line, and it
//   does not accept a gate's own word for its state.
//
// Two modes:
//
//   node scripts/gate-check.mjs             verify — runs every gate, prints a table, exits 1 if
//                                           any gate is unmet. Writes nothing. This is the mode
//                                           CI would run.
//   node scripts/gate-check.mjs --approve   the same run, then rewrites each gate's checkbox and
//                                           EVIDENCE line from what was actually measured.
//
// Flags: --gate G16 (one gate, repeatable), --timeout <ms>, --file <path> (another ledger, which
// is how this checker is itself tested — a verifier with no test is the same unbacked claim it
// exists to stop).
//
// WHAT THE EVIDENCE MEANS. Each field is something an agent cannot assert without running:
//
//   exit              the process's real exit status
//   EXPECT            matched / MISSED — whether EXPECT: appears in the combined output
//   output-sha256     fingerprint of that output; changes if the test set changes at all
//   output-bytes      length, so a truncated or empty run is visible
//   git               HEAD at the moment of measurement
//   tree              clean or dirty — evidence measured against uncommitted code is weaker, and
//                     saying so is the difference between a record and a decoration
//   shell / cwd / path  the environment, since a gate that passes only on one machine's PATH is
//                     not a gate
import { execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = '/bin/sh';

const args = process.argv.slice(2);
const APPROVE = args.includes('--approve');
const ONLY = args.reduce((acc, a, i) => (a === '--gate' && args[i + 1] ? [...acc, args[i + 1]] : acc), []);
const TIMEOUT = Number(args[args.indexOf('--timeout') + 1]) || 15 * 60_000;
const FILE = args.includes('--file') ? args[args.indexOf('--file') + 1] : join(ROOT, 'GATES.md');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/* ------------------------------------------------------------------ parse --- */

/**
 * A gate is a checkbox line, then CHECK:, then EXPECT:, then optionally EVIDENCE:.
 *
 * Parsed by line rather than by one big regex so that a malformed gate is reported as malformed
 * instead of silently not existing — a gate this parser cannot see is a gate that can never fail.
 */
function parseGates(text) {
  const lines = text.split('\n');
  const gates = [];
  let current = null;

  for (const [i, line] of lines.entries()) {
    const head = /^- \[([ xX~])\] (G\d+): (.*)$/.exec(line);
    if (head) {
      if (current) gates.push(current);
      current = { id: head[2], mark: head[1], title: head[3], headLine: i, check: null, expect: null, evidenceLine: null };
      continue;
    }
    if (!current) continue;
    const check = /^\s{4}CHECK:\s*(.+)$/.exec(line);
    if (check && current.check === null) { current.check = check[1].trim(); continue; }
    const expect = /^\s{4}EXPECT:\s*(.+)$/.exec(line);
    if (expect && current.expect === null) { current.expect = expect[1].trim(); continue; }
    const evidence = /^\s{2}EVIDENCE:/.exec(line);
    if (evidence && current.evidenceLine === null) { current.evidenceLine = i; continue; }
    // A blank line after a complete gate ends it; anything else is prose between gates.
    if (line.trim() === '' && current.check) { gates.push(current); current = null; }
  }
  if (current) gates.push(current);

  const broken = gates.filter((g) => !g.check || !g.expect);
  if (broken.length) {
    console.error(`gate-check: these gates are missing a CHECK: or EXPECT: — ${broken.map((g) => g.id).join(', ')}`);
    process.exit(2);
  }
  return gates;
}

/* -------------------------------------------------------------- environment --- */

const git = (cmd, fallback) => {
  try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return fallback; }
};

const HEAD = git('rev-parse --short HEAD', 'unknown');
const DIRTY = git('status --porcelain', '') !== '';
// A fingerprint of PATH rather than PATH itself: the value is long, machine-specific, and can
// contain a username. What matters is whether it CHANGED between runs.
const PATH_PARTS = (process.env.PATH ?? '').split(':').filter(Boolean);
const PATH_FP = `${sha256(PATH_PARTS.join(':')).slice(0, 12)}/${PATH_PARTS.length} entries`;

/* ---------------------------------------------------------------- execute --- */

function runGate(gate) {
  const started = Date.now();
  const proc = spawnSync(SHELL, ['-c', gate.check], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
    // A gate must not be able to ask a human for help and hang the run.
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  const exit = proc.status === null ? 124 : proc.status;
  // EXPECT is a substring, matched against stdout AND stderr: node --test writes its summary to
  // stdout, tsc writes errors to stderr, and a gate that only looked at one would miss half of
  // what it is gating.
  const matched = output.includes(gate.expect);

  return {
    ...gate,
    exit,
    matched,
    met: exit === 0 && matched,
    output,
    ms: Date.now() - started,
    timedOut: proc.status === null,
  };
}

/* --------------------------------------------------------------- evidence --- */

const evidenceLine = (r) =>
  `  EVIDENCE: exit=${r.exit}; shell=${SHELL}; cwd=${ROOT}; path=${PATH_FP}; ` +
  `git=${HEAD}; tree=${DIRTY ? 'dirty' : 'clean'}; ` +
  `EXPECT=${r.matched ? 'matched' : 'MISSED'}; ` +
  `output-sha256=${sha256(r.output)}; output-bytes=${Buffer.byteLength(r.output)}`;

/* ------------------------------------------------------------------- main --- */

const text = readFileSync(FILE, 'utf8');
const all = parseGates(text);
const gates = ONLY.length ? all.filter((g) => ONLY.includes(g.id)) : all;

if (!gates.length) {
  console.error(`gate-check: no gates matched ${ONLY.join(', ') || '(all)'}`);
  process.exit(2);
}

const results = [];
for (const gate of gates) {
  process.stderr.write(`· ${gate.id} …`);
  const r = runGate(gate);
  results.push(r);
  process.stderr.write(`\r${r.met ? '✓' : '✗'} ${r.id}  ${r.title.slice(0, 68)}\n`);
  if (!r.met) {
    const why = r.timedOut ? `timed out after ${TIMEOUT}ms` : r.exit !== 0 ? `exit=${r.exit}` : `EXPECT "${r.expect}" not in output`;
    process.stderr.write(`    ${why}\n`);
    for (const line of r.output.trim().split('\n').slice(-6)) process.stderr.write(`    | ${line}\n`);
  }
}

if (APPROVE) {
  // Rewrite bottom-up so an insertion never shifts a line number still to be used.
  const lines = text.split('\n');
  for (const r of [...results].sort((a, b) => b.headLine - a.headLine)) {
    lines[r.headLine] = `- [${r.met ? 'x' : ' '}] ${r.id}: ${r.title}`;
    const line = evidenceLine(r);
    if (r.evidenceLine !== null) lines[r.evidenceLine] = line;
    else if (r.met) lines.splice(r.headLine + 3, 0, line);
    // An unmet gate with no prior evidence gets no evidence line: there is nothing to record.
  }
  writeFileSync(FILE, lines.join('\n'));
  console.error(`\ngate-check: GATES.md updated from measurement (git=${HEAD}, tree=${DIRTY ? 'dirty' : 'clean'})`);
}

const met = results.filter((r) => r.met).length;
const unmet = results.length - met;
console.log(`GATES ${unmet === 0 ? 'GREEN' : 'RED'} — ${results.length} run, ${met} met, ${unmet} unmet`);
if (DIRTY) console.log('note: measured against a dirty working tree');
process.exit(unmet === 0 ? 0 : 1);
