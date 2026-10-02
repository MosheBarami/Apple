#!/usr/bin/env node
// reorg-repo.mjs -- the repository reorganisation, as a plan file plus this engine.
//
//   node scripts/reorg-repo.mjs                      dry run of the default phases: prints every delete, move,
//                                                    reference rewrite and edit it WOULD make, writes nothing
//   node scripts/reorg-repo.mjs --apply              do it (git rm / git mv / file writes; never commits)
//   node scripts/reorg-repo.mjs --phase P1,P2        pick phases (P5/P6 are never in the default)
//   node scripts/reorg-repo.mjs --list               print the plan table and exit
//   node scripts/reorg-repo.mjs --check              read-only: every moved/deleted path is gone from live text,
//                                                    relative specs of moved files resolve, workflow paths exist
//   node scripts/reorg-repo.mjs --gen-evidence       regenerate scripts/reorg/evidence-delete.txt (read-only on the tree)
//
// DESIGN (the rules this file is held to)
//   1. The universe is `git ls-files`. Untracked and ignored files are never read or written, so every
//      change here is recoverable from history.
//   2. Dry run by default. --apply refuses the shared main checkout (git dir == common dir) unless
//      --i-am-in-a-worktree is also passed, and refuses any path under .claude/worktrees/, node_modules/,
//      .env* and apps/worker/.dev.vars.
//   3. Only `git mv` and `git rm` move or remove things. The engine never commits; it writes the touched
//      path list to --touched <file> (default: stdout summary only).
//   4. Idempotent: a move whose source is gone and destination exists is skipped; a delete of a path that is
//      gone is skipped; reference rewriting converges; a conflict (source AND destination both present)
//      stops the run with a non-zero exit and writes nothing.
//   5. Data driven: scripts/reorg/plan.json holds every move, delete and edit. This file is only the engine.
//   6. Names are never rewritten, only paths. Frozen history (docs/evidence, docs/PASS-LOG.md, CHANGELOG.md,
//      docs/releases, pnpm-lock.yaml) is not rewritten either; it records the past.
//
// Everything is computed in memory first (a virtual tree), then flushed only under --apply, so the dry run
// and the real run cannot disagree.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const APPLY = flag('--apply');
const CHECK = flag('--check');
const LIST = flag('--list');
const GEN_EVIDENCE = flag('--gen-evidence');
const QUIET = flag('--quiet');
const TOUCHED_OUT = opt('--touched');

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 30 });
const ROOT = git('rev-parse', '--show-toplevel').trim();
process.chdir(ROOT);
const PLAN_PATH = opt('--plan') ?? 'scripts/reorg/plan.json';
const plan = JSON.parse(fs.readFileSync(PLAN_PATH, 'utf8'));
const EVIDENCE_LIST = opt('--evidence-list');
let SKIP_RAW = false;
const PHASES = new Set((opt('--phase') ?? Object.entries(plan.phases).filter(([, v]) => v.default).map(([k]) => k).join(',')).split(',').filter(Boolean));
const inPhase = (e) => PHASES.has(e.phase);

const say = (...a) => { if (!QUIET) console.log(...a); };
const errors = [];
const warns = [];
const fail = (m) => errors.push(m);

// ---------------------------------------------------------------------------------------------- guards
const HARD_EXCLUDE = (p) => p.startsWith('.claude/worktrees/') || p.startsWith('node_modules/') || p.includes('/node_modules/')
  || /(^|\/)\.env(\.|$)/.test(p) || p === 'apps/worker/.dev.vars';
if (APPLY) {
  const gd = path.resolve(git('rev-parse', '--git-dir').trim());
  const cd = path.resolve(git('rev-parse', '--git-common-dir').trim());
  if (gd === cd && !flag('--i-am-in-a-worktree')) {
    console.error('REFUSING --apply in the shared main checkout (git dir == common dir). Run it in a worktree.');
    process.exit(2);
  }
}

// ---------------------------------------------------------------------------------------------- the tree
const lsFiles = git('ls-files', '-s', '-z').split('\0').filter(Boolean).map((l) => {
  const m = /^(\d+) \w+ \d+\t(.*)$/s.exec(l);
  return { mode: m[1], path: m[2] };
});
const ORIG = new Map(lsFiles.map((f) => [f.path, f.mode]));
const origDirs = new Set();
for (const p of ORIG.keys()) { let d = path.posix.dirname(p); while (d && d !== '.' && !origDirs.has(d)) { origDirs.add(d); d = path.posix.dirname(d); } }
const isOrigDir = (p) => origDirs.has(p);
const BIN = /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf|rbxm|rbxl|rbxlx|zip|gz|mp3|ogg|wav|pdf|bin|glb|fbx|mp4|webm|avif|lockb|mov|gltf|obj|psd|pyc)$/i;
// Frozen history: read for reference checks, never rewritten.
const FROZEN = (p) => p.startsWith('docs/evidence/') || p === 'docs/PASS-LOG.md' || p === 'pnpm-lock.yaml'
  || p === 'CHANGELOG.md' || p.startsWith('docs/releases/') || p === 'docs/RELEASES.json'
  || p.startsWith('scripts/reorg/') || p === 'scripts/reorg-repo.mjs' || p === 'docs/operations/REPO-CLEANUP-PENDING.md'
  || p === 'scripts/known-fixtures.json' || p === 'scripts/known-exposures.json';
