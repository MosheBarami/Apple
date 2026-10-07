// Master plan §4.3 category 14 (code modules): one library item per Luau module of a cloned, licensed repo from the
// ledger, with provenance (L3), the licence from the repo's own LICENSE file (L2), the human-made check (L1) and the
// L4 static scan. A module is what the repo ships: the Rojo project's $path (default.project.json), split into its
// children for collection repos (the ledger counts more than one module). Tests, specs and examples are left out.
//
//   node packages/library/src/ingest-code.mjs --ledger planning/library/ledger/code-luau.jsonl \
//     --dir private/library-src/code --out planning/library/items/code-luau.jsonl
//
// A flagged module is kept with `scan.flags` and `audit: 'required'`: it does not reach a user's place until a reviewer
// clears it (master plan: no unaudited third-party scripts in a user's place).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, basename, relative } from 'node:path';
import { classifyLicence, ALLOWED } from './licence.mjs';
import { aiCheck } from './aicheck.mjs';
import { validateItem } from './item.mjs';

/** L4: what a module must not do unreviewed. Each hit is a flag, not a rejection; flagged code needs an audit. */
export const SCAN = [
  ['require-id', /\brequire\s*\(\s*\d{4,}\s*\)/],
  ['dynamic-code', /\b(getfenv|setfenv|loadstring)\s*\(/],
  ['http', /\bHttpService\b/],
  ['marketplace', /\bMarketplaceService\b/],
  ['teleport', /\bTeleportService\b/],
  ['insert', /\bInsertService\b/],
];
const SKIP = /(^|[\\/])(tests?|spec|specs|examples?|benchmarks?|\.github|node_modules|Packages|DevPackages|TestEZ)([\\/]|$)|\.(spec|test|story)\.(lua|luau)$/i;

/** { flags, obfuscated } for a module's source. Pure. */
export function scanSource(src) {
  const flags = SCAN.filter(([, re]) => re.test(src)).map(([n]) => n);
  // Obfuscation: very long lines, or a large share of escaped bytes.
  const longest = Math.max(0, ...src.split('\n').map((l) => l.length));
  const escapes = (src.match(/\\x[0-9a-f]{2}|\\\d{2,3}/gi) ?? []).length;
  const obfuscated = longest > 2000 || escapes > 200;
  return { flags: obfuscated ? [...flags, 'obfuscation'] : flags, longest_line: longest };
}

function luaFiles(path, out = []) {
  if (!existsSync(path)) return out;
  const st = statSync(path);
  if (st.isFile()) { if (/\.(lua|luau)$/i.test(path) && !SKIP.test(path)) out.push(path); return out; }
  for (const e of readdirSync(path)) { const p = join(path, e); if (!SKIP.test(p)) luaFiles(p, out); }
  return out;
}

/** The module roots of a repo: the Rojo $path, split into children when the ledger counts several modules. */
export function moduleRoots(repoDir, expected = 1) {
  let root;
  try { root = JSON.parse(readFileSync(join(repoDir, 'default.project.json'), 'utf8')).tree?.$path; } catch {}
  // The Rojo path only counts when it holds Luau (some point at a folder the repo does not ship).
  if (typeof root !== 'string' || !luaFiles(join(repoDir, root)).length) root = ['src', 'lib', 'modules', 'packages'].find((d) => luaFiles(join(repoDir, d)).length);
  // Older repos: a top-level folder with an init module.
  if (!root) root = readdirSync(repoDir).find((d) => !SKIP.test(d) && !d.startsWith('.') && statSync(join(repoDir, d)).isDirectory() && ['init.lua', 'init.luau'].some((f) => existsSync(join(repoDir, d, f))));
  if (!root) {
    const files = readdirSync(repoDir).filter((f) => /\.(lua|luau)$/i.test(f) && !SKIP.test(f));
    return files.length ? files.map((f) => join(repoDir, f)) : [];
  }
  const rootPath = join(repoDir, root);
  if (expected > 1 && existsSync(rootPath) && statSync(rootPath).isDirectory()) {
    const kids = readdirSync(rootPath).map((k) => join(rootPath, k)).filter((p) => !SKIP.test(p) && luaFiles(p).length);
    if (kids.length >= Math.ceil(expected / 2)) return kids;
  }
  return [rootPath];
}

const createdFrom = (evidence) => (String(evidence ?? '').match(/created (\d{4}-\d{2}-\d{2})/) ?? [])[1];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** The items of one cloned repo. Pure apart from reading files. */
export function repoItems(row, repoDir, fetchedAt) {
  const [owner, repo] = row.url.replace(/^https:\/\/github\.com\//, '').split('/');
  const licFile = readdirSync(repoDir).find((f) => /^licen[cs]e(\.(md|txt))?$/i.test(f));
  const licText = licFile ? readFileSync(join(repoDir, licFile), 'utf8') : '';
  const head = licText.replace(/\s+/g, ' ').slice(0, 300);
  const fromFile = classifyLicence(/permission is hereby granted, free of charge/i.test(licText) ? `MIT License ${head}` : head);
  const fromLedger = classifyLicence(row.licence_words.includes('[MIT]') ? 'MIT License' : row.licence_words);
  if (!fromFile.ok) return { skipped: `licence file: ${fromFile.reason}` };
  if (fromLedger.ok && fromLedger.class !== fromFile.class) return { skipped: `licence file says ${fromFile.class}, ledger says ${fromLedger.class}` };
  const copyright = (licText.match(/copyright[^\n]*/i) ?? [])[0]?.trim();
  const known = new Set([owner.toLowerCase()]); // the ledger names a human author for every row (human_made_evidence)
  const items = [], rejected = [];
  for (const root of moduleRoots(repoDir, Number(row.item_count) || 1)) {
    const files = luaFiles(root).sort();
    if (!files.length) continue;
    const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
    const name = basename(root).replace(/\.(lua|luau)$/i, '').replace(/^init$/i, repo);
    const scan = scanSource(src);
    const title = `${name} (${owner}/${repo})`;
    const item = {
      id: `code:${slug(owner)}-${slug(repo)}:${slug(name)}`,
      title,
      kind: 'code',
      family: `code:${slug(owner)}-${slug(repo)}`,
      source_url: row.url,
      author: owner,
      licence_words: `${ALLOWED[fromFile.class].name}${fromFile.class === 'mit' ? ' License' : ''}: ${head.slice(0, 160)}`,
      licence_class: fromFile.class,
      licence_url: row.licence_url,
      attribution: copyright ? `${copyright} (${fromFile.class.toUpperCase()}, ${row.url})` : `${owner}/${repo} (${fromFile.class.toUpperCase()}, ${row.url})`,
      fetched_at: fetchedAt,
      uploader: 'none',
      file: relative(dirname(repoDir), root),
      files: files.length,
      lines: src.split('\n').length,
      file_sha256: createHash('sha256').update(src).digest('hex'),
      categories: [14],
      tags: [...new Set(name.split(/[^A-Za-z0-9]+|(?=[A-Z][a-z])/).map((w) => w.toLowerCase()).filter((w) => w.length > 1))],
      scan,
      audit: scan.flags.length ? 'required' : 'clean-scan',
      ai_check: aiCheck({ title, created: createdFrom(row.human_made_evidence), creator: owner }, known, fetchedAt), // no date in the evidence: the check fails, never a guessed date
    };
    const errs = validateItem(item);
    if (errs.length) rejected.push(`${name}: ${errs.join('; ')}`); else items.push(item);
  }
  return { items, rejected };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : undefined; };
  const ledger = arg('ledger'), dir = arg('dir'), out = arg('out');
  if (!ledger || !dir || !out) { console.error('usage: ingest-code.mjs --ledger <jsonl> --dir <repos> --out <jsonl>'); process.exit(2); }
  const all = [];
  for (const line of readFileSync(ledger, 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    const m = row.url.match(/github\.com\/([^/]+)\/([^/#?]+)/);
    if (!m) { console.log(`skip  ${row.pack}: not a GitHub repo`); continue; }
    const repoDir = join(dir, `${m[1]}__${m[2]}`);
    if (!existsSync(repoDir)) { console.log(`skip  ${m[1]}/${m[2]}: not cloned`); continue; }
    const r = repoItems(row, repoDir, new Date(statSync(repoDir).mtimeMs).toISOString());
    if (r.skipped) { console.log(`skip  ${m[1]}/${m[2]}: ${r.skipped}`); continue; }
    for (const why of r.rejected) console.log(`  reject ${m[1]}/${m[2]}/${why}`);
    if (r.items.length !== (Number(row.item_count) || 1)) console.log(`note  ${m[1]}/${m[2]}: ${r.items.length} modules found, ledger counts ${row.item_count}`);
    all.push(...r.items);
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, all.map((i) => JSON.stringify(i)).join('\n') + '\n');
  const flagged = all.filter((i) => i.audit === 'required').length;
  console.log(`${all.length} modules (${all.length - flagged} clean scans, ${flagged} need an audit) -> ${out}`);
}
