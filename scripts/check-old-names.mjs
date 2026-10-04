#!/usr/bin/env node
// The product is StudPilot. Its former names, Apple and Golem, must not come back.
//
// OWNER DIRECTIVE 2026-10-04 (planning/rename-inventory.md): rename the product completely, everywhere.
// This guard keeps it renamed. It extends scripts/check-no-golem.mjs (2026-10-02) from one old name to
// two, and its allowlist moves to planning/rename-allowlist.txt, one entry and its reason per line,
// so the list of leftovers is readable by the owner and not only by code (StudPilot handoff task 1.2).
//
// WHAT IT SCANS. The CONTENTS and the PATH NAMES of every tracked file (`git ls-files`), case-
// insensitively, including the bytes of binary files (a built plugin or a place file carries strings
// too). The words are `apple` and `golem` (and the `gollem` typo). A hit is a violation unless an
// allowlist line names that path and that word.
//
// THE ALLOWLIST CANNOT GROW SILENTLY. Each line is
//
//     scope | paths | token | max | reason | removal
//
//   * scope   `content` or `path` (a hit in the file's text, or in its path name)
//   * paths   comma-separated globs (`**` crosses directories, `*` does not)
//   * token   a regular expression the WHOLE word around the hit must match (`X-Apple-Token`,
//             `-apple-system`), or `*` for any word. Case-SENSITIVE: the bare stored id `apple` must not
//             bless the word `Apple` in prose. Wrap a part in `(?i:...)` where case genuinely varies. `*` is allowed only for the history paths in
//             WILDCARD_OK below: recorded runs and checksummed migrations.
//   * max     the EXACT number of hits the line covers, a tripwire. More is a new use of an old name;
//             fewer means the line is stale and must be lowered. `*` (no count) only with token `*`.
//   * reason  why this leftover is allowed (third-party text, a compatibility shim, history)
//   * removal when it goes away (a phase, a date, "never: history")
//
//   A line that matches nothing fails the guard, so a stale exception cannot hide. Blank lines and
//   lines starting with `#` are comments.
//
//   node scripts/check-old-names.mjs                exit 0 clean, 1 violations, 2 instrument failure
//   node scripts/check-old-names.mjs --suggest      print every violating word, grouped (helps write lines)
//   node scripts/check-old-names.mjs --count        print only the number of problems
//   node scripts/check-old-names.mjs --root DIR --allowlist FILE   test seam: scan another git tree
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const ROOT = resolve(opt('--root') ?? join(HERE, '..'));
const ALLOWLIST = resolve(opt('--allowlist') ?? join(ROOT, 'planning/rename-allowlist.txt'));

/** The two former names, and the one known misspelling. Case-insensitive. */
const WORD = /apple|gol+em/gi;
const WORD_CHARS = /[A-Za-z0-9_@./:\-]/;

/**
 * Paths where token `*` is permitted. Everything else must name its words.
 * Recorded history is a record: rewriting it falsifies it. Applied migrations are checksummed by the
 * migration runner and are never edited.
 */
const WILDCARD_OK = [
  // recorded history: runs, handoffs, audits, research and the planning record
  /^docs\/(evidence|handoff|autonomy|audit|research|backlog|training|gauntlet|evals|sgsd|playbook|superpowers)\//,
  /^docs\/(DECISIONS|FAILURES|MISSION-PROMPT|MISSION-LEDGER|FINISH-REPORT|FINISH-REPORT-100|PASS-LOG|PASS-STATE|SECURITY-TRIAGE-2026-08-31|model-serving-reality|frontier-for-roblox|knowledge-survivability|embedding-retrieval)\.md$/,
  /^docs\/spec\/DONE\.md$/, /^docs\/operations\/GOLEM-REMOVAL-RUNBOOK\.md$/, /^(FINISH-THE-PRODUCT|WORKLIST)\.md$/,
  /^planning\//,
  /^research\//,
  // applied, checksummed migrations: never edited
  /^infra\/supabase\/migrations\//,
  // recorded measurements and hash-pinned records
  /^packages\/evals\/(results|tasks|tasks-visual|fixtures)\//, /^packages\/evals\/owner-bench\/results\//,
  /^apps\/studpilot-plugin\/(release|proof)\//, /^apps\/[a-z-]+\/\.qa\//,
  // vendored or third-party data (Creator Store catalogues, Roblox docs, harvested corpora)
  /^packages\/corpus\/(raw|data|research)\//, /^packages\/asset-library\/(.*\.jsonl?|packs\/.*)$/,
  // scheduled for deletion by StudPilot handoff task 3.2; the line goes with the directory
  /^packages\/(training|langflow|owner-classify)\//, /^apps\/(plugin|benchmark|experiences)\//,
  // the one-time tools of this rename, which name the old words on purpose
  /^infra\/migrate-studpilot\//,
];