const JSLIKE = /\.(mjs|cjs|js|ts|tsx|jsx|astro)$/;
const MDLIKE = /\.mdx?$/;

// entries: Map<currentPath, {orig, text}>
const files = new Map();
for (const [p, mode] of ORIG) files.set(p, { orig: p, mode, text: undefined, changed: false });
const readText = (e) => {
  if (e.text !== undefined) return e.text;
  if (e.mode === '120000' || BIN.test(e.orig) || HARD_EXCLUDE(e.orig)) { e.text = null; return null; }
  let b; try { b = fs.readFileSync(e.orig); } catch { e.text = null; return null; }
  if (b.length > 8 << 20 || b.includes(0)) { e.text = null; return null; }
  e.text = b.toString('utf8'); return e.text;
};

const expand = (p) => { // file -> [p]; dir -> all files under it (in the current virtual tree)
  const out = [];
  if (files.has(p)) out.push(p);
  const pre = p.endsWith('/') ? p : p + '/';
  for (const k of files.keys()) if (k.startsWith(pre)) out.push(k);
  return out;
};
const exists = (p) => files.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/'));

// ---------------------------------------------------------------------------------------------- plan ops
const touched = { deleted: new Set(), moved: [], edited: new Set(), created: new Set(), cached: new Set(), symlinks: [] };
const report = { rewrites: new Map(), edits: [] };
const bump = (k, n = 1) => report.rewrites.set(k, (report.rewrites.get(k) ?? 0) + n);

const activeMoves = [];
const activeRedirects = []; // deleted file -> replacement path (references are rewritten to it)

