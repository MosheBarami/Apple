// The CLI's argv mapping.
//
// This exists because `includeRegistry` was a parameter of `run()` from the day the
// registry enumerator landed, and the CLI called `run({ force, limit })` — so 1,082
// enumerated candidates were reachable only from a test file. Every unit test passed.
// The capability was real, complete, and unreachable, and the gate it blocked was
// reported as "1,020 candidates unresolved", which reads as a scale problem.
import test from 'node:test';
import assert from 'node:assert/strict';

import { readFileSync } from 'node:fs';
import { optionsFromArgv } from '../discover.mjs';

test('every documented flag reaches run()', () => {
  assert.deepEqual(optionsFromArgv([]), { force: false, limit: Infinity, includeRegistry: false });
  assert.equal(optionsFromArgv(['--force']).force, true);
  assert.equal(optionsFromArgv(['--limit=25']).limit, 25);
  assert.equal(optionsFromArgv(['--registry']).includeRegistry, true);
});

test('the flags compose', () => {
  assert.deepEqual(
    optionsFromArgv(['--registry', '--force', '--limit=10']),
    { force: true, limit: 10, includeRegistry: true },
  );
});

test('every option run() accepts is settable from the command line', () => {
  // The actual guard. If a new option is added to `run()`'s destructuring and not to
  // the parser, this fails — rather than shipping another capability no caller can
  // reach. The signature is read from source because there is no other way to ask a
  // destructured parameter list what it accepts.
  const src = readSource();
  const sig = /export async function run\(\{([^}]*)\}/.exec(src);
  assert.ok(sig, 'run() signature not found; this test is guarding nothing');
  const params = sig[1]
    .split(',')
    .map((p) => p.trim().split('=')[0].trim())
    .filter(Boolean);
  const settable = Object.keys(optionsFromArgv(['--force', '--limit=1', '--registry']));
  const unreachable = params.filter((p) => !settable.includes(p));
  assert.deepEqual(unreachable, [], `run() accepts option(s) the CLI cannot set: ${unreachable.join(', ')}`);
});

function readSource() {
  return readFileSync(new URL('../discover.mjs', import.meta.url), 'utf8');
}
