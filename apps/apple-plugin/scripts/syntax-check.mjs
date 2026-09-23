#!/usr/bin/env node
// Parse-check every Luau file the shipped plugin bundles, and refuse a require of a module that is
// not bundled. This is `pnpm -r typecheck` for apps/apple-plugin.
//
// Until 2026-09-22 only the LEGACY plugin had a typecheck script (apps/plugin/tests/syntax-check.mjs),
// so `pnpm -r typecheck` and CI parsed the plugin nobody installs and never the one the Creator
// Store serves. The only parse gate on this one was inside scripts/build.mjs, which CI never ran.
//
// SYNTAX ONLY, for the reason the legacy script gives: luau-analyze without the Roblox definitions
// reports every `game` and `Instance` as unknown, so its exit code carries no signal. A SyntaxError
// line does. This is a parse gate, not a claim that the code type-checks or runs in Studio.
//
// Without the analyzer: on a developer machine this says SKIPPED and exits 0, matching the legacy
// script. Under CI (the CI env var GitHub Actions sets) it exits 1, because the workflow installs
// the analyzer in the same job and a missing one there means nothing was parsed.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { missingRequires, pluginSources } from './sources.mjs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function haveAnalyzer() {
  try {
    execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' });
    return true;
  } catch (err) {
    return err.code !== 'ENOENT';
  }
}

if (!haveAnalyzer()) {
  if (process.env.CI) {
    console.error('apple-plugin syntax-check: FAILED — `luau-analyze` is not on PATH under CI, so no file was parsed.');
    process.exit(1);
  }
  console.log('apple-plugin syntax-check: SKIPPED — `luau-analyze` is not on PATH. No file was parsed.');
  console.log('  Install the Luau CLI (https://github.com/luau-lang/luau/releases); CI does.');
  process.exit(0);
}

const sources = pluginSources(SRC);
const files = sources.map((entry) => entry.rel);
if (files.length === 0) {
  console.error(`apple-plugin syntax-check: no .luau files under ${SRC} — nothing was checked`);
  process.exit(1);
}

const problems = [];
for (const f of files) {
  const code = readFileSync(join(SRC, f), 'utf8').replace(/--\[(=*)\[[\s\S]*?\]\1\]/g, '').replace(/--[^\n]*/g, '');
  for (const dependency of missingRequires(SRC, f, code)) problems.push(`${f}: requires ${dependency}, which is not bundled`);
  let output = '';
  try {
    output = execFileSync('luau-analyze', [join(SRC, f)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    // Type errors alone exit non-zero too, so the exit code is not the signal.
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    // An analyzer that was killed, or that failed and said nothing, did not parse this file.
    // Reading its silence as "no SyntaxError" would report a check that never ran as a pass.
    if (err.signal || !output.trim()) {
      problems.push(`${f}: luau-analyze failed without reporting anything (${err.signal ?? `exit ${err.status}`}), so this file was not parsed`);
    }
  }
  for (const line of output.split('\n').filter((l) => l.includes('SyntaxError')).slice(0, 5)) {
    problems.push(`${f}: ${line.trim()}`);
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`  FAIL  ${p}`);
  console.error(`apple-plugin syntax-check: ${problems.length} problem(s) across ${files.length} file(s)`);
  process.exit(1);
}
console.log(`apple-plugin syntax-check: ${files.length} Luau file(s) parse and every bundled require resolves`);