function planDeletes() {
  const dels = (plan.deletes ?? []).filter(inPhase);
  let evidence = [];
  const evFile = EVIDENCE_LIST ?? plan.evidenceList;
  if (!SKIP_RAW && evFile && PHASES.has(plan.evidencePhase) && fs.existsSync(evFile)) evidence = fs.readFileSync(evFile, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const all = [...dels.map((d) => ({ ...d })), ...evidence.map((p) => ({ path: p, why: 'evidence prune', evidence: true }))];
  for (const d of all) {
    if (HARD_EXCLUDE(d.path)) { fail(`refusing to delete a hard-excluded path: ${d.path}`); continue; }
    const hits = expand(d.path);
    if (hits.length === 0) { if (d.redirect) activeRedirects.push({ from: d.path, to: d.redirect, dir: false }); say(`  skip delete (already gone): ${d.path}`); continue; }
    if (d.cached) { for (const h of hits) { files.delete(h); touched.cached.add(h); } touched.deleted.add(d.path); continue; }
    if (d.symlinkTo) continue; // handled in planSymlinks
    for (const h of hits) files.delete(h);
    touched.deleted.add(d.path);
    if (d.redirect) activeRedirects.push({ from: d.path, to: d.redirect, dir: hits.length > 1 || hits[0] !== d.path });
    say(`  delete  ${d.path}${hits.length > 1 ? `  (${hits.length} files)` : ''}${d.why ? `   -- ${d.why}` : ''}`);
  }
}

function planMoves() {
  for (const m of (plan.moves ?? []).filter(inPhase)) {
    if (HARD_EXCLUDE(m.from) || HARD_EXCLUDE(m.to)) { fail(`refusing a hard-excluded move: ${m.from} -> ${m.to}`); continue; }
    const srcFiles = expand(m.from);
    const dstFiles = expand(m.to);
    if (srcFiles.length === 0 && dstFiles.length > 0) { // already done: no file operation, but references are still rewritten
      activeMoves.push({ ...m, dir: !(dstFiles.length === 1 && dstFiles[0] === m.to), n: dstFiles.length, done: true });
      say(`  skip move (already done): ${m.from} -> ${m.to}`); continue;
    }
    if (srcFiles.length === 0) { fail(`move source missing and destination missing: ${m.from} -> ${m.to}`); continue; }
    if (dstFiles.length > 0) { fail(`CONFLICT: both ${m.from} and ${m.to} exist; will not overwrite`); continue; }
    const dir = !(srcFiles.length === 1 && srcFiles[0] === m.from);
    for (const s of srcFiles) {
      const rest = s === m.from ? '' : s.slice(m.from.length);
      const d = m.to + rest;
      const e = files.get(s); files.delete(s); files.set(d, e);
    }
    activeMoves.push({ ...m, dir, n: srcFiles.length });
    touched.moved.push({ from: m.from, to: m.to });
    say(`  move    ${m.from} -> ${m.to}${dir ? `  (${srcFiles.length} files)` : ''}`);
  }
}

// original path -> current path (null if deleted without redirect). Uses the final virtual tree.
const origToNow = new Map();
function buildOrigMap() {
  for (const [now, e] of files) origToNow.set(e.orig, now);
}
const mapOld = (p) => {
  if (origToNow.has(p)) return origToNow.get(p);
  if (ORIG.has(p)) { // a tracked file that is no longer in the tree: deleted
    const r = activeRedirects.find((x) => x.from === p || (x.dir && p.startsWith(x.from + '/')));
    return r ? r.to : null;
  }
  // a directory (or a path we never tracked): map by moved prefix
  for (const m of [...activeMoves].sort((a, b) => b.from.length - a.from.length)) {
    if (p === m.from) return m.to;
    if (p.startsWith(m.from + '/')) return m.to + p.slice(m.from.length);
  }
  for (const r of activeRedirects) { if (p === r.from || (r.dir && p.startsWith(r.from + '/'))) return r.to; }
  return p;
};

// ---------------------------------------------------------------------------------------------- rewriting
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATHCH = /[\w@~-]/;
function okBefore(text, i) {
  const c = text[i - 1];
  if (c === undefined) return true;
  if (PATHCH.test(c)) return false;
  if (c === '.') return false;
  if (c === '/') {
    const b = text.slice(Math.max(0, i - 3), i);
    if (/(^|[^.\w-])\.\/$/.test(b)) return true;
    const c2 = text[i - 2];
    return !(c2 === undefined || /[\w.-]/.test(c2));
  }
  return true;
}
function literalRewrite(text, from, to) {
  const re = new RegExp(esc(from) + '(?![\\w-]|\\.\\w)', 'g');
  let n = 0;
  const out = text.replace(re, (m, off) => { if (!okBefore(text, off)) return m; n++; return to; });
  return [out, n];
}
// a path written inside a regex literal or an escaped string: docs\/PLUGIN-RELEASE\.md
const escPath = (p) => p.replace(/[./]/g, (c) => '\\' + c);
function escapedRewrite(text, from, to) {
  const f = escPath(from);
  if (!text.includes(f)) return [text, 0];
  const re = new RegExp(esc(f) + '(?![\\w-])', 'g');
  let n = 0;
  const out = text.replace(re, (m, off) => { const c = text[off - 1]; if (c !== undefined && /[\w@~-]/.test(c)) return m; n++; return escPath(to); });
  return [out, n];
}
function segmentRewrite(text, from, to) {
  const fs_ = from.split('/'); const ts = to.split('/');
  if (fs_.length < 2) return [text, 0];
  let src = '';
  fs_.forEach((s, i) => { src += (i ? '\\s*,\\s*' : '') + `(['"])${esc(s)}\\${i + 1}`; });
  // backrefs: group i+1 is the quote of segment i
  const re = new RegExp(src, 'g');
  let n = 0;
  const out = text.replace(re, (m, q) => { n++; return ts.map((s) => `${q}${s}${q}`).join(', '); });
  return [out, n];
}

const DIRVARS = String.raw`(?:\bHERE\b|\b__dirname\b|\bhere\b|\bSCRIPT_DIR\b|dirname\(fileURLToPath\(import\.meta\.url\)\))`;
const QSTR = String.raw`(?:'[^'\n]*'|"[^"\n]*")`;

function relOut(newDir, target, origSpec, kind) {
  let rel = path.posix.relative(newDir || '.', target || '.');
  if (rel === '') rel = '.';
  const wantDot = kind === 'js' || origSpec.startsWith('./') || origSpec === '.';
  if (wantDot && !rel.startsWith('.')) rel = './' + rel;
  if (origSpec.endsWith('/') && !rel.endsWith('/') && rel !== '.') rel += '/';
  return rel;
}

function fixRelSpec(spec, oldDir, newDir, fileMoved, kind) {
  // returns a new spec or null (leave alone)
  const abs = path.posix.normalize(path.posix.join(oldDir, spec));
  const target = abs === '.' ? '' : abs;
  const known = ORIG.has(target) || isOrigDir(target) || target === '';
  if (kind === 'md' && !known) return null;
  const now = target === '' ? '' : mapOld(target);
  if (now === null) return null;
  if (!fileMoved && now === target) return null;
  const out = relOut(newDir, now, spec, kind);
  return out === spec ? null : out;
}

function relRewrite(text, file) {
  const oldDir = path.posix.dirname(file.orig) === '.' ? '' : path.posix.dirname(file.orig);
  const newDir = path.posix.dirname(file.now) === '.' ? '' : path.posix.dirname(file.now);
  const moved = oldDir !== newDir;
  let n = 0;
  let out = text;
  if (JSLIKE.test(file.now)) {
    const rep = (spec) => { const r = fixRelSpec(spec, oldDir, newDir, moved, 'js'); if (r) n++; return r; };
    out = out.replace(/(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\2/g, (m, pre, q, spec) => { const r = rep(spec); return r ? `${pre}${q}${r}${q}` : m; });
    out = out.replace(/(new URL\(\s*)(['"])(\.{1,2}(?:\/[^'"\n]*)?)\2(\s*,\s*import\.meta\.url)/g, (m, pre, q, spec, post) => { const r = rep(spec); return r ? `${pre}${q}${r}${q}${post}` : m; });
    const segRe = new RegExp(`(${DIRVARS})(\\s*,\\s*)((?:${QSTR}\\s*,\\s*)*${QSTR})`, 'g');
    out = out.replace(segRe, (m, dv, sep, segs) => {
      const parts = [...segs.matchAll(new RegExp(QSTR, 'g'))].map((x) => x[0]);
      const q = parts[0][0];
      const raw = parts.map((s) => s.slice(1, -1));
      if (!raw.some((s) => s === '..' || s.startsWith('../') || s.startsWith('./') || s.includes('/') || s.includes('.'))) return m;
      const spec = raw.join('/');
      const r = fixRelSpec(spec, oldDir, newDir, moved, 'seg');
      if (!r) return m;
      n++;
      const segsOut = (r === '.' ? [] : r.split('/')).map((s) => `${q}${s}${q}`);
      return `${dv}${sep}${segsOut.join(', ')}`;
    });
  }
  if (MDLIKE.test(file.now)) {
    out = out.replace(/\]\(\s*(<?)([^)\s#<>]+)(#[^)\s]*)?(>?)\s*\)/g, (m, lt, spec, frag, gt) => {
      if (/^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith('/') || spec.startsWith('#')) return m;
      const r = fixRelSpec(spec, oldDir, newDir, moved, 'md');
      if (!r) return m;
      n++;
      return `](${lt}${r}${frag ?? ''}${gt})`;
    });
  }
  return [out, n];
}

function rewriteAll() {
  const moves = [...activeMoves].sort((a, b) => b.from.length - a.from.length);
  const redirects = [...activeRedirects].sort((a, b) => b.from.length - a.from.length);
  for (const [now, e] of files) {
    if (FROZEN(e.orig) || FROZEN(now)) continue;
    const t0 = readText(e);
    if (t0 === null) continue;
    let t = t0;
    const f = { orig: e.orig, now };
    for (const m of moves) {
      let n; [t, n] = literalRewrite(t, m.from, m.to); if (n) bump(`literal ${m.from}`, n);
      [t, n] = segmentRewrite(t, m.from, m.to); if (n) bump(`segments ${m.from}`, n);
      [t, n] = escapedRewrite(t, m.from, m.to); if (n) bump(`escaped ${m.from}`, n);
    }
    for (const r of redirects) { let n; [t, n] = literalRewrite(t, r.from, r.to); if (n) bump(`redirect ${r.from}`, n); }
    let n; [t, n] = relRewrite(t, f); if (n) bump('relative specs', n);
    if (t !== t0) { e.text = t; e.changed = true; }
  }
}

// ---------------------------------------------------------------------------------------------- explicit edits
// JSON text exactly as the file's own writer would produce it (python's ensure_ascii escapes non-ASCII; folders.json does not)
function jstr(j, indent, orig) {
  let s = JSON.stringify(j, null, indent);
  if (!/[^\x00-\x7f]/.test(orig) && /\\u[0-9a-f]{4}/i.test(orig)) s = s.replace(/[\u0080-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
  return s + (orig.endsWith('\n') ? '\n' : '');
}
const dirty = (p) => git('status', '--porcelain', '--', p).trim().length > 0;
function applyRefEdits() {
  for (let ed of (plan.refEdits ?? []).filter(inPhase)) {
    // an edit names the file where it was when the plan was written; a move in the same run may have relocated it
    if (!files.has(ed.file) && files.has(mapOld(ed.file) ?? '')) ed = { ...ed, file: mapOld(ed.file) };
    const cur = [...files.entries()].find(([k]) => k === ed.file);
    if (!cur) { if (ed.optional) continue; fail(`refEdit: file not in tree: ${ed.file}`); continue; }
    if (ed.skipIfDirty && dirty(ed.file)) { warns.push(`refEdit skipped (file is dirty): ${ed.file}`); continue; }
    const e = cur[1];
    const t = readText(e);
    if (t === null) { fail(`refEdit: not a text file: ${ed.file}`); continue; }
    const re = new RegExp(ed.find, ed.flags ?? 'g');
    const matches = [...t.matchAll(new RegExp(ed.find, (ed.flags ?? 'g').includes('g') ? ed.flags ?? 'g' : (ed.flags ?? '') + 'g'))].length;
    if (matches !== ed.expect) {
      if (matches === 0 && ed.rerunOk) { say(`  skip edit (already applied): ${ed.file}  ${ed.find.slice(0, 50)}`); continue; }
      fail(`refEdit count mismatch in ${ed.file}: /${ed.find}/ matched ${matches}, plan expects ${ed.expect}`);
      continue;
    }
    const out = t.replace(re, ed.replace);
    if ([...out.matchAll(new RegExp(ed.find, (ed.flags ?? 'g').includes('g') ? ed.flags ?? 'g' : (ed.flags ?? '') + 'g'))].length > 0) { fail(`refEdit is not idempotent in ${ed.file}: /${ed.find}/ still matches after it was applied`); continue; }
    e.text = out; e.changed = e.changed || out !== t;
    report.edits.push(`${ed.file}  (${matches}x)  ${ed.why ?? ''}`);
  }
  for (const ed of (plan.jsonEdits ?? []).filter(inPhase)) {
    const cur = files.get(ed.file);
    if (!cur) { fail(`jsonEdit: file not in tree: ${ed.file}`); continue; }
    const t = readText(cur);
    let j; try { j = JSON.parse(t); } catch (x) { fail(`jsonEdit: ${ed.file} is not JSON: ${x.message}`); continue; }
    const indent = ed.indent ?? 2;
    const round = jstr(j, indent, t);
    if (round !== t) { fail(`jsonEdit: ${ed.file} does not round-trip with indent ${indent}; refusing to reformat it`); continue; }
    const target = ed.at ? ed.at.reduce((o, k) => o[k], j) : j;
    let changed = 0;
    for (const k of ed.deleteKeys ?? []) if (k in target) { delete target[k]; changed++; }
    for (const [k, v] of Object.entries(ed.setKeys ?? {})) { if (JSON.stringify(target[k]) !== JSON.stringify(v)) { target[k] = v; changed++; } }
    if (ed.sortKeys && changed) { const sorted = Object.fromEntries(Object.entries(target).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))); for (const k of Object.keys(target)) delete target[k]; Object.assign(target, sorted); }
    if (changed) { cur.text = jstr(j, indent, t); cur.changed = true; report.edits.push(`${ed.file}  json (${changed} key change(s))  ${ed.why ?? ''}`); }
  }
}

// scripts/known-fixtures.json is keyed by (path, value hash). A moved fixture file needs its declaration at the
// NEW path, or secret-scan.py fails in CI. The old path entry is kept: the old blobs still exist in history.
function fixtureDeclarations() {
  const f = mapOld('scripts/known-fixtures.json') ?? 'scripts/known-fixtures.json';
  const e = files.get(f);
  if (!e || activeMoves.length === 0) return;
  const t = readText(e); const j = JSON.parse(t);
  const round = jstr(j, 2, t);
  if (round !== t) { warns.push('known-fixtures.json does not round-trip; fixture declarations NOT updated for moved files'); return; }
  const have = new Set(j.declared.map((d) => `${d.path}\0${d.value_sha256}`));
  let added = 0;
  const add = [];
  for (const d of j.declared) {
    const now = mapOld(d.path);
    if (now && now !== d.path && !have.has(`${now}\0${d.value_sha256}`)) { add.push({ ...d, path: now }); have.add(`${now}\0${d.value_sha256}`); added++; }
  }
  if (!added) return;
  j.declared = [...j.declared, ...add].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : a.value_sha256 < b.value_sha256 ? -1 : 1));
  e.text = jstr(j, 2, t); e.changed = true;
  report.edits.push(`scripts/known-fixtures.json  ${added} declaration(s) duplicated to the moved path (old path kept for history)`);
}

function planSymlinks() {
  for (const s of (plan.symlinks ?? []).filter(inPhase)) {
    const cur = files.get(s.path);
    if (cur && cur.mode === '120000') { say(`  skip symlink (already): ${s.path}`); continue; }
    touched.symlinks.push(s);
    say(`  symlink ${s.path} -> ${s.target}`);
    if (cur) files.delete(s.path);
  }
}

// ---------------------------------------------------------------------------------------------- evidence list
function liveCorpus(excludePrefixes) {
  const parts = [];
  for (const [now, e] of files) {
    if (now !== 'docs/evidence/README.md' && excludePrefixes.some((x) => now.startsWith(x))) continue; // the evidence ledger README names entries
    if (BIN.test(now)) continue;
    const t = readText(e); if (t) parts.push(t);
  }
  return parts.join('\n\u0000\n');
}
// An evidence entry is protected by name, by prefix, when it is undated, or when it is newer than plan.evidenceKeepSince.
function evidenceProtected(name) {
  if ((plan.evidenceProtected ?? []).includes(name) || (plan.evidenceProtectedPrefix ?? []).some((x) => name.startsWith(x))) return true;
  const m = /(20\d\d)-?(\d\d)-?(\d\d)/.exec(name);
  if (!m) return true;
  return `${m[1]}-${m[2]}-${m[3]}` >= (plan.evidenceKeepSince ?? '9999-99-99');
}
function genEvidence() {
  const ev = 'docs/evidence/';
  const entries = new Map();
  for (const p of ORIG.keys()) if (p.startsWith(ev)) { const rest = p.slice(ev.length); entries.set(rest.split('/')[0], (entries.get(rest.split('/')[0]) ?? 0) + 1); }
  const corpus = liveCorpus([ev, 'docs/PASS-LOG.md', 'scripts/reorg/', 'docs/operations/REPO-CLEANUP-PENDING.md']);
  const evCorpus = [...files].filter(([p]) => p.startsWith(ev)).map(([, e]) => readText(e) ?? '').join('\n');
  const protectedNames = new Set(plan.evidenceProtected ?? []);
  const protectedPrefix = plan.evidenceProtectedPrefix ?? [];
  const del = []; let kept = 0;
  for (const [name, n] of [...entries].sort()) {
    if (name === 'README.md') continue;
    const base = name.replace(/\.[a-z0-9]+$/i, '');
    if (evidenceProtected(name)) { kept++; continue; }
    const needles = [`docs/evidence/${name}`, name];
    if (needles.some((x) => corpus.includes(x))) { kept++; continue; }
    // another KEPT evidence entry names it: keep (cheap, conservative)
    del.push(name);
  }
  void evCorpus; void protectedNames;
  fs.mkdirSync(path.dirname(EVIDENCE_LIST ?? plan.evidenceList), { recursive: true });
  fs.writeFileSync(EVIDENCE_LIST ?? plan.evidenceList, `# docs/evidence entries (top-level names) that no live tracked text names. Generated by\n# node scripts/reorg-repo.mjs --gen-evidence at ${git('rev-parse', '--short', 'HEAD').trim()}. Re-checked at apply time: an entry that gained a\n# reference since is skipped.\n` + del.join('\n') + '\n');
  console.log(`evidence entries: ${entries.size - 1}; kept ${kept}; listed for deletion ${del.length}`);
  let fcount = 0; for (const d of del) fcount += entries.get(d);
  console.log(`files in listed entries: ${fcount}`);
}

// evidence list is re-verified against the post-edit tree
function filterEvidence() {
  if (!(EVIDENCE_LIST ?? plan.evidenceList) || !PHASES.has(plan.evidencePhase) || !fs.existsSync(EVIDENCE_LIST ?? plan.evidenceList)) return null;
  const listed = fs.readFileSync(EVIDENCE_LIST ?? plan.evidenceList, 'utf8').split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'));
  const corpus = liveCorpus(['docs/evidence/', 'docs/PASS-LOG.md', 'scripts/reorg/', 'docs/operations/REPO-CLEANUP-PENDING.md']);
  const protectedNames = new Set(plan.evidenceProtected ?? []);
  const keep = []; const del = [];
  for (const name of listed) {
    if (evidenceProtected(name)) { keep.push(name); continue; }
    if ([`docs/evidence/${name}`, name].some((x) => corpus.includes(x))) { keep.push(name); continue; }
    del.push(name);
  }
  for (const k of keep) warns.push(`evidence entry skipped (gained a reference or protected): ${k}`);
  return del;
}

// ---------------------------------------------------------------------------------------------- run
function summarise() {
  const changed = [...files].filter(([, e]) => e.changed);
  say(`\nreference rewrites (by rule):`);
  for (const [k, v] of [...report.rewrites].sort()) say(`  ${String(v).padStart(5)}  ${k}`);
  say(`\nfiles with rewritten text: ${changed.length}`);
  if (flag('--verbose')) for (const [p] of changed) say(`  ${p}`);
  if (report.edits.length) { say('\nexplicit edits:'); for (const x of report.edits) say(`  ${x}`); }
}

function flush() {
  const run = (...a) => execFileSync('git', a, { stdio: ['ignore', 'inherit', 'inherit'] });
  const runIn = (input, ...a) => execFileSync('git', a, { input, stdio: ['pipe', 'inherit', 'inherit'] });
  // deletions (tracked paths only)
  const delPaths = [...touched.deleted].filter((p) => ORIG.has(p) || isOrigDir(p));
  const plain = delPaths.filter((p) => !touched.cached.has(p) && ![...touched.cached].some((c) => c.startsWith(p + '/')));
  if (plain.length) runIn(plain.join('\0'), 'rm', '-r', '-q', '-f', '--pathspec-from-file=-', '--pathspec-file-nul');
  if (touched.cached.size) runIn([...touched.cached].join('\0'), 'rm', '--cached', '-q', '--pathspec-from-file=-', '--pathspec-file-nul');
  for (const m of touched.moved) {
    fs.mkdirSync(path.dirname(m.to), { recursive: true });
    run('mv', m.from, m.to);
  }
  for (const [now, e] of files) {
    if (e.changed && e.text != null) { fs.writeFileSync(now, e.text); touched.edited.add(now); }
  }
  // directories the moves and deletes emptied; rmdir only ever removes an EMPTY directory, so untracked content is safe
  for (const p0 of [...touched.moved.map((m) => m.from), ...delPaths]) {
    let d = p0;
    while (d && d !== '.' && d !== '/') { try { fs.rmdirSync(d); } catch { break; } d = path.posix.dirname(d); }
  }
  for (const s of touched.symlinks) {
    fs.rmSync(s.path, { force: true });
    fs.mkdirSync(path.dirname(s.path), { recursive: true });
    fs.symlinkSync(s.target, s.path);
    run('add', '--', s.path);
    touched.created.add(s.path);
  }
}

function writeTouched() {
  const all = new Set();
  for (const p of touched.deleted) all.add(p);
  for (const p of touched.cached) all.add(p);
  for (const m of touched.moved) { all.add(m.from); all.add(m.to); }
  for (const p of touched.edited) all.add(p);
  for (const p of touched.created) all.add(p);
  if (TOUCHED_OUT) fs.writeFileSync(TOUCHED_OUT, [...all].sort().join('\n') + '\n');
  say(`\ntouched paths: ${all.size}${TOUCHED_OUT ? ` (list: ${TOUCHED_OUT})` : ''}`);
}

// ---------------------------------------------------------------------------------------------- check mode
function liveFiles() { return [...files].filter(([p, e]) => !FROZEN(e.orig) && !FROZEN(p)); }
const allowedMention = (file, needle) => (plan.allowedMentions ?? []).some((a) => (a.file === file || (a.glob && new RegExp(a.glob).test(file))) && (!a.needle || needle.includes(a.needle) || a.needle === needle));

function check() {
  let bad = 0;
  const complain = (m) => { bad++; console.log(m); };
  const doneMoves = (plan.moves ?? []).filter((m) => !exists(m.from) && exists(m.to));
  const doneDeletes = (plan.deletes ?? []).filter((d) => !d.cached && !exists(d.path));
  const lf = liveFiles();
  console.log(`check: ${doneMoves.length} moves and ${doneDeletes.length} deletes are present in the tree`);
  // 1. stale literal mentions
  const needles = [...doneMoves.map((m) => ({ n: m.from, why: `moved to ${m.to}` })), ...doneDeletes.map((d) => ({ n: d.path, why: 'deleted' }))];
  for (const [p, e] of lf) {
    const t = readText(e); if (!t) continue;
    for (const { n, why } of needles) {
      if (!t.includes(n)) continue;
      const re = new RegExp(esc(n) + '(?![\\w-]|\\.\\w)', 'g');
      for (const m of t.matchAll(re)) {
        if (!okBefore(t, m.index) && !/^\.\.?\//.test(t.slice(Math.max(0, m.index - 3), m.index))) continue;
        if (allowedMention(p, n)) continue;
        const line = t.slice(0, m.index).split('\n').length;
        complain(`  stale path  ${p}:${line}  ${n}  (${why})`);
        break;
      }
    }
  }
  // 2. relative specs in moved files resolve
  const movedNow = new Set();
  for (const m of doneMoves) for (const f of expand(m.to)) movedNow.add(f);
  for (const f of movedNow) {
    const t = readText(files.get(f)); if (!t || !JSLIKE.test(f)) continue;
    const dir = path.posix.dirname(f);
    for (const m of t.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\(\s*|new URL\(\s*)(['"])(\.{1,2}\/[^'"\n]*|\.\.)\1/g)) {
      const lineStart = t.lastIndexOf('\n', m.index) + 1;
      if (/^\s*(\/\/|\*|#)/.test(t.slice(lineStart, m.index + 1))) continue; // a comment, not code
      const target = path.posix.normalize(path.posix.join(dir, m[2]));
      if ((plan.workflowGenerated ?? []).some((g) => new RegExp(g).test(target))) continue; // build output
      if (!(exists(target) || exists(target.replace(/\/$/, '')) || fs.existsSync(target))) complain(`  unresolved relative path in moved file ${f}: ${m[2]}`);
    }
  }
  // 3. workflow path literals exist
  for (const [p, e] of files) {
    if (!/^\.github\/workflows\/.*\.ya?ml$/.test(p)) continue;
    const t = readText(e);
    for (const m of t.matchAll(/(?:^|[\s'"=(])((?:scripts|infra|platforms|apps|packages|docs|tests)\/[A-Za-z0-9_.\-/]+)/gm)) {
      const q = m[1].replace(/[.,;:)]+$/, '');
      if (q.includes('*') || q.includes('$') || (plan.workflowGenerated ?? []).some((g) => new RegExp(g).test(q))) continue;
      if (!exists(q) && !fs.existsSync(q)) complain(`  workflow ${p} names a path that does not exist: ${q}`);
    }
  }
  // 4. segment-form detector: quoted first segment of a dir that no longer exists
  const topGone = new Set();
  for (const m of doneMoves) { const top = m.from.split('/')[0]; if (!exists(top) && !fs.existsSync(top)) topGone.add(top); }
  for (const [p, e] of lf) {
    const t = readText(e); if (!t || !(JSLIKE.test(p) || /\.(py|sh|yml|yaml)$/.test(p))) continue;
    for (const top of topGone) {
      const m = new RegExp(`(['"])${esc(top)}\\1`).exec(t);
      if (m && !allowedMention(p, top)) complain(`  segment form: ${p}:${t.slice(0, m.index).split('\n').length} quotes the vanished top-level '${top}'`);
    }
  }
  // 4b. bare directory mentions of a vanished top-level directory (`infra/**`, `rel.startsWith('infra/')`, "see infra/")
  for (const [p, e] of lf) {
    const t = readText(e); if (!t) continue;
    for (const top of topGone) {
      const re = new RegExp(`(?<![\\w./@-])${esc(top)}/(?![\\w])`, 'g');
      let m; let hit = false;
      while ((m = re.exec(t)) !== null) {
        if (allowedMention(p, top)) break;
        complain(`  directory mention: ${p}:${t.slice(0, m.index).split('\n').length} names the vanished directory ${top}/`);
        hit = true; break;
      }
      if (hit) break;
    }
  }
  // 5. dashboard folders.json orphans
  const fj = files.get('scripts/owner-dashboard/cc/folders.json');
  if (fj) for (const k of Object.keys(JSON.parse(readText(fj)))) { if (k && !exists(k) && !fs.existsSync(k) && !(plan.foldersOrphanOk ?? []).includes(k)) complain(`  folders.json key names a folder that does not exist: ${k}`); }
  console.log(bad ? `check FAILED: ${bad} problem(s)` : 'check ok');
  return bad;
}

// ---------------------------------------------------------------------------------------------- main
if (LIST) {
  for (const [ph, v] of Object.entries(plan.phases)) {
    console.log(`\n${ph}  ${v.title}${v.default ? '' : '  (OFF unless named)'}`);
    for (const d of (plan.deletes ?? []).filter((x) => x.phase === ph)) console.log(`  delete ${d.path}  -- ${d.why ?? ''}`);
    for (const m of (plan.moves ?? []).filter((x) => x.phase === ph)) console.log(`  move   ${m.from} -> ${m.to}`);
  }
  process.exit(0);
}
if (GEN_EVIDENCE) { genEvidence(); process.exit(0); }
if (CHECK) { process.exit(check() ? 1 : 0); }

say(`phases: ${[...PHASES].join(', ')}   mode: ${APPLY ? 'APPLY' : 'DRY RUN'}   HEAD ${git('rev-parse', '--short', 'HEAD').trim()}`);
const ev = filterEvidence();
say('\n== deletes');
if (ev) { // splice the re-verified evidence list in place of the raw one
  plan.deletes = (plan.deletes ?? []).concat(ev.map((n) => ({ path: `docs/evidence/${n}`, phase: plan.evidencePhase, why: 'evidence prune' })));
  plan.evidenceList = null; SKIP_RAW = true;
}
planDeletes();
say('\n== moves');
planMoves();
planSymlinks();
buildOrigMap();
rewriteAll();
fixtureDeclarations();
applyRefEdits();
summarise();
for (const w of warns) say(`WARN ${w}`);
if (errors.length) { console.error('\nSTOP: ' + errors.length + ' problem(s); nothing was written.'); for (const e of errors) console.error('  - ' + e); process.exit(1); }
if (APPLY) { flush(); writeTouched(); say('\napplied. Next: node scripts/reorg-repo.mjs --check ; then run the suites ; then git add the touched paths and commit.'); }
else { say('\n(dry run: nothing written. Pass --apply to write.)'); }
