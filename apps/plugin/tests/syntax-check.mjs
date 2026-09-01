#!/usr/bin/env node
// Syntax-check every Luau file the plugin ships.
//
// WHY SYNTAX ONLY, STATED PLAINLY. `pnpm -r typecheck` ran in the same CI job as the
// tests and apps/plugin had no `typecheck` script, so 2,901 lines of `--!strict` Luau
// were analysed by nothing. Full type analysis would be better and is not available
// here: luau-analyze needs the Roblox API definitions loaded, and without them every
// file reports dozens of "Unknown global 'game'" and "Unknown type 'Instance'" errors
// — 363 across the plugin, none of them real. A check that cries wolf 363 times is a
// check nobody runs.
//
// So this asserts the one thing luau-analyze answers unambiguously with no definitions
// at all: does the file PARSE. That is not nothing. It catches the class of mistake
// that is invisible until the module is loaded in Studio — and it would have caught a
// real one in this repo, where a `--[[ ]]` comment containing a nested long-bracket
// literal closed itself early and silently truncated a function.
//
// If the definitions are ever wired up (luau-lsp with globalTypes.d.luau), widen this
// to a real typecheck and delete the paragraph above.
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

function haveAnalyzer() {
  try {
    execFileSync('luau-analyze', ['--help'], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

if (!haveAnalyzer()) {
  console.log('plugin syntax-check: SKIPPED — `luau-analyze` is not on PATH.');
  console.log('  Install the Luau CLI (https://github.com/luau-lang/luau/releases); CI does.');
  process.exit(0);
}

const files = readdirSync(SRC).filter((f) => f.endsWith('.luau')).sort();
let bad = 0;

for (const f of files) {
  let output = '';
  try {
    output = execFileSync('luau-analyze', [join(SRC, f)], { encoding: 'utf8', stdio: 'pipe' });
  } catch (err) {
    // Type errors alone exit non-zero too, so the exit code is not the signal.
    output = `${err.stdout ?? ''}${err.stderr ?? ''}`;
  }
  const syntax = output.split('\n').filter((l) => l.includes('SyntaxError'));
  if (syntax.length > 0) {
    bad += 1;
    console.error(`  FAIL  ${f}`);
    for (const line of syntax.slice(0, 5)) console.error(`        ${line.trim()}`);
  }
}

if (bad > 0) {
  console.error(`plugin syntax-check: ${bad} of ${files.length} file(s) do not parse`);
  process.exit(1);
}
console.log(`plugin syntax-check: ${files.length} Luau file(s) parse`);
