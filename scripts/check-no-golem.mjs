#!/usr/bin/env node
// The product is Apple. The old name must not come back.
//
// OWNER DECISION 2026-10-02: wipe "golem" out of the product in every aspect. This is the guard
// that keeps it wiped. It replaces the exemption list inside check-rebrand.mjs (that list was
// the old name's last place to live) and supersedes rebrand-literals.mjs.
//
// WHAT IT SCANS. The CONTENTS and the PATH NAMES of every tracked file (`git ls-files`),
// case-insensitively, including the `gollem` typo, and including the bytes of binary files — a
// built plugin or a place file carries strings too. A word it finds is a violation unless an
// entry in scripts/golem-allowlist.json names that path and that word.
//
// THE ALLOWLIST CANNOT GROW SILENTLY. Each entry is { paths, token, reason, removal, max }:
//   * `max` is an EXACT count, a tripwire. More hits than max is a new use of the word. FEWER is
//     also a failure — the entry is stale and must be lowered, so removal progress is recorded
//     and an entry can never go on covering something that is no longer there.
//   * an entry that matches nothing fails the guard. Stale entries cannot hide.
//   * `token` matches the WHOLE word around the hit (`X-Golem-Token`, `golem_original`), so a
//     third-party name such as `IrritatingGolem` is allowed by exact spelling and not by a
//     substring that would also bless a brand-text regression in the same file.
//   * `token: "*"` (any word, no count) is allowed ONLY for the paths in WILDCARD_OK below:
//     recorded history and the database migrations, which are checksummed and must never change.
//
// `--local` also scans the surfaces that are not tracked: `.claude/` settings, the two project
// memory directories, and the NAMES (never the values) of variables in `.env*` files plus the
// names of untracked `.env.*` files. CI runs the tracked-only mode.
//
//   node scripts/check-no-golem.mjs                 exit 0 clean, 1 violations, 2 instrument failure
//   node scripts/check-no-golem.mjs --suggest       print every violating word, grouped, to help write entries
//   node scripts/check-no-golem.mjs --count         print only the number of violations
//   node scripts/check-no-golem.mjs --local         also scan the untracked local surfaces
//   node scripts/check-no-golem.mjs --root DIR --allowlist FILE   test seam: scan another git tree
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
for (const a of argv) {
  if (a.startsWith('--') && !['--suggest', '--count', '--local', '--root', '--allowlist', '--json', '--memory-dir'].includes(a)) {
    console.error(`check-no-golem: unrecognised flag ${a}`);
    process.exit(2);
  }
}
const ROOT = resolve(opt('--root') ?? join(HERE, '..'));
const ALLOWLIST = resolve(opt('--allowlist') ?? join(ROOT, 'scripts/golem-allowlist.json'));

/** The word and its one known misspelling. Case-insensitive. */
const WORD = /gol+em/gi;
const WORD_CHARS = /[A-Za-z0-9_@./:\-]/;

/**
 * Paths where `token: "*"` is permitted. Everything else must name its words.
 * Recorded history is a record: rewriting it falsifies it. Migrations are checksummed by the
 * migration runner and a migration, once applied, is never edited.
 */
const WILDCARD_OK = [
  /^docs\/evidence\//,
  /^infra\/supabase\/migrations\/00(0[1-9]|1[0-3])_/,
  // The tools whose whole job is the old name: this guard and its allowlist, the codemod that
  // removed it, and their tests. They name the word on purpose, in the open.
  /^scripts\/(check-no-golem\.mjs|golem-allowlist\.json|rename-golem\.mjs)$/,
  /^tests\/(no-golem-guard|rename-golem)\.test\.mjs$/,
];

function die(msg) { console.error(`check-no-golem: ${msg}`); process.exit(2); }

function git(args) {
  try { return execFileSync('git', args, { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 }); }
  catch (e) { die(`git ${args[0]} failed in ${ROOT}: ${String(e.message).split('\n')[0]}`); }
}

