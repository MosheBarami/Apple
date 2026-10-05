/**
 * Walks the source tree for the guards in the folder above. Test support: it lives in tests/ so the
 * dead-end checker (which treats a tests/ folder as test code) does not count it as a product module.
 *
 * Walks the source tree for the guards in this folder. Nothing here is a hand-written file list: the
 * set of files a guard reads is DERIVED from the directories, so a file added tomorrow is read
 * tomorrow, and a guard that finds fewer files than it should can say so (each test asserts its own
 * floor, because a scan that read nothing reports a clean repository).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));

/** Directories never read, wherever they are: build output and dependencies. `.qa` holds screenshots. */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.astro', '.wrangler', '.git', '.qa', 'coverage', '.turbo']);

/** Not product source: harvested projects, asset stores, archived training runs, local-only data. */
export const SKIP_PATHS = ['packages/asset-library', 'packages/corpus', 'packages/training', 'packages/owner-corpus'];

const TEXT = /\.(css|astro|ts|tsx|js|mjs|cjs|json|html|svg|md|yml|yaml|jsonc|txt)$/i;

/** Every text file under `dirs` (repo-relative), as { path, rel }. */
export function walkText(dirs, { skipPaths = SKIP_PATHS } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const rel = relative(ROOT, p).split(sep).join('/');
      if (skipPaths.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (TEXT.test(e.name)) {
        out.push({ path: p, rel });
      }
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return out;
}

/** Every file under `dirs` (repo-relative) whose NAME matches `re`, text or not, as repo-relative paths. */
export function walkNames(dirs, re, { skipPaths = SKIP_PATHS } = {}) {
  const out = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      const rel = relative(ROOT, p).split(sep).join('/');
      if (skipPaths.some((s) => rel === s || rel.startsWith(s + '/'))) continue;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(p);
      } else if (re.test(e.name)) {
        out.push(rel);
      }
    }
  };
  for (const d of dirs) walk(join(ROOT, d));
  return out;
}

export const readText = (file) => readFileSync(file.path, 'utf8');
