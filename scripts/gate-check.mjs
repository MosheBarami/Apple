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
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SHELL = '/bin/sh';

/**
 * Refuse to verify a tree the caller is not standing in.
 *
 * ROOT is derived from THIS FILE's location, so `node /abs/path/to/main/scripts/gate-check.mjs`
 * run from inside a worktree executes every CHECK against main while the caller believes it is
 * testing the worktree. In the falsification direction that fails safe — the break is not present,
 * the gate is green, and the record is refused. In the `--reverify` direction it does not: it
 * would stamp EVIDENCE describing main's state onto a run the caller performed elsewhere, and the
 * git sha in that record would be main's too, so nothing in the record would reveal the mix-up.
 *
 * This cost a real G5 record before it existed. The fix is to compare git toplevels and say so.
 */
function assertSameTree() {
  const top = (cwd) => {
    try {
      return execSync('git rev-parse --show-toplevel', { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch {
      return null;
    }
  };
  const rootTop = top(ROOT);
  const hereTop = top(process.cwd());
  if (!rootTop || rootTop === hereTop) return;
  // A cwd that is not a git repository AT ALL used to return here silently, and that is the exact
  // case that did the damage: a scratch directory holding a one-gate fixture, from which this
  // checker read and rewrote the real 37-gate ledger. "I cannot tell which tree you mean" is a
  // reason to stop, not a reason to proceed.
  if (!hereTop) {
    console.error(`gate-check: ${process.cwd()} is not a git repository, but this checker verifies ${rootTop}.`);
    console.error(`gate-check: run it from inside the tree you mean to verify.`);
    process.exit(2);
  }
  console.error(`gate-check: this checker verifies ${rootTop}, but you are standing in ${hereTop}.`);
  console.error('gate-check: every CHECK would run against the OTHER tree. Invoke that tree\'s own copy:');
  console.error(`gate-check:   cd ${hereTop} && node scripts/gate-check.mjs ...`);
  process.exit(2);
}

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
      // RESOLVED AGAINST THE CALLER'S CWD, not against ROOT. The default is `join(ROOT, 'GATES.md')`,
      // and a bare relative `--file GATES.md` used to inherit that base — so running this checker
      // from a scratch directory with a one-gate fixture silently read and REWROTE the real
      // 37-gate ledger instead. That happened, and it degraded six clean-tree evidence records.
      else if (a === '--file') flags.file = resolve(process.cwd(), v);
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
  if (positional.length === 1) flags.file = resolve(process.cwd(), positional[0]);

  return { ...flags, bools };
}

assertSameTree();
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

/**
 * What the fingerprint is taken over.
 *
 * THE DEFECT THIS FIXES. `output-sha256` was computed over the raw stream, and `node --test` prints
 * a duration on every line. Two identical runs of an unchanged test file therefore produced
 * different fingerprints, which meant `--reverify` quarantined EVERY test gate in the ledger the
 * first time it ran — not because anything was wrong, but because the check as written could never
 * pass. An oracle that always fires is as useless as one that never does, and the tempting repair
 * is to stop comparing fingerprints at all.
 *
 * So the NOISE is removed and everything else is kept. What goes: elapsed times, temp directories
 * with a random segment in them, absolute paths to this checkout, and timestamps. What stays: every
 * test name, every count, every assertion message, every diff — so a changed test set still changes
 * the sha, which is the entire property being relied on. The raw byte count is recorded separately
 * and un-normalised, so a truncated or empty run is still visible.
 */
function normaliseOutput(raw) {
  return raw
    // `✔ a test name (38.670292ms)` and `ℹ duration_ms 17046.609625`
    .replace(/\(\d+(?:\.\d+)?ms\)/g, '(TIMEms)')
    .replace(/duration_ms [\d.]+/g, 'duration_ms TIME')
    // mkdtemp directories: the random segment differs on every run
    .replace(/\/(?:var\/folders|tmp)\/[^\s'"`)]+/g, '/TMPDIR')
    // this checkout's absolute path, so a fingerprint is not machine-specific
    .split(ROOT).join('/ROOT')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, 'TIMESTAMP')
    // trailing whitespace a runner may or may not emit
    .replace(/[ \t]+$/gm, '');
}

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

/**
 * The environment a gate runs in.
 *
 * `NODE_TEST_CONTEXT` is stripped because a gate whose CHECK is `node --test` must behave the same
 * whether or not this checker was itself invoked from a test. Inherited, it makes the child report
 * as a SUBTEST of the parent runner: no summary line, no `pass N`, so the gate reads as unmet for a
 * reason that has nothing to do with the code it gates. A verifier whose answer depends on who
 * called it is not a verifier.
 */
const GATE_ENV = (() => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
})();

/**
 * Which repository files a gate actually touched, discovered by running it.
 *
 * §10.1: "a deployed-origin station probe is valid for the HEAD sha it was recorded against, and is
 * re-probed when HEAD changes the code path it exercises, proven by a path diff." The same logic
 * applies to every gate — evidence recorded against one commit is not evidence about different
 * code — and the hard part is knowing WHICH code a gate exercises without asking the author to
 * declare it, because a declaration drifts exactly like a prose tally does.
 *
 * V8's coverage output answers it for free: every module the run loaded, from the runtime rather
 * than from a manifest. A file the gate never loaded cannot affect it, and a file it did load can.
 *
 * THIS IS NOT THEORETICAL. Two commits in this repository silently reverted code while its gates
 * still read green, because nobody re-ran them between the sweep and the discovery. A recorded
 * dependency fingerprint makes that visible from `--status`, in a second, without re-running
 * anything.
 */
function dependencySet(covDir) {
  const seen = new Set();
  let files = [];
  try { files = readdirSync(covDir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const prefix = `file://${ROOT}/`;
  for (const f of files) {
    let parsed;
    try { parsed = JSON.parse(readFileSync(join(covDir, f), 'utf8')); } catch { continue; }
    for (const r of parsed.result ?? []) {
      if (!r.url?.startsWith(prefix)) continue;
      const rel = r.url.slice(prefix.length);
      // node_modules is not ours and changes only with a lockfile bump, which is its own signal.
      if (rel.includes('node_modules/')) continue;
      seen.add(rel);
    }
  }
  return [...seen].sort();
}

/** A fingerprint of those files' CONTENTS, so a rename or an edit both move it. */
function dependencyFingerprint(deps) {
  const h = createHash('sha256');
  for (const rel of deps) {
    h.update(rel);
    h.update('\0');
    try { h.update(readFileSync(join(ROOT, rel))); } catch { h.update('MISSING'); }
    h.update('\0');
  }
  return h.digest('hex').slice(0, 24);
}

const DEPS_DIR = join(ROOT, 'docs', 'evidence', 'gate-deps');

function runGate(gate) {
  const started = Date.now();
  // A fresh coverage directory per gate, so one gate's dependency set cannot inherit another's.
  const covDir = mkdtempSync(join(tmpdir(), 'gate-cov-'));
  const proc = spawnSync(SHELL, ['-c', gate.check], {
    cwd: ROOT,
    encoding: 'utf8',
    timeout: TIMEOUT,
    maxBuffer: 64 * 1024 * 1024,
    env: { ...GATE_ENV, NODE_V8_COVERAGE: covDir },
    // A gate must not be able to ask a human for help and hang the run.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const deps = dependencySet(covDir);
  rmSync(covDir, { recursive: true, force: true });

  const output = `${proc.stdout ?? ''}${proc.stderr ?? ''}`;
  const exit = proc.status === null ? 124 : proc.status;
  // EXPECT is matched against stdout AND stderr: node --test writes its summary to stdout, tsc
  // writes errors to stderr, and a gate looking at one would miss half of what it gates.
  const matched = output.includes(gate.expect);

  return {
    ...gate, exit, matched, met: exit === 0 && matched, output,
    ms: Date.now() - started, timedOut: proc.status === null,
    deps, depsSha: dependencyFingerprint(deps),
  };
}

/* --------------------------------------------------------------- evidence --- */

const stamp = () => new Date().toISOString();

/** The dependency LIST lives beside the ledger; only its fingerprint goes on the record line. */
function writeDeps(id, deps) {
  if (!deps?.length) return;
  try {
    mkdirSync(DEPS_DIR, { recursive: true });
    writeFileSync(join(DEPS_DIR, `${id}.json`), `${JSON.stringify(deps, null, 2)}\n`);
  } catch { /* the fingerprint still records; the list is a convenience for reading */ }
}

const recordLine = (kind, r, extra = '') =>
  `  ${kind}: exit=${r.exit}; shell=${SHELL}; cwd=${ROOT}; path=${PATH_FP}; ` +
  `git-sha=${HEAD}; tree-clean=${DIRTY ? 'no' : 'yes'}; ${extra}` +
  `EXPECT=${r.matched ? 'matched' : 'unmatched'}; ` +
  `output-sha256=${sha256(normaliseOutput(r.output))}; output-bytes=${Buffer.byteLength(r.output)}; ` +
  `node=${TOOLS.node}; luau=${TOOLS.luau}; playwright=${TOOLS.playwright}; ` +
  `deps=${r.deps?.length ?? 0}; deps-sha=${r.depsSha ?? 'none'}; at=${stamp()}`;

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

    // STALENESS, WITHOUT RUNNING ANYTHING. The recorded fingerprint covers the contents of every
    // file the gate actually loaded when it was measured. Recomputing it over those same files
    // today says, in a second, whether the evidence is about the code that is here now — which is
    // the question `--reverify` answers in ten minutes and `--status` previously could not ask at
    // all. Two commits in this repository silently reverted code while its gates read green.
    let stale = '';
    if (g.evidenceLine !== null) {
      const recorded = /deps-sha=([0-9a-f]+)/.exec(text.split('\n')[g.evidenceLine])?.[1];
      if (!recorded) stale = 'no-deps';
      else {
        let deps = null;
        try { deps = JSON.parse(readFileSync(join(DEPS_DIR, `${g.id}.json`), 'utf8')); } catch { /* none recorded */ }
        if (!deps) stale = 'no-deps';
        else if (dependencyFingerprint(deps) !== recorded) stale = 'STALE';
      }
    }

    const work = mark !== 'MET' || ev !== 'measured' || missing.length > 0 || g.falsifiedLine === null || stale === 'STALE';
    if (work) needWork += 1;
    console.log(
      `${work ? '!' : ' '} ${g.id.padEnd(16)} ${mark.padEnd(9)} ${ev.padEnd(12)} ` +
      `${g.falsifiedLine === null ? 'no-falsified' : 'red-first  '} ${(stale || 'current').padEnd(8)} ${g.title.slice(0, 42)}` +
      (missing.length ? `\n       CHECK names a file that does not exist: ${missing.join(', ')}` : ''),
    );
  }
  console.log(`\n${gates.length} gate(s), ${needWork} need(s) work`);
  process.exit(needWork ? 1 : 0);
}

if (LINT) {
  const problems = [];
  for (const g of gates) {
    // A STATION TAG STRANDED IN THE TITLE. The heading grammar puts the station before the colon
    // — `- [x] G1 [S7]: title` — and the parser only recognises it there. A heading rewritten as
    // `- [x] G1: [S7] title` still parses, but the station silently becomes part of the title and
    // the gate stops belonging to any station. Nothing else in this file would notice: the id is
    // intact, the checkbox is intact, the CHECK still runs.
    //
    // Two rows drifted into that shape in the working tree this pass. This runs for EVERY gate,
    // ticked or not, because an unticked gate loses its station just as quietly.
    if (/^\[S\d+\]/.test(g.title)) {
      problems.push(`${g.id}: its station tag is inside the title — the heading must read \`${g.id} [S…]: …\``);
    }
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
  writeDeps(g.id, r.deps);
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
  const refreshed = [];

  for (const r of results.sort((a, b) => b.headLine - a.headLine)) {
    const now = current.get(r.id);
    if (!now || now.check !== r.check || now.expect !== r.expect) continue;

    const reasons = [];
    if (!r.met) reasons.push(r.exit !== 0 ? `exit=${r.exit}` : 'EXPECT unmatched');
    if (now.falsifiedLine === null) reasons.push('no FALSIFIED record');

    const evLine = now.evidenceLine === null ? null : lines[now.evidenceLine];
    const before = storedSha(evLine);
    // The raw field, not just a hex match: `deps-sha=none` is a RECORDED absence of dependencies
    // and must not be mistaken for a record that predates the field entirely. The two call for
    // opposite answers.
    const beforeDeps = /deps-sha=([0-9a-z]+)/.exec(evLine ?? '')?.[1] ?? null;
    const nowDeps = r.depsSha ?? 'none';
    if (evLine && before && before !== sha256(normaliseOutput(r.output))) {
      // A fingerprint that stops reproducing means one of two very different things, and the
      // DEPENDENCY fingerprint is what separates them.
      //
      // If the gate's own sources changed, the output is SUPPOSED to differ and the record is
      // merely out of date — refreshing it is what --reverify is for. If the sources are
      // byte-identical and the output moved anyway, that is nondeterminism or environment drift
      // and the evidence is worthless.
      //
      // Collapsing the two was a deadlock, not a strictness: the stale fingerprint was itself the
      // reason the record could never be rewritten, so the first legitimate edit to a gate's code
      // pinned that gate at unmet permanently and no amount of green could release it. Six gates
      // were sitting in exactly that state.
      if (beforeDeps !== null && beforeDeps !== 'none' && nowDeps !== 'none' && beforeDeps !== nowDeps) {
        refreshed.push(`${r.id} (its dependencies changed)`);
      } else {
        // Everything else is an UNEXPLAINED output change: matching fingerprints (byte-identical
        // sources, different output — nondeterminism or environment drift), dependencies that
        // stopped being discoverable, or a record old enough to carry no fingerprint at all.
        //
        // None of those may refresh automatically. Refreshing marks the gate MET, and marking a
        // gate met because the checker could not work out why its output moved is precisely the
        // overclaim this ledger exists to prevent. The deadlock it creates for a legacy record is
        // real but it is not a reason to auto-close: the operator deletes that EVIDENCE line and
        // re-runs, which re-baselines in a way that shows up in the diff as a deliberate act.
        reasons.push('output-sha256 does not reproduce; delete the stale EVIDENCE line to re-baseline deliberately');
      }
    }
    if (evLine && evLine.includes('tree-clean=no')) reasons.push('recorded against a dirty tree');

    const untracked = checkPaths(now.check).filter((f) => !TRACKED.has(f));
    if (untracked.length) reasons.push(`CHECK names untracked path(s): ${untracked.join(', ')}`);

    if (reasons.length) {
      quarantined.push({ id: r.id, reasons });
      // Marked UNMET IN THE FILE, not merely reported: a report is something the next reader has
      // to find, and the checkbox is what they will actually trust.
      lines[now.headLine] = `- [ ] ${r.id}${now.station ? ` [${now.station}]` : ''}: ${now.title}`;
    } else {
      writeDeps(r.id, r.deps);
      lines[now.headLine] = `- [x] ${r.id}${now.station ? ` [${now.station}]` : ''}: ${now.title}`;
      if (now.evidenceLine !== null) lines[now.evidenceLine] = evidenceLine(r);
      else lines.splice(insertAt(now), 0, evidenceLine(r));
    }
  }

  writeFileSync(FILE, lines.join('\n'));

  // The tally is COMPUTED from the checkboxes after the rewrite, never from any typed sentence.
  const after = parseGates(readFileSync(FILE, 'utf8'));
  const met = after.filter((g) => g.mark === 'x' || g.mark === 'X').length;
  const unmet = after.length - met;

  for (const id of refreshed) console.error(`gate-check: REFRESHED ${id}`);
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
    // TITLE FROM THE FRESH PARSE, like headLine and station beside it. `r` was parsed when the run
    // STARTED; `now` is a re-read taken at write time, and a long run can straddle an edit to the
    // ledger. Assembling one heading out of both parses writes a line that never existed in either:
    // a stale title carrying its own `[S7]` prefix, plus a freshly-read station prefixed again, and
    // the result was `G-CRITIC-1 [S7]: [S7] The visual critic…`. The inverse race drops the station
    // into the title instead, where it parses as ordinary words and the gate silently belongs to no
    // station at all. Both happened to this ledger in one pass.
    applied.push({ ...r, title: now.title, headLine: now.headLine, evidenceLine: now.evidenceLine, station: now.station });
  }

  // Bottom-up, so an insertion never shifts a line number still to be used.
  for (const r of applied.sort((a, b) => b.headLine - a.headLine)) {
    lines[r.headLine] = `- [${r.met ? 'x' : ' '}] ${r.id}${r.station ? ` [${r.station}]` : ''}: ${r.title}`;
    writeDeps(r.id, r.deps);
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
