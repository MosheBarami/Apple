#!/usr/bin/env node
// The gate checker.
//
// GATES.md says a gate counts as met only when its CHECK: exits zero and its EXPECT: matches, and
// that the values were "recorded by the checker rather than claimed". This is that checker.
//
//   IT RUNS THE COMMAND. It does not read a summary, it does not trust a previous line, and it
//   does not accept a gate's own word for its state.
//
// WHY THE FLAG PARSING IS STRICT. This file used to read its flags with `args.includes()`, so an
// unrecognised flag was silently ignored: `gate-check.mjs --reverify GATES.md` ran an ordinary
// verify and printed a green summary, and a caller who believed they had re-verified fingerprints
// had done nothing of the kind. A verifier that quietly does something other than what it was
// asked is worse than no verifier, because it manufactures confidence. Unknown flag now exits 2.
//
// MODES
//   (none)        verify — run every gate, print a table, exit 1 if any is unmet. Writes nothing.
//   --approve     the same run, then rewrite each gate's checkbox and EVIDENCE line from what was
//                 actually measured.
//   --reverify    run every gate INCLUDING already-met ones, recompute the fingerprint, and mark
//                 the gate UNMET IN THE FILE when the stored output-sha256 does not reproduce,
//                 when it carries no FALSIFIED record, when it was recorded against a dirty tree,
//                 or when its CHECK names a path absent from `git ls-files`. A gate that passed in
//                 an earlier pass is not evidence now.
//   --falsify     record a FALSIFIED line: run the gate and require it to be RED. This is how the
//                 red-first discipline is enforced — a gate nobody has watched fail is a gate that
//                 may be incapable of failing.
//   --status      parse only, execute nothing. Shape and staleness at a glance.
//   --lint        parse only, execute nothing. Ledger shape: duplicate ids, missing evidence,
//                 ticked gates whose own evidence records a failure.
//
// FLAGS: --gate <id> (repeatable), --timeout <ms>, --file <path>, --break-sha <sha> (with
// --falsify). Anything else is an error, not a hint.
//
// WHAT AN EVIDENCE FIELD MEANS. Each is something that cannot be asserted without running:
//   exit / EXPECT / output-sha256 / output-bytes   what the command actually did
//   git-sha / tree-clean                            which commit was measured, and whether it was
//                                                   even committed
//   node / luau / playwright                        the toolchains present. A gate over Luau
//                                                   recorded with luau=ABSENT proved nothing: the
//                                                   runner skipped and exited 0.
//   at                                              when, so a stale record is visible as stale
import { execFileSync, execSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = '/bin/sh';

/* ------------------------------------------------------------------ flags --- */

const KNOWN_BOOL = new Set(['--approve', '--lint', '--status', '--reverify', '--falsify']);
const KNOWN_VALUE = new Set(['--gate', '--timeout', '--file', '--break-sha']);

function parseArgs(argv) {
  const flags = { gate: [], timeout: 15 * 60_000, file: join(ROOT, 'GATES.md'), breakSha: null };
  const bools = new Set();
  const positional = [];

  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (KNOWN_BOOL.has(a)) { bools.add(a); continue; }
    if (KNOWN_VALUE.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) {
        console.error(`gate-check: ${a} needs a value`);
        process.exit(2);
      }
      i += 1;
      if (a === '--gate') flags.gate.push(v);
      else if (a === '--timeout') flags.timeout = Number(v) || flags.timeout;
      else if (a === '--file') flags.file = v;
      else if (a === '--break-sha') flags.breakSha = v;
      continue;
    }
    if (a.startsWith('-')) {
      // The whole point of this branch. A flag this program does not understand means the caller
      // believes it is doing something it is not.
      console.error(`gate-check: unrecognised flag ${a}`);
      console.error(`gate-check: known flags — ${[...KNOWN_BOOL, ...KNOWN_VALUE].sort().join(' ')}`);
      process.exit(2);
    }
    positional.push(a);
  }

  // A bare path argument is the ledger, so `gate-check.mjs --reverify GATES.md` works as written
  // in the verification block rather than being a silent no-op.
  if (positional.length > 1) {
    console.error(`gate-check: expected at most one ledger path, got ${positional.length}`);
    process.exit(2);
  }
  if (positional.length === 1) flags.file = positional[0];

  return { ...flags, bools };
}