/** glob -> RegExp. `**` crosses directories, `*` does not, `?` is one non-slash character. */
function globToRegExp(g) {
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
function loadAllowlist() {
  if (!existsSync(ALLOWLIST)) return { entries: [], missing: true };
  let raw;
  try { raw = JSON.parse(readFileSync(ALLOWLIST, 'utf8')); } catch (e) { die(`allowlist is not JSON: ${e.message}`); }
  if (!raw || !Array.isArray(raw.entries)) die('allowlist has no `entries` array');
  const problems = [];
  const entries = raw.entries.map((e, i) => {
    const where = `entry ${i}${e.id ? ` (${e.id})` : ''}`;
    if (!['content', 'path'].includes(e.scope)) problems.push(`${where}: scope must be "content" or "path"`);
    if (!Array.isArray(e.paths) || !e.paths.length) problems.push(`${where}: paths must be a non-empty array`);
    if (typeof e.token !== 'string' || !e.token) problems.push(`${where}: token is required ("*" or a regular expression)`);
    for (const k of ['reason', 'removal']) if (typeof e[k] !== 'string' || e[k].trim().length < 8) problems.push(`${where}: ${k} is required — an entry without a removal condition is a permanent exception`);
    if (e.max !== null && !(Number.isInteger(e.max) && e.max > 0)) problems.push(`${where}: max must be a positive integer, or null for a wildcard history entry`);
    if (e.token === '*') {
      if (e.max !== null) problems.push(`${where}: a wildcard entry carries no count (max: null)`);
      for (const p of e.paths ?? []) {
        const probe = p.replace(/\*\*.*$/, 'x');
        if (!WILDCARD_OK.some((re) => re.test(probe) || re.test(p))) problems.push(`${where}: token "*" is not allowed for ${p} — only recorded history and migrations may be allowlisted wholesale`);
      }
    } else if (e.max === null) problems.push(`${where}: a named-token entry needs an exact max`);
    let tok = null;
    if (e.token !== '*') { try { tok = new RegExp(`^(?:${e.token})$`, e.flags ?? ''); } catch (err) { problems.push(`${where}: token is not a regular expression: ${err.message}`); } }
    return { ...e, i, where, pathRes: (e.paths ?? []).map(globToRegExp), tok, count: 0 };
  });
  if (problems.length) { for (const p of problems) console.error(`check-no-golem: ${p}`); process.exit(2); }
  return { entries, missing: false };
}

/* --------------------------------------------------------------------- scan --- */
/** Whole word around a hit, trimmed of sentence punctuation. Bounded so binary noise stays small. */
function wordAround(text, start, end) {
  let a = start; let b = end;
  while (a > 0 && start - a < 48 && WORD_CHARS.test(text[a - 1])) a--;
  while (b < text.length && b - end < 48 && WORD_CHARS.test(text[b])) b++;
  let w = text.slice(a, b);
  w = w.replace(/^[.:/\-]+/, '').replace(/[.:/\-]+$/, '');
  return w || text.slice(start, end);
}

function isBinary(buf) {
  const n = Math.min(buf.length, 8000);
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true;
  return false;
}

/** All hits in one blob: [{ word, line }] (line is 0 for binary files). */
function hitsIn(buf) {
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
    let a = start; let b = end;
    while (a > 0 && start - a < 48 && WORD_CHARS.test(text[a - 1])) a--;
    while (b < text.length && b - end < 48 && WORD_CHARS.test(text[b])) b++;
    lastEnd = b;
    out.push({ word: wordAround(text, start, end), line: lineOf(start), bin });
  }
  return out;
}

