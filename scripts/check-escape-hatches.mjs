#!/usr/bin/env node
// The ways a green suite can be bought instead of earned.
//
// Every check here corresponds to a move that turns a red signal green without changing the thing
// the signal was about. None is hypothetical: each is either something that has already happened in
// this repository, or something the repository is currently one edit away from.
//
// The point is not that any single one is clever. It is that they are all CHEAP — `|| true`, a
// `.skip`, a deleted test, an edited number — and the expensive alternative is doing the work. A
// checker that catches them shifts which of those is the path of least resistance.
//
//   node scripts/check-escape-hatches.mjs
//
// First stdout line is the DENOMINATOR, per §6.3 of docs/MISSION-PROMPT.md: how many files were
// actually examined, and which globs were excepted. A checker whose denominator is below the
// tracked source surface minus its declared exceptions is a forged oracle — it can report clean
// because it did not look.
//
// AN OWNER `HALT:` LINE IS NEVER A FAILURE. It is the one legitimate way to stop the loop, and a
// checker that failed on it would make stopping impossible, which is the opposite of the point.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SELF = 'scripts/check-escape-hatches.mjs';

const git = (args, fallback = '') => {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim();
  } catch {
    return fallback;
  }
};

/* ------------------------------------------------------------- denominator --- */

// Each exception carries its reason inline, per §6.3. An exception without one is not an
// exception, it is a hole.
const EXCEPTIONS = [
  { glob: 'scripts/check-escape-hatches.mjs', why: 'this file names every pattern it forbids, so it would flag itself' },
  { glob: '**/node_modules/**', why: 'not ours; not tracked' },
  { glob: '.claude/worktrees/**', why: 'scratch worktrees, deleted after each red-first record' },
];

const SOURCE_GLOBS = ['*.ts', '*.tsx', '*.mjs', '*.js', '*.jsx', '*.luau', '*.astro', '*.py'];

const tracked = git(['ls-files', ...SOURCE_GLOBS]).split('\n').filter(Boolean);
const excepted = tracked.filter((f) => f === SELF || f.includes('node_modules/') || f.startsWith('.claude/worktrees/'));
const examined = tracked.filter((f) => !excepted.includes(f));

console.log(
  `DENOMINATOR ${examined.length} files; EXCEPTIONS ${EXCEPTIONS.length}: ${EXCEPTIONS.map((e) => e.glob).join(', ')}`,
);

/* --------------------------------------------------------------- findings --- */

const findings = [];
const fail = (what, where, why) => findings.push({ what, where, why });

const read = (rel) => {
  try { return readFileSync(join(ROOT, rel), 'utf8'); } catch { return null; }
};

/** Markdown with fenced code blocks blanked, so an EXAMPLE of a banned pattern is not a violation. */
function withoutFences(text) {
  return text.replace(/^```[\s\S]*?^```/gm, (m) => m.split('\n').map(() => '').join('\n'));
}

/** HTML-commented regions blanked, so a documented example is not a violation either. */
function withoutHtmlComments(text) {
  return text.replace(/<!--[\s\S]*?-->/g, (m) => m.split('\n').map(() => '').join('\n'));
}

/* ------------------------------------------------- 1. tests that cannot fail --- */
//
// `node --test` prints `fail 0` and exits 0 for a file with zero tests, for a file where every test
// is `.skip`, and for a file that was emptied. A gate whose EXPECT is `fail 0` is therefore
// satisfiable by DELETING the test it gates.

