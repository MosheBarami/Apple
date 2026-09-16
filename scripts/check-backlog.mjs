#!/usr/bin/env node
// The checker that makes FEATURES.json cost something to lie in.
//
// WHY IT EXISTS (§6.5). Nothing read this file. 1,249 rows, 1,084 of them not-started, and
// `sed -i 's/"not-started"/"done"/g'` closed every one of them while passing every check in the
// repository — including the suite, the typecheck and the escape-hatch scan. A ledger no program
// reads is not a ledger; it is a wish list with checkboxes, and the checkboxes are free.
//
// Free is the whole problem. Every other ledger here costs something to close: a gate needs a
// CHECK that runs, a FALSIFIED record taken at a break, and EVIDENCE whose fingerprint reproduces.
// This one needed a keystroke. So the rule below is the cheapest thing that restores a price: a row
// that claims to be anything other than not-started must cite something a machine can run.
//
//   node scripts/check-backlog.mjs           report and exit 1 on any finding
//   node scripts/check-backlog.mjs --summary counts only, still exits 1
//
// IT IS EXPECTED TO BE RED TODAY. 165 rows claim done, partial or blocked and not one of them
// cites a runnable thing — the evidence field is prose written by whoever closed the row. That is
// the finding, not a defect in this script, and it is the same shape as check-offer: a checker
// whose first honest run is red has told you something the green ones could not.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const JSON_PATH = join(ROOT, 'docs', 'backlog', 'FEATURES.json');
const MD_PATH = join(ROOT, 'docs', 'backlog', 'FEATURES.md');
const GATES_PATH = join(ROOT, 'GATES.md');

const SUMMARY = process.argv.includes('--summary');

// A FLOOR, BECAUSE `0 findings` IS A TOKEN AN EMPTY CHECKER PRINTS TOO.
//
// `BACKLOG HONEST` says only that nothing was found. Delete the loop that verifies citations and it
// prints faster and just as green — which makes it the same shape as `node --test` reporting
// `fail 0` over a file with no tests left in it. The gate that names this checker could not be
// falsified by removing the path it names, and a gate that cannot go red is decoration.
//
// So the success token is gated on a number that only real verification can reach: how many closed
// rows had a citation actually redeemed — a gate the ledger says is MET, or a tracked test file
// that was RUN. Remove the path and this is 0, which is below any floor worth writing.
let FLOOR_CITED = 0;
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--summary') continue;
  if (a === '--floor-cited') {
    FLOOR_CITED = Number(argv[i + 1]);
    if (!Number.isInteger(FLOOR_CITED) || FLOOR_CITED < 1) {
      console.error('check-backlog: --floor-cited needs a positive integer');
      process.exit(2);
    }
    i += 1;
    continue;
  }
  { console.error(`check-backlog: unrecognised flag ${a}`); process.exit(2); }
}

const findings = [];
const fail = (what, where, why) => findings.push({ what, where, why });

/* ------------------------------------------------------------ the two files --- */

let data;
try {
  data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
} catch (err) {
  console.error(`check-backlog: FEATURES.json does not parse — ${err.message}`);
  console.error('check-backlog: every check below reads it, so there is nothing to report but this.');
  process.exit(2);
}
if (!existsSync(MD_PATH)) {
  console.error('check-backlog: FEATURES.md is missing; the two files are checked against each other.');
  process.exit(2);
}
const md = readFileSync(MD_PATH, 'utf8');

const sections = data.sections ?? [];
const rows = sections.flatMap((s) => (s.items ?? []).map((i) => ({ ...i, section: s.section })));

/* ------------------------------------------------- the counts the file states --- */

// A sed that adds or closes rows does not update these, so they are a free tripwire — but only if
// something reads them, which until now nothing did.
if (data.sectionCount !== sections.length) {
  fail(`sectionCount says ${data.sectionCount}, the file has ${sections.length}`, 'FEATURES.json', 'the stated total is not derived');
}
if (data.itemCount !== rows.length) {
  fail(`itemCount says ${data.itemCount}, the file has ${rows.length}`, 'FEATURES.json', 'the stated total is not derived');
}
for (const s of sections) {
  const n = (s.items ?? []).length;
  if (s.count !== n) fail(`section "${s.section}" says ${s.count} items and has ${n}`, 'FEATURES.json', 'a per-section count that is not derived');
}