function die(msg) { console.error(`check-old-names: ${msg}`); process.exit(2); }

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }); }
  catch (e) { die(`git ${args[0]} failed in ${ROOT}: ${String(e.message).split('\n')[0]}`); }
}

/** glob -> RegExp. `**` crosses directories, `*` does not, `?` is one non-slash character. */
export function globToRegExp(g) {
  let out = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { out += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else out += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

/* ------------------------------------------------------------------ allowlist --- */
/** Parses the text allowlist. Exported for the guard's own tests. */
export function parseAllowlist(text) {
  const problems = [];
  const entries = [];
  text.split('\n').forEach((raw, idx) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    const where = `line ${idx + 1}`;
    const f = line.split(' | ').map((s) => s.trim());
    if (f.length !== 6) { problems.push(`${where}: needs 6 fields "scope | paths | token | max | reason | removal", has ${f.length}`); return; }
    const [scope, pathsField, token, maxField, reason, removal] = f;
    const paths = pathsField.split(',').map((s) => s.trim()).filter(Boolean);
    if (!['content', 'path'].includes(scope)) problems.push(`${where}: scope must be "content" or "path"`);
    if (!paths.length) problems.push(`${where}: no paths`);
    if (!token) problems.push(`${where}: token is required ("*" or a regular expression)`);
    for (const [k, v] of [['reason', reason], ['removal', removal]]) if (!v || v.length < 8) problems.push(`${where}: ${k} is required — an entry without one is a permanent, unexplained exception`);
    let max = null;
    if (maxField === '*') {
      if (token !== '*') problems.push(`${where}: a named-token line needs an exact max`);
    } else if (/^[1-9]\d*$/.test(maxField)) max = Number(maxField);
    else problems.push(`${where}: max must be a positive integer, or * with token *`);
    if (token === '*') {
      if (maxField !== '*') problems.push(`${where}: a wildcard line carries no count (max *)`);
      for (const p of paths) {
        const probe = p.replace(/\*\*.*$/, 'x');
        if (!WILDCARD_OK.some((re) => re.test(probe) || re.test(p))) problems.push(`${where}: token "*" is not allowed for ${p} — only recorded history and migrations may be allowlisted wholesale`);
      }
    }
    let tok = null;
    if (token && token !== '*') { try { tok = new RegExp(`^(?:${token})$`); } catch (err) { problems.push(`${where}: token is not a regular expression: ${err.message}`); } }
    entries.push({ where, scope, paths, token, max, reason, removal, pathRes: paths.map(globToRegExp), tok, count: 0 });
  });
  return { entries, problems };
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST)) return { entries: [], missing: true };
  const { entries, problems } = parseAllowlist(readFileSync(ALLOWLIST, 'utf8'));
  if (problems.length) { for (const p of problems) console.error(`check-old-names: ${p}`); process.exit(2); }
  return { entries, missing: false };
}

/* --------------------------------------------------------------------- scan --- */
/** Whole word around a hit, trimmed of sentence punctuation. Bounded so binary noise stays small. */
function wordAround(text, start, end) {
  let a = start; let b = end;
  while (a > 0 && start - a < 48 && WORD_CHARS.test(text[a - 1])) a--;
  while (b < text.length && b - end < 48 && WORD_CHARS.test(text[b])) b++;
  let w = text.slice(a, b);
  w = w.replace(/^[.:/\-]+(?=[A-Za-z0-9_@])/, (m) => (m === '-' ? m : '')).replace(/[.:/\-]+$/, '');
  return w || text.slice(start, end);
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** All hits in one blob: [{ word, line }] (line is 0 for binary files). Exported for the guard's tests. */
export function hitsIn(buf) {
  const bin = isBinary(buf);
  const text = buf.toString(bin ? 'latin1' : 'utf8');
  const out = [];
  let lineStarts = null;
  const lineOf = (pos) => {
    if (bin) return 0;
    if (!lineStarts) { lineStarts = [0]; for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 10) lineStarts.push(i + 1); }
    let lo = 0; let hi = lineStarts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1; }
    return lo + 1;
  };
  let lastEnd = -1;
  for (const m of text.matchAll(WORD)) {
    if (m.index < lastEnd) continue; // two hits inside one word count once
    const start = m.index; const end = start + m[0].length;
    let b = end;
    while (b < text.length && b - end < 48 && WORD_CHARS.test(text[b])) b++;
    lastEnd = b;
    out.push({ word: wordAround(text, start, end), line: lineOf(start), bin });
  }
  return out;
}

