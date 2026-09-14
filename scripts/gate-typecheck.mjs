#!/usr/bin/env node
// A single success-only token for "every package typechecks".
import { execFileSync } from 'node:child_process';

let out = '';
let failed = false;
try {
  out = execFileSync('pnpm', ['-r', 'typecheck'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
} catch (e) {
  out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  failed = true;
}
const errors = [...out.matchAll(/error TS\d+/g)].length;
console.log(`  TS errors: ${errors}`);
if (failed || errors > 0) {
  for (const line of out.split('\n').filter((l) => /error TS/.test(l)).slice(0, 10)) console.log('   ', line.trim());
  console.log('TYPECHECK DIRTY');
  process.exit(1);
}
console.log('TYPECHECK CLEAN');
