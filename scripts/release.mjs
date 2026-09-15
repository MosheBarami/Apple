#!/usr/bin/env node
// The release ledger, and everything that has to agree with it.
//
//   node scripts/release.mjs --check          report every disagreement, exit 1 on any
//   node scripts/release.mjs --write          regenerate CHANGELOG.md and docs/releases/*.md
//   node scripts/release.mjs --next           the version and tag the unreleased changes produce
//
//   --root <dir>    point all of it at another tree (this is how its own tests plant violations)
//   --floor <n>     fail unless at least n rules were actually evaluated
//
// WHY A FLOOR. `RELEASE LEDGER CLEAN` is a token an empty checker prints too — delete the loop
// and it prints faster and just as green, which is the shape docs/FAILURES.md calls a failure to
// observe rendering as an observation. The count in the success line is the cheapest defence: it
// is the number of rules that actually ran, so a gutted version of this file cannot reach it.
//
// WHY THE RULES ARE NOT IN THIS FILE. This is the wiring — it reads the tree and prints. Every
// rule lives in scripts/lib/release-rules.mjs as a pure function, because a rule pointed only at
// a healthy repository never fires and would be just as green deleted. tests/release-rules.test.mjs
// hands those functions ledgers that are wrong on purpose and watches each rule go red.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ledgerPageAgreement,
  nextVersion,
  renderChangelog,
  renderReleaseNotes,
  tagFor,
  validateLedger,
  validateTagSequence,
  versionSourceVerdict,
} from './lib/release-rules.mjs';

const argv = process.argv.slice(2);
let MODE = null;
let ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let FLOOR = 0;
for (let i = 0; i < argv.length; i += 1) {
  const a = argv[i];
  if (a === '--check' || a === '--write' || a === '--next') {
    if (MODE !== null && MODE !== a) { console.error(`release: ${MODE} and ${a} are different jobs — pick one`); process.exit(2); }
    MODE = a;
    continue;
  }
  if (a === '--root') {
    if (!argv[i + 1]) { console.error('release: --root needs a directory'); process.exit(2); }
    ROOT = resolve(argv[i + 1]);
    i += 1;
    continue;
  }
  if (a === '--floor') {
    FLOOR = Number(argv[i + 1]);
    // `Number(undefined)` is NaN and `NaN < 1` is false, so a `< 1` test alone would accept a
    // missing value as a floor of nothing. Integer-ness is the check; the comparison is not.
    if (!Number.isInteger(FLOOR) || FLOOR < 1) { console.error('release: --floor needs a positive integer'); process.exit(2); }
    i += 1;
    continue;
  }
  // An unrecognised flag is an error, never a silent no-op: docs/FAILURES.md F-63 is a flag that
  // was passed for several passes, did nothing, and was indistinguishable from one that worked.
  console.error(`release: unrecognised flag ${a} — use --check | --write | --next [--root <dir>] [--floor <n>]`);
  process.exit(2);
}
if (MODE === null) MODE = '--check';

const LEDGER_PATH = join(ROOT, 'docs', 'RELEASES.json');
const CHANGELOG_PATH = join(ROOT, 'CHANGELOG.md');
const NOTES_DIR = join(ROOT, 'docs', 'releases');
const PAGE_PATH = join(ROOT, 'apps', 'site', 'src', 'pages', 'changelog.astro');
const PKG_PATH = join(ROOT, 'package.json');

const findings = [];
const fail = (what, where, why) => findings.push({ what, where, why });
let rules = 0;
const rule = () => { rules += 1; };

/* ---------------------------------------------------------------- the ledger --- */

if (!existsSync(LEDGER_PATH)) {
  console.error(`release: ${LEDGER_PATH} does not exist — the ledger is what everything else is checked against`);
  process.exit(2);
}
let ledger;
try {
  ledger = JSON.parse(readFileSync(LEDGER_PATH, 'utf8'));
} catch (err) {
  console.error(`release: docs/RELEASES.json does not parse — ${err.message}`);
  process.exit(2);
}
const releases = Array.isArray(ledger?.releases) ? ledger.releases : null;
if (releases === null) {
  console.error('release: docs/RELEASES.json has no "releases" list — there is nothing to check');
  process.exit(2);
}

rule();
for (const p of validateLedger(releases)) fail(p, 'docs/RELEASES.json', 'the ledger contradicts itself');

// A ledger that does not validate cannot be rendered, so every rule below it would throw. Reported
// as the finding it is, rather than as a crash.
const ledgerOk = findings.length === 0;

rule();
const tagProblems = validateTagSequence([...releases].reverse().map((r) => tagFor(r.version)).filter((t) => t !== null));
for (const p of tagProblems) fail(p, 'docs/RELEASES.json', 'the tag sequence is not a history');

/* ------------------------------------------------------------- the changelog --- */