function main() {
  // Checked here, not at import: scripts/check-rebrand.mjs imports parseAllowlist and has flags of its own.
  for (const a of argv) {
    if (a.startsWith('--') && !['--suggest', '--count', '--root', '--allowlist'].includes(a)) {
      console.error(`check-old-names: unrecognised flag ${a}`);
      process.exit(2);
    }
  }
  const { entries, missing } = loadAllowlist();
  const tracked = git(['ls-files', '-z']).toString('utf8').split('\0').filter(Boolean);
  if (!tracked.length) die(`git ls-files returned nothing in ${ROOT} — zero files scanned is not a pass`);

  const violations = [];
  const take = (kind, rel, word, line) => {
    for (const e of entries) {
      if (e.scope !== kind) continue;
      if (!e.pathRes.some((re) => re.test(rel))) continue;
      if (e.tok && !e.tok.test(word)) continue;
      e.count++;
      return;
    }
    violations.push({ kind, rel, word, line });
  };

  let scanned = 0; let hitFiles = 0; let totalHits = 0;
  for (const rel of tracked) {
    for (const h of rel.matchAll(WORD)) take('path', rel, wordAround(rel, h.index, h.index + h[0].length), 0);
    const abs = join(ROOT, rel);
    let buf;
    try { if (!statSync(abs).isFile()) continue; buf = readFileSync(abs); } catch { continue; } // deleted in the working tree, or a submodule
    scanned++;
    const hits = hitsIn(buf);
    if (hits.length) hitFiles++;
    totalHits += hits.length;
    for (const h of hits) take('content', rel, h.word, h.line);
  }

  const stale = [];
  for (const e of entries) {
    if (e.count === 0) stale.push(`${e.where}: matches nothing (${e.paths.join(', ')} / ${e.token}) — delete it`);
    else if (e.max !== null && e.count > e.max) stale.push(`${e.where}: ${e.count} hits, pinned at ${e.max} — a NEW use of an old name needs a reviewed edit (${e.paths.join(', ')})`);
    else if (e.max !== null && e.count < e.max) stale.push(`${e.where}: ${e.count} hits, pinned at ${e.max} — lower the pin so the line cannot cover a regression (${e.paths.join(', ')})`);
  }

  if (flag('--count')) { console.log(violations.length + stale.length); process.exit(violations.length + stale.length ? 1 : 0); }

  if (flag('--suggest')) {
    const g = new Map();
    for (const v of violations) { const k = `${v.kind}\t${v.rel}\t${v.word}`; g.set(k, (g.get(k) ?? 0) + 1); }
    for (const [k, n] of [...g].sort()) console.log(`${n}\t${k}`);
    for (const s of stale) console.log(`STALE\t${s}`);
    process.exit(violations.length || stale.length ? 1 : 0);
  }

  const contentViolations = violations.filter((v) => v.kind === 'content').length;
  console.log(`check-old-names: scanned ${scanned} tracked file(s); ${totalHits} hit(s) in ${hitFiles} file(s); ${totalHits - contentViolations} allowlisted by ${entries.length} line(s); ${violations.length} violation(s).`);
  if (missing) console.error(`check-old-names: no allowlist at ${relative(ROOT, ALLOWLIST)} — every hit is a violation`);
  for (const v of violations.slice(0, 60)) console.error(`  ${v.kind === 'path' ? 'PATH ' : ''}${v.rel}${v.line ? `:${v.line}` : ''}  ${v.word}`);
  if (violations.length > 60) console.error(`  ... and ${violations.length - 60} more (run with --suggest for the full grouped list)`);
  for (const s of stale) console.error(`  ALLOWLIST ${s}`);
  if (violations.length || stale.length) {
    console.error('check-old-names: FAIL — the product is called StudPilot. Rename it, or (for a compatibility shim, a history record or third-party text) add an allowlist line with a reason and a removal condition.');
    process.exit(1);
  }
  console.log('check-old-names: CLEAN');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