/** Extra, untracked surfaces for --local. Returns [{ rel, abs, namesOnly }]. */
function localSurfaces() {
  const out = [];
  const walk = (dir, base, skip = () => false) => {
    let ents = [];
    try { ents = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      const abs = join(dir, e.name); const rel = join(base, e.name);
      if (skip(rel, e)) continue;
      if (e.isDirectory()) walk(abs, rel, skip);
      else if (e.isFile() && statSync(abs).size < 5_000_000) out.push({ rel, abs });
    }
  };
  walk(join(ROOT, '.claude'), '.claude', (rel) => rel.startsWith('.claude/worktrees') || rel.includes('/node_modules'));
  const mem = opt('--memory-dir') ? [opt('--memory-dir')] : [
    join(homedir(), '.claude/projects/-Users-moshe-Desktop-RbxAI/memory'),
    join(homedir(), '.claude/projects/-Users-moshe-Developer-RbxAI/memory'),
  ];
  for (const m of mem) walk(m, `~memory/${m.split('/').slice(-2)[0]}`);
  let rootEnts = [];
  try { rootEnts = readdirSync(ROOT); } catch { /* ignore */ }
  for (const f of rootEnts) if (/^\.env(\.|$)/.test(f)) out.push({ rel: f, abs: join(ROOT, f), namesOnly: true });
  return out;
}

function main() {
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

  if (flag('--local')) {
    for (const s of localSurfaces()) {
      scanned++;
      const nameHits = [...s.rel.matchAll(WORD)];
      for (const h of nameHits) violations.push({ kind: 'path', rel: s.rel, word: wordAround(s.rel, h.index, h.index + h[0].length), line: 0, local: true });
      let buf;
      try { buf = readFileSync(s.abs); } catch { continue; }
      if (s.namesOnly) {
        // .env: only variable NAMES are looked at, and only the name is ever printed.
        for (const line of buf.toString('utf8').split('\n')) {
          const m = /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/.exec(line);
          if (m && new RegExp(WORD.source, 'i').test(m[1])) violations.push({ kind: 'content', rel: s.rel, word: m[1], line: 0, local: true });
        }
        continue;
      }
      for (const h of hitsIn(buf)) violations.push({ kind: 'content', rel: s.rel, word: h.word, line: h.line, local: true });
    }
  }

  // Allowlist bookkeeping. An entry that matches nothing, or whose count differs from its pin.
  const stale = [];
  for (const e of entries) {
    if (e.count === 0) stale.push(`${e.where}: matches nothing (${e.paths.join(', ')} / ${e.token}) — delete it`);
    else if (e.max !== null && e.count > e.max) stale.push(`${e.where}: ${e.count} hits, pinned at ${e.max} — a NEW use of the old name needs a reviewed edit (${e.paths.join(', ')})`);
    else if (e.max !== null && e.count < e.max) stale.push(`${e.where}: ${e.count} hits, pinned at ${e.max} — lower the pin so the entry cannot cover a regression (${e.paths.join(', ')})`);
  }

  if (flag('--count')) { console.log(violations.length + stale.length); process.exit(violations.length + stale.length ? 1 : 0); }

  if (flag('--suggest')) {
    const g = new Map();
    for (const v of violations) { const k = `${v.kind}\t${v.rel}\t${v.word}`; g.set(k, (g.get(k) ?? 0) + 1); }
    for (const [k, n] of [...g].sort()) console.log(`${n}\t${k}`);
    process.exit(violations.length ? 1 : 0);
  }

  const allowed = totalHits - violations.filter((v) => v.kind === 'content' && !v.local).length;
  console.log(`check-no-golem: scanned ${scanned} tracked file(s); ${totalHits} hit(s) in ${hitFiles} file(s); ${allowed} allowlisted by ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}; ${violations.length} violation(s).`);
  if (missing) console.error(`check-no-golem: no allowlist at ${relative(ROOT, ALLOWLIST)} — every hit is a violation`);
  for (const v of violations.slice(0, 60)) console.error(`  ${v.local ? '[local] ' : ''}${v.kind === 'path' ? 'PATH ' : ''}${v.rel}${v.line ? `:${v.line}` : ''}  ${v.word}`);
  if (violations.length > 60) console.error(`  ... and ${violations.length - 60} more (run with --suggest for the full grouped list)`);
  for (const s of stale) console.error(`  ALLOWLIST ${s}`);
  if (violations.length || stale.length) {
    console.error('check-no-golem: FAIL — the product is called Apple. Rename it, or (for a compatibility shim, a history record or third-party data) add an allowlist entry with a reason and a removal condition.');
    process.exit(1);
  }
  console.log('check-no-golem: CLEAN');
}

main();