if (ledgerOk) {
  rule();
  const generated = renderChangelog(releases);
  if (MODE === '--write') {
    writeFileSync(CHANGELOG_PATH, generated);
    mkdirSync(NOTES_DIR, { recursive: true });
    for (const r of releases) writeFileSync(join(NOTES_DIR, `${tagFor(r.version)}.md`), renderReleaseNotes(r));
    console.log(`wrote CHANGELOG.md and ${releases.length} release note(s) under docs/releases/`);
  } else if (!existsSync(CHANGELOG_PATH)) {
    fail('CHANGELOG.md does not exist', 'CHANGELOG.md', 'the ledger is rendered into it by --write');
  } else {
    const onDisk = readFileSync(CHANGELOG_PATH, 'utf8');
    if (onDisk !== generated) {
      // WHICH LINE, not just "they differ". A drift report nobody can act on gets regenerated
      // blindly, and a blind regeneration is how a hand-written correction is silently discarded.
      const a = onDisk.split('\n');
      const b = generated.split('\n');
      const i = a.findIndex((line, n) => line !== b[n]);
      fail(
        `CHANGELOG.md has drifted from the ledger at line ${i + 1}`,
        'CHANGELOG.md',
        `on disk: ${JSON.stringify((a[i] ?? '').slice(0, 60))} / from the ledger: ${JSON.stringify((b[i] ?? '').slice(0, 60))}`,
      );
    }
  }

  // The per-release notes, same standard.
  rule();
  if (MODE !== '--write') {
    for (const r of releases) {
      const p = join(NOTES_DIR, `${tagFor(r.version)}.md`);
      if (!existsSync(p)) { fail(`${tagFor(r.version)} has no release note`, `docs/releases/${tagFor(r.version)}.md`, 'every release in the ledger is rendered into one'); continue; }
      if (readFileSync(p, 'utf8') !== renderReleaseNotes(r)) {
        fail(`${tagFor(r.version)}'s release note has drifted from the ledger`, `docs/releases/${tagFor(r.version)}.md`, 'it is generated; edit the ledger');
      }
    }
    // A note for a release that is not in the ledger is an announcement with nothing behind it.
    if (existsSync(NOTES_DIR)) {
      const known = new Set(releases.map((r) => `${tagFor(r.version)}.md`));
      for (const f of readdirSync(NOTES_DIR)) {
        if (f.endsWith('.md') && !known.has(f)) fail(`docs/releases/${f} describes a release the ledger does not have`, `docs/releases/${f}`, 'a release note with no release');
      }
    }
  }
}

/* -------------------------------------------------------------- the website --- */

rule();
if (!existsSync(PAGE_PATH)) {
  fail('the published changelog page is missing', 'apps/site/src/pages/changelog.astro', 'the ledger is checked against what the product tells the public');
} else {
  const { missingFromPage, missingFromLedger } = ledgerPageAgreement(releases, readFileSync(PAGE_PATH, 'utf8'));
  for (const v of missingFromPage) fail(`v${v} is in the ledger and not on the changelog page`, 'apps/site/src/pages/changelog.astro', 'a release nobody announced');
  for (const v of missingFromLedger) fail(`the changelog page advertises v${v}, which is not in the ledger`, 'apps/site/src/pages/changelog.astro', 'an announcement with no release behind it');
}

/* ------------------------------------------------ what the build says it is --- */

rule();
if (existsSync(PKG_PATH)) {
  let pkg = null;
  try { pkg = JSON.parse(readFileSync(PKG_PATH, 'utf8')); } catch { pkg = null; }
  if (pkg === null) fail('package.json does not parse', 'package.json', 'the version it declares cannot be checked');
  else {
    const v = versionSourceVerdict(pkg.version, releases);
    if (v.state === 'unreadable') fail(`package.json declares ${JSON.stringify(pkg.version)}, which is not a version`, 'package.json', 'nothing can be said about what is in this build');
    if (v.state === 'unknown') fail(`package.json declares ${v.declared}, which is not a release in the ledger`, 'package.json', 'a build claiming a version nothing describes');
    if (v.state === 'ahead') fail(`package.json declares ${v.declared}, ahead of the ledger head ${v.head}`, 'package.json', 'the build claims a release that has not happened');
    if (v.state === 'behind') {
      // STATED, NOT FAILED. Between a release being written down and the package being bumped this
      // is the true state of the tree, and a check that failed on the truth would be red for the
      // whole window in which it is right. It is printed so the lag cannot be invisible.
      console.log(`package.json is at ${v.declared}; the ledger head is ${v.head} — ${v.releasesBehind} release(s) behind`);
    }
  }
}

/* ----------------------------------------------------------------- --next --- */

if (MODE === '--next') {
  const unreleased = Array.isArray(ledger.unreleased) ? ledger.unreleased : [];
  if (unreleased.length === 0) {
    console.log('nothing unreleased — add entries to "unreleased" in docs/RELEASES.json');
  } else {
    const head = releases[0]?.version;
    const next = nextVersion(head, unreleased);
    if (next === null) {
      fail('the unreleased changes do not produce a version', 'docs/RELEASES.json', 'an unknown kind, or an empty set — see CHANGE_KINDS');
    } else {
      console.log(`next: ${next}   tag: ${tagFor(next)}   (from ${head} + ${unreleased.length} change(s))`);
    }
  }
}

/* ----------------------------------------------------------------- verdict --- */

console.log(`checked ${releases.length} release(s) and ${rules} rule(s) against ${LEDGER_PATH.replace(`${ROOT}/`, '')}`);
if (findings.length) {
  for (const f of findings) console.log(`  ! ${f.what}\n      ${f.where} — ${f.why}`);
  console.log(`RELEASE LEDGER INCONSISTENT — ${findings.length} finding(s)`);
  process.exit(1);
}
if (rules < FLOOR) {
  console.log(`RELEASE CHECK UNDER FLOOR — ${rules} rule(s) ran, ${FLOOR} required; a check that did not look has not passed`);
  process.exit(1);
}
console.log(`RELEASE LEDGER CLEAN — ${releases.length} release(s), ${rules} rule(s)`);
