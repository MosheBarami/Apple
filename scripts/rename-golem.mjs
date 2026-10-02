#!/usr/bin/env node
// Rename "golem" to "apple" across the repository — re-runnable, idempotent, and honest about
// what it did not touch.
//
// OWNER DECISION 2026-10-02: the product is Apple and the old name is wiped out of every aspect.
// Renaming a binding, a storage key or a wire literal naively breaks live sessions, stored rows
// and the PUBLISHED Studio plugin (Creator Store asset 107230158271368), so this program is split
// by what is safe to change and when:
//
//   --phase A      the repository: package scope, identifiers, file names, env-var NAMES (read new,
//                  fall back to old), prose, docs. Wire literals, cloud-bound names and the
//                  deliberate compatibility shims are PROTECTED and left alone. No behaviour change.
//   --phase B2     CLIENTS start sending the new wire literals (X-Apple-*, apple.v1, apple.jwt.,
//                  apple.studio-ops.v1, apple-ui, ...). REFUSES to run unless the live /api/health
//                  reports the build that accepts both spellings (B1). `--force` overrides.
//                  B1 itself (the worker accepting both) is hand-written code with tests, not a
//                  rewrite; this program only helps there by listing what is left.
//   --phase C-repo the cloud-bound names in the repo (wrangler configs, resource names). Run ONLY
//                  after the owner approved the cloud steps in docs/operations/GOLEM-REMOVAL-RUNBOOK.md.
//   --phase D      lists the compatibility shims that are due for removal. Edits nothing.
//
//   --dry-run      write nothing; print per-rule counts and a per-file summary
//   --only a,b     run only these rule classes (paths, scope, env, text, docs)
//   --strict       exit 1 if any hit is neither rewritten nor listed in scripts/golem-allowlist.json
//   --local        also handle the UNTRACKED local surfaces: memory files and `.claude/` contents, and
//                  the NAMES of variables in .env (values are copied byte-for-byte, never printed).
//                  Run only by the owner's explicit invocation.
//   --link-workspace   create node_modules links for the (renamed) workspace packages inside a
//                  git worktree, without pnpm install. Not committed; reported.
//   --root DIR     operate on another tree (tests, scratch copies)
//
// IDEMPOTENT: a second run finds nothing to change and says so. Every rewrite is a pure function
// of the file text, and a path rename whose target exists is skipped and reported.
//
// EVERYTHING IT DOES NOT TOUCH IS NAMED: the skip list below is the only place files are exempt,
// and the CI guard (scripts/check-no-golem.mjs) counts whatever is left.
import { execFileSync } from 'node:child_process';
import {
  existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, statSync,
  symlinkSync, writeFileSync, rmSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/* ------------------------------------------------------------------- args --- */
const argv = process.argv.slice(2);
const opt = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
const flag = (n) => argv.includes(n);
const KNOWN = ['--phase', '--dry-run', '--only', '--strict', '--local', '--link-workspace', '--root', '--force', '--memory-dir', '--health-url', '--main-checkout', '--words'];
for (const a of argv) if (a.startsWith('--') && !KNOWN.includes(a)) { console.error(`rename-golem: unrecognised flag ${a}`); process.exit(2); }
const PHASE = opt('--phase');
const DRY = flag('--dry-run');
const ROOT = resolve(opt('--root') ?? join(HERE, '..'));
const ONLY = opt('--only') ? new Set(opt('--only').split(',')) : null;
const on = (cls) => !ONLY || ONLY.has(cls);
if (!PHASE && !flag('--link-workspace')) {
  console.error('rename-golem: --phase A|B2|C-repo|D is required (see the header of this file)');
  process.exit(2);
}
if (PHASE && !['A', 'B2', 'C-repo', 'D'].includes(PHASE)) { console.error(`rename-golem: unknown phase ${PHASE}`); process.exit(2); }

/* ------------------------------------------------------------------ swaps --- */
/** Longest first. Case-preserving: the product's spellings map one to one. */
export function swap(s) {
  return s
    .replace(/@golem(\\?\/)/g, '@apple$1')
    // "a Golem fixture" is "an Apple fixture": the article follows the new word
    .replace(/\b([Aa]) (?=[Gg]olem)/g, (_m, a) => `${a}n `)
    .replace(/GOLEM/g, 'APPLE')
    .replace(/Golem/g, 'Apple')
    .replace(/golem/g, 'apple')
    .replace(/Gollem/g, 'Apple')
    .replace(/gollem/g, 'apple');
}

/**
 * A lowercase `golem` standing alone is not the brand (the brand is spelled `Golem`): it is the
 * name of the OTHER WORKER, the one the product used to run on, next to `apple` ("golem and apple
 * share the database", `{ apple, golem }`, `TOKENS.golem`). Swapping it to `apple` would make
 * duplicates and say the wrong thing; it becomes `legacy`. Compounds (golem-corpus, golem_session,
 * golem.v1, @golem/...) are handled by the protected lists, not here.
 */
const LEGACY_WORKER = /(?<![\w@/-])golem(?![\w-])(?!\.(?:test|example|internal|glb|com|dev|app)\b)/g;

/**
 * PROTECTED: matches that survive a phase untouched, with the phase that releases them.
 * A protected match is allowlisted by scripts/golem-allowlist.json and counted by the guard.
 */
const WIRE = [ // released by B2: clients send the new literal once the worker accepts both
  /golem\.v1/g, /golem\.jwt\./g, /(?<![A-Za-z0-9])[Xx]-[Gg]olem-[A-Za-z0-9-]*/g,
  /golem\.studio-ops\.v1/g,   /golem_original/g, /golem-ui/g, /GolemBaseVolume/g,
  /golem_session/g,
];
const HELD = [ // the palette folder's name is inside the benchmark's world file; changed only after the live benchmark ends
  /GolemPalette/g,
];
const CLOUD = [ // released by C-repo: they name live resources until the owner-approved cloud steps run
  /golem\.moshe-barami111\.workers\.dev/g, /golem-corpus(?!-intake)/g, /golem-docs/g, /golem-kv/g,
  /golem-assets/g, /golem-gw/g, /MosheBarami\/golem/g,
  // the worker's own name as a quoted value: BILLING_WORKER_NAME, script_name, the outbox consumer row
  /'golem'/g, /"golem"/g, /`golem`/g,
];
const STORED_FORMATS = [ // formats users already hold on disk (memory exports): readable for as long as such files exist
  /golem\.memory\.v1/g,
];
const TOOL_NAMES = [ // the guard, its allowlist, the codemod and the runbook are named by file name wherever they are referenced
  /check-no-golem/g, /golem-allowlist/g, /rename-golem/g, /no-golem-guard/g, /GOLEM-REMOVAL-RUNBOOK/g,
];
const THIRD_PARTY = [ // other people's names; never touched
  /IrritatingGolem/g, /ClockGolem/g, /fire-golem/g, /bloxlibs\/Golem/g,
];
const HASH_DOMAINS = [ // D2: stored content hashes are salted with these; re-hashing is a Phase D decision
  /golem\/intake\/(?:node|leaf|file|empty)\/v1/g,
];

/** Files this program never edits. The ONLY place a file is exempt. */
const SKIP = [
  /^docs\/evidence\//,                                    // recorded runs: rewriting output falsifies it
  /^infra\/supabase\/migrations\/00(0[1-9]|1[0-3])_/,     // applied, checksummed, never edited
  /^pnpm-lock\.yaml$/,                                    // handled by its own textual rule
  /^scripts\/(check-no-golem\.mjs|golem-allowlist\.json|rename-golem\.mjs|check-rebrand\.mjs|rebrand-literals\.mjs)$/,
  /^tests\/(no-golem-guard|rename-golem|rebrand-enforced|probe-s1)\.test\.mjs$/,
  // the detectors: programs whose whole job is to look for the old name in a deployed bundle or a built plugin
  /^scripts\/(probe-s1\.mjs|inspect-plugin-build\.py)$/,
  // the shared helpers that SAY the old name on purpose (also listed in the allowlist with codemod: skip)
  /^scripts\/lib\/(env-compat|legacy-name)\.mjs$/,
  /^packages\/shared\/src\/legacy-wire\.ts$/,
  /^apps\/worker\/wrangler(\.[a-z]+)?\.jsonc$/,           // cloud-bound until C-repo
  /^docs\/operations\/GOLEM-REMOVAL-RUNBOOK\.md$/,
  /^packages\/training\/(runs|discovery)\//,              // recorded runs and third-party sweeps
  /^packages\/evals\/results\//,                          // recorded model outputs
  /^packages\/asset-library\/(?!package\.json$).*\.(jsonl|json)$/, // third-party creator names, hashes (the package manifest is ours)
];

/** Files the compatibility work wrote by hand: they say the old name ON PURPOSE. Listed in the allowlist. */
function shimSkips() {
  const f = join(ROOT, 'scripts/golem-allowlist.json');
  if (!existsSync(f)) return [];
  try {
    const j = JSON.parse(readFileSync(f, 'utf8'));
    return (j.entries ?? []).filter((e) => e.codemod === 'skip').flatMap((e) => e.paths ?? []);
  } catch { return []; }
}
function globRe(g) {
  let out = '^';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { out += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (c === '*') out += '[^/]*';
    else out += c.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp(out + '$');
}

/**
 * Prose that is ABOUT the rename. "formerly Golem" must not become "formerly Apple". The
 * lines are left as written and the guard allowlists them by exact count.
 */
const HISTORY_LINE = /formerly|former(?:ly)? name|\brenam(?:e|ed|ing)\b|re-?brand|old (?:product )?name|previous name|was (?:called|named)|golem ?(?:→|->|to) ?apple|golem→apple|from golem|legacy golem|old golem|\bex-golem\b|withdrawn (?:product )?name|(?:product|brand)'?s? old name|asset 132128477945417|Herobrine583522|132128477945417|\bgolem (?:labs|era)\b/i;

/**
 * Per-file rewrites for PAIRED contexts where the generic rules would be wrong. Applied BEFORE
 * protection and the swap; each is [pattern, replacement]. The era keys of the owner dashboard's
 * design-history page are an internal vocabulary ('golem' era vs 'apple' era); they become 'legacy'.
 */
const OVERRIDES = new Map([
  ['scripts/owner-dashboard/control/skins/repo-kit.css', [[/--golem\b/g, '--legacy'], [/\.golem\b/g, '.legacy']]],
  ['scripts/owner-dashboard/control/pages/design-history.js', [[/(['"`])golem\1/g, '$1legacy$1'], [/\.golem\b/g, '.legacy'], [/\bgolem(?=:)/g, 'legacy']]],
  ['scripts/owner-dashboard/cc/platforms/design-history.mjs', [[/(['"`])golem\1/g, '$1legacy$1'], [/\bgolem(?=:)/g, 'legacy']]],
  ['scripts/owner-dashboard/cc/repo-pages.test.mjs', [[/\.golem\b/g, '.legacy']]],
]);

/** Classify one path. */
function isSkipped(rel, extraSkips) {
  return SKIP.some((re) => re.test(rel)) || extraSkips.some((re) => re.test(rel));
}

/* ------------------------------------------------------------- file lists --- */
function listTracked() {
  const git = () => execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  try { return git().toString('utf8').split('\0').filter(Boolean); } catch { return walk(ROOT, ''); }
}
function walk(dir, base) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.wrangler'].includes(e.name)) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...walk(join(dir, e.name), rel)); else if (e.isFile()) out.push(rel);
  }
  return out;
}
const isGit = (() => { try { execFileSync('git', ['rev-parse', '--git-dir'], { cwd: ROOT, stdio: 'pipe' }); return true; } catch { return false; } })();
function isBinary(buf) { const n = Math.min(buf.length, 8000); for (let i = 0; i < n; i++) if (buf[i] === 0) return true; return false; }

/* -------------------------------------------------------------- the rules --- */
const report = { rules: new Map(), files: new Map(), legacyWorker: new Map(), needsHuman: [], skippedBinary: [], pathRenames: [], pathSkips: [] };
const bump = (rule, rel, n = 1) => {
  report.rules.set(rule, (report.rules.get(rule) ?? 0) + n);
  report.files.set(rel, (report.files.get(rel) ?? 0) + n);
};

/** Replace protected matches with sentinels, run `fn`, restore. */
function withProtected(text, patterns, fn) {
  const kept = [];
  const re = new RegExp(patterns.map((p) => p.source).join('|'), 'g');
  const masked = text.replace(re, (m) => { kept.push(m); return `${kept.length - 1}`; });
  return fn(masked).replace(/(\d+)/g, (_, i) => kept[Number(i)]);
}

/** Relative import specifier for a helper, from a file. */
function relImport(fromRel, toRel) {
  let r = relative(dirname(fromRel), toRel).split(sep).join('/');
  if (!r.startsWith('.')) r = `./${r}`;
  return r;
}

const ENV_HELPER = 'scripts/lib/env-compat.mjs';
const isEsmJs = (rel) => /\.(mjs|js)$/.test(rel) && !/\/control\/pages\//.test(rel);

/** Insert `import { envCompat } from ...` after the last top-level import (or the leading comments). */
function ensureEnvImport(rel, text) {
  if (!/\benvCompat\(/.test(text) || /import\s*\{[^}]*\benvCompat\b/.test(text)) return text;
  const spec = relImport(rel, ENV_HELPER);
  const line = `import { envCompat } from '${spec}';\n`;
  const lines = text.split('\n');
  let last = -1; let inImport = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (inImport) { if (/from\s+['"][^'"]+['"];?\s*$/.test(l)) { last = i; inImport = false; } continue; }
    if (/^import\s.*from\s+['"][^'"]+['"];?\s*$/.test(l) || /^import\s+['"][^'"]+['"];?\s*$/.test(l)) last = i;
    else if (/^import\s*\{?[^;]*$/.test(l) && !/from/.test(l) && /^import\s/.test(l)) inImport = true;
  }
  if (last >= 0) { lines.splice(last + 1, 0, line.trimEnd()); return lines.join('\n'); }
  // no imports: after the shebang and the leading comment block
  let i = 0;
  if (lines[0]?.startsWith('#!')) i = 1;
  while (i < lines.length && (/^\s*(\/\/|\*|\/\*)/.test(lines[i]) || lines[i].trim() === '')) i++;
  lines.splice(i, 0, line.trimEnd());
  return lines.join('\n');
}

/** env-var reads: process.env.GOLEM_X -> envCompat('APPLE_X'). Writes and deletes are plain renames. */
function envRule(rel, text) {
  if (!isEsmJs(rel)) return text;
  let n = 0;
  let out = text.replace(/(?<!delete\s)\bprocess\.env\.GOLEM_([A-Z0-9_]+)\b(?!\s*=(?!=))/g, (_m, name) => { n++; return `envCompat('APPLE_${name}')`; });
  out = out.replace(/(?<![.\w])env\.GOLEM_([A-Z0-9_]+)\b(?!\s*=(?!=))/g, (_m, name) => { n++; return `envCompat('APPLE_${name}', env)`; });
  if (n) { bump('env: reads go through envCompat (new name, then old)', rel, n); out = ensureEnvImport(rel, out); }
  return out;
}

/**
 * Files where the lowercase word IS the legacy deployment's identity, used as a map key, a
 * namespace name, a consumer row and an assertion about a wrangler config that still says it. The
 * `legacy` rename would split one identity into two spellings and break the fixture, so the word is
 * kept as it is until the cloud steps (C1 removes the replica code, C3 the outbox consumer) delete
 * the thing it names. Counted by the guard; removed with the code.
 */
const IDENTITY_FILES = new Set([
  'apps/worker/tests/billing-webhook-authority.test.mjs',
  'apps/worker/tests/billing-wiring-report.test.mjs',
  'apps/worker/tests/membership-access-outbox.test.mjs',
  'apps/worker/tests/membership-access-outbox-migration.test.mjs',
  'infra/supabase/tests/membership-access-outbox.mjs',
  'infra/deploy-worker.mjs',
]);
/** In docs, a lowercase `golem` is the old worker only on a line that talks about infrastructure. */
const INFRA_LINE = /worker|deploy|QuotaDO|wrangler|Durable|namespace|replica|billing|D1|KV|Vectorize|host|legacy|database|Supabase|Stripe/i;

const WIRE_ALL = new RegExp(WIRE.map((r) => r.source).join('|'), 'g');

/** A regex literal naming the old name: an absence check or a detector, not a rename target. */
const REGEX_WITH_OLD = /(?:^|[(,=:!&|?{\[;])\s*\/(?![/*])(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\])*gol+em(?:\\.|\[(?:\\.|[^\]\n])*\]|[^/\n\\])*\/[dgimsuyv]*/i;

/** The text rewrite for one file. */
function rewrite(rel, text) {
  let out = text;
  const docs = /(^docs\/|\.md$)/.test(rel);
  const code = !docs && /\.(mjs|js|ts|tsx|cjs)$/.test(rel);
  // what survives this phase untouched
  const patterns = [...THIRD_PARTY, ...HASH_DOMAINS, ...STORED_FORMATS, ...TOOL_NAMES];
  if (PHASE !== 'C-repo') patterns.push(...CLOUD, ...HELD);
  if (PHASE === 'A') patterns.push(...WIRE);
  if (IDENTITY_FILES.has(rel) && PHASE !== 'C-repo') patterns.push(/\bgolem\b/g);

  if (PHASE === 'A' && on('env')) out = envRule(rel, out);

  const full = on(docs ? 'docs' : 'text');
  if (full) for (const [re, to] of OVERRIDES.get(rel) ?? []) out = out.replace(re, to);
  // the package scope is a rename everywhere, including on lines that are about the rename
  if (full || on('scope')) {
    out = out.replace(/@golem(\\?\/)/g, '@apple$1');
    if (rel === 'package.json') out = out.replace(/("name": ")golem(")/, '$1apple$2'); // the root package
  }
  if (!full) return out;

  const wireNow = (line) => (PHASE === 'B2' || PHASE === 'C-repo' ? line.replace(WIRE_ALL, (m) => swap(m)) : line);
  const pass = (line0) => { const line = wireNow(line0); return withProtected(line, patterns, (s) => swap(s.replace(LEGACY_WORKER, () => {
    // prose about the product's persona is the brand; a line that talks about infrastructure, or that already
    // names `apple` beside it, is about the OTHER worker
    if (docs && !INFRA_LINE.test(line) && !/apple/i.test(line)) return 'apple';
    report.legacyWorker.set(rel, (report.legacyWorker.get(rel) ?? 0) + 1);
    return 'legacy';
  }))); };
  return out.split('\n').map((line) => {
    if (!/gol+em/i.test(line)) return line;
    if (HISTORY_LINE.test(line)) return line;                                   // prose ABOUT the rename stays as written
    if (code && REGEX_WITH_OLD.test(wireNow(line))) { report.needsHuman.push(rel); return line; }   // a PATTERN naming the old name: a human decides what it should match now
    return pass(line);
  }).join('\n');
}

/* ----------------------------------------------------------- B2 refusal --- */
async function requireB1Live() {
  if (flag('--force')) { console.error('rename-golem: --force given, skipping the live B1 check'); return; }
  const url = opt('--health-url') ?? 'https://apple.moshe-barami111.workers.dev/api/health';
  let body;
  try { const r = await fetch(url, { signal: AbortSignal.timeout(15000) }); body = await r.json(); }
  catch (e) { console.error(`rename-golem: cannot read ${url} (${e.message}); B2 needs proof that B1 is live. Not guessing.`); process.exit(3); }
  if (!body?.compat || !String(body.compat).includes('wire-both')) {
    console.error(`rename-golem: ${url} does not report compat "wire-both" — the deployed worker does not yet accept the new literals. Refusing B2 (a client sending them now would be rejected). --force overrides.`);
    process.exit(3);
  }
}

/* ------------------------------------------------------------- main run --- */
async function main() {
  if (flag('--link-workspace')) linkWorkspace();
  if (!PHASE) return;
  if (PHASE === 'B2' && !DRY) await requireB1Live();
  if (PHASE === 'D') return listShims();

  const extraSkips = shimSkips().map(globRe);
  const tracked = listTracked();
  const changed = [];
  const final = new Map(); // rel -> text after this run, so leftovers are measured on what WOULD be written

  // 1. paths
  if (PHASE === 'A' && on('paths')) {
    for (const rel of tracked) {
      if (!/gol+em/i.test(rel) || isSkipped(rel, extraSkips)) { if (/gol+em/i.test(rel)) report.pathSkips.push(rel); continue; }
      const to = swap(rel);
      if (existsSync(join(ROOT, to))) { report.pathSkips.push(`${rel} (target exists)`); continue; }
      report.pathRenames.push([rel, to]);
      if (!DRY) {
        mkdirSync(dirname(join(ROOT, to)), { recursive: true });
        if (isGit) execFileSync('git', ['mv', rel, to], { cwd: ROOT, stdio: 'pipe' }); else renameSync(join(ROOT, rel), join(ROOT, to));
      }
      bump('paths: git mv', to);
    }
  }
  // list again after renames so text rules see the new names
  const files = (PHASE === 'A' && on('paths') && !DRY) ? listTracked() : tracked.map((p) => {
    const hit = report.pathRenames.find(([a]) => a === p); return hit ? hit[1] : p;
  });

  // 2. text
  for (const rel of files) {
    if (isSkipped(rel, extraSkips)) continue;
    // in a dry run a renamed file still lives under its old name on disk
    const old = report.pathRenames.find(([, b]) => b === rel)?.[0] ?? rel;
    const abs = join(ROOT, DRY ? old : rel);
    let buf;
    try { if (!statSync(abs).isFile()) continue; buf = readFileSync(abs); } catch { continue; }
    if (isBinary(buf)) { if (/gol+em/i.test(buf.toString('latin1'))) report.skippedBinary.push(rel); continue; }
    const text = buf.toString('utf8');
    if (!/gol+em/i.test(text)) continue;
    const next = rewrite(rel, text);
    if (next === text) continue;
    bump('text: token swap', rel, [...text.matchAll(/gol+em/gi)].length - [...next.matchAll(/gol+em/gi)].length);
    changed.push(rel);
    final.set(rel, next);
    if (!DRY) writeFileSync(abs, next);
  }

  // 3. lockfile
  if (PHASE === 'A' && on('scope')) {
    const lock = join(ROOT, 'pnpm-lock.yaml');
    if (existsSync(lock)) {
      const t = readFileSync(lock, 'utf8');
      const n = t.replace(/@golem\//g, '@apple/');
      if (n !== t) { bump('lockfile: @golem/ -> @apple/', 'pnpm-lock.yaml', (t.match(/@golem\//g) ?? []).length); if (!DRY) writeFileSync(lock, n); }
    }
  }

  // 4. what is left, honestly — measured on the text this run produced, also in a dry run
  const left = []; const words = new Map();
  for (const rel0 of listTracked()) {
    const rel = report.pathRenames.find(([a]) => a === rel0)?.[1] ?? rel0;
    if (isSkipped(rel, extraSkips)) continue;
    let text = final.get(rel);
    if (text === undefined) {
      const p = join(ROOT, DRY ? rel0 : rel);
      let buf; try { if (!statSync(p).isFile()) continue; buf = readFileSync(p); } catch { continue; }
      if (isBinary(buf)) continue;
      text = buf.toString('utf8');
    }
    const hits = [...text.matchAll(/[A-Za-z0-9_@./:-]*gol+em[A-Za-z0-9_.@/:-]*/gi)].map((m) => m[0].replace(/^[.:/-]+|[.:/-]+$/g, ''));
    if (hits.length) { left.push([rel, hits.length]); for (const w of hits) words.set(w, (words.get(w) ?? 0) + 1); }
  }

  if (flag('--local')) await localSurfaces();

  // output
  const mode = DRY ? 'DRY RUN — nothing written' : 'applied';
  console.log(`rename-golem phase ${PHASE} (${mode})${ONLY ? ` only=${[...ONLY].join(',')}` : ''}`);
  for (const [rule, n] of report.rules) console.log(`  ${String(n).padStart(6)}  ${rule}`);
  console.log(`  files changed: ${changed.length}   paths renamed: ${report.pathRenames.length}   binary files carrying the word (left): ${report.skippedBinary.length}`);
  if (report.pathSkips.length) console.log(`  path rename skipped: ${report.pathSkips.join(', ')}`);
  if (flag('--words') && report.legacyWorker.size) console.log(`  lowercase worker name became \`legacy\` in: ${[...report.legacyWorker].map(([f, n]) => `${f} (${n})`).join(', ')}`);
  if (report.needsHuman.length) console.log(`  NEEDS HUMAN (a pattern that names the old name, left as written): ${[...new Set(report.needsHuman)].join(', ')}`);
  if (DRY && report.files.size) {
    const top = [...report.files].sort((a, b) => b[1] - a[1]).slice(0, 15);
    console.log('  largest rewrites:'); for (const [f, n] of top) console.log(`    ${String(n).padStart(5)}  ${f}`);
  }
  if (changed.length === 0 && report.pathRenames.length === 0 && !report.rules.size) console.log('  nothing to change: this run is a no-op (idempotent)');
  const leftTotal = left.reduce((a, [, n]) => a + n, 0);
  console.log(`  remaining after this phase (protected or needs-human, outside the skip list): ${leftTotal} hit(s) in ${left.length} file(s)`);
  if (flag('--words')) { console.log('  remaining words:'); for (const [w, n] of [...words].sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(`    ${String(n).padStart(5)}  ${w}`); }
  if (flag('--words')) { console.log('  remaining files:'); for (const [f, n] of left.sort((a, b) => b[1] - a[1]).slice(0, 80)) console.log(`    ${String(n).padStart(5)}  ${f}`); }
  if (flag('--strict') && leftTotal) {
    const sg = execAllowlistCheck();
    if (sg !== 0) { console.error('rename-golem: --strict: the guard still reports violations'); process.exit(1); }
  }
}

function execAllowlistCheck() {
  try { execFileSync('node', [join(HERE, 'check-no-golem.mjs'), '--root', ROOT, '--count'], { stdio: 'pipe' }); return 0; } catch { return 1; }
}

function listShims() {
  const f = join(ROOT, 'scripts/golem-allowlist.json');
  const j = JSON.parse(readFileSync(f, 'utf8'));
  console.log('Phase D — compatibility shims due for removal (each is an allowlist entry whose removal phase is D):');
  for (const e of j.entries ?? []) if (/phase d|^d\b/i.test(e.removal ?? '')) console.log(`  ${e.id ?? e.token}  ${e.paths.join(', ')}  — ${e.removal}`);
}

/* ---------------------------------------------------------- local surfaces --- */
async function localSurfaces() {
  const dirs = opt('--memory-dir') ? [opt('--memory-dir')] : [
    join(homedir(), '.claude/projects/-Users-moshe-Desktop-RbxAI/memory'),
    join(homedir(), '.claude/projects/-Users-moshe-Developer-RbxAI/memory'),
  ];
  let renamed = 0; let rewritten = 0;
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (!statSync(p).isFile()) continue;
      let target = p;
      if (/gol+em/i.test(f)) {
        target = join(d, swap(f));
        if (existsSync(target)) { console.log(`  local: ${f} -> ${basename(target)} skipped, target exists`); target = p; }
        else { renamed++; if (!DRY) renameSync(p, target); }
      }
      const readFrom = DRY ? p : target;
      let t; try { t = readFileSync(readFrom, 'utf8'); } catch { continue; }
      if (!/gol+em/i.test(t)) continue;
      const n = f === 'MEMORY.md' ? swap(t) : swap(t);
      if (n !== t) { rewritten++; if (!DRY) writeFileSync(target, n); }
    }
  }
  // .env*: variable NAMES only
  let envRenamed = 0;
  for (const f of readdirSync(ROOT)) {
    if (!/^\.env(\.|$)/.test(f)) continue;
    const p = join(ROOT, f);
    if (!statSync(p).isFile()) continue;
    const lines = readFileSync(p, 'utf8').split('\n');
    const have = new Set(lines.map((l) => /^\s*(?:export\s+)?([A-Za-z0-9_]+)\s*=/.exec(l)?.[1]).filter(Boolean));
    const out = [];
    for (const l of lines) {
      out.push(l);
      const m = /^(\s*(?:export\s+)?)(GOLEM_[A-Za-z0-9_]+)(\s*=.*)$/.exec(l);
      if (m && !have.has(swap(m[2]))) { out.push(`${m[1]}${swap(m[2])}${m[3]}`); envRenamed++; }
    }
    if (!DRY && envRenamed) writeFileSync(p, out.join('\n'));
  }
  console.log(`  local: ${renamed} memory file(s) renamed, ${rewritten} rewritten; ${envRenamed} .env name(s) added alongside the old (old kept until the secrets are switched)`);
}

/* --------------------------------------------------------- link workspace --- */
function linkWorkspace() {
  const MAIN = resolve(opt('--main-checkout') ?? '/Users/moshe/Developer/RbxAI');
  const roots = ['apps', 'packages', 'apps/benchmark', 'apps/experiences'];
  const dirs = [];
  for (const base of roots) {
    if (!existsSync(join(ROOT, base))) continue;
    for (const e of readdirSync(join(ROOT, base), { withFileTypes: true })) {
      const d = `${base}/${e.name}`;
      if (e.isDirectory() && existsSync(join(ROOT, d, 'package.json'))) dirs.push(d);
    }
  }
  const nameToDir = {};
  for (const d of dirs) nameToDir[JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8')).name] = d;
  const exists = (p) => { try { lstatSync(p); return true; } catch { return false; } };
  const rootNm = join(ROOT, 'node_modules');
  if (!exists(rootNm)) symlinkSync(join(MAIN, 'node_modules'), rootNm);
  let linked = 0;
  for (const d of dirs) {
    const pj = JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8'));
    const ws = Object.keys({ ...pj.dependencies, ...pj.devDependencies }).filter((n) => nameToDir[n]);
    const mainNm = join(MAIN, d, 'node_modules');
    if (!existsSync(mainNm) && !ws.length) continue;
    const nm = join(ROOT, d, 'node_modules');
    mkdirSync(nm, { recursive: true });
    if (existsSync(mainNm)) for (const e of readdirSync(mainNm)) {
      // the old scope dirs are replaced by links named for the CURRENT package names
      if (e === 'node_modules' || e === '@golem' || e === '@apple') continue;
      const dst = join(nm, e);
      if (!exists(dst)) symlinkSync(realpathSync(join(mainNm, e)), dst);
    }
    for (const n of ws) {
      const dst = join(nm, n);
      mkdirSync(dirname(dst), { recursive: true });
      if (exists(dst)) rmSync(dst, { recursive: true });
      symlinkSync(join(ROOT, nameToDir[n]), dst);
      linked++;
    }
  }
  console.log(`rename-golem: linked ${linked} workspace package link(s) in ${ROOT} (temporary, untracked; the orchestrator runs pnpm install once after merge)`);
}

await main();