for (const rel of examined.filter((f) => /\.test\.(mjs|js|ts|tsx)$/.test(f))) {
  const src = read(rel);
  if (src === null) continue;
  // `test(` / `it(` / `describe(` at a call position. Counted without the `.skip` and `.todo`
  // forms, which are exactly what this is looking for.
  const live = [...src.matchAll(/(?<![.\w])(?:test|it|describe)\s*(?:\.\s*(?:only|concurrent)\s*)?\(/g)].length;
  const skipped = [...src.matchAll(/(?<![.\w])(?:test|it|describe)\s*\.\s*(?:skip|todo)\s*\(/g)].length;
  if (live === 0 && skipped === 0) fail('a test file with no tests in it', rel, 'node --test reports this as `fail 0` and exits 0');
  else if (live === 0) fail(`a test file where all ${skipped} test(s) are skipped`, rel, 'reports `fail 0` and exits 0');
}

/* ----------------------------------------------- 2/3. typecheck that cannot fail --- */

const manifests = git(['ls-files', 'package.json', '*/package.json', '*/*/package.json', '*/*/*/package.json'])
  .split('\n').filter(Boolean);

for (const rel of manifests) {
  const src = read(rel);
  if (src === null) continue;
  let pkg;
  try { pkg = JSON.parse(src); } catch { fail('an unparseable package manifest', rel, 'every checker that reads it silently skips it'); continue; }
  const scripts = pkg.scripts ?? {};

  for (const [name, body] of Object.entries(scripts)) {
    if (typeof body === 'string' && /\|\|\s*true\b/.test(body)) {
      fail(`a script that cannot fail: ${name}`, rel, '`|| true` turns any exit code into success');
    }
  }

  // A workspace member with sources and no typecheck is a package the typecheck gate never sees.
  const dir = rel === 'package.json' ? '' : dirname(rel);
  const isRoot = rel === 'package.json';
  const hasSources = examined.some((f) => (isRoot ? false : f.startsWith(`${dir}/`)) && /\.(ts|tsx)$/.test(f));
  if (!isRoot && hasSources && !scripts.typecheck) {
    fail('a package with TypeScript sources and no typecheck script', rel, 'the typecheck gate recurses over scripts, so this package is never checked');
  }
}

/* ----------------------------------------------------- 4. gates that prove nothing --- */

const gatesText = read('GATES.md');
if (gatesText === null) {
  fail('GATES.md is missing', 'GATES.md', 'the gate ledger is one of the five and may not be deleted');
} else {
  const body = withoutHtmlComments(withoutFences(gatesText));
  const lines = body.split('\n');

  // An OWNER HALT is never a failure — it is the one legitimate stop. Reported and honoured.
  const halt = lines.find((l) => /^HALT:/.test(l));
  if (halt) console.log(`OWNER HALT PRESENT — ${halt}`);

  for (const [i, line] of lines.entries()) {
    // `- [~]` has no meaning in this vocabulary: it is a gate marked neither met nor open, which
    // removes it from both counts at once.
    if (/^- \[~\]/.test(line)) fail('a gate marked [~]', `GATES.md:${i + 1}`, 'it leaves both the met and the unmet count, so nothing tracks it');
    // `ABANDON:` at column 1 is a mechanical release of the Stop hook.
    if (/^ABANDON:/.test(line)) fail('an ABANDON: at column 1', `GATES.md:${i + 1}`, 'this releases the Stop hook; only an owner HALT: may do that');
  }

  // A CHECK that neither runs a program nor requests a URL is a gate that proves nothing. `grep`
  // over source text is the specific shape: it passes on a comment that mentions the right words.
  for (const [i, line] of lines.entries()) {
    const m = /^\s{4}CHECK:\s*(.+)$/.exec(line);
    if (!m) continue;
    const cmd = m[1];
    const runsSomething = /\b(node|npx|python3?|pnpm|npm|sh|bash|curl|wrangler|playwright)\b/.test(cmd);
    if (!runsSomething) {
      fail('a CHECK that spawns nothing', `GATES.md:${i + 1}`, `it cannot execute the thing it gates: ${cmd.slice(0, 60)}`);
    }
    // A CHECK that is ONLY a grep is the canonical unfalsifiable gate.
    if (/^\s*(grep|rg|ag)\b/.test(cmd)) {
      fail('a CHECK that is a bare grep', `GATES.md:${i + 1}`, 'source text matching a pattern is not the behaviour the gate describes');
    }
  }

  // An EVIDENCE line missing the fields that cannot be written from memory, or with no FALSIFIED
  // above it, is a claim rather than a record.
  const gateHeads = [];
  for (const [i, line] of lines.entries()) if (/^- \[[ xX~]\] G[\w-]+/.test(line)) gateHeads.push(i);

  // A ledger with no gates in it. §12.1 names this directly — "removing `- [ ]` lines so a
  // checklist appears complete" — and it is the cheapest possible green: every count derived from
  // the file reads zero-of-zero, which is indistinguishable from finished. Emptying the file
  // entirely is the same act with a tidier diff.
  if (gateHeads.length === 0) {
    fail('GATES.md contains no gates', 'GATES.md', 'zero-of-zero reads as complete; removing the rows is how a checklist is faked');
  }
  for (const [n, start] of gateHeads.entries()) {
    const end = n + 1 < gateHeads.length ? gateHeads[n + 1] : lines.length;
    const block = lines.slice(start, end);
    const id = /^- \[[ xX~]\] (G[\w-]+)/.exec(block[0])[1];
    const ticked = /^- \[[xX]\]/.test(block[0]);
    if (!ticked) continue;
    const ev = block.find((l) => /^\s{2}EVIDENCE:/.test(l));
    const fs = block.find((l) => /^\s{2}FALSIFIED:/.test(l));
    if (!ev) fail(`${id} is ticked with no EVIDENCE`, 'GATES.md', 'a tick with no measurement under it');
    else {
      for (const field of ['git-sha=', 'tree-clean=']) {
        if (!ev.includes(field)) fail(`${id}'s evidence lacks ${field}`, 'GATES.md', 'this is the field a hand-written line cannot carry');
      }
    }
    if (!fs) fail(`${id} is ticked with no FALSIFIED record`, 'GATES.md', 'nobody has watched it fail, so nothing establishes that it can');
  }

  // An EXPECT that changed without an adjacent EXPECT-CHANGE line is a loosened oracle.
  //
  // THIS DETECTOR WAS STRUCTURALLY INERT. It asks git for a diff against HEAD~1, and the only
  // context in which CI ever runs this checker is the scratch single-commit clone built by its own
  // test — where HEAD~1 does not exist, `git()` swallows the error, and the empty result reads as
  // "nothing changed". A detector that cannot fire where it runs is not a detector, and it looked
  // exactly like a passing one. So the unavailability is now REPORTED rather than absorbed: the
  // checker says it could not look, which is the whole principle it exists to enforce.
  const hasParent = git(['rev-parse', '--verify', '--quiet', 'HEAD~1']) !== '';
  if (!hasParent) {
    console.log('  note: no HEAD~1 in this checkout, so the EXPECT-CHANGE detector could not run');
  } else {
    const diff = git(['diff', '-U0', 'HEAD~1', '--', 'GATES.md']).split('\n');
    const added = diff.filter((l) => /^\+\s{4}EXPECT:/.test(l)).map((l) => l.slice(1).trim());
    const removed = diff.some((l) => /^-\s{4}EXPECT:/.test(l));

    // §5.5 says the note must be ADJACENT. Searching the whole file for `EXPECT-CHANGE:` meant one
    // such line anywhere excused every EXPECT change in the ledger forever — the note became a
    // permission slip rather than a record of a specific strengthening. So the note has to live in
    // the block of the gate whose EXPECT moved.
    if (removed) {
      for (const expect of added) {
        const at = lines.findIndex((l) => l.trim() === expect);
        if (at === -1) continue;
        const head = [...lines.keys()].filter((i) => i <= at && /^- \[[ xX~]\] G[\w-]+/.test(lines[i])).pop() ?? at;
        const next = [...lines.keys()].find((i) => i > at && /^- \[[ xX~]\] G[\w-]+/.test(lines[i])) ?? lines.length;
        const block = lines.slice(head, next);
        if (!block.some((l) => /^\s*EXPECT-CHANGE:/.test(l))) {
          const id = /^- \[[ xX~]\] (G[\w-]+)/.exec(lines[head])?.[1] ?? 'a gate';
          fail(`${id}'s EXPECT changed with no adjacent EXPECT-CHANGE line`, 'GATES.md', `an EXPECT may only get stricter, and the strengthening must be shown beside the gate it applies to: ${expect.slice(0, 50)}`);
        }
      }
    }
  }
}

/* ----------------------------------------------------------- 5. the worklist --- */

if (!git(['ls-files', 'WORKLIST.md'])) {
  fail('WORKLIST.md is not tracked', 'WORKLIST.md', 'an untracked ledger is one that vanishes without a trace in git log');
}
const worklist = read('WORKLIST.md');
if (worklist) {
  const wl = withoutHtmlComments(worklist);
  for (const [i, line] of wl.split('\n').entries()) {
    if (/^HALT:/.test(line)) { console.log(`OWNER HALT PRESENT — ${line}`); continue; }
    if (/^ABANDON:/.test(line)) fail('an ABANDON: at column 1', `WORKLIST.md:${i + 1}`, 'a mechanical release of the Stop hook');
  }
}

/* -------------------------------------------------- 6. control bytes in source --- */
//
// A file with a control byte is BINARY to grep: `grep -c e` over it prints nothing and exits 1,
// which a naive check reads as "no matches" rather than "I could not look". Four tracked files here
// were in that state, one of them using NUL as a real open-redirect test vector — so the
// remediation is to write the ESCAPE, never to strip the byte and destroy the test.

for (const rel of examined) {
  let buf;
  try { buf = readFileSync(join(ROOT, rel)); } catch { continue; }
  for (const byte of buf) {
    if (byte < 9 || (byte > 13 && byte < 32) || byte === 127) {
      fail('a source file containing a control byte', rel, 'every grep-based check silently passes it; write the escape, do not strip the byte');
      break;
    }
  }
}

/* ------------------------------------------------ 7. deferral without a row id --- */
//
// "will", "pending", "next pass" and their kin assign work to a future nobody is accountable for.
// With a row id beside them they are a schedule; without one they are a way of not doing something
// while appearing to have addressed it.

// A deferral is a word plus a COMMITMENT. "after reconnect, 32 messages" is a measurement; "will
// add the route after the rotation" is work assigned to a future nobody owns. Matching the word
// alone made this a false-positive machine over ordinary prose — nine of its first eleven findings
// were sentences like "Last reconciled 2026-09-01" — and a checker that cries wolf gets muted,
// which is a slower way of not having it.
//
// So both halves must be present on the line: a deferral marker AND a verb that assigns work. That
// is stricter about what counts as a violation and no weaker about the violation itself; §6.4's
// point is that the PARAPHRASE is the offence, not a particular wording.
// §6.4 names these words. `once`, `after` and `carried` were dropped in an earlier revision
// because they produced false positives at LINE granularity; the sentence-plus-work-verb rule
// below is what makes them safe to carry, and a refuter demonstrated three real deferrals that
// passed while they were missing — "Wire the payout route after the key rotation" among them.
const DEFERRAL = /\b(will|pending|next pass|later|once|after|gated on|parked|carried|deferred|to be done|TODO)\b/i;
const WORK_VERB = /\b(add|fix|build|write|implement|ship|close|land|wire|deploy|do|update|create|finish|revisit|handle)\b/i;
const ROW_ID = /\b(w\d+|G[\w-]+|F-[A-Za-z0-9-]+|OH-\d+|S\d+|§\d)/;

for (const rel of ['docs/PASS-LOG.md', 'GATES.md', 'WORKLIST.md', 'docs/MISSION-LEDGER.md', 'docs/backlog/BLOCKERS.md']) {
  const src = read(rel);
  if (src === null) continue;
  const clean = withoutHtmlComments(withoutFences(src));
  for (const [i, line] of clean.split('\n').entries()) {
    if (!DEFERRAL.test(line)) continue;
    if (ROW_ID.test(line)) continue;
    // Matched per SENTENCE, not per line. A ledger row here can run to seven hundred characters of
    // prose, and requiring only that the line contain a deferral word somewhere and a work verb
    // somewhere flagged "later the same day" — a past-tense narrative — because the word "update"
    // appeared four clauses away. Co-occurrence in one sentence is the closest cheap proxy for the
    // thing §6.4 actually forbids: a commitment to do something at an unowned future time.
    for (const sentence of line.split(/(?<=[.;!?])\s+|\s\|\s/)) {
      if (!DEFERRAL.test(sentence) || !WORK_VERB.test(sentence)) continue;
      if (ROW_ID.test(sentence)) continue;
      fail('a deferral with no row id', `${rel}:${i + 1}`, `nothing tracks this: ${sentence.trim().slice(0, 80)}`);
      break;
    }
  }
}

/* -------------------------------------------- 8. the same confession three times --- */

const passLog = read('docs/PASS-LOG.md');
if (passLog) {
  const records = passLog.split(/^PASS \d+/m).slice(1);
  const lastThree = records.slice(-3);
  if (lastThree.length === 3) {
    const idsIn = (rec) => new Set([...rec.matchAll(/\b(w\d+|G[\w-]+|OH-\d+)\b/g)].map((m) => m[1]));
    const [a, b, c] = lastThree.map(idsIn);
    for (const id of a) {
      if (b.has(id) && c.has(id)) {
        fail(`${id} has been confessed in three consecutive passes`, 'docs/PASS-LOG.md', 'this is a stall, not a schedule');
      }
    }
  }
}

/* ------------------------------------------------------------------ report --- */

if (!findings.length) {
  console.log(`ESCAPE HATCHES CLEAN — ${examined.length} files examined, 0 findings`);
  process.exit(0);
}

for (const f of findings) console.error(`  ${f.where}: ${f.what} — ${f.why}`);
console.log(`ESCAPE HATCHES FOUND — ${findings.length} in ${examined.length} files examined`);
process.exit(1);
