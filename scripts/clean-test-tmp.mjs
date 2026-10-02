#!/usr/bin/env node
/**
 * Removes the temporary folders the test suites leave in the system temp directory (2026-10-02: 33,903 of them,
 * about 140 GB, filled the disk and stopped every shell). Only folders whose name is a prefix this repository's tests
 * pass to mkdtemp plus mkdtemp's 6-character suffix, older than --older-than minutes (default 10, so a run in progress
 * keeps its own). Prints what it freed. Usage: node scripts/clean-test-tmp.mjs [--older-than 10] [--dry-run]
 */
import { readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const olderIdx = args.indexOf('--older-than');
const olderMin = olderIdx >= 0 ? Number(args[olderIdx + 1]) : 10;

/** Every prefix the repository's code passes to mkdtemp under tmpdir(). */
export function testPrefixes(root = ROOT) {
  const out = new Set();
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(m?js|ts)$/.test(e.name)) {
        const s = readFileSync(p, 'utf8');
        // The first string on the mkdtemp line: join(tmpdir(), 'x-'), path.join(os.tmpdir(), "x-"), `${tmpdir()}/x-`.
        for (const m of s.matchAll(/mkdtemp(?:Sync)?\([^\n]*?['"`/]([A-Za-z][A-Za-z0-9_.-]*?)-?['"`]/g)) out.add(m[1]);
        // A name made at run time: its fixed head (`ba-${tag}-` -> "ba-").
        for (const m of s.matchAll(/mkdtemp(?:Sync)?\([^\n]*?`([A-Za-z][A-Za-z0-9_.-]*-)\$\{/g)) out.add(m[1]);
      }
    }
  };
  for (const d of ['apps', 'packages', 'scripts', 'platforms']) { try { walk(join(root, d)); } catch { /* absent */ } }
  return out;
}

/**
 * A folder holding only what a test writes and at least one bundle or Luau spec, at most two levels deep. Never an
 * empty folder (2026-10-02: an empty system folder, mediaanalysisd-access, matched the first version of this rule).
 */
function onlyTestFiles(p) {
  let code = 0;
  const ok = (d, depth) => {
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); } catch { return false; }
    return entries.every((e) => {
      if (e.isDirectory()) return depth < 1 && ok(join(d, e.name), depth + 1);
      if (/\.(m?js|cjs|luau)$/.test(e.name)) { code++; return true; }
      return /\.(map|json|txt|rbxmx?|sql)$/.test(e.name);
    });
  };
  return ok(p, 0) && code > 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prefixes = testPrefixes();
  if (prefixes.size < 50) { console.error(`only ${prefixes.size} prefixes found; refusing to clean`); process.exit(1); }
  // launchd may start this without TMPDIR; the per-user temp folder is what the tests wrote to.
  let dir = process.env.TMPDIR ? tmpdir() : '';
  if (!dir) { try { dir = execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim(); } catch { dir = tmpdir(); } }
  const cutoff = Date.now() - olderMin * 60_000;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    const m = /^(.+)-[A-Za-z0-9]{6}$/.exec(name);
    if (!m) continue;
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (!st.isDirectory() || st.mtimeMs > cutoff) continue;
    // A test's own prefix, a head a test builds names from, or (for a name made wholly at run time) a folder that holds
    // nothing but the bundles and scripts a test writes.
    const ours = prefixes.has(m[1]) || [...prefixes].some((h) => h.endsWith('-') && m[1].startsWith(h)) || onlyTestFiles(p);
    if (!ours) continue;
    if (/^com\.|apple|mediaanalysis/i.test(name)) continue; // the system's and other apps' own folders, whatever they hold
    if (!dry) { try { rmSync(p, { recursive: true, force: true }); } catch { continue; } }
    removed++;
  }
  console.log(`${dry ? 'would remove' : 'removed'} ${removed} test temp folders from ${dir}`);
}