/* ----------------------------------------------------------------- duplicates --- */

const byId = new Map();
for (const r of rows) {
  if (byId.has(r.id)) fail(`two rows share the id ${r.id}`, 'FEATURES.json', 'an id must address exactly one row');
  byId.set(r.id, r);
}

// WITHIN a section, a repeated name is unambiguous: a section cannot want the same thing twice, so
// it is a merge or a paste that duplicated a row.
for (const s of sections) {
  const seen = new Set();
  for (const i of s.items ?? []) {
    if (seen.has(i.name)) fail(`"${i.name}" appears twice in "${s.section}"`, 'FEATURES.json', 'a section cannot want the same thing twice');
    seen.add(i.name);
  }
}

// ACROSS sections a repeated name is usually legitimate — "Webhooks" under integrations and under
// the developer platform are different features, and 25 such pairs exist. What is NOT legitimate is
// the same name closed in two places citing the SAME evidence: that is one row counted twice, which
// is how a backlog reports progress it has not made.
const byName = new Map();
for (const r of rows) {
  if (!byName.has(r.name)) byName.set(r.name, []);
  byName.get(r.name).push(r);
}
for (const [name, group] of byName) {
  const closed = group.filter((r) => r.status !== 'not-started' && r.evidence && !r.duplicateOf);
  const shared = new Map();
  for (const r of closed) {
    const key = r.evidence.trim();
    if (!shared.has(key)) shared.set(key, []);
    shared.get(key).push(r.section);
  }
  for (const [ev, where] of shared) {
    if (where.length > 1) {
      fail(`"${name}" is closed in ${where.length} sections citing identical evidence`, 'FEATURES.json', `one row counted twice: ${ev.slice(0, 60)}`);
    }
  }
}

/**
 * A row that is the SAME work seen from another taxonomy declares it with `duplicateOf`.
 *
 * Six of the seven collisions in this file are real features that genuinely belong in two sections —
 * "Model routing" is both an AI Models concern and an Infrastructure one, and a reader looking in
 * either place should find it. Listing it twice is useful. COUNTING it twice is not, and the two
 * were indistinguishable while the only signal was an identical evidence string.
 *
 * So the pointer is explicit: the secondary row names the primary, is excluded from every tally,
 * and inherits its proof rather than restating it. The seventh collision was not a duplicate at all
 * — "Webhooks" under Developer Platform means OUTBOUND webhooks for developers, and it had been
 * closed by copying the evidence for Stripe's inbound one. That row is reopened, which is what the
 * check was for.
 */
for (const r of rows) {
  if (!r.duplicateOf) continue;
  const primary = byId.get(r.duplicateOf);
  if (!primary) {
    fail(`${r.id} says it duplicates ${r.duplicateOf}, which is not a row here`, 'FEATURES.json', 'a pointer to nothing');
    continue;
  }
  if (primary.id === r.id) fail(`${r.id} names itself as its own primary`, 'FEATURES.json', 'a cycle of one');
  if (primary.duplicateOf) fail(`${r.id} duplicates ${primary.id}, which is itself a duplicate`, 'FEATURES.json', 'the primary must be the real row');
  if (primary.name !== r.name) fail(`${r.id} duplicates a row with a different name ("${primary.name}")`, 'FEATURES.json', 'a duplicate must be the same feature');
  if (primary.section === r.section) fail(`${r.id} duplicates a row in its own section`, 'FEATURES.json', 'that is a repeat, not a second taxonomy');
  if (primary.status === 'not-started' && r.status !== 'not-started') {
    fail(`${r.id} is "${r.status}" but the row it duplicates is not-started`, 'FEATURES.json', 'a duplicate cannot be further along than the work');
  }
}

/* ------------------------------------------- the markdown and the json agree --- */

