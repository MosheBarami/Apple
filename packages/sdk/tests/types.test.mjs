// The TypeScript surface, held to the JavaScript implementation.
//
// TWO CLAIMS, AND THEY FAIL FOR DIFFERENT REASONS.
//
//   1. Every value the runtime exports is declared, and nothing is declared that the
//      runtime does not export. This needs no compiler and therefore ALWAYS runs. It is
//      the check that catches the ordinary drift: a function added to src/index.mjs and
//      forgotten in types/index.d.ts, or a name deleted from one and left in the other.
//
//   2. The declarations actually REJECT wrong code. A declaration file full of `any`
//      would satisfy claim 1 completely and type nothing at all, so the compiler is
//      pointed at a fixture whose every marked line is supposed to be an error — and the
//      test fails if any of them compiles. `ok.ts` must compile clean in the same run,
//      because a declaration file that rejects everything is equally useless.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as sdk from '../src/index.mjs';

const PKG = join(dirname(fileURLToPath(import.meta.url)), '..');
const DTS = join(PKG, 'types/index.d.ts');

/** Names the declaration file exports as VALUES (types have no runtime counterpart). */
function declaredValues(source) {
  const names = new Set();
  for (const m of source.matchAll(/^export (?:declare )?(?:async )?(function|class|const|let|var) ([A-Za-z0-9_$]+)/gm)) {
    names.add(m[2]);
  }
  return names;
}

test('every runtime export is declared, and every declared value exists at runtime', () => {
  const declared = declaredValues(readFileSync(DTS, 'utf8'));
  const runtime = new Set(Object.keys(sdk));
  assert.ok(runtime.size > 20, `only ${runtime.size} runtime exports — the module did not load`);

  const undeclared = [...runtime].filter((n) => !declared.has(n)).sort();
  const phantom = [...declared].filter((n) => !runtime.has(n)).sort();
  assert.deepEqual(undeclared, [], `exported by src/index.mjs but missing from types/index.d.ts: ${undeclared}`);
  assert.deepEqual(phantom, [], `declared in types/index.d.ts but not exported at runtime: ${phantom}`);
});

/** tsc, from whichever workspace package installed it. Null when none did. */
function findTsc() {
  for (const candidate of [
    join(PKG, 'node_modules/.bin/tsc'),
    join(PKG, '../../apps/worker/node_modules/.bin/tsc'),
    join(PKG, '../../apps/web/node_modules/.bin/tsc'),
    join(PKG, '../../node_modules/.bin/tsc'),
  ]) {
    if (existsSync(candidate)) return candidate;
  }
  try {
    execFileSync('tsc', ['--version'], { stdio: 'pipe' });
    return 'tsc';
  } catch {
    return null;
  }
}

test('the declarations reject wrong code and accept right code', (t) => {
  const tsc = findTsc();
  if (!tsc) {
    t.skip('no tsc on this machine — the TypeScript surface was NOT compiled here');
    return;
  }
  const fixtures = join(PKG, 'types/fixtures');
  const res = spawnSync(tsc, ['-p', join(fixtures, 'tsconfig.json')], { encoding: 'utf8', cwd: fixtures });
  const output = `${res.stdout}\n${res.stderr}`;

  // ok.ts is the half that proves the declarations are usable at all.
  const okErrors = output.split('\n').filter((l) => l.startsWith('ok.ts('));
  assert.deepEqual(okErrors, [], `the correct consumer failed to compile:\n${okErrors.join('\n')}`);

  // bad.ts is the half that proves they are not `any`. Each `// ERROR:` comment claims
  // that the NEXT line does not compile — anchored line by line, so an error reported
  // somewhere else in the file cannot satisfy a claim made here.
  const badSource = readFileSync(join(fixtures, 'bad.ts'), 'utf8').split('\n');
  const expected = [];
  badSource.forEach((line, i) => {
    if (line.trim().startsWith('// ERROR:')) expected.push(i + 2); // 1-based, next line
  });
  assert.ok(expected.length >= 5, `bad.ts declares only ${expected.length} expected errors`);

  const reported = new Set(
    output
      .split('\n')
      .filter((l) => l.startsWith('bad.ts('))
      .map((l) => Number(/^bad\.ts\((\d+),/.exec(l)[1])),
  );
  const compiled = expected.filter((line) => !reported.has(line));
  assert.deepEqual(
    compiled,
    [],
    `these lines of bad.ts compiled but must not have: ${compiled.join(', ')}\n${output}`,
  );
});
