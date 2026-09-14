#!/usr/bin/env node
// One decisive token for "the whole suite passed".
//
// `pnpm -r test` prints per-package counts and exits non-zero on failure, but a gate needs a single
// success-only string that cannot appear in a partial run. Grepping for "fail 0" is not that: a run
// where five packages pass and one fails still contains "fail 0" five times.
import { execFileSync } from 'node:child_process';

let out = '';
try {
  out = execFileSync('pnpm', ['-r', 'test'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  console.log(summarise(out));
  console.log('SUITE RED');
  process.exit(1);
}
const s = summarise(out);
console.log(s);
// Belt and braces: a zero exit AND no failure line anywhere.
const failures = [...out.matchAll(/fail (\d+)/g)].map((m) => Number(m[1])).filter((n) => n > 0);
if (failures.length || /SELFTEST FAIL/.test(out)) {
  console.log('SUITE RED');
  process.exit(1);
}
console.log('SUITE GREEN');

function summarise(text) {
  const pass = [...text.matchAll(/pass (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  const fail = [...text.matchAll(/fail (\d+)/g)].reduce((a, m) => a + Number(m[1]), 0);
  return `  tests passed: ${pass}   failed: ${fail}`;
}
