#!/usr/bin/env node
// Builds the studpilot-docs index as SQL batches in scripts/docs-index/out/.
//   node scripts/docs-index/build.mjs
// Sources (shallow, sparse): Roblox/creator-docs (content/en-us) and luau-lang/site (src/content/docs).
// DOCS_SRC_DIR=<dir> reuses existing checkouts at <dir>/creator-docs and <dir>/luau-site instead of cloning.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { buildSqlBatches, chunkApi, guideChunks, luauChunks } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'out');
const srcRoot = process.env.DOCS_SRC_DIR || join(out, 'src');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_LFS_SKIP_SMUDGE: '1' }, stdio: ['ignore', 'pipe', 'inherit'] }).trim();

function fetchSource(dir, url, sparse) {
  if (!existsSync(join(dir, '.git'))) {
    mkdirSync(dirname(dir), { recursive: true });
    const args = ['clone', '--depth', '1', ...(sparse ? ['--filter=blob:none', '--sparse'] : []), url, dir];
    git(dirname(dir), ...args);
  }
  if (sparse) git(dir, 'sparse-checkout', 'set', sparse);
  return git(dir, 'rev-parse', 'HEAD');
}

function walk(dir, ext, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, ext, acc);
    else if (ext.some((e) => name.endsWith(e))) acc.push(p);
  }
  return acc;
}

const cdDir = join(srcRoot, 'creator-docs');
const luauDir = join(srcRoot, 'luau-site');
const cdSha = fetchSource(cdDir, 'https://github.com/Roblox/creator-docs', 'content/en-us');
const luauSha = fetchSource(luauDir, 'https://github.com/luau-lang/site', null);

const chunks = [];
const counts = { guides: 0, apiPages: 0, luauPages: 0 };
const content = join(cdDir, 'content/en-us');

for (const file of walk(content, ['.md'])) {
  const rel = relative(cdDir, file).replace(/\\/g, '/');
  const inContent = rel.replace('content/en-us/', '');
  if (inContent.startsWith('includes/') || inContent.startsWith('reference/') || /^(README|STYLE)\.md$/.test(inContent)) continue;
  const cs = guideChunks(rel, readFileSync(file, 'utf8'));
  if (cs.length) counts.guides++;
  chunks.push(...cs);
}

const KINDS = ['classes', 'datatypes', 'enums', 'globals', 'libraries'];
for (const kind of KINDS) {
  const dir = join(content, 'reference/engine', kind);
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.yaml'))) {
    const obj = parseYaml(readFileSync(join(dir, file), 'utf8'));
    if (!obj?.name) continue;
    counts.apiPages++;
    chunks.push(...chunkApi(obj, kind));
  }
}

const luauDocs = join(luauDir, 'src/content/docs');
for (const file of walk(luauDocs, ['.md', '.mdx'])) {
  const rel = relative(luauDir, file).replace(/\\/g, '/');
  if (rel.endsWith('brand.mdx') || rel.endsWith('index.mdx')) continue;
  const cs = luauChunks(rel, readFileSync(file, 'utf8'));
  if (cs.length) counts.luauPages++;
  chunks.push(...cs);
}

const meta = {
  built_at: new Date().toISOString(),
  roblox_creator_docs_sha: cdSha,
  luau_site_sha: luauSha,
  chunk_count: String(chunks.length),
  license: 'Roblox Creator Docs: CC-BY-4.0 (prose), MIT (code); Luau site: MIT',
};
const batches = buildSqlBatches(chunks, meta);

for (const f of existsSync(out) ? readdirSync(out).filter((f) => f.endsWith('.sql')) : []) rmSync(join(out, f));
mkdirSync(out, { recursive: true });
batches.forEach((b, i) => writeFileSync(join(out, `batch-${String(i).padStart(3, '0')}.sql`), b));
writeFileSync(join(out, 'stats.json'), JSON.stringify({ ...counts, chunks: chunks.length, batches: batches.length, meta }, null, 2));
const bytes = batches.reduce((n, b) => n + b.length, 0);
console.log(JSON.stringify({ ...counts, chunks: chunks.length, batches: batches.length, sqlMB: +(bytes / 1e6).toFixed(1), cdSha, luauSha }));