// `### <name> — N items  (done D, partial P)`
const mdSections = new Map();
for (const m of md.matchAll(/^### (.+?) — (\d+) items\s+\(done (\d+), partial (\d+)\)$/gm)) {
  mdSections.set(m[1].trim(), { count: Number(m[2]), done: Number(m[3]), partial: Number(m[4]) });
}
const jsonNames = new Set(sections.map((s) => s.section));

for (const name of mdSections.keys()) {
  if (!jsonNames.has(name)) fail(`"${name}" is a bucket in FEATURES.md with no section in the JSON`, 'FEATURES.md', 'the two files describe different backlogs');
}
for (const name of jsonNames) {
  if (!mdSections.has(name)) fail(`"${name}" is a section in the JSON with no bucket in FEATURES.md`, 'FEATURES.json', 'the two files describe different backlogs');
}

// The markdown's per-bucket tallies are DERIVED numbers written by hand. Where both files describe
// the same section, the tally must match what the JSON actually holds — otherwise the human-readable
// half can report progress the machine-readable half does not have.
for (const s of sections) {
  const stated = mdSections.get(s.section);
  if (!stated) continue;
  const items = s.items ?? [];
  // A declared duplicate is listed for the reader and NOT counted. Counting it is precisely what
  // the pointer exists to stop, so the tally it is checked against must exclude it too — otherwise
  // the fix for double-counting would itself read as a tally error forever.
  const real = items.filter((i) => !i.duplicateOf);
  const done = real.filter((i) => i.status === 'done').length;
  const partial = real.filter((i) => i.status === 'partial').length;
  if (stated.count !== items.length) fail(`"${s.section}" is ${stated.count} items in the markdown and ${items.length} in the JSON`, 'FEATURES.md', 'a hand-written tally');
  if (stated.done !== done) fail(`"${s.section}" says done ${stated.done}, the JSON has ${done}`, 'FEATURES.md', 'a hand-written tally');
  if (stated.partial !== partial) fail(`"${s.section}" says partial ${stated.partial}, the JSON has ${partial}`, 'FEATURES.md', 'a hand-written tally');
}

/* ------------------------------------------- a closed row must cite a machine --- */

/**
 * Gate ids that are MET, and gate ids that merely EXIST — two different facts.
 *
 * Only `met` decides whether a row's citation is redeemed. `known` exists so the FINDING can tell
 * the truth about why it was not: a row citing `G90` is not citing prose. It is citing a gate that
 * is in the ledger, has a CHECK a machine runs, and is UNTICKED — whose own EVIDENCE line records
 * `exit=1` and `SUITE RED`. Collapsing that into "citing prose, not a runnable thing" sent the
 * reader to rewrite a sentence when the defect was a red gate, and no amount of rewriting would
 * have moved it. The distinction is already drawn on the other branch — a cited test file that
 * fails says so by name — and its absence here was the asymmetry, not the rule.
 */
const [metGates, knownGates] = (() => {
  const met = new Set();
  const known = new Set();
  if (!existsSync(GATES_PATH)) return [met, known];
  const lines = readFileSync(GATES_PATH, 'utf8').split('\n');
  let cur = null;
  for (const line of lines) {
    const head = /^- \[([ xX~])\] (G[\w-]+)(?:\s+\[S\d+\])?: /.exec(line);
    if (head) { known.add(head[2]); cur = head[1].toLowerCase() === 'x' ? head[2] : null; continue; }
    if (cur && /^\s{2}EVIDENCE:/.test(line)) { met.add(cur); cur = null; }
  }
  return [met, known];
})();

const tracked = new Set(
  execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').filter(Boolean),
);

/** Test files a row cites, run at most once each and cached. */
const testVerdict = new Map();
function testPasses(rel) {
  if (testVerdict.has(rel)) return testVerdict.get(rel);
  const r = execFileSync(process.execPath, ['--test', rel], { cwd: ROOT, encoding: 'utf8', stdio: 'pipe' , timeout: 120_000})
    .toString();
  const ok = /\nℹ fail 0\n/.test(r);
  testVerdict.set(rel, ok);
  return ok;
}

// A RUNNABLE CITATION IS DEMANDED OF `done`, NOT OF EVERY NON-not-started ROW.
//
// This asked a `blocked` row to cite a passing test for work that by definition is not built, and
// a `partial` row to cite one for the half that is missing. That is not a high standard, it is an
// impossible one, and an impossible rule gets satisfied by writing prose that looks like a
// citation — which is the failure this checker exists to catch, induced by the checker.
//
// What `partial` and `blocked` owe instead is evidence that NAMES WHAT IS MISSING. That is what
// makes them different from `done`, and it is checkable.
const closedRows = rows.filter((r) => r.status === 'done');
// A declared duplicate inherits its primary's proof — the whole point of the pointer — so it is
// no more required to explain itself than to cite something.
const qualifiedRows = rows.filter((r) => (r.status === 'partial' || r.status === 'blocked') && !r.duplicateOf);

for (const r of qualifiedRows) {
  const ev = String(r.evidence ?? '').trim();
  if (!ev) {
    fail(`${r.id} is "${r.status}" with no evidence at all`, `FEATURES.json · ${r.section}`, 'a qualified status with nothing behind it is a guess');
    continue;
  }
  // EITHER a runnable citation OR a sentence naming what is missing. Both are real evidence for a
  // qualified status, and demanding the prose form punished the better one: rows citing a passing
  // test were flagged for "not naming what is missing" while rows containing only prose passed.
  // Third shape of this rule in ten minutes, and each wrong version was wrong by being narrower
  // than the thing it was trying to describe.
  const citesSomething = /\b[\w./-]+\.test\.(?:mjs|js|ts|tsx)\b/.test(ev)
    || [...ev.matchAll(/\b(G[A-Z]*-?[A-Z]*-?\d+|G\d+)\b/g)].some((m) => metGates.has(m[1]));
  const namesAGap = /\b(not built|not attempted|missing|blocked|unverified|no caller|does not|is not|pending|deferred|awaiting|superseded|only|limitation)\b/i.test(ev);
  if (!citesSomething && !namesAGap) {
    fail(
      `${r.id} is "${r.status}" with evidence that neither cites nor explains`,
      `FEATURES.json · ${r.section}`,
      `"${ev.slice(0, 70)}" — a qualified status needs a runnable citation or a stated gap`,
    );
  }
}

//[[ AND A `done` ROW WHOSE OWN EVIDENCE SAYS IT WAS NOT DONE.
//
//   Two security rows — Authorization and Tenant isolation — were marked done with evidence
//   beginning "NOT ATTEMPTED". Nothing caught that, because the rule below only asked whether a
//   citation was runnable, never whether the prose contradicted the status it was attached to.
//   A row is at its most dangerous when it is honest in the evidence field and wrong in the
//   status field: a reader scanning statuses sees done, and the truth is one column over. ]]
for (const r of rows.filter((x) => x.status === 'done')) {
  const ev = String(r.evidence ?? '');
  // ANCHORED TO THE LEADING CLAUSE, because an unanchored match is a match on the word "not".
  // The first draft flagged `...not the 60 this row claimed` and `ok reflects the plugin verdict
  // rather than...` — two rows whose evidence is a correct citation containing ordinary prose.
  // Fifth over-broad negative match today and the third of mine; the rule is always the same, and
  // it is that a word is not a property.
  //
  // These rows lead with the caveat in capitals by convention, which is exactly what makes the
  // contradiction findable: the status says done and the first four words say it is not.
  if (/^\s*(NOT ATTEMPTED|NOT BUILT|NOT IMPLEMENTED|NOT DONE|BLOCKED ON|UNVERIFIED|AWAITING)\b/.test(ev)) {
    fail(
      `${r.id} is "done" and its own evidence says otherwise`,
      `FEATURES.json · ${r.section}`,
      `"${ev.slice(0, 80)}" — change the status, not the sentence`,
    );
  }
}

let cited = 0;
for (const r of closedRows) {
  // A declared duplicate inherits its primary's proof rather than restating it. Requiring its own
  // citation would push whoever closes it to paste the primary's evidence string back in — which is
  // the exact double-counting signature the pointer was introduced to replace.
  if (r.duplicateOf) continue;
  const ev = (r.evidence ?? '').trim();
  if (!ev) {
    fail(`${r.id} is "${r.status}" with no evidence at all`, `FEATURES.json · ${r.section}`, 'a status with nothing behind it');
    continue;
  }

  // A gate id the ledger says is MET. This is "exists in the repo and passes" in this repository's
  // own vocabulary: a met gate carries a CHECK that ran and EVIDENCE whose fingerprint reproduced.
  const gates = [...ev.matchAll(/\b(G[A-Z]*-?[A-Z]*-?\d+|G\d+)\b/g)].map((m) => m[1]).filter((g) => metGates.has(g));
  if (gates.length) { cited += 1; continue; }

  // Or a tracked test file, which is run. Cheap today because nothing cites one; the cost grows
  // only as rows are legitimately closed, which is the right direction for the incentive to point.
  const paths = [...ev.matchAll(/\b([\w./-]+\.test\.(?:mjs|js|ts|tsx))\b/g)].map((m) => m[1]).filter((p) => tracked.has(p));
  if (paths.length) {
    const passing = paths.filter((p) => { try { return testPasses(p); } catch { return false; } });
    if (passing.length) { cited += 1; continue; }
    fail(`${r.id} cites ${paths.join(', ')}, which does not pass`, `FEATURES.json · ${r.section}`, 'a citation that does not hold up');
    continue;
  }

  // A GATE THAT EXISTS AND IS NOT MET IS NOT PROSE, AND SAYING SO WAS SENDING THE WRONG REPAIR.
  //
  // Two rows cited `G90`. G90 is in GATES.md, carries `CHECK: node scripts/gate-suite.mjs`, and is
  // UNTICKED — its own EVIDENCE line records exit=1, EXPECT=unmatched, SUITE RED. The finding
  // called that "citing prose, not a runnable thing", which is false twice over: the citation names
  // something a machine runs, and the fix is not to write a better sentence. Whoever acted on the
  // old wording would have rewritten the evidence and watched the finding survive, because the
  // defect is one file over, in a red gate.
  //
  // The branch above already draws this distinction for test files — "cites X, which does not
  // pass" — and the asymmetry was the whole defect. Prose is what is left when the row names
  // neither.
  const unmet = [...ev.matchAll(/\b(G[A-Z]*-?[A-Z]*-?\d+|G\d+)\b/g)].map((m) => m[1]).filter((g) => knownGates.has(g));
  if (unmet.length) {
    fail(
      `${r.id} cites ${[...new Set(unmet)].join(', ')}, which the ledger does not mark met`,
      `FEATURES.json · ${r.section}`,
      'a gate that exists and is red — close the gate or reopen the row; rewriting the sentence changes nothing',
    );
    continue;
  }

  fail(
    `${r.id} is "${r.status}" citing prose, not a runnable thing`,
    `FEATURES.json · ${r.section}`,
    `"${ev.slice(0, 70)}${ev.length > 70 ? '…' : ''}"`,
  );
}

/* ---------------------------------------------------------------------- report --- */

console.log(
  `DENOMINATOR ${rows.length} rows across ${sections.length} sections; ` +
  `${closedRows.length} claim a status (${closedRows.filter((r) => r.duplicateOf).length} of them declared duplicates that inherit their proof), ${cited} cite something runnable`,
);

// The floor is checked BEFORE the success token can be printed, and it is reported as a finding
// rather than as a separate exit path, so a run that is both under-floor and dishonest says both.
if (FLOOR_CITED && cited < FLOOR_CITED) {
  fail(
    `only ${cited} closed row(s) redeemed a citation, below the floor of ${FLOOR_CITED}`,
    'check-backlog',
    'citations went missing rather than red — the verification path may have been removed',
  );
}

if (!findings.length) {
  console.log(`BACKLOG HONEST — ${rows.length} rows, 0 findings${FLOOR_CITED ? `, ${cited} citations redeemed (floor ${FLOOR_CITED})` : ''}`);
  process.exit(0);
}

if (!SUMMARY) {
  const shown = findings.slice(0, 40);
  for (const f of shown) console.error(`  ${f.where}: ${f.what} — ${f.why}`);
  if (findings.length > shown.length) console.error(`  … and ${findings.length - shown.length} more of the same kind`);
}
console.log(`BACKLOG UNPROVEN — ${findings.length} finding(s) across ${rows.length} rows`);
process.exit(1);