const ARGS = parseArgs(process.argv.slice(2));
const APPROVE = ARGS.bools.has('--approve');
const LINT = ARGS.bools.has('--lint');
const STATUS = ARGS.bools.has('--status');
const REVERIFY = ARGS.bools.has('--reverify');
const FALSIFY = ARGS.bools.has('--falsify');
const ONLY = ARGS.gate;
const TIMEOUT = ARGS.timeout;
const FILE = ARGS.file.startsWith('/') ? ARGS.file : join(ROOT, ARGS.file);

if (FALSIFY && ONLY.length !== 1) {
  console.error('gate-check: --falsify records one gate at a time; pass exactly one --gate <id>');
  process.exit(2);
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/* ------------------------------------------------------------------ parse --- */

/**
 * A gate is a checkbox line, then CHECK:, then EXPECT:, then optionally FALSIFIED: and EVIDENCE:.
 *
 * Parsed by line rather than by one big regex so a malformed gate is reported as malformed instead
 * of silently not existing — a gate this parser cannot see is a gate that can never fail.
 *
 * The id pattern is `G` plus word characters and hyphens, not `G\d+`: the oracle gates are named
 * G-ORACLE-1 and G-TOOLCHAIN-1, and a parser that could not see them would have left the checks on
 * the checker itself outside the ledger.
 */
function parseGates(text) {
  const lines = text.split('\n');
  const gates = [];
  let current = null;

  for (const [i, line] of lines.entries()) {
    // `- [ ] G12 [S4]: title` — the station tag is optional and is captured so §16.1 can require
    // at least one gate per station without a second file listing them.
    const head = /^- \[([ xX~])\] (G[\w-]+)(?:\s+\[(S\d+)\])?: (.*)$/.exec(line);
    if (head) {
      if (current) gates.push(current);
      current = {
        id: head[2], mark: head[1], station: head[3] ?? null, title: head[4],
        headLine: i, check: null, expect: null, evidenceLine: null, falsifiedLine: null,
      };
      continue;
    }
    if (!current) continue;
    const check = /^\s{4}CHECK:\s*(.+)$/.exec(line);
    if (check && current.check === null) { current.check = check[1].trim(); continue; }
    const expect = /^\s{4}EXPECT:\s*(.+)$/.exec(line);
    if (expect && current.expect === null) { current.expect = expect[1].trim(); continue; }
    if (/^\s{2}FALSIFIED:/.test(line) && current.falsifiedLine === null) { current.falsifiedLine = i; continue; }
    if (/^\s{2}EVIDENCE:/.test(line) && current.evidenceLine === null) { current.evidenceLine = i; continue; }
    if (line.trim() === '' && current.check) { gates.push(current); current = null; }
  }
  if (current) gates.push(current);

  const broken = gates.filter((g) => !g.check || !g.expect);
  if (broken.length) {
    console.error(`gate-check: these gates are missing a CHECK: or EXPECT: — ${broken.map((g) => g.id).join(', ')}`);
    process.exit(2);
  }

  // Two gates with one id is not a tidiness problem. `--gate G19` then runs both, the ledger's
  // total counts one id twice, and a checkbox written back by --approve lands on whichever the
  // parser saw — so a gate can be ticked by its namesake passing. This has happened here twice.
  const byId = new Map();
  for (const g of gates) byId.set(g.id, (byId.get(g.id) ?? 0) + 1);
  const dupes = [...byId].filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
  if (dupes.length) {
    console.error(`gate-check: duplicate gate ids — ${dupes.join(', ')}. Renumber before this ledger means anything.`);
    process.exit(2);
  }

  // Distinct ids running the IDENTICAL command are one gate counted twice: the total reads higher
  // for no extra coverage, which is the ledger padding itself.
  const byCheck = new Map();
  for (const g of gates) byCheck.set(g.check, [...(byCheck.get(g.check) ?? []), g.id]);
  const sameCheck = [...byCheck].filter(([, ids]) => ids.length > 1).map(([c, ids]) => `${ids.join(' and ')} both run: ${c}`);
  if (sameCheck.length) {
    console.error(`gate-check: gates duplicating a CHECK — ${sameCheck.join(' | ')}. Merge them, or give each its own command.`);
    process.exit(2);
  }
  return gates;
}

/**
 * The typed summary, if the ledger carries one.
 *
 * A prose tally is a number a human wrote, and it drifts from the checkboxes silently — a reader
 * trusts the sentence over counting thirty boxes. So it is PARSED and COMPARED, never used: the
 * authority is always the checkbox count.
 */
function parseTypedSummary(text) {
  const m = /\*\*(\d+)\s+gates?,\s*(\d+)\s+met,\s*(\d+)\s+unmet(?:,\s*(\d+)\s+abandoned)?\*\*/.exec(text);
  if (!m) return null;
  return { total: Number(m[1]), met: Number(m[2]), unmet: Number(m[3]), abandoned: Number(m[4] ?? 0), text: m[0] };
}

/* -------------------------------------------------------------- environment --- */

const git = (cmd, fallback) => {
  try { return execSync(`git ${cmd}`, { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return fallback; }
};

const HEAD = git('rev-parse --short HEAD', 'unknown');
const DIRTY = git('status --porcelain', '') !== '';
const PATH_PARTS = (process.env.PATH ?? '').split(':').filter(Boolean);
const PATH_FP = `${sha256(PATH_PARTS.join(':')).slice(0, 12)}/${PATH_PARTS.length} entries`;

/** Version of a toolchain, or ABSENT. Recorded because a missing runner is why a suite "passes". */
function toolVersion(bin, args) {
  try {
    return execFileSync(bin, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 20_000 })
      .trim().split('\n')[0].replace(/\s+/g, ' ').slice(0, 40) || 'present';
  } catch {
    return 'ABSENT';
  }
}

const TOOLS = {
  node: process.version,
  luau: toolVersion('luau', ['--version']),
  playwright: toolVersion('npx', ['playwright', '--version']),
};

/** Every path tracked by git, for the §5.3 refusal to record a gate over an untracked file. */
const TRACKED = new Set(git('ls-files', '').split('\n').filter(Boolean));

/** Repo-relative file paths a CHECK names, so a gate written for a file nobody wrote is visible. */
function checkPaths(check) {
  const files = [...check.matchAll(/(?:^|\s)((?:[\w.@-]+\/)+[\w.@-]+\.(?:mjs|js|ts|tsx|py|luau|astro))/g)].map((m) => m[1]);
  const cd = /cd\s+([\w./-]+)\s*&&/.exec(check);
  const prefix = cd ? `${cd[1].replace(/^\.\//, '')}/` : '';
  return files.map((f) => `${prefix}${f}`);
}

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
  // EXPECT is matched against stdout AND stderr: node --test writes its summary to stdout, tsc
  // writes errors to stderr, and a gate looking at one would miss half of what it gates.
  const matched = output.includes(gate.expect);

  return { ...gate, exit, matched, met: exit === 0 && matched, output, ms: Date.now() - started, timedOut: proc.status === null };
}

/* --------------------------------------------------------------- evidence --- */

const stamp = () => new Date().toISOString();

const recordLine = (kind, r, extra = '') =>
  `  ${kind}: exit=${r.exit}; shell=${SHELL}; cwd=${ROOT}; path=${PATH_FP}; ` +
  `git-sha=${HEAD}; tree-clean=${DIRTY ? 'no' : 'yes'}; ${extra}` +
  `EXPECT=${r.matched ? 'matched' : 'unmatched'}; ` +
  `output-sha256=${sha256(r.output)}; output-bytes=${Buffer.byteLength(r.output)}; ` +
  `node=${TOOLS.node}; luau=${TOOLS.luau}; playwright=${TOOLS.playwright}; at=${stamp()}`;

const evidenceLine = (r) => recordLine('EVIDENCE', r);
const falsifiedLine = (r, breakSha) => recordLine('FALSIFIED', r, `break-sha=${breakSha}; `);

/** The stored fingerprint on a record line, or null. */
const storedSha = (line) => /output-sha256=([0-9a-f]{64})/.exec(line ?? '')?.[1] ?? null;

/**
 * Where a newly written record belongs.
 *
 * §5.1's shape is CHECK, EXPECT, FALSIFIED, EVIDENCE — the red before the green, because that is
 * the order in which they have to have happened. Inserting blindly at headLine+3 put a fresh
 * EVIDENCE line ABOVE an existing FALSIFIED one and inverted the story the block tells.
 */
const insertAt = (gate) => (gate.falsifiedLine !== null ? gate.falsifiedLine + 1 : gate.headLine + 3);

/* ------------------------------------------------------------------- main --- */

const text = readFileSync(FILE, 'utf8');
const all = parseGates(text);
const gates = ONLY.length ? all.filter((g) => ONLY.includes(g.id)) : all;

if (!gates.length) {
  console.error(`gate-check: no gates matched ${ONLY.join(', ') || '(all)'}`);
  process.exit(2);
}

if (STATUS) {
  let needWork = 0;
  for (const g of gates) {
    const mark = g.mark === 'x' ? 'MET' : g.mark === '~' ? 'ABANDONED' : 'OPEN';
    const ev = g.evidenceLine === null ? 'no-evidence'
      : text.split('\n')[g.evidenceLine].includes('git-sha=') ? 'measured' : 'hand-written';
    const missing = checkPaths(g.check).filter((f) => !existsSync(join(ROOT, f)));
    const work = mark !== 'MET' || ev !== 'measured' || missing.length > 0 || g.falsifiedLine === null;
    if (work) needWork += 1;
    console.log(
      `${work ? '!' : ' '} ${g.id.padEnd(16)} ${mark.padEnd(9)} ${ev.padEnd(12)} ` +
      `${g.falsifiedLine === null ? 'no-falsified' : 'red-first  '} ${g.title.slice(0, 50)}` +
      (missing.length ? `\n       CHECK names a file that does not exist: ${missing.join(', ')}` : ''),
    );
  }
  console.log(`\n${gates.length} gate(s), ${needWork} need(s) work`);
  process.exit(needWork ? 1 : 0);
}

if (LINT) {
  const problems = [];
  for (const g of gates) {
    if (g.mark === ' ') continue;
    if (g.mark === '~') { problems.push(`${g.id}: abandoned in a file that has no vocabulary for it`); continue; }
    // A gate with EVIDENCE and no FALSIFIED is VOID: nobody has ever seen it fail, so nothing
    // establishes that it can.
    if (g.falsifiedLine === null) problems.push(`${g.id}: ticked with no FALSIFIED record — nobody has watched it fail`);
    if (g.evidenceLine === null) problems.push(`${g.id}: ticked with no EVIDENCE line`);
    else {
      const line = text.split('\n')[g.evidenceLine];
      // These are the fields that cannot be written from memory: they say WHICH commit was
      // measured and whether the code was even committed. Requiring them is what makes a
      // hand-written evidence line fail instead of pass.
      for (const field of ['exit=', 'EXPECT=', 'output-sha256=', 'output-bytes=', 'git-sha=', 'tree-clean=', 'at=']) {
        if (!line.includes(field)) problems.push(`${g.id}: evidence is missing ${field} — write it with --approve rather than by hand`);
      }
      if (line.includes('EXPECT=unmatched') || line.includes('EXPECT=MISSED')) problems.push(`${g.id}: ticked, but its own evidence records an unmatched EXPECT`);
      if (/exit=(?!0;)/.test(line)) problems.push(`${g.id}: ticked, but its own evidence records a non-zero exit`);
      if (line.includes('tree-clean=no')) problems.push(`${g.id}: evidence was recorded against a dirty tree`);
      // A gate whose CHECK names a Luau path, recorded with no Luau toolchain, proved nothing:
      // the runner skipped and exited 0, which node --test reports as `fail 0`.
      if (/\.luau|apps\/plugin/.test(g.check) && line.includes('luau=ABSENT')) {
        problems.push(`${g.id}: gates Luau but was recorded with luau=ABSENT`);
      }
      if (/playwright/.test(g.check) && line.includes('playwright=ABSENT')) {
        problems.push(`${g.id}: gates a browser journey but was recorded with playwright=ABSENT`);
      }
    }
    if (g.falsifiedLine !== null) {
      const fl = text.split('\n')[g.falsifiedLine];
      if (!/break-sha=\S+/.test(fl)) problems.push(`${g.id}: FALSIFIED carries no break-sha`);
      // Sharing one sha means the "break" changed nothing; the gate was never red.
      const ev = g.evidenceLine === null ? '' : text.split('\n')[g.evidenceLine];
      const bs = /break-sha=([0-9a-f]+)/.exec(fl)?.[1];
      const gs = /git-sha=([0-9a-f]+)/.exec(ev)?.[1];
      if (bs && gs && bs.startsWith(gs)) problems.push(`${g.id}: FALSIFIED and EVIDENCE share one sha — the break changed nothing`);
    }
  }

  // The typed tally against the real one. A sentence saying "30 met" over 28 ticked boxes is the
  // number a reader believes.
  const typed = parseTypedSummary(text);
  const ticked = all.filter((g) => g.mark === 'x' || g.mark === 'X').length;
  if (typed) {
    if (typed.total !== all.length) problems.push(`typed summary says ${typed.total} gates; the file has ${all.length}`);
    if (typed.met !== ticked) problems.push(`typed summary says ${typed.met} met; ${ticked} boxes are ticked`);
  }

  for (const line of problems) console.error(`gate-check: ${line}`);
  console.log(`LEDGER ${problems.length ? 'MALFORMED' : 'WELL-FORMED'} — ${gates.length} gates, ${problems.length} problem(s)`);
  process.exit(problems.length ? 1 : 0);
}

/* ------------------------------------------------------------- falsify --- */

if (FALSIFY) {
  const g = gates[0];
  const r = runGate(g);
  if (r.met) {
    // The whole point: a gate that passes with the shipping call site removed is not measuring the
    // shipping call site.
    console.error(`gate-check: ${g.id} is GREEN — it cannot be falsified in this tree.`);
    console.error('gate-check: remove the shipping call site, the export, or the route wiring, commit that, and re-run.');
    process.exit(1);
  }
  const breakSha = ARGS.breakSha ?? HEAD;
  const lines = readFileSync(FILE, 'utf8').split('\n');
  const fresh = parseGates(lines.join('\n')).find((x) => x.id === g.id);
  if (!fresh) { console.error(`gate-check: ${g.id} vanished mid-run`); process.exit(2); }
  const line = falsifiedLine(r, breakSha);
  if (fresh.falsifiedLine !== null) lines[fresh.falsifiedLine] = line;
  else lines.splice(fresh.headLine + 3, 0, line);
  writeFileSync(FILE, lines.join('\n'));
  console.log(`FALSIFIED ${g.id} — exit=${r.exit}, EXPECT=${r.matched ? 'matched' : 'unmatched'}, break-sha=${breakSha}`);
  process.exit(0);
}

/* ------------------------------------------------------------- reverify --- */

if (REVERIFY) {
  // Re-execute EVERYTHING, including gates already ticked. A gate that passed in an earlier pass
  // is not evidence now: the tree has moved under it.
  const results = [];
  for (const gate of gates) {
    process.stderr.write(`· ${gate.id} …`);
    const r = runGate(gate);
    results.push(r);
    process.stderr.write(`\r${r.met ? '✓' : '✗'} ${r.id}  ${r.title.slice(0, 64)}\n`);
  }

  const lines = readFileSync(FILE, 'utf8').split('\n');
  const current = new Map(parseGates(lines.join('\n')).map((g) => [g.id, g]));
  const quarantined = [];

  for (const r of results.sort((a, b) => b.headLine - a.headLine)) {
    const now = current.get(r.id);
    if (!now || now.check !== r.check || now.expect !== r.expect) continue;

    const reasons = [];
    if (!r.met) reasons.push(r.exit !== 0 ? `exit=${r.exit}` : 'EXPECT unmatched');
    if (now.falsifiedLine === null) reasons.push('no FALSIFIED record');

    const evLine = now.evidenceLine === null ? null : lines[now.evidenceLine];
    const before = storedSha(evLine);
    if (evLine && before && before !== sha256(r.output)) reasons.push('output-sha256 does not reproduce');
    if (evLine && evLine.includes('tree-clean=no')) reasons.push('recorded against a dirty tree');

    const untracked = checkPaths(now.check).filter((f) => !TRACKED.has(f));
    if (untracked.length) reasons.push(`CHECK names untracked path(s): ${untracked.join(', ')}`);

    if (reasons.length) {
      quarantined.push({ id: r.id, reasons });
      // Marked UNMET IN THE FILE, not merely reported: a report is something the next reader has
      // to find, and the checkbox is what they will actually trust.
      lines[now.headLine] = `- [ ] ${r.id}${now.station ? ` [${now.station}]` : ''}: ${r.title}`;
    } else {
      lines[now.headLine] = `- [x] ${r.id}${now.station ? ` [${now.station}]` : ''}: ${r.title}`;
      if (now.evidenceLine !== null) lines[now.evidenceLine] = evidenceLine(r);
      else lines.splice(insertAt(now), 0, evidenceLine(r));
    }
  }

  writeFileSync(FILE, lines.join('\n'));

  // The tally is COMPUTED from the checkboxes after the rewrite, never from any typed sentence.
  const after = parseGates(readFileSync(FILE, 'utf8'));
  const met = after.filter((g) => g.mark === 'x' || g.mark === 'X').length;
  const unmet = after.length - met;

  for (const q of quarantined) console.error(`gate-check: QUARANTINED ${q.id} — ${q.reasons.join('; ')}`);
  console.log(`REVERIFY ${unmet === 0 ? 'GREEN' : 'RED'} — ${after.length} gates, ${met} met, ${unmet} unmet, ${quarantined.length} quarantined`);
  process.exit(unmet === 0 ? 0 : 1);
}

/* -------------------------------------------------------------- verify --- */

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
  // A full run takes minutes and the ledger is a shared file, so the copy read at startup is stale
  // by the time this writes. Re-read, re-parse, and apply a result only to a gate that is still
  // there with the same CHECK: and EXPECT:. A gate whose command changed under us was not the gate
  // that was measured, and stale evidence on it would be a false record rather than a missing one.
  const fresh = readFileSync(FILE, 'utf8');
  const lines = fresh.split('\n');
  const current = new Map(parseGates(fresh).map((g) => [g.id, g]));

  const applied = [];
  const skipped = [];
  for (const r of results) {
    const now = current.get(r.id);
    if (!now || now.check !== r.check || now.expect !== r.expect) { skipped.push(r.id); continue; }
    applied.push({ ...r, headLine: now.headLine, evidenceLine: now.evidenceLine, station: now.station });
  }

  // Bottom-up, so an insertion never shifts a line number still to be used.
  for (const r of applied.sort((a, b) => b.headLine - a.headLine)) {
    lines[r.headLine] = `- [${r.met ? 'x' : ' '}] ${r.id}${r.station ? ` [${r.station}]` : ''}: ${r.title}`;
    const line = evidenceLine(r);
    if (r.evidenceLine !== null) lines[r.evidenceLine] = line;
    else if (r.met) lines.splice(insertAt(r), 0, line);
    // An unmet gate with no prior evidence gets no evidence line: there is nothing to record.
  }
  writeFileSync(FILE, lines.join('\n'));
  console.error(`\ngate-check: ${applied.length} gate(s) written from measurement (git-sha=${HEAD}, tree-clean=${DIRTY ? 'no' : 'yes'})`);
  if (skipped.length) console.error(`gate-check: changed or removed mid-run, NOT recorded — ${skipped.join(', ')}`);
}

const met = results.filter((r) => r.met).length;
const unmet = results.length - met;
console.log(`GATES ${unmet === 0 ? 'GREEN' : 'RED'} — ${results.length} run, ${met} met, ${unmet} unmet`);
if (DIRTY) console.log('note: measured against a dirty working tree');
process.exit(unmet === 0 ? 0 : 1);
